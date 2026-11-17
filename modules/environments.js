/*!
 * ACI Environments (modules/environments.js)
 * Ready-made animated backgrounds. A beginner picks one from a dropdown; a developer calls it in one line.
 *
 *   ACI.environments.apply(game, { preset: 'pond', params: { grass: '#2f7d46' } });
 *   ACI.environments.list()            // [{ id, title, description, params }]
 *   ACI.environments.defaults('ocean') // { deep: '#0b3a6b', ... }
 *   ACI.environments.layer('space', {}) -> fn(x, y, t, game)   // for game.layer(fn, z) if you want manual control
 *
 * A preset is { title, description, params:{ name:{ type, default, min, max, options, label } }, setup?(game, p), layer(p) -> fn }.
 * Param types match the behaviour schema: number, boolean, color, select, string.
 * Register your own:  ACI.environments.register('lava', { title:'Lava', params:{...}, layer: p => (x, y, t) => [...] })
 * Load after aci.js.
 */
(function (global) {
  'use strict';
  const ACI = global.ACI;
  if (!ACI) throw new Error('modules/environments.js: load aci.js first');
  const mix = ACI.mix, hash = ACI.hash, fbm = ACI.fbm, noise = ACI.noise;
  const C = (label, def) => ({ type: 'color', label, default: def });
  const N = (label, def, min, max, step) => ({ type: 'number', label, default: def, min, max, step: step || (max - min) / 20 });
  const B = (label, def) => ({ type: 'boolean', label, default: def });
  const S = (label, def, options) => ({ type: 'select', label, default: def, options });

  const presets = {};
  // layer(params) always fills in defaults, and the first time it runs inside a game it also runs the preset's setup
  // (e.g. the 'water' mask), so callers can simply do game.layer(ACI.environments.get(id).layer(params), -100).
  function register(id, def) {
    def.id = id; const raw = def.layer; def.rawLayer = raw;
    def.layer = params => {
      const p = resolve(id, params), fn = raw(p); let ready = false;
      return (x, y, t, G) => {
        if (!ready && G) { ready = true; if (def.setup && !(G.masks && G.masks.water)) def.setup(G, p); }
        return fn(x, y, t, G);
      };
    };
    presets[id] = def; return def;
  }
  function defaults(id) { const d = {}, s = (presets[id] || {}).params || {}; for (const k in s) d[k] = s[k].default; return d; }
  function resolve(id, params) { return Object.assign(defaults(id), params || {}); }
  function layer(id, params) {
    const def = presets[id]; if (!def) throw new Error('unknown environment "' + id + '". Try: ' + Object.keys(presets).join(', '));
    return def.layer(params);
  }
  /** apply(game, {preset, params}, z=-100) -> handle {remove()}. Runs the preset's setup (masks) and adds its layer. */
  function apply(game, env, z) {
    env = env || { preset: 'solid' };
    const def = presets[env.preset]; if (!def) throw new Error('unknown environment "' + env.preset + '"');
    const p = resolve(env.preset, env.params);
    const fn = def.layer(p);
    const L = { fn, z: z == null ? -100 : z };
    game.layers.push(L); game.layers.sort((a, b) => a.z - b.z);
    if (def.background) game.background = def.background(p);
    return { remove() { game.layers = game.layers.filter(l => l !== L); }, params: p };
  }

  // ------------------------------------------------------------------ grass field
  register('grass', {
    title: 'Grass field', description: 'Rolling grass that sways in the wind, with optional flowers.',
    params: { grass: C('Grass colour', '#3a8a4c'), dark: C('Shadow colour', '#1f5a33'), flowers: B('Flowers', true), wind: N('Wind', 1.6, 0, 5), density: N('Tall grass', 0.5, 0, 1) },
    layer: p => (x, y, t) => {
      const n = fbm(x * 0.09, y * 0.18, 3), sway = Math.sin(t * p.wind + x * 0.35 + y * 0.12);
      if (p.flowers && ACI.hash(x, y, 77) > 0.992) return [ACI.hash(x, y, 78) > 0.5 ? '*' : '"', ACI.hash(x, y, 79) > 0.5 ? '#ffd24a' : '#ff7aa8'];
      if (n > 1 - p.density * 0.6) return [sway > 0.25 ? '/' : sway < -0.25 ? '\\' : '|', mix(p.dark, p.grass, n)];
      const h = hash(x, y, 9); return [h < 0.5 ? '.' : h < 0.8 ? ',' : "'", mix(p.dark, p.grass, 0.3 + n * 0.4)];
    },
  });

  // ------------------------------------------------------------------ pond (grass + water mask with reflections)
  register('pond', {
    title: 'Pond', description: 'Grass with a rippling pond in the middle. Characters reflect in the water.',
    params: { grass: C('Grass colour', '#3a8a4c'), water: C('Water colour', '#2d5fb0'), size: N('Pond size', 0.28, 0.1, 0.5), wind: N('Wind', 1.6, 0, 5) },
    setup(game, p) {
      const pond = (x, y) => { const cx = game.cols / 2, cy = game.rows * 0.55, rx = game.cols * p.size, ry = game.rows * p.size * 0.9; return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + fbm(x * 0.2, y * 0.3, 5) * 0.12 < 1; };
      game.mask('water', pond); if (game.reflect) game.reflect('water', { tint: mix('#0a1030', p.water, 0.4), amount: 0.5 });
    },
    layer: p => { const grass = presets.grass.rawLayer({ grass: p.grass, dark: '#1f5a33', flowers: true, wind: p.wind, density: 0.5 });
      return (x, y, t, G) => {
        if (G && G.is && G.is('water', x, y)) { const w = Math.sin(x * 0.5 + t * 1.6) + Math.sin(y * 1.3 - t * 1.1); return [w > 0.8 ? '≈' : w > -0.4 ? '~' : '-', w > 1 ? mix(p.water, '#ffffff', 0.4) : p.water]; }
        return grass(x, y, t);
      }; },
  });

  // ------------------------------------------------------------------ night sky
  register('night', {
    title: 'Night sky', description: 'Twinkling stars and a moon.',
    params: { sky: C('Sky', '#070b1c'), stars: N('Stars', 0.025, 0, 0.1), moon: B('Moon', true), twinkle: N('Twinkle', 1, 0, 4) },
    background: p => p.sky,
    layer: p => (x, y, t, G) => {
      if (p.moon) { const cx = (G ? G.cols : 80) * 0.8, cy = (G ? G.rows : 30) * 0.2, d = Math.hypot((x - cx) * 0.55, y - cy); if (d < 3.2) return [d < 2.4 ? '@' : 'O', '#f4efc8', p.sky]; if (d < 4.4) return ['.', '#3a3f5c']; }
      const h = hash(x, y, 1);
      if (h < p.stars) { const tw = Math.sin(t * 2 * p.twinkle + hash(x, y, 2) * 20); return [tw > 0.6 ? '+' : tw > -0.3 ? '*' : '.', tw > 0.6 ? '#ffffff' : '#8f9bcc']; }
      return [' ', '#fff', p.sky];
    },
  });

  // ------------------------------------------------------------------ ocean
  register('ocean', {
    title: 'Ocean', description: 'Rolling waves with foam. Everything floats and reflects.',
    params: { deep: C('Deep water', '#0b3a6b'), light: C('Surface', '#3a95d9'), foam: C('Foam', '#e8f6ff'), speed: N('Wave speed', 1, 0, 4), choppy: N('Choppiness', 0.6, 0, 1) },
    setup(game, p) { game.mask('water', () => true); if (game.reflect) game.reflect('water', { tint: p.deep, amount: 0.45 }); },
    layer: p => (x, y, t) => {
      const w = Math.sin(x * 0.18 + t * p.speed * 1.4) * 0.5 + Math.sin(x * 0.07 - y * 0.35 + t * p.speed) * 0.5 + fbm(x * 0.15 + t * 0.3 * p.speed, y * 0.4, 2) * p.choppy * 1.2;
      if (w > 1.05) return ['~', p.foam]; if (w > 0.65) return ['≈', mix(p.light, p.foam, 0.35)]; if (w > 0.2) return ['~', p.light];
      return [w > -0.3 ? '-' : '.', mix(p.deep, p.light, 0.25 + w * 0.2)];
    },
  });

  // ------------------------------------------------------------------ desert
  register('desert', {
    title: 'Desert', description: 'Warm dunes with drifting sand.',
    params: { sand: C('Sand', '#d9b36a'), shade: C('Dune shadow', '#8a5f2c'), dunes: N('Dune size', 0.12, 0.04, 0.4), wind: N('Wind', 1, 0, 4) },
    layer: p => (x, y, t) => {
      const d = noise(x * p.dunes * 0.5 + t * 0.03 * p.wind, y * p.dunes * 1.4, 4), edge = d - noise(x * p.dunes * 0.5 + 0.4 + t * 0.03 * p.wind, y * p.dunes * 1.4, 4);
      if (edge > 0.06) return ['░', mix(p.sand, p.shade, 0.6)];
      if (hash(x, y, 3) > 0.985) return ['^', mix(p.shade, p.sand, 0.4)];
      const h = hash(x + Math.floor(t * p.wind * 2), y, 6); return [h < 0.18 ? '.' : h < 0.24 ? ',' : ' ', mix(p.shade, p.sand, 0.5 + d * 0.5), mix('#000000', p.sand, 0.22 + d * 0.1)];
    },
  });

  // ------------------------------------------------------------------ dungeon
  register('dungeon', {
    title: 'Dungeon floor', description: 'Dark stone tiles with cracks and the odd torch flicker.',
    params: { stone: C('Stone', '#6b6f85'), gap: C('Mortar', '#2a2d3d'), tile: N('Tile size', 6, 3, 12, 1), flicker: B('Torch flicker', true) },
    layer: p => (x, y, t) => {
      const tw = Math.round(p.tile * 2), th = Math.round(p.tile), ox = (Math.floor(y / th) % 2) * (tw >> 1), lx = (x + ox) % tw, ly = y % th;
      const lit = p.flicker ? 0.85 + Math.sin(t * 7 + Math.floor((x + ox) / tw) * 2 + Math.floor(y / th)) * 0.05 : 1;
      if (lx === 0) return ['│', mix(p.gap, p.stone, 0.15)];
      if (ly === 0) return ['─', mix(p.gap, p.stone, 0.15)];
      const h = hash(x, y, 11);
      if (h > 0.97) return [h > 0.985 ? '\\' : '/', mix(p.gap, p.stone, 0.3)];
      return [h < 0.3 ? '.' : h < 0.4 ? ':' : ' ', mix(p.gap, p.stone, (0.55 + hash(Math.floor(x / tw), Math.floor(y / th), 4) * 0.35) * lit), mix('#000000', p.stone, 0.12)];
    },
  });

  // ------------------------------------------------------------------ space
  register('space', {
    title: 'Deep space', description: 'Parallax stars and a drifting nebula.',
    params: { nebula: C('Nebula', '#7a2fd0'), stars: N('Stars', 0.012, 0, 0.05), speed: N('Scroll speed', 4, 0, 20), nebulaAmount: N('Nebula amount', 0.5, 0, 1) },
    background: () => '#03040a',
    layer: p => (x, y, t) => {
      const sy = Math.floor(t * p.speed);
      if (hash(x, y - sy, 1) < p.stars) return ['.', '#556080'];
      if (hash(x, y - Math.floor(t * p.speed * 2.2), 2) < p.stars * 0.35) return ['+', '#a8b4e0'];
      if (hash(x, y - Math.floor(t * p.speed * 4), 3) < p.stars * 0.08) return ['*', '#ffffff'];
      const n = fbm(x * 0.05, (y - t * p.speed * 0.1) * 0.12, 8) - (1 - p.nebulaAmount) * 0.55;
      if (n > 0.12) return [n > 0.3 ? '░' : '·', mix('#03040a', p.nebula, Math.min(1, n * 1.6))];
      return null;
    },
  });

  // ------------------------------------------------------------------ solid colour
  register('solid', {
    title: 'Solid colour', description: 'A flat background, with an optional texture character.',
    params: { color: C('Colour', '#0a0e1a'), texture: S('Texture', 'none', ['none', 'dots', 'dashes', 'checker']), textureColor: C('Texture colour', '#1c2540') },
    background: p => p.color,
    layer: p => (x, y) => {
      const bg = p.color;
      if (p.texture === 'dots') return [(x + y * 2) % 4 === 0 && y % 2 === 0 ? '.' : ' ', p.textureColor, bg];
      if (p.texture === 'dashes') return [y % 3 === 0 && x % 4 < 2 ? '-' : ' ', p.textureColor, bg];
      if (p.texture === 'checker') return [(x >> 1) + y & 1 ? '░' : ' ', p.textureColor, bg];
      return [' ', '#fff', bg];
    },
  });

  ACI.environments = {
    register, apply, layer, defaults, resolve, get: id => presets[id],
    list: () => Object.keys(presets).map(id => ({ id, title: presets[id].title, description: presets[id].description, params: presets[id].params })),
  };
})(typeof window !== 'undefined' ? window : globalThis);
