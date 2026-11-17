#!/usr/bin/env node
/*  Regenerates templates/<id>/ (the starter projects shown in "New project").
 *    node tools/make-templates.js
 *  Each template is a real project folder: aci.project.json, scenes/*.scene.json, assets/*.aci.json, scripts/*.js.
 *  Edit the art and scene layouts here, then re-run.  (Or open a template in the editor and change it there.)  */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = undefined;
require(path.join(root, 'aci.js')); require(path.join(root, 'modules', 'anim.js'));
const A = ACI.anim;

// ------------------------------------------------------------------ art
const art = {};
const def = (name, anims, o) => { const s = A.sprite(anims, o); art[name] = ACI.toAsset(s, name); };
const P = { s: '#ffd9a8', c: '#4aa8ff', b: '#4a78ff', l: '#8a9ad8', r: '#ff6b6b', g: '#6bf0a0', y: '#ffd24a', w: '#ffffff', p: '#ff8ac0', o: '#ffa040', n: '#b07a48' };
def('hero', {
  idle: ' o\n/|\\\n/ \\\n---\n o\n/|\\\n/ \\',
  walk: ' o\n/|\\\n/ \\\n---\n o\n/|\\\n |\\\n---\n o\n/|\\\n/ \\\n---\n o\n/|\\\n/|',
}, { fps: 7, palette: P, colors: { idle: ' s\ncbc\nl l\n---\n s\ncbc\nl l', walk: ' s\ncbc\nl l\n---\n s\ncbc\n lb\n---\n s\ncbc\nl l\n---\n s\ncbc\nl l' }, color: '#cfe' });
def('npc', { idle: ' O\n/#\\\n/ \\\n---\n O\n\\#/\n/ \\' }, { fps: 2, palette: P, colors: ' p\nrrr\nl l\n---\n p\nrrr\nl l', color: '#ff8ac0' });
def('coin', { idle: 'o\n---\nO\n---\n0\n---\nO' }, { fps: 6, color: '#ffd24a' });
def('slime', { idle: ' __\n(oo)\n---\n .--.\n(oo)' }, { fps: 3, color: '#6bf0a0' });
def('spike', { idle: '^^^' }, { color: '#ff5566' });
def('flag', { idle: '|>\n|\n|\n---\n|)\n|\n|' }, { fps: 3, color: '#ffd24a' });
def('door', { idle: '.-.\n|+|\n| |' }, { color: '#c09050' });
def('ship', { idle: '  /^\\\n /###\\\n |_^_|\n---\n  /^\\\n /###\\\n |_v_|' }, { fps: 8, color: '#7fe3ff' });
def('invader1', { idle: ' /oo\\\n<|##|>\n /  \\\n---\n /oo\\\n<|##|>\n \\  /' }, { fps: 2, color: '#ff6b9a' });
def('invader2', { idle: ' _/\\_\n(o  o)\n /vv\\\n---\n _/\\_\n(o  o)\n \\^^/' }, { fps: 2, color: '#ffd24a' });
def('invader3', { idle: '[o_o]\n /|\\\n---\n[o_o]\n \\|/' }, { fps: 2, color: '#6bf0a0' });
def('bullet', { idle: '!' }, { color: '#ffffff' });
def('bomb', { idle: ':\n---\n;' }, { fps: 6, color: '#ff5566' });
def('firefly', { idle: '.*.\n---\n-*-\n---\n+*+' }, { fps: 5, color: '#e8ff7a' });
def('wisp', { idle: ' .-.\n( o )\n \'-\'\n---\n .-.\n( O )\n \'-\'\n---\n .~.\n( o )\n \'~\'' }, { fps: 6, color: '#7ff0e0' });
def('campfire', { idle: ' ( \n(^)\n^^^\n---\n )\n(^)\n^^^' }, { fps: 6, color: '#ff8a30' });
const treeTile = { char: '♣', color: '#2f9a4a', solid: true };

