# ACI behaviours (no-code scripting)

Load after `aci.js` and the modules: `<script src="runtime/behaviours.js">`. Everything lives on `window.ACI`.

- `ACI.behaviour(name, def)` registers a behaviour. `ACI.behaviours` is the name -> def map the inspector reads (`title`, `description`, `params`).
- `ACI.attachBehaviours(game, entity, [{name, params}])` attaches them (play mode / builds only). Missing params get defaults,
  numbers are clamped to `min`/`max`, selects fall back to the default, unknown names are skipped with a warning
  (`game.emit('log', {level:'warn', msg})` + `console.warn`). `start` runs once; `update` runs every frame (before physics).
  `onCollide` is chained after any existing `e.onCollide` / `e.onTrigger`; `onClick` fires when a click lands inside the entity's box.
- Any error thrown in a hook is caught and reported once per behaviour+hook as `console.error('[behaviour Name] hook: message')`.
  The game loop keeps running.

## Built-ins
TopDownMove, PlatformerMove, Wander, Follow, Patrol, Collectible, Bob, Spin, SayOnClick, DoorToScene, CameraFollow, Hazard.
Movement ones set `e.vx` / `e.vy`; top-down ones set `gravity = 0` if you did not. Collectible, DoorToScene and Hazard
set `trigger = true` unless the entity is solid. Targets are entity names or tags; the `by` / `hurts` params are tags.

## Writing your own
Save as `scripts/Orbit.js` in your project (the player loads it before the scene):

```js
ACI.behaviour('Orbit', {
  title: 'Orbit', description: 'Circles around its start point',
  params: {
    radius: { type: 'number', default: 5, min: 0, max: 50 },
    speed:  { type: 'number', default: 1, min: 0, max: 10 },
    mode:   { type: 'select', default: 'loop', options: ['loop', 'once'] },
  },
  start(e, game, p)  { e._cx = e.x; e._cy = e.y; e._a = 0; },
  update(e, dt, game, p) { e._a += dt * p.speed; e.x = e._cx + Math.cos(e._a) * p.radius; e.y = e._cy + Math.sin(e._a) * p.radius; },
  onCollide(e, other, game, p) { if (other && other.tags.includes('player')) game.state.hits = (game.state.hits || 0) + 1; },
  onClick(e, game, p) { e.say('Weee!'); },
});
```

Param types: `number` (min/max), `boolean`, `string`, `key`, `entity`, `scene`, `asset`, `color`, `select` (`options`).
Keep per-entity state on `e` with a `_` prefix; `params` is already validated. Test with `game.step(dt)` and `game.input.press('right')`.
See `runtime/test-behaviours.html`.
