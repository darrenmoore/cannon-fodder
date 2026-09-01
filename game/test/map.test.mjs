/**
 * Assertions over every generated level, run by `npm run check`. The map parser
 * is the one piece of game logic with no DOM dependency, so it is worth testing
 * directly: a malformed or unwinnable level should fail here, not in the browser.
 *
 * The bundle is browser-targeted ESM, so the parser is compiled on the fly with
 * esbuild rather than importing the .ts directly.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, '..', 'data');

const built = await esbuild.build({
  entryPoints: [join(ROOT, 'src', 'sim', 'map.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  logLevel: 'silent',
});
const mod = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
);
const { parseMap, tileAt, isSolidAt, hasLineOfSight, hasLineOfFire, nearestWalkable } = mod;

// pathfind.ts as well, because swimming split one question into two: `isSolidAt`
// still answers "can anything be put here", and `blocksMovement` answers "can
// this particular man walk here". Everything that places a spawn, a patrol
// point, a formation slot or a hostage depends on the first not having quietly
// become the second.
const builtPath = await esbuild.build({
  entryPoints: [join(ROOT, 'src', 'sim', 'pathfind.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  logLevel: 'silent',
});
const pathMod = await import(
  `data:text/javascript;base64,${Buffer.from(builtPath.outputFiles[0].text).toString('base64')}`
);
const { blocksMovement, circleBlocked, buildFlowField } = pathMod;

// Tile enum, mirrored from tiles.ts.
const T = {
  Grass: 0, Sand: 1, Tree: 2, Water: 3, Bridge: 4, Rock: 5, Hut: 6,
  DeepWater: 7, TallGrass: 8, Quicksand: 9, Ice: 10, Road: 11, Fence: 12,
  Rubble: 13, Factory: 14, Tent: 15, Outpost: 16,
};

/**
 * Buildings the squad can turn into a route by levelling them.
 *
 * Not the outpost: that one is the squad's own, the mission is lost if it
 * falls, and counting it as a door would let a map be "completable" only by
 * destroying the thing it exists to protect.
 */
const DESTRUCTIBLE = new Set([T.Hut, T.Factory]);

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};

const tileIndexOf = (map, p) =>
  Math.floor(p.y / map.tile) * map.width + Math.floor(p.x / map.tile);

/**
 * Walkable flood fill from a point, matching the engine's solid set.
 *
 * `extra` takes a world point and narrows what counts as walkable without
 * changing what walkable means -- which is how the covert check asks the same
 * fill "and what if you also refuse to go near anybody".
 */
