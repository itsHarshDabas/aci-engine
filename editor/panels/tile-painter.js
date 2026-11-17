/* ACI editor panel: Tile painter.  A scene tool ("Paint tiles", key B) + a "Tiles" palette panel.
   Edits scene.tilemaps[i] = { name, rows:[string], legend:{ ch:{char,color,bg,solid,trigger} }, x, y }.
   Tools: brush, rectangle, fill, erase, pick (keys 1-5 while the tile tool is active, or click in the panel).
   The map grows automatically when you paint outside it. Every stroke is one undo step. */
(function () {
  'use strict';
  const E = window.ACIEditor; if (!E) return;
  const h = (tag, a, ...kids) => { const el = document.createElement(tag); for (const k in a || {}) { if (k === 'class') el.className = a[k]; else if (k === 'style') el.style.cssText = a[k]; else if (k.startsWith('on')) el.addEventListener(k.slice(2), a[k]); else if (a[k] !== false && a[k] != null) el.setAttribute(k, a[k] === true ? '' : a[k]); } kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : document.createTextNode(c))); return el; };

  // tiles a beginner can click without making anything up
  const LIBRARY = [
    { key: '#', name: 'Wall', char: '#', color: '#8a8fa8', solid: true },
    { key: '=', name: 'Brick', char: '=', color: '#b0643c', solid: true },
    { key: '▓', name: 'Stone', char: '▓', color: '#6b6f85', solid: true },
    { key: 'T', name: 'Tree', char: 'T', color: '#2f9a4a', solid: true },
    { key: 'o', name: 'Rock', char: 'o', color: '#9a9aa4', solid: true },
    { key: '.', name: 'Floor', char: '.', color: '#5a6178' },
    { key: ',', name: 'Grass', char: ',', color: '#3a8a4c' },
    { key: '"', name: 'Tall grass', char: '"', color: '#4fb060' },
    { key: '░', name: 'Sand', char: '░', color: '#d9b36a' },
    { key: '~', name: 'Water', char: '~', color: '#2d6fd0' },
    { key: '+', name: 'Door', char: '+', color: '#c09050', trigger: true },
    { key: '^', name: 'Spikes', char: '^', color: '#ff5566', trigger: true },
    { key: '$', name: 'Coin', char: '$', color: '#ffd24a', trigger: true },
    { key: '|', name: 'Fence', char: '|', color: '#a07848', solid: true },
  ];
  const S = { ed: null, tool: 'brush', size: 1, layer: 0, key: '#', solids: false, drag: null, hover: null, panel: null, active: false };

  // ---- data helpers -------------------------------------------------------
  const maps = () => (S.ed.scene.tilemaps = S.ed.scene.tilemaps || []);
  const cur = () => maps()[S.layer] || null;
  const live = tm => ((S.ed.game.tilemaps || []).find(m => m.name === tm.name) || null);
  const clone = tm => JSON.parse(JSON.stringify({ rows: tm.rows, legend: tm.legend, x: tm.x || 0, y: tm.y || 0 }));
  const restore = (tm, snap) => { const c = JSON.parse(JSON.stringify(snap)); tm.rows = c.rows; tm.legend = c.legend; tm.x = c.x; tm.y = c.y; sync(tm); };
  function sync(tm) { // push the doc into the live edit-mode tilemap
    trim(tm);
    const g = S.ed.game; let lm = live(tm);
    if (!lm && g.tilemap) lm = g.tilemap({ rows: tm.rows, legend: tm.legend }, tm.legend, { name: tm.name, x: tm.x || 0, y: tm.y || 0, setWorld: false });
    else if (lm) { lm.offsetX = tm.x || 0; lm.offsetY = tm.y || 0; lm.load(tm.rows, tm.legend); }
    lm && (lm.name = tm.name);
    S.ed.markDirty();
  }
  // The runtime tilemap drops blank leading rows, so keep the document tightly cropped (offsets x/y absorb the crop).
  function trim(tm) {
    let r = tm.rows, top = 0; while (top < r.length && !r[top].trim()) top++;
    let bot = r.length; while (bot > top && !r[bot - 1].trim()) bot--;
    r = r.slice(top, bot); tm.y = (tm.y || 0) + top;
    if (!r.length) { tm.rows = []; tm.x = tm.x || 0; return; }
    const left = Math.min(...r.map(s => s.search(/\S/)).filter(i => i >= 0)), right = Math.max(...r.map(s => s.trimEnd().length));
    tm.rows = r.map(s => s.slice(left, right).padEnd(right - left, ' ')); tm.x = (tm.x || 0) + left;
  }
  const get = (tm, x, y) => { const r = tm.rows[y - (tm.y || 0)]; return r ? r[x - (tm.x || 0)] || ' ' : ' '; };
  function ensure(tm, x, y) { // grow the map so (x,y) fits
    let ox = tm.x || 0, oy = tm.y || 0, w = Math.max(0, ...tm.rows.map(r => r.length)), hgt = tm.rows.length;
    if (!hgt) { tm.rows = [' ']; tm.x = x; tm.y = y; ox = x; oy = y; w = 1; hgt = 1; }
    if (!w) w = 1;
    if (x < ox) { const d = ox - x; tm.rows = tm.rows.map(r => ' '.repeat(d) + r); tm.x = ox = x; w += d; }
    if (y < oy) { const d = oy - y; tm.rows = Array.from({ length: d }, () => ' '.repeat(w)).concat(tm.rows); tm.y = oy = y; hgt += d; }
    if (x >= ox + w) { w = x - ox + 1; }
    if (y >= oy + hgt) { while (tm.rows.length < y - oy + 1) tm.rows.push(''); }
    tm.rows = tm.rows.map(r => r.padEnd(w, ' '));
    const sc = S.ed.scene; if (sc.world) { const nc = Math.max(sc.world.cols, ox + w), nr = Math.max(sc.world.rows, oy + tm.rows.length); if (nc !== sc.world.cols || nr !== sc.world.rows) { sc.world.cols = nc; sc.world.rows = nr; S.ed.game.setWorld && S.ed.game.setWorld(nc, nr); } }
  }
  function set(tm, x, y, ch) {
    if (ch === ' ' && (x < (tm.x || 0) || y < (tm.y || 0) || y >= (tm.y || 0) + tm.rows.length || x >= (tm.x || 0) + (tm.rows[0] || '').length)) return;
    ensure(tm, x, y);
    const row = tm.rows[y - tm.y]; const i = x - tm.x; if (row[i] === ch) return false;
    tm.rows[y - tm.y] = row.slice(0, i) + ch + row.slice(i + 1); return true;
  }
  function useTile(tm, key) { // make sure the legend knows the tile
    if (key === ' ') return; tm.legend = tm.legend || {};
    if (!tm.legend[key]) { const t = LIBRARY.find(l => l.key === key) || { char: key, color: '#cfd8ff' }; const d = { char: t.char }; if (t.color) d.color = t.color; if (t.solid) d.solid = true; if (t.trigger) d.trigger = true; tm.legend[key] = d; }
  }
  function ensureLayer() {
    if (!cur()) { maps().push({ name: 'Ground', rows: [], legend: {}, x: 0, y: 0 }); S.layer = 0; refresh(); }
    return cur();
  }

  // ---- painting ------------------------------------------------------------
  function cellsFor(tool, a, b, size) {
    const out = [];
    if (tool === 'rect') { const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]); return out; }
    const r = Math.floor(size / 2); for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push([b.x + dx - r, b.y + dy - r]); return out;
  }
  function line(a, b) { const pts = [], n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1); for (let i = 0; i <= n; i++) pts.push({ x: Math.round(a.x + (b.x - a.x) * i / n), y: Math.round(a.y + (b.y - a.y) * i / n) }); return pts; }
  function fill(tm, x, y, ch) {
    const from = get(tm, x, y); if (from === ch) return;
    const ox = tm.x || 0, oy = tm.y || 0, w = (tm.rows[0] || '').length, hh = tm.rows.length;
    const inside = (px, py) => px >= ox && py >= oy && px < ox + w && py < oy + hh;
    if (!inside(x, y)) { // filling empty space outside the map: grow the map to the visible view first
      const g = S.ed.game, c = g.camera || { x: 0, y: 0 }, vx0 = Math.floor(c.x), vy0 = Math.floor(c.y), vx1 = vx0 + (g.viewCols || 60), vy1 = vy0 + (g.viewRows || 30);
      ensure(tm, Math.max(0, vx0), Math.max(0, vy0)); ensure(tm, Math.min(g.cols - 1, vx1), Math.min(g.rows - 1, vy1));
    }
    const ox2 = tm.x || 0, oy2 = tm.y || 0, w2 = (tm.rows[0] || '').length, h2 = tm.rows.length, seen = new Set(), st = [[x, y]]; let n = 0;
    while (st.length && n < 40000) { const [px, py] = st.pop(); if (px < ox2 || py < oy2 || px >= ox2 + w2 || py >= oy2 + h2) continue; const k = px + ',' + py; if (seen.has(k) || get(tm, px, py) !== from) continue; seen.add(k); set(tm, px, py, ch); n++; st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]); }
  }
  function apply(tm, cells, ch) { let any = false; for (const [x, y] of cells) if (x >= 0 && y >= 0 && set(tm, x, y, ch)) any = true; if (any) sync(tm); return any; }

  function pointer(ev, cell) {
    if (!S.ed) return;
    S.hover = cell;
    const tm = ev.type === 'down' ? ensureLayer() : cur(); if (!tm) return;
    const erasing = S.tool === 'erase' || ev.altKey === true && false;
    const ch = S.tool === 'erase' ? ' ' : S.key;
    if (ev.type === 'down') {
      if (S.tool === 'pick') { const c = get(tm, cell.x, cell.y); if (c !== ' ') pickTile(c); return; }
      S.drag = { before: clone(tm), start: cell, last: cell, changed: false };
      if (S.tool !== 'erase') useTile(tm, ch);
      if (S.tool === 'fill') { fill(tm, cell.x, cell.y, ch); sync(tm); S.drag.changed = true; return end(tm); }
      if (S.tool === 'brush' || S.tool === 'erase') { if (apply(tm, cellsFor('brush', cell, cell, S.size), ch)) S.drag.changed = true; }
    } else if (ev.type === 'move' && S.drag && (ev.buttons & 1 || ev.buttons === undefined)) {
      if (S.tool === 'brush' || S.tool === 'erase') { for (const p of line(S.drag.last, cell)) if (apply(tm, cellsFor('brush', p, p, S.size), ch)) S.drag.changed = true; S.drag.last = cell; }
    } else if (ev.type === 'up' && S.drag) {
      if (S.tool === 'rect') { if (S.tool !== 'erase') useTile(tm, ch); S.drag.changed = apply(tm, cellsFor('rect', S.drag.start, cell), ch) || S.drag.changed; }
      end(tm);
    }
  }
  function end(tm) {
    const d = S.drag; S.drag = null; if (!d) return;
    if (d.changed) { const before = d.before, after = clone(tm); sync(tm); S.ed.undo.push('Paint tiles', () => { restore(tm, before); refresh(); }, () => { restore(tm, after); refresh(); }); refresh(); }
  }
  function pickTile(c) { S.key = c; S.tool = 'brush'; refresh(); }

  // ---- hover / rect preview and collision overlay -----------------------------
  function draw(game) {
    const tm = cur();
    if (S.solids && tm) { // tint solid tiles inside the view so collision is visible
      const c = game.camera || { x: 0, y: 0 }, x0 = Math.floor(c.x), y0 = Math.floor(c.y);
      for (let y = y0; y < y0 + (game.viewRows || 40); y++) for (let x = x0; x < x0 + (game.viewCols || 100); x++) { const ch = get(tm, x, y), d = ch !== ' ' && tm.legend && tm.legend[ch]; if (d && d.solid) game.put(x, y, null, null, '#4a1a22'); else if (d && d.trigger) game.put(x, y, null, null, '#1a3a4a'); }
    }
    if (!S.hover) return;
    const ch = S.tool === 'erase' ? '×' : S.key, col = S.tool === 'erase' ? '#ff5566' : (tm && tm.legend && tm.legend[S.key] && tm.legend[S.key].color) || (LIBRARY.find(l => l.key === S.key) || {}).color || '#fff';
    if (S.tool === 'rect' && S.drag) { for (const [x, y] of cellsFor('rect', S.drag.start, S.hover)) game.put(x, y, ch === '×' ? ch : (LIBRARY.find(l => l.key === S.key) || { char: ch }).char, col, '#1c2a58'); }
    else if (S.tool === 'pick') game.put(S.hover.x, S.hover.y, '⌖', '#ffd24a');
    else for (const [x, y] of cellsFor('brush', S.hover, S.hover, S.tool === 'fill' ? 1 : S.size)) game.put(x, y, ch === '×' ? ch : ((tm && tm.legend && tm.legend[S.key] && tm.legend[S.key].char) || (LIBRARY.find(l => l.key === S.key) || { char: ch }).char), col, '#1c2a58');
  }

  // ---- scene tool ---------------------------------------------------------------
  let keyHandler = null;
  E.registerSceneTool({
    id: 'tiles', title: 'Paint tiles', icon: '▦', key: 'b', cursor: 'crosshair',
    activate(ed) { S.ed = ed; S.active = true; keyHandler = e => { if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return; const m = { '1': 'brush', '2': 'rect', '3': 'fill', '4': 'erase', '5': 'pick' }[e.key]; if (m) { S.tool = m; refresh(); } if (e.key === '[') { S.size = Math.max(1, S.size - 1); refresh(); } if (e.key === ']') { S.size = Math.min(8, S.size + 1); refresh(); } }; addEventListener('keydown', keyHandler); refresh(); },
    deactivate() { S.active = false; S.hover = null; keyHandler && removeEventListener('keydown', keyHandler); },
    pointer, draw,
  });

  // ---- palette panel --------------------------------------------------------------
  const css = `.tp{padding:10px;font:13px var(--sans);color:var(--ink)} .tp h4{margin:14px 0 6px;font:600 11px var(--sans);letter-spacing:.07em;text-transform:uppercase;color:var(--muted)} .tp h4:first-child{margin-top:0}
  .tp .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center} .tp button,.tp select,.tp input[type=text],.tp input[type=number]{background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:5px 8px;font:inherit}
  .tp button{cursor:pointer} .tp button:hover{border-color:var(--accent)} .tp button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
  .tp .tools button{flex:1;min-width:52px;text-align:center;padding:6px 4px} .tp .tools small{display:block;color:inherit;opacity:.65;font-size:10px}
  .tp .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:6px} .tp .tile{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px;font-size:10px;color:var(--muted)}
  .tp .tile b{font:700 20px var(--mono);line-height:1} .tp .tile[aria-pressed=true]{color:var(--accent-ink)} .tp .badge{font-size:9px;opacity:.8}
  .tp .layer{display:flex;gap:6px;align-items:center;padding:4px 6px;border:1px solid var(--line);border-radius:6px;margin-bottom:4px;cursor:pointer} .tp .layer[aria-current=true]{border-color:var(--accent);background:var(--panel-2)}
  .tp .layer span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .tp .layer button{padding:1px 6px} .tp label.chk{display:flex;align-items:center;gap:6px;margin-top:6px} .tp input[type=color]{width:34px;height:28px;padding:0;border:1px solid var(--line);border-radius:6px;background:none}
  .tp .hint{color:var(--muted);font-size:12px;margin:6px 0}`;
  function refresh() { S.panel && S.panel(); }

  E.registerPanel({
    id: 'tiles', title: 'Tiles', icon: '▦', dock: 'left',
    mount(el, ed) {
      S.ed = ed; if (!document.getElementById('tp-css')) document.head.append(h('style', { id: 'tp-css' }, css));
      const root = h('div', { class: 'tp' }); el.append(root);
      const render = () => {
        root.textContent = ''; const tm = cur();
        const tool = (id, name, key, icon) => h('button', { 'aria-pressed': S.tool === id, title: name + ' (' + key + ')', onclick: () => { S.tool = id; render(); } }, icon, h('small', {}, name));
        const swatch = (key, name, char, color, d) => h('button', { class: 'tile', 'aria-pressed': S.key === key, title: name + (d && d.solid ? ' · solid' : '') + (d && d.trigger ? ' · trigger' : ''), onclick: () => { S.key = key; if (S.tool === 'erase' || S.tool === 'pick') S.tool = 'brush'; render(); } }, h('b', { style: 'color:' + color }, char), name, d && (d.solid || d.trigger) ? h('span', { class: 'badge' }, d.solid ? 'solid' : 'trigger') : null);
        const legend = (tm && tm.legend) || {}, used = new Set(Object.keys(legend));
        const own = Object.keys(legend).map(k => swatch(k, (LIBRARY.find(l => l.key === k) || {}).name || k, legend[k].char || k, legend[k].color || '#cfd8ff', legend[k]));
        const rest = LIBRARY.filter(l => !used.has(l.key)).map(l => swatch(l.key, l.name, l.char, l.color, l));
        const sel = (tm && tm.legend && tm.legend[S.key]) || LIBRARY.find(l => l.key === S.key);
        root.append(...[
          h('h4', {}, 'Tool'),
          h('div', { class: 'row tools' }, tool('brush', 'Brush', '1', '✎'), tool('rect', 'Rect', '2', '▭'), tool('fill', 'Fill', '3', '◩'), tool('erase', 'Erase', '4', '⌫'), tool('pick', 'Pick', '5', '⌖')),
          h('div', { class: 'row', style: 'margin-top:8px' }, h('span', {}, 'Brush size'), h('input', { type: 'number', min: 1, max: 8, value: S.size, style: 'width:56px', oninput: e => { S.size = Math.max(1, Math.min(8, +e.target.value || 1)); } }), h('span', { class: 'hint', style: 'margin:0' }, '[ and ] change it')),
          h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.solids, onchange: e => { S.solids = e.target.checked; } }), 'Show collision (red = solid, blue = trigger)'),
          h('h4', {}, 'Layers'),
          ...maps().map((m, i) => h('div', { class: 'layer', 'aria-current': i === S.layer, onclick: () => { S.layer = i; render(); } },
            h('button', { title: 'Show or hide', onclick: ev => { ev.stopPropagation(); m.hidden = !m.hidden; const lm = live(m); if (lm) lm.visible = !m.hidden; S.ed.markDirty(); render(); } }, m.hidden ? '○' : '●'),
            h('span', {}, m.name || ('Layer ' + (i + 1))),
            h('button', { title: 'Rename', onclick: ev => { ev.stopPropagation(); const n = prompt('Layer name', m.name); if (n) { const lm = live(m); if (lm) lm.name = n; m.name = n; S.ed.markDirty(); render(); } } }, '✎'),
            h('button', { title: 'Delete layer', onclick: ev => { ev.stopPropagation(); if (!confirm('Delete layer "' + m.name + '"?')) return; const snap = JSON.parse(JSON.stringify(m)), idx = i; const lm = live(m); lm && lm.destroy && lm.destroy(); maps().splice(i, 1); S.layer = Math.max(0, Math.min(S.layer, maps().length - 1)); S.ed.markDirty(); S.ed.undo.push('Delete layer', () => { maps().splice(idx, 0, snap); sync(snap); render(); }, () => { const mm = maps().splice(idx, 1)[0]; const l2 = live(mm); l2 && l2.destroy && l2.destroy(); render(); }); render(); } }, '🗑'))),
          h('div', { class: 'row' }, h('button', { onclick: () => { const n = 'Layer ' + (maps().length + 1), m = { name: n, rows: [], legend: {}, x: 0, y: 0 }; maps().push(m); S.layer = maps().length - 1; sync(m); S.ed.undo.push('Add layer', () => { const l = live(m); l && l.destroy && l.destroy(); maps().splice(maps().indexOf(m), 1); render(); }, () => { maps().push(m); sync(m); render(); }); render(); } }, '+ New layer')),
          !maps().length ? h('div', { class: 'hint' }, 'No layers yet. Pick a tile and paint in the scene — a "Ground" layer is created for you.') : null,
          h('h4', {}, 'Tiles in this layer'), own.length ? h('div', { class: 'tiles' }, own) : h('div', { class: 'hint' }, 'Nothing painted yet.'),
          h('h4', {}, 'Tile library'), h('div', { class: 'tiles' }, rest),
          h('h4', {}, 'Selected tile'),
          sel ? (() => {
            const d = tm && tm.legend && tm.legend[S.key];
            const row = h('div', { class: 'row' },
              h('input', { type: 'color', value: (sel.color || '#cfd8ff'), title: 'Colour', onchange: e => { if (!d) { ensureLayer(); useTile(cur(), S.key); } const t = cur().legend[S.key]; const old = t.color; t.color = e.target.value; sync(cur()); render(); } }),
              h('label', { class: 'chk', style: 'margin:0' }, h('input', { type: 'checkbox', checked: !!sel.solid, onchange: e => { ensureLayer(); useTile(cur(), S.key); const t = cur().legend[S.key]; t.solid = e.target.checked || undefined; sync(cur()); render(); } }), 'Solid (blocks movement)'),
              h('label', { class: 'chk', style: 'margin:0' }, h('input', { type: 'checkbox', checked: !!sel.trigger, onchange: e => { ensureLayer(); useTile(cur(), S.key); const t = cur().legend[S.key]; t.trigger = e.target.checked || undefined; sync(cur()); render(); } }), 'Trigger (overlaps, never blocks)'));
            return row;
          })() : h('div', { class: 'hint' }, 'Custom character: type one below.'),
          h('div', { class: 'row', style: 'margin-top:8px' }, h('input', { type: 'text', maxlength: 1, placeholder: 'char', style: 'width:60px;text-align:center', id: 'tp-custom' }), h('button', { onclick: () => { const v = root.querySelector('#tp-custom').value; if (v && v !== ' ') { S.key = v; S.tool = 'brush'; render(); } } }, 'Use this character')),
          h('div', { class: 'hint' }, 'Tip: hold the mouse and drag to paint. Everything you paint can be undone with Ctrl+Z.')].filter(Boolean));
      };
      S.panel = render; render(); ed.on('scene', () => { S.layer = 0; render(); }); ed.on('select', () => {});
    },
  });
})();
