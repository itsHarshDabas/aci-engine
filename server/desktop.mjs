// ACI desktop export: wraps the one-file HTML build in a desktop app for Windows, macOS or Linux.
//   POST /api/projects/:p/export { target:'windows'|'mac'|'mac-x64'|'linux' } -> { ok, file, size, target }
//   GET  /api/desktop/targets -> [{ id, label, cached }]
// How: download the matching Electron runtime once (cached in ~/.aci/electron), then write a new zip that
// copies Electron's files byte-for-byte (no recompression), renames the executable to the game's name,
// drops Electron's default app and adds resources/app = { package.json, main.js, index.html }.
// Plain Node, no dependencies. The result is build/<Name>-<target>.zip in the project folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildProject } from './projects.mjs';

export const ELECTRON_VERSION = process.env.ACI_ELECTRON_VERSION || '33.2.1';
const MIRROR = (process.env.ACI_ELECTRON_MIRROR || 'https://github.com/electron/electron/releases/download/').replace(/\/?$/, '/');
const CACHE = process.env.ACI_ELECTRON_CACHE || path.join(os.homedir(), '.aci', 'electron');

export const TARGETS = {
  windows: { label: 'Windows (.exe, 64-bit)', platform: 'win32-x64' },
  mac: { label: 'macOS (Apple Silicon)', platform: 'darwin-arm64' },
  'mac-x64': { label: 'macOS (Intel)', platform: 'darwin-x64' },
  linux: { label: 'Linux (64-bit)', platform: 'linux-x64' },
};

const zipName = (t) => `electron-v${ELECTRON_VERSION}-${TARGETS[t].platform}.zip`;
const cached = (t) => path.join(CACHE, zipName(t));

/** Download (once) the Electron zip for a target. onProgress(fraction) */
export async function ensureRuntime(target, onProgress = () => {}) {
  const file = cached(target);
  if (fs.existsSync(file) && fs.statSync(file).size > 1e6) return file;
  fs.mkdirSync(CACHE, { recursive: true });
  const url = MIRROR + `v${ELECTRON_VERSION}/` + zipName(target);
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`could not download the ${TARGETS[target].label} runtime (${r.status}) from ${url}`);
  const total = +r.headers.get('content-length') || 0; let got = 0, last = 0;
  const tmp = file + '.part', fd = fs.openSync(tmp, 'w');
  try {
    for await (const chunk of r.body) {
      fs.writeSync(fd, chunk); got += chunk.length;
      if (total && got - last > total / 50) { last = got; onProgress(got / total); }
    }
  } finally { fs.closeSync(fd); }
  if (total && got !== total) { fs.rmSync(tmp, { force: true }); throw new Error('the runtime download was cut off; try again'); }
  fs.renameSync(tmp, file);
  return file;
}

/* ---------- minimal zip reader/writer (stored or deflated entries, no zip64) ---------- */

export function readCentral(buf) {
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  if (count === 0xffff || p === 0xffffffff) throw new Error('zip64 archives are not supported');
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip central directory');
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const ent = {
      made: buf.readUInt16LE(p + 4), need: buf.readUInt16LE(p + 6), flags: buf.readUInt16LE(p + 8), method: buf.readUInt16LE(p + 10),
      time: buf.readUInt16LE(p + 12), date: buf.readUInt16LE(p + 14), crc: buf.readUInt32LE(p + 16), csize: buf.readUInt32LE(p + 20),
      usize: buf.readUInt32LE(p + 24), attr: buf.readUInt32LE(p + 38), off: buf.readUInt32LE(p + 42),
      name: buf.toString('utf8', p + 46, p + 46 + nl),
    };
    const lnl = buf.readUInt16LE(ent.off + 26), lxl = buf.readUInt16LE(ent.off + 28);
    ent.data = () => buf.subarray(ent.off + 30 + lnl + lxl, ent.off + 30 + lnl + lxl + ent.csize);
    out.push(ent); p += 46 + nl + xl + cl;
  }
  return out;
}

