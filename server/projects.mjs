// ACI editor: project files on disk, templates, build/export, play page.  Plain Node, no deps.
import fs from 'node:fs';
import path from 'node:path';

const MODULE_ORDER = ['physics', 'tilemap', 'scenes', 'input', 'sound', 'save', 'project', 'anim', 'convert', 'environments', 'cutscene', 'hud'];
const MIME = {
  '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

class HttpError extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}
const fail = (code, msg) => { throw new HttpError(code, msg); };

/* ---------- helpers ---------- */

export function sanitizeId(name) {
  let s = String(name == null ? '' : name).trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-{2,}/g, '-');
  s = s.replace(/^[.\-_]+/, '').replace(/[.\-]+$/, '');
  if (s.length > 80) s = s.slice(0, 80);
  return s || 'project';
}

function validId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id) && !id.includes('..');
}

function isInside(base, target) {
  return target === base || target.startsWith(base.endsWith(path.sep) ? base : base + path.sep);
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw e;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function lstatOrNull(p) {
  try { return fs.lstatSync(p); } catch { return null; }
}

function projectDir(workspace, id) {
  if (!validId(id)) fail(400, 'invalid project id');
  const dir = path.join(workspace, id);
  const st = lstatOrNull(dir);
  if (!st || !st.isDirectory()) fail(404, 'project not found: ' + id);
  return dir;
}

/** Resolve a project-relative path safely. Rejects '..', absolute paths, NULs, backslash tricks and symlink escapes. */
export function safePath(projDir, rel) {
  if (typeof rel !== 'string' || !rel) fail(400, 'path required');
  if (rel.includes('\0')) fail(400, 'invalid path');
  if (rel.includes('\\')) fail(400, 'invalid path');
  if (rel.startsWith('/') || /^[A-Za-z]:/.test(rel) || path.isAbsolute(rel)) fail(400, 'absolute paths not allowed');
  const parts = rel.split('/');
  for (const part of parts) {
    if (part === '..') fail(400, 'path traversal not allowed');
  }
  const clean = parts.filter((x) => x && x !== '.');
  if (!clean.length) fail(400, 'path required');
  let realRoot;
  try { realRoot = fs.realpathSync(projDir); } catch { fail(404, 'project not found'); }
  const abs = path.resolve(realRoot, ...clean);
  if (!isInside(realRoot, abs) || abs === realRoot) fail(400, 'path escapes project');
  // walk to the deepest existing entry and make sure its real location is inside the project
  let cur = abs;
  while (!lstatOrNull(cur)) {
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  let real;
  try { real = fs.realpathSync(cur); } catch { fail(400, 'broken symlink'); }
  if (!isInside(realRoot, real)) fail(400, 'path escapes project (symlink)');
  return { abs, rel: clean.join('/') };
}

function decodeMaybe(s) {
  if (typeof s === 'string' && s.includes('%')) { try { return decodeURIComponent(s); } catch { return s; } }
  return s;
}

function uniqueDir(workspace, base) {
  fs.mkdirSync(workspace, { recursive: true });
  for (let n = 1; n < 10000; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    try { fs.mkdirSync(path.join(workspace, id)); return id; } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  fail(500, 'could not allocate project id');
}

export function emptyManifest(name) {
  return {
    aci: 'project', name, version: '0.1.0', startScene: 'main',
    scenes: [{ name: 'main', file: 'scenes/main.scene.json' }],
    settings: { fontSize: 14, background: '#0a0e1a' }, template: null, created: new Date().toISOString(),
  };
}

export function emptyScene(name = 'main') {
  return {
    format: 'aci-scene', v: 1, name, world: { cols: 80, rows: 30 }, environment: { preset: 'none', params: {} },
    tilemaps: [], entities: [], camera: {}, gravity: 0,
  };
}

function templatesDir(root) { return path.join(root, 'templates'); }

function listTemplates(root) {
  const dir = templatesDir(root);
  const out = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return out; }
  for (const id of names.sort()) {
    if (!validId(id)) continue;
    const meta = path.join(dir, id, 'template.json');
    if (!fs.existsSync(meta)) continue;
    let j = {};
    try { j = readJson(meta); } catch {}
    out.push({ id, name: j.name || id, description: j.description || '', tags: Array.isArray(j.tags) ? j.tags : [] });
  }
  return out;
}

function copyTree(src, dst, { skipRoot = [] } = {}) {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipRoot.includes(ent.name)) continue;
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyTree(s, d);
    else if (ent.isFile()) fs.copyFileSync(s, d);
    // symlinks are skipped on purpose
  }
}

