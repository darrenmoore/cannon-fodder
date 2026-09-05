# 02 -- Architecture

Where every piece lives, and why it lives there rather than somewhere that
would have been easier.

## The tree

```
game/
  src/sim/rng.ts                 NEW  mulberry32 over a state object; the only randomness sim/ may use
  src/sim/world.ts               MOD  createWorld(map, difficulty, roster?, seed?) -> world.rng, world.seed
  src/sim/{enemies,buildings,troops,combat,mines,arena}.ts
                                 MOD  Math.random() -> draws from world.rng  (~40 sites)
  src/sim/combat.ts              MOD  canThrowGrenade(world), squadThrow(world, at) -- extracted from game.ts
  src/sim/autopilot.ts           NEW  the squad bot: ONE implementation, run by harness and browser alike
  src/sim/game.ts                MOD  nullable `autopilot`, stepped at one fixed point; uses the extracted rules
  src/main.ts                    MOD  `#simulate/<map>/<difficulty>/<seed>` route, __DEV__ only
  src/sim/arena-game.ts          MOD  accepts a seed
  test/support/sim.mjs           MOD  export Autopilot + rng; step(world, dt, autopilot?); seeded() DELETED
  test/support/mission.mjs       NEW  runMission(map, difficulty, seed, cap) -> one result record
  test/determinism.test.mjs      NEW  same seed, two processes
  test/objectives.test.mjs       NEW  the gate: bot clears all 9 objective types on rookie
  tools/simulate.mjs             NEW  fork-pool sweep -> results.jsonl
  tools/balance.mjs              NEW  stats, targets, anomalies, tier bands, baseline diff, reports
  package.json                   MOD  simulate/balance scripts; determinism + objectives + the grep in `check`
docs/_map-balance/               this folder: design, ledger, and later the data --
  baseline.json                  NEW  the campaign's measured medians, per difficulty x objective family
  reports/<map>/review-NNN.md    NEW  one per review; numbers from the tool, judgement from the agent
.claude/skills/balance/SKILL.md  NEW  the agent guide (06-agent-loop.md becomes this)
```

Raw `results.jsonl` sweeps are gitignored (`docs/_map-balance/runs/`); only
`baseline.json` and the reports are committed. A 3,000-run jsonl is megabytes
of numbers nobody diffs.

## The dependency shape

CLAUDE.md's rule is the whole architecture: `sim/` holds and mutates the
world, `render/` reads it, `ui/` and `shell/` are the machine, and nothing
imports `game.ts` but `main.ts`. Everything new here fits inside that:

- **`autopilot.ts` imports only from `sim/`** -- `orderMove`, `orderAttack`,
  `orderDemolish` (`troops.ts`), `canThrowGrenade`/`squadThrow` (`combat.ts`),
  `squadCentre`/`livingSoldiers` (`world.ts`), `pathfind.ts` if it needs a
  distance. It knows nothing of input, camera or DOM. It is the same shape as
  `arena.ts`: pure world in, orders out.
- **`game.ts` holds a nullable reference** and calls `autopilot.step(dt)` at
  one fixed point. The harness's `step()` calls it at the *identical* point.
  That is the contract that makes a replay the same run.
- **`main.ts` is the only place an autopilot is constructed**, inside a
  `__DEV__` branch. esbuild's `define: { __DEV__: false }` in a production
  build makes that branch dead code, and the module goes with it unless
  something else imports it. The player never carries the bot.
- **The tools and tests import the esbuild bundle** exactly as
  `test/support/sim.mjs` already does -- one `ENTRY` line per export. Nothing
  under `tools/` or `test/` reaches into `src/` by path.

## Why the bot is in `src/`, not `test/support/`

The first draft put it in `test/support/commander.mjs` as JS: a squad AI in the
player's bundle earns nothing, and `sim/` has a dependency rule worth keeping
clean. Both still true. What changed it is the replay.

The owner wants to open a flagged run and *watch* it. That is only the same run
if the browser executes the **same bot code** against the **same seeded world**
at the **same point in each step**. A JS bot in `test/support/` would be a
second implementation to keep in sync with whatever the browser ran, and the
first drift would be invisible until a replay quietly stopped matching the
number that sent you to it -- the exact failure `docs/loop.md` records.

TypeScript also matters more than usual here: `World` is edited by several
sessions, and types are the only thing that tells the bot a field it reads has
been renamed.

## The replay URL

`#simulate/<map>/<difficulty>/<seed>` -- handled where `#arena` is
(`main.ts:846`), inside `__DEV__`:

