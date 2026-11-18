/* Project X (ACI port) - interiors (bedroom, kitchen): furniture painter, room layout, and everything you can do to each object
   (a faithful port of engine/interactions.py). */
(function () {
  'use strict';
  const PX = window.PX, P = PX.paint, TAU = Math.PI * 2;
  const R = PX.rooms = {};

  // room definitions from engine/world.py (tile units). walkable region is inside walls (wall = top 2 tile rows)
  R.ROOMS = {
    bedroom: { name: 'Your room', floor: 'wood', w: 16, h: 11, walk: [1, 2, 14, 10], objects: [
      { kind: 'rug', x: 5, y: 4, w: 6, h: 4, solid: false }, { kind: 'window', x: 11, y: 0, w: 3, h: 2 }, { kind: 'bed', x: 1, y: 2, w: 2, h: 3 },
      { kind: 'nightstand', x: 3, y: 2, w: 1, h: 1 }, { kind: 'tv', x: 6, y: 2, w: 3, h: 2 }, { kind: 'console', x: 9, y: 2, w: 1, h: 1 },
      { kind: 'sofa', x: 6, y: 8, w: 4, h: 2 }, { kind: 'stairs', x: 13, y: 7, w: 2, h: 3 }] },
    kitchen: { name: 'Kitchen', floor: 'tile', w: 16, h: 11, walk: [1, 2, 14, 10], objects: [
      { kind: 'mat', x: 6, y: 8, w: 4, h: 2, solid: false }, { kind: 'fridge', x: 1, y: 2, w: 2, h: 1 }, { kind: 'sink', x: 3, y: 2, w: 2, h: 1 },
      { kind: 'stove', x: 5, y: 2, w: 2, h: 1 }, { kind: 'counter', x: 7, y: 2, w: 2, h: 1 }, { kind: 'door', x: 10, y: 0, w: 2, h: 2 },
      { kind: 'table', x: 5, y: 5, w: 5, h: 2 }, { kind: 'plant', x: 1, y: 9, w: 1, h: 1 }, { kind: 'stairs_up', x: 13, y: 7, w: 2, h: 3 }] },
  };
  R.NAMES = { bed: 'Bed', nightstand: 'Nightstand', tv: 'TV', console: 'Console', sofa: 'Sofa', window: 'Window', stairs: 'Stairs', stairs_up: 'Stairs', fridge: 'Fridge', sink: 'Sink', stove: 'Stove', counter: 'Counter', door: 'Front door', table: 'Table', plant: 'Plant', grandma: 'Grandma', bench: 'Bench', vending: 'Vending machine' };

  // ---------------------------------------------------------------- furniture painter (S px per tile)
  const rr = P.rr, grad = P.grad;
  R.paint = (kind, w, h, S, st) => {
    const W = w * S, H = h * S, c = P.canvas(W, H), x = c.getContext('2d');
    const box = (px, py, bw, bh, c0, c1, r) => { x.fillStyle = grad(x, px, py, px, py + bh, [[0, c0], [1, c1]]); rr(x, px, py, bw, bh, r || 3); x.fill(); x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 1.2; x.stroke(); };
    const shadow = () => { x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(2, H - 5, W - 4, 5); };
    switch (kind) {
      case 'bed': shadow(); box(2, H * .08, W - 4, H * .9, '#5a3a24', '#3a2216', 6); box(8, H * .12, W - 16, H * .2, '#f4f0ea', '#cfc6bc', 8); box(8, H * .3, W - 16, H * .66, '#4a6ab8', '#2a3e78', 6); x.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 4; i++) x.fillRect(10, H * (.4 + i * .14), W - 20, 3); x.fillStyle = '#f4f0ea'; rr(x, 12, H * .13, W - 24, H * .14, 8); x.fill(); break;
      case 'nightstand': shadow(); box(4, H * .3, W - 8, H * .65, '#7a5a3a', '#4a3220'); x.fillStyle = '#ffe9a0'; x.beginPath(); x.moveTo(W * .3, H * .3); x.lineTo(W * .7, H * .3); x.lineTo(W * .62, H * .06); x.lineTo(W * .38, H * .06); x.fill(); x.fillStyle = radial(x, W / 2, H * .15, 2, W * .9, 'rgba(255,230,150,.5)'); x.fillRect(0, 0, W, H * .5); x.fillStyle = '#222'; x.fillRect(W * .35, H * .5, W * .3, H * .16); break;
      case 'tv': shadow(); box(W * .05, H * .1, W * .9, H * .66, '#1a1c26', '#0c0d14', 6); x.fillStyle = st && st.on ? grad(x, 0, 0, W, H, [[0, '#6a8aff'], [.5, '#a0c0ff'], [1, '#4a60c8']]) : grad(x, 0, 0, W, H, [[0, '#12161e'], [1, '#222a38']]); rr(x, W * .09, H * .15, W * .82, H * .55, 3); x.fill(); if (st && st.on) { for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(255,255,255,${.1 + P.hash(i, 1, 2) * .3})`; x.fillRect(W * (.09 + P.hash(i, 2, 3) * .8), H * (.15 + P.hash(i, 3, 3) * .5), 8, 2); } } box(W * .35, H * .78, W * .3, H * .16, '#2a2c38', '#12141c'); break;
      case 'console': box(W * .15, H * .35, W * .7, H * .35, '#d8dce8', '#8a90a4'); x.fillStyle = '#4a8aff'; x.fillRect(W * .25, H * .5, W * .2, 4); break;
      case 'sofa': shadow(); box(4, H * .1, W - 8, H * .5, '#7a3a48', '#4a2230', 10); box(4, H * .45, W - 8, H * .48, '#9a4a5c', '#6a2e3c', 8); box(0, H * .3, W * .08, H * .66, '#7a3a48', '#4a2230', 6); box(W * .92, H * .3, W * .08, H * .66, '#7a3a48', '#4a2230', 6); x.strokeStyle = 'rgba(0,0,0,.3)'; for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo(W * i / 3, H * .5); x.lineTo(W * i / 3, H * .92); x.stroke(); } break;
      case 'window': x.fillStyle = '#c8c0b0'; x.fillRect(0, 0, W, H); x.fillStyle = grad(x, 0, 0, 0, H, [[0, '#0a1230'], [1, '#2a3a78']]); x.fillRect(6, 6, W - 12, H - 12); x.fillStyle = '#f8f0c0'; x.beginPath(); x.arc(W * .72, H * .35, 9, 0, TAU); x.fill(); x.fillStyle = '#c8c0b0'; x.fillRect(W / 2 - 2, 6, 4, H - 12); x.fillRect(6, H / 2, W - 12, 4); x.strokeStyle = 'rgba(160,190,240,.7)'; for (let i = 0; i < 18; i++) { const rx = 8 + P.hash(i, 1, 4) * (W - 16), ry = 8 + P.hash(i, 2, 4) * (H - 20); x.beginPath(); x.moveTo(rx, ry); x.lineTo(rx - 3, ry + 9); x.stroke(); } break;
      case 'stairs': case 'stairs_up': { const up = kind === 'stairs'; x.fillStyle = '#3a2a20'; x.fillRect(0, 0, W, H); const n = 7; for (let i = 0; i < n; i++) { const yy = H * i / n; x.fillStyle = grad(x, 0, yy, 0, yy + H / n, [[0, up ? '#a07a50' : '#8a6644'], [1, '#5a3e26']]); x.fillRect(4, yy + 2, W - 8, H / n - 2); } x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, 0, 5, H); x.fillRect(W - 5, 0, 5, H); x.fillStyle = '#ffd27a'; x.font = `bold ${S * .4}px sans-serif`; x.textAlign = 'center'; x.fillText(up ? '▼' : '▲', W / 2, H - 8); break; }
      case 'fridge': shadow(); box(4, 2, W - 8, H - 6, '#e4e8f0', '#9aa2b4', 6); x.strokeStyle = '#7a8296'; x.beginPath(); x.moveTo(6, H * .38); x.lineTo(W - 6, H * .38); x.stroke(); x.fillStyle = '#7a8296'; x.fillRect(W - 14, H * .15, 4, H * .16); x.fillRect(W - 14, H * .5, 4, H * .22); for (let i = 0; i < 7; i++) { x.fillStyle = ['#ff7ab0', '#ffd24a', '#7ad0ff', '#9aff9a'][i % 4]; x.fillRect(10 + P.hash(i, 1, 1) * (W * .5), H * .12 + P.hash(i, 2, 1) * H * .5, 9, 11); } break;
      case 'sink': shadow(); box(2, H * .1, W - 4, H * .86, '#c0c8d8', '#7a8296', 4); x.fillStyle = '#6a7a9a'; rr(x, W * .15, H * .3, W * .7, H * .4, 8); x.fill(); x.fillStyle = '#aab'; x.fillRect(W / 2 - 3, H * .1, 6, H * .24); break;
      case 'stove': shadow(); box(2, H * .1, W - 4, H * .86, '#9aa0b0', '#4a4e60', 4); for (let i = 0; i < 2; i++) { x.fillStyle = '#16181f'; x.beginPath(); x.arc(W * (.3 + i * .4), H * .45, S * .25, 0, TAU); x.fill(); x.fillStyle = i ? '#5a8aff' : '#ff9a3a'; x.beginPath(); x.arc(W * (.3 + i * .4), H * .45, S * .1, 0, TAU); x.fill(); } x.fillStyle = '#c8ccd8'; x.beginPath(); x.ellipse(W * .3, H * .32, S * .18, S * .14, 0, 0, TAU); x.fill(); break;
      case 'counter': shadow(); box(2, H * .1, W - 4, H * .86, '#c8aa80', '#8a6a44', 4); x.fillStyle = '#e8d4b0'; x.fillRect(2, H * .1, W - 4, H * .26); for (let i = 0; i < 3; i++) { x.fillStyle = ['#e8e0d0', '#d8704a', '#8ab870'][i]; rr(x, W * (.15 + i * .26), H * .02, W * .18, H * .28, 4); x.fill(); } break;
      case 'door': x.fillStyle = '#c8c0b0'; x.fillRect(0, 0, W, H); x.fillStyle = grad(x, 0, 0, 0, H, [[0, '#6a4426'], [1, '#3a2010']]); rr(x, W * .12, 6, W * .76, H - 6, 4); x.fill(); x.strokeStyle = '#2a160a'; x.lineWidth = 2; for (let i = 0; i < 2; i++) { x.strokeRect(W * (.2 + i * .34), H * .16, W * .22, H * .3); x.strokeRect(W * (.2 + i * .34), H * .54, W * .22, H * .34); } x.fillStyle = '#e8c850'; x.beginPath(); x.arc(W * .8, H * .55, 4, 0, TAU); x.fill(); [.32, .52, .72].forEach(k => { x.fillStyle = '#b0b4c0'; x.fillRect(W * .12 - 4, H * k, 10, 5); }); break;
      case 'table': shadow(); box(2, H * .2, W - 4, H * .7, '#9a6a3c', '#5a3a1c', 8); x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(8, H * .26, W - 16, 4); [[.3, .45], [.62, .5]].forEach(([a, b], i) => { x.fillStyle = '#f0f0f4'; x.beginPath(); x.ellipse(W * a, H * b, S * .22, S * .14, 0, 0, TAU); x.fill(); x.fillStyle = '#6a3a1a'; x.beginPath(); x.ellipse(W * a, H * b, S * .15, S * .09, 0, 0, TAU); x.fill(); if (i === 0) { x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 2; x.beginPath(); x.moveTo(W * a - 4, H * b - 8); x.quadraticCurveTo(W * a, H * b - 20, W * a + 4, H * b - 30); x.stroke(); } }); break;
      case 'plant': shadow(); x.fillStyle = grad(x, 0, 0, 0, H, [[0, '#b0603a'], [1, '#6a3420']]); x.beginPath(); x.moveTo(W * .25, H * .62); x.lineTo(W * .75, H * .62); x.lineTo(W * .66, H * .95); x.lineTo(W * .34, H * .95); x.fill(); for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * .3; x.strokeStyle = ['#2f8a3c', '#44a04a', '#78cc6a'][i % 3]; x.lineWidth = 5; x.beginPath(); x.moveTo(W / 2, H * .62); x.quadraticCurveTo(W / 2 + Math.cos(a) * W * .3, H * .3, W / 2 + Math.cos(a) * W * .5, H * (.55 - Math.abs(Math.sin(a)) * .35)); x.stroke(); } break;
      case 'grandma_chair': break;
    }
    return c;
  };
  const radial = (x, cx, cy, r0, r1, col) => { const g = x.createRadialGradient(cx, cy, r0, cx, cy, r1); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); return g; };

  // ---------------------------------------------------------------- interactions (engine/interactions.py)
  const me = (t, e) => PX.me(t, e), gran = (t, e) => PX.line('Grandma', t, e);
  const NIGHT_TALK = [gran('Oh! You startled me, dear. Couldn\'t sleep?'), me('I heard something. Like a scream, from somewhere under the house.', 'scared'), gran('...Did you now.'), gran('Sit. Drink something warm. Whatever you heard, it can\'t get past the door.'), me('Grandma, why are all three locks bolted?', 'scared'), gran('Old habits, sweetheart. Old habits.')];
  const TALKS = [
    [gran('Eat properly. You\'re nothing but bones and that jacket.'), me('It\'s a good hoodie.'), gran('It is. Your father had one just like it.')],
    [gran('The rain\'s been falling for days. It always does before... well. Never mind.'), me('Before what?', 'scared'), gran('Before nothing. Go on, off with you.')],
    [gran('When you were small you\'d hide under this table whenever it stormed.'), me('You told me monsters can\'t get through the tablecloth.', 'happy'), gran('And they can\'t, dear. Remember that.')],
    [gran('I\'m not as young as I was, you know. Help an old woman out once in a while, hm?', 'happy')],
  ];
  const CHORES = ['wash the dishes', 'sweep the floor', 'water the plants', 'wipe down the counters'];
  R.actionsFor = kind => {
    const f = PX.flags, inspect = { id: 'inspect', label: 'Inspect' };
    switch (kind) {
      case 'bed': return [inspect, { id: 'sit', label: 'Sit' }, { id: 'sleep', label: 'Sleep' }];
      case 'nightstand': return [inspect, { id: 'lamp', label: f.lamp_on ? 'Turn lamp off' : 'Turn lamp on' }, { id: 'phone', label: 'Check phone' }];
      case 'tv': return [inspect, { id: 'tv', label: f.tv_on ? 'Turn off' : 'Turn on' }];
      case 'console': return [inspect, { id: 'play', label: 'Play' }];
      case 'sofa': return [inspect, { id: 'sit', label: 'Sit' }, { id: 'search', label: 'Search cushions' }];
      case 'window': return [inspect, { id: 'window', label: f.window_open ? 'Close window' : 'Open window' }];
      case 'stairs': return [inspect, { id: 'go', label: 'Go downstairs' }];
      case 'stairs_up': return [inspect, { id: 'go', label: 'Go upstairs' }];
      case 'fridge': return [inspect, { id: 'take', label: 'Take ingredients' }];
      case 'sink': return [inspect, { id: 'drink', label: 'Drink water' }, { id: 'wash', label: 'Wash face' }];
      case 'stove': return [inspect, { id: 'cook', label: 'Cook' }];
      case 'counter': return [inspect];
      case 'door': return f.door_opened ? [inspect, { id: 'go', label: 'Go outside' }] : [inspect, f.knocking ? { id: 'open', label: 'Open the door' } : { id: 'try', label: 'Try the door' }];
      case 'table': return [inspect, { id: 'sit', label: 'Sit' }];
      case 'plant': return [inspect, { id: 'water', label: 'Water plant' }];
      case 'grandma': return [{ id: 'talk', label: 'Talk' }, { id: 'chores', label: 'Help with chores' }, { id: 'food', label: 'Ask for food' }, { id: 'kill', label: 'Kill' }];
      case 'bench': return [{ id: 'rest', label: 'Rest' }];
      case 'vending': return [{ id: 'buy', label: 'Buy Canned Coffee ($15)' }];
      case 'friend': case 'officer': case 'man': return [{ id: 'talk', label: 'Talk' }];
    }
    return [];
  };
  // W = the world scene (travel, requests)
  R.perform = (W, kind, action) => {
    const f = PX.flags, p = PX.P, clock = PX.clock, day = clock.day;
    f[kind + '_' + action] = true;
    const inv = id => { p.inventory[id] = (p.inventory[id] || 0) + 1; };
    switch (kind) {
      case 'bed':
        if (action === 'inspect') return [me('Your bed. The sheets are twisted into knots.', 'tired')];
        if (action === 'sit') return [me('You sit on the edge of the bed. The springs creak.')];
        if (action === 'sleep') { W.sleep(); return []; }
        break;
      case 'nightstand':
        if (action === 'inspect') return [me('A lamp and a cracked phone. Everything is covered in dust.')];
        if (action === 'lamp') { f.lamp_on = !f.lamp_on; return [me(f.lamp_on ? 'The lamp glows warmly.' : 'You switch the lamp off.')]; }
        if (action === 'phone') return [me('Three missed calls. Unknown number.', 'scared'), me('No voicemail. Whoever it was didn\'t want to leave a message.')];
        break;
      case 'tv':
        if (action === 'inspect') return f.tv_on ? [me('The screen glows blue. Something whispers under the static.', 'scared')] : [me('A dusty old TV. The dark screen shows your tired face.', 'tired')];
        if (action === 'tv') { f.tv_on = !f.tv_on; W.refreshRoom(); return f.tv_on ? [me('The TV flickers on. A faint voice whispers your name.', 'scared')] : [me('You turn the TV off. The room feels quieter.')]; }
        break;
      case 'console':
        if (action === 'inspect') return [me('Your old console. The controller is already plugged in.')];
        if (action === 'play') { if (!f.tv_on) return [me('The TV is off. Maybe turn it on first.')]; clock.pass(60); PX.heal(p, 0, 10); return [me('You lose yourself in a game for an hour.', 'happy'), me('Rift Energy +10. Funny how that works.')]; }
        break;
      case 'sofa':
        if (action === 'inspect') return [me('A worn sofa. Something glints between the cushions.')];
        if (action === 'sit') { PX.heal(p, 10); W.rest(false); return [me('You sink into the cushions and rest for a while.', 'happy'), me('HP +10.')]; }
        if (action === 'search') { if (f.found_coins) return [me('Nothing else in here.')]; f.found_coins = true; p.money += 20; return [me('You dig between the cushions...'), me('Twenty bucks in loose change!', 'happy')]; }
        break;
      case 'window':
        if (action === 'inspect') return [me('Rain taps the glass. The street below is empty.')];
        if (action === 'window') { f.window_open = !f.window_open; return f.window_open ? [me('Cold air and the smell of rain rush in.', 'surprised')] : [me('You close the window. The room warms up again.')]; }
        break;
      case 'stairs':
        if (action === 'inspect') return [me('The stairs lead down to the kitchen. A light is on down there.')];
        if (action === 'go') { let after = []; if (!f.seen_kitchen) { f.seen_kitchen = true; f.knock_in = 3.0; if (clock.isNight) after = [me('The kitchen light is on. At this hour?', 'scared')]; } W.travel('kitchen', 12, 8, 'left', after); return []; }
        break;
      case 'stairs_up':
        if (action === 'inspect') return [me('The stairs back up to your room.')];
        if (action === 'go') { W.travel('bedroom', 12, 8, 'left'); return []; }
        break;
      case 'fridge':
        if (action === 'inspect') { const held = Object.entries(PX.stock.fridge).filter(e => e[1] > 0).map(([i, n]) => PX.ITEMS[i].name + ' x' + n); return held.length ? [me('A humming fridge covered in old magnets and faded photos.'), me('Inside: ' + held.join(', ') + '.')] : [me('The fridge is completely empty. Grandma will need to shop soon.', 'tired')]; }
        if (action === 'take') { W.openFridge(); return []; }
        break;
      case 'sink':
        if (action === 'inspect') return [me('A deep porcelain sink. The tap drips, slowly.')];
        if (action === 'drink') { PX.heal(p, 5); return [me('Cold water. It helps a little. HP +5.')]; }
        if (action === 'wash') return [me('You splash water on your face. Your hands are still shaking.', 'tired')];
        break;
      case 'stove':
        if (action === 'inspect') return [me('An old gas stove. A kettle sits on the back burner, still warm.')];
        if (action === 'cook') { W.openCook(); return []; }
        break;
      case 'counter': return [me('Jars of rice, a cracked teapot. Everything is labelled in neat handwriting.')];
      case 'door':
        if (action === 'inspect') { if (f.door_opened) return [me('The front door. Cold rain blows in through the gap.')]; if (f.knocking) return [me('Three knocks. Slow, patient. Whoever it is isn\'t leaving.', 'scared')]; return [me('The front door. Three locks, all bolted from the inside.')]; }
        if (action === 'try') return [me('You pull at the handle. It won\'t budge.', 'scared'), me('Why is it bolted? Grandma never locks the door.', 'scared')];
        if (action === 'go') { W.travel('street', 7, 7, 'down'); return []; }
        if (action === 'open') { f.door_opened = true; W.afterLines([me('Your hands shake as you slide the bolts back, one by one.', 'scared'), me('One. Two. Three. ...You open the door.', 'surprised')], () => W.playCutscene('footprints', () => W.travel('street', 7, 7, 'down', [me('Nobody is there. Only the rain, and wet footprints leading away down the street.', 'scared')]))); return null; }
        break;
      case 'table':
        if (action === 'inspect') return clock.isNight ? [me('Two cups on the table. One is still steaming. At this hour.', 'scared')] : [me('Grandma\'s old wooden table. It has seen a lot of family dinners.')];
        if (action === 'sit') { PX.heal(p, 5); return [me('You sit and let your heartbeat slow down. HP +5.')]; }
        break;
      case 'plant':
        if (action === 'inspect') return [me('A fern. Greener than it has any right to be.')];
        if (action === 'water') { if (f.plant_day === day) return [me('It\'s already been watered today.')]; f.plant_day = day; return [me('You water the fern. It seems to lean towards you.', 'surprised')]; }
        break;
      case 'grandma': return R.grandma(W, action);
      case 'bench': W.rest(true); return [me('You sit on the wet bench and breathe. Your flasks are refilled.', 'tired')];
      case 'vending':
        if (p.money < 15) return [me('Not enough money. $15 for a can of coffee.')];
        p.money -= 15; inv('coffee'); return [me('The machine clunks. Got Canned Coffee. (-$15)', 'happy')];
      case 'friend': return W.npcTalk('friend');
      case 'officer': return W.npcTalk('officer');
      case 'man': return W.npcTalk('man');
    }
    return [me('...')];
  };
  R.grandma = (W, action) => {
    const f = PX.flags, p = PX.P, clock = PX.clock, day = clock.day;
    if (action === 'talk') { if (clock.isNight && !f.talked_at_night) { f.talked_at_night = true; return NIGHT_TALK.slice(); } const n = f.gran_talks || 0; f.gran_talks = n + 1; return TALKS[n % TALKS.length].slice(); }
    if (action === 'chores') {
      if (f.chore_day === day) return [gran('You\'ve done plenty today, sweetheart. Go rest.'), me('...Okay.')];
      const n = f.chores_done || 0; f.chores_done = n + 1; f.chore_day = day; clock.pass(45); p.money += 10; f.grandma_bond = (f.grandma_bond || 0) + 1; const chore = CHORES[n % CHORES.length];
      return [me('Let me help. I\'ll ' + chore + '.'), gran('Such a good boy. You get that from your mother.', 'happy'), me('You ' + chore + ' together for a while. Grandma hums an old song.', 'happy'), gran('Here, for your trouble.'), me('Got $10. Time passes: 45 minutes.')];
    }
    if (action === 'food') { if (f.food_day === day) return [gran('You\'ve eaten already, dear! I\'m not made of rice.')]; f.food_day = day; p.inventory.rice_ball = (p.inventory.rice_ball || 0) + 1; f.grandma_bond = (f.grandma_bond || 0) + 1; return [gran('Sit, sit. I made too much rice again.', 'happy'), me('Got Rice Ball.', 'happy')]; }
    if (action === 'kill') { f.tried_to_kill_grandma = (f.tried_to_kill_grandma || 0) + 1; return [PX.line('???', 'Ofc you weren\'t really gonna do that, right?', 'scared')]; }
    return [me('...')];
  };
})();