// ------------------------------------------------------------------ scene helpers
let nid = 1;
const ent = (name, asset, x, y, o = {}) => Object.assign({ id: nid++, name, x, y, z: 0, tags: [], sprite: typeof asset === 'string' && asset.startsWith('text:') ? asset.slice(5) : { asset } }, o);
const text = (name, s, x, y, color) => { const e = ent(name, 'text:' + s, x, y, { z: 20, reflect: false }); e.spriteOpts = { color: color || '#ffffff' }; return e; };
const scene = (name, o) => Object.assign({ format: 'aci-scene', v: 1, name, world: { cols: 80, rows: 30 }, environment: { preset: 'none', params: {} }, gravity: 0, camera: {}, tilemaps: [], entities: [] }, o);
const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill(' '));
const rows = g => g.map(r => r.join(''));
const rect = (g, x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y] && x >= 0 && x < g[0].length) g[y][x] = ch; };
const hero = (x, y, o = {}) => ent('hero', 'hero', x, y, Object.assign({ tags: ['player'], solid: true, reflect: true, behaviours: [{ name: 'TopDownMove', params: { speed: 14 } }, { name: 'CameraFollow', params: {} }] }, o));
const hud = (o = {}) => ent('hud', 'text:Coins 0', 1, 0, { z: 100, reflect: false, spriteOpts: { color: '#ffd24a' }, behaviours: [{ name: 'ScoreText', params: Object.assign({ label: 'Coins' }, o) }] });

const scripts = {
  'ScoreText.js': `// Shows "Label n" in the top-left corner of the screen and can send the player to a scene when the score is reached.
// Add it to any entity (a one-letter text sprite is fine). State key "score" is what the Collectible behaviour adds to.
ACI.behaviour('ScoreText', {
  title: 'Score Text', description: 'Shows the score in the corner; optionally jumps to a scene at a goal',
  params: {
    label: { type: 'string', default: 'Score', label: 'Label' },
    stateKey: { type: 'string', default: 'score', label: 'State key' },
    reset: { type: 'boolean', default: false, label: 'Reset to 0 when the scene starts' },
    goal: { type: 'number', default: 0, min: 0, max: 9999, label: 'Goal (0 = none)' },
    goalScene: { type: 'scene', default: '', label: 'Go to scene at goal' },
  },
  start(e, game, p) { if (p.reset) game.state[p.stateKey] = 0; e._last = null; },
  update(e, dt, game, p) {
    const n = Number(game.state[p.stateKey]) || 0;
    if (n !== e._last) { e._last = n; e.setSprite(ACI.sprite(p.label + ' ' + n + (p.goal ? ' / ' + p.goal : ''), { color: '#ffd24a' })); }
    e.x = game.camera.x + 1; e.y = game.camera.y; // stick to the screen corner
    if (p.goal && n >= p.goal && p.goalScene && !e._won) { e._won = true; game.goto(p.goalScene, null, { transition: 'fade' }); }
  },
});
`,
  'ShipControl.js': `// The player's ship: left/right (arrows or A/D) and fire with Space. Clear every invader to win.
ACI.behaviour('ShipControl', {
  title: 'Ship Control', description: 'Move left/right and fire with Space',
  params: {
    speed: { type: 'number', default: 38, min: 0, max: 120, label: 'Speed' },
    cooldown: { type: 'number', default: 0.28, min: 0.05, max: 2, label: 'Fire delay (s)' },
    bullet: { type: 'asset', default: 'bullet', label: 'Bullet sprite' },
    winScene: { type: 'scene', default: 'win', label: 'Scene when all invaders are gone' },
  },
  start(e, game) { e._cd = 0; game.state.score = 0; },
  update(e, dt, game, p) {
    const mv = (game.key('ArrowRight', 'd') ? 1 : 0) - (game.key('ArrowLeft', 'a') ? 1 : 0);
    e.x = Math.max(1, Math.min(game.cols - e.w - 1, e.x + mv * p.speed * dt));
    e._cd -= dt;
    if (game.key(' ') && e._cd <= 0) {
      e._cd = p.cooldown;
      const spr = (game.assets && game.assets[p.bullet]) || ACI.sprite('!');
      game.add(spr, { x: e.x + e.w / 2 - 0.5, y: e.y - 1, tags: ['bullet'], update(dt, b, G) {
        b.y -= 30 * dt; if (b.y < -2) return G.remove(b);
        for (const i of G.entities) if (i.tags && i.tags.includes('invader') && !i._dead && b.x >= i.x && b.x < i.x + i.w && b.y >= i.y && b.y < i.y + i.h) {
          i._dead = true; G.state.score = (G.state.score || 0) + 10;
          if (G.burst) G.burst(i.x + i.w / 2, i.y + 1, 'explosion', { count: 16 });
          G.remove(i); G.remove(b); break;
        }
      } });
    }
    if (!game.entities.some(i => i.tags && i.tags.includes('invader')) && !e._won) { e._won = true; game.goto(p.winScene, null, { transition: 'fade' }); }
  },
});
`,
  'Invader.js': `// An invader. The whole fleet marches together: sideways, dropping a row at each edge, and speeds up as it thins out.
ACI.behaviour('Invader', {
  title: 'Invader', description: 'Marches with the fleet and drops bombs',
  params: {
    speed: { type: 'number', default: 5, min: 0, max: 40, label: 'March speed' },
    bombEvery: { type: 'number', default: 3, min: 0.5, max: 20, label: 'A bomb falls about every (s)' },
    loseScene: { type: 'scene', default: 'gameover', label: 'Scene when the invaders land' },
  },
  start(e, game) { game.state._dir = 1; },
  update(e, dt, game, p) {
    const fleet = game.entities.filter(i => i.tags && i.tags.includes('invader'));
    if (game._fleetT !== game.time) { // the first invader this frame steps the whole fleet
      game._fleetT = game.time;
      let dir = game.state._dir || 1, edge = false;
      for (const i of fleet) if ((dir > 0 && i.x + i.w >= game.cols - 1) || (dir < 0 && i.x <= 1)) edge = true;
      if (edge) { dir = -dir; game.state._dir = dir; for (const i of fleet) i.y += 2; }
      const go = dir * (p.speed + (40 - Math.min(40, fleet.length)) * 0.25) * dt;
      for (const i of fleet) i.x += go;
      if (Math.random() < dt / (p.bombEvery / Math.max(1, fleet.length / 6))) {
        const b = fleet[Math.floor(Math.random() * fleet.length)];
        const spr = (game.assets && game.assets.bomb) || ACI.sprite(':');
        game.add(spr, { x: b.x + b.w / 2, y: b.y + b.h, tags: ['bomb'], update(dt, m, G) {
          m.y += 13 * dt; if (m.y > G.rows) return G.remove(m);
          const s = G.entities.find(o => o.tags && o.tags.includes('player'));
          if (s && m.x >= s.x && m.x < s.x + s.w && m.y >= s.y && m.y < s.y + s.h) { if (G.shake) G.shake(4, 0.4); G.goto(p.loseScene, null, { transition: 'fade' }); }
        } });
      }
    }
    const ship = game.entities.find(o => o.tags && o.tags.includes('player'));
    if (ship && e.y + e.h >= ship.y && !game._lost) { game._lost = true; game.goto(p.loseScene, null, { transition: 'fade' }); }
  },
});
`,
};

