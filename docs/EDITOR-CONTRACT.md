# ACI Editor — integration contract (v1)

The goal is a full engine editor in the spirit of Unity or Unreal, but much easier for beginners. One command (`aci`) starts a local server and opens the editor in the browser, like local n8n.

## Who owns what

| Area | Owner |
| --- | --- |
| `bin/aci.mjs` CLI, `server/index.mjs` (router, static files, agent bridge), `editor/` shell (launcher, docking, hierarchy, inspector, scene view, assets browser, console, agents panel, toolbar) | Editor thread ("Build the ACI game engine editor") |
| `server/projects.mjs` (project files on disk, templates list, build/export), `runtime/player.html` + `runtime/*.js` (player, play mode, behaviours), `modules/project.js` (scene/project formats) | Core runtime thread |
| `editor/panels/*.js` (tile painter, sprite painter, animation timeline, importer), `modules/environments.js` (ACI.environments), `templates/<id>/` | Animation/converter thread |

## Folder layout (package root)

```
bin/aci.mjs                 aci | aci start [--dir=..] [--port=..] [--no-open] | aci new <name> [--template=id] | aci build <project> | aci mcp
server/index.mjs            http server; auto-imports every server/*.mjs exporting register(api)
server/projects.mjs         core thread
runtime/player.html         core thread
editor/index.html, editor/editor.css, editor/editor.js   editor thread
editor/panels/*.js          listed automatically by GET /api/editor/plugins and loaded after the shell
templates/<id>/             template.json {name, description, tags} + a full project folder
aci.js, modules/            engine (unchanged contract)
```

## Server plugin API

`server/<name>.mjs` exports `register(api)`.
`api = { route(method, pattern, handler), root, workspace, readBody(req) -> Promise<string>, send(res, code, body, type?), log(msg) }`.
- `pattern` examples: `/api/projects`, `/api/projects/:p`, `/api/projects/:p/file/*`. `handler(req, res, params, url)`; `params.p`, `params['*']`.
- `workspace` = projects directory: `--dir`, else `ACI_WORKSPACE`, else `~/ACI Projects`.

## Project folder on disk (`workspace/<id>/`)

```
aci.project.json            {aci:'project', name, version, startScene, scenes:[{name,file}], settings:{fontSize, background, view}, template, created}
scenes/<name>.scene.json    aci-scene (modules/project.js)
assets/<name>.aci.json      sprites (existing .aci.json format)
scripts/<name>.js           user behaviours (call ACI.behaviour)
build/index.html            export output
```

## Routes (core thread implements in server/projects.mjs)

| Route | Result |
| --- | --- |
| `GET /api/projects` | `[{id, name, modified, scenes, template}]` (id = folder name) |
| `POST /api/projects {name, template}` | copies `templates/<template>/` (minus template.json), or an empty project with scene `main` → `{id}` |
| `GET /api/templates` | `[{id, name, description, tags}]` |
| `GET` / `PUT /api/projects/:p` | manifest read / write |
| `GET /api/projects/:p/tree` | `[{path, type:'file'|'dir', size, modified}]`, recursive, skips build/ |
| `GET` / `PUT` / `DELETE /api/projects/:p/file/*` | raw text; creates dirs; refuses paths escaping the project |
| `POST /api/projects/:p/rename {to}`, `POST /api/projects/:p/duplicate`, `DELETE /api/projects/:p` | delete moves to `workspace/.trash/` |
| `POST /api/projects/:p/build` | writes ONE self-contained `build/index.html` → `{file, size}` |
| `GET /play/:p/` | the project running in player.html |

## Scene entity fields

`id, name, x, y, z, tags[], label, reflect, hidden, sprite:{asset:'name'} or inline art, anim, flipX, vx, vy, gravity, solid, static, trigger, friction, bounce, behaviours:[{name, params:{}}]`.
Scene level: `world{cols,rows}, environment:{preset, params}, tilemaps, camera:{follow}, gravity`.

## Behaviours (no-code scripting)

