/* ACI editor: "Resolution" section in the Inspector for sprites.
   A sprite's `res` says how many of its cells fit across one map cell: 1 = normal ASCII, 2/4/8 = high-res
   (finer glyphs, much more detail). It is stored in the sprite asset (assets/<name>.aci.json -> "res"), so every
   entity using that sprite changes together. */
(function () {
  'use strict';
  const E = window.ACIEditor; if (!E || !E.registerInspector) return;
  const assetOf = e => { const s = e && e.sprite; if (!s || typeof s === 'string') return null; return s.asset || s.name || null; };
  const pathOf = n => 'assets/' + String(n).replace(/\.aci\.json$/, '') + '.aci.json';
  const el = (tag, attrs, ...kids) => { const n = document.createElement(tag); for (const k in attrs || {}) { if (k === 'style') n.style.cssText = attrs[k]; else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]); } kids.flat().forEach(c => c != null && n.append(c.nodeType ? c : document.createTextNode(c))); return n; };

  E.registerInspector({
    id: 'sprite-resolution', title: 'Resolution',
    applies: e => !!assetOf(e),
    async render(root, e, ed) {
      const path = pathOf(assetOf(e)); let raw, json;
      try { raw = await ed.fs.read(path); json = JSON.parse(raw); } catch (err) { root.append(el('div', { style: 'color:var(--muted)' }, 'Sprite file not found.')); return; }
      const res = Math.max(1, json.res | 0 || 1);
      const w = json.w || 0, h = json.h || 0;
      const sel = el('select', { 'aria-label': 'Sprite resolution', style: 'width:100%' },
        [[1, 'Normal – 1 cell per map cell'], [2, 'High-res 2× – 4× the detail'], [4, 'High-res 4× – 16× the detail'], [8, 'Ultra 8× – 64× the detail']].map(([v, t]) => { const o = el('option', { value: v }, t); if (v === res) o.selected = true; return o; }));
      const info = el('div', { style: 'color:var(--muted);font-size:12px;margin-top:4px' });
      const upd = r => { info.textContent = w + '×' + h + ' cells' + (r > 1 ? ' → ' + Math.round(w / r) + '×' + Math.round(h / r) + ' on the map' : ' on the map'); };
      upd(res);
      sel.addEventListener('change', async () => {
        const r = +sel.value, before = raw; json.res = r; if (r === 1) delete json.res;
        const after = JSON.stringify(json, null, 1); await ed.fs.write(path, after); raw = after; upd(r); ed.refreshAssets(); ed.markDirty && ed.markDirty();
        ed.undo.push('Sprite resolution', async () => { await ed.fs.write(path, before); ed.refreshAssets(); }, async () => { await ed.fs.write(path, after); ed.refreshAssets(); });
      });
      root.append(sel, info, el('div', { style: 'color:var(--muted);font-size:11px;margin-top:4px' }, 'Tip: import a big picture or GIF and pick a Detail level to get a high-res sprite.'));
    },
  });
})();
