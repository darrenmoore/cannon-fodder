/**
 * Moment capture. Round zero of the presentation loop.
 *
 * `shoot.mjs` frames *missions*: it points the camera at terrain and takes a
 * picture of a standing world. Batch H is not about standing worlds. It is
 * about a banner flying up, an explosion three frames in, a plate at four
 * times size and a screen that is supposed to be entirely black -- none of
 * which that harness has any way to reach, and none of which can be judged
 * from a description.
 *
 * So this is the metric before there is anything to measure. Each moment is a
 * named recipe: put the world into a known state, advance an exact number of
 * *simulation* steps, and photograph the result.
 *
 *   node tools/moment.mjs --list
 *   node tools/moment.mjs                        # every moment
 *   node tools/moment.mjs win explosion          # a couple
 *   node tools/moment.mjs --out shots/round-1
 *   node tools/moment.mjs --port 5199            # a dev server you own
 *
 * ## Why the steps are counted rather than timed
 *
 * `debug.paused` freezes the simulation and leaves the draw running, so the
 * harness advances the world by hand: `--at 3` is three frames after the
 * detonation, on every machine, every run. Waiting fifty milliseconds and
 * hoping is how two runs of the same build produce different pictures and an
 * argument about whether anything changed.
 *
 * ## And why every capture reports what it saw
 *
 * docs/loop.md: *a metric that can lie will eventually be believed*. The
 * capture tool in that run was wrong twice and produced confident, detailed,
 * entirely false critiques both times. So every moment here asserts something
 * about the state it captured -- the phase, whether the overlay is up, how many
 * men are alive, how many explosion particles are on screen -- and prints it
 * beside the filename. If the assertion fails the shot is still written and
 * loudly marked SUSPECT, because a wrong picture you know is wrong is worth
 * something and a wrong picture you trust is worth less than nothing.
 *
 * Nothing here is judged by the session that built it. Hand the frames to
 * `/grill` or run the whole thing under `/gauntlet`.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
/** Flags that take a value, so their value is not mistaken for a moment name. */
const VALUED = ['out', 'port', 'width', 'height'];
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? true);
};
const has = (name) => args.includes(`--${name}`);
const consumed = new Set();
args.forEach((a, i) => {
  if (a.startsWith('--')) {
    consumed.add(i);
    if (VALUED.includes(a.slice(2))) consumed.add(i + 1);
  }
});

const OUT = flag('out', 'shots/moments');
const PORT = flag('port', '5210');
const WIDTH = Number(flag('width', 1280));
const HEIGHT = Number(flag('height', 800));
const BASE = `http://localhost:${PORT}`;
const wanted = args.filter((a, i) => !consumed.has(i));

/* ------------------------------------------------------------ page helpers */

/**
 * Everything the recipes need inside the page, injected as a prelude.
 *
 * `settle` is the one that is not obvious. The renderer interpolates between
 * the previous and current state, so a frame captured straight after a manual
 * step lands somewhere between the two and moves slightly from run to run.
 * Collapsing prev onto pos pins it.
 */
const PRELUDE = `
  const g = window.game;
  const w = g.world;
  const m = w.map;
  const T = m.tile;
  const px = (t) => (t + 0.5) * T;
  const at = (x, y) => m.grid[y * m.width + x];
  const step = (n) => { for (let i = 0; i < n; i++) g.step(1 / 60); };
  const settle = () => {
    for (const a of w.actors) { a.prev.x = a.pos.x; a.prev.y = a.pos.y; }
    for (const h of w.hostages) { h.prev.x = h.pos.x; h.prev.y = h.pos.y; }
  };
  const look = (p, zoom) => {
    const c = g.camera;
    if (zoom) {
      c.zoom = zoom;
      const cv = document.querySelector('canvas');
      c.resize(cv.width, cv.height);
    }
    c.centreOn(p, m);
  };
`;

const run = (page, body) => page.evaluate(`(() => { ${PRELUDE}\n${body} })()`);

