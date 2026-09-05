# 06 -- The agent loop

The scripts run, measure, flag and report. Everything after that -- reading a
diagnostic, opening a replay, guessing why, changing one thing, deciding
whether it worked -- is an agent's job, because the exceptions are the
interesting part and they do not script.

This file becomes **`.claude/skills/balance/SKILL.md`** once the tool exists.
That is the house pattern: `/map`, `/arena` and `/playtest` are the agent
guides, and CLAUDE.md lists them. A `docs/` page can hold reference material;
the *operational* guide is a skill so it loads when it is needed.

## The three jobs

### 1. Review a map

> *"Review The Sink."*  /  *"Is this new map finishable?"*

1. `simulate --map the-sink --seeds 20 --seed <fresh>` (all three
   difficulties; `--difficulty rookie --seeds 5` for a bare finishability
   check).
2. `balance <runs> --report the-sink` writes
   `docs/_map-balance/reports/the-sink/review-NNN.md` with the numbers: every
   cell vs its family median and its target, the tier ratios, the noise
   check, deadlocks and loss reasons, and the diagnostics per difficulty.
3. **Read the diagnostics before the replay.** They usually name the cause:

   | you see | look at |
   |---|---|
   | `deadlock`, `deadlockIntent: demolish` | a hut the flow field cannot reach -- `nearestWalkable`, or a building placed in a treeline |
   | `deadlock`, intent `move` to a hostage | pen enclosed; `findDoorway`-style gap missing |
   | `wadingFraction` > 0.3 on a map with bridges | `stepCost` water weight (`pathfind.ts:128`), or the bridge is too far off the line |
   | `firstContact` < 5 s on rookie | extras landing inside the start-distance rule (200-qa 010) |
   | all deaths one cause in < 15 s | one bazooka/sniper post on the approach; a placement, not a count |
   | `lossReason: nokill` on covert | the route crosses a post; the bot never fires, so this is a mine/barrel/own-grenade or an unavoidable contact |
   | rookie == veteran on expected T | no spawners; `extraEnemies` is the only lever and it is small on this layout |
   | `objectiveProgress` flat from t = X | stalled -- pair with the intent at that time |
   | hit rate collapses on one map | firing at a hut through trees |

4. **Open the replay** for the worst seed:
   `http://localhost:<your port>/#simulate/the-sink/rookie/<seed>` in a dev
   build. Watch the first minute and the stall. Ten seconds of watching settles
   most of what the table only hints at.
5. Write the judgement under the numbers in the report: cause, whether it is
   the map's, the bot's, or the game's, and the proposed change. Commit the
   report.

### 2. Adjust a map

> *"Put The Sink at the median for rookie."*  /  *"Make Cold Keep brutal."*

The loop, bounded:

```
1. state the target: family median x tier, and the |z| <= 2 stopping rule
2. change ONE thing in the CAMPAIGN row (see the vocabulary below)
3. npm run levels && npm run check
4. simulate --map <m> --seeds 40 --seed <FRESH base>
5. balance --report <m>   -> next review-NNN.md
6. inside the threshold? commit (one tweak, one commit, before/after in the message)
   else: at most 5 rounds, then stop and write down why
```

