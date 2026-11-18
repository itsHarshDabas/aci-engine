#!/usr/bin/env node
/*
 * ACI MCP server — lets Claude (Claude Code, Claude Desktop, any MCP client) build inside a running ACI game.
 * Zero dependencies. Talks to the bridge (bridge/server.mjs) over HTTP.
 *
 *   claude mcp add aci -- node /path/to/aci-engine/bridge/mcp.mjs --agent=builder
 *
 * Env: ACI_URL (default http://localhost:7777), ACI_AGENT (default "claude").
 * Run several agents by adding the server more than once with different --agent names.
 */
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=');
const BASE = (arg('url') || process.env.ACI_URL || 'http://localhost:7777').replace(/\/$/, '');
const AGENT = arg('agent') || process.env.ACI_AGENT || 'claude';

async function api(path, body) {
  const r = await fetch(BASE + path, body === undefined ? { headers: { 'x-aci-agent': AGENT } } : { method: 'POST', headers: { 'content-type': 'application/json', 'x-aci-agent': AGENT }, body: JSON.stringify(body) });
  const text = await r.text();
  try { return JSON.parse(text); } catch (e) { return { ok: false, error: text }; }
}
const cmd = c => api('/api/command', { agent: AGENT, ...c });

const ART_HINT = 'ASCII art as a string with \\n between rows. Spaces are transparent. Keep sprites small (3-12 wide, 2-8 tall).';
const tools = [
  { name: 'aci_look', description: 'See the game: returns the current screen as text, the camera position, and the entities in view. Optionally centre the camera on world cell x,y first.', inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } }, run: a => api('/api/look' + (a.x != null ? `?x=${a.x}&y=${a.y ?? 0}` : '')) },
  { name: 'aci_state', description: 'Everything about the world: size, camera, masks (water, rock…), registered assets, and every entity with id, name, position, size and owner agent.', inputSchema: { type: 'object', properties: {} }, run: () => api('/api/state') },
  { name: 'aci_help', description: 'List every command the running game supports (core plus installed modules such as physics, tilemaps, effects) with their arguments.', inputSchema: { type: 'object', properties: {} }, run: () => api('/api/help') },
  {
    name: 'aci_spawn', description: 'Create a character, object or sign in the world. ' + ART_HINT,
    inputSchema: { type: 'object', required: ['name'], properties: {
      name: { type: 'string', description: 'unique name to refer to it later' },
      art: { type: 'string', description: ART_HINT }, frames: { type: 'array', items: { type: 'string' }, description: 'animation frames instead of art' },
      asset: { type: 'string', description: 'name of a saved asset instead of art' },
      color: { type: 'string', description: 'CSS hex colour, e.g. #e8c870' },
      colors: { type: 'string', description: 'optional colour map: same shape as art, each char a palette key' }, palette: { type: 'object', description: '{key: "#hex"} for colors' },
      x: { type: 'number' }, y: { type: 'number' }, label: { type: 'string' }, wander: { type: 'number', description: 'walk around randomly at this speed' }, reflect: { type: 'boolean' },
    } }, run: a => cmd({ op: 'spawn', ...a }),
  },
  { name: 'aci_move', description: 'Move an entity: "to" [x,y] walks there, "by" [dx,dy] nudges, x/y teleports.', inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, to: { type: 'array', items: { type: 'number' } }, by: { type: 'array', items: { type: 'number' } }, x: { type: 'number' }, y: { type: 'number' } } }, run: a => cmd({ op: 'move', ...a }) },
  { name: 'aci_say', description: 'Show a speech bubble over an entity.', inputSchema: { type: 'object', required: ['name', 'text'], properties: { name: { type: 'string' }, text: { type: 'string' }, secs: { type: 'number' } } }, run: a => cmd({ op: 'say', ...a }) },
  { name: 'aci_remove', description: 'Remove an entity by name, or everything this agent made with mine=true.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, mine: { type: 'boolean' } } }, run: a => cmd(a.mine ? { op: 'remove', owner: AGENT } : { op: 'remove', name: a.name }) },
  {
    name: 'aci_save_asset', description: 'Save a reusable asset to the shared library so any agent or game can spawn it by name. Give art (one frame) or anims ({idle:["..",".."], walk:[...]}).',
    inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, art: { type: 'string' }, anims: { type: 'object' }, color: { type: 'string' }, palette: { type: 'object' }, colors: { type: 'object', description: 'per-anim colour maps, {anim: ["map frame 1", ...]}' }, fps: { type: 'number' } } },
    run: a => {
      const anims = a.anims || { default: [a.art || ''] };
      const out = { fps: a.fps || 6, color: a.color, palette: a.palette, anims: {} };
      for (const k in anims) out.anims[k] = [].concat(anims[k]).map((t, i) => ({ text: String(t).split('\n'), ...(a.colors && a.colors[k] ? { colors: String([].concat(a.colors[k])[Math.min(i, [].concat(a.colors[k]).length - 1)]).split('\n') } : {}) }));
      return cmd({ op: 'save_asset', name: a.name, asset: out });
    },
  },
  { name: 'aci_list_assets', description: 'List the shared asset library (name, author agent, animations).', inputSchema: { type: 'object', properties: {} }, run: () => api('/api/assets') },
  { name: 'aci_command', description: 'Send any raw game command (see aci_help), or an array of them for batches. Use for module commands such as physics, tilemaps or effects.', inputSchema: { type: 'object', required: ['command'], properties: { command: { description: 'a command object {op, ...} or an array of them' } } }, run: a => cmd0(a.command) },
  {
    name: 'aci_cutscene', description: 'Author and play high-res cutscenes (short movies made of shots, with captions and sound). Sends {op:"cutscene", ...fields}. Field shapes: {create:"intro"}, {cutscene:"intro", addShot:{...}}, {cutscene:"intro", setShot:{...}, index:0}, {frames:[...]} (ASCII text frames become an asset), {importFootage:...} (video/GIF/URL converted by rotoscope), {get:"intro"}, {play:"intro"}, {skip:true}, {list:true}. Call with {help:true} first to read the exact fields from the running game. Cutscenes you author are saved into the open project (cutscenes/*.cutscene.json, assets/*.aci.json).',
    inputSchema: { type: 'object', properties: { fields: { type: 'object', description: 'the cutscene command fields (without op)' }, help: { type: 'boolean' } } },
    run: async a => { if (a.help) { const h = await api('/api/help'); const s = JSON.stringify(h); const i = s.indexOf('cutscene'); return i < 0 ? h : { cutscene: (h.commands && h.commands.cutscene) || (h.docs && h.docs.cutscene) || s.slice(Math.max(0, i - 20), i + 4000) }; } return cmd({ op: 'cutscene', ...(a.fields || {}) }); },
  },
  { name: 'aci_ai_requests', description: 'Art the human asked for with "Generate with Claude" in the ACI editor (sprites, animation frames, cutscene shots) when no API key is set. Each request has id, kind, prompt and full instructions with the exact JSON format. Make the art, then answer with aci_ai_answer.', inputSchema: { type: 'object', properties: {} }, run: () => api('/api/ai/requests') },
  { name: 'aci_ai_answer', description: 'Answer a "Generate with Claude" request from aci_ai_requests. json must follow the format in that request\'s instructions; the editor shows it to the human right away.', inputSchema: { type: 'object', required: ['id', 'json'], properties: { id: { type: 'number' }, json: { type: 'object', description: 'the generated JSON object' } } }, run: a => api('/api/ai/requests/' + a.id, { json: a.json }) },
  { name: 'aci_events', description: 'What the player did since event number "since" (clicks with world x,y, plus custom game events). Use the highest n you saw last time.', inputSchema: { type: 'object', properties: { since: { type: 'number' } } }, run: a => api('/api/events?since=' + (a.since || 0)) },
  { name: 'aci_log', description: 'What every agent has done since log number "since", so agents can coordinate and avoid overwriting each other.', inputSchema: { type: 'object', properties: { since: { type: 'number' } } }, run: a => api('/api/log?since=' + (a.since || 0)) },
];
const cmd0 = c => api('/api/command', Array.isArray(c) ? c.map(x => ({ agent: AGENT, ...x })) : { agent: AGENT, ...c });