1. Load the map, `createWorld(map, difficulty, undefined, seed)`.
2. `input.mode = 'spectator'` -- the arena already built this: orders,
   grenades and aim are dropped at source, the camera stays yours because
   looking around is the whole activity (`main.ts:743`, `docs/arena.md`).
3. Attach an `Autopilot`; run the normal mission loop, briefing skipped.
4. Show seed, difficulty, bot version and the objective status in the HUD's
   arena readout slot. `H` hides it as it does in the arena.

Because `loop.ts` drops steps under load, a browser replay may take longer in
wall time than the headless run. It cannot diverge. If it ever does, that is a
determinism regression and the test in [01](01-determinism.md) should have
caught it -- check the grep first.

Whether the route ships unadvertised like `#arena` or stays dev-only is
[questions.md](questions.md) #4. The plan assumes dev-only.

## Decisions already taken

Each of these was argued once; do not reopen without a new fact.

| Decision | Why |
|---|---|
| **Per-world RNG, not a module global.** | `main.ts:420` builds a throwaway world before the real one; the attract backdrop's world persists across missions. Either corrupts a shared stream. |
| **`fx.ts`, camera, audio, ambience stay on `Math.random`.** | Cosmetic. The rule is "no `Math.random` under `src/sim/`", enforced by grep, with no exceptions to remember. |
| **Fresh roster every run.** | Rank changes the firing solution (`veteranEdge`, `troops.ts:337`). A promoted squad quietly makes a map look easier. `createWorld` with no roster does this. |
| **Fixed 1/60 step, never varied.** | Steering, collision and fire rates are tuned to it; `sim.mjs` says so. Speed comes from parallelism only. |
| **Bot ignores fog.** | `vision` is an elite lever and a fog-respecting bot is a *searching* bot, whose search quality then becomes the thing measured. Stated in every report header instead. |
| **Bot rethinks every 0.75 s, re-orders only on changed intent, with hysteresis on the threat override.** | Every order rebuilds a flow field (~2.5 ms on a 9,680-tile map) and re-rolls the formation. An order every step never lets a formation settle and halves throughput. |
| **Rifles do level huts.** | 6 soldiers x 0.34 s `fireInterval` = ~17 rounds/s against `hutHp` 60. `orderDemolish` already puts them on the building. Crates are a detour when empty, not a prerequisite. |
| **Primary hardness unit: expected time to clear** (mean run time / win rate). | One number that unifies "slow win" and "retry one often". The Narrows is *meant* to score high on it. See [05](05-statistics.md). |
| **Scripts measure, agents judge.** | The exceptions are the interesting part and they do not script. See [06](06-agent-loop.md). |

## What rolls back into the game

Not the bot -- what the bot *finds*. In expected order:

1. **The grenade rules leave `game.ts`** (step 1a, deliberately first).
   `Game.tryGrenade` (`game.ts:172`) owns stock, cooldown and the
   nearest-non-wading-thrower rule; the bot must obey the same three. One copy
   in `combat.ts`, both callers use it.
2. **Stuck handling in `troops.ts`** -- `unstick`, `reslot`, `nearestWalkable`.
   A formation slot inside a treeline is the same bug for a player's click.
3. **Route quality in `pathfind.ts`** -- the water weight in `stepCost`
   (`pathfind.ts:128`). The bot uses `orderMove`, i.e. the same flow field a
   click builds; if the bot swims the map, so would the player.
4. **A loss reason on the world.** `isFailed` (`objectives.ts:183-204`)
   collapses wipe / time limit / nokill / hostage / supplies / keep into one
   `Lost`. The runner derives it; if that proves useful, `world.lossReason`
   is a small change and the end-of-mission panel could say it.

Each of these is one commit, via `/commit`, with the finding in the message.
