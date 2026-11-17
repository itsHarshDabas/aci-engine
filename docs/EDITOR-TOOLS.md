# Creative tools in the editor

Everything here is a plugin in `editor/panels/` (loaded by the shell through `ACIEditor`), plus `modules/environments.js` and the project templates. Nothing needs a build step.

## Tile painter (`tile-painter.js`)

A scene tool ("Paint tiles", key **B**) and a **Tiles** panel on the left.

* Tools: Brush `1`, Rectangle `2`, Fill `3`, Erase `4`, Pick `5`. `[` and `]` change the brush size (1–8).
* Every stroke is one undo step. The map grows when you paint outside it, and the document stays cropped to what you drew.
* **Layers**: each layer is one entry in `scene.tilemaps` (`{name, rows, legend, x, y}`). Add, rename, hide, delete.
* **Tiles**: a library of 14 ready-made tiles (wall, tree, water, door, spikes…). Pick one and paint, or type any character. Per tile: colour, **Solid** (blocks movement) and **Trigger** (overlaps but never blocks).
* *Show collision* tints solid tiles red and triggers blue in the scene view.

## Sprite painter (`sprite-painter.js`)

Opens for `assets/*.aci.json`. Draw with characters and colours: Draw `P`, Line `L`, Box `R` (Shift = filled), Fill `F`, Erase `E` (or right-click), Pick `I`, Type `T`. Frames strip (add, duplicate, delete, drag to reorder), several animations per sprite, onion skin, mirror, resize, FPS, live preview, `Ctrl+Z` / `Ctrl+Y`. "Colour only" and "Character only" modes recolour without redrawing.

## Animation timeline (`timeline.js`, bottom dock)

Select an entity with a sprite asset. Click a frame to scrub it in the scene view, **Play** to preview, drag frames to reorder, duplicate / delete frames, change FPS, add animations, or jump to the sprite painter. Edits are written to the asset file and are undoable.

## Importer (`importer.js`)

`Picture, GIF or video → ASCII` shows a dialog with a live preview and the converter's options (size presets, style, characters, colour, dithering, contrast, brightness, gamma, invert, auto levels). Result: `assets/<name>.aci.json`. GIFs and videos become animated sprites. A second importer turns a `.txt` file into a sprite (`---` on its own line separates frames). Cancelling rejects with an error whose `cancelled` is `true`.

## Environments (`modules/environments.js`)

Beginner-friendly backgrounds: `grass`, `pond`, `night`, `ocean`, `desert`, `dungeon`, `space`, `solid`.

```js
ACI.environments.list()                          // [{id, title, description, params}] -> build the dropdown + form from params
ACI.environments.defaults('ocean')               // { deep, light, foam, speed, choppy }
game.layer(ACI.environments.get('ocean').layer({ speed: 2 }), -100)   // what the player does for scene.environment
ACI.environments.apply(game, { preset: 'pond', params: {} })          // same, returns { remove() }
ACI.environments.register('lava', { title, description, params:{ color:{type:'color',default:'#f50'} }, layer: p => (x, y, t, game) => [char, colour, bg?] })
```
`layer(params)` fills in defaults itself. Presets that need a `water` mask (`pond`, `ocean`) create it the first time the layer runs, so reflections just work. Param types: `number` (min/max/step), `boolean`, `color`, `select` (options), `string`.

## Project templates (`templates/`)

| id | What you get |
| --- | --- |
| `empty` | One hero on a dotted stage |
| `top-down-adventure` | Village with a pond, trees, a wandering neighbour, coins, and a house you can enter (2 scenes) |
| `platformer` | Gravity, platforms, coins, spikes, patrolling slimes, goal flag, win scene |
| `space-shooter` | Invaders fleet, shooting, bombs, win / game-over scenes, with three small scripts to read |
| `night-forest` | Large scrolling forest, fireflies to collect, wisps that chase you, win scene |

They are real project folders (`aci.project.json`, `scenes/`, `assets/`, `scripts/`) built only from the built-in behaviours plus `scripts/ScoreText.js` (score in the corner and a goal), and for the shooter `ShipControl.js` and `Invader.js`. Regenerate them with `node tools/make-templates.js`; edit the art and layouts in that file.

## Testing panels without the shell

Open `test/editor-panels-mock.html` in a browser (served over the same origin as the files, e.g. `http://localhost:7777/test/editor-panels-mock.html`). It provides a minimal `ACIEditor` and `ed`, so the panels can be tried and scripted (`__tools`, `__panels`, `__assetEditors`, `__importers`, `__ed`).
