/* Project X (ACI port) - UI on the crisp canvas overlay: panels, bars, menus, dialogue with painted portraits,
   toasts, fades, and the scene / modal stack. */
(function () {
  'use strict';
  const PX = window.PX, game = PX.game, clamp = PX.clamp;
  const FONT = '"JetBrains Mono","IBM Plex Mono",Menlo,Consolas,monospace';
  const U = PX.ui = { font: FONT };
  PX.ctx = null; PX.sw = 0; PX.sh = 0;

  U.text = (ctx, str, x, y, o) => {
    o = o || {}; ctx.font = `${o.weight || 600} ${o.size || 14}px ${o.font || FONT}`; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'top';
    if (o.shadow !== false) { ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillText(str, x + 1, y + 1); }
    ctx.fillStyle = o.color || '#e8eefc'; ctx.fillText(str, x, y);
  };
  U.panel = (ctx, x, y, w, h, o) => {
    o = o || {}; ctx.fillStyle = o.bg || 'rgba(6,10,20,.9)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = o.fr || '#7d92c4'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    if (o.title) { ctx.font = `700 12px ${FONT}`; const tw = ctx.measureText(o.title).width + 16; ctx.fillStyle = o.bg || 'rgba(6,10,20,1)'; ctx.fillRect(x + 14, y - 8, tw, 16); U.text(ctx, o.title, x + 22, y - 7, { size: 12, weight: 700, color: o.tc || '#ffd27a', shadow: false }); }
  };
  U.bar = (ctx, x, y, w, h, frac, col, o) => {
    o = o || {}; ctx.fillStyle = '#0a0e18'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = o.fr || '#aab4cc'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    const n = Math.floor((w - 4) / 4 * clamp(frac, 0, 1)); ctx.fillStyle = col; for (let i = 0; i < n; i++) ctx.fillRect(x + 2 + i * 4, y + 2, 3, h - 4);
    if (o.ghost !== undefined) { const g = Math.floor((w - 4) / 4 * clamp(o.ghost, 0, 1)); ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let i = n; i < g; i++) ctx.fillRect(x + 2 + i * 4, y + 2, 3, h - 4); }
  };
  U.wrap = (ctx, text, w, size) => {
    ctx.font = `600 ${size}px ${FONT}`; const out = [];
    for (const para of String(text).split('\n')) { let line = ''; for (const word of para.split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } out.push(line); }
    return out;
  };

  // ---------------------------------------------------------------- menu list
  PX.Menu = class {
    constructor(items, o) { this.items = items; this.i = 0; this.o = o || {}; this.pick = null; this.cancel = false; }
    update() {
      this.pick = null; this.cancel = false; const n = this.items.length;
      if (!n) { if (PX.press('back')) this.cancel = true; return; }
      if (PX.press('up')) { do { this.i = (this.i + n - 1) % n; } while (this.items[this.i].header && n > 1); PX.sfx('ui_move'); }
      if (PX.press('down')) { do { this.i = (this.i + 1) % n; } while (this.items[this.i].header && n > 1); PX.sfx('ui_move'); }
      if (PX.press('ok')) { if (!this.items[this.i].disabled) { this.pick = this.i; PX.sfx('ui_ok'); } else PX.sfx('hurt', { vol: .3 }); }
      if (PX.press('back')) this.cancel = true;
    }
    draw(ctx, x, y, w, rowH) {
      rowH = rowH || 28;
      this.items.forEach((it, k) => {
        const sel = k === this.i && !it.header, yy = y + k * rowH;
        if (sel) { ctx.fillStyle = 'rgba(60,90,160,.45)'; ctx.fillRect(x - 6, yy - 3, w + 12, rowH - 2); ctx.fillStyle = '#ffd27a'; ctx.fillRect(x - 6, yy - 3, 3, rowH - 2); }
        U.text(ctx, it.label, x + 8, yy + 2, { size: 15, color: it.header ? '#7d92c4' : it.disabled ? '#5a6275' : sel ? '#ffe9a8' : '#cfd8ea' });
        if (it.hint) U.text(ctx, it.hint, x + w - 4, yy + 4, { size: 12, align: 'right', color: sel ? '#ffd27a' : '#8a96b0' });
      });
    }
  };

  // ---------------------------------------------------------------- portraits (painted at runtime from the figure rig)
  const portraits = {};
  PX.portrait = (who, emo) => {
    const outfit = { You: 'claire', Claire: 'claire', Grandma: 'grandma', '???': 'shade', Friend: 'friend', Officer: 'officer', Man: 'office' }[who];
    if (!outfit) return null;
    const key = who + emo; if (portraits[key]) return portraits[key];
    const fx = { neutral: {}, scared: { eye: 0, mouth: 1 }, happy: {}, tired: { eye: 2 }, surprised: { mouth: 1 } }[emo] || {};
    const full = PX.paint.figure(outfit, 'front', Object.assign({}, PX.paint.POSE0, fx), { w: 260, h: 520, scale: 2.2 });
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#16203a'; x.fillRect(0, 0, 128, 128);
    const hy = outfit === 'grandma' ? 205 : 140; x.drawImage(full, 60, hy - 34, 140, 140, 0, 0, 128, 128);
    portraits[key] = c; return c;
  };

  // ---------------------------------------------------------------- dialogue
  const D = PX.dialogue = { q: [], cur: null, shown: 0, then: null };
  PX.line = (who, text, emo) => ({ who, text, emo: emo || 'neutral' });
  PX.me = (text, emo) => PX.line('Claire', text, emo);
  PX.say = (lines, then) => { D.q = lines.slice(); D.then = then || null; D.cur = null; if (D.q.length) { D.cur = D.q.shift(); D.shown = 0; } else if (then) then(); };
  PX.talking = () => !!D.cur;
  PX.updateDialogue = dt => {
    if (!D.cur) return;
    const typing = D.shown < D.cur.text.length;
    if (typing) { const before = Math.floor(D.shown); D.shown += dt * 55; if (Math.floor(D.shown) % 4 === 0 && Math.floor(D.shown) !== before) PX.sfx('ui_move', { vol: .05 }); }
    if (PX.press('ok') || PX.mouse.pl) {
      if (typing) D.shown = D.cur.text.length;
      else { PX.sfx('ui_ok', { vol: .3 }); if (D.q.length) { D.cur = D.q.shift(); D.shown = 0; } else { D.cur = null; const t = D.then; D.then = null; if (t) t(); } }
    }
  };
  U.dialogue = ctx => {
    if (!D.cur) return;
    const w = Math.min(PX.sw - 40, 860), h = 150, x = (PX.sw - w) / 2, y = PX.sh - h - 22;
    U.panel(ctx, x, y, w, h, { fr: '#9ab0e0' });
    const face = PX.portrait(D.cur.who, D.cur.emo), tx = face ? x + 164 : x + 26;
    if (face) { ctx.drawImage(face, x + 22, y + 18, 118, 118); ctx.strokeStyle = '#4a5f98'; ctx.strokeRect(x + 22.5, y + 18.5, 117, 117); }
    U.text(ctx, D.cur.who, tx, y + 18, { size: 14, weight: 800, color: D.cur.who === 'Claire' ? '#ffd24a' : D.cur.who === 'Grandma' ? '#d8b8f0' : '#ff8a8a' });
    U.wrap(ctx, D.cur.text.slice(0, Math.floor(D.shown)), w - (tx - x) - 30, 17).slice(0, 4).forEach((l, i) => U.text(ctx, l, tx, y + 46 + i * 24, { size: 17, weight: 500 }));
    if (D.shown >= D.cur.text.length && Math.floor(PX.T * 2.2) % 2 === 0) U.text(ctx, '▼', x + w - 34, y + h - 30, { color: '#ffd27a' });
  };

  // ---------------------------------------------------------------- toasts + banner
  PX.toasts = [];
  PX.toast = (msg, col) => { PX.toasts.push({ msg, t: 2.8, col: col || '#ffd27a' }); if (PX.toasts.length > 4) PX.toasts.shift(); };
  PX.banner = { text: '', sub: '', t: 0 };
  PX.showBanner = (text, sub) => { PX.banner = { text, sub: sub || '', t: 3.2 }; };
  U.toasts = (ctx, dt) => {
    PX.toasts.forEach((t, i) => { t.t -= dt; ctx.font = `600 14px ${FONT}`; const w = ctx.measureText(t.msg).width + 28, x = (PX.sw - w) / 2, y = 120 + i * 34; ctx.globalAlpha = clamp(t.t * 2, 0, 1); U.panel(ctx, x, y, w, 28, { fr: t.col }); U.text(ctx, t.msg, PX.sw / 2, y + 6, { align: 'center', color: t.col, size: 14 }); ctx.globalAlpha = 1; });
    PX.toasts = PX.toasts.filter(t => t.t > 0);
    const b = PX.banner; if (b.t > 0) { b.t -= dt; const a = clamp(Math.min(b.t, 3.2 - b.t) * 2, 0, 1); ctx.globalAlpha = a; U.text(ctx, b.text, PX.sw / 2, 72, { align: 'center', size: 34, weight: 800, color: '#f4efe0' }); if (b.sub) U.text(ctx, b.sub, PX.sw / 2, 116, { align: 'center', size: 14, color: '#aab4cc' }); ctx.globalAlpha = 1; }
  };

  // ---------------------------------------------------------------- fade
  PX.fade = { a: 0, to: 0, speed: 2.5, res: null };
  PX.fadeTo = (a, speed) => new Promise(res => { PX.fade.to = a; PX.fade.speed = speed || 2.5; PX.fade.res = res; if (PX.fade.a === a) { PX.fade.res = null; res(); } });
  PX.updateFade = dt => { const f = PX.fade; if (f.a === f.to) return; f.a += Math.sign(f.to - f.a) * f.speed * dt; if (Math.abs(f.a - f.to) <= f.speed * dt) { f.a = f.to; const r = f.res; f.res = null; if (r) r(); } };
  U.fade = ctx => { if (PX.fade.a > .004) { ctx.fillStyle = `rgba(0,0,0,${PX.fade.a})`; ctx.fillRect(0, 0, PX.sw, PX.sh); } };

  // ---------------------------------------------------------------- scenes
  PX.clearWorld = () => { game.entities.slice().forEach(e => game.remove(e)); game.layers.slice().forEach(l => game.removeLayer(l)); game.camera.target = null; game.clearParticles && game.clearParticles(); };
  PX.go = (scene, arg) => { if (PX.scene && PX.scene.exit) PX.scene.exit(); PX.modals.length = 0; PX.scene = scene; if (scene.enter) scene.enter(arg); };
  PX.push = m => { PX.modals.push(m); if (m.enter) m.enter(); };
  PX.pop = () => { PX.modals.pop(); };
  PX.shake = (a, d) => { if (PX.settings.shake) game.shake(a, d); };
  PX.setFont = px => { PX.settings.font = px; game.setFontSize(px); PX.saveSettings(); if (PX.scene && PX.scene.relayout) PX.scene.relayout(); };
  let lastT = performance.now();
  game.onUpdate(dt => {
    dt = Math.min(dt, .05); PX.T += dt; PX.dark = PX.darkness();
    PX.updateFade(dt); PX.updateDialogue(dt);
    const m = PX.modals[PX.modals.length - 1];
    if (!PX.talking()) { if (m) m.update(dt); else if (PX.scene && PX.scene.update) PX.scene.update(dt); }
    else if (PX.scene && PX.scene.idle) PX.scene.idle(dt);
    PX.mouse.pl = PX.mouse.pr = false;
  });
  game.onOverlay((ctx, G) => {
    PX.ctx = ctx; PX.sw = G.viewCols * G.cellW; PX.sh = G.viewRows * G.cellH;
    const now = performance.now(), dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    if (PX.scene && PX.scene.overlay) PX.scene.overlay(ctx, G);
    for (const m of PX.modals) if (m.overlay) m.overlay(ctx, G);
    U.dialogue(ctx); U.toasts(ctx, dt); U.fade(ctx);
  });
})();
