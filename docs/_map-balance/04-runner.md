# 04 -- The runner

Two layers. `test/support/mission.mjs` runs **one** mission and returns one
record; `tools/simulate.mjs` runs **many** in parallel and writes one JSON line
each. The objective gate sits between them and uses only the first.

## Measured speed

On this box (4 cores, node 22), idle squad, 100 simulated seconds:

| map | difficulty | actors | fog | x real time |
|---|---|---|---|---|
| the-long-white | veteran | 31 | no | **2,326x** |
| cold-keep | veteran | 16 | no | 1,834x |
| training-fire | veteran | 16 | no | 847x |
| chicken-run | rookie | 20 | no | 861x |
| chicken-run | veteran | 28 | no | 682x |
| chicken-run | elite | 35 | **yes** | 293x |
| long-road | rookie | 34 | no | 486x |
| long-road | veteran | 50 | no | 300x |
| long-road | elite | 63 | **yes** | **173x** |

Two things follow:

- **Elite costs ~2x** -- more actors from `extraEnemies`, plus the fog
  recompute. The case the owner cares most about is the slowest to measure.
- **The bot halves it on big maps.** `buildFlowField` is 2.5 ms per call on
  long-road (9,680 tiles), 0.5 ms on training-fire. At a 0.75 s cadence that
  is 3.4 ms per simulated second on long-road -- against ~3.3 ms of simulation.
  Hence the cadence and the intent-change rule in [03](03-autopilot.md).

**The hard limit is the fixed 1/60 step.** There is no faster clock to run the
sim on; speed is steps per second, and the only lever is running more
processes. Never vary `dt` to go faster -- it changes behaviour.

**Budget:** 50 maps x 3 difficulties x 20 seeds = 3,000 runs. At ~1.5 s
average that is ~75 min on one core, **~19 min on four**. Filters make the
common case seconds.

---

## `runMission(map, difficulty, seed, cap)`

Returns one record:

```jsonc
{
  "map": "the-sink", "difficulty": "rookie", "seed": 4471,
  "outcome": "won" | "lost" | "timeout" | "deadlock",
  "lossReason": null | "wipe" | "timelimit" | "nokill" | "hostage" | "supplies" | "keep",
  "time": 138.4,                 // simulated seconds at end
  "casualties": 2, "kills": 14, "enemyTotal": 16,
  "grenades": 3, "shotsFired": 412, "shotsHit": 97,
  "wipeTime": null,              // seconds, if outcome was a wipe
  "orders": 41,
  "deadlockAt": null, "deadlockIntent": null,
  "botVersion": 1, "sha": "73fe436",

  // diagnostics -- see below
  "wadingFraction": 0.04, "pathRatio": 1.3, "firstContact": 22.1,
  "deaths": [{ "t": 61.2, "cause": "bazooka", "x": 812, "y": 240 }],
  "objectiveProgress": [[0,0],[10,0],[20,1],[30,1] ...]   // [t, done]
}
```

### The step

```
for each step:
  autopilot.step(DT)          // same point as Game.step
  stepWorld(world, DT, { manualAim: null, cursor: null })
  resolvePhase(world, DT)     // sets world.phase and world.status
  sample diagnostics every 60 steps
  stop on phase != Playing, on cap, on deadlock
```

Fresh roster (`createWorld` with no roster). Seeded via `createWorld`'s fourth
argument -- **never** via a global swap; [01](01-determinism.md) says why.

### Cap

| map | cap |
|---|---|
| has `timelimit` | that -- never shorter, or a timeout is mis-attributed as the map's own limit |
| `survive` / `hold` | `duration + 90` |
| otherwise | 300 s |

Reported as `timeout`, distinct from deadlock: a timeout was still making
progress.

### Deadlock

No objective progress **and** the squad centre displaced less than 48 px, over
a 45 s window. Both, because a squad can shuffle in place against a tree for a
long time (`slotStuck`) and a squad can walk a long way toward nothing.

Progress is `evaluate().done` -- but **read it from the pass `resolvePhase`
already made**, do not call `evaluate` a second time per step: it mutates
`timeLeft` and `heldFor` and sets `inZone`. Either cache `done` from a wrapper
around `resolvePhase`, or compute progress from world state per objective
(buildings down, hostages delivered, boxes collected, kills, `heldFor`, zone
occupancy). The second is more code and cannot double-count; prefer it.

Record `deadlockIntent` -- what the bot was trying to do -- so the report can
say *"stuck at 3/5 huts, intent: demolish hut #4"* without a replay.

