/* Project X (ACI port) - the real-time overworld: the city of Dwell (12 outdoor areas + your home), walking, doors, NPCs,
   interactions, day/night, rain. Ground is a per-cell shader; everything else is painted and converted to glyph sprites. */
(function () {
  'use strict';
  const PX = window.PX, game = PX.game, P = PX.paint, U = PX.ui, R = PX.rooms, D = PX.D, clamp = PX.clamp;
  const W = PX.World = { cur: null, hero: null, npcs: [], props: [], busy: false };
  PX.spr = { set: {}, props: {}, furn: {} };

  // ---------------------------------------------------------------- sprite sets
  const DIRN = { down: 0, 'down-right': 1, right: 2, 'up-right': 3, up: 4, 'up-left': 5, left: 6, 'down-left': 7 };
  W.dirIdx = f => typeof f === 'number' ? f : (DIRN[f] || 0);
  W.dirFrom = (mx, my) => ((Math.round(((Math.atan2(mx, my) * 180 / Math.PI) + 360) % 360 / 45)) % 8);
  W.buildChar = (outfit, opts) => {
    opts = opts || {}; const cols = opts.cols || 10, set = {};
    for (let k = 0; k < 8; k++) {
      set[k + '_idle'] = P.bakeFrames(P.anim(outfit, k * 45, 'idle', { w: 84, h: 220 }), cols, { res: 4, fps: 2 });
      set[k + '_walk'] = P.bakeFrames(P.anim(outfit, k * 45, 'walk', { w: 84, h: 220 }), cols, { res: 4, fps: 9 });
    }
    return set;
  };
  W.ensureOutfit = o => { if (!PX.spr.set[o]) PX.spr.set[o] = W.buildChar(o); };
  W.ensureSprites = () => {
    if (PX.spr.ready) return;
    W.ensureOutfit('claire'); PX.spr.ready = true;
  };

  // ---------------------------------------------------------------- layout (tile size in glyph cells)
  W.layout = indoor => { const px = indoor ? 64 : 46; return { TW: Math.max(4, Math.round(px / game.cellW)), TH: Math.max(3, Math.round(px / game.cellH)) }; };

  // ---------------------------------------------------------------- ground shader
  const GR = ['\\', '|', '/', '!', ':', ';', '"', "'", ','];
  const rgb = (r, g, b) => { const k = W.dim; if (k) { r = r * (1 - .6 * k) + 3 * k; g = g * (1 - .52 * k) + 8 * k; b = b * (1 - .3 * k) + 28 * k; } return `rgb(${r < 0 ? 0 : r > 255 ? 255 : r | 0},${g < 0 ? 0 : g > 255 ? 255 : g | 0},${b < 0 ? 0 : b > 255 ? 255 : b | 0})`; };
  W.dim = 0;
  const H = P.hash;
  function groundCell(code, cx, cy, t, TW, TH) {
    const h = H(cx, cy, 7), h2 = H(cx, cy, 13), n = ACI.fbm(cx * 0.04, cy * 0.06 + 3), tx = Math.floor(cx / TW), ty = Math.floor(cy / TH), lx = cx - tx * TW, ly = cy - ty * TH;
    switch (code) {
      case 'g': case 'f': { const w = Math.sin(cx * .2 + t * 1.6 + n * 6) * .5 + .5, base = 60 + n * 55 + w * 26 + (h - .5) * 50; if (code === 'f' && lx % 3 === 1) return ['║', rgb(150, 156, 172), rgb(20, 40, 26)]; if (h > .988 && ((t * 2 + h * 40) % 3) < 1.2) return ['·', rgb(240, 255, 240), rgb(18, 40, 24)]; return [GR[(h * 9 | 0) % 9], rgb(base * .55 + 6, base * 1.35 + 10, base * .6 + 6), rgb(14 + n * 14, 34 + n * 26, 18 + n * 12)]; }
      case 'G': { const base = 44 + n * 40 + (h - .5) * 40; return [GR[(h * 9 | 0) % 9], rgb(base * .5, base * 1.15 + 6, base * .6), rgb(10, 26, 16)]; }
      case 'r': return [h > .9 ? '.' : h > .6 ? ':' : ' ', rgb(78 + h2 * 30, 82 + h2 * 30, 96 + h2 * 30), rgb(34 + n * 10, 37 + n * 10, 46 + n * 10)];
      case 'l': return [ly === (TH >> 1) && (cx % (TW * 2)) < TW ? '▬' : (h > .93 ? '.' : ' '), rgb(230, 200, 60), rgb(36, 39, 48)];
      case 'v': return [lx === (TW >> 1) && (cy % (TH * 2)) < TH ? '┃' : (h > .93 ? '.' : ' '), rgb(230, 200, 60), rgb(36, 39, 48)];
      case '=': return [lx % 4 < 2 ? '█' : '▒', rgb(224, 224, 230), rgb(40, 44, 54)];
      case '!': return [ly % 3 < 2 ? '█' : '▒', rgb(224, 224, 230), rgb(40, 44, 54)];
      case 's': return [lx === 0 || ly === 0 ? '▪' : (h > .9 ? '·' : ' '), rgb(110, 116, 134), rgb(66 + n * 14, 71 + n * 14, 86 + n * 14)];
      case 'p': { const alt = (tx + ty) % 2; return [lx === 0 || ly === 0 ? '·' : (h > .92 ? '.' : ' '), rgb(130, 138, 164), rgb(alt ? 52 : 44, alt ? 58 : 50, alt ? 78 : 68)]; }
      case 'd': return [h > .75 ? '.' : h > .5 ? ',' : ' ', rgb(150 + h2 * 30, 110 + h2 * 24, 70), rgb(70 + n * 20, 52 + n * 14, 32)];
      case 'b': return [lx % 5 === 0 ? '│' : (h > .8 ? '·' : ' '), rgb(180, 130, 76), rgb(88 + n * 16, 62 + n * 10, 36)];
      case 't': return [(tx + ty) % 2 ? '▫' : ' ', rgb(150, 158, 176), rgb(44 + (tx + ty) % 2 * 12, 50 + (tx + ty) % 2 * 12, 62 + (tx + ty) % 2 * 12)];
      case 'A': return [h > .55 ? 'o' : '°', rgb(86, 100, 124), rgb(28 + n * 8, 34 + n * 8, 46 + n * 8)];
      case 'o': return [h > .6 ? ',' : h > .3 ? '.' : "'", rgb(200, 170, 100), rgb(84 + n * 14, 70 + n * 12, 42)];
      case 'w': { const v = Math.sin(cx * .35 + cy * 1.1 + t * 2.2 + n * 5) * .5 + .5, v2 = Math.sin(cx * .15 - cy * .7 - t * 1.4) * .5 + .5; return [v > .82 ? '~' : v > .6 ? '-' : v2 > .85 ? '·' : ' ', rgb(110 + v * 100, 170 + v * 70, 230), rgb(14 + v2 * 10, 52 + v * 24, 104 + v * 26)]; }
      case 'W': { const v = Math.sin(cx * .3 - cy * .9 + t * 1.6) * .5 + .5; return [v > .8 ? '≈' : v > .6 ? '~' : ' ', rgb(70, 120 + v * 50, 190), rgb(6, 24 + v * 12, 60 + v * 18)]; }
      case 'k': { const row = ly >> 1, off = row % 2 ? 2 : 0, mortar = ly % 2 === 0 || (lx + off) % 4 === 0; return [mortar ? '▒' : '█', rgb(110, 60, 48), rgb(mortar ? 50 : 86, mortar ? 30 : 46, mortar ? 24 : 36)]; }
      case 'n': return [ly === 1 || ly === TH - 2 ? '═' : (lx % 4 === 0 ? '▐' : ' '), rgb(150, 146, 156), rgb(38 + n * 12, 34 + n * 10, 36)];
      case 'N': return [lx === 1 || lx === TW - 2 ? '║' : (ly % 3 === 0 ? '▄' : ' '), rgb(150, 146, 156), rgb(38 + n * 12, 34 + n * 10, 36)];
      default: return [' ', '#000', '#000'];
    }
  }
  function floorCell(kind, cx, cy, TW, TH) {
    const h = H(cx, cy, 5), tx = Math.floor(cx / TW), ty = Math.floor(cy / TH);
    if (kind === 'wood') { const plank = Math.floor(cy / (TH / 2.5)), s = H(plank, 1, 3) * 30; return [(h > .85 ? '·' : ' '), rgb(150, 100, 60), rgb(98 + s + h * 8, 62 + s * .6, 38 + s * .3)]; }
    const alt = (tx + ty) % 2; return [h > .9 ? '·' : ' ', rgb(190, 196, 208), rgb(alt ? 176 : 150, alt ? 182 : 156, alt ? 194 : 168)];
  }

  // ---------------------------------------------------------------- area / room loading
  W.clear = () => { PX.clearWorld(); W.npcs = []; W.props = []; W.hero = null; W.objs = []; };
  W.areaName = id => (D.world.areas[W.areaOf(id)] || {}).name || (R.ROOMS[id] || {}).name || id;
  W.areaOf = id => { for (const [aid, a] of Object.entries(D.world.areas)) if ((a.rooms || []).includes(id)) return aid; return id; };

  function setView(cols, rows, TW, TH, indoor) {
    const A = W.cur, wc = Math.max(cols * TW, game.viewCols), wr = Math.max(rows * TH, game.viewRows);
    A.ox = Math.floor((wc - cols * TW) / 2); A.oy = Math.floor((wr - rows * TH) / 2);
    game.setWorld(wc, wr);
  }
  W.load = (id, spawn, facing) => {
    W.clear(); W.ensureSprites();
    const indoor = !!R.ROOMS[id], L = W.layout(indoor);
    const A = W.cur = { id, indoor, TW: L.TW, TH: L.TH };
    PX.flags['visited_' + id] = true; PX.where.room = id;
    if (indoor) {
      const def = R.ROOMS[id]; A.def = def; A.cols = def.w; A.rows = def.h; A.name = def.name; A.solid = new Uint8Array(A.cols * A.rows); A.exits = [];
      const [x0, y0, x1, y1] = def.walk; for (let y = 0; y < A.rows; y++) for (let x = 0; x < A.cols; x++) if (x < x0 || x > x1 || y < y0 || y > y1) A.solid[y * A.cols + x] = 1;
      setView(A.cols, A.rows, A.TW, A.TH, true);
      def.objects.forEach(o => { if (o.solid !== false) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) A.solid[y * A.cols + x] = 1; });
      W.buildRoomSprites();
      game.layer((cx, cy, t) => { const lx = cx - A.ox, ly = cy - A.oy; if (lx < 0 || ly < 0 || lx >= A.cols * A.TW || ly >= A.rows * A.TH) return [' ', '#000', '#05070d']; W.dim = W.indoorDark(); const ty = Math.floor(ly / A.TH), tx = Math.floor(lx / A.TW);
        if (ty < 2) { const hh = H(lx, ly, 2), stripe = Math.floor(lx / 3) % 2; const base = id === 'bedroom' ? [78, 70, 104] : [150, 138, 110]; return [hh > .93 ? '.' : ' ', rgb(base[0] + 30, base[1] + 30, base[2] + 30), rgb(base[0] - (ty === 1 && ly % A.TH > A.TH - 3 ? 30 : 0) + stripe * 8, base[1] - (ty === 1 && ly % A.TH > A.TH - 3 ? 30 : 0) + stripe * 8, base[2] - (ty === 1 && ly % A.TH > A.TH - 3 ? 30 : 0) + stripe * 8)]; }
        for (const o of def.objects) if ((o.kind === 'rug' || o.kind === 'mat') && tx >= o.x && tx < o.x + o.w && ty >= o.y && ty < o.y + o.h) { const edge = lx < o.x * A.TW + 3 || lx >= (o.x + o.w) * A.TW - 3 || ly < o.y * A.TH + 2 || ly >= (o.y + o.h) * A.TH - 2; return [(lx + ly) % 7 === 0 ? '+' : ' ', rgb(220, 190, 120), id === 'bedroom' ? (edge ? rgb(150, 60, 70) : rgb(110, 40, 56)) : (edge ? rgb(60, 110, 100) : rgb(40, 84, 80))]; }
        return floorCell(def.floor, lx, ly, A.TW, A.TH); }, 0);
      const sp = spawn || [8, 6]; W.placeHero(sp[0] + .5, sp[1] + .9, facing || 'down');
      if (id === 'kitchen') W.addNpc('grandma', 'grandma', 5.5, 7.6, 'down', { roam: [2, 4, 13, 10] });
    } else {
      const m = D.maps[id]; A.cols = m.ground[0].length; A.rows = m.ground.length; A.name = m.name; A.grid = m.ground; A.exits = m.exits || []; A.solid = new Uint8Array(A.cols * A.rows);
      for (let y = 0; y < A.rows; y++) for (let x = 0; x < A.cols; x++) { const c = m.ground[y][x]; if (!(D.tiles[c] || {}).walkable) A.solid[y * A.cols + x] = 1; }
      const doors = new Set(A.exits.filter(e => e.kind === 'door').map(e => e.x + ',' + e.y));
      m.props.forEach(([kind, px, py]) => { const info = D.props[kind]; if (!info) return;
        if (info.door !== undefined) { for (let y = py; y < py + info.h; y++) for (let x = px; x < px + info.w; x++) { const isDoor = y === py + info.h - 1 && x === px + info.door; if (!isDoor) A.solid[y * A.cols + x] = 1; } }
        else if (info.block > 0) for (let y = py + info.h - info.block; y < py + info.h; y++) for (let x = px; x < px + info.w; x++) if (A.solid[y * A.cols + x] !== undefined) A.solid[y * A.cols + x] = 1; });
      (m.blocks || []).forEach(([bx, by, bw, bh]) => { for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) A.solid[y * A.cols + x] = 1; });
      setView(A.cols, A.rows, A.TW, A.TH, false);
      game.layer((cx, cy, t) => { const lx = cx - A.ox, ly = cy - A.oy; if (lx < 0 || ly < 0 || lx >= A.cols * A.TW || ly >= A.rows * A.TH) return [' ', '#000', '#05070d']; W.dim = PX.dark; return groundCell(A.grid[Math.floor(ly / A.TH)][Math.floor(lx / A.TW)], lx, ly, t, A.TW, A.TH); }, 0);
      W.buildPropSprites(m);
      let sp = spawn; if (!sp) { const e = A.exits.find(e => e.kind === 'walk'); sp = e ? [e.x + e.w / 2, e.y + e.h / 2] : [2, 2]; }
      W.placeHero(sp[0] + .5, sp[1] + .9, facing || 'down');
      // ambient NPCs (placeholders from the character sheet)
      const amb = { police_old_house: [['officer', 'officer', 10, 16], ['officer', 'officer', 13, 17]], cafe_riverbank: [['friend', 'friend', 20, 14]], train_station: [['man', 'office', 30, 17]] }[id];
      if (amb) amb.forEach(([kind, outfit, x, y]) => W.addNpc(kind, outfit, x, y, 'down', { roam: [x - 3, y - 2, x + 3, y + 2] }));
    }
    game.follow(W.hero.e, { lerp: .14 }); game.camera.x = Math.max(0, W.hero.e.x - game.viewCols / 2); game.camera.y = Math.max(0, W.hero.e.y - game.viewRows / 2);
    PX.music(PX.clock.isNight ? 'night' : 'day');
    if (!A.indoor || true) PX.showBanner(A.name, PX.clock.text + '  ·  Day ' + PX.clock.day);
    W.heroSnap();
  };
  W.indoorDark = () => Math.min(.5, PX.dark * .55) + 0;
  W.refreshRoom = () => { const A = W.cur; if (!A || !A.indoor) return; const tv = W.objs.find(o => o.def.kind === 'tv'); if (tv) { game.remove(tv.e); const spr = P.bake(R.paint('tv', 3, 2, 64, { on: PX.flags.tv_on }), 3 * A.TW, { res: 2 }); tv.e = game.add(spr, { x: A.ox + tv.def.x * A.TW, y: A.oy + tv.def.y * A.TH, z: 0 }); } };

  W.buildRoomSprites = () => {
    const A = W.cur; W.objs = [];
    A.def.objects.forEach(o => { if (o.kind === 'rug' || o.kind === 'mat') return;
      const st = { on: PX.flags.tv_on }, key = o.kind + (o.kind === 'tv' ? PX.flags.tv_on : '') + A.TW;
      const spr = PX.spr.furn[key] || (PX.spr.furn[key] = P.bake(R.paint(o.kind, o.w, o.h, 64, st), o.w * A.TW, { res: 2 }));
      const e = game.add(spr, { x: A.ox + o.x * A.TW, y: A.oy + o.y * A.TH, z: o.kind === 'window' ? -1 : 0 }); W.objs.push({ def: o, e }); });
  };
  W.buildPropSprites = m => {
    const A = W.cur; W.props = [];
    const items = m.props.slice().sort((a, b) => (a[2] + (D.props[a[0]] || { h: 0 }).h) - (b[2] + (D.props[b[0]] || { h: 0 }).h));
    items.forEach(([kind, px, py]) => { const info = D.props[kind]; if (!info) return; if (['puddle', 'manhole', 'flowers'].includes(kind) && info.block === 0) { /* flat decals */ }
      const key = kind + A.TW, cols = info.w * A.TW;
      let spr = PX.spr.props[key];
      if (!spr) { const cv = P.BLD[kind] ? P.building(kind, info, 64) : /^tree/.test(kind) ? P.tree(kind === 'tree_b' ? 'b' : 'a', info.w * 64, info.h * 64) : P.propCanvas(kind, info, 64); spr = PX.spr.props[key] = P.bake(cv, cols, { res: 2 }); }
      const e = game.add(spr, { x: A.ox + px * A.TW, y: A.oy + py * A.TH, z: info.block === 0 && !info.door ? -2 : 0 });
      W.props.push({ kind, px, py, e, info }); });
  };

  // ---------------------------------------------------------------- hero + npcs
  W.placeHero = (tx, ty, facing) => {
    const set = PX.spr.set.claire, dir = W.dirIdx(facing || 'down'), e = game.add(set[dir + '_idle'], { x: 0, y: 0, z: 0 });
    W.hero = { e, x: tx, y: ty, dir, facing: facing || 'down', moving: false, sprint: false, cool: 0 };
  };
  W.addNpc = (kind, outfit, tx, ty, facing, o) => {
    W.ensureOutfit(outfit); const set = PX.spr.set[outfit], e = game.add(set['0_idle'], { x: 0, y: 0 });
    const n = Object.assign({ kind, outfit, e, x: tx, y: ty, dir: W.dirIdx(facing), wait: 1 + Math.random() * 2, tx: null, ty: null, talking: false }, o); W.npcs.push(n); W.place(n); return n;
  };
  W.place = (o) => { const A = W.cur, e = o.e; e.x = A.ox + o.x * A.TW - e.w / 2; e.y = A.oy + o.y * A.TH - e.h; };
  W.heroSnap = () => { W.place(W.hero); game.camera.x = clamp(W.hero.e.x + W.hero.e.w / 2 - game.viewCols / 2, 0, Math.max(0, game.cols - game.viewCols)); game.camera.y = clamp(W.hero.e.y + W.hero.e.h / 2 - game.viewRows / 2, 0, Math.max(0, game.rows - game.viewRows)); };
  W.blocked = (x, y) => { const A = W.cur, tx = Math.floor(x), ty = Math.floor(y); if (tx < 0 || ty < 0 || tx >= A.cols || ty >= A.rows) return true; return A.solid[ty * A.cols + tx] === 1; };
  W.hitbox = (x, y, rx) => W.blocked(x - rx, y) || W.blocked(x + rx, y) || W.blocked(x - rx, y - .2) || W.blocked(x + rx, y - .2);
  const setAnim = (o, dir, moving) => { const set = PX.spr.set[o.outfit || 'claire'], key = W.dirIdx(dir) + (moving ? '_walk' : '_idle'); if (o.e.sprite !== set[key]) o.e.setSprite(set[key]); };

  // ---------------------------------------------------------------- scene
  W.enter = arg => {
    arg = arg || {}; PX.scene = W; W.busy = false;
    const wh = PX.where; W.load(arg.room || wh.room, arg.spawn || [wh.x, wh.y], arg.facing || wh.facing);
  };
  W.exit = () => {};
  W.relayout = () => { const h = W.hero; if (!h || !W.cur) return; PX.where = { room: W.cur.id, x: h.x - .5, y: h.y - .9, facing: h.dir }; W.load(W.cur.id, [PX.where.x, PX.where.y], h.facing); };
  W.travel = (room, sx, sy, facing, after) => {
    W.busy = true; PX.fadeTo(1, 4).then(() => { W.load(room, [sx, sy], facing); PX.fadeTo(0, 3).then(() => { W.busy = false; if (after && after.length) PX.say(after); }); });
  };
  W.afterLines = (lines, then) => PX.say(lines, then);
  W.playCutscene = (name, then) => { PX.cutscenes.play(name).then(() => { if (then) then(); }); };
  W.sleep = () => { W.busy = true; PX.fadeTo(1, 1.6).then(() => { PX.clock.sleepUntil(7); PX.heal(PX.P, PX.maxHp(PX.P), PX.maxRe(PX.P)); PX.P.flasks = 3; PX.save(); PX.fadeTo(0, 1.2).then(() => { W.busy = false; PX.say([PX.me('You collapse onto the pillow and the world fades out...', 'tired'), PX.me('You wake up rested. Day ' + PX.clock.day + '. (Flasks refilled, game saved.)', 'happy')]); }); }); };
  W.rest = (flasks) => { PX.heal(PX.P, 20, 10); if (flasks) { PX.P.flasks = 3; PX.heal(PX.P, PX.maxHp(PX.P), PX.maxRe(PX.P)); PX.clock.pass(20); PX.save(); PX.toast('Rested. Flasks refilled. Game saved.'); } };
  W.npcTalk = kind => ({
    friend: [PX.line('Friend', 'Hey! You look like you haven\'t slept. Rough night?', 'happy'), PX.me('You could say that.'), PX.line('Friend', 'Whatever it is, I\'m around. Don\'t go off alone, okay?')],
    officer: [PX.line('Officer', 'Move along, kid. It\'s not safe out here after dark.'), PX.me('What happened?'), PX.line('Officer', 'We\'re looking into it. Go home.')],
    man: [PX.line('Man', 'The last train left an hour ago. Nothing is running tonight.'), PX.me('Nothing?', 'scared'), PX.line('Man', 'Strange night. Strange night.')],
  })[kind];

  // nearest interactable
  W.target = () => {
    const A = W.cur, h = W.hero; let best = null, bd = 1e9;
    const consider = (kind, name, d, ref) => { if (d < bd && R.actionsFor(kind).length) { bd = d; best = { kind, name, ref }; } };
    if (A.indoor) {
      W.objs.forEach(o => { const d = o.def; if (['rug', 'mat'].includes(d.kind) || !R.actionsFor(d.kind).length) return; const dx = Math.max(d.x - h.x, 0, h.x - (d.x + d.w)), dy = Math.max(d.y - h.y, 0, h.y - (d.y + d.h)); const dist = Math.hypot(dx, dy * 1.2); if (dist < .95) consider(d.kind, R.NAMES[d.kind], dist, o); });
    } else {
      W.props.forEach(p => { if (!['bench', 'vending'].includes(p.kind)) return; const dist = Math.hypot(p.px + p.info.w / 2 - h.x, p.py + p.info.h - h.y); if (dist < 1.8) consider(p.kind, R.NAMES[p.kind], dist, p); });
    }
    W.npcs.forEach(n => { const dist = Math.hypot(n.x - h.x, (n.y - h.y) * 1.2); if (dist < 1.5) consider(n.kind, n.kind === 'grandma' ? 'Grandma' : n.kind === 'friend' ? 'Friend' : n.kind === 'officer' ? 'Officer' : 'Man', dist, n); });
    return best;
  };

  W.interact = t => {
    const acts = R.actionsFor(t.kind); if (!acts.length) return;
    if (t.ref && t.ref.talking !== undefined) { t.ref.talking = true; const dx = W.hero.x - t.ref.x; t.ref.dir = Math.abs(dx) > .6 ? (dx > 0 ? 2 : 6) : 0; setAnim(t.ref, t.ref.dir, false); }
    const run = id => { const lines = R.perform(W, t.kind, id); if (lines === null) return; if (lines && lines.length) PX.say(lines, () => { if (t.ref && t.ref.talking !== undefined) t.ref.talking = false; }); };
    if (acts.length === 1) return run(acts[0].id);
    PX.push(PX.menus.actionMenu(t.name, acts, run, () => { if (t.ref && t.ref.talking !== undefined) t.ref.talking = false; }));
  };
  W.openFridge = () => PX.push(PX.menus.fridge());
  W.openCook = () => PX.push(PX.menus.cook());

  const keyDir = () => ({ x: (PX.down('d') || PX.down('ArrowRight') ? 1 : 0) - (PX.down('a') || PX.down('ArrowLeft') ? 1 : 0), y: (PX.down('s') || PX.down('ArrowDown') ? 1 : 0) - (PX.down('w') || PX.down('ArrowUp') ? 1 : 0) });
  W.update = dt => {
    const A = W.cur, h = W.hero; if (!A || !h) return;
    PX.clock.total += dt * 2.0; PX.playTime += dt; W.dim = A.indoor ? W.indoorDark() : PX.dark;
    W.applyTint();
    // knocking event
    const f = PX.flags;
    if (f.knock_in !== undefined) { f.knock_in -= dt; if (f.knock_in <= 0) { delete f.knock_in; f.knocking = true; f.knock_again = 14; PX.sfx('knock'); PX.sfx('thump'); PX.shake(2, .3); } }
    else if (f.knocking && !f.door_opened) { f.knock_again -= dt; if (f.knock_again <= 0) { f.knock_again = 14; PX.sfx('knock'); } }
    if (W.busy) return;
    // pause / menus
    if (PX.press('back')) { PX.push(PX.menus.pause()); return; }
    if (PX.press('i')) { PX.push(PX.menus.bag()); return; }
    if (PX.press('c')) { PX.push(PX.menus.character()); return; }
    if (PX.press('m')) { PX.push(PX.menus.map()); return; }
    if (PX.press('b')) { PX.arena.begin({ test: true }); return; }
    // movement
    const k = keyDir(); let mx = k.x, my = k.y; if (mx && my) { mx *= .7071; my *= .7071; }
    h.sprint = PX.down('Shift') && (mx || my);
    const sp = (h.sprint ? 8.6 : 5.0) * dt;
    if (mx || my) {
      h.dir = W.dirFrom(mx, my); h.facing = ['down', 'down', 'right', 'up', 'up', 'up', 'left', 'down'][h.dir];
      const nx = h.x + mx * sp; if (!W.hitbox(nx, h.y, .26)) h.x = nx; const ny = h.y + my * sp; if (!W.hitbox(h.x, ny, .26)) h.y = ny;
    }
    h.moving = !!(mx || my); setAnim(h, h.dir, h.moving); h.e.sprite.fps = h.sprint ? 14 : 9; W.place(h);
    // npcs
    W.npcs.forEach(n => { if (n.talking) return; n.wait -= dt; if (n.wait <= 0 && !n.mv) { n.wait = 1.5 + Math.random() * 3; const dirs = [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'down'], [0, -1, 'up']], d = dirs[(Math.random() * 4) | 0]; n.dir = W.dirIdx(d[2]); if (Math.random() < .7 && n.roam) { const nx = n.x + d[0] * .8, ny = n.y + d[1] * .8, r = n.roam; if (nx > r[0] && nx < r[2] + 1 && ny > r[1] && ny < r[3] + 1 && !W.blocked(nx, ny) && Math.hypot(nx - h.x, ny - h.y) > .9) n.mv = { x: nx, y: ny }; } }
      if (n.mv) { const dx = n.mv.x - n.x, dy = n.mv.y - n.y, d = Math.hypot(dx, dy); if (d < .05) { n.mv = null; } else { n.x += dx / d * 1.6 * dt; n.y += dy / d * 1.6 * dt; } } setAnim(n, n.dir, !!n.mv); W.place(n); });
    // exits
    if (W.exitCool > 0) W.exitCool -= dt;
    else for (const ex of A.exits) {
      const tx = Math.floor(h.x), ty = Math.floor(h.y - .1);
      const inside = ex.kind === 'door' ? (tx === ex.x && ty === ex.y) : (tx >= ex.x && tx < ex.x + (ex.w || 1) && ty >= ex.y && ty < ex.y + (ex.h || 1));
      if (!inside) continue;
      if (ex.locked) { W.exitCool = 1.2; h.y += ex.kind === 'door' ? 1.1 : 0; PX.say([PX.me(ex.locked)]); PX.sfx('hurt', { vol: .25 }); break; }
      if (ex.to) { const to = ex.to; if (ex.kind === 'door') PX.sfx('ui_ok'); W.travel(to, ex.spawn[0], ex.spawn[1], ex.facing); W.exitCool = 2; PX.where = { room: to, x: ex.spawn[0], y: ex.spawn[1], facing: ex.facing }; break; }
    }
    // rift (story trigger)
    if (A.id === 'crossing' && !PX.flags.zemantas_defeated && Math.hypot(h.x - 24, (h.y - 12) * 1.2) < 2.2 && !W.riftBusy) { W.riftBusy = true; W.startRift(); return; }
    const t = W.target(); W.tgt = t;
    if (t && (PX.press('ok') || PX.press('e'))) W.interact(t);
  };
  W.startRift = () => {
    W.busy = true;
    PX.say([PX.me('The air above the crossing is wrong. It bends. Hums.', 'scared'), PX.me('Something is tearing the night open.', 'scared')], () => {
      PX.cutscenes.play('rift').then(() => { PX.arena.begin({ story: true }); });
    });
  };
  W.idle = dt => { W.dim = W.cur && W.cur.indoor ? W.indoorDark() : PX.dark; };
  W.applyTint = () => { const k = Math.round((W.cur.indoor ? W.indoorDark() : PX.dark) * 12) / 12; if (k === W.lastTint) return; W.lastTint = k; const all = game.entities; all.forEach(e => { e.tint = '#0b1436'; e.tintAmt = k * .55; }); };
  game.on('add', e => { if (W.lastTint) { e.tint = '#0b1436'; e.tintAmt = W.lastTint * .55; } });

  // ---------------------------------------------------------------- overlay: rain, hud, prompts
  const drops = Array.from({ length: 220 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: .5 + Math.random() * .8 }));
  W.overlay = (ctx, G) => {
    const A = W.cur; if (!A) return;
    if (!A.indoor && PX.settings.rain) { ctx.strokeStyle = `rgba(170,200,240,${.22 + PX.dark * .15})`; ctx.lineWidth = 1; ctx.beginPath(); drops.forEach(d => { d.y += d.s * .016 * 1.6; d.x -= d.s * .004; if (d.y > 1) { d.y = -.05; d.x = Math.random() * 1.1; } const x = d.x * PX.sw, y = d.y * PX.sh; ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 14 * d.s); }); ctx.stroke(); }
    if (PX.dark > .2 && !A.indoor) { const g = ctx.createRadialGradient(PX.sw / 2, PX.sh / 2, PX.sh * .3, PX.sw / 2, PX.sh / 2, PX.sh * .95); g.addColorStop(0, 'rgba(0,0,10,0)'); g.addColorStop(1, `rgba(0,0,12,${PX.dark * .45})`); ctx.fillStyle = g; ctx.fillRect(0, 0, PX.sw, PX.sh); }
    // names above npcs
    W.npcs.forEach(n => { const p = G.toScreen(n.e.x + n.e.w / 2, n.e.y); U.text(ctx, n.kind === 'grandma' ? 'Grandma' : n.kind === 'friend' ? 'Friend' : n.kind === 'officer' ? 'Officer' : 'Man', p.x * G.cellW, (p.y - 3) * G.cellH, { size: 12, align: 'center', color: '#d8f4e0' }); });
    // prompt
    if (W.tgt && !PX.talking() && !PX.modals.length && !W.busy) { const t = W.tgt, p = G.toScreen(W.hero.e.x + W.hero.e.w / 2, W.hero.e.y); const label = 'E  ' + (t.kind === 'door' ? 'Front door' : t.name); ctx.font = `700 13px ${U.font}`; const w = ctx.measureText(label).width + 24, x = p.x * G.cellW - w / 2, y = (p.y - 6) * G.cellH; U.panel(ctx, x, y, w, 26, { fr: '#ffd27a' }); U.text(ctx, label, x + 12, y + 6, { size: 13, color: '#ffe9a8' }); }
    W.hud(ctx);
  };
  W.hud = ctx => {
    const p = PX.P;
    U.panel(ctx, 14, 14, 290, 96, { title: 'Claire' });
    U.text(ctx, 'HP', 26, 28, { size: 12, color: '#ff9a9a' }); U.bar(ctx, 52, 28, 170, 14, p.hp / PX.maxHp(p), '#e04a4a'); U.text(ctx, Math.ceil(p.hp) + '/' + PX.maxHp(p), 230, 28, { size: 12 });
    U.text(ctx, 'RE', 26, 52, { size: 12, color: '#8ac8ff' }); U.bar(ctx, 52, 52, 170, 14, p.re / PX.maxRe(p), '#4a9aff'); U.text(ctx, Math.ceil(p.re) + '/' + PX.maxRe(p), 230, 52, { size: 12 });
    U.text(ctx, '$' + p.money + '   ' + '◆'.repeat(p.flasks) + '◇'.repeat(Math.max(0, 3 - p.flasks)) + ' flasks', 26, 78, { size: 12, color: '#d8e0f0' });
    const A = W.cur, wide = 250; U.panel(ctx, PX.sw - wide - 14, 14, wide, 62, {});
    U.text(ctx, A.name, PX.sw - wide, 24, { size: 15, weight: 800, color: '#ffe9a8' }); U.text(ctx, 'Day ' + PX.clock.day + '   ' + PX.clock.text + (PX.clock.isNight ? '   ☾' : '   ☀'), PX.sw - wide, 48, { size: 13, color: '#aab4cc' });
    U.text(ctx, 'WASD move · Shift sprint · E interact · I bag · C character · M map · Esc menu', PX.sw / 2, PX.sh - 26, { size: 12, align: 'center', color: 'rgba(200,212,236,.75)' });
  };
})();
