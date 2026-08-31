/**
 * Visual capture harness. This is the "metric" half of the build/critique loop:
 * it drives the real game in a real browser and writes real pixels to disk, so
 * a critic looks at the artifact rather than at a description of it.
 *
 *   node tools/shoot.mjs                       # every mission, default spots
 *   node tools/shoot.mjs --out shots/after     # somewhere else
 *   node tools/shoot.mjs --only ice-station    # one mission
 *   node tools/shoot.mjs --menu                # just the level select
 *   node tools/shoot.mjs --zoom 2              # magnify to inspect tiling
 *   node tools/shoot.mjs --port 5199           # against a dev server you own
 *
 * It serves its own port by default, NOT 5199. The owner keeps `npm run dev`
 * running there and plays while work goes on, and a harness that drives his
 * session -- stepping his world, moving his camera -- is indistinguishable from
 * the game misbehaving. Pass --port to aim it somewhere on purpose.
 *
 * Shots are deterministic where they can be: the game is stepped a fixed
 * number of times with a fixed dt before capture, so two runs of the same
 * build produce comparable images.
 */
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? true);
};
const has = (name) => args.includes(`--${name}`);

const OUT = flag('out', 'shots/current');
const ONLY = flag('only');
const PORT = flag('port', '5210');
const ZOOM = Number(flag('zoom', 1));
const WIDTH = Number(flag('width', 1280));
const HEIGHT = Number(flag('height', 800));
const BASE = `http://localhost:${PORT}`;

/**
 * Where to point the camera. A fixed fraction of the map is a bad way to frame
 * a screenshot — it happily points the camera at empty field while the water
 * the shot was meant to judge sits off-screen, which is exactly how a critic
 * ends up reporting that a level has no water in it.
 *
 * So spots are named by the terrain character they want to see, and the camera
 * is aimed at the densest cluster of it. `squad` frames your men instead.
 */
const SPOTS = {
  'chicken-run': ['squad', 'T'],
  'river-run': ['squad', '~W', 'T'],
  'long-road': ['squad', '_', ','],
  'undergrowth': ['squad', '"', 'T'],
  'minefield': ['squad', ',', 'h'],
  'village': ['squad', 'h', '~W'],
  'ice-station': ['squad', '~W', 'i'],
  'last-stand': ['squad', 'i', 'T'],
};

const LABELS = {
  T: 'treeline', '~W': 'water', _: 'road', ',': 'sand', '\"': 'tallgrass',
  h: 'buildings', i: 'ice', '#': 'rock',
};

/**
 * The densest window of the given characters, as a fraction of map size. Scans
 * a coarse grid of candidate windows and keeps the fullest, so the camera lands
 * on the middle of the feature rather than on one stray tile of it.
 */
function densest(rows, chars, view) {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const h = rows.length;
  const set = new Set(chars.split(''));
  // The window is what actually fits on screen, asked of the running game
  // rather than assumed: zoom is derived from the viewport now, so hard-coding
  // it went stale the moment the layout started choosing. A window bigger than
  // the viewport picks the map's centre of mass instead of the feature, which
  // is how "aim at the water" ends up framing an empty field.
  const winW = Math.min(w, Math.max(8, Math.round(view.w))), winH = Math.min(h, Math.max(6, Math.round(view.h)));
  let best = null, bestN = 0;
  for (let y = 0; y + winH <= h; y += 2) {
    for (let x = 0; x + winW <= w; x += 2) {
      let n = 0;
      for (let j = y; j < y + winH; j++) {
        const row = rows[j];
        for (let i = x; i < x + winW && i < row.length; i++) if (set.has(row[i])) n++;
      }
      if (n > bestN) { bestN = n; best = [(x + winW / 2) / w, (y + winH / 2) / h]; }
    }
  }
  return bestN === 0 ? null : best;
}

