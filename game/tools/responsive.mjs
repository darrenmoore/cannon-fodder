/**
 * The layouts, photographed.
 *
 * `ui-audit.mjs` proves the rules hold; this shows what holding them looks
 * like. The terrain got this treatment in 001 and it is what caught most of
 * what was wrong with it, so the chrome gets it too.
 *
 *   node tools/responsive.mjs          # needs the server running
 *   node tools/responsive.mjs --open   # and show where they went
 *
 * Writes to shots/responsive/<viewport>/<screen>.png.
 */
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.CF_URL ?? `http://localhost:${process.env.PORT ?? 5199}`;
const OUT = 'shots/responsive';

/** One per layout mode, plus the extremes either side of each breakpoint. */
const VIEWPORTS = [
  { name: 'phone-portrait', width: 390, height: 844, touch: true },
  { name: 'phone-landscape', width: 844, height: 390, touch: true },
  { name: 'tablet-landscape', width: 1024, height: 768, touch: true },
  { name: 'laptop', width: 1280, height: 800, touch: false },
  { name: 'desktop', width: 1920, height: 1080, touch: false },
];

async function shoot(page, dir, name) {
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

async function run() {
  await rm(OUT, { recursive: true, force: true });
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const dir = join(OUT, vp.name);
    await mkdir(dir, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#menu:not([hidden])', { timeout: 15000 });

    await shoot(page, dir, '01-menu');

    await page.evaluate(() => {
      document.querySelector('#menu-list button[data-id]')?.click();
    });
    await page.waitForFunction(() => window.game?.world, null, { timeout: 15000 });
    // The briefing is up for 2.2s; catch it, then catch the mission behind it.
    await page.waitForTimeout(500);
    await shoot(page, dir, '02-briefing');
    await page.waitForTimeout(2200);
    await shoot(page, dir, '03-mission');

    // The pause sheet, which on a phone is the only route to restart, the
    // settings and the mission list.
    await page.evaluate(() => window.game?.input.onPause?.());
    await page.waitForSelector('#sheet:not([hidden])', { timeout: 5000 });
    await shoot(page, dir, '04-pause');

    // Settings is the densest screen in the game and the one most likely to
    // overflow a small viewport.
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('#sheet .ui-btn')];
      buttons.find((b) => b.textContent?.includes('Settings'))?.click();
    });
    await page.waitForTimeout(300);
    await shoot(page, dir, '05-settings');

    const mode = await page.evaluate(() => document.documentElement.dataset.layout);
    const zoom = await page.evaluate(() => window.game?.camera.zoom ?? 0);
    console.log(`${vp.name.padEnd(18)} ${String(mode).padEnd(8)} zoom ${zoom}`);

    await context.close();
  }

  await browser.close();
  console.log(`\nWrote ${VIEWPORTS.length * 5} shots to ${OUT}/`);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