function reachableFrom(map, start, extra = null, throughBuildings = false) {
  const seen = new Uint8Array(map.width * map.height);
  const blocked = (x, y) =>
    isSolidAt(map, x, y) && !(throughBuildings && DESTRUCTIBLE.has(tileAt(map, x, y)));
  const sx = Math.floor(start.x / map.tile);
  const sy = Math.floor(start.y / map.tile);
  if (blocked(sx, sy)) return seen;
  const queue = [sy * map.width + sx];
  seen[queue[0]] = 1;
  while (queue.length) {
    const i = queue.pop();
    const x = i % map.width;
    const y = (i - x) / map.width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const ni = ny * map.width + nx;
      if (seen[ni] || blocked(nx, ny)) continue;
      if (extra && !extra({ x: (nx + 0.5) * map.tile, y: (ny + 0.5) * map.tile })) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

/**
 * What is wrong with a no-kill map, as a list of strings. Empty means fine.
 *
 * Reachable is not enough on a map that forbids killing: there has to be a way
 * to everything the mission needs that never walks inside a sentry's own aggro
 * radius (132px over a 16px tile, so eight).
 *
 * It checks every objective entity, not only the extraction. A no-kill rescue
 * with a rifleman standing beside a hostage is not a hard mission -- the
 * hostage dies in the firefight the mission never allowed you to have, and the
 * map is unwinnable. That is exactly why the no-kill rule became a modifier any
 * objective can carry rather than a `covert` objective of its own: the rule it
 * needs is spatial, and it is the same rule whatever the objective happens to
 * be.
 *
 * A function rather than an inline block so the rule itself can be tested on a
 * map small enough to read, instead of only on whatever `data/` happens to
 * hold. Mirrors the same check in generate-levels.mjs, deliberately: this one
 * runs on the shipped file, independently of the generator that wrote it.
 */
function noKillProblems(map) {
  const problems = [];
  const posts = [...map.enemySpawns, ...map.sniperSpawns, ...map.bazookaSpawns];
  if (posts.length === 0) problems.push('a no-kill map has nobody to avoid');

  const AVOID = 8 * map.tile;
  const clearOf = (p) => posts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= AVOID);
  const shy = reachableFrom(map, map.playerSpawns[0], clearOf);

  // What this particular mission has to get to without being seen.
  const needed = [];
  if (map.objective === 'reach') needed.push(...map.extraction.map((p) => ['extraction', p]));
  if (map.objective === 'rescue') {
    needed.push(...map.hostages.map((p) => ['hostage', p]));
    needed.push(...map.extraction.map((p) => ['tent', p]));
  }
  if (map.objective === 'collect') needed.push(...map.supplies.map((p) => ['supply box', p]));
  if (map.objective === 'hold') needed.push(...map.extraction.map((p) => ['zone', p]));
  if (needed.length === 0) problems.push('a no-kill map with nothing to reach quietly');

  for (const [what, p] of needed) {
    const where = `${what} at ${Math.floor(p.x / map.tile)},${Math.floor(p.y / map.tile)}`;
    if (!clearOf(p)) problems.push(`${where} is inside a garrison's aggro radius`);
    else if (!shy[tileIndexOf(map, p)]) problems.push(`no route to the ${where} clear of every garrison`);
  }
  for (const p of map.playerSpawns.slice(0, map.squadSize)) {
    if (!shy[tileIndexOf(map, p)]) problems.push('a squad spawn starts inside a garrison');
  }
  return problems;
}

const files = (await readdir(DATA)).filter((f) => f.endsWith('.map')).sort();
assert.ok(files.length >= 1, 'no .map files in data/ -- run tools/generate-levels.mjs');

const maps = [];
for (const file of files) {
  const text = await readFile(join(DATA, file), 'utf8');
  const parsed = parseMap(text, file.slice(0, -4));
  // What the header asked for, read straight from the file, so the assertion
  // below compares the parser against the map rather than against itself.
  const declared = /^\s*squad\s*:\s*(\d+)/im.exec(text);
  parsed.declared = declared ? Number(declared[1]) : null;
  maps.push(parsed);
}

// ------------------------------------------------------------ parser basics
check('parser rejects unknown characters', () => {
  assert.throws(() => parseMap('name: bad\n---\n..Z..\n'), /unknown map character/);
});

check('short rows are padded rather than rejected', () => {
  const m = parseMap('name: ragged\n---\n....\n..\n......\n');
  assert.equal(m.width, 6);
  assert.equal(m.height, 3);
  assert.equal(tileAt(m, 5, 1), T.Grass);
});

check('headers drive objective, theme and duration', () => {
  const m = parseMap('name: X\ntheme: arctic\nobjective: survive\nduration: 42\n---\n...\n');
  assert.equal(m.theme, 'arctic');
  assert.equal(m.objective, 'survive');
  assert.equal(m.duration, 42);
});

check('a waves header sets the schedule, and nothing else turns it on', () => {
  const withHeader = (line) => parseMap(`name: X\n${line}\n---\n...\n`);
  assert.equal(parseMap('name: X\n---\n...\n').waves, null);
  assert.deepEqual(withHeader('waves: 5@22').waves, { count: 5, interval: 22 });
  // A bare count takes the default gap, so a map can ask for waves without
  // also having to have an opinion about pacing.
  assert.equal(withHeader('waves: 3').waves.count, 3);
  assert.ok(withHeader('waves: 3').waves.interval > 0);
  // Junk is off rather than a mission that quietly attacks NaN times.
  assert.equal(withHeader('waves: lots').waves, null);
  assert.equal(withHeader('waves: 0').waves, null);
});

check('covert is an alias for reach plus the no-kill rule', () => {
  // The whole point of the modifier: nothing downstream of the parser should
  // ever have to know the word `covert` exists.
  const m = parseMap('name: X\nobjective: covert\n---\n...\n');
  assert.equal(m.objective, 'reach');
  assert.equal(m.nokill, true);
});

check('nokill rides on any objective, not just reach', () => {
  const m = parseMap('name: X\nobjective: rescue\nnokill: true\n---\n...\n');
  assert.equal(m.objective, 'rescue');
  assert.equal(m.nokill, true);
  // And it is off unless asked for, however the objective is spelled.
  assert.equal(parseMap('name: X\nobjective: rescue\n---\n...\n').nokill, false);
  assert.equal(parseMap('name: X\nobjective: rescue\nnokill: yes\n---\n...\n').nokill, false);
});

check('a contradictory pairing is rejected, not quietly preferred', () => {
  // An unknown objective is a typo and falls back; this is a design error and
  // fails, because the alternative is a mission that cannot be completed by
  // playing well and says so only after forty seconds of trying.
  assert.throws(
    () => parseMap('name: X\nobjective: eliminate\nnokill: true\n---\n...\n'),
    /nokill.*eliminate/,
  );
  assert.throws(
    () => parseMap('name: X\nobjective: reach\nnokill: true\nwaves: 3\n---\n...\n'),
    /nokill.*waves/,
  );
});

check('a timelimit is a modifier, and fights with survive', () => {
  const m = parseMap('name: X\nobjective: reach\ntimelimit: 90\n---\n...\n');
  assert.equal(m.timeLimit, 90);
  // `duration` is how long survive wants you to last and `timelimit` is how
  // long you have; declaring both asks the clock to run two ways at once.
  assert.throws(
    () => parseMap('name: X\nobjective: survive\ntimelimit: 90\n---\n...\n'),
    /timelimit.*survive/,
  );
  assert.equal(parseMap('name: X\n---\n...\n').timeLimit, 0);
});

check('the new markers spawn what they claim, and leave grass', () => {
  const m = parseMap('name: X\nobjective: collect\n---\n.k.C.\n');
  assert.equal(m.supplies.length, 1);
  assert.equal(m.officers.length, 1);
  assert.equal(tileAt(m, 1, 0), T.Grass, 'a marker leaves the ground it stood on');
  assert.equal(tileAt(m, 3, 0), T.Grass);
});

check('a marker leaves the ground it was standing on, not always grass', () => {
  // A crate in a sand field used to sit in its own little lawn: one hard-edged
  // green square per entity on every desert and arctic map.
  const sand = parseMap('name: X\n---\n,,,,,\n,,c,,\n,,,,,\n');
  assert.equal(tileAt(sand, 2, 1), T.Sand, 'a crate in sand should leave sand');

  const grass = parseMap('name: X\n---\n.....\n..c..\n.....\n');
  assert.equal(tileAt(grass, 2, 1), T.Grass, 'and grass where the ground is grass');

  // Nearer ground outvotes further ground, so a crate on a sand island in a
  // grass field keeps the island rather than taking the field.
  const island = parseMap('name: X\n---\n.......\n..,,,..\n..,c,..\n..,,,..\n.......\n');
  assert.equal(tileAt(island, 3, 2), T.Sand, 'the island wins over the field around it');
});

check('inherited ground is never a hazard or a tent', () => {
  // Water and quicksand are walkable, and putting a man in one because it was
  // next door changes how the mission plays rather than how it looks.
  const bog = parseMap('name: X\n---\n%%%%%\n%%P%%\n%%%%%\n');
  assert.equal(tileAt(bog, 2, 1), T.Grass, 'a spawn does not inherit quicksand');
  const wet = parseMap('name: X\n---\n~~~~~\n~~c~~\n~~~~~\n');
  assert.equal(tileAt(wet, 2, 1), T.Grass, 'a crate does not inherit water');
  // A tent registers as an extraction zone, so inheriting one would conjure a
  // delivery point out of a crate.
  const camp = parseMap('name: X\n---\nAAAAA\nAAcAA\nAAAAA\n');
  assert.equal(tileAt(camp, 2, 1), T.Grass, 'a crate does not become a tent');
  assert.equal(camp.extraction.length, 1, 'and the tent block is still one zone');
});

check('a cluster of markers still finds the ground around it', () => {
  // Six men shoulder to shoulder have no un-marked neighbour at radius one, so
  // the search has to widen rather than give up and stamp grass.
  const m = parseMap('name: X\n---\n,,,,,,,\n,,,,,,,\n,,PPP,,\n,,PPP,,\n,,,,,,,\n,,,,,,,\n');
  for (let x = 2; x <= 4; x++) {
    for (let y = 2; y <= 3; y++) assert.equal(tileAt(m, x, y), T.Sand, `spawn at ${x},${y} kept the sand`);
  }
});

check('an unknown theme or objective falls back safely', () => {
  const m = parseMap('name: X\ntheme: lava\nobjective: dance\n---\n...\n');
  assert.equal(m.theme, 'jungle');
  assert.equal(m.objective, 'eliminate');
});

check('off-map reads are solid, so the world is walled in', () => {
  const m = maps[0];
  assert.ok(isSolidAt(m, -1, 5));
  assert.ok(isSolidAt(m, m.width, 5));
});

check('tall grass blocks sight but not shots', () => {
  // A lane of tall grass between two open tiles.
  const m = parseMap('name: X\n---\n.""".\n');
  const a = { x: 8, y: 8 };
  const b = { x: 72, y: 8 };
  assert.equal(hasLineOfSight(m, a, b), false, 'grass should hide you');
  assert.equal(hasLineOfFire(m, a, b), true, 'grass should not stop bullets');
});

check('deep water stays solid, and shots still cross it', () => {
  const m = parseMap('name: X\n---\n.WWW.\n');
  // Solid is what spawn placement, patrol picking, hostage movement, formation
  // slots and the completability fill below all read. If this ever flips,
  // reinforcements appear in the river and hostages walk into the sea.
  assert.ok(isSolidAt(m, 2, 0), 'deep water is not somewhere to put anything');
  assert.equal(hasLineOfFire(m, { x: 8, y: 8 }, { x: 72, y: 8 }), true);
});

check('deep water is passable to a swimmer and to nobody else', () => {
  const m = parseMap('name: X\n---\n.WWW.\n.TTT.\n');
  assert.equal(blocksMovement(m, 2, 0, false), true, 'a walker is stopped by the river');
  assert.equal(blocksMovement(m, 2, 0, true), false, 'a swimmer is not');
  // Trees are not water: swimming buys you the river and nothing else.
  assert.equal(blocksMovement(m, 2, 1, true), true, 'a swimmer cannot swim through a tree');
  assert.equal(circleBlocked(m, 40, 8, 3), true);
  assert.equal(circleBlocked(m, 40, 8, 3, true), false);
});

check('a swimmer route prices the water rather than ignoring it', () => {
  const m = parseMap('name: X\n---\n.....\n.WWW.\n.....\n');
  const goal = { x: 8, y: 40 };                       // bottom-left, on dry land
  const dry = buildFlowField(m, goal, false);
  const wet = buildFlowField(m, goal, true);
  const i = (tx, ty) => ty * m.width + tx;

  assert.equal(Number.isFinite(dry.dist[i(2, 1)]), false, 'a walker cannot stand in the river');
  assert.ok(Number.isFinite(wet.dist[i(2, 1)]), 'a swimmer can');
  // One step off dry land into the water costs four, not one.
  const step = wet.dist[i(2, 1)] - wet.dist[i(2, 2)];
  assert.equal(Number(step.toFixed(3)), 4, `a water tile should cost 4, got ${step}`);
  assert.equal(wet.swims, true);
  assert.equal(dry.swims, false);
});

check('trees stop both sight and shots', () => {
  const m = parseMap('name: X\n---\n.TTT.\n');
  assert.equal(hasLineOfSight(m, { x: 8, y: 8 }, { x: 72, y: 8 }), false);
  assert.equal(hasLineOfFire(m, { x: 8, y: 8 }, { x: 72, y: 8 }), false);
});

check('contiguous hut tiles group into one building', () => {
  const m = parseMap('name: X\n---\n.hh..hh.\n.hh..hh.\n');
  assert.equal(m.buildings.length, 2);
  assert.equal(m.buildings[0].kind, 'hut');
  assert.equal(m.buildings[0].tiles.length, 4);
});

check('nearestWalkable escapes solid terrain', () => {
  const m = parseMap('name: X\n---\nTTTTT\nTTTTT\nTT.TT\n');
  const out = nearestWalkable(m, { x: 8, y: 8 });
  assert.ok(!isSolidAt(m, Math.floor(out.x / m.tile), Math.floor(out.y / m.tile)));
});

// ----------------------------------------------------------- every mission
for (const map of maps) {
  check(`${map.id}: parses with a full squad and a stated objective`, () => {
    // Six unless the mission says otherwise. A `squad:` header is how a one-man
    // mission is expressed, so what is worth proving is that a map fields
    // exactly what it declares -- not that every map fields six.
    assert.equal(map.squadSize, map.declared ?? 6,
      `fields the squad it declares (${map.squadSize})`);
    assert.ok(map.playerSpawns.length >= map.squadSize, 'a spawn for every man');
    assert.ok(map.name.length > 0);
    assert.ok([
      'eliminate', 'demolish', 'rescue', 'reach', 'survive', 'covert',
      'hold', 'collect', 'assassinate',
    ].includes(map.objective));
    assert.ok(map.brief.length > 0, 'every mission should explain its new idea');
  });

  check(`${map.id}: nothing spawns inside solid terrain`, () => {
    const points = [
      ...map.playerSpawns, ...map.enemySpawns, ...map.sniperSpawns, ...map.bazookaSpawns,
      ...map.crates, ...map.barrels, ...map.mines, ...map.hostages, ...map.extraction,
      ...map.supplies, ...map.officers,
    ];
    for (const p of points) {
      const tx = Math.floor(p.x / map.tile);
      const ty = Math.floor(p.y / map.tile);
      assert.ok(!isSolidAt(map, tx, ty), `spawn at ${tx},${ty} is inside solid terrain`);
    }
  });

  // Dev ranges put everything on one small field on purpose; they are not
  // missions and the opening-distance rule does not apply to them.
  if (!map.id.startsWith('test-')) {
    check(`${map.id}: no enemy starts within 12 tiles of the squad`, () => {
      /*
       * The mirror of START_CLEAR in generate-levels.mjs, run on the shipped
       * file so hand-written maps obey it too. Twelve tiles is just past a
       * veteran rifleman's notice radius; an enemy inside it is shooting
       * before the player has moved, which is a lost squad, not a hard start.
       */
      const START_CLEAR = 12 * map.tile;
      const enemies = [
        ...map.enemySpawns, ...map.sniperSpawns, ...map.bazookaSpawns, ...map.officers,
      ];
      for (const e of enemies) {
        for (const p of map.playerSpawns.slice(0, map.squadSize)) {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          assert.ok(d >= START_CLEAR,
            `enemy at ${Math.floor(e.x / map.tile)},${Math.floor(e.y / map.tile)} is `
            + `${(d / map.tile).toFixed(1)} tiles from a squad spawn (min 12)`);
        }
      }
    });
  }

  check(`${map.id}: the objective is actually completable`, () => {
    /*
     * Two fills, and which one a map is judged by is the map's own declaration.
     *
     * The strict fill is the default and stays the default: a hut is a wall, so
     * an objective accidentally sealed behind one fails, which is the whole
     * value of this check. A map that declares `gated: true` is saying the
     * puzzle is deliberate -- the way through is a building you level first --
     * and is judged by the fill that treats huts and factories as doors.
     *
     * A map that only passes the second without declaring it still fails, so
     * the puzzle can never happen by accident.
     */
    const seen = reachableFrom(map, map.playerSpawns[0], null, map.gated);
    const at = (p) => seen[Math.floor(p.y / map.tile) * map.width + Math.floor(p.x / map.tile)];

    for (const p of map.playerSpawns) assert.ok(at(p), 'a squad member starts walled in');

    if (map.objective === 'eliminate') {
      const all = [...map.enemySpawns, ...map.sniperSpawns, ...map.bazookaSpawns];
      assert.ok(all.length > 0, 'eliminate map has no enemies');
      for (const p of all) {
        assert.ok(at(p), `enemy at ${Math.floor(p.x / 16)},${Math.floor(p.y / 16)} is unreachable`);
      }
    } else if (map.objective === 'demolish') {
      assert.ok(map.buildings.length > 0, 'demolish map has no buildings');
      // A building only has to be adjacent to reachable ground to be shelled.
      for (const b of map.buildings) {
        const touching = b.tiles.some(([tx, ty]) =>
          [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen[(ty + dy) * map.width + (tx + dx)]),
        );
        assert.ok(touching, `building at ${b.x0},${b.y0} cannot be approached`);
      }
    } else if (map.objective === 'rescue') {
      assert.ok(map.hostages.length > 0, 'rescue map has no hostages');
      assert.ok(map.extraction.length > 0 || map.grid.includes(T.Tent), 'rescue map has nowhere to deliver to');
      for (const p of map.hostages) assert.ok(at(p), 'a hostage is unreachable');
    } else if (map.objective === 'reach') {
      assert.ok(map.extraction.length > 0, 'reach map has no extraction zone');
      for (const p of map.extraction) assert.ok(at(p), 'the extraction zone is unreachable');
    } else if (map.objective === 'survive') {
      assert.ok(map.duration > 0, 'survive map has no duration');
    } else if (map.objective === 'hold') {
      assert.ok(map.duration > 0, 'hold map has no duration');
      assert.ok(map.extraction.length > 0, 'hold map has no zone to hold');
      for (const p of map.extraction) assert.ok(at(p), 'the zone cannot be reached');
    } else if (map.objective === 'collect') {
      assert.ok(map.supplies.length > 0, 'collect map has no supply boxes');
      for (const p of map.supplies) assert.ok(at(p), 'a supply box is unreachable');
    } else if (map.objective === 'assassinate') {
      // Exactly one: two officers would make "the officer" ambiguous in every
      // line of text the mission shows.
      assert.equal(map.officers.length, 1, `expected 1 officer, found ${map.officers.length}`);
      for (const p of map.officers) assert.ok(at(p), 'the officer is unreachable');
    }
  });

  if (!map.nokill) continue;
  check(`${map.id}: the no-kill approach is actually possible`, () => {
    const problems = noKillProblems(map);
    assert.deepEqual(problems, [], problems.join('; '));
  });
}

check('a route through a building counts only when the map declares it', () => {
  /*
   * The rubble puzzle: a wall of huts with the objective behind it.
   *
   * Levelling a building turns its tiles into walkable rubble, so this really
   * is a door -- but only for a map that says so. Undeclared it fails, which is
   * what stops an objective accidentally sealed behind a hut from passing the
   * gate as a "puzzle" nobody designed.
   */
  const art = [
    '.....h.....',
    '.P...h...X.',
    '.....h.....',
  ].join('\n');
  const head = 'name: X\nobjective: reach\n';

  const strict = parseMap(`${head}---\n${art}\n`);
  const zone = strict.extraction[0];
  const reachedStrictly = reachableFrom(strict, strict.playerSpawns[0]);
  assert.equal(reachedStrictly[tileIndexOf(strict, zone)], 0,
    'a hut is a wall to the strict fill');

  const gated = parseMap(`${head}gated: true\n---\n${art}\n`);
  assert.equal(gated.gated, true);
  const reachedThrough = reachableFrom(gated, gated.playerSpawns[0], null, true);
  assert.ok(reachedThrough[tileIndexOf(gated, zone)],
    'a declared map may route through a building it can level');

  // And the squad's own outpost is never a door, whatever the map declares.
  const keep = parseMap(`${head}gated: true\n---\n.....O.....\n.P...O...X.\n.....O.....\n`);
  const throughKeep = reachableFrom(keep, keep.playerSpawns[0], null, true);
  assert.equal(throughKeep[tileIndexOf(keep, keep.extraction[0])], 0,
    'the outpost is the squad\'s to protect, not to knock down');
});

check('a no-kill map is rejected when a sentry stands over the objective', () => {
  /*
   * The case the rule exists for, proved on a map small enough to read.
   *
   * `H` is the hostage and `A` the tent; the `E` on the second map is four
   * tiles from the hostage, well inside a rifleman's eight-tile aggro radius.
   * A squad that is not allowed to kill cannot take that hostage out, so the
   * mission is unwinnable rather than hard -- and it has to fail at the gate
   * rather than after forty seconds of trying.
   */
  const clear = parseMap([
    'name: X', 'objective: rescue', 'nokill: true', '---',
    '.....................',
    '.P.......H.........A.',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '.....................',
    '....E................',   // nine rows below the route: out of everyone's way
    '.....................',
  ].join('\n'));
  assert.deepEqual(noKillProblems(clear), [], 'a hostage clear of the garrison should pass');

  const crowded = parseMap([
    'name: X', 'objective: rescue', 'nokill: true', '---',
    '.....................',
    '.P.......H.........A.',
    '.....................',
    '.........E...........',   // two tiles below the hostage
    '.....................',
  ].join('\n'));
  const problems = noKillProblems(crowded);
  assert.equal(problems.length > 0, true, 'a rifleman beside the hostage should fail');
  assert.match(problems[0], /hostage at 9,1 is inside a garrison/);
});

check('the campaign covers a spread of sizes, themes and objectives', () => {
  const themes = new Set(maps.map((m) => m.theme));
  const objectives = new Set(maps.map((m) => m.objective));
  assert.ok(themes.size >= 3, `expected several themes, got ${[...themes].join(', ')}`);
  assert.ok(objectives.size >= 4, `expected several objectives, got ${[...objectives].join(', ')}`);
  // At least one map noticeably wider than it is tall, and one taller than wide.
  assert.ok(maps.some((m) => m.width / m.height > 1.9), 'no long map');
  assert.ok(maps.some((m) => m.width / m.height < 0.8), 'no tall map');
});

check('every new terrain type appears somewhere in the campaign', () => {
  const seen = new Set();
  for (const m of maps) for (let i = 0; i < m.grid.length; i++) seen.add(m.grid[i]);
  for (const [id, label] of [
    [T.Grass, 'grass'], [T.Sand, 'sand'], [T.Road, 'road'], [T.Tree, 'tree'],
    [T.Water, 'water'], [T.DeepWater, 'deep water'], [T.Bridge, 'bridge'],
    [T.Rock, 'rock'], [T.Hut, 'hut'], [T.TallGrass, 'tall grass'],
    [T.Quicksand, 'quicksand'], [T.Ice, 'ice'], [T.Fence, 'fence'], [T.Tent, 'tent'],
  ]) {
    assert.ok(seen.has(id), `no mission uses ${label}`);
  }
});

console.log(`\n  ${passed} map checks passed across ${maps.length} missions\n`);
