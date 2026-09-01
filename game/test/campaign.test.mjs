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
  entryPoints: [join(ROOT, 'src', 'sim', 'campaign.ts')],
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

/*
 * `unlock.ts` reaches menu.ts for the theatre table, which reaches the DOM at
 * module scope for nothing this test needs -- so it is bundled separately with
 * a `__DEV__` define, the same way the real build does it.
 */
/* The name pool, on its own: it has no DOM reach at all. */
const namesBuild = await esbuild.build({
  entryPoints: [join(ROOT, 'src', 'sim', 'names.ts')],
  bundle: true, write: false, format: 'esm', target: 'es2022', logLevel: 'silent',
});
const { NAMES_MAX, NAME_MAX_RENDERED, RECRUITS, nameAt } = await import(
  `data:text/javascript;base64,${Buffer.from(namesBuild.outputFiles[0].text).toString('base64')}`
);

const unlockBuild = await esbuild.build({
  entryPoints: [join(ROOT, 'src', 'sim', 'unlock.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  define: { __DEV__: 'false' },
  logLevel: 'silent',
});
const { resolveUnlocks, FREE_PER_THEATRE } = await import(
  `data:text/javascript;base64,${Buffer.from(unlockBuild.outputFiles[0].text).toString('base64')}`
);

/** A level list shaped like the real one, without needing the real one. */
const lvl = (id, theme) => ({
  id, theme, name: id, objective: 'eliminate', nokill: false, timeLimit: 0,
  doctrine: 'garrison', brief: '', mechanic: '', width: 64, height: 64,
});
const CAMPAIGN = [
  ...Array.from({ length: 6 }, (_, i) => lvl(`j${i}`, 'jungle')),
  ...Array.from({ length: 5 }, (_, i) => lvl(`d${i}`, 'desert')),
  ...Array.from({ length: 4 }, (_, i) => lvl(`a${i}`, 'arctic')),
];
const withClears = (ids) => ({
  v: 1, squad: [], fallen: [], issued: 0, renameUsed: false,
  records: Object.fromEntries(ids.map((id) => [id, { bestHome: 1, bestTime: 60, clears: ['rookie'] }])),
});

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
  difficulty: 'veteran',
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
  assert.equal(state.fallen[0].difficulty, 'veteran');
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
    difficulty: 'veteran',
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
  assert.deepEqual(state.records['chicken-run'].clears, ['veteran']);

  const after = win(state, deploy(state, 6), { difficulty: 'elite' });
  assert.ok(after.newClear);
  assert.deepEqual(state.records['chicken-run'].clears, ['veteran', 'elite']);
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

test('a save written before Regular was dropped keeps everything it had', () => {
  // The exact shape an older build wrote: a retired difficulty in `clears`, on
  // a grave, and a squad and records worth not throwing away. Migrating by
  // bumping the save version would have discarded all of it, because a version
  // mismatch returns an empty campaign.
  store.set('cf.campaign', JSON.stringify({
    v: 1,
    squad: [{ name: 'HAWK', missions: 6, own: true }],
    fallen: [{ name: 'JOPS', missions: 1, mission: 'Chicken Run', difficulty: 'regular' }],
    records: { 'chicken-run': { bestHome: 5, bestTime: 161, clears: ['regular'] } },
    issued: 7,
    renameUsed: true,
  }));
  const state = loadCampaign();

  assert.equal(state.squad.length, 1, 'the living squad survives the migration');
  assert.equal(state.squad[0].name, 'HAWK');
  assert.equal(state.fallen.length, 1, 'and so does Boot Hill');
  assert.equal(state.renameUsed, true);
  assert.equal(state.records['chicken-run'].bestHome, 5);

  // Regular becomes Rookie: the lower of the two it could not be told apart
  // from, so a clear is never credited with more than it earned.
  assert.deepEqual(state.records['chicken-run'].clears, ['rookie']);
  assert.equal(state.fallen[0].difficulty, 'rookie');
});

test('a save holding both a retired tier and the one it maps to claims one star, not two', () => {
  store.set('cf.campaign', JSON.stringify({
    v: 1, squad: [], fallen: [], issued: 0, renameUsed: false,
    records: { 'chicken-run': { bestHome: 3, bestTime: 90, clears: ['regular', 'rookie'] } },
  }));
  assert.deepEqual(loadCampaign().records['chicken-run'].clears, ['rookie']);
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
    fallen: [{ name: 'JOPS', missions: 1, mission: 'Chicken Run', difficulty: 'veteran' }],
  }));
  const state = loadCampaign();
  assert.ok(state.issued >= 2);
  const squad = deploy(state, 6);
  assert.ok(!squad.some((t) => t.name === 'JOPS'), 'JOPS is buried and must stay buried');
});
// --- 100/R2: what a player may start, and why