// ------------------------------------------------------------------ templates
const T = {};

// ---- 1. Empty
T['empty'] = { meta: { name: 'Empty', description: 'A dark stage and one hero you can walk around. Start from here and build up.', tags: ['beginner', 'blank'] }, bg: '#0a0e1a', assets: ['hero'], scenes: {
  main: scene('main', { world: { cols: 80, rows: 30 }, environment: { preset: 'solid', params: { texture: 'dots' } }, camera: { follow: 'hero' }, entities: [hero(38, 13, { behaviours: [{ name: 'TopDownMove', params: { speed: 16 } }] }), text('hint', 'Move with the arrow keys or WASD. Press Stop, then add things in the Hierarchy.', 6, 4, '#7a8bb0')] }),
} };

// ---- 2. Top-down adventure
{
  nid = 1; const W = 140, H = 60;
  const trees = grid(W, H);
  const keepOut = (x, y) => (Math.hypot((x - 70) * 0.55, y - 33) < 16 * 0.55 + 6) || (x > 98 && x < 124 && y > 8 && y < 26) || (x < 40 && y > 20 && y < 38);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { if (!keepOut(x, y) && ACI.hash(x, y, 31) > 0.975 - (ACI.fbm(x * 0.06, y * 0.12, 5) > 0.62 ? 0.12 : 0)) trees[y][x] = 'T'; }
  const house = [
    '##############', '#            #', '#            #', '#            #', '#            #', '#####    #####'];
  const houseMap = { name: 'House', rows: house, legend: { '#': { char: '█', color: '#9a6a48', solid: true } }, x: 105, y: 12 };
  const coins = [[24, 31], [34, 36], [48, 22], [92, 45], [60, 50], [110, 36], [20, 14], [84, 14]].map(([x, y], i) => ent('coin' + (i + 1), 'coin', x, y, { reflect: false, behaviours: [{ name: 'Bob', params: { amplitude: 0.6, speed: 3 } }, { name: 'Collectible', params: { value: 1 } }] }));
  const main = scene('main', { world: { cols: W, rows: H }, environment: { preset: 'pond', params: { size: 0.15, grass: '#2f7d46' } }, camera: { follow: 'hero' },
    tilemaps: [{ name: 'Trees', rows: rows(trees), legend: { T: treeTile }, x: 0, y: 0 }, houseMap],
    entities: [hero(20, 30), ent('Mira', 'npc', 30, 26, { tags: ['npc'], behaviours: [{ name: 'Wander', params: { speed: 3 } }, { name: 'SayOnClick', params: { text: 'Welcome! Click things, collect coins, and peek into the house.' } }] }),
      ent('house door', 'door', 108 + 1, 16, { trigger: true, behaviours: [{ name: 'DoorToScene', params: { scene: 'house', transition: 'fade' } }] }),
      text('house label', 'HOUSE', 109, 10, '#c09050'), ...coins, hud()] });
  const hw = grid(40, 16); rect(hw, 0, 0, 39, 0, '#'); rect(hw, 0, 15, 39, 15, '#'); rect(hw, 0, 0, 0, 15, '#'); rect(hw, 39, 0, 39, 15, '#');
  const houseScene = scene('house', { world: { cols: 60, rows: 24 }, environment: { preset: 'dungeon', params: { stone: '#7a6a5a' } }, camera: { follow: 'hero' },
    tilemaps: [{ name: 'Walls', rows: rows(hw), legend: { '#': { char: '█', color: '#9a6a48', solid: true } }, x: 10, y: 4 }],
    entities: [hero(28, 15), ent('Sage', 'npc', 24, 9, { tags: ['npc'], behaviours: [{ name: 'SayOnClick', params: { text: 'Nothing here but dust... and wisdom.' } }] }),
      ent('exit', 'door', 28, 18, { trigger: true, behaviours: [{ name: 'DoorToScene', params: { scene: 'main', transition: 'fade' } }] }), text('exit label', 'EXIT', 29, 17, '#c09050'),
      ent('coin', 'coin', 36, 8, { reflect: false, behaviours: [{ name: 'Bob', params: {} }, { name: 'Collectible', params: {} }] }), hud()] });
  T['top-down-adventure'] = { meta: { name: 'Top-down adventure', description: 'A village with a pond, a friendly neighbour, coins to collect and a house you can walk into.', tags: ['rpg', 'scrolling', 'two scenes'] }, bg: '#0a0e1a', assets: ['hero', 'npc', 'coin', 'door'], scripts: ['ScoreText.js'], scenes: { main, house: houseScene } };
}

