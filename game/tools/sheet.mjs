/**
 * Sprite sheet dump.
 *
 * Everything in this game is drawn at boot rather than loaded, which makes the
 * sprites hard to look at: to see a wrecked hut you have to level one, and to
 * see all eight facings of a bazookateer you have to find one and walk round
 * him. This asks the atlas directly and lays the answer out on a grid.
 *
 *   node tools/sheet.mjs                  # everything
 *   node tools/sheet.mjs --only hut       # one entry
 *   node tools/sheet.mjs --scale 6
 */
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const SCALE = Number(flag('scale', 5));
const ONLY = flag('only');
const OUT = flag('out', 'shots/sheet.png');
const PORT = flag('port', '5210');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
await page.waitForSelector('#menu-list .m-name');

const b64 = await page.evaluate(async ({ scale, only }) => {
  // The atlas is built once and cached, so asking for it here is the same
  // object the renderer is drawing from.
  const mod = await import('/bundle.js').catch(() => null);
  const atlas = window.__atlas ?? (mod && mod.buildAtlas ? mod.buildAtlas() : null);
  if (!atlas) throw new Error('no atlas: expose it as window.__atlas');

  // Flatten every entry to rows of sprites, whatever its nesting depth.
  const rows = [];
  const walk = (name, v) => {
    if (!v) return;
    if (v instanceof HTMLCanvasElement) { rows.push([name, [v]]); return; }
    if (Array.isArray(v)) {
      if (v[0] instanceof HTMLCanvasElement) { rows.push([name, v]); return; }
      v.forEach((child, i) => walk(`${name}[${i}]`, child));
      return;
    }
    for (const [k, child] of Object.entries(v)) walk(`${name}.${k}`, child);
  };
  for (const [k, v] of Object.entries(atlas)) {
    if (only && !k.toLowerCase().includes(only.toLowerCase())) continue;
    walk(k, v);
  }
  if (rows.length === 0) throw new Error('nothing matched');

  const PAD = 6, LABEL = 92, LINE = 16;
  const width = LABEL + rows.reduce((m, [, sprites]) =>
    Math.max(m, sprites.reduce((w, s) => w + s.width * scale + PAD, PAD)), 0);
  const height = rows.reduce((h, [, sprites]) =>
    h + Math.max(LINE, sprites.reduce((m, s) => Math.max(m, s.height * scale), 0)) + PAD, PAD);

  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // A mid grey: sprites are drawn to sit on terrain, and judging them on white
  // or on black flatters or buries the outline depending on which you pick.
  g.fillStyle = '#6b6b66';
  g.fillRect(0, 0, width, height);

  let y = PAD;
  for (const [name, sprites] of rows) {
    const rowH = Math.max(LINE, sprites.reduce((m, s) => Math.max(m, s.height * scale), 0));
    g.fillStyle = '#14140f';
    g.font = '11px ui-monospace, monospace';
    g.fillText(name, 4, y + 12);
    let x = LABEL;
    for (const s of sprites) {
      g.drawImage(s, x, y, s.width * scale, s.height * scale);
      x += s.width * scale + PAD;
    }
    y += rowH + PAD;
  }
  return c.toDataURL('image/png').split(',')[1];
}, { scale: SCALE, only: ONLY });

await writeFile(OUT, Buffer.from(b64, 'base64'));
await browser.close();
console.log(errors.length ? errors.slice(0, 3) : `${OUT}`);
