/* ACI runtime: boots a project (manifest + scenes + assets + scripts) into a running game.
   Used by runtime/player.html (editor play mode, /play/<id>/) and by exported builds.
   ACIRuntime.start(data, opts) -> game
     data = { manifest, scenes:{name: sceneDoc}, assets:{name: .aci.json object|string}, scripts:{name: code} }
     opts = { target:'#screen', onLog(level,msg), onScene(name) }                                          */
(function (global) {
  'use strict';
  const ACI = global.ACI;
  const R = global.ACIRuntime = {};

  const asObj = v => (typeof v === 'string' ? JSON.parse(v) : v);

  R.start = function start(data, opts = {}) {
    const log = (level, msg) => { try { opts.onLog && opts.onLog(level, String(msg)); } catch (e) {} (console[level] || console.log)('[aci] ' + msg); };
    const manifest = data.manifest || {}, settings = manifest.settings || {};
    const game = ACI.game(opts.target || '#screen', { fontSize: settings.fontSize || 14, background: settings.background || '#0a0e1a', renderer: settings.renderer || 'auto' });
    R.game = game;

    // ---- assets: name -> sprite
    const assets = game.assets = game.assets || {};
    for (const name in data.assets || {}) {
      try { assets[name] = ACI.fromAsset(asObj(data.assets[name])); } catch (e) { log('error', 'asset "' + name + '": ' + e.message); }
    }

    // ---- cutscenes
    for (const name in data.cutscenes || {}) {
      try { if (game.cutscene) game.cutscene.define(name, asObj(data.cutscenes[name])); } catch (e) { log('error', 'cutscene "' + name + '": ' + e.message); }
    }

    // ---- user scripts (they call ACI.behaviour(...))
    for (const name in data.scripts || {}) {
      try { new Function('ACI', 'game', data.scripts[name] + '\n//# sourceURL=scripts/' + name + '.js')(ACI, game); }
      catch (e) { log('error', 'script "' + name + '": ' + e.message); }
    }

    // ---- build one scene from its document
    function instantiate(g, doc) {
      if (doc.world && g.setWorld) g.setWorld(doc.world.cols, doc.world.rows);
      if (g.physics) g.physics.gravity = doc.gravity !== undefined ? doc.gravity : (doc.settings && doc.settings.gravity) || 0;
      const env = doc.environment;
      if (env && env.preset && env.preset !== 'none') {
        const E = ACI.environments, def = E && E.get && E.get(env.preset);
        try {
          if (def) g.layer(def.layer(env.params || {}), -100);
          else log('warn', 'environment "' + env.preset + '" is not available');
        } catch (e) { log('error', 'environment "' + env.preset + '": ' + e.message); }
      }
      (doc.tilemaps || []).forEach(t => { try { g.tilemap({ rows: t.rows, legend: t.legend }, t.legend, { name: t.name, x: t.x, y: t.y, setWorld: false }); } catch (e) { log('error', 'tilemap: ' + e.message); } });

      const ents = doc.entities;
      const byName = {};
      if (ents && ents.format === 'aci-world') g.saves.restore(ents);          // snapshot-style scene (modules/project.js saveScene)
      else (ents || []).forEach(d => {
        let spr = null;
        if (d.sprite && d.sprite.asset) spr = assets[d.sprite.asset];
        else if (typeof d.sprite === 'string') spr = ACI.sprite(d.sprite, d.spriteOpts || {});
        else if (d.sprite && d.sprite.anims) spr = ACI.fromAsset(d.sprite);
        if (!spr) { log('warn', 'entity "' + (d.name || d.id) + '" has no sprite' + (d.sprite && d.sprite.asset ? ' (missing asset "' + d.sprite.asset + '")' : '')); spr = ACI.sprite('?', { color: '#e06c75' }); }
        const props = Object.assign({}, d); ['sprite', 'behaviours', 'name', 'id'].forEach(k => delete props[k]);
        if (d.name && !props.label) props.label = null;
        props.name = d.name; props.sceneId = d.id;
        if (Array.isArray(d.tags)) props.tags = d.tags.slice();
        const e = g.add(spr, props);
        if (d.name) byName[d.name] = e;
        if (d.behaviours && d.behaviours.length && ACI.attachBehaviours) ACI.attachBehaviours(g, e, d.behaviours);
      });
      const cam = doc.camera || {};
      if (cam.follow && byName[cam.follow] && g.follow) g.follow(byName[cam.follow]);
      else if (cam.follow) log('warn', 'camera.follow: no entity named "' + cam.follow + '"');
    }

    Object.keys(data.scenes || {}).forEach(name => {
      const doc = asObj(data.scenes[name]);
      game.scene(name, { enter(g) { instantiate(g, doc); if (opts.onScene) opts.onScene(name); } });
    });

    const start0 = (data.startScene || manifest.startScene || Object.keys(data.scenes || {})[0]);
    if (!start0) { log('error', 'project has no scenes'); return game; }
    game.goto(start0, null, { transition: 'none' });

    // ---- runtime errors -> log
    global.addEventListener('error', ev => log('error', ev.message + (ev.lineno ? ' (line ' + ev.lineno + ')' : '')));
    global.addEventListener('unhandledrejection', ev => log('error', 'unhandled: ' + (ev.reason && ev.reason.message || ev.reason)));

    global.aciPlayer = {
      game,
      pause() { game.paused = true; }, resume() { game.paused = false; },
      step(dt) { const p = game.paused; game.paused = false; game.step(dt || 1 / 30); game.paused = p; },
    };
    return game;
  };
})(typeof window !== 'undefined' ? window : globalThis);
