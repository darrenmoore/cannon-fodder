# 07 -- The steps

Ordered. Each is one or two commits via `/commit`, marked in
[progress.md](progress.md) before it starts and with its hash when it lands.
`npm run check` (from `game/`) passes at the end of every one -- it is the
gate, and a step that leaves it red is not done.

```
0a -- 0b -- 0c -- 0d -- 0e --+-- 1a -- 1b -- 1c -- 2 -- 3a -- 3b --+-- 4 -- 5 -- 6 -- 7
      (the world owns its RNG)   (bot, replay, gate)                 (sweep, stats, docs, baseline)
                                 ^ nothing after 3b counts until 3b passes
```

---

## Step 0 -- The world owns its randomness

Read [01-determinism.md](01-determinism.md) in full first.

**0a. `src/sim/rng.ts`.** Mulberry32 over `{ s }`; `rng(seed)`, `rand(r)`,
`randInt(r, lo, hi)`, `pick(r, arr)`. Docblock: why it exists (the `sfxWade`
finding), why per-world (the throwaway world and the backdrop).

**0b. Thread it.** `createWorld(map, difficulty, roster?, seed?)`. Build
`counter = { nextId: 1, rng: rng(seed ?? random32()) }` first thing; store
`world.seed`, `world.rng`. Check every caller of `makeEnemy` still passes a
world-shaped counter (`buildings.ts`, `arena.ts`).

**0c. Migrate.** Every `Math.random()` under `src/sim/` -> `rand(world.rng)`
(or the counter's, inside `createWorld`). Include `buildings.ts:363`. Add the
grep to `check`. Leave `fx.ts`, camera, audio, ambience alone.

**0d. Delete `seeded()`** from `test/support/sim.mjs`; fix the three call
sites in `sim.test.mjs`. Export `rng` from the harness `ENTRY`.

**0e. `test/determinism.test.mjs`.** Two child processes, `river-run` 60 s and
one elite map 60 s, same seed; fingerprint excluding `fx`; equal. Different
seed differs. Second-world-in-process equals fresh-process. Into `check`.

**0f. Surface.** Dev-build console line with the seed at mission start
(`main.ts`); `ArenaGame` takes a seed.

*Verify:* grep prints nothing; determinism test green; the campaign soak and
`waves.test.mjs` still green; the backdrop still runs in the browser.

---

## Step 1 -- The autopilot

Read [03-autopilot.md](03-autopilot.md).

**1a. Grenade rules out of `game.ts`.** `canThrowGrenade(world)` and
`squadThrow(world, at)` in `combat.ts`; `Game.tryGrenade` calls them and keeps
only the popups and the `input.aim.thrower` preference. Export both from the
harness. *This is a roll-back into the game and it goes first, so the bot
never has a second copy of the rules.*

**1b. `src/sim/autopilot.ts`.** Intent table, threat override with
hysteresis, `nokill` guard, grenade targeting, crate detour, 0.75 s cadence,
intent-change-only orders, `version = 1`. Export from the harness.

**1c. Hook.** `Game` gets `autopilot: Autopilot | null`, stepped before
`stepWorld`. Harness `step(world, dt, autopilot?)` does the same. Add
`sim.mjs`'s docblock line: *the point is arbitrary; that it is the same point
in both is not.*

*Verify:* `tsc` clean; a ten-line script in the scratchpad runs
`training-fire` rookie with an autopilot and reaches `Phase.Won`.

---

## Step 2 -- The replay URL

Read [02-architecture.md](02-architecture.md#the-replay-url).

`#simulate/<map>/<difficulty>/<seed>` in `main.ts` beside `#arena`, under
`__DEV__`. Spectator input mode, autopilot attached, HUD readout with seed +
bot version + objective status. Clear the fragment on the way out.

*Verify:* in `npm run dev` on your own port, open
`#simulate/training-fire/rookie/1` and watch it win. Open it twice; confirm
`window.game.world.time`, kills and casualties match at the end. Open the same
seed headlessly and confirm the outcome and time match the browser.

---

## Step 3 -- The runner and the gate

Read [04-runner.md](04-runner.md).

**3a. `test/support/mission.mjs`.** `runMission` with caps, deadlock
detection (progress from world state, not a second `evaluate`), loss reason,
the diagnostics, `world.deaths` log in `combat.ts` if not already there.

**3b. `test/objectives.test.mjs`.** Nine objective types, representative maps,
rookie, five seeds, win rate >= 80 %, no deadlocks. Into `check`. **Expect it
to fail.** Triage each with the replay open; fix in the bot or the game per
[03](03-autopilot.md#where-this-will-fail-first-and-what-to-do). Each game
fix is its own commit with the finding.

*Verify:* the gate is green on `check`. This is the milestone. Update
[progress.md](progress.md) with the list of game bugs it surfaced.

---

## Step 4 -- `tools/simulate.mjs`

Fork pool, job list in the parent, IPC, 30 s wall-clock kill, jsonl out,
`botVersion` and sha per line, the CLI in [04](04-runner.md#toolssimulatemjs).
`npm run simulate`. Gitignore `docs/_map-balance/runs/`.

*Verify:* `--all --difficulty rookie --seeds 3 --jobs 4` finishes in a few
minutes and every map has three lines. `--jobs 4` is ~4x `--jobs 1`. Kill a
worker mid-sweep; the sweep completes with one `crashed` line.

---

## Step 5 -- `tools/balance.mjs`

Read [05-statistics.md](05-statistics.md).

The metric, the noise check that gates flagging, robust z within family, the
`balance` row field and targets, tier bands with `maxOutside`, anomalies with
their likeliest diagnostic, `--baseline` diff, `--write-baseline`, `--report`
writing `reports/<map>/review-NNN.md` from a template. `npm run balance`.
Add `balance: { tier }` to `CAMPAIGN` rows that already have a verdict
(`the-narrows: brutal` with the 012 note; the training missions `standard`).

*Verify:* run against a sweep with one row deliberately broken
(`guards: 60` on a rookie reach map): it is the top anomaly. Run against a
sweep from a worktree at the commit before 200-qa 003's lever change: Dry Run
veteran is flagged easy, which is what the owner found by hand.

---

## Step 6 -- The skill and the docs

[06-agent-loop.md](06-agent-loop.md) becomes `.claude/skills/balance/SKILL.md`
with front matter (name, description, what to load). Add `/balance` to the
skills table in CLAUDE.md. Link this folder from `docs/design.md` if it lists
docs.

---

## Step 7 -- The baseline

Full sweep, 20 seeds per cell. `balance --write-baseline`. Commit
`baseline.json` and the first campaign-wide report to
`reports/_campaign/review-001.md`. Note in [progress.md](progress.md) which
maps are anomalies on day one -- that list is the owner's first reading of
the tool, and the first test of whether it agrees with what they already know.
