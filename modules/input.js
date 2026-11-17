/* ACI core/input.js: plugin 'input'. Action mapping, one-frame pressed/released, pointer + touch helpers.
   FRAME SEMANTICS (listener-order safe): every key event is stamped with a frame counter. The counter is
   advanced lazily whenever G.time changes (G.time is identical for every updater inside one frame), and by
   an onUpdate hook. An event that arrives between frame N and N+1 is "pressed" for exactly frame N+1, no
   matter whether your onUpdate runs before or after ours. Nothing needs clearing at frame end.
   (Edge: while game.paused, time stands still, so pressed stays true until the game resumes.) */
(function (global) {
  'use strict';
  const ACI = global.ACI = global.ACI || {};
  const ALIAS = { spacebar: 'space', esc: 'escape', up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright',
    return: 'enter', ctrl: 'control', del: 'delete', mouse: 'mouse0', click: 'mouse0', pointer: 'mouse0', plus: '+', minus: '-' };
  // key-name normalization: ' ' -> 'space', 'ArrowUp' -> 'arrowup', 'Esc' -> 'escape', 'W' -> 'w', 'up' -> 'arrowup'
  function norm(k) {
    if (k === ' ') return 'space';
    k = String(k == null ? '' : k).trim().toLowerCase();
    return ALIAS[k] || k;
  }
  const DEFAULTS = { left: ['a', 'arrowleft'], right: ['d', 'arrowright'], up: ['w', 'arrowup'], down: ['s', 'arrowdown'],
    jump: ['space', 'w', 'arrowup'], action: ['e', 'enter'], fire: ['z', 'x', 'mouse0'], pause: ['p', 'escape'] };

  ACI.plugin('input', function install(G, opts) {
    // plugin options: ACI.game(el, {plugins:{input:{defaults:false, touch:true, noContextMenu:true}}})
    const map = {};                       // action -> [normalized keys]
    const downSince = new Map();          // key -> G.time when pressed
    const pressedAt = new Map(), releasedAt = new Map(); // key -> frame number the event arrived after
    const pressCb = {}, releaseCb = {}, listeners = {};
    let frameNo = 0, lastT = G.time, rebinding = null;
    const tick = () => { if (G.time !== lastT) { lastT = G.time; frameNo++; } return frameNo; };
    G.onUpdate(tick);
    // Quick-tap safety: core's game.key() polls held keys, so a tap that starts and ends between two frames is
    // invisible to it. Wrap it so a key pressed since the previous frame also counts as held for this frame.
    const coreKey = G.key;
    G.key = (...names) => coreKey(...names) || names.some(n => { const k = norm(n); return pressedAt.get(k) === tick() - 1; });

    const keysOf = name => map[name] || [norm(name)];
    const anyKey = (name, fn) => keysOf(name).some(fn);
    const fire = (ev, a, b) => (listeners[ev] || []).forEach(f => f(a, b));

    function setKey(k, isDown) {
      k = norm(k); const f = tick();
      if (isDown) {
        if (downSince.has(k)) return;
        downSince.set(k, G.time); pressedAt.set(k, f);
        for (const a in map) if (map[a].includes(k)) (pressCb[a] || []).forEach(fn => fn(a, k));
      } else {
        if (!downSince.has(k)) return;
        downSince.delete(k); releasedAt.set(k, f);
        for (const a in map) if (map[a].includes(k)) (releaseCb[a] || []).forEach(fn => fn(a, k));
      }
    }
    const isBound = k => Object.values(map).some(v => v.includes(k));
    const typing = ev => ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName);
    const onKD = ev => {
      if (typing(ev)) return;
      const k = norm(ev.key);
      if (rebinding) { const r = rebinding; rebinding = null; r(k === 'escape' ? null : k); ev.preventDefault(); return; }
      if (ev.repeat) { if (isBound(k)) ev.preventDefault(); return; }
      if (isBound(k) && !ev.ctrlKey && !ev.metaKey) ev.preventDefault();
      setKey(k, true);
    };
    const onKU = ev => { if (!typing(ev)) setKey(ev.key, false); };
    const onBlur = () => [...downSince.keys()].forEach(k => setKey(k, false));
    window.addEventListener('keydown', onKD); window.addEventListener('keyup', onKU); window.addEventListener('blur', onBlur);
    G.on('destroy', () => { window.removeEventListener('keydown', onKD); window.removeEventListener('keyup', onKU); window.removeEventListener('blur', onBlur); });

    // ---- actions
    const I = G.input = {
      norm,
      map(obj) { if (obj) for (const a in obj) map[a] = [].concat(obj[a]).map(norm); return I.bindings(); },
      bind(a, ...keys) { map[a] = [...new Set([...(map[a] || []), ...keys.flat().map(norm)])]; return I; },
      unbind(a, ...keys) { if (!keys.length) delete map[a]; else if (map[a]) map[a] = map[a].filter(k => !keys.flat().map(norm).includes(k)); return I; },
      bindings() { const o = {}; for (const a in map) o[a] = map[a].slice(); return o; },
      keys: a => keysOf(a).slice(),
      label: a => keysOf(a).map(k => k.length === 1 ? k.toUpperCase() : k).join(' / '),
      // wait for the next key and bind it: input.rebind('jump').then(key => ...). Escape cancels (resolves null).
      rebind(a, o = {}) {
        return new Promise(res => { rebinding = k => { if (k) { if (o.add) I.bind(a, k); else map[a] = [k]; } res(k); }; });
      },
      reset() { for (const a in map) delete map[a]; if (opts.defaults !== false) I.map(DEFAULTS); return I.bindings(); },
      down: a => anyKey(a, k => downSince.has(k)),
      pressed(a) { const f = tick(); return anyKey(a, k => pressedAt.get(k) === f - 1 && downSince.has(k) || pressedAt.get(k) === f - 1 && releasedAt.get(k) === f - 1); },
      released(a) { const f = tick(); return anyKey(a, k => releasedAt.get(k) === f - 1) && !I.down(a); },
      heldFor(a) { let t = -1; keysOf(a).forEach(k => { if (downSince.has(k)) t = Math.max(t, G.time - downSince.get(k)); }); return t; },
      any: () => downSince.size > 0,
      anyPressed() { const f = tick(); for (const [, v] of pressedAt) if (v === f - 1) return true; return false; },
      axis: (neg, pos) => (I.down(pos) ? 1 : 0) - (I.down(neg) ? 1 : 0),
      vector(l = 'left', r = 'right', u = 'up', d = 'down', normalize = true) {
        const x = I.axis(l, r), y = I.axis(u, d), m = Math.hypot(x, y);
        return normalize && m > 1 ? { x: x / m, y: y / m } : { x, y };
      },
      onPress(a, fn) { (pressCb[a] = pressCb[a] || []).push(fn); return I; },
      onRelease(a, fn) { (releaseCb[a] = releaseCb[a] || []).push(fn); return I; },
      press: k => setKey(k, true),      // synthetic input (touch buttons, agents, tests)
      release: k => setKey(k, false),
      on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return I; }, // click, release, dragstart, drag, dragend
    };
    I.reset();

    // ---- pointer (mouse + touch share pointer events; a tap is a click)
    const P = I.pointer = { x: -1, y: -1, sx: -1, sy: -1, down: false, start: null, drag: null };
    let clickF = -9, relF = -9, dragEndF = -9, lastDrag = null, pid = null;
    const canvas = G.canvas;
    canvas.style.touchAction = 'none';
    // x,y = world cell (camera aware), sx,sy = screen cell
    const cell = ev => { const r = canvas.getBoundingClientRect(), sx = Math.floor((ev.clientX - r.left) / G.cellW), sy = Math.floor((ev.clientY - r.top) / G.cellH); const w = G.toWorld ? G.toWorld(sx, sy) : { x: sx, y: sy }; return { x: w.x, y: w.y, sx, sy }; };
    canvas.addEventListener('pointerdown', ev => {
      if (pid !== null) return; pid = ev.pointerId; try { canvas.setPointerCapture(pid); } catch (e) {}
      const c = cell(ev); Object.assign(P, c, { down: true, start: c, drag: null }); clickF = tick();
      setKey('mouse' + (ev.button || 0), true); fire('click', c);
    });
    canvas.addEventListener('pointermove', ev => {
      if (pid !== null && ev.pointerId !== pid) return;
      const c = cell(ev); Object.assign(P, c);
      if (P.down && P.start) {
        const dx = c.x - P.start.x, dy = c.y - P.start.y;
        if (P.drag || dx || dy) { const first = !P.drag; P.drag = { from: P.start, to: c, dx, dy }; fire(first ? 'dragstart' : 'drag', P.drag); }
      }
    });
    const up = ev => {
      if (ev.pointerId !== pid) return; pid = null; const c = cell(ev); Object.assign(P, c, { down: false });
      relF = tick(); if (P.drag) { lastDrag = P.drag; dragEndF = relF; fire('dragend', P.drag); }
      P.drag = null; setKey('mouse0', false); setKey('mouse1', false); setKey('mouse2', false); fire('release', c);
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', ev => { if (opts.noContextMenu) ev.preventDefault(); });
    I.cell = () => ({ x: P.x, y: P.y, sx: P.sx, sy: P.sy });
    I.pointerDown = () => P.down;
    I.clicked = () => (tick() - 1 === clickF ? { x: P.start.x, y: P.start.y } : null);   // one frame, null otherwise. tap == click
    I.tapped = I.clicked;
    I.pointerReleased = () => tick() - 1 === relF;
    I.drag = () => P.drag;                                                              // while dragging: {from,to,dx,dy}
    I.dragEnded = () => (tick() - 1 === dragEndF ? lastDrag : null);                    // one frame

    // ---- on-screen touch controls: d-pad feeds arrow keys, buttons feed any key (default A=space, B=x)
    I.touchControls = function (o = {}) {
      const btns = o.buttons || { A: 'space', B: 'x' }, size = o.size || 56;
      const root = document.createElement('div');
      root.style.cssText = 'position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:space-between;align-items:flex-end;pointer-events:none;z-index:99999;padding:12px max(16px,env(safe-area-inset-left)) max(12px,env(safe-area-inset-bottom));opacity:' + (o.opacity ?? 0.6) + ';user-select:none;-webkit-user-select:none';
      const mk = (label, key, css) => {
        const b = document.createElement('button'); b.textContent = label; b.setAttribute('aria-label', String(key));
        b.style.cssText = `width:${size}px;height:${size}px;font:700 18px monospace;color:#d8def0;background:#0d1222cc;border:1px solid #5d7fc4;border-radius:10px;pointer-events:auto;touch-action:none;${css || ''}`;
        const on = ev => { ev.preventDefault(); setKey(key, true); }, off = ev => { ev.preventDefault(); setKey(key, false); };
        b.addEventListener('pointerdown', on); ['pointerup', 'pointercancel', 'pointerleave'].forEach(e => b.addEventListener(e, off));
        return b;
      };
      if (o.dpad !== false) {
        const pad = document.createElement('div'); pad.style.cssText = `display:grid;grid-template-columns:repeat(3,${size}px);grid-template-rows:repeat(3,${size}px);gap:4px`;
        const at = (l, k, c, r) => { const b = mk(l, k, `grid-column:${c};grid-row:${r}`); pad.appendChild(b); };
        at('▲', 'arrowup', 2, 1); at('◀', 'arrowleft', 1, 2); at('▶', 'arrowright', 3, 2); at('▼', 'arrowdown', 2, 3);
        root.appendChild(pad);
      } else root.appendChild(document.createElement('div'));
      const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;align-items:flex-end';
      Object.keys(btns).forEach((l, i) => row.appendChild(mk(l, btns[l], `border-radius:50%;margin-bottom:${i % 2 ? 28 : 0}px`)));
      root.appendChild(row);
      if (o.onlyTouch && !(global.matchMedia && global.matchMedia('(pointer: coarse)').matches)) root.style.display = 'none';
      root.setAttribute('data-aci-touch', '1'); document.body.appendChild(root);
      return { el: root, show: () => (root.style.display = 'flex'), hide: () => (root.style.display = 'none'), destroy: () => root.remove() };
    };
    I.isTouch = () => !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
    G.on('destroy', () => document.querySelectorAll('[data-aci-touch]').forEach(n => n.remove()));
    if (opts.touch) I.touchControls(typeof opts.touch === 'object' ? opts.touch : {});
  });
})(typeof window !== 'undefined' ? window : globalThis);
