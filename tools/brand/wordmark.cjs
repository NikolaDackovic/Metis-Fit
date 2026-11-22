// Usage: in a folder with opentype.js@1.3.4 and @resvg/resvg-js@2.6.2 installed, run
//   node <repo>/tools/brand/wordmark.cjs  (writes out/*.png previews and out/wordmark.json)
// then copy the paths into packages/design-tokens/src/platform-wordmark.ts. Variant a_lower is in use.
// Builds the "|||Metis Fit|||" wordmark as pure SVG paths (no font needed where it is shown).
const fs = require('fs');
const opentype = require('opentype.js');
const { Resvg } = require('@resvg/resvg-js');
const FONTS = 'C:/dev/grit-digital-club/node_modules/@expo-google-fonts/montserrat/';
const black = opentype.loadSync(FONTS + '900Black_Italic/Montserrat_900Black_Italic.ttf');
const O = '#FF5A1F';
const SKEW = -12; // plates follow the italic

function build({ big = 200, small = 132, lower = true, kettlebell = false, gap = 34 }) {
  const parts = [];
  let x = 0;
  const base = 200; // baseline
  const add = (text, size, extraAfter = 0) => {
    const p = black.getPath(text, x, base, size);
    const bb = p.getBoundingBox();
    parts.push({ d: p.toPathData(2), bb, text });
    x += black.getAdvanceWidth(text, size) + extraAfter;
    return bb;
  };
  const M = add('M', big, -4);
  add(lower ? 'etis' : 'ETIS', small, gap);
  const F = add('F', big, 14);
  let iBox = null;
  if (kettlebell && lower) {
    iBox = add('ı', small, 0);
    add('t', small, 0);
  } else add(lower ? 'it' : 'IT', small, 0);
  const textRight = x;
  const capTop = Math.min(M.y1, F.y1);
  const capH = base - capTop;
  // Barbell plates (outermost small collar, then medium, then large next to the letters).
  const plate = (cx, w, h) => ({ x: cx - w / 2, y: base - capH / 2 - h / 2, w, h });
  const left = [plate(-118, 16, capH * 0.34), plate(-84, 30, capH * 0.78), plate(-40, 36, capH * 1.08)];
  const right = [plate(textRight + 46, 36, capH * 1.08), plate(textRight + 90, 30, capH * 0.78), plate(textRight + 124, 16, capH * 0.34)];
  const cy = base - capH / 2;
  const sk = (v) => `transform="translate(0 ${cy}) skewX(${SKEW}) translate(0 ${-cy})"`;
  const plates = [...left, ...right]
    .map((p) => `<rect x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${p.w}" height="${p.h.toFixed(1)}" rx="${Math.min(10, p.w / 3)}"/>`)
    .join('');
  // Motion cuts through the big M and F (curved, rising to the right).
  const cut = (bb) => {
    const x1 = bb.x1 - 10, y1 = bb.y2 - (bb.y2 - bb.y1) * 0.18;
    const x2 = bb.x2 - 2, y2 = bb.y1 + (bb.y2 - bb.y1) * 0.36;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + 22;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const cuts = [cut(M), cut(F)];
  let bell = '';
  if (iBox) {
    // A small kettlebell in place of the dot of the "i".
    const cx = (iBox.x1 + iBox.x2) / 2 + 9;
    const bodyCy = iBox.y1 - 30;
    bell = `<path d="M${cx - 14} ${bodyCy - 6} Q${cx - 17} ${bodyCy - 33} ${cx} ${bodyCy - 33} Q${cx + 17} ${bodyCy - 33} ${cx + 14} ${bodyCy - 6}" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M${cx - 19} ${bodyCy + 2} a19 18 0 1 1 38 0 q0 10 -6 14 h-26 q-6 -4 -6 -14 z"/>`;
  }
  const minX = -140, maxX = textRight + 150;
  const minY = capTop - 70, maxY = base + 40;
  return {
    viewBox: `${minX} ${minY.toFixed(0)} ${(maxX - minX).toFixed(0)} ${(maxY - minY).toFixed(0)}`,
    w: maxX - minX,
    h: maxY - minY,
    letters: parts.map((p) => p.d),
    plates,
    cuts,
    bell,
    sk: sk(),
  };
}

function svg(o, color = O, glow = 0) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o.viewBox}" width="${o.w * 2}" height="${o.h * 2}">
  <defs><mask id="cut" maskUnits="userSpaceOnUse" x="-500" y="-500" width="3000" height="1500">
    <rect x="-500" y="-500" width="3000" height="1500" fill="white"/>
    ${o.cuts.map((c) => `<path d="${c}" stroke="black" stroke-width="9" fill="none"/>`).join('')}
  </mask>
  <filter id="g" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="${glow}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <rect x="-1000" y="-1000" width="5000" height="3000" fill="#0b0b0b"/>
  <g fill="${color}" mask="url(#cut)" ${glow ? 'filter="url(#g)"' : ''}>
    <g ${o.sk}>${o.plates}</g>
    ${o.letters.map((d) => `<path d="${d}"/>`).join('')}
    ${o.bell}
  </g></svg>`;
}

const variants = {
  a_lower: build({ lower: true }),
  b_caps: build({ lower: false, small: 140 }),
  c_kettle: build({ lower: true, kettlebell: true }),
};
for (const [k, o] of Object.entries(variants)) {
  fs.writeFileSync(`out/wm_${k}.png`, new Resvg(svg(o)).render().asPng());
}
fs.writeFileSync('out/wordmark.json', JSON.stringify(variants.a_lower));
console.log('ok');
module.exports = { build, svg };
