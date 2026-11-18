/* Project X (ACI port) - 3D overworld. Builds a three.js scene for one of the 12 outdoor areas (ground texture painted per tile, instanced
   grass strokes, buildings / trees / props as real geometry using the painted facades as textures), walks Claire around with tile collision,
   handles exits and doors, and feeds the fixed high-angle camera. Rendered through the ASCII shader in px-gfx.js. Units: 1 tile = T world units. */
(function () {
  'use strict';
  const PX = window.PX, THREE = window.THREE, G = PX.gfx, P = PX.paint, D = PX.D, T = 1.5;
  const W3 = PX.World3 = { cur: null, T, keys: {}, night: 0 };
  const col = h => new THREE.Color(h);

  // ground colours per tile code: [base, accent]
  const GC = { g: ['#2f6a3a', '#3d7f46'], f: ['#2f6a3a', '#3d7f46'], G: ['#24502d', '#2d6236'], r: ['#2c303e', '#3a4052'], l: ['#3a3e4c', '#e6c83c'], v: ['#3a3e4c', '#e6c83c'], '=': ['#3a3e4c', '#e4e4ea'], '!': ['#3a3e4c', '#e4e4ea'], s: ['#8a8fa4', '#a0a6bc'], p: ['#4a5270', '#566084'], d: ['#7a5e3a', '#8e6e44'], b: ['#8a6038', '#a4784a'], t: ['#58627a', '#707a94'], A: ['#2c3448', '#3a4660'], o: ['#a8864c', '#bd9a5c'], w: ['#1a4a88', '#3a78c0'], W: ['#0e3068', '#2858a0'], k: ['#6e3c30', '#8a4a3a'], n: ['#2e2a2e', '#4a444c'], N: ['#2e2a2e', '#4a444c'] };

  function paintGround(m) {
    const S = 24, cols = m.ground[0].length, rows = m.ground.length, cv = document.createElement('canvas'); cv.width = cols * S; cv.height = rows * S; const x = cv.getContext('2d');
    for (let y = 0; y < rows; y++) for (let xx = 0; xx < cols; xx++) {
      const c = m.ground[y][xx], [a, b] = GC[c] || ['#000', '#000'], px = xx * S, py = y * S;
      x.fillStyle = a; x.fillRect(px, py, S, S);
      for (let i = 0; i < 26; i++) { const h = P.hash(xx * 31 + i, y * 17 + i, 5); x.fillStyle = P.hash(xx + i, y, 9) > .5 ? b : a; x.globalAlpha = .22; x.fillRect(px + P.hash(xx, y + i, 3) * S, py + P.hash(xx + i, y, 4) * S, 2 + h * 4, 2 + h * 3); }
      x.globalAlpha = 1;
      if (c === 'l') { if (xx % 2 === 0) { x.fillStyle = b; x.fillRect(px + 2, py + S / 2 - 1, S - 4, 3); } }
      if (c === 'v') { if (y % 2 === 0) { x.fillStyle = b; x.fillRect(px + S / 2 - 1, py + 2, 3, S - 4); } }
      if (c === '=') for (let i = 0; i < 4; i++) { x.fillStyle = b; x.fillRect(px + 2 + i * 6, py, 3, S); }
      if (c === '!') for (let i = 0; i < 4; i++) { x.fillStyle = b; x.fillRect(px, py + 2 + i * 6, S, 3); }
      if (c === 's' || c === 'p' || c === 't') { x.strokeStyle = 'rgba(0,0,0,.1)'; x.lineWidth = 1; x.strokeRect(px + .5, py + .5, S - 1, S - 1); }
      if (c === 'k') { x.strokeStyle = 'rgba(0,0,0,.4)'; for (let r = 0; r < 4; r++) { x.beginPath(); x.moveTo(px, py + r * 6); x.lineTo(px + S, py + r * 6); x.stroke(); } }
      if (c === 'b') { x.strokeStyle = 'rgba(0,0,0,.4)'; for (let r = 0; r < 5; r++) { x.beginPath(); x.moveTo(px + r * 5, py); x.lineTo(px + r * 5, py + S); x.stroke(); } }
      if (c === 'f') { x.fillStyle = '#9aa2b4'; x.fillRect(px + S / 2 - 1, py, 3, S); }
    }
    for (let i = 0; i < cols * rows * 1.2; i++) { const bx = P.hash(i, 1, 77) * cols * S, by = P.hash(i, 2, 77) * rows * S, r = 18 + P.hash(i, 3, 77) * 50, ci = ((by / S) | 0) * 0 + Math.min(rows - 1, (by / S) | 0), cj = Math.min(cols - 1, (bx / S) | 0), cc = m.ground[ci][cj];
      if (cc !== 'g' && cc !== 'G' && cc !== 'd') continue; const gr = x.createRadialGradient(bx, by, 0, bx, by, r); const light = P.hash(i, 4, 77) > .5; gr.addColorStop(0, light ? 'rgba(120,190,80,.35)' : 'rgba(10,40,20,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(bx - r, by - r, r * 2, r * 2); }
    const t = G.tex(cv); t.anisotropy = 8; return t;
  }

  W3.clear = () => { if (W3.hero) W3.hero.root.parent && W3.hero.root.parent.remove(W3.hero.root); W3.npcs = []; G.clear(); W3.waters = []; W3.grass = null; };

  W3.load = (id, spawn, facing) => {
    const m = D.maps[id]; if (!m) { PX.toast && PX.toast('That way is not ready yet.'); return false; }
    W3.clear(); const A = W3.cur = { id, m, cols: m.ground[0].length, rows: m.ground.length, name: m.name, exits: m.exits || [] }; A.solid = new Uint8Array(A.cols * A.rows);
    for (let y = 0; y < A.rows; y++) for (let x = 0; x < A.cols; x++) if (!(D.tiles[m.ground[y][x]] || {}).walkable) A.solid[y * A.cols + x] = 1;
    const sc = G.scene; sc.background = col('#070a14');
    // lights
    W3.hemi = new THREE.HemisphereLight(0xb0c4ff, 0x2a3a2a, 1.0); sc.add(W3.hemi);
    W3.sun = new THREE.DirectionalLight(0xfff0d8, 2.2); W3.sun.position.set(-18, 34, 22); W3.sun.castShadow = true; W3.sun.shadow.mapSize.set(2048, 2048); const sh = W3.sun.shadow.camera; sh.left = -26; sh.right = 26; sh.top = 26; sh.bottom = -26; sh.near = 1; sh.far = 120; sh.updateProjectionMatrix(); sc.add(W3.sun); sc.add(W3.sun.target);
    // ground
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(A.cols * T, A.rows * T), new THREE.MeshStandardMaterial({ map: paintGround(m), roughness: 1 })); gm.rotation.x = -Math.PI / 2; gm.position.set(A.cols * T / 2, 0, A.rows * T / 2); gm.receiveShadow = true; sc.add(gm);
    // far plane so the camera never sees the void
    const far = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x14241a, roughness: 1 })); far.rotation.x = -Math.PI / 2; far.position.set(A.cols * T / 2, -.05, A.rows * T / 2); sc.add(far);
    // grass strokes (thin blades, tilted, many per tile) on grass tiles
    const blades = []; for (let y = 0; y < A.rows; y++) for (let x = 0; x < A.cols; x++) { const c = m.ground[y][x]; if (c === 'g' || c === 'G') for (let i = 0; i < 28; i++) blades.push([x + P.hash(x, y, i), y + P.hash(x, y, i + 40), c === 'G']); }
    if (blades.length) { const geo = new THREE.BoxGeometry(.075, .8, .04); geo.translate(0, .4, 0); const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }); const im = new THREE.InstancedMesh(geo, mat, blades.length), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), cc = new THREE.Color();
      blades.forEach(([bx, by, dark], i) => { e.set((P.hash(bx * 9, by * 9, 1) - .5) * .9, P.hash(bx * 7, by * 7, 2) * 6.28, (P.hash(bx * 5, by * 5, 3) - .5) * .9); q.setFromEuler(e); mx.compose(new THREE.Vector3(bx * T, 0, by * T), q, new THREE.Vector3(1, .6 + P.hash(bx, by, 4) * .9, 1)); im.setMatrixAt(i, mx); const k = P.hash(bx, by, 6); cc.setRGB((dark ? .08 : .22) + k * .16, (dark ? .42 : .7) + k * .3, (dark ? .16 : .2) + k * .1); im.setColorAt(i, cc); });
      im.castShadow = false; im.receiveShadow = true; sc.add(im); W3.grass = im; }
    // props
    A.lights = [];
    m.props.forEach(([kind, px, py]) => { const info = D.props[kind]; if (!info) return;
      if (info.door !== undefined) { for (let y = py; y < py + info.h; y++) for (let x = px; x < px + info.w; x++) { const isDoor = y === py + info.h - 1 && x === px + info.door; if (!isDoor) A.solid[y * A.cols + x] = 1; } }
      else if (info.block > 0) for (let y = py + info.h - info.block; y < py + info.h; y++) for (let x = px; x < px + info.w; x++) if (A.solid[y * A.cols + x] !== undefined) A.solid[y * A.cols + x] = 1;
      W3.addProp(kind, info, px, py); });
    (m.blocks || []).forEach(([bx, by, bw, bh]) => { for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) A.solid[y * A.cols + x] = 1; });
    // hero
    if (!W3.hero) { W3.hero = new PX.Rig('claire'); W3.hero.giveKatana && 0; }
    const sp = spawn || (() => { const e = A.exits.find(e => e.kind === 'walk'); return e ? [e.x + e.w / 2, e.y + e.h / 2] : [2, 2]; })();
    W3.px = sp[0] + .5; W3.py = sp[1] + .5; sc.add(W3.hero.root); W3.hero.root.position.set(W3.px * T, 0, W3.py * T); W3.face = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 }[facing || 'down'] || 0; W3.hero.root.rotation.y = W3.face; W3.vx = W3.vz = 0; W3.exiting = 0;
    G.cam.x = G.cam.tx = W3.px * T; G.cam.z = G.cam.tz = W3.py * T; G.cam.ty = .9; G.cam.dist = 17; G.cam.pitch = 56; G.camera.fov = 28; G.camera.updateProjectionMatrix();
    W3.glow = new THREE.PointLight(0xffe2b0, 14, 9, 1.4); sc.add(W3.glow);
    sc.fog = new THREE.Fog(0x0a0e1a, 40, 110);
    W3.setNight(W3.night);
    W3.banner = { text: A.name, t: 3 };
    return true;
  };

  // ---------------------------------------------------------------- props
  W3.addProp = (kind, info, px, py) => {
    const sc = G.scene, w = info.w * T, h = info.h * T, cx = (px + info.w / 2) * T, bz = (py + info.h) * T;
    const mk = (geo, color, o) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .9 }, o || {}))); m.castShadow = true; m.receiveShadow = true; return m; };
    if (/^tree/.test(kind)) {
      const g = new THREE.Group(), trunk = mk(new THREE.CylinderGeometry(.18, .26, 1.6, 8), 0x4a3426); trunk.position.y = .8; g.add(trunk);
      const hue = kind === 'tree_b' ? [0x2f7a3a, 0x3d9448] : [0x2a6e34, 0x378a40];
      for (let i = 0; i < 5; i++) { const b = mk(new THREE.IcosahedronGeometry(.9 + P.hash(px, py, i) * .45, 1), hue[i % 2]); b.position.set((P.hash(px, i, 1) - .5) * 1.2, 2 + i * .42 * (i < 4 ? 1 : 1.3), (P.hash(py, i, 2) - .5) * 1.0); g.add(b); }
      g.position.set(cx, 0, bz - .4); sc.add(g); return; }
    if (P.BLD[kind]) {
      const cv = P.building(kind, info, 64), tex = G.tex(cv), bh = h * .85, depth = 3.2, b = P.BLD[kind];
      const front = new THREE.MeshStandardMaterial({ map: tex, roughness: .9, emissive: new THREE.Color(0xffffff), emissiveMap: tex, emissiveIntensity: .0 }); W3.facades = W3.facades || []; W3.facades.push(front);
      const side = new THREE.MeshStandardMaterial({ color: col(b.wall).multiplyScalar(.75), roughness: 1 }), roof = new THREE.MeshStandardMaterial({ color: col(b.roof), roughness: .8 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, bh, depth), [side, side, roof, side, front, side]); box.position.set(cx, bh / 2, bz - depth / 2); box.castShadow = true; box.receiveShadow = true; sc.add(box);
      const shp = new THREE.Shape(); shp.moveTo(-(depth / 2 + .25), 0); shp.lineTo(depth / 2 + .25, 0); shp.lineTo(0, 1.1); shp.lineTo(-(depth / 2 + .25), 0);
      const rg = new THREE.ExtrudeGeometry(shp, { depth: w + .5, bevelEnabled: false }); rg.rotateY(Math.PI / 2); rg.translate(-(w + .5) / 2, 0, 0);
      const ridge = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: col(b.roof), roughness: .85 })); ridge.position.set(cx, bh, bz - depth / 2); ridge.castShadow = true; ridge.receiveShadow = true; sc.add(ridge);
      return; }
    // small prop: painted billboard, standing, with a little depth
    const cv = P.propCanvas(kind, info, 64), tex = G.tex(cv), mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: .35, roughness: 1, side: THREE.DoubleSide });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); pl.position.set(cx, h / 2, bz - .15); pl.rotation.x = -.18; pl.castShadow = true; sc.add(pl);
    if (/lamp/.test(kind)) { const pt = new THREE.PointLight(0xffd890, 0, 12, 1.6); pt.position.set(cx, h * .95, bz - .4); sc.add(pt); W3.lamps = W3.lamps || []; W3.lamps.push(pt); }
  };

  W3.setNight = n => { W3.night = n; const s = 1 - n; if (W3.hemi) { W3.hemi.intensity = .5 + s * .6; W3.hemi.color.set(n > .5 ? 0x5a70c8 : 0xc8d4ff); } if (W3.sun) { W3.sun.intensity = .4 + s * 1.9; W3.sun.color.set(n > .5 ? 0x8aa0ff : 0xfff0d8); } if (G.scene.fog) G.scene.fog.color.set(n > .5 ? 0x04060e : 0x1a2436); G.scene.background = col(n > .5 ? '#04060c' : '#101828'); (W3.lamps || []).forEach(l => l.intensity = n * 14); (W3.facades || []).forEach(f => f.emissiveIntensity = n * .55); };

  // ---------------------------------------------------------------- movement / collision
  const solidAt = (A, x, y) => { const tx = Math.floor(x), ty = Math.floor(y); if (tx < 0 || ty < 0 || tx >= A.cols || ty >= A.rows) return true; return A.solid[ty * A.cols + tx] === 1; };
  const free = (A, x, y) => { const r = .28; return !(solidAt(A, x - r, y - r * .4) || solidAt(A, x + r, y - r * .4) || solidAt(A, x - r, y + r * .4) || solidAt(A, x + r, y + r * .4)); };
  W3.update = dt => {
    const A = W3.cur; if (!A) return; const k = W3.keys, hero = W3.hero;
    let mx = (k.right ? 1 : 0) - (k.left ? 1 : 0), my = (k.down ? 1 : 0) - (k.up ? 1 : 0); const len = Math.hypot(mx, my) || 1; mx /= len; my /= len;
    const spd = k.sprint ? 5.6 : 3.4, tvx = mx * spd, tvy = my * spd; W3.vx += (tvx - W3.vx) * Math.min(1, dt * 14); W3.vz += (tvy - W3.vz) * Math.min(1, dt * 14);
    const nx = W3.px + W3.vx * dt, ny = W3.py + W3.vz * dt; if (free(A, nx, W3.py)) W3.px = nx; else W3.vx = 0; if (free(A, W3.px, ny)) W3.py = ny; else W3.vz = 0;
    const sp = Math.hypot(W3.vx, W3.vz);
    if (sp > .3) { const want = Math.atan2(W3.vx, W3.vz); let d = want - W3.face; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; W3.face += d * Math.min(1, dt * 12); }
    const want = sp > 4.2 ? 'run' : sp > .3 ? 'walk' : 'idle'; if (hero.cur !== want) hero.play(want, { loop: true }); hero.anim.speed = want === 'idle' ? 1 : Math.max(.6, sp / (want === 'run' ? 5.6 : 3.4));
    hero.root.position.set(W3.px * T, 0, W3.py * T); hero.root.rotation.y = W3.face; hero.update(dt); W3.glow.position.set(W3.px * T + 1.2, 3.2, W3.py * T + 2);
    G.cam.tx = W3.px * T; G.cam.tz = W3.py * T; G.updateCamera(dt); W3.sun.target.position.set(W3.px * T, 0, W3.py * T); W3.sun.position.set(W3.px * T - 18, 34, W3.py * T + 22);
    // exits
    W3.prompt = null;
    for (const e of A.exits) {
      if (e.kind === 'walk') { if (W3.px >= e.x && W3.px <= e.x + e.w && W3.py >= e.y && W3.py <= e.y + e.h && !W3.exiting) { W3.exiting = 1; if (e.to && D.maps[e.to]) { W3.load(e.to, e.spawn, e.facing); return; } } }
      else if (e.kind === 'door') { const d = Math.hypot(W3.px - (e.x + .5), W3.py - (e.y + .6)); if (d < 1.4) { W3.prompt = { text: (e.label ? e.label + ': ' : '') + 'press E', e }; if (k.ok) { k.ok = 0; if (e.locked) W3.say = { text: e.locked, t: 3 }; else if (D.maps[e.to]) { W3.load(e.to, e.spawn, e.facing); return; } else W3.say = { text: 'Inside: ' + e.to + ' (rooms are the next step).', t: 3 }; } } }
    }
    if (W3.say) { W3.say.t -= dt; if (W3.say.t <= 0) W3.say = null; } if (W3.banner) { W3.banner.t -= dt; if (W3.banner.t <= 0) W3.banner = null; }
  };
})();
