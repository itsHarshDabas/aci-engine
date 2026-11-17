/*!
 * ACI Animation module  (aci-anim.js)
 * Load AFTER aci.js (modules/anim.js). Adds frame-animated sprites, tweens, particles, text effects,
 * screen shake and screen transitions without touching the core.
 *
 *   const game = ACI.game('#screen');
 *   ACI.anim.install(game);                 // adds game.tween, game.burst, game.emitter, ...
 *   game.burst(30, 10, 'explosion');
 *   await game.tween(hero, { x: 40 }, 0.6, { ease: 'outBack' });
 */
(function (global) {
  'use strict';
  const ACI = global.ACI;
  if (!ACI) throw new Error('aci-anim.js: load aci.js first');

  // ------------------------------------------------------------------ easing
  const E = {
    linear: t => t,
    inQuad: t => t * t, outQuad: t => t * (2 - t),
    inOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    inCubic: t => t * t * t, outCubic: t => 1 + Math.pow(t - 1, 3),
    inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 + 4 * Math.pow(t - 1, 3)),
    inSine: t => 1 - Math.cos((t * Math.PI) / 2), outSine: t => Math.sin((t * Math.PI) / 2),
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    inBack: t => 2.70158 * t * t * t - 1.70158 * t * t,
    outBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    outElastic: t => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1),
    outBounce: t => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
    // 'steps(4)' gives a chunky, frame-by-frame feel — very ASCII
    steps: n => t => Math.floor(t * n) / n,
  };
  function getEase(e) {
    if (typeof e === 'function') return e;
    if (!e) return E.outQuad;
    const m = String(e).match(/^steps\((\d+)\)$/);
    if (m) return E.steps(+m[1]);
    if (!E[e]) throw new Error('unknown ease "' + e + '". Try: ' + Object.keys(E).join(', '));
    return E[e];
  }

  // ------------------------------------------------------------------ colour helpers
  const rgb = c => {
    if (Array.isArray(c)) return c;
    if (c[0] === '#') {
      if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    const m = c.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [255, 255, 255];
  };
  const h2 = n => ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
  const hex = a => '#' + h2(a[0]) + h2(a[1]) + h2(a[2]);
  function lerpColor(a, b, t) { const A = rgb(a), B = rgb(b); return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
  // colour gradient across a list, t in 0..1 (steps of 1/24 so the renderer can batch glyphs by colour)
  function gradient(list, t) {
    if (list.length === 1) return list[0];
    t = Math.round(Math.max(0, Math.min(1, t)) * 24) / 24;
    const f = t * (list.length - 1), i = Math.min(list.length - 2, Math.floor(f));
    return lerpColor(list[i], list[i + 1], f - i);
  }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return hex([f(0) * 255, f(8) * 255, f(4) * 255]);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pair = (v, d) => (Array.isArray(v) ? v : v == null ? d : [v, v]);

  // ================================================================== SPRITES
  /**
   * ACI.anim.frames(text, {sep:'---'}) -> [frameText, ...]
   * Splits one block of art into frames at lines that are only dashes. Every frame
   * keeps its own indentation, so a walking figure doesn't jump around between frames.
   */
  function frames(text, o = {}) {
    if (Array.isArray(text)) return text.slice();
    const sep = o.sep || '---';
    const re = new RegExp('^\\s*' + sep.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '+\\s*$');
    const parts = []; let cur = [];
    for (const line of String(text).replace(/\t/g, '  ').replace(/\r/g, '').split('\n')) {
      if (re.test(line)) { parts.push(cur); cur = []; } else cur.push(line);
    }
    parts.push(cur);
    const trim = ls => { while (ls.length && !ls[0].trim()) ls.shift(); while (ls.length && !ls[ls.length - 1].trim()) ls.pop(); return ls; };
    const all = parts.map(trim).filter(p => p.length);
    const ind = Math.min(...all.flat().filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
    return all.map(p => p.map(l => l.slice(ind === Infinity ? 0 : ind).replace(/\s+$/, '')).join('\n'));
  }

  function buildFrame(lines, W, H, cmap, palette, def, bg) {
    const cells = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = (lines[y] && lines[y][x]) || ' ';
      const key = cmap && cmap[y] ? cmap[y][x] : null;
      cells.push({ ch, fg: (key && palette[key]) || def, bg: bg || null });
    }
    return { w: W, h: H, cells };
  }
  function finish(spr) {
    let w = 0, h = 0;
    for (const n in spr.anims) for (const f of spr.anims[n]) { w = Math.max(w, f.w); h = Math.max(h, f.h); }
    spr.w = w; spr.h = h; return spr;
  }

  /**
   * ACI.anim.sprite({ idle: '...---...', walk: [...] }, { colors, palette, color, fps })
   * Like ACI.sprite, but frames can be '---' separated, are aligned to one common size,
   * and the sprite reports a real .w/.h. `colors` has the same shape as the art; each
   * letter is a palette key.
   */
  function sprite(def, o = {}) {
    if (typeof def === 'string' || Array.isArray(def)) def = { default: def };
    const palette = o.palette || {}, base = o.color || '#e8e8e8';
    const colorsDef = o.colors == null ? {} : (typeof o.colors === 'string' || Array.isArray(o.colors) ? { [Object.keys(def)[0]]: o.colors } : o.colors);
    const out = { anims: {}, fps: o.fps || 6, solid: !!o.solid, bg: o.bg || null, w: 0, h: 0 };
    for (const name in def) {
      const fr = frames(def[name]).map(f => f.split('\n'));
      const cm = colorsDef[name] ? frames(colorsDef[name]).map(f => f.split('\n')) : null;
      const W = Math.max(...fr.flat().map(l => l.length)), H = Math.max(...fr.map(f => f.length));
      out.anims[name] = fr.map((lines, i) => buildFrame(lines, W, H, cm ? cm[Math.min(i, cm.length - 1)] : null, palette, base, out.bg));
    }
    return finish(out);
  }

  /**
   * ACI.anim.sheet(text, { frameW, frameH, anims: { idle:[0], walk:[1,2,3] }, ... })
   * A classic sprite sheet: one block of art cut into a grid of equal frames (row-major).
   * Without `anims` every frame goes into one 'default' animation.
   */
  function sheet(text, o) {
    if (!o || !o.frameW || !o.frameH) throw new Error('sheet needs {frameW, frameH}');
    const cut = (t) => {
      const lines = String(t).replace(/\t/g, '  ').replace(/\r/g, '').split('\n');
      while (lines.length && !lines[0].trim()) lines.shift();
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
      return lines.map(l => l.slice(ind === Infinity ? 0 : ind));
    };
    const lines = cut(text), cm = o.colors ? cut(o.colors) : null;
    const W = Math.max(...lines.map(l => l.length)), tx = Math.floor(W / o.frameW), ty = Math.ceil(lines.length / o.frameH);
    const sliceFrame = (src, i) => { const cx = (i % tx) * o.frameW, cy = Math.floor(i / tx) * o.frameH; const r = []; for (let y = 0; y < o.frameH; y++) r.push((src[cy + y] || '').slice(cx, cx + o.frameW)); return r; };
    const all = [...Array(tx * ty).keys()];
    const anims = o.anims || { default: all };
    const palette = o.palette || {}, base = o.color || '#e8e8e8';
    const out = { anims: {}, fps: o.fps || 6, solid: !!o.solid, bg: o.bg || null, w: o.frameW, h: o.frameH };
    for (const name in anims) out.anims[name] = anims[name].map(i => buildFrame(sliceFrame(lines, i), o.frameW, o.frameH, cm ? sliceFrame(cm, i) : null, palette, base, out.bg));
    return finish(out);
  }

  // new sprite with every frame mirrored left↔right (swaps / \ ( ) etc. too)
  function mirror(spr) {
    const out = Object.assign({}, spr, { anims: {} });
    for (const n in spr.anims) out.anims[n] = spr.anims[n].map(f => {
      const cells = [];
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const c = f.cells[y * f.w + (f.w - 1 - x)]; cells.push(Object.assign({}, c, { ch: ACI.FLIP_H[c.ch] || c.ch })); }
      return { w: f.w, h: f.h, cells };
    });
    return out;
  }
  // new sprite with every cell colour passed through fn(cell, x, y, frameIndex, animName) -> colour
  function recolor(spr, fn) {
    const out = Object.assign({}, spr, { anims: {} });
    for (const n in spr.anims) out.anims[n] = spr.anims[n].map((f, fi) => ({ w: f.w, h: f.h, cells: f.cells.map((c, i) => Object.assign({}, c, { fg: fn(c, i % f.w, (i / f.w) | 0, fi, n) || c.fg })) }));
    return out;
  }

  // ================================================================== PARTICLE PRESETS
  const PRESETS = {
    explosion: { count: 30, chars: '@#*+:.', colors: ['#fff6c0', '#ffb030', '#e04020', '#503030'], speed: [6, 24], angle: [0, 360], life: [0.35, 0.95], gravity: 6, drag: 2.2 },
    spark:     { count: 10, chars: "*+'.", colors: ['#ffffff', '#ffe27a', '#ff9a3c'], speed: [8, 20], angle: [0, 360], life: [0.2, 0.5], drag: 3 },
    hit:       { count: 8, chars: '*x+.', colors: ['#ffffff', '#ff6666'], speed: [6, 16], angle: [0, 360], life: [0.15, 0.4], drag: 3 },
    smoke:     { count: 1, chars: '.oO0', colors: ['#aaaaaa', '#555555', '#222222'], speed: [1, 3], angle: [60, 120], life: [0.9, 1.8], gravity: -2, drag: 0.6 },
    fire:      { count: 1, chars: "^*'.", colors: ['#fff3a0', '#ffb030', '#e04020', '#401010'], speed: [2, 6], angle: [75, 105], life: [0.4, 0.9], gravity: -6, drag: 1 },
    sparkle:   { count: 12, chars: '+*.', colors: ['#ffffff', '#99ccff', '#cc99ff'], speed: [1, 6], angle: [0, 360], life: [0.4, 1], drag: 1.5 },
    confetti:  { count: 40, chars: '▪■=%#&', colorMode: 'random', charMode: 'random', colors: ['#ff5577', '#ffd24a', '#55ddaa', '#66aaff', '#cc77ff'], speed: [10, 28], angle: [50, 130], life: [1, 2.2], gravity: 16, drag: 1.2 },
    dust:      { count: 6, chars: '.:\'', colors: ['#bba890', '#665544'], speed: [2, 7], angle: [20, 160], life: [0.25, 0.6], gravity: -2, drag: 3 },
    pickup:    { count: 14, chars: '$*+.', colors: ['#ffffff', '#ffd24a', '#c08010'], speed: [4, 14], angle: [0, 360], life: [0.3, 0.7], drag: 2.5 },
    heal:      { count: 10, chars: '+', colors: ['#bbffbb', '#44cc66'], speed: [2, 5], angle: [70, 110], life: [0.6, 1.1], gravity: -3, drag: 1, spread: 2 },
    bubbles:   { count: 1, chars: 'o°O.', colors: ['#aaddff', '#4488cc'], speed: [1, 3], angle: [80, 100], life: [1, 2], gravity: -2, drag: 0.3 },
    rain:      { count: 1, chars: '|', colors: ['#6aa8ff', '#3a68aa'], speed: [30, 40], angle: [255, 265], life: [1, 1.4], charMode: 'random', aspect: 0.5 },
    snow:      { count: 1, chars: "*.'", colors: ['#ffffff', '#cde'], speed: [2, 5], angle: [250, 290], life: [3, 6], charMode: 'random', colorMode: 'random', wobble: 1.5 },
    embers:    { count: 1, chars: '.*', colors: ['#ffd070', '#ff6a20', '#401010'], speed: [1, 4], angle: [70, 110], life: [1, 2.5], gravity: -1.5, wobble: 2 },
  };

  // ================================================================== INSTALL
  function install(game) {
    const G = game;
    if (G.tween && G.burst) return G; // already installed

    // ---------------------------------------------------------- timers & tweens
    const tweens = [], timers = [];
    const thenable = (obj) => {
      obj.promise = new Promise(r => { obj._resolve = r; });
      obj.then = (a, b) => obj.promise.then(a, b);
      return obj;
    };

    /** game.tween(target, {x: 40, tint: '#f00', y: '+=3'}, seconds, {ease, delay, repeat, yoyo, onUpdate, onDone}) */
    G.tween = (target, props, dur = 0.5, o = {}) => {
      const tw = { target, props, dur, delay: o.delay || 0, ease: getEase(o.ease), repeat: o.repeat === true ? Infinity : o.repeat || 0, yoyo: !!o.yoyo, clock: 0, started: false, from: {}, to: {}, kind: {}, onUpdate: o.onUpdate, onDone: o.onDone };
      thenable(tw);
      tw.cancel = () => { tw.dead = true; tw._resolve(false); };
      tw.finish = () => { tw.skip = true; };
      tweens.push(tw);
      return tw;
    };
    function startTween(tw) {
      tw.started = true;
      for (const k in tw.props) {
        let to = tw.props[k], from = tw.target[k];
        if (typeof to === 'string' && /^[+-]=/.test(to)) { tw.kind[k] = 'num'; tw.from[k] = +from || 0; tw.to[k] = tw.from[k] + (to[0] === '-' ? -1 : 1) * parseFloat(to.slice(2)); }
        else if (typeof to === 'string') { tw.kind[k] = 'color'; tw.from[k] = from || to; tw.to[k] = to; }
        else { tw.kind[k] = 'num'; tw.from[k] = from == null ? 0 : from; tw.to[k] = to; }
      }
    }
    function applyTween(tw, e) {
      for (const k in tw.to) tw.target[k] = tw.kind[k] === 'color' ? lerpColor(tw.from[k], tw.to[k], e) : tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (tw.onUpdate) tw.onUpdate(tw.target, e);
    }
    function stepTweens(dt) {
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        if (tw.dead) { tweens.splice(i, 1); continue; }
        tw.clock += dt;
        let el = tw.clock - tw.delay;
        if (el < 0 && !tw.skip) continue;
        if (!tw.started) startTween(tw);
        let prog = tw.dur <= 0 ? Infinity : el / tw.dur;
        let fin = tw.skip || prog >= tw.repeat + 1, iter = fin ? tw.repeat : Math.floor(prog);
        if (!isFinite(iter)) iter = 0;
        let local = fin ? 1 : prog - iter;
        if (tw.yoyo && iter % 2 === 1) local = 1 - local;
        applyTween(tw, tw.ease(Math.max(0, Math.min(1, local))));
        if (fin) { tweens.splice(i, 1); if (tw.onDone) tw.onDone(tw.target); tw._resolve(true); }
      }
    }

    /** game.after(seconds, fn) / await game.wait(seconds) / game.every(seconds, fn) */
    G.after = (secs, fn) => { const t = thenable({ left: secs, fn, every: 0 }); t.cancel = () => { t.dead = true; t._resolve(false); }; timers.push(t); return t; };
    G.wait = secs => G.after(secs);
    G.every = (secs, fn) => { const t = thenable({ left: secs, fn, every: secs }); t.cancel = () => { t.dead = true; t._resolve(false); }; timers.push(t); return t; };
    function stepTimers(dt) {
      for (let i = timers.length - 1; i >= 0; i--) {
        const t = timers[i];
        if (t.dead) { timers.splice(i, 1); continue; }
        t.left -= dt;
        if (t.left <= 0) {
          if (t.fn) t.fn();
          if (t.every) t.left += t.every; else { timers.splice(i, 1); t._resolve(true); }
        }
      }
    }

    // ---------------------------------------------------------- animation controller
    // Gives entities play-once / ping-pong / queue-next, and frame events.
    const controlled = new Set();
    /** game.animate(entity, 'attack', { loop:false, then:'idle', pingpong, fps, onEnd, onFrame:{2: fn} }) */
    G.animate = (e, name, o = {}) => {
      const anim = e.sprite.anims[name];
      if (!anim) throw new Error('sprite has no animation "' + name + '" (has: ' + Object.keys(e.sprite.anims).join(', ') + ')');
      if (o.restart === false && e.anim === name && e._ac) { return e; }
      e.anim = name; e.frame = 0; e.ft = 0;
      e._ac = { name, loop: o.loop !== false, pingpong: !!o.pingpong, dir: 1, then: o.then, onEnd: o.onEnd, onFrame: o.onFrame, fps: o.fps, ft: 0, done: false };
      e._acfps0 = e.fps;
      e.fps = 1e-6; // we step frames ourselves; engine's own stepping never fires
      controlled.add(e);
      if (e._ac.onFrame && e._ac.onFrame[0]) e._ac.onFrame[0](e);
      return e;
    };
    function stepControllers(dt) {
      for (const e of controlled) {
        const c = e._ac;
        if (!c || !G.entities.includes(e)) { controlled.delete(e); continue; }
        if (c.done) continue;
        const anim = e.sprite.anims[c.name]; if (!anim) continue;
        c.ft += dt;
        const step = 1 / (c.fps || e._fpsOverride || e.sprite.fps);
        while (c.ft >= step && !c.done) {
          c.ft -= step;
          let nf = e.frame + c.dir, ended = false;
          if (nf >= anim.length || nf < 0) {
            if (c.pingpong) { c.dir = -c.dir; nf = e.frame + c.dir; if (nf < 0 || nf >= anim.length) nf = e.frame; if (!c.loop && c.dir === 1) ended = true; }
            else if (c.loop) nf = nf < 0 ? anim.length - 1 : 0;
            else { nf = anim.length - 1; ended = true; }
          }
          e.frame = Math.max(0, Math.min(anim.length - 1, nf));
          if (c.onFrame && c.onFrame[e.frame]) c.onFrame[e.frame](e);
          if (ended) {
            c.done = true;
            if (c.onEnd) c.onEnd(e);
            if (c.then) G.animate(e, c.then, { loop: true });
          }
        }
      }
    }

    // ---------------------------------------------------------- particles
    const parts = [], emitters = [];
    const MAX = 3000;
    function resolve(preset, over) {
      const base = typeof preset === 'string' ? PRESETS[preset] : preset;
      if (!base) throw new Error('unknown particle preset "' + preset + '". Try: ' + Object.keys(PRESETS).join(', '));
      return Object.assign({}, base, over || {});
    }
    function spawn(o, x, y) {
      const ang = pair(o.angle, [0, 360]), spd = pair(o.speed, [4, 10]), life = pair(o.life, [0.5, 1]);
      const a = rnd(ang[0], ang[1]) * Math.PI / 180, s = rnd(spd[0], spd[1]), asp = o.aspect == null ? 0.55 : o.aspect;
      const sp = o.spread || 0;
      const l = rnd(life[0], life[1]);
      const colors = o.colors || (o.color ? [o.color] : ['#ffffff']);
      const p = {
        x: x + (sp ? rnd(-sp, sp) : 0), y: y + (sp ? rnd(-sp, sp) * asp : 0),
        vx: Math.cos(a) * s, vy: -Math.sin(a) * s * asp,
        life: l, max: l, g: o.gravity || 0, drag: o.drag || 0, wob: o.wobble || 0, ph: Math.random() * 6.28,
        chars: o.chars || '*', charMode: o.charMode || 'life', text: o.text, colors, colorMode: o.colorMode || 'life',
        pick: colors[Math.floor(Math.random() * colors.length)], cidx: Math.random(),
        floor: o.floor, bounce: o.bounce == null ? 0.5 : o.bounce, kill: o.killOffscreen !== false,
      };
      if (parts.length >= MAX) parts.shift();
      parts.push(p); return p;
    }
    /** game.burst(x, y, 'explosion' | {…options}, {…overrides}) — one-shot puff of particles */
    G.burst = (x, y, preset = 'spark', over) => { const o = resolve(preset, over); const n = o.count == null ? 10 : o.count; for (let i = 0; i < n; i++) spawn(o, x, y); return G; };
    /**
     * game.emitter({ preset:'fire', x, y, rate:30, area:{x,y,w,h}, follow: entity, offset:[dx,dy], duration })
     * Continuous stream. Returns a handle: .x/.y can be moved, .stop(), .start(), .remove().
     */
    G.emitter = (o = {}) => {
      const cfg = resolve(o.preset || o, o.preset ? o : null);
      const em = { cfg, x: o.x || 0, y: o.y || 0, rate: o.rate || 20, area: o.area, follow: o.follow, offset: o.offset || [0, 0], active: o.active !== false, acc: 0, left: o.duration == null ? Infinity : o.duration };
      em.stop = () => { em.active = false; return em; };
      em.start = () => { em.active = true; return em; };
      em.remove = () => { em.dead = true; };
      emitters.push(em); return em;
    };
    /** game.floatText(x, y, '+10', { color, rise, life }) — damage numbers, pickup text */
    G.floatText = (x, y, text, o = {}) => {
      const p = spawn({ chars: ' ', text: String(text), colors: o.colors || [o.color || '#ffffff'], speed: 0, life: o.life || 0.9, gravity: 0, killOffscreen: false }, x, y);
      p.vy = -(o.rise == null ? 4 : o.rise) * 0.55; p.drag = 1.2; return p;
    };
    function stepParticles(dt) {
      for (let i = emitters.length - 1; i >= 0; i--) {
        const em = emitters[i];
        if (em.dead || (em.follow && !G.entities.includes(em.follow))) { emitters.splice(i, 1); continue; }
        if (!em.active) continue;
        em.left -= dt; if (em.left <= 0) { em.active = false; continue; }
        em.acc += em.rate * dt;
        while (em.acc >= 1) {
          em.acc -= 1;
          let x = em.x, y = em.y;
          if (em.follow) { x = em.follow.x + (em.follow.w || 0) / 2 + em.offset[0]; y = em.follow.y + em.offset[1]; }
          if (em.area) { x = em.area.x + Math.random() * em.area.w; y = em.area.y + Math.random() * em.area.h; }
          spawn(em.cfg, x, y);
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        const k = 1 / (1 + p.drag * dt);
        p.vx *= k; p.vy *= k; p.vy += p.g * dt * 0.55;
        p.x += (p.vx + (p.wob ? Math.sin(G.time * 3 + p.ph) * p.wob : 0)) * dt; p.y += p.vy * dt;
        if (p.floor != null && p.y > p.floor) { p.y = p.floor; p.vy = -p.vy * p.bounce; p.vx *= 0.8; }
        if (p.kill && (p.y < -2 || p.y > G.rows + 2 || p.x < -2 || p.x > G.cols + 2)) parts.splice(i, 1);
      }
    }
    function drawParticles() {
      for (const p of parts) {
        const t = 1 - p.life / p.max;
        const col = p.colorMode === 'random' ? p.pick : gradient(p.colors, t);
        if (p.text) { G.text(Math.round(p.x - p.text.length / 2), Math.round(p.y), p.text, col); continue; }
        const ch = p.chars.length === 1 ? p.chars : p.charMode === 'random' ? p.chars[Math.floor(p.cidx * p.chars.length)] : p.chars[Math.min(p.chars.length - 1, Math.floor(t * p.chars.length))];
        G.put(p.x, p.y, ch, col);
      }
    }
    G.particleCount = () => parts.length;
    G.clearParticles = () => { parts.length = 0; emitters.length = 0; };

    // ---------------------------------------------------------- text effects
    const texts = [];
    G.fx = G.fx || {};
    /**
     * game.fx.text(x, y, 'GAME OVER', { effects:['wave','rainbow'], color, cps, ttl })
     * effects: typewriter, wave, rainbow, shake, blink, pulse
     */
    G.fx.text = (x, y, str, o = {}) => {
      const h = { x, y, str, o: Object.assign({ color: '#ffffff', effects: [], cps: 30, amp: 1, speed: 4, freq: 0.3 }, o), age: 0, dead: false, center: !!o.center };
      h.remove = () => { h.dead = true; };
      h.set = s => { h.str = s; h.age = 0; return h; };
      h.done = () => h.o.effects.includes('typewriter') ? h.age * h.o.cps >= h.str.length : true;
      texts.push(h); return h;
    };
    function stepTexts(dt) { for (let i = texts.length - 1; i >= 0; i--) { const h = texts[i]; h.age += dt; if (h.dead || (h.o.ttl && h.age > h.o.ttl)) texts.splice(i, 1); } }
    function drawTexts() {
      for (const h of texts) {
        const o = h.o, fxs = o.effects, t = G.time;
        let n = h.str.length;
        if (fxs.includes('typewriter')) n = Math.min(n, Math.floor(h.age * o.cps));
        if (fxs.includes('blink') && Math.floor(t * 3) % 2) continue;
        const x0 = h.center ? Math.round(h.x - h.str.length / 2) : h.x;
        for (let i = 0; i < n; i++) {
          const c = h.str[i]; if (c === ' ') continue;
          let dx = 0, dy = 0, col = o.color;
          if (fxs.includes('wave')) dy += Math.round(Math.sin(t * o.speed + i * o.freq) * o.amp);
          if (fxs.includes('shake')) { dx += Math.round((ACI.hash(i, 1, Math.floor(t * 20)) - 0.5) * 2 * o.amp); dy += Math.round((ACI.hash(i, 2, Math.floor(t * 20)) - 0.5) * o.amp); }
          if (fxs.includes('rainbow')) col = hsl(t * 120 + i * 25, 90, 62);
          else if (fxs.includes('pulse')) col = lerpColor(o.color, o.color2 || '#ffffff', (Math.sin(t * o.speed + i * o.freq) + 1) / 2);
          G.put(x0 + i + dx, h.y + dy, c, col);
        }
      }
    }

    // ---------------------------------------------------------- screen shake (post-process)
    let shakeAmp = 0, shakeT = 0, shakeDur = 0;
    /** game.shake(amount=2, seconds=0.3) — jolts everything drawn so far (not your HUD if you draw it in onDraw after install) */
    G.shake = (amount = 2, secs = 0.3) => { shakeAmp = amount; shakeT = shakeDur = secs; return G; };
    function applyShake(dt) {
      if (shakeT <= 0) return;
      const k = shakeT / shakeDur; shakeT -= dt;
      const amp = shakeAmp * k;
      const dx = Math.round((Math.random() * 2 - 1) * amp), dy = Math.round((Math.random() * 2 - 1) * amp * 0.5);
      if (!dx && !dy) return;
      const W = G.viewCols || G.cols, H = G.viewRows || G.rows, cx = G.camera ? Math.round(G.camera.x) : 0, cy = G.camera ? Math.round(G.camera.y) : 0, snap = new Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) snap[y * W + x] = G.get(cx + x, cy + y);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const sx = x - dx, sy = y - dy;
        const c = sx >= 0 && sy >= 0 && sx < W && sy < H ? snap[sy * W + sx] : null;
        G.put(cx + x, cy + y, c && c.ch != null ? c.ch : ' ', c && c.fg ? c.fg : '#ffffff', c && c.bg ? c.bg : '');
      }
    }

    // ---------------------------------------------------------- transitions
    let trans = null;
    /**
     * await game.transition({ type:'iris', dir:'out', dur:0.7, color:'#000' })
     * type: fade | wipe | iris | dissolve | blinds   dir: 'out' (cover screen) | 'in' (reveal)
     * Stays covered after an 'out' until you run an 'in' (or call game.transition(null)).
     */
    G.transition = (o) => {
      if (!o) { trans = null; return Promise.resolve(); }
      o = Object.assign({ type: 'fade', dir: 'out', dur: 0.7, color: '#05070d', char: '█' }, o);
      if (trans && trans._resolve) trans._resolve(false);
      trans = thenable({ o, t: 0 });
      return trans;
    };
    function stepTransition(dt) { if (trans && !trans.finished) { trans.t += dt; if (trans.t >= trans.o.dur) { trans.finished = true; trans._resolve(true); if (trans.o.dir === 'in') trans = null; } } }
    function drawTransition() {
      if (!trans) return;
      const o = trans.o, p0 = Math.min(1, trans.t / o.dur), p = o.dir === 'out' ? p0 : 1 - p0; // p = how much is covered
      if (p <= 0) return;
      const S = G.screen || G, W = G.viewCols || G.cols, H = G.viewRows || G.rows, col = o.color;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let cover = false, ch = o.char;
        if (o.type === 'fade') {
          const levels = ' ░▒▓█', i = Math.min(4, Math.floor(p * 5 + ACI.hash(x, y, 3) * 0.6 - 0.1));
          if (i <= 0) continue; ch = levels[Math.max(0, Math.min(4, i))]; cover = true;
        } else if (o.type === 'wipe') {
          const edge = p * (W + 6) - 3; cover = x < edge; if (!cover && x < edge + 3) { ch = '▒'; cover = true; } else if (cover && x > edge - 3) ch = '▓';
        } else if (o.type === 'iris') {
          const cx = W / 2, cy = H / 2, d = Math.hypot((x - cx) * 0.55, (y - cy)), R = Math.hypot(cx * 0.55, cy) * (1 - p);
          cover = d > R;
        } else if (o.type === 'dissolve') {
          cover = ACI.hash(x, y, 11) < p; ch = ACI.hash(x, y, 5) < 0.5 ? '█' : '▓';
        } else if (o.type === 'blinds') {
          const band = (y % 4) / 4; cover = band < p * 1.3 - 0.15 || p > 0.99;
          if (cover && band > p * 1.3 - 0.4) ch = '▒';
        }
        if (cover) S.put(x, y, ch, col, ch === '█' ? col : '');
      }
    }

    // ---------------------------------------------------------- sprite helpers
    /** game.flash(entity, '#fff', 0.2) — blink an entity to a colour and fade back */
    G.flash = (e, color = '#ffffff', dur = 0.2) => { e.tint = color; e.tintAmt = 1; return G.tween(e, { tintAmt: 0 }, dur, { ease: 'linear', onDone: () => { e.tint = null; } }); };
    /** game.trail(entity, 'dust' | {…}) — a particle emitter glued to the entity's feet */
    G.trail = (e, preset = 'dust', o = {}) => G.emitter(Object.assign({ preset, follow: e, offset: [0, e.h || 1], rate: 14 }, o));

    // ---------------------------------------------------------- wiring (order matters)
    // ---------------------------------------------------------- agent commands (JSON in, JSON out)
    if (G.defineCommand) {
      const ent = c => { const e = c.id != null ? G.entities.find(x => x.id === c.id) : G.find(c.name); if (!e) throw new Error('no entity ' + (c.id ?? c.name)); return e; };
      G.defineCommand('burst', c => { G.burst(c.x ?? G.camera?.x + G.viewCols / 2, c.y ?? G.camera?.y + G.viewRows / 2, c.preset || 'spark', c.options); return { particles: G.particleCount() }; },
        'burst {x, y, preset: ' + Object.keys(PRESETS).join('|') + ', options?} — one-shot particle puff in world cells');
      G.defineCommand('floatText', c => { G.floatText(c.x, c.y, c.text, { color: c.color, life: c.life }); return {}; }, 'floatText {x, y, text, color?} — rising text (damage numbers, pickups)');
      G.defineCommand('shake', c => { G.shake(c.amount ?? 2, c.secs ?? 0.3); return {}; }, 'shake {amount?, secs?} — jolt the screen');
      G.defineCommand('tween', c => { const e = ent(c); G.tween(e, c.props, c.dur ?? 0.5, { ease: c.ease, delay: c.delay, yoyo: c.yoyo, repeat: c.repeat }); return { id: e.id }; },
        'tween {name|id, props:{x:40,y:"+=3"}, dur?, ease?: ' + Object.keys(E).filter(k => k !== 'steps').join('|') + ', yoyo?, repeat?} — smoothly animate numeric props of an entity');
      G.defineCommand('animate', c => { const e = ent(c); G.animate(e, c.anim, { loop: c.loop !== false, then: c.then, pingpong: c.pingpong, fps: c.fps }); return { id: e.id }; }, 'animate {name|id, anim, loop?: true, then?: "idle", pingpong?, fps?} — play one of an entity\'s animations');
      G.defineCommand('emitter', c => { const em = G.emitter(Object.assign({ preset: c.preset || 'sparkle' }, c.options || {}, { x: c.x, y: c.y, rate: c.rate || 20, follow: c.follow ? ent({ name: c.follow }) : undefined })); G.agentEmitters = G.agentEmitters || {}; if (c.name) G.agentEmitters[c.name] = em; return { name: c.name || null }; },
        'emitter {preset, x, y, rate?, name?, follow?: entityName} — continuous particle stream; stop it with stopEmitter');
      G.defineCommand('stopEmitter', c => { const em = (G.agentEmitters || {})[c.name]; if (!em) throw new Error('no emitter ' + c.name); em.remove(); delete G.agentEmitters[c.name]; return {}; }, 'stopEmitter {name}');
      G.defineCommand('transition', c => { G.transition({ type: c.type || 'fade', dir: c.dir || 'out', dur: c.dur || 0.7, color: c.color }); return {}; }, 'transition {type: fade|wipe|iris|dissolve|blinds, dir: out|in, dur?} — cover or reveal the screen');
      G.defineCommand('fxText', c => { G.fx.text(c.x, c.y, c.text, { color: c.color, effects: c.effects || [], center: !!c.center, ttl: c.ttl }); return {}; }, 'fxText {x, y, text, color?, effects?: [typewriter|wave|rainbow|shake|blink|pulse], center?, ttl?} — animated text (plain text stays the core "text" op)');
    }
    G.onUpdate(dt => { stepTweens(dt); stepTimers(dt); stepControllers(dt); stepParticles(dt); stepTexts(dt); stepTransition(dt); });
    G.onDraw(() => { drawTexts(); drawParticles(); });
    G.onDraw(() => applyShake(1 / 60));
    G.onDraw(() => drawTransition());
    return G;
  }

  if (ACI.plugin) ACI.plugin('anim', (game) => install(game)); // auto-install on every game once core v0.2 is loaded
  ACI.anim = { install, frames, sprite, sheet, mirror, recolor, ease: E, PRESETS, lerpColor, gradient, hsl };
  ACI.easings = E;
})(typeof window !== 'undefined' ? window : globalThis);
