// node server/test-projects.mjs  -- exercises every route of server/projects.mjs against a temp workspace.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { register, buildProject } from '../server/projects.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aci-proj-test-'));
const root = path.join(tmp, 'pkg'), workspace = path.join(tmp, 'ws');
fs.mkdirSync(path.join(root, 'modules'), { recursive: true });
fs.mkdirSync(path.join(root, 'runtime'), { recursive: true });
fs.mkdirSync(path.join(root, 'templates', 'tpl', 'scenes'), { recursive: true });
fs.writeFileSync(path.join(root, 'aci.js'), 'window.ACI={};\n');
fs.writeFileSync(path.join(root, 'modules', 'physics.js'), 'var s="</script><script>alert(1)</script>";\n');
fs.writeFileSync(path.join(root, 'modules', 'plugin-shim.js'), 'SHIM_MARKER\n');
fs.writeFileSync(path.join(root, 'modules', 'demo-all.html'), 'DEMO_MARKER');
fs.writeFileSync(path.join(root, 'runtime', 'runtime.js'), 'window.ACIRuntime={start(d){}};\n');
fs.writeFileSync(path.join(root, 'runtime', 'player.html'), '<!doctype html><html><head><title>p</title></head><body>player</body></html>');
fs.writeFileSync(path.join(root, 'templates', 'tpl', 'template.json'), JSON.stringify({ name: 'Tpl', description: 'd', tags: ['a'] }));
fs.writeFileSync(path.join(root, 'templates', 'tpl', 'aci.project.json'), JSON.stringify({ aci: 'project', name: 'Original', scenes: [{ name: 'main', file: 'scenes/main.scene.json' }] }));
fs.writeFileSync(path.join(root, 'templates', 'tpl', 'scenes', 'main.scene.json'), '{"format":"aci-scene","v":1,"name":"main"}');