/* ---------------------------------------------------------------- the moments
 *
 * `setup` arranges the world and advances it. `check` runs *after* the frame
 * has been drawn and photographed, and reports what was actually on screen;
 * `expect` turns that into a verdict. The order matters and was wrong first
 * time: reading the state at the end of `setup` asks the game what it looks
 * like before it has had a frame to look like anything, which reported "no end
 * panel" over a picture that had one coming. `target` picks what is
 * photographed: the canvas, the sidebar, or the whole page.
 */
const MOMENTS = [
  {
    name: 'win',
    gap: '1 -- the phase-complete moment, over the battlefield',
    mission: 'chicken-run',
    target: 'page',
    // Settled but before the results panel is allowed over it, which is the
    // frame the reference shows: the game finished, and not yet a menu.
    note: 'The end-of-phase banner at rest, with the battlefield still behind it.',
    setup: `
      w.soldiers[4].alive = false; w.soldiers[5].alive = false;
      w.phase = 1; w.phaseTime = 0;
      step(72); settle(); step(1);
`,
    check: `
      return {
        phase: w.phase,
        phaseTime: Number(w.phaseTime.toFixed(2)),
        panelUp: !document.getElementById('overlay').hidden,
        alive: w.soldiers.filter((s) => s.alive).length,
      };`,
    expect: (s) => (s.phase === 1 && s.phaseTime > 1 && !s.panelUp && s.alive === 4
      ? null : `expected a settled banner with no panel over it, saw ${JSON.stringify(s)}`),
  },
  {
    name: 'win-panel',
    gap: '2 -- the end panel is a DOM card where the reference is full black',
    mission: 'chicken-run',
    target: 'page',
    note: 'What arrives after the banner has had its moment.',
    setup: `
      w.soldiers[4].alive = false; w.soldiers[5].alive = false;
      w.phase = 1; w.phaseTime = 0;
      step(180); settle(); step(1);
`,
    check: `
      return {
        phase: w.phase,
        panelUp: !document.getElementById('overlay').hidden,
        text: (document.getElementById('overlay-card').textContent || '').slice(0, 60),
      };`,
    expect: (s) => (s.phase === 1 && s.panelUp
      ? null : `expected the results panel up, saw ${JSON.stringify(s)}`),
  },
  {
    name: 'lose',
    gap: '2 -- the end panel is a DOM card where the reference is full black',
    mission: 'chicken-run',
    target: 'page',
    note: 'The other end of the same panel.',
    setup: `
      for (const s of w.soldiers) { s.alive = false; }
      w.phase = 2; w.phaseTime = 0;
      step(180); settle(); step(1);
`,
    check: `
      return {
        phase: w.phase,
        overlay: !document.getElementById('overlay').hidden,
        text: (document.getElementById('overlay-card').textContent || '').slice(0, 60),
      };`,
    expect: (s) => (s.phase === 2 && s.overlay
      ? null : `expected a lost mission with the panel up, saw ${JSON.stringify(s)}`),
  },
  {
    name: 'briefing',
    gap: '2/5 -- the mission card, and both type systems in one frame',
    mission: 'chicken-run',
    target: 'page',
    dismiss: false,
    note: 'Canvas pixel font behind, operating-system monospace in front.',
    setup: `
`,
    check: `
      return {
        overlay: !document.getElementById('overlay').hidden,
        text: (document.getElementById('overlay-card').textContent || '').slice(0, 40),
      };`,
    expect: (s) => (s.overlay ? null : 'the briefing was not up'),
  },
  /*
   * The comms panel, twice: mid-sentence and after it.
   *
   * These two are the only check in the project that the *mouth* works, and
   * they have to assert rather than photograph. The harness freezes the
   * simulation, but the panel runs on wall-clock timers -- the entrance, the
   * typing and the mouth are all `setInterval` -- so a screenshot taken at the
   * wrong moment shows a plausible panel and proves nothing about the loop.
   *
   * `dataset.frame`, written by ui/comms.ts on every tick, is what makes it
   * checkable: a talking frame is any index above 0, and index 0 is the idle
   * face from the sheet's other row.
   */
  {
    name: 'comms-typing',
    gap: 'the comms panel: plate, bezel and the mouth mid-sentence',
    mission: 'chicken-run',
    target: 'viewport',
    dismiss: true,
    note: 'Caught while the line is still typing, so the mouth is mid-loop.',
    setup: `
      await new Promise((r) => setTimeout(r, 3000 + 260 + 22 * 35));`,
    check: `
      const el = document.getElementById('comms');
      const line = el && el.querySelector('.comms-line');
      const face = el && el.querySelector('.comms-face');
      return {
        in: !!(el && el.classList.contains('in')),
        typed: line ? line.textContent.length : 0,
        frame: face ? Number(face.dataset.frame) : -1,
      };`,
    expect: (s) => (s.in && s.typed > 4 && s.frame > 0
      ? null : `expected a panel mid-type on a talking frame, saw ${JSON.stringify(s)}`),
  },
  {
    name: 'comms-rest',
    gap: 'the comms panel: the mouth back at rest once the line has finished',
    mission: 'chicken-run',
    target: 'viewport',
    dismiss: true,
    note: 'After the last character. This is the proof the loop stops.',
    setup: `
      await new Promise((r) => setTimeout(r, 9000));`,
    check: `
      const el = document.getElementById('comms');
      const face = el && el.querySelector('.comms-face');
      return { frame: face ? Number(face.dataset.frame) : -1 };`,
    expect: (s) => (s.frame === 0
      ? null : `expected the mouth back at the idle frame, saw ${JSON.stringify(s)}`),
  },
  // Three stages of one blast, which is the whole of gap 3: the reference is a
  // dithered sprite scattered at several stages, and ours is particles that
  // only ever look like particles.
  ...[1, 4, 10].map((frames) => ({
    name: `explosion-${String(frames).padStart(2, '0')}`,
    gap: '3 -- explosions are particles where the reference is a dithered sprite',
    mission: 'test-shooting',
    target: 'canvas',
    zoom: 4,
    note: `${frames} simulation frame${frames === 1 ? '' : 's'} after detonation.`,
    setup: `
      const c = { x: w.soldiers[0].pos.x + 90, y: w.soldiers[0].pos.y };
      // Out of its own blast, so this photographs the explosion and not six
      // men being thrown across the frame by it.
      for (const s of w.soldiers) { s.pos.x = c.x - 260; s.prev.x = s.pos.x; }
      w.grenades.push({ pos: { ...c }, prev: { ...c }, from: { ...c }, to: { ...c },
        t: 0.999, duration: 0.6, faction: 0 });
      step(1);                       // the frame it goes off
      step(${frames - 1});
      settle();
      look(c, 4);
      step(1);
      `,
    check: `
      // The oldest particle's remaining life is what proves these three frames
      // are three different frames rather than the same one photographed thrice.
      const oldest = w.fx.particles.reduce((a, p) => Math.min(a, p.life), Infinity);
      return {
        particles: w.fx.particles.length,
        grenades: w.grenades.length,
        oldest: Number.isFinite(oldest) ? Number(oldest.toFixed(3)) : null,
      };`,
    expect: (s) => (s.grenades === 0 && s.particles > 0 && s.oldest !== null
      ? null : `expected a detonated grenade with particles left, saw ${JSON.stringify(s)}`),
  })),
  {
    name: 'grenade-in-flight',
    gap: '3 -- a thrown grenade should be legible from the moment it leaves the hand',
    mission: 'test-shooting',
    target: 'canvas',
    zoom: 4,
    note: 'Mid-arc, halfway to the target.',
    setup: `
      const from = { ...w.soldiers[0].pos };
      const to = { x: from.x + 150, y: from.y - 40 };
      w.grenades.push({ pos: { ...from }, prev: { ...from }, from: { ...from }, to: { ...to },
        t: 0.5, duration: 0.6, faction: 0 });
      step(1); settle();
      look({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 4);
      step(1);
      `,
    check: `
      return { grenades: w.grenades.length, t: Number((w.grenades[0]?.t ?? -1).toFixed(2)) };`,
    expect: (s) => (s.grenades === 1 && s.t > 0.4 && s.t < 0.8
      ? null : `expected one grenade mid-arc, saw ${JSON.stringify(s)}`),
  },
  {
    name: 'plates',
    gap: '4 -- the name plates lost their rank chevrons',
    mission: 'chicken-run',
    target: 'hud',
    note: 'The sidebar. The reference flanks each name with gold chevrons, varying in number per man.',
    setup: `
      // Ranks spread across the tiers, so a chevron count would have something
      // to count. Two dead, because a plate has two states.
      w.soldiers.forEach((s, i) => { s.rank = [0, 1, 3, 6, 11, 20][i] ?? 0; });
      w.soldiers[3].alive = false;
      step(4); settle(); step(1);
      `,
    check: `
      return {
        ranks: w.soldiers.map((s) => s.rank),
        dead: w.soldiers.filter((s) => !s.alive).length,
        plates: document.querySelectorAll('.hud-roster .ui-plate-label').length,
      };`,
    expect: (s) => (s.dead === 1 && s.ranks.length === 6 && s.plates === 6
      ? null : `expected six plates with one man down, saw ${JSON.stringify(s)}`),
  },
  {
    name: 'men',
    gap: '7 -- the bazooka man carries a rifle as far as the eye can tell',
    mission: 'test-shooting',
    target: 'canvas',
    zoom: 8,
    note: 'Left to right: soldier, rifleman, sniper, bazookateer. Same ground, same facing.',
    // Conjured through the debug panel's own buttons rather than by reaching
    // for `makeEnemy`: it is the supported way to get a man of a chosen kind,
    // and going round it would give this harness its own idea of what an
    // enemy is -- which is precisely the sort of lie the tool exists to avoid.
    buttons: ['+rifle', '+sniper', '+bazooka'],
    setup: `
      const y = w.soldiers[0].pos.y;
      const x0 = w.soldiers[0].pos.x + 40;
      w.soldiers.forEach((s, i) => {
        s.alive = i === 0;
        s.pos.x = x0; s.pos.y = y; s.prev.x = s.pos.x; s.prev.y = s.pos.y; s.angle = 0;
      });
      // The three just spawned are the last three in the list; anything the
      // mission started with is cleared out from in front of the camera.
      const fresh = w.enemies.slice(-3);
      w.enemies.length = 0;
      w.enemies.push(...fresh);
      w.actors.length = 0;
      w.actors.push(w.soldiers[0], ...fresh);
      fresh.forEach((e, i) => {
        e.alive = true;
        e.pos.x = x0 + 26 + i * 26; e.pos.y = y;
        e.prev.x = e.pos.x; e.prev.y = e.pos.y;
        e.angle = 0; e.vel.x = 0; e.vel.y = 0;
      });
      // Nobody fires: this frame's entire job is whether the four silhouettes
      // read as four different weapons, and a muzzle flash on one of them is
      // exactly the kind of accident that answers the question for the critic.
      w.soldiers[0].fireCooldown = 999;
      for (const e of fresh) e.fireCooldown = 999;
      w.bullets.length = 0;
      w.fx.particles.length = 0;
      settle();
      look({ x: x0 + 40, y }, 8);
      step(1);
      w.bullets.length = 0;
      settle();
      `,
    check: `
      return { kinds: w.enemies.map((e) => e.kind), alive: w.soldiers.filter((s) => s.alive).length };`,
    expect: (s) => (s.kinds.length === 3 && new Set(s.kinds).size === 3 && s.alive === 1
      ? null : `expected one of each enemy kind beside one soldier, saw ${JSON.stringify(s)}`),
  },
  {
    name: 'shoreline',
    gap: '6 -- sand and water are washed out against the reference',
    mission: 'village',
    target: 'canvas',
    zoom: 4,
    note: 'The sand/water boundary, where the reference is vivid orange against navy. '
      + 'Jungle, because neither desert map has a drop of water on it -- see desert-ground.',
    setup: `
      // The densest sand-beside-water tile on the map, found rather than
      // guessed: aiming at a fraction of the map is how a shot of "the water"
      // ends up being a shot of an empty field.
      let best = null, bestScore = -1;
      for (let y = 2; y < m.height - 2; y++) {
        for (let x = 2; x < m.width - 2; x++) {
          let sand = 0, water = 0;
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              const t = at(x + dx, y + dy);
              if (t === 1) sand++;
              if (t === 3 || t === 7) water++;
            }
          }
          const score = Math.min(sand, water);
          if (score > bestScore) { bestScore = score; best = { x, y }; }
        }
      }
      window.__moment = { found: false };
      if (!best) return;
      settle();
      look({ x: px(best.x), y: px(best.y) }, 4);
      step(1);
      window.__moment = { found: true, tile: best, mix: bestScore };`,
    check: 'return window.__moment;',
    expect: (s) => (s.found && s.mix >= 6
      ? null : `expected a shoreline with sand and water in the same window, saw ${JSON.stringify(s)}`),
  },
  {
    name: 'desert-ground',
    gap: '6 -- the desert palette, with the caveat that its half of the gap cannot be shot',
    mission: 'long-road',
    target: 'canvas',
    zoom: 4,
    note: 'Desert sand at four times size. The reference gap is sand *against water*, and '
      + 'neither desert map has any: gap 6 as written cannot be photographed from this '
      + 'campaign, and closing it would need a map with a desert shoreline on it.',
    setup: `
      let best = null, bestScore = -1;
      for (let y = 3; y < m.height - 3; y++) {
        for (let x = 3; x < m.width - 3; x++) {
          let sand = 0;
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) if (at(x + dx, y + dy) === 1) sand++;
          }
          if (sand > bestScore) { bestScore = sand; best = { x, y }; }
        }
      }
      settle();
      look({ x: px(best.x), y: px(best.y) }, 4);
      step(1);
      let water = 0;
      for (let i = 0; i < m.grid.length; i++) if (m.grid[i] === 3 || m.grid[i] === 7) water++;
      window.__moment = { sand: bestScore, waterOnMap: water };`,
    check: 'return window.__moment;',
    expect: (s) => (s.sand >= 20 && s.waterOnMap === 0
      ? null : `expected a solid patch of sand on a waterless map, saw ${JSON.stringify(s)}`),
  },
];

