/* ACI editor panel: Animation timeline (bottom dock).
   Shows the frames of the selected entity's sprite asset. Click a frame to scrub the entity in the scene view,
   press Play to preview, drag frames to reorder, duplicate / delete frames, change FPS, add animations,
   and open the full sprite painter. Works on assets/<name>.aci.json through ed.fs. */
(function () {
  'use strict';
  const E = window.ACIEditor; if (!E) return;
  const h = (tag, a, ...kids) => { const el = document.createElement(tag); for (const k in a || {}) { if (k === 'class') el.className = a[k]; else if (k === 'style') el.style.cssText = a[k]; else if (k.startsWith('on')) el.addEventListener(k.slice(2), a[k]); else if (a[k] !== false && a[k] != null) el.setAttribute(k, a[k] === true ? '' : a[k]); } kids.flat().forEach(c => c != null && c !== false && el.append(c.nodeType ? c : document.createTextNode(c))); return el; };
  const css = `.tl{display:flex;flex-direction:column;height:100%;font:13px var(--sans);color:var(--ink);padding:6px 10px;gap:6px}
  .tl .bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap} .tl button,.tl select,.tl input{background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:3px 8px;font:inherit} .tl button{cursor:pointer} .tl button:hover{border-color:var(--accent)} .tl button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
  .tl .strip{display:flex;gap:6px;overflow:auto;flex:1;align-items:flex-start;padding:4px 0} .tl .fr{flex:none;border:2px solid var(--line);border-radius:6px;background:#05070d;padding:3px;cursor:pointer;text-align:center;font-size:10px;color:var(--muted);position:relative} .tl .fr[aria-current=true]{border-color:var(--accent)} .tl .fr.play{box-shadow:0 0 0 2px var(--ok)} .tl .fr.drop{border-color:var(--ok)}
  .tl .hint{color:var(--muted)} .tl .grow{flex:1} .tl .scrub{width:160px}`;
  const mono = '"JetBrains Mono","IBM Plex Mono",Menlo,Consolas,monospace';

  E.registerPanel({
    id: 'timeline', title: 'Animation', icon: '🎞', dock: 'bottom',
    mount(el, ed) {
      if (!document.getElementById('tl-css')) document.head.append(h('style', { id: 'tl-css' }, css));
      const root = h('div', { class: 'tl' }); el.append(root);
      const S = { ent: null, asset: null, path: null, json: null, anim: null, frame: 0, playing: true, token: 0 };
      const liveOf = e => e && (ed.game.entities || []).find(x => x === e || (e.id != null && x.id === e.id) || (e.name && x.name === e.name));
      const assetName = e => { const s = e && e.sprite; if (!s) return null; return typeof s === 'string' ? null : s.asset || s.name || null; };
      const write = async (json, label) => {
        const before = S.raw, after = JSON.stringify(json, null, 1); if (before === after) return;
        await ed.fs.write(S.path, after); S.raw = after; S.json = json; ed.refreshAssets(); ed.markDirty && ed.markDirty();
        const p = S.path; ed.undo.push(label, async () => { await ed.fs.write(p, before); S.raw = before; S.json = JSON.parse(before); ed.refreshAssets(); render(); }, async () => { await ed.fs.write(p, after); S.raw = after; S.json = JSON.parse(after); ed.refreshAssets(); render(); });
      };
      async function load() {
        const e = ed.selection; S.ent = e; S.asset = assetName(e); S.json = null;
        if (S.asset) { S.path = 'assets/' + S.asset.replace(/\.aci\.json$/, '') + '.aci.json'; try { S.raw = await ed.fs.read(S.path); S.json = JSON.parse(S.raw); } catch (err) { S.json = null; } }
        if (S.json) { const names = Object.keys(S.json.anims || {}); const want = (e && e.anim) || S.anim; S.anim = names.includes(want) ? want : names[0]; S.frame = Math.min(S.frame, Math.max(0, (S.json.anims[S.anim] || []).length - 1)); }
        render();
      }
      function thumb(f) {
        let spr; try { spr = ACI.fromAsset({ aci: 1, w: S.json.w, h: S.json.h, palette: S.json.palette, bg: S.json.bg, color: S.json.color, anims: { a: [f] } }); } catch (e) { return h('span', {}, '?'); }
        const fr = spr.anims.a[0], z = Math.max(1.5, Math.min(9, 130 / (fr.w * 0.6))), cw = z * .6, chh = z * 1.18, d = devicePixelRatio || 1, c = h('canvas'), x = c.getContext('2d');
        c.width = fr.w * cw * d; c.height = fr.h * chh * d; c.style.width = fr.w * cw + 'px'; c.style.height = fr.h * chh + 'px'; x.setTransform(d, 0, 0, d, 0, 0); x.font = z + 'px ' + mono; x.textBaseline = 'top';
        fr.cells.forEach((cell, i) => { const px = (i % fr.w) * cw, py = ((i / fr.w) | 0) * chh; if (cell.bg) { x.fillStyle = cell.bg; x.fillRect(px, py, cw, chh); } if (cell.ch !== ' ') { x.fillStyle = cell.fg; if (z < 5) x.fillRect(px, py, cw + .5, chh * 0.8); else x.fillText(cell.ch, px, py + Math.round((chh - z) / 2)); } });
        return c;
      }
      const setLive = () => { const L = liveOf(S.ent); if (!L) return; if (S.json && L.sprite && L.sprite.anims && L.sprite.anims[S.anim]) { L.anim = S.anim; if (!S.playing) { L.fps = 1e-6; L.frame = S.frame; } else if (L.fps === 1e-6) L.fps = undefined; } };
      let dragFrom = -1;
      function render() {
        root.textContent = '';
        if (!S.ent) return root.append(h('div', { class: 'hint' }, 'Select something in the scene to see its animation.'));
        if (!S.asset) return root.append(h('div', { class: 'hint' }, typeof S.ent.sprite === 'string' ? 'This entity uses text characters. Turn it into a sprite asset to animate it (Assets panel → New sprite, or import a picture).' : '“' + (S.ent.name || 'This object') + '” has no sprite asset yet. Make one in the Assets panel (New sprite), or import an image.'));
        if (!S.json) return root.append(h('div', { class: 'hint' }, 'Could not read ' + S.path + '.'));
        const names = Object.keys(S.json.anims), frames = S.json.anims[S.anim] || [];
        const mut = async (label, fn) => { const j = JSON.parse(JSON.stringify(S.json)); fn(j); await write(j, label); render(); };
        const bar = h('div', { class: 'bar' },
          h('b', {}, (S.ent.name || 'entity') + ' · ' + S.asset),
          h('select', { onchange: e => { S.anim = e.target.value; S.frame = 0; if (S.ent && 'anim' in S.ent) S.ent.anim = S.anim; setLive(); ed.markDirty && ed.markDirty(); render(); } }, names.map(n => h('option', { value: n, selected: n === S.anim }, n))),
          h('button', { 'aria-pressed': S.playing, onclick: () => { S.playing = !S.playing; setLive(); render(); } }, S.playing ? '⏸ Pause' : '▶ Play'),
          h('label', { class: 'hint' }, 'FPS ', h('input', { type: 'number', min: 1, max: 30, value: S.json.fps || 6, style: 'width:56px', onchange: e => mut('Change FPS', j => { j.fps = Math.max(1, Math.min(30, +e.target.value || 6)); }) })),
          h('button', { onclick: () => mut('Duplicate frame', j => { j.anims[S.anim].splice(S.frame + 1, 0, JSON.parse(JSON.stringify(j.anims[S.anim][S.frame]))); S.frame++; }) }, '⎘ Duplicate'),
          h('button', { onclick: () => { if (frames.length < 2) return; mut('Delete frame', j => { j.anims[S.anim].splice(S.frame, 1); S.frame = Math.max(0, S.frame - 1); }); } }, '🗑 Delete'),
          h('button', { onclick: () => { if (S.frame > 0) mut('Move frame', j => { const a = j.anims[S.anim]; [a[S.frame - 1], a[S.frame]] = [a[S.frame], a[S.frame - 1]]; S.frame--; }); } }, '◀'),
          h('button', { onclick: () => { if (S.frame < frames.length - 1) mut('Move frame', j => { const a = j.anims[S.anim]; [a[S.frame + 1], a[S.frame]] = [a[S.frame], a[S.frame + 1]]; S.frame++; }); } }, '▶'),
          h('button', { onclick: () => { const n = (prompt('Name of the new animation', 'walk') || '').trim(); if (n && !S.json.anims[n]) mut('Add animation', j => { j.anims[n] = [JSON.parse(JSON.stringify(j.anims[S.anim][S.frame]))]; S.anim = n; S.frame = 0; }); } }, '+ Animation'),
          h('span', { class: 'grow' }), h('button', { onclick: () => ed.openAsset(S.path) }, '✎ Edit in sprite painter'));
        const strip = h('div', { class: 'strip' });
        frames.forEach((f, i) => { const c = h('div', { class: 'fr', draggable: true, 'aria-current': i === S.frame, 'data-i': i, onclick: () => { S.frame = i; S.playing = false; setLive(); render(); }, ondragstart: () => (dragFrom = i), ondragover: e => { e.preventDefault(); c.classList.add('drop'); }, ondragleave: () => c.classList.remove('drop'), ondrop: e => { e.preventDefault(); if (dragFrom >= 0 && dragFrom !== i) { const from = dragFrom; dragFrom = -1; mut('Reorder frames', j => { const a = j.anims[S.anim], [m] = a.splice(from, 1); a.splice(i, 0, m); S.frame = i; }); } } }, thumb(f), h('div', {}, String(i + 1))); strip.append(c); });
        root.append(bar, strip); setLive();
      }
      // highlight the frame the live entity is on while playing
      (function poll() { if (!el.isConnected && el._seen) return; if (el.isConnected) el._seen = true; if (S.playing && S.json) { const L = liveOf(S.ent); if (L && L.anim === S.anim) { const n = (S.json.anims[S.anim] || []).length, f = n ? L.frame % n : 0; root.querySelectorAll('.fr').forEach(c => c.classList.toggle('play', +c.dataset.i === f)); } } requestAnimationFrame(poll); })();
      ed.on('select', load); ed.on('assets', () => { if (S.asset) load(); }); ed.on('scene', load); load();
    },
  });
})();
