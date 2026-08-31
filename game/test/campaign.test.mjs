/**
 * Assertions over the meta-game, run by `npm run check`.
 *
 * The campaign is the second piece of game logic with no DOM dependency, so
 * like the map parser it is worth testing directly rather than through a
 * browser. It is also the piece where a bug is *silent*: a mis-promoted rank or
 * a reissued name does not throw, it just quietly undoes the reason the roster
 * exists. Nothing here needs a canvas, so nothing here should need Playwright.
 *
 * The bundle is browser-targeted ESM, so the module is compiled on the fly with
 * esbuild rather than importing the .ts directly.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// campaign.ts reaches for localStorage at module scope only inside functions,
// but it reaches for it on every save -- so it needs to exist before import.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const built = await esbuild.build({
  entryPoints: [join(ROOT, 'src', 'campaign.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  logLevel: 'silent',
});
const {
  deploy, loadCampaign, nextPromotionIn, rankShort, rankTier,
  recordMission, renameTrooper, resetCampaign, sanitiseName,
} = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
);

let run = 0;
const test = (name, fn) => {
  run++;
  try {
    store.clear();
    fn();
  } catch (e) {
    console.error(`  FAIL ${name}\n    ${e.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ok   ${name}`);
};

/** A fresh campaign with six men deployed, as a mission would leave it. */
const fresh = () => {
  const state = resetCampaign();
  return { state, squad: deploy(state, 6) };
};

const win = (state, squad, over = {}) => recordMission(state, {
  won: true,
  missionId: 'chicken-run',
  missionName: 'Chicken Run',
  difficulty: 'regular',
  time: 100,
  survived: squad.map((t) => t.name),
  died: [],
  ...over,
});

// --------------------------------------------------------------- the ladder

test('rank tiers rise with missions survived and stop at the top', () => {
  assert.equal(rankTier(0), 0);
  assert.equal(rankShort(0), 'PVT');
  assert.equal(rankShort(1), 'LCP');
  assert.equal(rankShort(4), 'SGT');
  // Past the last threshold the tier holds rather than running off the end.
  assert.equal(rankShort(25), 'GEN');
  assert.equal(rankShort(999), 'GEN');
  assert.equal(nextPromotionIn(999), null);
  assert.equal(nextPromotionIn(0), 1);
});

// ------------------------------------------------------------ enlistment

test('a fresh campaign fields the original six, in order, all green', () => {
  const { squad } = fresh();
  assert.equal(squad.length, 6);
  assert.deepEqual(squad.map((t) => t.name), ['JOOLS', 'JOPS', 'STOO', 'RJ', 'GARY', 'ANDY']);
  assert.ok(squad.every((t) => t.missions === 0 && t.fresh));
});

test('deploying twice does not re-enlist anyone', () => {
  const { state } = fresh();
  const again = deploy(state, 6);
  assert.equal(state.squad.length, 6);
  // Nobody is "fresh" the second time; they were already on the roster.
  assert.ok(again.every((t) => !t.fresh));
});

// ------------------------------------------------------------- promotion

test('winning promotes every survivor by exactly one mission', () => {
  const { state, squad } = fresh();
  const after = win(state, squad);
  assert.ok(after.survivors.every((s) => s.missions === 1));
  // 0 -> 1 crosses the Lance Corporal threshold, so all six are promoted.
  assert.equal(after.survivors.filter((s) => s.promoted).length, 6);
  assert.ok(state.squad.every((t) => t.missions === 1));
});

test('a promotion is only flagged when the tier actually changes', () => {
  const { state, squad } = fresh();
  win(state, squad);                      // 0 -> 1, tier 0 -> 1
  const second = win(state, deploy(state, 6)); // 1 -> 2, tier 1 -> 2
  assert.ok(second.survivors.every((s) => s.promoted));
  const third = win(state, deploy(state, 6));  // 2 -> 3, still tier 2
  assert.ok(third.survivors.every((s) => !s.promoted), 'tier 2 spans 2 and 3 missions');
});

// ---------------------------------------------------------------- burial

