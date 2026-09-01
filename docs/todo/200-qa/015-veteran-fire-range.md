# 015 -- veteran enemies should shoot from further out

> veteran
> enemies should be able to shoot from a little bit further
> they seem to want to get very close before firing

## Findings

The owner's read is correct and the cause is specific: **fire range scales
with difficulty, standing distance doesn't.**

- `sim/world.ts:130-141`: `fireRange` is multiplied by the lever (veteran
  1.12 -> a rifleman can fire at 6.2 tiles) but `preferredRange` is copied
  unscaled -- 70px = 4.4 tiles on every difficulty.
- `engage()` (`sim/enemies.ts:479-484`) keeps walking while further than
  `preferred * 1.15` (5.0 tiles) -- he does fire while closing, but his
  standing distance is 5 tiles, not 6.2.
- Two aggravators: **rushers** ignore `preferredRange` and close to 1.6
  tiles (veteran ambush maps run rushers at 0.45); and **ambush doctrine**
  shrinks aggro to 6.4 tiles without shrinking fire range, so acquisition
  and firing happen at nearly the same instant, up close.

## Classification

Broken, cause found.

## Plan (well under one sitting)

Scale `preferredRange` by the same `fireRange` lever at `world.ts:140` (one
line), so veteran stands at 78px/4.9t and elite further, while rookie's 0.95
keeps them cosier. Leave rushers alone -- closing is their job. Then
calibrate by feel on dry run veteran with `/playtest` (dry run is the map
the complaint came from, via [003](003-veteran-balance.md)).

## Done when

- On veteran, an engaging (non-rusher) rifleman opens fire and holds at
  visibly longer range than on rookie (playtest, same map, both
  difficulties).
- `npm run check` passes and all missions remain winnable.
