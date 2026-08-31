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
const PORT = flag('port', '5210');
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

  // --- the meta-game
  //
  // Seeded rather than played, because burying six men honestly would take
  // longer than the rest of this file put together. Everything here lives on the
  // menu, so it is reachable without a live mission -- and the campaign is put
  // back to empty afterwards so the flow below still meets JOOLS.
  await page.evaluate(() => localStorage.setItem('cf.campaign', JSON.stringify({
    v: 1, issued: 8, renameUsed: false,
    squad: [
      { name: 'BOSS', missions: 7, own: true },
      { name: 'JOOLS', missions: 4 },
      { name: 'STOO', missions: 1 },
    ],
    fallen: [
      { name: 'JOPS', missions: 5, mission: 'Chicken Run', difficulty: 'veteran' },
      { name: 'GARY', missions: 0, mission: 'River Run', difficulty: 'elite' },
    ],
    records: { 'chicken-run': { bestHome: 5, bestTime: 161, clears: ['regular', 'elite'] } },
  })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });

  const lit = await page.$$eval('#menu-list button[data-id="chicken-run"] .ribbon',
    (els) => els.map((e) => e.classList.contains('on')));
  check('a cleared mission shows a ribbon per difficulty cleared',
    lit.length === 4 && lit[1] && lit[3] && !lit[0] && !lit[2], lit.join(','));
  check('an uncleared mission still draws all four ribbon slots',
    (await page.$$eval('#menu-list button[data-id="river-run"] .ribbon', (e) => e.length)) === 4);
  check('the card shows the standing par',
    (await page.$eval('#menu-list button[data-id="chicken-run"] .m-best', (e) => e.textContent))
      === 'best 5 home · 2:41');

  // Boot Hill is reached the way a player reaches it now -- from the pause
  // sheet inside a mission -- rather than from a button on the front screen.
  await page.evaluate(() => document.querySelector('#menu-list button[data-id="chicken-run"]').click());
  await page.waitForFunction(() => !!window.game, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  // The briefing owns the first press now, so it takes two to reach the sheet.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-card', { timeout: 5000 });
  check('Esc pauses the mission into a sheet',
    (await page.$$eval('.sheet-actions .ui-btn-label', (e) => e.map((b) => b.textContent))).includes('Boot Hill'));

  await page.click('.sheet-actions .ui-btn:has-text("Boot Hill")');
  await page.waitForSelector('#hill:not([hidden])', { timeout: 5000 });
  check('Boot Hill raises a cross for every man buried',
    (await page.$$eval('.hill-cross', (e) => e.length)) === 2);
  check('a veteran gets a taller marker',
    (await page.$$eval('.hill-cross.vet', (e) => e.length)) === 1);
  check('the roster is topped back up to a full squad on the hill',
    (await page.$$eval('.hill-col:nth-child(2) .ui-plate', (e) => e.length)) === 6);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, '04-boothill.png'), fullPage: true });

  await page.click('.hill-rename');
  await page.fill('.hill-input', 'darren');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check('the one rename takes, and marks the man as yours',
    await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('cf.campaign'));
      return c.renameUsed && c.squad.some((t) => t.name === 'DARREN' && t.own);
    }));
  check('the rename is offered only once',
    (await page.$$eval('.hill-rename', (e) => e.length)) === 0);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('Esc leaves the hill', await page.evaluate(() => document.getElementById('hill').hidden));

  // Back to a blank campaign for the mission flow below.
  await page.evaluate(() => localStorage.removeItem('cf.campaign'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });

  const enter = async (id) => {
    await page.evaluate((wanted) => {
      document.querySelector(`#menu-list button[data-id="${wanted}"]`)?.click();
    }, id);
    await page.waitForFunction(() => !!window.game, null, { timeout: 10000 });
    await page.waitForTimeout(350);
    // The briefing stays up until dismissed; every mission starts behind one.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  };

  // --- the briefing
  //
  // It used to hide itself after 2.2s with the mission already live behind it,
  // so a click meant for the panel marched the squad. Both halves are asserted
  // here: that it waits, and that dismissing it costs you no order.
  await page.evaluate(() => {
    document.querySelector('#menu-list button[data-id="chicken-run"]')?.click();
  });
  await page.waitForFunction(() => !!window.game, null, { timeout: 10000 });
  await page.waitForTimeout(2600);
  check('the briefing waits rather than timing out',
    await page.evaluate(() => !document.getElementById('overlay').hidden));

  const box0 = await page.locator('canvas').boundingBox();
  await page.mouse.click(box0.x + box0.width / 2 + 70, box0.y + box0.height / 2 + 50);
  await page.waitForTimeout(250);
  check('a click dismisses the briefing', await page.evaluate(() => document.getElementById('overlay').hidden));
  check('the dismissing click does not also order the squad',
    await page.evaluate(() => !window.game.world.orderGoal));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.click('.sheet-actions .ui-btn:has-text("Mission list")');
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });

  await enter('chicken-run');
  check('a mission starts', await page.evaluate(() => !!window.game));

  // --- the sidebar
  const roster = await page.$$eval('.hud-roster .ui-plate-label', (els) => els.map((e) => e.textContent));
  check('the sidebar lists the squad by name', roster.length === 6 && roster[0] === 'JOOLS',
    roster.join(','));

  // --- the mouse chord
  //
  // Left-while-right is the desktop grenade, and it is the one control no
  // screenshot and no unit test can see: a mouse is a single pointer, so the
  // second button arrives as a pointermove rather than a pointerdown, and the
  // throw is silently lost if that is not handled.
  {
    const box = await page.locator('canvas').boundingBox();
    const x = box.x + box.width / 2 + 40;
    const y = box.y + box.height / 2 - 20;
    const held = () => page.evaluate(() => window.game.world.grenadesHeld);
    const before = await held();
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    check('holding right opens fire', await page.evaluate(() => window.game.input.firing));
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(150);
    check('left-while-right throws a grenade', (await held()) === before - 1);
    check('the chord leaves the squad firing, not aiming',
      await page.evaluate(() => window.game.input.aim.mode === 'fire'));
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(120);
    check('releasing right stops the fire', !(await page.evaluate(() => window.game.input.firing)));
    await page.evaluate(() => { window.game.world.grenadeCooldown = 0; });
    const stillHeld = await held();
    await page.mouse.click(box.x + box.width / 2 - 60, box.y + box.height / 2 + 40);
    await page.waitForTimeout(150);
    check('a plain click afterwards is an order, not another grenade', (await held()) === stillHeld);
  }

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

  // --- and the pause sheet still comes back to the list
  //
  // Arriving by "next mission" means arriving behind a briefing, so the first
  // press dismisses that and the second reaches the sheet.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-card', { timeout: 5000 });
  await page.click('.sheet-actions .ui-btn:has-text("Mission list")');
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });
  check('the pause sheet returns to the mission select', await page.$('#menu[hidden]') === null);

  // --- the last mission has nowhere to go next
  //
  // Asked of whichever mission is actually last rather than a hard-coded id:
  // the campaign has grown twice now, and both times this assertion was the
  // thing that noticed.
  // From the campaign *order*, not the DOM: the menu groups by theatre, so the
  // last mission on screen is not the last mission in the run.
  const lastId = await page.evaluate(async () => {
    const maps = await (await fetch('/api/maps')).json();
    const campaign = maps.filter((m) => !m.dev);
    return campaign[campaign.length - 1].id;
  });
  await enter(lastId);
  await page.evaluate(() => { window.game.world.phase = 1; window.game.world.phaseTime = 0; });
  await page.waitForTimeout(400);
  const lastButtons = await page.$$eval('.result-actions .ui-btn .ui-btn-label', (e) => e.map((b) => b.textContent));
  check(`the final mission (${lastId}) offers no "next"`,
    !lastButtons.includes('Next mission'), lastButtons.join(','));

  // --- the dev maps
  //
  // Two of them, and they are fixtures rather than missions: the shooting range
  // is flat ground with targets on it, so a failure here is the mechanic and
  // never the scenery. They are listed only in a dev build, which is why these
  // checks assert their grouping as well as their contents.
  // The results panel is up, and it has its own way back.
  await page.click('.result-actions .ui-btn:has-text("Mission list")');
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });

  const theatres = await page.$$eval('.theatre-name', (els) => els.map((e) => e.textContent));
  check('test maps sit in their own group, last',
    theatres[theatres.length - 1] === 'Test Range', theatres.join(' / '));
  check('no test map appears in a campaign theatre',
    await page.$$eval('.theatre', (secs) => secs.slice(0, -1).every((sec) =>
      [...sec.querySelectorAll('button[data-id]')].every((b) => !/^test-/.test(b.dataset.id)))));

  await enter('test-shooting');
  const range = await page.evaluate(() => ({
    enemies: window.game.world.enemies.length,
    buildings: window.game.world.buildings.length,
    barrels: window.game.world.crates.filter((c) => c.barrel).length,
  }));
  check('the shooting range has targets', range.enemies >= 8 && range.buildings === 3 && range.barrels === 2,
    JSON.stringify(range));

  // --- shooting a man kills him, and it is the whole man that can be hit
  const shot = await page.evaluate(async () => {
    const w = window.game.world;
    const e = w.enemies.find((x) => x.alive);
    const before = w.kills;
    // A round through the head: eleven pixels above his feet, which the old
    // foot-circle hit test would have missed entirely.
    w.bullets.push({
      pos: { x: e.pos.x - 10, y: e.pos.y - 11 }, prev: { x: e.pos.x - 16, y: e.pos.y - 11 },
      vel: { x: 400, y: 0 }, faction: 0, life: 1, buildingDamage: 1, blast: 0,
    });
    await new Promise((r) => setTimeout(r, 400));
    return { died: !e.alive, kills: w.kills - before };
  });
  check('a round through the head kills', shot.died && shot.kills === 1, JSON.stringify(shot));

  // --- the blast has two rings, and the outer one is survivable
  //
  // Asserted as the model rather than as a body count: a blast dead centre on a
  // tight huddle *should* kill everyone in the lethal core, and what makes the
  // mechanic is that men outside it are thrown clear instead. Three men at ten
  // pixels, three at twenty-five, one grenade between them.
  const blast = await page.evaluate(async () => {
    const w = window.game.world;
    const c = { x: w.soldiers[0].pos.x, y: w.soldiers[0].pos.y };
    w.soldiers.forEach((s, i) => {
      s.alive = true; s.hp = 1; s.deathTime = -1; s.stagger = 0;
      s.vel.x = 0; s.vel.y = 0;
      const a = (i / 3) * Math.PI * 2;
      const r = i < 3 ? 10 : 25;
      s.pos.x = c.x + Math.cos(a) * r; s.pos.y = c.y + Math.sin(a) * r;
      s.prev.x = s.pos.x; s.prev.y = s.pos.y;
    });
    w.grenades.push({ pos: { ...c }, prev: { ...c }, from: { ...c }, to: { ...c }, t: 0.99, duration: 0.6, faction: 0 });
    await new Promise((r) => setTimeout(r, 250));
    const inner = w.soldiers.slice(0, 3);
    const outer = w.soldiers.slice(3);
    return {
      innerDead: inner.filter((s) => !s.alive).length,
      outerAlive: outer.filter((s) => s.alive).length,
      outerThrown: outer.filter((s) => s.stagger > 0 || Math.hypot(s.vel.x, s.vel.y) > 20).length,
    };
  });
  check('a blast kills its core and throws the rest clear',
    blast.innerDead === 3 && blast.outerAlive === 3 && blast.outerThrown === 3, JSON.stringify(blast));

  // --- a hut comes down and shows it
  const hut = await page.evaluate(async () => {
    const w = window.game.world;
    const b = w.buildings[0];
    w.grenades.push({ pos: { ...b.centre }, prev: { ...b.centre }, from: { ...b.centre }, to: { ...b.centre },
      t: 0.99, duration: 0.6, faction: 0 });
    await new Promise((r) => setTimeout(r, 900));
    return { standing: b.standing, hp: b.hp, ruinAge: +b.ruinAge.toFixed(2) };
  });
  check('a grenade damages a building', hut.hp < 100 || !hut.standing, JSON.stringify(hut));

  // --- waves come out of the huts, and stop when the huts do
  //
  // The whole point of sourcing a wave from the buildings is that levelling
  // them is how you turn the tap off, so that is what is asserted: the same
  // forced wave, three times, against a garrison that keeps shrinking. The
  // garrison is emptied and the squad put back in the middle first, so what is
  // measured is the doorways and not a firefight.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-card', { timeout: 5000 });
  await page.click('.sheet-actions .ui-btn:has-text("Mission list")');
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });
  await enter('last-stand');

  const sendWave = () => page.evaluate(() => {
    const w = window.game.world;
    w.enemies.length = 0;
    w.actors.length = 0;
    w.actors.push(...w.soldiers);
    const c = (w.map.width * w.map.tile) / 2;
    for (const s of w.soldiers) { s.pos.x = c; s.pos.y = c; s.prev.x = c; s.prev.y = c; }
    w.waveTimer = 0;
    window.game.step(1 / 60);
    return {
      men: w.enemies.length,
      hunting: w.enemies.filter((e) => e.state === 4).length,
      nearest: w.enemies.length === 0 ? Infinity : Math.round(Math.min(...w.enemies.map((e) =>
        Math.hypot(c - e.pos.x, c - e.pos.y)))),
      status: w.status,
      sent: w.wavesSent,
    };
  });

  check('the wave map declares a schedule and holds it back at the start',
    await page.evaluate(() => {
      const w = window.game.world;
      return w.map.waves.count === 5 && w.waveTimer > 5 && w.wavesSent === 0;
    }));

  const wave1 = await sendWave();
  check('a wave arrives out of the huts, hunting', wave1.men > 0 && wave1.hunting === wave1.men,
    JSON.stringify(wave1));
  check('no wave spawns in the squad lap', wave1.nearest > 190, `${wave1.nearest}px`);
  check('the sidebar says which wave is coming', /wave 2\/5 in \d+s/.test(wave1.status), wave1.status);

  await page.evaluate(() => {
    const huts = window.game.world.buildings.filter((b) => b.role === 'spawner');
    for (let i = 0; i < Math.floor(huts.length / 2); i++) huts[i].standing = false;
  });
  const wave2 = await sendWave();
  check('levelling half the huts halves the next wave', wave2.men > 0 && wave2.men < wave1.men,
    `${wave2.men} men, was ${wave1.men}`);

  await page.evaluate(() => {
    for (const b of window.game.world.buildings) if (b.role === 'spawner') b.standing = false;
  });
  const wave3 = await sendWave();
  check('a levelled garrison cannot send another wave', wave3.men === 0 && wave3.sent === 3,
    JSON.stringify(wave3));

  await browser.close();

  if (errors.length) {
    console.error(`\n  ${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 8)) console.error(`   ! ${e}`);
  }
  console.log(`\n  ${passed} passed, ${failures.length} failed`);
  if (failures.length || errors.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
