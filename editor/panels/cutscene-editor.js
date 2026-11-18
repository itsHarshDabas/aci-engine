/* ACI editor panel: Cutscene editor.
   Opens cutscenes/<name>.cutscene.json (format in docs/CUTSCENES.md): shot list on the left, live preview in the
   middle (game.cutscene.play with a container), inspector for the selected shot on the right.
   Also adds a "Cutscenes" panel (left dock) and window.ACIEditor.newCutscene(ed, name). */
(function () {
  'use strict';
  const E = window.ACIEditor; if (!E) return;
  const h = (tag, a, ...kids) => { const el = document.createElement(tag); for (const k in a || {}) { if (k === 'class') el.className = a[k]; else if (k === 'style') el.style.cssText = a[k]; else if (k.startsWith('on')) el.addEventListener(k.slice(2), a[k]); else if (a[k] !== false && a[k] != null) el.setAttribute(k, a[k] === true ? '' : a[k]); } kids.flat().forEach(c => c != null && c !== false && el.append(c.nodeType ? c : document.createTextNode(c))); return el; };
  const clone = o => JSON.parse(JSON.stringify(o));
  const num = (v, d, lo, hi) => { v = parseFloat(v); if (!isFinite(v)) v = d; if (lo != null) v = Math.max(lo, v); if (hi != null) v = Math.min(hi, v); return v; };
  const SFX = ['blip', 'coin', 'jump', 'hit', 'explode', 'powerup', 'laser', 'select', 'fall'];
  const isHex = s => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);

  const css = `.cs{display:grid;grid-template-columns:260px minmax(300px,1fr) 300px;height:100%;min-height:0;font:13px var(--sans);color:var(--ink);background:var(--bg)}
  .cs *{box-sizing:border-box} .cs button,.cs select,.cs input,.cs textarea{background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:4px 8px;font:inherit;min-width:0} .cs button{cursor:pointer} .cs button:hover{border-color:var(--accent)} .cs button:disabled{opacity:.45;cursor:default}
  .cs button.pri{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600} .cs button.dng{color:var(--danger)} .cs input[type=color]{padding:0;width:36px;height:26px} .cs input[type=checkbox]{width:auto} .cs input[type=range]{padding:0;width:100%}
  .cs textarea{width:100%;resize:vertical;font-family:var(--mono)}
  .cs .col{display:flex;flex-direction:column;min-height:0;overflow:auto;background:var(--panel);padding:10px;gap:8px} .cs .col.l{border-right:1px solid var(--line)} .cs .col.r{border-left:1px solid var(--line)}
  .cs .mid{display:flex;flex-direction:column;gap:10px;padding:12px;min-height:0;overflow:auto;align-items:center}
  .cs h4{margin:6px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)} .cs .hint{color:var(--muted);font-size:12px} .cs .grow{flex:1}
  .cs .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap} .cs .fld{display:grid;grid-template-columns:96px 1fr;gap:6px;align-items:center} .cs .fld>label{color:var(--muted);font-size:12px}
  .cs .card{display:grid;grid-template-columns:28px 1fr auto;gap:6px;align-items:center;border:2px solid var(--line);border-radius:8px;background:var(--panel-2);padding:6px;cursor:pointer} .cs .card[aria-current=true]{border-color:var(--accent)} .cs .card.drop{border-color:var(--ok)}
  .cs .card .n{font:700 14px var(--mono);color:var(--muted);text-align:center} .cs .card .t{overflow:hidden;white-space:nowrap;text-overflow:ellipsis} .cs .card .cap{color:var(--muted);font-size:11px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis} .cs .card .mini{display:flex;flex-direction:column;gap:2px} .cs .card .mini button{padding:0 5px;font-size:10px;line-height:14px}
  .cs .stage{width:100%;max-width:720px;aspect-ratio:16/9;background:#000;border:1px solid var(--line);border-radius:8px;overflow:hidden;position:relative} .cs .stage .msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;color:var(--muted)}
  .cs .fld>div{min-width:0} .cs .col>*{flex-shrink:0} .cs .col{overflow-x:hidden} .cs .row input[type=text]{width:100%}
  .cs .cue{display:grid;grid-template-columns:56px 80px 1fr auto;gap:4px;align-items:center}`;

  function normalize(raw) {
    let d; try { d = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : {}) : (raw || {}); } catch (e) { d = {}; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
    d.format = 'aci-cutscene'; d.v = 1; d.name = typeof d.name === 'string' ? d.name : '';
    d.look = Object.assign({ fontSize: 6, background: '#000000', color: '#e8e8e8', letterbox: true }, d.look && typeof d.look === 'object' ? d.look : {});
    d.look.fontSize = num(d.look.fontSize, 6, 4, 12); if (!isHex(d.look.background)) d.look.background = '#000000'; if (!isHex(d.look.color)) d.look.color = '#e8e8e8';
    d.skippable = d.skippable !== false;
    d.shots = (Array.isArray(d.shots) ? d.shots : []).filter(s => s && typeof s === 'object').map(s => { s = Object.assign({}, s); s.duration = num(s.duration, 3, 0); if (s.sound && !Array.isArray(s.sound)) s.sound = [s.sound]; s.sound = (s.sound || []).filter(c => c && typeof c === 'object'); return s; });
    if (d.onEnd && typeof d.onEnd !== 'object') d.onEnd = null;
    return d;
  }
  const newShot = () => ({ duration: 3, art: null, tint: null, fadeIn: 0.4, fadeOut: 0.4, caption: { speaker: '', text: '', speed: 28, pos: 'bottom', color: '#e8e8e8' }, sound: [], waitForInput: false });
  const starter = name => ({ format: 'aci-cutscene', v: 1, name, look: { fontSize: 6, background: '#000000', color: '#e8e8e8', letterbox: true }, skippable: true, shots: [Object.assign(newShot(), { duration: 4, caption: { speaker: '', text: 'Once upon a time...', speed: 28, pos: 'bottom', color: '#e8e8e8' } })], onEnd: null });

  E.registerAssetEditor({
    kind: 'cutscene',
    match: p => /(^|\/)cutscenes\/[^/]+\.cutscene\.json$/i.test(p),
    open(path, text, ed) {
      if (!document.getElementById('cs-css')) document.head.append(h('style', { id: 'cs-css' }, css));
      const S = { doc: normalize(text), sel: 0, playing: false, drag: -1 };
      if (!S.doc.name) S.doc.name = path.replace(/^.*\//, '').replace(/\.cutscene\.json$/i, '');
      const ser = () => JSON.stringify(S.doc, null, 2) + '\n';
      let saved = ser();
      const root = h('div', { class: 'cs' });
      const colL = h('div', { class: 'col l' }), mid = h('div', { class: 'mid' }), colR = h('div', { class: 'col r' });
      root.append(colL, mid, colR);
      const stage = h('div', { class: 'stage' });
      const shot = () => S.doc.shots[S.sel] || null;

      // every edit: snapshot before/after, undo entry, dirty flag
      function commit(label, fn, rerender) {
        const before = ser(); fn(); const after = ser(); if (before === after) return;
        const bSel = S.sel; S.sel = Math.max(0, Math.min(S.sel, S.doc.shots.length - 1));
        const aSel = S.sel;
        const restore = (json, sel) => () => { S.doc = normalize(json); S.sel = Math.min(sel, Math.max(0, S.doc.shots.length - 1)); build(); ed.markDirty && ed.markDirty(); };
        ed.undo && ed.undo.push && ed.undo.push(label, restore(before, bSel), restore(after, aSel));
        ed.markDirty && ed.markDirty();
        if (rerender !== false) build(); else renderTotal();
      }

      const aiHint = s => 'Cutscene shot' + (s && s.caption && s.caption.text ? ': ' + s.caption.text : '') + '. Look: rotoscope, mono ASCII, high contrast, one accent colour (' + ((S.doc.look && S.doc.look.preset) || 'rotoscope') + ').';
      async function aiArt(s) {
        const D = E.cutsceneDraw; if (!ed.ai || !D || !D.aiFrames) return;
        let files = []; try { files = ((await ed.fs.list()) || []).map(f => f.path); } catch (e) {}
        let asset = s.art && s.art.asset; if (!asset) { const base = (S.doc.name || 'cutscene').toLowerCase().replace(/[^a-z0-9_-]+/g, '-') + '-shot' + (S.sel + 1); asset = base; let i = 2; while (files.includes('assets/' + asset + '.aci.json')) asset = base + '-' + i++; }
        try {
          const text = await D.aiFrames(ed, { name: asset, w: 80, h: 30, frames: 8, hint: aiHint(s) }); if (!text) return;
          const idx = S.sel; await ed.fs.write('assets/' + asset + '.aci.json', text); ed.refreshAssets && ed.refreshAssets();
          try { const sp = window.ACI.fromAsset(text); if (ed.game) (ed.game.assets = ed.game.assets || {})[asset] = sp; if (ed.assets && typeof ed.assets === 'object') ed.assets[asset] = sp; } catch (e) {}
          S.sel = idx; commit('Generate art', () => { const sh = S.doc.shots[idx]; if (sh) sh.art = { asset, anim: 'default', fps: 8, loop: true, fit: 'contain' }; });
        } catch (e) { ed.log && ed.log('Generate failed: ' + (e && e.message || e), 'error'); }
      }
      async function aiShot() {
        if (!ed.ai || !ed.ai.dialog) return;
        const hint = 'Return ONE cutscene shot as JSON: {"duration":4 (seconds, 0 = wait for Continue),"art":{"asset":"name","anim":"default","fps":8,"loop":true,"fit":"contain"} | {"text":"raw ascii","color":"#e8e8e8"} | null,"tint":null,"fadeIn":0.5,"fadeOut":0.5,"caption":{"speaker":"Elder","text":"Long ago, the lanterns went dark.","speed":28,"pos":"bottom|top|center","color":"#e8c870"},"sound":[{"at":0,"sfx":"blip"} | {"at":0,"music":"C3 _ G3 _","bpm":70,"loop":true} | {"at":3,"stop":"music"}],"waitForInput":false}. sfx names: ' + SFX.join(', ') + '. Existing art assets: ' + Object.keys(ed.assets || {}).slice(0, 30).join(', ') + '. Previous shot caption: ' + ((S.doc.shots[S.sel] && S.doc.shots[S.sel].caption && S.doc.shots[S.sel].caption.text) || '(none)') + '.';
        try {
          const j = await ed.ai.dialog({ kind: 'json', size: false, title: 'Generate shot', hint }); if (!j || typeof j !== 'object') return;
          const sh = normalize({ shots: [Array.isArray(j) ? j[0] : (j.shots ? j.shots[0] : j)] }).shots[0]; if (!sh) return;
          const merged = Object.assign(newShot(), sh); if (merged.caption && typeof merged.caption !== 'object') merged.caption = { text: String(merged.caption) };
          commit('Generate shot', () => { S.doc.shots.splice(S.doc.shots.length ? S.sel + 1 : 0, 0, merged); S.sel = S.doc.shots.length > 1 ? S.sel + 1 : 0; });
        } catch (e) { ed.log && ed.log('Generate failed: ' + (e && e.message || e), 'error'); }
      }

      // ---- frame painter (editor/panels/cutscene-draw.js)
      async function drawFrames(s) {
        const D = E.cutsceneDraw; if (!D) { ed.log && ed.log('The frame painter (cutscene-draw.js) is not loaded.', 'error'); alert('The frame painter is not available in this editor build.'); return; }
        let asset = s.art && s.art.asset;
        if (!asset) {
          let files = []; try { files = ((await ed.fs.list()) || []).map(f => f.path); } catch (e) {}
          const base = (S.doc.name || 'cutscene').toLowerCase().replace(/[^a-z0-9_-]+/g, '-') + '-shot' + (S.sel + 1); let n = base, i = 2; while (files.includes('assets/' + n + '.aci.json')) n = base + '-' + i++;
          asset = n; commit('Add drawn art', () => { s.art = { asset, anim: 'default', fps: 8, loop: true, fit: 'contain' }; });
        }
        const L = S.doc.look || {};
        try {
          await D.open(ed, { path: 'assets/' + asset + '.aci.json', name: asset, anim: s.art && s.art.anim, look: L, tint: s.tint, host: root, hint: aiHint(s),
            onSaved: r => { commit('Update drawn art', () => { const sh = S.doc.shots[S.sel] || s; sh.art = Object.assign({}, sh.art, { asset: r.name, anim: r.anim, fps: r.fps }); }); } });
        } catch (e) { ed.log && ed.log('Could not open the frame painter: ' + (e && e.message || e), 'error'); }
      }

      // ---- inputs
      const field = (label, ...ctl) => h('div', { class: 'fld' }, h('label', {}, label), h('div', { class: 'row' }, ctl));
      const tIn = (val, on, attrs) => h('input', Object.assign({ type: 'text', value: val == null ? '' : val, onchange: e => on(e.target.value), style: 'flex:1' }, attrs));
      const nIn = (val, on, attrs) => h('input', Object.assign({ type: 'number', value: val, step: 'any', style: 'width:80px', onchange: e => on(e.target.value) }, attrs));
      const cIn = (val, on) => h('input', { type: 'color', value: isHex(val) ? val : '#ffffff', onchange: e => on(e.target.value) });
      const sel = (val, opts, on) => h('select', { onchange: e => on(e.target.value) }, opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: v === val }, l); }));
      const chk = (val, on) => h('input', { type: 'checkbox', checked: !!val, onchange: e => on(e.target.checked) });

      // ---- left: shot list
      let totalEl;
      function renderTotal() {
        if (!totalEl) return;
        const t = S.doc.shots.reduce((a, s) => a + (s.duration || 0), 0), waits = S.doc.shots.filter(s => !s.duration || s.waitForInput).length;
        totalEl.textContent = 'Total ' + t.toFixed(1).replace(/\.0$/, '') + 's' + (waits ? ' + ' + waits + ' wait' + (waits > 1 ? 's' : '') + ' for input' : '') + ' · ' + S.doc.shots.length + ' shot' + (S.doc.shots.length === 1 ? '' : 's');
      }
      const artName = s => !s.art ? 'no art (black)' : s.art.text != null ? 'raw text' : (s.art.asset || 'no art');
      function buildList() {
        colL.textContent = '';
        totalEl = h('div', { class: 'hint', 'data-total': '' });
        colL.append(h('div', { class: 'row' }, h('b', {}, 'Shots'), h('span', { class: 'grow' }), h('button', { 'data-act': 'aishot', disabled: !ed.ai, title: ed.ai ? 'Ask Claude to write a whole shot' : 'AI generation is not available in this editor', onclick: aiShot }, '✦ Generate shot'), h('button', { class: 'pri', 'data-act': 'add', onclick: () => commit('Add shot', () => { S.doc.shots.splice(S.sel + 1, 0, newShot()); S.sel = Math.min(S.sel + 1, S.doc.shots.length - 1); if (S.doc.shots.length === 1) S.sel = 0; }) }, '+ Add shot')), totalEl);
        if (!S.doc.shots.length) colL.append(h('div', { class: 'hint' }, 'No shots yet. Press “+ Add shot” to begin.'));
        S.doc.shots.forEach((s, i) => {
          const cap = s.caption && s.caption.text ? (s.caption.speaker ? s.caption.speaker + ': ' : '') + s.caption.text : '(no caption)';
          const mv = (d) => ev => { ev.stopPropagation(); const j = i + d; if (j < 0 || j >= S.doc.shots.length) return; commit('Move shot', () => { const a = S.doc.shots; [a[i], a[j]] = [a[j], a[i]]; S.sel = j; }); };
          const card = h('div', { class: 'card', draggable: true, 'data-i': i, 'aria-current': i === S.sel, onclick: () => { S.sel = i; build(); },
            ondragstart: ev => { S.drag = i; try { ev.dataTransfer.setData('text/plain', String(i)); ev.dataTransfer.effectAllowed = 'move'; } catch (e) {} },
            ondragover: ev => { ev.preventDefault(); card.classList.add('drop'); }, ondragleave: () => card.classList.remove('drop'),
            ondrop: ev => { ev.preventDefault(); const from = S.drag; S.drag = -1; if (from < 0 || from === i) return build(); commit('Reorder shots', () => { const [m] = S.doc.shots.splice(from, 1); S.doc.shots.splice(i, 0, m); S.sel = i; }); } },
            h('div', { class: 'n' }, String(i + 1)),
            h('div', {}, h('div', { class: 't' }, artName(s) + ' · ' + (s.duration ? s.duration + 's' : 'wait')), h('div', { class: 'cap' }, cap)),
            h('div', { class: 'mini' }, h('button', { title: 'Move up', 'data-act': 'up', onclick: mv(-1) }, '▲'), h('button', { title: 'Move down', 'data-act': 'down', onclick: mv(1) }, '▼')));
          colL.append(card);
        });
        colL.append(h('div', { class: 'row' },
          h('button', { 'data-act': 'dup', disabled: !shot(), onclick: () => commit('Duplicate shot', () => { S.doc.shots.splice(S.sel + 1, 0, clone(shot())); S.sel++; }) }, 'Duplicate'),
          h('button', { class: 'dng', 'data-act': 'del', disabled: !shot(), onclick: () => commit('Delete shot', () => { S.doc.shots.splice(S.sel, 1); }) }, 'Delete')),
          h('div', { class: 'hint' }, 'Drag cards (or use ▲▼) to reorder.'));
        renderTotal();
      }

      // ---- middle: preview
      const btn = (label, act, fn, cls) => h('button', { class: cls || '', 'data-act': act, onclick: fn }, label);
      function stopPreview() { const g = ed.game; try { if (g && g.cutscene && g.cutscene.playing) g.cutscene.skip(); } catch (e) {} S.playing = false; }
      function play() {
        const g = ed.game; stopPreview(); stage.textContent = '';
        if (!g || !g.cutscene || typeof g.cutscene.play !== 'function') { stage.append(h('div', { class: 'msg', 'data-msg': 'nocs' }, 'Preview isn’t available yet: the cutscene module isn’t loaded in this editor. Your cutscene is still saved normally.')); return; }
        if (!S.doc.shots.length) { stage.append(h('div', { class: 'msg' }, 'Add a shot to preview it.')); return; }
        S.playing = true;
        let p; try { p = g.cutscene.play(clone(S.doc), { container: stage }); } catch (e) { S.playing = false; ed.log && ed.log('Cutscene preview failed: ' + (e && e.message || e), 'error'); stage.append(h('div', { class: 'msg' }, 'Preview failed: ' + (e && e.message || e))); return; }
        Promise.resolve(p).then(() => { S.playing = false; }, e => { S.playing = false; ed.log && ed.log('Cutscene preview failed: ' + (e && e.message || e), 'error'); });
      }
      function buildMid() {
        mid.textContent = '';
        if (!stage.childNodes.length) stage.append(h('div', { class: 'msg' }, 'Press Play to preview this cutscene here.'));
        mid.append(h('div', { class: 'row', style: 'width:100%;max-width:720px' },
          btn('▶ Play', 'play', play, 'pri'), btn('■ Stop', 'stop', () => { stopPreview(); stage.textContent = ''; stage.append(h('div', { class: 'msg' }, 'Stopped.')); }), btn('↻ Restart', 'restart', play),
          h('span', { class: 'grow' }), h('span', { class: 'hint' }, 'Space / Enter / click = Continue')), stage,
          h('div', { class: 'hint', style: 'max-width:720px' }, 'Tip: preview plays the whole cutscene from shot 1 with the sound and captions you set.'));
      }

      // ---- right: inspector
      function artSection(s) {
        const names = Object.keys(ed.assets || {}).sort();
        const cur = !s.art ? '__none' : s.art.text != null ? '__raw' : (s.art.asset || '__none');
        const opts = [['__none', 'none (black)'], ['__raw', 'raw text']].concat(names.map(n => [n, n]));
        if (!opts.some(o => o[0] === cur)) opts.push([cur, cur + ' (missing)']);
        const set = (k, v) => commit('Edit art', () => { s.art = s.art || {}; s.art[k] = v; });
        const out = [h('h4', {}, 'Art'), field('Picture', sel(cur, opts, v => commit('Change art', () => {
          if (v === '__none') s.art = null; else if (v === '__raw') s.art = { text: (s.art && s.art.text) || 'ASCII\nart', color: '#e8e8e8' };
          else s.art = { asset: v, anim: 'default', fps: 8, loop: true, fit: 'contain' };
        })))];
        if (s.art && s.art.text != null) out.push(field('Text', h('textarea', { rows: 5, value: s.art.text, onchange: e => set('text', e.target.value) }, s.art.text)), field('Colour', cIn(s.art.color || '#e8e8e8', v => set('color', v))));
        else if (s.art) {
          let anims = []; const a = ed.assets && ed.assets[s.art.asset]; try { anims = a && a.anims ? Object.keys(a.anims) : []; } catch (e) {}
          const curAnim = s.art.anim || 'default'; if (anims.length && !anims.includes(curAnim)) anims.push(curAnim);
          out.push(field('Animation', anims.length ? sel(curAnim, anims, v => set('anim', v)) : tIn(curAnim, v => set('anim', v || 'default'))),
            field('Speed (fps)', nIn(num(s.art.fps, 8, 1, 60), v => set('fps', num(v, 8, 1, 60)), { min: 1, max: 60 })),
            field('Loop', chk(s.art.loop !== false, v => set('loop', v))), field('Fit', sel(s.art.fit || 'contain', ['contain', 'cover', 'none'], v => set('fit', v))));
        }
        out.push(h('div', { class: 'row' }, h('button', { class: 'pri', 'data-act': 'draw', title: 'Paint your own frames, or trace over a GIF / video, in the rotoscope look', onclick: () => drawFrames(s) }, '✎ Draw / trace frames'), h('button', { 'data-act': 'aiart', disabled: !ed.ai, title: ed.ai ? 'Ask Claude to draw frames for this shot' : 'AI generation is not available in this editor', onclick: () => aiArt(s) }, '✦ Generate with Claude')));
        out.push(field('Tint', cIn(s.tint, v => commit('Edit tint', () => { s.tint = v; })), h('button', { disabled: !s.tint, onclick: () => commit('Clear tint', () => { s.tint = null; }) }, 'None'), h('span', { class: 'hint' }, s.tint || 'no tint')));
        return out;
      }
      function soundSection(s) {
        const out = [h('h4', {}, 'Sound cues')];
        s.sound.forEach((c, i) => {
          const kind = c.stop ? 'stop' : c.music != null ? 'music' : 'sfx';
          const val = kind === 'stop' ? 'music' : kind === 'music' ? c.music : (c.sfx || 'blip');
                    const setKind = k => commit('Edit cue', () => { const n = { at: num(c.at, 0, 0) }; if (k === 'sfx') n.sfx = 'blip'; else if (k === 'music') { n.music = 'C3 _ G3 _ E3 _ G3 _'; n.bpm = 90; n.loop = true; } else n.stop = 'music'; s.sound[i] = n; });
          const valCtl = kind === 'sfx' ? sel(val, SFX.concat(SFX.includes(val) ? [] : [val]), v => commit('Edit cue', () => { c.sfx = v; }))
            : kind === 'music' ? tIn(val, v => commit('Edit cue', () => { c.music = v; }), { placeholder: 'C3 _ G3 _' }) : h('span', { class: 'hint' }, 'stops music');
          out.push(h('div', { class: 'cue', 'data-cue': i }, nIn(num(c.at, 0, 0), v => commit('Edit cue', () => { c.at = num(v, 0, 0); }), { min: 0, style: 'width:56px', title: 'seconds into the shot' }),
            sel(kind, ['sfx', 'music', 'stop'], setKind), valCtl, h('button', { class: 'dng', title: 'Remove cue', onclick: () => commit('Remove cue', () => { s.sound.splice(i, 1); }) }, '✕')));
          if (kind === 'music') out.push(h('div', { class: 'row hint' }, 'BPM', nIn(num(c.bpm, 90, 30, 300), v => commit('Edit cue', () => { c.bpm = num(v, 90, 30, 300); }), { style: 'width:64px' }), 'Loop', chk(c.loop, v => commit('Edit cue', () => { c.loop = v; }))));
        });
        out.push(h('div', { class: 'row' }, h('button', { 'data-act': 'addcue', onclick: () => commit('Add cue', () => { s.sound.push({ at: 0, sfx: 'blip' }); }) }, '+ Add cue'), h('span', { class: 'hint' }, 'time (s) · kind · value')));
        return out;
      }
      function buildInspector() {
        colR.textContent = '';
        const s = shot();
        const L = S.doc.look;
        let errEl = h('span'); const lbl = h('span', { class: 'hint' }, 'Detail: finer↔chunkier  (font size ' + L.fontSize + ')');
        const top = [h('h4', {}, 'Cutscene settings'),
          field('Name', tIn(S.doc.name, v => commit('Rename cutscene', () => { S.doc.name = v.trim(); }))),
          h('div', { class: 'fld' }, h('label', {}, 'Detail'), h('div', { style: 'width:100%' }, h('input', { type: 'range', 'data-k': 'fontSize', min: 4, max: 12, step: 1, value: L.fontSize, oninput: e => { lbl.textContent = 'Detail: finer\u2194chunkier  (font size ' + e.target.value + ')'; }, onchange: e => commit('Change detail', () => { L.fontSize = num(e.target.value, 6, 4, 12); }, false) }), lbl)),
          field('Background', cIn(L.background, v => commit('Change background', () => { L.background = v; }))),
          field('Text colour', cIn(L.color, v => commit('Change text colour', () => { L.color = v; }))),
          field('Letterbox', chk(L.letterbox !== false, v => commit('Toggle letterbox', () => { L.letterbox = v; }))),
          field('Skippable', chk(S.doc.skippable, v => commit('Toggle skippable', () => { S.doc.skippable = v; }))),
          h('h4', {}, 'When it ends'),
          field('Go to scene', tIn((S.doc.onEnd && S.doc.onEnd.goto) || '', v => commit('Edit onEnd', () => { v = v.trim(); const o = S.doc.onEnd || {}; if (v) o.goto = v; else delete o.goto; S.doc.onEnd = Object.keys(o).length ? o : null; }), { placeholder: 'scene name (optional)' })),
          h('div', { class: 'fld' }, h('label', {}, 'Set state'), h('div', { style: 'width:100%' }, h('textarea', { rows: 2, 'data-k': 'onEndState', placeholder: '{"seenIntro": true}', onchange: e => {
            const t = e.target.value.trim(); let v = null;
            if (t) { try { v = JSON.parse(t); if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object'); } catch (err) { e.target.style.borderColor = 'var(--danger)'; errEl.textContent = 'State must be a JSON object, e.g. {"seenIntro": true}'; return; } }
            e.target.style.borderColor = ''; errEl.textContent = '';
            commit('Edit onEnd state', () => { const o = S.doc.onEnd || {}; if (v) o.state = v; else delete o.state; S.doc.onEnd = Object.keys(o).length ? o : null; }, false);
          } }, S.doc.onEnd && S.doc.onEnd.state ? JSON.stringify(S.doc.onEnd.state) : ''), h('div', { class: 'hint', style: 'color:var(--danger)' }, errEl))),
        ];
        colR.append(h('b', {}, s ? 'Shot ' + (S.sel + 1) : 'Shot'));
        if (!s) colR.append(h('div', { class: 'hint' }, 'Select or add a shot to edit it.'));
        else {
          const c = s.caption && typeof s.caption === 'object' ? s.caption : null;
          const cp = (k, v) => commit('Edit caption', () => { s.caption = s.caption && typeof s.caption === 'object' ? s.caption : {}; s.caption[k] = v; });
          colR.append(...artSection(s),
            h('h4', {}, 'Timing'),
            field('Wait for input', chk(!s.duration, v => commit('Toggle wait', () => { s.duration = v ? 0 : 3; })), h('span', { class: 'hint' }, 'until Continue')),
            field('Duration (s)', nIn(s.duration, v => commit('Edit duration', () => { s.duration = num(v, 3, 0); }), { min: 0, disabled: !s.duration, style: 'width:80px' })),
            field('Fade in (s)', nIn(num(s.fadeIn, 0, 0), v => commit('Edit fade in', () => { s.fadeIn = num(v, 0, 0); }), { min: 0, step: 0.1 })),
            field('Fade out (s)', nIn(num(s.fadeOut, 0, 0), v => commit('Edit fade out', () => { s.fadeOut = num(v, 0, 0); }), { min: 0, step: 0.1 })),
            h('h4', {}, 'Caption'),
            field('Speaker', tIn(c && c.speaker, v => cp('speaker', v))),
            h('div', { class: 'fld' }, h('label', {}, 'Text'), h('textarea', { rows: 3, 'data-k': 'capText', onchange: e => cp('text', e.target.value) }, c && c.text || '')),
            field('Speed (chars/s)', nIn(num(c && c.speed, 28, 1, 300), v => cp('speed', num(v, 28, 1, 300)), { min: 1 })),
            field('Position', sel((c && c.pos) || 'bottom', ['bottom', 'top', 'center'], v => cp('pos', v))),
            field('Colour', cIn((c && c.color) || S.doc.look.color, v => cp('color', v))),
            ...soundSection(s));
        }
        colR.append(...top);
      }

      function build() { buildList(); buildMid(); buildInspector(); }
      build();
      ed.on && ed.on('assets', () => { if (root.isConnected) buildInspector(); });
      return {
        el: root,
        save() { saved = ser(); return saved; },
        dirty() { return ser() !== saved; },
      };
    },
  });

  // ---- creation + list panel
  const slug = n => String(n == null ? '' : n).trim().toLowerCase().replace(/\.cutscene\.json$/, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  E.newCutscene = async function (ed, name) {
    const base = slug(name); if (!base) throw new Error('Please give the cutscene a name (letters, numbers, dashes).');
    let existing = []; try { existing = (await ed.fs.list() || []).map(f => f.path); } catch (e) {}
    let n = base, i = 2; while (existing.includes('cutscenes/' + n + '.cutscene.json')) n = base + '-' + i++;
    const path = 'cutscenes/' + n + '.cutscene.json';
    await ed.fs.write(path, JSON.stringify(starter(n), null, 2) + '\n');
    ed.markDirty && ed.markDirty(); ed.refreshAssets && ed.refreshAssets();
    ed.openAsset && ed.openAsset(path);
    return path;
  };

  E.registerPanel({
    id: 'cutscenes', title: 'Cutscenes', icon: '🎬', dock: 'left',
    mount(el, ed) {
      if (!document.getElementById('cs-css')) document.head.append(h('style', { id: 'cs-css' }, css));
      const root = h('div', { class: 'cs', style: 'display:block;height:auto;background:transparent;padding:8px' }); el.append(root);
      async function render() {
        let files = []; try { files = ((await ed.fs.list()) || []).map(f => f.path).filter(p => /^cutscenes\/[^/]+\.cutscene\.json$/i.test(p)).sort(); } catch (e) {}
        root.textContent = '';
        root.append(h('div', { class: 'row', style: 'margin-bottom:6px' }, h('b', {}, 'Cutscenes'), h('span', { class: 'grow' }), h('button', { class: 'pri', 'data-act': 'new', onclick: async () => {
          const name = ed.ui && ed.ui.ask ? await ed.ui.ask('New cutscene', 'Name', 'intro') : prompt('Name of the new cutscene', 'intro'); if (name == null || name === '') return;
          try { await E.newCutscene(ed, name); } catch (err) { ed.log && ed.log(err.message, 'error'); } render();
        } }, '+ New')));
        if (!files.length) root.append(h('div', { class: 'hint' }, 'No cutscenes yet. A cutscene is a short, high-detail movie with captions and sound.'));
        files.forEach(p => root.append(h('div', { class: 'row', style: 'margin:3px 0' }, h('span', { class: 'grow', style: 'overflow:hidden;text-overflow:ellipsis' }, p.replace(/^cutscenes\//, '').replace(/\.cutscene\.json$/i, '')), h('button', { 'data-open': p, onclick: () => ed.openAsset && ed.openAsset(p) }, 'Open'))));
      }
      ed.on && ed.on('assets', render); ed.on && ed.on('project', render); render();
    },
  });
})();
