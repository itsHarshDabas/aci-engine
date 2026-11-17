// ACI "Generate with Claude": one route the editor calls for sprites, animation frames, cutscene shots, or any JSON.
//   POST /api/ai/generate { kind:'sprite'|'frames'|'json', prompt, w?, h?, frames?, hint?, name? } -> { ok, json, via }
//   GET  /api/ai/status   -> { direct, agentQueue, pending }
// Two ways to answer:
//   1. direct: ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) is set, so the server calls the Claude API itself.
//      Raw fetch on purpose: the engine has zero npm dependencies.
//   2. agent queue: no key, so the request waits for a connected agent (Claude Code with `aci mcp`), which reads
//      GET /api/ai/requests and answers POST /api/ai/requests/:id { json }. The editor shows "waiting for an agent".
const MODEL = process.env.ACI_AI_MODEL || 'claude-opus-5-5';
const API = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages';

const FORMAT = `ACI sprites are text art. Answer with ONE JSON object and nothing else (no markdown fences).
Sprite format: {"name":"...","w":W,"h":H,"fps":6,"palette":{"a":"#rrggbb",...},"anims":{"idle":[FRAME,...],"walk":[...]}}
FRAME = {"text":[H strings, each exactly W characters], "colors":[H strings, each W palette keys or "." for default/transparent]}
Spaces in "text" are transparent. Use box-drawing, block (█▓▒░▀▄), and symbol characters for detail. Keep every row exactly W wide.`;

function buildPrompt(b) {
  const w = Math.max(1, Math.min(240, b.w | 0 || 0)), h = Math.max(1, Math.min(120, b.h | 0 || 0));
  const size = w && h ? `Size: exactly ${w} columns × ${h} rows.` : 'Pick a sensible size (small characters ~5×4, big scenes up to 80×30).';
  if (b.kind === 'sprite') return `${FORMAT}\n\nMake a sprite: ${b.prompt}\n${size}\nInclude an "idle" animation (1-4 frames)${b.frames ? ` and other animations as asked, about ${b.frames} frames each` : ' and, if it is a character, a "walk" animation (2-4 frames)'}.`;
  if (b.kind === 'frames') return `${FORMAT}\n\nMake ${b.frames || 6} animation frames as {"palette":{...},"frames":[FRAME,...]}: ${b.prompt}\n${size}\nFrames should flow smoothly into each other${b.hint ? '\n\nContext: ' + b.hint : ''}.`;
  return `Answer with ONE JSON object and nothing else (no markdown fences).\n${b.hint ? 'Format and context:\n' + b.hint + '\n\n' : ''}${FORMAT}\n\nRequest: ${b.prompt}`;
}
function parseJson(text) {
  const s = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(s); } catch (e) {}
  const a = s.indexOf('{'), z = s.lastIndexOf('}');
  if (a >= 0 && z > a) return JSON.parse(s.slice(a, z + 1));
  throw new Error('the answer was not valid JSON');
}

async function callClaude(prompt) {
  const key = process.env.ANTHROPIC_API_KEY, token = process.env.ANTHROPIC_AUTH_TOKEN;
  const headers = { 'content-type': 'application/json', 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' };
  if (key) headers['x-api-key'] = key; else { headers.authorization = 'Bearer ' + token; headers['anthropic-beta'] += ',oauth-2025-04-20'; }
  const r = await fetch(API, { method: 'POST', headers, body: JSON.stringify({
    model: MODEL, max_tokens: 16000, fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: 'You are the art generator inside the ACI game engine, where everything is drawn with text characters. You return precise, well-aligned, colourful ASCII/Unicode art as JSON.',
    messages: [{ role: 'user', content: prompt }],
  }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || 'Claude API error ' + r.status);
  if (j.stop_reason === 'refusal') throw new Error('Claude declined this request' + (j.stop_details && j.stop_details.explanation ? ': ' + j.stop_details.explanation : ''));
  if (j.stop_reason === 'max_tokens') throw new Error('the answer was too long; ask for something smaller');
  return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

export function register(api) {
  const direct = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const queue = new Map(); let nextId = 1;   // id -> { id, kind, prompt, request, created, resolve, reject, taken }

  api.route('GET', '/api/ai/status', (req, res) => api.send(res, 200, { direct: direct(), model: direct() ? MODEL : null, pending: [...queue.values()].filter(q => !q.done).length }));

  api.route('POST', '/api/ai/generate', async (req, res) => {
    let b; try { b = JSON.parse(await api.readBody(req) || '{}'); } catch (e) { return api.send(res, 400, { ok: false, error: 'bad JSON' }); }
    if (!b.prompt || !String(b.prompt).trim()) return api.send(res, 400, { ok: false, error: 'describe what to make' });
    const prompt = buildPrompt(b);
    try {
      if (direct()) {
        api.log('ai: generating ' + (b.kind || 'json') + ' with ' + MODEL);
        let text = await callClaude(prompt), json;
        try { json = parseJson(text); } catch (e) { text = await callClaude(prompt + '\n\nYour previous answer was not valid JSON. Return only the JSON object.'); json = parseJson(text); }
        return api.send(res, 200, { ok: true, json, via: MODEL });
      }
      // no key: hand it to a connected agent and wait (up to 10 minutes)
      const id = nextId++;
      const item = { id, kind: b.kind || 'json', prompt: b.prompt, instructions: prompt, created: Date.now(), done: false };
      const result = new Promise((resolve, reject) => { item.resolve = resolve; item.reject = reject; });
      queue.set(id, item);
      api.broadcast && api.broadcast({ type: 'ai-request', id, kind: item.kind, prompt: item.prompt });
      api.log(`ai: request #${id} waiting for an agent (${item.kind}): ${String(b.prompt).slice(0, 80)}`);
      const timer = setTimeout(() => item.reject(new Error('no agent answered in 10 minutes. Connect Claude Code with: claude mcp add aci -- npx aci mcp, or set ANTHROPIC_API_KEY before starting aci')), 600000);
      req.on('close', () => { if (!item.done) { item.done = true; clearTimeout(timer); queue.delete(id); } });
      try { const json = await result; clearTimeout(timer); api.send(res, 200, { ok: true, json, via: 'agent' }); }
      catch (e) { clearTimeout(timer); api.send(res, 200, { ok: false, error: e.message }); }
      finally { item.done = true; queue.delete(id); }
    } catch (e) { api.send(res, 200, { ok: false, error: e.message }); }
  });

  // agents: see waiting requests and answer them
  api.route('GET', '/api/ai/requests', (req, res) => api.send(res, 200, [...queue.values()].filter(q => !q.done).map(q => ({ id: q.id, kind: q.kind, prompt: q.prompt, instructions: q.instructions, waitingSeconds: Math.round((Date.now() - q.created) / 1000) }))));
  api.route('POST', '/api/ai/requests/:id', async (req, res, params) => {
    const item = queue.get(+params.id); if (!item || item.done) return api.send(res, 404, { ok: false, error: 'no such request (it may have been answered or cancelled)' });
    let b; try { b = JSON.parse(await api.readBody(req) || '{}'); } catch (e) { return api.send(res, 400, { ok: false, error: 'bad JSON' }); }
    let json = b.json; try { if (typeof json === 'string') json = parseJson(json); } catch (e) { return api.send(res, 400, { ok: false, error: e.message }); }
    if (!json || typeof json !== 'object') return api.send(res, 400, { ok: false, error: 'send { json: {...} }' });
    item.resolve(json); api.send(res, 200, { ok: true });
  });
}
