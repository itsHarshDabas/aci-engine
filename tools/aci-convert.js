#!/usr/bin/env node
/*  aci-convert — turn a GIF (or a raw RGBA/PPM image) into an ASCII sprite from the command line. No dependencies.
 *
 *    node tools/aci-convert.js dance.gif --cols 48 --mode blocks --out dance.aci.json
 *    node tools/aci-convert.js logo.gif --cols 60 --text            # print frame 0 as plain text
 *    node tools/aci-convert.js logo.gif --cols 60 --ansi            # print frame 0 in colour (terminal)
 *
 *  Options: --cols N  --rows N  --mode luma|blocks|braille|edges  --ramp NAME|chars  --color full|mono|palette:NAME
 *           --dither none|floyd|bayer|atkinson  --contrast N  --brightness N  --gamma N  --invert  --frame N  --out FILE
 *  PNG/JPEG need a browser decoder: use examples/booth.html, or convert them to GIF/PPM first.  */
const fs = require('fs'), path = require('path');
require(path.join(__dirname, '..', 'aci.js'));
require(path.join(__dirname, '..', 'modules', 'convert.js'));
const C = ACI.convert;
const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--') && !/^\d/.test(a) && fs.existsSync(a));
if (!file) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(file === undefined && args.length ? 1 : 0); }
const opt = k => { const i = args.indexOf('--' + k); return i < 0 ? undefined : args[i + 1]; }, flag = k => args.includes('--' + k);
const o = {};
for (const k of ['cols', 'rows', 'contrast', 'brightness', 'gamma', 'maxFrames', 'frameStep']) if (opt(k) !== undefined) o[k] = +opt(k);
for (const k of ['mode', 'ramp', 'dither']) if (opt(k)) o[k] = opt(k);
if (!o.cols && !o.rows) o.cols = 60;
const col = opt('color'); if (col === 'mono') o.color = false; else if (col && col.startsWith('palette:')) { o.color = 'palette'; o.palette = col.slice(8); }
if (flag('invert')) o.invert = true; if (flag('autoLevels')) o.autoLevels = true;
const buf = fs.readFileSync(file);
let spr;
if (buf.slice(0, 3).toString() === 'GIF') spr = C.gif(buf, o);
else if (buf.slice(0, 2).toString() === 'P6') { // binary PPM
  const m = buf.toString('latin1', 0, 40).match(/^P6\s+(\d+)\s+(\d+)\s+255\s/); if (!m) throw new Error('unsupported PPM');
  const w = +m[1], h = +m[2], px = buf.subarray(m[0].length), data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = px[i * 3]; data[i * 4 + 1] = px[i * 3 + 1]; data[i * 4 + 2] = px[i * 3 + 2]; data[i * 4 + 3] = 255; }
  spr = C.sprite({ width: w, height: h, data }, o);
} else { console.error('Unsupported input. Use .gif or binary .ppm here, or the browser tool examples/booth.html for PNG/JPG.'); process.exit(1); }
const out = opt('out'), n = +(opt('frame') || 0);
if (out) { fs.writeFileSync(out, JSON.stringify(C.toAsset(spr, path.basename(file).replace(/\.\w+$/, '')))); console.log('wrote ' + out + '  (' + spr.w + '×' + spr.h + ', ' + spr.anims.default.length + ' frame(s))'); }
else if (flag('ansi')) process.stdout.write(C.toAnsi(spr, 'default', n));
else process.stdout.write(C.toText(spr, 'default', n));