// ---------------------------------------------------------------- JSON-RPC over stdio
const out = m => process.stdout.write(JSON.stringify(m) + '\n');
async function handle(m) {
  const { id, method, params } = m;
  if (method === 'initialize') return out({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'aci-engine', version: '0.2.0' }, instructions: `You are agent "${AGENT}" in an ACI ASCII game. Start with aci_look to see the screen, aci_help for commands. Coordinates are world cells (x right, y down). Check aci_log to see what other agents did.` } });
  if (method === 'ping') return out({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return out({ jsonrpc: '2.0', id, result: { tools: tools.map(({ run, ...t }) => t) } });
  if (method === 'tools/call') {
    const t = tools.find(x => x.name === params.name);
    if (!t) return out({ jsonrpc: '2.0', id, error: { code: -32602, message: 'unknown tool ' + params.name } });
    try {
      const r = await t.run(params.arguments || {});
      const text = r && typeof r.screen === 'string' ? r.screen + '\n\n' + JSON.stringify({ ...r, screen: undefined }, null, 1) : JSON.stringify(r, null, 1);
      return out({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: r && r.ok === false } });
    } catch (e) {
      return out({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Could not reach the ACI bridge at ${BASE} (${e.message}). Start it with: node bridge/server.mjs` }], isError: true } });
    }
  }
  if (id !== undefined && id !== null) out({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } });
}
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; try { handle(JSON.parse(line)); } catch (e) { out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); } }
});
