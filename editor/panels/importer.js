/* ACI editor panel: Importers.
   1. "Picture, GIF or video → ASCII" (accepts image/*, video/*): opens a dialog with a live preview and the converter's options
      (style, characters, colour, dithering, size, tone), then saves assets/<name>.aci.json.
   2. "ASCII text file": a .txt becomes a sprite; frames are separated by a line of ---.
   Uses ACI.convert (modules/convert.js); it is loaded on demand if the shell hasn't already. */
(function () {
  'use strict';
  const E = window.ACIEditor; if (!E) return;
  const h = (tag, a, ...kids) => { const el = document.createElement(tag); for (const k in a || {}) { if (k === 'class') el.className = a[k]; else if (k === 'style') el.style.cssText = a[k]; else if (k.startsWith('on')) el.addEventListener(k.slice(2), a[k]); else if (a[k] !== false && a[k] != null) el.setAttribute(k, a[k] === true ? '' : a[k]); } kids.flat().forEach(c => c != null && c !== false && el.append(c.nodeType ? c : document.createTextNode(c))); return el; };
  const mono = '"JetBrains Mono","IBM Plex Mono",Menlo,Consolas,monospace';
  const css = `.imp-back{position:fixed;inset:0;background:rgba(3,5,12,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}
  .imp{display:grid;grid-template-columns:300px 1fr;gap:12px;width:min(1100px,100%);height:min(720px,100%);background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;color:var(--ink);font:13px var(--sans)}
  .imp *{box-sizing:border-box} .imp .ctl{overflow:auto;padding-right:6px} .imp h3{margin:0 0 2px;font-size:16px} .imp .sub{color:var(--muted);margin:0 0 10px} .imp label{display:block;margin:9px 0 3px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  .imp select,.imp input[type=text],.imp input[type=number]{width:100%;background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:6px} .imp input[type=range]{width:100%} .imp .val{float:right;color:var(--ink)}
  .imp .chk{display:flex;gap:6px;align-items:center;margin-top:8px;color:var(--ink);text-transform:none;font-size:13px;letter-spacing:0} .imp .chk input{margin:0}
  .imp .view{background:#05070d;border:1px solid var(--line);border-radius:8px;overflow:auto;display:flex;align-items:center;justify-content:center;padding:10px;position:relative} .imp .msg{position:absolute;left:10px;bottom:6px;color:var(--muted);font-size:12px}
  .imp .btns{grid-column:1/3;display:flex;gap:8px;justify-content:flex-end;align-items:center} .imp .btns .grow{flex:1;color:var(--muted)} .imp button{background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:7px 14px;font:inherit;cursor:pointer} .imp button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)} .imp button:hover{border-color:var(--accent)}
  .imp .presets{display:flex;gap:4px;flex-wrap:wrap} .imp .presets button{padding:3px 8px;font-size:12px}`;

  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src)); document.head.append(s); }); }
  async function needConvert() {
    if (window.ACI && ACI.convert) return;
    let err; for (const u of ['/modules/convert.js', '../modules/convert.js', 'modules/convert.js']) { try { await loadScript(u); if (ACI.convert) return; } catch (e) { err = e; } }
    throw err || new Error('ACI.convert is not available');
  }
  const safeName = f => (f.name || 'imported').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'imported';

  async function convertDialog(file, ed) {
    await needConvert();
    if (!document.getElementById('imp-css')) document.head.append(h('style', { id: 'imp-css' }, css));
    const C = ACI.convert, isVideo = /^video\//.test(file.type), isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
    // decode the source once
    let src = null, gifBuf = null, url = null;
    if (isGif) gifBuf = await file.arrayBuffer();
    else if (isVideo) {
      url = URL.createObjectURL(file); src = document.createElement('video'); src.muted = true; src.playsInline = true; src.preload = 'auto'; src.src = url;
      await new Promise((res, rej) => { src.onloadeddata = res; src.onerror = () => rej(new Error('Could not read that video.')); });
    } else { url = URL.createObjectURL(file); src = await C.load ? await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image.')); i.src = url; }) : null; }
    const rampNames = Object.keys(C.RAMPS).filter(k => k !== 'braille');
    const o = { name: safeName(file), cols: 32, mode: 'luma', ramp: 'standard', custom: '', color: 'full', dither: 'auto', contrast: 1, brightness: 0, gamma: 1, invert: false, autoLevels: true, bg: false, fps: 8, frames: 40, res: '1', step: 1 };
    let sprite = null, timer = 0, token = 0;

    return new Promise((resolve, reject) => {
      const view = h('div', { class: 'view' }), msg = h('div', { class: 'msg' }), cv = h('canvas');
      view.append(cv, msg);
      const opt = () => {
        const x = { cols: o.cols, mode: o.mode, ramp: o.custom.length > 1 ? o.custom : o.ramp, dither: o.dither, contrast: o.contrast, brightness: o.brightness, gamma: o.gamma, invert: o.invert, autoLevels: o.autoLevels, bg: o.bg ? 'color' : 'none', res: +o.res, frameStep: o.step };
        if (o.color === 'full') x.color = true; else if (o.color === 'mono') { x.color = false; x.tint = '#d8ffe4'; } else if (o.color.startsWith('palette:')) { x.color = 'palette'; x.palette = o.color.slice(8); }
        return x;
      };
      async function convert(full) {
        const x = opt();
        if (isGif) { x.maxFrames = full ? 400 : undefined; return C.gif(gifBuf, x); }
        if (isVideo) { if (!full) { src.currentTime = 0; await new Promise(r => { const f = () => { src.removeEventListener('seeked', f); r(); }; src.addEventListener('seeked', f); src.currentTime = 0.01; }); return C.image(src, x); } return C.video(src, Object.assign(x, { fps: o.fps, maxFrames: o.frames, onProgress: p => (msg.textContent = 'Converting video… ' + Math.round(p * 100) + '%') })); }
        return C.image(src, x);
      }
      let frame = 0, last = 0;
      function draw() {
        if (!sprite) return; const a = Object.values(sprite.anims)[0], f = a[frame % a.length];
        const z = Math.max(2, Math.min(16, Math.floor(640 / (f.w * 0.6)))), cw = Math.ceil(z * .6), chh = Math.ceil(z * 1.18), d = devicePixelRatio || 1;
        cv.width = f.w * cw * d; cv.height = f.h * chh * d; cv.style.width = f.w * cw + 'px'; cv.style.height = f.h * chh + 'px';
        const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#05070d'; g.fillRect(0, 0, cv.width, cv.height); g.font = z + 'px ' + mono; g.textBaseline = 'top';
        for (let i = 0; i < f.cells.length; i++) { const c = f.cells[i], px = (i % f.w) * cw, py = ((i / f.w) | 0) * chh; if (c.bg) { g.fillStyle = c.bg; g.fillRect(px, py, cw, chh); } if (c.ch !== ' ') { g.fillStyle = c.fg; g.fillText(c.ch, px, py + Math.round((chh - z) / 2)); } }
      }
      async function refresh() {
        const my = ++token; msg.textContent = 'Converting…';
        try { const s = await convert(false); if (my !== token) return; sprite = s; frame = 0; const a = Object.values(s.anims)[0]; msg.textContent = s.w + '×' + s.h + (s.res > 1 ? ' fine cells (' + (s.w / s.res) + '×' + (s.h / s.res).toFixed(0) + ' on the map, ' + s.res + '× detail)' : ' cells') + (a.length > 1 ? ' · ' + a.length + ' frames' : ''); draw(); } catch (e) { msg.textContent = 'Could not convert: ' + e.message; }
      }
      const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 80); };
      function loop(now) { if (!back.isConnected) return; if (sprite) { const a = Object.values(sprite.anims)[0]; if (a.length > 1 && now - last > 1000 / (sprite.fps || 8)) { last = now; frame++; draw(); } } requestAnimationFrame(loop); }
      const sl = (label, key, min, max, step) => { const v = h('span', { class: 'val' }, String(o[key])); return [h('label', {}, label, v), h('input', { type: 'range', min, max, step, value: o[key], oninput: e => { o[key] = +e.target.value; v.textContent = o[key]; later(); } })]; };
      const select = (label, key, opts) => [h('label', {}, label), h('select', { onchange: e => { o[key] = e.target.value; later(); } }, opts.map(([v, t]) => h('option', { value: v, selected: o[key] === v }, t)))];
      const chk = (label, key) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: o[key], onchange: e => { o[key] = e.target.checked; later(); } }), label);
      const finish = v => { URL.revokeObjectURL(url); back.remove(); document.removeEventListener('keydown', onKey); v ? resolve(v) : reject(Object.assign(new Error('Import cancelled'), { cancelled: true })); };
      const onKey = e => { if (e.key === 'Escape') finish(null); };
      const ctl = h('div', { class: 'ctl' },
        h('h3', {}, 'Import as ASCII art'), h('p', { class: 'sub' }, file.name),
        h('label', {}, 'Asset name'), h('input', { type: 'text', value: o.name, oninput: e => (o.name = e.target.value.trim().replace(/[^\w-]+/g, '-') || 'imported') }),
        h('label', {}, 'Size'), h('div', { class: 'presets' }, [['Icon', 16], ['Character', 24], ['Prop', 40], ['Large', 80], ['Backdrop', 140]].map(([t, n]) => h('button', { onclick: () => { o.cols = n; ctl.querySelector('#cols').value = n; ctl.querySelector('#cols').previousSibling.querySelector('.val').textContent = n; later(); } }, t))),
        ...(() => { const r = sl('Width on the map (cells)', 'cols', 8, 240, 1); r[1].id = 'cols'; return r; })(),
        ...select('Detail', 'res', [[1, 'Normal (1 glyph per map cell)'], [2, 'High-res 2× (4× the cells)'], [4, 'High-res 4× (16× the cells)'], [8, 'Ultra 8× (for cutscenes / backdrops)']].map(([v, t]) => [String(v), t])),
        ...select('Style', 'mode', [['luma', 'Classic characters'], ['blocks', 'Half-blocks (2× detail)'], ['braille', 'Braille dots'], ['edges', 'Edges / line art']]),
        ...select('Characters', 'ramp', rampNames.map(k => [k, k + '   ' + C.RAMPS[k].slice(0, 12)])),
        h('input', { type: 'text', placeholder: '…or your own, dark → bright', value: o.custom, style: 'margin-top:6px', oninput: e => { o.custom = e.target.value; later(); } }),
        ...select('Colour', 'color', [['full', 'Full colour'], ['mono', 'Mono'], ['palette:gameboy', 'Game Boy'], ['palette:c64', 'C64'], ['palette:pico8', 'PICO-8'], ['palette:sepia', 'Sepia'], ['palette:matrix', 'Matrix'], ['palette:amber', 'Amber']]),
        ...select('Dithering', 'dither', [['auto', 'Auto'], ['none', 'None'], ['floyd', 'Floyd–Steinberg'], ['bayer', 'Ordered'], ['atkinson', 'Atkinson']]),
        ...sl('Contrast', 'contrast', 0.4, 2.5, 0.05), ...sl('Brightness', 'brightness', -0.5, 0.5, 0.02), ...sl('Gamma', 'gamma', 0.4, 2.5, 0.05),
        chk('Invert', 'invert'), chk('Auto levels', 'autoLevels'), chk('Colour behind characters', 'bg'),
        isVideo ? [...sl('Video frames per second', 'fps', 2, 15, 1), ...sl('Max frames', 'frames', 4, 240, 1)] : null,
        isGif ? sl('Use every Nth GIF frame', 'step', 1, 6, 1) : null);
      const back = h('div', { class: 'imp-back', onclick: e => e.target === back && finish(null) },
        h('div', { class: 'imp', role: 'dialog', 'aria-label': 'Import as ASCII art' }, ctl, view,
          h('div', { class: 'btns' }, h('span', { class: 'grow' }, 'Tip: sprites read best at 16–40 cells wide. Use Backdrop for scenery.'), h('button', { onclick: () => finish(null) }, 'Cancel'),
            h('button', { class: 'primary', onclick: async () => { try { msg.textContent = 'Importing…'; const spr = isGif || isVideo ? await convert(true) : sprite; const text = JSON.stringify(ACI.toAsset(spr, o.name)); finish({ path: 'assets/' + o.name + '.aci.json', text }); } catch (e) { msg.textContent = 'Import failed: ' + e.message; } } }, 'Import'))));
      document.addEventListener('keydown', onKey); document.body.append(back); refresh(); requestAnimationFrame(loop);
    });
  }

  E.registerImporter({ id: 'ascii-convert', title: 'Picture, GIF or video → ASCII', accept: 'image/*,video/*,.gif', import: convertDialog });

  E.registerImporter({
    id: 'ascii-text', title: 'ASCII text file (.txt)', accept: '.txt,text/plain',
    async import(file) {
      const name = safeName(file), raw = (await file.text()).replace(/\r/g, '').replace(/\t/g, '  ');
      const frames = raw.split(/^\s*-{3,}\s*$/m).map(f => f.replace(/^\n+|\n+$/g, '')).filter(f => f.trim());
      if (!frames.length) throw new Error('That file has no art in it.');
      const ind = Math.min(...frames.join('\n').split('\n').filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
      const lines = frames.map(f => f.split('\n').map(l => l.slice(ind).replace(/\s+$/, '')));
      const w = Math.max(...lines.flat().map(l => l.length)), hh = Math.max(...lines.map(l => l.length));
      return { path: 'assets/' + name + '.aci.json', text: JSON.stringify({ aci: 1, name, w, h: hh, fps: 6, color: '#e8e8e8', anims: { default: lines.map(text => ({ text })) } }) };
    },
  });
})();
