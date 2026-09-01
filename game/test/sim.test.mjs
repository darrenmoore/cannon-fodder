/**
 * The simulation, run headlessly, so that changing it is not an act of faith.
 *
 * `map.test.mjs` proves a mission *parses* and can in principle be finished.
 * Nothing proved that stepping one for a minute does not put a man inside a
 * tree, leave `NaN` in a velocity, or quietly stop the garrison reinforcing.
 * Those are the failures that reach a player, and until now the only thing that
 * could see them was somebody playing the game.
 *
 * Two kinds of assertion live here, and they are different tools:
 *
 *   **The soak** runs every shipped mission and checks *invariants* — things
 *   that must be true of any world at any moment, whatever the dice did. It is
 *   the net under a refactor: broad, cheap, and indifferent to tuning.
 *
 *   **The golden numbers** pin the two behaviours that 300 is about to reach
 *   into — who an enemy shoots at, and how fast a hut produces men. They are
 *   deliberately narrow. A golden number that moves is not automatically a bug,
 *   but it is always a decision, and it should never be made by accident.
 *
 * The numbers below were measured on this codebase before any of 300 was
 * written. If one changes, work out why before changing it here.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { DT, arena, run, seeded, sim, step } from './support/sim.mjs';

const DATA = fileURLToPath(new URL('../../data/', import.meta.url));

/** Row separator for the inline maps below. Named so no edit can mangle it. */
const NL = String.fromCharCode(10);

let passed = 0;
const fails = [];
const check = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    fails.push(name);
    console.log(`  FAIL ${name}\n       ${err.message.split('\n')[0]}`);
  }
};

/** Builds a world from an inline map, for the tests that need exact geometry. */
const worldFrom = (art, header, difficulty = 'veteran') =>
  sim.createWorld(sim.parseMap(`${header}\n---\n${art}`, 'test'), difficulty);

// ---------------------------------------------------------------- the soak

const files = (await readdir(DATA)).filter((f) => f.endsWith('.map'));
const SOAK_SECONDS = 10;

/**
 * Every mission, stepped for ten seconds, checked against the things that are
 * true of a working world regardless of what happened in it.
 *
 * Ten seconds because it is enough for the garrison to notice the squad, open
 * fire and start moving — which is when the interesting invariants can break —
 * and because fifty-two of them still costs under two seconds.
 */
const soakFailures = [];
const soakStats = { maps: 0, actors: 0 };
/** Missions that kill an idle squad inside the soak. Reported, not failed. */
const hotOpenings = [];
/** Arena maps, pulled out of the mission soak and checked separately. */
const arenaMaps = [];

for (const file of files) {
  const src = await readFile(join(DATA, file), 'utf8');
  const id = file.slice(0, -4);
  const map = sim.parseMap(src, id);
  // Arenas are checked on their own terms below.
  if (map.arena) { arenaMaps.push(map); continue; }
  const fail = (why) => soakFailures.push(`${id}: ${why}`);

  try {
    // Seeded per map, so a failure can be reproduced by name rather than by
    // running the suite until it happens again.
    const world = seeded(0x9e37 + soakStats.maps, () => {
      const w = sim.createWorld(map, 'veteran');
      run(w, SOAK_SECONDS);
      return w;
    });

    soakStats.maps++;
    soakStats.actors += world.actors.length;

    // `actors` is the union the spatial hash and every collision pass walk. If
    // it drifts from the two lists it is built out of, something has added a
    // unit to one and not the other — which is exactly the mistake 300's
    // second faction invites.
    if (world.actors.length !== world.soldiers.length + world.enemies.length) {
      fail(`actors ${world.actors.length} != soldiers ${world.soldiers.length}`
        + ` + enemies ${world.enemies.length}`);
    }

    for (const a of world.actors) {
      const bad = [a.pos.x, a.pos.y, a.vel.x, a.vel.y, a.angle].some((n) => !Number.isFinite(n));
      if (bad) { fail(`non-finite state on actor ${a.id}`); break; }
      // Off the edge of the world. Nothing legitimate walks out of the grid;
      // one tile of slack, because a corpse settling on the border is fine.
      const t = map.tile;
      if (a.pos.x < -t || a.pos.y < -t
        || a.pos.x > map.pixelWidth + t || a.pos.y > map.pixelHeight + t) {
        fail(`actor ${a.id} left the map at ${a.pos.x | 0},${a.pos.y | 0}`);
        break;
      }
    }

    // Nobody living should be standing inside solid ground. Checked on the
    // living only: a man shot on a bridge that was blown up under him is
    // allowed to be a decal in a wall.
    for (const a of world.actors) {
      if (!a.alive) continue;
      const tx = Math.floor(a.pos.x / map.tile);
      const ty = Math.floor(a.pos.y / map.tile);
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
      const tile = map.grid[ty * map.width + tx];
      // Deep water is `solid` to everything that *places* things but crossable
      // by anyone steered into it, so it is not a violation to stand in.
      if (sim.TILES[tile].solid && !sim.TILES[tile].swim) {
        fail(`actor ${a.id} is inside ${sim.TILES[tile].name} at ${tx},${ty}`);
        break;
      }
    }

    /*
     * A mission that is *won* in ten seconds is broken: no objective in the
     * game can be honestly met by a squad that has been given no orders.
     *
     * Being *lost* is a different thing and is not a failure here. Five of the
     * fifty-two kill a squad that stands still — Landing Ground, The Quarry,
     * The Drum, No Way Off and The Crevasse — and a hot opening is a legitimate
     * thing for a mission to have. They are collected and printed instead, so
     * the list is visible and a change to it is noticed.
     */
    if (world.phase === 1) fail(`won in ${SOAK_SECONDS}s with no orders given`);
    if (world.phase === 2) hotOpenings.push(id);
  } catch (err) {
    fail(`threw — ${err.message}`);
  }
}

