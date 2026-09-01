# 003 -- veteran (and rookie) need more enemies

> i played dry run on veteran
> but it was too easy, i just went from left to right and killed everything
> we need more troops in veteran
>
> and probably in rookie too
> check all maps that have these mechanics and rebalance them
>
> on veteran, there needs to be at least 2x enemy on dry run map for example

## Findings

The placements in a `.map` file are identical on every difficulty. The count
difference comes from one lever, and it is small:

- `extraEnemies` (`sim/difficulty.ts:27`): rookie **0**, veteran **0.25**,
  elite **0.5**. Applied at `sim/world.ts:280-287` -- so Dry Run's 10 riflemen
  become **12** on veteran. That is the entire difference the owner felt: +2.
- The extras are placed 12-26px (under 2.5 tiles) beside *existing* posts, in
  map reading order -- so they double up the top-most posts rather than
  thickening the map.
- Snipers, bazookas and officers are never multiplied.
- `describeLevers` (`difficulty.ts:226`) only prints "+N% enemies" at >= 0.4,
  so veteran's +25% is invisible in the menu.
- Maps with huts/waves scale much harder through `spawnInterval`/`maxSpawned`
  (veteran huts trickle 2.6x faster, hold 2x more) -- which is why wave maps
  like cold keep already feel right ([011](011-cold-keep-note.md)) while
  placed-garrison maps like dry run collapse. `extraEnemies` does not touch
  wave maps (they place 0 enemies).

## Classification

Broken, cause found: the placed-enemy lever is a token +25%, invisible, and
badly distributed.

**Decision (Q2, answered 2026-09-01): option 1** -- rookie +25%. Veteran was
given in the brief: 2x on dry run -> `extraEnemies: 1.0`.

## Plan (one sitting)

1. Raise the lever: veteran `0.25 -> 1.0`, elite `0.5 -> 1.6`, rookie `0.25`.
2. Fix distribution: spread extras across *all* anchors (shuffle by seed, not
   reading order) and widen the scatter so they read as a thicker garrison,
   not a clone beside each post.
3. Lower the `describeLevers` threshold so the menu admits the count.
4. Re-run `npm run check` -- and note interaction with
   [010](010-spawn-distance.md): more enemies must not spawn extras inside
   the new start-distance rule, so land 010 first or in the same sitting.
5. Playtest dry run on veteran (`/playtest`) as the calibration map.

## Done when

- Dry run veteran fields >= 20 riflemen (2x placed) and rookie fields the Q2
  number; `npm run check` passes on all fifty maps.
- Extras are distributed across the map, not stacked on the first posts.
- The difficulty description names the increase.
