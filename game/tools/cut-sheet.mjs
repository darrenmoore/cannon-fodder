/**
 * A reference sheet -> a plottable sprite strip, as generated source.
 *
 * ## Why this exists at all
 *
 * Every other sprite in this game is drawn by hand in code, and the reason is
 * written in CLAUDE.md: an imported sprite matches nothing around it. Major
 * Trumper is the owner's exception. He was plotted by hand first and the owner
 * looked at that beside the reference and chose the reference. That is a
 * decision about one character, not a change of method, and the rest of the
 * game is still plotted.
 *
 * ## What this is not
 *
 * It is not "load a PNG". Nothing here ships an image file or fetches one at
 * runtime. This tool runs **once, by hand**, and writes a TypeScript module
 * holding a palette and a run-length-encoded index per pixel. The game then
 * plots that through the same `rect()` calls every other sprite uses, at boot,
 * into an offscreen canvas. From the renderer's point of view nothing has
 * changed: there is no image decode, no async, no second asset, and no alpha.
 *
 * ## The three things that make it survive the visual laws
 *
 *   1. **Chroma keyed at full resolution, to transparent.** Keyed after the
 *      downsample it leaves a green fringe on every edge, because the resample
 *      has already averaged green into it and no threshold recovers that.
 *   2. **Alpha hard-thresholded after the downsample.** A resampled edge is a
 *      ramp of partial alpha, which is the one thing the renderer forbids
 *      absolutely. Every pixel ends up fully on or fully off.
 *   3. **Colours median-cut to a small palette.** The reference is a soft
 *      render with thousands of tones. Left alone it reads as a photograph
 *      pasted onto a plotted panel. Cut to twenty-odd it reads as sprite work,
 *      which is the whole point of doing this rather than linking the PNG.
 *
 * ## Alignment, which is the one that actually bit
 *
 * The obvious thing -- one bounding box measured across every chosen cell -- is
 * wrong on this sheet, and wrong in a way that looks like an animation bug
 * rather than a cropping one. The idle row and the talking row are **not drawn
 * at the same size**, so cropping both to one box makes his whole head jump
 * scale the instant he opens his mouth. The first cut did exactly that and the
 * owner's verdict was "the animation looks really wrong, and it doesn't look
 * like he's talking" -- correct on both counts, and neither was about the
 * mouths.
 *
 * `--align cell-top` gives each cell its own box, centred, hung from its own
 * top edge, so the cap stays put and only the jaw differs. See `boxFor` below.
 *
 * ## How the settings were chosen
 *
 * On `temp/trumper-frames.html` -- a bench that plays the loop at ship size
 * with each frame ghosted over frame 0, so a head that moves is visible before
 * anything is baked. The defaults here are the answer it gave.
 *
 *   node tools/cut-sheet.mjs --cell 96 --colors 34 --fill 1 --align cell-top
 */
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };

const IMAGE = flag('image', '../docs/original-images/elements/major-trumper.png');
const OUT = flag('out', 'src/render/sprites/trumper-art.ts');
const CELL = Number(flag('cell', 96));
const COLORS = Number(flag('colors', 34));
const FILL = Number(flag('fill', 1.0));      // how much of the cell the bust spans
const ALIGN = flag('align', 'cell-top');     // union | cell-top | cell-bottom
const PREVIEW = flag('preview', '');

/*
 * The sheet: six columns, two rows, content at 18,22 measured with
 * `pixelate.mjs read --rect auto`.
 *
 * Row 0 is him talking, row 1 is him idling, and **row 0 column 3 has a raised
 * hand in it** that belongs to a different animation -- it is not here, and an
 * early cut that included it by accident was one of the two reasons the first
 * attempt did not read as speech.
 *
 * The order and the alignment mode below are not guesses. They were chosen on
 * `temp/trumper-frames.html`, a bench that plays the loop at the size it ships
 * at, and this table is the answer it produced.
 */
const SHEET = { x: 18, y: 22, w: 2147, h: 696, cols: 6, rows: 2 };
const CELLS = [
  { row: 1, col: 0, note: 'rest -- lids heavy, mouth shut' },
  { row: 0, col: 0, note: 'lips together, starting to open' },
  { row: 0, col: 4, note: 'small round "oo"' },
  { row: 0, col: 1, note: 'open, teeth' },
  { row: 0, col: 2, note: 'wide open' },
  { row: 0, col: 5, note: 'teeth, closing again' },
];

