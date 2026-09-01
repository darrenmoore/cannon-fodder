# 013 -- timers: "240S" is not obviously seconds

> check timers and wave counter
> it has time left and the "S" is not clear that it's seconds

## Findings

Three places print a bare-`s` duration that CSS uppercases into an ambiguous
`S`:

- The HUD meter: `ui/hud.ts:255` formats `${Math.ceil(left)}s`, and
  `.ui-meter-head` is `text-transform: uppercase` (`style.css:233-241`) ->
  **`240S`**. A proper `m:ss` formatter already exists -- `clock()` at
  `sim/objectives.ts:34-38` -- and the objective line already uses it.
- The wave countdown: `objectives.ts:176` appends `in ${...}s` -> `IN 9S`
  (survive maps only; see [021](021-sink-waves.md) for hold maps).
- The mission-select chip: `ui/front.ts:202` hard-codes
  `` `${level.timeLimit}S LIMIT` `` -> **`240S LIMIT`**.

## Classification

Broken, cause found. Small.

## Plan (well under one sitting)

Use `clock()` everywhere a duration is shown: HUD meter value `3:59`, chip
`4:00 LIMIT`, wave countdown `IN 0:09` (or keep short counts as `9 SEC`).
Export `clock` from objectives or move it somewhere shared if the ui layer
shouldn't import from sim internals -- check the import direction first.

## Done when

- No user-visible duration renders as a bare number + `S`; HUD, wave line
  and mission chip all show `m:ss` (screenshot via `/moments` or `/shots`).
- `npm run check` passes.