test('a fresh campaign opens the first three of every theatre, and no more', () => {
  const u = resolveUnlocks(CAMPAIGN, withClears([]));
  assert.equal(FREE_PER_THEATRE, 3);
  assert.deepEqual([...u.open].sort(), ['a0', 'a1', 'a2', 'd0', 'd1', 'd2', 'j0', 'j1', 'j2']);
  // Three at once in each theatre is the whole point: a player stuck on one
  // mission can go and fight somewhere else instead of hitting a wall.
  assert.equal(u.byTheatre.get('jungle').open, 3);
  assert.equal(u.byTheatre.get('desert').open, 3);
  assert.equal(u.byTheatre.get('arctic').open, 3);
});

test('clearing one opens one more, in that theatre and not the others', () => {
  const u = resolveUnlocks(CAMPAIGN, withClears(['j1']));
  assert.equal(u.byTheatre.get('jungle').open, 4, 'the jungle gains one');
  assert.equal(u.byTheatre.get('desert').open, 3, 'the desert does not');
  assert.ok(u.open.has('j3'));
  assert.ok(!u.open.has('d3'));
});

test('it is a budget, not a chain -- any clear pays for the next one along', () => {
  // Clearing the *third* mission opens the fourth, not the fourth-after-third.
  const u = resolveUnlocks(CAMPAIGN, withClears(['j2']));
  assert.ok(u.open.has('j3'));
  assert.ok(!u.open.has('j4'));
});

test('a theatre cannot open more missions than it has', () => {
  const u = resolveUnlocks(CAMPAIGN, withClears(['a0', 'a1', 'a2', 'a3']));
  const arctic = u.byTheatre.get('arctic');
  assert.equal(arctic.total, 4);
  assert.equal(arctic.open, 4, 'clamped to what exists');
  assert.equal(arctic.cleared, 4);
});

test('a mission already beaten stays open however the campaign is reordered', () => {
  // Somebody who cleared the last jungle mission before an edit moved it must
  // never find their own history locked behind them.
  const u = resolveUnlocks(CAMPAIGN, withClears(['j5']));
  assert.ok(u.open.has('j5'));
});

test('the test range is never gated behind campaign progress', () => {
  const withDev = [...CAMPAIGN, { ...lvl('range', 'jungle'), dev: true }];
  assert.ok(resolveUnlocks(withDev, withClears([])).open.has('range'));
});



/* --------------------------------------------------------------- the names
 *
 * The pool is a hand-edited list of a few hundred strings, which is exactly
 * the kind of thing that rots when somebody adds a name in a hurry. Both
 * properties below are load-bearing and neither is visible when it breaks: an
 * over-long name overflows a fixed-width roster column, and a duplicate
 * silently defeats the one rule this whole file exists to enforce.
 */

test('the pool is hundreds of names, not dozens', () => {
  assert.ok(RECRUITS.length >= 300, `only ${RECRUITS.length} names`);
});

test('the original twelve still lead, in the original order', () => {
  assert.deepEqual(RECRUITS.slice(0, 12), [
    'JOOLS', 'JOPS', 'STOO', 'RJ', 'GARY', 'ANDY',
    'BUZZ', 'TEDDY', 'HAWK', 'MAC', 'FRANK', 'WILL',
  ]);
});

test('no name is longer than the suffixes leave room for', () => {
  const over = RECRUITS.filter((n) => n.length > NAMES_MAX);
  assert.deepEqual(over, [], `too long: ${over.join(', ')}`);
});

test('no name appears twice in the pool', () => {
  const seen = new Set();
  const dup = RECRUITS.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
  assert.deepEqual(dup, [], `duplicated: ${dup.join(', ')}`);
});

test('every name is uppercase, with nothing a roster cannot print', () => {
  const bad = RECRUITS.filter((n) => !/^[A-Z]+$/.test(n));
  assert.deepEqual(bad, [], `unprintable: ${bad.join(', ')}`);
});

test('nameAt never hands out the same name twice', () => {
  // Four laps of the pool: far more war than anyone will play, and enough to
  // walk several rungs of the suffix ladder.
  const n = RECRUITS.length * 4;
  const seen = new Set();
  for (let i = 0; i < n; i++) seen.add(nameAt(i));
  assert.equal(seen.size, n, 'nameAt repeated itself');
});

test('and every name it hands out fits the roster column', () => {
  // Twelve, which was measured in the real sidebar rather than inferred from
  // sanitiseName's nine -- that nine is a cap on what a *player* may type.
  for (let i = 0; i < RECRUITS.length * 4; i++) {
    const name = nameAt(i);
    assert.ok(name.length <= NAME_MAX_RENDERED, `"${name}" is ${name.length} characters`);
  }
});

test('the war outliving the pool produces a man, not a number', () => {
  // The old behaviour was RECRUIT 41, which is a casualty counter that has
  // stopped pretending. The first past the end should be somebody's son.
  const past = nameAt(RECRUITS.length);
  assert.ok(!/RECRUIT/.test(past), `still numbering recruits: ${past}`);
  assert.equal(past, `${RECRUITS[0]} JR.`);
  assert.equal(nameAt(RECRUITS.length * 2), `${RECRUITS[0]} III`);
});

console.log(`\n  ${run} campaign checks run`);
if (process.exitCode) {
  console.error('  campaign tests failed');
} else {
  console.log('  all passed');
}