check(`every mission survives ${SOAK_SECONDS}s of simulation`, () => {
  assert.equal(soakFailures.length, 0, `\n       ${soakFailures.join('\n       ')}`);
  assert.equal(soakStats.maps + arenaMaps.length, files.length,
    `only soaked ${soakStats.maps} of ${files.length}`);
});

// ------------------------------------------------------- golden: targeting

/*
 * Who an enemy shoots at.
 *
 * 300's item 001 widens the target search from "the player's soldiers" to
 * "anyone of another faction", so that one AI can drive both sides of a
 * CPU-vs-CPU battle. In a mission the two are the same set — the only non-enemy
 * actors are the squad — and *that equivalence is the whole safety argument*.
 * This is where it is checked rather than asserted in a comment.
 */

// Wide open ground: one rifleman, two soldiers, nothing in the way.
const OPEN = [
  '########################################',
  '#......................................#',
  '#......................................#',
  '#......................................#',
  '#....P......E.......P..................#',
  '#......................................#',
  '#......................................#',
  '########################################',
].join('\n');

const HEADER = 'name: Range\ntheme: jungle\nobjective: eliminate\ndoctrine: garrison\ntile: 16';

check('an enemy acquires the nearer of two soldiers', () => {
  seeded(11, () => {
    // Rookie, because Veteran's `extraEnemies` lever doubles every placed
    // rifleman and this test is about one man's choice, not two men's.
    const w = worldFrom(OPEN, HEADER, 'rookie');
    assert.equal(w.enemies.length, 1, `expected one rifleman, got ${w.enemies.length}`);
    assert.equal(w.soldiers.length, 2, `expected two soldiers, got ${w.soldiers.length}`);
    const e = w.enemies[0];
    for (let i = 0; i < 120 && !e.target; i++) step(w);
    assert.ok(e.target, 'never acquired anybody');
    // P at tile 5 is seven tiles off; P at tile 20 is eight.
    const tile = Math.round(e.target.pos.x / 16 - 0.5);
    assert.equal(tile, 5, `acquired the far soldier (tile ${tile})`);
  });
});

// The same geometry with a wall of trees across the near soldier's line.
const BLOCKED = [
  '########################################',
  '#......................................#',
  '#.......T..............................#',
  '#.......T..............................#',
  '#....P..T...E.......P..................#',
  '#.......T..............................#',
  '#.......T..............................#',
  '########################################',
].join(NL);

check('an enemy does not acquire through trees', () => {
  seeded(11, () => {
    const w = worldFrom(BLOCKED, HEADER, 'rookie');
    const e = w.enemies[0];
    for (let i = 0; i < 120 && !e.target; i++) step(w);
    // It may still find the *far* soldier, which stands in the open. What it
    // must never do is see the one behind the treeline.
    if (e.target) {
      const tile = Math.round(e.target.pos.x / 16 - 0.5);
      assert.notEqual(tile, 5, 'acquired a soldier through a wall of trees');
    }
  });
});

