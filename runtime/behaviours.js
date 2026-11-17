/* ACI behaviours: no-code scripting. ACI.behaviour(name, def), ACI.behaviours, ACI.attachBehaviours(game, entity, list). */
(function (global) {
  'use strict';
  const ACI = global.ACI = global.ACI || {};
  const reg = ACI.behaviours = ACI.behaviours || {};
  const TYPES = ['number', 'boolean', 'string', 'key', 'entity', 'scene', 'asset', 'color', 'select'];

  function behaviour(name, def) {
    if (!name || !def) throw new Error('ACI.behaviour(name, def) needs both');
    def.name = name; def.title = def.title || name; def.description = def.description || ''; def.params = def.params || {};
    for (const k in def.params) {
      const p = def.params[k];
      if (TYPES.indexOf(p.type) < 0) p.type = 'string';
      if (p.label == null) p.label = k;
      if (p.default === undefined) p.default = p.type === 'number' ? 0 : p.type === 'boolean' ? false : p.type === 'select' && p.options && p.options.length ? optVal(p.options[0]) : '';
    }
    reg[name] = def; return def;
  }
  ACI.behaviour = behaviour;
  const optVal = o => (o && typeof o === 'object' ? o.value : o);

  function coerce(p, v) {
    switch (p.type) {
      case 'number': { v = Number(v); if (!isFinite(v)) return p.default; if (p.min != null) v = Math.max(p.min, v); if (p.max != null) v = Math.min(p.max, v); return v; }
      case 'boolean': return v === 'false' ? false : !!v;
      case 'select': { const o = (p.options || []).map(optVal); return o.length && o.indexOf(v) < 0 ? p.default : v; }
      default: return v == null ? p.default : String(v);
    }
  }
  function resolveParams(def, given) {
    const out = {}; given = given || {};
    for (const k in def.params) out[k] = coerce(def.params[k], given[k] === undefined ? def.params[k].default : given[k]);
    return out;
  }

  const reported = new Set();
  function warn(game, msg) { try { game.emit && game.emit('log', { level: 'warn', msg }); } catch (e) {} console.warn(msg); }
  function safe(game, name, hook, fn) {
    try { return fn(); } catch (err) {
      const key = name + '|' + hook;
      if (!reported.has(key)) { reported.add(key); console.error('[behaviour ' + name + '] ' + hook + ': ' + (err && err.message || err)); }
    }
  }
  ACI._behaviourErrorsReset = () => reported.clear();

  const states = new WeakMap(); // game -> { items:Set<inst> }
  function sys(game) {
    let s = states.get(game); if (s) return s;
    s = { items: new Set() }; states.set(game, s);
    game.on('beforeUpdate', dt => { for (const it of Array.from(s.items)) { if (it.e._removed || game.entities.indexOf(it.e) < 0) { s.items.delete(it); continue; } if (it.def.update) safe(game, it.name, 'update', () => it.def.update(it.e, dt, game, it.params)); } });
    game.on('click', p => {
      for (const it of Array.from(s.items)) {
        if (!it.def.onClick || it.e._removed) continue;
        const e = it.e, w = e.w || 1, h = e.h || 1;
        if (p.x >= Math.floor(e.x) && p.x < Math.floor(e.x) + w && p.y >= Math.floor(e.y) && p.y < Math.floor(e.y) + h) safe(game, it.name, 'onClick', () => it.def.onClick(e, game, it.params));
      }
    });
    game.on('remove', e => { for (const it of Array.from(s.items)) if (it.e === e) s.items.delete(it); });
    return s;
  }

  ACI.attachBehaviours = function (game, e, list) {
    const s = sys(game), made = [];
    (list || []).forEach(b => {
      const def = b && reg[b.name];
      if (!def) { warn(game, '[behaviour] unknown behaviour "' + (b && b.name) + '" ignored'); return; }
      made.push({ name: def.name, def, e, params: resolveParams(def, b.params) });
    });
    if (!made.length) return made;
    e._behaviours = (e._behaviours || []).concat(made);
    const wire = (prop, hook) => {
      const hs = made.filter(it => it.def.onCollide);
      if (!hs.length) return;
      const prev = e[prop];
      e[prop] = function (other) {
        if (prev) { try { prev.apply(this, arguments); } catch (err) { console.error('[behaviour] previous ' + prop + ': ' + (err && err.message || err)); } }
        const stamp = game.time;
        if (e._bhLast && e._bhLast.o === other && e._bhLast.t === stamp && e._bhLast.p !== prop) return; // onCollide+onTrigger in one tick
        e._bhLast = { o: other, t: stamp, p: prop };
        hs.forEach(it => safe(game, it.name, 'onCollide', () => it.def.onCollide(e, other, game, it.params)));
      };
    };
    wire('onCollide'); wire('onTrigger');
    made.forEach(it => { s.items.add(it); if (it.def.start) safe(game, it.name, 'start', () => it.def.start(e, game, it.params)); });
    return made;
  };

  // ---------------------------------------------------------------- helpers
  const hasTag = (o, t) => o && (o.tag === t || (o.tags && o.tags.indexOf(t) >= 0));
  const noGrav = e => { if (e.gravity === undefined) e.gravity = 0; if (e.vx === undefined) e.vx = 0; if (e.vy === undefined) e.vy = 0; };
  function findTarget(game, key, from) {
    if (!key) return null;
    const byName = game.find && game.find(key); if (byName) return byName;
    let best = null, bd = Infinity;
    game.entities.forEach(o => { if (o !== from && !o._removed && hasTag(o, key)) { const d = Math.hypot(o.x - from.x, o.y - from.y); if (d < bd) { bd = d; best = o; } } });
    return best;
  }

  // ---------------------------------------------------------------- built-ins
  behaviour('TopDownMove', {
    title: 'Top-Down Move', description: 'Move with arrow keys / WASD in four directions',
    params: { speed: { type: 'number', default: 12, min: 0, max: 80, label: 'Speed' } },
    start(e) { noGrav(e); e.solid = e.solid !== false; },
    update(e, dt, game, p) {
      const v = game.input ? game.input.vector('left', 'right', 'up', 'down') : { x: 0, y: 0 };
      e.vx = v.x * p.speed; e.vy = v.y * p.speed;
      if (v.x) e.flipX = v.x < 0;
    },
  });
  behaviour('PlatformerMove', {
    title: 'Platformer Move', description: 'Run left/right and jump (needs gravity and solid ground)',
    params: { speed: { type: 'number', default: 14, min: 0, max: 80, label: 'Speed' }, jump: { type: 'number', default: 22, min: 0, max: 80, label: 'Jump power' } },
    start(e, game) { e.solid = true; if (e.vx === undefined) e.vx = 0; if (e.vy === undefined) e.vy = 0; if (game.physics && !game.physics.gravity && e.gravity === undefined) e.gravity = 50; },
    update(e, dt, game, p) {
      const inp = game.input; if (!inp) return;
      const x = inp.axis('left', 'right'); e.vx = x * p.speed; if (x) e.flipX = x < 0;
      if (e.grounded && (inp.pressed('jump') || inp.down('jump') && e.vy >= 0)) e.vy = -p.jump;
    },
  });
  behaviour('Wander', {
    title: 'Wander', description: 'Walks around at random',
    params: { speed: { type: 'number', default: 6, min: 0, max: 40, label: 'Speed' }, changeEvery: { type: 'number', default: 1.5, min: 0.1, max: 20, label: 'Change direction every (s)' } },
    start(e) { noGrav(e); e._wt = 0; },
    update(e, dt, game, p) {
      e._wt = (e._wt || 0) - dt;
      if (e._wt <= 0 || e.hitWall) {
        e._wt = p.changeEvery; const a = Math.random() * Math.PI * 2, still = Math.random() < 0.2;
        e.vx = still ? 0 : Math.cos(a) * p.speed; e.vy = still ? 0 : Math.sin(a) * p.speed * 0.6;
        if (e.vx) e.flipX = e.vx < 0;
      }
    },
  });
  behaviour('Follow', {
    title: 'Follow', description: 'Chases another entity (by name or tag)',
    params: { target: { type: 'entity', default: 'player', label: 'Target (name or tag)' }, speed: { type: 'number', default: 8, min: 0, max: 60, label: 'Speed' }, stopDistance: { type: 'number', default: 2, min: 0, max: 100, label: 'Stop distance' } },
    start(e) { noGrav(e); },
    update(e, dt, game, p) {
      const t = findTarget(game, p.target, e);
      if (!t) { e.vx = 0; e.vy = 0; return; }
      const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy);
      if (d <= p.stopDistance || d < 1e-6) { e.vx = 0; e.vy = 0; return; }
      e.vx = dx / d * p.speed; e.vy = dy / d * p.speed; if (e.vx) e.flipX = e.vx < 0;
    },
  });
  behaviour('Patrol', {
    title: 'Patrol', description: 'Walks back and forth',
    params: { distance: { type: 'number', default: 10, min: 1, max: 200, label: 'Distance' }, speed: { type: 'number', default: 5, min: 0, max: 60, label: 'Speed' }, axis: { type: 'select', default: 'x', options: ['x', 'y'], label: 'Axis' } },
    start(e, game, p) { if (p.axis === 'y') noGrav(e); else if (e.vx === undefined) e.vx = 0; e._po = p.axis === 'y' ? e.y : e.x; e._pd = 1; },
    update(e, dt, game, p) {
      const k = p.axis, o = e._po;
      if (e._pd > 0 && (e[k] >= o + p.distance || (k === 'x' && e.hitWall > 0))) e._pd = -1;
      else if (e._pd < 0 && (e[k] <= o || (k === 'x' && e.hitWall < 0))) e._pd = 1;
      e[k === 'x' ? 'vx' : 'vy'] = e._pd * p.speed;
      if (k === 'x') e.flipX = e._pd < 0;
    },
  });
  behaviour('Collectible', {
    title: 'Collectible', description: 'Picked up on touch: adds to a score and disappears',
    params: { value: { type: 'number', default: 1, label: 'Value' }, stateKey: { type: 'string', default: 'score', label: 'State key' }, by: { type: 'string', default: 'player', label: 'Collected by (tag)' } },
    start(e) { if (!e.solid) e.trigger = true; },
    onCollide(e, other, game, p) {
      if (!other || !hasTag(other, p.by) || e._removed) return;
      game.state[p.stateKey] = (Number(game.state[p.stateKey]) || 0) + p.value;
      if (game.sound && game.sound.sfx) { try { game.sound.sfx('coin'); } catch (err) {} }
      game.remove(e);
    },
  });
  behaviour('Bob', {
    title: 'Bob', description: 'Floats up and down',
    params: { amplitude: { type: 'number', default: 1, min: 0, max: 20, label: 'Amplitude' }, speed: { type: 'number', default: 2, min: 0, max: 20, label: 'Speed' } },
    start(e) { noGrav(e); e._by = e.y; e._bt = 0; },
    update(e, dt, game, p) { e._bt += dt; e.vy = 0; e.y = e._by + Math.sin(e._bt * p.speed) * p.amplitude; },
  });
  behaviour('Spin', {
    title: 'Spin', description: 'Cycles animation frames, or flips left/right if there is only one',
    params: { interval: { type: 'number', default: 0.25, min: 0.02, max: 5, label: 'Interval (s)' } },
    start(e) { e._st = 0; },
    update(e, dt, game, p) {
      e._st = (e._st || 0) + dt; if (e._st < p.interval) return; e._st = 0;
      const a = e.sprite && e.sprite.anims[e.anim];
      if (a && a.length > 1) e.frame = (e.frame + 1) % a.length; else e.flipX = !e.flipX;
    },
  });
  behaviour('SayOnClick', {
    title: 'Say On Click', description: 'Shows a speech bubble when clicked',
    params: { text: { type: 'string', default: 'Hello!', label: 'Text' } },
    onClick(e, game, p) { if (e.say) e.say(p.text, 3); },
  });
  behaviour('DoorToScene', {
    title: 'Door To Scene', description: 'Goes to another scene when the player touches it',
    params: { scene: { type: 'scene', default: '', label: 'Scene' }, transition: { type: 'select', default: 'fade', options: ['fade', 'wipe', 'none'], label: 'Transition' } },
    start(e) { if (!e.solid) e.trigger = true; },
    onCollide(e, other, game, p) {
      if (!other || !hasTag(other, 'player') || !p.scene) return;
      if (game.goto) game.goto(p.scene, null, { transition: p.transition });
    },
  });
  behaviour('PlayCutscene', {
    title: 'Play Cutscene', description: 'Plays a cutscene when the player touches or clicks this (or at scene start)',
    params: {
      cutscene: { type: 'string', default: '', label: 'Cutscene name' },
      trigger: { type: 'select', default: 'touch', options: ['touch', 'click', 'start'], label: 'Trigger' },
      once: { type: 'boolean', default: true, label: 'Only once' },
    },
    start(e, game, p) { if (p.trigger === 'touch' && !e.solid) e.trigger = true; if (p.trigger === 'start') fire(e, game, p); },
    onCollide(e, other, game, p) { if (p.trigger === 'touch' && other && hasTag(other, 'player')) fire(e, game, p); },
    onClick(e, game, p) { if (p.trigger === 'click') fire(e, game, p); },
  });
  function fire(e, game, p) {
    if (!p.cutscene || !game.cutscene || (p.once && e._cutDone) || game.cutscene.playing) return;
    e._cutDone = true;
    game.cutscene.play(p.cutscene).catch(err => console.error('[behaviour PlayCutscene] ' + err.message));
  }
  behaviour('NameTag', {
    title: 'Name Tag', description: 'Shows a name above this entity',
    params: { text: { type: 'string', default: '', label: 'Text (blank = entity name)' }, color: { type: 'color', default: '#9fe8d0', label: 'Colour' } },
    start(e, game, p) { if (game.hud) game.hud.attachTag(e, { text: p.text || e.name || e.label || '', color: p.color }); },
  });
  behaviour('HealthBar', {
    title: 'Health Bar', description: 'Draws a health bar above this entity (uses e.hp / e.maxHp)',
    params: { max: { type: 'number', default: 100, min: 1, max: 9999, label: 'Max health' }, color: { type: 'color', default: '#d1473a', label: 'Colour' }, width: { type: 'number', default: 6, min: 3, max: 30, label: 'Width' } },
    start(e, game, p) { e.maxHp = p.max; if (e.hp === undefined) e.hp = p.max; if (game.hud) game.hud.attachBar(e, { value: () => e.hp, max: () => e.maxHp, color: p.color, w: p.width }); },
  });
  behaviour('CameraFollow', {
    title: 'Camera Follow', description: 'The camera tracks this entity',
    params: {}, start(e, game) { game.follow(e); },
  });
  behaviour('Hazard', {
    title: 'Hazard', description: 'Hurts things it touches: restarts the scene (or goes to another)',
    params: { hurts: { type: 'string', default: 'player', label: 'Hurts (tag)' }, scene: { type: 'scene', default: '', label: 'Go to scene (blank = restart)' } },
    start(e) { if (!e.solid) e.trigger = true; },
    onCollide(e, other, game, p) {
      if (!other || !hasTag(other, p.hurts) || !game.goto) return;
      const target = p.scene || (game.scene && game.scene.current);
      if (target) game.goto(target, null, { transition: 'fade' });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
