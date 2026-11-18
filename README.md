# ACI Renderer Engine v0.3

An extremely easy game engine where everything on screen (ground, water, characters, effects, UI) is a character in a grid. Make assets by hand, convert images, or let AI agents create and build, several of them at once.

No build step and no dependencies.

## The editor (start here)

```
npx aci-engine            # or: node bin/aci.mjs
```

This starts a local server and opens the editor in your browser, like local n8n. You get a project launcher with templates, a scene view, Hierarchy, Inspector, Assets, Console and Agents panels, a tile painter, a sprite painter, an animation timeline, no-code Behaviours, and Play / Pause / Stop. Build exports one HTML file. Projects are normal folders in `~/ACI Projects`.

| Command | What it does |
| --- | --- |
| `aci` / `aci start [--port=7777] [--dir=folder] [--no-open]` | Starts the editor |
| `aci new "My Game" --template=platformer` | Creates a project (`aci templates` lists templates) |
| `aci build my-game` | Exports `build/index.html` |
| `aci list` | Lists your projects |
| `aci mcp` | MCP server, so Claude can build in the open editor (`claude mcp add aci -- npx aci-engine mcp`) |

Screenshots: `screenshots/editor/`. Plugin API: `docs/EDITOR-CONTRACT.md`.

## Engine only

| Open | What it is |
| --- | --- |
| `index.html` | The demo: a 300×110 scrolling world with reflections, a minimap, an image converter, an agent console, and "Ask Claude to build" |
| `editor.html` | The asset editor: type or paint characters with colours, add animation frames, use onion skin and undo, preview live, import images, generate with Claude, and export `.aci.json` |
| `examples/hello.html` | The smallest useful game (about 30 lines). Copy it to start. |
| `examples/index.html` | Gallery of example games and effect demos (invaders, lantern, fx lab, photo booth) |
| `docs/GETTING-STARTED.md` | A step-by-step tutorial, plus `docs/ANIMATION.md` and `docs/CONVERTER.md` |
| `modules/demo-*.html` | Physics, a platformer, input, sound and save demos |

## Quick start

```html
<div id="screen" style="height:100vh"></div>
<script src="aci.js"></script>
<script>
const game = ACI.game('#screen', { world: { cols: 200, rows: 60 } });
game.layer((x, y, t) => [Math.sin(x * 0.2 - t) > 0 ? '/' : '|', '#4a4']);   // animated grass
const hero = game.add(String.raw`
 o
/|\
/ \ `, { x: 10, y: 5, label: 'me' });
game.follow(hero);
game.onUpdate(dt => { if (game.key('d')) hero.x += 12 * dt; });
</script>
```

Tip: write sprite art with ``String.raw`...` `` so backslashes survive. If a line ends with `\` right before the closing backtick, add a space after it, or JavaScript reads `\`` as an escaped backtick.

## Core API (`aci.js`)

| Call | What it does |
| --- | --- |
| `ACI.game(el, {world:{cols,rows}, fontSize, bridge})` | Creates the screen and starts the loop. Without `world`, the world is the size of the screen. |
| `game.layer(fn, z)` | A background "shader". `fn(x, y, t)` returns `[char, colour, bg?]` for each world cell, every frame. |
| `game.mask(name, fn)` / `game.is(name, x, y)` | Named regions (water, rock, path…), baked once. |
| `game.reflect('water')` | Entities with `reflect: true` are mirrored, flipped and rippled in that mask. |
| `ACI.sprite(art, {colors, palette, fps})` | A hand-made asset. `art` is a string, an array of frames, or `{idle:[...], walk:[...]}`. `colors` is a second drawing of the same shape, where each letter is a palette key. Spaces are transparent. |
| `game.add(sprite, {x, y, z, label, reflect, update})` | Puts an entity in the world. Entities have `.play(anim)`, `.say(text)`, `.flipX` and `.setSprite()`. |
| `game.follow(e)` / `game.lookAt(x, y)` / `game.camera` | The camera. Clamps to the world edges. |
| `game.put / text / box / drawSprite` | Drawing in world coordinates. |
| `game.screen.put / text / box / fill` | Drawing in screen coordinates, for HUDs and menus. |
| `game.onUpdate(fn)`, `game.onDraw(fn)`, `game.key('a')`, `game.on('click', fn)` | The loop and input. `on` also takes `add`, `remove`, `resize`, `key`, `command` and `bridge`. |
| `game.snapshot()` | The current screen as plain text, which is how agents "see". |
| `ACI.fromImage(img, {cols, ramp})` | Turns an image into a sprite. Ramps: `standard`, `detailed`, `blocks`, `grass`, or your own string. |
| `ACI.toAsset(sprite, name)` / `ACI.fromAsset(json)` / `ACI.loadAsset(url)` | Converts to and from the `.aci.json` asset format. |
| `ACI.plugin(name, (game, opts) => api)` | Adds a module to every game. |