/* --------------------------------------------------------------------- main */

async function main() {
  if (has('list')) {
    for (const mo of MOMENTS) console.log(`  ${mo.name.padEnd(16)} ${mo.gap}`);
    return;
  }

  const picked = wanted.length ? MOMENTS.filter((mo) => wanted.includes(mo.name)) : MOMENTS;
  if (picked.length === 0) {
    console.error(`no moment matched. Known: ${MOMENTS.map((m) => m.name).join(', ')}`);
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const report = [];
  let suspect = 0;

  for (const mo of picked) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    /*
     * Get past the front screen if it is up.
     *
     * A clean Playwright profile has no saved progress, so the app opens on the
     * front rather than on the mission list -- which this tool used to walk
     * straight into, and then time out waiting for a menu that was never going
     * to appear. Nothing to do with the moment being captured; it failed
     * identically for every one of them.
     */
    await page.evaluate(() => {
      const front = document.getElementById('front');
      if (!front || front.hidden) return;
      const btns = [...front.querySelectorAll('.fx-btn')];
      const pick = btns.find((b) => /LEVEL SELECT/i.test(b.textContent || '')) ?? btns[0];
      pick?.click();
    });
    await page.waitForTimeout(600);
    await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });
    const listed = await page.$(`#menu-list button[data-id="${mo.mission}"]`);
    if (!listed) {
      console.log(`  SKIP ${mo.name} -- ${mo.mission} is not in this build's mission list`);
      continue;
    }
    await listed.click();
    await page.waitForFunction(() => !!window.game, null, { timeout: 10000 });
    await page.waitForTimeout(350);

    if (mo.dismiss !== false) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }

    /*
     * Freeze first, so everything after this is counted rather than timed.
     *
     * Whether this is a dev build is asked of the DOM rather than of a global.
     * `__DEV__` is substituted inside the bundle and index.html declares a
     * `false` of the same name for the page, so reading it from here answers a
     * different question and answers it wrong -- which is what the first run of
     * this tool did, on every single frame.
     */
    const frozen = await page.evaluate(() => {
      const panel = document.querySelector('.debug-panel');
      if (!panel) return false;
      const btn = [...panel.querySelectorAll('.debug-btn')].find((b) => b.textContent === 'freeze');
      if (!btn) return false;
      btn.click();
      return true;
    });

    for (const label of mo.buttons ?? []) {
      await page.evaluate((want) => {
        [...document.querySelectorAll('.debug-btn')].find((b) => b.textContent === want)?.click();
      }, label);
    }

    // The panel comes out of the picture once it has done its job. It is
    // furniture this harness added, it is not in the game a player sees, and
    // leaving it in gives a critic something to notice that nobody is asking
    // about -- with `freeze` lit green, announcing that the frame was staged.
    await page.evaluate(() => {
      // Inline, not `hidden`: `.debug-panel` sets `display: flex`, which beats
      // the user agent's `[hidden]` rule on specificity.
      const panel = document.querySelector('.debug-panel');
      if (panel) panel.style.display = 'none';
    });

    await run(page, mo.setup);
    // Three animation frames, so the loop has drawn the arranged world and the
    // HUD has had a tick to react to it -- the end-of-mission panel is raised
    // from the step callback, not from the world.
    await page.evaluate(() => new Promise((r) => {
      let n = 3;
      const tick = () => (--n > 0 ? requestAnimationFrame(tick) : r());
      requestAnimationFrame(tick);
    }));

    const file = join(OUT, `${mo.name}.png`);
    const shot = mo.target === 'canvas' ? page.locator('canvas')
      : mo.target === 'hud' ? page.locator('#hud')
        : mo.target === 'viewport' ? page.locator('#viewport')
          : page;
    await shot.screenshot({ path: file });

    // Read after the shot, so what is reported is what was photographed.
    // Nothing moves in between: the simulation is frozen.
    const state = await run(page, mo.check);

    const problem = mo.expect(state) ?? (frozen ? null : 'the build is not a dev build, so nothing could be frozen');
    if (problem) suspect++;
    console.log(`  ${problem ? 'SUSPECT' : 'ok     '} ${mo.name.padEnd(16)} ${problem ?? JSON.stringify(state)}`);
    report.push({ name: mo.name, gap: mo.gap, note: mo.note, file, state, problem });
  }

  await browser.close();

  // The sidecar is the point as much as the pictures are: a frame with no
  // record of what it claimed to show is a frame nobody can check later.
  const lines = [
    '# Moment captures',
    '',
    `Taken from ${BASE} at ${new Date().toISOString()}.`,
    '',
    'Each frame is one of Batch H\'s ranked gaps, photographed as it stands today.',
    'The state column is what the game reported at the instant of capture -- read it',
    'before believing the picture.',
    '',
    ...report.flatMap((r) => [
      `## ${r.name}`,
      '',
      `- gap: ${r.gap}`,
      `- ${r.note}`,
      `- state at capture: \`${JSON.stringify(r.state)}\``,
      r.problem ? `- **SUSPECT: ${r.problem}**` : '- verified',
      '',
      `![${r.name}](${r.name}.png)`,
      '',
    ]),
  ];
  await writeFile(join(OUT, 'README.md'), lines.join('\n'), 'utf8');

  if (errors.length) {
    console.error(`\n  ${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 6)) console.error(`   ! ${e}`);
  }
  console.log(`\n  ${report.length} moment(s) -> ${OUT}${suspect ? `, ${suspect} SUSPECT` : ''}`);
  if (suspect || errors.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
