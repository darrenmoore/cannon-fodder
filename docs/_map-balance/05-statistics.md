# 05 -- Statistics

What gets measured, where the campaign's baseline lives, and the vocabulary
that keeps "outlier" from meaning "wrong".

## The metric

**Expected time to clear** = mean run time / win rate, per (map, difficulty).

One number that unifies "a slow win" and "a retry-one-often". A map that takes
90 s and is won 100 % scores 90. A map that takes 60 s and is won 25 % scores
240 -- four attempts of a minute each. The Narrows was *designed* to be the
second kind ([200-qa 012](../todo/200-qa/012-narrows-harder.md): *"it's a quick
dash, but it should be a retry one often"*), and on this metric it scores
high on purpose. That is the point of the metric: it does not decide that
losing is bad.

Secondary: **casualties per win** (most player-legible, least sensitive to bot
pathing). Reported but never used alone for a verdict: **win rate** (almost
entirely a function of bot skill, which is the thing we agreed not to trust).

Work in `log(expected time)` for anything statistical. Times are skewed; the
log is roughly symmetric and a 2x change is the same distance everywhere.

## Seeds

| use | seeds per cell | why |
|---|---|---|
| the objective gate | 5 | pass/fail, not an estimate |
| a campaign sweep | 20 | SE of a win rate is ~0.11 at p = 0.5; the log-time median is stable enough to rank maps |
| a single-map confirm run | 40 | the number that decides a tweak landed deserves the tightest estimate |

## The noise check, before anything is flagged

If a single map's spread across seeds is as wide as the spread across all maps,
the instrument cannot tell maps apart and no amount of tuning converges --
every flag is sampling noise wearing a map's name.

**Split-half.** Odd seeds vs even seeds. Compute each map's median expected
time from each half. Spearman correlation between the two rankings >= 0.8 means
the instrument resolves maps. Also print the plain number: median within-map
IQR / between-map IQR. `balance.mjs` puts this at the top of every report, and
**refuses to flag anything below the bar** -- it says the sample is too small
instead.

## Targets, outliers, anomalies

"Outlier" is the right word for the flag and the wrong word for the decision.
An outlier is a point far from the others. It is neutral: it says *look here*,
not *this is wrong*. The Narrows is supposed to be brutal; on a flat campaign
average it will be an outlier forever, and that is correct.

So the vocabulary is:

| word | meaning |
|---|---|
| **target** | what a map is *meant* to score, declared on its campaign row |
| **deviation** | how far its measurement is from its target, in robust z |
| **outlier** | far from the *campaign* distribution -- the sorted table, neutral |
| **anomaly** | off its *target* with no declared reason -- **the finding** |

**Declared, not accidental.** Each row in `CAMPAIGN`
(`game/tools/generate-levels.mjs`) gets a `balance` field:

```js
balance: { tier: 'standard' }          // default if absent
balance: { tier: 'hard' }              // deliberately above the family median
balance: { tier: 'brutal', note: '012: a retry-one-often dash' }
```

Tiers map to multipliers on the family median in `baseline.json` (initial:
`standard` 1x, `hard` 1.6x, `brutal` 2.5x -- [questions.md](questions.md) #1).
A map's target is its family median times its tier multiplier; its deviation
is the robust z of its measurement from that. Maps are allowed to be hard.
They are not allowed to be hard *by accident*.

**Flagging.** Within one difficulty, across all maps in one objective family:
robust z = (log x - median) / (1.4826 x MAD). `|z| > 3` is an outlier;
print the sorted table with each map's campaign `order` and tier beside it.
An outlier whose tier explains it is not an anomaly. An outlier with
`standard` tier, or a `brutal` map that scores at the median, is.

Not a fitted curve against `order`: 48 maps across 9 families is not a
regression. Revisit only if the anomalies are all late maps.

## Tier ratios

Per map: `veteran / rookie` and `elite / rookie` on expected time. Against
hardcoded bands in `balance.mjs`:

| | band (initial) |
|---|---|
| veteran / rookie | 1.3 - 1.8x |
| elite / rookie | 2.5 - 4.5x |

The owner's numbers (*"veteran 1.5x, elite 3-4x"*), widened to bands.
[questions.md](questions.md) #1. Gate on **the campaign median ratio inside
the band AND at most k maps outside it** -- so a few deliberately harder maps
pass and a whole tier that has drifted does not.

A map where rookie == veteran on expected time is its own finding: it does
not respond to the levers. Usually a placed-garrison map with no spawners,
which `extraEnemies` barely touched before 003.

## The baseline file

`docs/_map-balance/baseline.json`. Scripts compute it, scripts and agents both
read it; the markdown reports are generated *from* it. This is what "what
should the z-score be" means.

```jsonc
{
  "sha": "73fe436", "botVersion": 1, "date": "2026-09-06",
  "seedsPerCell": 20,
  "noise": { "spearman": 0.87, "withinOverBetween": 0.41 },
  "families": {
    "rookie":  { "reach": { "n": 9, "medianLogT": 4.51, "mad": 0.22, "medianCasualties": 0.8 }, "..." : {} },
    "veteran": { },
    "elite":   { }
  },
  "tiers": { "standard": 1.0, "hard": 1.6, "brutal": 2.5 },
  "bands":  { "veteranOverRookie": [1.3, 1.8], "eliteOverRookie": [2.5, 4.5], "maxOutside": 6 },
  "maps": {
    "the-sink": {
      "objective": "hold", "order": 21, "tier": "standard",
      "rookie":  { "n": 20, "winRate": 0.85, "expectedT": 96, "z": 0.3, "casualties": 1.2, "deadlocks": 0 },
      "veteran": { "...": 0 },
      "elite":   { "...": 0 }
    }
  }
}
```

**Stamped with `sha` and `botVersion`.** The moment the bot changes, every
number in it is stale, and `balance.mjs` refuses to compare a run against a
baseline from a different bot version -- it prints both versions and stops.

Regenerated by `balance --write-baseline` from a full sweep. Committed. Old
ones kept as `baseline-<sha>.json` for `--baseline` diffs: move a lever,
re-sweep, see the whole campaign shift. Nothing else in the repo can answer
*"what did that lever do"* today.

## `tools/balance.mjs`

```
node tools/balance.mjs <runs.jsonl> [--baseline docs/_map-balance/baseline.json]
                                    [--write-baseline]
                                    [--report <map>]      -> reports/<map>/review-NNN.md
                                    [--json summary.json]
```

Prints, in order:

1. Header: sha, bot version, seeds per cell, **the noise check**, and the line
   *"bot ignores fog; numbers compare runs of this bot, not players"*.
2. Per family per difficulty: the sorted table (map, order, tier, n, win %,
   expected T, z, casualties, deadlocks, loss reasons).
3. Anomalies, with the diagnostic that most likely explains each (highest
   `wadingFraction`, lowest `firstContact`, dominant death cause).
4. Tier ratios: campaign median per band, maps outside, pass/fail.
5. If `--baseline`: every cell that moved by more than 1 MAD, sorted by size.

## The two rules that keep the loop honest

**1. The confirm run uses fresh seeds.** A map flagged as extreme was flagged
*partly* because its seeds ran hot. Re-run those seeds after a tweak and it
moves toward the mean even if the tweak did nothing -- regression to the mean
takes credit for your change. `simulate --seed <new base>` for every confirm.

**2. The stopping rule is a threshold, not zero anomalies.** With any finite
sample some maps sit at the tails by construction. Tune until nothing is
flagged and you have fifty identical missions -- the opposite of a campaign.
Stop when `|z| <= 2` against the map's *target*, and write the target you
were chasing into the row.
