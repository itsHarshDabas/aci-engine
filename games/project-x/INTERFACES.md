# Project X port - shared interfaces (branch `port`)

Render path: `px-gfx.js` (three.js scene -> ASCII shader). Keep it stable. Look: `PX.gfx.setLook(null)` normal, `PX.gfx.setLook({jitter, grain, levels, mono, accent})` rotoscope (cutscenes). Camera: `PX.gfx.cam` ({tx,tz,ty,dist,pitch,shake}) + `PX.gfx.updateCamera(dt)`. Scene: `PX.gfx.scene` (call `PX.gfx.clear()` before building a new one).

Characters: `new PX.Rig(name)` (claire, shade, grandma, friend, office, officer). `rig.root` (Group, +Z forward, yaw = root.rotation.y), `rig.play(anim,{loop,speed,dur,onEnd})`, anims in `PX.ANIM3D` (idle walk run light1 light2 light3 heavy cast charge dodge hurt ko drink slash), `rig.setShade(bool)`, `rig.giveKatana()`, `rig.hit()` (flash), `rig.update(dt)`. Test viewer: `models3d.html?who=claire&act=walk&stance=ready&katana=1`.

Overworld (owner: this thread): `px-world3d.js`, `PX.World3.load(areaId, spawn, facing)`, `PX.World3.update(dt)`. World test page: `world3d.html?area=street&x=12&y=8&font=3`.

Hooks the overworld will call (implemented by the other threads, same names):
- `PX.arena.begin({ test, returnTo:{area, x, y}, onEnd(result) })` - result `{won:Boolean}`. Must call `PX.gfx.clear()` for its own scene and restore nothing itself; the caller reloads the area with `PX.World3.load`.
- `PX.cutscene.play(id, onDone)` - ids: `intro`, `footprints`, `rift`, `victory`. Owns the scene and rotoscope look while playing; call `PX.gfx.setLook(null)` and `PX.gfx.clear()` before `onDone()`.

Serve over HTTP (ES modules): `python3 -m http.server 8099` from the repo root.
