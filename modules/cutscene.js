/* ACI modules/cutscene.js: plugin 'cutscene'. Full-screen, finer-density story scenes. Spec: docs/CUTSCENES.md.
   Renders into its own overlay ACI game (small font = many columns) so gameplay keeps its chunky look.
   Frame art is any sprite asset (convert GIF/video at ~120-240 cols; res>1 hi-res sprites work too).
   Look presets (look.preset): 'rotoscope' (mono + one accent, low fps, jitter, grain, scanlines), 'noir', 'vhs', 'none'. */
(function () {
  'use strict';
  const ACI = window.ACI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PRESETS = {
    none: {},
    rotoscope: { mono: '#e8e6e0', accent: '#d1332a', levels: 4, contrast: 1.5, fps: 10, jitter: 1, grain: 0.06, scanlines: true, vignette: true, flicker: true, bloom: true },
    noir: { mono: '#e8e8e8', accent: null, levels: 5, contrast: 1.6, fps: 12, jitter: 0, grain: 0.04, scanlines: false, vignette: true, flicker: false },
    portrait: { mono: '#f2f2f2', accent: null, levels: 8, contrast: 1.35, fps: 24, jitter: 0, grain: 0.03, scanlines: false, vignette: true, flicker: false, bloom: true },
    vhs: { mono: null, accent: null, levels: 0, contrast: 1.1, fps: 15, jitter: 1, grain: 0.1, scanlines: true, vignette: false, flicker: true },
  };
  const rgb = c => ACI.parseColor(c);

  // ---- recolour one frame cell colour according to a look style (palette limit / mono + accent)
  function restyle(color, st, tint) {
    if (!color) return color;
    let [r, g, b] = rgb(color);
    if (tint) { const [tr, tg, tb] = rgb(tint); r = r * tr / 255; g = g * tg / 255; b = b * tb / 255; }
    if (!st || st.mono === undefined || st.mono === null) return ACI.toHex([r, g, b].map(Math.round));
    let lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    lum = clamp((Math.pow(lum, 0.75) - 0.5) * (st.contrast || 1) + 0.5, 0, 1);
    if (st.levels > 1) lum = Math.round(lum * (st.levels - 1)) / (st.levels - 1);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
    const isAcc = st.accent && sat > 0.35 && lum > 0.12;
    return ACI.mix('#000000', isAcc ? st.accent : st.mono, isAcc ? Math.min(1, lum * 1.9 + 0.25) : lum);
  }
  // ---- nearest-neighbour resample + restyle of a sprite into a res=1 sprite sized to the overlay
  function prepare(spr, cols, rows, fit, st, tint, zoom) {
    zoom = zoom || 1;
    const anims = {};
    for (const a in spr.anims) anims[a] = spr.anims[a].map(f => {
      let tw = f.w, th = f.h;
      if (fit !== 'none') {
        const k = fit === 'cover' ? Math.max(cols / f.w, rows / f.h) : Math.min(cols / f.w, rows / f.h);
        tw = Math.max(1, Math.round(f.w * k * zoom)); th = Math.max(1, Math.round(f.h * k * zoom));
      }
      const cells = new Array(tw * th);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const c = f.cells[Math.min(f.h - 1, Math.floor(y * f.h / th)) * f.w + Math.min(f.w - 1, Math.floor(x * f.w / tw))];
        cells[y * tw + x] = { ch: c.ch, fg: restyle(c.fg, st, tint), bg: c.bg ? restyle(c.bg, st, tint) : null };
      }
      return { w: tw, h: th, cells };
    });
    return ACI.sprite(anims, { fps: spr.fps });
  }

  ACI.cutscene = { presets: PRESETS };

  ACI.plugin('cutscene', function install(G) {
    const docs = {}, prepCache = new Map(), uids = new WeakMap(); let uidN = 0;
    const uid = spr => { if (!uids.has(spr)) uids.set(spr, ++uidN); return uids.get(spr); };   // a re-saved asset is a new sprite object, so its cache key changes
    let cur = null;                                   // the running cutscene
    const C = G.cutscene = {
      define(name, doc) { if (typeof doc === 'string') doc = JSON.parse(doc); docs[name] = doc; return C; },
      list: () => Object.keys(docs),
      invalidate() { prepCache.clear(); return C; },
      get playing() { return cur ? { name: cur.name, shot: cur.i } : false; },
      skip() { if (cur) cur.finish('skipped'); },
      next() { if (cur) cur.next(); },
      play(src, o = {}) {
        let doc = typeof src === 'string' ? docs[src] : src;
        if (typeof src === 'string' && !doc) return Promise.reject(new Error('unknown cutscene "' + src + '" (have: ' + Object.keys(docs).join(', ') + ')'));
        if (cur) cur.finish('skipped');
        return run(doc, typeof src === 'string' ? src : doc.name || 'cutscene', o);
      },
    };
    const emitAll = (ev, d) => { try { G.bus && G.bus.emit(ev, d); } catch (e) {} };

    function run(doc, name, o) {
      const shots = doc.shots || [];
      const look = Object.assign({ fontSize: 7, background: '#000000', color: '#e8e8e8', letterbox: true }, doc.look || {});
      const st = Object.assign({}, PRESETS[look.preset] || {}, look.style || {});
      const hasStyle = look.preset && look.preset !== 'none' || look.style;
      const wasPaused = G.paused; G.paused = true;

      // ---- DOM: container (fades) > host (the overlay game) + fx layers
      const own = !o.container;
      const box = o.container || document.createElement('div');
      if (own) { box.style.cssText = 'position:fixed;inset:0;z-index:99999;opacity:0;transition:opacity .35s;background:' + look.background; document.body.appendChild(box); }
      const host = document.createElement('div'); host.style.cssText = 'position:absolute;inset:0;background:' + look.background; box.appendChild(host);
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
      const fx = document.createElement('div'); fx.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      const layers = [];
      if (hasStyle && st.scanlines) layers.push('repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 1px,transparent 1px 3px)');
      if (hasStyle && st.vignette) layers.push('radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.65) 100%)');
      fx.style.background = layers.join(','); box.appendChild(fx);
      const hint = document.createElement('div'); hint.style.cssText = 'position:absolute;right:12px;bottom:8px;font:11px ui-monospace,monospace;color:#8a8a8a;opacity:0;transition:opacity .2s;pointer-events:none'; box.appendChild(hint);
      const capEl = document.createElement('div');
      capEl.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);width:min(78%,900px);padding:.4em .9em;text-align:center;color:#f4f4f4;font:800 clamp(18px,3.6vw,46px)/1.15 "Arial Black",Impact,ui-sans-serif,system-ui,sans-serif;letter-spacing:.02em;pointer-events:none;display:none;white-space:pre-wrap;-webkit-text-stroke:.07em #000;paint-order:stroke fill;text-shadow:0 .06em .25em rgba(0,0,0,.9)' + (look.captionBox ? ';background:rgba(0,0,0,.72)' : '');
      box.appendChild(capEl);
      requestAnimationFrame(() => { if (own) box.style.opacity = 1; });

      if (hasStyle && st.bloom) host.style.filter = 'contrast(1.12) brightness(1.08) drop-shadow(0 0 2px rgba(255,255,255,.35))';
      const ov = ACI.game(host, { fontSize: look.fontSize, background: look.background });
      const sfx = (n, p) => { try { G.sound && G.sound.sfx(n, p); } catch (e) {} };
      let musicOn = false, resolve; const done = new Promise(r => resolve = r);
      const S = cur = { name, i: -1, shot: null, phase: 'in', t: 0, capT: 0, capLen: 0, capLines: [], cues: [], skipArm: 0, ended: false };

      function spriteFor(art) {
        if (!art || !art.asset) return null;
        const base = G.assets && G.assets[art.asset];
        if (!base) { console.warn('[cutscene] missing asset "' + art.asset + '"'); return null; }
        const zm = camMax(S.shot), key = [uid(base), art.fit || 'contain', ov.cols, ov.rows, zm, JSON.stringify(st), S.shot.tint || ''].join('|');
        if (!prepCache.has(key)) { if (prepCache.size > 40) prepCache.clear(); prepCache.set(key, prepare(base, ov.cols, ov.rows, art.fit || 'contain', hasStyle ? st : null, S.shot.tint, zm)); }
        return prepCache.get(key);
      }
      const camMax = sh => (sh && sh.camera ? Math.max(1, (sh.camera.zoom || [1, 1])[1] || 1, (sh.camera.zoom || [1, 1])[0] || 1) : 1);
      function wrap(text, w) {
        const out = []; String(text || '').split('\n').forEach(par => { let line = ''; par.split(' ').forEach(wd => { if ((line + ' ' + wd).trim().length > w) { out.push(line); line = wd; } else line = (line + ' ' + wd).trim(); }); out.push(line); }); return out;
      }
      function enter(i) {
        S.i = i; S.shot = shots[i]; S.phase = 'in'; S.t = 0; S.capT = 0; S.sprite = null; S.frameT = 0; S.lastFrame = 0;
        const sh = S.shot; if (!sh) return finish('finished');
        S.cues = (sh.sound || []).map(c => Object.assign({ fired: false }, c)).sort((a, b) => (a.at || 0) - (b.at || 0));
        S.sprite = sh.art && sh.art.asset ? spriteFor(sh.art) : null;
        const cap = sh.caption; S.capLines = []; S.capLen = 0;
        if (cap && cap.text) { const w = 56; S.capLines = wrap(cap.text, w); S.capLen = S.capLines.reduce((n, l) => n + l.length, 0); }
        S.fadeIn = sh.fadeIn !== undefined ? sh.fadeIn : (i === 0 ? 0.4 : 0); S.fadeOut = sh.fadeOut || 0;
        ov.canvas.style.opacity = S.fadeIn > 0 ? 0 : 1;
        emitAll('cutscene:shot', { name, index: i }); if (o.onShot) try { o.onShot(i, sh); } catch (e) {}
      }
      const capDone = () => !S.capLen || S.capT * ((S.shot.caption && S.shot.caption.speed) || 30) >= S.capLen;
      function advance() { if (S.phase === 'out') return; S.phase = 'out'; S.tOut = 0; }
      S.next = function () {
        if (!S.shot) return;
        if (!capDone()) { S.capT = 1e9; return; }
        const waiting = S.shot.waitForInput !== undefined ? S.shot.waitForInput : !(S.shot.duration > 0);
        if (waiting || S.t > 0.25) advance();
      };
      function finish(result) {
        if (S.ended) return; S.ended = true; cur = null;
        if (musicOn) { try { G.sound.stop(); } catch (e) {} }
        window.removeEventListener('keydown', onKey, true); box.removeEventListener('pointerdown', onClick, true);
        const cleanup = () => { try { ov.destroy(); } catch (e) {} host.remove(); fx.remove(); hint.remove(); capEl.remove(); if (own) box.remove(); };
        if (own) { box.style.opacity = 0; setTimeout(cleanup, 360); } else cleanup();
        G.paused = wasPaused;
        const end = doc.onEnd || {};
        if (end.state && G.state) Object.assign(G.state, end.state);
        if (end.goto && G.goto) { try { G.goto(end.goto, null, { transition: 'fade' }); } catch (e) { console.warn('[cutscene] goto failed: ' + e.message); } }
        emitAll('cutscene:end', { name, result }); resolve(result);
      }
      S.finish = finish;

      function onKey(ev) {
        const k = ev.key;
        if (k === ' ' || k === 'Enter') { ev.preventDefault(); ev.stopPropagation(); S.next(); }
        else if (k === 'Escape' && doc.skippable !== false) {
          ev.preventDefault(); ev.stopPropagation();
          if (S.skipArm > 0) finish('skipped'); else { S.skipArm = 1.5; hint.textContent = 'press Esc again to skip'; hint.style.opacity = 1; }
        }
      }
      const onClick = () => S.next();
      window.addEventListener('keydown', onKey, true); box.addEventListener('pointerdown', onClick, true);
      if (!shots.length) { finish('finished'); return done; }

      const rnd = () => Math.random();
      ov.onUpdate(dt => {
        if (S.ended) return;
        if (S.skipArm > 0) { S.skipArm -= dt; if (S.skipArm <= 0) hint.style.opacity = 0; }
        const sh = S.shot; if (!sh) return;
        S.t += dt; S.capT += dt;
        for (const c of S.cues) if (!c.fired && S.t >= (c.at || 0)) {
          c.fired = true;
          if (c.sfx) sfx(c.sfx, c.params);
          else if (c.music) { try { G.sound.music(c.music, { bpm: c.bpm, loop: c.loop !== false, wave: c.wave }); musicOn = true; } catch (e) {} }
          else if (c.stop) { try { G.sound.stop(); musicOn = false; } catch (e) {} }
        }
        if (S.phase === 'in') { ov.canvas.style.opacity = S.fadeIn > 0 ? clamp(S.t / S.fadeIn, 0, 1) : 1; if (S.t >= S.fadeIn) S.phase = 'hold'; }
        if (S.phase === 'hold') {
          const timed = sh.duration > 0, over = timed && S.t >= sh.duration;
          const wantsInput = sh.waitForInput !== undefined ? sh.waitForInput : !timed;
          if (over && !wantsInput && capDone()) advance();
          S.waiting = (!timed || over) && capDone() && (wantsInput || (over && S.capLen > 0 && sh.waitForInput !== false && S.capT > sh.duration + 0.01 && false));
        }
        if (S.phase === 'out') {
          S.tOut += dt; ov.canvas.style.opacity = S.fadeOut > 0 ? clamp(1 - S.tOut / S.fadeOut, 0, 1) : 1;
          if (S.tOut >= S.fadeOut) { if (S.i + 1 >= shots.length) finish('finished'); else enter(S.i + 1); }
        }
        if (hasStyle && st.flicker) ov.canvas.style.filter = rnd() < 0.04 ? 'brightness(' + (0.85 + rnd() * 0.3).toFixed(2) + ')' : '';
      });

      ov.onDraw(() => {
        const sh = S.shot; if (!sh || S.ended) return;
        const cols = ov.cols, rows = ov.rows;
        if (S.sprite) {
          const art = sh.art, fps = Math.min(art.fps || S.sprite.fps || 8, hasStyle && st.fps ? st.fps : 999);
          const anim = S.sprite.anims[art.anim] || S.sprite.anims.default || Object.values(S.sprite.anims)[0];
          let fi = Math.floor(S.t * fps); fi = art.loop === false ? Math.min(fi, anim.length - 1) : fi % anim.length;
          const f = anim[fi]; let jx = 0, jy = 0;
          if (hasStyle && st.jitter) { const jk = Math.floor(S.t * 12); const h = ACI.hash(jk, 3, 9); jx = Math.round((h - 0.5) * 2 * st.jitter); jy = Math.round((ACI.hash(jk, 5, 2) - 0.5) * st.jitter); }
          const zm = camMax(sh), cam = sh.camera;
          if (cam && zm > 1) {   // slow push-in / pan: crop a window out of the oversampled frame
            const u = sh.duration > 0 ? clamp(S.t / sh.duration, 0, 1) : clamp(S.t / 6, 0, 1), L = (a, b) => a + (b - a) * u;
            const zr = cam.zoom || [1, 1], z = L(zr[0] || 1, zr[1] || 1), pa = cam.pan || [[0, 0], [0, 0]];
            const fw = f.w / zm, fh = f.h / zm, ww = fw * zm / z, wh = fh * zm / z;      // window size in prepared cells
            const px = L(pa[0][0], pa[1][0]), py = L(pa[0][1], pa[1][1]);
            const wx0 = (f.w - ww) / 2 + px * (f.w - ww) / 2, wy0 = (f.h - wh) / 2 + py * (f.h - wh) / 2;
            const ox = Math.floor((cols - fw) / 2) + jx, oy = Math.floor((rows - fh) / 2) + jy, tw = Math.round(fw), th = Math.round(fh);
            for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
              const sx = clamp(Math.floor(wx0 + x * ww / tw), 0, f.w - 1), sy = clamp(Math.floor(wy0 + y * wh / th), 0, f.h - 1), c = f.cells[sy * f.w + sx];
              if (c.ch !== ' ' || c.bg) ov.screen.put(ox + x, oy + y, c.ch, c.fg, c.bg || undefined);
            }
          } else {
          const ox = Math.floor((cols - f.w) / 2) + jx, oy = Math.floor((rows - f.h) / 2) + jy;
          for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const c = f.cells[y * f.w + x]; if (c.ch !== ' ' || c.bg) ov.screen.put(ox + x, oy + y, c.ch, c.fg, c.bg || undefined); }
          }
        } else if (sh.art && sh.art.text) {
          const lines = String(sh.art.text).split('\n'), w = Math.max(...lines.map(l => l.length));
          lines.forEach((l, y) => ov.screen.text(Math.floor((cols - w) / 2), Math.floor((rows - lines.length) / 2) + y, l, sh.art.color || look.color));
        }
        if (hasStyle && st.grain) {
          const n = Math.floor(cols * rows * st.grain), gs = Math.floor(S.t * 14);
          for (let i = 0; i < n; i++) { const x = Math.floor(ACI.hash(i, gs, 1) * cols), y = Math.floor(ACI.hash(i, gs, 2) * rows); ov.screen.put(x, y, ACI.hash(i, gs, 3) > 0.5 ? '.' : ':', '#6a6a6a'); }
        }
        const cap = sh.caption;
        if (cap && S.capLen) {
          const speed = cap.speed || 30, shown = Math.floor(S.capT * speed), pos = cap.pos || 'bottom';
          capEl.style.display = 'block'; capEl.style.top = pos === 'top' ? '6%' : pos === 'center' ? '42%' : 'auto'; capEl.style.bottom = pos === 'bottom' ? '6%' : 'auto';
          const full = S.capLines.join('\n'), blink = capDone() && S.waiting && Math.floor(S.t * 2) % 2 === 0 ? '  ▼' : '';
          capEl.textContent = '';
          if (cap.speaker) { const sp = document.createElement('div'); sp.textContent = cap.speaker.toUpperCase(); sp.style.cssText = 'color:' + (cap.color || '#e8c870') + ';font-size:.45em;letter-spacing:.3em;margin-bottom:.2em'; capEl.appendChild(sp); }
          capEl.appendChild(document.createTextNode((cap.upper ? full.toUpperCase() : full).slice(0, shown) + blink));
          if (shown > S.lastShown && cap.sound !== false && shown % 3 === 0) sfx('blip', { vol: 0.15 });
          S.lastShown = shown;
        } else { capEl.style.display = 'none'; if (S.waiting && Math.floor(S.t * 2) % 2 === 0) ov.screen.text(cols - 4, rows - 2, '▼', '#8a8a8a'); }
      });

      enter(0);
      emitAll('cutscene:start', { name });
      return done;
    }

    // ---------------- authoring (agents + editor): edit the registry, announce changes, let the host persist them
    const changed = name => { const doc = docs[name]; emitAll('cutscene:changed', { name, doc }); if (C.onSave) try { C.onSave('cutscenes/' + name + '.cutscene.json', doc); } catch (e) {} return doc; };
    const need = name => { const d = docs[name]; if (!d) throw new Error('unknown cutscene "' + name + '" (have: ' + Object.keys(docs).join(', ') + ')'); return d; };
    const shotDefaults = { duration: 3 }, imports = {};
    C.create = (name, o = {}) => { docs[name] = { format: 'aci-cutscene', v: 1, name, look: Object.assign({ fontSize: 7, preset: 'rotoscope', background: '#050505' }, o.look), skippable: o.skippable !== false, shots: [], onEnd: o.onEnd || {} }; return changed(name); };
    C.addShot = (name, shot, index) => { const d = need(name); const sh = Object.assign({}, shotDefaults, shot); if (index === undefined || index >= d.shots.length) d.shots.push(sh); else d.shots.splice(Math.max(0, index), 0, sh); changed(name); return d.shots.indexOf(sh); };
    C.setShot = (name, index, patch) => { const d = need(name); if (!d.shots[index]) throw new Error('no shot ' + index + ' (cutscene has ' + d.shots.length + ')'); Object.assign(d.shots[index], patch); changed(name); return d.shots[index]; };
    C.removeShot = (name, index) => { const d = need(name); d.shots.splice(index, 1); changed(name); return d.shots.length; };
    C.setLook = (name, look) => { const d = need(name); Object.assign(d.look = d.look || {}, look); changed(name); return d.look; };
    // text frames -> a sprite asset (ASCII art strings), registered as G.assets[asset] and announced as 'cutscene:asset'
    C.setFrames = (asset, frames, o = {}) => {
      const spr = ACI.sprite(frames.map(f => ({ text: f })).length ? { default: frames } : { default: [' '] }, { fps: o.fps || 8, color: o.color || '#e8e8e8' });
      (G.assets = G.assets || {})[asset] = spr; prepCache.clear();
      const json = ACI.toAsset(spr, asset); emitAll('cutscene:asset', { name: asset, asset: json });
      if (C.onSave) try { C.onSave('assets/' + asset + '.aci.json', json); } catch (e) {}
      return { asset, frames: frames.length, w: spr.w, h: spr.h };
    };
    // video / gif / image URL -> frames asset with the high-contrast rotoscope conversion settings
    C.importFootage = async (asset, url, o = {}) => {
      if (!ACI.convert) throw new Error('importFootage needs modules/convert.js');
      const opts = Object.assign({ cols: 170, ramp: 'detailed', color: true, dither: 'none', contrast: 1.4, fps: 10, mode: 'luma' }, o);
      const spr = /\.(mp4|webm|mov|ogv)(\?|$)/i.test(url) ? await ACI.convert.video(url, opts) : await ACI.convert.load(url, opts);
      (G.assets = G.assets || {})[asset] = spr; prepCache.clear();
      const json = ACI.toAsset(spr, asset); emitAll('cutscene:asset', { name: asset, asset: json });
      if (C.onSave) try { C.onSave('assets/' + asset + '.aci.json', json); } catch (e) {}
      return { asset, frames: Object.values(spr.anims)[0].length, w: spr.w, h: spr.h };
    };

    G.defineCommand('cutscene', c => {
      if (c.define) C.define(c.define.name, c.define.doc);
      if (c.skip) { C.skip(); return { skipped: true }; }
      if (c.play) { C.play(c.play).catch(e => console.warn('[cutscene] ' + e.message)); return { playing: c.play }; }
      if (c.create) return { doc: C.create(c.create, c) };
      if (c.get) return { doc: need(c.get) };
      if (c.addShot) return { index: C.addShot(c.cutscene, c.addShot, c.index), doc: docs[c.cutscene] };
      if (c.setShot !== undefined) return { shot: C.setShot(c.cutscene, c.setShot, c.patch || {}) };
      if (c.removeShot !== undefined) return { shots: C.removeShot(c.cutscene, c.removeShot) };
      if (c.look) return { look: C.setLook(c.cutscene, c.look) };
      if (c.frames) return C.setFrames(c.asset, c.frames, c);
      if (c.importFootage) {   // runs in the background; poll with {importStatus:"walk"}
        imports[c.asset] = { state: 'working' };
        C.importFootage(c.asset, c.importFootage, c.options).then(r => { imports[c.asset] = { state: 'done', result: r }; }, e => { imports[c.asset] = { state: 'error', error: e.message }; });
        return { started: c.asset, next: 'poll {op:"cutscene", importStatus:"' + c.asset + '"}' };
      }
      if (c.importStatus) return imports[c.importStatus] || { state: 'unknown' };
      return { cutscenes: C.list(), playing: C.playing, presets: Object.keys(PRESETS) };
    }, [
      'Cutscenes (full-screen, finer-density story scenes; see docs/CUTSCENES.md). Ops, all as {op:"cutscene", ...}:',
      '  {create:"intro", look:{preset:"rotoscope"}}            new empty cutscene. Presets: rotoscope (mono + red accent, 10fps, jitter, grain, scanlines), noir, vhs, none',
      '  {frames:["ascii","ascii",...], asset:"door", fps:8}  make a frames asset from ASCII text frames (drawn by you)',
      '  {importFootage:"https://.../clip.mp4", asset:"walk", options:{cols:170, fps:10}}   convert video/GIF/image to frames (background; then {importStatus:"walk"})',
      '  {addShot:{duration:4, art:{asset:"walk"}, caption:{speaker:"Elder", text:"..."}, sound:[{at:0,sfx:"blip"},{at:0,music:"C2 _ G2 _",bpm:50}], fadeIn:.5}, cutscene:"intro"}',
      '  {setShot:0, cutscene:"intro", patch:{duration:2}}  |  {removeShot:0, cutscene:"intro"}  |  {look:{fontSize:6}, cutscene:"intro"}',
      '  {get:"intro"} returns the document (save it as cutscenes/intro.cutscene.json)  |  {play:"intro"}  |  {skip:true}  |  {list:true}',
      'To trigger it in a game: give an entity the behaviour PlayCutscene {cutscene:"intro", trigger:"touch"}, or call game.cutscene.play("intro").',
    ].join('\n'));
  });
})();