function walkTree(dir, base, out, skipTop) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  ents.sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of ents) {
    if (skipTop && base === '' && ent.name === 'build') continue;
    const full = path.join(dir, ent.name);
    const rel = base ? base + '/' + ent.name : ent.name;
    let st;
    try { st = fs.lstatSync(full); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (ent.name.endsWith('.tmp') && /\.\d+\.[a-z0-9]{1,6}\.tmp$/.test(ent.name)) continue;
    if (st.isDirectory()) {
      out.push({ path: rel, type: 'dir', size: 0, modified: st.mtime.toISOString() });
      walkTree(full, rel, out, skipTop);
    } else if (st.isFile()) {
      out.push({ path: rel, type: 'file', size: st.size, modified: st.mtime.toISOString() });
    }
  }
}

function readManifest(dir) {
  const f = path.join(dir, 'aci.project.json');
  if (!fs.existsSync(f)) fail(404, 'aci.project.json missing');
  try { return readJson(f); } catch { fail(422, 'aci.project.json is not valid JSON'); }
}

/* ---------- build ---------- */

const escScript = (s) => String(s).replace(/<\/(script)/gi, '<\\/$1').replace(/<(script)(?=[\s>\/])/gi, '\\u003c$1').replace(/<!--/g, '<\\!--');
const escJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function listFiles(dir, suffix) {
  try { return fs.readdirSync(dir).filter((f) => f.endsWith(suffix) && fs.statSync(path.join(dir, f)).isFile()).sort(); } catch { return []; }
}

/** Collect manifest, scenes, assets and scripts of a project into one plain object. */
export function collectProjectData(projDir) {
  const manifest = readManifest(projDir);
  const scenes = {};
  for (const s of manifest.scenes || []) {
    if (!s || !s.name || !s.file) continue;
    try { const { abs } = safePath(projDir, s.file); scenes[s.name] = readJson(abs); } catch (e) { /* missing scene: skip */ }
  }
  for (const f of listFiles(path.join(projDir, 'scenes'), '.scene.json')) {
    const name = f.slice(0, -'.scene.json'.length);
    if (scenes[name]) continue;
    try { scenes[name] = readJson(path.join(projDir, 'scenes', f)); } catch {}
  }
  const assets = {};
  for (const f of listFiles(path.join(projDir, 'assets'), '.aci.json')) {
    try { assets[f.slice(0, -'.aci.json'.length)] = readJson(path.join(projDir, 'assets', f)); } catch {}
  }
  const cutscenes = {};
  for (const f of listFiles(path.join(projDir, 'cutscenes'), '.cutscene.json')) {
    try { cutscenes[f.slice(0, -'.cutscene.json'.length)] = readJson(path.join(projDir, 'cutscenes', f)); } catch {}
  }
  const scripts = {};
  for (const f of listFiles(path.join(projDir, 'scripts'), '.js')) {
    scripts[f.slice(0, -3)] = fs.readFileSync(path.join(projDir, 'scripts', f), 'utf8');
  }
  return { manifest, scenes, assets, scripts, cutscenes };
}

