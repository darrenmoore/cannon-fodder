# Progress -- the balance instrument

One line per item. Mark **in progress** before touching one; mark **done** with
the commit hash when it lands. One item, one commit, via `/commit`.

These are **ordered** -- [07-steps.md](07-steps.md) has the dependency chain.
Nothing after 3b counts until 3b is green.

| # | item | status | commit |
|---|---|---|---|
| 0a | [`src/sim/rng.ts`](07-steps.md#step-0----the-world-owns-its-randomness) | | |
| 0b | thread `rng` through `createWorld` / the counter | | |
| 0c | migrate every `Math.random` under `src/sim/`; grep in `check` | | |
| 0d | delete `seeded()`; harness exports `rng` | | |
| 0e | `test/determinism.test.mjs`, cross-process | | |
| 0f | seed surfaced in dev; `ArenaGame` takes a seed | | |
| 1a | [grenade rules out of `game.ts`](07-steps.md#step-1----the-autopilot) into `combat.ts` | | |
| 1b | `src/sim/autopilot.ts` v1 | | |
| 1c | the hook in `Game` and the harness, same point | | |
| 2 | [`#simulate/<map>/<difficulty>/<seed>`](07-steps.md#step-2----the-replay-url) | | |
| 3a | [`runMission`](07-steps.md#step-3----the-runner-and-the-gate): caps, deadlock, loss reason, diagnostics | | |
| 3b | `test/objectives.test.mjs` -- **the gate** | | |
| 4 | [`tools/simulate.mjs`](07-steps.md#step-4----toolssimulatemjs) fork pool | | |
| 5 | [`tools/balance.mjs`](07-steps.md#step-5----toolsbalancemjs) + `balance` row field | | |
| 6 | [`/balance` skill](07-steps.md#step-6----the-skill-and-the-docs), CLAUDE.md row | | |
| 7 | [first baseline](07-steps.md#step-7----the-baseline) and campaign report | | |

## Game bugs surfaced by the gate

Filled in during 3b. One line each: map, what the bot hit, whether a player
would hit it too, the commit that fixed it.

| map | finding | player too? | commit |
|---|---|---|---|

## Day-one anomalies

Filled in at step 7: what the first campaign-wide report flagged, and whether
the owner agrees. This is the tool's first test.

| map | difficulty | z | tier | owner's verdict |
|---|---|---|---|---|

## Notes

- Written 5 Sep 2026 against `main` at `73fe436`. The owner was editing `main`
  at the same time; **verify every `file:line` in this folder** before
  relying on it.
- Measured speeds in [04](04-runner.md#measured-speed) are from a 4-core cloud
  box with an idle squad. Re-measure with the bot attached at step 4's smoke
  sweep and update the table.
