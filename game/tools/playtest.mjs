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
    records: { 'chicken-run': { bestHome: 5, bestTime: 161, clears: ['veteran', 'elite'] } },
  })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });

  // Stars are filled to the *highest* tier cleared, not one per clear -- so a
  // record of veteran+elite is three stars, and would be three on elite alone.
  const lit = await page.$$eval('#menu-list button[data-id="chicken-run"] .star',
    (els) => els.map((e) => e.classList.contains('on')));
  check('a mission cleared on Elite shows all three stars',
    lit.length === 3 && lit.every(Boolean), lit.join(','));
  check('an unplayed mission still draws all three star slots, unlit',
    (await page.$$eval('#menu-list button[data-id="river-run"] .star',
      (e) => e.length === 3 && e.every((n) => !n.classList.contains('on')))));
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

  /**
   * Back to the mission list from wherever we are.
   *
   * Mid-mission Esc opens the pause sheet; on a resolved mission it now goes
   * straight to the list, because the end panel's caps are bound. Both routes
   * exist, so this asks which one it got rather than assuming.
   */
  const toMenu = async () => {
    // Up to three presses: one may be spent dismissing a briefing that is still
    // up, one opens the pause sheet, and a resolved mission needs neither.
    for (let i = 0; i < 3; i++) {
      if (await page.locator('#menu-list .m-name').first().isVisible().catch(() => false)) return;
      if (await page.locator('.sheet-card').isVisible().catch(() => false)) {
        await page.click('.sheet-actions .ui-btn:has-text("Mission list")');
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(300);
    }
    await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });
  };

  /** Enters a mission and leaves the briefing up, which `enter` dismisses. */
  const enterUnbriefed = async (id) => {
    await page.evaluate((wanted) => {
      document.querySelector(`#menu-list button[data-id="${wanted}"]`)?.click();
    }, id);
    await page.waitForFunction(() => !!window.game, null, { timeout: 10000 });
    await page.waitForTimeout(350);
  };

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
    // A killing hit puts roughly one enemy in seven *down* rather than out, so
    // asking "did he die" of a single round is a question with a one-in-seven
    // wrong answer -- it passed on luck until something else moved the dice.
    // Two rounds settle it either way, and what is being checked here is that
    // the round connects with his head at all.
    const e = w.enemies.find((x) => x.alive);
    const before = w.kills;
    // A round through the head: eleven pixels above his feet, which the old
    // foot-circle hit test would have missed entirely.
    w.bullets.push({
      pos: { x: e.pos.x - 10, y: e.pos.y - 11 }, prev: { x: e.pos.x - 16, y: e.pos.y - 11 },
      vel: { x: 400, y: 0 }, faction: 0, life: 1, buildingDamage: 1, blast: 0,
    });
    await new Promise((r) => setTimeout(r, 400));
    const downed = !e.alive || e.wounded;
    if (e.alive) {
      w.bullets.push({
        pos: { x: e.pos.x - 10, y: e.pos.y - 11 }, prev: { x: e.pos.x - 16, y: e.pos.y - 11 },
        vel: { x: 400, y: 0 }, faction: 0, life: 1, buildingDamage: 1, blast: 0,
      });
      await new Promise((r) => setTimeout(r, 400));
    }
    return { downed, died: !e.alive, kills: w.kills - before };
  });
  check('a round through the head connects, and a second finishes it',
    shot.downed && shot.died && shot.kills === 1, JSON.stringify(shot));

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
  check('a wave arrives out of the huts', wave1.men > 0, JSON.stringify(wave1));
  check('no wave spawns in the squad lap', wave1.nearest > 190, `${wave1.nearest}px`);
  check('the sidebar says which wave is coming', /wave 2\/5 in \d+s/.test(wave1.status), wave1.status);

  // Sent at what you are defending, not at you. They used to be spawned
  // hunting the squad, which meant a squad standing off to one side pulled the
  // whole assault away from the outpost and the objective became a spectator.
  const besiege = await page.evaluate(() => {
    const w = window.game.world;
    const keep = w.buildings.find((b) => b.role === 'protect');
    const far = (e) => Math.hypot(e.pos.x - keep.centre.x, e.pos.y - keep.centre.y);
    const before = w.enemies.map(far);
    // The squad hides in a corner, so nothing but the keep is worth walking to.
    for (const s of w.soldiers) { s.pos.x = 60; s.pos.y = 60; s.prev.x = 60; s.prev.y = 60; }
    for (let i = 0; i < 60 * 40; i++) {
      for (const s of w.soldiers) { s.hp = 100; s.alive = true; s.pos.x = 60; s.pos.y = 60; }
      window.game.step(1 / 60);
    }
    const after = w.enemies.filter((e) => e.alive).map(far);
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y) / a.length : Infinity);
    return { before: Math.round(mean(before)), after: Math.round(mean(after)), n: after.length };
  });
  check('a wave walks at the thing you are defending, not at wherever you stand',
    besiege.after < besiege.before, JSON.stringify(besiege));

  // The tap cannot be turned off. Levelling huts used to halve the next wave,
  // which made demolition the answer to every wave mission and the back half of
  // them a formality -- so they take fire, show it, and never fall.
  const huts = await page.evaluate(() => {
    const w = window.game.world;
    const spawners = w.buildings.filter((b) => b.role === 'spawner');
    for (const b of spawners) window.game.world.fx && 0;
    return { count: spawners.length, allProof: spawners.every((b) => b.indestructible) };
  });
  check('every hut a wave comes out of is indestructible', huts.count > 0 && huts.allProof,
    JSON.stringify(huts));

  const survived = await page.evaluate(() => {
    const w = window.game.world;
    const b = w.buildings.find((x) => x.role === 'spawner');
    for (let i = 0; i < 40; i++) {
      w.bullets.push({
        pos: { x: b.centre.x, y: b.centre.y }, prev: { x: b.centre.x - 8, y: b.centre.y },
        vel: { x: 300, y: 0 }, life: 1, faction: 0, blast: 0, buildingDamage: 999, damage: 1,
      });
      window.game.step(1 / 60);
    }
    return { standing: b.standing, hp: b.hp === b.maxHp, flashed: b.flash > 0 };
  });
  check('and it still shows the hits it is shrugging off',
    survived.standing && survived.hp && survived.flashed, JSON.stringify(survived));

  const wave2 = await sendWave();
  check('so the wave after it is bigger, not smaller', wave2.men > wave1.men,
    `${wave2.men} men, was ${wave1.men}`);

  // --- everybody swims, and the things that place men still do not
  //
  // Deep water is solid to every question about *where to put something* and
  // passable only to a man deliberately crossing it, so this drives the one
  // and asserts the other: the squad crosses a channel it used to be walled
  // out of, and a hostage on the wrong side of the same water walks round.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-card', { timeout: 5000 });
  await page.click('.sheet-actions .ui-btn:has-text("Mission list")');
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });
  await enter('river-run');

  const swim = await page.evaluate(() => {
    const DEEP = 7;
    const SOLID = new Set([2, 5, 6, 7, 12, 14, 16]);
    const w = window.game.world;
    const m = w.map;
    const T = m.tile;
    const at = (x, y) => m.grid[y * m.width + x];
    const px = (t) => (t + 0.5) * T;
    const open = (x, y) => !SOLID.has(at(x, y));
    const tileOf = (p) => at(Math.floor(p.x / T), Math.floor(p.y / T));

    // A column with land, a run of deep water, then land again.
    let cross = null;
    for (let x = 6; x < m.width - 6 && !cross; x++) {
      for (let y = 4; y < m.height - 10; y++) {
        if (at(x, y) !== DEEP) continue;
        let end = y;
        while (end < m.height && at(x, end) === DEEP) end++;
        if (end - y >= 4 && end - y <= 10 && open(x, y - 2) && open(x, end + 1)) {
          cross = { x, north: y - 2, south: end + 1, width: end - y };
          break;
        }
        y = end;
      }
    }
    if (!cross) return { cross: false };

    w.enemies.length = 0;
    w.actors.length = 0;
    w.actors.push(...w.soldiers);
    for (const s of w.soldiers) {
      s.alive = true; s.hp = 1;
      s.pos.x = px(cross.x); s.pos.y = px(cross.north);
      s.prev.x = s.pos.x; s.prev.y = s.pos.y;
    }
    // Well clear of the far bank, so the formation ring lands on dry ground.
    window.game.input.queue.push({
      type: 'order', world: { x: px(cross.x), y: px(cross.south + 4) }, queue: false,
    });

    let swamSteps = 0;
    let firedWet = 0;
    for (let i = 0; i < 60 * 30; i++) {
      const before = w.bullets.length;
      window.game.step(1 / 60);
      if (w.soldiers.some((s) => s.alive && s.swimming)) {
        swamSteps++;
        if (w.bullets.length > before) firedWet++;
      }
    }
    const living = w.soldiers.filter((s) => s.alive);
    return {
      cross: true, width: cross.width, swamSteps, firedWet,
      across: living.filter((s) => s.pos.y > (cross.south - 1) * T).length,
      wet: living.filter((s) => tileOf(s.pos) === DEEP).length,
      living: living.length,
      priced: w.field.swims,
    };
  });
  check('the squad swims a channel it used to be walled out of',
    swim.cross && swim.swamSteps > 0 && swim.across === swim.living && swim.wet === 0,
    JSON.stringify(swim));
  check('nobody fires while swimming', swim.firedWet === 0, String(swim.firedWet));

  const hostageDry = await page.evaluate(async () => {
    const DEEP = 7;
    const w = window.game.world;
    const m = w.map;
    const T = m.tile;
    const px = (t) => (t + 0.5) * T;
    const tileOf = (p) => m.grid[Math.floor(p.y / T) * m.width + Math.floor(p.x / T)];

    let deep = null;
    for (let y = 4; y < m.height - 4 && !deep; y++) {
      for (let x = 6; x < m.width - 6; x++) {
        if (m.grid[y * m.width + x] === DEEP) { deep = { x, y }; break; }
      }
    }
    if (!deep) return { deep: false };

    // Borrow a hostage: river-run has none of its own, and what is being
    // asserted is the movement rule rather than anything about this mission.
    const h = {
      id: 9999, pos: { x: px(deep.x - 3), y: px(deep.y) }, prev: { x: px(deep.x - 3), y: px(deep.y) },
      vel: { x: 0, y: 0 }, radius: 3.2, angle: 0, alive: true, walkPhase: 0,
      freed: true, delivered: false,
    };
    w.hostages.push(h);
    for (const s of w.soldiers) { s.pos.x = px(deep.x + 4); s.pos.y = px(deep.y); s.prev.x = s.pos.x; s.prev.y = s.pos.y; }

    let inWater = 0;
    for (let i = 0; i < 60 * 20; i++) {
      window.game.step(1 / 60);
      if (tileOf(h.pos) === DEEP) inWater++;
    }
    return { deep: true, inWater };
  });
  check('a hostage still will not walk into deep water',
    hostageDry.deep && hostageDry.inWater === 0, JSON.stringify(hostageDry));

  // --- covert: firing is allowed, a body is not
  //
  // The rule is stated in two places before a shot is fired, which is most of
  // what makes it fair, so both are asserted here alongside the rule itself.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-card', { timeout: 5000 });
  await page.click('.sheet-actions .ui-btn:has-text("Mission list")');
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });

  const covertCard = await page.$eval('#menu-list button[data-id="softly-softly"] .m-obj', (e) => e.textContent);
  check('the mission list states the covert rule before you pick it',
    /without killing/i.test(covertCard), covertCard);

  await page.evaluate(() => document.querySelector('#menu-list button[data-id="softly-softly"]').click());
  await page.waitForFunction(() => !!window.game, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  check('the briefing states it too, before a shot is fired',
    /without killing/i.test(await page.$eval('#overlay-card', (e) => e.textContent)));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  check('the sidebar carries the running verdict',
    / no kills$/.test(await page.evaluate(() => window.game.world.status)));

  const oneBody = await page.evaluate(async () => {
    const w = window.game.world;
    const e = w.enemies.find((x) => x.alive);
    // Onto the squad's own cleared ground, so a tree in the way cannot be what
    // this ends up measuring -- the hitbox has its own check above.
    const s0 = w.soldiers[0];
    e.pos.x = s0.pos.x + 24; e.pos.y = s0.pos.y;
    e.prev.x = e.pos.x; e.prev.y = e.pos.y;
    w.bullets.push({
      pos: { x: e.pos.x - 10, y: e.pos.y - 11 }, prev: { x: e.pos.x - 16, y: e.pos.y - 11 },
      vel: { x: 400, y: 0 }, faction: 0, life: 1, buildingDamage: 1, blast: 0,
    });
    await new Promise((r) => setTimeout(r, 500));
    return { kills: w.kills, phase: w.phase, living: w.soldiers.filter((s) => s.alive).length };
  });
  check('one body ends a covert mission on the spot',
    oneBody.kills === 1 && oneBody.phase === 2 && oneBody.living === 6, JSON.stringify(oneBody));
  /*
   * Wait for the panel rather than assuming it is instant.
   *
   * It used to be: the result card arrived on the same frame the mission
   * resolved, so a fixed pause was enough. The end-of-phase banner now holds
   * the screen for `CONFIG.banner.hold` first -- which is the point of it --
   * and a fixed pause was reading the *briefing* card that was still up, then
   * reporting the failure text as missing. Waiting on the state cannot go stale
   * when that duration is next tuned.
   */
  await page.waitForSelector('.result.lose', { timeout: 6000 });
  check('and the panel says so rather than claiming a wipe-out',
    /covert approach is over/i.test(await page.$eval('#overlay-card', (e) => e.textContent)));

  const quietWin = await page.evaluate(() => {
    window.game.restart();
    const w = window.game.world;
    const z = w.extraction[0];
    for (const s of w.soldiers) {
      s.alive = true; s.hp = 1;
      s.pos.x = z.x + (Math.random() - 0.5) * 6; s.pos.y = z.y + (Math.random() - 0.5) * 6;
      s.prev.x = s.pos.x; s.prev.y = s.pos.y;
    }
    for (let i = 0; i < 20; i++) window.game.step(1 / 60);
    return { phase: w.phase, kills: w.kills };
  });
  check('the squad at the pickup with nobody dead wins it',
    quietWin.phase === 1 && quietWin.kills === 0, JSON.stringify(quietWin));

  // --- wounded enemies, camouflage, and the moment a mission is won
  //
  // All three are simulation rather than presentation, so they are asserted
  // here rather than photographed. The wounded rule is the delicate one: the
  // squad's one-hit death is the game's central bargain and this must never
  // touch it, so that is checked over two hundred rounds rather than one.
  // Esc on a resolved mission goes to the mission list, because the panel says
  // it does. This used to open the pause sheet *over* the win panel -- two
  // modals at once -- and reaching the list took a press and then a click.
  await page.keyboard.press('Escape');
  const escWent = await page.waitForSelector('#menu-list .m-name', { timeout: 5000 })
    .then(() => true).catch(() => false);
  check('Esc on the end panel goes where the panel says, and opens no second modal',
    escWent && (await page.locator('#sheet').isHidden()), `list reached: ${escWent}`);
  await enter('test-shooting');

  const wounded = await page.evaluate(() => {
    const w = window.game.world;
    // `baseLevers`, not `levers`: the live ones are derived every step from the
    // base with camping pressure folded in, so a write to them lasts one frame.
    w.baseLevers.hearing = 400;
    const e = w.enemies.find((x) => x.alive);
    const others = w.enemies.filter((x) => x !== e).slice(0, 4);
    others.forEach((o, i) => {
      o.pos.x = e.pos.x + 120 + i * 10; o.pos.y = e.pos.y + 60;
      o.prev.x = o.pos.x; o.prev.y = o.pos.y;
      o.state = 0; o.investigate = null;
    });
    for (const s of w.soldiers) { s.pos.x = 20; s.pos.y = 20; s.prev.x = 20; s.prev.y = 20; }

    e.wounded = true; e.hp = 1; e.screamTimer = 0; e.state = 0;
    const start = { x: e.pos.x, y: e.pos.y };
    const kills0 = w.kills;
    let moved = 0;
    for (let i = 0; i < 60 * 5; i++) {
      window.game.step(1 / 60);
      moved = Math.max(moved, Math.hypot(e.pos.x - start.x, e.pos.y - start.y));
    }
    const drawn = others.filter((o) => o.state === 4 && o.investigate
      && Math.hypot(o.investigate.x - e.pos.x, o.investigate.y - e.pos.y) < 40).length;

    // And a second round finishes him -- only now is it a kill.
    w.bullets.push({
      pos: { x: e.pos.x - 10, y: e.pos.y - 11 }, prev: { x: e.pos.x - 16, y: e.pos.y - 11 },
      vel: { x: 400, y: 0 }, faction: 0, life: 1, buildingDamage: 1, blast: 0,
    });
    for (let i = 0; i < 30; i++) window.game.step(1 / 60);
    return {
      moved: Math.round(moved), drawn, of: others.length,
      killsWhileDown: 0, dead: !e.alive, killsAfter: w.kills - kills0,
    };
  });
  check('a wounded man lies still, screams, and draws the men near him to the spot',
    wounded.moved <= 2 && wounded.drawn === wounded.of, JSON.stringify(wounded));
  check('finishing him is what makes it a kill',
    wounded.dead && wounded.killsAfter === 1, JSON.stringify(wounded));

  const ownMen = await page.evaluate(() => {
    window.game.restart();
    const w = window.game.world;
    let hurt = 0; let died = 0;
    for (let round = 0; round < 200; round++) {
      const s = w.soldiers[0];
      s.alive = true; s.hp = 1; s.wounded = false; s.deathTime = -1;
      w.bullets.push({
        pos: { x: s.pos.x - 10, y: s.pos.y - 11 }, prev: { x: s.pos.x - 16, y: s.pos.y - 11 },
        vel: { x: 400, y: 0 }, faction: 1, life: 1, buildingDamage: 1, blast: 0,
      });
      for (let i = 0; i < 8; i++) window.game.step(1 / 60);
      if (s.wounded) hurt++;
      if (!s.alive) died++;
    }
    return { hurt, died };
  });
  check('your own men are never wounded, only killed',
    ownMen.hurt === 0 && ownMen.died > 150, JSON.stringify(ownMen));

  // Camouflage is a trait rolled off a difficulty lever, so it is asserted at
  // both ends of the range rather than on one setting.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-card', { timeout: 5000 });
  await page.click('.sheet-actions .ui-btn:has-text("Mission list")');
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });
  await page.evaluate(() => localStorage.setItem('cf.difficulty', 'elite'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });
  await enter('chicken-run');

  const camo = await page.evaluate(() => {
    const w = window.game.world;
    const rifles = w.enemies.filter((e) => e.kind === 0);
    const camos = rifles.filter((e) => e.traits.camo);
    const plain = rifles.filter((e) => !e.traits.camo);
    return {
      difficulty: w.difficulty, rifles: rifles.length, camo: camos.length,
      sameStats: camos.length && plain.length
        ? JSON.stringify(camos[0].stats) === JSON.stringify(plain[0].stats) : null,
      nonRifle: w.enemies.filter((e) => e.kind !== 0 && e.traits.camo).length,
    };
  });
  check('elite fields camouflaged riflemen, no tougher and never the specialists',
    camo.camo > 0 && camo.camo < camo.rifles && camo.sameStats === true && camo.nonRifle === 0,
    JSON.stringify(camo));

  const cheer = await page.evaluate(() => {
    const w = window.game.world;
    w.soldiers[5].alive = false;
    for (const e of w.enemies) if (e.alive) { e.alive = false; w.kills++; }
    for (let i = 0; i < 4; i++) window.game.step(1 / 60);
    const living = w.soldiers.filter((s) => s.alive);
    return {
      phase: w.phase, living: living.length,
      facing: living.filter((s) => Math.abs(s.angle - Math.PI / 2) < 0.01).length,
      still: living.every((s) => Math.hypot(s.vel.x, s.vel.y) < 0.01),
    };
  });
  check('winning turns every survivor to face the camera and stops them',
    cheer.phase === 1 && cheer.facing === cheer.living && cheer.still, JSON.stringify(cheer));

  // --- 100/J and 100/P: five complaints from play, and one dead key
  //
  // Every one of these was a thing the game already did and the player could
  // not see, or a fix that landed on a bug's twin. They are cheap to break by
  // accident and expensive to notice, which is exactly what a harness is for.

  await toMenu();
  await enter('last-stand');

  const opening = await page.evaluate(() => {
    const w = window.game.world;
    return { alive: w.enemies.filter((e) => e.alive).length, lead: w.waveTimer, waves: w.map.waves };
  });
  check('a wave mission opens with an empty field, not with a garrison on it',
    opening.alive === 0 && opening.waves !== null, JSON.stringify(opening));

  const schedule = await page.evaluate(() => {
    const g = window.game, marks = [];
    let sent = 0;
    for (let i = 0; i < 60 * 125; i++) {
      // Held alive: the question is whether the schedule runs, not whether six
      // idle men can survive it.
      for (const s of g.world.soldiers) { s.hp = 100; s.alive = true; }
      g.step(1 / 60);
      if (g.world.wavesSent !== sent) { sent = g.world.wavesSent; marks.push(Math.round(g.world.time)); }
    }
    // `duration` is the survive clock; `timeLimit` is the unrelated deadline modifier.
    return { marks, duration: g.world.map.duration };
  });
  check('every wave the map promises arrives, and all of them inside the clock',
    schedule.marks.length === 5 && schedule.marks[0] >= 15
      && schedule.marks[schedule.marks.length - 1] < schedule.duration,
    JSON.stringify(schedule.marks));

  await toMenu();
  await enter('not-a-sound');

  const drift = await page.evaluate(() => {
    const g = window.game, w = g.world;
    const start = w.enemies.map((e) => ({ x: e.pos.x, y: e.pos.y }));
    const peak = new Array(w.enemies.length).fill(0);
    for (let i = 0; i < 60 * 25; i++) {
      g.step(1 / 60);
      w.enemies.forEach((e, k) => {
        const d = Math.hypot(e.pos.x - start[k].x, e.pos.y - start[k].y);
        if (d > peak[k]) peak[k] = d;
      });
    }
    return {
      moved: peak.filter((d) => d > 8).length,
      total: peak.length,
      furthest: Math.round(Math.max(...peak)),
      strayed: w.enemies.filter((e) => Math.hypot(e.pos.x - e.home.x, e.pos.y - e.home.y) > 60).length,
    };
  });
  check('an idle garrison visibly shifts its weight rather than reading as scenery',
    drift.moved === drift.total && drift.furthest > 12, JSON.stringify(drift));
  check('and not one of them wanders off the thing he is standing guard over',
    drift.strayed === 0, JSON.stringify(drift));

  const deliver = await page.evaluate(() => {
    const w = window.game.world;
    const z = w.extraction[0];
    const h = w.hostages[0];
    h.freed = true; h.delivered = false;
    // One pixel outside the tent's own footprint: beside it, not on it.
    h.pos.x = z.x + z.pad + 1; h.pos.y = z.y;
    for (let i = 0; i < 30; i++) window.game.step(1 / 60);
    return { pad: z.pad, delivered: h.delivered };
  });
  check('a hostage is delivered from beside the tent, not from inside it',
    deliver.pad > 0 && deliver.delivered, JSON.stringify(deliver));

  await toMenu();
  await enterUnbriefed('chicken-run');

  // The briefing is up. Click once to dismiss, then again to give an order --
  // the second click used to be eaten by a swallow armed with nothing to eat.
  const canvas = await page.locator('#screen').boundingBox();
  const clicks = [];
  for (let i = 1; i <= 3; i++) {
    await page.mouse.click(Math.round(canvas.x + canvas.width * (0.4 + i * 0.05)),
                           Math.round(canvas.y + canvas.height * (0.4 + i * 0.04)));
    await page.waitForTimeout(220);
    clicks.push(await page.evaluate(() => {
      const had = !!window.game.world.orderGoal;
      window.game.world.orderGoal = null;
      return had;
    }));
  }
  check('the click after the one that dismissed a briefing gives an order',
    clicks[0] === false && clicks[1] === true && clicks[2] === true, JSON.stringify(clicks));

  await page.evaluate(() => {
    [...document.querySelectorAll('.debug-btn')].find((n) => n.textContent.trim() === 'win').click();
    for (let i = 0; i < 200; i++) window.game.step(1 / 60);
  });
  await page.waitForTimeout(2600);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const advanced = await page.evaluate(() => window.game?.world?.map?.name ?? '(none)');
  check('Enter on the end panel takes the next mission, as its cap promises',
    advanced === 'River Run', advanced);

  // A rifle against a building: still 1 of 60, but no longer silent about it.
  await toMenu();
  await enter('village');
  const scratch = await page.evaluate(() => {
    const w = window.game.world;
    const b = w.buildings.find((x) => x.standing);
    const before = b.hp;
    w.fx.particles.length = 0;
    // A round arriving from the left, stopping on the wall.
    w.bullets.push({
      pos: { x: b.centre.x, y: b.centre.y }, prev: { x: b.centre.x - 8, y: b.centre.y },
      vel: { x: 300, y: 0 }, life: 1, faction: 0, blast: 0,
      buildingDamage: 1, damage: 1,
    });
    window.game.step(1 / 60);
    const scratched = { chips: w.fx.particles.length, flash: b.flash, took: before - b.hp };
    w.fx.particles.length = 0;
    b.flash = 0;
    const hp2 = b.hp;
    // And a blast, which is what the building is actually afraid of.
    w.fx.particles.length = 0;
    b.hp = hp2;
    return { scratched, maxHp: b.maxHp };
  });
  check('a rifle round on a building says so, without pretending it landed',
    scratch.scratched.took === 1 && scratch.scratched.chips > 0 && scratch.scratched.flash < 0.5,
    JSON.stringify(scratch));

  // --- a hold mission is a defence, not a wait
  //
  // `hold` and `survive` are the same mission and only one of them had a way of
  // producing anybody: a hold map fielded a fixed garrison, so once it was dead
  // the player stood in a circle watching a clock. Reported from play on The
  // Sink, which had no spawn buildings on it at all.
  for (const id of ['the-sink', 'hold-the-junction', 'the-long-white']) {
    await toMenu();
    await enter(id);
    const hold = await page.evaluate(() => {
      const g = window.game, w = g.world;
      const z = w.extraction[0];
      const marks = [];
      let sent = 0;
      // A realistic run: some seconds walking, then stand on the zone.
      for (let i = 0; i < 60 * 130; i++) {
        for (const s of w.soldiers) { s.hp = 100; s.alive = true; }
        if (w.time > 25) {
          for (const s of w.soldiers) { s.pos.x = z.x; s.pos.y = z.y + 20; s.prev.x = s.pos.x; s.prev.y = s.pos.y; }
        }
        g.step(1 / 60);
        if (w.wavesSent !== sent) { sent = w.wavesSent; marks.push(Math.round(w.time)); }
        if (w.phase !== 0) break;
      }
      return {
        id: w.map.name,
        duration: w.map.duration,
        promised: w.map.waves ? w.map.waves.count : 0,
        arrived: marks.length,
        last: marks[marks.length - 1] ?? -1,
        wonAt: Math.round(w.time),
        faced: w.enemyTotal,
        spawners: w.buildings.filter((b) => b.role === 'spawner').length,
        bunker: w.buildings.some((b) => b.kind === 'bunker' && b.indestructible),
      };
    });
    check(`${id}: has somewhere for the pressure to come from`,
      hold.spawners > 0 && hold.promised > 0, JSON.stringify(hold));
    check(`${id}: every wave it promises arrives before the hold is up`,
      hold.arrived === hold.promised && hold.last < hold.wonAt, JSON.stringify(hold));
    check(`${id}: the hold is under a minute`, hold.duration <= 60, `${hold.duration}s`);
  }

  // --- 100/Q2: standing still and shooting everything has a cost
  await toMenu();
  await enter('chicken-run');
  const camp = await page.evaluate(() => {
    const g = window.game, w = g.world;
    // Kills only count once they have held the spot, so let them settle first.
    for (let i = 0; i < 60 * 3; i++) g.step(1 / 60);
    const ladder = [];
    for (let i = 0; i < 7; i++) {
      const e = w.enemies[i % w.enemies.length];
      e.alive = true; e.hp = 1; e.deathTime = 0;
      e.pos.x = w.soldiers[0].pos.x + 40; e.pos.y = w.soldiers[0].pos.y;
      w.bullets.push({
        pos: { ...e.pos }, prev: { ...e.pos }, vel: { x: 1, y: 0 },
        life: 1, faction: 0, blast: 0, buildingDamage: 1, damage: 99,
      });
      for (let k = 0; k < 4; k++) g.step(1 / 60);
      ladder.push(+w.pressure.toFixed(1));
    }
    const spawnRatio = w.levers.spawnInterval / w.baseLevers.spawnInterval;
    const hearRatio = w.levers.hearing / w.baseLevers.hearing;
    // Then march, and keep marching, so they never settle again.
    //
    // The distance actually covered is reported, not assumed: nudging men three
    // pixels a step is a request, and terrain, collision and `unstick` all get a
    // say. A march that quietly never happened would otherwise read as the
    // relief rule failing, which is a different bug entirely.
    const from = { x: w.soldiers[0].pos.x, y: w.soldiers[0].pos.y };
    for (let i = 0; i < 60 * 20; i++) {
      for (const s of w.soldiers) {
        // Held alive: they are marching through a garrison that camping has
        // just made faster and louder, and a wiped squad has no centre -- so
        // `stepPressure` returns early and the drain stops halfway, which
        // measures dying rather than moving.
        s.hp = 100; s.alive = true;
        s.pos.x += 3;
        s.prev.x = s.pos.x - 3;
        // Moving, and saying so: the rule reads velocity, because "are they
        // walking" is a question about speed and not about how far they have
        // got since somebody last looked.
        s.vel.x = 180; s.vel.y = 0;
      }
      g.step(1 / 60);
    }
    const travelled = Math.hypot(w.soldiers[0].pos.x - from.x, w.soldiers[0].pos.y - from.y);
    return {
      ladder, spawnRatio: +spawnRatio.toFixed(2), hearRatio: +hearRatio.toFixed(2),
      after: +w.pressure.toFixed(1), travelled: Math.round(travelled),
    };
  });
  // Rises with kills rather than rising on every round: about one hit in seven
  // wounds instead of killing, and a wounded man is not a kill until somebody
  // finishes him -- so a ladder pinned to exact values per shot is a check with
  // a one-in-seven wrong answer.
  check('killing from a spot they have not left raises the pressure, one a kill',
    camp.ladder[0] === 1
      && camp.ladder.every((v, i) => i === 0 || v >= camp.ladder[i - 1])
      && camp.ladder[camp.ladder.length - 1] >= 3,
    JSON.stringify(camp.ladder));
  check('and it caps, so patience is never punished into a loss',
    camp.ladder[5] === camp.ladder[6], JSON.stringify(camp.ladder));
  check('camping brings them sooner and makes them hear further',
    camp.spawnRatio < 0.8 && camp.hearRatio > 1.2, JSON.stringify(camp));
  check('and moving is what relieves it, because moving is the point',
    camp.travelled > 200 && camp.after === 0,
    `${camp.after} left after marching ${camp.travelled}px`);

  // --- 100/L1+L2: heard before seen, and the head turns without the feet
  await toMenu();
  await enter('not-a-sound');
  const heard = await page.evaluate(() => {
    const g = window.game, w = g.world;
    const e = w.enemies[0];
    const s = w.soldiers[0];
    // Blinded on purpose: what is measured is hearing, not sight. Every *other*
    // enemy is put out of the county too -- one of them seeing the walker
    // raises a real alarm at his position, which reaches the man under test and
    // sends him, so the glance never gets a chance to be the thing observed.
    for (const o of w.enemies) if (o !== e) { o.alive = false; }
    e.stats.aggroRadius = 4;
    e.state = 0; e.glance = null; e.target = null;
    const home = { ...e.pos };
    s.pos.x = e.pos.x + 100; s.pos.y = e.pos.y; s.prev.x = s.pos.x - 3;
    let glanced = false, err = null, drift = 0;
    let mark = null;
    for (let i = 0; i < 60 * 2; i++) {
      // The noise comes from the *fastest* man, so the rest have to be held
      // still every step -- parked off in a corner they steer back toward the
      // squad, become the loudest, and raise the notice four thousand pixels
      // from the enemy under test. Which made this pass or fail by luck.
      for (const o of w.soldiers) {
        if (o === s) continue;
        o.pos.x = e.pos.x + 4000; o.prev.x = o.pos.x;
        o.vel.x = 0; o.vel.y = 0;
      }
      s.vel.x = 60; s.vel.y = 0;
      g.step(1 / 60);
      if (e.glance) {
        glanced = true;
        // Measured from where the glance *started*, not from where he was two
        // seconds ago: up to a footstep interval of ordinary idle fidgeting
        // happens before anybody hears anything, and that is not a step taken
        // because of the noise.
        if (!mark) mark = { x: e.pos.x, y: e.pos.y };
        drift = Math.max(drift, Math.hypot(e.pos.x - mark.x, e.pos.y - mark.y));
        const to = Math.atan2(s.pos.y - e.pos.y, s.pos.x - e.pos.x);
        err = Math.abs(Math.atan2(Math.sin(e.angle - to), Math.cos(e.angle - to))) * 180 / Math.PI;
      }
    }
    void home;
    return { glanced, err: err === null ? null : +err.toFixed(1), drift: +drift.toFixed(1), state: e.state };
  });
  check('a walking squad is heard by a man who cannot see it', heard.glanced, JSON.stringify(heard));
  check('and he turns to face it, exactly, rather than approximately',
    heard.err !== null && heard.err < 8, `${heard.err}deg`);
  check('but he does not take a step, and it is not an alarm',
    heard.drift < 2 && heard.state === 0, JSON.stringify(heard));

  const twice = await page.evaluate(() => {
    const g = window.game, w = g.world;
    const e = w.enemies[0];
    const s = w.soldiers[0];
    for (const o of w.enemies) if (o !== e) { o.alive = false; }
    e.stats.aggroRadius = 4; e.state = 0; e.glance = null; e.target = null;
    s.pos.x = e.pos.x + 100; s.pos.y = e.pos.y; s.prev.x = s.pos.x - 3;
    // One footfall's worth, then silence: the look has to end on its own.
    for (let i = 0; i < 60; i++) {
      for (const o of w.soldiers) {
        if (o === s) continue;
        o.pos.x = e.pos.x + 4000; o.prev.x = o.pos.x; o.vel.x = 0; o.vel.y = 0;
      }
      s.vel.x = 60;
      g.step(1 / 60);
    }
    const during = !!e.glance;
    for (let i = 0; i < 60 * 4; i++) { s.vel.x = 0; s.pos.x = e.pos.x + 4000; s.prev.x = s.pos.x; g.step(1 / 60); }
    return { during, after: !!e.glance };
  });
  check('a glance is a beat, not a state -- it ends by itself',
    twice.during && !twice.after, JSON.stringify(twice));

  // --- 100/K: every transition passes through black, and black covers the lot
  //
  // The fade used to be a `fillRect` on the canvas, so the battlefield went out
  // and the sidebar stayed lit beside it. The sidebar is DOM outside the canvas
  // and nothing painted in there could ever reach it.
  await toMenu();
  const blackout = () => page.evaluate(
    () => +getComputedStyle(document.getElementById('blackout')).opacity);
  await enterUnbriefed('chicken-run');
  check('a mission opens on black, whichever way you arrived at it',
    (await blackout()) > 0.95, String(await blackout()));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  check('and comes up out of it once the briefing is away',
    (await blackout()) < 0.05, String(await blackout()));

  await page.evaluate(() => {
    [...document.querySelectorAll('.debug-btn')].find((n) => n.textContent.trim() === 'win').click();
    for (let i = 0; i < 200; i++) window.game.step(1 / 60);
  });
  await page.waitForTimeout(2600);
  const ending = await page.evaluate(() => {
    const b = document.getElementById('blackout');
    const hud = document.getElementById('hud');
    const overlay = document.getElementById('overlay');
    const z = (el) => Number(getComputedStyle(el).zIndex) || 0;
    return {
      opacity: +getComputedStyle(b).opacity,
      // The sidebar must be *under* the black and the panel *over* it, or the
      // ending is either half-lit or invisible. Both have been true in turn.
      sidebarUnder: z(hud) < z(b),
      panelOver: z(overlay) > z(b),
      panelUp: !overlay.hidden,
    };
  });
  check('the whole screen goes out at the end, sidebar included',
    ending.opacity > 0.95 && ending.sidebarUnder, JSON.stringify(ending));
  check('and the results arrive on the black rather than under it',
    ending.panelOver && ending.panelUp, JSON.stringify(ending));

  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  const handover = await page.evaluate(() => ({
    map: window.game?.world?.map?.name ?? '(none)',
    opacity: +getComputedStyle(document.getElementById('blackout')).opacity,
    briefing: !document.getElementById('overlay').hidden,
  }));
  check('and the next mission is handed over without the screen coming back first',
    handover.map === 'River Run' && handover.opacity > 0.95 && handover.briefing,
    JSON.stringify(handover));

  await browser.close();

  if (errors.length) {
    console.error(`\n  ${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 8)) console.error(`   ! ${e}`);
  }
  console.log(`\n  ${passed} passed, ${failures.length} failed`);
  if (failures.length || errors.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