/** Writes build/index.html (one self-contained file) -> { file:'build/index.html', size } */
export function buildProject(root, workspace, id, log = (m) => console.warn('[aci build] ' + m)) {
  const dir = projectDir(workspace, id);
  const data = collectProjectData(dir);
  const sources = [];
  const addSrc = (label, file) => {
    if (fs.existsSync(file)) sources.push([label, fs.readFileSync(file, 'utf8')]);
    else log(`skipping missing ${label}`);
  };
  addSrc('aci.js', path.join(root, 'aci.js'));
  for (const m of MODULE_ORDER) {
    const f = path.join(root, 'modules', m + '.js');
    if (fs.existsSync(f)) sources.push([`modules/${m}.js`, fs.readFileSync(f, 'utf8')]);
  }
  addSrc('runtime/runtime.js', path.join(root, 'runtime', 'runtime.js'));
  addSrc('runtime/behaviours.js', path.join(root, 'runtime', 'behaviours.js'));

  const bg = (data.manifest.settings && /^#[0-9a-fA-F]{3,8}$/.test(data.manifest.settings.background || '')) ? data.manifest.settings.background : '#0a0e1a';
  const parts = [];
  parts.push('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n');
  parts.push(`<title>${escHtml(data.manifest.name || id)}</title>\n`);
  parts.push(`<style>html,body{margin:0;height:100%;background:${bg};overflow:hidden}#screen{position:fixed;inset:0}</style>\n</head>\n<body>\n<div id="screen"></div>\n`);
  for (const [label, code] of sources) {
    parts.push(`<script>/* ${label.replace(/\*\//g, '')} */\n${escScript(code)}\n</script>\n`);
  }
  parts.push(`<script>window.__ACI_PROJECT__=${escJson(data)};</script>\n`);
  parts.push('<script>window.ACIRuntime && ACIRuntime.start(window.__ACI_PROJECT__)</script>\n</body>\n</html>\n');
  const html = parts.join('');
  const out = path.join(dir, 'build', 'index.html');
  writeAtomic(out, html);
  return { file: 'build/index.html', size: Buffer.byteLength(html) };
}

/* ---------- routes ---------- */

export function register(api) {
  const { root, workspace } = api;
  const log = api.log || (() => {});
  fs.mkdirSync(workspace, { recursive: true });

  const json = (res, code, obj) => api.send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');
  const body = async (req) => api.readBody(req);
  const jsonBody = async (req) => {
    const t = await body(req);
    if (!t || !String(t).trim()) return {};
    try { const v = JSON.parse(t); return v && typeof v === 'object' ? v : fail(400, 'JSON object expected'); } catch (e) {
      if (e instanceof HttpError) throw e;
      fail(400, 'invalid JSON body');
    }
  };
  const route = (method, pattern, fn) => api.route(method, pattern, async (req, res, params, url) => {
    try { await fn(req, res, params || {}, url); } catch (e) {
      if (e instanceof HttpError) return json(res, e.code, { error: e.message });
      log('projects error: ' + (e && e.stack || e));
      json(res, 500, { error: (e && e.message) || 'internal error' });
    }
  });
  const dirOf = (params) => projectDir(workspace, decodeMaybe(params.p));
  const filePath = (params) => {
    const dir = dirOf(params);
    return { dir, ...safePath(dir, decodeMaybe(params['*'])) };
  };

  route('GET', '/api/projects', (req, res) => {
    const out = [];
    for (const ent of fs.readdirSync(workspace, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith('.') || !validId(ent.name)) continue;
      const mf = path.join(workspace, ent.name, 'aci.project.json');
      if (!fs.existsSync(mf)) continue;
      let m = {};
      try { m = readJson(mf); } catch { m = { name: ent.name }; }
      out.push({
        id: ent.name, name: m.name || ent.name, modified: fs.statSync(mf).mtime.toISOString(),
        scenes: Array.isArray(m.scenes) ? m.scenes.length : 0, template: m.template || null,
      });
    }
    out.sort((a, b) => b.modified.localeCompare(a.modified));
    json(res, 200, out);
  });

  route('POST', '/api/projects', async (req, res) => {
    const b = await jsonBody(req);
    const name = String(b.name == null ? '' : b.name).trim().slice(0, 120) || 'Untitled';
    const tpl = b.template || null;
    if (tpl && !validId(String(tpl))) fail(400, 'invalid template id');
    if (tpl && !fs.existsSync(path.join(templatesDir(root), tpl, 'template.json'))) fail(404, 'template not found: ' + tpl);
    const id = uniqueDir(workspace, sanitizeId(name));
    const dir = path.join(workspace, id);
    try {
      if (tpl) {
        copyTree(path.join(templatesDir(root), tpl), dir, { skipRoot: ['template.json'] });
        let m;
        try { m = readJson(path.join(dir, 'aci.project.json')); } catch { m = emptyManifest(name); }
        m.name = name; m.template = tpl; m.created = new Date().toISOString();
        writeAtomic(path.join(dir, 'aci.project.json'), JSON.stringify(m, null, 2) + '\n');
      } else {
        writeAtomic(path.join(dir, 'aci.project.json'), JSON.stringify(emptyManifest(name), null, 2) + '\n');
        writeAtomic(path.join(dir, 'scenes', 'main.scene.json'), JSON.stringify(emptyScene('main'), null, 2) + '\n');
        fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
      }
    } catch (e) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      throw e;
    }
    json(res, 201, { id });
  });

  route('GET', '/api/templates', (req, res) => json(res, 200, listTemplates(root)));

  route('GET', '/api/projects/:p', (req, res, params) => json(res, 200, readManifest(dirOf(params))));

  route('PUT', '/api/projects/:p', async (req, res, params) => {
    const dir = dirOf(params);
    const m = await jsonBody(req);
    if (m.aci !== 'project') fail(400, "manifest must have aci:'project'");
    if (typeof m.name !== 'string' || !m.name) fail(400, 'manifest needs a name');
    if (m.scenes != null && !Array.isArray(m.scenes)) fail(400, 'scenes must be an array');
    writeAtomic(path.join(dir, 'aci.project.json'), JSON.stringify(m, null, 2) + '\n');
    json(res, 200, { ok: true });
  });

  route('GET', '/api/projects/:p/tree', (req, res, params) => {
    const dir = dirOf(params);
    const out = [];
    walkTree(dir, '', out, true);
    json(res, 200, out);
  });

  route('GET', '/api/projects/:p/file/*', (req, res, params) => {
    const { abs } = filePath(params);
    const st = lstatOrNull(abs);
    if (!st) fail(404, 'file not found');
    if (!st.isFile() && !(st.isSymbolicLink() && fs.statSync(abs).isFile())) fail(400, 'not a file');
    const type = MIME[path.extname(abs).toLowerCase()] || 'text/plain; charset=utf-8';
    api.send(res, 200, fs.readFileSync(abs), type);
  });

  route('PUT', '/api/projects/:p/file/*', async (req, res, params) => {
    const { abs, rel } = filePath(params);
    const st = lstatOrNull(abs);
    if (st && st.isDirectory()) fail(400, 'path is a directory');
    const text = await body(req);
    writeAtomic(abs, text == null ? '' : text);
    json(res, 200, { ok: true, path: rel, size: fs.statSync(abs).size });
  });

  route('DELETE', '/api/projects/:p/file/*', (req, res, params) => {
    const { abs, rel } = filePath(params);
    const st = lstatOrNull(abs);
    if (!st) fail(404, 'file not found');
    if (st.isDirectory()) fs.rmSync(abs, { recursive: true });
    else fs.unlinkSync(abs);
    json(res, 200, { ok: true, path: rel });
  });

  route('POST', '/api/projects/:p/rename', async (req, res, params) => {
    const dir = dirOf(params);
    const id = decodeMaybe(params.p);
    const b = await jsonBody(req);
    const to = String(b.to == null ? '' : b.to).trim().slice(0, 120);
    if (!to) fail(400, "'to' required");
    const m = readManifest(dir);
    let newId = id;
    const wanted = sanitizeId(to);
    if (wanted !== id) {
      newId = uniqueDir(workspace, wanted);
      fs.rmdirSync(path.join(workspace, newId)); // we only wanted to reserve a free name
      fs.renameSync(dir, path.join(workspace, newId));
    }
    m.name = to;
    writeAtomic(path.join(workspace, newId, 'aci.project.json'), JSON.stringify(m, null, 2) + '\n');
    json(res, 200, { id: newId, name: to });
  });

  route('POST', '/api/projects/:p/duplicate', (req, res, params) => {
    const dir = dirOf(params);
    const m = readManifest(dir);
    const id = uniqueDir(workspace, sanitizeId(decodeMaybe(params.p) + '-copy'));
    const dst = path.join(workspace, id);
    try {
      copyTree(dir, dst, { skipRoot: ['build'] });
      m.name = (m.name || id) + ' copy';
      m.created = new Date().toISOString();
      writeAtomic(path.join(dst, 'aci.project.json'), JSON.stringify(m, null, 2) + '\n');
    } catch (e) {
      try { fs.rmSync(dst, { recursive: true, force: true }); } catch {}
      throw e;
    }
    json(res, 201, { id });
  });

  route('DELETE', '/api/projects/:p', (req, res, params) => {
    const dir = dirOf(params);
    const id = decodeMaybe(params.p);
    const trash = path.join(workspace, '.trash');
    fs.mkdirSync(trash, { recursive: true });
    let dest = path.join(trash, `${id}-${Date.now()}`);
    for (let n = 2; fs.existsSync(dest); n++) dest = path.join(trash, `${id}-${Date.now()}-${n}`);
    fs.renameSync(dir, dest);
    json(res, 200, { ok: true, trash: path.basename(dest) });
  });

  route('POST', '/api/projects/:p/build', (req, res, params) => {
    const r = buildProject(root, workspace, decodeMaybe(params.p), log);
    json(res, 200, r);
  });

  const play = (req, res, params) => {
    const id = decodeMaybe(params.p);
    projectDir(workspace, id);
    const f = path.join(root, 'runtime', 'player.html');
    if (!fs.existsSync(f)) fail(404, 'runtime/player.html not found');
    let html = fs.readFileSync(f, 'utf8');
    const inj = `<script>window.__ACI_PROJECT_ID__=${JSON.stringify(id).replace(/</g, '\\u003c')};</script>`;
    const m = /<head[^>]*>/i.exec(html);
    html = m ? html.slice(0, m.index + m[0].length) + inj + html.slice(m.index + m[0].length) : inj + html;
    api.send(res, 200, html, 'text/html; charset=utf-8');
  };
  route('GET', '/play/:p/', play);
  route('GET', '/play/:p', play);
}
