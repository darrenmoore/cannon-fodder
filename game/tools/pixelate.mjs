/**
 * Reference image -> pixels you can actually plot.
 *
 * Every sprite in this game is drawn in code, and the references in
 * `docs/original-images/` are the opposite of that: 2000-pixel renders with
 * soft bevels, photographic grime and anti-aliased edges. Nothing in them can
 * be used directly -- tracing is out (CLAUDE.md), and a downsample is alpha
 * fringe, which is the one thing the renderer forbids absolutely.
 *
 * What a reference is *for* is deciding two things, and both of them are
 * measurements rather than opinions:
 *
 *   1. **How big is this thing, in the pixels the game actually draws?**
 *      Guessing here is why an ampersand got built at 27x36 when the reference
 *      says it is 24x21. That was three rounds of "the shape is wrong" spent on
 *      a shape whose proportions were wrong.
 *   2. **What survives at that size?** Half the detail in a reference cannot
 *      exist at 1x and drawing it anyway produces noise.
 *
 * So this answers those, and hands back a grid of `#` and `.` that goes
 * straight into a sprite module as a bitmap -- which is a *starting point to be
 * hand-cleaned*, never the finished glyph. A machine threshold does not know
 * which pixel is the stem and which is the JPEG.
 *
 * Playwright rather than an image library because this project has three dev
 * dependencies and adding a fourth to look at a PNG is not a trade worth making.
 *
 *   node tools/pixelate.mjs read docs/original-images/intro/logo.png --width 300
 *   node tools/pixelate.mjs read <img> --rect 991,330,239,180 --grid 12x11
 *   node tools/pixelate.mjs read <img> --rect auto --colors 12
 *   node tools/pixelate.mjs beside <img> --rect ... --sprite logo --port 5210
 *
 * `beside` needs a server running the gallery bundle; `read` needs nothing.
 */
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const MODE = argv[0];
const IMAGE = argv[1];

if (!MODE || !['read', 'beside'].includes(MODE) || !IMAGE) {
  console.error(`
  node tools/pixelate.mjs read <image> [options]
  node tools/pixelate.mjs beside <image> --sprite <atlas id> [options]

    --rect x,y,w,h   region of the source. "auto" (default) trims chroma green
                     and any uniform border, which is what the intro art has.
    --width N        resample the region to N pixels wide, aspect kept. This is
                     the number that matters: the game draws the world at zoom
                     3-5 over ~430x270 world pixels, so a full-screen crest is
                     about 300 and a HUD badge is about 12.
    --grid WxH       print an ASCII mask at this cell resolution. Omit to have
                     it match --width.
    --ink F          coverage fraction for a cell to count as ink (default 0.5).
                     Raise it to thin a shape, lower it to fatten one.
    --lum N          also require luminance above N (0-255) to count as ink.
                     For art sitting on a dark ground rather than on chroma --
                     a gold glyph over shadow -- this is the whole difference
                     between reading the glyph and reading the whole picture.
    --colors N       report the N most common colours, as hex, with counts.
    --out FILE       write the resampled region as a PNG.
    --zoom N         scale that PNG by N, nearest neighbour (default 4).
    --sprite ID      (beside) an atlas path -- "logo", "hut.2", "icons.grenade".
    --port N         (beside) a server with the gallery on it. Never 5199.
`);
  process.exit(1);
}

const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const RECT = flag('rect', 'auto');
const WIDTH = Number(flag('width', 0)) || 0;
const GRID = flag('grid', '');
const INK = Number(flag('ink', 0.5));
const LUM = Number(flag('lum', 0)) || 0;
const COLORS = Number(flag('colors', 0)) || 0;
const OUT = flag('out', '');
const ZOOM = Number(flag('zoom', 4));
const SPRITE = flag('sprite', '');
const PORT = flag('port', '5210');

const dataUrl = 'data:image/png;base64,' + readFileSync(IMAGE).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();