const crc32 = zlib.crc32 || ((b) => { let c, crc = 0xffffffff; for (let n = 0; n < b.length; n++) { c = (crc ^ b[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; });

export function zipWriter(file) {
  const fd = fs.openSync(file, 'w'); let off = 0; const central = [];
  const w = (b) => { fs.writeSync(fd, b); off += b.length; };
  const now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)), dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate());
  function raw(ent, name) {   // copy an existing entry's compressed bytes under a new name
    const nb = Buffer.from(name, 'utf8'), data = ent.data(), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(ent.need, 4); h.writeUInt16LE((ent.flags & ~8) | 0x800, 6); h.writeUInt16LE(ent.method, 8);
    h.writeUInt16LE(ent.time, 10); h.writeUInt16LE(ent.date, 12); h.writeUInt32LE(ent.crc, 14); h.writeUInt32LE(ent.csize, 18); h.writeUInt32LE(ent.usize, 22);
    h.writeUInt16LE(nb.length, 26); h.writeUInt16LE(0, 28);
    central.push({ ...ent, flags: (ent.flags & ~8) | 0x800, nb, off }); w(h); w(nb); w(data);
  }
  function add(name, content, mode = 0o644) {   // a new file, deflated
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'), def = zlib.deflateRawSync(body, { level: 9 });
    raw({ need: 20, flags: 0, method: 8, time: dt, date: dd, crc: crc32(body), csize: def.length, usize: body.length, made: (3 << 8) | 20, attr: ((0o100000 | mode) << 16) >>> 0, data: () => def }, name);
  }
  function dir(name) { raw({ need: 20, flags: 0, method: 0, time: dt, date: dd, crc: 0, csize: 0, usize: 0, made: (3 << 8) | 20, attr: ((0o040755 << 16) | 0x10) >>> 0, data: () => Buffer.alloc(0) }, name.replace(/\/?$/, '/')); }
  function close() {
    const start = off;
    for (const c of central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(c.made, 4); h.writeUInt16LE(c.need, 6); h.writeUInt16LE(c.flags, 8); h.writeUInt16LE(c.method, 10);
      h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14); h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.csize, 20); h.writeUInt32LE(c.usize, 24);
      h.writeUInt16LE(c.nb.length, 28); h.writeUInt32LE(c.attr, 38); h.writeUInt32LE(c.off, 42);
      w(h); w(c.nb);
    }
    if (central.length > 0xfffe || off > 0xfffffff0) throw new Error('the app is too big for a plain zip');
    const e = Buffer.alloc(22);
    e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(central.length, 8); e.writeUInt16LE(central.length, 10);
    e.writeUInt32LE(off - start, 12); e.writeUInt32LE(start, 16);
    w(e); fs.closeSync(fd);
    return off;
  }
  return { raw, add, dir, close };
}

/* ---------- the app wrapper ---------- */

const safeName = (s) => String(s || 'Game').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Game';

function appFiles(name, html, bg) {
  const pkg = JSON.stringify({ name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'aci-game', productName: name, version: '1.0.0', main: 'main.js', private: true }, null, 2);
  const main = `// Made with the ACI engine. Opens the game (index.html) in its own window.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
app.setName(${JSON.stringify(name)});
Menu.setApplicationMenu(null);
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1280, height: 800, minWidth: 320, minHeight: 240, title: ${JSON.stringify(name)}, backgroundColor: ${JSON.stringify(bg)}, autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11' || (i.alt && i.key === 'Enter') || (i.meta && i.control && i.key.toLowerCase() === 'f')) { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    if (i.key === 'Escape' && win.isFullScreen()) win.setFullScreen(false);
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
});
app.on('window-all-closed', () => app.quit());
`;
  return { 'package.json': pkg, 'main.js': main, 'index.html': html };
}

const README = {
  windows: (n) => `${n}\r\n\r\nDouble-click "${n}.exe" to play. Keep the files in this folder together.\r\nF11 or Alt+Enter toggles full screen.\r\n\r\nWindows may show "Windows protected your PC" the first time, because the app is not signed.\r\nClick "More info", then "Run anyway".\r\n\r\nMade with the ACI engine.\r\n`,
  mac: (n) => `${n}\n\nDrag "${n}.app" to Applications (or anywhere) and open it.\n\nThe app is not signed by Apple, so macOS will block it the first time. To allow it, open Terminal and run:\n\n  xattr -cr "/path/to/${n}.app" && codesign --force --deep --sign - "/path/to/${n}.app"\n\n(or right-click the app, choose Open, then Open again; on macOS 15+ use System Settings > Privacy & Security > Open Anyway).\nCtrl+Cmd+F toggles full screen.\n\nMade with the ACI engine.\n`,
  linux: (n, exe) => `${n}\n\nRun ./${exe} to play. Keep the files in this folder together.\nF11 toggles full screen. If it does not start, try: ./${exe} --no-sandbox\n\nMade with the ACI engine.\n`,
};