const dataUrl = 'data:image/png;base64,' + readFileSync(IMAGE).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<body style="margin:0">');
await page.evaluate(async (url) => {
  window.__ref = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im); im.onerror = rej; im.src = url;
  });
}, dataUrl);

const result = await page.evaluate(({ sheet, cells, cell, colors, fill, align }) => {
  const img = window.__ref;
  const cw = sheet.w / sheet.cols, ch = sheet.h / sheet.rows;
  const isChroma = (r, g, b) => g > 150 && r < 130 && b < 130;

  /* --- every chosen cell at full resolution, chroma keyed to transparent. */
  const full = cells.map((c) => {
    const cv = document.createElement('canvas');
    cv.width = Math.round(cw); cv.height = Math.round(ch);
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, sheet.x + c.col * cw, sheet.y + c.row * ch, cw, ch, 0, 0, cv.width, cv.height);
    const d = g.getImageData(0, 0, cv.width, cv.height);
    for (let i = 0; i < d.data.length; i += 4) {
      if (isChroma(d.data[i], d.data[i + 1], d.data[i + 2])) {
        d.data[i] = 0; d.data[i + 1] = 0; d.data[i + 2] = 0; d.data[i + 3] = 0;
      }
    }
    g.putImageData(d, 0, 0);
    return { cv, d };
  });

  /* --- each cell's own content box, and the union of them all. */
  const own = full.map(({ cv, d }) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        if (d.data[(y * cv.width + x) * 4 + 3] < 8) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  });
  const union = own.reduce((a, b) => {
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });

  /*
   * --- the crop box per frame.
   *
   * `union` -- one box for every cell -- is the obvious choice and it is wrong
   * here, which is the whole reason this is a switch. The idle row and the
   * talking row are not drawn at the same size on this sheet, so cropping both
   * to one box makes his entire head change scale the moment he opens his
   * mouth. It does not read as a mouth moving; it reads as the man lurching
   * towards the camera, which is what the first cut did.
   *
   * `cell-top` takes each cell's own box, centres it, and hangs it from its own
   * top edge -- so the cap, which is the thing that must not move, stays put
   * while the jaw below it is free to differ. Chosen on the bench with the loop
   * playing at ship size.
   */
  const boxFor = (i) => {
    if (align === 'union') return union;
    const b = own[i];
    return {
      x: b.x + b.w / 2 - union.w / 2,
      y: align === 'cell-bottom' ? b.y + b.h - union.h : b.y,
      w: union.w,
      h: union.h,
    };
  };

  /*
   * Scale so the bust spans `fill` of the cell's width, and sit it on the
   * bottom: a portrait with the head high and the shoulders running out of
   * frame reads as a person, one floating in the middle reads as a sticker.
   */
  const strip = document.createElement('canvas');
  strip.width = cell * cells.length; strip.height = cell;
  const sg = strip.getContext('2d', { willReadFrequently: true });
  sg.imageSmoothingEnabled = true;
  sg.imageSmoothingQuality = 'high';
  full.forEach(({ cv }, i) => {
    const box = boxFor(i);
    const dw = Math.round(cell * fill);
    const dh = Math.round((box.h * dw) / box.w);
    const dx = Math.round((cell - dw) / 2);
    const dy = cell - dh;
    sg.drawImage(cv, box.x, box.y, box.w, box.h, i * cell + dx, dy, dw, dh);
  });
  const box = union;

  const S = sg.getImageData(0, 0, strip.width, strip.height);

  /* --- alpha, hard. No partial coverage survives this line. */
  const px = [];
  for (let i = 0; i < S.data.length; i += 4) {
    px.push(S.data[i + 3] >= 128 ? [S.data[i], S.data[i + 1], S.data[i + 2]] : null);
  }

  /*
   * --- median cut.
   *
   * Split the box with the widest channel at its median, repeatedly, until
   * there are `colors` boxes; each box's average is one entry. Popularity
   * would drop the small bright things that carry the read -- the eye whites,
   * the teeth, the gold on the cap -- because there are only a few dozen of
   * each and tens of thousands of tunic.
   */
  const solid = px.filter(Boolean);
  let boxes = [solid];
  while (boxes.length < colors) {
    let bi = -1, bspread = -1;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
        if (hi - lo > bspread) { bspread = hi - lo; bi = i; }
      }
    });
    if (bi < 0) break;
    const b = boxes[bi];
    let ch2 = 0, best = -1;
    for (let c = 0; c < 3; c++) {
      let lo = 255, hi = 0;
      for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
      if (hi - lo > best) { best = hi - lo; ch2 = c; }
    }
    b.sort((p, q) => p[ch2] - q[ch2]);
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  const palette = boxes.filter((b) => b.length).map((b) => {
    const a = [0, 0, 0];
    for (const p of b) { a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; }
    return a.map((v) => Math.round(v / b.length));
  });

  const near = (p) => {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < palette.length; i++) {
      const q = palette[i];
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  };

  // Index 0 is "nothing"; every colour is shifted up by one.
  const idx = px.map((p) => (p ? near(p) + 1 : 0));

  /* --- run-length, along rows. */
  const runs = [];
  let cur = idx[0], n = 0;
  for (const v of idx) {
    if (v === cur) { n++; continue; }
    runs.push(cur, n); cur = v; n = 1;
  }
  runs.push(cur, n);

  // A picture of exactly what was encoded, drawn back from the runs.
  const back = document.createElement('canvas');
  back.width = strip.width; back.height = strip.height;
  const bg = back.getContext('2d');
  let at = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const [v, len] = [runs[i], runs[i + 1]];
    if (v) {
      const [r, g2, b2] = palette[v - 1];
      bg.fillStyle = `rgb(${r},${g2},${b2})`;
      for (let k = 0; k < len; k++) {
        const q = at + k;
        bg.fillRect(q % back.width, (q / back.width) | 0, 1, 1);
      }
    }
    at += len;
  }

  return {
    box,
    palette: palette.map(([r, g2, b2]) =>
      '#' + [r, g2, b2].map((v) => v.toString(16).padStart(2, '0')).join('')),
    runs,
    png: back.toDataURL('image/png').split(',')[1],
  };
}, { sheet: SHEET, cells: CELLS, cell: CELL, colors: COLORS, fill: FILL, align: ALIGN });