test('winning buries the dead and takes them off the roster', () => {
  const { state, squad } = fresh();
  const after = win(state, squad, {
    survived: ['JOOLS', 'JOPS', 'STOO', 'RJ'],
    died: ['GARY', 'ANDY'],
  });
  assert.equal(after.buried.length, 2);
  assert.equal(state.fallen.length, 2);
  assert.deepEqual(state.squad.map((t) => t.name).sort(), ['JOOLS', 'JOPS', 'RJ', 'STOO']);
  // The grave remembers the mission that did it, which is the detail that turns
  // a name into an event.
  assert.equal(state.fallen[0].mission, 'Chicken Run');
  assert.equal(state.fallen[0].difficulty, 'regular');
});

test('a dead man never lands on the roster and the hill at once', () => {
  const { state, squad } = fresh();
  win(state, squad, { survived: ['JOOLS'], died: ['JOPS', 'STOO', 'RJ', 'GARY', 'ANDY'] });
  const onHill = new Set(state.fallen.map((g) => g.name));
  assert.ok(state.squad.every((t) => !onHill.has(t.name)));
});

test('a buried name is never reissued to a replacement', () => {
  const { state, squad } = fresh();
  win(state, squad, { survived: ['JOOLS'], died: ['JOPS', 'STOO', 'RJ', 'GARY', 'ANDY'] });

  // Refill and wipe out repeatedly; no name may ever come back from the dead.
  for (let i = 0; i < 4; i++) {
    const next = deploy(state, 6);
    win(state, next, { survived: [], died: next.map((t) => t.name) });
  }
  const names = state.fallen.map((g) => g.name);
  assert.equal(new Set(names).size, names.length, `reissued a dead name: ${names.join(',')}`);
});

test('the roster never runs out of names, even past the pool', () => {
  const { state } = fresh();
  for (let i = 0; i < 12; i++) {
    const next = deploy(state, 6);
    assert.equal(next.length, 6);
    assert.ok(next.every((t) => typeof t.name === 'string' && t.name.length > 0));
    win(state, next, { survived: [], died: next.map((t) => t.name) });
  }
  const names = state.fallen.map((g) => g.name);
  assert.equal(new Set(names).size, names.length);
});

// ------------------------------------------------------------------ losing

test('losing changes absolutely nothing', () => {
  const { state, squad } = fresh();
  const before = JSON.stringify(state);
  const after = recordMission(state, {
    won: false,
    missionId: 'chicken-run',
    missionName: 'Chicken Run',
    difficulty: 'regular',
    time: 60,
    survived: ['JOOLS'],
    died: ['JOPS', 'STOO', 'RJ', 'GARY', 'ANDY'],
  });
  assert.equal(JSON.stringify(state), before, 'a loss must not touch the campaign');
  assert.equal(after.won, false);
  assert.equal(state.fallen.length, 0);
  // It still reports who fell, so the panel can name them without burying them.
  assert.equal(after.buried.length, 5);
});

// ----------------------------------------------------------------- records

test('records keep the best of every attempt, not the last', () => {
  const { state } = fresh();
  win(state, deploy(state, 6), { survived: ['JOOLS', 'JOPS', 'STOO'], died: [], time: 90 });
  win(state, deploy(state, 6), { survived: ['JOOLS'], died: [], time: 200 });

  const r = state.records['chicken-run'];
  assert.equal(r.bestHome, 3, 'best home is a maximum');
  assert.equal(r.bestTime, 90, 'best time is a minimum');
});

test('a clear is recorded once per difficulty', () => {
  const { state } = fresh();
  win(state, deploy(state, 6));
  win(state, deploy(state, 6));
  assert.deepEqual(state.records['chicken-run'].clears, ['regular']);

  const after = win(state, deploy(state, 6), { difficulty: 'elite' });
  assert.ok(after.newClear);
  assert.deepEqual(state.records['chicken-run'].clears, ['regular', 'elite']);
});

test('the first clear is flagged as a record on every axis', () => {
  const { state, squad } = fresh();
  const after = win(state, squad);
  assert.ok(after.recordHome && after.recordTime && after.newClear);
});

// ------------------------------------------------------------- the one name