// minimal fake api with :param and * patterns
const routes = [];
const api = {
  root, workspace, log: () => {},
  route: (method, pattern, handler) => routes.push({ method, segs: pattern.split('/').filter(Boolean), handler }),
  readBody: (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c).toString('utf8'))); }),
  send: (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(body); },
};
register(api);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const segs = url.pathname.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const params = {}; let ok = true;
    for (let i = 0; i < r.segs.length; i++) {
      const s = r.segs[i];
      if (s === '*') { params['*'] = url.pathname.split('/').slice(1 + i).join('/'); if (!params['*']) ok = false; break; }
      if (i >= segs.length) { ok = false; break; }
      if (s[0] === ':') params[s.slice(1)] = decodeURIComponent(segs[i]);
      else if (s !== segs[i]) { ok = false; break; }
      if (i === r.segs.length - 1 && segs.length > r.segs.length) ok = false;
    }
    if (ok) return r.handler(req, res, params, url);
  }
  res.writeHead(404); res.end('{"error":"no route"}');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, p, body) => {
  const r = await fetch(base + p, { method, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch {}
  return { status: r.status, text, json: j };
};

let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n', e); process.exitCode = 1; } };

await t('empty list', async () => { const r = await call('GET', '/api/projects'); assert.equal(r.status, 200); assert.deepEqual(r.json, []); });
let id;
await t('create empty', async () => {
  const r = await call('POST', '/api/projects', { name: 'My Game!' }); assert.equal(r.status, 201); id = r.json.id; assert.equal(id, 'My-Game');
  const m = JSON.parse(fs.readFileSync(path.join(workspace, id, 'aci.project.json'), 'utf8'));
  assert.equal(m.aci, 'project'); assert.equal(m.startScene, 'main'); assert.equal(m.template, null);
  const s = JSON.parse(fs.readFileSync(path.join(workspace, id, 'scenes/main.scene.json'), 'utf8'));
  assert.equal(s.format, 'aci-scene'); assert.equal(s.world.cols, 80);
});
await t('id collision suffix', async () => {
  assert.equal((await call('POST', '/api/projects', { name: 'My Game' })).json.id, 'My-Game-2');
  assert.equal((await call('POST', '/api/projects', { name: 'My Game' })).json.id, 'My-Game-3');
});
await t('list', async () => { const r = await call('GET', '/api/projects'); assert.equal(r.json.length, 3); assert.equal(r.json[0].scenes, 1); assert.ok(r.json[0].modified); });
await t('templates', async () => { const r = await call('GET', '/api/templates'); assert.deepEqual(r.json, [{ id: 'tpl', name: 'Tpl', description: 'd', tags: ['a'] }]); });
await t('create from template', async () => {
  const r = await call('POST', '/api/projects', { name: 'From Tpl', template: 'tpl' }); assert.equal(r.status, 201);
  const d = path.join(workspace, r.json.id);
  assert.ok(!fs.existsSync(path.join(d, 'template.json'))); assert.ok(fs.existsSync(path.join(d, 'scenes/main.scene.json')));
  const m = JSON.parse(fs.readFileSync(path.join(d, 'aci.project.json'), 'utf8')); assert.equal(m.name, 'From Tpl'); assert.equal(m.template, 'tpl');
  assert.equal((await call('POST', '/api/projects', { name: 'x', template: 'nope' })).status, 404);
  assert.equal((await call('POST', '/api/projects', { name: 'x', template: '../x' })).status, 400);
});
await t('manifest get/put', async () => {
  const m = (await call('GET', `/api/projects/${id}`)).json; assert.equal(m.name, 'My Game!');
  m.settings.fontSize = 20;
  assert.equal((await call('PUT', `/api/projects/${id}`, m)).status, 200);
  assert.equal((await call('GET', `/api/projects/${id}`)).json.settings.fontSize, 20);
  assert.equal((await call('PUT', `/api/projects/${id}`, { nope: 1 })).status, 400);
  assert.equal((await call('PUT', `/api/projects/${id}`, 'not json')).status, 400);
  assert.equal((await call('GET', '/api/projects/missing')).status, 404);
});
await t('file put/get/delete', async () => {
  assert.equal((await call('PUT', `/api/projects/${id}/file/scripts/hero.js`, 'ACI.behaviour("X",{});')).status, 200);
  assert.equal((await call('PUT', `/api/projects/${id}/file/assets/hero.aci.json`, '{"w":1}')).status, 200);
  const g = await call('GET', `/api/projects/${id}/file/scripts/hero.js`); assert.equal(g.status, 200); assert.equal(g.text, 'ACI.behaviour("X",{});');
  assert.equal((await call('GET', `/api/projects/${id}/file/scripts/none.js`)).status, 404);
  assert.equal((await call('DELETE', `/api/projects/${id}/file/scripts/hero.js`)).status, 200);
  assert.equal((await call('GET', `/api/projects/${id}/file/scripts/hero.js`)).status, 404);
  assert.equal((await call('DELETE', `/api/projects/${id}/file/scripts/hero.js`)).status, 404);
  const left = fs.readdirSync(path.join(workspace, id, 'scripts')); assert.deepEqual(left.filter((f) => f.endsWith('.tmp')), []);
});
await t('tree skips build, recursive', async () => {
  fs.mkdirSync(path.join(workspace, id, 'build'), { recursive: true }); fs.writeFileSync(path.join(workspace, id, 'build/x.html'), 'x');
  const r = await call('GET', `/api/projects/${id}/tree`); const paths = r.json.map((e) => e.path);
  assert.ok(paths.includes('scenes/main.scene.json') && paths.includes('assets/hero.aci.json') && paths.includes('scenes'));
  assert.ok(!paths.some((p) => p.startsWith('build')));
  assert.equal(r.json.find((e) => e.path === 'scenes').type, 'dir');
});
await t('path traversal rejected', async () => {
  fs.writeFileSync(path.join(workspace, 'secret.txt'), 'SECRET');
  const bad = ['../secret.txt', '..%2Fsecret.txt', '%2e%2e/secret.txt', 'a/../../secret.txt', '/etc/passwd', '%2Fetc%2Fpasswd', 'a%5C..%5Csecret.txt'];
  for (const m of ['GET', 'PUT', 'DELETE']) for (const p of bad) {
    const r = await call(m, `/api/projects/${id}/file/${p}`, m === 'PUT' ? 'pwn' : undefined);
    assert.ok(r.status >= 400 && r.status < 500, `${m} ${p} -> ${r.status}`); assert.ok(r.json && r.json.error);
    assert.ok(!r.text.includes('SECRET'));
  }
  assert.equal(fs.readFileSync(path.join(workspace, 'secret.txt'), 'utf8'), 'SECRET');
  assert.ok((await call('GET', '/api/projects/%2e%2e/tree')).status >= 400);
});
await t('symlink escape rejected', async () => {
  fs.symlinkSync(path.join(workspace, 'secret.txt'), path.join(workspace, id, 'link.txt'));
  fs.symlinkSync(tmp, path.join(workspace, id, 'linkdir'));
  for (const [m, p] of [['GET', 'link.txt'], ['PUT', 'link.txt'], ['GET', 'linkdir/ws/secret.txt'], ['PUT', 'linkdir/new.txt'], ['DELETE', 'linkdir/ws/secret.txt']]) {
    const r = await call(m, `/api/projects/${id}/file/${p}`, m === 'PUT' ? 'pwn' : undefined);
    assert.ok(r.status >= 400 && r.status < 500, `${m} ${p} -> ${r.status}`);
  }
  assert.equal(fs.readFileSync(path.join(workspace, 'secret.txt'), 'utf8'), 'SECRET'); assert.ok(!fs.existsSync(path.join(tmp, 'new.txt')));
  const tree = (await call('GET', `/api/projects/${id}/tree`)).json.map((e) => e.path); assert.ok(!tree.includes('link.txt'));
  fs.unlinkSync(path.join(workspace, id, 'link.txt')); fs.unlinkSync(path.join(workspace, id, 'linkdir'));
});
await t('build', async () => {
  await call('PUT', `/api/projects/${id}/file/scripts/hero.js`, 'ACI.behaviour("X",{ s:"</script>" });');
  const r = await call('POST', `/api/projects/${id}/build`); assert.equal(r.status, 200); assert.equal(r.json.file, 'build/index.html');
  const html = fs.readFileSync(path.join(workspace, id, 'build/index.html'), 'utf8');
  assert.equal(r.json.size, Buffer.byteLength(html));
  const open = (html.match(/<script\b/gi) || []).length, close = (html.match(/<\/script/gi) || []).length;
  assert.equal(open, close, `script tags ${open} vs ${close}`);
  assert.ok(open >= 4);
  assert.ok(!html.includes('SHIM_MARKER') && !html.includes('DEMO_MARKER'));
  assert.ok(html.includes('ACIRuntime.start(window.__ACI_PROJECT__)'));
  assert.ok(html.indexOf('window.ACI={}') < html.indexOf('ACIRuntime={start'));
  // data blob parses and holds everything
  const m = /window\.__ACI_PROJECT__=(.*?);<\/script>/s.exec(html); const data = JSON.parse(m[1]);
  assert.equal(data.manifest.name, 'My Game!'); assert.ok(data.scenes.main); assert.ok(data.assets.hero); assert.ok(data.scripts.hero.includes('</script>'));
  // missing optional parts are fine (no behaviours.js here) and function export works directly
  assert.equal(buildProject(root, workspace, id, () => {}).file, 'build/index.html');
  assert.equal((await call('POST', '/api/projects/nope/build')).status, 404);
});
await t('play page', async () => {
  const r = await call('GET', `/play/${id}/`); assert.equal(r.status, 200);
  assert.ok(r.text.includes(`<head><script>window.__ACI_PROJECT_ID__="${id}";</script>`));
  assert.equal((await call('GET', '/play/nope/')).status, 404);
});
await t('rename', async () => {
  const r = await call('POST', `/api/projects/${id}/rename`, { to: 'Renamed Game' }); assert.equal(r.status, 200); assert.equal(r.json.id, 'Renamed-Game');
  assert.ok(!fs.existsSync(path.join(workspace, id))); assert.equal((await call('GET', '/api/projects/Renamed-Game')).json.name, 'Renamed Game');
  assert.equal((await call('POST', '/api/projects/Renamed-Game/rename', {})).status, 400);
  id = 'Renamed-Game';
});
await t('duplicate', async () => {
  const r = await call('POST', `/api/projects/${id}/duplicate`); assert.equal(r.status, 201); assert.equal(r.json.id, 'Renamed-Game-copy');
  assert.ok(fs.existsSync(path.join(workspace, r.json.id, 'scenes/main.scene.json'))); assert.ok(!fs.existsSync(path.join(workspace, r.json.id, 'build')));
  assert.equal((await call('GET', `/api/projects/${r.json.id}`)).json.name, 'Renamed Game copy');
});
await t('delete -> trash', async () => {
  const r = await call('DELETE', `/api/projects/${id}`); assert.equal(r.status, 200);
  assert.ok(!fs.existsSync(path.join(workspace, id)));
  const tr = fs.readdirSync(path.join(workspace, '.trash')); assert.ok(tr.some((x) => x.startsWith(id + '-')));
  assert.equal((await call('DELETE', `/api/projects/${id}`)).status, 404);
  assert.ok(!(await call('GET', '/api/projects')).json.some((p) => p.id === id));
});

server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(process.exitCode ? 'FAILED' : `all ${n} tests passed`);
