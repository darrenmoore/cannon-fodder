# 011 -- three more lines on the end-of-mission panel

> End-of-mission stats. The sim already counts kills, time, casualties and
> best-ever marks; the end panel (redone in 200-qa 026) shows a fraction of it.
> Three more lines -- shots fired, accuracy, time against your best -- cost
> almost nothing and give the "one more go" itch a number to chase. Pairs with
> the par idea in modes.md.

## Findings

Mostly right, with two corrections that change the work.

**What the panel shows today** (`hud.ts:305-415`): the title, the difficulty
rung, "N of M came home" or the failure reason, a record ribbon row
(`best yet` / `fastest` / `first clear`), the dead, promotions, and the three
buttons. **No kill count and no mission time at all** -- "shows a fraction of
it" is generous.

**What the sim actually counts:**

- `world.kills` (`world.ts:83`), incremented at `combat.ts:273`. Counts every
  actor killed, and `damage()` is shared -- worth checking it is not counting
  hostages or friendly fire before printing it as a score.
- `world.time` (`world.ts:82`) and `world.enemyTotal`.
- `MissionRecord { bestHome, bestTime, clears }` (`campaign.ts:105-112`).

**Correction 1: shots fired does not exist.** Nothing counts them. `fire()`
(`combat.ts:25-57`) is the single call site for every bullet in the game,
player and enemy, so adding `world.shotsFired++` there behind a
`faction === Faction.Player` check is one line -- but it is a new counter, not
an existing one. Hits need a second: `damage()` at `combat.ts:257` is likewise
the only place hit points come off, so `world.shotsHit++` goes there when the
bullet was the player's. Accuracy is then the ratio, and it needs a floor
(shots fired of zero on a stealth clear must print `--`, not `NaN`).

Bazooka rounds and grenades muddy the ratio: a grenade that kills four is not
four hits. Recommend counting **rifle rounds only** -- the counter goes in
`fire()`, grenades never pass through it, so this falls out for free as long
as nobody later routes grenades through `fire()`.

**Correction 2: "time against your best" is destroyed before the panel
reads it.** The order in `main.ts` is:

- `main.ts:416` -- `hud.record = campaign.records[info.id]` (the *previous*
  best; correct, and what the sidebar par dangles).
- `main.ts:422-433` -- `game.onResolved` calls `recordMission(...)`, **which
  writes the new record**, and then re-assigns `hud.record` to the updated
  one.
- The HUD then draws the panel.

So by the time the panel is built, `hud.record.bestTime` is already this
attempt's time whenever the attempt was a personal best -- printing "vs best"
would print "vs itself, +0:00" on precisely the run worth celebrating.

The fix is to carry the previous mark forward: add `prevBestTime: number` and
`prevBestHome: number` to `Aftermath` (`campaign.ts:142-152`), captured inside
`recordMission` before it updates `records[missionId]`, and read those on the
panel. `Aftermath` already carries `recordTime`/`recordHome` booleans computed
at exactly that moment, so the capture point exists.

**modes.md** -- referenced by the brief. Confirm what the par idea there says
before choosing the wording, so the two agree.

## Classification

**New work**, small, with one trap (correction 2) that is invisible until you
hit it.

## Plan

One sitting.

1. `world.ts`: add `shotsFired: number` and `shotsHit: number`, initialised to
   0 beside `kills` (`world.ts:470`).
2. `combat.ts`: `world.shotsFired++` in `fire()` when
   `shooter.faction === Faction.Player`; `world.shotsHit++` in `damage()` on
   the same condition for the source.
3. `campaign.ts`: add `prevBestTime` and `prevBestHome` to `Aftermath`,
   captured in `recordMission` before the record is written. Both `Infinity` /
   `0` when there is no prior record.
4. `hud.ts`: a `result-stats` row under `result-sub`, three lines:
   - `KILLS  n of m`
   - `SHOTS  n   ACCURACY  nn%` (accuracy omitted below ~5 shots)
   - `TIME  m:ss   BEST  m:ss (+/-s)` -- and on a first clear, `TIME  m:ss
     FIRST CLEAR` rather than a comparison against infinity.
5. Style it with the existing result tokens; no new plate.
6. Show the stats on a **loss** too. A failed run's accuracy is the number
   that makes the retry feel earned, and `Aftermath` is returned for losses
   (`campaign.ts:345-347`).

## Done when

- Winning a mission for the first time shows kills, shots, accuracy and
  `FIRST CLEAR` -- not `vs 0:00` and not `NaN%`.
- Beating your own time shows the *previous* best in the comparison, and the
  `fastest` ribbon at the same time. This is the case that fails without
  step 3; assert it in a playtest by clearing a mission twice.
- A clear with zero shots fired prints `--` for accuracy.
- The loss panel shows the same three lines.
- `npm run check` passes, including `test/campaign.test.mjs` after the
  `Aftermath` change.
