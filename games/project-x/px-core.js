/* Project X (ACI port) - core: game object, settings, save, clock, colour shading, UI widgets, dialogue, sound.
   Everything is drawn straight into the ACI character grid with game.screen.* each frame. */
(function () {
  'use strict';
  const PX = window.PX = { D: window.PX_DATA, scene: null, modals: [], flags: {}, T: 0 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  PX.clamp = clamp;
  const rnd = (a, b) => a + Math.random() * (b - a);
  PX.rnd = rnd;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  PX.store = store;

  // ------------------------------------------------------------------ settings
  PX.settings = Object.assign({ music: 0.5, sfx: 0.8, font: 4, shake: true, numbers: true, difficulty: 1, rain: true, scan: true }, store.get('px_settings', {}));
  PX.saveSettings = () => store.set('px_settings', PX.settings);

  // ------------------------------------------------------------------ game
  const game = PX.game = ACI.game('#screen', { fontSize: PX.settings.font, background: '#05070d', renderer: 'auto' });
  const S = game.screen;
  PX.S = S;
  game.sound.musicVolume(PX.settings.music); game.sound.sfxVolume(PX.settings.sfx);
  const I = PX.I = game.input;
  I.map({ up: ['w', 'ArrowUp'], down: ['s', 'ArrowDown'], left: ['a', 'ArrowLeft'], right: ['d', 'ArrowRight'], ok: ['e', 'Enter', 'Space'], back: ['Escape'], sprint: ['Shift'] });
  // keys that scroll / zoom the page
  addEventListener('keydown', e => { if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault(); }, true);
  addEventListener('contextmenu', e => e.preventDefault());
  PX.mouse = { l: false, r: false, pl: false, pr: false };
  addEventListener('mousedown', e => { if (e.button === 0) { PX.mouse.l = true; PX.mouse.pl = true; } if (e.button === 2) { PX.mouse.r = true; PX.mouse.pr = true; } });
  addEventListener('mouseup', e => { if (e.button === 0) PX.mouse.l = false; if (e.button === 2) PX.mouse.r = false; });
  PX.press = a => I.pressed(a);
  PX.down = a => I.down(a);
  PX.W = () => game.viewCols; PX.H = () => game.viewRows;

  // ------------------------------------------------------------------ sound (synth only)
  const snd = game.sound;
  [['knock', { type: 'square', freq: 150, freq2: 70, dur: 0.12, vol: 0.5 }], ['thump', { type: 'sine', freq: 90, freq2: 40, dur: 0.18, vol: 0.6 }],
   ['ui_move', { type: 'square', freq: 520, dur: 0.04, vol: 0.12 }], ['ui_ok', { type: 'square', freq: 760, freq2: 980, dur: 0.09, vol: 0.2 }],
   ['hit', { type: 'sawtooth', freq: 220, freq2: 60, dur: 0.12, vol: 0.4, noise: 0.3 }], ['hurt', { type: 'sawtooth', freq: 160, freq2: 50, dur: 0.22, vol: 0.5, noise: 0.4 }],
   ['slash', { type: 'sawtooth', freq: 900, freq2: 200, dur: 0.12, vol: 0.25, noise: 0.5 }], ['heavy', { type: 'sawtooth', freq: 300, freq2: 40, dur: 0.3, vol: 0.5, noise: 0.5 }],
   ['beam_charge', { type: 'sine', freq: 200, freq2: 1200, dur: 0.9, vol: 0.3 }], ['beam_fire', { type: 'sawtooth', freq: 140, freq2: 90, dur: 0.9, vol: 0.4, noise: 0.5 }],
   ['transform', { type: 'sawtooth', freq: 80, freq2: 900, dur: 0.8, vol: 0.4 }], ['warp', { type: 'sine', freq: 1400, freq2: 200, dur: 0.2, vol: 0.3 }],
   ['shatter', { type: 'square', freq: 1800, freq2: 300, dur: 0.3, vol: 0.3, noise: 0.8 }], ['flame', { type: 'sawtooth', freq: 120, freq2: 80, dur: 0.7, vol: 0.3, noise: 0.9 }],
   ['spit', { type: 'sine', freq: 400, freq2: 100, dur: 0.18, vol: 0.3, noise: 0.3 }], ['roar', { type: 'sawtooth', freq: 70, freq2: 45, dur: 0.9, vol: 0.5, noise: 0.6 }],
   ['coin', { type: 'square', freq: 880, freq2: 1320, dur: 0.14, vol: 0.2 }], ['gasp', { type: 'sine', freq: 300, freq2: 700, dur: 0.25, vol: 0.3, noise: 0.5 }],
   ['creepy', { type: 'sine', freq: 90, freq2: 70, dur: 1.4, vol: 0.4 }], ['heal', { type: 'sine', freq: 500, freq2: 900, dur: 0.5, vol: 0.25 }],
   ['dodge', { type: 'sine', freq: 600, freq2: 250, dur: 0.12, vol: 0.2, noise: 0.4 }], ['charge', { type: 'sine', freq: 220, freq2: 440, dur: 0.4, vol: 0.12 }],
   ['win', { notes: ['C5', 'E5', 'G5', 'C6'], step: 0.12, type: 'square', dur: 0.12, vol: 0.2 }], ['lose', { notes: ['C4', 'A3', 'F3', 'C3'], step: 0.2, type: 'triangle', dur: 0.22, vol: 0.3 }],
  ].forEach(([n, d]) => { try { snd.define(n, d); } catch (e) {} });
  PX.sfx = (n, o) => { try { snd.sfx(n, o); } catch (e) {} };
  PX.music = (name) => {
    const M = {
      title: ['E3 _ B3 _ G3 _ B3 _ E3 _ B3 _ A3 _ G3 _', 'E2 - - - - - - - C2 - - - - - - -'],
      night: ['A2 - - - E3 - - - F2 - - - E3 - - -', '_ _ _ _ A4 _ _ _ _ _ C5 _ _ _ B4 _'],
      day: ['C3 _ E3 _ G3 _ E3 _ F3 _ A3 _ G3 _ E3 _', 'C2 - - - F2 - - - G2 - - - C2 - - -'],
      battle: ['E2 E2 _ E2 G2 _ E2 A2 E2 E2 _ E2 B2 _ A2 G2', 'E4 _ G4 _ B4 _ G4 _ E4 _ A4 _ B4 _ G4 _'],
      shade: ['A2 A2 _ A2 C3 _ A2 D3 A2 A2 _ A2 E3 _ D3 C3', 'A4 _ C5 _ E5 _ C5 _ A4 _ D5 _ E5 _ C5 _'],
      cafe: ['F3 _ A3 _ C4 _ A3 _ G3 _ B3 _ D4 _ B3 _'],
    };
    try {
      if (!name) { snd.stop(); return; }
      if (PX._mus === name) return; PX._mus = name;
      const bpm = { title: 62, night: 54, day: 78, battle: 150, shade: 168, cafe: 70 }[name] || 80;
      snd.music(M[name], { bpm, loop: true, wave: name === 'battle' || name === 'shade' ? ['square', 'triangle'] : ['triangle', 'sine'] });
    } catch (e) {}
  };
  PX.applyVolumes = () => { try { snd.musicVolume(PX.settings.music); snd.sfxVolume(PX.settings.sfx); } catch (e) {} };

  // ------------------------------------------------------------------ colour shading (day / night)
  const hexCache = new Map();
  const toRgb = h => { let v = hexCache.get(h); if (!v) { const s = h.replace('#', ''); v = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; hexCache.set(h, v); } return v; };
  const hex2 = n => (n < 16 ? '0' : '') + n.toString(16);
  const toHex = (r, g, b) => '#' + hex2(clamp(r | 0, 0, 255)) + hex2(clamp(g | 0, 0, 255)) + hex2(clamp(b | 0, 0, 255));
  PX.toRgb = toRgb; PX.toHex = toHex;
  PX.mixc = (a, b, t) => { const A = toRgb(a), B = toRgb(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  const shadeCache = new Map();
  PX.dark = 0; // 0 day .. 1 night (set per frame)
  PX.shade = (c, extra) => {
    if (!c) return c;
    const lvl = Math.round(clamp(PX.dark + (extra || 0), 0, 1) * 8);
    if (!lvl) return c;
    const key = c + lvl; let v = shadeCache.get(key);
    if (!v) { const k = lvl / 8, [r, g, b] = toRgb(c); v = toHex(r * (1 - 0.62 * k) + 4 * k, g * (1 - 0.55 * k) + 8 * k, b * (1 - 0.35 * k) + 26 * k); if (shadeCache.size > 8000) shadeCache.clear(); shadeCache.set(key, v); }
    return v;
  };
  PX.hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + (s || 0) * 982451653) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };

  // ------------------------------------------------------------------ player, items, clock
  const ITEMS = PX.ITEMS = PX.D.items;
  PX.newPlayer = () => ({
    name: 'You', form: 'Human', hp: 120, re: 40, baseMaxHp: 120, baseMaxRe: 40, vigor: 8, endurance: 7, strength: 6, intelligence: 9, arcane: 5, money: 120,
    inventory: { bandage: 2, coffee: 1, phone: 1, fists: 1, pocket_knife: 1, blue_jacket: 1, hoodie: 1, dull_shard: 1, style_unbound: 1, style_surge: 1 },
    equipped: { weapon: 'fists', armor: 'blue_jacket', crystal: null, style: 'style_unbound' }, flasks: 3,
  });
  PX.STATS = [['vigor', 'Vigor'], ['endurance', 'Endurance'], ['strength', 'Strength'], ['intelligence', 'Intelligence'], ['arcane', 'Arcane']];
  PX.SLOTS = [['weapon', 'Weapon'], ['armor', 'Armor'], ['crystal', 'Rift Crystal'], ['style', 'Rift Style']];
  PX.bonus = (p, stat) => Object.values(p.equipped).reduce((s, i) => s + (i && ITEMS[i].mods && ITEMS[i].mods[stat] || 0), 0);
  PX.stat = (p, s) => p[s] + PX.bonus(p, s);
  PX.maxHp = p => p.baseMaxHp + PX.bonus(p, 'max_hp');
  PX.maxRe = p => Math.max(1, p.baseMaxRe + PX.bonus(p, 'max_re'));
  PX.heal = (p, hp, re) => { p.hp = clamp(p.hp + (hp || 0), 0, PX.maxHp(p)); p.re = clamp(p.re + (re || 0), 0, PX.maxRe(p)); };
  PX.owned = (p, type) => Object.keys(p.inventory).filter(i => p.inventory[i] > 0 && ITEMS[i].type === type);
  PX.useItem = (p, id) => {
    const it = ITEMS[id]; if (it.type !== 'consumable' || !(p.inventory[id] > 0)) return "Can't use that.";
    p.inventory[id]--; PX.heal(p, it.use.hp, it.use.re); return 'Used ' + it.name + '.';
  };
  PX.clock = { total: 3 * 60 + 14 };
  const C = PX.clock;
  Object.defineProperties(C, {
    day: { get: () => Math.floor(C.total / 1440) + 1 }, hour: { get: () => (C.total % 1440) / 60 },
    text: { get: () => { const m = Math.floor(C.total % 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); } },
    isNight: { get: () => C.hour >= 20 || C.hour < 6 },
  });
  C.pass = m => { C.total += m; };
  C.sleepUntil = h => { let t = Math.floor(C.total / 1440) * 1440 + h * 60; if (t <= C.total) t += 1440; C.total = t; };
  PX.darkness = () => { const h = C.hour; if (h >= 21 || h < 5) return 1; if (h >= 5 && h < 7.5) return 1 - (h - 5) / 2.5; if (h >= 18 && h < 21) return (h - 18) / 3; return 0; };

  // ------------------------------------------------------------------ run state (saved)
  PX.newRun = () => { PX.P = PX.newPlayer(); PX.flags = { visited_bedroom: true }; PX.stock = { fridge: { rice: 4, egg: 6, vegetable: 3, tea_leaves: 2, coffee_beans: 2 } }; PX.clock.total = 3 * 60 + 14; PX.where = { room: 'bedroom', x: 8, y: 6, facing: 'down' }; PX.playTime = 0; };
  PX.newRun();
  PX.SLOT = 'px_save_1';
  PX.hasSave = () => !!store.get(PX.SLOT, null);
  PX.save = () => { store.set(PX.SLOT, { P: PX.P, flags: PX.flags, stock: PX.stock, clock: C.total, where: PX.where, playTime: PX.playTime, at: Date.now() }); };
  PX.load = () => { const s = store.get(PX.SLOT, null); if (!s) return false; PX.P = s.P; PX.flags = s.flags; PX.stock = s.stock; C.total = s.clock; PX.where = s.where; PX.playTime = s.playTime || 0; return true; };

})();
