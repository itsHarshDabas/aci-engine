#!/usr/bin/env node
/*
 * aci — the ACI Renderer Engine command line.
 *
 *   aci                       start the editor and open it in your browser
 *   aci start [--port=7777] [--dir=~/ACI\ Projects] [--no-open] [--host=0.0.0.0]
 *   aci new "My Game" [--template=topdown]
 *   aci build "my-game"       export one self-contained HTML file
 *   aci list                  list projects
 *   aci mcp [--agent=name]    MCP server for Claude (talks to a running editor)
 *   aci --version | --help
 */
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const argv = process.argv.slice(2);
const flags = {}, rest = [];
for (const a of argv) { const m = a.match(/^--([\w-]+)(?:=(.*))?$/); if (m) flags[m[1]] = m[2] === undefined ? true : m[2]; else if (a === '-h') flags.help = true; else if (a === '-v') flags.version = true; else rest.push(a); }
const cmd = flags.help ? 'help' : flags.version ? 'version' : (rest[0] || 'start');

const c = { dim: s => `\x1b[2m${s}\x1b[0m`, gold: s => `\x1b[33m${s}\x1b[0m`, green: s => `\x1b[32m${s}\x1b[0m`, red: s => `\x1b[31m${s}\x1b[0m`, bold: s => `\x1b[1m${s}\x1b[0m` };
const tty = process.stdout.isTTY;
const say = s => console.log(tty ? s : s.replace(/\x1b\[\d+m/g, ''));

const BANNER = `
   ${c.gold('▄▀█ █▀▀ █')}   ${c.bold('ACI Renderer Engine')} ${c.dim('v' + pkg.version)}
   ${c.gold('█▀█ █▄▄ █')}   ${c.dim('ASCII games, made easy — by you and your AI agents')}
`;

function help() {
  say(BANNER);
  say(`  ${c.bold('Usage')}
    aci                         Start the editor and open it in your browser
    aci start [options]         Same, with options
    aci new <name> [--template=id]   Create a project (templates: aci templates)
    aci build <project>         Export a project as one HTML file
    aci list                    List your projects
    aci templates               List project templates
    aci mcp [--agent=name]      Run the MCP server so Claude can build in the editor

  ${c.bold('Options')}
    --port=7777        Port (the next free one is used if it's taken)
    --dir=<folder>     Where projects live (default: ~/ACI Projects, or ACI_WORKSPACE)
    --no-open          Don't open the browser
    --host=0.0.0.0     Listen on your network (default: this computer only)
`);
}

const freePort = (start, host) => new Promise(resolve => {
  const tryPort = p => { const s = net.createServer(); s.once('error', () => tryPort(p + 1)); s.once('listening', () => s.close(() => resolve(p))); s.listen(p, host); };
  tryPort(start);
});
function openBrowser(url) {
  const cmds = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { const p = spawn(cmds[0], cmds[1], { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }); p.on('error', () => say(c.dim('  (could not open a browser — open the link above yourself)'))); p.unref(); }
  catch (e) { say(c.dim('  (could not open a browser — open the link above yourself)')); }
}
async function loadServer() { return import(pathToFileURL(path.join(ROOT, 'server', 'index.mjs')).href); }
// one-shot commands run an in-process server on a random port and use its API
async function withServer(fn) {
  const { start } = await loadServer();
  const s = await start({ port: 0, workspace: flags.dir, quiet: true });
  try { return await fn(s.url, s); } finally { await s.close(); }
}
const api = async (base, p, opts = {}) => { const r = await fetch(base + p, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = t; } if (!r.ok) throw new Error((j && j.error) || t || r.statusText); return j; };

async function main() {
  if (cmd === 'help') return help();
  if (cmd === 'version') return say(pkg.version);

  if (cmd === 'start' || cmd === 'open' || cmd === 'editor') {
    const { start } = await loadServer();
    const host = flags.host || process.env.ACI_HOST || '127.0.0.1';
    const port = await freePort(+(flags.port || process.env.ACI_PORT || 7777), host);
    const s = await start({ port, host, workspace: flags.dir });
    say(BANNER);
    say(`   ${c.green('●')} Editor running at ${c.bold(c.gold(s.url))}`);
    say(`   ${c.dim('Projects folder:')} ${s.workspace}`);
    say(`   ${c.dim('Agents:')} POST ${s.url}/api/command   ${c.dim('·')}   claude mcp add aci -- npx aci-engine mcp`);
    say(c.dim('\n   Press Ctrl+C to stop.\n'));
    if (!flags['no-open'] && !process.env.ACI_NO_OPEN) openBrowser(s.url + '/editor/' + (rest[1] ? '#project=' + encodeURIComponent(rest[1]) : ''));
    const stop = () => { say(c.dim('\n   Stopping ACI. Your projects are saved in ' + s.workspace)); s.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 1500); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    return;
  }

  if (cmd === 'new' || cmd === 'create') {
    const name = rest.slice(1).join(' ');
    if (!name) { say(c.red('  Give the project a name: aci new "My Game"')); process.exitCode = 1; return; }
    return withServer(async base => {
      const r = await api(base, '/api/projects', { method: 'POST', body: JSON.stringify({ name, template: flags.template || 'empty' }) });
      const { workspace } = await api(base, '/api/info');
      say(`  ${c.green('✓')} Created ${c.bold(name)} in ${path.join(workspace, r.id)}`);
      say(`    Open it with: ${c.gold('aci start ' + JSON.stringify(r.id).replace(/"/g, ''))}`);
    });
  }

  if (cmd === 'list' || cmd === 'ls') {
    return withServer(async base => {
      const list = await api(base, '/api/projects');
      if (!list.length) return say(c.dim('  No projects yet. Create one with: aci new "My Game"'));
      for (const p of list) say(`  ${c.gold(p.id.padEnd(24))} ${p.name}  ${c.dim(new Date(p.modified).toLocaleString())}`);
    });
  }

  if (cmd === 'templates') {
    return withServer(async base => { for (const t of await api(base, '/api/templates')) say(`  ${c.gold(t.id.padEnd(16))} ${t.name} ${c.dim('— ' + (t.description || ''))}`); });
  }

  if (cmd === 'build' || cmd === 'export') {
    const id = rest[1];
    if (!id) { say(c.red('  Which project? aci build <project>  (see: aci list)')); process.exitCode = 1; return; }
    return withServer(async base => {
      const r = await api(base, '/api/projects/' + encodeURIComponent(id) + '/build', { method: 'POST', body: '{}' });
      say(`  ${c.green('✓')} Built ${c.bold(r.file)} ${c.dim('(' + Math.round((r.size || 0) / 1024) + ' KB)')}`);
      say(c.dim('    It is a single HTML file: open it in any browser, or upload it anywhere.'));
    });
  }

  if (cmd === 'mcp') {
    process.argv = [process.argv[0], path.join(ROOT, 'bridge', 'mcp.mjs'), ...argv.slice(1)];
    return import(pathToFileURL(path.join(ROOT, 'bridge', 'mcp.mjs')).href);
  }

  say(c.red(`  Unknown command "${cmd}".`)); help(); process.exitCode = 1;
}
main().catch(e => { say(c.red('  ' + (e.code === 'EADDRINUSE' ? 'That port is busy. Try --port=8080' : e.message))); process.exitCode = 1; });
