/* ACI scenes plugin: screens (title, level, game over), shared state and a tiny event bus.
     game.scene('play', { enter(g, data){...}, update(dt, g){...}, draw(g){...}, exit(g){...} });
     game.goto('play', {level:2});                 // fades out/in with an ASCII dither
     game.goto('title', null, { transition:'wipe', time:1 });   // or transition:'none'
   Everything created while a scene is active (entities, tilemaps, layers, state watchers, bus listeners)
   is removed on exit, unless an entity has persist:true. Inside scenes prefer scene update/draw over game.onUpdate
   (those can't be removed). game.scene.current = active scene name.
   game.state.score = 5  (a Proxy: assignments notify)   game.state.watch('score', (now, was) => ...) -> unwatch fn
   game.bus.on('boom', fn) / game.bus.emit('boom', data)  (your own events; separate from core's game.on/emit) */
ACI.plugin('scenes', function install(game, opts) {
  'use strict';
  const defs = {}; let cur = null, pending = null, trans = null, inUpdate = false;
  const cleanup = f => { if (cur) cur.cleanups.push(f); return f; };

  // ---- state with watchers
  const raw = {}, watchers = {};
  const api = {
    watch(key, fn, fireNow) {
      (watchers[key] = watchers[key] || []).push(fn);
      if (fireNow && key !== '*') fn(raw[key], undefined);
      const off = () => { const a = watchers[key]; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
      cleanup(off); return off;
    },
    reset(obj) { Object.keys(raw).forEach(k => delete raw[k]); Object.assign(game.state, obj || {}); },
  };
  game.state = new Proxy(raw, {
    get: (t, k) => Object.prototype.hasOwnProperty.call(api, k) ? api[k] : t[k],
    set: (t, k, v) => {
      const old = t[k]; t[k] = v;
      if (old !== v) { (watchers[k] || []).slice().forEach(f => f(v, old)); (watchers['*'] || []).slice().forEach(f => f(k, v, old)); }
      return true;
    },
  });

  // ---- event bus
  const ev = {};
  const bus = game.bus = {
    on(name, fn) { (ev[name] = ev[name] || []).push(fn); const off = () => bus.off(name, fn); cleanup(off); return off; },
    once(name, fn) { const off = bus.on(name, d => { off(); fn(d); }); return off; },
    off(name, fn) { const a = ev[name]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    emit(name, data) { (ev[name] || []).slice().forEach(f => f(data)); },
  };
  // (game.emit / game.on belong to core and talk to core events; game.bus is for your own game events)

  // ---- scenes
  const scene = game.scene = (name, def) => { defs[name] = def || {}; return game; };
  scene.current = null; scene.data = null; scene.transitioning = false;
  scene.is = n => scene.current === n;
  scene.names = () => Object.keys(defs);

  game.on('add', e => { if (cur) cur.ents.add(e); });

  function enterScene(name, data) {
    const def = defs[name];
    cur = { name, def, ents: new Set(), layers0: game.layers.slice(), maps0: (game.tilemaps || []).slice(), cleanups: [] };
    scene.current = name; scene.data = data;
    if (def.enter) def.enter.call(def, game, data);
    bus.emit('scene', { name, data });
  }
  function exitScene() {
    if (!cur) return; const c = cur;
    if (c.def.exit) c.def.exit.call(c.def, game);
    c.ents.forEach(e => { if (!e.persist) game.remove(e); });
    (game.tilemaps || []).slice().forEach(m => { if (!c.maps0.includes(m) && !m.persist) m.destroy(); });
    game.layers.filter(l => !c.layers0.includes(l)).forEach(l => game.removeLayer(l));
    c.cleanups.forEach(f => f());
    cur = null; scene.current = null;
  }
  const switchNow = p => { exitScene(); enterScene(p.name, p.data); };

  /* game.goto(name, data, {transition:'fade'|'wipe'|'none', time:0.6, color}) */
  game.goto = (name, data, o) => {
    if (!defs[name]) throw new Error('No scene "' + name + '". Defined: ' + (Object.keys(defs).join(', ') || '(none)') + '. Add one with game.scene("' + name + '", {enter(g){...}})');
    o = o || {};
    const p = { name, data, kind: o.transition || 'fade', time: o.time === undefined ? 0.6 : o.time, color: o.color || '#05070d' };
    if (!inUpdate && (!cur || p.kind === 'none' || p.time <= 0) && !trans) { switchNow(p); return game; }
    if (trans && trans.phase === 'out') trans.to = p; else pending = p;
    return game;
  };

  game.onUpdate(dt => {
    inUpdate = true;
    try {
      if (cur && cur.def.update) cur.def.update.call(cur.def, dt, game);
      if (trans) {
        trans.t += dt; const half = trans.to.time / 2;
        if (trans.phase === 'out' && trans.t >= half) { switchNow(trans.to); trans.phase = 'in'; trans.t = 0; }
        else if (trans.phase === 'in' && trans.t >= half) { trans = null; scene.transitioning = false; }
      }
      if (!trans && pending) {
        const p = pending; pending = null;
        if (p.kind === 'none' || p.time <= 0) switchNow(p);
        else { trans = { to: p, t: 0, phase: 'out' }; scene.transitioning = true; }
      }
    } finally { inUpdate = false; }
  });

  game.onDraw(g => {
    if (cur && cur.def.draw) cur.def.draw.call(cur.def, g);
    if (!trans) return;
    const half = trans.to.time / 2, k = Math.min(1, trans.t / half), p = trans.phase === 'out' ? k : 1 - k;
    if (p <= 0) return;
    const col = trans.to.color, wipe = trans.to.kind === 'wipe';
    for (let y = 0; y < g.viewRows; y++) for (let x = 0; x < g.viewCols; x++) {
      const h = g.hash(x, y, 7), v = wipe ? (x / g.viewCols) * 0.85 + h * 0.15 : h;
      if (v < p) g.screen.put(x, y, ' ', col, col);
      else if (v < p + 0.18) g.screen.put(x, y, v < p + 0.06 ? '▓' : v < p + 0.12 ? '▒' : '░', col);
    }
  });

  // ---- agent ops
  game.defineCommand('goto', c => { game.goto(c.scene, c.data, { transition: c.transition, time: c.time }); return { scene: scene.current, scenes: scene.names() }; },
    'Switch scene: {scene, data?, transition?:"fade"|"wipe"|"none", time?}. Returns the available scene names. Example: {op:"goto",scene:"play",transition:"fade"}.');
  game.defineCommand('state', c => {
    if (c.set) Object.assign(game.state, c.set);
    return { state: Object.assign({}, raw), scene: scene.current };
  }, 'Shared game state: {set:{key:value}} writes (fires watchers); always returns the whole state. Example: {op:"state",set:{score:10}}.');
});
