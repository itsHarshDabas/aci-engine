// node test/desktop.test.mjs -- desktop export against a fake Electron runtime (no download).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aci-desktop-test-'));
process.env.ACI_ELECTRON_CACHE = path.join(tmp, 'cache');
const { zipWriter, readCentral, exportDesktop, ELECTRON_VERSION } = await import('../server/desktop.mjs');

const root = path.join(tmp, 'pkg'), ws = path.join(tmp, 'ws'), proj = path.join(ws, 'demo');
fs.mkdirSync(path.join(root, 'runtime'), { recursive: true });
fs.writeFileSync(path.join(root, 'aci.js'), 'window.ACI={};\n');
fs.writeFileSync(path.join(root, 'runtime', 'runtime.js'), 'window.ACIRuntime={start(){}};\n');
fs.mkdirSync(path.join(proj, 'scenes'), { recursive: true });
fs.writeFileSync(path.join(proj, 'aci.project.json'), JSON.stringify({ aci: 'project', name: 'My Demo', scenes: [{ name: 'main', file: 'scenes/main.scene.json' }] }));
fs.writeFileSync(path.join(proj, 'scenes', 'main.scene.json'), '{"format":"aci-scene","v":1,"name":"main"}');

// fake runtimes
fs.mkdirSync(process.env.ACI_ELECTRON_CACHE, { recursive: true });
const fake = (plat, files) => { const z = zipWriter(path.join(process.env.ACI_ELECTRON_CACHE, `electron-v${ELECTRON_VERSION}-${plat}.zip`)); for (const [n, c] of files) z.add(n, c.padEnd(2e6 / files.length, '.'), n.endsWith('electron') || n.endsWith('.exe') ? 0o755 : 0o644); z.close(); };
fake('win32-x64', [['electron.exe', 'MZ'], ['resources/default_app.asar', 'x'], ['LICENSE', 'mit']]);
fake('linux-x64', [['electron', 'ELF'], ['resources/default_app.asar', 'x']]);
fake('darwin-arm64', [['Electron.app/Contents/MacOS/Electron', 'MACHO'], ['Electron.app/Contents/Resources/default_app.asar', 'x'], ['LICENSE', 'mit']]);

const names = (file) => readCentral(fs.readFileSync(path.join(proj, file))).map((e) => e.name);
const read = (file, name) => { const e = readCentral(fs.readFileSync(path.join(proj, file))).find((x) => x.name === name); return (e.method === 8 ? zlib.inflateRawSync(e.data()) : e.data()).toString('utf8'); };

let r = await exportDesktop(root, ws, 'demo', 'windows');
assert.equal(r.file, 'build/My-Demo-windows.zip');
let n = names(r.file);
assert.ok(n.includes('My Demo/My Demo.exe'), 'renamed exe');
assert.ok(!n.some((x) => x.includes('default_app')), 'default app dropped');
assert.ok(n.includes('My Demo/resources/app/index.html') && n.includes('My Demo/resources/app/main.js'));
assert.match(read(r.file, 'My Demo/resources/app/index.html'), /ACIRuntime\.start/);
assert.equal(JSON.parse(read(r.file, 'My Demo/resources/app/package.json')).main, 'main.js');
assert.ok(read(r.file, 'My Demo/My Demo.exe').startsWith('MZ'), 'exe bytes copied unchanged');
console.log('  ok  windows');

r = await exportDesktop(root, ws, 'demo', 'linux');
n = names(r.file);
assert.ok(n.includes('My Demo/my-demo'));
const exe = readCentral(fs.readFileSync(path.join(proj, r.file))).find((e) => e.name === 'My Demo/my-demo');
assert.equal((exe.attr >>> 16) & 0o111, 0o111, 'linux binary stays executable');
console.log('  ok  linux');

r = await exportDesktop(root, ws, 'demo', 'mac');
n = names(r.file);
assert.ok(n.includes('My Demo.app/Contents/MacOS/Electron') && n.includes('My Demo.app/Contents/Resources/app/index.html'));
console.log('  ok  mac');

await assert.rejects(exportDesktop(root, ws, 'demo', 'xbox'), /unknown target/);
console.log('  ok  unknown target');
fs.rmSync(tmp, { recursive: true, force: true });
console.log('desktop tests passed');
