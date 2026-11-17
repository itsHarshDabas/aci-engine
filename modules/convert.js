/*!
 * ACI Converter module  (modules/convert.js)
 * Image / GIF / video / webcam  ->  ASCII sprites.  Load AFTER aci.js.
 *
 *   const spr = await ACI.convert.load('cat.png', { cols: 60, mode: 'blocks' });
 *   game.add(spr, { x: 4, y: 2 });
 *
 *   ACI.convert.load('dance.gif', { cols: 40 })      // animated sprite, one frame per GIF frame
 *   ACI.convert.video('clip.mp4', { cols: 60, fps: 10 })
 *
 * The pixel core (fromPixels, decodeGif) has no DOM dependency, so it also runs in Node.
 */
(function (global) {
  'use strict';
  const ACI = global.ACI;
  if (!ACI) throw new Error('modules/convert.js: load aci.js first');
  const hasDOM = typeof document !== 'undefined';

  // ================================================================== charsets
  const RAMPS = Object.assign({}, ACI.RAMPS, {
    standard: ' .:-=+*#%@',
    detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    blocks: ' ░▒▓█',
    grass: " .,'\"/|\\#",
    simple: ' .oO@',
    binary: ' 01',
    dots: ' ·•●',
    noir: ' .,:;ox%#@',
    retro: ' .:+=*#@',
    code: ' .:;+=xX$&',
    line: ' .-~=+#',
    braille: ' ⠂⠒⠖⠶⠷⠿⣿',
    shade: ' ░▒▓',
    hash: ' .+#',
  });
  // rough ink-density order of printable ASCII, used when no canvas is around to measure
  const DENSITY_FALLBACK = " .'`^\",:;-_~!i><+|/\\()[]{}1lItfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
  /** sortByDensity('@#.:x ') -> chars ordered from lightest to darkest ink (measured on a canvas when possible) */
  function sortByDensity(chars, font) {
    const list = [...new Set(String(chars))];
    let score;
    if (hasDOM) {
      const c = document.createElement('canvas'); c.width = c.height = 24;
      const x = c.getContext('2d', { willReadFrequently: true });
      score = ch => { x.clearRect(0, 0, 24, 24); x.fillStyle = '#000'; x.font = '20px ' + (font || 'monospace'); x.textBaseline = 'top'; x.fillText(ch, 2, 0); const d = x.getImageData(0, 0, 24, 24).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i]; return s; };
    } else score = ch => { const i = DENSITY_FALLBACK.indexOf(ch); return ch === ' ' ? -1 : i < 0 ? 30 : i; };
    return list.sort((a, b) => score(a) - score(b)).join('');
  }

  // ================================================================== palettes
  const PALETTES = {
    gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    cga: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
    c64: ['#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77', '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb'],
    sepia: ['#1b140c', '#46341f', '#7a5c37', '#b38b54', '#e6c98f', '#fff1cf'],
    matrix: ['#001a05', '#004d12', '#00a82d', '#33ff66', '#b8ffcb'],
    amber: ['#1a0e00', '#4d2b00', '#995500', '#ffa31a', '#ffd699'],
    ice: ['#04101f', '#0b3a66', '#2a7fba', '#8fd3f4', '#ffffff'],
    pico8: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
    mono: ['#000000', '#ffffff'],
  };

  // ================================================================== colour utils
  const hexTab = []; for (let i = 0; i < 256; i++) hexTab.push(('0' + i.toString(16)).slice(-2));
  const rgbHex = (r, g, b) => '#' + hexTab[r] + hexTab[g] + hexTab[b];
  function parseHex(c) {
    if (Array.isArray(c)) return c;
    if (c[0] === '#') { if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
    const m = c.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [255, 255, 255];
  }
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);
  function paletteList(p) { return (typeof p === 'string' ? PALETTES[p] : p || []).map(parseHex); }
  function nearest(pal, r, g, b) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < pal.length; i++) { const dr = r - pal[i][0], dg = g - pal[i][1], db = b - pal[i][2], d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);

  // ================================================================== resampling
  // Box-filter downscale of an RGBA buffer to W x H. Alpha-weighted so transparent
  // edges don't bleed dark colour into the picture.
  function resample(src, W, H) {
    const sw = src.width, sh = src.height, d = src.data;
    const out = { width: W, height: H, data: new Float32Array(W * H * 4) };
    const o = out.data;
    for (let y = 0; y < H; y++) {
      const y0 = (y * sh) / H, y1 = ((y + 1) * sh) / H;
      for (let x = 0; x < W; x++) {
        const x0 = (x * sw) / W, x1 = ((x + 1) * sw) / W;
        let r = 0, g = 0, b = 0, a = 0, wsum = 0;
        for (let yy = Math.floor(y0); yy < Math.min(sh, Math.ceil(y1)); yy++) {
          const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
          for (let xx = Math.floor(x0); xx < Math.min(sw, Math.ceil(x1)); xx++) {
            const w = wy * (Math.min(xx + 1, x1) - Math.max(xx, x0)), i = (yy * sw + xx) * 4, al = d[i + 3] / 255;
            r += d[i] * al * w; g += d[i + 1] * al * w; b += d[i + 2] * al * w; a += al * w; wsum += w;
          }
        }
        const j = (y * W + x) * 4;
        if (a > 0) { o[j] = r / a; o[j + 1] = g / a; o[j + 2] = b / a; }
        o[j + 3] = wsum ? a / wsum : 0;
      }
    }
    return out;
  }

  // ================================================================== core: pixels -> frame
  const DEFAULTS = {
    cols: 60, rows: 0, aspect: 0.55, fit: 'contain',
    res: 1,              // HIRES: 1|2|4|8 — sprite cells are 1/res of a world cell; cols/rows stay the footprint in WORLD cells
    mode: 'luma',        // luma | blocks | braille | edges
    ramp: 'standard',    // name from RAMPS, any string dark->bright, or 'text' (with opts.text)
    text: 'ACI ',
    color: true,         // true/'full' | false/'mono' | 'palette' | 'gradient'
    tint: '#e8e8e8', palette: null, gradient: null,
    colorSteps: 16,      // quantise colours into this many levels per channel (fewer = faster, chunkier)
    bg: 'none',          // 'none' | 'color' (dim pixel colour behind each glyph) | '#hex'
    bgDim: 0.35,
    dither: 'auto',      // none | floyd | bayer | atkinson | auto
    brightness: 0, contrast: 1, gamma: 1, saturation: 1,
    autoLevels: false, invert: false, onLight: false,
    colorLift: 0.6,      // classic/edges modes: brighten dark colours so glyphs stay readable (0 = off)
    alphaCut: 0.1, threshold: 0.5, edgeLevel: 0.25, fill: true,
  };

  // ---- glyph ink patterns for mode 'shape' (measured once from the real font)
  const SX = 4, SY = 8; let GLYPH_SET = null;
  function glyphSet() {
    if (GLYPH_SET) return GLYPH_SET;
    const K = 8, W = SX * K, H = SY * K, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d', { willReadFrequently: true }), fs = Math.round(H / 1.18);
    let chars = ''; for (let i = 33; i < 127; i++) chars += String.fromCharCode(i);
    const geo = { '▀': (u, v) => v < .5, '▄': (u, v) => v >= .5, '▌': u => u < .5, '▐': u => u >= .5, '█': () => true, '░': () => .25, '▒': () => .5, '▓': () => .75,
      '▖': (u, v) => u < .5 && v >= .5, '▗': (u, v) => u >= .5 && v >= .5, '▘': (u, v) => u < .5 && v < .5, '▝': (u, v) => u >= .5 && v < .5, '▚': (u, v) => (u < .5) === (v < .5), '▞': (u, v) => (u < .5) !== (v < .5) };
    const list = [' ', ...chars, ...Object.keys(geo)], cov = [], out = [];
    c.font = fs + 'px "JetBrains Mono","IBM Plex Mono",Menlo,Consolas,monospace'; c.textBaseline = 'top';
    for (const ch of list) {
      const v = new Float32Array(SX * SY);
      if (geo[ch]) { for (let j = 0; j < SY; j++) for (let i = 0; i < SX; i++) { const r = geo[ch]((i + .5) / SX, (j + .5) / SY, i, j); v[j * SX + i] = r === true ? 1 : r === false ? 0 : r; } }
      else if (ch !== ' ') {
        c.clearRect(0, 0, W, H); c.fillStyle = '#fff'; c.fillText(ch, 0, Math.round((H - fs) / 2));
        const d = c.getImageData(0, 0, W, H).data;
        for (let j = 0; j < SY; j++) for (let i = 0; i < SX; i++) { let t = 0; for (let y = 0; y < K; y++) for (let x = 0; x < K; x++) t += d[((j * K + y) * W + i * K + x) * 4 + 3]; v[j * SX + i] = Math.min(1, t / 255 / (K * K)); }
      }
      cov.push(v); out.push(ch);
    }
    return (GLYPH_SET = { chars: out, cov });
  }

  function dims(iw, ih, o) {
    const R = Math.max(1, Math.round(o.res || 1));
    let cols = o.cols * R, rows = o.rows * R;
    if (cols && rows && o.fit === 'stretch') return [cols, rows];
    if (cols && rows) { const r = Math.min(cols / iw, rows / (ih * o.aspect)); return [Math.max(1, Math.round(iw * r)), Math.max(1, Math.round(ih * r * o.aspect))]; }
    if (rows) return [Math.max(1, Math.round(rows * (iw / ih) / o.aspect)), rows];
    return [Math.max(1, cols), Math.max(1, Math.round(cols * (ih / iw) * o.aspect))];
  }
  function normOpts(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    if (o.color === 'full') o.color = true;
    if (o.color === 'mono') o.color = false;
    if (o.palette && o.color === true) o.color = 'palette';
    return o;
  }

  /**
   * ACI.convert.fromPixels({data, width, height}, opts) -> { w, h, cells:[{ch,fg,bg}] }
   * data is RGBA (Uint8ClampedArray / array). One frame; wrap in ACI.sprite yourself or use convert.sprite().
   */
  function fromPixels(img, opts) {
    const o = opts && opts._norm ? opts : Object.assign(normOpts(opts), { _norm: true });
    const [cols, rows] = dims(img.width, img.height, o);
    const sub = o.mode === 'blocks' ? [1, 2] : o.mode === 'braille' ? [2, 4] : o.mode === 'shape' ? [SX, SY] : [1, 1];
    const px = resample(img, cols * sub[0], rows * sub[1]);
    const pal = o.color === 'palette' ? paletteList(o.palette || 'gameboy') : null;
    const grad = o.color === 'gradient' ? paletteList(o.gradient || 'ice') : null;
    const cells = new Array(cols * rows);
    const PW = px.width, d = px.data;
    const dither = o.dither === 'auto' ? 'floyd' : o.dither;

    // ---- per-pixel luma with tone controls
    const N = PW * px.height, lum = new Float32Array(N), alpha = new Float32Array(N);
    let lo = 0, hi = 1;
    for (let i = 0; i < N; i++) { lum[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255; alpha[i] = d[i * 4 + 3]; }
    if (o.autoLevels) {
      const vals = []; for (let i = 0; i < N; i++) if (alpha[i] > o.alphaCut) vals.push(lum[i]);
      vals.sort((a, b) => a - b);
      if (vals.length > 10) { lo = vals[Math.floor(vals.length * 0.02)]; hi = vals[Math.floor(vals.length * 0.98)]; if (hi - lo < 0.05) { lo = 0; hi = 1; } }
    }
    for (let i = 0; i < N; i++) {
      let l = (lum[i] - lo) / (hi - lo);
      l = (l - 0.5) * o.contrast + 0.5 + o.brightness;
      l = Math.pow(clamp01(l), 1 / o.gamma);
      if (o.invert) l = 1 - l;
      lum[i] = l;
    }
    const pixColor = (i, boostSat) => {
      let r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      if (o.saturation !== 1) { const m = 0.299 * r + 0.587 * g + 0.114 * b; r = clamp255(m + (r - m) * o.saturation); g = clamp255(m + (g - m) * o.saturation); b = clamp255(m + (b - m) * o.saturation); }
      if (o.invert) { r = 255 - r; g = 255 - g; b = 255 - b; }
      return [r, g, b];
    };
    const lift = rgb => { if (!o.colorLift) return rgb; const m = Math.max(rgb[0], rgb[1], rgb[2], 1), k = Math.max(1, (o.colorLift * 255) / m); return k === 1 ? rgb : [clamp255(rgb[0] * k), clamp255(rgb[1] * k), clamp255(rgb[2] * k)]; };
    const q = 255 / Math.max(1, o.colorSteps - 1);
    const quant = v => Math.round(Math.round(v / q) * q);
    const colorOf = (rgb, l) => {
      if (o.color === false) { if (o.mode !== 'blocks') return o.tint; const t = parseHex(o.tint), k = clamp01(l); return rgbHex(Math.round(t[0] * k), Math.round(t[1] * k), Math.round(t[2] * k)); }
      if (o.color === 'gradient') { const f = clamp01(l) * (grad.length - 1), i = Math.min(grad.length - 2, Math.floor(f)), t = f - i, A = grad[i], B = grad[i + 1 > grad.length - 1 ? i : i + 1]; return rgbHex(Math.round(A[0] + (B[0] - A[0]) * t), Math.round(A[1] + (B[1] - A[1]) * t), Math.round(A[2] + (B[2] - A[2]) * t)); }
      if (o.color === 'palette') { const p = pal[nearest(pal, rgb[0], rgb[1], rgb[2])]; return rgbHex(p[0], p[1], p[2]); }
      return rgbHex(quant(rgb[0]), quant(rgb[1]), quant(rgb[2]));
    };
    const bgOf = (rgb, l) => {
      if (o.bg === 'none' || !o.bg) return null;
      if (o.bg === 'color') return o.color === 'palette' || o.color === 'gradient' ? colorOf(rgb.map(v => v * o.bgDim), l * o.bgDim) : rgbHex(quant(rgb[0] * o.bgDim), quant(rgb[1] * o.bgDim), quant(rgb[2] * o.bgDim));
      return o.bg;
    };

    // ---- dithered quantiser: returns level index 0..n-1 for each pixel of a w x h luma plane
    function levels(plane, w, h, n, opaque) {
      const out = new Uint8Array(w * h);
      if (dither === 'bayer') {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; out[i] = Math.max(0, Math.min(n - 1, Math.round(plane[i] * (n - 1) + BAYER4[(y & 3) * 4 + (x & 3)]))); }
      } else if (dither === 'floyd' || dither === 'atkinson') {
        const buf = Float32Array.from(plane);
        const atk = dither === 'atkinson';
        for (let y = 0; y < h; y++) {
          const ltr = y % 2 === 0;
          for (let k = 0; k < w; k++) {
            const x = ltr ? k : w - 1 - k, i = y * w + x, dir = ltr ? 1 : -1;
            const old = buf[i], idx = Math.max(0, Math.min(n - 1, Math.round(clamp01(old) * (n - 1))));
            out[i] = idx;
            if (opaque && !opaque[i]) continue;
            const err = old - idx / (n - 1);
            const add = (xx, yy, f) => { if (xx >= 0 && xx < w && yy < h) buf[yy * w + xx] += err * f; };
            if (atk) { const f = 1 / 8; add(x + dir, y, f); add(x + 2 * dir, y, f); add(x - dir, y + 1, f); add(x, y + 1, f); add(x + dir, y + 1, f); add(x, y + 2, f); }
            else { add(x + dir, y, 7 / 16); add(x - dir, y + 1, 3 / 16); add(x, y + 1, 5 / 16); add(x + dir, y + 1, 1 / 16); }
          }
        }
      } else for (let i = 0; i < w * h; i++) out[i] = Math.max(0, Math.min(n - 1, Math.round(plane[i] * (n - 1))));
      return out;
    }
    const opq = new Uint8Array(N); for (let i = 0; i < N; i++) opq[i] = alpha[i] >= o.alphaCut ? 1 : 0;

    // ================= modes
    if (o.mode === 'shape' && hasDOM) {
      // best-matching glyph per cell: each cell is sampled SXxSY and compared with the real ink pattern of ~110 glyphs.
      // Gives crisp edges and fine tonal range at small cell sizes (the "photographic ASCII" look).
      const GS = glyphSet(), split = o.bg === 'color' || o.bg === 'split', NG = GS.chars.length, NS = SX * SY;
      const tv = new Float32Array(NS), mix = new Float32Array(NS);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        let a = 0, mn = 2, mx = -1, sm = 0;
        for (let j = 0; j < SY; j++) for (let i = 0; i < SX; i++) { const p = (y * SY + j) * PW + x * SX + i; a += opq[p]; const l = lum[p]; tv[j * SX + i] = l; if (l < mn) mn = l; if (l > mx) mx = l; sm += l; }
        if (a < NS * 0.5) { cells[y * cols + x] = { ch: ' ', fg: '#000000', bg: null }; continue; }
        // target coverage + colours
        let fr = 0, fgc = 0, fb = 0, fw = 0, br = 0, bgc = 0, bb = 0, bw = 0, lmax = mx;
        const thr = (mn + mx) / 2;
        for (let j = 0; j < SY; j++) for (let i = 0; i < SX; i++) {
          const p = (y * SY + j) * PW + x * SX + i, l = tv[j * SX + i], rgb = pixColor(p), wgt = split ? 1 : l * l + 0.02;
          if (!split || l >= thr) { fr += rgb[0] * wgt; fgc += rgb[1] * wgt; fb += rgb[2] * wgt; fw += wgt; } else { br += rgb[0]; bgc += rgb[1]; bb += rgb[2]; bw++; }
        }
        let tgt;
        if (split) { const rng = Math.max(0.02, mx - mn); for (let k = 0; k < NS; k++) mix[k] = (tv[k] - mn) / rng; tgt = mix; } else { tgt = tv; }
        let fgRGB = [fr / fw, fgc / fw, fb / fw], bgRGB = bw ? [br / bw, bgc / bw, bb / bw] : null;
        if (!split) {   // ink colour at full brightness; coverage then carries the tone:  coverage = luma / inkLuma
          if (o.color === false) fgRGB = parseHex(o.tint); else { const m = Math.max(fgRGB[0], fgRGB[1], fgRGB[2], 1); fgRGB = fgRGB.map(v => v * 255 / m); }
          const Lf = Math.max(0.2, (0.2126 * fgRGB[0] + 0.7152 * fgRGB[1] + 0.0722 * fgRGB[2]) / 255), k0 = 1 / Lf;
          const jit = o.jitter == null ? 0.05 : o.jitter, hsh = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; const jv = (hsh - Math.floor(hsh) - 0.5) * jit;
          for (let k = 0; k < NS; k++) mix[k] = Math.max(0, Math.min(1, tv[k] * k0 + jv)); tgt = mix;
        }
        let best = 0, be = 1e9, inv = false;
        for (let g = 0; g < NG; g++) {
          const C = GS.cov[g]; let e = 0, e2 = 0;
          for (let k = 0; k < NS; k++) { const d1 = tgt[k] - C[k]; e += d1 * d1; if (split) { const d2 = tgt[k] - (1 - C[k]); e2 += d2 * d2; } }
          if (e < be) { be = e; best = g; inv = false; } if (split && e2 < be) { be = e2; best = g; inv = true; }
        }

        if (split && inv) { const t = fgRGB; fgRGB = bgRGB || [0, 0, 0]; bgRGB = t; }
        const lc = o.color === false ? lmax : mx;
        cells[y * cols + x] = { ch: GS.chars[best], fg: colorOf(fgRGB.map(clamp255), lc), bg: split && bgRGB ? colorOf(bgRGB.map(clamp255), mn) : bgOf(fgRGB, mn) };
      }
    } else if (o.mode === 'blocks') {
      // half-block ▀: foreground = top pixel, background = bottom pixel  => 2x vertical resolution
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const it = (y * 2) * PW + x, ib = (y * 2 + 1) * PW + x, ot = opq[it], ob = opq[ib];
        const ct = ot ? colorOf(pixColor(it), lum[it]) : null, cb = ob ? colorOf(pixColor(ib), lum[ib]) : null;
        let ch = ' ', fg = '#000000', bg = null;
        if (ot && ob) { ch = ct === cb ? '█' : '▀'; fg = ct; bg = cb === ct ? null : cb; }
        else if (ot) { ch = '▀'; fg = ct; }
        else if (ob) { ch = '▄'; fg = cb; }
        cells[y * cols + x] = { ch, fg, bg };
      }
    } else if (o.mode === 'braille') {
      const w = PW, h = px.height, plane = lum, lv = levels(plane, w, h, 2, opq);
      const bit = [[0, 3], [1, 4], [2, 5], [0x40 >> 0, 0x80 >> 0]]; // placeholder, replaced below
      // braille dot numbering: (0,0)=1 (0,1)=2 (0,2)=3 (1,0)=4 (1,1)=5 (1,2)=6 (0,3)=7 (1,3)=8
      const dotBit = (dx, dy) => (dy < 3 ? (dx === 0 ? [0x01, 0x02, 0x04][dy] : [0x08, 0x10, 0x20][dy]) : dx === 0 ? 0x40 : 0x80);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        let mask = 0, r = 0, g = 0, b = 0, n = 0, a = 0;
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
          const i = (y * 4 + dy) * w + x * 2 + dx;
          a += opq[i];
          if (opq[i] && lv[i]) { mask |= dotBit(dx, dy); r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; n++; }
        }
        if (!a || !mask) { cells[y * cols + x] = { ch: ' ', fg: '#000000', bg: null }; continue; }
        const rgb = o.invert ? [255 - r / n, 255 - g / n, 255 - b / n] : [r / n, g / n, b / n];
        cells[y * cols + x] = { ch: String.fromCharCode(0x2800 + mask), fg: colorOf(rgb, n / 8), bg: o.bg === 'none' ? null : bgOf(rgb, n / 8) };
      }
    } else if (o.mode === 'edges') {
      const w = PW, h = px.height, L = lum, EC = ['|', '/', '-', '\\'];
      const at = (x, y) => L[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
      const ramp = o.fill ? sortedRamp(o) : null;
      const fillLv = o.fill ? levels(lum, w, h, ramp.length, opq) : null;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!opq[i]) { cells[i] = { ch: ' ', fg: '#000000', bg: null }; continue; }
        const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
        const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
        const mag = Math.hypot(gx, gy) / 4, rgb = lift(pixColor(i));
        let ch = ' ';
        if (mag > o.edgeLevel * 0.5) {
          const ang = Math.atan2(Math.abs(gy), Math.abs(gx)) * 180 / Math.PI;
          ch = ang < 22.5 ? '|' : ang > 67.5 ? '-' : gx * gy > 0 ? '/' : '\\';
        } else if (ramp) ch = ramp[Math.floor(fillLv[i] / 2)] || ' ';
        cells[i] = { ch, fg: colorOf(rgb, L[i]), bg: bgOf(rgb, L[i]) };
      }
    } else {
      // luma / ramp mode
      const ramp = sortedRamp(o), n = ramp.length;
      const lv = levels(lum, PW, px.height, n, opq);
      const floorIdx = o.color && n > 2 ? 1 : 0;
      for (let i = 0; i < N; i++) {
        if (!opq[i]) { cells[i] = { ch: ' ', fg: '#000000', bg: null }; continue; }
        let idx = Math.max(floorIdx, lv[i]);
        const rgb = lift(pixColor(i));
        let ch = o.ramp === 'text' ? o.text[(i % PW + ((i / PW) | 0) * PW) % o.text.length] : ramp[idx];
        if (o.ramp === 'text') { if (lv[i] === 0 && !floorIdx) ch = ' '; }
        let fg = colorOf(rgb, lum[i]);
        if (o.ramp === 'text' && o.color === false) { const v = Math.round(lum[i] * 255); fg = rgbHex(...parseHex(o.tint).map(c => Math.round(c * lum[i]))); }
        cells[i] = { ch, fg, bg: bgOf(rgb, lum[i]) };
      }
    }
    return { w: cols, h: rows, cells };
  }
  function sortedRamp(o) {
    let r = RAMPS[o.ramp] || o.ramp;
    if (o.ramp === 'text') r = ' ' + o.text.replace(/ /g, '') + '.';
    if (o.onLight) r = [...r].reverse().join('');
    return [...r];
  }

  // ================================================================== sprite assembly
  function makeSprite(frames, o) {
    const spr = ACI.sprite(frames, { fps: o.fps || 8, res: o.res });
    spr.w = frames[0].w; spr.h = frames[0].h;
    spr.source = { type: o.type || 'image', mode: o.mode, cols: o.cols, res: o.res || 1 };
    if (o.delays) spr.frameDelays = o.delays;
    return spr;
  }
  /** convert.sprite({data,width,height}, opts) -> sprite   (sync, no DOM needed) */
  function spriteFromPixels(img, opts) { const o = normOpts(opts); o._norm = true; return makeSprite([fromPixels(img, o)], o); }

  // ================================================================== GIF decoder (pure JS)
  function lzw(data, minCode, total) {
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1, mask = (1 << size) - 1;
    const prefix = new Uint16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
    const out = new Uint8Array(total);
    let op = 0, bits = 0, acc = 0, prev = -1, first = 0, ip = 0;
    while (op < total) {
      while (bits < size) { if (ip >= data.length) return out; acc |= data[ip++] << bits; bits += 8; }
      const code = acc & mask; acc >>= size; bits -= size;
      if (code === clear) { size = minCode + 1; next = eoi + 1; mask = (1 << size) - 1; prev = -1; continue; }
      if (code === eoi) break;
      if (prev === -1) { out[op++] = code; prev = code; first = code; continue; }
      let cur = code, sp = 0;
      if (code >= next) { stack[sp++] = first; cur = prev; }
      while (cur >= clear) { stack[sp++] = suffix[cur]; cur = prefix[cur]; }
      first = cur; stack[sp++] = cur;
      while (sp > 0 && op < total) out[op++] = stack[--sp];
      if (next < 4096) { prefix[next] = prev; suffix[next] = first; next++; if (next > mask && size < 12) { size++; mask = (1 << size) - 1; } }
      prev = code;
    }
    return out;
  }
  /** decodeGif(arrayBuffer|Uint8Array) -> { width, height, frames:[{data:Uint8ClampedArray RGBA, delay:ms}] } */
  function decodeGif(buf) {
    const d = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const sig = String.fromCharCode(d[0], d[1], d[2], d[3], d[4], d[5]);
    if (!/^GIF8[79]a$/.test(sig)) throw new Error('not a GIF file');
    const W = d[6] | (d[7] << 8), H = d[8] | (d[9] << 8), flags = d[10];
    let p = 13, gct = null;
    if (flags & 0x80) { const n = 2 << (flags & 7); gct = d.subarray(p, p + n * 3); p += n * 3; }
    const canvas = new Uint8ClampedArray(W * H * 4), frames = []; let gce = null;
    while (p < d.length) {
      const b = d[p++];
      if (b === 0x3b) break;
      if (b === 0x21) {
        const label = d[p++];
        if (label === 0xf9) { const f = d[p + 1]; gce = { disposal: (f >> 2) & 7, transparent: f & 1 ? d[p + 4] : -1, delay: (d[p + 2] | (d[p + 3] << 8)) * 10 }; p += d[p] + 2; }
        else { while (d[p]) p += d[p] + 1; p++; }
        continue;
      }
      if (b !== 0x2c) continue;
      const ix = d[p] | (d[p + 1] << 8), iy = d[p + 2] | (d[p + 3] << 8), iw = d[p + 4] | (d[p + 5] << 8), ih = d[p + 6] | (d[p + 7] << 8), f = d[p + 8]; p += 9;
      let ct = gct; if (f & 0x80) { const n = 2 << (f & 7); ct = d.subarray(p, p + n * 3); p += n * 3; }
      const minCode = d[p++], chunks = []; let len = 0;
      while (d[p]) { chunks.push(d.subarray(p + 1, p + 1 + d[p])); len += d[p]; p += d[p] + 1; } p++;
      const data = new Uint8Array(len); let q = 0; for (const c of chunks) { data.set(c, q); q += c.length; }
      const idx = lzw(data, minCode, iw * ih);
      const g = gce || { disposal: 0, transparent: -1, delay: 100 };
      const saved = g.disposal === 3 ? canvas.slice() : null;
      const rowOf = r => { if (!(f & 0x40)) return r; const a = Math.ceil(ih / 8), bb = Math.ceil((ih - 4) / 8), c = Math.ceil((ih - 2) / 4); return r < a ? r * 8 : r < a + bb ? (r - a) * 8 + 4 : r < a + bb + c ? (r - a - bb) * 4 + 2 : (r - a - bb - c) * 2 + 1; };
      for (let r = 0; r < ih; r++) {
        const y = iy + rowOf(r); if (y >= H) continue;
        for (let c = 0; c < iw; c++) {
          const x = ix + c; if (x >= W) continue;
          const ci = idx[r * iw + c]; if (ci === g.transparent || !ct) continue;
          const o = (y * W + x) * 4; canvas[o] = ct[ci * 3]; canvas[o + 1] = ct[ci * 3 + 1]; canvas[o + 2] = ct[ci * 3 + 2]; canvas[o + 3] = 255;
        }
      }
      frames.push({ data: canvas.slice(), delay: g.delay || 100 });
      if (g.disposal === 2) { for (let y = iy; y < Math.min(H, iy + ih); y++) for (let x = ix; x < Math.min(W, ix + iw); x++) canvas.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4); }
      else if (saved) canvas.set(saved);
      gce = null;
    }
    return { width: W, height: H, frames };
  }

  /** convert.gif(arrayBuffer, opts) -> sprite with one frame per GIF frame (sync, no DOM needed) */
  function gifToSprite(buf, opts) {
    const o = normOpts(opts); o._norm = true;
    const gif = decodeGif(buf);
    let list = gif.frames;
    if (o.frameStep > 1) { const k = o.frameStep; list = list.filter((_, i) => i % k === 0).map((f, n, arr) => Object.assign({}, f, { delay: list.slice(n * k, n * k + k).reduce((t, g) => t + (g.delay || 0), 0) })); }  // merged delays keep total duration
    if (o.maxFrames) list = list.slice(0, o.maxFrames);
    if (list.length > 1 && o.dither === 'auto') o.dither = 'bayer'; // error diffusion shimmers between frames
    const frames = list.map(fr => fromPixels({ width: gif.width, height: gif.height, data: fr.data }, o));
    const delays = list.map(f => f.delay).sort((a, b) => a - b), med = delays[delays.length >> 1] || 100;
    return makeSprite(frames, Object.assign({}, o, { fps: o.fps || Math.round(1000 / med), type: 'gif', delays: list.map(f => f.delay) }));
  }

  // ================================================================== browser: images, video, live
  function toBlobish(src) {
    if (typeof src === 'string') return fetch(src).then(r => { if (!r.ok) throw new Error('could not load ' + src.slice(0, 80)); return r.arrayBuffer(); });
    if (src && src.arrayBuffer) return src.arrayBuffer();
    return Promise.resolve(src);
  }
  function pixelsOf(el, W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(el, 0, 0, W, H);
    return x.getImageData(0, 0, W, H);
  }
  // draw `el` at most ~4x the sampling size (keeps big photos fast), then hand RGBA to the core
  function elementFrame(el, o) {
    const iw = el.naturalWidth || el.videoWidth || el.width, ih = el.naturalHeight || el.videoHeight || el.height;
    const [cols, rows] = dims(iw, ih, o);
    const sub = o.mode === 'blocks' ? [1, 2] : o.mode === 'braille' ? [2, 4] : o.mode === 'shape' ? [SX, SY] : [1, 1];
    const k = Math.min(1, (cols * sub[0] * 3) / iw);
    const img = pixelsOf(el, Math.max(1, Math.round(iw * k)), Math.max(1, Math.round(ih * k)));
    return fromPixels({ width: img.width, height: img.height, data: img.data }, Object.assign({}, o, { cols, rows, fit: 'stretch', res: 1 }));
  }
  function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('image failed to load')); i.src = url; }); }

  /** sync: ACI.fromImage(<img|canvas|ImageBitmap>, opts) -> sprite  (drop-in, same signature as core) */
  function image(el, opts) {
    const o = normOpts(opts); o._norm = true;
    return makeSprite([elementFrame(el, o)], o);
  }
  /**
   * async: convert.load(url | File | Blob | ArrayBuffer, opts) -> sprite.
   * Detects GIFs by content and returns an animated sprite; everything else goes through <img>.
   */
  async function load(src, opts) {
    if (typeof src === 'string' || (src && (src.arrayBuffer || src instanceof ArrayBuffer))) {
      const isString = typeof src === 'string';
      let buf = null;
      if (!isString || /\.gif($|\?)/i.test(src) || /^data:image\/gif/.test(src)) buf = await toBlobish(src);
      if (buf && new Uint8Array(buf, 0, 3).join() === '71,73,70') return gifToSprite(buf, opts); // 'GIF'
      if (isString) return image(await loadImage(src), opts);
      const url = URL.createObjectURL(new Blob([buf || src])); try { return image(await loadImage(url), opts); } finally { URL.revokeObjectURL(url); }
    }
    return image(src, opts);
  }

  /** convert.video(url | File | <video>, { cols, fps:10, start:0, end, maxFrames:150, onProgress(p) }) -> Promise<sprite> */
  async function video(src, opts) {
    const o = normOpts(opts); o._norm = true;
    let v = src, urlToFree = null;
    if (!(src instanceof HTMLVideoElement)) {
      v = document.createElement('video'); v.muted = true; v.playsInline = true; v.crossOrigin = 'anonymous'; v.preload = 'auto';
      v.src = typeof src === 'string' ? src : (urlToFree = URL.createObjectURL(src));
    }
    if (v.readyState < 1) await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video failed to load')); });
    const fps = o.fps || 10, start = o.start || 0, end = Math.min(o.end || v.duration, v.duration || Infinity);
    const total = Math.min(o.maxFrames || 150, Math.max(1, Math.floor((end - start) * fps)));
    const frames = [];
    if (o.dither === 'auto') o.dither = 'bayer';
    for (let i = 0; i < total; i++) {
      const t = start + i / fps;
      await new Promise(res => { const h = () => { v.removeEventListener('seeked', h); res(); }; v.addEventListener('seeked', h); v.currentTime = Math.min(t, (v.duration || t) - 0.001); });
      frames.push(elementFrame(v, o));
      if (o.onProgress) o.onProgress((i + 1) / total);
      if (i % 4 === 3) await new Promise(r => setTimeout(r)); // keep the page responsive
    }
    if (urlToFree) URL.revokeObjectURL(urlToFree);
    return makeSprite(frames, Object.assign({}, o, { fps, type: 'video' }));
  }

  /** convert.webcam() -> Promise<HTMLVideoElement> already playing (needs permission) */
  async function webcam(constraints) {
    const stream = await navigator.mediaDevices.getUserMedia(constraints || { video: { width: 320, height: 240 } });
    const v = document.createElement('video'); v.srcObject = stream; v.muted = true; v.playsInline = true; await v.play(); return v;
  }
  /**
   * convert.liveLayer(videoOrCanvas, opts) -> a layer function for game.layer().
   * Re-converts the source ~15 times a second at the size of the screen.
   *   game.layer(ACI.convert.liveLayer(await ACI.convert.webcam(), { mode: 'blocks' }), -10);
   */
  function liveLayer(el, opts) {
    const o = normOpts(opts); o._norm = true; o.fit = 'stretch';
    let frame = null, stamp = -1, key = '';
    return (x, y, t, G) => {
      const cols = G.viewCols || G.cols, rows = G.viewRows || G.rows;
      if (key !== cols + 'x' + rows || t - stamp > 1 / (o.fps || 15)) {
        stamp = t; key = cols + 'x' + rows;
        try { frame = elementFrame(el, Object.assign({}, o, { cols, rows, res: 1 })); } catch (e) { /* not ready yet */ }
      }
      if (!frame || x >= frame.w || y >= frame.h) return null;
      const c = frame.cells[y * frame.w + x]; return c.ch === ' ' && !c.bg ? null : [c.ch, c.fg, c.bg];
    };
  }

  // ================================================================== export
  const stripCell = c => c.ch;
  function frameOf(spr, anim, i) { const a = spr.anims[anim || 'default'] || Object.values(spr.anims)[0]; return a[i || 0]; }
  /** plain text, one frame (same as ACI.toText) */
  function toText(spr, anim, i) { const f = frameOf(spr, anim, i); let s = ''; for (let y = 0; y < f.h; y++) { for (let x = 0; x < f.w; x++) s += f.cells[y * f.w + x].ch; s += '\n'; } return s.replace(/ +\n/g, '\n'); }
  /** ANSI truecolor text: paste it in a terminal (`cat`/`node`) */
  function toAnsi(spr, anim, i) {
    const f = frameOf(spr, anim, i); let s = '';
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const c = f.cells[y * f.w + x], F = parseHex(c.fg);
        s += (c.bg ? `\x1b[48;2;${parseHex(c.bg).join(';')}m` : '\x1b[49m') + `\x1b[38;2;${F.join(';')}m` + c.ch;
      }
      s += '\x1b[0m\n';
    }
    return s;
  }
  /** self-contained <pre> HTML snippet (colours kept) */
  function toHTML(spr, anim, i) {
    const f = frameOf(spr, anim, i), esc = c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c);
    let s = '<pre style="background:#0a0e1a;line-height:1.05;font-family:monospace;margin:0">';
    for (let y = 0; y < f.h; y++) { for (let x = 0; x < f.w; x++) { const c = f.cells[y * f.w + x]; s += `<span style="color:${c.fg}${c.bg ? ';background:' + c.bg : ''}">${esc(c.ch)}</span>`; } s += '\n'; }
    return s + '</pre>';
  }
  /** .aci.json asset (uses the core's ACI.toAsset when present so the editor can open it) */
  function toAsset(spr, name) {
    if (ACI.toAsset) return ACI.toAsset(spr, name);
    const pal = [], pi = new Map(), id = c => { if (!c) return -1; if (!pi.has(c)) { pi.set(c, pal.length); pal.push(c); } return pi.get(c); };
    const anims = {};
    for (const n in spr.anims) anims[n] = spr.anims[n].map(f => ({ w: f.w, h: f.h, chars: Array.from({ length: f.h }, (_, y) => f.cells.slice(y * f.w, (y + 1) * f.w).map(c => c.ch).join('')), fg: f.cells.map(c => id(c.fg)), bg: f.cells.map(c => id(c.bg)) }));
    return { format: 'aci-sprite', version: 1, name: name || 'converted', fps: spr.fps, palette: pal, anims };
  }

  // ================================================================== wiring
  const convert = {
    fromPixels, sprite: spriteFromPixels, image, load, gif: gifToSprite, video, webcam, liveLayer, decodeGif,
    toText, toAnsi, toHTML, toAsset, sortByDensity, resample,
    RAMPS, PALETTES, DEFAULTS,
    /** quick one-liner: ACI.convert.preview(spr) prints a frame in the console */
    preview(spr) { console.log(toText(spr)); },
  };
  ACI.convert = convert;
  ACI.RAMPS = RAMPS;
  if (hasDOM) ACI.fromImage = image; // supersedes the v0.1 converter, same signature
  ACI.fromGif = gifToSprite; ACI.fromVideo = video; ACI.loadAny = load;

  // agent command: { op:'convert', src:'data:image/png;base64,…' | url, name, x, y, cols, mode, ramp, color, dither, … }
  if (ACI.plugin) ACI.plugin('convert', game => {
    if (!game.defineCommand) return;
    game.defineCommand('convert', c => {
      if (!c.src) throw new Error('convert needs "src" (a data: URL or http URL of an image/gif)');
      const o = { cols: c.cols || 40 };
      for (const k of ['rows', 'mode', 'ramp', 'color', 'dither', 'palette', 'tint', 'bg', 'invert', 'contrast', 'brightness', 'gamma', 'autoLevels', 'maxFrames', 'fps', 'text', 'res']) if (c[k] !== undefined) o[k] = c[k];
      const e = game.add(ACI.sprite(' …'), { name: c.name, x: c.x ?? 2, y: c.y ?? 2, z: c.z || 0, owner: c.agent || null, reflect: c.reflect ?? false });
      load(c.src, o).then(spr => { e.sprite = spr; e.anim = 'default'; e.frame = 0; }, err => { e.sprite = ACI.sprite(' [convert failed: ' + err.message + ']'); });
      return { id: e.id, pending: true, note: 'converting; entity shows the result when ready (check "describe" for its w/h)' };
    }, 'convert {src, cols?, mode?: luma|blocks|braille|edges, ramp?, color?, dither?, name?, x?, y?} — turn an image/GIF URL or data URL into an ASCII entity');
  });
})(typeof window !== 'undefined' ? window : globalThis);