### Loss reason

`isFailed` (`objectives.ts:183-204`) records nothing, only returns true. Derive
the reason in the same order it checks: no living soldiers -> `wipe`;
`nokill && kills > 0` -> `nokill`; `timeLimit` reached -> `timelimit`; a dead
undelivered hostage -> `hostage`; a destroyed uncollected supply -> `supplies`;
the keep down -> `keep`. If this proves useful, put it on the world
([02](02-architecture.md#what-rolls-back-into-the-game) #4).

### Diagnostics

Cheap to compute, and each one points at a *cause* before anybody opens a
replay. They are the part of the record an agent reads first.

| field | what | what a bad value usually means |
|---|---|---|
| `wadingFraction` | soldier-seconds in water / total soldier-seconds | The route swims. The bot uses `orderMove`, i.e. the same flow field a player's click builds, and `stepCost` already charges water several times its length (`pathfind.ts:128`) -- so this is the *player's* route too. Fix the weight or the bridge. |
| `pathRatio` | distance actually walked / straight-line distance from spawn to the (first) objective | > 2: a detour worth looking at. |
| `firstContact` | seconds until the first enemy shot fired | ~0 on rookie: the start-distance rule ([200-qa 010](../todo/200-qa/010-spawn-distance.md)) is being broken by extras or spawns. |
| `deaths[]` | per casualty: time, cause, position | Five men to one bazooka in ten seconds is a different finding from five to attrition over three minutes. |
| `objectiveProgress[]` | `[t, done]` every 10 s | "Stalled at 3/5 from t = 90" is visible in the numbers. |
| `shotsFired` / `shotsHit` | already on the world (`shotsFired`, `shotsHit`) | Hit rate collapsing on one map = they are firing at something they cannot hit (a hut through trees). |

Cause for `deaths[]` needs the killer's kind. `combat.ts` knows it at the
moment of the hit; the cheapest path is a `world.deaths: Death[]` log pushed
where a soldier's `alive` flips, recording `{ t, cause, pos }`. Small, and the
end-of-mission stats panel (201-qa 011) may want it too.

---

## The objective gate

`test/objectives.test.mjs`. **Nothing after this counts until it passes.**

For each of the nine objective types, one or two representative maps, rookie,
five fixed seeds:

| objective | maps |
|---|---|
| eliminate | training-fire, chicken-run |
| reach | river-run, long-road |
| demolish | (pick the smallest generated one) |
| collect | (smallest) |
| rescue | ice-station |
| hold | hold-the-junction |
| survive | last-stand |
| assassinate | (smallest) |
| covert | softly-softly |

Assert: win rate >= 80 %, zero deadlocks, zero throws, no `NaN` anywhere in
the fingerprint. Runs in `npm run check` (rookie only, ~30 s). Every failure
is triaged with the replay open and the question in
[03](03-autopilot.md#where-this-will-fail-first-and-what-to-do).

---

## `tools/simulate.mjs`

```
node tools/simulate.mjs [--map a,b | --all | --objective reach]
                        [--difficulty rookie,veteran,elite]   default: all three
                        [--seeds 20] [--seed 1]               seeds are seed..seed+N-1
                        [--limit s]                            override the cap
                        [--jobs 4]                             default: os.cpus().length
                        [--out docs/_map-balance/runs/<date>-<sha>.jsonl]
```

### Parallelism

`child_process.fork`, one worker per job slot. The parent owns the job list
(map x difficulty x seed) and the output file; workers import the harness once
(~0.7 s each, the esbuild build + data-URL import) and pull jobs over IPC one
at a time. Fork rather than `worker_threads` because:

- the parent can **kill a worker on a 30 s wall-clock cap** -- an infinite loop
  in the bot must not hang a sweep; the job is recorded as `crashed` and the
  worker respawned;
- a crash costs one job, not the process;
- there is no shared state to reason about.

Each output line carries `botVersion` and the git `sha`, because a sweep from
a different bot is not comparable to this one and the file has to say so.

### Smoke first

Before spending 3,000 runs: `--all --difficulty rookie --seeds 3`. It measures
real throughput with the bot attached and catches a bot that hangs on some map
nobody tried. About three minutes.

### On the cloud

The container is ephemeral and reclaimed on inactivity. A sweep is ~20 min;
commit `baseline.json` and any report the moment they exist, not at the end of
the session. Raw jsonl stays gitignored.
