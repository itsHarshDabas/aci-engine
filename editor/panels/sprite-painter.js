/* ACI editor panel: Sprite painter.  Asset editor for assets/*.aci.json (kind 'sprite').
   Draw with characters and colours on a grid, with animations and frames, onion skin, live preview.
   Tools: pencil P, line L, rectangle R (hold Shift = filled), fill F, erase E, pick I, type T. Ctrl+Z / Ctrl+Y undo / redo.
   Reads and writes the standard .aci.json via ACI.fromAsset / ACI.toAsset. */
(function () {
  'use strict';
  const E = window.ACIEditor; if (!E) return;
  const h = (tag, a, ...kids) => { const el = document.createElement(tag); for (const k in a || {}) { if (k === 'class') el.className = a[k]; else if (k === 'style') el.style.cssText = a[k]; else if (k.startsWith('on')) el.addEventListener(k.slice(2), a[k]); else if (a[k] !== false && a[k] != null) el.setAttribute(k, a[k] === true ? '' : a[k]); } kids.flat().forEach(c => c != null && c !== false && el.append(c.nodeType ? c : document.createTextNode(c))); return el; };
  const GLYPHS = {
    'Letters': ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~',
    'Blocks': '█▓▒░▀▄▌▐■□▪▫▬▮▲▼◀▶◆◇○●◐◑',
    'Lines': '─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬╭╮╯╰',
    'Symbols': '☺☻♥♦♣♠•◘♪♫☼★☆✦✧✚✖✔♀♂≈∞±×÷°µπΩ¤¢£¥§¶',
    'Arrows': '←↑→↓↔↕⇐⇑⇒⇓↖↗↘↙➔➜»«‹›',
  };
  const SWATCHES = ['#ffffff', '#c2c3c7', '#83769c', '#5f574f', '#000000', '#ff004d', '#ff77a8', '#ffccaa', '#ffa300', '#ffec27', '#a8e72e', '#00e436', '#008751', '#29adff', '#1d2b53', '#7e2553', '#ab5236', '#e8c870', '#7fe3ff', '#cc99ff'];
  const BASE = '#e8e8e8';

  // ------------------------------------------------------------------ doc <-> asset
  function fromText(text) {
    const spr = text && text.trim() ? ACI.fromAsset(text) : null;
    const raw = text && text.trim() ? JSON.parse(text) : {};
    const doc = { name: raw.name || 'sprite', fps: raw.fps || 6, solid: !!raw.solid, res: Math.max(1, raw.res | 0 || 1), delays: Array.isArray(raw.delays) ? raw.delays : null, w: 0, h: 0, anims: {} };
    if (!spr) { doc.w = 7; doc.h = 4; doc.anims.idle = [blank(7, 4)]; return doc; }
    for (const n in spr.anims) doc.anims[n] = spr.anims[n].map(f => { const fr = blank(f.w, f.h); f.cells.forEach((c, i) => { const x = i % f.w, y = (i / f.w) | 0; fr.ch[y][x] = c.ch; fr.fg[y][x] = c.ch === ' ' ? null : c.fg; fr.bg[y][x] = c.bg || null; }); return fr; });
    doc.w = Math.max(1, spr.w); doc.h = Math.max(1, spr.h); resizeDoc(doc, doc.w, doc.h);
    return doc;
  }
  function toText(doc) {
    const spr = { name: doc.name, fps: doc.fps, solid: doc.solid, w: doc.w, h: doc.h, bg: null, res: doc.res || 1, anims: {} };
    { const n0 = Object.values(doc.anims)[0]; if (doc.delays && n0 && doc.delays.length === n0.length) spr.frameDelays = doc.delays; }
    for (const n in doc.anims) spr.anims[n] = doc.anims[n].map(f => { const cells = []; for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) { const ch = f.ch[y][x] || ' '; cells.push({ ch, fg: ch === ' ' ? BASE : f.fg[y][x] || BASE, bg: f.bg[y][x] || null }); } return { w: doc.w, h: doc.h, cells }; });
    return JSON.stringify(ACI.toAsset(spr, doc.name), null, 1);
  }
  function blank(w, hh) { const g = v => Array.from({ length: hh }, () => Array(w).fill(v)); return { ch: g(' '), fg: g(null), bg: g(null) }; }
  function resizeDoc(doc, w, hh) {
    for (const n in doc.anims) doc.anims[n] = doc.anims[n].map(f => { const o = blank(w, hh); for (let y = 0; y < Math.min(hh, f.ch.length); y++) for (let x = 0; x < Math.min(w, f.ch[0].length); x++) { o.ch[y][x] = f.ch[y][x]; o.fg[y][x] = f.fg[y][x]; o.bg[y][x] = f.bg[y][x]; } return o; });
    doc.w = w; doc.h = hh;
  }
  const cloneFrame = f => ({ ch: f.ch.map(r => r.slice()), fg: f.fg.map(r => r.slice()), bg: f.bg.map(r => r.slice()) });

  const css = `.sp{display:grid;grid-template-columns:230px 1fr 230px;grid-template-rows:auto 1fr auto;gap:8px;height:100%;padding:8px;font:13px var(--sans);color:var(--ink);background:var(--bg)}
  .sp *{box-sizing:border-box} .sp button,.sp select,.sp input[type=text],.sp input[type=number]{background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:4px 8px;font:inherit} .sp button{cursor:pointer} .sp button:hover{border-color:var(--accent)} .sp button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
  .sp .bar{grid-column:1/4;display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px} .sp .bar label{display:flex;gap:4px;align-items:center;color:var(--muted)} .sp .sep{width:1px;height:22px;background:var(--line)}
  .sp .side{overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px} .sp h5{margin:10px 0 6px;font:600 11px var(--sans);letter-spacing:.07em;text-transform:uppercase;color:var(--muted)} .sp h5:first-child{margin-top:0}
  .sp .stage{overflow:auto;background:#05070d;border:1px solid var(--line);border-radius:8px;display:flex;align-items:flex-start;justify-content:center;padding:12px} .sp canvas{display:block;outline:none;cursor:crosshair;touch-action:none}
  .sp .tools{display:grid;grid-template-columns:repeat(4,1fr);gap:4px} .sp .tools button{padding:6px 0;text-align:center} .sp .glyphs{display:grid;grid-template-columns:repeat(auto-fill,minmax(22px,1fr));gap:2px;max-height:150px;overflow:auto} .sp .glyphs button{padding:2px 0;font:14px var(--mono);text-align:center}
  .sp .sw{display:grid;grid-template-columns:repeat(auto-fill,minmax(22px,1fr));gap:3px} .sp .sw button{height:22px;padding:0;border-radius:4px} .sp .tabs{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px} .sp .tabs button{padding:2px 6px;font-size:11px}
  .sp .frames{grid-column:1/4;display:flex;gap:8px;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px;align-items:flex-end} .sp .fr{border:2px solid var(--line);border-radius:6px;padding:2px;background:#05070d;cursor:pointer;flex:none;text-align:center;font-size:10px;color:var(--muted)} .sp .fr[aria-current=true]{border-color:var(--accent)} .sp .fr.drop{border-color:var(--ok)}
  .sp .hint{color:var(--muted);font-size:12px;margin:4px 0} .sp .big{font:20px var(--mono);width:36px;text-align:center}`;

  E.registerAssetEditor({
    kind: 'sprite',
    match: p => /\.aci\.json$/i.test(p),
    open(path, text, ed) {
      if (!document.getElementById('sp-css')) document.head.append(h('style', { id: 'sp-css' }, css));
      const S = { doc: fromText(text), anim: null, fi: 0, tool: 'pencil', ch: '#', color: '#e8c870', mode: 'both', onion: true, grid: true, zoom: 20, drag: null, preview: null, caret: { x: 0, y: 0 }, undo: [], redo: [], tab: 'Letters', playing: true, hover: null };
      S.zoom = Math.max(2, Math.min(40, Math.floor(Math.min(620 / (S.doc.w * 0.6), 420 / (S.doc.h * 1.18)))));
      S.anim = Object.keys(S.doc.anims)[0]; let initial = toText(S.doc);
      const frames = () => S.doc.anims[S.anim], frame = () => frames()[Math.min(S.fi, frames().length - 1)];
      const mono = '"JetBrains Mono","IBM Plex Mono",Menlo,Consolas,monospace';
      const CW = () => Math.ceil(S.zoom * 0.6), CH = () => Math.ceil(S.zoom * 1.18);

      // ---- undo
      const snap = () => JSON.stringify({ d: S.doc, a: S.anim, f: S.fi });
      const pushUndo = () => { S.undo.push(snap()); if (S.undo.length > 100) S.undo.shift(); S.redo.length = 0; };
      const load = s => { const o = JSON.parse(s); S.doc = o.d; S.anim = o.a; S.fi = o.f; build(); changed(false); };
      const undo = () => { if (!S.undo.length) return; S.redo.push(snap()); load(S.undo.pop()); };
      const redo = () => { if (!S.redo.length) return; S.undo.push(snap()); load(S.redo.pop()); };
      const changed = (mark = true) => { if (mark) ed.markDirty(); drawMain(); drawFrames(); drawPreview(true); status(); };

      // ---- editing primitives
      const inside = (x, y) => x >= 0 && y >= 0 && x < S.doc.w && y < S.doc.h;
      function put(f, x, y, ch, fg) {
        if (!inside(x, y)) return;
        if (S.mode === 'colour') { if (f.ch[y][x] !== ' ') f.fg[y][x] = fg; return; }
        if (S.mode === 'char') { f.ch[y][x] = ch; if (ch !== ' ' && !f.fg[y][x]) f.fg[y][x] = fg; return; }
        f.ch[y][x] = ch; f.fg[y][x] = ch === ' ' ? null : fg;
      }
      const lineCells = (a, b) => { const o = [], n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1); for (let i = 0; i <= n; i++) o.push({ x: Math.round(a.x + (b.x - a.x) * i / n), y: Math.round(a.y + (b.y - a.y) * i / n) }); return o; };
      const rectCells = (a, b, filled) => { const o = [], x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (filled || x === x0 || x === x1 || y === y0 || y === y1) o.push({ x, y }); return o; };
      function flood(f, x, y, ch, fg) {
        if (!inside(x, y)) return; const ch0 = f.ch[y][x], fg0 = f.fg[y][x]; if (ch0 === ch && fg0 === fg) return; const st = [[x, y]];
        while (st.length) { const [px, py] = st.pop(); if (!inside(px, py) || f.ch[py][px] !== ch0 || f.fg[py][px] !== fg0) continue; put(f, px, py, ch, fg); if (f.ch[py][px] === ch0 && f.fg[py][px] === fg0) f.ch[py][px] = ch + '\0'; st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]); }
        for (let yy = 0; yy < S.doc.h; yy++) for (let xx = 0; xx < S.doc.w; xx++) if (typeof f.ch[yy][xx] === 'string' && f.ch[yy][xx].endsWith('\0')) f.ch[yy][xx] = f.ch[yy][xx].slice(0, -1);
      }

      // ---- main canvas
      const cv = h('canvas', { tabindex: 0, 'aria-label': 'Drawing grid' }), g2 = cv.getContext('2d');
      function drawFrameTo(ctx, f, cw, chh, fs, alpha, ox = 0, oy = 0) {
        ctx.globalAlpha = alpha; ctx.font = fs + 'px ' + mono; ctx.textBaseline = 'top';
        for (let y = 0; y < S.doc.h; y++) for (let x = 0; x < S.doc.w; x++) {
          const b = f.bg[y][x]; if (b) { ctx.fillStyle = b; ctx.fillRect(ox + x * cw, oy + y * chh, cw, chh); }
          const c = f.ch[y][x]; if (c !== ' ' && fs < 5) { ctx.fillStyle = f.fg[y][x] || BASE; ctx.fillRect(ox + x * cw, oy + y * chh, cw, chh * 0.8); } else if (c !== ' ') { ctx.fillStyle = f.fg[y][x] || BASE; ctx.fillText(c, ox + x * cw, oy + y * chh + Math.round((chh - fs) / 2)); }
        }
        ctx.globalAlpha = 1;
      }
      function drawMain() {
        const cw = CW(), chh = CH(), W = S.doc.w * cw, H = S.doc.h * chh, dpr = devicePixelRatio || 1;
        cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; g2.setTransform(dpr, 0, 0, dpr, 0, 0);
        g2.fillStyle = '#0a0e1a'; g2.fillRect(0, 0, W, H);
        if (S.grid && S.zoom >= 8) { g2.strokeStyle = '#161e3a'; g2.lineWidth = 1; g2.beginPath(); for (let x = 0; x <= S.doc.w; x++) { g2.moveTo(x * cw + .5, 0); g2.lineTo(x * cw + .5, H); } for (let y = 0; y <= S.doc.h; y++) { g2.moveTo(0, y * chh + .5); g2.lineTo(W, y * chh + .5); } g2.stroke(); }
        if (S.onion && S.fi > 0) drawFrameTo(g2, frames()[S.fi - 1], cw, chh, S.zoom, 0.22);
        drawFrameTo(g2, frame(), cw, chh, S.zoom, 1);
        if (S.preview) { g2.font = S.zoom + 'px ' + mono; g2.textBaseline = 'top'; for (const p of S.preview) { if (!inside(p.x, p.y)) continue; g2.fillStyle = '#1c3a7a'; g2.globalAlpha = .6; g2.fillRect(p.x * cw, p.y * chh, cw, chh); g2.globalAlpha = 1; g2.fillStyle = S.color; g2.fillText(S.tool === 'erase' ? '' : S.ch, p.x * cw, p.y * chh + Math.round((chh - S.zoom) / 2)); } }
        if (S.hover && inside(S.hover.x, S.hover.y)) { g2.strokeStyle = '#4a78ff'; g2.strokeRect(S.hover.x * cw + .5, S.hover.y * chh + .5, cw - 1, chh - 1); }
        if (S.tool === 'type') { g2.fillStyle = '#ffd24a'; g2.fillRect(S.caret.x * cw, S.caret.y * chh + chh - 2, cw, 2); }
      }
      const cellAt = ev => { const r = cv.getBoundingClientRect(); return { x: Math.floor((ev.clientX - r.left) / CW()), y: Math.floor((ev.clientY - r.top) / CH()) }; };
      cv.addEventListener('pointerdown', ev => {
        cv.focus(); cv.setPointerCapture(ev.pointerId); const c = cellAt(ev), f = frame(); if (!inside(c.x, c.y) && S.tool !== 'type') return;
        const right = ev.button === 2, fg = S.color;
        if (S.tool === 'pick') { if (inside(c.x, c.y)) { const ch = f.ch[c.y][c.x]; if (ch !== ' ') { S.ch = ch; S.color = f.fg[c.y][c.x] || S.color; } S.tool = 'pencil'; build(); } return; }
        if (S.tool === 'type') { S.caret = { x: Math.max(0, Math.min(S.doc.w - 1, c.x)), y: Math.max(0, Math.min(S.doc.h - 1, c.y)) }; drawMain(); return; }
        pushUndo(); S.drag = { start: c, last: c, erase: right || S.tool === 'erase' };
        if (S.tool === 'fill') { flood(f, c.x, c.y, S.drag.erase ? ' ' : S.ch, S.drag.erase ? null : fg); S.drag = null; changed(); return; }
        if (S.tool === 'pencil' || S.tool === 'erase') { put(f, c.x, c.y, S.drag.erase ? ' ' : S.ch, fg); changed(); }
      });
      cv.addEventListener('pointermove', ev => {
        const c = cellAt(ev); S.hover = c; const f = frame();
        if (S.drag) {
          if (S.tool === 'pencil' || S.tool === 'erase') { for (const p of lineCells(S.drag.last, c)) put(f, p.x, p.y, S.drag.erase ? ' ' : S.ch, S.color); S.drag.last = c; changed(); return; }
          if (S.tool === 'line') S.preview = lineCells(S.drag.start, c); if (S.tool === 'rect') S.preview = rectCells(S.drag.start, c, ev.shiftKey);
        }
        drawMain();
      });
      cv.addEventListener('pointerup', ev => {
        if (!S.drag) return; const f = frame(), c = cellAt(ev);
        if (S.tool === 'line' || S.tool === 'rect') { for (const p of (S.tool === 'line' ? lineCells(S.drag.start, c) : rectCells(S.drag.start, c, ev.shiftKey))) put(f, p.x, p.y, S.drag.erase ? ' ' : S.ch, S.color); }
        S.drag = null; S.preview = null; changed();
      });
      cv.addEventListener('pointerleave', () => { S.hover = null; drawMain(); });
      cv.addEventListener('contextmenu', e => e.preventDefault());
      cv.addEventListener('keydown', ev => {
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); return ev.shiftKey ? redo() : undo(); }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); return redo(); }
        if (S.tool === 'type') {
          const f = frame(), c = S.caret;
          if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); pushUndo(); put(f, c.x, c.y, ev.key, S.color); if (c.x < S.doc.w - 1) c.x++; else if (c.y < S.doc.h - 1) { c.x = 0; c.y++; } return changed(); }
          if (ev.key === 'Backspace') { ev.preventDefault(); pushUndo(); if (c.x > 0) c.x--; put(f, c.x, c.y, ' ', null); return changed(); }
          const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key]; if (mv) { ev.preventDefault(); c.x = Math.max(0, Math.min(S.doc.w - 1, c.x + mv[0])); c.y = Math.max(0, Math.min(S.doc.h - 1, c.y + mv[1])); return drawMain(); }
          if (ev.key === 'Escape') { S.tool = 'pencil'; return build(); }
          return;
        }
        const k = { p: 'pencil', l: 'line', r: 'rect', f: 'fill', e: 'erase', i: 'pick', t: 'type' }[ev.key.toLowerCase()];
        if (k && !ev.ctrlKey && !ev.metaKey) { S.tool = k; build(); }
      });

      // ---- frames strip + preview
      const strip = h('div', { class: 'frames' }), pv = h('canvas', { style: 'background:#05070d;border:1px solid var(--line);border-radius:6px;max-width:100%' }), pg = pv.getContext('2d');
      let pf = 0, pt = 0, dragFrom = -1;
      function thumb(f, i) {
        const c = h('canvas'), z = Math.max(1.5, Math.min(8, 120 / (S.doc.w * 0.6))), cw = z * .6, chh = z * 1.18, d = devicePixelRatio || 1;
        c.width = S.doc.w * cw * d; c.height = S.doc.h * chh * d; c.style.width = S.doc.w * cw + 'px'; c.style.height = S.doc.h * chh + 'px'; const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); drawFrameTo(x, f, cw, chh, z, 1); return c;
      }
      function drawFrames() {
        strip.textContent = ''; const fs = frames();
        fs.forEach((f, i) => { const el = h('div', { class: 'fr', draggable: true, 'aria-current': i === S.fi, onclick: () => { S.fi = i; changed(false); }, ondragstart: () => (dragFrom = i), ondragover: e => { e.preventDefault(); el.classList.add('drop'); }, ondragleave: () => el.classList.remove('drop'), ondrop: e => { e.preventDefault(); el.classList.remove('drop'); if (dragFrom < 0 || dragFrom === i) return; pushUndo(); const [m] = fs.splice(dragFrom, 1); fs.splice(i, 0, m); S.fi = i; dragFrom = -1; changed(); } }, thumb(f, i), h('div', {}, String(i + 1))); strip.append(el); });
        strip.append(h('button', { title: 'New blank frame', onclick: () => { pushUndo(); fs.splice(S.fi + 1, 0, (() => { const b = blank(S.doc.w, S.doc.h); return b; })()); S.fi++; changed(); } }, '+ Blank'),
          h('button', { title: 'Copy of this frame', onclick: () => { pushUndo(); fs.splice(S.fi + 1, 0, cloneFrame(frame())); S.fi++; changed(); } }, '⎘ Duplicate'),
          h('button', { onclick: () => { if (fs.length < 2) return; pushUndo(); fs.splice(S.fi, 1); S.fi = Math.max(0, S.fi - 1); changed(); } }, '🗑 Delete'),
          h('button', { onclick: () => { if (S.fi > 0) { pushUndo(); [fs[S.fi - 1], fs[S.fi]] = [fs[S.fi], fs[S.fi - 1]]; S.fi--; changed(); } } }, '◀'), h('button', { onclick: () => { if (S.fi < fs.length - 1) { pushUndo(); [fs[S.fi + 1], fs[S.fi]] = [fs[S.fi], fs[S.fi + 1]]; S.fi++; changed(); } } }, '▶'));
      }
      function drawPreview(force) {
        if (!pv.isConnected && !force) return;
        const z = Math.max(1.5, Math.min(14, 320 / (S.doc.w * 0.6))), cw = z * .6, chh = z * 1.18, d = devicePixelRatio || 1, fs = frames(), f = fs[pf % fs.length];
        pv.width = S.doc.w * cw * d; pv.height = S.doc.h * chh * d; pv.style.width = S.doc.w * cw + 'px'; pv.style.height = S.doc.h * chh + 'px'; pg.setTransform(d, 0, 0, d, 0, 0); pg.fillStyle = '#05070d'; pg.fillRect(0, 0, pv.width, pv.height); drawFrameTo(pg, f, cw, chh, z, 1);
      }
      let last = performance.now();
      function tick(now) { if (!el.isConnected && el._seen) return; if (el.isConnected) el._seen = true; if (S.playing && now - last > 1000 / (S.doc.fps || 6)) { last = now; pf = (pf + 1) % Math.max(1, frames().length); drawPreview(); } requestAnimationFrame(tick); }

      // ---- side panels
      const left = h('div', { class: 'side' }), right = h('div', { class: 'side' }), bar = h('div', { class: 'bar' }), stage = h('div', { class: 'stage' }, cv), statusEl = h('div', { class: 'hint' });
      function status() { statusEl.textContent = S.doc.w + '×' + S.doc.h + ' cells · animation “' + S.anim + '” frame ' + (S.fi + 1) + '/' + frames().length; }
      function build() {
        const tool = (id, label, key) => h('button', { 'aria-pressed': S.tool === id, title: label + ' (' + key.toUpperCase() + ')', onclick: () => { S.tool = id; build(); drawMain(); cv.focus(); } }, label);
        bar.textContent = '';
        bar.append(
          h('b', {}, S.doc.name), h('div', { class: 'sep' }),
          h('label', {}, 'Size', h('input', { type: 'number', min: 1, max: 120, value: S.doc.w, style: 'width:58px', onchange: e => { pushUndo(); resizeDoc(S.doc, Math.max(1, Math.min(120, +e.target.value || 1)), S.doc.h); changed(); } }), '×', h('input', { type: 'number', min: 1, max: 80, value: S.doc.h, style: 'width:58px', onchange: e => { pushUndo(); resizeDoc(S.doc, S.doc.w, Math.max(1, Math.min(80, +e.target.value || 1))); changed(); } })),
          h('label', {}, 'FPS', h('input', { type: 'number', min: 1, max: 30, value: S.doc.fps, style: 'width:52px', onchange: e => { S.doc.fps = Math.max(1, Math.min(30, +e.target.value || 6)); ed.markDirty(); } })),
          h('div', { class: 'sep' }),
          h('label', {}, 'Animation', h('select', { onchange: e => { S.anim = e.target.value; S.fi = 0; pf = 0; build(); changed(false); } }, ...Object.keys(S.doc.anims).map(n => h('option', { value: n, selected: n === S.anim }, n)))),
          h('button', { onclick: () => { const n = (prompt('Name of the new animation', 'walk') || '').trim(); if (!n || S.doc.anims[n]) return; pushUndo(); S.doc.anims[n] = [cloneFrame(frame())]; S.anim = n; S.fi = 0; build(); changed(); } }, '+ Animation'),
          h('button', { onclick: () => { const n = (prompt('Rename animation', S.anim) || '').trim(); if (!n || n === S.anim || S.doc.anims[n]) return; pushUndo(); const o = {}; for (const k in S.doc.anims) o[k === S.anim ? n : k] = S.doc.anims[k]; S.doc.anims = o; S.anim = n; build(); changed(); } }, 'Rename'),
          h('button', { onclick: () => { if (Object.keys(S.doc.anims).length < 2 || !confirm('Delete animation "' + S.anim + '"?')) return; pushUndo(); delete S.doc.anims[S.anim]; S.anim = Object.keys(S.doc.anims)[0]; S.fi = 0; build(); changed(); } }, 'Delete'),
          h('div', { class: 'sep' }),
          h('button', { onclick: undo, title: 'Ctrl+Z' }, '↶ Undo'), h('button', { onclick: redo, title: 'Ctrl+Y' }, '↷ Redo'),
          h('button', { title: 'Mirror this frame left to right', onclick: () => { pushUndo(); const f = frame(); const FL = ACI.FLIP_H || {}; for (const k of ['ch', 'fg', 'bg']) f[k] = f[k].map(r => r.slice().reverse()); f.ch = f.ch.map(r => r.map(c => FL[c] || c)); changed(); } }, '⇋ Mirror'),
          h('button', { title: 'Clear this frame', onclick: () => { pushUndo(); const b = blank(S.doc.w, S.doc.h); Object.assign(frame(), b); changed(); } }, 'Clear'),
          h('div', { class: 'sep' }), h('label', { title: 'How many of this sprite\'s cells fit in one map cell. High-res sprites are drawn with finer cells than the world.' }, 'Detail', h('select', { onchange: e => { pushUndo(); S.doc.res = +e.target.value; changed(); } }, [1, 2, 4, 8].map(v => h('option', { value: v, selected: (S.doc.res || 1) === v }, v === 1 ? '1× normal' : v + '× high-res'))), h('span', { class: 'hint' }, (S.doc.res || 1) > 1 ? S.doc.w + '×' + S.doc.h + ' → ' + (S.doc.w / S.doc.res).toFixed(0) + '×' + (S.doc.h / S.doc.res).toFixed(0) + ' map cells' : '')),
          h('div', { class: 'sep' }), h('label', {}, h('input', { type: 'checkbox', checked: S.onion, onchange: e => { S.onion = e.target.checked; drawMain(); } }), 'Onion skin'),
          h('label', {}, h('input', { type: 'checkbox', checked: S.grid, onchange: e => { S.grid = e.target.checked; drawMain(); } }), 'Grid'),
          h('label', {}, 'Zoom', h('input', { type: 'range', min: 2, max: 40, value: S.zoom, style: 'width:90px', oninput: e => { S.zoom = +e.target.value; drawMain(); } })));
        left.textContent = '';
        left.append(
          h('h5', {}, 'Tools'), h('div', { class: 'tools' }, tool('pencil', '✎ Draw', 'p'), tool('line', '╱ Line', 'l'), tool('rect', '▭ Box', 'r'), tool('fill', '◩ Fill', 'f'), tool('erase', '⌫ Erase', 'e'), tool('pick', '⌖ Pick', 'i'), tool('type', 'T Type', 't')),
          h('div', { class: 'hint' }, S.tool === 'type' ? 'Click a cell and type. Arrows move, Esc stops.' : 'Right-click erases. Hold Shift for a filled box.'),
          h('h5', {}, 'Character'), h('div', { class: 'row', style: 'display:flex;gap:6px;align-items:center;margin-bottom:6px' }, h('input', { type: 'text', class: 'big', maxlength: 2, value: S.ch, onchange: e => { const v = [...e.target.value][0]; if (v) S.ch = v; build(); } }), h('select', { onchange: e => { S.mode = e.target.value; } }, ...[['both', 'Draw both'], ['char', 'Character only'], ['colour', 'Colour only']].map(([v, l]) => h('option', { value: v, selected: S.mode === v }, l)))),
          h('div', { class: 'tabs' }, ...Object.keys(GLYPHS).map(t => h('button', { 'aria-pressed': S.tab === t, onclick: () => { S.tab = t; build(); } }, t))),
          h('div', { class: 'glyphs' }, ...[...GLYPHS[S.tab]].map(c => h('button', { 'aria-pressed': S.ch === c, onclick: () => { S.ch = c; if (S.tool === 'pick' || S.tool === 'erase') S.tool = 'pencil'; build(); cv.focus(); } }, c === ' ' ? '␣' : c))),
          h('h5', {}, 'Colour'), h('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:6px' }, h('input', { type: 'color', value: S.color, style: 'width:44px;height:30px;padding:0;background:none;border:1px solid var(--line);border-radius:6px', oninput: e => { S.color = e.target.value; } }), h('span', { class: 'hint', style: 'margin:0' }, S.color)),
          h('div', { class: 'sw' }, ...SWATCHES.map(c => h('button', { style: 'background:' + c, title: c, 'aria-pressed': S.color === c, onclick: () => { S.color = c; build(); } }))),
          h('h5', {}, 'Used in this sprite'), h('div', { class: 'sw' }, ...usedColors().map(c => h('button', { style: 'background:' + c, title: c, onclick: () => { S.color = c; build(); } }))));
        right.textContent = '';
        right.append(h('h5', {}, 'Preview'), pv, h('div', { style: 'display:flex;gap:6px;margin-top:6px' }, h('button', { onclick: () => { S.playing = !S.playing; build(); } }, S.playing ? '⏸ Pause' : '▶ Play')), statusEl,
          h('h5', {}, 'Tips'), h('div', { class: 'hint' }, 'Spaces are transparent. Use frames to animate, then pick the animation by name when you add the sprite to a scene.'));
        status();
      }
      const usedColors = () => { const s = new Set(); for (const n in S.doc.anims) for (const f of S.doc.anims[n]) f.fg.forEach(r => r.forEach(c => c && s.add(c))); return [...s].slice(0, 48); };
      const el = h('div', { class: 'sp' }, bar, left, stage, right, strip);
      build(); drawMain(); drawFrames(); drawPreview(true); requestAnimationFrame(tick);
      return { el, save: () => { const t = toText(S.doc); initial = t; return t; }, dirty: () => toText(S.doc) !== initial };
    },
  });
})();
