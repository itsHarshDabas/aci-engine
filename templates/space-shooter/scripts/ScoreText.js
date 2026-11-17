// Shows "Label n" in the top-left corner of the screen and can send the player to a scene when the score is reached.
// Add it to any entity (a one-letter text sprite is fine). State key "score" is what the Collectible behaviour adds to.
ACI.behaviour('ScoreText', {
  title: 'Score Text', description: 'Shows the score in the corner; optionally jumps to a scene at a goal',
  params: {
    label: { type: 'string', default: 'Score', label: 'Label' },
    stateKey: { type: 'string', default: 'score', label: 'State key' },
    reset: { type: 'boolean', default: false, label: 'Reset to 0 when the scene starts' },
    goal: { type: 'number', default: 0, min: 0, max: 9999, label: 'Goal (0 = none)' },
    goalScene: { type: 'scene', default: '', label: 'Go to scene at goal' },
  },
  start(e, game, p) { if (p.reset) game.state[p.stateKey] = 0; e._last = null; },
  update(e, dt, game, p) {
    const n = Number(game.state[p.stateKey]) || 0;
    if (n !== e._last) { e._last = n; e.setSprite(ACI.sprite(p.label + ' ' + n + (p.goal ? ' / ' + p.goal : ''), { color: '#ffd24a' })); }
    e.x = game.camera.x + 1; e.y = game.camera.y; // stick to the screen corner
    if (p.goal && n >= p.goal && p.goalScene && !e._won) { e._won = true; game.goto(p.goalScene, null, { transition: 'fade' }); }
  },
});