/**
 * How far a rifleman notices somebody.
 *
 * Asserted as two questions with yes/no answers rather than as a measured
 * radius. The radius is not stable to a tile — an idle man drifts around his
 * post, so sweeping for the exact distance at which he first notices you
 * returns 9, 9, then 10. Two probes either side of it are stable across every
 * difficulty and still catch the failure that matters: a target search that has
 * stopped working, or one that now reaches across the map.
 */
const acquiresAt = (tiles, difficulty) => {
  const row = `#....E${'.'.repeat(tiles - 1)}P${'.'.repeat(30 - tiles)}#`;
  const art = [
    '#'.repeat(38), `#${'.'.repeat(36)}#`, row, `#${'.'.repeat(36)}#`, '#'.repeat(38),
  ].join(NL);
  const w = worldFrom(art, HEADER, difficulty);
  const e = w.enemies[0];
  for (let i = 0; i < 120; i++) {
    step(w);
    if (e.target) return true;
  }
  return false;
};

check('a rifleman notices at seven tiles and not at sixteen', () => {
  for (const d of ['rookie', 'veteran', 'elite']) {
    assert.ok(acquiresAt(7, d), `${d}: failed to notice a soldier seven tiles away`);
    assert.ok(!acquiresAt(16, d), `${d}: noticed a soldier sixteen tiles away`);
  }
});

// ---------------------------------------------------- golden: reinforcement

/*
 * How fast a hut produces men, and the rule that it only does so with the squad
 * nearby.
 *
 * 300's item 003 gives buildings an owner and lets the arena's huts produce
 * without that proximity gate. The gate is what stops a distant village quietly
 * filling a mission with troopers, so what is worth pinning is that it is still
 * there and still bites at the same distance.
 *
 * The squad stands at tile 19, which is chosen precisely and is the whole
 * reason this measurement is stable. It is inside the hut's 260px
 * `spawnAggroRange`, so the tap runs; and outside a rifleman's 182px notice
 * radius, so the men who come out never find him and nobody dies. That matters
 * because `b.spawned` is decremented when a trooper is killed (`combat.ts`), so
 * a firefight frees slots and the count becomes a measure of the firefight
 * rather than of the hut. Standing the squad on top of the hut gives 1, 2, 3 or
 * 4 depending on the dice; standing it here gives the same number every time.
 */
const hutMap = (soldierAtTile) => [
  '##################################################',
  `#${'.'.repeat(48)}#`,
  `#..hh${'.'.repeat(44)}#`,
  `#..hh${'.'.repeat(44)}#`,
  `#${'.'.repeat(soldierAtTile - 1)}P${'.'.repeat(48 - soldierAtTile)}#`,
  `#${'.'.repeat(48)}#`,
  '##################################################',
].join(NL);

const producedIn = (soldierAtTile, seconds, difficulty) => {
  const w = worldFrom(hutMap(soldierAtTile), HEADER, difficulty);
  const before = w.enemies.length;
  run(w, seconds);
  return w.enemies.length - before;
};

check('a hut reinforces only while the squad is near it', () => {
  for (const d of ['rookie', 'veteran', 'elite']) {
    assert.ok(producedIn(19, 60, d) > 0, `${d}: a hut with the squad in range produced nobody`);
    // Tile 40 is 36 tiles from the door — nowhere near the 260px range.
    assert.equal(producedIn(40, 60, d), 0, `${d}: a hut produced men with nobody near it`);
  }
});

check('an undisturbed hut fields exactly its difficulty cap', () => {
  // `maxSpawned` is a concurrency cap, so with nobody dying it is also the
  // total output over a long enough minute. Rookie 2, Veteran 4 — measured, and
  // identical on every run.
  for (const d of ['rookie', 'veteran']) {
    const cap = sim.resolveLevers(d, 'garrison').maxSpawned;
    assert.equal(producedIn(19, 60, d), cap, `${d} hut output moved (cap ${cap})`);
  }
  // Elite is deliberately not pinned. It hunts hard enough to find a lone man
  // at this distance, so its men die, free their slots and are replaced — the
  // count measures the fight, not the hut.
  const got = producedIn(19, 60, 'elite');
  assert.ok(got > 0, `elite produced ${got}`);
});


// ------------------------------------------------------------- the arena

