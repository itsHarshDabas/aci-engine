/* ACI modules/hud.js: plugin 'hud'. A small HUD kit: boxed panels with bar meters, name tags, health bars over
   entities, floating numbers, subtitles and an FPS counter. Everything is drawn in character cells.

     game.hud.panel('player', { anchor:'tl', x:1, y:1, title:'Hero', rows:[
         { label:'HP',  bar:{ value:() => hero.hp, max:100, color:'#d1473a' } },
         { label:'MP',  bar:{ value:42, max:60, color:'#4a90e2' } },
         { label:'Gold', value:() => state.gold } ] })        // values may be numbers or functions (live)
     game.hud.remove('player')
     game.hud.tag(entity, 'Senje', { color:'#9fd' })           // one frame (call from onDraw)  - or attach for good:
     game.hud.attachTag(entity, { text:'Senje', color:'#9fd' }) / game.hud.attachBar(entity, { value:() => e.hp, max:() => e.maxHp })
     game.hud.float(x, y, '+200', { color:'#9f9' })            // floating number in WORLD cells; rises and fades
     game.hud.say('He is already showing', { time:3 })         // bold subtitle, bottom centre
     game.hud.fps(true)
   Panel opts: anchor tl|tr|bl|br|tc|bc, x, y (offset from the anchor), w (cols, default auto), border 'single'|'double'|'heavy', bg, color, title */
