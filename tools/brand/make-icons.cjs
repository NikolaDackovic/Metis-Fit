// Usage: cd to a folder with @resvg/resvg-js installed (npm i @resvg/resvg-js@2.6.2), then
//   node tools/brand/make-icons.cjs apps/mobile/assets
// Keep the mark in sync with packages/design-tokens/src/platform.ts (PLATFORM_MARK).
// Renders the METIS mark (packages/design-tokens/src/platform.ts) to the app icons.
const fs = require('fs');
const { Resvg } = require(require.resolve('@resvg/resvg-js', { paths: [process.cwd()] }));
const FONT =
  'C:/dev/grit-digital-club/node_modules/@expo-google-fonts/montserrat/800ExtraBold/Montserrat_800ExtraBold.ttf';
const OUT = process.argv[2];
const O = '#FF5A1F';
const P =
  'M0 100 V0 H36 L66 50 L96 0 H132 V86 Q132 100 118 100 H104 V44 L74 90 H58 L28 44 V86 Q28 100 14 100 Z';
const plates = [
  [-27, 6, 21, 88],
  [-50, 18, 17, 64],
  [-64, 38, 9, 24],
]
  .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>`)
  .join('');
// Mark in its own box (-95..155 x -8..108 => 250 x 116), placed at (cx, cy) with width w.
let n = 0;
function mark(cx, cy, w, color, glow) {
  const s = w / 250;
  const id = 'k' + n++;
  const tx = cx - w / 2 + 95 * s;
  const ty = cy - (116 * s) / 2 + 8 * s;
  return `<defs>
    <mask id="m${id}" maskUnits="userSpaceOnUse" x="-200" y="-50" width="500" height="220">
      <rect x="-200" y="-50" width="500" height="220" fill="white"/>
      <path d="M-10 97 Q60 80 150 26" stroke="black" stroke-width="5" fill="none"/>
    </mask>
    <filter id="f${id}" x="-60%" y="-100%" width="220%" height="300%">
      <feGaussianBlur stdDeviation="${glow}" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter></defs>
  <g transform="translate(${tx} ${ty}) scale(${s})" ${glow ? `filter="url(#f${id})"` : ''}>
    <g fill="${color}" transform="skewX(-16)" mask="url(#m${id})">${plates}<path d="${P}"/></g>
  </g>`;
}
const svg = (size, body, bg = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${body}</svg>`;
const dark = (size) =>
  `<defs><radialGradient id="bgg" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#1c0b04"/><stop offset="1" stop-color="#080808"/></radialGradient></defs><rect width="${size}" height="${size}" fill="url(#bgg)"/>`;
const word = (cx, y, px, color) =>
  `<text x="${cx}" y="${y}" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="${px}" letter-spacing="${px * 0.04}" fill="${color}" transform="translate(${cx} ${y}) skewX(-16) translate(${-cx} ${-y})">METIS</text>`;
const files = {
  'icon.png': svg(1024, mark(512, 512, 700, O, 3.5), dark(1024)),
  'android-icon-foreground.png': svg(1024, mark(512, 512, 540, O, 2.5)),
  'android-icon-background.png': svg(1024, '', '<rect width="1024" height="1024" fill="#080808"/>'),
  'android-icon-monochrome.png': svg(1024, mark(512, 512, 540, '#ffffff', 0)),
  'splash-icon.png': svg(1024, mark(512, 512, 640, O, 3)),
  'favicon.png': svg(
    192,
    mark(96, 96, 170, O, 0),
    '<rect width="192" height="192" rx="36" fill="#080808"/>',
  ),
};
for (const [name, s] of Object.entries(files)) {
  const png = new Resvg(s, {
    font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: 'Montserrat' },
  })
    .render()
    .asPng();
  fs.writeFileSync(`${OUT}/${name}`, png);
}
// Wide logo for documents.
const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400">${mark(330, 200, 560, O, 0)}${word(860, 250, 150, O)}</svg>`;
fs.writeFileSync(
  `${OUT}/metis-logo-orange.png`,
  new Resvg(logo, {
    font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: 'Montserrat' },
  })
    .render()
    .asPng(),
);
console.log('ok');
