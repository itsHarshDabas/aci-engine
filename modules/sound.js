/* ACI modules/sound.js: plugin 'sound'. WebAudio only, zero asset files, silent no-op without AudioContext.
   The AudioContext is created on the first user gesture (key/pointer/touch); sfx requested before that are dropped,
   music requested before that starts as soon as audio unlocks. */
(function (global) {
  'use strict';
  const ACI = global.ACI = global.ACI || {};
  const PRESETS = {
    jump:    { type: 'square', freq: 220, freq2: 680, dur: 0.18, vol: 0.25 },
    coin:    { type: 'square', notes: [988, 1319], step: 0.07, dur: 0.3, vol: 0.2 },
    hit:     { type: 'sawtooth', freq: 220, freq2: 50, dur: 0.18, vol: 0.3, noiseMix: true },
    explode: { noise: true, dur: 0.7, vol: 0.5, filter: { from: 2200, to: 80 } },
    powerup: { type: 'square', notes: [262, 330, 392, 523, 659, 784, 1047], step: 0.06, dur: 0.5, vol: 0.2 },
    blip:    { type: 'square', freq: 520, dur: 0.06, vol: 0.2 },
    laser:   { type: 'sawtooth', freq: 1400, freq2: 200, dur: 0.2, vol: 0.2 },
    select:  { type: 'triangle', notes: [440, 660], step: 0.05, dur: 0.15, vol: 0.3 },
    fall:    { type: 'triangle', freq: 600, freq2: 80, dur: 0.5, vol: 0.3 },
  };
  const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  // 'C4' 'F#3' 'Bb5' -> Hz ; numbers pass through ; null if not a note
  function noteFreq(n) {
    if (typeof n === 'number') return n;
    const m = /^([a-g])([#b]?)(-?\d)?$/i.exec(String(n)); if (!m) return null;
    const s = SEMI[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0), oct = m[3] === undefined ? 4 : +m[3];
    return 440 * Math.pow(2, ((oct + 1) * 12 + s - 69) / 12);
  }
  // 'C4 E4:2 - _ G4' -> [{freq|null, steps}]; '_' rest, '-' sustain previous, ':n' length in steps
  function parseNotes(str) {
    const out = [];
    String(str).trim().split(/\s+/).filter(Boolean).forEach(tok => {
      if (tok === '-' && out.length) { out[out.length - 1].steps++; return; }
      const [n, len] = tok.split(':'), steps = len ? Math.max(1, +len) : 1;
      out.push({ freq: n === '_' || n === '.' ? null : noteFreq(n), steps });
    });
    return out;
  }
  ACI.noteFreq = noteFreq;

  ACI.plugin('sound', function install(G) {
    const AC = global.AudioContext || global.webkitAudioContext;
    let ctx = null, master, sfxG, musG, unlocked = false, noiseBuf = null;
    const vol = { master: 0.8, sfx: 1, music: 0.6 };
    const presets = Object.assign({}, PRESETS);
    const S = G.sound = { stats: { requested: 0, played: 0 }, muted: false, available: !!AC };
    Object.defineProperty(S, 'state', { get: () => (ctx ? ctx.state : AC ? 'locked' : 'unavailable') });

    function ensure() {
      if (ctx || !AC || !unlocked) return ctx;
      try {
        ctx = new AC(); master = ctx.createGain(); sfxG = ctx.createGain(); musG = ctx.createGain();
        sfxG.connect(master); musG.connect(master); master.connect(ctx.destination); applyVol();
      } catch (e) { ctx = null; S.available = false; }
      return ctx;
    }
    function applyVol() { if (!ctx) return; master.gain.value = S.muted ? 0 : vol.master; sfxG.gain.value = vol.sfx; musG.gain.value = vol.music; }
    const unlock = () => {
      unlocked = true; const c = ensure(); if (!c) return;
      if (c.state !== 'running') { try { const p = c.resume(); p && p.catch && p.catch(() => {}); } catch (e) {} }
      else { ['keydown', 'pointerdown', 'touchstart'].forEach(e => window.removeEventListener(e, unlock, true)); }
      musicTick();
    };
    ['keydown', 'pointerdown', 'touchstart'].forEach(e => window.addEventListener(e, unlock, true));
    const live = () => { const c = ensure(); return c && c.state === 'running' ? c : null; };

    function noise() {
      if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      return noiseBuf;
    }
    // one voice. o: type freq freq2 notes step dur vol attack noise filter{from,to,type} vibrato
    function voice(o, when, dest) {
      const c = ctx, t0 = when == null ? c.currentTime : when, dur = o.dur || 0.2, v = o.vol == null ? 0.3 : o.vol, a = o.attack || 0.004;
      const g = c.createGain(); g.connect(dest);
      let src;
      if (o.noise) { src = c.createBufferSource(); src.buffer = noise(); src.loop = true; } else { src = c.createOscillator(); src.type = o.type || 'square'; }
      let node = src;
      if (o.filter) {
        const f = c.createBiquadFilter(); f.type = o.filter.type || 'lowpass';
        f.frequency.setValueAtTime(Math.max(20, o.filter.from), t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, o.filter.to || o.filter.from), t0 + dur);
        src.connect(f); node = f;
      }
      node.connect(g);
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      if (!o.noise) {
        const f0 = noteFreq(o.freq) || 440;
        if (o.notes) o.notes.forEach((n, i) => src.frequency.setValueAtTime(noteFreq(n) || 440, t0 + i * (o.step || 0.06)));
        else { src.frequency.setValueAtTime(f0, t0); if (o.freq2) src.frequency.exponentialRampToValueAtTime(Math.max(1, noteFreq(o.freq2)), t0 + dur); }
        if (o.vibrato) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vibrato.rate || 6; lg.gain.value = o.vibrato.depth || 8; l.connect(lg); lg.connect(src.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
      }
      src.start(t0); src.stop(t0 + dur + 0.05);
    }
    function guard(fn) { try { return fn(); } catch (e) { return false; } }

    S.define = (name, params) => { presets[name] = Object.assign({}, params); return S; };
    S.names = () => Object.keys(presets);
    S.sfx = (name, over = {}) => {
      S.stats.requested++;
      const p = presets[name]; if (!p) { console.warn('ACI sound: unknown sfx "' + name + '". Try: ' + S.names().join(', ')); return false; }
      const c = live(); if (!c) return false;
      const o = Object.assign({}, p, over);
      if (over.pitch) { ['freq', 'freq2'].forEach(k => { if (o[k]) o[k] = noteFreq(o[k]) * over.pitch; }); if (o.notes) o.notes = o.notes.map(n => noteFreq(n) * over.pitch); }
      return guard(() => { voice(o, null, sfxG); if (o.noiseMix) voice({ noise: true, dur: o.dur, vol: (o.vol || 0.3) * 0.7, filter: { from: 3000, to: 200 } }, null, sfxG); S.stats.played++; return true; });
    };
    S.tone = (freq, dur = 0.2, type = 'square', v = 0.25) => {
      S.stats.requested++; const c = live(); if (!c) return false;
      return guard(() => { voice({ type, freq: noteFreq(freq) || 440, dur, vol: v }, null, sfxG); S.stats.played++; return true; });
    };

    // ---- music: S.music('C4 E4 G4 _', {bpm:120, loop:true, wave:'square', division:2}) ; array of strings = several tracks
    const M = { tracks: [], timer: null, playing: false };
    function musicTick() {
      if (!M.playing) return; const c = live(); if (!c) return;
      M.tracks.forEach(tr => {
        if (tr.done) return; if (tr.t == null) tr.t = c.currentTime + 0.05;
        while (tr.t < c.currentTime + 0.3) {
          const ev = tr.ev[tr.i], len = ev.steps * tr.step;
          if (ev.freq) guard(() => voice({ type: tr.wave, freq: ev.freq, dur: len * 0.92, vol: tr.vol, attack: 0.006 }, tr.t, musG));
          tr.t += len; tr.i++;
          if (tr.i >= tr.ev.length) { if (M.loop) tr.i = 0; else { tr.done = true; break; } }
        }
      });
      if (M.tracks.every(t => t.done)) { clearInterval(M.timer); M.timer = null; M.playing = false; }
    }
    S.music = (src, o = {}) => {
      S.stop(); const list = [].concat(src), bpm = o.bpm || 120, div = o.division || 2;
      M.loop = o.loop !== false; M.playing = true;
      M.tracks = list.map((s, i) => ({ ev: parseNotes(s), i: 0, t: null, done: false, step: 60 / bpm / div,
        wave: [].concat(o.wave || 'square')[i % [].concat(o.wave || 'square').length], vol: [].concat(o.vol || 0.18)[i % [].concat(o.vol || 0.18).length] })).filter(t => t.ev.length);
      if (!M.tracks.length) { M.playing = false; return S; }
      M.timer = setInterval(musicTick, 60); musicTick(); return S;
    };
    S.stop = () => { M.playing = false; M.tracks = []; if (M.timer) clearInterval(M.timer); M.timer = null; return S; };
    Object.defineProperty(S, 'musicPlaying', { get: () => M.playing });
    S.volume = v => { if (v === undefined) return vol.master; vol.master = Math.max(0, Math.min(1, v)); applyVol(); return S; };
    S.sfxVolume = v => { vol.sfx = Math.max(0, Math.min(1, v)); applyVol(); return S; };
    S.musicVolume = v => { vol.music = Math.max(0, Math.min(1, v)); applyVol(); return S; };
    S.mute = (on) => { S.muted = on === undefined ? !S.muted : !!on; applyVol(); return S; };

    G.on('destroy', () => { S.stop(); ['keydown', 'pointerdown', 'touchstart'].forEach(e => window.removeEventListener(e, unlock, true)); try { ctx && ctx.close(); } catch (e) {} ctx = null; });

    G.defineCommand('sound', c => {
      if (c.define) S.define(c.define.name, c.define.params);
      if (c.stop) S.stop();
      if (c.music) S.music(c.music, { bpm: c.bpm, loop: c.loop, wave: c.wave, vol: c.vol, division: c.division });
      if (c.sfx) S.sfx(c.sfx, c.params || {});
      if (c.tone) S.tone(c.tone.freq, c.tone.dur, c.tone.type, c.tone.vol);
      if (c.volume !== undefined) S.volume(c.volume);
      if (c.mute !== undefined) S.mute(c.mute);
      return { state: S.state, sfx: S.names(), musicPlaying: M.playing, muted: S.muted };
    }, 'sound: {sfx:"coin"} | {tone:{freq:"C5",dur:.2,type:"square"}} | {music:"C4 E4 G4 _",bpm:120,loop:true,wave:"square"} | {stop:true} | {volume:0..1} | {mute:true} | {define:{name,params}}. Example: {op:"sound",sfx:"coin"}. Audio starts after first user gesture.');
  });
})(typeof window !== 'undefined' ? window : globalThis);
