/* Project X (ACI port) - live 3D -> ASCII render path.
   A real three.js scene (fixed high-angle camera, real meshes, lights, shadows, fog) is rendered to a texture and a GPU shader turns
   every character cell into a glyph (luminance ramp from a measured glyph atlas, edge-aware | - / \ glyphs, per-cell colour).
   The result is drawn into the ACI canvas, so the HUD / menus / dialogue sit on top. Cutscenes switch the shader to a rotoscope look. */
(function () {
  'use strict';
  const PX = window.PX, THREE = window.THREE, G = PX.gfx = { mode: 0, time: 0 };
  const RAMP = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
  G.cellSizes = { 3: [8, 15], 4: [10, 18], 5: [12, 22], 6: [14, 26] };   // settings.font -> glyph cell in px

  const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
  const FRAG = `
precision highp float;
uniform sampler2D tScene, tAtlas;
uniform vec2 uRes, uCell; uniform float uN, uTime, uMode, uGamma, uBoost, uGrain, uLevels, uJit;
uniform vec4 uEdge; uniform vec3 uMono, uAccent;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bayer(vec2 p){ vec2 q = mod(p, 4.); float x = q.x, y = q.y; float v = mod(x * 4. + y * 1., 16.) ; // cheap 4x4 ordered pattern
  float a = mod(x + 2. * y, 4.), b = mod(2. * x + y * 3., 4.); return fract((a * 4. + b + 0.5) / 16. * 1.0 + 0.13 * x); }
vec3 cellCol(vec2 cell){
  vec3 s = vec3(0.);
  for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
    vec2 p = (cell + vec2((float(i) + .5) / 3., (float(j) + .5) / 3.)) * uCell; s += texture2D(tScene, p / uRes).rgb; }
  return pow(max(s / 9., 0.), vec3(1. / 2.2));
}
float lumOf(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
void main(){
  vec2 pix = vUv * uRes; vec2 cell = floor(pix / uCell); vec2 loc = fract(pix / uCell);
  if (uJit > 0.) { vec2 jc = vec2(hash(vec2(floor(uTime * 10.), 3.)), hash(vec2(floor(uTime * 10.), 7.))) - .5; cell += floor(jc * uJit * 2.); }
  vec3 c = cellCol(cell); float l = lumOf(c);
  float lL = lumOf(cellCol(cell + vec2(-1., 0.))), lR = lumOf(cellCol(cell + vec2(1., 0.))), lD = lumOf(cellCol(cell + vec2(0., -1.))), lU = lumOf(cellCol(cell + vec2(0., 1.)));
  vec2 g = vec2(lR - lL, lU - lD); float mag = length(g);
  float lv = l;
  if (uMode > .5) { lv = clamp((pow(l, .75) - .5) * 1.5 + .5 + (hash(cell + floor(uTime * 12.)) - .5) * uGrain, 0., 1.); lv = floor(lv * uLevels + .5) / uLevels; }
  float bt = hash(cell * 1.37 + floor(uTime * 2.) * .01);
  float idx = floor(pow(clamp(lv, 0., 1.), uGamma) * (uN - 1.) + bt * .85);
  if (mag > .13 && l > .03) {
    float ax = abs(g.x), ay = abs(g.y);
    idx = ax > 2. * ay ? uEdge.x : (ay > 2. * ax ? uEdge.y : (g.x * g.y < 0. ? uEdge.z : uEdge.w));
    idx = max(idx, floor(pow(clamp(lv, 0., 1.), uGamma) * (uN - 1.) * .55));
  }
  idx = clamp(idx, 0., uN - 1.);
  float gl = texture2D(tAtlas, vec2((idx + loc.x) / uN, loc.y)).r;
  vec3 fg, bg;
  if (uMode > .5) {
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = mx > 0. ? (mx - mn) / mx : 0.;
    bool acc = sat > .35 && lv > .1 && c.r > c.g * 1.4 && c.r > c.b * 1.4;
    fg = acc ? uAccent * min(1., lv * 1.9 + .25) : uMono * (lv * 1.1 + .06); bg = fg * .1;
    float sl = mod(floor(pix.y / uCell.y), 2.); fg *= 1. - .12 * sl;
  } else {
    float m = max(c.r, max(c.g, c.b)); fg = c * uBoost + .035; fg = mix(vec3(lumOf(fg)), fg, 1.18); bg = c * .2 + vec3(.004, .006, .012);
  }
  gl_FragColor = vec4(mix(bg, fg, gl), 1.);
}`;

  // ---------------------------------------------------------------- init
  G.init = () => {
    const r = G.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.setPixelRatio(1); r.setClearColor(0x05070d, 1);
    G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.5, 400);
    G.rt = new THREE.WebGLRenderTarget(16, 16, { depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    G.atlas = null;
    G.pass = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: G.rt.texture }, tAtlas: { value: null }, uRes: { value: new THREE.Vector2(16, 16) }, uCell: { value: new THREE.Vector2(4, 7) }, uN: { value: 64 }, uTime: { value: 0 }, uMode: { value: 0 }, uGamma: { value: .82 }, uBoost: { value: 1.25 }, uGrain: { value: .14 }, uLevels: { value: 4 }, uJit: { value: 0 }, uEdge: { value: new THREE.Vector4() }, uMono: { value: new THREE.Color('#e8e6e0') }, uAccent: { value: new THREE.Color('#d1332a') } },
    });
    G.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), G.pass); G.quadScene = new THREE.Scene(); G.quadScene.add(G.quad); G.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    G.canvas = r.domElement; G.setCell(PX.settings.font || 4); G.resize(1280, 720);
  };
  G.setCell = font => {
    const [cw, ch] = G.cellSizes[font] || G.cellSizes[4]; G.cell = { w: cw, h: ch }; G.pass.uniforms.uCell.value.set(cw, ch); G.buildAtlas(cw, ch);
  };
  G.buildAtlas = (cw, ch) => {
    const S = 4, gw = cw * S, gh = ch * S, chars = [...new Set(RAMP)], tmp = document.createElement('canvas'); tmp.width = gw; tmp.height = gh; const x = tmp.getContext('2d', { willReadFrequently: true });
    const meas = chars.map(c => { x.fillStyle = '#000'; x.fillRect(0, 0, gw, gh); x.fillStyle = '#fff'; x.font = `bold ${Math.floor(gh * .92)}px "JetBrains Mono",Menlo,Consolas,monospace`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(c, gw / 2, gh / 2 + gh * .04); const d = x.getImageData(0, 0, gw, gh).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i]; return { c, s }; });
    meas.sort((a, b) => a.s - b.s); const N = meas.length, at = document.createElement('canvas'); at.width = gw * N; at.height = gh; const a = at.getContext('2d'); a.fillStyle = '#000'; a.fillRect(0, 0, at.width, gh);
    a.fillStyle = '#fff'; a.font = `bold ${Math.floor(gh * .92)}px "JetBrains Mono",Menlo,Consolas,monospace`; a.textAlign = 'center'; a.textBaseline = 'middle';
    meas.forEach((m, i) => a.fillText(m.c, i * gw + gw / 2, gh / 2 + gh * .04));
    const idxOf = ch2 => Math.max(0, meas.findIndex(m => m.c === ch2));
    if (G.atlas) G.atlas.dispose(); const tex = G.atlas = new THREE.CanvasTexture(at); tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.NoColorSpace;
    G.pass.uniforms.tAtlas.value = tex; G.pass.uniforms.uN.value = N; G.pass.uniforms.uEdge.value.set(idxOf('|'), idxOf('-'), idxOf('/'), idxOf('\\'));
  };
  G.resize = (w, h) => {
    w = Math.max(64, Math.floor(w)); h = Math.max(64, Math.floor(h)); G.w = w; G.h = h; G.renderer.setSize(w, h, false); G.rt.setSize(w, h); G.pass.uniforms.uRes.value.set(w, h);
    G.camera.aspect = w / h; G.camera.updateProjectionMatrix(); G.cols = Math.floor(w / G.cell.w); G.rows = Math.floor(h / G.cell.h);
  };
  // rotoscope look (cutscenes)
  G.setLook = (look) => {
    const u = G.pass.uniforms; if (!look) { G.mode = 0; u.uMode.value = 0; u.uJit.value = 0; return; }
    G.mode = 1; u.uMode.value = 1; u.uJit.value = look.jitter || 0; u.uGrain.value = look.grain ?? .14; u.uLevels.value = look.levels || 4; u.uMono.value.set(look.mono || '#e8e6e0'); u.uAccent.value.set(look.accent || '#d1332a');
  };
  G.render = (dt) => {
    G.time += dt || 0; const u = G.pass.uniforms; u.uTime.value = G.time;
    G.renderer.setRenderTarget(G.rt); G.renderer.render(G.scene, G.camera); G.renderer.setRenderTarget(null); G.renderer.render(G.quadScene, G.quadCam);
  };
  // ---------------------------------------------------------------- small helpers shared by the world / arena / cutscenes
  G.tex = (canvas, o) => { o = o || {}; const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; if (o.nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; } else { t.anisotropy = 4; } if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); } return t; };
  const grad = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 1; const x = c.getContext('2d'); ['#3a3a3a', '#8a8a8a', '#cfcfcf', '#ffffff'].forEach((col, i) => { x.fillStyle = col; x.fillRect(i, 0, 1, 1); }); const t = new THREE.CanvasTexture(c); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; })();
  G.toon = (color, o) => new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: grad }, o || {}));
  G.std = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .85, metalness: 0 }, o || {}));
  G.clear = () => { const s = G.scene; for (let i = s.children.length - 1; i >= 0; i--) { const o = s.children[i]; s.remove(o); o.traverse && o.traverse(n => { if (n.geometry && !n.userData.keep) n.geometry.dispose(); if (n.material && !n.userData.keepMat) { (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => { if (m.map && !m.map.userData.keep) m.map.dispose(); m.dispose(); }); } }); } s.fog = null; };
  // high-angle follow camera (fixed yaw)
  G.cam = { x: 0, z: 0, dist: 22, pitch: 58, tx: 0, tz: 0, shake: 0, lerp: 6 };
  G.updateCamera = dt => {
    const c = G.cam, k = Math.min(1, dt * c.lerp); c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k;
    const p = c.pitch * Math.PI / 180, sx = c.shake > 0 ? (Math.random() - .5) * c.shake : 0, sz = c.shake > 0 ? (Math.random() - .5) * c.shake : 0; if (c.shake > 0) c.shake = Math.max(0, c.shake - dt * 3);
    G.camera.position.set(c.x + sx, (c.ty || 0) + Math.sin(p) * c.dist, c.z + Math.cos(p) * c.dist + sz); G.camera.lookAt(c.x + sx, c.ty || 0, c.z + sz);
  };
})();