// ---- 3. Platformer
{
  nid = 1; const W = 160, H = 40;
  const g = grid(W, H); rect(g, 0, 34, W - 1, H - 1, '#'); rect(g, 0, 0, 0, 33, '#'); rect(g, W - 1, 0, W - 1, 33, '#');
  const plats = [[14, 22, 28], [28, 36, 24], [40, 52, 29], [58, 66, 22], [70, 80, 27], [86, 96, 22], [100, 110, 28], [116, 124, 23], [130, 140, 29]];
  plats.forEach(([a, b, y]) => rect(g, a, y, b, y, '='));
  const coins = plats.flatMap(([a, b, y], i) => [ent('coin' + i + 'a', 'coin', a + 2, y - 2, { reflect: false, behaviours: [{ name: 'Bob', params: { amplitude: 0.5, speed: 4 } }, { name: 'Collectible', params: {} }] }), ent('coin' + i + 'b', 'coin', b - 2, y - 2, { reflect: false, behaviours: [{ name: 'Bob', params: { amplitude: 0.5, speed: 4 } }, { name: 'Collectible', params: {} }] })]);
  const hz = [50, 84, 120].map((x, i) => ent('spikes' + (i + 1), 'spike', x, 33, { reflect: false, behaviours: [{ name: 'Hazard', params: {} }] }));
  const slimes = [62, 104].map((x, i) => ent('slime' + (i + 1), 'slime', x, 32, { reflect: false, tags: ['enemy'], behaviours: [{ name: 'Patrol', params: { distance: 9, speed: 4 } }, { name: 'Hazard', params: {} }] }));
  const main = scene('main', { world: { cols: W, rows: H }, gravity: 60, environment: { preset: 'night', params: { sky: '#0a1030' } }, camera: { follow: 'hero' },
    tilemaps: [{ name: 'Level', rows: rows(g), legend: { '#': { char: '▓', color: '#6b7a9a', solid: true }, '=': { char: '=', color: '#b0643c', solid: true } }, x: 0, y: 0 }],
    entities: [ent('hero', 'hero', 4, 31, { tags: ['player'], solid: true, friction: 14, behaviours: [{ name: 'PlatformerMove', params: { speed: 16, jump: 26 } }, { name: 'CameraFollow', params: {} }] }), ...coins, ...hz, ...slimes,
      ent('goal', 'flag', 152, 31, { reflect: false, behaviours: [{ name: 'DoorToScene', params: { scene: 'win', transition: 'fade' } }] }), text('goal label', 'GOAL', 151, 29, '#ffd24a'),
      text('help', 'Arrows / WASD to run, Space to jump. Spikes and slimes restart the level.', 3, 26, '#7a8bb0'), hud({ reset: true })] });
  const wg = grid(60, 24); rect(wg, 0, 20, 59, 23, '#');
  const win = scene('win', { world: { cols: 60, rows: 24 }, gravity: 60, environment: { preset: 'night', params: {} }, camera: {}, tilemaps: [{ name: 'Floor', rows: rows(wg), legend: { '#': { char: '▓', color: '#6b7a9a', solid: true } }, x: 0, y: 0 }],
    entities: [ent('hero', 'hero', 6, 17, { tags: ['player'], solid: true, friction: 14, behaviours: [{ name: 'PlatformerMove', params: { speed: 16, jump: 26 } }] }), text('title', 'YOU WIN!', 26, 6, '#ffd24a'), text('sub', 'Walk into the sign to play again', 20, 9, '#9ab'),
      ent('again', 'text:[ play again ]', 38, 19, { reflect: false, spriteOpts: { color: '#4fd07a' }, behaviours: [{ name: 'DoorToScene', params: { scene: 'main', transition: 'wipe' } }] }), hud()] });
  T['platformer'] = { meta: { name: 'Platformer', description: 'Run and jump across platforms, grab coins, dodge spikes and slimes, and reach the flag.', tags: ['platformer', 'physics', 'scrolling'] }, bg: '#0a1030', assets: ['hero', 'coin', 'spike', 'slime', 'flag'], scripts: ['ScoreText.js'], scenes: { main, win } };
}

