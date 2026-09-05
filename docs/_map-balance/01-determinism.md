# 01 -- Determinism

**Question:** with the same map and the same seed, does the simulation replay
identically -- step for step -- headless and in the browser?

**Answer today: no.** And the cause is not in `sim/`.

Nothing in this folder works until it is yes. A sweep whose seeds do not
reproduce is noise with a column of numbers beside it; a replay URL that shows
a *different* battle from the one that was flagged is worse than no replay.
This is step 0, and nothing starts before it.

---

## The audit

Every file under `game/src/sim/`, plus `render/fog.ts` and `render/fx.ts`
(both stepped by the sim), plus `config.ts`, `types.ts` and `loop.ts`, was
read for sources of non-determinism. The transitive imports the sim makes
*outside* those directories turned out to be where the answer lives.

### Inside `sim/`, `fog.ts`, `fx.ts`: clean

- **No captured `Math.random`.** Every call is `Math.random()` at call time --
  no `const rand = Math.random`, no `rng = Math.random` default parameter, no
  destructure. A global swap reaches all of them.
- **No import-time random tables.** The module-level tables (`names.ts` POOL,
  `world.ts` FALLBACK_ROSTER, `pathfind.ts` NEIGHBOURS, `tiles.ts` TILES,
  `difficulty.ts` DIFFICULTIES/DOCTRINES) are literals. The Fisher-Yates
  shuffle of enemy anchors (`world.ts:410`) runs inside `createWorld`.
- **No module-level counters or caches.** `world.nextId` is created per world
  (`world.ts:361`) and threaded through `makeEnemy` as a `counter` object;
  `pathfind.ts` has no flow-field cache (allocates fresh per call);
  `steering.ts:62`'s module `scratch` array is cleared on every use;
  `arena.ts` is entirely instance-scoped.
- **No ordering hazards.** No `for..in`. Both `.sort()` calls are safe
  (`buildings.ts:197` sorts a permutation; `campaign.ts:290` ties but sort is
  stable). `Set`/`Map` iteration is insertion-ordered and the searches use
  strict `<` so the first candidate wins ties. `SpatialHash.buckets` is only
  ever `get`-queried, never iterated.
- **No wall clock.** Every timer accumulates the passed `dt`.

`Math.random` counts, for the migration:

| file | sites |
|---|---|
| `render/fx.ts` | 42 -- cosmetic particles |
| `sim/world.ts` | 13 |
| `sim/enemies.ts` | 13 |
| `sim/buildings.ts` | 6 (one is a decal seed at `:363`) |
| `sim/troops.ts` | 5 |
| `sim/combat.ts` | 2 |
| `sim/mines.ts` | 1 |
| `sim/arena.ts`, `arena-game.ts`, `step.ts`, `pathfind.ts`, `steering.ts`, `map.ts`, `names.ts`, `objectives.ts`, `vision.ts`, `pressure.ts`, `hostages.ts`, `pickups.ts`, `fog.ts` | 0 |

### One directory over: the break

`sim/` imports the audio layer directly -- `combat.ts:3`, `troops.ts:3`,
`buildings.ts:2`, `hostages.ts:2`, `pickups.ts:2`, `game.ts:2` all pull `sfx*`
functions from `shell/audio.ts`. Headlessly the harness stubs `window` to an
empty object so `ensure()` returns false and the whole audio layer is a no-op.
That is *almost* true.

**`sfxWade` (`shell/audio.ts:347-354`), called from `sim/troops.ts:244` inside
`stepSoldiers`:**

1. It rate-limits first: `gate('wade', 0.12)` compares `performance.now()`
   against a **module-level `lastAt` Map** (`audio.ts:149-154`).
2. On a pass, it immediately evaluates `vary(420, 0.1) + vary(90, 0.12)` (or
   `vary(2200) + vary(900)`) **in argument position** -- two `Math.random()`
   draws -- *before* `burst()`/`thump()` reach the `ensure()` guard.

So whether those two draws happen depends on real elapsed wall-clock time
between wade events. The shared RNG stream desynchronises at the first river,
and every subsequent draw in the world is shifted. `lastAt` also persists
across `createWorld` calls in one process, so run two starts from run one's
gate state. `sfxScream` (`:193`) and `sfxCollapse` (`:279`) gate on the clock
too but draw *after* the guard, so they are wall-clock-coupled but not
RNG-coupled.

**There is no same-seed-twice test anywhere.** `seeded()` appears at four
places in `test/sim.test.mjs` and every one is a single seeded run for
reproducibility of a failure, never an equality assertion. Its own docstring
says it was never meant to carry that weight. Nothing has ever checked.

### Browser vs headless: separately impossible today

Even with the above fixed, a browser run could not match a headless one:

- `render/camera.ts:99-100` draws two `Math.random()` per shaken frame
  (`arena-game.ts:135-138` feeds `world.shake` into it; headless never does).
