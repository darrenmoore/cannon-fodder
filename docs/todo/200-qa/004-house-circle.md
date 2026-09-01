# 004 -- dry run: the circle round the end house is not in style

> on dry run there is a house i need to get to at the end
> the circle around it is NOT in the style of the game
> improve it, check our guide or what ever we have already

## Findings

The "house" is the 2x2 tent extraction zone at dry run's east edge, and the
circle is `drawExtractionZones` (`render/render.ts:1242-1290`) -- the same
marker on every map and mission type.

It is **not** a `ctx.arc` -- it was already rewritten to per-dash `fillRect`s.
What still breaks style:

- **Compass-perfect geometry**: the dash loop steps at exact angle increments
  with zero jitter -- exactly the "geometric perfection" tell `/pixel-check`
  warns about (contrast `shockRing`'s per-angle nudge, `render.ts:659-660`).
- **Off-palette colour**: `#8fe0ff`/`#4c8ba8` electric cyan, from neither
  `paint.ts` nor `palette.ts`, jarring on a desert map.
- **Huge**: radius 62 world px -- a 124px ring around a 30x26 tent sprite.
  Reads as a HUD overlay, not marks on the ground.
- **Animates twice at once**: dashes march *and* the whole ring blinks tone.
- Drawn before scenery (`render.ts:417`), so the tent overdraws its own ring;
  the four ticks at `:1284-1288` are un-rounded (can land on half-pixels) and
  carry dead code (`- (dy ? 0 : 0)`).
- `/pixel-check`'s standing worklist item 3 still describes the *old* two-arc
  version -- the entry is stale either way.

## Classification

Broken, cause found -- the primitive was fixed, the styling never was.

## Plan (one sitting)

Restyle in place: palette colour (theme-aware ground-marking tone, not cyan),
jittered dash placement, radius pulled in toward the zone (or derived from
the building's footprint rather than `pad + 46`), one animation not two,
rounded ticks, and draw order after scenery. Update `/pixel-check`'s worklist
entry. Judged by `/grill` on dry run's east end, and `/moments` can freeze it.

## Done when

- The ring uses palette colours and jittered dashes, radius hugs the zone,
  one animation channel; ticks rounded, dead code gone.
- `/pixel-check`'s worklist entry for the extraction zone is rewritten to
  match reality (or struck through).
- A `/grill` of the dry run extraction does not name the ring.
