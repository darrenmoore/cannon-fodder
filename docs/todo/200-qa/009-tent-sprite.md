# 009 -- tent: too flat

> the tent sprite needs improving, it looks too flat

## Findings

`bakeTent` (`render/sprites/buildings.ts:486-501`) is 15 lines -- the
shortest bake in the file -- and flat for identifiable reasons:

- **No directional light**: the fabric tone is a function of `x % 5` only, so
  both slopes of the tent are the same brightness. Every other building
  shades one side lighter (hut `:115`, cabin `:231`, bunker `:536`).
- **No dither/grain**: the only bake in the file that uses no randomness.
- **No ground shadow**: compare the bunker's hard shadow rect laid down first
  (`:526-527`); the tent floats.
- **Nothing breaks the silhouette**: a perfect linear triangle -- no ridge
  sag, pole, guy ropes, or fabric fold. Three colours total in fabric+door.

## Classification

New work -- a redesign, judged as visual work.

## Plan (one sitting)

`/style`, then `/pixelate` against the original's tent if present in
`docs/original-images/`. Replot with: lit slope vs shade slope, dithered
fabric with grain, a sagging ridge line, a dark interior door with depth, a
hard ground shadow, and guy-rope pixels to break the triangle. Keep the red
cross (it marks the extraction). Verify `/sprites` `#tent.0`, judge with
`/grill` on dry run (it is the [004](004-house-circle.md) house), so land
this and 004 near each other.

## Done when

- The tent has a lit and a shaded slope, dithered fabric, a ground shadow,
  and a non-linear silhouette; damage stages coherent.
- A `/grill` of the dry run extraction does not name the tent.
- `npm run check` passes.
