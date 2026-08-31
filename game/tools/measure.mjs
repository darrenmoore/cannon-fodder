/**
 * Pixel measurement, for settling arguments.
 *
 * A critic's eye is the right instrument for "does this look right", and the
 * wrong one for "is the canopy darker than the grass" — that is a number, and
 * two critics looking at the same frame have already disagreed about it. This
 * reports the numbers so a claim can be checked instead of believed.
 *
 *   node tools/measure.mjs shots/r12/01-chicken-run-treeline.png
 *   node tools/measure.mjs a.png b.png          # compare two frames
 *
 * Prints the dominant colours by share, the luminance histogram shape, and the
 * mean luminance of the dark and light halves — which is what "the canopy is
 * lighter than the grass" actually means when the two are the only large masses
 * in frame.
 */
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  console.error('usage: node tools/measure.mjs <png> [<png>...]');
  process.exit(1);
}

/** sRGB relative luminance, 0..255. */
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const browser = await chromium.launch();
const page = await browser.newPage();

for (const file of files) {
  const data = await readFile(file);
  const pixels = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    // Skip the sidebar: it is chrome, and its dark plate skews every statistic
    // about the playfield it sits next to.
    const x0 = Math.min(190, (img.width / 4) | 0);
    return Array.from(g.getImageData(x0, 0, img.width - x0, img.height).data);
  }, data.toString('base64'));

  const counts = new Map();
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const key = (r << 16) | (g << 8) | b;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    hist[Math.round(lum(r, g, b))]++;
    n++;
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const pct = (v) => `${((v / n) * 100).toFixed(1)}%`;
  const hex = (k) => `#${k.toString(16).padStart(6, '0')}`;

  // Otsu's threshold: the split that best separates the frame into two masses.
  let total = 0, sum = 0;
  for (let i = 0; i < 256; i++) { total += hist[i]; sum += i * hist[i]; }
  let best = 0, bestVar = -1, wB = 0, sumB = 0;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) { bestVar = v; best = i; }
  }
  let darkN = 0, darkSum = 0, lightN = 0, lightSum = 0;
  for (let i = 0; i < 256; i++) {
    if (i <= best) { darkN += hist[i]; darkSum += i * hist[i]; }
    else { lightN += hist[i]; lightSum += i * hist[i]; }
  }

  const at = (q) => {
    let seen = 0;
    for (let i = 0; i < 256; i++) { seen += hist[i]; if (seen >= total * q) return i; }
    return 255;
  };
  let mean = 0;
  for (let i = 0; i < 256; i++) mean += i * hist[i];
  mean /= total;
  let variance = 0;
  for (let i = 0; i < 256; i++) variance += hist[i] * (i - mean) ** 2;

  console.log(`\n${file}`);
  console.log(`  ${n} px   mean luma ${mean.toFixed(1)}   sd ${Math.sqrt(variance / total).toFixed(1)}`);
  console.log(`  luma  p5 ${at(0.05)}  p25 ${at(0.25)}  median ${at(0.5)}  p75 ${at(0.75)}  p95 ${at(0.95)}`);
  console.log(`  two masses split at ${best}:`
    + `  darker ${pct(darkN)} at luma ${(darkSum / darkN).toFixed(1)}`
    + `   lighter ${pct(lightN)} at luma ${(lightSum / lightN).toFixed(1)}`);
  console.log('  dominant colours:');
  for (const [k, c] of top) {
    const r = (k >> 16) & 255, g = (k >> 8) & 255, b = k & 255;
    console.log(`    ${hex(k)}  ${pct(c).padStart(6)}   luma ${lum(r, g, b).toFixed(0).padStart(3)}`
      + `   R/G ${(r / (g || 1)).toFixed(2)}  B/G ${(b / (g || 1)).toFixed(2)}`);
  }
}

await browser.close();