if (MODE === 'beside') {
  if (!SPRITE) { console.error('  beside needs --sprite <atlas id>'); process.exit(1); }
  await page.goto(`http://localhost:${PORT}/sprites.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__atlas, null, { timeout: 15000 });
} else {
  await page.setContent('<body style="margin:0">');
}

await page.evaluate(async (url) => {
  window.__ref = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
}, dataUrl);

/* ------------------------------------------------------------------ measure */

const result = await page.evaluate(({ rect, width, grid, ink, lum, colors, sprite, zoom, mode }) => {
  const img = window.__ref;
  const W = img.naturalWidth, H = img.naturalHeight;
  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  const sg = src.getContext('2d', { willReadFrequently: true });
  sg.drawImage(img, 0, 0);
  const D = sg.getImageData(0, 0, W, H).data;

  /*
   * Chroma green, as the intro art is delivered. Detected rather than assumed:
   * a reference on a transparent or white ground is common too, and a tool that
   * silently trimmed the wrong thing would move every measurement by a margin
   * nobody would think to check.
   */
  const isChroma = (r, g, b) => g > 150 && r < 130 && b < 130;
  const isClearish = (i) => D[i + 3] < 8 || isChroma(D[i], D[i + 1], D[i + 2]);

  let box;
  if (rect === 'auto') {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (isClearish((y * W + x) * 4)) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  } else {
    const [x, y, w, h] = rect.split(',').map(Number);
    box = { x, y, w, h };
  }

  const tw = width || box.w;
  const th = Math.max(1, Math.round((box.h * tw) / box.w));

  // The resample. Smoothing is ON here and only here: this is a measurement of
  // what the reference contains, not a sprite. Everything downstream is hard.
  const small = document.createElement('canvas');
  small.width = tw; small.height = th;
  const g2 = small.getContext('2d', { willReadFrequently: true });
  g2.imageSmoothingEnabled = true;
  g2.imageSmoothingQuality = 'high';
  g2.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, tw, th);
  const S = g2.getImageData(0, 0, tw, th).data;

  /* The ASCII mask. Cells average coverage over the resampled region. */
  const [gw, gh] = grid ? grid.split('x').map(Number) : [tw, th];
  const rows = [];
  for (let cy = 0; cy < gh; cy++) {
    let row = '';
    for (let cx = 0; cx < gw; cx++) {
      const x0 = Math.floor((tw * cx) / gw), x1 = Math.max(x0 + 1, Math.floor((tw * (cx + 1)) / gw));
      const y0 = Math.floor((th * cy) / gh), y1 = Math.max(y0 + 1, Math.floor((th * (cy + 1)) / gh));
      let lit = 0, tot = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * tw + x) * 4;
          tot++;
          const bright = S[i] * 0.3 + S[i + 1] * 0.6 + S[i + 2] * 0.1;
          if (S[i + 3] > 128 && !isChroma(S[i], S[i + 1], S[i + 2]) && bright >= lum) lit++;
        }
      }
      row += lit / Math.max(1, tot) >= ink ? '#' : '.';
    }
    rows.push(row);
  }

  /* Colour census, over the region at full resolution: the resample invents
     tones that are in neither the reference nor any palette you could plot. */
  let palette = [];
  if (colors) {
    const count = new Map();
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) {
        const i = (y * W + x) * 4;
        if (isClearish(i)) continue;
        const k = (D[i] << 16) | (D[i + 1] << 8) | D[i + 2];
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
    palette = [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, colors)
      .map(([k, n]) => ['#' + k.toString(16).padStart(6, '0'), n]);
  }

  /* The PNG: the region at target size, blown up hard, and in `beside` mode
     with one of our own sprites next to it at the same scale. */
  let png = null;
  const ours = mode === 'beside' && sprite
    ? sprite.split('.').reduce((o, k) => (o == null ? o : o[k]), window.__atlas)
    : null;
  if (mode === 'beside' && !(ours instanceof HTMLCanvasElement)) {
    return { box, tw, th, rows, palette, png: null, error: `no sprite at "${sprite}"` };
  }
  {
    const gap = 8;
    const ow = ours ? ours.width : 0, oh = ours ? ours.height : 0;
    const cw = (tw + (ours ? ow + gap : 0)) * zoom;
    const ch = Math.max(th, oh) * zoom;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#6b6b66';
    g.fillRect(0, 0, cw, ch);
    g.drawImage(small, 0, 0, tw * zoom, th * zoom);
    if (ours) g.drawImage(ours, (tw + gap) * zoom, 0, ow * zoom, oh * zoom);
    png = c.toDataURL('image/png').split(',')[1];
  }

  return { box, tw, th, rows, palette, png, ours: ours ? [ours.width, ours.height] : null };
}, { rect: RECT, width: WIDTH, grid: GRID, ink: INK, lum: LUM, colors: COLORS, sprite: SPRITE, zoom: ZOOM, mode: MODE });

await browser.close();

if (result.error) { console.error('  ' + result.error); process.exit(1); }

const { box, tw, th, rows, palette, png, ours } = result;
console.log(`\n  source region   ${box.x},${box.y} ${box.w}x${box.h}`);
console.log(`  at --width      ${tw}x${th}`);
if (ours) console.log(`  our sprite      ${ours[0]}x${ours[1]}`);
if (palette.length) {
  console.log('\n  colours');
  for (const [hex, n] of palette) console.log(`    ${hex}  ${n}`);
}
console.log(`\n  ${rows[0].length}x${rows.length} mask (hand-clean it; a threshold cannot tell a stem from a JPEG)\n`);
for (const r of rows) console.log(`  '${r}',`);
console.log('');

if (OUT && png) {
  await writeFile(OUT, Buffer.from(png, 'base64'));
  console.log(`  ${OUT}\n`);
}
