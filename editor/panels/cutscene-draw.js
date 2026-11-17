/* ACI editor: cutscene frame painter ("Draw / trace frames").
   window.ACIEditor.cutsceneDraw.open(ed, { path, anim, look, tint, name, onSaved }) -> Promise<handle>
   A full-area overlay for drawing high-density (default 120x45, up to 240x90) rotoscope-style ASCII frames,
   with onion skin, undo/redo, a reference-footage layer (GIF / video / image) and auto-trace.
   Saves assets/<name>.aci.json through ACI.toAsset (per-cell colours). */
(function () {
  'use strict';
  const E = window.ACIEditor; if (!E) return;
  const h = (tag, a, ...kids) => { const el = document.createElement(tag); for (const k in a || {}) { if (k === 'class') el.className = a[k]; else if (k === 'style') el.style.cssText = a[k]; else if (k.startsWith('on')) el.addEventListener(k.slice(2), a[k]); else if (a[k] !== false && a[k] != null) el.setAttribute(k, a[k] === true ? '' : a[k]); } kids.flat().forEach(c => c != null && c !== false && el.append(c.nodeType ? c : document.createTextNode(c))); return el; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const RAMP = ' .:-=+*#%@';
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const FALLBACK = { mono: '#e8e6e0', accent: '#d1332a', levels: 4, contrast: 1.5 };
  const MAXC = 240, MAXR = 90, MONO = '"JetBrains Mono","IBM Plex Mono",Menlo,Consolas,monospace';

  const css = `.cd{position:absolute;inset:0;z-index:50;background:var(--bg);color:var(--ink);font:13px var(--sans);display:flex;flex-direction:column;min-height:0}
  .cd *{box-sizing:border-box} .cd button,.cd select,.cd input{background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:3px 8px;font:inherit;min-width:0} .cd button{cursor:pointer} .cd button:hover{border-color:var(--accent)} .cd button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)} .cd button:disabled{opacity:.45}
  .cd input[type=range]{padding:0;width:90px} .cd input[type=number]{width:62px} .cd input[type=checkbox]{width:auto}
  .cd .bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 10px;background:var(--panel);border-bottom:1px solid var(--line)} .cd .bar.b{border-top:1px solid var(--line);border-bottom:0}
  .cd .hint{color:var(--muted);font-size:12px} .cd .grow{flex:1} .cd .sep{width:1px;align-self:stretch;background:var(--line);margin:0 4px}
  .cd .sw{width:26px;height:26px;border-radius:6px;border:2px solid var(--line);padding:0} .cd .sw[aria-pressed=true]{border-color:var(--ink);background-clip:padding-box}
  .cd .lv{font:14px var(--mono);width:26px;padding:2px 0;text-align:center} .cd .cdst{flex:1;overflow:auto;display:flex;padding:12px;background:#07080c;min-height:0} .cd .cdst.drop{outline:2px dashed var(--ok)}
  .cd canvas.main{margin:auto;border:1px solid var(--line);cursor:crosshair;touch-action:none;image-rendering:pixelated} .cd .strip{display:flex;gap:6px;overflow:auto;padding:6px 10px;background:var(--panel);border-top:1px solid var(--line);min-height:70px;align-items:flex-start}
  .cd .fr{flex:none;border:2px solid var(--line);border-radius:6px;background:#05070d;padding:2px;text-align:center;font-size:10px;color:var(--muted);cursor:pointer} .cd .fr[aria-current=true]{border-color:var(--accent)} .cd .fr.drop{border-color:var(--ok)} .cd .fr canvas{display:block;image-rendering:pixelated}`;

  function quantiser(st) {
    const ACI = window.ACI, rgb = c => ACI.parseColor(c);
    return function (color) {
      if (!color) return color;
      if (!st || st.mono == null) return color;
      const [r, g, b] = rgb(color);
      let lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
      lum = clamp((Math.pow(lum, 0.75) - 0.5) * (st.contrast || 1) + 0.5, 0, 1);
      if (st.levels > 1) lum = Math.round(lum * (st.levels - 1)) / (st.levels - 1);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
      const isAcc = st.accent && sat > 0.35 && lum > 0.12;
      return ACI.mix('#000000', isAcc ? st.accent : st.mono, isAcc ? Math.min(1, lum * 1.9 + 0.25) : lum);
    };
  }
  const blankFrame = (w, hh) => ({ w, h: hh, ch: new Array(w * hh).fill(' '), fg: new Array(w * hh).fill(null) });
  const cp = f => ({ w: f.w, h: f.h, ch: f.ch.slice(), fg: f.fg.slice() });
  const fromSprFrame = f => ({ w: f.w, h: f.h, ch: f.cells.map(c => c.ch), fg: f.cells.map(c => (c.ch === ' ' ? null : c.fg)) });
  const toSprFrame = (f, fallback) => ({ w: f.w, h: f.h, cells: f.ch.map((ch, i) => ({ ch, fg: f.fg[i] || fallback, bg: null })) });

  // ed.ai frames dialog -> .aci.json text (or null when cancelled / unavailable)
  async function aiFrames(ed, o) {
    if (!ed.ai || !ed.ai.dialog) return null; o = o || {};
    const j = await ed.ai.dialog({ kind: 'frames', title: 'Generate frames', frames: o.frames || 8, w: o.w || 120, h: o.h || 45, hint: o.hint || 'mono ASCII, high contrast, one accent colour' });
    if (!j) return null; return ed.ai.toAssetText(j, o.name);
  }
  async function open(ed, o) {
    const ACI = window.ACI; if (!ACI || !ACI.toAsset) throw new Error('ACI core is not loaded');
    if (!document.getElementById('cd-css')) document.head.append(h('style', { id: 'cd-css' }, css));
    o = o || {};
    const path = o.path, name = (o.name || path.replace(/^.*\//, '').replace(/\.aci\.json$/i, ''));
    let spr = null, raw = null;
    try { raw = await ed.fs.read(path); spr = ACI.fromAsset(raw); } catch (e) { spr = null; raw = null; }
    const look = o.look || {};
    const preset = (ACI.cutscene && ACI.cutscene.presets && ACI.cutscene.presets[look.preset || 'rotoscope']) || FALLBACK;
    const st = Object.assign({}, FALLBACK, preset, look.style || {});
    if (st.mono == null) st.mono = FALLBACK.mono;
    const S = { anim: 'default', frames: [], fi: 0, fps: 8, w: 120, h: 45, tool: 'brush', size: 2, round: false, level: 7, dither: false, color: st.mono, rot: true, onion: true, onionNext: false, zoom: 10, grid: false,
      undo: [], redo: [], playing: false, timer: null, dirtyFlag: false, last: null, snap: null, start: null, ref: null, refAlpha: 0.35, thresh: false, thr: 0.5, step: 1, off: 0, vfps: 12, refCache: new Map(), loop: true };
    let others = {};
    if (spr) {
      const names = Object.keys(spr.anims); S.anim = o.anim && spr.anims[o.anim] ? o.anim : (spr.anims.default ? 'default' : names[0]);
      S.fps = spr.fps || 8;
      others = {}; names.forEach(n => { if (n !== S.anim) others[n] = spr.anims[n]; });
      S.frames = spr.anims[S.anim].map(fromSprFrame);
      S.w = clamp(S.frames[0].w, 4, MAXC); S.h = clamp(S.frames[0].h, 4, MAXR);
      S.frames = S.frames.map(f => (f.w === S.w && f.h === S.h ? f : resize(f, S.w, S.h)));
    } else S.frames = [blankFrame(S.w, S.h)];
    function resize(f, w, hh) { const n = blankFrame(w, hh); for (let y = 0; y < Math.min(hh, f.h); y++) for (let x = 0; x < Math.min(w, f.w); x++) { n.ch[y * w + x] = f.ch[y * f.w + x]; n.fg[y * w + x] = f.fg[y * f.w + x]; } return n; }
    const Q = () => (S.rot ? quantiser(st) : c => c);
    const cur = () => S.frames[S.fi];
    const CW = () => Math.ceil(S.zoom * 0.6), CH = () => S.zoom;

    // ---------- UI shell
    const root = h('div', { class: 'cd', 'data-cd': '' });
    const canvas = h('canvas', { class: 'main' }), g = canvas.getContext('2d');
    const cdst = h('div', { class: 'cdst' }, canvas);
    const strip = h('div', { class: 'strip' });
    const status = h('span', { class: 'hint' });
    const bar1 = h('div', { class: 'bar' }), bar2 = h('div', { class: 'bar' }), bar3 = h('div', { class: 'bar b' });
    root.append(bar1, bar2, cdst, strip, bar3);
    const host = o.host || document.querySelector('.cs') || document.body;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(root);
    let dirty = false, closed = false;

    // ---------- history
    const pushUndo = (kind) => { S.undo.push(kind === 'all' ? { all: S.frames.map(cp), fi: S.fi } : { fi: S.fi, f: cp(cur()) }); if (S.undo.length > 40) S.undo.shift(); S.redo.length = 0; };
    const entryNow = e => (e.all ? { all: S.frames.map(cp), fi: S.fi } : { fi: e.fi, f: cp(S.frames[e.fi]) });
    const apply = e => { if (e.all) { S.frames = e.all; } else S.frames[e.fi] = e.f; S.fi = clamp(e.fi, 0, S.frames.length - 1); S.w = cur().w; S.h = cur().h; dirty = true; refreshAll(); };
    const undo = () => { const e = S.undo.pop(); if (!e) return; S.redo.push(entryNow(e)); apply(e); };
    const redo = () => { const e = S.redo.pop(); if (!e) return; S.undo.push(entryNow(e)); apply(e); };
    const touch = () => { dirty = true; };

    // ---------- painting primitives
    const colorNow = () => Q()(S.color);
    function stamp(f, x, y, erase) {
      if (x < 0 || y < 0 || x >= f.w || y >= f.h) return; const i = y * f.w + x;
      if (erase || S.level === 0) { f.ch[i] = ' '; f.fg[i] = null; return; }
      if (S.dither) { if (S.level / 9 > (BAYER[y & 3][x & 3] + 0.5) / 16) { f.ch[i] = '#'; f.fg[i] = colorNow(); } return; }
      f.ch[i] = RAMP[S.level]; f.fg[i] = colorNow();
    }
    function brushAt(f, cx, cy, erase) {
      const n = S.size, lo = -Math.floor((n - 1) / 2), hi = Math.ceil((n - 1) / 2);
      for (let dy = lo; dy <= hi; dy++) for (let dx = lo; dx <= hi; dx++) {
        if (S.round && n > 2) { const ox = dx - (lo + hi) / 2, oy = dy - (lo + hi) / 2; if (Math.hypot(ox, oy) > n / 2) continue; }
        stamp(f, cx + dx, cy + dy, erase);
      }
    }
    function lineCells(x0, y0, x1, y1, fn) { let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy; for (;;) { fn(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
    function rectCells(x0, y0, x1, y1, filled, fn) { const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1); for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) if (filled || x === a || x === b || y === c || y === d) fn(x, y); }
    function fill(f, x0, y0, erase) {
      if (x0 < 0 || y0 < 0 || x0 >= f.w || y0 >= f.h) return; const k = i => f.ch[i] + '|' + f.fg[i], want = k(y0 * f.w + x0), seen = new Uint8Array(f.w * f.h), q = [[x0, y0]], cells = [];
      while (q.length) { const [x, y] = q.pop(); if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue; const i = y * f.w + x; if (seen[i] || k(i) !== want) continue; seen[i] = 1; cells.push([x, y]); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
      cells.forEach(([x, y]) => stamp(f, x, y, erase));
    }
    const cellAt = ev => { const r = canvas.getBoundingClientRect(); return [clamp(Math.floor((ev.clientX - r.left) / r.width * S.w), 0, S.w - 1), clamp(Math.floor((ev.clientY - r.top) / r.height * S.h), 0, S.h - 1)]; };
    function shape(ev, x, y) {
      const f = cur(), base = S.snap; f.ch = base.ch.slice(); f.fg = base.fg.slice(); const er = S.tool === 'eraser';
      if (S.tool === 'line') lineCells(S.start[0], S.start[1], x, y, (a, b) => brushAt(f, a, b, false));
      else rectCells(S.start[0], S.start[1], x, y, ev.shiftKey, (a, b) => stamp(f, a, b, false));
      void er;
    }
    canvas.addEventListener('pointerdown', ev => {
      if (S.playing) return; ev.preventDefault(); canvas.setPointerCapture(ev.pointerId);
      const [x, y] = cellAt(ev), f = cur(), erase = S.tool === 'eraser' || ev.button === 2;
      if (S.tool === 'eyedrop') { const i = y * f.w + x, li = RAMP.indexOf(f.ch[i]); if (li >= 0) S.level = li; if (f.fg[i]) S.color = f.fg[i]; buildBars(); return; }
      pushUndo('frame'); touch();
      if (S.tool === 'fill') { fill(f, x, y, erase); redraw(); drawThumb(S.fi); return; }
      S.drag = true; S.start = [x, y]; S.last = [x, y]; S.snap = cp(f);
      if (S.tool === 'brush' || S.tool === 'eraser') brushAt(f, x, y, erase); else shape(ev, x, y);
      S.erase = erase; redraw();
    });
    canvas.addEventListener('pointermove', ev => {
      const [x, y] = cellAt(ev); status.textContent = 'x ' + x + ' y ' + y + ' · frame ' + (S.fi + 1) + '/' + S.frames.length + ' · ' + S.w + '×' + S.h;
      if (!S.drag) return; const f = cur();
      if (S.tool === 'brush' || S.tool === 'eraser') { lineCells(S.last[0], S.last[1], x, y, (a, b) => brushAt(f, a, b, S.erase)); S.last = [x, y]; } else shape(ev, x, y);
      redraw();
    });
    const endDrag = () => { if (!S.drag) return; S.drag = false; S.snap = null; drawThumb(S.fi); };
    canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag); canvas.addEventListener('contextmenu', e => e.preventDefault());

    // ---------- reference footage
    function refCount() { return S.ref ? S.ref.n : 0; }
    const refIdx = () => clamp(S.off + S.fi * S.step, 0, Math.max(0, refCount() - 1));
    function srcSize(s) { return [s.videoWidth || s.naturalWidth || s.width, s.videoHeight || s.naturalHeight || s.height]; }
    function refSource(idx) {
      const R = S.ref; if (!R) return null;
      if (R.kind === 'canvases') return R.items[idx] || null;
      if (R.kind === 'gif') { if (!R.cache[idx]) { const fr = R.gif.frames[idx], c = document.createElement('canvas'); c.width = R.gif.width; c.height = R.gif.height; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(fr.data), c.width, c.height), 0, 0); R.cache[idx] = c; } return R.cache[idx]; }
      if (R.kind === 'image') return R.el;
      if (R.kind === 'video') {
        if (R.cache[idx]) return R.cache[idx];
        R.queue = R.queue.then(() => new Promise(res => { if (R.cache[idx] || closed) return res(); const v = R.el; const done = () => { v.removeEventListener('seeked', done); const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; try { c.getContext('2d').drawImage(v, 0, 0); R.cache[idx] = c; } catch (e) {} res(); }; v.addEventListener('seeked', done); v.currentTime = Math.min(idx / S.vfps, Math.max(0, v.duration - 0.01)); setTimeout(done, 2500); })).then(() => { if (!closed) redraw(); });
        return null;
      }
      return null;
    }
    // reference contain-fitted into a W x H canvas (cached while unchanged)
    function refCanvas(idx, W, H, thresh) {
      const s = refSource(idx); if (!s) return null;
      const key = [idx, W, H, thresh ? S.thr : -1, S.ref.id].join('/'); if (S.refCache.key === key) return S.refCache.c;
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      const [sw, sh] = srcSize(s); if (!sw || !sh) return null; const k = Math.min(W / sw, H / sh); x.drawImage(s, (W - sw * k) / 2, (H - sh * k) / 2, sw * k, sh * k);
      if (thresh) { const d = x.getImageData(0, 0, W, H), p = d.data, t = S.thr * 255; for (let i = 0; i < p.length; i += 4) { const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2], v = l >= t ? 255 : 0; p[i] = p[i + 1] = p[i + 2] = v; } x.putImageData(d, 0, 0); }
      S.refCache = { key, c }; return c;
    }
    async function setReference(src) {
      S.refCache = {}; let R = null; const id = Math.random();
      if (Array.isArray(src)) R = { kind: 'canvases', items: src, n: src.length, id };
      else if (src && (src.getContext || src.tagName === 'IMG')) R = { kind: 'canvases', items: [src], n: 1, id };
      else if (src && src.name !== undefined && src.arrayBuffer) {
        const f = src;
        if (/gif/i.test(f.type) || /\.gif$/i.test(f.name)) { if (!ACI.convert || !ACI.convert.decodeGif) throw new Error('GIF support needs modules/convert.js'); const gif = ACI.convert.decodeGif(await f.arrayBuffer()); R = { kind: 'gif', gif, cache: [], n: gif.frames.length, id }; }
        else if (/^video/i.test(f.type) || /\.(mp4|webm|mov|ogv|m4v)$/i.test(f.name)) {
          const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(f);
          await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('that video could not be opened')); });
          R = { kind: 'video', el: v, cache: [], queue: Promise.resolve(), n: Math.max(1, Math.floor((v.duration || 1) * S.vfps)), id, url: v.src };
        } else { const url = URL.createObjectURL(f); const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('that image could not be opened')); i.src = url; }); R = { kind: 'image', el: im, n: 1, id }; }
      } else throw new Error('unsupported reference');
      S.ref = R; if (S.refAlpha < 0.1) S.refAlpha = 0.35; buildBars(); redraw();
    }
    const clearRef = () => { S.ref = null; S.refCache = {}; buildBars(); redraw(); };
    async function pickFiles(files) { const f = files && files[0]; if (!f) return; try { await setReference(f); } catch (e) { ed.log && ed.log(e.message, 'error'); alert(e.message); } }
    cdst.addEventListener('dragover', e => { e.preventDefault(); cdst.classList.add('drop'); }); cdst.addEventListener('dragleave', () => cdst.classList.remove('drop'));
    cdst.addEventListener('drop', e => { e.preventDefault(); cdst.classList.remove('drop'); pickFiles(e.dataTransfer && e.dataTransfer.files); });

    function autoTrace() {
      if (!S.ref) return; if (!ACI.convert || !ACI.convert.image) { alert('Auto-trace needs modules/convert.js'); return; }
      const W = S.w * CW(), H = S.h * CH(), src = refCanvas(refIdx(), W, H, false); if (!src) { alert('The footage frame is still loading; try again in a moment.'); return; }
      const sp = ACI.convert.image(src, { cols: S.w, rows: S.h, fit: 'stretch', ramp: 'detailed', color: true, dither: 'none', contrast: 1.5, mode: 'luma', bg: 'none', autoLevels: true });
      const fr = Object.values(sp.anims)[0][0], q = Q(), f = blankFrame(S.w, S.h);
      for (let i = 0; i < f.ch.length && i < fr.cells.length; i++) { const c = fr.cells[i]; if (c.ch === ' ') continue; const [r, gg, bb] = ACI.parseColor(c.fg), lum = (0.3 * r + 0.59 * gg + 0.11 * bb) / 255; if (lum < 0.14) continue; f.ch[i] = c.ch; f.fg[i] = q(c.fg); }
      pushUndo('frame'); S.frames[S.fi] = f; touch(); redraw(); drawThumb(S.fi);
    }

    // ---------- rendering
    let raf = 0; const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
    function glyphs(f, fgOverride, alpha) {
      g.globalAlpha = alpha; const cw = CW(), ch = CH(); g.textBaseline = 'top'; let last = null;
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const i = y * f.w + x, c = f.ch[i]; if (c === ' ') continue; const col = fgOverride || f.fg[i] || '#e8e8e8'; if (col !== last) { g.fillStyle = col; last = col; } g.fillText(c, x * cw, y * ch); }
      g.globalAlpha = 1;
    }
    function paint(playFrame) {
      const cw = CW(), ch = CH(), W = S.w * cw, H = S.h * ch; if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      g.fillStyle = '#07080c'; g.fillRect(0, 0, W, H);
      const f = playFrame != null ? S.frames[playFrame] : cur();
      if (S.ref && playFrame == null) { const rc = refCanvas(refIdx(), W, H, S.thresh); if (rc) { g.globalAlpha = S.refAlpha; g.drawImage(rc, 0, 0); g.globalAlpha = 1; } }
      g.font = Math.max(6, Math.round(ch * 0.9)) + 'px ' + MONO;
      if (S.grid) { g.strokeStyle = 'rgba(255,255,255,.06)'; g.beginPath(); for (let x = 0; x <= S.w; x += 10) { g.moveTo(x * cw + .5, 0); g.lineTo(x * cw + .5, H); } for (let y = 0; y <= S.h; y += 10) { g.moveTo(0, y * ch + .5); g.lineTo(W, y * ch + .5); } g.stroke(); }
      if (S.onion && playFrame == null) { if (S.fi > 0) glyphs(S.frames[S.fi - 1], st.accent || '#d1332a', 0.35); if (S.onionNext && S.fi < S.frames.length - 1) glyphs(S.frames[S.fi + 1], '#4a78ff', 0.3); }
      glyphs(f, null, 1);
    }
    const thumbs = [];
    function drawThumb(i) {
      const c = thumbs[i], f = S.frames[i]; if (!c || !f) return; if (c.width !== f.w || c.height !== f.h) { c.width = f.w; c.height = f.h; c.style.width = Math.min(120, f.w) + 'px'; c.style.height = Math.min(120, f.w) * f.h / f.w * 1.0 + 'px'; }
      const x = c.getContext('2d'), d = x.createImageData(f.w, f.h), q = window.ACI.parseColor;
      for (let k = 0; k < f.ch.length; k++) { const li = RAMP.indexOf(f.ch[k]); if (f.ch[k] === ' ') continue; const [r, gg, b] = q(f.fg[k] || '#e8e8e8'); d.data[k * 4] = r; d.data[k * 4 + 1] = gg; d.data[k * 4 + 2] = b; d.data[k * 4 + 3] = li < 0 ? 255 : 60 + li * 22; }
      x.putImageData(d, 0, 0);
    }
    function buildStrip() {
      strip.textContent = ''; thumbs.length = 0; let from = -1;
      S.frames.forEach((f, i) => { const c = h('canvas'); thumbs[i]; thumbs[i] = c; const card = h('div', { class: 'fr', draggable: true, 'data-i': i, 'aria-current': i === S.fi, title: 'Click to edit this frame. Drag to reorder.', onclick: () => { stopPlay(); S.fi = i; refreshAll(); },
        ondragstart: () => { from = i; }, ondragover: e => { e.preventDefault(); card.classList.add('drop'); }, ondragleave: () => card.classList.remove('drop'),
        ondrop: e => { e.preventDefault(); card.classList.remove('drop'); if (from < 0 || from === i) return; pushUndo('all'); const [m] = S.frames.splice(from, 1); S.frames.splice(i, 0, m); S.fi = i; from = -1; touch(); refreshAll(); } }, c, h('div', {}, String(i + 1))); strip.append(card); drawThumb(i); });
    }

    // ---------- play preview
    function stopPlay() { if (S.timer) clearInterval(S.timer); S.timer = null; S.playing = false; if (!closed) { buildBars(); redraw(); } }
    function startPlay() { if (S.playing) return stopPlay(); S.playing = true; let k = S.fi; paint(k); S.timer = setInterval(() => { k++; if (k >= S.frames.length) { if (S.loop) k = 0; else return stopPlay(); } paint(k); }, 1000 / S.fps); buildBars(); }

    // ---------- toolbars
    const btn = (label, title, fn, extra) => h('button', Object.assign({ title, onclick: fn }, extra || {}), label);
    function tog(label, title, key, extra) { return h('button', Object.assign({ title, 'aria-pressed': !!S[key], onclick: () => { S[key] = !S[key]; buildBars(); redraw(); } }, extra || {}), label); }
    const rng = (key, min, max, step, on) => h('input', { type: 'range', min, max, step, value: S[key], oninput: e => { S[key] = +e.target.value; if (on) on(); redraw(); } });
    function buildBars() {
      const tools = [['brush', 'Brush (B)', 'Brush'], ['eraser', 'Eraser (E, or right-click)', 'Eraser'], ['line', 'Line (L): drag from start to end', 'Line'], ['rect', 'Rectangle (R): drag; hold Shift to fill', 'Box'], ['fill', 'Fill (F): floods a same-looking area', 'Fill'], ['eyedrop', 'Eyedropper (I): picks ink level and colour', 'Pick']];
      bar1.textContent = '';
      bar1.append(h('b', {}, 'Draw frames'), h('span', { class: 'hint' }, name), h('span', { class: 'sep' }),
        ...tools.map(([id, t, l]) => h('button', { 'data-tool': id, title: t, 'aria-pressed': S.tool === id, onclick: () => { S.tool = id; buildBars(); } }, l)),
        h('span', { class: 'sep' }), h('label', { class: 'hint', title: 'Brush size 1 to 6 ([ and ])' }, 'Size ', h('input', { type: 'number', min: 1, max: 6, value: S.size, 'data-k': 'size', onchange: e => { S.size = clamp(+e.target.value || 1, 1, 6); buildBars(); } })),
        h('button', { title: 'Round or square brush', 'aria-pressed': S.round, onclick: () => { S.round = !S.round; buildBars(); } }, S.round ? 'Round' : 'Square'),
        h('button', { title: 'Dither brush: a checkered pattern that gets denser with the ink level', 'data-k': 'dither', 'aria-pressed': S.dither, onclick: () => { S.dither = !S.dither; buildBars(); } }, 'Dither'),
        h('span', { class: 'grow' }), btn('Undo', 'Ctrl+Z', undo), btn('Redo', 'Ctrl+Y', redo),
        ed.ai ? btn('✦ Generate with Claude', 'Ask Claude to draw frames; they replace the current frames (undoable), then Save', async () => {
          try { const t = await aiFrames(ed, { name, w: Math.min(S.w, 80), h: Math.min(S.h, 30), hint: o.hint }); if (!t) return; const sp = ACI.fromAsset(t), a = sp.anims[Object.keys(sp.anims)[0]]; if (!a || !a.length) throw new Error('Claude returned no frames'); pushUndo('all'); S.frames = a.map(fromSprFrame).map(f => (f.w === S.w && f.h === S.h ? f : resize(f, S.w, S.h)));   /* keep the canvas size; smaller answers are padded */ S.fi = 0; touch(); refreshAll(); } catch (e) { ed.log && ed.log('Generate failed: ' + (e && e.message || e), 'error'); }
        }, { 'data-act': 'ai' }) : h('button', { disabled: true, title: 'AI generation is not available in this editor', style: 'display:none' }, '✦'),
        btn('Save', 'Ctrl+S: writes ' + path, () => save(false), { class: 'sv', 'data-act': 'save' }), btn('Save & close', 'Save and go back to the cutscene', () => save(true), { 'data-act': 'saveclose' }), btn('Close', 'Leave without saving', () => close(), { 'data-act': 'close' }));
      bar2.textContent = '';
      const swatch = (col, label) => h('button', { class: 'sw', title: label + ' (' + col + ')', 'data-sw': label, 'aria-pressed': S.color === col, style: 'background:' + Q()(col), onclick: () => { S.color = col; buildBars(); } });
      bar2.append(h('span', { class: 'hint', title: 'Ink level: how dense the character is. Keys 1-9; 0 = empty.' }, 'Ink'),
        ...[...RAMP].map((c, i) => h('button', { class: 'lv', 'data-lv': i, title: 'Level ' + i + ' (key ' + i + ')', 'aria-pressed': S.level === i, onclick: () => { S.level = i; buildBars(); } }, c === ' ' ? '␣' : c)),
        h('span', { class: 'sep' }), h('span', { class: 'hint' }, 'Colour'), swatch(st.mono, 'mono'), swatch(st.accent || '#d1332a', 'accent'), ...(o.tint ? [swatch(o.tint, 'tint')] : []),
        h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(S.color) ? S.color : '#ffffff', title: 'Any colour', style: 'padding:0;width:30px;height:26px', onchange: e => { S.color = e.target.value; buildBars(); } }),
        h('label', { class: 'hint', title: 'Snaps every colour to the cutscene look (mono + one accent, few levels), exactly like the player does' }, h('input', { type: 'checkbox', 'data-k': 'rot', checked: S.rot, onchange: e => { S.rot = e.target.checked; buildBars(); redraw(); } }), ' Rotoscope look'),
        h('span', { class: 'sep' }), tog('Onion skin', 'Ghost the previous frame in the accent colour (O)', 'onion', { 'data-k': 'onion' }), tog('+ next', 'Also ghost the next frame (blue)', 'onionNext'), tog('Grid', 'Faint guide lines every 10 cells', 'grid'),
        h('label', { class: 'hint', title: 'Cell size on screen' }, 'Zoom ', h('input', { type: 'range', min: 6, max: 18, step: 1, value: S.zoom, oninput: e => { S.zoom = +e.target.value; redraw(); } })),
        h('span', { class: 'sep' }), h('label', { class: 'hint', title: 'Canvas size in characters (max 240 x 90). Existing drawings are cropped or padded.' }, 'Canvas ', h('input', { type: 'number', min: 4, max: MAXC, value: S.w, 'data-k': 'cols', id: 'cd-cols' }), ' × ', h('input', { type: 'number', min: 4, max: MAXR, value: S.h, 'data-k': 'rows', id: 'cd-rows' })),
        btn('Resize', 'Apply the canvas size', () => { const w = clamp(+bar2.querySelector('#cd-cols').value || S.w, 4, MAXC), hh = clamp(+bar2.querySelector('#cd-rows').value || S.h, 4, MAXR); if (w === S.w && hh === S.h) return; pushUndo('all'); S.frames = S.frames.map(f => resize(f, w, hh)); S.w = w; S.h = hh; refreshAll(); touch(); }, { 'data-act': 'resize' }));
      bar3.textContent = '';
      const R = S.ref;
      bar3.append(btn(S.playing ? 'Stop' : 'Play', 'Preview the frames at the chosen speed (Space)', startPlay, { 'data-act': 'play' }), h('label', { class: 'hint' }, 'FPS ', h('input', { type: 'number', min: 1, max: 30, value: S.fps, 'data-k': 'fps', onchange: e => { S.fps = clamp(+e.target.value || 8, 1, 30); touch(); if (S.playing) { stopPlay(); startPlay(); } } })), tog('Loop', 'Loop the preview', 'loop'),
        h('span', { class: 'sep' }), btn('+ Blank', 'Add an empty frame after this one', () => { pushUndo('all'); S.frames.splice(S.fi + 1, 0, blankFrame(S.w, S.h)); S.fi++; touch(); refreshAll(); }, { 'data-act': 'addframe' }),
        btn('Duplicate', 'Copy this frame (a good start for the next pose)', () => { pushUndo('all'); S.frames.splice(S.fi + 1, 0, cp(cur())); S.fi++; touch(); refreshAll(); }, { 'data-act': 'dupframe' }),
        btn('Delete', 'Delete this frame', () => { if (S.frames.length < 2) return; pushUndo('all'); S.frames.splice(S.fi, 1); S.fi = Math.min(S.fi, S.frames.length - 1); touch(); refreshAll(); }, { 'data-act': 'delframe' }),
        btn('◀', 'Previous frame (,)', () => go(-1)), btn('▶', 'Next frame (.)', () => go(1)),
        h('span', { class: 'sep' }), h('b', { class: 'hint' }, 'Trace'),
        btn(R ? 'Change footage' : 'Reference footage…', 'Load a GIF, video or picture and trace over it (or drop a file here)', () => fileIn.click(), { 'data-act': 'ref' }));
      if (R) bar3.append(h('label', { class: 'hint', title: 'How visible the footage is under your drawing' }, 'Opacity ', h('input', { type: 'range', min: 0, max: 0.8, step: 0.05, value: S.refAlpha, 'data-k': 'refAlpha', oninput: e => { S.refAlpha = +e.target.value; redraw(); } })),
        tog('High contrast', 'Show the footage as pure black and white, easier to see edges', 'thresh', { 'data-k': 'thresh' }), S.thresh ? rng('thr', 0.1, 0.9, 0.05) : null,
        h('label', { class: 'hint', title: 'Use every Nth footage frame for your frames' }, 'Every ', h('input', { type: 'number', min: 1, max: 60, value: S.step, 'data-k': 'step', onchange: e => { S.step = clamp(+e.target.value || 1, 1, 60); redraw(); } }), 'th'),
        h('label', { class: 'hint', title: 'Start the footage from this frame' }, 'Offset ', h('input', { type: 'number', min: -999, max: 9999, value: S.off, 'data-k': 'off', onchange: e => { S.off = +e.target.value || 0; redraw(); } })),
        R.kind === 'video' ? h('label', { class: 'hint', title: 'How many footage frames per second of video to step through' }, 'Footage fps ', h('input', { type: 'number', min: 1, max: 60, value: S.vfps, onchange: e => { S.vfps = clamp(+e.target.value || 12, 1, 60); R.n = Math.max(1, Math.floor((R.el.duration || 1) * S.vfps)); R.cache = []; redraw(); } })) : null,
        h('span', { class: 'hint' }, 'footage frame ' + (refIdx() + 1) + '/' + R.n), btn('Auto-trace this frame', 'Turns the footage frame into characters as a starting point, then touch it up (replaces this frame; undoable)', autoTrace, { 'data-act': 'autotrace' }), btn('Remove', 'Remove the footage', clearRef));
      bar3.append(status);
    }
    const fileIn = h('input', { type: 'file', accept: 'image/*,video/*,.gif', style: 'display:none', onchange: e => { pickFiles(e.target.files); e.target.value = ''; } }); root.append(fileIn);
    function go(d) { stopPlay(); S.fi = clamp(S.fi + d, 0, S.frames.length - 1); refreshAll(); }
    function refreshAll() { buildBars(); buildStrip(); redraw(); }

    // ---------- keys
    const onKey = ev => {
      if (closed || !root.isConnected) return; const t = ev.target; if (t && (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox' || t.tagName === 'TEXTAREA')) return;
      const k = ev.key.toLowerCase();
      if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); return ev.shiftKey ? redo() : undo(); }
      if ((ev.ctrlKey || ev.metaKey) && k === 'y') { ev.preventDefault(); return redo(); }
      if ((ev.ctrlKey || ev.metaKey) && k === 's') { ev.preventDefault(); return save(false); }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (/^[0-9]$/.test(k)) { S.level = +k; return buildBars(); }
      const T = { b: 'brush', e: 'eraser', l: 'line', r: 'rect', f: 'fill', i: 'eyedrop' };
      if (T[k]) { S.tool = T[k]; return buildBars(); }
      if (k === '[') { S.size = clamp(S.size - 1, 1, 6); return buildBars(); } if (k === ']') { S.size = clamp(S.size + 1, 1, 6); return buildBars(); }
      if (k === 'o') { S.onion = !S.onion; buildBars(); return redraw(); } if (k === ',') return go(-1); if (k === '.') return go(1);
      if (k === ' ') { ev.preventDefault(); return startPlay(); }
    };
    document.addEventListener('keydown', onKey);

    // ---------- save / close
    async function save(andClose) {
      stopPlay(); const before = raw, q = c => c;
      const anims = {}; Object.keys(others).forEach(n => (anims[n] = others[n]));
      anims[S.anim] = S.frames.map(f => toSprFrame(f, st.mono || '#e8e8e8'));
      const order = {}; if (!others[S.anim]) { order[S.anim] = anims[S.anim]; Object.keys(others).forEach(n => (order[n] = others[n])); }
      const sp = ACI.sprite(Object.keys(order).length ? order : anims, { fps: S.fps, bg: spr && spr.bg || null, name }); void q;
      const json = ACI.toAsset(sp, name), text = JSON.stringify(json, null, 1);
      await ed.fs.write(path, text); raw = text; dirty = false;
      const fresh = ACI.fromAsset(json);
      try { if (ed.game) { (ed.game.assets = ed.game.assets || {})[name] = fresh; } if (ed.assets && typeof ed.assets === 'object') ed.assets[name] = fresh; } catch (e) {}
      ed.refreshAssets && ed.refreshAssets(); ed.markDirty && ed.markDirty();
      ed.undo && ed.undo.push && ed.undo.push('Draw cutscene frames', async () => { if (before == null) await ed.fs.remove(path); else await ed.fs.write(path, before); ed.refreshAssets && ed.refreshAssets(); }, async () => { await ed.fs.write(path, text); ed.refreshAssets && ed.refreshAssets(); });
      ed.log && ed.log('Saved ' + path + ' (' + S.frames.length + ' frame' + (S.frames.length === 1 ? '' : 's') + ')');
      o.onSaved && o.onSaved({ path, name, anim: S.anim, fps: S.fps, frames: S.frames.length, w: S.w, h: S.h });
      if (andClose) close(true);
    }
    function close(force) {
      if (closed) return; if (!force && dirty && !confirm('You have unsaved drawing changes. Close without saving?')) return;
      closed = true; stopPlay(); document.removeEventListener('keydown', onKey); if (S.ref && S.ref.url) URL.revokeObjectURL(S.ref.url); root.remove(); o.onClose && o.onClose();
    }
    refreshAll();
    const handle = { el: root, state: S, setReference, save, close, autoTrace, paint, undo, redo, frames: () => S.frames, isDirty: () => dirty };
    E.cutsceneDraw.current = handle; return handle;
  }

  E.cutsceneDraw = { open, aiFrames };
})();
