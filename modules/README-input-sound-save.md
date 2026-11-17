# input, sound, save (plugins; load after aci.js, no setup call)
```html
<script src="../aci.js"></script><script src="input.js"></script><script src="sound.js"></script><script src="save.js"></script>
```
## game.input
```js
const I = game.input;
I.map({ jump: ['space', 'w'], left: ['a', 'ArrowLeft'] });   // defaults exist: left right up down jump action fire pause
game.onUpdate(dt => {
  hero.x += I.axis('left', 'right') * 20 * dt;               // -1..1
  if (I.pressed('jump')) hero.vy = -8;                        // true for exactly ONE frame (also released())
  if (I.down('fire')) shoot();                                // held; I.heldFor('fire') = seconds
  const v = I.vector();                                       // {x,y} from left/right/up/down, diagonals normalized
});
I.down('w');                       // unmapped names work as raw keys; names are normalized ('Space','up','Esc' ok)
I.bind('jump','j'); I.unbind('jump','space'); I.keys('jump'); I.label('jump');   // 'Space / W'
I.rebind('jump').then(key => ...); // next key becomes the binding (Esc cancels -> null)
game.save('controls', I.bindings());                         // bindings are plain JSON
I.onPress('jump', (action, key) => ...);
I.clicked();                       // {x,y,sx,sy} (world + screen cell) for one frame, else null. A touch tap is a click.
I.drag(); I.dragEnded();           // {from,to,dx,dy} while / right after dragging; I.pointerDown(); I.cell()
I.on('click'|'release'|'dragstart'|'drag'|'dragend', fn);
I.touchControls({ buttons: { A: 'space', B: 'x' }, onlyTouch: true });   // on-screen d-pad (arrow keys) + buttons
I.press('space'); I.release('space');                        // synthetic input (agents, tests)
```
Frame choice: key events are stamped with a frame counter (advanced when game.time changes), so pressed/released are
correct for every onUpdate listener whatever its registration order. While game.paused, pressed stays true.
## game.sound (WebAudio, no files; silent no-op if unavailable; audio starts after first key/click)
```js
game.sound.sfx('coin');            // jump coin hit explode powerup blip laser select fall ; sfx('jump',{pitch:1.5})
game.sound.tone('C5', 0.2, 'triangle');                      // or tone(440, ...)
game.sound.define('zap', { type:'sawtooth', freq:1200, freq2:100, dur:0.15, vol:0.3 });  // also notes:[..],step, noise, filter{from,to}
game.sound.music('C4 E4:2 G4 - _ C5', { bpm:120, loop:true, wave:'square' });   // _ rest, - sustain, :n length (1 step = 1/8 note)
game.sound.music(['C4 E4 G4 -', 'C2 - - -'], { wave:['square','triangle'] }); // several tracks
game.sound.stop(); .volume(0.5); .musicVolume(0.3); .sfxVolume(1); .mute(); .musicPlaying; .state
game.command({ op:'sound', sfx:'coin' })   // also {music:"..."}, {tone:{freq,dur,type}}, {stop:true}, {volume}, {mute}, {define}
```
## save
```js
game.save('slot1');                    // whole world (entities, art, props, time)
game.save('prefs', { music: true });   // or any JSON
game.load('slot1');                    // restores a world save; returns the data (null if missing)
game.load('prefs', { restore:false }); // just read
game.saves.list(); .has(s); .delete(s); .clear(); .backend()   // localStorage, falls back to memory
game.saves.capture(); game.saves.restore(snap);              // raw world snapshot (game.snapshot() is core's screen text)
game.saves.track('score', () => score, v => score = v);      // extra state inside world saves
game.saves.behavior('wander', fn); entity.behavior = 'wander';   // functions are not saved; named behaviours are re-attached
game.saves.register('hero', sprite);                         // save sprite as a reference instead of full art
const json = game.exportJSON(); game.importJSON(json);       // world + slots as a string
game.command({ op:'save', slot:'q' }); game.command({ op:'load', slot:'q' }); game.command({ op:'save', list:true })
```
Notes: entity ids are NOT preserved on restore (use names; restore returns idMap). Non-JSON props (functions, cycles) are skipped
and listed in snapshot.dropped. Plugin options: `ACI.game(el,{plugins:{save:{namespace:'mygame',version:2,migrate:(data,from)=>data}}})`.
