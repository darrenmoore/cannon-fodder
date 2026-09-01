# 012 -- the narrows: shorten the clock, make it much harder

> the narrows - veteran
> it gives me 4 minutes but i did it in about 60 seconds
> could be longer maybe
> also it could fork off in a different direction, like a dead-end with LOTS of troops
>
> shorten the time
> make it much harder
>
> it's a quick dash, but it should be a retry one often

## Findings

- `timelimit: 240` comes from the campaign table
  (`tools/generate-levels.mjs:2065-2070`, "Four minutes to the far end") and
  is identical on all difficulties -- nothing scales time limits.
- The garrison is 10 `E` + 1 `S`, ambush doctrine, +3 extras on veteran.
  Ambush shrinks aggro to 6.4 tiles -- barely past the rifleman's own 6.2
  tile fire range -- so men are met one at a time and die where they stand.
- The map is generated (canyon layout, seed 186540); a fork with a manned
  dead-end is not something the canyon grammar produces, so the shape change
  means either extending the grammar or converting the narrows to a hand
  builder like not-a-sound (`generate-levels.mjs:1340`).

## Classification

New work (map design) with a trivial tuning component (the clock).

## Plan (one sitting)

Convert the narrows to a hand builder seeded from its current layout: keep
the canyon dash, add a false fork -- a dead-end branch stacked with troops so
the wrong turn is a massacre and the map teaches route knowledge over
firepower. Thicken the true route's garrison. Set `timelimit: 100` (the
owner's 60s dash plus retry pressure; "retry often" is the goal). Prove it
winnable (`npm run check` flood-fill + a scripted `/playtest` run).
Interacts with [003](003-veteran-balance.md) (more enemies) and
[010](010-spawn-distance.md) (fork troops must respect the start rule) --
land those levers first.

## Done when

- The narrows has a fork where one branch is a heavily-garrisoned dead end.
- `timelimit` is ~100s and the map is proven winnable on veteran.
- `npm run check` passes; regenerating levels preserves the map.