test('the rename works once and only once', () => {
  const { state } = fresh();
  assert.ok(renameTrooper(state, 'JOOLS', 'Darren'));
  assert.equal(state.squad.find((t) => t.own)?.name, 'DARREN', 'names are uppercased');
  assert.ok(state.renameUsed);
  assert.equal(renameTrooper(state, 'JOPS', 'AGAIN'), false, 'the second rename is refused');
  assert.equal(state.squad.filter((t) => t.own).length, 1);
});

test('the rename refuses a name already taken, living or dead', () => {
  const { state, squad } = fresh();
  win(state, squad, { survived: ['JOOLS'], died: ['JOPS'] });
  assert.equal(renameTrooper(state, 'JOOLS', 'JOPS'), false, 'cannot take a dead man\'s name');
  assert.ok(!state.renameUsed, 'a refused rename is not spent');
  assert.equal(renameTrooper(state, 'JOOLS', 'STOO'), false, 'cannot take a serving name');
  assert.ok(renameTrooper(state, 'JOOLS', 'BOSS'));
});

test('names are trimmed to something that fits a plate', () => {
  assert.equal(sanitiseName('  darren  '), 'DARREN');
  assert.equal(sanitiseName('a<script>b'), 'ASCRIPTB');
  assert.equal(sanitiseName('averyverylongname'), 'AVERYVERY');
  assert.equal(sanitiseName('   '), '');
  assert.equal(sanitiseName('!!!'), '');
});

test('a renamed soldier keeps the mark onto the hill', () => {
  const { state } = fresh();
  renameTrooper(state, 'JOOLS', 'BOSS');
  win(state, deploy(state, 6), { survived: [], died: ['BOSS'] });
  assert.equal(state.fallen[0].name, 'BOSS');
  assert.ok(state.fallen[0].own, 'the hill remembers it was yours');
});

// ------------------------------------------------------------- persistence

test('a campaign survives a reload', () => {
  const { state, squad } = fresh();
  renameTrooper(state, 'JOOLS', 'BOSS');
  win(state, squad.map((t) => (t.name === 'JOOLS' ? { ...t, name: 'BOSS' } : t)), {
    survived: ['BOSS', 'JOPS'], died: ['STOO'],
  });

  const reloaded = loadCampaign();
  assert.equal(reloaded.fallen.length, 1);
  assert.equal(reloaded.fallen[0].name, 'STOO');
  assert.ok(reloaded.renameUsed);
  assert.equal(reloaded.squad.find((t) => t.name === 'BOSS')?.missions, 1);
  assert.equal(reloaded.records['chicken-run'].bestHome, 2);
});

test('a corrupt save costs the roster, not the game', () => {
  store.set('cf.campaign', '{"v":1,"squad":"not an array"');
  const state = loadCampaign();
  assert.deepEqual(state.squad, []);
  assert.deepEqual(state.fallen, []);
  assert.equal(state.renameUsed, false);
  // And it is immediately usable.
  assert.equal(deploy(state, 6).length, 6);
});

test('a save from a future version is discarded rather than misread', () => {
  store.set('cf.campaign', JSON.stringify({ v: 99, squad: [{ name: 'GHOST', missions: 5 }] }));
  assert.deepEqual(loadCampaign().squad, []);
});

test('a tampered save cannot resurrect a name', () => {
  // `issued` rewound by hand; the loader must not trust it below what is spent.
  store.set('cf.campaign', JSON.stringify({
    v: 1, issued: 0, renameUsed: false, records: {},
    squad: [{ name: 'JOOLS', missions: 2 }],
    fallen: [{ name: 'JOPS', missions: 1, mission: 'Chicken Run', difficulty: 'regular' }],
  }));
  const state = loadCampaign();
  assert.ok(state.issued >= 2);
  const squad = deploy(state, 6);
  assert.ok(!squad.some((t) => t.name === 'JOPS'), 'JOPS is buried and must stay buried');
});

console.log(`\n  ${run} campaign checks run`);
if (process.exitCode) {
  console.error('  campaign tests failed');
} else {
  console.log('  all passed');
}