## Modules (`modules/`, load after `aci.js`; each one installs itself)

| File | Adds | Docs |
| --- | --- | --- |
| `physics.js` | velocity, gravity, solid bodies, triggers, raycasts, `hero.grounded` | `modules/README-physics.md` |
| `tilemap.js` | levels drawn as text with a legend, solid tiles, and markers that spawn entities | `modules/README-physics.md` |
| `scenes.js` | `game.scene()` / `game.goto()` with transitions | `modules/README-physics.md` |
| `input.js` | action mapping, pressed or released for one frame, drag, touch d-pad | `modules/README-input-sound-save.md` |
| `sound.js` | synthesised sound effects and music, with no audio files | `modules/README-input-sound-save.md` |
| `save.js` | save and load slots, plus world capture and restore | `modules/README-input-sound-save.md` |
| `anim.js` | tweens, particles, emitters, floating text, shake, transitions | `docs/ANIMATION.md` |
| `convert.js` | image, GIF, video and webcam to ASCII (blocks, braille, edges, dithering); also `tools/aci-convert.js` on the command line | `docs/CONVERTER.md` |

## Agents

Every agent, whether a person, a script or an AI, drives the game with plain JSON: `game.command({op, ...})`. Each command can carry `"agent": "<name>"`, so several agents can share one world. Entities record their `owner`, and the log shows who did what. Send `{"op":"help"}` for the full list, which includes every command the loaded modules add.

Core ops: `help`, `describe`, `look`, `spawn`, `set`, `move`, `say`, `play`, `remove`, `text`, `asset`, `camera`. The modules add `physics`, `tilemap`, `goto`, `state`, `sound`, `save`, `load` and `convert`.

```json
{ "agent": "artist",   "op": "spawn", "name": "lantern", "art": " _\n[*]\n |", "color": "#ffd27a", "x": 10, "y": 6 }
{ "agent": "director", "op": "say",   "name": "mochi", "text": "hello" }
{ "agent": "director", "op": "move",  "name": "lantern", "to": [40, 12] }
```

### Connecting real agents: the bridge

```bash
node bridge/server.mjs          # or: npm start    → http://localhost:7777
```

Open `http://localhost:7777` and the demo connects by itself. In your own game, call `game.connect()`. Any agent can then use:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/command` | Send one command or an array. Name the agent with `"agent"` or the `x-aci-agent` header. |
| `GET /api/look` | The screen as text plus the visible entities |
| `GET /api/state`, `GET /api/help` | The whole world, and every command with its arguments |
| `GET /api/events?since=n` | Player clicks and custom game events (`game.notifyAgents(type, data)`) |
| `GET /api/log?since=n` | What every agent did, so agents can coordinate |
| `GET/PUT/DELETE /api/assets/<name>` | The shared asset library in `assets/*.aci.json`. Spawn from it with `{"asset":"name"}`. |

### Claude through MCP

```bash
claude mcp add aci -- node /path/to/aci-engine/bridge/mcp.mjs --agent=builder
claude mcp add aci-artist -- node /path/to/aci-engine/bridge/mcp.mjs --agent=artist   # a second agent
```

The MCP tools are `aci_look`, `aci_state`, `aci_help`, `aci_spawn`, `aci_move`, `aci_say`, `aci_remove`, `aci_save_asset`, `aci_list_assets`, `aci_command` (any op, including module ops), `aci_events` and `aci_log`. Set `ACI_URL` if the bridge isn't on `localhost:7777`.

### Inside claude.ai

The published demo has an "Ask Claude to build" panel, where Claude looks at the screen and runs commands as tools. The editor's "Generate with Claude" draws whole animated assets from a description.

## Asset format (`.aci.json`)

```json
{ "aci": 1, "name": "hero", "fps": 6,
  "palette": { "a": "#e8c870", "b": "#d45a4f" },
  "anims": { "idle": [ { "text": [" o ", "/|\\"], "colors": [" a ", "bbb"] } ] } }
```

A frame can use `"fg": [["#hex", null, ...], ...]` instead of `colors` and `palette`, which converted images do.
