/* Project X (ACI port) - character painter. Designs follow the project's character sheet:
   Claire (yellow hoodie, navy jeans, white sneakers, messy black hair), Monster Claire (the Shade form),
   Grandma (grey bun, glasses, lavender cardigan), the friend (teal bomber, white cap), the office man, officers. */
(function () {
  'use strict';
  const PX = window.PX, P = PX.paint;
  const TAU = Math.PI * 2, rad = d => d * Math.PI / 180, mix = (a, b, t) => PX.mixc(a, b, t);

  const OUTFIT = {
    claire: { rim: '#5a6a9a', skin: '#e0b088', skinD: '#b88460', hair: '#17171f', top: '#dcab2a', topD: '#9a7410', topL: '#f4cf58', pants: '#151e44', pantsL: '#27336a', shoes: '#eeeef2', hood: true, h: 1.0 },
    shade: { arm: 1.3, patch: '#c89a22', rim: '#a070d8', ol: '#8a5ac0', skin: '#2a2234', skinD: '#120e18', hair: '#0e0c14', top: '#17121e', topD: '#07050b', topL: '#352a44', pants: '#0c0a10', pantsL: '#241a28', shoes: '#0a0a0e', hood: true, shade: true, h: 1.06 },
    grandma: { skin: '#efd0b4', skinD: '#c9a488', hair: '#bdb9c4', top: '#a898cc', topD: '#7a6aa0', topL: '#c8bce4', pants: '#3a2a44', pantsL: '#52405e', shoes: '#9a88be', skirt: true, bun: true, glasses: true, h: .82 },
    friend: { rim: '#5a6a8a', skin: '#9c6a46', skinD: '#6e4630', hair: '#101010', top: '#2e807c', topD: '#175450', topL: '#48a8a0', tee: '#f2f2f4', pants: '#1c2232', pantsL: '#2c3448', shoes: '#f0f0f4', cap: '#f4f2ec', h: 1.0 },
    office: { rim: '#6a6e80', skin: '#e4c4a4', skinD: '#b8946e', hair: '#1c1c20', top: '#7a7c84', topD: '#4a4c54', topL: '#a0a2aa', tee: '#e8e8ee', tie: '#1c2a58', pants: '#6e7078', pantsL: '#8a8c94', shoes: '#18181c', glasses: true, case: true, h: .98 },
    officer: { rim: '#4a5a90', skin: '#d8a888', skinD: '#a8785a', hair: '#1a1a1e', top: '#1c2a58', topD: '#0e1634', topL: '#34478a', pants: '#141c40', pantsL: '#243064', shoes: '#101014', cap: '#141c40', badge: true, h: 1.04 },
  };
  PX.OUTFIT = OUTFIT;

  // ---------------------------------------------------------------- pose helpers
  const lerp = (a, b, t) => a + (b - a) * t;
  const POSE0 = { lean: 4, crouch: 0, tF: 4, sF: 8, tB: -4, sB: 6, uF: 8, fF: 18, uB: -6, fB: 12, head: 0, mouth: 0, eye: 0, rot: 0, flip: 1, fx: null, bob: 0, yoff: 0, xoff: 0, hairUp: 0 };
  const poseMix = (a, b, t) => { const o = {}; for (const k in POSE0) { if (typeof POSE0[k] === 'number') o[k] = lerp(a[k] ?? POSE0[k], b[k] ?? POSE0[k], t); else o[k] = t < .5 ? a[k] : b[k]; } return o; };
  PX.poseMix = poseMix;
  const POSES = {
    idle: [{ bob: 0 }, { bob: 1.2, lean: 5 }],
    walk: [0, 1, 2, 3, 4, 5].map(i => { const s = Math.sin(i / 6 * TAU), c = Math.cos(i / 6 * TAU); return { tF: s * 30, sF: Math.max(0, -c) * 38 + 6, tB: -s * 30, sB: Math.max(0, c) * 38 + 6, uF: -s * 26, fF: 18 + s * 8, uB: s * 26, fB: 14 - s * 8, bob: Math.abs(c) * 2, lean: 7 }; }),
    run: [0, 1, 2, 3, 4, 5].map(i => { const s = Math.sin(i / 6 * TAU), c = Math.cos(i / 6 * TAU); return { tF: s * 48, sF: Math.max(0, -c) * 70 + 10, tB: -s * 48, sB: Math.max(0, c) * 70 + 10, uF: -s * 50, fF: 70 + s * 10, uB: s * 50, fB: 70 - s * 10, bob: Math.abs(c) * 3.5, lean: 18 }; }),
    light1: [{ lean: -4, uF: -40, fF: 40, uB: -20, fB: 80 }, { lean: 12, uF: 80, fF: 5, uB: -30, fB: 80, tF: 16, tB: -22 }, { lean: 16, uF: 88, fF: 0, uB: -30, fB: 80, tF: 20, tB: -26, xoff: 6 }, { lean: 8, uF: 40, fF: 40, uB: -20, fB: 80 }],
    light2: [{ lean: 0, uB: -40, fB: 40, uF: -20, fF: 80 }, { lean: 14, uB: 82, fB: 4, uF: -30, fF: 80, tB: 16, tF: -20 }, { lean: 18, uB: 90, fB: 0, uF: -30, fF: 80, tB: 20, tF: -26, xoff: 6 }, { lean: 8, uB: 40, fB: 40 }],
    light3: [{ lean: -8, tF: -20, sF: 60, uF: -30, fF: 80, uB: -50, fB: 60 }, { lean: -16, tF: 90, sF: 10, tB: -10, uF: -60, fF: 70, uB: 40, fB: 60, xoff: 4, rot: -6 }, { lean: -20, tF: 100, sF: 4, tB: -14, uF: -60, fF: 70, uB: 50, fB: 50, xoff: 8, rot: -8 }, { lean: 0, tF: 30, sF: 40 }, { lean: 4 }],
    heavy: [{ lean: -14, uF: -150, fF: 20, uB: -150, fB: 30, tF: -6, tB: -10, crouch: 4 }, { lean: -22, uF: -170, fF: 10, uB: -170, fB: 10, crouch: 8 }, { lean: 26, uF: 70, fF: 0, uB: 70, fB: 0, tF: 22, tB: -30, xoff: 8, crouch: 2 }, { lean: 30, uF: 90, fF: 0, uB: 90, fB: 0, tF: 28, tB: -34, xoff: 12, crouch: 10 }, { lean: 14, uF: 40, fF: 30, uB: 40, fB: 30 }],
    cast: [{ lean: -4, uF: 20, fF: 60, uB: 20, fB: 60 }, { lean: 0, uF: 70, fF: 20, uB: 60, fB: 30, tF: 10, tB: -14 }, { lean: 4, uF: 88, fF: 0, uB: 88, fB: 0, tF: 14, tB: -20, xoff: 4 }, { lean: 6, uF: 90, fF: 0, uB: 90, fB: 0, tF: 14, tB: -20, xoff: 5 }],
    charge: [{ lean: 6, crouch: 6, uF: -30, fF: 20, uB: -40, fB: 20, tF: 22, sF: 30, tB: -26, sB: 40, hairUp: 1, eye: 0 }, { lean: 8, crouch: 8, uF: -34, fF: 24, uB: -44, fB: 24, tF: 26, sF: 34, tB: -30, sB: 44, hairUp: 1, bob: -1 }],
    dodge: [{ lean: 24, crouch: 16, uF: 40, fF: 70, uB: 30, fB: 70, tF: 70, sF: 90, tB: 50, sB: 100 }, { lean: 70, crouch: 30, rot: 90, uF: 50, fF: 90, uB: 40, fB: 90, tF: 100, sF: 110, tB: 90, sB: 110 }, { lean: 70, crouch: 30, rot: 200, uF: 50, fF: 90, uB: 40, fB: 90, tF: 100, sF: 110, tB: 90, sB: 110 }, { lean: 60, crouch: 28, rot: 310, uF: 50, fF: 90, uB: 40, fB: 90, tF: 100, sF: 110, tB: 90, sB: 110 }, { lean: 20, crouch: 14, rot: 360 }],
    hurt: [{ lean: -22, uF: -40, fF: 40, uB: -50, fB: 40, tF: -8, tB: 8, mouth: 1, eye: 2, xoff: -5 }],
    ko: [{ lean: -40, crouch: 20, mouth: 1, eye: 2 }, { lean: -80, crouch: 50, rot: -60, eye: 2 }, { lean: -90, crouch: 70, rot: -90, eye: 2 }],
    drink: [{ lean: 0, uF: 70, fF: 100, uB: 10, fB: 30 }, { lean: -6, uF: 100, fF: 130, uB: 10, fB: 30, head: -12 }, { lean: -6, uF: 100, fF: 130, uB: 10, fB: 30, head: -12 }, { lean: 0, uF: 40, fF: 60 }],
    slash: [{ lean: -18, uF: -120, fF: 30, uB: -110, fB: 30, hairUp: 1 }, { lean: 0, uF: 20, fF: 5, uB: 15, fB: 5, tF: 18, tB: -26, xoff: 6 }, { lean: 24, uF: 100, fF: 0, uB: 96, fB: 0, tF: 24, tB: -30, xoff: 12 }, { lean: 24, uF: 100, fF: 0, uB: 96, fB: 0, tF: 24, tB: -30, xoff: 12 }],
  };
  PX.POSES = POSES;

  // ---------------------------------------------------------------- the rig: a 3D skeleton projected from any of 8 (or any) yaw angles.
  // yaw 0 = facing the camera, 90 = facing screen-right, 180 = facing away, 270 = facing screen-left.
  const hull = pts => { pts = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y); const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], up = []; for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } lo.pop(); up.pop(); return lo.concat(up); };
  P.figure = (name, yaw, pose, o) => {
    o = o || {}; const O = OUTFIT[name], W = o.w || 120, H = o.h || 240, c = P.canvas(W, H), x = c.getContext('2d');
    const p = Object.assign({}, POSE0, pose), s = (H * .9 / 190) * O.h * (o.scale || 1), sh = !!O.shade, OL = O.ol || '#05050a'; if (sh) { p.lean += 16; p.crouch += 4; }
    const psi = rad(yaw), cs = Math.cos(psi), sn = Math.sin(psi), T = rad(22), cT = Math.cos(T), sT = Math.sin(T), cx = W / 2, gy = H - 12 * s - 4;
    const rolr = rad(p.rot || 0), pivY = 52;
    const pt = (X, Y, Z) => { // local -> screen (+ depth)
      Z += p.xoff * .8; if (p.rot) { const y0 = Y - pivY, c0 = Math.cos(rolr), s0 = Math.sin(rolr); const yy = y0 * c0 - Z * s0, zz = y0 * s0 + Z * c0; Y = yy + pivY; Z = zz; }
      const sx = -X * cs + Z * sn, d = Z * cs + X * sn; return { x: cx + sx * s, y: gy + (-Y * cT + d * sT) * s, d, X, Y, Z };
    };
    x.lineCap = 'round'; x.lineJoin = 'round';
    // ground shadow
    x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(cx, gy + 3 * s, 25 * s, 7 * s, 0, 0, TAU); x.fill();
    const legLen = 44, hipY = 88 - (p.crouch || 0) + p.bob, lean = rad(p.lean), torsoL = 56, up = [0, Math.cos(lean), Math.sin(lean)];
    const items = [];
    const capsule = (A, B, w, col, colD, colL, extra) => {
      x.strokeStyle = OL; x.lineWidth = w * s + 3; x.beginPath(); x.moveTo(A.x, A.y); x.lineTo(B.x, B.y); x.stroke();
      x.strokeStyle = colD || col; x.lineWidth = w * s; x.beginPath(); x.moveTo(A.x, A.y); x.lineTo(B.x, B.y); x.stroke();
      x.strokeStyle = col; x.lineWidth = w * s * .66; x.beginPath(); x.moveTo(A.x - .8, A.y - .6); x.lineTo(B.x - .8, B.y - .6); x.stroke();
      if (colL) { x.strokeStyle = colL; x.lineWidth = w * s * .2; x.beginPath(); x.moveTo(A.x - w * s * .18, A.y - w * s * .12); x.lineTo(B.x - w * s * .18, B.y - w * s * .12); x.stroke(); }
    };
    // ---------------- legs
    [[8.5, p.tF, p.sF], [-8.5, p.tB, p.sB]].forEach(([hx, t, sn2]) => {
      const tr = rad(t), tr2 = rad(t - sn2), hip = pt(hx, hipY - 4, 0), knee = pt(hx, hipY - 4 - Math.cos(tr) * legLen, Math.sin(tr) * legLen);
      const ank = pt(hx, hipY - 4 - Math.cos(tr) * legLen - Math.cos(tr2) * legLen * .94, Math.sin(tr) * legLen + Math.sin(tr2) * legLen * .94), toe = pt(hx, ank.Y - 3, ank.Z + 11), heel = pt(hx, ank.Y - 3, ank.Z - 3);
      const back = hx < 0;
      items.push({ d: (hip.d + ank.d) / 2, f: () => {
        const col = O.pants, cD = mix(O.pants, '#000000', .3);
        capsule(hip, knee, 16, col, cD, O.pantsL); capsule(knee, ank, 14, col, cD, O.pantsL);
        capsule(heel, toe, 10, O.shoes, mix(O.shoes, '#000000', .3));
        if (sh) { x.strokeStyle = '#e02a3a'; x.lineWidth = 1.3; x.beginPath(); x.moveTo(hip.x, hip.y); x.lineTo(knee.x, knee.y); x.lineTo(ank.x, ank.y); x.stroke(); }
        if (O.skirt) { /* skirt drawn with torso */ }
      } });
    });
    // ---------------- arms
    const shL = pt(-13.5, hipY + up[1] * (torsoL - 6), up[2] * (torsoL - 6)), shR = pt(13.5, hipY + up[1] * (torsoL - 6), up[2] * (torsoL - 6));
    [[13.5, p.uF, p.fF], [-13.5, p.uB, p.fB]].forEach(([sx0, u, f]) => {
      const ur = rad(u), fr = rad(u + f), sY = hipY + up[1] * (torsoL - 6), sZ = up[2] * (torsoL - 6), S0 = pt(sx0, sY, sZ);
      const AK = O.arm || 1, E = pt(sx0 * 1.12, sY - Math.cos(ur) * 30 * AK, sZ + Math.sin(ur) * 30 * AK), Hd = pt(sx0 * 1.2, sY - Math.cos(ur) * 30 * AK - Math.cos(fr) * 27 * AK, sZ + Math.sin(ur) * 30 * AK + Math.sin(fr) * 27 * AK);
      items.push({ d: (S0.d + Hd.d) / 2 + (sx0 > 0 ? .01 : 0), f: () => {
        const cD = mix(O.top, '#000000', .35); capsule(S0, E, 12, O.top, cD, O.topL); capsule(E, Hd, 11, O.top, cD, O.topL);
        if (sh) { x.strokeStyle = '#e02a3a'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(S0.x, S0.y); x.lineTo(E.x, E.y); x.lineTo(Hd.x, Hd.y); x.stroke(); }
        const hr = 6.2 * s; x.fillStyle = OL; x.beginPath(); x.arc(Hd.x, Hd.y, hr + 1.5, 0, TAU); x.fill(); x.fillStyle = sh ? '#16121c' : O.skin; x.beginPath(); x.arc(Hd.x, Hd.y, hr, 0, TAU); x.fill();
        if (sh) { x.strokeStyle = '#e8e0d0'; x.lineWidth = 1.7; for (let k = -1; k <= 1; k++) { const hh = pt(sx0 * 1.2 + k * 3, Hd.Y - 12, Hd.Z + 5); x.beginPath(); x.moveTo(Hd.x, Hd.y); x.lineTo(hh.x, hh.y); x.stroke(); } }
        if (o.item === 'flask' && sx0 > 0) { x.fillStyle = '#d84a4a'; x.fillRect(Hd.x - 3, Hd.y - 15 * s, 6, 13 * s); }
      } });
    });
    // ---------------- torso (convex hull of a rounded box) + details
    const tw = O.skirt ? 12 : 13.5, td = O.skirt ? 7.5 : 8.5, corners = [];
    for (const X of [-tw, tw]) for (const Z of [-td, td]) for (const lv of [0, 1]) { const Y = hipY + up[1] * (lv ? torsoL : 0) + (lv ? 0 : 3), Zz = up[2] * (lv ? torsoL : 0) + Z * Math.cos(lean) * 1; corners.push(pt(X * (lv ? 1 : .92), Y, Zz + (lv ? Z * .9 : Z))); }
    const poly = hull(corners), tc = pt(0, hipY + up[1] * torsoL / 2, up[2] * torsoL / 2), neck = pt(0, hipY + up[1] * torsoL, up[2] * torsoL);
    const front = pt(0, hipY + up[1] * torsoL * .5, up[2] * torsoL * .5 + td), backp = pt(0, hipY + up[1] * torsoL * .5, up[2] * torsoL * .5 - td), faceFront = cs > 0;
    items.push({ d: tc.d, f: () => {
      if (O.skirt) { const a = pt(-12, hipY, 0), b = pt(12, hipY, 0), c1 = pt(-20, 6, 0), c2 = pt(20, 6, 0), sk = hull([a, b, c1, c2, pt(0, 6, 14), pt(0, 6, -14), pt(0, hipY, 8), pt(0, hipY, -8)]); x.fillStyle = OL; x.beginPath(); sk.forEach((q, i) => i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y)); x.closePath(); x.lineWidth = 3; x.strokeStyle = OL; x.stroke(); x.fillStyle = P.grad(x, 0, tc.y, 0, gy, [[0, O.pants], [1, mix(O.pants, '#000000', .45)]]); x.fill(); }
      x.beginPath(); poly.forEach((q, i) => i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y)); x.closePath();
      x.lineWidth = 3; x.strokeStyle = OL; x.stroke(); const minx = Math.min(...poly.map(q => q.x)), maxx = Math.max(...poly.map(q => q.x));
      x.fillStyle = P.grad(x, minx, 0, maxx, 0, [[0, O.topD], [.45, O.top], [1, O.topD]]); x.fill();
      x.save(); x.clip();
      x.fillStyle = O.topL + '55'; x.fillRect(minx + (maxx - minx) * .22, neck.y, (maxx - minx) * .12, 200);
      if (faceFront) {
        const fa = Math.min(1, cs * 1.4);
        if (O.tee) { const a = pt(-4, hipY + up[1] * (torsoL - 2), up[2] * (torsoL - 2) + td), b = pt(4, a.Y, a.Z), c2 = pt(3, hipY + 2, up[2] * 10 + td), d2 = pt(-3, hipY + 2, up[2] * 10 + td); x.fillStyle = O.tee; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.lineTo(c2.x, c2.y); x.lineTo(d2.x, d2.y); x.fill(); if (O.tie) { x.fillStyle = O.tie; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.lineTo(front.x, front.y + 8 * s); x.fill(); } }
        if (O.hood) { const hp = pt(0, hipY + torsoL * .3, up[2] * torsoL * .3 + td); x.fillStyle = O.topD; P.rr(x, hp.x - 11 * s * Math.abs(cs) - 1, hp.y - 4 * s, 22 * s * Math.abs(cs) + 2, 9 * s, 3); x.fill(); x.strokeStyle = '#e8e8ee'; x.lineWidth = 1.3; [-4, 4].forEach(dx => { const a = pt(dx, hipY + up[1] * (torsoL - 4), up[2] * (torsoL - 4) + td), b = pt(dx, hipY + torsoL * .4, up[2] * torsoL * .4 + td); x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); }); }
        if (O.badge) { const b = pt(-6, hipY + torsoL * .72, up[2] * torsoL * .72 + td); x.fillStyle = '#e8c850'; x.beginPath(); x.arc(b.x, b.y, 3 * s, 0, TAU); x.fill(); const bl = pt(0, hipY + 6, td); x.fillStyle = '#16161a'; x.fillRect(minx, bl.y - 2, maxx - minx, 4 * s); }
        if (sh) { x.strokeStyle = '#e02a3a'; x.lineWidth = 1.4; for (let k = 0; k < 4; k++) { const a = pt(-6 + (k % 2) * 9, hipY + torsoL * (.85 - k * .17), up[2] * torsoL * .6 + td), b = pt(-2 + (k % 2) * 4, hipY + torsoL * (.7 - k * .17), up[2] * torsoL * .5 + td); x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); } }
      } else if (O.hood) { x.fillStyle = O.topD; x.beginPath(); x.ellipse(neck.x, neck.y + 9 * s, 12 * s * Math.abs(cs) + 4, 10 * s, 0, 0, TAU); x.fill(); }
      if (sh) { x.fillStyle = O.patch; [[-1, .95], [1, .9], [-1, .55], [1, .5], [0, .2]].forEach(([sx2, ly], k) => { const a = pt(sx2 * tw, hipY + torsoL * ly, up[2] * torsoL * ly + td * (k % 2 ? 1 : -1)), b2 = pt(sx2 * tw * .4, hipY + torsoL * (ly - .22), up[2] * torsoL * (ly - .22)), c3 = pt(sx2 * tw * 1.1, hipY + torsoL * (ly - .35), up[2] * torsoL * (ly - .35)); x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b2.x, b2.y); x.lineTo(c3.x, c3.y); x.closePath(); x.fill(); }); }
      if (false) { x.fillStyle = O.top + 'bb'; const a = pt(-tw, hipY + torsoL, up[2] * torsoL), b = pt(-4, hipY + torsoL * .55, up[2] * torsoL * .55), c2 = pt(-tw, hipY + torsoL * .3, up[2] * torsoL * .3); x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.lineTo(c2.x, c2.y); x.fill(); }
      x.restore();
      if (O.case && faceFront) { const cc = pt(-24, hipY - 12, 8); x.fillStyle = '#17171b'; P.rr(x, cc.x - 8 * s, cc.y, 17 * s, 13 * s, 2); x.fill(); }
    } });
    // ---------------- head
    const hr = 15, hc = pt(0, hipY + up[1] * (torsoL + 6) + hr * .9 * Math.cos(lean + rad(p.head)), up[2] * (torsoL + 6) + hr * .9 * Math.sin(lean + rad(p.head)));
    const hl = rad(p.head + p.lean * .0), hP = (X, Y, Z) => { // head-local -> screen (Z forward)
      const yy = Y * Math.cos(hl) - Z * Math.sin(hl) * -1, zz = Y * Math.sin(hl) * -1 + Z * Math.cos(hl); return pt(hc.X + X, hc.Y + yy, hc.Z + zz); };
    items.push({ d: hc.d + .5, f: () => {
      const hcp = hP(0, 0, 0), R = hr * s, face = cs >= -.05;
      const hairBack = () => { x.fillStyle = OL; x.beginPath(); x.ellipse(hcp.x + (-sn) * 0, hcp.y - 2 * s, R * 1.07 + 1.5, R * 1.12 + 1.5, 0, 0, TAU); x.fill(); const b = hP(0, 2, -4); x.fillStyle = P.grad(x, b.x - R, b.y - R, b.x + R, b.y + R, [[0, mix(O.hair, '#ffffff', .22)], [.5, O.hair], [1, mix(O.hair, '#000000', .4)]]); x.beginPath(); x.ellipse(b.x, b.y, R * 1.05, R * 1.1, 0, 0, TAU); x.fill(); x.strokeStyle = O.rim || '#3c4a76'; x.lineWidth = 1.3; x.beginPath(); x.ellipse(b.x, b.y, R * 1.05, R * 1.1, 0, Math.PI * 1.05, Math.PI * 1.9); x.stroke(); };
      const bun = O.bun ? hP(0, hr * 1.05, -hr * .55) : null;
      if (O.bun && bun && !face) { /* bun behind head, drawn after */ }
      if (O.bun && face) { x.fillStyle = OL; x.beginPath(); x.arc(bun.x, bun.y, R * .5 + 1.5, 0, TAU); x.fill(); x.fillStyle = O.hair; x.beginPath(); x.arc(bun.x, bun.y, R * .5, 0, TAU); x.fill(); }
      if (face) hairBack();
      // skull
      x.fillStyle = OL; x.beginPath(); x.ellipse(hcp.x, hcp.y, R * .95 + 1.5, R * 1.06 + 1.5, 0, 0, TAU); x.fill();
      x.fillStyle = P.grad(x, hcp.x - R, hcp.y - R, hcp.x + R, hcp.y + R, [[0, mix(O.skin, '#ffffff', .12)], [.55, O.skin], [1, O.skinD]]); x.beginPath(); x.ellipse(hcp.x, hcp.y, R * .95, R * 1.06, 0, 0, TAU); x.fill();
      // ear
      [[-1, 1], [1, 1]].forEach(([sg]) => { const e = hP(sg * hr * .93, -1, 0); if (e.d > 0 || Math.abs(sn) > .6) { x.fillStyle = O.skinD; x.beginPath(); x.ellipse(e.x, e.y, 2.8 * s, 4 * s, 0, 0, TAU); x.fill(); } });
      if (!face) hairBack();
      if (O.bun && !face) { x.fillStyle = OL; x.beginPath(); x.arc(bun.x, bun.y, R * .5 + 1.5, 0, TAU); x.fill(); x.fillStyle = O.hair; x.beginPath(); x.arc(bun.x, bun.y, R * .5, 0, TAU); x.fill(); }
      // face features (only when that side of the head points at the camera)
      const feat = (X, Y, fn) => { const q = hP(X, Y, hr * .88); if (q.d > 1) fn(q); };
      const vis = Math.max(.35, Math.min(1, cs * .6 + .6));
      if (face) {
        [-1, 1].forEach(sg => feat(sg * 5.8, 1.2, q => {
          const rx = 3.9 * s * (Math.abs(cs) * .75 + .45), ry = 3.2 * s;
          if (p.eye === 2) { x.strokeStyle = OL; x.lineWidth = 1.7; x.beginPath(); x.moveTo(q.x - rx, q.y - ry * .6); x.lineTo(q.x + rx, q.y + ry * .6); x.moveTo(q.x - rx, q.y + ry * .6); x.lineTo(q.x + rx, q.y - ry * .6); x.stroke(); return; }
          x.fillStyle = sh ? '#ff2a3a' : '#f6f6fa'; x.beginPath(); x.ellipse(q.x, q.y, rx, ry, 0, 0, TAU); x.fill();
          x.fillStyle = sh ? '#fff' : '#12121a'; x.beginPath(); x.arc(q.x + sn * -1 * 1.2 * -1, q.y, ry * .62, 0, TAU); x.fill();
          if (O.glasses) { x.strokeStyle = '#2a2a30'; x.lineWidth = 1.2; x.beginPath(); x.arc(q.x, q.y, ry * 1.7, 0, TAU); x.stroke(); }
          x.strokeStyle = O.hair === '#bdb9c4' ? '#8a8690' : OL; x.lineWidth = 1.6; x.beginPath(); x.moveTo(q.x - rx * 1.2, q.y - ry * 1.5 + sg * .8); x.lineTo(q.x + rx * 1.2, q.y - ry * 1.3 - sg * .8); x.stroke();
        }));
        feat(0, -4.5, q => { const mw = 5 * s * (Math.abs(cs) * .7 + .35); if (sh) { x.fillStyle = '#2a0a10'; x.beginPath(); x.ellipse(q.x, q.y, mw * 1.3, 3.4 * s, 0, 0, TAU); x.fill(); x.fillStyle = '#e8e0d0'; for (let k = -3; k <= 3; k++) { x.beginPath(); x.moveTo(q.x + k * mw * .38, q.y - 2.8 * s); x.lineTo(q.x + k * mw * .38 + 1.3, q.y); x.lineTo(q.x + k * mw * .38 - 1.3, q.y); x.fill(); } } else if (p.mouth) { x.fillStyle = '#2a0a10'; x.beginPath(); x.ellipse(q.x, q.y, mw * .6, 3 * s, 0, 0, TAU); x.fill(); } else { x.strokeStyle = '#6a3a3a'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(q.x - mw * .6, q.y); x.lineTo(q.x + mw * .6, q.y); x.stroke(); } });
        const nz = hP(0, -1, hr + 1.5); if (nz.d > 1) { x.strokeStyle = O.skinD; x.lineWidth = 1.5; x.beginPath(); x.moveTo(nz.x, nz.y - 2 * s); x.lineTo(nz.x + sn * -2 * -1, nz.y + 1.5 * s); x.stroke(); }
      }
      // hair front / cap
      if (O.cap) {
        const base = hP(0, hr * .55, 0), tip = hP(0, hr * 1.15, 0); x.fillStyle = OL; x.beginPath(); x.ellipse(base.x, base.y - 3 * s, R * 1.02 + 1.5, R * .72 + 1.5, 0, Math.PI, TAU); x.fill(); x.fillStyle = O.cap; x.beginPath(); x.ellipse(base.x, base.y - 3 * s, R * 1.02, R * .72, 0, Math.PI, TAU); x.fill();
        const b1 = hP(-hr * .8, hr * .5, hr * .6), b2 = hP(hr * .8, hr * .5, hr * .6), b3 = hP(hr * .7, hr * .35, hr * 1.8), b4 = hP(-hr * .7, hr * .35, hr * 1.8);
        if (cs > -.2 || true) { x.fillStyle = mix(O.cap, '#000000', .25); x.strokeStyle = OL; x.lineWidth = 1.5; x.beginPath(); x.moveTo(b1.x, b1.y); x.lineTo(b2.x, b2.y); x.lineTo(b3.x, b3.y); x.lineTo(b4.x, b4.y); x.closePath(); if (cs > 0) { x.fill(); x.stroke(); } }
        if (O.badge) { const bq = hP(0, hr * .9, hr * .85); x.fillStyle = '#e8c850'; x.fillRect(bq.x - 2 * s, bq.y - 2 * s, 4 * s, 4 * s); }
      } else if (!O.bun) {
        // messy spiked hair: tips on the crown + a fringe over the forehead
        const tips = [[-.95, 1.25, .1, -.8], [-.55, 1.55, .6, -1], [-.1, 1.7, .9, -1.4], [.4, 1.55, .5, -1.1], [.85, 1.3, 0, -1], [0, 1.45, -.9, -1.3], [-.7, 1.2, -.7, -1.1], [.7, 1.2, -.7, -1.1]], pu = p.hairUp ? 1.35 : 1;
        tips.forEach(([tx, ty, tz, base0]) => { const a = hP(tx * hr * .75 - 3 * s * 0, hr * .72, tz * hr * .55), b = hP(tx * hr * 1.05, ty * hr * pu, tz * hr * .9), c2 = hP(tx * hr * .75 + 4, hr * .66, tz * hr * .55); x.fillStyle = O.hair; x.strokeStyle = O.rim || OL; x.lineWidth = 1.1; x.beginPath(); x.moveTo(a.x - 4 * s, a.y); x.lineTo(b.x, b.y); x.lineTo(c2.x + 4 * s, c2.y); x.closePath(); x.fill(); x.stroke(); });
        if (cs > -.1) { const f0 = [hP(-hr, .2 * hr, hr * .3), hP(-hr * .9, hr * .9, hr * .7), hP(0, hr * 1.0, hr * .95), hP(hr * .9, hr * .9, hr * .7), hP(hr, .15 * hr, hr * .3), hP(hr * .55, hr * .3, hr * .98), hP(hr * .2, hr * .78, hr * 1.0), hP(-hr * .15, hr * .35, hr * 1.0), hP(-hr * .5, hr * .62, hr * .98)]; x.fillStyle = O.hair; x.strokeStyle = O.rim || OL; x.lineWidth = 1.1; x.beginPath(); f0.forEach((q, i) => i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y)); x.closePath(); x.fill(); x.stroke(); }
        const ah0 = hP(hr * .1, hr * 1.0, 0), ah1 = hP(hr * .3, hr * (2.0 + (p.hairUp ? .5 : 0)), 0), ah2 = hP(hr * .7, hr * 1.85, hr * .2); x.strokeStyle = O.rim || O.hair; x.lineWidth = 3.4 * s * .8; x.beginPath(); x.moveTo(ah0.x, ah0.y); x.quadraticCurveTo(ah1.x, ah1.y, ah2.x, ah2.y); x.stroke(); x.strokeStyle = O.hair; x.lineWidth = 2.4 * s * .8; x.beginPath(); x.moveTo(ah0.x, ah0.y); x.quadraticCurveTo(ah1.x, ah1.y, ah2.x, ah2.y); x.stroke();
        if (sh) { x.strokeStyle = '#e8e0d0'; x.lineWidth = 1; x.beginPath(); for (let k = 0; k < 6; k++) { const a = hP(-hr * .3 + k * 3.2, hr * .35, hr * .95); x.moveTo(a.x, a.y); x.lineTo(a.x, a.y + 3.5); } x.stroke(); }
      } else if (O.bun) { const t0 = hP(-hr * .95, hr * .35, hr * .3), t1 = hP(0, hr * 1.08, hr * .4), t2 = hP(hr * .95, hr * .35, hr * .3); x.fillStyle = O.hair; x.beginPath(); x.moveTo(t0.x, t0.y); x.quadraticCurveTo(t1.x, t1.y - 4 * s, t2.x, t2.y); x.lineTo(hP(hr * .5, hr * .5, hr * .9).x, hP(hr * .5, hr * .5, hr * .9).y); x.lineTo(hP(-hr * .5, hr * .5, hr * .9).x, hP(-hr * .5, hr * .5, hr * .9).y); x.closePath(); if (cs > -.2) x.fill(); }
    } });
    items.sort((a, b) => a.d - b.d); items.forEach(i => i.f());
    // hood bunched behind the neck is drawn first for back views via torso; neck:
    return c;
  };
  const grad = (ctx, x0, y0, x1, y1, a, b, c3) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); if (c3) { g.addColorStop(.5, b); g.addColorStop(1, c3); } else g.addColorStop(1, b); return g; };

  // build every frame of an animation: returns canvases
  P.anim = (name, yaw, key, opts) => {
    const frames = POSES[key]; return frames.map(f => P.figure(name, yaw, Object.assign({}, POSE0, f), opts));
  };
  P.POSE0 = POSE0;
})();
