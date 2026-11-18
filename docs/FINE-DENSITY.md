# High-res sprites and fine-density worlds

**Renderer** – `ACI.game(el, { renderer: 'auto' | 'canvas' | 'webgl' })`. `auto` (default) uses canvas 2D below 20,000 visible
cells (unchanged output) and a WebGL2 glyph-atlas renderer above that, falling back to canvas if WebGL2 is unavailable.
`game.renderer()` reports the active one. Cell size stays integer CSS pixels (`cellW`/`cellH`), so `toWorld`, `toScreen`,
and pointer cells are unchanged. A fine world is just a small `fontSize` (3-5 px gives 200-400 columns).

**High-res sprites** – `sprite.res` = 1 (default) / 2 / 4 / 8: the sprite's cells are 1/res of a world cell, so its footprint is
`w/res × h/res` world cells (`entity.w/h` are in world cells and may be fractional). Stored as `"res"` in `.aci.json`.
They are baked once per frame into an offscreen canvas (fast pixel path for fine cells, LRU capped) and drawn above the grid but
below labels/HUD/`drawEntities` output. `drawSprite(spr, x, y, { screen: true })` draws in screen space. Reflections are skipped.
`game.snapshot()` shows `▒` for filled areas so agents still "see" them.

**Overlay UI** – `game.onOverlay((ctx, game) => …)` draws crisp canvas-2D HUD (any font size) over the grid.

**Converter** – `ACI.convert.image/gif/video(src, { cols, res, mode })`: `cols` is the footprint in world cells, `res` multiplies it.
New `mode: 'shape'` matches each cell to the best of ~110 real glyph ink patterns (4×8 samples/cell) with cell-level error
diffusion: crisp edges and smooth tone at 3-4 px cells. Options: `color` (false = mono `tint`), `bg:'color'` (two-colour split),
`smooth`, `jitter`, `dither:'none'`. GIF assets keep per-frame `delays` (ms); `frameStep` merges delays.

**Editor** – importer "Detail" (1×/2×/4×/8×, up to 240 columns, GIF frame step), sprite painter "Detail" + "✦ Generate", Inspector
"Resolution" (`editor/panels/hires.js`). Demo: `examples/fine.html` (`?font=4&renderer=webgl`).