/*
 * Two and a half minutes of CPU-vs-CPU, in about eight seconds.
 *
 * `ARENA_SECONDS=600 node test/sim.test.mjs` runs a longer one by hand; the
 * default is what `npm run check` can afford on every change.
 *
 * This is the check the whole mode rests on, and it is one a screenshot cannot
 * make: an arena has no end, so everything wrong with it is wrong *slowly*.
 * The three failures it is built to catch all happened during development and
 * none of them looked like a bug at thirty seconds:
 *
 *   - one side's huts were levelled by the other side's grenades, after which
 *     twenty men wandered an empty map for as long as the page was open;
 *   - the dead were never removed from `world.actors`, so every living man paid
 *     for every corpse in every target search, for ever;
 *   - a squad wedged against scenery marched into a wall until the heat death
 *     of the universe, because nothing takes an order back off a man.
 */
const ARENA_SECONDS = Number(process.env.ARENA_SECONDS || 150);

for (const map of arenaMaps) {
  const { world, game, fronts } = arena(map, ARENA_SECONDS);

  check(`${map.id}: both sides are still fighting after ${ARENA_SECONDS}s`, () => {
    assert.ok(game.standing(0) > 0, 'green has been wiped out');
    assert.ok(game.standing(1) > 0, 'red has been wiped out');
    assert.ok(game.losses[0] > 0 && game.losses[1] > 0,
      `not a fight: ${game.losses[0]} green and ${game.losses[1]} red lost`);
  });

  check(`${map.id}: the huts are still standing`, () => {
    // Indestructible on purpose. A hut is the only source of men, so one that
    // can be levelled is a side that can be switched off -- and with grenadiers
    // on both sides, that is the normal outcome rather than a remote one.
    assert.ok(world.buildings.every((b) => b.standing), 'a hut was levelled');
  });

  check(`${map.id}: the dead do not accumulate`, () => {
    // Without reaping this was 68 actors at ninety seconds with 20 alive, and
    // rising for as long as anybody watched.
    const alive = world.actors.filter((a) => a.alive).length;
    assert.ok(world.actors.length < alive + 40,
      `${world.actors.length} actors for ${alive} living`);
  });

  check(`${map.id}: nobody is left marching for ever`, () => {
    // A man in Advance is following his squad's flow field. If one is still in
    // that state with no field, or the whole side is in it after five minutes
    // of contact, something has stopped taking orders back.
    for (const e of world.enemies) {
      if (!e.alive || e.state !== 5) continue;
      assert.ok(e.squad < 0 || world.squadFields[e.squad],
        `unit ${e.id} is advancing along a field that does not exist`);
    }
  });

  check(`${map.id}: nothing reached the simulation from outside`, () => {
    // The spectator promise, as an invariant. These three are written by the
    // order path and by nothing else, so if any of them has a value, something
    // gave this world an order -- which nobody is supposed to be able to do.
    assert.equal(world.orderGoal, null);
    assert.equal(world.field, null);
    assert.equal(world.orderMarker, 0);
  });

  check(`${map.id}: there is a front, and it moves`, () => {
    /*
     * The mode's two characteristic failures, and this catches both.
     *
     * *No front at all* is the stall: two sides that never meet. It happened
     * for real -- the front was defined as the sum of both sides' strength, so
     * a side's own muster point was the hottest cell on the map and every squad
     * was sent to reinforce the ground it was already standing on. Thirty-six
     * men, five minutes, not a shot fired, about one battle in five.
     *
     * *A front that never moves* is the stalemate: two identical sides grinding
     * on the centre line for ever. Territory-driven reinforcement is what is
     * supposed to prevent it.
     */
    const seen = fronts.filter(Boolean);
    assert.ok(seen.length > fronts.length / 3,
      `a front existed for only ${seen.length} of ${fronts.length} samples`);
    const cells = new Set(seen.map((p) => `${Math.round(p.x / 64)},${Math.round(p.y / 64)}`));
    assert.ok(cells.size > 2, `the fighting never left ${cells.size} place(s)`);
  });
}

// ------------------------------------------------------------------ report

if (fails.length > 0) {
  console.log(`\n  ${fails.length} simulation check(s) failed\n`);
  process.exit(1);
}
console.log(
  `\n  ${passed} simulation checks passed`
  + ` — ${soakStats.maps} missions soaked for ${SOAK_SECONDS}s each`,
);
if (hotOpenings.length > 0) {
  // Not a failure. A mission that kills a squad which was given no orders has
  // a hot opening, which is a legitimate thing to design; the list is printed
  // so that it growing is something somebody notices.
  console.log(`  note: an idle squad is wiped within ${SOAK_SECONDS}s on `
    + `${hotOpenings.join(', ')}`);
}
console.log('');
