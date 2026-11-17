/* ACI modules/save.js: plugin 'save'. Slots in localStorage (memory fallback), versioned envelope, world snapshots. */
(function (global) {
  'use strict';
  const ACI = global.ACI = global.ACI || {};
  const SKIP = new Set(['sprite', 'update', 'play', 'say', 'bubble', 'bubbleUntil', 'ft']);

  function rle(arr, pal) { // array of colours -> [[paletteIndex, run], ...]
    const out = []; let last = -2, n = 0;
    for (const c of arr) {
      const k = c == null ? null : c; let i = pal.indexOf(k); if (i < 0) i = pal.push(k) - 1;
      if (i === last) n++; else { if (n) out.push([last, n]); last = i; n = 1; }
    }
    if (n) out.push([last, n]); return out;
  }
  const unrle = (runs, pal) => { const o = []; runs.forEach(([i, n]) => { for (let k = 0; k < n; k++) o.push(pal[i]); }); return o; };
  function packSprite(s) {
    const o = { fps: s.fps, solid: s.solid, bg: s.bg, anims: {} };
    for (const name in s.anims) o.anims[name] = s.anims[name].map(f => {
      const pal = [], chars = f.cells.map(c => c.ch), simple = chars.every(c => c.length === 1);
      return { w: f.w, h: f.h, ch: simple ? chars.join('') : chars, fg: rle(f.cells.map(c => c.fg), pal), bg: rle(f.cells.map(c => c.bg), pal), pal };
    });
    return o;
  }
  function unpackSprite(o) {
    const anims = {}; let W = 0, H = 0;
    for (const name in o.anims) anims[name] = o.anims[name].map(f => {
      const fg = unrle(f.fg, f.pal), bg = unrle(f.bg, f.pal), ch = typeof f.ch === 'string' ? f.ch.split('') : f.ch;
      W = Math.max(W, f.w); H = Math.max(H, f.h);
      return { w: f.w, h: f.h, cells: ch.map((c, i) => ({ ch: c, fg: fg[i], bg: bg[i] })) };
    });
    const spr = ACI.sprite(anims, { fps: o.fps, solid: o.solid, bg: o.bg });
    spr.w = W; spr.h = H; return spr; // ACI.sprite leaves w/h 0 for prebuilt frames
  }

  ACI.plugin('save', function install(G, opts = {}) {
    const PREFIX = 'aci:' + (opts.namespace || 'default') + ':', VERSION = opts.version || 1;
    const mem = new Map(), tracked = {}, behaviors = {}, sprites = {};
    let ls = null;
    try { const t = '__aci_probe'; global.localStorage.setItem(t, '1'); global.localStorage.removeItem(t); ls = global.localStorage; } catch (e) { ls = null; }
    const store = {
      get(k) { try { if (ls) { const v = ls.getItem(k); if (v != null) return v; } } catch (e) {} return mem.has(k) ? mem.get(k) : null; },
      set(k, v) { try { if (ls) { ls.setItem(k, v); mem.delete(k); return 'localStorage'; } } catch (e) {} mem.set(k, v); return 'memory'; },
      del(k) { try { ls && ls.removeItem(k); } catch (e) {} mem.delete(k); },
      keys() { const s = new Set(mem.keys()); try { if (ls) for (let i = 0; i < ls.length; i++) s.add(ls.key(i)); } catch (e) {} return [...s].filter(k => k.startsWith(PREFIX)); },
    };
    const emit = (ev, d) => G.emit && G.emit(ev, d);

    // ---- slots
    G.save = (slot, data) => {
      slot = String(slot); const kind = data === undefined ? 'world' : 'data';
      const env = { aci: 1, v: VERSION, slot, kind, savedAt: Date.now(), data: kind === 'world' ? G.saves.capture() : data };
      const json = JSON.stringify(env); const backend = store.set(PREFIX + slot, json);
      return { slot, kind, bytes: json.length, savedAt: env.savedAt, backend };
    };
    G.load = (slot, o = {}) => {
      const raw = store.get(PREFIX + slot); if (raw == null) return null;
      let env; try { env = JSON.parse(raw); } catch (e) { return null; }
      let data = env.data;
      if (env.v !== VERSION && typeof opts.migrate === 'function') data = opts.migrate(data, env.v, env.kind);
      if (env.kind === 'world' && o.restore !== false) G.saves.restore(data);
      return data;
    };
    G.saves = {
      backend: () => (ls ? 'localStorage' : 'memory'),
      has: slot => store.get(PREFIX + slot) != null,
      list() {
        return store.keys().map(k => { try { const e = JSON.parse(store.get(k)); return { slot: e.slot, kind: e.kind, v: e.v, savedAt: e.savedAt, bytes: store.get(k).length }; } catch (x) { return null; } })
          .filter(Boolean).sort((a, b) => b.savedAt - a.savedAt);
      },
      delete: slot => { store.del(PREFIX + slot); return G.saves; },
      clear: () => { store.keys().forEach(k => store.del(k)); return G.saves; },
      // include extra state in snapshots: game.saves.track('score', () => score, v => score = v)
      track: (key, get, set) => { tracked[key] = { get, set }; return G.saves; },
      // re-attach behaviour after restore: set e.behavior = 'wander' and game.saves.behavior('wander', (dt, e, G) => ...)
      behavior: (name, fn) => { behaviors[name] = fn; return G.saves; },
      // sprites registered by name are saved as a reference instead of full art
      register: (name, spr) => { spr.ref = name; sprites[name] = spr; return spr; },
    };

    // ---- world snapshot (game.snapshot() belongs to core = screen text, so ours is game.saves.capture/restore)
    G.saves.capture = () => {
      const sprList = [], sprIdx = new Map(), dropped = new Set();
      const ents = G.entities.map(e => {
        let si = sprIdx.get(e.sprite);
        if (si === undefined) { si = sprList.push(e.sprite.ref ? { ref: e.sprite.ref } : packSprite(e.sprite)) - 1; sprIdx.set(e.sprite, si); }
        const o = { sprite: si };
        for (const k of Object.keys(e)) {
          if (SKIP.has(k) || typeof e[k] === 'function' || e[k] === undefined) continue;
          try { o[k] = JSON.parse(JSON.stringify(e[k])); } catch (x) { dropped.add(k); }
        }
        return o;
      });
      const state = {}; for (const k in tracked) state[k] = tracked[k].get();
      return { format: 'aci-world', v: 1, time: G.time, cols: G.cols, rows: G.rows, sprites: sprList, entities: ents, state, dropped: [...dropped] };
    };
    G.saves.restore = snap => {
      if (typeof snap === 'string') snap = JSON.parse(snap);
      if (!snap || snap.format !== 'aci-world') throw new Error('restore: not an ACI world snapshot');
      const sprs = snap.sprites.map(s => (s.ref ? sprites[s.ref] || (G.sprites && G.sprites[s.ref]) : unpackSprite(s)));
      G.entities.slice().forEach(e => G.remove(e));
      const idMap = {}, missing = [];
      snap.entities.forEach(d => {
        const spr = sprs[d.sprite]; if (!spr) { missing.push(snap.sprites[d.sprite].ref); return; }
        const props = Object.assign({}, d); delete props.sprite; const oldId = props.id; delete props.id;
        const e = G.add(spr, props); idMap[oldId] = e.id;
        if (typeof e.behavior === 'string' && behaviors[e.behavior]) e.update = behaviors[e.behavior];
      });
      G.time = snap.time || G.time;
      for (const k in snap.state || {}) if (tracked[k]) tracked[k].set(snap.state[k]);
      emit('restore', snap);
      return { entities: G.entities.length, idMap, missingSprites: missing }; // ids are NOT preserved; use idMap or entity names
    };

    G.worldState = () => G.saves.capture();

    // ---- export / import (string you can paste, download or send to an agent)
    G.exportJSON = (o = {}) => {
      const out = { format: 'aci-export', v: 1, world: G.saves.capture() };
      if (o.slots !== false) { out.slots = {}; store.keys().forEach(k => { out.slots[k.slice(PREFIX.length)] = store.get(k); }); }
      return JSON.stringify(out);
    };
    G.importJSON = (text, o = {}) => {
      const d = typeof text === 'string' ? JSON.parse(text) : text;
      if (!d || d.format !== 'aci-export') throw new Error('importJSON: not an ACI export');
      if (o.slots !== false) for (const s in d.slots || {}) store.set(PREFIX + s, d.slots[s]);
      return o.restore === false ? d.world : G.saves.restore(d.world);
    };

    G.defineCommand('save', c => {
      if (c.list) return { slots: G.saves.list() };
      return G.save(c.slot == null ? 'quick' : c.slot, c.data);
    }, 'save: {slot:"quick"} saves the whole world; {slot,data:{...}} saves custom JSON; {list:true} lists slots');
    G.defineCommand('load', c => {
      if (c.slot == null && !c.list) c.slot = 'quick';
      if (c.list) return { slots: G.saves.list() };
      const has = G.saves.has(c.slot); if (!has) throw new Error('no save in slot "' + c.slot + '"');
      const d = G.load(c.slot); return d && d.format === 'aci-world' ? { restored: true, entities: G.entities.length } : { data: d };
    }, 'load: {slot:"quick"} restores a world save or returns custom data; {list:true} lists slots');
  });
})(typeof window !== 'undefined' ? window : globalThis);
