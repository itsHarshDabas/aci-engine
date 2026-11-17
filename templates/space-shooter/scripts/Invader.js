// An invader. The whole fleet marches together: sideways, dropping a row at each edge, and speeds up as it thins out.
ACI.behaviour('Invader', {
  title: 'Invader', description: 'Marches with the fleet and drops bombs',
  params: {
    speed: { type: 'number', default: 5, min: 0, max: 40, label: 'March speed' },
    bombEvery: { type: 'number', default: 3, min: 0.5, max: 20, label: 'A bomb falls about every (s)' },
    loseScene: { type: 'scene', default: 'gameover', label: 'Scene when the invaders land' },
  },
  start(e, game) { game.state._dir = 1; },
  update(e, dt, game, p) {
    const fleet = game.entities.filter(i => i.tags && i.tags.includes('invader'));
    if (game._fleetT !== game.time) { // the first invader this frame steps the whole fleet
      game._fleetT = game.time;
      let dir = game.state._dir || 1, edge = false;
      for (const i of fleet) if ((dir > 0 && i.x + i.w >= game.cols - 1) || (dir < 0 && i.x <= 1)) edge = true;
      if (edge) { dir = -dir; game.state._dir = dir; for (const i of fleet) i.y += 2; }
      const go = dir * (p.speed + (40 - Math.min(40, fleet.length)) * 0.25) * dt;
      for (const i of fleet) i.x += go;
      if (Math.random() < dt / (p.bombEvery / Math.max(1, fleet.length / 6))) {
        const b = fleet[Math.floor(Math.random() * fleet.length)];
        const spr = (game.assets && game.assets.bomb) || ACI.sprite(':');
        game.add(spr, { x: b.x + b.w / 2, y: b.y + b.h, tags: ['bomb'], update(dt, m, G) {
          m.y += 13 * dt; if (m.y > G.rows) return G.remove(m);
          const s = G.entities.find(o => o.tags && o.tags.includes('player'));
          if (s && m.x >= s.x && m.x < s.x + s.w && m.y >= s.y && m.y < s.y + s.h) { if (G.shake) G.shake(4, 0.4); G.goto(p.loseScene, null, { transition: 'fade' }); }
        } });
      }
    }
    const ship = game.entities.find(o => o.tags && o.tags.includes('player'));
    if (ship && e.y + e.h >= ship.y && !game._lost) { game._lost = true; game.goto(p.loseScene, null, { transition: 'fade' }); }
  },
});
