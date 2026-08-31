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
  entryPoints: [join(ROOT, 'src', 'map.ts')],
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

// Tile enum, mirrored from tiles.ts.
const T = {
  Grass: 0, Sand: 1, Tree: 2, Water: 3, Bridge: 4, Rock: 5, Hut: 6,
  DeepWater: 7, TallGrass: 8, Quicksand: 9, Ice: 10, Road: 11, Fence: 12,
  Rubble: 13, Factory: 14, Tent: 15,
};

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};

/** Walkable flood fill from a point, matching the engine's solid set. */
function reachableFrom(map, start) {
  const seen = new Uint8Array(map.width * map.height);
  const sx = Math.floor(start.x / map.tile);
  const sy = Math.floor(start.y / map.tile);
  if (isSolidAt(map, sx, sy)) return seen;
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
      if (seen[ni] || isSolidAt(map, nx, ny)) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

const files = (await readdir(DATA)).filter((f) => f.endsWith('.map')).sort();
assert.ok(files.length >= 1, 'no .map files in data/ -- run tools/generate-levels.mjs');

const maps = [];
for (const file of files) {
  maps.push(parseMap(await readFile(join(DATA, file), 'utf8'), file.slice(0, -4)));
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

check('deep water blocks movement but not shots', () => {
  const m = parseMap('name: X\n---\n.WWW.\n');
  assert.ok(isSolidAt(m, 2, 0), 'deep water is impassable');
  assert.equal(hasLineOfFire(m, { x: 8, y: 8 }, { x: 72, y: 8 }), true);
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
    assert.equal(map.playerSpawns.length, 6, 'six soldiers, as in the original');
    assert.ok(map.name.length > 0);
    assert.ok(['eliminate', 'demolish', 'rescue', 'reach', 'survive'].includes(map.objective));
    assert.ok(map.brief.length > 0, 'every mission should explain its new idea');
  });

  check(`${map.id}: nothing spawns inside solid terrain`, () => {
    const points = [
      ...map.playerSpawns, ...map.enemySpawns, ...map.sniperSpawns, ...map.bazookaSpawns,
      ...map.crates, ...map.barrels, ...map.mines, ...map.hostages, ...map.extraction,
    ];
    for (const p of points) {
      const tx = Math.floor(p.x / map.tile);
      const ty = Math.floor(p.y / map.tile);
      assert.ok(!isSolidAt(map, tx, ty), `spawn at ${tx},${ty} is inside solid terrain`);
    }
  });

  check(`${map.id}: the objective is actually completable`, () => {
    const seen = reachableFrom(map, map.playerSpawns[0]);
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
    }
  });
}

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