// ---- 4. Space shooter
{
  nid = 1; const W = 80, H = 34;
  const inv = []; const kinds = ['invader1', 'invader2', 'invader3', 'invader3'];
  kinds.forEach((k, r) => { for (let c = 0; c < 6; c++) inv.push(ent('invader-' + r + '-' + c, k, 12 + c * 10, 3 + r * 4, { tags: ['invader'], reflect: false, behaviours: [{ name: 'Invader', params: {} }] })); });
  const main = scene('main', { world: { cols: W, rows: H }, environment: { preset: 'space', params: { nebulaAmount: 0.22 } }, camera: {}, entities: [ent('ship', 'ship', 37, H - 5, { tags: ['player'], reflect: false, behaviours: [{ name: 'ShipControl', params: {} }] }), ...inv, ent('hud', 'text:Score 0', 1, 0, { z: 100, reflect: false, behaviours: [{ name: 'ScoreText', params: { label: 'Score' } }] }), text('help', 'Arrows / A D to move, Space to fire', 22, H - 1, '#556')] });
  const end = (name, title, color) => scene(name, { world: { cols: W, rows: H }, environment: { preset: 'space', params: { nebulaAmount: 0.22 } }, camera: {}, entities: [text('title', title, 32, 12, color), text('score', 'Score', 36, 15, '#9ab'), ent('hud', 'text:Score 0', 1, 0, { z: 100, reflect: false, behaviours: [{ name: 'ScoreText', params: { label: 'Score' } }] }),
    ent('again', 'text:[ press the ship to play again ]', 20, 20, { reflect: false, spriteOpts: { color: '#4fd07a' }, behaviours: [{ name: 'DoorToScene', params: { scene: 'main', transition: 'wipe' } }] }), ent('pilot', 'ship', 37, 22, { tags: ['player'], reflect: false, behaviours: [{ name: 'Bob', params: { amplitude: 0.5, speed: 3 } }] })] });
  T['space-shooter'] = { meta: { name: 'Space shooter', description: 'Defend the screen: a fleet of invaders marches down. Move, shoot, win. Includes three small behaviour scripts to learn from.', tags: ['arcade', 'scripts'] }, bg: '#03040a', assets: ['ship', 'invader1', 'invader2', 'invader3', 'bullet', 'bomb'], scripts: ['ScoreText.js', 'ShipControl.js', 'Invader.js'], scenes: { main, win: end('win', 'YOU SAVED EARTH', '#ffd24a'), gameover: end('gameover', 'GAME OVER', '#ff5566') } };
}

