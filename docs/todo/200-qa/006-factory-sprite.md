# 006 -- the factory sprite looks terrible; redesign it

> the factor sprite looks terrible, redesign it

## Findings

There is no sprite named "factor" -- this is `bakeFactory`
(`render/sprites/buildings.ts:404-484`), 52x54, four damage stages, the
largest building in the game. Why it reads terribly:

- The body is three flat rects of grey (`#6d6f74` slab, lighter cap, darker
  skirt) -- **no dither, no per-pixel shading, no directional light**, unlike
  every other bake in the file.
- "Corrugation" is a mechanical `x % 3` stripe on a perfectly linear
  trapezoid roof; four identical 5x5 windows at even spacing.
- The intact stages use no randomness at all -- zero grain, ruler edges.
- `buildings.ts:476` fills with the malformed colour string `'#00000000'`
  (meant to clear the fallen chimney; paints transparent-black instead).
- The codebase already knows: `bakeOutpost`'s header comment
  (`buildings.ts:288-293`) calls this sprite "a chimney, windows and flat
  industrial concrete".

## Classification

New work -- a redesign, judged as visual work.

## Plan (one sitting)

`/style` first, `/pixelate` against `docs/original-images/` if a factory
reference exists there, then replot: directional light matching the folder's
convention, dithered walls with grain, a broken roofline, irregular window
placement, grime streaks under sills, a proper chimney with a soot mouth.
Fix the `'#00000000'` fill with a real `clearRect`/skip. Keep all four damage
stages coherent. Hand over via `/sprites` (`#factory.0`) and judge with
`/grill` on landing ground or through the wall, where it appears in play.

## Done when

- `bakeFactory` shades with a lit term and dither like its neighbours; no
  flat full-width rects, no `x % 3` stripe, no `'#00000000'`.
- All four damage stages read as the same building decaying.
- A `/grill` of a mission showing the factory does not name it.
