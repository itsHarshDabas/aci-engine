/* Project X (ACI port) - real 3D character models (Claire, Monster Claire, Grandma, the friend, the office man, officers).
   Built from lathes / tapered limbs / blade hair with toon shading and inverted-hull outlines, posed with the shared pose data
   (PX.POSES) and animated live. Design follows the project's character sheet. Units are metres, +Z is forward, +Y up. */
(function () {
  'use strict';
  const PX = window.PX, THREE = window.THREE, G = PX.gfx, rad = d => d * Math.PI / 180;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const LOOK = {
    claire: { h: 1.1, slim: .86, skin: '#e2b48a', hair: '#34344a', top: '#dcab2a', topD: '#a47a14', pants: '#16204a', shoes: '#f0f0f4', hood: true, ahoge: true, lanky: 1 },
    shade: { h: 1.2, slim: .92, skin: '#4a3e5c', hair: '#2a2438', top: '#3a2c4c', topD: '#1c1428', pants: '#2c2238', shoes: '#241e2e', hood: true, ahoge: true, lanky: 1.18, shade: true, patch: '#c89a22' },
    grandma: { h: .85, skin: '#efd0b4', hair: '#bdb9c4', top: '#a898cc', topD: '#7a6aa0', pants: '#3a2a44', shoes: '#9a88be', skirt: true, bun: true, glasses: true, cup: true, lanky: .9 },
    friend: { h: 1.02, skin: '#9c6a46', hair: '#2c2c36', top: '#2e807c', topD: '#175450', pants: '#1c2232', shoes: '#f2f2f6', tee: '#f4f4f6', cap: '#f4f2ec', lanky: 1 },
    office: { h: .99, skin: '#e4c4a4', hair: '#34343c', top: '#7a7c84', topD: '#4a4c54', pants: '#6e7078', shoes: '#18181c', tee: '#e8e8ee', tie: '#1c2a58', glasses: true, case: true, lanky: 1 },
    officer: { h: 1.05, skin: '#d8a888', hair: '#1a1a1e', top: '#1c2a58', topD: '#0e1634', pants: '#141c40', shoes: '#101014', cap: '#141c40', badge: true, belt: true, lanky: 1 },
  };
  PX.LOOK3D = LOOK;

  const ARM = { claire: 1 }, ANIMS = {
    idle: { t: 2.6, loop: true }, walk: { t: .78, loop: true }, run: { t: .56, loop: true }, light1: { t: .38 }, light2: { t: .38 }, light3: { t: .5 }, heavy: { t: .85 }, cast: { t: .6 }, charge: { t: .9, loop: true },
    dodge: { t: .5 }, hurt: { t: .28 }, ko: { t: .9 }, drink: { t: .8 }, slash: { t: .62 },
  };
  PX.ANIM3D = ANIMS;

  class Rig {
    constructor(name, o) {
      o = o || {}; this.name = name; this.L = Object.assign({}, LOOK[name]); this.form = 'human'; this.mats = []; this.meshes = [];
      this.root = new THREE.Group(); this.root.name = name; this.yaw = 0; this.anim = null; this.t = 0; this.pose = Object.assign({}, PX.paint.POSE0); this.scale = (o.scale || 1) * this.L.h;
      this.sway = []; this.vel = new THREE.Vector3(); this.lastPos = null; this.svx = 0; this.svz = 0; this.build(); this.root.scale.setScalar(this.scale); this.play('idle');
    }
    mat(color, o) { const m = G.toon(color, o); this.mats.push(m); return m; }
    part(geo, mat, parent, x, y, z, ol) {
      const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; parent.add(m); this.meshes.push(m);
      if (ol !== 0) { geo.computeBoundingBox(); const b = geo.boundingBox, t = ol || .011, sx = 1 + t / Math.max(.01, (b.max.x - b.min.x) / 2), sy = 1 + t / Math.max(.01, (b.max.y - b.min.y) / 2), sz = 1 + t / Math.max(.01, (b.max.z - b.min.z) / 2);
        const o = new THREE.Mesh(geo, this.outlineMat || (this.outlineMat = new THREE.MeshBasicMaterial({ color: this.L.shade ? 0xc08aff : 0x05050a, side: THREE.BackSide }))); o.scale.set(sx, sy, sz); m.add(o); }
      return m;
    }
    limbP(parent, len, prof, mat, ol) { const pts = prof.map(([t, r]) => new THREE.Vector2(r, -t * len)).reverse(); const g = new THREE.LatheGeometry(pts, 14); return this.part(g, mat, parent, 0, 0, 0, ol); }
    limb(parent, len, r0, r1, mat, ol) { const g = new THREE.CylinderGeometry(r0, r1, len, 14, 1); g.translate(0, -len / 2, 0); return this.part(g, mat, parent, 0, 0, 0, ol); }
    build() {
      const L = this.L, S = this, lk = L.lanky, hip = .9 * lk;
      const skin = this.mat(L.skin), hair = this.mat(L.hair), top = this.mat(L.top), topD = this.mat(L.topD), pants = this.mat(L.pants), shoes = this.mat(L.shoes), white = this.mat('#f2f2f6'), dark = this.mat('#111116');
      const root = this.root; this.roll = new THREE.Group(); this.roll.position.y = .5; root.add(this.roll); const body = this.body = new THREE.Group(); body.position.y = -.5; this.roll.add(body);
      const pel = this.pelvis = new THREE.Group(); pel.position.y = hip; body.add(pel); this.hipY = hip;
      // ---- legs
      const legLen = .45 * lk;
      this.legs = [-1, 1].map(side => {
        const th = new THREE.Group(); th.position.set(side * .088, -.02, 0); pel.add(th);
        this.limbP(th, legLen, [[0,.088],[.12,.108],[.45,.094],[1,.078]], pants); const knee = new THREE.Group(); knee.position.y = -legLen; th.add(knee);
        this.part(new THREE.SphereGeometry(.082, 12, 10), pants, knee, 0, 0, 0, 0);
        this.limbP(knee, legLen, [[0,.078],[.2,.084],[.6,.077],[.9,.07],[1,.076]], pants);
        if (L.skirt) { /* skirt handled below */ }
        const ank = new THREE.Group(); ank.position.y = -legLen; knee.add(ank); { const cf = new THREE.TorusGeometry(.074, .024, 8, 16); cf.rotateX(Math.PI / 2); this.part(cf, pants, ank, 0, .035, 0, 0); }
        const heelG = new THREE.SphereGeometry(.068, 12, 10); heelG.scale(.95, .85, 1.25); heelG.translate(0, -.03, .02); this.part(heelG, shoes, ank, 0, -.015, 0);
        const toe = new THREE.Group(); toe.position.set(0, -.04, .09); ank.add(toe); const toeG = new THREE.SphereGeometry(.06, 12, 10); toeG.scale(.95, .6, 1.3); toeG.translate(0, 0, .06); this.part(toeG, shoes, toe, 0, 0, 0, .008);
        const sole = new THREE.CylinderGeometry(.07, .07, .02, 14); sole.scale(1.1, 1, 2.2); sole.translate(0, -.075, .065); this.part(sole, white, ank, 0, 0, 0, 0);
        return { th, knee, ank, toe };
      });
      // ---- torso (lathe: hem -> shoulders), elliptical cross-section
      const tor = this.torso = new THREE.Group(); tor.position.y = .02; pel.add(tor);
      const torsoH = .52 * lk;
      const prof = [[.0, .152], [.05, .175], [.2, .152], [.36, .15], [.46, .158], [.5, .135], [.53, .085], [.545, .055]].map(([y, r]) => new THREE.Vector2(r, y * lk * (L.skirt ? .96 : 1)));
      const tg = new THREE.LatheGeometry(prof, 20); tg.scale(1.3 * (L.slim || 1), 1, .86); const tm = this.part(tg, top, tor, 0, 0, 0, .012);
      { const hem = new THREE.TorusGeometry(.15, .028, 8, 24); hem.rotateX(Math.PI / 2); hem.scale(1.3 * (L.slim || 1), 1, .86); const hm = this.part(hem, topD, tor, 0, .035, 0, .006); this.sway.push({ o: hm, a: .12, ph: 0 }); }
      // hoodie / jacket details
      if (L.hood) {
        const hood = new THREE.TorusGeometry(.105, .05, 10, 20); hood.rotateX(Math.PI / 2 - .35); this.part(hood, topD, tor, 0, torsoH + .02, -.015, .008);
        const sack = new THREE.SphereGeometry(.11, 14, 10); sack.scale(1.1, .95, .62); this.part(sack, topD, tor, 0, torsoH - .04, -.1, .008);
        const pocket = new THREE.BoxGeometry(.25, .1, .045); this.part(pocket, topD, tor, 0, torsoH * .27, .105 * 1.0, .008);
        [-1, 1].forEach(sd => { const cord = new THREE.CylinderGeometry(.007, .007, .2, 6); this.sway.push({ o: this.part(cord, white, tor, sd * .035, torsoH * .72, .118, 0), a: .5, ph: sd }); const tip = new THREE.SphereGeometry(.012, 6, 6); this.part(tip, white, tor, sd * .035, torsoH * .72 - .1, .118, 0); });
      }
      if (L.tee) { const tp = new THREE.BoxGeometry(.13, .38, .03); this.part(tp, this.mat(L.tee), tor, 0, torsoH * .6, .105, 0); if (L.tie) this.part(new THREE.BoxGeometry(.035, .3, .02), this.mat(L.tie), tor, 0, torsoH * .58, .125, 0); }
      if (L.belt) { this.part(new THREE.CylinderGeometry(.152, .152, .045, 18), dark, tor, 0, .05, 0, 0).scale.set(1.32, 1, .78); this.part(new THREE.BoxGeometry(.05, .04, .03), this.mat('#d8c070'), tor, 0, .05, .125, 0); }
      if (L.badge) this.part(new THREE.CylinderGeometry(.022, .022, .01, 6), this.mat('#e8c850'), tor, .08, torsoH * .75, .112, 0).rotation.x = Math.PI / 2;
      if (L.case) { const cs = new THREE.Group(); cs.position.set(.0, 0, 0); this.caseG = cs; }
      if (L.skirt) { const sk = new THREE.CylinderGeometry(.14, .27, .72, 18, 1, true); sk.translate(0, -.34, 0); sk.scale(1, 1, .9); const skm = new THREE.Mesh(sk, this.mat(L.pants, { side: THREE.DoubleSide })); skm.castShadow = true; pel.add(skm); skm.position.y = .02; this.sway.push({ o: skm, a: .16, ph: 1.3 }); }
      // ---- arms
      this.arms = [-1, 1].map(side => {
        const sh = new THREE.Group(); sh.position.set(side * .222 * (L.slim || 1), torsoH - .06, 0); tor.add(sh);
        this.part(new THREE.SphereGeometry(.078, 12, 10), top, sh, 0, 0, 0, .008);
        const ual = .29 * lk, fal = .27 * lk; this.limbP(sh, ual, [[0,.068],[.25,.084],[.7,.076],[1,.062]], top);
        const el = new THREE.Group(); el.position.y = -ual; sh.add(el); this.part(new THREE.SphereGeometry(.068, 10, 8), top, el, 0, 0, 0, 0); this.limbP(el, fal * .92, [[0,.062],[.3,.076],[.7,.068],[1,.048]], top);
        const cuff = new THREE.CylinderGeometry(.05, .054, .045, 12); this.part(cuff, topD, el, 0, -fal * .92, 0, .006);
        const wr = new THREE.Group(); wr.position.y = -fal * .92 - .03; el.add(wr);
        const palm = new THREE.BoxGeometry(.075, .085, .035); this.part(palm, skin, wr, 0, -.045, 0, .006);
        const fingers = []; for (let k = 0; k < 4; k++) { const f1 = new THREE.Group(); f1.position.set((k - 1.5) * .019, -.088, 0); wr.add(f1); const l1 = new THREE.CylinderGeometry(.0085, .0075, .036, 6); l1.translate(0, -.018, 0); this.part(l1, skin, f1, 0, 0, 0, 0); const f2 = new THREE.Group(); f2.position.y = -.036; f1.add(f2); const l2 = new THREE.CylinderGeometry(.0075, .0065, .03, 6); l2.translate(0, -.015, 0); this.part(l2, skin, f2, 0, 0, 0, 0); fingers.push([f1, f2]); }
        const th = new THREE.Group(); th.position.set(-side * .042, -.03, .008); th.rotation.z = side * .5; wr.add(th); const tl = new THREE.CylinderGeometry(.01, .008, .04, 6); tl.translate(0, -.02, 0); this.part(tl, skin, th, 0, 0, 0, 0); const th2 = new THREE.Group(); th2.position.y = -.04; th.add(th2); const tl2 = new THREE.CylinderGeometry(.008, .007, .03, 6); tl2.translate(0, -.015, 0); this.part(tl2, skin, th2, 0, 0, 0, 0);
        const claws = []; for (let k = -1; k <= 1; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(.012, .09, 5), this.mat('#d8d0c4')); c.position.set(k * .022, -.12, .01); c.rotation.x = Math.PI + .2; c.visible = false; wr.add(c); claws.push(c); }
        return { sh, el, wr, hand: wr, claws, fingers, thumb: [th, th2], skinPart: wr.children[0] };
      });
      // ---- neck + head
      const neck = new THREE.Group(); neck.position.y = torsoH + .02; tor.add(neck); this.part(new THREE.CylinderGeometry(.044, .054, .1, 12), skin, neck, 0, .02, 0, .006); { const tz = new THREE.SphereGeometry(.1, 16, 10); tz.scale(1.9 * (L.slim || 1), .55, 1.0); this.part(tz, top, tor, 0, torsoH - .03, 0, .008); const col = new THREE.TorusGeometry(.062, .02, 8, 16); col.rotateX(Math.PI / 2); this.part(col, topD, neck, 0, -.02, 0, .005); }
      const head = this.head = new THREE.Group(); head.position.y = .125; neck.add(head);
      const hg = new THREE.SphereGeometry(.118, 22, 18); hg.scale(.95, 1.1, 1.0); this.part(hg, skin, head, 0, .08, 0, .008);
      const jaw = new THREE.SphereGeometry(.07, 12, 10); jaw.scale(1, .8, .95); this.part(jaw, skin, head, 0, .005, .045, 0);
      [-1, 1].forEach(sd => this.part(new THREE.SphereGeometry(.026, 8, 8), skin, head, sd * .115, .06, 0, 0));
      // eyes
      const eyeM = this.mat(L.shade ? '#ff2a3a' : '#f6f6fa', L.shade ? { emissive: new THREE.Color('#ff1a2a') } : {}), irisM = this.mat(L.shade ? '#ffffff' : '#14141c');
      this.eyes = [-1, 1].map(sd => { const e = new THREE.Group(); e.position.set(sd * .046, .085, .105); head.add(e); const w = new THREE.SphereGeometry(.026, 12, 10); w.scale(1.2, .95, .5); this.part(w, eyeM, e, 0, 0, 0, 0); const ir = new THREE.SphereGeometry(.015, 10, 8); ir.scale(1, 1.15, .5); this.part(ir, irisM, e, 0, 0, .008, 0);
        const br = new THREE.BoxGeometry(.05, .008, .01); const b = this.part(br, hair, e, 0, .038, .005, 0); b.rotation.z = -sd * .22; return e; });
      this.mouth = this.part(new THREE.BoxGeometry(.04, .006, .008), this.mat('#6a3a3a'), head, 0, .008, .112, 0);
      this.part(new THREE.ConeGeometry(.012, .03, 6), skin, head, 0, .052, .118, 0).rotation.x = Math.PI / 2 - .3;
      if (L.shade) { // fanged maw
        const maw = new THREE.SphereGeometry(.05, 12, 8); maw.scale(1.3, .55, .5); this.maw = this.part(maw, this.mat('#1a0508'), head, 0, .0, .1, 0); this.maw.visible = false;
        this.fangs = []; for (let k = -3; k <= 3; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(.007, .028, 5), this.mat('#eee8dc')); f.position.set(k * .017, .018, .122); f.rotation.x = Math.PI; f.visible = false; head.add(f); this.fangs.push(f); }
      }
      if (L.glasses) [-1, 1].forEach(sd => { const t = new THREE.TorusGeometry(.04, .005, 6, 16); this.part(t, dark, head, sd * .046, .085, .115, 0); });
      // hair / caps
      if (L.cap) { const cg = new THREE.SphereGeometry(.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * .52); this.part(cg, this.mat(L.cap), head, 0, .095, -.005, .008); const bill = new THREE.BoxGeometry(.19, .012, .13); bill.translate(0, 0, .07); this.part(bill, this.mat(L.cap), head, 0, .11, .1, .006).rotation.x = .15; if (L.badge) this.part(new THREE.BoxGeometry(.03, .03, .008), this.mat('#e8c850'), head, 0, .15, .125, 0); }
      else if (L.bun) { const cap = new THREE.SphereGeometry(.124, 18, 12, 0, Math.PI * 2, 0, Math.PI * .6); this.part(cap, hair, head, 0, .095, -.01, .008); this.part(new THREE.SphereGeometry(.058, 12, 10), hair, head, 0, .21, -.08, .008); }
      else { this.buildHair(head, hair); }
      if (L.hood && false) { }
      this.headTop = head;
      // briefcase / cup
      if (L.case) { const c = this.part(new THREE.BoxGeometry(.06, .3, .4), this.mat('#17171b'), this.arms[1].wr, 0, -.15, .0, .006); c.position.set(0, -.2, 0); }
      if (L.cup) { const c = this.part(new THREE.CylinderGeometry(.03, .024, .05, 10), this.mat('#f2f2f6'), this.arms[0].wr, 0, -.06, .06, .004); }
      this.flaskM = null;
    }
    buildHair(head, hair) {
      const L = this.L, P = Math.PI;
      // short boy's cut: scalp cap stops above the ears / nape, short soft fringe, short tapered sides
      const sc = new THREE.SphereGeometry(.148, 26, 18, 0, P * 2, 0, P * .52); sc.scale(1.06, 1.14, 1.12); this.part(sc, hair, head, 0, .098, -.024, .008); const hi = this.mat(PX.mixc(L.hair.length === 7 ? L.hair : '#34344a', '#9aa0c0', .38));
      const lg = (this.name === 'claire' || L.shade) ? 1.1 : 1; const mass = (x, y, z, sx, sy, sz, rx, rz) => { const g = new THREE.SphereGeometry(.06, 14, 10); g.scale(sx * 1.12, sy * lg, sz * 1.18); const m = this.part(g, hair, head, x, y - (lg - 1) * sy * .05, z, .006); m.rotation.set(rx || 0, 0, rz || 0); m.userData.r0 = [rx || 0, rz || 0]; if (sy > .7) this.sway.push({ o: m, a: .22, ph: x * 20, hair: 1 }); return m; };
      mass(-.07, .168, .09, 1.4, .5, .8, .5, -.3);   // short fringe, swept slightly to one side
      mass(0, .178, .098, 1.5, .45, .8, .55, -.1);
      mass(.07, .168, .09, 1.3, .45, .8, .5, .2);
      mass(-.118, .135, .03, .45, .9, 1.0, 0, -.1);   // short sides, end above the ears
      mass(.118, .135, .03, .45, .9, 1.0, 0, .1);
      mass(0, .12, -.115, 1.6, .9, .6, -.1, 0);       // short back, ends above the nape
      mass(0, .225, .0, 1.7, .75, 1.7, .05, 0);       // crown volume
      mass(-.06, .21, .05, 1.2, .6, 1.1, .3, -.3); mass(.06, .21, .05, 1.2, .6, 1.1, .3, .3);
      [[-.05, .245, .02, -.3], [.04, .25, -.01, .25], [0, .235, .07, .1]].forEach(([x, y, z, rz]) => { const g = new THREE.SphereGeometry(.035, 10, 8); g.scale(1.6, .5, 1.3); const m = this.part(g, hi, head, x, y, z, 0); m.rotation.z = rz; });  // highlight locks
      if (L.ahoge) { const ah = new THREE.TorusGeometry(.04, .007, 6, 12, P * 1.1); const m = this.part(ah, hair, head, .01, .235, .03, 0); m.rotation.set(0, .3, .3); }
    }
    // ---------------------------------------------------------------- poses / animation
    applyPose(p) {
      const P = PX.paint.POSE0, g = k => (p[k] ?? P[k]), L = this.L, lk = L.lanky; const sh = !!L.shade;
      this.pelvis.position.y = this.hipY - (g('crouch') + (sh ? 4 : 0)) / 100 + g('bob') / 100; this.pelvis.position.z = g('xoff') * .008; this.roll.rotation.x = rad(g('rot') || 0);
      this.torso.rotation.x = rad(g('lean') + (sh ? 16 : 0)); this.head.rotation.x = rad(g('head')) - (sh ? .25 : 0);
      const set = (leg, t, s) => { leg.th.rotation.x = -rad(t); leg.knee.rotation.x = rad(s); leg.ank.rotation.x = rad(t - s) * .35 * 0; };
      set(this.legs[0], g('tF'), g('sF')); set(this.legs[1], g('tB'), g('sB'));
      const arm = (a, u, f) => { a.sh.rotation.x = -rad(u); a.sh.rotation.z = (a === this.arms[0] ? -1 : 1) * (sh ? .34 : .1); a.el.rotation.x = -rad(f); };
      arm(this.arms[0], g('uF'), g('fF')); arm(this.arms[1], g('uB'), g('fB'));
      const tw = (g('uF') - g('uB')) * .0042 * (this.cur === 'walk' || this.cur === 'run' ? 1 : .35);
      this.pelvis.rotation.y = -tw * .45; this.torso.rotation.y = tw * .8; this.head.rotation.y = -tw * .5;
      this.legs.forEach((lg, i) => { const t = i ? g('tB') : g('tF'); lg.toe.rotation.x = -Math.max(-.15, Math.min(.7, -rad(t) * .8)); lg.ank.rotation.x = rad(Math.max(0, -t)) * .3; });
      const gr = this.sword ? .95 : (/light|heavy|slash|charge|cast/.test(this.cur || '') ? .85 : .3);
      this.arms.forEach(a => { a.fingers.forEach(([f1, f2], i) => { const k = gr * (1 + (i === 3 ? -.12 : 0)); f1.rotation.x = -k * 1.15; f2.rotation.x = -k * 1.2; }); a.thumb[0].rotation.x = -gr * .6; a.thumb[1].rotation.x = -gr * .8; });
      if (p.eye !== undefined) { this.eyes.forEach(e => { e.scale.y = p.eye === 2 ? .12 : 1; }); }
    }
    sample(frames, u) { const n = frames.length, f = u * n, i = Math.floor(f) % n, j = (i + 1) % n, k = f - Math.floor(f); return PX.poseMix(Object.assign({}, PX.paint.POSE0, frames[i]), Object.assign({}, PX.paint.POSE0, frames[j]), k); }
    play(name, o) { o = o || {}; const a = ANIMS[name] || ANIMS.idle; this.anim = { name, frames: PX.POSES[name] || PX.POSES.idle, t: 0, dur: (o.dur || a.t), loop: o.loop !== undefined ? o.loop : !!a.loop, onEnd: o.onEnd, speed: o.speed || 1, done: false }; this.cur = name; }
    swayUpdate(dt) {
      const wp = this.root.getWorldPosition(this._wp || (this._wp = new THREE.Vector3()));
      if (this.lastPos && dt > 0) { const vx = (wp.x - this.lastPos.x) / dt, vz = (wp.z - this.lastPos.z) / dt, cy = Math.cos(-this.root.rotation.y), sy = Math.sin(-this.root.rotation.y); const lx = vx * cy + vz * sy, lz = -vx * sy + vz * cy; this.svx += (lx - this.svx) * Math.min(1, dt * 8); this.svz += (lz - this.svz) * Math.min(1, dt * 8); }
      if (!this.lastPos) this.lastPos = new THREE.Vector3(); this.lastPos.copy(wp); const t = G.time || 0, wind = (PX.wind === undefined ? .5 : PX.wind);
      this.sway.forEach(s => { const gust = Math.sin(t * 2.1 + s.ph) * .6 + Math.sin(t * 5.3 + s.ph * 2) * .25; const ax = Math.max(-1, Math.min(1, this.svz * .12)) * -s.a + gust * wind * s.a * .5, az = Math.max(-1, Math.min(1, this.svx * .12)) * s.a + gust * wind * s.a * .4;
        if (s.hair) { s.o.rotation.x = s.o.userData.r0[0] + ax * .5; s.o.rotation.z = s.o.userData.r0[1] + az * .5; } else { s.o.rotation.x = ax; s.o.rotation.z = az; } });
    }
    update(dt) {
      this.swayUpdate(dt);
      const a = this.anim; if (!a) return; a.t += dt * a.speed; let u = a.t / a.dur;
      if (a.loop) { u = u % 1; this.applyPose(this.sample(a.frames, u)); }
      else { if (u >= 1) { u = 1; if (!a.done) { a.done = true; if (a.onEnd) a.onEnd(); } } const n = a.frames.length; if (n === 1) this.applyPose(a.frames[0]); else { const f = u * (n - 1), i = Math.min(n - 2, Math.floor(f)), k = f - i, e = k * k * (3 - 2 * k); this.applyPose(PX.poseMix(Object.assign({}, PX.paint.POSE0, a.frames[i]), Object.assign({}, PX.paint.POSE0, a.frames[i + 1]), e)); } }
      if (this.flash > 0) { this.flash -= dt; const k = Math.max(0, this.flash) * 4; this.mats.forEach(m => { if (m.emissive) m.emissive.setRGB(k, k * .8, k * .8); }); }
    }
    // katana: hilt in the right hand, blade continues along the forearm axis (wrist-local -Y)
    giveKatana() {
      if (this.sword) return; const sw = this.sword = new THREE.Group(); const hand = this.arms[1].wr; hand.add(sw); sw.position.set(0, -.02, .01);
      const wrap = this.mat('#1c1c26'), steel = this.mat('#dfe6f0', { emissive: new THREE.Color('#1a2230') }), gold = this.mat('#c9a43a'), saya = this.mat('#14141c');
      const grip = new THREE.CylinderGeometry(.021, .021, .3, 10); grip.translate(0, .02, 0); this.part(grip, wrap, sw, 0, 0, 0, .004);
      const pom = new THREE.SphereGeometry(.03, 10, 8); this.part(pom, gold, sw, 0, .17, 0, 0);
      const tsuba = new THREE.CylinderGeometry(.07, .07, .014, 16); this.part(tsuba, gold, sw, 0, -.14, 0, .004);
      const bl = new THREE.BoxGeometry(.009, .92, .05); bl.translate(0, -.46, 0); const blade = this.part(bl, steel, sw, 0, -.15, 0, .005); blade.userData.blade = 1;
      const edge = new THREE.BoxGeometry(.012, .92, .008); edge.translate(0, -.46, .028); this.part(edge, this.mat('#ffffff', { emissive: new THREE.Color('#9ab0d0') }), sw, 0, -.15, 0, 0);
      const tip = new THREE.ConeGeometry(.025, .07, 4); tip.rotateX(Math.PI); tip.translate(0, -.995, .0); this.part(tip, steel, sw, 0, -.15, 0, 0).scale.set(.2, 1, 1);
      // dead-weight scabbard on the left hip
      const sb = new THREE.BoxGeometry(.035, .9, .035); sb.translate(0, -.45, 0); this.scab = this.part(sb, saya, this.pelvis, -.19, .02, -.05, .004); this.scab.rotation.set(1.3, 0, .15); this.scab.visible = false;
    }
    hit() { this.flash = .25; }
    // Monster Claire: toggled live (Shade form)
    setShade(on) {
      if (this.name !== 'claire') return; const sh = on; this.form = on ? 'shade' : 'human'; const to = LOOK[on ? 'shade' : 'claire'];
      const m = this.mats; // order of creation: skin, hair, top, topD, pants, shoes, white, dark
      const cols = [to.skin, to.hair, to.top, to.topD, to.pants, to.shoes]; cols.forEach((c, i) => { if (m[i]) m[i].color.set(c); });
      this.arms.forEach(a => { a.claws.forEach(c => c.visible = sh); a.el.parent && (a.sh.scale.set(1, sh ? 1.28 : 1, 1)); }); if (this.maw) { }
      this.eyes.forEach(e => e.children.forEach((c, i) => { if (c.material && i === 0) { c.material.color.set(sh ? '#ff2a3a' : '#f6f6fa'); if (c.material.emissive) c.material.emissive.set(sh ? '#ff1a2a' : '#000000'); } }));
      this.root.scale.setScalar((sh ? LOOK.shade.h : LOOK.claire.h) * (this.userScale || 1)); this.outlineMat && this.outlineMat.color.set(sh ? 0xc08aff : 0x05050a);
    }
  }
  PX.Rig = Rig;
})();