// ---- 5. Night forest
{
  nid = 1; const W = 180, H = 70;
  const trees = grid(W, H);
  const keepOut = (x, y) => Math.hypot((x - 40) * 0.55, y - 35) < 7;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!keepOut(x, y) && ACI.hash(x, y, 77) > 0.972 - (ACI.fbm(x * 0.07, y * 0.14, 9) > 0.6 ? 0.1 : 0)) trees[y][x] = 'T';
  const flies = []; for (let i = 0; i < 14; i++) { let x, y, tries = 0; do { x = 8 + Math.floor(ACI.hash(i, 1, 3) * (W - 16)) + tries; y = 5 + Math.floor(ACI.hash(i, 2, 3) * (H - 10)); tries++; } while (trees[y][x] === 'T' && tries < 20); flies.push(ent('firefly' + (i + 1), 'firefly', x, y, { tags: ['firefly'], reflect: false, behaviours: [{ name: 'Bob', params: { amplitude: 1.2, speed: 2 } }, { name: 'Collectible', params: {} }] })); }
  const wisps = [[100, 20], [130, 50], [70, 58]].map(([x, y], i) => ent('wisp' + (i + 1), 'wisp', x, y, { z: 3, reflect: false, tags: ['enemy'], behaviours: [{ name: 'Follow', params: { target: 'player', speed: 5, stopDistance: 0 } }, { name: 'Hazard', params: {} }] }));
  const main = scene('main', { world: { cols: W, rows: H }, environment: { preset: 'grass', params: { grass: '#1f6b3d', dark: '#06160d', flowers: false, wind: 1.2 } }, camera: { follow: 'hero' },
    tilemaps: [{ name: 'Trees', rows: rows(trees), legend: { T: treeTile }, x: 0, y: 0 }],
    entities: [hero(44, 37, { behaviours: [{ name: 'TopDownMove', params: { speed: 15 } }, { name: 'CameraFollow', params: {} }] }), ent('campfire', 'campfire', 40, 35, { reflect: false }), ...flies, ...wisps,
      text('help', 'Catch 12 fireflies. Wisps send you back to camp.', 28, 31, '#7a8bb0'), hud({ label: 'Fireflies', reset: true, goal: 12, goalScene: 'win' })] });
  const win = scene('win', { world: { cols: 80, rows: 30 }, environment: { preset: 'night', params: {} }, camera: {}, entities: [text('title', 'THE FOREST IS LIT', 31, 12, '#ffd24a'), text('sub', 'Walk into the fire to go again', 25, 15, '#9ab'), ent('campfire', 'campfire', 38, 19, { reflect: false, trigger: true, behaviours: [{ name: 'DoorToScene', params: { scene: 'main', transition: 'fade' } }] }), hero(30, 19, { behaviours: [{ name: 'TopDownMove', params: { speed: 14 } }] })] });
  T['night-forest'] = { meta: { name: 'Night forest', description: 'A big dark forest to explore. Catch the fireflies, avoid the wisps, and find your way back to camp.', tags: ['exploration', 'scrolling', 'enemies'] }, bg: '#06160d', assets: ['hero', 'firefly', 'wisp', 'campfire'], scripts: ['ScoreText.js'], scenes: { main, win } };
}

// ------------------------------------------------------------------ write
const out = path.join(root, 'templates');
const wr = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof s === 'string' ? s : JSON.stringify(s, null, 1)); };
for (const id in T) {
  const t = T[id], dir = path.join(out, id);
  fs.rmSync(dir, { recursive: true, force: true });
  wr(path.join(dir, 'template.json'), t.meta);
  wr(path.join(dir, 'aci.project.json'), { aci: 'project', name: t.meta.name, version: '0.1.0', startScene: 'main', scenes: Object.keys(t.scenes).map(n => ({ name: n, file: 'scenes/' + n + '.scene.json' })), settings: { fontSize: 14, background: t.bg }, template: null, created: '2026-11-17T00:00:00.000Z' });
  for (const n in t.scenes) wr(path.join(dir, 'scenes', n + '.scene.json'), t.scenes[n]);
  (t.assets || []).forEach(a => wr(path.join(dir, 'assets', a + '.aci.json'), art[a]));
  (t.scripts || []).forEach(s => wr(path.join(dir, 'scripts', s), scripts[s]));
  console.log('wrote templates/' + id);
}
