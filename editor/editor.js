/* ACI Editor shell: launcher, docks, hierarchy, inspector, scene view, assets, console, agents, play mode.
   Plugins (editor/panels/*.js) use window.ACIEditor; see docs/EDITOR-CONTRACT.md. */
(function () {
  'use strict';

  // ================================================================ helpers
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, a, ...kids) => {
    const el = document.createElement(tag);
    for (const k in a || {}) {
      const v = a[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v; else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(9).forEach(c => c != null && c !== false && el.append(c.nodeType ? c : document.createTextNode(c)));
    return el;
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => 'e' + Math.random().toString(36).slice(2, 8);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const store = { get(k, d) { try { const v = localStorage.getItem('aci.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('aci.' + k, JSON.stringify(v)); } catch (e) {} } };
  const isTyping = ev => ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName) || (ev.target && ev.target.isContentEditable);
  const fileUrl = (id, p) => '/api/projects/' + encodeURIComponent(id) + '/file/' + p.split('/').map(encodeURIComponent).join('/');

  async function api(path, opts = {}) {
    const o = Object.assign({}, opts);
    if (o.json !== undefined) { o.body = JSON.stringify(o.json); o.headers = Object.assign({ 'content-type': 'application/json' }, o.headers); delete o.json; }
    const r = await fetch(path, o), t = await r.text();
    let j; try { j = JSON.parse(t); } catch (e) { j = t; }
    if (!r.ok) throw new Error((j && j.error) || t || r.statusText);
    return j;
  }
  const rawText = async (path) => { const r = await fetch(path); if (!r.ok) throw new Error(path + ': ' + r.status); return r.text(); };

  function toast(msg, kind = '', ms = 3200) {
    const el = h('div', { class: 'toast ' + kind }); if (msg.nodeType) el.append(msg); else el.textContent = msg;
    $('#toasts').append(el); setTimeout(() => el.remove(), ms); return el;
  }
  function modal(title, body, buttons = []) {
    return new Promise(resolve => {
      const close = v => { scrim.remove(); removeEventListener('keydown', key, true); resolve(v); };
      const key = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(null); } if (ev.key === 'Enter' && !/TEXTAREA/.test(ev.target.tagName)) { const p = buttons.find(b => b.primary); if (p) { ev.preventDefault(); close(p.value()); } } };
      const scrim = h('div', { class: 'scrim', onmousedown: ev => { if (ev.target === scrim) close(null); } },
        h('div', { class: 'modal', role: 'dialog' },
          h('header', {}, h('h2', {}, title), h('button', { class: 'btn ghost icon', onclick: () => close(null), title: 'Close' }, '✕')),
          h('div', { class: 'body' }, body),
          buttons.length ? h('footer', {}, buttons.map(b => h('button', { class: 'btn ' + (b.primary ? 'primary' : '') + (b.danger ? ' danger' : ''), onclick: () => close(b.value ? b.value() : b.label) }, b.label))) : null));
      document.body.append(scrim); addEventListener('keydown', key, true);
      const f = scrim.querySelector('input,textarea,select'); f && setTimeout(() => { f.focus(); f.select && f.select(); }, 20);
    });
  }
  async function ask(title, label, value = '', okLabel = 'OK') {
    const inp = h('input', { class: 'field', value });
    return modal(title, [h('label', { class: 'muted' }, label), inp], [{ label: 'Cancel', value: () => null }, { label: okLabel, primary: true, value: () => inp.value.trim() || null }]);
  }
  const confirmBox = (title, text, okLabel = 'Delete') => modal(title, h('p', { style: 'margin:0' }, text), [{ label: 'Cancel', value: () => false }, { label: okLabel, primary: true, danger: true, value: () => true }]);
  let openMenu = null;
  function menu(x, y, items) {
    closeMenu();
    const m = h('div', { class: 'menu' }, items.map(it => it === '-' ? h('hr') : it.label && !it.run ? h('div', { class: 'label' }, it.label) :
      h('button', { onclick: () => { closeMenu(); it.run(); }, disabled: it.disabled }, it.icon ? h('span', { class: 'mono muted', style: 'width:14px' }, it.icon) : null, it.text, it.kbd ? h('kbd', {}, it.kbd) : null)));
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 6) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
    openMenu = m; setTimeout(() => addEventListener('mousedown', outside, true), 0);
  }
  function outside(ev) { if (openMenu && !openMenu.contains(ev.target)) closeMenu(); }
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; removeEventListener('mousedown', outside, true); } }
  const menuAt = (el, items) => { const r = el.getBoundingClientRect(); menu(r.left, r.bottom + 4, items); };

  // ascii preview of a sprite, coloured
  function spritePre(spr, maxW = 40, maxH = 14, anim) {
    const pre = h('pre');
    if (!spr || !spr.anims) { pre.textContent = '?'; return pre; }
    const a = spr.anims[anim] || spr.anims[Object.keys(spr.anims)[0]] || [];
    const f = a[0]; if (!f) return pre;
    let html = '';
    for (let y = 0; y < Math.min(f.h, maxH); y++) {
      for (let x = 0; x < Math.min(f.w, maxW); x++) {
        const c = f.cells[y * f.w + x] || { ch: ' ' };
        html += c.ch === ' ' && !c.bg ? ' ' : '<span style="color:' + c.fg + (c.bg ? ';background:' + c.bg : '') + '">' + esc(c.ch) + '</span>';
      }
      html += '\n';
    }
    pre.innerHTML = html; return pre;
  }
  const glyphOf = spr => { try { const f = spr.anims[Object.keys(spr.anims)[0]][0]; const c = f.cells.find(c => c.ch !== ' '); return c ? c.ch : '·'; } catch (e) { return '·'; } };

  // ================================================================ plugin registry + editor services
  const registry = { panels: [], tools: [], assetEditors: [], importers: [], inspectors: [] };
  const listeners = {};
  const ed = {
    version: '0.3',
    project: null, projectId: null, game: null, scene: null, sceneName: null, selection: null, assets: {},
    files: [], scenes: {}, scripts: {}, assetText: {},
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return ed; },
    off(ev, fn) { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); },
    emit(ev, data) { (listeners[ev] || []).forEach(f => { try { f(data); } catch (e) { console.error(e); log('Plugin error on "' + ev + '": ' + e.message, 'error'); } }); },
    has: name => !!(window.ACI && ACI[name]),
    select: e => select(e),
    markDirty: () => markDirty(),
    log: (msg, level) => log(msg, level),
    refreshAssets: () => loadFiles().then(() => { rebuildGame(); renderAll(); }),
    openAsset: p => openFile(p),
    fs: {
      read: p => rawText(fileUrl(ed.projectId, p)),
      write: async (p, text) => { await api(fileUrl(ed.projectId, p), { method: 'PUT', body: text }); await loadFiles(); renderAssets(); },
      list: async () => (await api('/api/projects/' + encodeURIComponent(ed.projectId) + '/tree')),
      remove: async p => { await api(fileUrl(ed.projectId, p), { method: 'DELETE' }); await loadFiles(); renderAssets(); },
    },
    undo: { push: (label, undo, redo) => pushUndo({ label, undo, redo }), undo: () => undoStep(), redo: () => redoStep() },
    play: () => play(), stop: () => stop(), save: () => saveAll(),
    commit: (label, fn) => commit(label, fn),
    ui: { ask: (title, label, value, ok) => ask(title, label, value, ok), confirm: (title, text, ok) => confirmBox(title, text, ok), toast: (msg, kind, ms) => toast(msg, kind, ms), menu: (x, y, items) => menu(x, y, items) },
    ai: {
      status: () => api('/api/ai/status'),
      // generate({kind:'sprite'|'frames'|'json', prompt, w, h, frames, hint}) -> parsed JSON (throws on failure)
      async generate(req) { const r = await api('/api/ai/generate', { method: 'POST', json: req }); if (!r.ok) throw new Error(r.error || 'generation failed'); return r.json; },
      // a ready-made dialog: asks for a description, shows progress, returns the JSON (or null if cancelled)
      dialog: (opts) => aiDialog(opts),
      // turn {palette, anims|frames} JSON from generate() into an .aci.json text the engine loads
      toAssetText: (json, name) => aiToAsset(json, name),
    },
  };
  window.ACIEditor = {
    ed,
    registerPanel: p => { registry.panels.push(p); if (ui.ready) addPanelTab(p); },
    registerSceneTool: t => { registry.tools.push(t); if (ui.ready) renderSceneTools(); },
    registerAssetEditor: a => registry.assetEditors.push(a),
    registerImporter: i => registry.importers.push(i),
    registerInspector: i => registry.inspectors.push(i),
  };

  // ================================================================ state
  const ui = { ready: false, tool: 'select', centre: 'scene', tabs: [], dirty: false, saving: false, playing: null, paused: false, cursor: null, hover: null, drag: null, pan: null, space: false, clipboard: null, showGrid: store.get('grid', true) };
  const undoStack = [], redoStack = [];
  const logs = [];

  function log(msg, level = 'info', who) {
    const entry = { t: new Date(), msg: String(msg), level, who };
    logs.push(entry); if (logs.length > 500) logs.shift();
    renderConsoleEntry(entry);
    if (level === 'error') { const c = dockTab('console'); if (c && !c.seen) badge('console', true); }
  }

  // ================================================================ launcher
  let info = {};
  async function showLauncher(section = 'projects') {
    document.title = 'ACI Engine';
    $('#app').hidden = true; $('#launcher').hidden = false; stop();
    document.querySelectorAll('#launcher nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === section));
    const main = $('#launchMain'); main.textContent = '';
    if (section === 'learn') return renderLearn(main);
    if (section === 'agents') return renderAgentsPage(main);
    main.append(h('div', { class: 'hero-row' },
      h('div', {}, h('h1', {}, 'Your games'), h('p', {}, 'Everything is drawn with text characters. Pick a project or start a new one.')),
      h('div', { style: 'display:flex;gap:8px' }, h('button', { class: 'btn', onclick: importProject }, 'Open demo world'), h('button', { class: 'btn primary', onclick: newProjectDialog }, '+ New project'))));
    let list = [];
    try { list = await api('/api/projects'); } catch (e) { main.append(h('div', { class: 'empty-note' }, 'Could not reach the ACI server: ' + e.message)); return; }
    let thumbs = {}; try { thumbs = await api('/api/thumbs'); } catch (e) {}
    list.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    main.append(h('div', { class: 'section-title' }, list.length ? 'Recent projects' : 'Start here'));
    const cards = h('div', { class: 'cards' });
    cards.append(h('div', { class: 'card new', onclick: newProjectDialog }, h('i', {}, '+'), h('b', {}, 'New project'), h('span', { class: 'muted' }, 'Start from a template')));
    list.forEach(p => {
      const more = h('button', { class: 'btn ghost icon more', title: 'More', onclick: ev => { ev.stopPropagation(); menuAt(more, [
        { text: 'Open', icon: '↗', run: () => go(p.id) },
        { text: 'Play in new tab', icon: '▶', run: () => open('/play/' + encodeURIComponent(p.id) + '/', '_blank') },
        { text: 'Rename…', icon: '✎', run: async () => { const n = await ask('Rename project', 'Name', p.name, 'Rename'); if (n) { await api('/api/projects/' + encodeURIComponent(p.id) + '/rename', { method: 'POST', json: { to: n } }); showLauncher(); } } },
        { text: 'Duplicate', icon: '⧉', run: async () => { await api('/api/projects/' + encodeURIComponent(p.id) + '/duplicate', { method: 'POST' }); toast('Duplicated ' + p.name, 'ok'); showLauncher(); } },
        { text: 'Build HTML', icon: '⇩', run: () => build(p.id) },
        '-',
        { text: 'Delete…', icon: '×', run: async () => { if (await confirmBox('Delete "' + p.name + '"?', 'The folder is moved to the .trash folder inside your projects folder, so you can get it back.')) { await api('/api/projects/' + encodeURIComponent(p.id), { method: 'DELETE' }); toast('Moved to trash', 'ok'); showLauncher(); } } },
      ]); } }, '⋯');
      cards.append(h('div', { class: 'card', onclick: () => go(p.id), title: p.id },
        h('div', { class: 'thumb' }, thumbs[p.id] ? h('img', { src: thumbs[p.id], alt: '' }) : thumbArt(p.name + (p.template || ''))),
        h('div', { class: 'meta' }, h('b', {}, p.name), h('span', {}, (p.template ? p.template + ' · ' : '') + p.scenes + ' scene' + (p.scenes === 1 ? '' : 's') + ' · ' + ago(p.modified))), more));
    });
    main.append(cards);
    main.append(h('div', { class: 'section-title' }, 'Quick start'),
      h('div', { class: 'cards' },
        quick('1', 'Make a project', 'Pick a template. You get a folder on your disk with scenes, sprites and scripts.'),
        quick('2', 'Build the scene', 'Add characters from the Hierarchy, paint tiles, pick a background in the Inspector.'),
        quick('3', 'Give it life', 'Add Behaviours like "Top-down move" or "Wander". No code needed.'),
        quick('4', 'Play and share', 'Press ▶ to play. Build makes one HTML file you can send to anyone.')));
  }
  const quick = (n, t, d) => h('div', { class: 'card', style: 'cursor:default' }, h('div', { class: 'meta' }, h('b', {}, h('span', { style: 'color:var(--accent);font-family:var(--mono)' }, n + '  '), t), h('span', {}, d)));
  const ago = d => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(d).toLocaleDateString(); };
  function thumbArt(seed) {
    let n = 0; for (const c of seed) n = (n * 31 + c.charCodeAt(0)) >>> 0;
    const rnd = () => ((n = (n * 1103515245 + 12345) >>> 0) / 4294967296);
    const W = 46, H = 12, palette = [['#2f7d46', '#3a8a4c', ',"\'.'], ['#1e4f8f', '#2d6fd0', '~≈-'], ['#6b6f85', '#8a8fa8', '.:·'], ['#b08a4a', '#d9b36a', '░.,']][Math.floor(rnd() * 4)];
    const sky = rnd() < 0.5; let html = '';
    const hx = Math.floor(rnd() * (W - 8)) + 4, hy = Math.floor(rnd() * 5) + 4;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x === hx && y === hy) { html += '<span style="color:#ffd24a">@</span>'; continue; }
        const r = rnd();
        if (sky && y < 3) html += r < 0.05 ? '<span style="color:#8490ae">*</span>' : ' ';
        else html += r < 0.35 ? '<span style="color:' + (r < 0.15 ? palette[1] : palette[0]) + '">' + palette[2][Math.floor(rnd() * palette[2].length)] + '</span>' : r > 0.985 ? '<span style="color:#9a9aa4">o</span>' : ' ';
      }
      html += '\n';
    }
    const pre = h('pre'); pre.innerHTML = html; return pre;
  }
  async function newProjectDialog() {
    let tpls = [];
    try { tpls = await api('/api/templates'); } catch (e) {}
    if (!tpls.find(t => t.id === 'empty')) tpls.unshift({ id: 'empty', name: 'Empty', description: 'A blank 80×30 scene. Start from nothing.' });
    let pick = tpls.length > 1 ? tpls[1].id : 'empty';
    const name = h('input', { class: 'field', value: 'My Game', placeholder: 'Project name' });
    const grid = h('div', { class: 'tpl-grid' });
    const draw = () => { grid.textContent = ''; tpls.forEach(t => grid.append(h('button', { class: 'tpl', 'aria-pressed': t.id === pick, onclick: () => { pick = t.id; draw(); }, ondblclick: () => { pick = t.id; done(); } }, h('b', {}, t.name), h('span', {}, t.description || ''), (t.tags || []).length ? h('span', { style: 'color:var(--faint);font-size:11px' }, t.tags.join(' · ')) : null))); };
    draw();
    let done;
    const p = modal('New project', [h('label', { class: 'muted' }, 'Name'), name, h('label', { class: 'muted' }, 'Template'), grid,
      h('div', { class: 'muted', style: 'font-size:12px' }, 'Saved as a folder in ' + (info.workspace || 'your projects folder') + '.')],
      [{ label: 'Cancel', value: () => null }, { label: 'Create project', primary: true, value: () => ({ name: name.value.trim() || 'My Game', template: pick }) }]);
    done = () => { const b = document.querySelector('.modal footer .btn.primary'); b && b.click(); };
    const r = await p; if (!r) return;
    try { const res = await api('/api/projects', { method: 'POST', json: r }); toast('Created ' + r.name, 'ok'); go(res.id); }
    catch (e) { toast('Could not create: ' + e.message, 'err', 6000); }
  }
  // the classic demo world as a starter project (uses the bundled pond environment)
  async function importProject() {
    try {
      const res = await api('/api/projects', { method: 'POST', json: { name: 'Demo world', template: 'empty' } });
      const id = res.id, man = await api('/api/projects/' + encodeURIComponent(id));
      const scene = { format: 'aci-scene', v: 1, name: 'main', world: { cols: 140, rows: 50 }, environment: { preset: 'pond', params: {} }, tilemaps: [], camera: { follow: 'Hero' }, gravity: 0,
        entities: [
          { id: uid(), name: 'Hero', x: 30, y: 20, z: 1, sprite: ' o \n/|\\\n/ \\', spriteOpts: { color: '#ffd24a' }, reflect: true, tags: ['player'], behaviours: [{ name: 'TopDownMove', params: { speed: 14 } }, { name: 'CameraFollow', params: {} }] },
          { id: uid(), name: 'Villager', x: 50, y: 24, z: 1, sprite: ' @ \n/|\\\n/ \\', spriteOpts: { color: '#7fe3ff' }, reflect: true, tags: ['npc'], behaviours: [{ name: 'Wander', params: {} }, { name: 'SayOnClick', params: { text: 'Lovely pond, isn\'t it?' } }] },
          { id: uid(), name: 'Coin', x: 40, y: 16, z: 1, sprite: '$', spriteOpts: { color: '#ffd24a' }, trigger: true, tags: ['coin'], behaviours: [{ name: 'Collectible', params: {} }, { name: 'Bob', params: {} }] },
          { id: uid(), name: 'Sign', x: 24, y: 14, z: 0, sprite: '┌─────────┐\n│ WELCOME │\n└────┬────┘\n     │', spriteOpts: { color: '#c09050' }, solid: true, static: true },
        ] };
      await api(fileUrl(id, (man.scenes[0] && man.scenes[0].file) || 'scenes/main.scene.json'), { method: 'PUT', body: JSON.stringify(scene, null, 1) });
      go(id);
    } catch (e) { toast('Could not create the demo: ' + e.message, 'err', 6000); }
  }
  function renderLearn(main) {
    main.append(h('div', { class: 'hero-row' }, h('div', {}, h('h1', {}, 'Learn ACI'), h('p', {}, 'Five ideas. That is the whole engine.'))));
    const item = (t, d) => h('div', { class: 'card', style: 'cursor:default' }, h('div', { class: 'meta' }, h('b', {}, t), h('span', {}, d)));
    main.append(h('div', { class: 'cards' },
      item('Scenes', 'A level or a screen. A scene has a size in characters, a background (environment), tile layers and entities.'),
      item('Entities', 'Anything in the scene: the player, a coin, a tree. Each one has a sprite and a position.'),
      item('Sprites', 'Drawings made of characters and colours, with animations. Paint them, convert an image or GIF, or ask an AI agent.'),
      item('Behaviours', 'Ready-made logic you add in the Inspector: movement, following, collecting, doors. Write your own in Scripts.'),
      item('Build', 'One click turns the project into a single HTML file. It runs in any browser, offline.')));
    main.append(h('div', { class: 'section-title' }, 'Keyboard'),
      h('div', { class: 'card', style: 'cursor:default' }, h('div', { class: 'meta', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px' },
        [['Ctrl S', 'Save'], ['Ctrl Z / Ctrl Y', 'Undo / redo'], ['Ctrl P', 'Play'], ['Esc', 'Stop'], ['Delete', 'Delete selected'], ['Ctrl D', 'Duplicate'], ['Arrows', 'Nudge (Shift = 5)'], ['F', 'Frame selected'], ['V / H / B', 'Select / Pan / Tiles'], ['Wheel', 'Zoom'], ['Space + drag', 'Pan']].map(([k, d]) => h('span', {}, h('kbd', {}, k), ' ', d)))));
    main.append(h('div', { class: 'section-title' }, 'More'), h('p', {}, h('a', { href: '/examples/index.html', target: '_blank', style: 'color:var(--accent)' }, 'Examples'), ' · ', h('a', { href: '/index.html', target: '_blank', style: 'color:var(--accent)' }, 'Engine demo'), ' · ', h('a', { href: '/docs/GETTING-STARTED.md', target: '_blank', style: 'color:var(--accent)' }, 'Getting started (code)')));
  }
  function renderAgentsPage(main) {
    main.append(h('div', { class: 'hero-row' }, h('div', {}, h('h1', {}, 'AI agents'), h('p', {}, 'Claude and other agents can build in the editor with you, at the same time.'))));
    main.append(agentHowTo());
  }
  function agentHowTo() {
    const base = location.origin;
    const row = (title, code) => h('div', { style: 'margin:0 0 14px' }, h('div', { class: 'muted', style: 'margin-bottom:4px' }, title),
      h('div', { style: 'display:flex;gap:6px' }, h('input', { class: 'field mono', readonly: true, value: code, onclick: e => e.target.select() }), h('button', { class: 'btn', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(code); toast('Copied', 'ok', 1500); } }, 'Copy')));
    return h('div', { class: 'pane-body', style: 'max-width:720px' },
      row('Claude Code: add the ACI tools (run once, in a terminal)', 'claude mcp add aci -- npx aci-engine mcp'),
      row('Any agent: send a command over HTTP', `curl -X POST ${base}/api/command -H "content-type: application/json" -d '{"op":"spawn","art":"@","name":"Bot","agent":"bot"}'`),
      row('See what the scene looks like, as text', `curl ${base}/api/look`),
      h('p', { class: 'muted' }, 'When a project is open, agent commands change the scene you are editing. Everything they add shows up in the Hierarchy and can be undone. When the game is playing in a separate tab, commands go to that game instead.'));
  }

  // ================================================================ routing
  function go(id, scene) { location.hash = 'project=' + encodeURIComponent(id) + (scene ? '&scene=' + encodeURIComponent(scene) : ''); }
  async function route() {
    const q = new URLSearchParams(location.hash.slice(1));
    const id = q.get('project');
    if (!id) { if (ed.projectId && ui.dirty) await saveAll(); closeProject(); return showLauncher(q.get('page') || 'projects'); }
    if (id !== ed.projectId) { if (ed.projectId && ui.dirty) await saveAll(); await openProject(id, q.get('scene')); }
    else if (q.get('scene') && q.get('scene') !== ed.sceneName) switchScene(q.get('scene'));
  }

  // ================================================================ project load / save
  async function loadFiles() {
    const id = ed.projectId;
    ed.files = await api('/api/projects/' + encodeURIComponent(id) + '/tree');
    const files = ed.files.filter(f => f.type === 'file');
    ed.assets = {}; ed.assetText = {}; ed.cutscenes = {};
    await Promise.all(files.map(async f => {
      let m;
      if ((m = f.path.match(/^assets\/(.+)\.aci\.json$/))) {
        try { const t = await rawText(fileUrl(id, f.path)); ed.assetText[m[1]] = t; ed.assets[m[1]] = ACI.fromAsset(t); }
        catch (e) { log('Asset ' + f.path + ' could not be read: ' + e.message, 'warn'); }
      } else if ((m = f.path.match(/^cutscenes\/(.+)\.cutscene\.json$/))) {
        try { ed.cutscenes[m[1]] = await rawText(fileUrl(id, f.path)); } catch (e) {}
      } else if ((m = f.path.match(/^scripts\/(.+)\.js$/)) && !(m[1] in ed.scripts)) {
        try { ed.scripts[m[1]] = await rawText(fileUrl(id, f.path)); runScript(m[1], ed.scripts[m[1]]); } catch (e) {}
      }
    }));
    ed.emit('assets', ed.assets);
  }
  // user scripts register behaviours; run them in the editor so the Inspector knows their parameters
  function runScript(name, code) {
    try { new Function('ACI', 'game', code + '\n//# sourceURL=scripts/' + name + '.js')(ACI, ed.game || {}); }
    catch (e) { log('scripts/' + name + '.js: ' + e.message, 'error'); }
  }
  const sceneFile = name => { const s = (ed.project.scenes || []).find(s => s.name === name); return (s && s.file) || 'scenes/' + name + '.scene.json'; };
  const emptyScene = name => ({ format: 'aci-scene', v: 1, name, world: { cols: 80, rows: 30 }, environment: { preset: 'none', params: {} }, tilemaps: [], entities: [], camera: {}, gravity: 0 });
  function normScene(doc, name) {
    doc = doc && typeof doc === 'object' ? doc : emptyScene(name);
    doc.name = doc.name || name; doc.world = doc.world || { cols: 80, rows: 30 };
    doc.environment = doc.environment || { preset: 'none', params: {} }; doc.environment.params = doc.environment.params || {};
    doc.tilemaps = doc.tilemaps || []; doc.camera = doc.camera || {};
    if (doc.entities && doc.entities.format === 'aci-world') doc.entities = fromSnapshot(doc.entities);
    doc.entities = Array.isArray(doc.entities) ? doc.entities : [];
    doc.entities.forEach(d => { d.id = d.id || uid(); d.name = d.name || 'Entity'; d.x = +d.x || 0; d.y = +d.y || 0; d.behaviours = d.behaviours || []; d.tags = d.tags || []; });
    return doc;
  }
  function fromSnapshot(snap) { // modules/project.js style -> list style
    return (snap.entities || []).map(e => ({ id: uid(), name: e.name || 'Entity', x: e.x, y: e.y, z: e.z || 0, sprite: e.asset ? { asset: e.asset } : e.sprite || '?', label: e.label || null, tags: e.tags || [] }));
  }

  async function openProject(id, sceneName) {
    closeProject();
    try { ed.project = await api('/api/projects/' + encodeURIComponent(id)); }
    catch (e) { toast('Could not open project: ' + e.message, 'err', 6000); location.hash = ''; return; }
    ed.projectId = id; ed.scripts = {}; ed.scenes = {};
    $('#launcher').hidden = true; $('#app').hidden = false;
    document.title = ed.project.name + ' · ACI Editor';
    $('#projName').textContent = ed.project.name;
    if (!ui.ready) initShell();
    createEditGame(); renderSceneTools();
    await loadFiles();
    for (const s of ed.project.scenes || []) {
      try { ed.scenes[s.name] = normScene(await api(fileUrl(id, s.file)), s.name); } catch (e) { ed.scenes[s.name] = normScene(null, s.name); log('Scene "' + s.name + '" could not be read, starting it empty: ' + e.message, 'warn'); }
    }
    if (!Object.keys(ed.scenes).length) { ed.scenes.main = emptyScene('main'); ed.project.scenes = [{ name: 'main', file: 'scenes/main.scene.json' }]; ed.project.startScene = 'main'; markDirty(); }
    undoStack.length = redoStack.length = 0;
    const start = sceneName && ed.scenes[sceneName] ? sceneName : ed.scenes[ed.project.startScene] ? ed.project.startScene : Object.keys(ed.scenes)[0];
    switchScene(start, true);
    ed.emit('project', ed.project);
    setDirty(false);
    log('Opened ' + ed.project.name + ' (' + id + ')', 'ok');
    showTips();
    setTimeout(saveThumb, 1500);
  }
  function closeProject() {
    stop();
    ui.tabs.filter(t => t.kind === 'file').forEach(t => closeTab(t, true));
    if (ed.game) { try { ed.game.bridge && ed.game.bridge.close(); ed.game.destroy(); } catch (e) {} ed.game = null; }
    ed.project = ed.projectId = ed.scene = ed.sceneName = ed.selection = null;
  }

  function switchScene(name, initial) {
    if (!ed.scenes[name]) return;
    ed.sceneName = name; ed.scene = ed.scenes[name]; ed.selection = null;
    rebuildGame(true);
    renderSceneSel();
    if (!initial) history.replaceState(null, '', '#project=' + encodeURIComponent(ed.projectId) + '&scene=' + encodeURIComponent(name));
    ed.emit('scene', ed.scene); ed.emit('select', null);
    renderAll();
  }

  function markDirty() { setDirty(true); autosave(); renderStatus(); }
  function setDirty(v) { ui.dirty = v; const s = $('#saveState'); if (s) s.innerHTML = v ? '<span class="dirty-dot"></span> Unsaved' : ui.savedAt ? 'Saved' : ''; }
  const autosave = debounce(() => { if (ui.dirty && store.get('autosave', true)) saveAll(true); }, 1500);
  async function saveAll(quiet) {
    if (!ed.projectId || ui.saving) return;
    ui.saving = true; $('#saveState').textContent = 'Saving…';
    const id = ed.projectId;
    try {
      for (const t of ui.tabs.filter(t => t.kind === 'file' && t.handle && t.handle.dirty && t.handle.dirty())) await saveTab(t);
      await api('/api/projects/' + encodeURIComponent(id), { method: 'PUT', json: ed.project });
      for (const name in ed.scenes) await api(fileUrl(id, sceneFile(name)), { method: 'PUT', body: JSON.stringify(ed.scenes[name], null, 1) });
      ui.savedAt = Date.now(); setDirty(false);
      saveThumb();
      if (!quiet) toast('Saved', 'ok', 1400);
    } catch (e) { setDirty(true); toast('Save failed: ' + e.message, 'err', 6000); log('Save failed: ' + e.message, 'error'); }
    ui.saving = false;
  }
  // a small picture of the scene for the project launcher (stored as a data URL in the project folder)
  const saveThumb = debounce(() => {
    const g = ed.game; if (!g || !g.canvas || !ed.projectId) return;
    try {
      const c = document.createElement('canvas'), W = 480, H = 240; c.width = W; c.height = H;
      const x = c.getContext('2d'); x.fillStyle = '#070a12'; x.fillRect(0, 0, W, H);
      const sw = g.canvas.width, sh = g.canvas.height, k = Math.max(W / sw, H / sh);
      x.drawImage(g.canvas, (W - sw * k) / 2, (H - sh * k) / 2, sw * k, sh * k);
      api(fileUrl(ed.projectId, '.aci/thumbnail.txt'), { method: 'PUT', body: c.toDataURL('image/jpeg', 0.8) }).catch(() => {});
    } catch (e) {}
  }, 800);
  async function build(id = ed.projectId) {
    try {
      if (id === ed.projectId) await saveAll(true);
      const t = toast('Building…', '', 20000);
      const r = await api('/api/projects/' + encodeURIComponent(id) + '/build', { method: 'POST', json: {} });
      t.remove();
      toast(h('div', {}, h('b', {}, 'Build ready'), h('div', { class: 'muted', style: 'font-size:12px;word-break:break-all' }, r.file + ' · ' + Math.round((r.size || 0) / 1024) + ' KB'),
        h('div', { style: 'margin-top:6px;display:flex;gap:6px' }, h('a', { class: 'btn', href: fileUrl(id, 'build/index.html'), target: '_blank' }, 'Open build'), h('a', { class: 'btn', href: fileUrl(id, 'build/index.html'), download: id + '.html' }, 'Download'))), 'ok', 12000);
      log('Built ' + r.file, 'ok');
    } catch (e) { toast('Build failed: ' + e.message, 'err', 8000); log('Build failed: ' + e.message, 'error'); }
  }
  // desktop app: the same one-file build wrapped in a small app runtime (downloaded once, then cached)
  async function buildDesktop(target, label, id = ed.projectId) {
    let t;
    try {
      if (id === ed.projectId) await saveAll(true);
      t = toast(h('div', {}, h('b', {}, 'Making the ' + label + ' app…'), h('div', { class: 'muted', style: 'font-size:12px' }, 'The first time downloads the app runtime (about 100 MB). Later builds take seconds.')), '', 600000);
      const r = await api('/api/projects/' + encodeURIComponent(id) + '/export', { method: 'POST', json: { target } });
      t.remove();
      if (!r.ok) throw new Error(r.error || 'export failed');
      const fname = r.file.split('/').pop();
      toast(h('div', {}, h('b', {}, label + ' app ready'), h('div', { class: 'muted', style: 'font-size:12px;overflow-wrap:anywhere' }, r.file + ' · ' + Math.round(r.size / 1048576) + ' MB. Unzip it and run the app; README.txt inside explains the first launch.'),
        h('div', { style: 'margin-top:6px;display:flex;gap:6px' }, h('a', { class: 'btn primary', href: fileUrl(id, r.file), download: fname }, 'Download .zip'))), 'ok', 20000);
      log('Exported ' + r.file, 'ok');
    } catch (e) { t && t.remove(); toast('Export failed: ' + e.message, 'err', 10000); log('Export failed: ' + e.message, 'error'); }
  }
  function buildMenu(ev) {
    const r = (ev && ev.currentTarget || $('#buildBtn')).getBoundingClientRect();
    menu(r.right - 260, r.bottom + 4, [
      { label: 'Export your game' },
      { icon: '◱', text: 'Web page (one HTML file)', run: () => build() },
      '-',
      { label: 'Desktop app' },
      { icon: '⊞', text: 'Windows (.exe)', run: () => buildDesktop('windows', 'Windows') },
      { icon: '⌘', text: 'macOS (Apple Silicon)', run: () => buildDesktop('mac', 'macOS') },
      { icon: '⌘', text: 'macOS (Intel)', run: () => buildDesktop('mac-x64', 'macOS Intel') },
      { icon: '◆', text: 'Linux', run: () => buildDesktop('linux', 'Linux') },
    ]);
  }

  // ================================================================ undo
  function pushUndo(entry) { undoStack.push(entry); if (undoStack.length > 200) undoStack.shift(); redoStack.length = 0; markDirty(); }
  function undoStep() { const e = undoStack.pop(); if (!e) return toast('Nothing to undo', '', 1200); try { e.undo(); } catch (err) { console.error(err); } redoStack.push(e); markDirty(); renderAll(); toast('Undo: ' + e.label, '', 1200); }
  function redoStep() { const e = redoStack.pop(); if (!e) return; try { e.redo(); } catch (err) { console.error(err); } undoStack.push(e); markDirty(); renderAll(); toast('Redo: ' + e.label, '', 1200); }
  // snapshot-based change of the current scene; restores keep the same scene object so plugins' references stay valid
  function commit(label, fn, opts = {}) {
    const name = ed.sceneName, before = JSON.stringify(ed.scene), selId = ed.selection && ed.selection.id;
    fn(ed.scene);
    const after = JSON.stringify(ed.scene);
    if (before === after) return;
    const restore = (json, sel) => { if (!ed.scenes[name]) return; if (ed.sceneName !== name) switchScene(name); const s = ed.scenes[name]; const o = JSON.parse(json); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, o); rebuildGame(); ed.selection = sel && s.entities.find(e => e.id === sel) || null; ed.emit('select', ed.selection); ed.emit('change'); };
    const afterSel = ed.selection && ed.selection.id;
    pushUndo({ label, undo: () => restore(before, selId), redo: () => restore(after, afterSel) });
    if (!opts.noRebuild) rebuildGame();
    ed.emit('change'); renderAll(opts.keepInspector);
  }

  // ================================================================ edit-mode game
  function createEditGame() {
    const host = $('#sceneView'); host.textContent = '';
    const s = ed.project.settings || {};
    const g = ACI.game(host, { fontSize: store.get('zoom', s.fontSize || 14), background: s.background || '#0a0e1a', renderer: s.renderer || 'auto' });
    g.paused = true; g.editMode = true; ed.game = g;
    // keep layers (water, grass) and animations alive without running gameplay
    let last = performance.now();
    const tick = now => { if (ed.game !== g) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; g.time += dt; for (const e of g.entities) { const a = e.sprite.anims[e.anim] || []; e.ft += dt; if (a.length > 1 && e.ft > 1 / (e.fps || e.sprite.fps || 6)) { e.ft = 0; e.frame = (e.frame + 1) % a.length; } } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    g.onDraw(drawOverlay);
    attachSceneInput(g);
    new ResizeObserver(() => g.resize && g.resize()).observe(host);
    // agents can edit the scene: commands run on this game, then the editor pulls the changes into the document
    try { g.connect(undefined, { name: 'Editor: ' + ed.project.name, editor: true }); } catch (e) {}
    // agent-authored cutscenes (op 'cutscene') are written into the project
    if (g.cutscene) g.cutscene.onSave = (p, obj) => { api(fileUrl(ed.projectId, p), { method: 'PUT', body: JSON.stringify(obj, null, 1) }).then(() => { log('Saved ' + p, 'agent'); return loadFiles(); }).then(() => { renderAssets(); rebuildGame(); }).catch(e => log('Could not save ' + p + ': ' + e.message, 'error')); };
    g.on('bridge', s => { ui.bridge = s.connected; renderStatus(); });
    g.on('command', ({ cmd, result }) => { if (cmd && cmd.op && !/^(look|describe|help|state)$/.test(cmd.op)) pullFromGame(cmd); });
  }
  function makeSprite(d) {
    try {
      if (d.sprite && d.sprite.asset) return ed.assets[d.sprite.asset] || ACI.sprite('?', { color: '#e06c75' });
      if (typeof d.sprite === 'string') return ACI.sprite(d.sprite || '?', d.spriteOpts || {});
      if (d.sprite && d.sprite.anims) return ACI.fromAsset(d.sprite);
    } catch (e) { log('Sprite for "' + d.name + '": ' + e.message, 'warn'); }
    return ACI.sprite('?', { color: '#e06c75' });
  }
  const VISUAL = ['x', 'y', 'z', 'flipX', 'label', 'reflect', 'hidden', 'name', 'labelColor'];
  function liveProps(d) { const o = { sceneId: d.id, tags: (d.tags || []).slice() }; VISUAL.forEach(k => { if (d[k] !== undefined) o[k] = d[k]; }); if (d.anim) o.anim = d.anim; return o; }
  let envLayer = null;
  function rebuildGame(recenter) {
    const g = ed.game, doc = ed.scene; if (!g || !doc) return;
    g.entities.slice().forEach(e => g.remove(e));
    (g.tilemaps || []).slice().forEach(t => t.destroy && t.destroy());
    if (envLayer) { g.removeLayer(envLayer); envLayer = null; }
    g.masks = {}; g.reflections.mask = null;
    g.setWorld(doc.world.cols, doc.world.rows);
    const env = doc.environment;
    if (env && env.preset && env.preset !== 'none' && ACI.environments) {
      try { const def = ACI.environments.get(env.preset); if (def) envLayer = g.layer(def.layer(Object.assign(ACI.environments.defaults(env.preset), env.params || {})), -100); }
      catch (e) { log('Background "' + env.preset + '": ' + e.message, 'warn'); }
    }
    (doc.tilemaps || []).forEach(t => { try { if (g.tilemap) { const m = g.tilemap({ rows: t.rows, legend: t.legend }, t.legend, { name: t.name, x: t.x, y: t.y, setWorld: false }); if (t.hidden) m.visible = false; } } catch (e) { log('Tile layer "' + t.name + '": ' + e.message, 'warn'); } });
    doc.entities.forEach(d => { const e = g.add(makeSprite(d), liveProps(d)); e._doc = d; e.label = d.label || null; });
    if (recenter) frameAll();
  }
  const liveOf = d => d && ed.game && ed.game.entities.find(e => e._doc === d);
  function syncEntity(d) { const e = liveOf(d); if (!e) return rebuildGame(); Object.assign(e, liveProps(d)); e.label = d.label || null; e.setSprite(makeSprite(d)); if (d.anim) e.play(d.anim); }
  function pullFromGame(cmd) {
    const g = ed.game, doc = ed.scene; if (!g || !doc) return;
    const before = JSON.stringify(doc);
    const alive = new Set();
    for (const e of g.entities) {
      if (e._doc) { alive.add(e._doc); const d = e._doc; d.x = Math.round(e.x); d.y = Math.round(e.y); if (e.label !== (d.label || null)) d.label = e.label || null; if (e.name && e.name !== d.name) d.name = e.name; if (e.anim && e.anim !== 'default') d.anim = e.anim; continue; }
      const d = { id: uid(), name: e.name || 'Agent thing', x: Math.round(e.x), y: Math.round(e.y), z: e.z || 0, sprite: ACI.toAsset(e.sprite, e.name || 'sprite'), label: e.label || null, reflect: !!e.reflect, tags: (e.tags || []).slice(), behaviours: [] };
      if (e.owner) d.tags.push('agent:' + e.owner);
      doc.entities.push(d); e._doc = d; alive.add(d);
    }
    doc.entities = doc.entities.filter(d => alive.has(d));
    const after = JSON.stringify(doc);
    if (before !== after) {
      const name = ed.sceneName;
      const restore = json => { const s = ed.scenes[name]; const o = JSON.parse(json); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, o); if (ed.sceneName === name) rebuildGame(); ed.emit('change'); };
      pushUndo({ label: 'Agent: ' + (cmd.op || 'change'), undo: () => restore(before), redo: () => restore(after) });
      log((cmd.agent ? cmd.agent + ': ' : 'Agent: ') + cmd.op + (cmd.name ? ' ' + cmd.name : ''), 'agent', cmd.agent);
      renderHierarchy(); renderInspector();
    }
  }

  // ---- overlay: world bounds, grid, selection, hover, tool drawing
  function drawOverlay(g) {
    const doc = ed.scene; if (!doc) return;
    const cx = Math.round(g.camera.x), cy = Math.round(g.camera.y);
    // outside the world: faint dots so the edge of the level is obvious
    for (let sy = 0; sy < g.viewRows; sy++) for (let sx = 0; sx < g.viewCols; sx++) {
      const x = sx + cx, y = sy + cy;
      if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) g.put(x, y, (x + y) % 2 ? ' ' : '·', '#1b2133', '#05070c');
      else if (ui.showGrid && !envLayer && x % 10 === 0 && y % 5 === 0) { const c = g.get(x, y); if (c && c.ch === ' ') g.put(x, y, '+', '#1d2438'); }
    }
    const hov = ui.hover && liveOf(ui.hover);
    if (hov && ui.hover !== ed.selection) box(g, hov, '#5d6680');
    const sel = ed.selection && liveOf(ed.selection);
    if (sel) { box(g, sel, '#f0c766'); const nm = ' ' + (sel._doc.name || '') + ' '; g.text(Math.round(sel.x), Math.round(sel.y) + Math.max(1, Math.ceil(sel.h)), nm, '#1a1405', '#f0c766'); }
    const tool = registry.tools.find(t => t.id === ui.tool);
    if (tool && tool.draw) try { tool.draw(g, ed); } catch (e) {}
    if (ui.dropAt) { g.put(ui.dropAt.x, ui.dropAt.y, '✚', '#f0c766'); }
  }
  function box(g, e, col) {
    const x0 = Math.round(e.x) - 1, y0 = Math.round(e.y) - 1, x1 = Math.round(e.x) + Math.max(1, Math.ceil(e.w)), y1 = Math.round(e.y) + Math.max(1, Math.ceil(e.h));
    g.put(x0, y0, '┌', col); g.put(x1, y0, '┐', col); g.put(x0, y1, '└', col); g.put(x1, y1, '┘', col);
    if (e.w > 3) { g.put(x0 + 1, y0, '─', col); g.put(x1 - 1, y0, '─', col); g.put(x0 + 1, y1, '─', col); g.put(x1 - 1, y1, '─', col); }
  }

  // ---- scene input: select, drag, pan, zoom, drop
  function cellOf(g, ev) { const r = g.canvas.getBoundingClientRect(); const sx = Math.floor((ev.clientX - r.left) / g.cellW), sy = Math.floor((ev.clientY - r.top) / g.cellH); return { sx, sy, x: sx + Math.round(g.camera.x), y: sy + Math.round(g.camera.y) }; }
  function pickAt(x, y) {
    const g = ed.game; let best = null;
    for (const e of g.entities) {
      if (e.hidden || !e._doc) continue;
      const ex = Math.round(e.x), ey = Math.round(e.y);
      if (x >= ex && y >= ey && x < ex + Math.max(1, Math.ceil(e.w)) && y < ey + Math.max(1, Math.ceil(e.h)) && (!best || (e.z || 0) >= (best.z || 0))) best = e;
    }
    return best;
  }
  function attachSceneInput(g) {
    const cv = g.canvas, view = $('#sceneView');
    cv.addEventListener('contextmenu', ev => { ev.preventDefault(); const c = cellOf(g, ev); const e = pickAt(c.x, c.y); if (e) { select(e._doc); entityMenu(ev.clientX, ev.clientY, e._doc); } else addMenu(ev.clientX, ev.clientY, c); });
    cv.addEventListener('pointerdown', ev => {
      if (ui.playing) return;
      const c = cellOf(g, ev); cv.setPointerCapture(ev.pointerId);
      if (ev.button === 1 || ev.button === 2 && false || ui.space || ui.tool === 'pan') { ui.pan = { sx: ev.clientX, sy: ev.clientY, cx: g.camera.x, cy: g.camera.y }; view.classList.add('panning'); ev.preventDefault(); return; }
      if (ev.button !== 0) return;
      const tool = registry.tools.find(t => t.id === ui.tool);
      if (tool && tool.pointer) { try { tool.pointer({ type: 'down', buttons: ev.buttons, shiftKey: ev.shiftKey, altKey: ev.altKey, ctrlKey: ev.ctrlKey }, c, ed); } catch (e) { log('Tool error: ' + e.message, 'error'); } return; }
      const e = pickAt(c.x, c.y);
      if (e) { select(e._doc); ui.drag = { d: e._doc, ox: c.x - e._doc.x, oy: c.y - e._doc.y, before: JSON.stringify(ed.scene), moved: false, alt: ev.altKey }; }
      else select(null);
    });
    cv.addEventListener('pointermove', ev => {
      const c = cellOf(g, ev); ui.cursor = c;
      if (ui.pan) { g.camera.target = null; g.camera.x = ui.pan.cx - (ev.clientX - ui.pan.sx) / g.cellW; g.camera.y = ui.pan.cy - (ev.clientY - ui.pan.sy) / g.cellH; clampCam(); renderStatusSoon(); return; }
      const tool = registry.tools.find(t => t.id === ui.tool);
      if (tool && tool.pointer) { try { tool.pointer({ type: 'move', buttons: ev.buttons, shiftKey: ev.shiftKey, altKey: ev.altKey }, c, ed); } catch (e) {} renderStatusSoon(); return; }
      if (ui.drag) {
        const d = ui.drag.d, nx = c.x - ui.drag.ox, ny = c.y - ui.drag.oy;
        if (nx !== d.x || ny !== d.y) {
          if (ui.drag.alt && !ui.drag.moved) { const copy = duplicateDoc(d, true); ui.drag.d = copy; select(copy); }
          ui.drag.d.x = nx; ui.drag.d.y = ny; ui.drag.moved = true; syncEntity(ui.drag.d); renderInspectorTransform();
        }
      } else { const e = pickAt(c.x, c.y); ui.hover = e ? e._doc : null; cv.style.cursor = e ? 'move' : ''; }
      renderStatusSoon();
    });
    const up = ev => {
      if (ui.pan) { ui.pan = null; view.classList.remove('panning'); return; }
      const tool = registry.tools.find(t => t.id === ui.tool);
      if (tool && tool.pointer) { try { tool.pointer({ type: 'up', buttons: 0 }, ui.cursor || cellOf(g, ev), ed); } catch (e) {} return; }
      if (ui.drag) {
        const dr = ui.drag; ui.drag = null;
        if (dr.moved) { const after = JSON.stringify(ed.scene), name = ed.sceneName, id = dr.d.id;
          const restore = json => { const s = ed.scenes[name]; const o = JSON.parse(json); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, o); if (ed.sceneName === name) rebuildGame(); ed.selection = ed.scene.entities.find(e => e.id === id) || null; ed.emit('select', ed.selection); };
          pushUndo({ label: dr.alt ? 'Duplicate ' + dr.d.name : 'Move ' + dr.d.name, undo: () => restore(dr.before), redo: () => restore(after) }); renderHierarchy(); renderInspector(); }
      }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { ui.hover = null; });
    cv.addEventListener('dblclick', ev => { const c = cellOf(g, ev); const e = pickAt(c.x, c.y); if (e && e._doc.sprite && e._doc.sprite.asset) openFile('assets/' + e._doc.sprite.asset + '.aci.json'); });
    view.addEventListener('wheel', ev => { if (ui.playing) return; ev.preventDefault(); zoom(ev.deltaY < 0 ? 1 : -1, ev); }, { passive: false });
    // drag assets from the Assets panel into the scene
    view.addEventListener('dragover', ev => { if (![...ev.dataTransfer.types].includes('text/aci-asset') && ![...ev.dataTransfer.types].includes('Files')) return; ev.preventDefault(); view.classList.add('dragover'); ui.dropAt = cellOf(g, ev); });
    view.addEventListener('dragleave', () => { view.classList.remove('dragover'); ui.dropAt = null; });
    view.addEventListener('drop', async ev => {
      ev.preventDefault(); view.classList.remove('dragover'); const c = cellOf(g, ev); ui.dropAt = null;
      const name = ev.dataTransfer.getData('text/aci-asset');
      if (name) { const spr = ed.assets[name]; addEntity({ name: niceName(name), sprite: { asset: name }, x: c.x - Math.floor((spr ? spr.w : 1) / 2), y: c.y - Math.floor((spr ? spr.h : 1) / 2) }); return; }
      if (ev.dataTransfer.files.length) { for (const f of ev.dataTransfer.files) { const r = await importFile(f); if (r && r.asset) addEntity({ name: niceName(r.asset), sprite: { asset: r.asset }, x: c.x, y: c.y }); } }
    });
  }
  function clampCam() { const g = ed.game; g.camera.x = Math.max(-20, Math.min(g.cols - g.viewCols + 20, g.camera.x)); g.camera.y = Math.max(-10, Math.min(g.rows - g.viewRows + 10, g.camera.y)); }
  function zoom(dir) { const g = ed.game; if (!g) return; const sizes = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32]; let i = sizes.findIndex(s => s >= g.fontSize); if (i < 0) i = sizes.length - 1; i = Math.max(0, Math.min(sizes.length - 1, i + dir)); const cxw = g.camera.x + g.viewCols / 2, cyw = g.camera.y + g.viewRows / 2; g.setFontSize(sizes[i]); store.set('zoom', sizes[i]); g.camera.x = cxw - g.viewCols / 2; g.camera.y = cyw - g.viewRows / 2; renderSceneTools(); renderStatus(); }
  function frameAll() { const g = ed.game; if (!g) return; g.camera.target = null; g.camera.x = Math.min(0, (g.cols - g.viewCols) / 2) | 0; g.camera.y = Math.min(0, (g.rows - g.viewRows) / 2) | 0; const p = ed.scene.entities.find(d => (d.tags || []).includes('player')); if (p && (g.cols > g.viewCols || g.rows > g.viewRows)) { g.camera.x = Math.max(0, p.x - g.viewCols / 2); g.camera.y = Math.max(0, p.y - g.viewRows / 2); } }
  function frameSel() { const g = ed.game, d = ed.selection; if (!g || !d) return frameAll(); g.camera.target = null; const e = liveOf(d); g.camera.x = d.x + (e ? e.w : 1) / 2 - g.viewCols / 2; g.camera.y = d.y + (e ? e.h : 1) / 2 - g.viewRows / 2; clampCam(); }

  // ================================================================ entity operations
  const niceName = s => String(s).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  function uniqueName(base) { const names = new Set(ed.scene.entities.map(e => e.name)); if (!names.has(base)) return base; let i = 2; while (names.has(base + ' ' + i)) i++; return base + ' ' + i; }
  function centreCell() { const g = ed.game; return { x: Math.round(g.camera.x + g.viewCols / 2), y: Math.round(g.camera.y + g.viewRows / 2) }; }
  function addEntity(props) {
    const c = centreCell();
    const d = Object.assign({ id: uid(), name: 'Entity', x: c.x, y: c.y, z: 0, sprite: '@', spriteOpts: { color: '#e8e8e8' }, tags: [], behaviours: [] }, clone(props));
    d.name = uniqueName(d.name);
    commit('Add ' + d.name, s => s.entities.push(d));
    select(d);
    return d;
  }
  function duplicateDoc(d, silent) { const c = clone(d); c.id = uid(); c.name = uniqueName(d.name.replace(/ \d+$/, '')); if (!silent) { c.x += 2; c.y += 1; commit('Duplicate ' + d.name, s => s.entities.splice(s.entities.indexOf(d) + 1, 0, c)); select(c); } else { ed.scene.entities.push(c); rebuildGame(); } return c; }
  function deleteDoc(d) { if (!d) return; commit('Delete ' + d.name, s => { s.entities = s.entities.filter(e => e !== d); if (s.camera.follow === d.name) delete s.camera.follow; }); select(null); }
  function select(d) { if (d && d._doc) d = d._doc; ed.selection = d || null; ed.emit('select', ed.selection); renderHierarchy(); renderInspector(); if (d) showDockTab('right', 'inspector'); }
  function setProp(d, key, value, label) { if (JSON.stringify(d[key]) === JSON.stringify(value)) return; commit((label || 'Change ' + key) + ' · ' + d.name, () => { if (value === undefined || value === '' && key !== 'name') delete d[key]; else d[key] = value; }, { noRebuild: true, keepInspector: true }); syncEntity(d); }

  const PRESETS = [
    { label: 'Characters' },
    { icon: '@', text: 'Player (top-down)', props: { name: 'Player', sprite: '@', spriteOpts: { color: '#ffd24a' }, tags: ['player'], reflect: true, behaviours: [{ name: 'TopDownMove', params: {} }, { name: 'CameraFollow', params: {} }] } },
    { icon: '☻', text: 'Player (platformer)', props: { name: 'Player', sprite: ' o \n/|\\\n/ \\', spriteOpts: { color: '#ffd24a' }, tags: ['player'], behaviours: [{ name: 'PlatformerMove', params: {} }, { name: 'CameraFollow', params: {} }] }, scene: { gravity: 40 } },
    { icon: '☺', text: 'Friendly NPC', props: { name: 'Villager', sprite: '☺', spriteOpts: { color: '#7fe3ff' }, tags: ['npc'], behaviours: [{ name: 'Wander', params: {} }, { name: 'SayOnClick', params: { text: 'Hello there!' } }] } },
    { icon: 'Ö', text: 'Enemy', props: { name: 'Enemy', sprite: 'Ö', spriteOpts: { color: '#ff5566' }, tags: ['enemy'], behaviours: [{ name: 'Follow', params: { target: 'player', speed: 5 } }, { name: 'Hazard', params: {} }] } },
    { label: 'Objects' },
    { icon: '$', text: 'Coin', props: { name: 'Coin', sprite: '$', spriteOpts: { color: '#ffd24a' }, trigger: true, tags: ['coin'], behaviours: [{ name: 'Collectible', params: {} }, { name: 'Bob', params: {} }] } },
    { icon: '+', text: 'Door to scene', props: { name: 'Door', sprite: '┌┐\n││', spriteOpts: { color: '#c09050' }, trigger: true, behaviours: [{ name: 'DoorToScene', params: {} }] } },
    { icon: '█', text: 'Wall block', props: { name: 'Wall', sprite: '████\n████', spriteOpts: { color: '#6b6f85' }, solid: true, static: true } },
    { icon: 'T', text: 'Tree', props: { name: 'Tree', sprite: ' ▲ \n▲▲▲\n │ ', spriteOpts: { color: '#2f9a4a' }, solid: true, static: true, reflect: true } },
    { icon: 'A', text: 'Text', props: { name: 'Text', sprite: 'Hello!', spriteOpts: { color: '#ffffff' } } },
    { icon: '·', text: 'Empty entity', props: { name: 'Entity', sprite: '*', spriteOpts: { color: '#e8e8e8' } } },
  ];
  function addMenu(x, y, at) {
    const items = PRESETS.map(p => p.label ? p : { icon: p.icon, text: p.text, run: () => { const props = clone(p.props); if (at) { props.x = at.x; props.y = at.y; } if (p.scene && !ed.scene.gravity) ed.scene.gravity = p.scene.gravity; addEntity(props); } });
    const names = Object.keys(ed.assets);
    if (names.length) { items.push({ label: 'From your sprites' }); names.slice(0, 12).forEach(n => items.push({ icon: glyphOf(ed.assets[n]), text: niceName(n), run: () => addEntity(Object.assign({ name: niceName(n), sprite: { asset: n } }, at ? { x: at.x, y: at.y } : {})) })); }
    menu(x, y, items);
  }
  function entityMenu(x, y, d) {
    menu(x, y, [
      { text: 'Rename…', icon: '✎', run: async () => { const n = await ask('Rename', 'Name', d.name, 'Rename'); if (n) setProp(d, 'name', n, 'Rename'); renderHierarchy(); } },
      { text: 'Duplicate', icon: '⧉', kbd: 'Ctrl D', run: () => duplicateDoc(d) },
      { text: 'Frame in view', icon: '⌖', kbd: 'F', run: () => { select(d); frameSel(); } },
      { text: d.hidden ? 'Show' : 'Hide', icon: '◐', run: () => { setProp(d, 'hidden', d.hidden ? undefined : true, d.hidden ? 'Show' : 'Hide'); renderHierarchy(); } },
      { text: 'Camera follows this', icon: '◎', run: () => { commit('Camera follow', s => { s.camera.follow = d.name; }); } },
      { text: 'Bring forward', icon: '↑', run: () => setProp(d, 'z', (d.z || 0) + 1, 'Layer') },
      { text: 'Send backward', icon: '↓', run: () => setProp(d, 'z', (d.z || 0) - 1, 'Layer') },
      d.sprite && d.sprite.asset ? { text: 'Edit sprite', icon: '✐', run: () => openFile('assets/' + d.sprite.asset + '.aci.json') } : { text: 'Save sprite as asset', icon: '⇩', run: () => saveAsAsset(d) },
      '-',
      { text: 'Delete', icon: '×', kbd: 'Del', run: () => deleteDoc(d) },
    ]);
  }
  async function saveAsAsset(d) {
    const name = await ask('Save as sprite asset', 'Asset name (used in assets/<name>.aci.json)', d.name.toLowerCase().replace(/\s+/g, '-'), 'Save');
    if (!name) return;
    const spr = makeSprite(d), text = JSON.stringify(ACI.toAsset(spr, name), null, 1);
    await ed.fs.write('assets/' + name + '.aci.json', text);
    await loadFiles();
    setProp(d, 'sprite', { asset: name }, 'Use asset'); delete d.spriteOpts; rebuildGame(); renderAll();
    toast('Saved assets/' + name + '.aci.json', 'ok');
  }

  // ================================================================ docks and tabs
  const docks = { left: { id: 'dockLeft', tabs: [], cur: null }, right: { id: 'dockRight', tabs: [], cur: null }, bottom: { id: 'dockBottom', tabs: [], cur: null } };
  function addDockTab(dock, tab) { // tab: {id, title, icon, mount(el), onShow}
    const D = docks[dock]; if (!D || D.tabs.find(t => t.id === tab.id)) return;
    tab.el = h('div', { class: 'pane', 'data-tab': tab.id, hidden: true }); tab.mounted = false; tab.dock = dock;
    $('#' + D.id).append(tab.el); D.tabs.push(tab); renderDockTabs(dock);
    if (!D.cur) showDockTab(dock, tab.id);
  }
  function addPanelTab(p) { addDockTab(p.dock || 'left', { id: p.id, title: p.title, icon: p.icon, mount: el => p.mount(el, ed), onShow: () => p.onShow && p.onShow(ed), plugin: p }); }
  const dockTab = id => { for (const k in docks) { const t = docks[k].tabs.find(t => t.id === id); if (t) return t; } return null; };
  function badge(id, on) { const t = dockTab(id); if (!t) return; t.badge = on; renderDockTabs(t.dock); }
  function renderDockTabs(dock) {
    const D = docks[dock], bar = $('#' + D.id + ' > .tabs'); bar.textContent = '';
    const compact = dock !== 'bottom' && D.tabs.length > 2;
    D.tabs.forEach(t => bar.append(h('button', { class: D.cur === t.id ? 'on' : '', onclick: () => showDockTab(dock, t.id), title: t.title }, t.icon ? h('i', {}, t.icon) : null, compact && D.cur !== t.id ? null : t.title, t.badge ? h('span', { class: 'dirty-dot', style: 'background:var(--danger)' }) : null)));
    const tools = h('div', { class: 'tools' }, h('button', { class: 'btn ghost icon', title: 'Hide this panel', onclick: () => toggleDock(dock, false), style: 'height:22px;width:22px' }, dock === 'bottom' ? '▾' : dock === 'left' ? '◂' : '▸'));
    bar.append(tools);
  }
  function showDockTab(dock, id) {
    const D = docks[dock], t = D.tabs.find(t => t.id === id); if (!t) return;
    D.cur = id; D.tabs.forEach(x => (x.el.hidden = x !== t));
    if (!t.mounted) { t.mounted = true; try { t.mount(t.el); } catch (e) { t.el.append(h('div', { class: 'big-empty' }, 'This panel failed to load: ' + e.message)); console.error(e); } }
    t.badge = false; t.seen = true;
    try { t.onShow && t.onShow(); } catch (e) {}
    renderDockTabs(dock); toggleDock(dock, true);
  }
  function toggleDock(dock, show) { document.body.classList.toggle('no-' + dock, !show); store.set('dock.' + dock, show); setTimeout(() => ed.game && ed.game.resize && ed.game.resize(), 0); renderStatus(); }

  // centre tabs: Scene, Game, and opened files
  function renderCentreTabs() {
    const bar = $('#centreTabs'); bar.textContent = '';
    const tab = (id, icon, title, extra) => h('button', { class: ui.centre === id ? 'on' : '', onclick: () => showCentre(id) }, h('i', {}, icon), title, extra);
    bar.append(tab('scene', '▦', 'Scene'), tab('game', '▶', 'Game'));
    ui.tabs.forEach(t => bar.append(tab(t.id, t.icon, t.title, [t.handle && t.handle.dirty && t.handle.dirty() ? h('span', { class: 'dirty-dot', style: 'margin-left:4px' }) : null, h('span', { class: 'x', title: 'Close', onclick: ev => { ev.stopPropagation(); closeTab(t); } }, '✕')])));
    const tools = h('div', { class: 'tools' });
    ['left', 'bottom', 'right'].forEach(k => { const on = !document.body.classList.contains('no-' + k); tools.append(h('button', { class: 'btn ghost icon', 'aria-pressed': on, title: (on ? 'Hide ' : 'Show ') + k + ' panel', style: 'height:22px;width:24px;font-size:11px', onclick: () => { toggleDock(k, !on); renderCentreTabs(); } }, k === 'left' ? '◧' : k === 'right' ? '◨' : '⬓')); });
    tools.append(h('button', { class: 'btn ghost icon', 'aria-pressed': document.body.classList.contains('maxed'), title: 'Maximize view (Shift+Space)', style: 'height:22px;width:24px;font-size:11px', onclick: toggleMax }, '⛶'));
    bar.append(tools);
  }
  function showCentre(id) {
    ui.centre = id;
    $('#sceneView').hidden = id !== 'scene'; $('#sceneTools').hidden = id !== 'scene'; $('#sceneHint').hidden = id !== 'scene';
    $('#gameView').hidden = id !== 'game'; $('#sceneWrap').classList.toggle('not-scene', id !== 'scene');
    ui.tabs.forEach(t => (t.el.hidden = t.id !== id));
    if (id === 'game' && !ui.playing) { const gv = $('#gameView'); if (!gv.firstChild) gv.append(h('div', { class: 'overlay-msg' }, h('div', {}, h('div', { style: 'font:28px var(--mono);color:var(--accent)' }, '▶'), h('p', {}, 'Press Play to run the game here.'), h('button', { class: 'btn primary', onclick: play }, 'Play')))); }
    if (id === 'scene' && ed.game) setTimeout(() => ed.game.resize && ed.game.resize(), 0);
    renderCentreTabs();
  }
  async function openFile(p) {
    let t = ui.tabs.find(t => t.path === p);
    if (t) return showCentre(t.id);
    let text = '';
    try { text = await rawText(fileUrl(ed.projectId, p)); } catch (e) { text = ''; }
    const editor = registry.assetEditors.find(a => { try { return a.match(p); } catch (e) { return false; } });
    const el = h('div', { class: 'asset-tab', hidden: true });
    $('#sceneWrap').append(el);
    let handle;
    try { handle = editor ? editor.open(p, text, ed) : codeEditor(p, text); } catch (e) { log('Could not open ' + p + ': ' + e.message, 'error'); handle = codeEditor(p, text); }
    el.append(handle.el);
    t = { id: 'file:' + p, kind: 'file', path: p, title: p.split('/').pop().replace(/\.aci\.json$/, ''), icon: /\.aci\.json$/.test(p) ? '✐' : /\.js$/.test(p) ? '{}' : '≡', el, handle };
    ui.tabs.push(t); showCentre(t.id);
    const watch = setInterval(() => { if (!ui.tabs.includes(t)) return clearInterval(watch); const dd = !!(handle.dirty && handle.dirty()); if (dd !== t.wasDirty) { t.wasDirty = dd; renderCentreTabs(); if (dd) { setDirty(true); autosave(); } } }, 500);
  }
  async function saveTab(t) {
    const text = t.handle.save();
    await api(fileUrl(ed.projectId, t.path), { method: 'PUT', body: text });
    let m;
    if ((m = t.path.match(/^assets\/(.+)\.aci\.json$/))) { try { ed.assetText[m[1]] = text; ed.assets[m[1]] = ACI.fromAsset(text); } catch (e) { log('Sprite ' + m[1] + ': ' + e.message, 'error'); } rebuildGame(); ed.emit('assets', ed.assets); renderAssets(); }
    if ((m = t.path.match(/^cutscenes\/(.+)\.cutscene\.json$/))) ed.cutscenes[m[1]] = text;
    if ((m = t.path.match(/^scripts\/(.+)\.js$/))) { ed.scripts[m[1]] = text; runScript(m[1], text); renderInspector(); }
    t.wasDirty = false; renderCentreTabs();
  }
  async function closeTab(t, force) {
    if (!force && t.handle.dirty && t.handle.dirty()) { const r = await modal('Save changes to ' + t.title + '?', h('p', { style: 'margin:0' }, 'You have changes that are not saved.'), [{ label: 'Discard', value: () => 'discard' }, { label: 'Cancel', value: () => null }, { label: 'Save', primary: true, value: () => 'save' }]); if (!r) return; if (r === 'save') await saveTab(t); }
    try { t.handle.close && t.handle.close(); } catch (e) {}
    t.el.remove(); ui.tabs = ui.tabs.filter(x => x !== t);
    if (ui.centre === t.id) showCentre('scene'); else renderCentreTabs();
  }
  function codeEditor(p, text) {
    let initial = text;
    const ta = h('textarea', { spellcheck: 'false', value: text });
    const gutter = h('div', { class: 'gutter' });
    const lines = () => { gutter.textContent = Array.from({ length: ta.value.split('\n').length }, (_, i) => i + 1).join('\n'); };
    ta.addEventListener('input', lines); ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });
    ta.addEventListener('keydown', ev => { if (ev.key === 'Tab') { ev.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); lines(); } });
    lines();
    const help = /\.js$/.test(p) ? h('div', { class: 'toolbar' }, h('span', { class: 'muted' }, 'Behaviour script. Use ACI.behaviour(name, { params, start, update, onCollide, onClick }). Saved scripts show up in the Inspector under "Add behaviour".')) : null;
    const el = h('div', { style: 'display:flex;flex-direction:column;height:100%' }, help, h('div', { class: 'code', style: 'flex:1;min-height:0' }, gutter, ta));
    return { el, save: () => { initial = ta.value; return ta.value; }, dirty: () => ta.value !== initial };
  }

  // ================================================================ hierarchy
  let hierFilter = '';
  function mountHierarchy(el) {
    el.append(h('div', { class: 'toolbar' },
      h('input', { class: 'field', placeholder: 'Search…', style: 'flex:1;height:26px', oninput: e => { hierFilter = e.target.value.toLowerCase(); renderHierarchy(); } }),
      h('button', { class: 'btn primary', title: 'Add something to the scene', onclick: ev => { const r = ev.currentTarget.getBoundingClientRect(); addMenu(r.left, r.bottom + 4); } }, '+ Add')),
      h('ul', { class: 'tree', id: 'hierList' }));
    renderHierarchy();
  }
  function renderHierarchy() {
    const ul = $('#hierList'); if (!ul || !ed.scene) return;
    ul.textContent = '';
    ul.append(h('li', { class: 'scene-row' + (!ed.selection ? ' sel' : ''), onclick: () => select(null), title: 'Scene settings' }, h('span', { class: 'glyph' }, '▣'), h('span', { class: 'nm' }, ed.sceneName), h('span', { class: 'muted', style: 'font-size:11px' }, ed.scene.world.cols + '×' + ed.scene.world.rows)));
    const list = ed.scene.entities.filter(d => !hierFilter || d.name.toLowerCase().includes(hierFilter) || (d.tags || []).some(t => t.includes(hierFilter)));
    list.forEach(d => {
      const e = liveOf(d);
      const nm = h('span', { class: 'nm' }, d.name);
      const li = h('li', { class: (ed.selection === d ? 'sel' : '') + (d.hidden ? ' hiddenEnt' : ''), draggable: true, title: d.name + (d.tags && d.tags.length ? ' · ' + d.tags.join(', ') : ''),
        onclick: () => select(d), ondblclick: () => { select(d); frameSel(); },
        oncontextmenu: ev => { ev.preventDefault(); select(d); entityMenu(ev.clientX, ev.clientY, d); },
        ondragstart: ev => { ev.dataTransfer.setData('text/aci-entity', d.id); },
        ondragover: ev => { if ([...ev.dataTransfer.types].includes('text/aci-entity')) ev.preventDefault(); },
        ondrop: ev => { const id = ev.dataTransfer.getData('text/aci-entity'); const src = ed.scene.entities.find(x => x.id === id); if (!src || src === d) return; commit('Reorder', s => { s.entities.splice(s.entities.indexOf(src), 1); s.entities.splice(s.entities.indexOf(d), 0, src); }); } },
        h('span', { class: 'glyph', style: e ? 'color:' + ((e.sprite.anims[e.anim] || [])[0] || { cells: [{}] }).cells.find(c => c.ch !== ' ')?.fg : '' }, e ? glyphOf(e.sprite) : '·'), nm,
        (d.behaviours || []).length ? h('span', { class: 'muted mono', style: 'font-size:10px', title: d.behaviours.map(b => b.name).join(', ') }, '⚙' + d.behaviours.length) : null,
        ed.scene.camera.follow === d.name ? h('span', { class: 'muted', title: 'Camera follows this' }, '◎') : null,
        h('button', { class: 'eye' + (d.hidden ? ' off' : ''), title: d.hidden ? 'Show' : 'Hide', onclick: ev => { ev.stopPropagation(); setProp(d, 'hidden', d.hidden ? undefined : true, d.hidden ? 'Show' : 'Hide'); renderHierarchy(); } }, d.hidden ? '◌' : '●'));
      ul.append(li);
    });
    if (!ed.scene.entities.length) ul.append(h('div', { class: 'big-empty' }, h('b', {}, 'The scene is empty'), 'Click ', h('b', { style: 'display:inline;color:var(--accent)' }, '+ Add'), ' to place a player, a coin or a tree. Or drag a sprite from Assets.'));
  }

  // ================================================================ inspector
  function mountInspector(el) { el.append(h('div', { class: 'insp', id: 'inspBody' })); renderInspector(); }
  const closedSects = new Set(store.get('closedSects', ['Physics']));
  function sect(title, body, right) {
    const s = h('div', { class: 'sect' + (closedSects.has(title) ? ' closed' : '') },
      h('header', { onclick: ev => { if (ev.target.closest('button,select,input')) return; s.classList.toggle('closed'); if (s.classList.contains('closed')) closedSects.add(title); else closedSects.delete(title); store.set('closedSects', [...closedSects]); } }, h('i', {}, closedSects.has(title) ? '▸' : '▾'), title, h('span', { class: 'spacer' }), right),
      h('div', { class: 'rows' }, body));
    return s;
  }
  const row = (label, input, title) => h('div', { class: 'row', title: title || '' }, h('label', {}, label), input);
  const num = (val, on, o = {}) => h('div', { class: 'num' }, o.prefix ? h('span', {}, o.prefix) : null, h('input', { class: 'field', type: 'number', value: val == null ? '' : val, step: o.step || 1, min: o.min, max: o.max, placeholder: o.placeholder || '', onchange: e => on(e.target.value === '' ? undefined : +e.target.value) }));
  const txt = (val, on, o = {}) => h('input', { class: 'field', value: val == null ? '' : val, placeholder: o.placeholder || '', onchange: e => on(e.target.value) });
  const chk = (val, on, label) => h('label', { style: 'display:flex;align-items:center;gap:6px;cursor:pointer' }, h('input', { type: 'checkbox', checked: !!val, onchange: e => on(e.target.checked) }), label || '');
  const sel = (val, options, on) => h('select', { class: 'field', onchange: e => on(e.target.value) }, options.map(o => { const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o; const op = h('option', { value: v }, l); if (String(v) === String(val)) op.selected = true; return op; }));
  const colour = (val, on) => h('div', { style: 'display:flex;gap:6px;align-items:center' }, h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(val || '') ? val : '#ffffff', oninput: e => { e.target.nextSibling.value = e.target.value; }, onchange: e => on(e.target.value) }), h('input', { class: 'field mono', value: val || '', style: 'flex:1', onchange: e => on(e.target.value) }));
  function paramField(p, value, on) {
    const v = value === undefined ? p.default : value;
    switch (p.type) {
      case 'number': return num(v, x => on(x === undefined ? p.default : x), { min: p.min, max: p.max, step: p.step || (Math.abs(p.default) < 5 && p.default % 1 ? 0.1 : 1) });
      case 'boolean': return chk(v, on);
      case 'color': return colour(v, on);
      case 'select': return sel(v, (p.options || []).map(o => typeof o === 'object' ? o : { value: o, label: o }), on);
      case 'scene': return sel(v, [{ value: '', label: '(none)' }].concat(Object.keys(ed.scenes)), on);
      case 'asset': return sel(v, [{ value: '', label: '(none)' }].concat(Object.keys(ed.assets)), on);
      case 'entity': { const names = [...new Set(ed.scene.entities.map(e => e.name).concat(...ed.scene.entities.map(e => e.tags || [])))]; const id = 'dl' + Math.random().toString(36).slice(2); return h('div', {}, h('input', { class: 'field', value: v || '', list: id, onchange: e => on(e.target.value) }), h('datalist', { id }, names.map(n => h('option', { value: n })))); }
      case 'key': return h('input', { class: 'field mono', value: v || '', placeholder: 'press a key', onkeydown: e => { e.preventDefault(); const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; e.target.value = k; on(k); } });
      default: return txt(v, on);
    }
  }
  function renderInspector(keep) {
    const body = $('#inspBody'); if (!body || !ed.scene) return;
    if (keep && body.contains(document.activeElement) && document.activeElement.tagName !== 'BUTTON') return; // don't steal focus while typing
    const scroll = body.parentElement.scrollTop;
    body.textContent = '';
    const d = ed.selection;
    if (!d) renderSceneInspector(body); else renderEntityInspector(body, d);
    body.parentElement.scrollTop = scroll;
  }
  function renderInspectorTransform() { const d = ed.selection; const xi = $('#inspX'), yi = $('#inspY'); if (d && xi && yi) { xi.value = d.x; yi.value = d.y; } }
  function renderEntityInspector(body, d) {
    const e = liveOf(d);
    const P = (k, label) => v => setProp(d, k, v, label);
    body.append(h('div', { class: 'pane-body', style: 'display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--line)' },
      h('span', { class: 'mono', style: 'font-size:20px;color:var(--accent);width:24px;text-align:center' }, e ? glyphOf(e.sprite) : '·'),
      h('input', { class: 'field', value: d.name, style: 'font-weight:600', onchange: ev => { const old = d.name, n = ev.target.value.trim() || old; setProp(d, 'name', n, 'Rename'); if (ed.scene.camera.follow === old) ed.scene.camera.follow = n; renderHierarchy(); } }),
      h('button', { class: 'btn ghost icon', title: 'More', onclick: ev => entityMenu(ev.clientX, ev.clientY, d) }, '⋯')));
    // transform
    const x = num(d.x, v => setProp(d, 'x', v | 0, 'Move'), { prefix: 'X' }), y = num(d.y, v => setProp(d, 'y', v | 0, 'Move'), { prefix: 'Y' });
    x.querySelector('input').id = 'inspX'; y.querySelector('input').id = 'inspY';
    body.append(sect('Transform', [
      row('Position', h('div', { class: 'pair' }, x, y), 'Top-left cell, in characters'),
      row('Layer (z)', num(d.z || 0, P('z', 'Layer')), 'Higher draws on top'),
      row('Flip', chk(d.flipX, v => P('flipX', 'Flip')(v || undefined), 'Mirror left-right')),
    ]));
    // appearance
    const isAsset = d.sprite && d.sprite.asset, isText = typeof d.sprite === 'string';
    const srcOpts = [{ value: '__text', label: 'Text / characters' }].concat(Object.keys(ed.assets).map(n => ({ value: n, label: 'Sprite: ' + n })));
    if (!isAsset && !isText) srcOpts.unshift({ value: '__inline', label: 'Embedded sprite' });
    const app = [
      row('Sprite', sel(isAsset ? d.sprite.asset : isText ? '__text' : '__inline', srcOpts, v => {
        if (v === '__text') commit('Sprite · ' + d.name, () => { d.sprite = e ? ACI.toText ? asText(e.sprite) : '@' : '@'; d.spriteOpts = d.spriteOpts || { color: '#e8e8e8' }; }, { keepInspector: false });
        else if (v !== '__inline') commit('Sprite · ' + d.name, () => { d.sprite = { asset: v }; delete d.spriteOpts; delete d.anim; });
      })),
      h('div', { class: 'sprite-prev' }, e ? spritePre(e.sprite, 40, 10, e.anim) : null),
    ];
    if (isText) {
      app.push(row('Characters', h('textarea', { class: 'field', rows: Math.min(8, Math.max(2, d.sprite.split('\n').length + 1)), value: d.sprite, onchange: ev => setProp(d, 'sprite', ev.target.value || '?', 'Characters') }), 'Type or paste ASCII art'));
      app.push(row('Colour', colour((d.spriteOpts || {}).color || '#e8e8e8', v => setProp(d, 'spriteOpts', Object.assign({}, d.spriteOpts, { color: v }), 'Colour'))));
      app.push(h('div', { style: 'display:flex;gap:6px' }, h('button', { class: 'btn', onclick: () => saveAsAsset(d) }, 'Turn into sprite asset…'), h('span', { class: 'muted', style: 'font-size:11px;align-self:center' }, 'to paint it and add animations')));
    }
    if (isAsset) app.push(h('div', { style: 'display:flex;gap:6px' }, h('button', { class: 'btn', onclick: () => openFile('assets/' + d.sprite.asset + '.aci.json') }, '✐ Edit sprite')));
    if (e && Object.keys(e.sprite.anims).length > 1) app.push(row('Animation', sel(d.anim || e.anim, Object.keys(e.sprite.anims), P('anim', 'Animation')), 'Which animation plays at the start'));
    app.push(row('Label', txt(d.label, v => P('label', 'Label')(v || undefined), { placeholder: 'Text above it (optional)' })));
    app.push(row('Reflection', chk(d.reflect, v => P('reflect', 'Reflection')(v || undefined), 'Mirror in water')));
    app.push(row('Visible', chk(!d.hidden, v => P('hidden', v ? 'Show' : 'Hide')(v ? undefined : true))));
    body.append(sect('Appearance', app));
    // tags
    body.append(sect('Tags', [row('Tags', txt((d.tags || []).join(', '), v => setProp(d, 'tags', v.split(',').map(s => s.trim()).filter(Boolean), 'Tags'), { placeholder: 'player, enemy, coin…' }), 'Behaviours find things by name or tag'),
      h('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' }, ['player', 'enemy', 'coin', 'npc', 'wall'].map(t => h('button', { class: 'btn', style: 'height:22px;font-size:11px', 'aria-pressed': (d.tags || []).includes(t), onclick: () => { const tags = (d.tags || []).slice(); const i = tags.indexOf(t); if (i < 0) tags.push(t); else tags.splice(i, 1); setProp(d, 'tags', tags, 'Tags'); renderInspector(); } }, t))) ]));
    // physics
    body.append(sect('Physics', [
      row('Solid', chk(d.solid, v => P('solid', 'Solid')(v || undefined), 'Blocks movement')),
      row('Static', chk(d.static, v => P('static', 'Static')(v || undefined), 'Never moves (walls)')),
      row('Trigger', chk(d.trigger, v => P('trigger', 'Trigger')(v || undefined), 'Detects overlaps, never blocks')),
      row('Gravity', num(d.gravity, P('gravity', 'Gravity'), { placeholder: 'scene default', step: 1 })),
      row('Velocity', h('div', { class: 'pair' }, num(d.vx, P('vx', 'Velocity'), { prefix: 'x' }), num(d.vy, P('vy', 'Velocity'), { prefix: 'y' }))),
      row('Friction', num(d.friction, P('friction', 'Friction'), { step: 0.1, placeholder: 'default' })),
      row('Bounce', num(d.bounce, P('bounce', 'Bounce'), { step: 0.1, min: 0, max: 1, placeholder: '0' })),
    ]));
    // behaviours
    const behs = d.behaviours || [];
    const addB = h('button', { class: 'btn primary', style: 'width:100%;justify-content:center', onclick: ev => {
      const all = Object.values(ACI.behaviours || {});
      const r = ev.currentTarget.getBoundingClientRect();
      menu(r.left, r.bottom + 4, all.length ? all.map(b => ({ icon: '⚙', text: b.title + (b.description ? ' — ' + b.description.slice(0, 40) : ''), run: () => commit('Add behaviour ' + b.name, () => { d.behaviours = (d.behaviours || []).concat([{ name: b.name, params: {} }]); }, { noRebuild: true }) })) : [{ label: 'No behaviours loaded' }]);
    } }, '+ Add behaviour');
    body.append(sect('Behaviours', [
      behs.length ? null : h('div', { class: 'muted', style: 'font-size:12px' }, 'Behaviours make things move and react. They run when you press Play.'),
      ...behs.map((b, i) => {
        const def = (ACI.behaviours || {})[b.name];
        const params = def ? Object.keys(def.params || {}).map(k => row(def.params[k].label || k, paramField(def.params[k], (b.params || {})[k], v => commit('Behaviour ' + b.name + '.' + k, () => { b.params = Object.assign({}, b.params, { [k]: v }); }, { noRebuild: true, keepInspector: true })))) : [h('div', { class: 'muted', style: 'color:var(--warn)' }, 'Unknown behaviour. Is its script saved?')];
        return h('div', { class: 'beh' }, h('header', {}, h('span', { class: 'mono', style: 'color:var(--accent)' }, '⚙'), def ? def.title : b.name, h('small', { title: def ? def.description : '' }, def ? def.description : ''),
          i > 0 ? h('button', { class: 'btn ghost icon', style: 'height:22px;width:22px', title: 'Move up', onclick: () => commit('Reorder behaviours', () => { behs.splice(i - 1, 0, behs.splice(i, 1)[0]); }, { noRebuild: true }) }, '↑') : null,
          h('button', { class: 'btn ghost icon', style: 'height:22px;width:22px', title: 'Remove', onclick: () => commit('Remove behaviour ' + b.name, () => { d.behaviours = behs.filter(x => x !== b); }, { noRebuild: true }) }, '✕')),
          params.length ? h('div', { class: 'rows' }, params) : null);
      }), addB,
      h('button', { class: 'btn ghost', style: 'width:100%;justify-content:center', onclick: newScript }, '{ } Write your own behaviour'),
    ]));
    registry.inspectors.forEach(ins => { try { if (!ins.applies || ins.applies(d)) { const el = h('div'); ins.render(el, d, ed); body.append(sect(ins.title, [el])); } } catch (e) { console.error(e); } });
  }
  function asText(spr) { try { const f = spr.anims[Object.keys(spr.anims)[0]][0]; let s = ''; for (let y = 0; y < f.h; y++) { for (let x = 0; x < f.w; x++) s += f.cells[y * f.w + x].ch; s = s.replace(/\s+$/, '') + (y < f.h - 1 ? '\n' : ''); } return s || '@'; } catch (e) { return '@'; } }
  function renderSceneInspector(body) {
    const s = ed.scene, man = ed.project, set = man.settings = man.settings || {};
    const S = (label, fn) => commit(label, fn, { keepInspector: true });
    body.append(h('div', { class: 'pane-body', style: 'display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--line)' }, h('span', { class: 'mono', style: 'font-size:18px;color:var(--accent)' }, '▣'), h('b', { style: 'flex:1' }, 'Scene: ' + ed.sceneName),
      man.startScene === ed.sceneName ? h('span', { class: 'muted', style: 'font-size:11px' }, 'start scene') : h('button', { class: 'btn', onclick: () => { man.startScene = ed.sceneName; markDirty(); renderInspector(); } }, 'Make start scene'),
      h('button', { class: 'btn ghost icon', title: 'Scene options', onclick: ev => sceneMenu(ev.clientX, ev.clientY) }, '⋯')));
    body.append(sect('World', [
      row('Size', h('div', { class: 'pair' }, num(s.world.cols, v => S('World size', () => { s.world.cols = Math.max(10, Math.min(2000, v | 0 || 80)); }), { prefix: 'W' }), num(s.world.rows, v => S('World size', () => { s.world.rows = Math.max(5, Math.min(1000, v | 0 || 30)); }), { prefix: 'H' })), 'In characters'),
      row('Gravity', num(s.gravity || 0, v => S('Gravity', () => { s.gravity = v || 0; }), { step: 5 }), '0 for top-down games, about 40 for platformers'),
      row('Camera', sel(s.camera.follow || '', [{ value: '', label: 'Fixed (no follow)' }].concat(s.entities.map(e => e.name)), v => S('Camera follow', () => { if (v) s.camera.follow = v; else delete s.camera.follow; })), 'The camera follows this entity in play mode'),
    ]));
    const envs = ACI.environments ? ACI.environments.list() : [];
    const env = s.environment; const def = env.preset !== 'none' && ACI.environments && ACI.environments.get(env.preset);
    const envRows = [row('Preset', sel(env.preset, [{ value: 'none', label: 'None (plain colour)' }].concat(envs.map(e => ({ value: e.id, label: e.title || e.id }))), v => S('Background', () => { s.environment = { preset: v, params: {} }; })))];
    if (def && def.description) envRows.push(h('div', { class: 'muted', style: 'font-size:12px' }, def.description));
    if (def) Object.keys(def.params || {}).forEach(k => { const p = def.params[k]; envRows.push(row(p.label || k, paramField(p, env.params[k], v => S('Background ' + k, () => { env.params = Object.assign({}, env.params, { [k]: v }); })))); });
    body.append(sect('Background', envRows));
    body.append(sect('Project', [
      row('Name', txt(man.name, async v => { v = v.trim(); if (!v || v === man.name) return; try { await saveAll(true); const r = await api('/api/projects/' + encodeURIComponent(ed.projectId) + '/rename', { method: 'POST', json: { to: v } }); man.name = v; ed.projectId = r.id; $('#projName').textContent = v; history.replaceState(null, '', '#project=' + encodeURIComponent(r.id) + '&scene=' + encodeURIComponent(ed.sceneName)); toast('Renamed', 'ok'); } catch (e) { toast('Rename failed: ' + e.message, 'err'); } })),
      row('Detail', sel(set.fontSize || 14, [{ value: 14, label: 'Classic (14 px characters)' }, { value: 10, label: 'Fine (10 px)' }, { value: 6, label: 'High detail (6 px)' }, { value: 4, label: 'Ultra (4 px, 300+ columns)' }, { value: 3, label: 'Max (3 px)' }].concat([14, 10, 6, 4, 3].includes(set.fontSize || 14) ? [] : [{ value: set.fontSize, label: set.fontSize + ' px' }]), v => { set.fontSize = +v; markDirty(); if (ed.game) { ed.game.setFontSize(+v); store.set('zoom', +v); renderSceneTools(); frameAll(); } renderInspector(); }), 'Character size when the game runs. Smaller = more detail; use a bigger world size too'),
      row('Text size', num(set.fontSize || 14, v => { set.fontSize = Math.max(3, Math.min(40, v || 14)); markDirty(); if (ed.game) ed.game.setFontSize(set.fontSize); renderInspector(); }, { min: 3, max: 40 }), 'Exact character size in pixels'),
      row('Renderer', sel(set.renderer || 'auto', [{ value: 'auto', label: 'Auto (GPU when the scene is big)' }, { value: 'webgl', label: 'GPU (WebGL2)' }, { value: 'canvas', label: 'Canvas 2D' }], v => { set.renderer = v; markDirty(); toast('Renderer applies when you reopen the project or press Play', '', 3000); }), 'How characters are drawn. GPU keeps 144 fps with hundreds of columns'),
      row('Background', colour(set.background || '#0a0e1a', v => { set.background = v; markDirty(); }), 'Colour behind everything'),
      row('Auto-save', chk(store.get('autosave', true), v => store.set('autosave', v), 'Save changes automatically')),
      h('div', { class: 'muted', style: 'font-size:11px;word-break:break-all' }, 'Folder: ' + (info.workspace ? info.workspace + '/' : '') + ed.projectId),
    ]));
    body.append(h('div', { class: 'help', style: 'padding-top:10px' }, 'Tip: click something in the scene or the Hierarchy to edit it here.'));
  }
  async function newScript() {
    const n = await ask('New behaviour', 'Name (letters only, e.g. Jumpy)', 'MyBehaviour', 'Create');
    if (!n) return;
    const name = n.replace(/[^\w]/g, '') || 'MyBehaviour';
    const code = `// ${name}: a behaviour you can add to any entity in the Inspector.
// params become fields in the Inspector. They run in Play mode and in builds.
ACI.behaviour('${name}', {
  title: '${niceName(name)}',
  description: 'Describe what it does',
  params: {
    speed: { type: 'number', default: 5, min: 0, max: 50, label: 'Speed' },
  },
  start(e, game, params) {
    // runs once when the scene starts
  },
  update(e, dt, game, params) {
    // runs every frame. dt is seconds since the last frame.
    // e.x += params.speed * dt;
  },
  onCollide(e, other, game, params) {},
  onClick(e, game, params) { e.say('${niceName(name)}!'); },
});
`;
    await ed.fs.write('scripts/' + name + '.js', code);
    ed.scripts[name] = code; runScript(name, code); renderInspector();
    openFile('scripts/' + name + '.js');
  }

  // ================================================================ scenes
  function renderSceneSel() {
    const s = $('#sceneSel'); s.textContent = '';
    Object.keys(ed.scenes).forEach(n => { const o = h('option', { value: n }, (n === ed.project.startScene ? '★ ' : '') + n); if (n === ed.sceneName) o.selected = true; s.append(o); });
  }
  async function newScene() {
    const n = await ask('New scene', 'Scene name', 'level' + (Object.keys(ed.scenes).length + 1), 'Create');
    if (!n) return;
    const name = n.replace(/[\\/:*?"<>|]/g, '').trim(); if (!name || ed.scenes[name]) return toast('That name is taken', 'err');
    const doc = emptyScene(name); Object.assign(doc.world, ed.scene ? ed.scene.world : {}); doc.environment = clone(ed.scene ? ed.scene.environment : doc.environment);
    ed.scenes[name] = doc; ed.project.scenes.push({ name, file: 'scenes/' + name + '.scene.json' });
    markDirty(); switchScene(name); toast('Scene "' + name + '" created', 'ok');
  }
  function sceneMenu(x, y) {
    menu(x, y, [
      { text: 'New scene…', icon: '+', run: newScene },
      { text: 'Duplicate scene', icon: '⧉', run: () => { let n = ed.sceneName + ' copy', i = 2; while (ed.scenes[n]) n = ed.sceneName + ' copy ' + i++; const doc = clone(ed.scene); doc.name = n; doc.entities.forEach(e => (e.id = uid())); ed.scenes[n] = doc; ed.project.scenes.push({ name: n, file: 'scenes/' + n + '.scene.json' }); markDirty(); switchScene(n); } },
      { text: 'Rename scene…', icon: '✎', run: async () => { const old = ed.sceneName, n = await ask('Rename scene', 'Name', old, 'Rename'); if (!n || n === old || ed.scenes[n]) return; ed.scenes[n] = ed.scenes[old]; ed.scenes[n].name = n; delete ed.scenes[old]; const e = ed.project.scenes.find(s => s.name === old); const oldFile = e.file; e.name = n; e.file = 'scenes/' + n + '.scene.json'; if (ed.project.startScene === old) ed.project.startScene = n; try { await api(fileUrl(ed.projectId, oldFile), { method: 'DELETE' }); } catch (err) {} markDirty(); switchScene(n); } },
      { text: 'Make start scene', icon: '★', run: () => { ed.project.startScene = ed.sceneName; markDirty(); renderSceneSel(); renderInspector(); } },
      '-',
      { text: 'Delete scene…', icon: '×', disabled: Object.keys(ed.scenes).length < 2, run: async () => { const n = ed.sceneName; if (!await confirmBox('Delete scene "' + n + '"?', 'Its file is removed from the project.')) return; const e = ed.project.scenes.find(s => s.name === n); delete ed.scenes[n]; ed.project.scenes = ed.project.scenes.filter(s => s !== e); if (ed.project.startScene === n) ed.project.startScene = Object.keys(ed.scenes)[0]; try { await api(fileUrl(ed.projectId, e.file), { method: 'DELETE' }); } catch (err) {} markDirty(); switchScene(Object.keys(ed.scenes)[0]); } },
    ]);
  }

  // ================================================================ assets panel
  let assetFilter = 'all';
  function mountAssets(el) {
    const imp = h('input', { type: 'file', multiple: true, accept: 'image/*,.gif,.aci.json,.json,.js,.txt,video/*', hidden: true, onchange: async e => { for (const f of e.target.files) await importFile(f); e.target.value = ''; } });
    el.append(h('div', { class: 'toolbar' },
      ['all', 'sprites', 'scripts', 'scenes', 'cutscenes'].map(k => h('button', { class: 'btn ghost', 'data-f': k, 'aria-pressed': assetFilter === k, onclick: () => { assetFilter = k; renderAssets(); } }, k[0].toUpperCase() + k.slice(1))),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: newSprite }, '+ Sprite'),
      h('button', { class: 'btn', onclick: generateSprite, title: 'Describe a sprite and Claude draws it' }, '✦ Generate'),
      h('button', { class: 'btn', onclick: newScript }, '+ Script'),
      h('button', { class: 'btn', onclick: () => imp.click(), title: 'Images, GIFs and videos become ASCII sprites' }, '⇪ Import'), imp,
      h('button', { class: 'btn ghost icon', title: 'Reload from disk', onclick: () => ed.refreshAssets() }, '↻')),
      h('div', { class: 'asset-grid', id: 'assetGrid' }));
    el.addEventListener('dragover', ev => { if ([...ev.dataTransfer.types].includes('Files')) ev.preventDefault(); });
    el.addEventListener('drop', async ev => { if (!ev.dataTransfer.files.length) return; ev.preventDefault(); for (const f of ev.dataTransfer.files) await importFile(f); });
    renderAssets();
  }
  function renderAssets() {
    const grid = $('#assetGrid'); if (!grid || !ed.projectId) return;
    document.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === assetFilter));
    grid.textContent = '';
    const files = ed.files.filter(f => f.type === 'file' && f.path.includes('/') && !/^(build|\.)/.test(f.path));
    const show = files.filter(f => assetFilter === 'all' || (assetFilter === 'sprites' && /^assets\//.test(f.path)) || (assetFilter === 'scripts' && /^scripts\//.test(f.path)) || (assetFilter === 'scenes' && /^scenes\//.test(f.path)) || (assetFilter === 'cutscenes' && /^cutscenes\//.test(f.path)));
    show.forEach(f => {
      let m, pv, sub, drag = null;
      if ((m = f.path.match(/^assets\/(.+)\.aci\.json$/))) { const spr = ed.assets[m[1]]; pv = spritePre(spr, 26, 9); sub = spr ? spr.w + '×' + spr.h + ' · ' + Object.keys(spr.anims).length + ' anim' : 'sprite'; drag = m[1]; }
      else if (/^scripts\//.test(f.path)) { pv = h('span', { class: 'ico' }, '{ }'); sub = 'script'; }
      else if (/^cutscenes\//.test(f.path)) { pv = h('span', { class: 'ico' }, '▶▶'); sub = 'cutscene'; }
      else if ((m = f.path.match(/^scenes\/(.+)\.scene\.json$/))) { pv = h('span', { class: 'ico' }, '▦'); sub = 'scene'; }
      else { pv = h('span', { class: 'ico' }, '≡'); sub = f.path.split('/')[0]; }
      const name = f.path.split('/').pop().replace(/\.(aci\.json|scene\.json|cutscene\.json|js)$/, '');
      grid.append(h('div', { class: 'asset', title: f.path + (drag ? '\nDrag into the scene to place it. Double-click to edit.' : ''), draggable: !!drag,
        ondragstart: ev => { if (drag) { ev.dataTransfer.setData('text/aci-asset', drag); ev.dataTransfer.effectAllowed = 'copy'; } },
        ondblclick: () => { const sm = f.path.match(/^scenes\/(.+)\.scene\.json$/); const sc = sm && (ed.project.scenes.find(s => s.file === f.path) || {}).name; if (sc) switchScene(sc); else openFile(f.path); },
        onclick: () => { if (ed.selection && drag && ed.selection.sprite && typeof ed.selection.sprite === 'object') {} },
        oncontextmenu: ev => { ev.preventDefault(); assetMenu(ev.clientX, ev.clientY, f, drag); } },
        h('div', { class: 'pv' }, pv), h('div', { class: 'nm' }, name, h('small', {}, sub))));
    });
    if (!show.length) grid.append(h('div', { class: 'big-empty', style: 'grid-column:1/-1' }, h('b', {}, 'No files here yet'), 'Make a sprite with "+ Sprite", or drop an image or GIF here to convert it to ASCII.'));
  }
  function assetMenu(x, y, f, spriteName) {
    menu(x, y, [
      { text: 'Open', icon: '↗', run: () => openFile(f.path) },
      spriteName ? { text: 'Add to scene', icon: '+', run: () => addEntity({ name: niceName(spriteName), sprite: { asset: spriteName } }) } : null,
      spriteName && ed.selection ? { text: 'Use on "' + ed.selection.name + '"', icon: '⇢', run: () => { const d = ed.selection; commit('Sprite · ' + d.name, () => { d.sprite = { asset: spriteName }; delete d.spriteOpts; delete d.anim; }); } } : null,
      { text: 'Rename…', icon: '✎', run: async () => { const base = f.path.split('/').pop(); const n = await ask('Rename file', 'New name', base, 'Rename'); if (!n || n === base) return; const np = f.path.replace(/[^/]+$/, n); const t = await rawText(fileUrl(ed.projectId, f.path)); await api(fileUrl(ed.projectId, np), { method: 'PUT', body: t }); await api(fileUrl(ed.projectId, f.path), { method: 'DELETE' }); const om = f.path.match(/^assets\/(.+)\.aci\.json$/), nm = np.match(/^assets\/(.+)\.aci\.json$/); if (om && nm) Object.values(ed.scenes).forEach(s => s.entities.forEach(e => { if (e.sprite && e.sprite.asset === om[1]) e.sprite.asset = nm[1]; })); await loadFiles(); rebuildGame(); renderAll(); markDirty(); } },
      { text: 'Download', icon: '⇩', run: () => { const a = h('a', { href: fileUrl(ed.projectId, f.path), download: f.path.split('/').pop() }); document.body.append(a); a.click(); a.remove(); } },
      '-',
      { text: 'Delete…', icon: '×', run: async () => { if (!await confirmBox('Delete ' + f.path + '?', 'This removes the file from the project folder.')) return; await ed.fs.remove(f.path); const m = f.path.match(/^scripts\/(.+)\.js$/); if (m) delete ed.scripts[m[1]]; rebuildGame(); renderAll(); } },
    ].filter(Boolean));
  }
  async function newSprite() {
    const n = await ask('New sprite', 'Name', 'sprite' + (Object.keys(ed.assets).length + 1), 'Create');
    if (!n) return;
    const name = n.toLowerCase().replace(/[^\w-]+/g, '-');
    const spr = ACI.sprite(' o \n/|\\\n/ \\', { color: '#e8c870' });
    await ed.fs.write('assets/' + name + '.aci.json', JSON.stringify(ACI.toAsset(spr, name), null, 1));
    await loadFiles(); renderAssets(); openFile('assets/' + name + '.aci.json');
  }
  async function importFile(file) {
    const imp = registry.importers.find(i => { const acc = (i.accept || '').split(',').map(s => s.trim()).filter(Boolean); return !acc.length || acc.some(a => a.startsWith('.') ? file.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a); });
    try {
      let out;
      if (imp) out = await imp.import(file, ed);
      else if (/\.(aci\.json|json)$/i.test(file.name)) out = { path: 'assets/' + file.name.replace(/\.json$/i, '').replace(/\.aci$/i, '') + '.aci.json', text: await file.text() };
      else if (/\.js$/i.test(file.name)) out = { path: 'scripts/' + file.name, text: await file.text() };
      else if (/\.txt$/i.test(file.name)) { const name = file.name.replace(/\.txt$/i, ''); out = { path: 'assets/' + name + '.aci.json', text: JSON.stringify(ACI.toAsset(ACI.sprite(await file.text(), { color: '#e8e8e8' }), name), null, 1) }; }
      else if (/^(image|video)\//.test(file.type) && ACI.convert) out = await convertDialog(file);
      else { toast('Cannot import ' + file.name, 'err'); return null; }
      if (!out) return null;
      await ed.fs.write(out.path, out.text); await loadFiles(); renderAssets();
      toast('Imported ' + out.path, 'ok'); log('Imported ' + file.name + ' → ' + out.path, 'ok');
      const m = out.path.match(/^assets\/(.+)\.aci\.json$/);
      return { path: out.path, asset: m && m[1] };
    } catch (e) { if (e && e.cancelled) return null; toast('Import failed: ' + e.message, 'err', 6000); log('Import of ' + file.name + ' failed: ' + e.message, 'error'); return null; }
  }
  // image / GIF / video -> ASCII sprite, with a live preview
  async function convertDialog(file) {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    const o = { cols: 40, mode: 'blocks', name: file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^\w-]+/g, '-') };
    const prev = h('div', { class: 'sprite-prev', style: 'max-height:320px;min-height:120px' }, 'Converting…');
    let spr = null;
    const redo = debounce(async () => { prev.textContent = 'Converting…'; try { spr = isVideo ? await ACI.convert.video(url, { cols: o.cols, mode: o.mode, fps: 8, maxFrames: 40 }) : await ACI.convert.load(url, { cols: o.cols, mode: o.mode }); prev.textContent = ''; prev.append(spritePre(spr, 120, 60)); } catch (e) { prev.textContent = 'Could not convert: ' + e.message; } }, 250);
    redo();
    const modes = ['ascii', 'blocks', 'braille', 'edges'];
    const r = await modal('Convert to ASCII', [prev,
      row('Name', txt(o.name, v => (o.name = v))),
      row('Width', num(o.cols, v => { o.cols = Math.max(4, Math.min(200, v || 40)); redo(); }, { min: 4, max: 200 }), 'In characters'),
      row('Style', sel(o.mode, modes, v => { o.mode = v; redo(); })),
      h('div', { class: 'muted', style: 'font-size:12px' }, isVideo ? 'Video becomes an animation (up to 40 frames).' : /gif/i.test(file.type) ? 'Animated GIFs keep their frames.' : 'Tip: "blocks" keeps colours, "edges" gives line art.')],
      [{ label: 'Cancel', value: () => null }, { label: 'Import sprite', primary: true, value: () => 'ok' }]);
    URL.revokeObjectURL(url);
    if (!r || !spr) return null;
    const name = (o.name || 'sprite').replace(/[^\w-]+/g, '-');
    return { path: 'assets/' + name + '.aci.json', text: JSON.stringify(ACI.toAsset(spr, name), null, 1) };
  }

  // ================================================================ console + agents panels
  let consoleEl = null, consoleFilter = 'all';
  function mountConsole(el) {
    el.append(h('div', { class: 'toolbar' }, ['all', 'error', 'warn', 'agent'].map(k => h('button', { class: 'btn ghost', 'data-cf': k, 'aria-pressed': consoleFilter === k, onclick: () => { consoleFilter = k; document.querySelectorAll('[data-cf]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cf === k)); redrawConsole(); } }, k === 'all' ? 'All' : k === 'error' ? 'Errors' : k === 'warn' ? 'Warnings' : 'Agents')),
      h('span', { class: 'spacer' }), h('button', { class: 'btn ghost', onclick: () => { logs.length = 0; redrawConsole(); } }, 'Clear')));
    consoleEl = h('div', { class: 'log' }); el.append(consoleEl); redrawConsole();
  }
  function redrawConsole() { if (!consoleEl) return; consoleEl.textContent = ''; logs.forEach(renderConsoleEntry); }
  function renderConsoleEntry(e) {
    if (!consoleEl) return;
    if (consoleFilter !== 'all' && e.level !== consoleFilter) return;
    const t = e.t.toTimeString().slice(0, 8);
    consoleEl.append(h('div', { class: e.level }, h('time', {}, t), e.who ? h('span', { class: 'agent' }, h('b', {}, e.who)) : null, h('span', {}, e.msg)));
    const pane = consoleEl.parentElement; if (pane) pane.scrollTop = pane.scrollHeight;
  }
  let agentsEl = null, agentSince = 0, agentTimer = null;
  function mountAgents(el) {
    agentsEl = h('div', { class: 'pane-body' });
    el.append(agentsEl); renderAgents();
    if (!agentTimer) agentTimer = setInterval(pollAgents, 2500);
  }
  async function renderAgents() {
    if (!agentsEl) return;
    let games = [];
    try { games = await api('/api/games'); } catch (e) {}
    agentsEl.textContent = '';
    agentsEl.append(h('div', { style: 'display:grid;grid-template-columns:minmax(220px,1fr) 2fr;gap:16px' },
      h('div', {}, h('div', { class: 'section-title', style: 'margin-top:0' }, 'Connected'),
        h('div', {}, h('span', { style: 'color:' + (ui.bridge ? 'var(--ok)' : 'var(--danger)') }, '● '), ui.bridge ? 'Editor is listening for agents' : 'Not connected to the agent bridge'),
        games.length ? h('ul', { class: 'tree', style: 'padding:6px 0' }, games.map(g => h('li', {}, h('span', { class: 'glyph' }, g.editor ? '✎' : '▶'), h('span', { class: 'nm' }, g.name), h('span', { class: 'muted', style: 'font-size:11px' }, '#' + g.id)))) : null,
        h('div', { class: 'section-title' }, 'Recent agent activity'), h('div', { class: 'log', id: 'agentFeed', style: 'max-height:200px;overflow:auto' }, logs.filter(l => l.level === 'agent').slice(-20).map(l => h('div', { class: 'agent' }, h('time', {}, l.t.toTimeString().slice(0, 8)), h('span', {}, l.msg))))),
      h('div', {}, h('div', { class: 'section-title', style: 'margin-top:0' }, 'Connect an agent'), agentHowTo())));
  }
  async function pollAgents() {
    try {
      const list = await api('/api/log?since=' + agentSince);
      if (!list.length) return;
      const first = agentSince === 0; agentSince = list[list.length - 1].n;
      if (!first) list.forEach(l => log((l.msg || l.text || l.op || JSON.stringify(l)), 'agent', l.agent || null));
      if (docks.bottom.cur === 'agents') renderAgents();
    } catch (e) {}
  }

  // ================================================================ play mode
  function collectPlayData() {
    const assets = {}; for (const k in ed.assetText) assets[k] = ed.assetText[k];
    return { type: 'aci-play', manifest: clone(ed.project), scene: ed.sceneName, scenes: clone(ed.scenes), assets, scripts: Object.assign({}, ed.scripts), cutscenes: Object.assign({}, ed.cutscenes) };
  }
  function play() {
    if (!ed.projectId) return;
    if (ui.playing) { if (ui.paused) togglePause(); return; }
    // save open file editors into memory so play uses them
    ui.tabs.forEach(t => { if (t.kind === 'file' && t.handle.dirty && t.handle.dirty()) saveTab(t); });
    const gv = $('#gameView'); gv.textContent = '';
    const frame = h('iframe', { src: '/runtime/player.html?editor=1', title: 'Game', allow: 'autoplay; gamepad' });
    gv.append(frame);
    ui.playing = frame; ui.paused = false;
    const onMsg = ev => {
      if (ev.source !== frame.contentWindow) return;
      const m = ev.data || {};
      if (m.type === 'aci-ready') { frame.contentWindow.postMessage(collectPlayData(), '*'); setTimeout(() => frame.focus(), 50); log('▶ Playing "' + ed.sceneName + '"', 'ok'); }
      else if (m.type === 'aci-log') log(m.msg, m.level === 'error' ? 'error' : m.level === 'warn' ? 'warn' : 'info', 'game');
      else if (m.type === 'aci-scene-changed') { log('Scene → ' + m.scene); renderStatus(m.scene); }
    };
    addEventListener('message', onMsg); ui.playMsg = onMsg;
    document.body.classList.add('playing'); showCentre('game'); renderPlaybar();
    frame.addEventListener('load', () => frame.focus());
  }
  function stop() {
    if (!ui.playing) return;
    ui.playing.remove(); ui.playing = null; ui.paused = false;
    removeEventListener('message', ui.playMsg);
    document.body.classList.remove('playing'); renderPlaybar();
    log('■ Stopped');
    if (ui.centre === 'game') showCentre('scene');
  }
  function player() { try { return ui.playing && ui.playing.contentWindow.aciPlayer; } catch (e) { return null; } }
  function togglePause() { const p = player(); if (!p) return; ui.paused = !ui.paused; ui.paused ? p.pause() : p.resume(); renderPlaybar(); }
  function stepFrame() { const p = player(); if (!p) return; if (!ui.paused) { ui.paused = true; p.pause(); } p.step(); renderPlaybar(); }
  function renderPlaybar() {
    $('#playBtn').classList.toggle('on', !!ui.playing && !ui.paused);
    $('#pauseBtn').disabled = $('#stepBtn').disabled = $('#stopBtn').disabled = !ui.playing;
    $('#pauseBtn').setAttribute('aria-pressed', ui.paused);
  }

  // ================================================================ scene toolbar + status
  function renderSceneTools() {
    const bar = $('#sceneTools'); if (!bar) return; bar.textContent = '';
    const tools = [{ id: 'select', title: 'Select & move', icon: '⬉', key: 'v' }, { id: 'pan', title: 'Pan', icon: '✋', key: 'h' }].concat(registry.tools);
    tools.forEach(t => bar.append(h('button', { class: 'btn', 'aria-pressed': ui.tool === t.id, title: t.title + (t.key ? ' (' + t.key.toUpperCase() + ')' : ''), onclick: () => setTool(t.id) }, h('span', { class: 'mono' }, t.icon || '•'), t.title)));
    bar.append(h('span', { class: 'sep' }),
      h('button', { class: 'btn icon', title: 'Zoom out', onclick: () => zoom(-1) }, '−'),
      h('span', { class: 'mono muted', style: 'min-width:44px;text-align:center;font-size:11px' }, ed.game ? Math.round(ed.game.fontSize / 14 * 100) + '%' : ''),
      h('button', { class: 'btn icon', title: 'Zoom in', onclick: () => zoom(1) }, '+'),
      h('button', { class: 'btn', title: 'Show the whole level', onclick: frameAll }, '⤢ Fit'),
      h('button', { class: 'btn', 'aria-pressed': ui.showGrid, title: 'Grid marks every 10×5 cells', onclick: () => { ui.showGrid = !ui.showGrid; store.set('grid', ui.showGrid); renderSceneTools(); } }, '# Grid'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', onclick: ev => { const r = ev.currentTarget.getBoundingClientRect(); addMenu(r.left, r.bottom + 4); } }, '+ Add'));
  }
  function setTool(id) {
    const prev = registry.tools.find(t => t.id === ui.tool); if (prev && prev.deactivate) try { prev.deactivate(ed); } catch (e) {}
    ui.tool = id; const t = registry.tools.find(t => t.id === id);
    if (t && t.activate) try { t.activate(ed); } catch (e) { log('Tool: ' + e.message, 'error'); }
    $('#sceneView').classList.toggle('tool-pan', id === 'pan');
    if (ed.game) ed.game.canvas.style.cursor = t && t.cursor || '';
    const panel = registry.panels.find(p => p.id === id); if (panel) showDockTab(panel.dock || 'left', panel.id);
    else if (prev && registry.panels.find(p => p.id === prev.id)) { const pp = registry.panels.find(p => p.id === prev.id); if (docks[pp.dock || 'left'].cur === pp.id) showDockTab(pp.dock || 'left', pp.dock === 'right' ? 'inspector' : pp.dock === 'bottom' ? 'assets' : 'hierarchy'); }
    renderSceneTools();
  }
  const renderStatusSoon = debounce(() => renderStatus(), 30);
  function renderStatus(playScene) {
    const st = $('#status'); if (!st || !ed.scene) return;
    const g = ed.game, c = ui.cursor;
    st.textContent = '';
    st.append(...[h('span', {}, ed.projectId + ' / ' + (playScene || ed.sceneName)),
      h('span', {}, ed.scene.entities.length + ' entities'),
      h('span', {}, 'world ' + ed.scene.world.cols + '×' + ed.scene.world.rows),
      c ? h('span', {}, 'cell ' + c.x + ', ' + c.y) : null,
      g ? h('span', {}, 'view ' + Math.round(g.camera.x) + ', ' + Math.round(g.camera.y)) : null,
      h('span', { class: 'spacer' }),
      h('span', { class: ui.bridge ? 'ok' : '' }, ui.bridge ? '● agents can connect' : '○ agent bridge offline'),
      g && g.renderer ? h('span', {}, (g.renderer() === 'webgl' ? 'GPU' : 'canvas') + ' · ' + (g.fps || 0) + ' fps') : null,
      h('span', {}, ui.playing ? (ui.paused ? '❚❚ paused' : '▶ playing') : 'edit mode'),
      h('span', {}, 'ACI ' + (info.version || ''))].filter(Boolean));
    [...st.childNodes].forEach(n => { if (n.nodeType === 3) n.remove(); });
  }
  function renderAll(keepInspector) { renderHierarchy(); renderInspector(keepInspector); renderAssets(); renderStatus(); renderSceneSel(); }

  // ================================================================ tips
  function showTips() {
    if (store.get('tips.done', false)) return;
    const wrap = $('#sceneWrap'); if (wrap.querySelector('.tips')) return;
    wrap.append(h('div', { class: 'tips' }, h('h3', {}, 'Welcome to the editor'),
      h('ol', {}, h('li', {}, h('b', {}, '+ Add'), ' a Player, a coin or a tree.'), h('li', {}, 'Drag things to move them. Edit them in the ', h('b', {}, 'Inspector'), '.'), h('li', {}, 'Pick a ', h('b', {}, 'Background'), ' in the scene settings.'), h('li', {}, 'Press ', h('b', {}, '▶ Play'), '. Arrow keys move the player.'), h('li', {}, h('b', {}, 'Build'), ' gives you one HTML file to share.')),
      h('div', { style: 'text-align:right;margin-top:8px' }, h('button', { class: 'btn', onclick: ev => { store.set('tips.done', true); ev.target.closest('.tips').remove(); } }, 'Got it'))));
  }

  // ================================================================ shell setup
  function splitter(id, varName, axis, min, max, invert) {
    const el = $('#' + id); if (!el) return;
    const saved = store.get('size.' + varName); if (saved) document.documentElement.style.setProperty('--' + varName, saved + 'px');
    el.addEventListener('pointerdown', ev => {
      ev.preventDefault(); el.classList.add('drag'); el.setPointerCapture(ev.pointerId);
      const start = axis === 'x' ? ev.clientX : ev.clientY, base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--' + varName));
      const move = e => { const d = (axis === 'x' ? e.clientX : e.clientY) - start; const v = Math.max(min, Math.min(max, base + (invert ? -d : d))); document.documentElement.style.setProperty('--' + varName, v + 'px'); store.set('size.' + varName, v); ed.game && ed.game.resize && ed.game.resize(); };
      const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    });
  }
  function initShell() {
    ui.ready = true;
    addDockTab('left', { id: 'hierarchy', title: 'Hierarchy', icon: '☰', mount: mountHierarchy });
    addDockTab('right', { id: 'inspector', title: 'Inspector', icon: 'ⓘ', mount: mountInspector });
    addDockTab('bottom', { id: 'assets', title: 'Assets', icon: '▤', mount: mountAssets });
    addDockTab('bottom', { id: 'console', title: 'Console', icon: '›_', mount: mountConsole });
    addDockTab('bottom', { id: 'agents', title: 'Agents', icon: '◎', mount: mountAgents, onShow: renderAgents });
    registry.panels.forEach(addPanelTab);
    showDockTab('left', 'hierarchy'); showDockTab('right', 'inspector'); showDockTab('bottom', 'assets');
    ['left', 'right', 'bottom'].forEach(k => { if (store.get('dock.' + k, true) === false) document.body.classList.add('no-' + k); });
    splitter('splitL', 'left', 'x', 160, 520); splitter('splitR', 'right', 'x', 220, 620, true); splitter('splitB', 'bottom', 'y', 90, 600, true);
    renderCentreTabs(); renderSceneTools(); renderPlaybar(); showCentre('scene');
    $('#homeBtn').onclick = () => { location.hash = ''; };
    $('#projBtn').onclick = ev => menuAt(ev.currentTarget, [
      { text: 'Save', icon: '⇩', kbd: 'Ctrl S', run: () => saveAll() },
      { text: 'Build HTML file', icon: '⇪', run: () => build() },
      { text: 'Play in new tab', icon: '↗', run: openInTab },
      '-',
      { text: 'Scene settings', icon: '▣', run: () => select(null) },
      { text: 'New scene…', icon: '+', run: newScene },
      { text: 'Show welcome tips', icon: '?', run: () => { store.set('tips.done', false); showTips(); } },
      '-',
      { text: 'Close project', icon: '←', run: () => { location.hash = ''; } },
    ]);
    $('#sceneSel').onchange = e => switchScene(e.target.value);
    $('#sceneAdd').onclick = ev => sceneMenu(ev.clientX, ev.clientY);
    $('#playBtn').onclick = play; $('#pauseBtn').onclick = togglePause; $('#stepBtn').onclick = stepFrame; $('#stopBtn').onclick = stop;
    const sb = $('#saveState'); sb.before(h('button', { class: 'btn ghost icon', title: 'Undo (Ctrl+Z)', onclick: undoStep }, '↶'), h('button', { class: 'btn ghost icon', title: 'Redo (Ctrl+Y)', onclick: redoStep }, '↷'), h('button', { class: 'btn ghost', title: 'Find anything (Ctrl+K)', onclick: palette, style: 'color:var(--muted)' }, '⌕ Search ', h('kbd', {}, 'Ctrl K')), h('span', { class: 'sep' }));
    $('#saveBtn').onclick = () => saveAll(); $('#buildBtn').onclick = buildMenu; $('#openPlayBtn').onclick = openInTab;
    addEventListener('keydown', onKey);
    addEventListener('keyup', ev => { if (ev.key === ' ') ui.space = false; });
    addEventListener('beforeunload', ev => { if (ui.dirty) { saveAll(true); ev.preventDefault(); ev.returnValue = ''; } });
  }
  async function openInTab() { await saveAll(true); open('/play/' + encodeURIComponent(ed.projectId) + '/', '_blank'); }
  function onKey(ev) {
    if (!ed.projectId || $('#app').hidden || document.querySelector('.scrim')) return;
    const mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
    if (mod && k === 'k') { ev.preventDefault(); return palette(); }
    if (mod && k === 's') { ev.preventDefault(); return saveAll(); }
    if (ev.shiftKey && ev.key === ' ' && !isTyping(ev)) { ev.preventDefault(); return toggleMax(); }
    if (mod && k === 'p') { ev.preventDefault(); return ui.playing ? stop() : play(); }
    if (ev.key === 'F5') { ev.preventDefault(); return ui.playing ? stop() : play(); }
    if (ev.key === 'Escape') { closeMenu(); if (ui.playing) return stop(); if (ed.selection) return select(null); }
    if (isTyping(ev) || ui.playing) return;
    if (ui.centre !== 'scene' && !(mod && (k === 'z' || k === 'y'))) return; // asset editors handle their own keys
    if (mod && k === 'z' && !ev.shiftKey) { ev.preventDefault(); return undoStep(); }
    if (mod && (k === 'y' || (k === 'z' && ev.shiftKey))) { ev.preventDefault(); return redoStep(); }
    const d = ed.selection;
    if (mod && k === 'd' && d) { ev.preventDefault(); return duplicateDoc(d); }
    if (mod && k === 'c' && d) { ui.clipboard = clone(d); return toast('Copied ' + d.name, '', 1000); }
    if (mod && k === 'v' && ui.clipboard) { ev.preventDefault(); const c = centreCell(); const p = clone(ui.clipboard); delete p.id; p.x = ui.cursor ? ui.cursor.x : c.x; p.y = ui.cursor ? ui.cursor.y : c.y; return addEntity(p); }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && d) { ev.preventDefault(); return deleteDoc(d); }
    if (ev.key === ' ') { ui.space = true; ev.preventDefault(); return; }
    if (ev.key.startsWith('Arrow') && d) { ev.preventDefault(); const n = ev.shiftKey ? 5 : 1; const dx = ev.key === 'ArrowLeft' ? -n : ev.key === 'ArrowRight' ? n : 0, dy = ev.key === 'ArrowUp' ? -n : ev.key === 'ArrowDown' ? n : 0; commit('Nudge ' + d.name, () => { d.x += dx; d.y += dy; }, { noRebuild: true, keepInspector: true }); syncEntity(d); renderInspectorTransform(); return; }
    if (mod) return;
    if (k === 'f') return frameSel();
    if (k === '=' || k === '+') return zoom(1);
    if (k === '-') return zoom(-1);
    if (k === 'v') return setTool('select');
    if (k === 'h') return setTool('pan');
    const t = registry.tools.find(t => t.key && t.key.toLowerCase() === k); if (t) return setTool(ui.tool === t.id ? 'select' : t.id);
  }

  // ================================================================ Generate with Claude
  function aiToAsset(j, name) {
    const pal = j.palette || {};
    const conv = fr => { const text = (fr.text || []).map(String); const w = Math.max(1, ...text.map(r => [...r].length)); const rows = text.map(r => { const a = [...r]; while (a.length < w) a.push(' '); return a.join(''); }); const out = { text: rows }; if (fr.colors) out.fg = rows.map((r, y) => [...r].map((ch, x) => { const k = [...(fr.colors[y] || '')][x]; return k && k !== '.' && pal[k] ? pal[k] : null; })); return out; };
    const anims = {}; if (j.anims) for (const k in j.anims) anims[k] = (j.anims[k] || []).map(conv); else if (j.frames) anims.idle = j.frames.map(conv);
    const asset = { aci: 1, name: name || j.name || 'sprite', fps: j.fps || 6, anims };
    ACI.fromAsset(asset); // throws if the engine can't read it
    return JSON.stringify(asset, null, 1);
  }
  async function aiDialog(o = {}) {
    let st = {}; try { st = await api('/api/ai/status'); } catch (e) {}
    const prompt = h('textarea', { class: 'field', rows: 3, placeholder: o.placeholder || 'e.g. a knight with a red cape and a glowing sword' });
    const w = num(o.w, () => {}, { prefix: 'W', min: 1, max: 240 }), hh = num(o.h, () => {}, { prefix: 'H', min: 1, max: 120 });
    const status = h('div', { class: 'muted', style: 'font-size:12px' }, st.direct ? 'Uses ' + st.model + ' with your API key.' : 'No API key on this computer, so a connected agent answers (Claude Code with the ACI tools: claude mcp add aci -- npx aci-engine mcp). Or start aci with ANTHROPIC_API_KEY set.');
    const prev = h('div', { class: 'sprite-prev', style: 'min-height:90px;max-height:300px', hidden: true });
    const body = [h('label', { class: 'muted' }, o.label || 'Describe it'), prompt, o.size !== false ? row('Size', h('div', { class: 'pair' }, w, hh), 'Leave empty to let Claude choose') : null, prev, status];
    let result = null, busy = false;
    return new Promise(resolve => {
      const scrim = h('div', { class: 'scrim' }); const footer = h('footer');
      const esc = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(null); } };
      const close = v => { scrim.remove(); removeEventListener('keydown', esc, true); resolve(v); };
      addEventListener('keydown', esc, true);
      const go = h('button', { class: 'btn primary' }, '✦ Generate');
      const use = h('button', { class: 'btn primary', hidden: true }, o.useLabel || 'Use it');
      go.onclick = async () => {
        if (busy || !prompt.value.trim()) return; busy = true; go.disabled = true; go.textContent = st.direct ? 'Generating…' : 'Waiting for an agent…'; prev.hidden = false; prev.textContent = 'Drawing…';
        try {
          const wv = +w.querySelector('input').value || undefined, hv = +hh.querySelector('input').value || undefined;
          result = await ed.ai.generate(Object.assign({ kind: o.kind || 'sprite', prompt: prompt.value.trim(), w: wv, h: hv, frames: o.frames, hint: o.hint }, o.extra || {}));
          prev.textContent = '';
          try { const t = o.kind === 'json' ? null : aiToAsset(result, 'preview'); if (t) prev.append(spritePre(ACI.fromAsset(t), 120, 50)); else prev.append(h('pre', { class: 'mono', style: 'font-size:11px;white-space:pre-wrap' }, JSON.stringify(result, null, 1).slice(0, 2000))); } catch (e) { prev.textContent = 'The answer could not be drawn: ' + e.message; }
          use.hidden = false; go.textContent = '↻ Try again';
        } catch (e) { prev.textContent = e.message; go.textContent = '✦ Generate'; }
        busy = false; go.disabled = false;
      };
      use.onclick = () => close(result);
      footer.append(h('button', { class: 'btn', onclick: () => close(null) }, 'Cancel'), go, use);
      scrim.append(h('div', { class: 'modal' }, h('header', {}, h('h2', {}, o.title || '✦ Generate with Claude'), h('button', { class: 'btn ghost icon', onclick: () => close(null) }, '✕')), h('div', { class: 'body' }, body), footer));
      document.body.append(scrim); setTimeout(() => prompt.focus(), 20);
      prompt.addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) go.click(); });
    });
  }
  async function generateSprite() {
    const j = await aiDialog({ title: '✦ Generate a sprite with Claude', useLabel: 'Save sprite' });
    if (!j) return;
    const name = String(j.name || 'generated').toLowerCase().replace(/[^\w-]+/g, '-').slice(0, 40) || 'generated';
    let n = name, i = 2; while (ed.assets[n]) n = name + '-' + i++;
    try { await ed.fs.write('assets/' + n + '.aci.json', aiToAsset(j, n)); await loadFiles(); renderAssets(); toast('Saved assets/' + n + '.aci.json. Drag it into the scene.', 'ok', 5000); openFile('assets/' + n + '.aci.json'); }
    catch (e) { toast('Could not save: ' + e.message, 'err'); }
  }

  // ================================================================ command palette (Ctrl+K)
  function palette() {
    if (document.querySelector('.palette')) return;
    const acts = [
      ['Save', '⇩', () => saveAll(), 'Ctrl S'], ['Play', '▶', play, 'Ctrl P'], ['Stop', '■', stop, 'Esc'], ['Build HTML file', '⇪', () => build()],
      ['Undo', '↶', undoStep, 'Ctrl Z'], ['Redo', '↷', redoStep, 'Ctrl Y'], ['New scene', '+', newScene], ['New sprite', '✐', newSprite], ['Generate sprite with Claude', '✦', generateSprite], ['New behaviour script', '{}', newScript],
      ['Scene settings', '▣', () => select(null)], ['Fit level in view', '⤢', frameAll], ['Toggle grid', '#', () => { ui.showGrid = !ui.showGrid; store.set('grid', ui.showGrid); renderSceneTools(); }],
      ['Open in new tab', '↗', openInTab], ['Close project', '←', () => { location.hash = ''; }],
    ].map(([t, i, run, k]) => ({ t, i, run, k, g: 'Action' }));
    PRESETS.filter(p => p.props).forEach(p => acts.push({ t: 'Add ' + p.text, i: p.icon, g: 'Add', run: () => addEntity(clone(p.props)) }));
    (ed.scene ? ed.scene.entities : []).forEach(d => acts.push({ t: d.name, i: liveOf(d) ? glyphOf(liveOf(d).sprite) : '·', g: 'Entity', run: () => { select(d); frameSel(); } }));
    Object.keys(ed.scenes).forEach(n => acts.push({ t: n, i: '▦', g: 'Scene', run: () => switchScene(n) }));
    ed.files.filter(f => f.type === 'file' && f.path.includes('/') && !/^(build|\.|scenes)\//.test(f.path)).forEach(f => acts.push({ t: f.path, i: '≡', g: 'File', run: () => openFile(f.path) }));
    registry.panels.concat([{ id: 'hierarchy', title: 'Hierarchy', dock: 'left' }, { id: 'inspector', title: 'Inspector', dock: 'right' }, { id: 'assets', title: 'Assets', dock: 'bottom' }, { id: 'console', title: 'Console', dock: 'bottom' }, { id: 'agents', title: 'Agents', dock: 'bottom' }]).forEach(p => acts.push({ t: 'Show ' + p.title, i: '◫', g: 'Panel', run: () => showDockTab(dockTab(p.id) ? dockTab(p.id).dock : p.dock || 'left', p.id) }));
    let q = '', idx = 0, shown = [];
    const inp = h('input', { class: 'field', placeholder: 'Type a command, an entity, a file…' });
    const list = h('div', { class: 'pl-list' });
    const score = (t, q) => { t = t.toLowerCase(); if (!q) return 1; if (t.startsWith(q)) return 3; if (t.includes(q)) return 2; let i = 0; for (const c of t) if (c === q[i]) i++; return i === q.length ? 1 : 0; };
    const draw = () => { shown = acts.map(a => [score(a.t, q), a]).filter(x => x[0]).sort((a, b) => b[0] - a[0]).slice(0, 40).map(x => x[1]); idx = Math.min(idx, Math.max(0, shown.length - 1)); list.textContent = ''; shown.forEach((a, i) => list.append(h('button', { class: i === idx ? 'on' : '', onmousemove: () => { if (idx !== i) { idx = i; draw(); } }, onclick: () => go(a) }, h('span', { class: 'mono pl-i' }, a.i || '·'), h('span', { class: 'pl-t' }, a.t), h('span', { class: 'pl-g' }, a.g), a.k ? h('kbd', {}, a.k) : null))); const on = list.querySelector('.on'); on && on.scrollIntoView({ block: 'nearest' }); };
    const close = () => { wrap.remove(); };
    const go = a => { close(); try { a.run(); } catch (e) { log(e.message, 'error'); } };
    inp.addEventListener('input', () => { q = inp.value.toLowerCase().trim(); idx = 0; draw(); });
    inp.addEventListener('keydown', ev => { if (ev.key === 'ArrowDown') { idx = Math.min(shown.length - 1, idx + 1); draw(); ev.preventDefault(); } else if (ev.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); ev.preventDefault(); } else if (ev.key === 'Enter') { shown[idx] && go(shown[idx]); } else if (ev.key === 'Escape') { close(); ev.stopPropagation(); } });
    const wrap = h('div', { class: 'scrim palette-scrim', onmousedown: ev => { if (ev.target === wrap) close(); } }, h('div', { class: 'palette' }, inp, list));
    document.body.append(wrap); draw(); setTimeout(() => inp.focus(), 10);
  }
  function toggleMax() { document.body.classList.toggle('maxed'); setTimeout(() => ed.game && ed.game.resize && ed.game.resize(), 0); renderCentreTabs(); }

  // ================================================================ boot
  async function loadPlugins() {
    let list = [];
    try { list = await api('/api/editor/plugins'); } catch (e) {}
    for (const src of list) {
      await new Promise(res => { const s = document.createElement('script'); s.src = typeof src === 'string' ? src : src.url || src.src; s.onload = res; s.onerror = () => { log('Plugin failed to load: ' + s.src, 'error'); res(); }; document.head.append(s); });
    }
  }
  async function boot() {
    try { info = await api('/api/info'); } catch (e) { info = {}; }
    $('#verTag').textContent = info.version ? 'v' + info.version : '';
    $('#wsPath').textContent = info.workspace ? 'Projects folder: ' + info.workspace : 'Server not reachable. Start it with: aci';
    document.querySelectorAll('#launcher nav a').forEach(a => a.onclick = ev => { ev.preventDefault(); location.hash = a.dataset.nav === 'projects' ? '' : 'page=' + a.dataset.nav; });
    await loadPlugins();
    addEventListener('hashchange', route);
    route();
  }
  boot();
})();
