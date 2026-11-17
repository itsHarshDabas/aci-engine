# Animation module (`modules/anim.js`)

Load it after `aci.js`. It installs itself on every game, so these are just there:
`game.tween`, `game.animate`, `game.burst`, `game.emitter`, `game.floatText`, `game.fx.text`, `game.shake`, `game.transition`, `game.flash`, `game.trail`, `game.after`, `game.wait`, `game.every`.
Static helpers live on `ACI.anim`: `sprite`, `frames`, `sheet`, `mirror`, `recolor`, `ease`, `hsl`.

## Frame sprites

```js
ACI.anim.sprite({ idle: '...---...', walk: '...' }, { color, colors, palette, fps })
```
* Frames are separated by a line of dashes (`---`). Each frame keeps its indentation; all frames are padded to one size.
* `colors` has the same shape as the art; each letter is a key into `palette`.
* Inside a `String.raw` template, **don't end a line with `\` right before the closing backtick** — put the closing backtick on its own line.

**Sprite sheets** (one block of art, cut into a grid):
```js
ACI.anim.sheet(art, { frameW: 5, frameH: 3, anims: { idle: [0], run: [1, 2, 3, 4] }, fps: 10 })
```
**Helpers:** `ACI.anim.mirror(sprite)` (flip left↔right, swaps `/ \ ( )`), `ACI.anim.recolor(sprite, (cell, x, y, frame, anim) => '#hex')`.

## Playing animations

```js
game.animate(entity, 'attack', {
  loop: false,          // play once (default true)
  then: 'idle',         // switch to this (looping) when done
  pingpong: true,       // 0 1 2 3 2 1 0 …
  fps: 12,              // override the sprite's speed
  restart: false,       // don't restart if it is already playing
  onEnd: e => {},       // called when a non-looping animation finishes
  onFrame: { 2: e => hitEnemy() },   // run code on a specific frame (e.g. the sword swing)
});
```

## Tweens, timers, async/await

```js
game.tween(hero, { x: 40, y: '+=3', tint: '#ff0000' }, 0.8, { ease: 'outBack', delay: 0.2, yoyo: true, repeat: 2, onUpdate, onDone });
await game.tween(box, { y: 20 }, 0.5, { ease: 'outBounce' });   // tweens, timers and transitions can be awaited
await game.wait(1.5);
game.after(2, () => spawnBoss());
const t = game.every(0.5, () => spawnCoin());  t.cancel();
```
* Values: numbers, relative strings (`'+=5'`, `'-=2'`) and `#hex` colours.
* Tween any object, not just entities: `game.tween(state, { volume: 0 }, 2)`.
* Easings: `linear inQuad outQuad inOutQuad inCubic outCubic inOutCubic inSine outSine inOutSine inBack outBack outElastic outBounce` and `'steps(6)'` for a chunky, frame-by-frame feel (very ASCII).
* A tween returns a handle with `.cancel()` and `.finish()`.

## Particles

```js
game.burst(x, y, 'explosion');                 // one puff
game.burst(x, y, 'confetti', { count: 120 });  // override any option
const fire = game.emitter({ preset: 'fire', x: 40, y: 20, rate: 30 });   // continuous
game.emitter({ preset: 'dust', follow: hero, offset: [1, 3], rate: 14 });   // glued to an entity
game.emitter({ preset: 'rain', area: { x: 0, y: -1, w: 100, h: 1 }, rate: 90 });   // spawn anywhere in a box
game.floatText(x, y, '+10', { color: '#ffd24a' });   // rising numbers
fire.stop(); fire.start(); fire.remove(); fire.x = 10;
```
Presets: `explosion spark hit smoke fire sparkle confetti dust pickup heal bubbles rain snow embers`.

Make your own — an option object works anywhere a preset name does:
```js
game.burst(x, y, {
  count: 20, chars: '*+.',            // characters; they change over the particle's life (or charMode:'random')
  colors: ['#fff', '#fa0', '#400'],   // gradient over life (or colorMode:'random')
  speed: [4, 12], angle: [0, 360],    // cells/sec, degrees (0 = right, 90 = up)
  life: [0.3, 0.8], gravity: 6, drag: 2, spread: 1, wobble: 0,
  floor: 30, bounce: 0.5,             // bounce off a row
});
```
Coordinates are **world** cells, so particles scroll with the camera.

## Text effects

```js
const t = game.fx.text(x, y, 'GAME OVER', { effects: ['typewriter', 'rainbow', 'wave'], center: true, cps: 30, ttl: 4 });
t.set('NEW TEXT');  t.remove();  t.done();
```
Effects: `typewriter wave rainbow shake blink pulse` (combine freely; `amp`, `speed`, `freq`, `color2` tune them).

## Screen effects

```js
game.shake(4, 0.4);                                       // amount, seconds
await game.transition({ type: 'iris', dir: 'out', dur: 0.7 });   // fade | wipe | iris | dissolve | blinds
await game.transition({ type: 'iris', dir: 'in',  dur: 0.7 });
game.flash(entity, '#ffffff', 0.2);                       // blink an entity to a colour
```
A transition stays covering the screen after `'out'` until you run `'in'`. Effects are drawn at the end of the frame, **before** your own `onDraw` callbacks, so a HUD you draw yourself stays on top of shakes and transitions. Draw HUDs with `game.screen.text(...)` so they ignore the camera.

## Agent commands

With a game loaded, agents can use: `burst`, `floatText`, `shake`, `tween`, `animate`, `emitter`, `stopEmitter`, `transition`, `fxText`. Send `{"op":"help"}` for exact arguments.