(function () {
  'use strict';
  const ACI = window.ACI;
  const BORDERS = {
    single: ['┌', '┐', '└', '┘', '─', '│'], double: ['╔', '╗', '╚', '╝', '═', '║'], heavy: ['┏', '┓', '┗', '┛', '━', '┃'],
  };
  const val = v => (typeof v === 'function' ? v() : v);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  ACI.plugin('hud', function install(G) {
    const panels = new Map(), tags = new Set(), bars = new Set(), floats = [], says = [];
    let showFps = false;
    const H = G.hud = {};

    // ---- bar: filled part, empty part, in cells
    function barStr(v, max, w, style) {
      const f = max > 0 ? clamp(Math.round(w * v / max), v > 0 ? 1 : 0, w) : 0;
      const [on, off] = style === 'ticks' ? ['|', '·'] : style === 'blocks' ? ['▓', '░'] : ['█', '░'];
      return [on.repeat(f), off.repeat(w - f)];
    }
    H.bar = (put, x, y, w, value, max, o = {}) => {
      const [a, b] = barStr(val(value), val(max), w, o.style);
      for (let i = 0; i < a.length; i++) put(x + i, y, a[i], o.color || '#d1473a');
      for (let i = 0; i < b.length; i++) put(x + a.length + i, y, b[i], o.empty || '#3a3a3a');
    };

    // ---- panels (screen coordinates)
    H.panel = (id, o) => { panels.set(id, Object.assign({ anchor: 'tl', x: 1, y: 1, border: 'double', bg: '#05070c', color: '#c9d1d9', rows: [] }, o)); return H; };
    H.remove = id => { panels.delete(id); return H; };
    H.clear = () => { panels.clear(); tags.clear(); bars.clear(); floats.length = 0; return H; };

    function drawPanel(p) {
      const S = G.screen, B = BORDERS[p.border] || BORDERS.single;
      const rows = p.rows.map(r => ({ label: r.label ? String(val(r.label)) : '', bar: r.bar, text: r.text !== undefined ? String(val(r.text)) : (r.value !== undefined ? String(val(r.value)) : (r.bar ? Math.round(val(r.bar.value)) + '/' + Math.round(val(r.bar.max)) : '')), color: r.color }));
      const labW = Math.max(0, ...rows.map(r => r.label.length)), txtW = Math.max(0, ...rows.map(r => r.text.length));
      const w = p.w || Math.max((p.title ? p.title.length + 6 : 0), labW + 1 + (rows.some(r => r.bar) ? 12 : 0) + txtW + 4, 14);
      const h = rows.length + 2;
      const x0 = p.anchor.includes('r') ? G.viewCols - w - p.x : p.anchor === 'tc' || p.anchor === 'bc' ? Math.floor((G.viewCols - w) / 2) + p.x : p.x;
      const y0 = p.anchor[0] === 'b' ? G.viewRows - h - p.y : p.y;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) S.put(x0 + i, y0 + j, ' ', p.color, p.bg);
      for (let i = 1; i < w - 1; i++) { S.put(x0 + i, y0, B[4], p.color, p.bg); S.put(x0 + i, y0 + h - 1, B[4], p.color, p.bg); }
      for (let j = 1; j < h - 1; j++) { S.put(x0, y0 + j, B[5], p.color, p.bg); S.put(x0 + w - 1, y0 + j, B[5], p.color, p.bg); }
      S.put(x0, y0, B[0], p.color, p.bg); S.put(x0 + w - 1, y0, B[1], p.color, p.bg); S.put(x0, y0 + h - 1, B[2], p.color, p.bg); S.put(x0 + w - 1, y0 + h - 1, B[3], p.color, p.bg);
      if (p.title) S.text(x0 + 2, y0, ' ' + p.title + ' ', p.titleColor || '#e8c870', p.bg);
      rows.forEach((r, j) => {
        const y = y0 + 1 + j, inner = w - 4;
        if (r.label) S.text(x0 + 2, y, r.label, r.color || '#8b95a5', p.bg);
        const textX = x0 + 2 + inner - r.text.length;
        if (r.bar) {
          const bx = x0 + 2 + labW + (labW ? 1 : 0), bw = Math.max(3, textX - bx - 1);
          H.bar((cx, cy, c, f) => S.put(cx, cy, c, f, p.bg), bx, y, bw, r.bar.value, r.bar.max, r.bar);
        }
        S.text(textX, y, r.text, r.color || p.color, p.bg);
      });
    }

    // ---- name tags and bars over entities (world coordinates, follow the camera)
    H.tag = (target, text, o = {}) => {
      const t = String(text), w = target.w || 1;
      const x = Math.round(target.x + w / 2 - t.length / 2), y = Math.round(target.y) - 1 - (o.offsetY || 0);
      for (let i = 0; i < t.length; i++) G.put(x + i, y, t[i], o.color || '#cfe', o.bg);
    };
    H.attachTag = (e, o = {}) => { const rec = { e, o }; if (o.text === undefined) o.text = e.label || e.name || ''; e.label = null; /* the tag replaces core's label */ tags.add(rec); return () => tags.delete(rec); };
    H.attachBar = (e, o = {}) => { const rec = { e, o }; bars.add(rec); return () => bars.delete(rec); };
    const alive = e => G.entities.includes(e);

    // ---- floating numbers
    H.float = (x, y, text, o = {}) => { floats.push({ x, y, text: String(text), color: o.color || '#e8e8e8', t: 0, life: o.life || 1.1, rise: o.rise || 4, crit: !!o.crit }); return H; };
    // ---- subtitles
    H.say = (text, o = {}) => { says.push({ text: String(text), t: 0, life: o.time || 2.5, color: o.color || '#f5f5f5' }); if (says.length > 3) says.shift(); return H; };
    H.fps = on => { showFps = on !== false; return H; };

    G.onUpdate(dt => {
      for (const f of floats) f.t += dt; for (let i = floats.length - 1; i >= 0; i--) if (floats[i].t >= floats[i].life) floats.splice(i, 1);
      for (const s of says) s.t += dt; for (let i = says.length - 1; i >= 0; i--) if (says[i].t >= says[i].life) says.splice(i, 1);
    });
    G.onDraw(() => {
      for (const rec of tags) { if (!alive(rec.e)) { tags.delete(rec); continue; } const o = rec.o; H.tag(rec.e, val(o.text) !== undefined ? val(o.text) : (rec.e.label || rec.e.name || ''), { color: o.color, offsetY: (o.offsetY || 0) + (bars.size && [...bars].some(b => b.e === rec.e) ? 1 : 0) }); }
      for (const rec of bars) {
        if (!alive(rec.e)) { bars.delete(rec); continue; }
        const w = rec.o.w || Math.max(4, Math.round(rec.e.w || 4)), x = Math.round(rec.e.x + (rec.e.w || 1) / 2 - w / 2), y = Math.round(rec.e.y) - 1;
        H.bar((cx, cy, c, f) => G.put(cx, cy, c, f), x, y, w, rec.o.value, rec.o.max, rec.o);
      }
      for (const f of floats) {
        const k = f.t / f.life, y = f.y - f.rise * (1 - Math.pow(1 - k, 2)), col = ACI.mix(f.color, '#000000', Math.max(0, (k - 0.6) / 0.4) * 0.85);
        const txt = f.crit ? '*' + f.text + '*' : f.text, x = Math.round(f.x - txt.length / 2);
        for (let i = 0; i < txt.length; i++) G.put(x + i, y, txt[i], col);
      }
      for (const p of panels.values()) drawPanel(p);
      says.forEach((s, i) => {
        const k = s.t < 0.2 ? s.t / 0.2 : s.t > s.life - 0.4 ? Math.max(0, (s.life - s.t) / 0.4) : 1, y = G.viewRows - 3 - (says.length - 1 - i) * 2;
        const x = Math.floor((G.viewCols - s.text.length) / 2), col = ACI.mix('#000000', s.color, k);
        for (let j = 0; j < s.text.length; j++) G.screen.put(x + j, y, s.text[j], col, '#000000');
      });
      if (showFps) G.screen.text(G.viewCols - 18, 0, 'FPS ' + G.fps + ' · t ' + G.time.toFixed(1), '#6fa86f');
    });

    G.defineCommand('hud', c => {
      if (c.panel) { H.panel(c.panel, { anchor: c.anchor, x: c.x, y: c.y, w: c.w, title: c.title, border: c.border, rows: (c.rows || []).map(r => Object.assign({}, r)) }); return { panel: c.panel }; }
      if (c.remove) { H.remove(c.remove); return { removed: c.remove }; }
      if (c.float) { H.float(c.x, c.y, c.float, c); return { ok: true }; }
      if (c.say) { H.say(c.say, c); return { ok: true }; }
      if (c.fps !== undefined) { H.fps(c.fps); return { fps: !!c.fps }; }
      return { panels: [...panels.keys()] };
    }, 'HUD: {panel:"hero",anchor:"tl",title:"Hero",rows:[{label:"HP",bar:{value:80,max:100,color:"#d1473a"}},{label:"Gold",value:120}]} | {float:"+200",x:20,y:10,color:"#9f9"} | {say:"Hello",time:3} | {remove:"hero"} | {fps:true}');
  });
})();