await browser.close();

const { palette, runs, box, png } = result;
console.log(`\n  shared box      ${box.x},${box.y} ${box.w}x${box.h}`);
console.log(`  strip           ${CELL * CELLS.length}x${CELL}, ${CELLS.length} frames`);
console.log(`  palette         ${palette.length} colours`);
console.log(`  runs            ${runs.length / 2} (${(runs.length / 2 / (CELL * CELL * CELLS.length) * 100).toFixed(1)}% of pixels)`);

if (PREVIEW) {
  await writeFile(PREVIEW, Buffer.from(png, 'base64'));
  console.log(`  ${PREVIEW}`);
}

const ts = `/**
 * Major Trumper, cut from the reference sheet. **Generated -- do not hand-edit.**
 *
 *   node tools/cut-sheet.mjs --cell ${CELL} --colors ${COLORS} --fill ${FILL} --align ${ALIGN}
 *
 * This is the one imported sprite in the game and it is a deliberate owner
 * decision, not a precedent -- see the docblock in \`tools/cut-sheet.mjs\` for
 * what the tool guarantees about it (no alpha, no anti-aliased edge, a hard
 * ${palette.length}-colour palette) and CLAUDE.md for the decision itself.
 *
 * It is source rather than an asset: a palette and a run-length-encoded index
 * per pixel, plotted at boot through the same \`rect()\` calls as every other
 * sprite. There is no image file, no fetch and no decode.
 *
 * Frame order, which \`speaker.ts\` indexes by position:
 *
${CELLS.map((c, i) => ` *   ${i} -- ${c.note}`).join('\n')}
 */

/** Source pixels per frame, square. */
export const CELL = ${CELL};

/** How many frames the strip carries. */
export const FRAMES = ${CELLS.length};

/** Every colour in him. Index 0 in the runs means "nothing", so these are 1-based. */
export const PALETTE: string[] = ${JSON.stringify(palette, null, 0).replace(/","/g, "', '").replace(/^\["/, "['").replace(/"\]$/, "']")};

/**
 * The pixels, run-length encoded along rows of the whole strip: palette index
 * (0 for nothing), then how many in a row. ${runs.length / 2} runs for ${CELL * CELL * CELLS.length} pixels.
 */
export const RUNS: number[] = [
${(() => {
  const out = [];
  for (let i = 0; i < runs.length; i += 24) {
    out.push('  ' + runs.slice(i, i + 24).join(', ') + ',');
  }
  return out.join('\n');
})()}
];
`;

await writeFile(OUT, ts);
console.log(`  ${OUT}\n`);