/** Build the project and wrap it for a desktop target. -> { file, size, target } */
export async function exportDesktop(root, workspace, id, target, log = () => {}, onProgress = () => {}) {
  if (!TARGETS[target]) throw new Error('unknown target "' + target + '". Use: ' + Object.keys(TARGETS).join(', '));
  const b = buildProject(root, workspace, id, log);
  const dir = path.join(workspace, id);
  const html = fs.readFileSync(path.join(dir, b.file), 'utf8');
  let manifest = {}; try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'aci.project.json'), 'utf8')); } catch {}
  const name = safeName(manifest.name || id);
  const bg = (manifest.settings && /^#[0-9a-fA-F]{6}$/.test(manifest.settings.background || '')) ? manifest.settings.background : '#0a0e1a';
  const runtime = await ensureRuntime(target, onProgress);
  const entries = readCentral(fs.readFileSync(runtime));
  const files = appFiles(name, html, bg);
  const kind = target.startsWith('mac') ? 'mac' : target;
  const exe = kind === 'linux' ? name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-') : name;
  const outName = `${name.replace(/\s+/g, '-')}-${target}.zip`;
  const out = path.join(dir, 'build', outName);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const z = zipWriter(out + '.part');
  const top = kind === 'mac' ? '' : name + '/';
  if (top) z.dir(top);
  let appDir;
  for (const ent of entries) {
    let n = ent.name;
    if (kind === 'mac') {
      if (!n.startsWith('Electron.app/')) { if (n === 'LICENSE' || n === 'LICENSES.chromium.html') z.raw(ent, top + 'licenses/' + n); continue; }
      if (n === 'Electron.app/Contents/Resources/default_app.asar') continue;
      n = name + '.app/' + n.slice('Electron.app/'.length);
      z.raw(ent, n);   // the app sits directly in the zip so unzipping gives "<Name>.app"
      continue;
    }
    if (n === 'resources/default_app.asar') continue;
    if (kind === 'windows' && n === 'electron.exe') n = exe + '.exe';
    if (kind === 'linux' && n === 'electron') n = exe;
    if (n === 'LICENSE' || n === 'LICENSES.chromium.html') n = 'licenses/' + n;
    z.raw(ent, top + n);
  }
  appDir = kind === 'mac' ? name + '.app/Contents/Resources/app/' : top + 'resources/app/';
  for (const [f, c] of Object.entries(files)) z.add(appDir + f, c);
  z.add(top + 'README.txt', README[kind](name, exe));
  const size = z.close();
  fs.renameSync(out + '.part', out);
  return { ok: true, file: 'build/' + outName, size, target, name };
}

export function register(api) {
  api.route('GET', '/api/desktop/targets', (req, res) => api.send(res, 200, Object.entries(TARGETS).map(([id, t]) => ({ id, label: t.label, cached: fs.existsSync(cached(id)) }))));
  api.route('POST', '/api/projects/:p/export', async (req, res, params) => {
    let b = {}; try { b = JSON.parse(await api.readBody(req) || '{}'); } catch (e) {}
    const id = decodeURIComponent(params.p);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id) || id.includes('..') || !fs.existsSync(path.join(api.workspace, id, 'aci.project.json'))) return api.send(res, 404, { ok: false, error: 'project not found: ' + id });
    const target = String(b.target || 'windows');
    try {
      api.log(`export: ${id} -> ${target}`);
      const r = await exportDesktop(api.root, api.workspace, id, target, api.log, (f) => api.broadcast && api.broadcast({ type: 'export-progress', project: id, target, progress: f }));
      api.log(`export: wrote ${r.file} (${Math.round(r.size / 1048576)} MB)`);
      api.send(res, 200, r);
    } catch (e) { api.send(res, 200, { ok: false, error: e.message }); }
  });
}
