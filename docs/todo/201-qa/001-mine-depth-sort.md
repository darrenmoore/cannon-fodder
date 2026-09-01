# 001 -- the landmine draws over the man standing on it

> landmine
> - my head goes through it if i walk past it
> - so it's fine it didn't explode it
> - but check the z-indexing

## Findings

Not a z-index bug in the CSS sense -- the whole battlefield is one canvas.
It is the **draw order in `render.ts`**, and the mine is in the wrong pass.

`Renderer.draw` runs five passes (`render/render.ts:420-500`):

1. ground + decals blit
2. water shimmer, extraction zones, order marker
3. **the depth sort** -- scenery, actors and hostages pushed into `drawList`
   with a `sortY` (ground contact) and drawn in that order
   (`render.ts:437-483`)
4. the canopy, over the actors
5. "everything that belongs on top of the world":
   `drawCrates`, `drawSupplies`, **`drawMines`**, target markers, bullets,
   grenades, particles, muzzle flashes (`render.ts:492-499`)

So a mine is drawn unconditionally after every soldier, at
`y - sprite.height + 2` (`render.ts:1255`). Walk a man north past a mine and
his head passes behind it. Nothing in `sim/mines.ts` is involved.

The same is true of crates and supplies (`drawCrates` at `render.ts:1210-1240`,
`drawSupplies`), which are physically taller than a mine and so read worse --
but the brief names the mine, and the fix is the same shape for all three.

The mine's fuse ring, its blink and the trigger pixel are drawn from
`drawMines` too, and those *should* stay on top: a shock front occluded by the
man who just triggered it is the one frame the player is looking hardest at.

## Classification

**Broken, cause found.** The mine is not in the depth sort.

## Plan

One sitting.

1. Add a `mine` arm to the `drawList` entry union in `render.ts`, push live
   mines with `sortY = m.pos.y`, and draw the *sprite* from the sorted pass.
2. Leave the fuse ring, the blink and the trigger pixel in pass 5 -- split
   `drawMines` into `drawMineBody(m)` (sorted) and `drawMineFuse(world)`
   (on top). A triggered mine's warning must not be hidden by anything.
3. Do crates and supplies in the same pass while the union is open; the
   crate's yellow pulse stays on top for the same reason as the fuse.

`npm run moments` on the minefield with a soldier walked onto a mine is the
only check that can see this -- `npm run check` cannot.

## Done when

- A soldier standing north of a mine on `minefield` is drawn **in front of**
  it; standing south of it, behind it. Shown with two `tools/moment.mjs`
  captures.
- A triggered mine's fuse ring is still drawn over the man standing on it.
- `npm run check` passes.
