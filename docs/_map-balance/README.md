# The balance instrument

A command that plays any mission with a CPU squad, headlessly, seeded, at
hundreds of times real time -- so a map can be *measured* instead of felt -- and
a URL that replays any of those runs in the browser so a person can watch what
the script saw.

This folder is the whole design, written for the agent that builds it. Nothing
here is built yet. Read this page, then the numbered files in order; they are
an instruction set, and [progress.md](progress.md) is the ledger.

| | |
|---|---|
| [01-determinism.md](01-determinism.md) | Why a seed does not reproduce a run today, the audit that found it, and the fix. **Step 0, and nothing starts before it.** |
| [02-architecture.md](02-architecture.md) | Where every piece lives and why -- the dependency shape, the decisions already taken. |
| [03-autopilot.md](03-autopilot.md) | The squad bot: what it does per objective, what it deliberately does not do, and the bar it has to clear. |
| [04-runner.md](04-runner.md) | `runMission`, the `simulate` sweep, caps, deadlock detection, the per-run diagnostics, parallelism, measured speeds. |
| [05-statistics.md](05-statistics.md) | The metric, the baseline file, targets vs outliers vs anomalies, tier bands, the noise check, the two rules that keep the loop honest. |
| [06-agent-loop.md](06-agent-loop.md) | How an agent reviews a map, adjusts it, tries variants, and writes a report -- the `/balance` skill this folder becomes. |
| [07-steps.md](07-steps.md) | The ordered build, one verification per step. |
| [questions.md](questions.md) | Decisions the owner makes. Answer inline. |
| [progress.md](progress.md) | One line per item, one item one commit. |

## Why this exists

Balance is currently judged one way: the owner plays a map and writes down how
it felt ([200-qa 003](../todo/200-qa/003-veteran-balance.md),
[012](../todo/200-qa/012-narrows-harder.md)). That is the only thing that can
judge *feel*, and it stays. But it does not scale to fifty maps times three
difficulties; it cannot say whether a lever change in `sim/difficulty.ts` moved
every map or only the one that was played; and it cannot find the map nobody
has played yet that deadlocks on elite.

The engine is already most of the way there. `game/test/support/sim.mjs` runs
the whole simulation in node behind two global stubs, at **173x to 2,300x real
time** (measured; see [04-runner.md](04-runner.md#measured-speed)). What it
lacks is anything that *plays the player's side*: the existing soak steps every
mission with an idle squad and checks the world stayed sane. Nothing ever tries
to win.

## What it is, and is not

**A relative instrument.** The bot is not a good player and is not trying to be
one: no cover, no retreat, no fog. Its numbers compare things *run the same way*
-- this map to that one, rookie to elite, before a lever change to after -- and
that is enough to find the map that is nothing like its neighbours. It does not
judge whether a map is interesting. [docs/loop.md](../loop.md) is the standing
warning: **a metric that can lie will eventually be believed.** The defence is
that every verdict is a comparison, and the one signal allowed to stand alone
-- the deadlock detector -- is about the *world*, not about play.

**Scripts measure; agents judge.** Getting the unusual cases into a script --
the squad that swam because the bridge was one tile too far, the eliminate map
that is secretly a demolish map because its huts keep spawning -- is very hard
and not worth it. So the scripts stay dumb and deterministic (run, measure,
flag, report) and the judgement is an agent's, with the replay open. That split
is the design; do not let the scripts grow opinions.

## The questions it answers

> *"Is this new map finishable?"*
> *"Run rookie on every `reach` map, 20 seeds each, and show me the outliers."*
> *"Is veteran actually ~1.5x rookie on this map, and elite ~3-4x?"*
> *"Make The Sink sit at the median for rookie."*
> *"I moved `hearing`. What did it do to the campaign?"*
> *"Seed 4471 on The Sink wiped at 38 s. Show me."*

## The minimal path

The plan looks big because it includes the statistics layer. It is not needed
for the first question.

| Question | Needs |
|---|---|
| Is this map finishable? | Steps 0, 1, 3 -- the core |
| *Why* did it fail? | Step 2 (the replay URL) + the diagnostics |
| Rookie vs veteran vs elite on one map | Step 4 with `--map` |
| Across the campaign, what is off? What did a lever do? | Steps 5-6 -- later |

Steps 0-3 are plumbing on a harness that already runs the campaign in two
seconds. They will work. The real risk is *interpretive* -- whether a failure is
the map's or the bot's -- and the answer to that is the rookie gate plus the
replay, not more code.

## Before you start

- **Verify every `file:line` in this folder against the tree you have.** They
  were read on 5 September 2026 from `main` at `73fe436`; the owner was editing
  `main` at the same time this was written, so treat a reference as a pointer,
  not a fact.
- Read [CLAUDE.md](../../CLAUDE.md), then [docs/arena.md](../arena.md) -- the
  arena is the nearest existing thing to this and its six constraints each cost
  a real failure.
- `npm run check` is the gate. Never say a step is done without it.
- Port 5199 belongs to the owner. Run your own server on another port.
