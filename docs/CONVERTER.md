# Converter module (`modules/convert.js`)

Turns pictures, GIFs, video and webcams into ordinary ACI sprites. Load it after `aci.js`.

```js
const spr = await ACI.convert.load('cat.png', { cols: 60 });   // url, File, Blob or ArrayBuffer
game.add(spr, { x: 4, y: 2 });
```
`load()` looks at the file content, so a `.gif` gives an animated sprite and anything else goes through the browser's image decoder. The v0.1 call `ACI.fromImage(imgElement, opts)` still works and uses the new converter.

| Call | Returns |
| --- | --- |
| `ACI.convert.load(src, opts)` | Promise of a sprite (images, GIFs) |
| `ACI.convert.image(imgOrCanvasOrVideo, opts)` | Sprite, synchronously |
| `ACI.convert.gif(arrayBuffer, opts)` | Animated sprite (no DOM needed — also works in Node) |
| `ACI.convert.video(urlOrFile, { fps: 10, start, end, maxFrames: 150, onProgress })` | Promise of an animated sprite |
| `ACI.convert.webcam()` + `ACI.convert.liveLayer(video, opts)` | Live background layer: `game.layer(liveLayer(await webcam()), -10)` |
| `ACI.convert.fromPixels({data, width, height}, opts)` | A single raw frame `{w, h, cells}` |

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `cols` / `rows` | 60 / auto | Size in cells. Give one and the other follows the picture's shape; give both to fit inside the box. |
| `aspect` | 0.55 | Cell width ÷ height. Lower it if the result looks too wide. |
| `mode` | `'luma'` | `luma` (classic characters), `blocks` (half-blocks, **2× vertical detail**, photo-like), `braille` (dots, 2×4 per cell, fine line art), `edges` (outline with `\| / - \`) |
| `ramp` | `'standard'` | Characters from dark to bright. A name (`standard detailed blocks shade simple dots noir retro code line hash binary grass`), any string of your own, or `'text'` with `text: 'HELLO '` to build a picture out of words. |
| `color` | `true` | `true` real colours · `false` mono (use `tint`) · `'palette'` with `palette: 'gameboy'` (or an array of hex colours) · `'gradient'` with `gradient: [...]` |
| `bg` | `'none'` | `'color'` puts a dim version of each pixel's colour behind the glyph; or a hex colour. |
| `dither` | `'auto'` | `none floyd bayer atkinson`. `auto` = Floyd–Steinberg for stills and ordered (stable) for GIF / video. |
| `contrast` `brightness` `gamma` `saturation` | 1 / 0 / 1 / 1 | Tone controls. |
| `autoLevels` | false | Stretch the picture's range; a good first fix for flat photos. |
| `invert` / `onLight` | false | Invert the picture / reverse the ramp for dark-on-light output. |
| `colorLift` | 0.6 | Brighten dark colours so glyphs stay readable (0 turns it off). |
| `colorSteps` | 16 | Colour levels per channel. Fewer means chunkier and faster. |
| `alphaCut` | 0.1 | Pixels more transparent than this become empty cells. |
| `maxFrames`, `frameStep` | – | For GIFs: limit or thin out frames. |

Palettes: `gameboy cga c64 sepia matrix amber ice pico8 mono` (`ACI.convert.PALETTES`).
Pick characters by how much ink they use: `ACI.convert.sortByDensity('@#%*+=-:. ')`.

## Saving

```js
ACI.convert.toAsset(spr, 'cat')   // → .aci.json object (same format the asset editor reads)
ACI.convert.toText(spr)           // plain text      ACI.convert.toAnsi(spr)  // coloured text for a terminal
ACI.convert.toHTML(spr)           // <pre> snippet with colours
```
Load a saved sprite later with `ACI.loadAsset('cat.aci.json')`.

## Command line (no dependencies, GIF or PPM input)

```
node tools/aci-convert.js dance.gif --cols 48 --mode blocks --out dance.aci.json
node tools/aci-convert.js logo.gif --cols 60 --ansi
```
For PNG/JPEG use the browser tool `examples/booth.html`.

## Agents

`{"op":"convert","src":"data:image/png;base64,…","cols":40,"mode":"blocks","name":"portrait","x":4,"y":2}` creates the entity right away and fills in the picture when decoding finishes (check it with `describe`).

## Tips

* Photos: `mode: 'blocks'`, `autoLevels: true`, 60–100 columns.
* Logos and line art: `mode: 'braille'` or `'edges'`, `color: false`.
* Retro look: `ramp: 'blocks'`, `color: 'palette'`, `palette: 'gameboy'`, `dither: 'bayer'`.
* A GIF of 100 frames at 80 columns is fine; for video keep `fps` ≤ 10 and `cols` ≤ 80.