**Rules that are not optional:**
- **Fresh seeds every round.** [05](05-statistics.md#the-two-rules-that-keep-the-loop-honest) #1.
- **One change per round.** Two changes and you do not know which one did it.
- **Five rounds, then stop and report.** An agent chasing a target with fresh
  seeds each round can tweak forever and land somewhere nobody chose.
- **Write the target into the row** (`balance: { tier, note }`) so the next
  agent knows what this map is *for*.
- **`data/*.map` is generated.** Edit the row, never the map file; hand edits
  are lost on the next `npm run levels`. Hand-built maps (`not-a-sound`, the
  Narrows after 012) are edited in their builder function in
  `generate-levels.mjs`.

### 3. Try variants

For a generated map, **a row plus a seed is the map**. Ten seeds of the same
row are ten variants, and it is the cheapest first move -- cheaper than editing
anything, and the one a script *can* do alone:

```
for seed in 10 candidates:  change `seed` in the row -> npm run levels -> simulate --map <m> --seeds 20
pick the variant nearest the target; keep its seed
```

Only if no variant lands does the vocabulary below come out.

## The tweak vocabulary

Every knob is a column on the map's `CAMPAIGN` row in
`game/tools/generate-levels.mjs`. Verified against `populate()`
(`generate-levels.mjs:2035`) and `parseMap` on 5 Sep 2026.

| column | what it moves | direction |
|---|---|---|
| `guards` (default 10) | riflemen placed at hubs; snipers/bazookas = `round(guards / 5)`, alternating | more = harder; the strongest single knob on a placed-garrison map |
| `camps: [{ at: [fx, fy], huts, guards, barrels }]` | a cleared camp at a fractional position with its own huts, guards, barrels, and two mines | adds a second fight; huts add *spawning*, which scales with difficulty far more than placed men |
| `squad` (default 6) | player's men | fewer = harder, and `reach` needs all of them alive |
| `grenades` | starting count (default `startingCount` 2) | fewer = demolish takes longer |
| `waves: 'N@S'` | N waves, S seconds apart, out of standing huts; **disables** `guards` and `camps` placement | pacing, not headcount -- what a wave is worth depends on huts left standing |
| `duration` | seconds for `survive` / `hold` | longer = harder |
| `timelimit` | clock on any other objective | shorter = harder; identical on all difficulties |
| `doctrine` | garrison / patrol / hunters / ambush / swarm -- multiplies into the levers | ambush shrinks aggro (met one at a time); hunters abandon posts to find you; swarm for wave maps |
| `seed` | the whole terrain and placement | the variant knob |
| `w`, `h` | map size | bigger = longer walks, more room to be flanked |
| `layout` | gauntlet / island / ringSiege / delta / coast / crossroads / spiral / ridgeline / causeway / canyon | shape; changes what the other knobs mean |
| `gated` | reachability passes through buildings | needed for through-the-wall style maps |
| `nokill` | the covert modifier | any kill fails; only with `reach` |
| `balance: { tier, note }` | **new** -- the declared target | see [05](05-statistics.md#targets-outliers-anomalies) |

Not on the row, and **not a per-map knob**: the difficulty levers in
`sim/difficulty.ts`. Those move every map at once. *"All elite maps are too
hard, bring X down to Y"* is a lever change: test on one map to learn which
lever moves the number the right way, then sweep and diff against the baseline
to see the campaign shift. Never fix a tier by editing fifty rows.

## The report format

`docs/_map-balance/reports/<map>/review-NNN.md`, numbered per review so the
history of a map's tuning is a folder you can read top to bottom.

```markdown
# The Sink -- review 003

sha 9a1c2f0 · bot v1 · 40 seeds/cell · seeds 5000-5039 · noise spearman 0.86
bot ignores fog; every number compares runs of this bot, not players

## Numbers
| difficulty | n | win | expected T | family median | target | z | casualties | deadlocks | loss reasons |
| rookie     | 40 | 0.90 | 88 s | 96 s (hold) | standard 1.0x | -0.3 | 1.1 | 0 | wipe 4 |
| ...

tier ratios: veteran/rookie 1.6 (band 1.3-1.8 ok) · elite/rookie 2.1 (band 2.5-4.5 LOW)

## Diagnostics (worst seed per difficulty)
rookie seed 5017: lost/wipe at 71 s · firstContact 9 s · deaths: bazooka x4 at (412, 190) in 6 s
replay: #simulate/the-sink/rookie/5017

## Judgement
<agent writes here: cause, whose it is, what to change, or "on target, no change">

## Change made
row: guards 10 -> 12  (commit abc1234)   before: z +2.6   after: z +0.4
```

The numbers block is generated by `balance --report`; the agent edits only
below it.

## Where the AI reads first

When this becomes a skill, its front matter should load, in this order:
this file; `05-statistics.md` for the vocabulary; the current
`baseline.json`; the map's latest `review-NNN.md` if one exists. The skill
should tell the agent what port to run on (never 5199), that the replay needs
`npm run dev` (the route is `__DEV__`), and that `npm run check` is the gate.
