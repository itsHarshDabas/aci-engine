/*!
 * ACI Renderer Engine — core v0.2
 * Everything on screen is a character in a grid.
 *
 *   const game = ACI.game('#screen', { world: { cols: 300, rows: 120 } });
 *   game.layer((x, y, t) => ['/', '#3a7']);                 // background "shader", world coords
 *   const hero = game.add(ACI.sprite(String.raw` o \n/|\ \n/ \ `), { x: 10, y: 5 });
 *   game.follow(hero);
 *   game.onUpdate(dt => { if (game.key('ArrowRight')) hero.x += 12 * dt; });
 *
 * Modules extend every game with ACI.plugin(name, (game, opts) => {...}).
 * Agents drive a game with JSON through game.command({...}) — see 'help'.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const FLIP_V = { '/': '\\', '\\': '/', '^': 'v', 'v': '^', "'": ',', ',': "'", '`': '.', '.': "'", '_': '‾', '‾': '_', 'M': 'W', 'W': 'M', 'A': 'V', 'V': 'A', 'n': 'u', 'u': 'n', 'm': 'w', 'w': 'm', 'T': '⊥' };
  const FLIP_H = { '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<', '[': ']', ']': '[', '{': '}', '}': '{', 'd': 'b', 'b': 'd', 'p': 'q', 'q': 'p' };

  function hash(x, y, s = 0) {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise(x, y, s = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s = 0) { return noise(x, y, s) * 0.6 + noise(x * 2.1, y * 2.1, s + 7) * 0.3 + noise(x * 4.3, y * 4.3, s + 13) * 0.1; }

  function parseColor(c) {
    if (Array.isArray(c)) return c;
    c = String(c || '#fff');
    if (c[0] === '#') {
      if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    const m = c.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [255, 255, 255];
  }
  const hex2 = n => ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
  function toHex(rgb) { return '#' + hex2(rgb[0]) + hex2(rgb[1]) + hex2(rgb[2]); }
  const mixCache = new Map();
  // mix two colours; t is quantised to 1/16 so the renderer can batch by colour
  function mix(a, b, t) {
    t = Math.round(Math.max(0, Math.min(1, t)) * 16) / 16;
    const k = a + b + t; let r = mixCache.get(k);
    if (!r) { const A = parseColor(a), B = parseColor(b); r = toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); if (mixCache.size > 20000) mixCache.clear(); mixCache.set(k, r); }
    return r;
  }

  // strip blank first/last lines and common indentation of template-string art
  function parseArt(text) {
    let lines = String(text).replace(/\t/g, '  ').replace(/\r/g, '').split('\n');
    while (lines.length && lines[0].trim() === '') lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
    return lines.map(l => l.slice(ind === Infinity ? 0 : ind).replace(/\s+$/, ''));
  }

  // ---------------------------------------------------------------- sprites
  /**
   * ACI.sprite(art, opts)
   *   art:    a string, an array of strings (frames), or { animName: [frames] }
   *   opts.color:   default colour       opts.colors: colour map (same shape, each char a palette key)
   *   opts.palette: { key: '#hex' }      opts.fps: animation speed (6)
   *   opts.solid:   draw spaces too      opts.bg: background colour for drawn cells
   */
  function sprite(art, opts = {}) {
    const anims = {};
    const asFrames = a => (Array.isArray(a) ? a : [a]);
    if (typeof art === 'string' || Array.isArray(art)) anims.default = asFrames(art);
    else Object.keys(art).forEach(k => (anims[k] = asFrames(art[k])));
    const colorMaps = opts.colors ? (typeof opts.colors === 'string' || Array.isArray(opts.colors) ? { [Object.keys(anims)[0]]: asFrames(opts.colors) } : opts.colors) : {};
    const palette = opts.palette || {};
    const def = opts.color || '#e8e8e8';
    const out = { anims: {}, fps: opts.fps || 6, solid: !!opts.solid, bg: opts.bg || null, w: 0, h: 0, name: opts.name || null, res: Math.max(1, Math.round(opts.res || 1)) };  // HIRES: res = cells per world cell (1,2,4,8)
    const firstMap = Object.values(colorMaps)[0];
    for (const name in anims) {
      out.anims[name] = anims[name].map((f, fi) => {
        if (f && f.cells) { out.w = Math.max(out.w, f.w); out.h = Math.max(out.h, f.h); return f; }
        const lines = parseArt(f);
        const maps = colorMaps[name] ? asFrames(colorMaps[name]) : (firstMap ? asFrames(firstMap) : null);
        const cm = maps ? parseArt(maps[Math.min(fi, maps.length - 1)]) : null;
        const w = Math.max(0, ...lines.map(l => l.length)), h = lines.length;
        const cells = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const ch = lines[y][x] || ' ';
          const key = cm && cm[y] ? cm[y][x] : null;
          cells.push({ ch, fg: (key && palette[key]) || def, bg: out.bg });
        }
        out.w = Math.max(out.w, w); out.h = Math.max(out.h, h);
        return { w, h, cells };
      });
    }
    return out;
  }
  function frameOf(spr, anim, i = 0) { const a = spr.anims[anim] || spr.anims.default || Object.values(spr.anims)[0]; return a[i % a.length]; }

  // first/last non-space column of each row, cached per frame
  function rowSpans(f) {
    if (f._spans) return f._spans;
    f._spans = [];
    for (let j = 0; j < f.h; j++) {
      let a = f.w, b = -1;
      for (let i = 0; i < f.w; i++) if (f.cells[j * f.w + i].ch !== ' ') { if (i < a) a = i; b = i; }
      f._spans.push([a, b]);
    }
    return f._spans;
  }

  // ---------------------------------------------------------------- asset files (.aci.json)
  /*  { "aci": 1, "name": "hero", "w": 3, "h": 2, "fps": 6, "palette": {"a": "#e8c870"},
   *    "anims": { "idle": [ { "text": [" o ", "/|\\"], "colors": [" a ", "aaa"] } ] } }
   *  A frame may use "fg": [["#hex", ...], ...] instead of colors/palette (for converted images),
 *  and an optional "bg": [["#hex"|null, ...], ...] grid for per-cell backgrounds.  */
  const KEYS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function toAsset(spr, name) {
    const colors = new Set();
    for (const a in spr.anims) for (const f of spr.anims[a]) for (const c of f.cells) if (c.ch !== ' ') colors.add(c.fg);
    const usePalette = colors.size <= KEYS.length;
    const palette = {}, rev = {};
    [...colors].forEach((c, i) => { if (usePalette) { palette[KEYS[i]] = c; rev[c] = KEYS[i]; } });
    const anims = {};
    for (const a in spr.anims) anims[a] = spr.anims[a].map(f => {
      const text = [], cl = [], fg = [], bgg = []; let anyBg = false;
      for (let y = 0; y < f.h; y++) {
        let t = '', c = ''; const row = [], brow = [];
        for (let x = 0; x < f.w; x++) {
          const cell = f.cells[y * f.w + x]; t += cell.ch; c += cell.ch === ' ' ? ' ' : (rev[cell.fg] || ' '); row.push(cell.ch === ' ' ? null : cell.fg);
          const b = cell.bg && cell.bg !== spr.bg ? cell.bg : null; if (b) anyBg = true; brow.push(b);
        }
        text.push(t.replace(/\s+$/, '')); cl.push(c.replace(/\s+$/, '')); fg.push(row); bgg.push(brow);
      }
      const fr = usePalette ? { text, colors: cl } : { text, fg };
      if (anyBg) fr.bg = bgg;   // optional per-cell background grid
      return fr;
    });
    const out = { aci: 1, name: name || spr.name || 'asset', w: spr.w, h: spr.h, fps: spr.fps, anims };
    if (usePalette) out.palette = palette;
    if (spr.bg) out.bg = spr.bg;
    if (spr.solid) out.solid = true;
    if (spr.res > 1) out.res = spr.res;   // HIRES
    if (spr.frameDelays) out.delays = spr.frameDelays;   // ms per frame (GIF/video), for cutscenes
    return out;
  }
  function fromAsset(a) {
    if (typeof a === 'string') a = JSON.parse(a);
    if (!a || !a.anims) throw new Error('not an ACI asset: needs "anims"');
    const pal = a.palette || {};
    const anims = {};
    for (const name in a.anims) anims[name] = a.anims[name].map(f => {
      const text = Array.isArray(f.text) ? f.text : String(f.text || f).split('\n');
      const cl = f.colors ? (Array.isArray(f.colors) ? f.colors : String(f.colors).split('\n')) : null;
      const w = Math.max(+a.w || 0, ...text.map(l => l.length)), h = Math.max(+a.h || 0, text.length), cells = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ch = (text[y] || '')[x] || ' ';
        let fgc = a.color || '#e8e8e8';
        if (f.fg && f.fg[y] && f.fg[y][x]) fgc = f.fg[y][x];
        else if (cl && cl[y] && pal[cl[y][x]]) fgc = pal[cl[y][x]];
        const bgc = Array.isArray(f.bg) && f.bg[y] && f.bg[y][x] ? f.bg[y][x] : (a.bg || null);
        cells.push({ ch, fg: fgc, bg: bgc });
      }
      return { w, h, cells };
    });
    const spr = sprite(anims, { fps: a.fps, solid: a.solid, bg: a.bg, name: a.name, res: a.res });
    if (Array.isArray(a.delays)) spr.frameDelays = a.delays;
    return spr;
  }
  async function loadAsset(url) { const r = await fetch(url); if (!r.ok) throw new Error('could not load ' + url); return fromAsset(await r.json()); }

  // ---------------------------------------------------------------- image -> ascii
  const RAMPS = {
    standard: ' .:-=+*#%@',
    detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    blocks: ' ░▒▓█',
    grass: " .,'\"/|\\#",
  };
  /** ACI.fromImage(img|canvas, {cols, ramp, color, invert, alphaCut, aspect, tint}) -> sprite */
  function fromImage(src, opts = {}) {
    const cols = opts.cols || 60, aspect = opts.aspect || 0.55;
    const ramp = RAMPS[opts.ramp] || opts.ramp || RAMPS.standard;
    const iw = src.naturalWidth || src.videoWidth || src.width, ih = src.naturalHeight || src.videoHeight || src.height;
    const rows = Math.max(1, Math.round(cols * (ih / iw) * aspect));
    const c = document.createElement('canvas'); c.width = cols; c.height = rows;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0, cols, rows);
    const d = x.getImageData(0, 0, cols, rows).data;
    const cells = [];
    for (let i = 0; i < cols * rows; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3] / 255;
      let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (opts.invert) lum = 1 - lum;
      const ch = a < (opts.alphaCut ?? 0.1) ? ' ' : ramp[Math.min(ramp.length - 1, Math.max(opts.color === false ? 0 : 1, Math.round(lum * (ramp.length - 1))))];
      const fgc = opts.color === false ? (opts.tint || '#e8e8e8') : toHex([r, g, b].map(v => Math.round(v / 16) * 16));
      cells.push({ ch, fg: fgc, bg: null });
    }
    return sprite([{ w: cols, h: rows, cells }], { solid: false });
  }
  function loadImage(url) {
    return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
  }
  function toText(spr, anim = 'default', frame = 0) {
    const f = frameOf(spr, anim, frame);
    let s = '';
    for (let y = 0; y < f.h; y++) { for (let x = 0; x < f.w; x++) s += f.cells[y * f.w + x].ch; s += '\n'; }
    return s.replace(/ +\n/g, '\n');
  }

  // ---------------------------------------------------------------- plugins
  const plugins = [];
  /** ACI.plugin(name, (game, opts) => api) — runs for every game created afterwards.
   *  Whatever it returns is available as game.plugins[name]. */
  function plugin(name, setup) { plugins.push({ name, setup }); return ACI; }

  // ---------------------------------------------------------------- game
  function game(target, opts = {}) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block'; canvas.tabIndex = 0; canvas.style.outline = 'none'; canvas.style.touchAction = 'none';
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: false });
    const font = opts.font || '"JetBrains Mono", "IBM Plex Mono", Menlo, Consolas, monospace';
    const bgColor = opts.background || '#0a0e1a';

    const G = {
      cols: 0, rows: 0,               // world size in cells
      viewCols: 0, viewRows: 0,       // screen size in cells
      camera: { x: 0, y: 0, target: null, lerp: 0.12 },
      time: 0, fontSize: opts.fontSize || 12, cellW: 0, cellH: 0,
      entities: [], layers: [], masks: {}, assets: {}, plugins: {}, paused: false, fps: 0,
      canvas, host, mix, noise, fbm, hash, ACI: null,
    };
    let fixedWorld = opts.world ? { cols: opts.world.cols, rows: opts.world.rows } : null;
    let ch = [], fg = [], bg = [];
    const updaters = [], drawers = [], listeners = {};
    const keys = new Set();

    function emit(ev, data) { (listeners[ev] || []).forEach(f => { try { f(data); } catch (e) { console.error('[ACI] ' + ev + ' handler:', e); } }); }
    G.on = (ev, f) => { (listeners[ev] = listeners[ev] || []).push(f); return G; };
    G.off = (ev, f) => { listeners[ev] = (listeners[ev] || []).filter(x => x !== f); return G; };
    G.emit = emit;
    G.onUpdate = f => { updaters.push(f); return G; };
    G.onDraw = f => { drawers.push(f); return G; };

    function measure() {
      ctx.font = `${G.fontSize}px ${font}`;
      G.cellW = Math.ceil(ctx.measureText('M').width);
      G.cellH = Math.ceil(G.fontSize * 1.18);
    }
    function resize() {
      measure();
      const r = host.getBoundingClientRect();
      const vc = opts.cols || Math.max(20, Math.floor(r.width / G.cellW));
      const vr = opts.rows || Math.max(10, Math.floor((r.height || 400) / G.cellH));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = vc * G.cellW * dpr; canvas.height = vr * G.cellH * dpr;
      canvas.style.width = vc * G.cellW + 'px'; canvas.style.height = vr * G.cellH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const viewChanged = vc !== G.viewCols || vr !== G.viewRows;
      G.viewCols = vc; G.viewRows = vr;
      ch = new Array(vc * vr); fg = new Array(vc * vr); bg = new Array(vc * vr);
      const wc = fixedWorld ? fixedWorld.cols : vc, wr = fixedWorld ? fixedWorld.rows : vr;
      const worldChanged = wc !== G.cols || wr !== G.rows;
      G.cols = wc; G.rows = wr;
      if (worldChanged) for (const m in G.masks) buildMask(m);
      clampCamera(true);
      if (viewChanged || worldChanged) emit('resize', G);
    }
    /** change the character size at runtime (e.g. smaller on phones) */
    G.setFontSize = px => { if (px !== G.fontSize) { G.fontSize = px; resize(); } return G; };
    /** change the world size at runtime (e.g. after loading a tilemap) */
    G.setWorld = (cols, rows) => { fixedWorld = { cols, rows }; resize(); return G; };

    // ---- camera
    function clampCamera(snap) {
      const c = G.camera;
      if (c.target) {
        const t = c.target, tx = t.x + (t.w || 0) / 2 - G.viewCols / 2, ty = t.y + (t.h || 0) / 2 - G.viewRows / 2;
        if (snap) { c.x = tx; c.y = ty; } else { c.x += (tx - c.x) * c.lerp; c.y += (ty - c.y) * c.lerp; }
      }
      c.x = Math.max(0, Math.min(Math.max(0, G.cols - G.viewCols), c.x));
      c.y = Math.max(0, Math.min(Math.max(0, G.rows - G.viewRows), c.y));
    }
    G.follow = (e, o = {}) => { G.camera.target = e; if (o.lerp) G.camera.lerp = o.lerp; clampCamera(true); return G; };
    G.lookAt = (x, y) => { G.camera.target = null; G.camera.x = x - G.viewCols / 2; G.camera.y = y - G.viewRows / 2; clampCamera(); return G; };
    G.toScreen = (x, y) => ({ x: Math.round(x) - Math.round(G.camera.x), y: Math.round(y) - Math.round(G.camera.y) });
    G.toWorld = (sx, sy) => ({ x: sx + Math.round(G.camera.x), y: sy + Math.round(G.camera.y) });
    G.inView = (x, y, pad = 0) => { const s = G.toScreen(x, y); return s.x >= -pad && s.y >= -pad && s.x < G.viewCols + pad && s.y < G.viewRows + pad; };

    // ---- drawing primitives: WORLD coords
    function putScreen(x, y, c, f, b) {
      if (x < 0 || y < 0 || x >= G.viewCols || y >= G.viewRows) return;
      const i = y * G.viewCols + x;
      if (c != null) ch[i] = c; if (f) fg[i] = f; if (b !== undefined && b !== null) bg[i] = b;
    }
    let camX = 0, camY = 0; // integer camera for the current frame
    G.put = (x, y, c, f, b) => putScreen(Math.round(x) - camX, Math.round(y) - camY, c, f, b);
    G.get = (x, y) => { const sx = Math.round(x) - camX, sy = Math.round(y) - camY; if (sx < 0 || sy < 0 || sx >= G.viewCols || sy >= G.viewRows) return null; const i = sy * G.viewCols + sx; return { ch: ch[i], fg: fg[i], bg: bg[i] }; };
    G.text = (x, y, str, f = '#fff', b) => { str = String(str); for (let i = 0; i < str.length; i++) G.put(x + i, y, str[i], f, b); };
    function boxWith(put) {
      return (x, y, w, h, f = '#888', b) => {
        for (let i = 0; i < w; i++) { put(x + i, y, '─', f, b); put(x + i, y + h - 1, '─', f, b); }
        for (let j = 0; j < h; j++) { put(x, y + j, '│', f, b); put(x + w - 1, y + j, '│', f, b); }
        put(x, y, '┌', f, b); put(x + w - 1, y, '┐', f, b); put(x, y + h - 1, '└', f, b); put(x + w - 1, y + h - 1, '┘', f, b);
      };
    }
    G.box = boxWith(G.put);
    // SCREEN coords (HUDs, menus): unaffected by the camera
    G.screen = {
      put: (x, y, c, f, b) => putScreen(Math.round(x), Math.round(y), c, f, b),
      text: (x, y, str, f = '#fff', b) => { str = String(str); for (let i = 0; i < str.length; i++) putScreen(Math.round(x) + i, Math.round(y), str[i], f, b); },
      fill: (x, y, w, h, c = ' ', f, b) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) putScreen(x + i, y + j, c, f, b); },
    };
    G.screen.box = boxWith(G.screen.put);
    G.drawSprite = (spr, x, y, o = {}) => {
      const f = frameOf(spr, o.anim, o.frame || 0);
      if (spr.res > 1) { hires.push({ f, x, y, res: spr.res, screen: !!o.screen, flip: !!o.flipX, tint: o.tint || null, amt: o.tintAmt ?? 0.5, solid: spr.solid }); return; }  // HIRES
      x = Math.round(x); y = Math.round(y);
      const span = rowSpans(f);
      for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
        const sx = o.flipX ? f.w - 1 - i : i;
        const cell = f.cells[j * f.w + sx];
        if (cell.ch === ' ' && !spr.solid) {
          // spaces *inside* a shape are blanked so it reads cleanly over busy ground
          if (o.clear !== false && sx > span[j][0] && sx < span[j][1]) G.put(x + i, y + j, ' ');
          continue;
        }
        const c = o.flipX ? (FLIP_H[cell.ch] || cell.ch) : cell.ch;
        G.put(x + i, y + j, c, o.tint ? mix(cell.fg, o.tint, o.tintAmt ?? 0.5) : cell.fg, cell.bg);
      }
    };

    // ---- layers: background "shaders" fn(x, y, t, game) -> [ch, fg, bg?] | null, in world coords
    G.layer = (fn, z = 0) => { const L = { fn, z }; G.layers.push(L); G.layers.sort((a, b) => a.z - b.z); return L; };
    G.removeLayer = L => { G.layers = G.layers.filter(x => x !== L && x.fn !== L); return G; };
    // ---- masks: named boolean regions of the world (water, rock, wall…)
    G.mask = (name, fn) => { G.masks[name] = { fn, grid: null }; buildMask(name); return G; };
    function buildMask(name) {
      const m = G.masks[name]; m.grid = new Uint8Array(G.cols * G.rows);
      for (let y = 0; y < G.rows; y++) for (let x = 0; x < G.cols; x++) m.grid[y * G.cols + x] = m.fn(x, y, G) ? 1 : 0;
    }
    G.is = (name, x, y) => {
      x = Math.round(x); y = Math.round(y);
      const m = G.masks[name]; if (!m || x < 0 || y < 0 || x >= G.cols || y >= G.rows) return false;
      return !!m.grid[y * G.cols + x];
    };
    G.setMask = (name, x, y, v) => { const m = G.masks[name]; if (m && x >= 0 && y >= 0 && x < G.cols && y < G.rows) m.grid[y * G.cols + x] = v ? 1 : 0; };

    // ---- entities (world coords)
    let nextId = 1;
    G.add = (spr, o = {}) => {
      if (typeof spr === 'string' || Array.isArray(spr)) spr = sprite(spr, o);
      const e = Object.assign({ id: nextId++, x: 0, y: 0, z: 0, anim: 'default', frame: 0, ft: 0, flipX: false, reflect: false, label: null, labelColor: '#cfe', update: null, owner: null, tags: [] }, o, { sprite: spr });
      if (!spr.anims[e.anim]) e.anim = Object.keys(spr.anims)[0];
      e.play = name => { if (e.anim !== name && e.sprite.anims[name]) { e.anim = name; e.frame = 0; e.ft = 0; } return e; };
      e.say = (text, secs = 3) => { e.bubble = String(text); e.bubbleUntil = G.time + secs; return e; };
      e.setSprite = s => { e.sprite = s; if (!s.anims[e.anim]) e.anim = Object.keys(s.anims)[0]; e.frame = 0; return e; };
      Object.defineProperty(e, 'w', { get: () => e.sprite.w / (e.sprite.res || 1), configurable: true });
      Object.defineProperty(e, 'h', { get: () => e.sprite.h / (e.sprite.res || 1), configurable: true });
      G.entities.push(e); emit('add', e); return e;
    };
    G.remove = e => { if (!e) return; G.entities = G.entities.filter(x => x !== e); if (G.camera.target === e) G.camera.target = null; emit('remove', e); };
    G.find = name => G.entities.find(e => e.name === name);
    G.findAll = pred => G.entities.filter(typeof pred === 'function' ? pred : e => e.tags.includes(pred) || e.owner === pred);
    G.blocked = null; // optional (x, y, e) => bool, used by built-in walkers; physics modules may set it

    // ---- reflections: entities with reflect:true are mirrored into a mask (e.g. 'water')
    G.reflections = { mask: null, tint: '#1a2a55', amount: 0.55, wobble: 0.7 };
    G.reflect = (mask, o = {}) => { Object.assign(G.reflections, o, { mask }); return G; };
    function drawReflection(e) {
      const R = G.reflections, f = frameOf(e.sprite, e.anim, e.frame);
      if (e.sprite.res > 1) return;  // HIRES: no reflections yet
      const ex = Math.round(e.x), ey = Math.round(e.y);
      const cx = ex + Math.floor(f.w / 2);
      let base = ey + f.h;
      for (let k = 0; k < 5; k++) if (G.is(R.mask, cx, ey + f.h + k)) { base = ey + f.h + k; break; }
      const span = rowSpans(f);
      for (let j = 0; j < f.h; j++) {
        const ry = base + (f.h - 1 - j);
        const wob = Math.round(Math.sin(G.time * 2.6 + ry * 0.9) * R.wobble);
        for (let i = 0; i < f.w; i++) {
          const sx = e.flipX ? f.w - 1 - i : i;
          const cell = f.cells[j * f.w + sx];
          const rx = ex + i + wob;
          if (cell.ch === ' ') { if (sx > span[j][0] && sx < span[j][1] && G.is(R.mask, rx, ry)) G.put(rx, ry, ' '); continue; }
          if (!G.is(R.mask, rx, ry)) continue;
          if (hash(rx, ry, Math.floor(G.time * 5)) < 0.12) continue; // ripple breakup
          let c = e.flipX ? (FLIP_H[cell.ch] || cell.ch) : cell.ch;
          c = FLIP_V[c] || c;
          G.put(rx, ry, c, mix(cell.fg, R.tint, R.amount + ((f.h - 1 - j) / f.h) * 0.25));
        }
      }
    }

    // ---- input
    const keyName = k => (k.length === 1 ? k.toLowerCase() : k);
    const onKeyDown = ev => {
      if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
      const k = keyName(ev.key);
      if (!keys.has(k)) emit('key', { key: k, down: true });
      keys.add(k);
      if (ev.key.startsWith('Arrow') || ev.key === ' ') ev.preventDefault();
    };
    const onKeyUp = ev => { const k = keyName(ev.key); keys.delete(k); emit('key', { key: k, down: false }); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => keys.clear());
    G.key = (...names) => names.some(n => keys.has(keyName(n)));
    G.keys = keys;
    G.pointer = { x: -1, y: -1, sx: -1, sy: -1, down: false };
    const toCell = ev => {
      const r = canvas.getBoundingClientRect();
      const sx = Math.floor((ev.clientX - r.left) / G.cellW), sy = Math.floor((ev.clientY - r.top) / G.cellH);
      const w = G.toWorld(sx, sy); return { sx, sy, x: w.x, y: w.y };
    };
    canvas.addEventListener('pointermove', ev => Object.assign(G.pointer, toCell(ev)));
    canvas.addEventListener('pointerdown', ev => { canvas.focus(); Object.assign(G.pointer, toCell(ev), { down: true }); emit('click', { ...G.pointer }); });
    window.addEventListener('pointerup', () => (G.pointer.down = false));

    // ---- frame
    function compose() {
      const N = G.viewCols * G.viewRows, t = G.time, VC = G.viewCols, VR = G.viewRows;
      hires.length = 0;
      camX = Math.round(G.camera.x); camY = Math.round(G.camera.y);
      for (let i = 0; i < N; i++) { ch[i] = ' '; fg[i] = '#fff'; bg[i] = null; }
      for (const L of G.layers) {
        for (let sy = 0; sy < VR; sy++) {
          const y = sy + camY; if (y < 0 || y >= G.rows) continue;
          let i = sy * VC;
          for (let sx = 0; sx < VC; sx++, i++) {
            const x = sx + camX; if (x < 0 || x >= G.cols) continue;
            const r = L.fn(x, y, t, G); if (!r) continue;
            if (r[0] != null) ch[i] = r[0]; if (r[1]) fg[i] = r[1]; if (r[2]) bg[i] = r[2];
          }
        }
      }
      const pad = 12;
      const ents = G.entities.filter(e => !e.hidden && G.inView(e.x, e.y, pad + Math.max(e.w, e.h * (e.reflect ? 2 : 1))))
        .sort((a, b) => a.z - b.z || (a.y + a.h) - (b.y + b.h));
      if (G.reflections.mask) ents.forEach(e => e.reflect && drawReflection(e));
      ents.forEach(e => G.drawSprite(e.sprite, e.x, e.y, e));
      if (hires.length) snap = { ch: ch.slice(), fg: fg.slice(), bg: bg.slice() }; else snap = null;   // HIRES: labels/HUD paint above hi-res sprites
      emit('drawEntities', G);
      ents.forEach(e => { if (e.label) G.text(Math.round(e.x + e.w / 2 - e.label.length / 2), Math.round(e.y) - 1, e.label, e.labelColor); });
      ents.forEach(e => {
        if (e.bubble && G.time < e.bubbleUntil) {
          const s = ' ' + e.bubble + ' ', bx = Math.round(e.x + e.w / 2 - s.length / 2), by = Math.round(e.y) - (e.label ? 4 : 3);
          G.box(bx - 1, by - 1, s.length + 2, 3, '#9ab', '#0a0e1a'); G.text(bx, by, s, '#fff', '#0a0e1a');
        }
      });
      drawers.forEach(f => f(G));
    }
    let snap = null;
    // ---- WebGL glyph-atlas backend (renderer:'webgl' | 'auto' picks it for >= 20k cells). Same grid, same look, 10-50x faster
    // for dense / fine-cell worlds with per-cell colour. Falls back to canvas 2D if WebGL2 is unavailable.
    const GLS = { gl: null, tried: false, atlas: null, actx: null, tex: null, map: new Map(), next: 1, key: '', dirty: false, cols: new Map(), inst: null, cap: 0 };
    function useGL() {
      const want = opts.renderer || 'auto';
      if (want === 'canvas') return false;
      if (want === 'auto' && G.viewCols * G.viewRows < 20000) return false;
      if (!GLS.tried) { GLS.tried = true; try { initGL(); } catch (e) { GLS.gl = null; console.warn('[ACI] WebGL unavailable, using canvas 2D:', e.message); } }
      return !!GLS.gl;
    }
    function initGL() {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false });
      if (!gl) throw new Error('no webgl2');
      const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, `#version 300 es
in vec4 a_fg; in vec4 a_bg; in float a_g;
uniform vec2 u_cells, u_cellpx, u_canvas, u_atlas, u_acell; uniform float u_per;
out vec2 v_uv; out vec4 v_fg; out vec4 v_bg;
void main(){
  vec2 q = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  float i = float(gl_InstanceID); float cy = floor(i / u_cells.x); float cx = i - cy * u_cells.x;
  vec2 p = (vec2(cx, cy) + q) * u_cellpx;
  gl_Position = vec4(p.x / u_canvas.x * 2.0 - 1.0, 1.0 - p.y / u_canvas.y * 2.0, 0.0, 1.0);
  float gy = floor(a_g / u_per); float gx = a_g - gy * u_per;
  v_uv = (vec2(gx, gy) * u_acell + q * u_cellpx) / u_atlas; v_fg = a_fg; v_bg = a_bg;
}`));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `#version 300 es
precision mediump float; in vec2 v_uv; in vec4 v_fg; in vec4 v_bg; uniform sampler2D u_tex; out vec4 o;
void main(){ float g = texture(u_tex, v_uv).a; o = vec4(v_fg.rgb * g + v_bg.rgb * v_bg.a * (1.0 - g), g + v_bg.a * (1.0 - g)); }`));
      gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      GLS.gl = gl; GLS.cv = c; GLS.pr = pr;
      GLS.u = {}; for (const n of ['u_cells', 'u_cellpx', 'u_canvas', 'u_atlas', 'u_acell', 'u_per', 'u_tex']) GLS.u[n] = gl.getUniformLocation(pr, n);
      GLS.vao = gl.createVertexArray(); GLS.buf = { fg: gl.createBuffer(), bg: gl.createBuffer(), g: gl.createBuffer() };
      GLS.tex = gl.createTexture();
      GLS.aSize = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
      GLS.atlas = document.createElement('canvas'); GLS.atlas.width = GLS.atlas.height = GLS.aSize; GLS.actx = GLS.atlas.getContext('2d', { willReadFrequently: false });
    }
    function glSetup(dpr) {
      const gl = GLS.gl, cwp = G.cellW * dpr, chp = G.cellH * dpr, key = cwp + 'x' + chp + '|' + G.fontSize + '|' + dpr;
      if (key !== GLS.key) {   // cell size / font changed: rebuild atlas
        GLS.key = key; GLS.map.clear(); GLS.next = 1; GLS.acw = Math.ceil(cwp); GLS.ach = Math.ceil(chp);
        GLS.per = Math.floor(GLS.aSize / GLS.acw); GLS.rowsA = Math.floor(GLS.aSize / GLS.ach);
        GLS.actx.clearRect(0, 0, GLS.aSize, GLS.aSize); GLS.dirty = true;
      }
      if (GLS.cv.width !== canvas.width || GLS.cv.height !== canvas.height) { GLS.cv.width = canvas.width; GLS.cv.height = canvas.height; }
      return [cwp, chp];
    }
    function glyphIndex(chr, dpr, chp) {
      let g = GLS.map.get(chr); if (g !== undefined) return g;
      if (GLS.next >= GLS.per * GLS.rowsA) { GLS.map.clear(); GLS.next = 1; GLS.actx.clearRect(0, 0, GLS.aSize, GLS.aSize); }
      g = GLS.next++; GLS.map.set(chr, g);
      const a = GLS.actx, x = (g % GLS.per) * GLS.acw, y = ((g / GLS.per) | 0) * GLS.ach;
      a.save(); a.beginPath(); a.rect(x, y, GLS.acw, GLS.ach); a.clip();
      a.font = `${G.fontSize * dpr}px ${font}`; a.textBaseline = 'top'; a.fillStyle = '#fff';
      const cp = chr.codePointAt(0), bw = GLS.acw, bh = GLS.ach, cwp = G.cellW * dpr, chp2 = G.cellH * dpr;
      if (cp >= 0x2580 && cp <= 0x259f) {   // block elements are drawn as exact rectangles so neighbours tile with no gaps
        const R = (x0, y0, x1, y1, al) => { a.globalAlpha = al || 1; a.fillRect(x + Math.round(x0 * cwp), y + Math.round(y0 * chp2), Math.round(x1 * cwp) - Math.round(x0 * cwp), Math.round(y1 * chp2) - Math.round(y0 * chp2)); a.globalAlpha = 1; };
        const Q = { 0x2580: [0, 0, 1, .5], 0x2584: [0, .5, 1, 1], 0x2588: [0, 0, 1, 1], 0x258c: [0, 0, .5, 1], 0x2590: [.5, 0, 1, 1], 0x2596: [0, .5, .5, 1], 0x2597: [.5, .5, 1, 1], 0x2598: [0, 0, .5, .5], 0x259d: [.5, 0, 1, .5] };
        if (Q[cp]) R(...Q[cp]); else if (cp === 0x2591) R(0, 0, 1, 1, .25); else if (cp === 0x2592) R(0, 0, 1, 1, .5); else if (cp === 0x2593) R(0, 0, 1, 1, .75);
        else if (cp === 0x259a) { R(0, 0, .5, .5); R(.5, .5, 1, 1); } else if (cp === 0x259e) { R(.5, 0, 1, .5); R(0, .5, .5, 1); } else a.fillText(chr, x, y + Math.round((chp - G.fontSize * dpr) / 2));
        a.restore(); GLS.dirty = true; return g;
      }
      a.fillText(chr, x, y + Math.round((chp - G.fontSize * dpr) / 2)); a.restore(); GLS.dirty = true; return g;
    }
    const packCol = c => { let v = GLS.cols.get(c); if (v === undefined) { const m = parseColor(c); v = ((m[0] & 255) | (m[1] & 255) << 8 | (m[2] & 255) << 16 | 255 << 24) >>> 0; if (GLS.cols.size > 50000) GLS.cols.clear(); GLS.cols.set(c, v); } return v; };
    function glCells(C, F, B, only) {
      const gl = GLS.gl, dpr = Math.min(2, window.devicePixelRatio || 1), N = G.viewCols * G.viewRows;
      const [cwp, chp] = glSetup(dpr);
      if (GLS.cap < N) { GLS.cap = N; GLS.fgA = new Uint32Array(N); GLS.bgA = new Uint32Array(N); GLS.gA = new Float32Array(N); }
      const fgA = GLS.fgA, bgA = GLS.bgA, gA = GLS.gA;
      let lastF = null, lastFv = 0, lastB = null, lastBv = 0;
      for (let i = 0; i < N; i++) {
        if (only && !only[i]) { gA[i] = 0; bgA[i] = 0; fgA[i] = 0; continue; }
        const c = C[i], f = F[i], b = B[i];
        if (b) { if (b !== lastB) { lastB = b; lastBv = packCol(b); } bgA[i] = lastBv; } else bgA[i] = 0;
        if (c === ' ' || c == null) { gA[i] = 0; fgA[i] = 0; } else { gA[i] = glyphIndex(c, dpr, chp); if (f !== lastF) { lastF = f; lastFv = packCol(f || '#fff'); } fgA[i] = lastFv; }
      }
      gl.viewport(0, 0, GLS.cv.width, GLS.cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.BLEND);
      gl.useProgram(GLS.pr); gl.bindVertexArray(GLS.vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, GLS.tex);
      if (GLS.dirty) { gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, GLS.atlas); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); GLS.dirty = false; }
      const attr = (name, buf, data, size, type, norm) => { const loc = gl.getAttribLocation(GLS.pr, name); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, N), gl.STREAM_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, norm, 0, 0); gl.vertexAttribDivisor(loc, 1); };
      attr('a_fg', GLS.buf.fg, fgA, 4, gl.UNSIGNED_BYTE, true); attr('a_bg', GLS.buf.bg, bgA, 4, gl.UNSIGNED_BYTE, true); attr('a_g', GLS.buf.g, gA, 1, gl.FLOAT, false);
      const u = GLS.u;
      gl.uniform2f(u.u_cells, G.viewCols, G.viewRows); gl.uniform2f(u.u_cellpx, cwp, chp); gl.uniform2f(u.u_canvas, GLS.cv.width, GLS.cv.height);
      gl.uniform2f(u.u_atlas, GLS.aSize, GLS.aSize); gl.uniform2f(u.u_acell, GLS.acw, GLS.ach); gl.uniform1f(u.u_per, GLS.per); gl.uniform1i(u.u_tex, 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);
      ctx.drawImage(GLS.cv, 0, 0, G.viewCols * G.cellW, G.viewRows * G.cellH);
    }
    G.renderer = () => (useGL() ? 'webgl' : 'canvas');
    function paintCells(C, F, B, only) {
      if (useGL()) return glCells(C, F, B, only);
      const cw = G.cellW, chh = G.cellH, cols = G.viewCols;
      for (let y = 0; y < G.viewRows; y++) {
        let x = 0;
        while (x < cols) {
          const b = B[y * cols + x]; if (!b || (only && !only[y * cols + x])) { x++; continue; }
          let x2 = x + 1; while (x2 < cols && B[y * cols + x2] === b && (!only || only[y * cols + x2])) x2++;
          ctx.fillStyle = b; ctx.fillRect(x * cw, y * chh, (x2 - x) * cw, chh); x = x2;
        }
      }
      const groups = new Map();
      for (let i = 0; i < C.length; i++) {
        const c = C[i]; if (c === ' ' || c == null || (only && !only[i])) continue;
        let g = groups.get(F[i]); if (!g) groups.set(F[i], (g = [])); g.push(i);
      }
      ctx.font = `${G.fontSize}px ${font}`; ctx.textBaseline = 'top';
      const oy = Math.round((chh - G.fontSize) / 2);
      for (const [color, idx] of groups) {
        ctx.fillStyle = color;
        for (const i of idx) ctx.fillText(C[i], (i % cols) * cw, ((i / cols) | 0) * chh + oy);
      }
    }
    function paint() {
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, G.viewCols * G.cellW, G.viewRows * G.cellH);
      if (!snap) { paintCells(ch, fg, bg, null); return; }
      paintCells(snap.ch, snap.fg, snap.bg, null); paintHires();
      const only = new Uint8Array(ch.length); let any = false;
      for (let i = 0; i < ch.length; i++) if (ch[i] !== snap.ch[i] || fg[i] !== snap.fg[i] || bg[i] !== snap.bg[i]) { only[i] = 1; any = true; }
      if (any) paintCells(ch, fg, bg, only);
    }
    // HIRES: sprites with res>1 are baked once per frame into an offscreen canvas of fine cells, then blitted
    const hires = [], baked = [];
    function bakeHires(h) {
      const { f, res } = h, cw = G.cellW, chh = G.cellH, sw = cw / res, sh = chh / res;
      const key = cw + 'x' + chh + '|' + h.flip + '|' + h.tint + '|' + h.amt;
      if (f._hr && f._hr.key === key) return f._hr.cv;
      const cv = f._hr && f._hr.cv || document.createElement('canvas');
      cv.width = Math.max(1, Math.ceil(f.w * sw)); cv.height = Math.max(1, Math.ceil(f.h * sh));
      if (sh < 6) return bakeFast(h, cv, sw, sh, key);   // fine cells: per-pixel coverage, ~20x faster than fillText
      const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height);
      const col = i => { const cell = f.cells[i]; return h.tint ? mix(cell.fg, h.tint, h.amt) : cell.fg; };
      const at = (i, j) => f.cells[j * f.w + (h.flip ? f.w - 1 - i : i)];
      for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {   // backgrounds, run-length by colour
        const b = at(i, j).bg; if (!b) continue;
        let i2 = i + 1; while (i2 < f.w && at(i2, j).bg === b) i2++;
        c.fillStyle = b; c.fillRect(Math.floor(i * sw), Math.floor(j * sh), Math.ceil((i2 - i) * sw) + 1, Math.ceil(sh) + 1); i = i2 - 1;
      }
      const groups = new Map();
      for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
        const cell = at(i, j); if (cell.ch === ' ') continue;
        const k = h.tint ? mix(cell.fg, h.tint, h.amt) : cell.fg; let g = groups.get(k); if (!g) groups.set(k, (g = [])); g.push(i, j, h.flip ? (FLIP_H[cell.ch] || cell.ch) : cell.ch);
      }
      c.font = `${Math.max(2, G.fontSize / res)}px ${font}`; c.textBaseline = 'top';
      const oy = Math.round((sh - G.fontSize / res) / 2);
      for (const [color, g] of groups) { c.fillStyle = color; for (let n = 0; n < g.length; n += 3) c.fillText(g[n + 2], g[n] * sw, g[n + 1] * sh + oy); }
      if (!f._hr) { baked.push(f); if (baked.length > 48) { const old = baked.shift(); old._hr = null; } }   // LRU: cap memory for long GIF/video sprites
      f._hr = { key, cv }; return cv;
    }
    // ---- fast path for fine cells: write pixels straight into ImageData (no per-cell fillText)
    const rgbCache = new Map(), densCache = new Map();
    const rgbOf = c => { let v = rgbCache.get(c); if (v === undefined) { const m = parseColor(c); v = m ? (m[0] | m[1] << 8 | m[2] << 16) : 0xffffff; rgbCache.set(c, v); if (rgbCache.size > 20000) rgbCache.clear(); } return v; };
    function density(chr) {   // average ink of a glyph, measured once
      let d = densCache.get(chr); if (d !== undefined) return d;
      const c = document.createElement('canvas'); c.width = 16; c.height = 32; const x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#fff'; x.font = `24px ${font}`; x.textBaseline = 'middle'; x.fillText(chr, 2, 16);
      const px = x.getImageData(0, 0, 16, 32).data; let t = 0; for (let i = 3; i < px.length; i += 4) t += px[i];
      d = Math.min(1, t / 255 / (16 * 32) * 3.2); densCache.set(chr, d); return d;
    }
    const BRAILLE_BIT = [[0, 1, 2, 6], [3, 4, 5, 7]];
    function coverage(code, chr, u, v) {
      if (code === 0x2588) return 1; if (code === 0x2580) return v < 0.5 ? 1 : 0; if (code === 0x2584) return v >= 0.5 ? 1 : 0;
      if (code === 0x258C) return u < 0.5 ? 1 : 0; if (code === 0x2590) return u >= 0.5 ? 1 : 0;
      if (code === 0x2591) return 0.25; if (code === 0x2592) return 0.5; if (code === 0x2593) return 0.75;
      if (code >= 0x2800 && code <= 0x28ff) {
        const cx = u < 0.5 ? 0 : 1, cy = Math.min(3, (v * 4) | 0);
        if (!((code - 0x2800) >> BRAILLE_BIT[cx][cy] & 1)) return 0;
        const du = (u * 2) % 1 - 0.5, dv = (v * 4) % 1 - 0.5; return du * du + dv * dv < 0.2 ? 1 : 0;
      }
      return density(chr);
    }
    function bakeFast(h, cv, sw, sh, key) {
      const { f } = h, W = cv.width, H = cv.height, c = cv.getContext('2d');
      const img = c.createImageData(W, H), px = new Uint32Array(img.data.buffer);
      const tint = h.tint ? rgbOf(h.tint) : -1, ta = h.amt;
      const mixi = (a, b) => { if (tint < 0) return a; const r = (a & 255) * (1 - ta) + (b & 255) * ta, g = (a >> 8 & 255) * (1 - ta) + (b >> 8 & 255) * ta, bl = (a >> 16 & 255) * (1 - ta) + (b >> 16 & 255) * ta; return (r | 0) | (g | 0) << 8 | (bl | 0) << 16; };
      const n = f.cells.length, code = new Uint16Array(n), fgv = new Int32Array(n), bgv = new Int32Array(n), chars = new Array(n);
      for (let i = 0; i < n; i++) { const cell = f.cells[i]; let chr = cell.ch; if (h.flip && FLIP_H[chr]) chr = FLIP_H[chr]; chars[i] = chr; code[i] = chr.charCodeAt(0); fgv[i] = cell.ch === ' ' ? 0 : mixi(rgbOf(cell.fg), tint); bgv[i] = cell.bg ? rgbOf(cell.bg) : -1; }
      const fw = f.w, flip = h.flip;
      for (let py = 0; py < H; py++) {
        const fy = (py + 0.5) / sh, j = Math.min(f.h - 1, fy | 0), v = fy - j;
        for (let pxx = 0; pxx < W; pxx++) {
          const fx = (pxx + 0.5) / sw; let i = Math.min(fw - 1, fx | 0); const u = fx - i; if (flip) i = fw - 1 - i;
          const k = j * fw + i, cc = code[k], bgc = bgv[k];
          const cov = cc === 32 ? 0 : coverage(cc, chars[k], flip ? 1 - u : u, v);
          if (bgc >= 0) {
            if (cov >= 1) px[py * W + pxx] = 0xff000000 | fgv[k];
            else if (cov <= 0) px[py * W + pxx] = 0xff000000 | bgc;
            else { const a = fgv[k], b = bgc; px[py * W + pxx] = 0xff000000 | ((((a & 255) * cov + (b & 255) * (1 - cov)) | 0) | (((a >> 8 & 255) * cov + (b >> 8 & 255) * (1 - cov)) | 0) << 8 | (((a >> 16 & 255) * cov + (b >> 16 & 255) * (1 - cov)) | 0) << 16); }
          } else if (cov > 0) px[py * W + pxx] = (((cov * 255) | 0) << 24) | fgv[k];   // straight alpha
        }
      }
      c.putImageData(img, 0, 0);
      if (!f._hr) { baked.push(f); if (baked.length > 48) { const old = baked.shift(); old._hr = null; } }
      f._hr = { key, cv }; return cv;
    }
    function paintHires() {
      if (!hires.length) return;
      for (const h of hires) {
        const cv = bakeHires(h), cw = G.cellW, chh = G.cellH;
        ctx.drawImage(cv, Math.round((h.x - (h.screen ? 0 : camX)) * cw), Math.round((h.y - (h.screen ? 0 : camY)) * chh));
      }
    }
    G.step = dt => {
      G.time += dt;
      emit('beforeUpdate', dt);
      updaters.forEach(f => f(dt, G));
      for (const e of G.entities.slice()) {
        if (e.update) e.update(dt, e, G);
        e.ft += dt; const anim = e.sprite.anims[e.anim] || [];
        const fps = e.fps || e.sprite.fps;
        if (anim.length > 1 && e.ft > 1 / fps) { e.ft = 0; e.frame = (e.frame + 1) % anim.length; }
      }
      emit('afterUpdate', dt);
      clampCamera(false);
    };
    let last = performance.now(), acc = 0, frames = 0, running = true;
    function loop(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!G.paused) G.step(dt);
      compose(); paint();
      frames++; acc += dt; if (acc > 0.5) { G.fps = Math.round(frames / acc); frames = 0; acc = 0; }
      requestAnimationFrame(loop);
    }
    G.destroy = () => { running = false; window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('resize', resize); canvas.remove(); emit('destroy', G); };

    /** the current screen as plain text — lets an agent "see" the game */
    G.snapshot = () => {
      const rows = [];
      for (let y = 0; y < G.viewRows; y++) { const r = []; for (let x = 0; x < G.viewCols; x++) r.push(ch[y * G.viewCols + x] || ' '); rows.push(r); }
      for (const h of hires) {   // HIRES: agents see a downsampled glyph per world cell ('▒' where the fine cells are filled)
        const R = h.res, wc = Math.ceil(h.f.w / R), wr = Math.ceil(h.f.h / R);
        for (let j = 0; j < wr; j++) for (let i = 0; i < wc; i++) {
          const sx = Math.round(h.x) - camX + i, sy = Math.round(h.y) - camY + j;
          if (sx < 0 || sy < 0 || sx >= G.viewCols || sy >= G.viewRows) continue;
          let n = 0; for (let b = 0; b < R; b++) for (let a = 0; a < R; a++) { const cx = i * R + a, cy = j * R + b; if (cx < h.f.w && cy < h.f.h && h.f.cells[cy * h.f.w + cx].ch !== ' ') n++; }
          if (n > R * R / 3) rows[sy][sx] = '▒';
        }
      }
      return rows.map(r => r.join('').replace(/\s+$/, '')).join('\n');
    };

    // ---------------------------------------------------------------- agent command API
    // Plain JSON in, JSON out. Each command may carry "agent": "<name>", so several agents can share one world.
    const commands = {}, docs = {};
    G.defineCommand = (name, fn, doc = '') => { commands[name] = fn; docs[name] = doc; return G; };
    G.commandNames = () => Object.keys(commands);
    function pick(c) {
      const e = c.id != null ? G.entities.find(x => x.id === +c.id) : G.find(c.name);
      if (!e) throw new Error('no entity ' + (c.id ?? c.name) + ' (use "describe" to list entities)');
      return e;
    }
    G.pick = pick;
    function spriteFromCmd(c) {
      if (c.asset) {
        const a = typeof c.asset === 'string' ? (G.assets[c.asset] || null) : c.asset;
        if (!a) throw new Error('unknown asset "' + c.asset + '" — define it first with "asset"');
        return a.anims && a.anims[Object.keys(a.anims)[0]] && a.anims[Object.keys(a.anims)[0]][0].cells ? a : fromAsset(a);
      }
      const art = c.anims || c.frames || c.art;
      if (!art) throw new Error('spawn needs "art" (string), "frames" (array), "anims" (object) or "asset"');
      return sprite(art, { color: c.color, colors: c.colors, palette: c.palette, fps: c.fps, solid: c.solid, bg: c.bg });
    }
    function walker() {
      return (dt, e) => {
        if (!e.target) return;
        const dx = e.target.x - e.x, dy = e.target.y - e.y, d = Math.hypot(dx, dy);
        if (d < 0.3) { e.target = null; if (e.sprite.anims.idle) e.play('idle'); return; }
        const s = Math.min(d, (e.speed || 10) * dt);
        const nx = e.x + dx / d * s, ny = e.y + dy / d * s * 0.6;
        if (G.blocked && G.blocked(nx, ny, e)) { e.target = null; return; }
        e.x = nx; e.y = ny; if (Math.abs(dx) > 0.1 && canFlip(e)) e.flipX = dx < 0;
        if (e.sprite.anims.walk) e.play('walk');
      };
    }
    function wanderer(speed = 6) {
      return (dt, e) => {
        if (e.rest > 0) { e.rest -= dt; return; }
        if (!e.target || Math.hypot(e.target.x - e.x, e.target.y - e.y) < 0.5) {
          e.target = { x: Math.max(0, Math.min(G.cols - e.w, e.x + (Math.random() - 0.5) * 40)), y: Math.max(0, Math.min(G.rows - e.h, e.y + (Math.random() - 0.5) * 14)) };
          e.rest = Math.random() * 1.5;
        }
        const dx = e.target.x - e.x, dy = e.target.y - e.y, d = Math.hypot(dx, dy) || 1;
        const nx = e.x + dx / d * speed * dt, ny = e.y + dy / d * speed * dt * 0.6;
        if (G.blocked && G.blocked(nx, ny, e)) { e.target = null; return; }
        e.x = nx; e.y = ny; if (canFlip(e)) e.flipX = dx < 0;
      };
    }
    // creatures turn to face where they walk; signs and props keep their text readable
    const canFlip = e => e.autoFlip !== undefined ? !!e.autoFlip : !!(e.sprite.anims.walk || e.wandering);
    G.walker = walker; G.wanderer = wanderer;
    const info = e => ({ id: e.id, name: e.name || null, x: Math.round(e.x), y: Math.round(e.y), w: e.w, h: e.h, owner: e.owner, label: e.label, anims: Object.keys(e.sprite.anims), tags: e.tags });

    G.defineCommand('help', () => ({ commands: docs }), 'List every command with its arguments.');
    G.defineCommand('describe', () => ({
      world: { cols: G.cols, rows: G.rows }, view: { cols: G.viewCols, rows: G.viewRows, x: Math.round(G.camera.x), y: Math.round(G.camera.y) },
      time: +G.time.toFixed(2), masks: Object.keys(G.masks), assets: Object.keys(G.assets), entities: G.entities.map(info),
    }), 'World size, camera, masks, assets and every entity (id, name, x, y, w, h, owner).');
    G.defineCommand('look', c => {
      if (c.x != null || c.y != null) G.lookAt(c.x ?? G.camera.x + G.viewCols / 2, c.y ?? G.camera.y + G.viewRows / 2);
      return { camera: { x: Math.round(G.camera.x), y: Math.round(G.camera.y) }, screen: G.snapshot(), visible: G.entities.filter(e => G.inView(e.x, e.y)).map(info) };
    }, 'The current screen as text plus visible entities. Optional x,y moves the camera centre first (stops following).');
    G.defineCommand('spawn', c => {
      const spr = spriteFromCmd(c);
      const e = G.add(spr, { name: c.name, x: c.x ?? Math.round(G.camera.x + G.viewCols / 2), y: c.y ?? Math.round(G.camera.y + G.viewRows / 2), z: c.z || 0, reflect: c.reflect ?? true, label: c.label || null, labelColor: c.labelColor || '#cfe', owner: c.agent || null, tags: c.tags || [], speed: c.speed });
      if (c.wander) { e.update = wanderer(+c.wander || 6); e.wandering = true; }
      if (c.flip !== undefined) e.autoFlip = !!c.flip;
      return { id: e.id, w: e.w, h: e.h };
    }, 'Create an entity. {name, art|frames|anims|asset, color, colors+palette, fps, x, y, z, label, reflect, wander:speed, flip:bool (face walking direction), tags}. art is ASCII text; spaces are transparent.');
    G.defineCommand('set', c => {
      const e = pick(c);
      ['x', 'y', 'z', 'label', 'labelColor', 'flipX', 'speed', 'reflect', 'hidden'].forEach(k => { if (c[k] !== undefined) e[k] = c[k]; });
      if (c.anim) e.play(c.anim);
      if (c.wander !== undefined) { e.update = c.wander ? wanderer(+c.wander || 6) : null; e.wandering = !!c.wander; }
      if (c.flip !== undefined) e.autoFlip = !!c.flip;
      if (c.art || c.frames || c.anims || c.asset) e.setSprite(spriteFromCmd(c));
      return info(e);
    }, 'Change an entity: {id|name, x, y, z, label, flipX, speed, reflect, hidden, anim, wander, art|frames|anims|asset}.');
    G.defineCommand('move', c => {
      const e = pick(c);
      if (c.to) { e.target = { x: +c.to[0], y: +c.to[1] }; if (!e._walker) { e._walker = true; const prev = e.update; const w = walker(); e.update = (dt, en, g) => { if (en.target) w(dt, en, g); else if (prev) prev(dt, en, g); }; } }
      else if (c.by) { e.x += +c.by[0]; e.y += +c.by[1]; }
      else { e.x = c.x ?? e.x; e.y = c.y ?? e.y; }
      return { id: e.id, x: Math.round(e.x), y: Math.round(e.y) };
    }, 'Move an entity: {id|name, to:[x,y]} walks there, {by:[dx,dy]} nudges, {x,y} teleports.');
    G.defineCommand('say', c => { pick(c).say(c.text, c.secs || 3); return {}; }, 'Speech bubble: {id|name, text, secs}.');
    G.defineCommand('play', c => { pick(c).play(c.anim); return {}; }, 'Play a named animation: {id|name, anim}.');
    G.defineCommand('remove', c => { if (c.owner) { const all = G.findAll(e => e.owner === c.owner); all.forEach(G.remove); return { removed: all.length }; } G.remove(pick(c)); return {}; }, 'Remove an entity {id|name}, or every entity an agent made {owner}.');
    G.defineCommand('text', c => { const e = G.add(sprite(String(c.text), { color: c.color || '#fff' }), { name: c.name, x: c.x, y: c.y, z: 50, owner: c.agent || null }); return { id: e.id }; }, 'Put a text sign in the world: {text, x, y, color, name}.');
    G.defineCommand('asset', c => {
      if (!c.name || !c.asset) throw new Error('asset needs {name, asset} where asset is an .aci.json object');
      G.assets[c.name] = fromAsset(c.asset); return { name: c.name, w: G.assets[c.name].w, h: G.assets[c.name].h };
    }, 'Register a reusable asset: {name, asset: {aci:1, anims:{...}, palette}}. Then spawn with {asset: name}.');
    G.defineCommand('camera', c => {
      if (c.follow != null) G.follow(pick({ id: typeof c.follow === 'number' ? c.follow : undefined, name: typeof c.follow === 'string' ? c.follow : undefined }));
      else if (c.x != null || c.y != null) G.lookAt(c.x ?? G.camera.x + G.viewCols / 2, c.y ?? G.camera.y + G.viewRows / 2);
      return { x: Math.round(G.camera.x), y: Math.round(G.camera.y), following: G.camera.target ? G.camera.target.name || G.camera.target.id : null };
    }, 'Move the camera: {x, y} centres on a world cell, {follow: name|id} tracks an entity.');

    G.command = c => {
      if (typeof c === 'string') c = JSON.parse(c);
      if (Array.isArray(c)) return c.map(G.command);
      const fn = commands[c.op];
      let result;
      try { if (!fn) throw new Error('unknown op "' + c.op + '" — try "help". Ops: ' + Object.keys(commands).join(', ')); result = Object.assign({ ok: true }, fn(c, G) || {}); }
      catch (err) { result = { ok: false, error: err.message }; }
      emit('command', { cmd: c, result });
      return result;
    };

    // ---- agent bridge: connect this game to a running `aci bridge` server
    G.connect = (url, o = {}) => {
      if (!url) { const l = location; url = (l.protocol === 'https:' ? 'wss://' : 'ws://') + (l.host || 'localhost:7777') + '/ws'; }
      const state = { url, ws: null, connected: false, closed: false };
      const open = () => {
        if (state.closed) return;
        let ws; try { ws = new WebSocket(url); } catch (e) { setTimeout(open, 2000); return; }
        state.ws = ws;
        ws.onopen = () => { state.connected = true; ws.send(JSON.stringify({ type: 'hello', name: o.name || document.title || 'game', editor: !!o.editor, world: { cols: G.cols, rows: G.rows } })); emit('bridge', { connected: true, url }); };
        ws.onclose = () => { const was = state.connected; state.connected = false; if (was) emit('bridge', { connected: false, url }); if (!state.closed) setTimeout(open, 2000); };
        ws.onerror = () => {};
        ws.onmessage = ev => {
          let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
          if (m.type === 'command') {
            const result = G.command(m.cmd);
            ws.send(JSON.stringify({ type: 'result', id: m.id, result }));
          }
        };
      };
      // tell agents about player activity
      G.on('click', p => state.connected && state.ws.send(JSON.stringify({ type: 'event', event: 'click', data: { x: p.x, y: p.y } })));
      G.notifyAgents = (event, data) => state.connected && state.ws.send(JSON.stringify({ type: 'event', event, data }));
      open();
      state.close = () => { state.closed = true; state.ws && state.ws.close(); };
      G.bridge = state;
      return state;
    };

    G.resize = resize;
    window.addEventListener('resize', resize);
    resize();
    plugins.forEach(p => { try { G.plugins[p.name] = p.setup(G, (opts.plugins || {})[p.name] || {}) || true; } catch (e) { console.error('[ACI] plugin ' + p.name + ' failed:', e); } });
    requestAnimationFrame(loop);
    if (opts.bridge) G.connect(opts.bridge === true ? undefined : opts.bridge);
    return G;
  }

  const ACI = { game, sprite, fromImage, loadImage, toText, toAsset, fromAsset, loadAsset, plugin, mix, noise, fbm, hash, parseArt, parseColor, toHex, RAMPS, FLIP_H, FLIP_V, version: '0.2.0' };
  global.ACI = ACI;
  if (typeof module !== 'undefined' && module.exports) module.exports = ACI;
})(typeof window !== 'undefined' ? window : globalThis);