```js
ACI.behaviour('Wander', {
  title: 'Wander', description: 'Walks around at random',
  params: { speed: { type: 'number', default: 6, min: 0, max: 40 } },   // types: number, boolean, string, key, entity, scene, asset, color, select(options)
  start(e, game, params) {}, update(e, dt, game, params) {}, onCollide(e, other, game, params) {}, onClick(e, game, params) {},
});
```
Built-ins: TopDownMove, PlatformerMove, Wander, Follow, Patrol, Collectible, Bob, Spin, SayOnClick, DoorToScene, CameraFollow, Hazard. They run only in play mode and in builds. `ACI.behaviours` lists them (the inspector reads the schema).

## Player and play mode

- `runtime/player.html?project=<id>&scene=<name>` loads through the API and runs the project.
- The player also accepts `postMessage({type:'aci-play', manifest, scene, assets:{name:json}, scripts:{name:code}})`, so the editor can play unsaved changes in an iframe. Stop destroys the iframe.
- The player posts `{type:'aci-ready'}`, `{type:'aci-log', level, msg}` (including caught runtime errors), and `{type:'aci-scene-changed', scene}`.
- `window.aciPlayer = {pause(), resume(), step()}`. When served from the server, the player calls `game.connect()` so agents can drive it.

## Editor plugin API (`window.ACIEditor`, ready before editor/panels/*.js run)

```js
ACIEditor.registerPanel({ id, title, icon, dock: 'left'|'right'|'bottom', mount(el, ed), unmount(), onShow() })
ACIEditor.registerSceneTool({ id, title, icon, key, cursor, activate(ed), deactivate(ed), pointer(ev, cell, ed) /* ev.type: down|move|up */, draw(game, ed) /* world coords, after entities */ })
ACIEditor.registerAssetEditor({ kind, match(path), open(path, text, ed) -> { el, save() -> text, dirty() -> bool } })
ACIEditor.registerImporter({ id, title, accept, import(file, ed) -> Promise<{ path, text }> })
ACIEditor.registerInspector({ id, title, applies(entity), render(el, entity, ed) })   // extra inspector sections
```

`ed` services:
`ed.project`, `ed.projectId`, `ed.game` (edit-mode ACI game in the scene view, behaviours off), `ed.scene` (scene doc), `ed.sceneName`, `ed.selection`, `ed.select(e)`,
`ed.fs.read(path)`, `ed.fs.write(path, text)`, `ed.fs.list()`, `ed.fs.remove(path)` (project-relative),
`ed.markDirty()`, `ed.undo.push(label, undoFn, redoFn)`, `ed.log(msg, level)`, `ed.on(event, fn)` / `ed.emit` (events: project, scene, select, change, play, stop, assets),
`ed.assets` (name → sprite), `ed.refreshAssets()`, `ed.openAsset(path)`.

Styling: use the shell tokens from `editor/editor.css`: `--bg --panel --panel-2 --line --ink --muted --accent --accent-ink --danger --ok --mono --sans`.

## Added in the quality pass

- `ed.ui.ask(title, label, value, okLabel) -> Promise<string|null>`, `ed.ui.confirm(title, text, okLabel) -> Promise<bool>`, `ed.ui.toast(msg, kind)`, `ed.ui.menu(x, y, items)`. Use these instead of `prompt()` / `confirm()`.
- `ed.ai.generate({kind:'sprite'|'frames'|'json', prompt, w, h, frames, hint}) -> JSON`, `ed.ai.dialog(opts) -> JSON|null` (the styled "Generate with Claude" dialog with preview), `ed.ai.toAssetText(json, name) -> .aci.json text`. The server (`server/ai.mjs`) calls Claude when `ANTHROPIC_API_KEY` is set. Otherwise it queues the request for a connected agent (MCP `aci_ai_requests` / `aci_ai_answer`).
- Play-mode postMessage also carries `cutscenes:{name: jsonText}`. The edit game sets `game.cutscene.onSave` so agent-authored cutscenes are written into the project.
- `GET /api/thumbs` returns project thumbnails (`<project>/.aci/thumbnail.txt`, written by the editor on save).
