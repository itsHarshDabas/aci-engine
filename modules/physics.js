/* ACI physics plugin: tiny AABB physics in CELL units (1 unit = 1 character cell).
   Give any entity a few props and it just works:
     game.add(sprite, { x, y, vx:0, vy:0, solid:true, tag:'player' })
   Props:  vx, vy (cells/sec)   gravity (cells/sec^2, default game.physics.gravity)   friction (grounded slow-down, 0..~20)
           drag (same, in air)  bounce (0..1)   solid (blocks / is blocked)   static (never moves)
           trigger (overlap zone, doesn't block)   tag / tags (for e.hits('enemy'))   box:{x,y,w,h} (override hitbox)
   Callbacks: e.onCollide(other)  (blocked by / started touching other)   e.onTrigger(other)  (trigger:true entities)
   Read:   e.grounded  e.hitCeiling  e.hitWall (-1 left, 1 right, 0)   e.hits(tag) -> first touching entity or null
   Tiles:  uses game.tilemap.solidAt(x, y) when the tilemap plugin is loaded.
   An entity is "dynamic" (simulated) if it has vx, vy, gravity or body:true and is not static. */
ACI.plugin('physics', function install(game, opts) {  // loaded automatically for every game made after this file
  'use strict';
  const EPS = 0.001, STEP = 0.4;
  const P = game.physics = Object.assign({ gravity: 0, maxSpeed: 80, enabled: true }, opts);

  // ---- hitbox: union of non-blank cells over ALL frames of the sprite (stable, no popping while animating)
  function localBox(e) {
    const s = e.sprite; let b = e.box;
    if (!b) {
      if (!s) b = { x: 0, y: 0, w: 1, h: 1 };
      else if (!(b = s._box)) {
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (const name in s.anims) for (const f of s.anims[name]) for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++)
          if (s.solid || f.cells[j * f.w + i].ch !== ' ') { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
        b = s._box = x1 < 0 ? { x: 0, y: 0, w: s.w || 1, h: s.h || 1 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      }
      if (e.flipX && s) b = { x: s.w - b.x - b.w, y: b.y, w: b.w, h: b.h };
    }
    return b;
  }
  const rectOf = e => { const b = localBox(e); return { l: e.x + b.x, t: e.y + b.y, r: e.x + b.x + b.w, b: e.y + b.y + b.h }; };
  const toRect = o => o.sprite ? rectOf(o) : { l: o.x, t: o.y, r: o.x + (o.w || 1), b: o.y + (o.h || 1) };
  const overlap = (a, b, m = 0) => a.l < b.r - m && a.r > b.l + m && a.t < b.b - m && a.b > b.t + m;
  const hasTag = (e, t) => e.tag === t || (e.tags && e.tags.includes(t));
  const solidTile = (x, y) => { const T = game.tilemap; return !!(T && T.solidAt && T.solidAt(x, y)); };
  const isDynamic = e => !e.static && (e.vx !== undefined || e.vy !== undefined || e.gravity !== undefined || e.body);
  const isBody = e => e.solid || e.trigger || e.onCollide || e.onTrigger || e.tag || e.tags || isDynamic(e);

  // everything that would block rectangle r (tiles + solid entities), except `self`
  function blockers(r, self) {
    const out = [];
    for (let y = Math.floor(r.t + EPS); y <= Math.floor(r.b - EPS); y++)
      for (let x = Math.floor(r.l + EPS); x <= Math.floor(r.r - EPS); x++)
        if (solidTile(x, y)) out.push({ l: x, t: y, r: x + 1, b: y + 1 });
    for (const o of game.entities) {
      if (o === self || !o.solid || o.trigger || o._removed) continue;
      const q = rectOf(o);
      if (overlap(r, q, EPS)) { q.ent = o; out.push(q); }
    }
    return out;
  }

  // move one axis in small steps (no tunnelling); returns the blocker hit or null
  function moveAxis(e, d, axis) {
    let hit = null, left = d;
    while (Math.abs(left) > 1e-9 && !hit) {
      const s = Math.abs(left) > STEP ? Math.sign(left) * STEP : left; left -= s;
      const old = e[axis]; e[axis] += s;
      if (!e.solid) continue;
      const bl = blockers(rectOf(e), e); if (!bl.length) continue;
      const b = localBox(e);
      if (axis === 'x') e.x = s > 0 ? Math.min(...bl.map(q => q.l)) - EPS - b.x - b.w : Math.max(...bl.map(q => q.r)) + EPS - b.x;
      else e.y = s > 0 ? Math.min(...bl.map(q => q.t)) - EPS - b.y - b.h : Math.max(...bl.map(q => q.b)) + EPS - b.y;
      if ((s > 0 && e[axis] < old) || (s < 0 && e[axis] > old)) e[axis] = old; // never get pushed backwards
      hit = bl.find(q => q.ent) || bl[0];
    }
    return hit;
  }

  /* game.physics.moveAndCollide(e, dx, dy) -> { hitX, hitY, entity }  (moves e, stops at walls/solids, no velocity changes) */
  P.moveAndCollide = (e, dx, dy) => {
    const hx = moveAxis(e, dx, 'x'), hy = moveAxis(e, dy, 'y');
    return { hitX: !!hx, hitY: !!hy, entity: (hx && hx.ent) || (hy && hy.ent) || null, _hx: hx, _hy: hy };
  };

  // ---- queries
  /* overlaps(a, b) -> boolean ; overlaps(a) -> array of entities touching a ; a/b may be {x,y,w,h} rects */
  P.overlaps = (a, b) => {
    const ra = toRect(a);
    if (b) return overlap(ra, toRect(b));
    return game.entities.filter(o => o !== a && isBody(o) && overlap(ra, rectOf(o)));
  };
  /* at(x, y, tag?) -> entities covering that point */
  P.at = (x, y, tag) => game.entities.filter(o => isBody(o) && (!tag || hasTag(o, tag)) && overlap(rectOf(o), { l: x, t: y, r: x + 0.001, b: y + 0.001 }));
  /* raycast(x1,y1,x2,y2,{tag,ignore}) -> {x,y,dist,tile|entity} or null. Hits solid tiles + solid (or tagged) entities. */
  P.raycast = (x1, y1, x2, y2, o = {}) => {
    const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(len / 0.1));
    for (let i = 0; i <= n; i++) {
      const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n, dist = len * i / n;
      if (solidTile(Math.floor(x), Math.floor(y))) return { x, y, dist, tile: true };
      for (const e of game.entities) {
        if (e === o.ignore || e._removed || !(o.tag ? hasTag(e, o.tag) : e.solid)) continue;
        if (overlap(rectOf(e), { l: x, t: y, r: x + 0.001, b: y + 0.001 })) return { x, y, dist, entity: e };
      }
    }
    return null;
  };
  P.withTag = tag => game.entities.filter(e => hasTag(e, tag));

  // ---- entity helper methods (added automatically to every entity)
  function attach(e) {
    if (e._phys) return; e._phys = true;
    if (e.grounded === undefined) e.grounded = false;
    if (e.tag && Array.isArray(e.tags) && !e.tags.includes(e.tag)) e.tags.push(e.tag); // so game.findAll('enemy') works too
    e.hitCeiling = false; e.hitWall = 0;
    e.hits = tag => { const r = rectOf(e); for (const o of game.entities) if (o !== e && !o._removed && (!tag || hasTag(o, tag)) && overlap(r, rectOf(o), -0.1)) return o; return null; };
  }
  game.on('add', e => attach(e));
  game.on('remove', e => { e._removed = true; });

  const fire = (a, b) => {
    if (a.onCollide) a.onCollide(b); if (b.onCollide) b.onCollide(a);
    if (a.trigger && a.onTrigger) a.onTrigger(b); if (b.trigger && b.onTrigger) b.onTrigger(a);
  };

  /* game.physics.step(dt): one simulation tick (runs automatically every frame; call it yourself in tests) */
  P.step = dt => {
    const ents = game.entities.slice();
    for (const e of ents) {
      attach(e);
      if (!isDynamic(e) || e._removed) continue;
      const g = e.gravity !== undefined ? e.gravity : P.gravity, cap = e.maxSpeed || P.maxSpeed;
      e.vx = e.vx || 0; e.vy = (e.vy || 0) + g * dt;
      e.vx = Math.max(-cap, Math.min(cap, e.vx)); e.vy = Math.max(-cap, Math.min(cap, e.vy));
      const slow = e.grounded ? e.friction : e.drag;
      if (slow) e.vx *= Math.max(0, 1 - slow * dt);
      const r = P.moveAndCollide(e, e.vx * dt, e.vy * dt);
      e.hitWall = r.hitX ? Math.sign(e.vx) : 0; e.hitCeiling = r.hitY && e.vy < 0;
      const bnc = e.bounce || 0;
      if (r.hitX) { e.vx = Math.abs(e.vx * bnc) < 0.5 ? 0 : -e.vx * bnc; }
      if (r.hitY) { e.vy = Math.abs(e.vy * bnc) < 0.5 ? 0 : -e.vy * bnc; }
      const hit = r._hx || r._hy;
      if (hit && hit.ent) fire(e, hit.ent); else if (hit && e.onCollide) e.onCollide(null); // null = tile
      if (e.solid) { const rr = rectOf(e); rr.t += 0.05; rr.b += 0.05; e.grounded = blockers(rr, e).length > 0; }
      else e.grounded = false;
    }
    // overlap events (non-blocking contact: coins, triggers, enemies). Fires once when contact starts.
    const watchers = ents.filter(e => e.onCollide || e.onTrigger || e.trigger), bodies = ents.filter(isBody);
    for (const w of watchers) {
      if (w._removed) continue;
      w._touch = w._touch || new Set(); const rw = rectOf(w);
      for (const o of bodies) {
        if (o === w || o._removed || (o.id < w.id && (o.onCollide || o.onTrigger || o.trigger))) continue;
        o._touch = o._touch || new Set();
        const on = overlap(rw, rectOf(o), EPS), had = w._touch.has(o);
        if (on && !had) { w._touch.add(o); o._touch.add(w); fire(w, o); }
        else if (!on && had) { w._touch.delete(o); o._touch.delete(w); }
        if (w._removed) break;
      }
    }
  };
  // runs after your onUpdate / entity.update, so velocities you set this frame apply this frame
  game.on('afterUpdate', dt => { if (P.enabled) P.step(dt); });
  // makes built-in game.walker()/wanderer()/agent 'move' respect walls and solid entities
  if (!game.blocked) game.blocked = (x, y, e) => solidTile(Math.floor(x), Math.floor(y)) ||
    game.entities.some(o => o !== e && o.solid && !o.trigger && overlap(rectOf(o), { l: x, t: y, r: x + 0.001, b: y + 0.001 }));

  // ---- agent op
  game.defineCommand('physics', c => {
    if (c.gravity !== undefined) P.gravity = c.gravity;
    if (c.enabled !== undefined) P.enabled = !!c.enabled;
    if (c.id === undefined && c.name === undefined) return { gravity: P.gravity, enabled: P.enabled };
    const e = game.pick(c);
    ['vx', 'vy', 'friction', 'bounce', 'solid', 'static', 'trigger', 'tag'].forEach(k => { if (c[k] !== undefined) e[k] = c[k]; });
    if (c.entityGravity !== undefined) e.gravity = c.entityGravity;
    return { id: e.id, vx: e.vx, vy: e.vy, solid: !!e.solid, grounded: !!e.grounded };
  }, 'Physics: {gravity?, enabled?} sets world values; add {name|id, entityGravity?, vx?, vy?, solid?, static?, trigger?, bounce?, friction?, tag?} to change that entity. Example: {op:"physics",gravity:30} or {op:"physics",name:"hero",vy:-20,solid:true}.');
});
