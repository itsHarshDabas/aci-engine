# Physics, Tilemap, Scenes

Load after `aci.js` (and `plugin-shim.js`): `physics.js`, `tilemap.js`, `scenes.js`. They attach to every game made afterwards.

## Physics (cells, seconds)
```js
G.physics.gravity = 60;                                   // default 0
const hero = G.add(sprite, { x:3, y:5, vx:0, vy:0, solid:true, friction:12, tag:'player' });
if (hero.grounded && G.key(' ')) hero.vy = -30;           // jump
hero.onCollide = other => { /* other is null for tiles */ };
G.add(coinSprite, { x:9, y:4, trigger:true, onTrigger(o){ G.remove(this); } });  // no blocking
hero.hits('enemy')                                         // touching entity with that tag, or null
```
Props: `vx vy gravity friction drag bounce solid static trigger tag tags box:{x,y,w,h}`.
Moving things need `vx`, `vy`, `gravity` or `body:true`; `solid:true` makes them hit tiles and each other. Hitbox = non-blank cells.
Reads: `grounded hitCeiling hitWall`. Queries: `G.physics.at(x,y,tag)`, `.overlaps(a[,b])`, `.raycast(x1,y1,x2,y2,{tag,ignore})`,
`.moveAndCollide(e,dx,dy)`, `.withTag(t)`, `.step(dt)` (headless). `G.blocked` is set so `G.walker()/wanderer()` respect walls.

## Tilemap
```js
const map = G.tilemap(`
  ##########
  #P   c  E#
  ##########`, { '#': { color:'#8a6', solid:true }, '~': { char:['~','≈'], fps:3 } });
map.spawn('P', (x, y) => G.add(heroSprite, { x, y }));   // marker -> entity, tile cleared
map.solidAt(x, y); map.tileAt(x, y); map.get(x, y); map.set(x, y, ' ');
map.toJSON();  G.tilemap({ rows:[...], legend:{...} });  // .aci.json-like
```
World grows to fit the map; `map.offsetX/offsetY` = where tile (0,0) sits in the world. `G.tilemap.solidAt` asks all maps.

## Scenes, state, bus
```js
G.scene('play', { enter(g, data){...}, update(dt, g){...}, draw(g){...}, exit(g){...} });
G.goto('play', { level:2 }, { transition:'wipe', time:1 });  // 'fade' (default) | 'wipe' | 'none'
G.scene.current;   G.state.score = 0;   G.state.watch('score', (now, was) => {});
G.bus.on('boom', d => {});  G.bus.emit('boom', 1);
```
Entities, tilemaps, layers, watchers and bus listeners created during a scene vanish on exit (`persist:true` keeps an entity).
Use scene `update/draw`, not `G.onUpdate`, inside scenes. Demo: `demo-platformer.html`.

## Agent ops (`G.command({op:...})`)
`tilemap`: `{op:'tilemap', rows:['###','#.#'], legend:{'#':{solid:true}}}` creates; `{op:'tilemap', set:[{x:1,y:1,char:'#'}]}` edits; `{get:{x,y}}` reads.
`goto`: `{op:'goto', scene:'play', transition:'none'}`. `state`: `{op:'state', set:{score:3}}` (returns all state).
`physics`: `{op:'physics', gravity:40}` or `{op:'physics', name:'hero', vx:5, solid:true}` (per-entity gravity: `entityGravity`).
