/*
 * ACI server — zero dependencies, Node 18+.
 * Serves the editor, the engine and projects, and runs the agent bridge.
 *
 *   import { start } from './server/index.mjs';
 *   const { url } = await start({ port: 7777, workspace: '~/ACI Projects' });
 *
 * Plugins: every server/*.mjs (except this file) exporting register(api) is loaded.
 *   api = { route(method, pattern, handler), root, workspace, readBody(req), send(res, code, body, type), log(msg), broadcast(msg) }
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

export function expandHome(p) { return p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p; }
export function defaultWorkspace() { return path.resolve(expandHome(process.env.ACI_WORKSPACE || path.join(os.homedir(), 'ACI Projects'))); }

export async function start(opts = {}) {
  const PORT = opts.port ?? +(process.env.ACI_PORT || 7777);
  const HOST = opts.host || process.env.ACI_HOST || '127.0.0.1';
  const WORKSPACE = path.resolve(expandHome(opts.workspace || defaultWorkspace()));
  const quiet = !!opts.quiet;
  fs.mkdirSync(WORKSPACE, { recursive: true });
  const LIBRARY = path.join(WORKSPACE, '.library'); // shared agent asset library (was ./assets)
  fs.mkdirSync(LIBRARY, { recursive: true });
  const log = (...a) => { if (!quiet) console.log('[aci]', ...a); };

  // ---------------------------------------------------------------- router
  const routes = [];
  function route(method, pattern, handler) {
    const keys = [];
    const rx = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\*]/g, '\\$&').replace(/\/\\\*$|\\\*$/, m => (keys.push('*'), m.startsWith('/') ? '(?:/(.*))?' : '(.*)')).replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
    // keep the declared order of keys: named params appear before '*' in practice
    const ordered = []; pattern.replace(/:(\w+)|\*/g, (m, k) => ordered.push(k || '*'));
    routes.push({ method: method.toUpperCase(), rx, keys: ordered, handler });
  }
  const readBody = req => new Promise((res, rej) => { const chunks = []; let n = 0; req.on('data', c => { n += c.length; if (n > 50e6) { req.destroy(); rej(new Error('body too large')); } else chunks.push(c); }); req.on('end', () => res(Buffer.concat(chunks).toString('utf8'))); req.on('error', rej); });
  function send(res, code, body, type = 'application/json; charset=utf-8') {
    if (res.headersSent) return;
    res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-aci-agent', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Cache-Control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 1));
  }
  const sockets = new Set(); // editor/game websocket connections
  const broadcast = msg => sockets.forEach(c => c.send(msg));
  const api = { route, root: ROOT, workspace: WORKSPACE, library: LIBRARY, readBody, send, log, broadcast, version: VERSION };

  // ---------------------------------------------------------------- agent bridge state
  const games = new Map(); let gameSeq = 0, cmdSeq = 0;
  const agentLog = [], events = []; let logN = 0, eventN = 0;
  const push = (arr, item, max = 500) => { arr.push(item); if (arr.length > max) arr.shift(); };
  function pickGame(id) { if (id && games.has(+id)) return games.get(+id); let last = null; for (const g of games.values()) if (!g.editor) last = g; if (!last) for (const g of games.values()) last = g; return last; }
  function runOnGame(cmd, gameId, timeout = 5000) {
    const g = pickGame(gameId);
    if (!g) return Promise.resolve({ ok: false, error: 'no game is connected. Open a project in the editor (or press Play) first.' });
    const id = ++cmdSeq;
    return new Promise(resolve => {
      const timer = setTimeout(() => { g.pending.delete(id); resolve({ ok: false, error: 'the game did not answer within ' + timeout + ' ms' }); }, timeout);
      g.pending.set(id, r => { clearTimeout(timer); resolve(r); });
      g.send({ type: 'command', id, cmd });
    });
  }
  const assetPath = name => { const safe = String(name).replace(/\.aci\.json$/, ''); if (!/^[\w.-]{1,80}$/.test(safe)) throw new Error('asset names may use letters, digits, - _ . (max 80)'); return path.join(LIBRARY, safe + '.aci.json'); };
  const readAsset = name => JSON.parse(fs.readFileSync(assetPath(name), 'utf8'));
  const listAssets = () => fs.readdirSync(LIBRARY).filter(f => f.endsWith('.aci.json')).map(f => { try { const a = JSON.parse(fs.readFileSync(path.join(LIBRARY, f), 'utf8')); return { name: f.replace(/\.aci\.json$/, ''), author: a.author || null, anims: Object.keys(a.anims || {}) }; } catch (e) { return { name: f, error: 'unreadable' }; } });
  const summarize = o => { const s = JSON.stringify(o); return s && s.length > 400 ? JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'string' && v.length > 120 ? v.slice(0, 120) + '…' : k === 'asset' && typeof v === 'object' ? '[asset]' : v))) : o; };
  async function command(body, agentHeader, gameId) {
    const list = Array.isArray(body) ? body : [body]; const results = [];
    for (let cmd of list) {
      if (!cmd || typeof cmd !== 'object' || !cmd.op) { results.push({ ok: false, error: 'each command needs an "op" — GET /api/help lists them' }); continue; }
      if (!cmd.agent && agentHeader) cmd = { ...cmd, agent: agentHeader };
      let result;
      if (cmd.op === 'save_asset') { try { fs.writeFileSync(assetPath(cmd.name), JSON.stringify({ aci: 1, ...cmd.asset, name: cmd.name, author: cmd.agent || null }, null, 1)); result = { ok: true, saved: cmd.name }; } catch (e) { result = { ok: false, error: e.message }; } }
      else if (cmd.op === 'list_assets') result = { ok: true, assets: listAssets() };
      else {
        if (typeof cmd.asset === 'string' && cmd.op !== 'asset') { try { cmd = { ...cmd, asset: readAsset(cmd.asset) }; } catch (e) {} }
        result = await runOnGame(cmd, gameId);
      }
      const entry = { n: ++logN, t: Date.now(), agent: cmd.agent || 'anon', cmd: summarize(cmd), result: summarize(result) };
      push(agentLog, entry); broadcast({ type: 'agent-log', entry });
      results.push(result);
    }
    return Array.isArray(body) ? results : results[0];
  }
  api.command = command;

  // ---------------------------------------------------------------- core routes
  // project thumbnails for the launcher (the editor writes <project>/.aci/thumbnail.txt as a data URL)
  route('GET', '/api/thumbs', (req, res) => {
    const out = {};
    try { for (const d of fs.readdirSync(WORKSPACE, { withFileTypes: true })) { if (!d.isDirectory() || d.name.startsWith('.')) continue; const f = path.join(WORKSPACE, d.name, '.aci', 'thumbnail.txt'); try { const t = fs.readFileSync(f, 'utf8'); if (t.startsWith('data:image/')) out[d.name] = t; } catch (e) {} } } catch (e) {}
    send(res, 200, out);
  });
  route('GET', '/api/info', (req, res) => send(res, 200, { name: 'aci-engine', version: VERSION, workspace: WORKSPACE, platform: process.platform, node: process.version }));
  route('GET', '/api/editor/plugins', (req, res) => {
    const dir = path.join(ROOT, 'editor', 'panels');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort() : [];
    send(res, 200, files.map(f => '/editor/panels/' + f));
  });
  route('GET', '/api/editor/modules', (req, res) => {
    // engine modules the editor/player should load, in a safe order
    const order = ['physics', 'tilemap', 'scenes', 'input', 'sound', 'save', 'anim', 'convert', 'cutscene', 'hud', 'project', 'environments', 'behaviours'];
    const dir = path.join(ROOT, 'modules');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'plugin-shim.js') : [];
    files.sort((a, b) => { const ia = order.indexOf(a.replace(/\.js$/, '')), ib = order.indexOf(b.replace(/\.js$/, '')); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
    send(res, 200, files.map(f => '/modules/' + f));
  });
  route('POST', '/api/command', async (req, res, p, url) => {
    let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { ok: false, error: 'body must be JSON: ' + e.message }); }
    send(res, 200, await command(body, req.headers['x-aci-agent'] || url.searchParams.get('agent'), url.searchParams.get('game')));
  });
  route('GET', '/api/look', async (req, res, p, url) => send(res, 200, await command({ op: 'look', agent: req.headers['x-aci-agent'] || 'viewer', ...(url.searchParams.has('x') ? { x: +url.searchParams.get('x'), y: +url.searchParams.get('y') } : {}) }, null, url.searchParams.get('game'))));
  route('GET', '/api/state', async (req, res, p, url) => send(res, 200, await runOnGame({ op: 'describe' }, url.searchParams.get('game'))));
  route('GET', '/api/help', async (req, res, p, url) => send(res, 200, await runOnGame({ op: 'help' }, url.searchParams.get('game'))));
  route('GET', '/api/games', (req, res) => send(res, 200, [...games.values()].map(g => ({ id: g.id, name: g.name, world: g.world, editor: !!g.editor }))));
  route('GET', '/api/log', (req, res, p, url) => { const since = +(url.searchParams.get('since') || 0); send(res, 200, agentLog.filter(l => l.n > since)); });
  route('GET', '/api/events', (req, res, p, url) => { const since = +(url.searchParams.get('since') || 0); send(res, 200, events.filter(e => e.n > since)); });
  route('GET', '/api/assets', (req, res) => send(res, 200, listAssets()));
  route('GET', '/api/assets/:name', (req, res, p) => { try { send(res, 200, readAsset(p.name)); } catch (e) { send(res, e.code === 'ENOENT' ? 404 : 400, { ok: false, error: e.code === 'ENOENT' ? 'no asset named ' + p.name : e.message }); } });
  const putAsset = async (req, res, p) => {
    try {
      const a = JSON.parse(await readBody(req)); if (!a.anims) return send(res, 400, { ok: false, error: 'an asset needs "anims"' });
      const agent = req.headers['x-aci-agent'];
      fs.writeFileSync(assetPath(p.name), JSON.stringify({ aci: 1, ...a, name: p.name.replace(/\.aci\.json$/, ''), author: a.author || agent || null }, null, 1));
      push(agentLog, { n: ++logN, t: Date.now(), agent: agent || a.author || 'anon', cmd: { op: 'save_asset', name: p.name }, result: { ok: true } });
      send(res, 200, { ok: true, saved: p.name });
    } catch (e) { send(res, 400, { ok: false, error: e.message }); }
  };
  route('PUT', '/api/assets/:name', putAsset); route('POST', '/api/assets/:name', putAsset);
  route('DELETE', '/api/assets/:name', (req, res, p) => { try { fs.unlinkSync(assetPath(p.name)); send(res, 200, { ok: true }); } catch (e) { send(res, 404, { ok: false, error: e.message }); } });

  // ---------------------------------------------------------------- plugins: server/*.mjs
  const here = fileURLToPath(import.meta.url);
  for (const f of fs.readdirSync(path.dirname(here)).filter(f => f.endsWith('.mjs') && path.join(path.dirname(here), f) !== here).sort()) {
    try {
      const mod = await import(pathToFileURL(path.join(path.dirname(here), f)).href);
      if (typeof mod.register === 'function') { await mod.register(api); log('loaded server/' + f); }
    } catch (e) { console.error('[aci] server/' + f + ' failed to load:', e.message); }
  }

  // ---------------------------------------------------------------- static
  function serveStatic(req, res, p) {
    if (p === '/' || p === '') { res.writeHead(302, { Location: '/editor/' }); return res.end(); }
    let file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');
    try { if (fs.statSync(file).isDirectory()) { if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); return res.end(); } file = path.join(file, 'index.html'); } } catch (e) {}
    if (!fs.existsSync(file)) return send(res, 404, 'not found: ' + p, 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }

  // ---------------------------------------------------------------- http
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const p = decodeURIComponent(url.pathname);
      if (req.method === 'OPTIONS') return send(res, 204, '');
      for (const r of routes) {
        if (r.method !== req.method && !(r.method === 'GET' && req.method === 'HEAD')) continue;
        const m = p.match(r.rx); if (!m) continue;
        const params = {}; r.keys.forEach((k, i) => (params[k] = m[i + 1] !== undefined ? m[i + 1] : ''));
        return await r.handler(req, res, params, url);
      }
      if (p.startsWith('/api/')) return send(res, 404, { ok: false, error: 'unknown endpoint ' + req.method + ' ' + p });
      serveStatic(req, res, p);
    } catch (e) { console.error('[aci]', e); send(res, 500, { ok: false, error: e.message }); }
  });

  // ---------------------------------------------------------------- websocket (RFC 6455, text frames)
  function wsAccept(req, sock) {
    const key = req.headers['sec-websocket-key']; if (!key) { sock.destroy(); return null; }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    sock.setNoDelay(true);
    const conn = { onmessage: null, onclose: null, alive: true };
    let buf = Buffer.alloc(0), frag = [];
    conn.send = obj => {
      if (!conn.alive) return;
      const data = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)); const len = data.length;
      const head = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255]) : (() => { const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); return h; })();
      try { sock.write(Buffer.concat([head, data])); } catch (e) {}
    };
    const close = () => { if (!conn.alive) return; conn.alive = false; try { sock.end(); } catch (e) {} conn.onclose && conn.onclose(); };
    sock.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 2) {
        const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        const mlen = masked ? 4 : 0; if (buf.length < off + mlen + len) return;
        const mask = masked ? buf.subarray(off, off + 4) : null;
        const payload = Buffer.from(buf.subarray(off + mlen, off + mlen + len));
        if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        buf = buf.subarray(off + mlen + len);
        if (op === 0x8) { close(); return; }
        if (op === 0x9) { try { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch (e) {} continue; }
        if (op === 0x1 || op === 0x0) { frag.push(payload); if (fin) { const text = Buffer.concat(frag).toString('utf8'); frag = []; conn.onmessage && conn.onmessage(text); } }
      }
    });
    sock.on('close', close); sock.on('error', close);
    return conn;
  }
  server.on('upgrade', (req, sock) => {
    if (!req.url.startsWith('/ws')) { sock.destroy(); return; }
    const conn = wsAccept(req, sock); if (!conn) return;
    sockets.add(conn);
    const g = { id: ++gameSeq, name: 'game', world: null, send: conn.send, pending: new Map(), editor: false };
    games.set(g.id, g);
    conn.onmessage = text => {
      let m; try { m = JSON.parse(text); } catch (e) { return; }
      if (m.type === 'hello') { g.name = m.name || g.name; g.world = m.world || null; g.editor = !!m.editor; log(`game #${g.id} connected: ${g.name}`); conn.send({ type: 'welcome', id: g.id }); }
      else if (m.type === 'result') { const fn = g.pending.get(m.id); if (fn) { g.pending.delete(m.id); fn(m.result); } }
      else if (m.type === 'event') push(events, { n: ++eventN, t: Date.now(), game: g.id, event: m.event, data: m.data });
    };
    conn.onclose = () => { sockets.delete(conn); games.delete(g.id); g.pending.forEach(fn => fn({ ok: false, error: 'game disconnected' })); log(`game #${g.id} disconnected`); };
  });

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, HOST, resolve); });
  const port = server.address().port;
  const url = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST === '127.0.0.1' ? 'localhost' : HOST}:${port}`;
  return { url, port, server, workspace: WORKSPACE, api, close: () => new Promise(r => { sockets.forEach(c => c.send && c.alive !== false); server.close(() => r()); server.closeAllConnections && server.closeAllConnections(); }) };
}

// run directly: node server/index.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start({}).then(s => console.log(`ACI server on ${s.url}  (projects: ${s.workspace})`)).catch(e => { console.error(e.message); process.exit(1); });
}
