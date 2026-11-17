/* ACI tilemap plugin: a grid of characters you can draw, collide with, and spawn entities from.
     const map = game.tilemap(`
     ##########
     #  c    P#
     ##########`, { '#': { color:'#8a6', solid:true }, 'c': '.' });   // legend: char -> {char,color,bg,solid,...} or just a char
     map.spawn('P', (x, y) => game.add(heroSprite, { x, y }));          // marker chars become entities (tile is cleared)
   World coordinates: map.offsetX/offsetY is where tile (0,0) sits in the world (default 0,0); all get/set/solidAt/
   tileAt take WORLD cells. The world grows (game.setWorld) to fit the map; the camera scrolls it. Pass {setWorld:false} to skip.
   Also accepts a rows array, or an .aci.json-like object { rows:[...], legend:{...} }. map.toJSON() gives that object back.
   Tile defs may animate: { char:['~','≈'], fps:3 }. Unknown chars are drawn as themselves and are not solid. */
ACI.plugin('tilemap', function install(game, opts) {
  'use strict';
  const maps = game.tilemaps = [];

  function normLegend(l) {
    const out = {};
    for (const k in l) { const d = l[k]; out[k] = typeof d === 'string' ? { char: d } : Object.assign({ char: k }, d); }
    return out;
  }
  function splitRows(src, dedent) {
    let rows = Array.isArray(src) ? src.map(String) : String(src).replace(/\r/g, '').split('\n');
    while (rows.length && !rows[0].trim()) rows.shift();
    while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
    if (dedent !== false && !Array.isArray(src)) {
      const ind = Math.min(...rows.filter(r => r.trim()).map(r => r.match(/^ */)[0].length));
      if (ind > 0 && ind !== Infinity) rows = rows.map(r => r.slice(ind));
    }
    return rows;
  }

  function create(src, legend, o) {
    o = o || {};
    if (src && typeof src === 'object' && !Array.isArray(src)) { // .aci.json-like object
      legend = Object.assign({}, src.legend, legend); o = Object.assign({}, src.options, o); src = src.rows || src.map;
    }
    const tm = { offsetX: o.x || 0, offsetY: o.y || 0, visible: true, z: o.z !== undefined ? o.z : 5, solidOutside: !!o.solidOutside, name: o.name || null, width: 0, height: 0, grid: [], legend: {} };

    tm.load = (s, l) => {
      if (s && typeof s === 'object' && !Array.isArray(s)) { l = Object.assign({}, s.legend, l); s = s.rows || s.map; }
      const rows = splitRows(s, o.dedent);
      tm.width = Math.max(0, ...rows.map(r => r.length)); tm.height = rows.length;
      tm.grid = rows.map(r => r.padEnd(tm.width, ' ').split(''));
      if (l) tm.legend = normLegend(Object.assign({}, tm.legend, l));
      return tm;
    };
    const def = ch => tm.legend[ch] || (ch === ' ' ? null : (tm.legend[ch] = { char: ch }));
    const ox = () => Math.floor(tm.offsetX), oy = () => Math.floor(tm.offsetY);
    const inb = (x, y) => x >= 0 && y >= 0 && x < tm.width && y < tm.height;
    const L = (x, y) => [Math.floor(x) - ox(), Math.floor(y) - oy()]; // world -> local cell

    tm.get = (x, y) => { [x, y] = L(x, y); return inb(x, y) ? tm.grid[y][x] : null; };
    tm.set = (x, y, ch) => { [x, y] = L(x, y); if (inb(x, y)) tm.grid[y][x] = ch; return tm; };
    tm.tileAt = (x, y) => { const ch = tm.get(x, y), d = ch && def(ch); return d ? Object.assign({}, d, { key: ch, x: Math.floor(x), y: Math.floor(y) }) : null; };
    tm.solidAt = (x, y) => {
      x = Math.floor(x) - ox(); y = Math.floor(y) - oy();
      if (!inb(x, y)) return tm.solidOutside;
      const ch = tm.grid[y][x]; return ch !== ' ' && !!(tm.legend[ch] && tm.legend[ch].solid);
    };
    tm.find = ch => { const r = []; for (let y = 0; y < tm.height; y++) for (let x = 0; x < tm.width; x++) if (tm.grid[y][x] === ch) r.push({ x: x + ox(), y: y + oy() }); return r; };
    /* spawn('P', fn(x,y,map)) calls fn for each marker, then clears the tile (pass {keep:true} to leave it). Returns fn results. */
    tm.spawn = (ch, fn, so) => tm.find(ch).map(p => { if (!(so && so.keep)) tm.set(p.x, p.y, (so && so.fill) || ' '); return fn(p.x, p.y, tm); });
    tm.toText = () => tm.grid.map(r => r.join('').replace(/ +$/, '')).join('\n');
    tm.toJSON = () => ({ name: tm.name, rows: tm.grid.map(r => r.join('')), legend: JSON.parse(JSON.stringify(tm.legend)) });
    tm.destroy = () => { game.removeLayer(layerFn); const j = maps.indexOf(tm); if (j >= 0) maps.splice(j, 1); return tm; };

    const layerFn = (wx, wy, t) => {
      if (!tm.visible) return null;
      const x = wx - ox(), y = wy - oy();
      if (!inb(x, y)) return null;
      const ch = tm.grid[y][x]; if (ch === ' ') return null;
      const d = def(ch);
      if (Array.isArray(d.char)) return [d.char[Math.floor(t * (d.fps || 3)) % d.char.length], d.color || '#ccc', d.bg || null];
      return d._cell || (d._cell = [d.char, d.color || '#ccc', d.bg || null]);
    };
    tm.load(src, legend || {});
    if (legend) tm.legend = normLegend(legend);
    game.layer(layerFn, tm.z); maps.push(tm);
    if (o.setWorld !== false && game.setWorld && (tm.width + ox() > game.cols || tm.height + oy() > game.rows))
      game.setWorld(Math.max(game.cols, tm.width + ox()), Math.max(game.rows, tm.height + oy()));
    return tm;
  }

  // game.tilemap.solidAt / tileAt ask every live map (physics uses solidAt)
  create.solidAt = (x, y) => maps.some(m => m.solidAt(x, y));
  create.tileAt = (x, y) => { for (const m of maps) { const t = m.tileAt(x, y); if (t) return t; } return null; };
  Object.defineProperty(create, 'current', { get: () => maps[maps.length - 1] || null });
  create.all = maps;
  game.tilemap = create;

  // ---- agent op
  game.defineCommand('tilemap', c => {
    const maps = game.tilemaps, m = c.name ? maps.find(x => x.name === c.name) : create.current;
    if (c.rows || c.map) { const t = create(c.rows || c.map, c.legend || {}, { name: c.name, x: c.x, y: c.y, solidOutside: c.solidOutside }); return { name: t.name, width: t.width, height: t.height }; }
    if (!m) throw new Error('no tilemap yet: send {rows:[...], legend:{"#":{"solid":true}}}');
    if (c.set) { c.set.forEach(s => m.set(s.x, s.y, s.char)); return { set: c.set.length }; }
    if (c.get) return { tile: m.get(c.get.x, c.get.y), solid: m.solidAt(c.get.x, c.get.y) };
    return { name: m.name, width: m.width, height: m.height, rows: m.toJSON().rows };
  }, 'Tilemaps: {rows:[..], legend:{ch:{char,color,solid}}, name?} creates one; {set:[{x,y,char}]} edits; {get:{x,y}} reads a tile; no args describes the newest map. Example: {op:"tilemap",rows:["#####","#   #","#####"],legend:{"#":{char:"#",solid:true}}}.');
});
