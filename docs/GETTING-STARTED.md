# Getting started with ACI

ACI is a game engine where **everything on screen is a text character**: the ground, the hero, the explosions. There is nothing to install and no build step. If you can open an HTML file, you can make a game.

## 1. Your first game (2 minutes)

Save this as `mygame.html` next to `aci.js`, and open it in a browser:

```html
<div id="screen" style="position:fixed;inset:0"></div>
<script src="aci.js"></script>
<script src="modules/anim.js"></script>
<script>
  const game = ACI.game('#screen');

  // The ground is a function that runs for every cell, every frame.
  game.layer((x, y, t) => [Math.sin(x * 0.3 + t * 2) > 0 ? '/' : '|', '#3a7a4a']);

  // Art is just text. Spaces are transparent.
  const hero = game.add(ACI.sprite(String.raw`
 o
/|\
/ \
`), { x: 10, y: 8 });

  game.onUpdate(dt => {
    if (game.key('d', 'ArrowRight')) hero.x += 14 * dt;
    if (game.key('a', 'ArrowLeft'))  hero.x -= 14 * dt;
  });

  // Click for fireworks. `burst` comes from modules/anim.js.
  game.on('click', p => game.burst(p.x, p.y, 'explosion'));
</script>
```

You now have a scrolling grass field, a hero you can walk, and explosions on click.

## 2. The five ideas you need

| Idea | In code |
| --- | --- |
| **The screen is a grid of characters.** One cell = one character + one colour. | `game.put(x, y, '#', '#f80')`, `game.text(x, y, 'hi')` |
| **Art is text.** Draw with a template string, colour it with a second drawing if you like. | `ACI.sprite(art, { colors, palette })` |
| **Backgrounds are shaders.** A function from `(x, y, time)` to a character. | `game.layer(fn)` |
| **Things are entities.** Add a sprite, move `.x` / `.y`, change it in `onUpdate`. | `game.add(sprite, {x, y})` |
| **Effects are one-liners.** Particles, tweens, shake, transitions. | `game.burst`, `game.tween`, `game.shake` |

Coordinates are **cells**, not pixels. A cell is about twice as tall as it is wide, so moving `y` feels slower than moving `x` by the same amount (the examples multiply `y` speeds by about 0.55).

## 3. Animated characters

Frames are separated by a line of dashes. Every frame keeps its own indentation, so nothing jitters.

```js
const hero = ACI.anim.sprite({
  idle: String.raw`
 o
/|\
/ \
`,
  walk: String.raw`
 o
/|\
/ \
---
 o
/|\
 |\
---
 o
/|\
/ \
---
 o
/|\
/|
`,
}, { color: '#cfe', fps: 8 });

const e = game.add(hero, { x: 10, y: 8 });
game.animate(e, 'walk');                                  // loops
game.animate(e, 'attack', { loop: false, then: 'idle' }); // plays once, then goes back to idle
```

More in [ANIMATION.md](ANIMATION.md).

## 4. Turn any picture into ASCII

```html
<script src="modules/convert.js"></script>
<script>
  ACI.convert.load('cat.png', { cols: 60, mode: 'blocks' })   // also .gif → animated sprite
    .then(spr => game.add(spr, { x: 4, y: 2 }));
</script>
```

Open `examples/booth.html` to experiment: drop a file, move the sliders, and save the result as `.aci.json` or text. More in [CONVERTER.md](CONVERTER.md).

## 5. Examples to read (each is one file)

| File | Shows |
| --- | --- |
| `examples/invaders.html` | A full arcade game: animation, particles, shake, transitions, score |
| `examples/lantern.html` | A scrolling forest: camera, light, water reflection, emitters, wisps |
| `examples/fxlab.html` | Every effect on one screen, click to play with it |
| `examples/booth.html` | The image / GIF / webcam → ASCII converter with live controls |

## 6. Let an AI agent help

Agents drive a running game with plain JSON through `game.command({...})`. Type `{"op":"help"}` to list every command, including the effects (`burst`, `tween`, `animate`, `transition`, `fxText`, …) and `convert` for images.

```json
{ "agent": "artist",   "op": "spawn", "name": "lantern", "art": " _\n[*]\n |", "color": "#ffd27a", "x": 10, "y": 6 }
{ "agent": "director", "op": "burst", "x": 10, "y": 6, "preset": "sparkle" }
{ "agent": "director", "op": "tween", "name": "lantern", "props": { "y": 2 }, "dur": 1, "ease": "outBounce" }
```

## Troubleshooting

* **Blank page.** Open the browser console. The most common cause is a wrong path in a `<script src>`.
* **Sprite looks cut off or shifted.** Use `ACI.anim.sprite` for multi-frame art, and keep `---` on its own line.
* **Colours look washed out.** Dark colours on a dark background read as black. Try brighter colours, or raise `colorLift` when converting images.
* **`game.burst is not a function`.** Load `modules/anim.js` after `aci.js`.
* **Characters look uneven.** Use a monospace font; the engine measures the cell size from the letter `M`.
