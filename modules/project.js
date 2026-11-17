/* ACI modules/project.js: plugin 'project'. Scene + project documents (what the editor saves to disk).
   Needs: save.js (world capture), tilemap.js, physics.js (optional). All documents are plain JSON.

   Scene document  (.aci-scene.json):
     { format:'aci-scene', v:1, name, world:{cols,rows}, settings:{gravity, background}, tilemaps:[{name,rows,legend,x,y}], entities:{...aci-world snapshot} }
   Project manifest (aci-project.json):
     { format:'aci-project', v:1, name, version, startScene, scenes:[{name,file}], settings:{...}, assets:[{name,file}] }

   API:  game.project.saveScene(name) -> doc        game.project.loadScene(doc|json) -> {entities,tilemaps}
         game.project.manifest(info, scenes) -> manifest     ACI.project.validate(doc) -> [problems]
         game.project.settings  (free JSON: title, fps, ... carried in the manifest)  */
(function () {
  'use strict';
  const ACI = window.ACI;
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

  // Check a scene or manifest document; returns a list of problems (empty = fine).
  function validate(doc) {
    const bad = [];
    if (typeof doc === 'string') { try { doc = JSON.parse(doc); } catch (e) { return ['not valid JSON']; } }
    if (!isObj(doc)) return ['document is not an object'];
    if (doc.format === 'aci-scene') {
      if (!isObj(doc.world)) bad.push('missing world {cols,rows}');
      if (!isObj(doc.entities) || doc.entities.format !== 'aci-world') bad.push('missing entities snapshot');
      (doc.tilemaps || []).forEach((t, i) => { if (!Array.isArray(t.rows)) bad.push('tilemaps[' + i + '] has no rows'); });
    } else if (doc.format === 'aci-project') {
      if (!Array.isArray(doc.scenes) || !doc.scenes.length) bad.push('project has no scenes');
      else if (doc.startScene && !doc.scenes.some(s => s.name === doc.startScene)) bad.push('startScene "' + doc.startScene + '" is not in scenes');
    } else bad.push('unknown format "' + doc.format + '"');
    return bad;
  }
  ACI.project = { validate };

  ACI.plugin('project', function install(G) {
    if (!G.saves) throw new Error('project: load save.js before project.js');
    const P = G.project = { settings: {} };

    P.saveScene = (name = 'main') => ({
      format: 'aci-scene', v: 1, name,
      world: { cols: G.cols, rows: G.rows },
      settings: { gravity: G.physics ? G.physics.gravity : 0, background: G.background || null },
      tilemaps: (G.tilemaps || []).map(t => Object.assign(t.toJSON(), { x: t.offsetX, y: t.offsetY })),
      entities: G.saves.capture(),
    });

    P.loadScene = doc => {
      if (typeof doc === 'string') doc = JSON.parse(doc);
      const bad = validate(doc); if (bad.length) throw new Error('loadScene: ' + bad.join('; '));
      (G.tilemaps || []).slice().forEach(t => t.destroy && t.destroy());
      if (G.setWorld) G.setWorld(doc.world.cols, doc.world.rows);
      if (G.physics && doc.settings && doc.settings.gravity !== undefined) G.physics.gravity = doc.settings.gravity;
      const maps = (doc.tilemaps || []).map(t => G.tilemap({ rows: t.rows, legend: t.legend }, t.legend, { name: t.name, x: t.x, y: t.y, setWorld: false }));
      const r = G.saves.restore(doc.entities);
      return { entities: r.entities, tilemaps: maps.length, missingSprites: r.missingSprites, idMap: r.idMap };
    };

    P.manifest = (info = {}, scenes = []) => ({
      format: 'aci-project', v: 1, name: info.name || 'My Game', version: info.version || '0.1.0',
      startScene: info.startScene || (scenes[0] && scenes[0].name), scenes,
      settings: Object.assign({}, P.settings, info.settings), assets: info.assets || [],
    });

    G.defineCommand('scene_export', c => ({ scene: P.saveScene(c.name) }),
      'Return the current world as a scene document. Example: {op:"scene_export",name:"level1"}');
    G.defineCommand('scene_import', c => P.loadScene(c.scene),
      'Load a scene document into the running game. Args: {scene:<aci-scene doc>}');
  });
})();
