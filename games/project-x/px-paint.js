/* Project X (ACI port) - procedural painter. Everything visible is painted on small canvases and converted to
   fine-density glyph sprites with the engine's 'shape' converter (see docs/FINE-DENSITY.md). */
(function () {
  'use strict';
  const PX = window.PX = window.PX || {};
  const P = PX.paint = {};
  const TAU = Math.PI * 2, rad = d => d * Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  P.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  P.hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + (s || 0) * 982451653) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };

  // ---------------------------------------------------------------- bake a canvas into a hi-res glyph sprite
  P.res = 2;
  P.bake = (canvas, cols, o) => {
    const G = PX.game, aspect = G.cellW / G.cellH;
    return ACI.convert.image(canvas, Object.assign({ mode: 'shape', cols, res: P.res, aspect, color: true, colorLift: 0.75, bg: 'none', autoLevels: false, contrast: 1.12 }, o || {}));
  };
  // frames: array of canvases -> one animated sprite (anim name -> frames)
  P.bakeFrames = (canvases, cols, o) => {
    const sprs = canvases.map(c => P.bake(c, cols, o));
    const first = sprs[0];
    const frames = sprs.map(s => Object.values(s.anims)[0][0]);
    const spr = ACI.sprite({ default: frames }, { fps: (o && o.fps) || 8, res: first.res });
    spr.w = first.w; spr.h = first.h; return spr;
  };

  // ---------------------------------------------------------------- small drawing helpers
  const grad = (ctx, x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  const radial = (ctx, x, y, r0, r1, stops) => { const g = ctx.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  P.grad = grad; P.radial = radial;
  const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  P.rr = rr;
  const mixc = (a, b, t) => PX.mixc(a, b, t);

  // ---------------------------------------------------------------- tree
  P.tree = (variant, wpx, hpx) => {
    const c = P.canvas(wpx, hpx), x = c.getContext('2d');
    const cx = wpx / 2, base = hpx - 4;
    x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(cx, base, wpx * .3, hpx * .04, 0, 0, TAU); x.fill();
    x.fillStyle = grad(x, cx - 10, 0, cx + 10, 0, [[0, '#4a2c18'], [.5, '#7a4c2a'], [1, '#3a2012']]); x.fillRect(cx - wpx * .06, hpx * .55, wpx * .12, hpx * .42);
    const cols = variant === 'b' ? [['#2a6a44', '#1a4a30'], ['#3a8a58', '#215c3c'], ['#5ab07a', '#2f7a4a']] : [['#2f7a36', '#1a5022'], ['#44a04a', '#26702e'], ['#78cc6a', '#3a8a40']];
    const blobs = 26; for (let i = 0; i < blobs; i++) {
      const a = P.hash(i, 1, variant === 'b' ? 5 : 3) * TAU, d = Math.sqrt(P.hash(i, 2, 9)) * wpx * .34;
      const px = cx + Math.cos(a) * d, py = hpx * .34 + Math.sin(a) * d * .85 - (d * .1), r = wpx * (.12 + P.hash(i, 3, 1) * .09);
      const k = clamp((1 - (py - hpx * .1) / (hpx * .5)) * 1.1, 0, 2.2), ci = k > 1.4 ? 2 : k > .7 ? 1 : 0;
      x.fillStyle = radial(x, px - r * .3, py - r * .35, r * .1, r, [[0, cols[ci][0]], [1, cols[ci][1]]]); x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
    }
    return c;
  };

  // ---------------------------------------------------------------- building facade
  const BLD = {
    home_exterior: { wall: '#c49a6a', roof: '#a04a3a', label: 'HOME', trim: '#f0dcc0', lit: .7, chimney: 1 },
    house_a: { wall: '#8aa0c8', roof: '#46568a', label: '', trim: '#e8eefc', lit: .45, chimney: 1 }, house_b: { wall: '#86b898', roof: '#3f7050', label: '', trim: '#e8f4ec', lit: .4, chimney: 1 },
    apartments: { wall: '#9a9aa8', roof: '#5a5a68', label: 'APARTMENTS', trim: '#d0d0dc', lit: .5, floors: 4 }, shop: { wall: '#c0a088', roof: '#c8503a', label: 'SHOP', trim: '#f4e0c8', lit: .9, awning: 1 },
    mall_front: { wall: '#5a8898', roof: '#2e5868', label: 'DWELL MALL', trim: '#cfe8f0', lit: .9, glass: 1, big: 1 }, hospital_front: { wall: '#dde0ea', roof: '#9aa0b0', label: 'HOSPITAL', trim: '#ffffff', lit: .7, cross: 1, floors: 3 },
    school_front: { wall: '#b0644c', roof: '#6a3a2a', label: 'DWELL PUBLIC', trim: '#f0d8b8', lit: .6, floors: 2, clock: 1 }, police_front: { wall: '#4a5c90', roof: '#262f56', label: 'POLICE', trim: '#bcd0ff', lit: .8, blue: 1 },
    bar_front: { wall: '#4a3050', roof: '#241628', label: 'BAR', trim: '#ff6ab0', lit: .95, neon: '#ff4a9a' }, old_house: { wall: '#6a6860', roof: '#34322c', label: '', trim: '#8a8878', lit: 0, decay: 1, chimney: 1 },
    train_station_front: { wall: '#8a7a68', roof: '#4a3c2e', label: 'TRAIN STATION', trim: '#e8d8b8', lit: .7, clock: 1 }, warehouse: { wall: '#8a5a3a', roof: '#4a2e20', label: 'WAREHOUSE', trim: '#d8a860', lit: .1, corrugated: 1 },
    cafe_front: { wall: '#caa47c', roof: '#8a5a3a', label: 'CAFE', trim: '#ffe8b0', lit: 1, awning: 1 }, carnival_gate: { wall: '#d84a8a', roof: '#e8c030', label: 'CARNIVAL', trim: '#fff', lit: 1, arch: 1 },
    harbour_office: { wall: '#5a7aa0', roof: '#34445f', label: 'HARBOUR', trim: '#d0e0f4', lit: .6 },
  };
  P.BLD = BLD;
  P.building = (kind, info, S) => {
    const b = BLD[kind], W = info.w * S, H = info.h * S, c = P.canvas(W, H), x = c.getContext('2d');
    const roofH = Math.round(H * (info.h >= 6 ? .24 : .28)), wallTop = roofH, wallH = H - roofH, doorW = S * 1.05, doorH = S * 1.35, doorX = (info.door + .5) * S - doorW / 2;
    // wall
    x.fillStyle = grad(x, 0, wallTop, 0, H, [[0, b.wall], [1, mixc(b.wall, '#000000', .28)]]); x.fillRect(0, wallTop, W, wallH);
    if (b.corrugated) { for (let i = 0; i < W; i += 5) { x.fillStyle = i % 10 ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.1)'; x.fillRect(i, wallTop, 3, wallH); } }
    else { x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = 1; for (let y = wallTop + 8; y < H; y += 9) { x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); } }
    // roof
    x.fillStyle = grad(x, 0, 0, 0, roofH, [[0, mixc(b.roof, '#ffffff', .18)], [1, mixc(b.roof, '#000000', .35)]]);
    x.beginPath(); x.moveTo(-4, roofH); x.lineTo(W * .06, 2); x.lineTo(W * .94, 2); x.lineTo(W + 4, roofH); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < roofH; i += 5) { x.beginPath(); x.moveTo(W * .06 - i * .2, 2 + i); x.lineTo(W * .94 + i * .2, 2 + i); x.stroke(); }
    x.fillStyle = b.trim; x.fillRect(0, roofH - 3, W, 4);
    if (b.chimney) { x.fillStyle = '#6a3a30'; x.fillRect(W * .72, -2, S * .45, roofH * .7); }
    // windows
    const floors = b.floors || (info.h >= 5 ? 2 : 1), cols = Math.max(2, Math.round(info.w / 1.7)), usable = (wallH - doorH * .15);
    for (let f = 0; f < floors; f++) for (let k = 0; k < cols; k++) {
      const wx = (k + .5) * W / cols - S * .32, wy = wallTop + (f + .35) * (usable - S * .6) / floors + S * .25, ww = S * .64, wh = S * .62;
      if (f === floors - 1 && k * W / cols < doorX + doorW && (k + 1) * W / cols > doorX && floors === 1) continue;
      const lit = P.hash(k, f, info.w + info.h) < b.lit;
      x.fillStyle = b.trim; x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      x.fillStyle = lit ? grad(x, 0, wy, 0, wy + wh, [[0, '#ffe9a8'], [1, '#e0a84a']]) : grad(x, 0, wy, 0, wy + wh, [[0, '#2a3a58'], [1, '#101828']]);
      if (b.decay) x.fillStyle = '#0a0c12';
      x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(wx + ww / 2 - 1, wy, 2, wh); x.fillRect(wx, wy + wh / 2 - 1, ww, 2);
      if (lit) { x.fillStyle = radial(x, wx + ww / 2, wy + wh / 2, 2, S * 1.1, [[0, 'rgba(255,220,120,.35)'], [1, 'rgba(255,220,120,0)']]); x.fillRect(wx - S, wy - S, ww + 2 * S, wh + 2 * S); }
    }
    if (b.glass) { x.fillStyle = grad(x, 0, 0, W, 0, [[0, 'rgba(160,230,250,.5)'], [.5, 'rgba(255,255,255,.25)'], [1, 'rgba(120,200,230,.5)']]); x.fillRect(S * .2, wallTop + S * .3, W - S * .4, wallH - doorH * .9); }
    if (b.awning) { for (let i = 0; i < W - 6; i += 12) { x.fillStyle = (i / 12) % 2 ? '#f4f4f8' : '#d84a4a'; x.beginPath(); x.moveTo(i + 3, roofH + S * .15); x.lineTo(i + 15, roofH + S * .15); x.lineTo(i + 17, roofH + S * .6); x.lineTo(i + 1, roofH + S * .6); x.fill(); } }
    if (b.arch) { x.fillStyle = grad(x, 0, 0, W, 0, [[0, '#ffd24a'], [.5, '#ff7ab0'], [1, '#7ad0ff']]); x.fillRect(0, roofH - 2, W, 8); }
    // sign
    if (b.label) {
      const fs = Math.min(S * .5, (W * .9) / (b.label.length * .62)); x.font = `bold ${fs}px "Segoe UI",Arial,sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      const sy = roofH + fs * .75 + (b.awning ? S * .6 : 0);
      if (b.neon) { x.shadowColor = b.neon; x.shadowBlur = 14; x.fillStyle = b.neon; } else { x.fillStyle = 'rgba(14,16,28,.85)'; const tw = x.measureText(b.label).width; rr(x, W / 2 - tw / 2 - 8, sy - fs * .65, tw + 16, fs * 1.3, 4); x.fill(); x.fillStyle = '#f4f2e8'; }
      x.fillText(b.label, W / 2, sy); x.shadowBlur = 0;
      if (b.cross) { x.fillStyle = '#d84a4a'; x.fillRect(W / 2 - 4, wallTop + S * .5, 8, 22); x.fillRect(W / 2 - 11, wallTop + S * .5 + 7, 22, 8); }
    }
    // door
    x.fillStyle = b.trim; x.fillRect(doorX - 4, H - doorH - 4, doorW + 8, doorH + 4);
    x.fillStyle = grad(x, doorX, 0, doorX + doorW, 0, [[0, '#4a2c18'], [.5, '#6a4426'], [1, '#3a2010']]); x.fillRect(doorX, H - doorH, doorW, doorH);
    x.fillStyle = '#f0c850'; x.beginPath(); x.arc(doorX + doorW * .8, H - doorH * .45, 2.2, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,220,120,.18)'; x.beginPath(); x.moveTo(doorX, H); x.lineTo(doorX + doorW, H); x.lineTo(doorX + doorW * 1.9, H + 8); x.lineTo(doorX - doorW * .9, H + 8); x.fill();
    // doorstep + ground shadow
    x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(0, H - 4, W, 4);
    if (b.decay) { for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(20,24,18,${.15 + P.hash(i, 1, 2) * .25})`; x.beginPath(); x.arc(P.hash(i, 2, 4) * W, wallTop + P.hash(i, 3, 6) * wallH, 3 + P.hash(i, 4, 8) * 8, 0, TAU); x.fill(); } }
    return c;
  };

  // ---------------------------------------------------------------- small props painted from a drawing function
  const sp = {};
  P.propCanvas = (kind, info, S) => {
    const W = info.w * S, H = info.h * S, c = P.canvas(W, H), x = c.getContext('2d');
    const shadow = (cx, cy, rx, ry) => { x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU); x.fill(); };
    const box = (px, py, w, h, c0, c1) => { x.fillStyle = grad(x, px, py, px, py + h, [[0, c0], [1, c1]]); x.fillRect(px, py, w, h); x.strokeStyle = 'rgba(0,0,0,.35)'; x.strokeRect(px + .5, py + .5, w - 1, h - 1); };
    switch (kind) {
      case 'bush': shadow(W / 2, H - 4, W * .4, 4); for (let i = 0; i < 7; i++) { x.fillStyle = radial(x, W * (.2 + i * .1), H * .5, 2, W * .3, [[0, '#6ac86a'], [1, '#27702e']]); x.beginPath(); x.arc(W * (.2 + P.hash(i, 1, 2) * .6), H * (.4 + P.hash(i, 2, 2) * .3), W * .22, 0, TAU); x.fill(); } break;
      case 'flowers': for (let i = 0; i < 6; i++) { const fx = W * (.15 + P.hash(i, 1, 4) * .7), fy = H * (.3 + P.hash(i, 2, 4) * .5); x.strokeStyle = '#2f8a3c'; x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx, H); x.stroke(); x.fillStyle = ['#ff7ab0', '#ffd24a', '#fff', '#8ab8ff'][i % 4]; x.beginPath(); x.arc(fx, fy, 4, 0, TAU); x.fill(); } break;
      case 'lamp': x.fillStyle = radial(x, W / 2, H * .18, 1, W * 1.3, [[0, 'rgba(255,230,150,.55)'], [1, 'rgba(255,230,150,0)']]); x.fillRect(0, 0, W, H * .7); x.fillStyle = '#566'; x.fillRect(W / 2 - 2, H * .22, 4, H * .76); x.fillStyle = '#ffeaa0'; x.beginPath(); x.arc(W / 2, H * .18, 6, 0, TAU); x.fill(); break;
      case 'bench': shadow(W / 2, H - 3, W * .45, 3); box(4, H * .35, W - 8, H * .22, '#a07848', '#6a4a28'); box(4, H * .1, W - 8, H * .2, '#a07848', '#6a4a28'); x.fillStyle = '#333'; x.fillRect(8, H * .55, 3, H * .4); x.fillRect(W - 11, H * .55, 3, H * .4); break;
      case 'bin': box(W * .25, H * .25, W * .5, H * .7, '#5a9a7a', '#2e5a46'); box(W * .22, H * .15, W * .56, H * .12, '#7ab89a', '#3a6a54'); break;
      case 'hydrant': box(W * .35, H * .3, W * .3, H * .6, '#e85a4a', '#902a22'); x.fillStyle = '#e85a4a'; x.beginPath(); x.arc(W / 2, H * .3, W * .17, Math.PI, 0); x.fill(); break;
      case 'mailbox': box(W * .3, H * .3, W * .4, H * .35, '#4a7ae0', '#243e8a'); x.fillStyle = '#555'; x.fillRect(W / 2 - 2, H * .65, 4, H * .3); break;
      case 'sign_post': x.fillStyle = '#556'; x.fillRect(W / 2 - 2, H * .2, 4, H * .78); box(W * .15, H * .1, W * .7, H * .32, '#e8e8f0', '#b0b4c4'); x.fillStyle = '#223'; x.font = `bold ${W * .22}px monospace`; x.textAlign = 'center'; x.fillText('→', W / 2, H * .34); break;
      case 'bus_stop': shadow(W / 2, H - 4, W * .45, 4); box(W * .08, H * .12, W * .84, H * .12, '#3a6ab0', '#1e3a68'); x.fillStyle = 'rgba(160,210,240,.35)'; x.fillRect(W * .12, H * .26, W * .76, H * .6); x.fillStyle = '#ffd24a'; x.font = `bold ${H * .16}px sans-serif`; x.textAlign = 'center'; x.fillText('BUS', W / 2, H * .22); x.fillStyle = '#566'; x.fillRect(W * .1, H * .26, 4, H * .7); x.fillRect(W * .9 - 4, H * .26, 4, H * .7); break;
      case 'car_red': case 'car_blue': case 'taxi': case 'van': {
        const col = { car_red: '#d84a4a', car_blue: '#4a7ad8', taxi: '#e8c030', van: '#d0d4de' }[kind]; shadow(W / 2, H - 5, W * .46, 5);
        x.fillStyle = grad(x, 0, H * .3, 0, H * .85, [[0, mixc(col, '#ffffff', .25)], [1, mixc(col, '#000000', .45)]]); rr(x, 3, H * .38, W - 6, H * .46, 9); x.fill();
        x.fillStyle = grad(x, 0, H * .12, 0, H * .45, [[0, mixc(col, '#ffffff', .3)], [1, col]]); rr(x, W * .2, H * .12, W * .56, H * .34, 9); x.fill();
        x.fillStyle = 'rgba(150,200,230,.85)'; rr(x, W * .25, H * .17, W * .2, H * .24, 4); x.fill(); rr(x, W * .5, H * .17, W * .22, H * .24, 4); x.fill();
        x.fillStyle = '#12141c'; [W * .24, W * .76].forEach(wx => { x.beginPath(); x.arc(wx, H * .85, H * .15, 0, TAU); x.fill(); x.fillStyle = '#9aa0b0'; x.beginPath(); x.arc(wx, H * .85, H * .07, 0, TAU); x.fill(); x.fillStyle = '#12141c'; });
        x.fillStyle = '#ffe9a8'; x.fillRect(W - 9, H * .5, 5, 6); x.fillStyle = '#e03030'; x.fillRect(4, H * .5, 4, 6); break; }
      case 'fence_h': for (let i = 0; i < 6; i++) { x.fillStyle = '#9aa0b0'; x.fillRect(W * (.08 + i * .16), H * .15, 3, H * .8); } x.fillRect(0, H * .35, W, 3); x.fillRect(0, H * .65, W, 3); break;
      case 'fence_v': x.fillStyle = '#9aa0b0'; x.fillRect(W * .45, 0, 3, H); for (let i = 0; i < 5; i++) x.fillRect(W * .3, H * (.1 + i * .2), W * .4, 3); break;
      case 'puddle': x.fillStyle = grad(x, 0, 0, W, 0, [[0, 'rgba(90,130,190,.55)'], [1, 'rgba(160,200,240,.7)']]); x.beginPath(); x.ellipse(W / 2, H / 2, W * .42, H * .3, 0, 0, TAU); x.fill(); break;
      case 'manhole': x.fillStyle = '#4a5060'; x.beginPath(); x.ellipse(W / 2, H / 2, W * .36, H * .28, 0, 0, TAU); x.fill(); x.strokeStyle = '#2a2e38'; x.stroke(); break;
      case 'vending': box(W * .12, H * .1, W * .76, H * .86, '#3a62c8', '#1e3470'); x.fillStyle = '#ffeaa0'; x.fillRect(W * .2, H * .18, W * .6, H * .4); x.fillStyle = '#e04a4a'; for (let i = 0; i < 6; i++) x.fillRect(W * (.24 + (i % 3) * .18), H * (.22 + Math.floor(i / 3) * .16), W * .12, H * .1); x.fillStyle = '#111'; x.fillRect(W * .3, H * .78, W * .4, H * .1); break;
      case 'trash_pile': for (let i = 0; i < 12; i++) { x.fillStyle = ['#6a6a50', '#4a5a46', '#7a6a5a', '#8a8a8a'][i % 4]; x.beginPath(); x.arc(W * (.15 + P.hash(i, 1, 3) * .7), H * (.35 + P.hash(i, 2, 3) * .5), 5 + P.hash(i, 3, 3) * 6, 0, TAU); x.fill(); } break;
      case 'billboard': x.fillStyle = '#444'; x.fillRect(W * .3, H * .55, 5, H * .4); x.fillRect(W * .7, H * .55, 5, H * .4); box(W * .05, H * .05, W * .9, H * .55, '#1a1f34', '#0a0d1a'); x.fillStyle = grad(x, 0, 0, W, 0, [[0, '#ff7ab0'], [1, '#7ad0ff']]); x.font = `bold ${H * .2}px sans-serif`; x.textAlign = 'center'; x.fillText('DWELL', W / 2, H * .36); x.font = `${H * .1}px sans-serif`; x.fillText('the city never sleeps', W / 2, H * .5); break;
      case 'statue': shadow(W / 2, H - 5, W * .4, 5); box(W * .2, H * .75, W * .6, H * .22, '#9a9eac', '#5a5e6c'); x.fillStyle = grad(x, 0, H * .1, 0, H * .78, [[0, '#d0d4e0'], [1, '#7a7e8c']]); rr(x, W * .36, H * .3, W * .28, H * .46, 6); x.fill(); x.beginPath(); x.arc(W / 2, H * .22, W * .13, 0, TAU); x.fill(); break;
      case 'fountain': shadow(W / 2, H - 6, W * .46, 8); x.fillStyle = grad(x, 0, H * .5, 0, H, [[0, '#a8aec0'], [1, '#5a6076']]); x.beginPath(); x.ellipse(W / 2, H * .72, W * .46, H * .22, 0, 0, TAU); x.fill(); x.fillStyle = '#4a88d0'; x.beginPath(); x.ellipse(W / 2, H * .7, W * .38, H * .16, 0, 0, TAU); x.fill(); x.fillStyle = '#a8aec0'; x.fillRect(W / 2 - 5, H * .3, 10, H * .4); for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; x.strokeStyle = 'rgba(190,230,255,.8)'; x.beginPath(); x.moveTo(W / 2, H * .3); x.quadraticCurveTo(W / 2 + Math.cos(a) * W * .15, H * .1, W / 2 + Math.cos(a) * W * .3, H * .66); x.stroke(); } break;
      case 'clock_tower': box(W * .22, H * .1, W * .56, H * .85, '#9a9eb0', '#5a5e72'); x.fillStyle = '#e8ecf4'; x.beginPath(); x.arc(W / 2, H * .22, W * .2, 0, TAU); x.fill(); x.strokeStyle = '#223'; x.lineWidth = 2; x.beginPath(); x.moveTo(W / 2, H * .22); x.lineTo(W / 2, H * .13); x.moveTo(W / 2, H * .22); x.lineTo(W / 2 + 8, H * .25); x.stroke(); x.fillStyle = '#5a3a2a'; x.beginPath(); x.moveTo(W * .2, H * .1); x.lineTo(W / 2, 2); x.lineTo(W * .8, H * .1); x.fill(); break;
      case 'crates': for (let i = 0; i < 2; i++) box(W * (.08 + i * .45), H * .3, W * .42, H * .62, '#b08850', '#6a4a22'); x.strokeStyle = '#5a3a18'; x.beginPath(); x.moveTo(W * .08, H * .3); x.lineTo(W * .5, H * .92); x.stroke(); break;
      case 'barrel': box(W * .25, H * .2, W * .5, H * .7, '#9a6a38', '#5a3a1a'); x.strokeStyle = '#333'; x.beginPath(); x.moveTo(W * .25, H * .4); x.lineTo(W * .75, H * .4); x.moveTo(W * .25, H * .7); x.lineTo(W * .75, H * .7); x.stroke(); break;
      case 'container_red': case 'container_blue': { const cc = kind === 'container_red' ? '#c0483a' : '#3a68c0'; box(2, H * .15, W - 4, H * .8, mixc(cc, '#ffffff', .2), mixc(cc, '#000000', .4)); for (let i = 6; i < W - 6; i += 7) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(i, H * .17, 3, H * .76); } break; }
      case 'boat': x.fillStyle = '#e8ecf4'; x.beginPath(); x.moveTo(W * .5, H * .05); x.lineTo(W * .5, H * .62); x.lineTo(W * .15, H * .62); x.fill(); x.fillStyle = '#d0d4e0'; x.beginPath(); x.moveTo(W * .55, H * .1); x.lineTo(W * .85, H * .62); x.lineTo(W * .55, H * .62); x.fill(); x.fillStyle = grad(x, 0, H * .62, 0, H * .9, [[0, '#c8503a'], [1, '#6a2418']]); x.beginPath(); x.moveTo(W * .05, H * .62); x.lineTo(W * .95, H * .62); x.lineTo(W * .8, H * .9); x.lineTo(W * .2, H * .9); x.fill(); break;
      case 'dock_post': box(W * .3, H * .2, W * .4, H * .7, '#8a6a42', '#4a3420'); break;
      case 'train_car': shadow(W / 2, H - 4, W * .48, 4); x.fillStyle = grad(x, 0, 0, 0, H, [[0, '#9aa0b8'], [1, '#4a5068']]); rr(x, 2, H * .12, W - 4, H * .72, 10); x.fill(); x.fillStyle = '#3a3e52'; x.fillRect(2, H * .6, W - 4, 4); for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(255,230,150,.8)'; rr(x, W * (.06 + i * .115), H * .25, W * .08, H * .24, 3); x.fill(); } x.fillStyle = '#12141c'; [.16, .3, .7, .84].forEach(k => { x.beginPath(); x.arc(W * k, H * .88, H * .09, 0, TAU); x.fill(); }); break;
      case 'ticket_machine': box(W * .2, H * .15, W * .6, H * .75, '#5a6a98', '#2e3860'); x.fillStyle = '#9ad8e8'; x.fillRect(W * .3, H * .25, W * .4, H * .25); break;
      case 'ferris_wheel': { const cx = W / 2, cy = H * .42, R = Math.min(W, H) * .4; x.strokeStyle = '#c8c8e0'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.stroke(); x.beginPath(); x.arc(cx, cy, R * .55, 0, TAU); x.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.stroke(); x.fillStyle = ['#ff7ab0', '#ffd24a', '#7ad0ff', '#9aff9a'][i % 4]; rr(x, cx + Math.cos(a) * R - 6, cy + Math.sin(a) * R, 12, 12, 3); x.fill(); } x.lineWidth = 5; x.strokeStyle = '#8a90a8'; x.beginPath(); x.moveTo(cx - R * .5, H * .96); x.lineTo(cx, cy); x.lineTo(cx + R * .5, H * .96); x.stroke(); break; }
      case 'carousel': shadow(W / 2, H - 6, W * .45, 6); x.fillStyle = grad(x, 0, H * .5, 0, H, [[0, '#d8b0e0'], [1, '#6a4a80']]); x.beginPath(); x.ellipse(W / 2, H * .78, W * .45, H * .16, 0, 0, TAU); x.fill(); for (let i = 0; i < 6; i++) { x.fillStyle = ['#ff7ab0', '#ffd24a', '#7ad0ff'][i % 3]; x.fillRect(W * (.15 + i * .13), H * .3, 5, H * .48); } x.fillStyle = grad(x, 0, 0, W, 0, [[0, '#d84a6a'], [.5, '#fff'], [1, '#d84a6a']]); x.beginPath(); x.moveTo(W * .08, H * .32); x.lineTo(W / 2, H * .05); x.lineTo(W * .92, H * .32); x.fill(); break;
      case 'tent': x.fillStyle = '#d84a6a'; x.beginPath(); x.moveTo(W / 2, H * .04); x.lineTo(W * .96, H * .9); x.lineTo(W * .04, H * .9); x.fill(); for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? '#f4f4f8' : '#d84a6a'; x.beginPath(); x.moveTo(W / 2, H * .04); x.lineTo(W * (.04 + i * .23), H * .9); x.lineTo(W * (.27 + i * .23), H * .9); x.fill(); } x.fillStyle = '#2a1018'; x.beginPath(); x.moveTo(W * .42, H * .9); x.lineTo(W / 2, H * .55); x.lineTo(W * .58, H * .9); x.fill(); break;
      case 'stall': box(W * .08, H * .5, W * .84, H * .42, '#a87848', '#5a3c20'); for (let i = 0; i < W * .84; i += 12) { x.fillStyle = (i / 12) % 2 ? '#f4f4f8' : '#d84a4a'; x.fillRect(W * .06 + i, H * .12, 12, H * .26); } break;
      case 'balloons': for (let i = 0; i < 4; i++) { x.strokeStyle = '#999'; x.beginPath(); x.moveTo(W * (.3 + i * .12), H * .5); x.lineTo(W / 2, H); x.stroke(); x.fillStyle = radial(x, W * (.28 + i * .12), H * (.25 + (i % 2) * .08), 1, 9, [[0, '#fff'], [1, ['#ff5a9a', '#ffd24a', '#5ac8ff', '#8aff8a'][i]]]); x.beginPath(); x.arc(W * (.3 + i * .12), H * (.3 + (i % 2) * .1), 9, 0, TAU); x.fill(); } break;
      case 'barrier': x.fillStyle = '#e8c030'; x.fillRect(W * .06, H * .3, W * .88, H * .3); for (let i = 0; i < 8; i++) { x.fillStyle = '#222'; x.beginPath(); x.moveTo(W * (.1 + i * .11), H * .3); x.lineTo(W * (.17 + i * .11), H * .3); x.lineTo(W * (.12 + i * .11), H * .6); x.lineTo(W * (.05 + i * .11), H * .6); x.fill(); } x.fillStyle = '#444'; x.fillRect(W * .12, H * .6, 3, H * .3); x.fillRect(W * .85, H * .6, 3, H * .3); break;
      case 'dumpster': box(W * .08, H * .2, W * .84, H * .72, '#3e8a62', '#1e4a34'); box(W * .05, H * .12, W * .9, H * .14, '#2a6a4a', '#16382a'); break;
      case 'rubble': for (let i = 0; i < 10; i++) { x.fillStyle = ['#8a8a90', '#6a6a72', '#aaaab0'][i % 3]; x.beginPath(); x.moveTo(W * P.hash(i, 1, 1), H * (.5 + P.hash(i, 2, 1) * .4)); x.lineTo(W * (P.hash(i, 1, 1) + .1), H * (.4 + P.hash(i, 3, 1) * .3)); x.lineTo(W * (P.hash(i, 1, 1) + .15), H * .9); x.fill(); } break;
      default: box(W * .1, H * .2, W * .8, H * .7, '#8a90a0', '#4a4e60');
    }
    return c;
  };
})();