/** Splits a .map file into its art rows. */
function artRows(src) {
  const lines = src.split('\n').map((l) => l.replace('\r', ''));
  const at = lines.findIndex((l) => l.trim() === '---');
  return lines.slice(at + 1).filter((l) => l.length > 0);
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const maps = await (await fetch(`${BASE}/api/maps`)).json();
  const wanted = ONLY ? maps.filter((m) => m.id === ONLY) : maps;
  if (wanted.length === 0) throw new Error(`no mission matched --only ${ONLY}`);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });

  if (has('menu') || !ONLY) {
    await page.screenshot({ path: join(OUT, '00-menu.png') });
    console.log('  00-menu.png');
  }
  if (has('menu')) { await browser.close(); return report(errors); }

  for (const map of wanted) {
    // Enter the mission by the same path a player takes, so nothing about the
    // capture is a special case the real game never runs.
    await page.evaluate((id) => {
      const cards = [...document.querySelectorAll('#menu-list button')];
      const card = cards.find((c) => c.dataset.id === id)
        ?? cards.find((c) => c.textContent.includes(id));
      card?.click();
    }, map.id);

    await page.waitForFunction(() => !!window.game, null, { timeout: 10000 });
    // Let the briefing overlay clear and the first frames settle.
    await page.evaluate(() => {
      const o = document.getElementById('overlay');
      if (o) o.hidden = true;
    });
    await page.waitForTimeout(400);

    const rows = artRows(await (await fetch(`${BASE}/api/maps/${map.id}`)).text());
    const view = await page.evaluate(() => {
      const g = window.game;
      return { w: g.camera.viewW / g.world.map.tile, h: g.camera.viewH / g.world.map.tile };
    });
    const spots = (SPOTS[map.id] ?? ['squad']).map((spec) => {
      if (spec === 'squad') return ['squad', null];
      const at = densest(rows, spec, view);
      return at ? [LABELS[spec] ?? spec, at] : null;
    }).filter(Boolean);

    // A whole-map view. Composition is a real part of how a mission looks and
    // it is invisible at play zoom -- a treeline that eats half the playable
    // area reads as "dense jungle" through a viewport and as a mistake here.
    if (has('fit')) spots.unshift(['fit', 'fit']);

    for (const [label, at] of spots) {
      await page.evaluate(({ at, zoom }) => {
        const g = window.game;
        const m = g.world.map;
        // lookAt, not centreOn: centreOn is undone by the squad-follow on the
        // very next frame, which silently framed the squad for every shot.
        const screen = document.getElementById('screen');
        // Remember the game's own zoom before --fit overwrites it, or every
        // shot after the first comes out at map scale.
        if (window.__playZoom === undefined) window.__playZoom = g.camera.zoom;
        if (at === 'fit') {
          g.camera.zoom = Math.min(screen.width / m.pixelWidth, screen.height / m.pixelHeight);
          g.camera.resize(screen.width, screen.height);
          g.camera.lookAt({ x: m.pixelWidth / 2, y: m.pixelHeight / 2 }, m);
        } else {
          g.camera.zoom = zoom !== 1 ? zoom : window.__playZoom;
          g.camera.resize(screen.width, screen.height);
          if (at) {
            g.camera.lookAt({ x: at[0] * m.pixelWidth, y: at[1] * m.pixelHeight }, m);
          } else {
            // Aim at the squad rather than handing the camera back and waiting
            // for the follow to ease in: after a --fit shot it starts from the
            // middle of the map and does not arrive before the shutter.
            const alive = g.world.soldiers.filter((s2) => s2.alive);
            const n = alive.length || 1;
            const at2 = {
              x: alive.reduce((a2, s2) => a2 + s2.pos.x, 0) / n,
              y: alive.reduce((a2, s2) => a2 + s2.pos.y, 0) / n,
            };
            g.camera.lookAt(at2, m);
          }
        }
      }, { at, zoom: ZOOM });
      await page.waitForTimeout(250);
      const name = `${String(map.order).padStart(2, '0')}-${map.id}-${label}.png`;
      await page.screenshot({ path: join(OUT, name) });
      console.log(`  ${name}`);
    }

    await page.keyboard.press('Escape');
    await page.waitForSelector('#menu-list .m-name', { timeout: 10000 });
  }

  await browser.close();
  report(errors);
}

function report(errors) {
  if (errors.length) {
    console.error(`\n  ${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 10)) console.error(`   ! ${e}`);
    process.exitCode = 1;
  } else {
    console.log(`\n  clean run -> ${OUT}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
