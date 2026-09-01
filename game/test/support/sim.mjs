/**
 * The whole simulation, running in node.
 *
 * `map.test.mjs` and `campaign.test.mjs` each compile one DOM-free module and
 * test it directly. This is the same trick applied to everything at once, and
 * it turns out to reach much further than either of them assumed: **nothing in
 * `sim/` needs a browser.** Fog is two typed arrays, `Fx` is a list of
 * particles, and the audio layer declines politely when there is no
 * `AudioContext` to be had. So a mission can be created and stepped here, at
 * roughly two hundred times real time, with no Playwright and no server.
 *
 * That matters because the alternative is a browser. Driving the real game is
 * the only way to see some bugs (see `tools/playtest.mjs`, and the standing
 * advice in CLAUDE.md), but it costs seconds per run, which means it is not run
 * — and a regression suite nobody runs is a regression suite that does not
 * exist. The measured cost of the whole campaign here is under two seconds.
 *
 * Two global stubs, and no more than two:
 *
 *   `localStorage` — `campaign.ts` and `settings.ts` read it on import.
 *   `window`       — `audio.ts` reaches for `window.AudioContext` the first
 *                    time a gun goes off, not at import. An empty object makes
 *                    `ensure()` return false and the entire sound layer become
 *                    a no-op. Without it, the three maps whose garrison opens
 *                    fire inside ten seconds throw `window is not defined` and
 *                    the rest pass, which is the worst possible failure mode:
 *                    it looks like a map bug.
 */
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

/** `game/` — this file sits one level deeper than the other test modules. */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.window = {};

/*
 * One entry point re-exporting everything, via esbuild's `stdin`.
 *
 * Deliberately *not* several `entryPoints`. That produces several bundles, each
 * with its own copy of every shared module — so `createWorld`'s `CONFIG` stops
 * being the `CONFIG` the systems read, and the two disagree silently. The first
 * attempt at this file did exactly that.
 */
const ENTRY = `
  export { createWorld, makeEnemy, livingSoldiers, squadCentre } from './src/sim/world.js';
  export { parseMap } from './src/sim/map.js';
  export { stepEnemies, raiseAlarm, raiseNotice } from './src/sim/enemies.js';
  export { stepWorld } from './src/sim/step.js';
  export { Arena } from './src/sim/arena.js';
  export { Fog } from './src/render/fog.js';
  export { stepBuildings, stepWaves, damageBuilding, buildingAt } from './src/sim/buildings.js';
  export { stepSoldiers, orderMove, orderAttack, classifyClick } from './src/sim/troops.js';
  export { stepBullets, stepGrenades, stepDying, fire, throwGrenade } from './src/sim/combat.js';
  export { stepPressure, applyPressure } from './src/sim/pressure.js';
  export { resolveOverlaps } from './src/sim/steering.js';
  export { resolvePhase, evaluate, isFailed } from './src/sim/objectives.js';
  export { stepHostages } from './src/sim/hostages.js';
  export { stepMines } from './src/sim/mines.js';
  export { stepPickups } from './src/sim/pickups.js';
  export { Tile, TILES } from './src/sim/tiles.js';
  export { DIFFICULTIES, DOCTRINES, resolveLevers } from './src/sim/difficulty.js';
  export { CONFIG } from './src/config.js';
`;

const built = await esbuild.build({
  stdin: { contents: ENTRY, resolveDir: ROOT, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  // The debug panel and its one guarded line in combat.ts are dev-only; a test
  // should see what a player sees.
  define: { __DEV__: 'false' },
  logLevel: 'silent',
});

export const sim = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
);

/** The fixed step the whole game is tuned around. Never vary it in a test. */
export const DT = 1 / 60;

/**
 * One ordered pass over a world, plus the objective check that `Game` owns.
 *
 * `stepWorld` is the real thing the game runs (`sim/step.ts`); resolving the
 * phase sits in `Game` because a mission is the only thing that has one, so a
 * test that wants a mission has to add it back.
 */
export function step(world, dt = DT) {
  sim.stepWorld(world, dt, world.map.arena ? null : { manualAim: null, cursor: null });
  // An arena has no objective and `ArenaGame` never resolves one. Resolving it
  // here would lose it on the first step, because a world with no soldiers has
  // by definition lost its squad.
  if (!world.map.arena) sim.resolvePhase(world, dt);
}

/** Runs a world forward by `seconds` of simulated time. */
export function run(world, seconds) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) step(world);
  return world;
}

/**
 * An arena, ready to step: the world, its commanders, and no fog.
 *
 * Mirrors what `ArenaGame` does on construction. The fog line is the one worth
 * repeating rather than assuming -- fog is computed from what the squad can
 * see, and a world with no squad would black out entirely.
 */
export function arena(map, seconds = 0) {
  const world = sim.createWorld(map, 'veteran');
  world.fog = new sim.Fog(map, 0);
  const game = new sim.Arena(world);
  const steps = Math.round(seconds / DT);
  /**
   * Where the front was, once a second.
   *
   * Sampled rather than read at the end, because the end is one instant and the
   * front is not always somewhere: between pushes the two sides separate and
   * there is legitimately no contested ground at all. A single reading of it
   * was the first version of this and it failed about one run in six on a
   * perfectly healthy battle.
   */
  const fronts = [];
  for (let i = 0; i < steps; i++) {
    step(world);
    game.step(DT);
    if (i % 60 === 0) fronts.push(game.front());
  }
  return { world, game, fronts };
}

/**
 * A seeded `Math.random`, for the handful of assertions that need the same
 * fight twice.
 *
 * The simulation reaches for `Math.random` in forty-odd places and threading a
 * generator through all of them is a change to every system for a benefit
 * almost nothing here needs — so this swaps the global for the duration of one
 * call and puts it back. Small, honest, and confined to the tests.
 *
 * Most assertions should still be about *invariants and bounds*, not exact
 * positions. Reach for this only when a test genuinely needs determinism.
 */
export function seeded(seed, fn) {
  const real = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    // xorshift32: cheap, and good enough to shuffle a spawn table.
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}
