// The player's ship: left/right (arrows or A/D) and fire with Space. Clear every invader to win.
ACI.behaviour('ShipControl', {
  title: 'Ship Control', description: 'Move left/right and fire with Space',
  params: {
    speed: { type: 'number', default: 38, min: 0, max: 120, label: 'Speed' },
    cooldown: { type: 'number', default: 0.28, min: 0.05, max: 2, label: 'Fire delay (s)' },
    bullet: { type: 'asset', default: 'bullet', label: 'Bullet sprite' },
    winScene: { type: 'scene', default: 'win', label: 'Scene when all invaders are gone' },
  },
  start(e, game) { e._cd = 0; game.state.score = 0; },
  update(e, dt, game, p) {
    const mv = (game.key('ArrowRight', 'd') ? 1 : 0) - (game.key('ArrowLeft', 'a') ? 1 : 0);
    e.x = Math.max(1, Math.min(game.cols - e.w - 1, e.x + mv * p.speed * dt));
    e._cd -= dt;
    if (game.key(' ') && e._cd <= 0) {
      e._cd = p.cooldown;
      const spr = (game.assets && game.assets[p.bullet]) || ACI.sprite('!');
      game.add(spr, { x: e.x + e.w / 2 - 0.5, y: e.y - 1, tags: ['bullet'], update(dt, b, G) {
        b.y -= 30 * dt; if (b.y < -2) return G.remove(b);
        for (const i of G.entities) if (i.tags && i.tags.includes('invader') && !i._dead && b.x >= i.x && b.x < i.x + i.w && b.y >= i.y && b.y < i.y + i.h) {
          i._dead = true; G.state.score = (G.state.score || 0) + 10;
          if (G.burst) G.burst(i.x + i.w / 2, i.y + 1, 'explosion', { count: 16 });
          G.remove(i); G.remove(b); break;
        }
      } });
    }
    if (!game.entities.some(i => i.tags && i.tags.includes('invader')) && !e._won) { e._won = true; game.goto(p.winScene, null, { transition: 'fade' }); }
  },
});
