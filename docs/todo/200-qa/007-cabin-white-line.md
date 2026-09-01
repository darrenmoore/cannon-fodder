# 007 -- cabin: white line across the top

> the cabin sprite has a weird white line across the top, remove this white line

## Findings

`render/sprites/buildings.ts:255-256`:

```ts
// The ridge line, and icicles hanging off the eave.
for (let x = 2; x < 36; x++) px(g, x, 0, '#ffffff');
```

Row y=0 of the 38x34 canvas, edge to edge, pure `#ffffff` -- the only pure
white in the sprite. It reads as a stray scanline because:

- the snow under it is already near-white (`#f2fbfd`), so it's a 1px hard
  step of white-on-white;
- `addOutline` can't cap it -- row 0 is the canvas edge, so it's the one edge
  of the sprite with no dark outline above it;
- at y=0 the roof body is inset to x=10..27, while the line spans x=2..35 --
  it sticks ~13px past the roof into empty canvas on both sides.

Drawn in stages 0-2 (stage 3 returns early).

## Classification

Broken, cause found. Trivial.

## Plan (minutes)

Remove the row (or, if a ridge is still wanted, draw it at the roof's actual
top-row extent, one step darker than the snow, one row down so the outline
caps it). Verify in the gallery (`/sprites` `#cabin.0`..`#cabin.2`).

## Done when

- No row of the cabin sprite is pure `#ffffff` spanning past the roof; all
  three intact stages checked in the sprite gallery.
- `npm run check` passes.
