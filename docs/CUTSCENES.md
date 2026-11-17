# ACI cutscenes (spec v1)

Gameplay stays chunky and low-res. A cutscene takes over the whole screen at a much finer character density
(small font, 150-300 columns) and plays hand-made or converted (GIF/video, rotoscope-style) frame art, with
typewriter captions, sound cues, fades and skip. All original; nothing is copied from any game.

## File
`cutscenes/<name>.cutscene.json` in the project folder (also in the one-file build).

```json
{ "format": "aci-cutscene", "v": 1, "name": "intro",
  "look": { "fontSize": 6, "background": "#000000", "color": "#e8e8e8", "letterbox": true },
  "skippable": true,
  "shots": [
    { "duration": 4,
      "art": { "asset": "temple", "anim": "default", "fps": 8, "loop": true, "fit": "contain" },
      "tint": null, "fadeIn": 0.6, "fadeOut": 0.4,
      "caption": { "speaker": "Elder", "text": "Long ago, the lanterns went dark.", "speed": 28, "pos": "bottom", "color": "#e8c870" },
      "sound": [ { "at": 0, "music": "C3 _ G3 _ E3 _ G3 _", "bpm": 70, "loop": true }, { "at": 2, "sfx": "blip" } ],
      "waitForInput": false }
  ],
  "onEnd": { "goto": "scene-name", "state": { "seenIntro": true } } }
```
Look presets (`look.preset`): `rotoscope` (mono + one accent, 10 fps, jitter, grain, scanlines, bloom), `portrait` (fine photographic mono, 8 tone levels, bloom), `noir`, `vhs`, `none`. Override anything in `look.style` (`mono, accent, levels, contrast, fps, jitter, grain, scanlines, vignette, flicker, bloom`). `look.captionBox:true` puts captions on a dark box (default: bold outlined text).
Shot `camera`: `{ "zoom":[1,1.35], "pan":[[0,0],[0.3,0]] }` slow push-in / pan over the shot (frames are oversampled, so it stays sharp).
Caption `upper:true` uppercases.

Shot fields: `duration` seconds (0 = stay until the player presses Continue); `art` = `{asset, anim, fps, loop, fit:'contain'|'cover'|'none'}` (an asset from `assets/`, usually converted at high cols) or `{text:"raw ascii", color}` or null (black);
`tint` colour multiplied over the art; `fadeIn`/`fadeOut` seconds (fade to/from `look.background`); `caption` typewriter text (`speaker`, `text`, `speed` chars/sec, `pos` bottom|top|center, `color`);
`sound` cues `{at: seconds into shot, sfx:'name' | music:'notes', bpm, loop | stop:'music'}` using the game's sound plugin; `waitForInput` (default: true when duration is 0, or when a caption is still revealing at shot end: the shot waits for Continue).

## Runtime API (modules/cutscene.js, plugin 'cutscene')
```js
game.cutscene.define(name, doc)                 // register (the player does this for every cutscenes/*.cutscene.json)
game.cutscene.play(nameOrDoc, { onShot(i, shot), container })  // -> Promise<'finished'|'skipped'>
game.cutscene.skip()      game.cutscene.next()  // next = Continue: finishes caption, then advances
game.cutscene.playing     // false | { name, shot }
game.cutscene.list()      // registered names
// bus events: 'cutscene:start' {name}, 'cutscene:shot' {name, index}, 'cutscene:end' {name, result}
```
Controls: Space / Enter / click = Continue; Esc (hold 0.6s, or press twice) = skip when `skippable`.
While playing the main game is paused. `onEnd.goto` runs `game.goto(scene)` and `onEnd.state` merges into `game.state`.
`container` (optional): an element to render into instead of full-screen (the editor preview uses this).
Agent command: `{op:'cutscene', play:'intro'}` / `{op:'cutscene', skip:true}` / `{op:'cutscene', list:true}`.
Behaviour: `PlayCutscene {cutscene, trigger:'touch'|'click'|'start', once:true}` (runtime/behaviours.js).
Script: `game.cutscene.play('intro').then(r => ...)`.
