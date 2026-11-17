/* Temporary stand-in for core v0.2's ACI.plugin. Load after aci.js, before other modules.
   No-op once core provides ACI.plugin. Plugins run for every game created afterwards. */
(function (global) {
  'use strict';
  const ACI = global.ACI; if (!ACI || ACI.plugin) return;
  const list = [];
  ACI.plugin = (name, install) => { list.push({ name, install }); return ACI; };
  const orig = ACI.game;
  ACI.game = function () { const g = orig.apply(this, arguments); list.forEach(p => p.install(g, {})); return g; };
})(typeof window !== 'undefined' ? window : globalThis);
