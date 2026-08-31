/**
 * A functional pass through the shell, in a real browser.
 *
 * The capture harness proves the game *renders*; this proves it still *plays*.
 * It drives the paths that screenshots cannot reach — winning a mission, losing
 * one, and the buttons on the panel that comes up afterwards — because those
 * are exactly the paths a visual refit is most likely to break without leaving
 * a mark on any screenshot.
 *
 *   node tools/playtest.mjs
 *   node tools/playtest.mjs --shots shots/flow   # keep the panel screenshots
 */
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : (args[i + 1] ?? true);
};
const PORT = flag('port', '5199');
const SHOTS = flag('shots');
const BASE = `http://localhost:${PORT}`;

let passed = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(`${name}${detail ? ` -- ${detail}` : ''}`); console.log(`  FAIL ${name} ${detail}`); }
};

async function main() {
  if (SHOTS) { await rm(SHOTS, { recursive: true, force: true }); await mkdir(SHOTS, { recursive: true }); }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });

  // --- the mission select
  const groups = await page.$$eval('.theatre-name', (els) => els.map((e) => e.textContent));
  check('the mission select groups missions into theatres', groups.length >= 2, `saw ${groups.length}`);
  const cards = await page.$$eval('#menu-list button.mission', (els) => els.length);
  check('every mission has a card', cards >= 8, `saw ${cards}`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, '01-menu.png') });

  const enter = async (id) => {
    await page.evaluate((wanted) => {
      document.querySelector(`#menu-list button[data-id="${wanted}"]`)?.click();
    }, id);
    await page.waitForFunction(() => !!window.game, null, { timeout: 10000 });
    await page.waitForTimeout(350);
  };

  await enter('chicken-run');
  check('a mission starts', await page.evaluate(() => !!window.game));

  // --- the sidebar
  const roster = await page.$$eval('.hud-roster .ui-plate-label', (els) => els.map((e) => e.textContent));
  check('the sidebar lists the squad by name', roster.length === 6 && roster[0] === 'JOOLS',
    roster.join(','));

  // --- losing
  await page.evaluate(() => {
    const w = window.game.world;
    for (const s of w.soldiers) { s.alive = false; s.hp = 0; }
  });
  await page.waitForFunction(() => !document.getElementById('overlay').hidden, null, { timeout: 5000 });
  await page.waitForTimeout(250);
  check('losing raises the end panel', await page.$('.result.lose') !== null);
  check('the panel names the dead', (await page.$$('.result-roll .ui-plate')).length === 6);
  check('a lost mission does not restart itself',
    await page.evaluate(() => window.game.world.phase !== 0));
  if (SHOTS) await page.screenshot({ path: join(SHOTS, '02-lost.png') });

  // "Try again" should put us back into a live mission, not the menu.
  await page.click('.result-actions .ui-btn.tone-warn');
  await page.waitForTimeout(300);
  check('"try again" restarts the mission in place', await page.evaluate(
    () => !!window.game && window.game.world.phase === 0
      && window.game.world.soldiers.every((s) => s.alive)));

  // --- winning
  //
  // The objective is scored on the kill count rather than on who is still
  // standing, so quietly clearing the board would not win the mission -- credit
  // the kills, which is what actually shooting them would have done.
  await page.evaluate(() => {
    const w = window.game.world;
    for (const a of w.actors) if (a.faction === 1) { a.alive = false; a.hp = 0; }
    w.kills = w.enemyTotal;
  });
  await page.waitForFunction(() => !document.getElementById('overlay').hidden, null, { timeout: 8000 });
  await page.waitForTimeout(250);
  check('winning raises the end panel', await page.$('.result.win') !== null);
  const buttons = await page.$$eval('.result-actions .ui-btn .ui-btn-label', (e) => e.map((b) => b.textContent));
  check('the win panel offers the next mission', buttons.includes('Next mission'), buttons.join(','));
  if (SHOTS) await page.screenshot({ path: join(SHOTS, '03-won.png') });

  // --- straight on to the next mission, without passing through the menu
  const before = await page.evaluate(() => window.game.world.map.id);
  await page.click('.result-actions .ui-btn.tone-good');
  await page.waitForFunction((prev) => !!window.game && window.game.world.map.id !== prev,
    before, { timeout: 15000 });
  const after = await page.evaluate(() => window.game.world.map.id);
  check('"next mission" goes straight into the following mission', after === 'river-run', after);

  // --- and Esc still comes back to the list
  await page.keyboard.press('Escape');
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });
  check('Esc returns to the mission select', await page.$('#menu[hidden]') === null);

  // --- the last mission has nowhere to go next
  await enter('last-stand');
  await page.evaluate(() => { window.game.world.phase = 1; window.game.world.phaseTime = 0; });
  await page.waitForTimeout(400);
  const lastButtons = await page.$$eval('.result-actions .ui-btn .ui-btn-label', (e) => e.map((b) => b.textContent));
  check('the final mission offers no "next"', !lastButtons.includes('Next mission'), lastButtons.join(','));

  await browser.close();

  if (errors.length) {
    console.error(`\n  ${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 8)) console.error(`   ! ${e}`);
  }
  console.log(`\n  ${passed} passed, ${failures.length} failed`);
  if (failures.length || errors.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
