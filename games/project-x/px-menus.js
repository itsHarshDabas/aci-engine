/* Project X (ACI port) - menus: object actions, fridge, cooking, pause, bag, character, world map, settings. */
(function () {
  'use strict';
  const PX = window.PX, U = PX.ui, D = PX.D, ITEMS = PX.ITEMS, M = PX.menus = {};
  const dim = ctx => { ctx.fillStyle = 'rgba(2,4,10,.55)'; ctx.fillRect(0, 0, PX.sw, PX.sh); };

  M.actionMenu = (title, acts, run, onCancel) => {
    const menu = new PX.Menu(acts.map(a => ({ label: a.label })));
    return { update() { menu.update(); if (menu.pick !== null) { PX.pop(); run(acts[menu.pick].id); } else if (menu.cancel) { PX.pop(); if (onCancel) onCancel(); } },
      overlay(ctx) { const w = 260, h = 50 + acts.length * 28, x = (PX.sw - w) / 2, y = PX.sh * .55 - h / 2; U.panel(ctx, x, y, w, h, { title }); menu.draw(ctx, x + 16, y + 24, w - 32); } };
  };

  M.fridge = () => {
    const mk = () => Object.keys(PX.stock.fridge).map(id => ({ label: ITEMS[id].name, hint: 'x' + PX.stock.fridge[id], id, disabled: PX.stock.fridge[id] <= 0 })), st = { menu: new PX.Menu(mk()) };
    return { update() { const m = st.menu; m.update(); if (m.pick !== null) { const id = m.items[m.pick].id; PX.stock.fridge[id]--; PX.P.inventory[id] = (PX.P.inventory[id] || 0) + 1; const i = m.i; st.menu = new PX.Menu(mk()); st.menu.i = i; PX.toast('Took ' + ITEMS[id].name); } else if (m.cancel) PX.pop(); },
      overlay(ctx) { dim(ctx); const w = 420, h = 70 + st.menu.items.length * 28, x = (PX.sw - w) / 2, y = (PX.sh - h) / 2; U.panel(ctx, x, y, w, h, { title: 'Fridge: take ingredients' }); st.menu.draw(ctx, x + 20, y + 28, w - 40); U.text(ctx, 'Enter take one · Esc close', x + w / 2, y + h - 24, { size: 12, align: 'center', color: '#8a96b0' }); } };
  };

  M.cook = () => {
    const recs = Object.entries(D.recipes), have = (id, n) => (PX.P.inventory[id] || 0) >= n;
    const mk = () => recs.map(([id, r]) => ({ label: r.name, hint: r.minutes + ' min', id, disabled: !Object.entries(r.needs).every(([i, n]) => have(i, n)) }));
    const st = { menu: new PX.Menu(mk()) };
    return { update() { const m = st.menu; m.update(); if (m.pick !== null) { const r = D.recipes[m.items[m.pick].id]; for (const [i, n] of Object.entries(r.needs)) PX.P.inventory[i] -= n; PX.P.inventory[r.makes] = (PX.P.inventory[r.makes] || 0) + 1; PX.clock.pass(r.minutes); PX.toast('You cook ' + r.name + '. (' + r.minutes + ' minutes pass)'); PX.sfx('heal'); const i = m.i; st.menu = new PX.Menu(mk()); st.menu.i = i; } else if (m.cancel) PX.pop(); },
      overlay(ctx) { dim(ctx); const w = 620, h = 90 + recs.length * 28, x = (PX.sw - w) / 2, y = (PX.sh - h) / 2; U.panel(ctx, x, y, w, h, { title: 'Stove: cook' }); st.menu.draw(ctx, x + 20, y + 28, 250);
        const id = st.menu.items[st.menu.i].id, r = D.recipes[id]; U.text(ctx, r.name, x + 300, y + 30, { size: 16, color: '#ffe9a8', weight: 800 }); U.wrap(ctx, r.desc, 290, 13).forEach((l, i) => U.text(ctx, l, x + 300, y + 58 + i * 18, { size: 13, color: '#c8d4ec' }));
        Object.entries(r.needs).forEach(([i, n], k) => U.text(ctx, ITEMS[i].name + '  ' + (PX.P.inventory[i] || 0) + '/' + n, x + 300, y + 110 + k * 20, { size: 13, color: have(i, n) ? '#9af0a8' : '#ff8a8a' }));
        U.text(ctx, 'Enter cook · Esc close', x + w / 2, y + h - 24, { size: 12, align: 'center', color: '#8a96b0' }); } };
  };

  // ---------------------------------------------------------------- bag
  const TABS = [['consumable', 'Items'], ['ingredient', 'Ingredients'], ['equip', 'Equipment'], ['key', 'Key items']];
  const EQ = ['weapon', 'armor', 'crystal', 'style'], SLOT_OF = { weapon: 'weapon', armor: 'armor', crystal: 'crystal', style: 'style' };
  M.bag = () => {
    const st = { tab: 0, menu: null };
    const list = () => { const p = PX.P, t = TABS[st.tab][0]; const ids = t === 'equip' ? EQ.flatMap(e => PX.owned(p, e)) : PX.owned(p, t); return ids.map(id => ({ label: ITEMS[id].name + (Object.values(p.equipped).includes(id) ? '  [equipped]' : ''), hint: ITEMS[id].type === 'consumable' || ITEMS[id].type === 'ingredient' ? 'x' + p.inventory[id] : '', id })); };
    const rebuild = () => { const i = st.menu ? st.menu.i : 0; st.menu = new PX.Menu(list()); st.menu.i = Math.min(i, Math.max(0, st.menu.items.length - 1)); };
    rebuild();
    return { update() { if (PX.press('left')) { st.tab = (st.tab + 3) % 4; st.menu = null; rebuild(); PX.sfx('ui_move'); } if (PX.press('right')) { st.tab = (st.tab + 1) % 4; st.menu = null; rebuild(); PX.sfx('ui_move'); }
      if (PX.press('i') || PX.press('back')) { PX.pop(); return; } const m = st.menu; m.update(); if (m.pick !== null) { const id = m.items[m.pick].id, it = ITEMS[id];
        if (it.type === 'consumable') PX.toast(PX.useItem(PX.P, id)); else if (SLOT_OF[it.type]) { const slot = it.type; PX.P.equipped[slot] = PX.P.equipped[slot] === id ? (slot === 'weapon' ? 'fists' : null) : id; PX.heal(PX.P, 0, 0); PX.toast(PX.P.equipped[slot] === id ? 'Equipped ' + it.name : 'Unequipped ' + it.name); }
        rebuild(); } },
      overlay(ctx) { dim(ctx); const w = 760, h = 420, x = (PX.sw - w) / 2, y = (PX.sh - h) / 2; U.panel(ctx, x, y, w, h, { title: 'Bag' });
        TABS.forEach((t, i) => U.text(ctx, t[1], x + 30 + i * 150, y + 18, { size: 15, weight: 800, color: i === st.tab ? '#ffe9a8' : '#6a7590' })); U.text(ctx, '◀ ▶ switch tab', x + w - 30, y + 20, { size: 11, align: 'right', color: '#6a7590' });
        if (!st.menu.items.length) U.text(ctx, 'Nothing here.', x + 40, y + 70, { size: 14, color: '#8a96b0' }); else st.menu.draw(ctx, x + 24, y + 56, 380);
        const cur = st.menu.items[st.menu.i]; if (cur) { const it = ITEMS[cur.id]; U.text(ctx, it.name, x + 450, y + 60, { size: 17, weight: 800, color: '#ffe9a8' }); U.wrap(ctx, it.desc, 280, 14).forEach((l, i) => U.text(ctx, l, x + 450, y + 90 + i * 20, { size: 14, color: '#c8d4ec' })); U.text(ctx, it.type === 'consumable' ? 'Enter: use' : SLOT_OF[it.type] ? 'Enter: equip / unequip' : '', x + 450, y + 200, { size: 12, color: '#8a96b0' }); }
        U.text(ctx, '$' + PX.P.money, x + w - 30, y + h - 30, { size: 14, align: 'right', color: '#ffd27a' }); } };
  };

  M.character = () => {
    const p = PX.P, st = { slot: 0, picking: null };
    return { update() { if (PX.press('c') || (PX.press('back') && !st.picking)) { PX.pop(); return; }
      if (st.picking) { st.picking.update(); if (st.picking.pick !== null) { const id = st.picking.items[st.picking.pick].id; p.equipped[EQ[st.slot]] = id; PX.heal(p, 0, 0); st.picking = null; } else if (st.picking.cancel) st.picking = null; return; }
      if (PX.press('up')) st.slot = (st.slot + 3) % 4; if (PX.press('down')) st.slot = (st.slot + 1) % 4;
      if (PX.press('ok')) { const slot = EQ[st.slot], opts = PX.owned(p, slot).map(id => ({ label: ITEMS[id].name, hint: ITEMS[id].desc.slice(0, 28), id })); if (slot !== 'weapon') opts.unshift({ label: '(none)', id: null }); st.picking = new PX.Menu(opts); } },
      overlay(ctx) { dim(ctx); const w = 820, h = 440, x = (PX.sw - w) / 2, y = (PX.sh - h) / 2; U.panel(ctx, x, y, w, h, { title: 'Claire' });
        const face = PX.portrait('Claire', 'neutral'); if (face) ctx.drawImage(face, x + 24, y + 30, 128, 128);
        U.text(ctx, 'Form: ' + p.form, x + 170, y + 36, { size: 14, color: '#ffd27a' }); U.text(ctx, '$' + p.money, x + 170, y + 58, { size: 14 });
        U.text(ctx, 'HP', x + 170, y + 90, { size: 12, color: '#ff9a9a' }); U.bar(ctx, x + 200, y + 90, 180, 14, p.hp / PX.maxHp(p), '#e04a4a'); U.text(ctx, Math.ceil(p.hp) + '/' + PX.maxHp(p), x + 390, y + 90, { size: 12 });
        U.text(ctx, 'RE', x + 170, y + 114, { size: 12, color: '#8ac8ff' }); U.bar(ctx, x + 200, y + 114, 180, 14, p.re / PX.maxRe(p), '#4a9aff'); U.text(ctx, Math.ceil(p.re) + '/' + PX.maxRe(p), x + 390, y + 114, { size: 12 });
        PX.STATS.forEach(([k, n], i) => { const b = PX.bonus(p, k); U.text(ctx, n.padEnd(13) + String(p[k] + b).padStart(3) + (b ? ('  (' + (b > 0 ? '+' : '') + b + ')') : ''), x + 30, y + 190 + i * 26, { size: 15, color: b ? '#9af0a8' : '#d8e0f0' }); });
        U.text(ctx, 'Equipment', x + 440, y + 36, { size: 14, weight: 800, color: '#ffd27a' });
        PX.SLOTS.forEach(([k, n], i) => { const id = p.equipped[k], sel = i === st.slot; if (sel) { ctx.fillStyle = 'rgba(60,90,160,.4)'; ctx.fillRect(x + 430, y + 62 + i * 52, 360, 46); } U.text(ctx, n, x + 442, y + 66 + i * 52, { size: 12, color: '#8a96b0' }); U.text(ctx, id ? ITEMS[id].name : '(none)', x + 442, y + 84 + i * 52, { size: 15, color: sel ? '#ffe9a8' : '#d8e0f0' }); });
        U.text(ctx, '↑↓ choose slot · Enter change · Esc close', x + w / 2, y + h - 26, { size: 12, align: 'center', color: '#8a96b0' });
        if (st.picking) { const mw = 420, mh = 50 + Math.max(1, st.picking.items.length) * 28, mx = x + 400, my = y + 100; U.panel(ctx, mx, my, mw, mh, { title: PX.SLOTS[st.slot][1], bg: 'rgba(6,10,24,.98)' }); st.picking.draw(ctx, mx + 16, my + 24, mw - 32); } } };
  };

  // ---------------------------------------------------------------- world map (data/world.json, with fog)
  M.map = () => {
    const world = D.world, areas = world.areas;
    return { update() { if (PX.press('m') || PX.press('back') || PX.press('ok')) PX.pop(); },
      overlay(ctx) { dim(ctx); const w = Math.min(PX.sw - 60, 1100), h = Math.min(PX.sh - 60, 700), x0 = (PX.sw - w) / 2, y0 = (PX.sh - h) / 2; U.panel(ctx, x0, y0, w, h, { title: 'City of Dwell' });
        const sx = (w - 80) / 800, sy = (h - 110) / 720, ox = x0 + 40 - 150 * sx, oy = y0 + 60 - 120 * sy, cur = PX.World.areaOf(PX.where.room || (PX.World.cur && PX.World.cur.id));
        const vis = id => (areas[id].rooms || [id]).some(r => PX.flags['visited_' + r]);
        const c = id => { const a = areas[id].at; return [ox + (a[0] + a[2] / 2) * sx, oy + (a[1] + a[3] / 2) * sy]; };
        ctx.strokeStyle = 'rgba(160,180,230,.35)'; ctx.lineWidth = 2; (world.links || []).forEach(l => { const a = c(l.a), b = c(l.b); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
        ctx.setLineDash([6, 6]); (world.water_links || []).forEach(l => { if (!areas[l.a] || !areas[l.b]) return; const a = c(l.a), b = c(l.b); ctx.strokeStyle = 'rgba(90,150,230,.55)'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }); ctx.setLineDash([]);
        Object.entries(world.districts).forEach(([id, d]) => U.text(ctx, d.name, ox + (d.at[0] + d.at[2] / 2) * sx, oy + d.at[1] * sy - 6, { size: 11, align: 'center', color: '#7d92c4' }));
        Object.entries(areas).forEach(([id, a]) => { const v = vis(id), bx = ox + a.at[0] * sx, by = oy + a.at[1] * sy, bw = a.at[2] * sx, bh = a.at[3] * sy; ctx.fillStyle = v ? (id === cur ? 'rgba(80,120,60,.85)' : 'rgba(40,60,110,.85)') : 'rgba(20,24,40,.9)'; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = id === cur ? '#ffd27a' : v ? '#8aa4d6' : '#3a4260'; ctx.lineWidth = id === cur ? 3 : 1.5; ctx.strokeRect(bx, by, bw, bh);
          U.text(ctx, v ? a.name : '???', bx + bw / 2, by + bh / 2 - 8, { size: 12, align: 'center', color: v ? '#e8eefc' : '#4a5270' }); if (id === cur && Math.floor(PX.T * 2) % 2) U.text(ctx, '◆ you', bx + bw / 2, by + bh / 2 + 8, { size: 11, align: 'center', color: '#ffd27a' }); });
        U.text(ctx, 'M / Esc close', x0 + w / 2, y0 + h - 24, { size: 12, align: 'center', color: '#8a96b0' }); } };
  };

  // ---------------------------------------------------------------- settings
  M.settings = (fromTitle) => {
    const S = PX.settings, st = { i: 0 }, FONTS = [3, 4, 5, 6], pct = v => Math.round(v * 100) + '%';
    const rows = [
      { n: 'Music volume', get: () => pct(S.music), adj: d => { S.music = PX.clamp(Math.round((S.music + d * .1) * 10) / 10, 0, 1); PX.applyVolumes(); } },
      { n: 'Sound effects', get: () => pct(S.sfx), adj: d => { S.sfx = PX.clamp(Math.round((S.sfx + d * .1) * 10) / 10, 0, 1); PX.applyVolumes(); PX.sfx('ui_ok'); } },
      { n: 'Detail (glyph size)', get: () => ['Ultra (3px)', 'High (4px)', 'Medium (5px)', 'Low (6px)'][FONTS.indexOf(S.font)], adj: d => { const i = PX.clamp(FONTS.indexOf(S.font) + d, 0, 3); PX.setFont(FONTS[i]); } },
      { n: 'Screen shake', get: () => S.shake ? 'On' : 'Off', adj: () => { S.shake = !S.shake; } },
      { n: 'Damage numbers', get: () => S.numbers ? 'On' : 'Off', adj: () => { S.numbers = !S.numbers; } },
      { n: 'Rain', get: () => S.rain ? 'On' : 'Off', adj: () => { S.rain = !S.rain; } },
      { n: 'Enemy damage', get: () => ({ .75: 'Easy (x0.75)', 1: 'Normal (x1)', 1.35: 'Hard (x1.35)' })[S.difficulty], adj: d => { const v = [.75, 1, 1.35], i = PX.clamp(v.indexOf(S.difficulty) + d, 0, 2); S.difficulty = v[i]; } },
      { n: 'Erase saved game', get: () => PX.hasSave() ? 'Press Enter' : '(none)', act: true, adj: () => { if (PX.hasSave()) { PX.store.del(PX.SLOT); PX.toast('Save erased'); } } },
    ];
    return { update() { if (PX.press('up')) st.i = (st.i + rows.length - 1) % rows.length; if (PX.press('down')) st.i = (st.i + 1) % rows.length; if (PX.press('left')) { rows[st.i].adj(-1); PX.saveSettings(); } if (PX.press('right')) { rows[st.i].adj(1); PX.saveSettings(); } if (PX.press('ok')) { rows[st.i].adj(1); PX.saveSettings(); PX.sfx('ui_ok'); } if (PX.press('back')) { PX.saveSettings(); PX.pop(); } },
      overlay(ctx) { dim(ctx); const w = 640, h = 90 + rows.length * 38, x = (PX.sw - w) / 2, y = (PX.sh - h) / 2; U.panel(ctx, x, y, w, h, { title: 'Settings' });
        rows.forEach((r, i) => { const yy = y + 36 + i * 38, sel = i === st.i; if (sel) { ctx.fillStyle = 'rgba(60,90,160,.45)'; ctx.fillRect(x + 14, yy - 6, w - 28, 32); } U.text(ctx, r.n, x + 32, yy, { size: 16, color: sel ? '#ffe9a8' : '#cfd8ea' }); U.text(ctx, (sel && !r.act ? '◀ ' : '') + r.get() + (sel && !r.act ? ' ▶' : ''), x + w - 32, yy, { size: 16, align: 'right', color: sel ? '#ffd27a' : '#9fb0d4' }); });
        U.text(ctx, '↑↓ choose · ◀ ▶ change · Esc back   (Move: WASD · Sprint: Shift · Light: J/Click · Heavy: K/Right-click · Skills: 1-4 · Dodge: Space · Charge: C · Shade: Q · Flask: H)', x + w / 2, y + h - 24, { size: 11, align: 'center', color: '#8a96b0' }); } };
  };

  // ---------------------------------------------------------------- pause
  M.pause = () => {
    const items = [{ label: 'Resume' }, { label: 'Bag', hint: 'I' }, { label: 'Character', hint: 'C' }, { label: 'World map', hint: 'M' }, { label: 'Save game' }, { label: 'Load game', disabled: !PX.hasSave() }, { label: 'Settings' }, { label: 'Battle test (arena)', hint: 'B' }, { label: 'Quit to title' }], menu = new PX.Menu(items);
    return { update() { menu.update(); if (menu.cancel) { PX.pop(); return; } if (menu.pick === null) return; const l = items[menu.pick].label;
      if (l === 'Resume') PX.pop(); else if (l === 'Bag') { PX.pop(); PX.push(M.bag()); } else if (l === 'Character') { PX.pop(); PX.push(M.character()); } else if (l === 'World map') { PX.pop(); PX.push(M.map()); }
      else if (l === 'Save game') { const W = PX.World, h = W.hero; PX.where = { room: W.cur.id, x: h.x - .5, y: h.y - .9, facing: h.dir }; PX.save(); PX.toast('Game saved'); }
      else if (l === 'Load game') { PX.pop(); PX.load(); PX.fadeTo(1, 4).then(() => { PX.World.enter(); PX.fadeTo(0, 3); }); }
      else if (l === 'Settings') PX.push(M.settings()); else if (l.startsWith('Battle')) { PX.pop(); PX.arena.begin({ test: true }); } else if (l === 'Quit to title') { PX.pop(); PX.fadeTo(1, 4).then(() => { PX.go(PX.Title); PX.fadeTo(0, 3); }); } },
      overlay(ctx) { dim(ctx); const w = 300, h = 60 + items.length * 28, x = (PX.sw - w) / 2, y = (PX.sh - h) / 2; U.panel(ctx, x, y, w, h, { title: 'Paused' }); menu.draw(ctx, x + 20, y + 30, w - 40); } };
  };
})();
