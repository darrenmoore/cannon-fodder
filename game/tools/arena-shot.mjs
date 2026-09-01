/**
 * Photographs the arena.
 *
 * The mission harnesses (`shoot.mjs`, `moment.mjs`) both start from a mission
 * and a squad; the arena has neither, so it needs its own door. Walks in
 * through the BATTLE button -- which is the same route a person takes, and
 * therefore also a test that the button works -- lets the battle build for a
 * while, and photographs it.
 *
 *   node tools/arena-shot.mjs [seconds] [out.png]
 *   URL=http://localhost:5210/ node tools/arena-shot.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:5199/';
const SECONDS = Number(process.argv[2] || 60);
const OUT = process.argv[3] || 'arena.png';
/** Optional world point to look at, as `x,y` in tiles. */
const LOOK = process.env.LOOK;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.getElementById('front')?.hidden, { timeout: 30000 });
await page.locator('#intro-actions button', { hasText: 'BATTLE' }).click();
await page.waitForFunction(() => !!window.arena, { timeout: 30000 });

await page.waitForTimeout(SECONDS * 1000);

if (LOOK) {
  const [tx, ty] = LOOK.split(',').map(Number);
  await page.evaluate(([x, y]) => {
    const a = window.arena;
    a.camera.lookAt({ x: x * 16, y: y * 16 }, a.world.map);
  }, [tx, ty]);
  await page.waitForTimeout(400);
}

await page.screenshot({ path: OUT });
const state = await page.evaluate(() => {
  const a = window.arena;
  return { t: Math.round(a.world.time), ...a.readout(), actors: a.world.actors.length };
});
console.log(JSON.stringify(state));
if (errors.length) console.log('ERRORS', errors.slice(0, 3));
await browser.close();