- `shell/audio.ts:46` builds a ~24k-sample noise buffer from `Math.random` on
  first `ensure()`; `:103/234/292` and `shell/ambience.ts` draw more.
- `loop.ts:20` caps a frame's contribution at 0.25 s and `:25/:31` cap steps
  per frame and **drop** the remainder -- *"whatever we could not simulate this
  frame is dropped rather than owed."* Under load the browser simulates fewer
  steps than wall time implies. The harness runs exactly `round(seconds/DT)`.

The second point is fine as long as the sim's randomness is not the global
stream: a replay may then run *slower* in the browser but never *differently*.
The first two points are why the sim must own its generator rather than the
harness owning `Math.random`.

---

## The fix

> **The world owns its randomness.** Nothing under `src/sim/` may call
> `Math.random`. Nothing cosmetic may draw from the world's generator.

### `src/sim/rng.ts`

Mulberry32, ~25 lines, operating on a state object so it can live on the world
rather than in module scope:

```ts
export interface Rng { s: number }
export const rng = (seed: number): Rng => ({ s: seed >>> 0 });
export function rand(r: Rng): number      // [0, 1)
export function randInt(r: Rng, lo: number, hi: number): number
export function pick<T>(r: Rng, arr: readonly T[]): T
```

The docblock cites the `sfxWade` finding: the reason this file exists is that
the audio layer was eating the stream, and the reason it is per-world rather
than a module global is below.

### Per-world, not module-global

A single generator in module scope fails two real cases in `main.ts`:

- `play()` builds a **throwaway** `createWorld` (`main.ts:420`) so the renderer
  can bake terrain, then the real one. A module generator would spend draws on
  the throwaway and the real world would start mid-stream.
- The attract backdrop's world **persists** across missions (`startBackdrop`
  keeps it and re-prepares it). A mission would advance the backdrop's stream
  and vice versa.

So: `createWorld(map, difficulty, roster?, seed?)`. The `seed` defaults to
`(Math.random() * 2 ** 32) >>> 0` so the browser is unchanged. The existing
`counter` object (`world.ts:361`) becomes `{ nextId, rng }` and is built
*first*, so every pre-world draw already flows through it. Store `world.seed`
and `world.rng`. `makeEnemy` needs no new parameter: `buildings.ts:117/211` and
`arena.ts:406` already pass a world-shaped counter.

### The migration

Replace every `Math.random()` under `src/sim/` with a draw from the world's
generator -- including the decal seed at `buildings.ts:363`, so the rule is
simply *no `Math.random` under `src/sim/`* with no exceptions to remember.
Leave `render/fx.ts` (42 sites), `render/camera.ts`, `shell/audio.ts`,
`shell/ambience.ts` on `Math.random`: cosmetic, and they must never perturb a
gameplay draw.

**Enforce it with a grep in `npm run check`**, not only with a test:

```
grep -rn "Math.random" game/src/sim && echo "sim/ may not use Math.random" && exit 1
```

More than one session edits this tree. The grep is what survives the next
person adding a jitter to `enemies.ts` without reading this file.

### Delete `seeded()`

Delete it from `test/support/sim.mjs` and update its three call sites in
`sim.test.mjs` to pass a seed to `createWorld`. Deleted, not kept as a wrapper:
a test still using the global swap would *mask* a regression back to
`Math.random` in sim, because the swap would cover it.

### `test/determinism.test.mjs`

- Same map + seed for 60 s in **two child processes**, on `river-run` (wading
  -- the exact path that broke) and one elite map (fog). Cross-process is what
  catches wall-clock coupling of any kind; intra-process equality would pass
  with `lastAt` still leaking.
- Fingerprint: every actor's `pos`, `alive`, `state`, plus `kills`, `phase`,
  `nextId`, `grenadesHeld`, `time`. **Exclude `world.fx`** -- it is on
  `Math.random` by design.
- Assert equal. Assert a different seed differs. Assert a second world created
  in the same process after a first matches a fresh process.
- Add to `npm run check`.

### Surface the seed

- `main.ts` logs the mission seed in a dev build (`__DEV__`) at mission start.
  Whether the end-of-mission panel shows it to the player is
  [questions.md](questions.md) #2.
- `arena-game.ts` takes a seed. Whether the backdrop pins a known-good one is
  [questions.md](questions.md) #3.

### What this buys the game, not just the tool

A bug report becomes *"seed 1234 on The Narrows, elite"* and is reproducible.
The arena backdrop can be pinned to a battle somebody chose. And the replay URL
in [02-architecture.md](02-architecture.md) becomes honest.

## Done when

- `grep -rn Math.random game/src/sim` prints nothing, and `check` enforces it.
- `node test/determinism.test.mjs` passes across processes on a wading map.
- The arena backdrop still runs in the browser; the campaign soak still passes.
