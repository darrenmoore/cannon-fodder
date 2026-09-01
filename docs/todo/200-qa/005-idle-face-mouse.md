# 005 -- idle troops should face the mouse

> if my troops are not moving
> they should look in the direction of where my mouse is
>
> this just makes things feel a bit nicer and polished

## Findings

- A standing soldier with nothing to shoot at simply keeps his last facing:
  `sim/troops.ts:300-302` only updates `angle` from velocity above 2px/s, and
  the aim branch (`troops.ts:305`) only runs while firing at something.
- **The cursor's world position is already available to the sim every step.**
  `Game.step` calls `input.syncWorld(camera)` first thing (`sim/game.ts:79`),
  which refreshes the public `Input.world` field (`shell/input.ts:56,
  385-390`). The sim just never reads it -- today it reads only `firing`,
  `aim.point`, `aim.thrower`, `slack`, `drain`, pan.

So the boundary is already shaped for this; no new plumbing crosses it.

## Classification

New work, small.

## Plan (well under one sitting)

In `updateFiring`'s no-aim branch: if the soldier is effectively still
(vel <= 2) and not wading/stumbling, set `angle` toward `input.world` -- pass
the point in from `game.ts` the way `manualAim` already is, keeping
`troops.ts` free of the Input type. Snap to the 8 sprite facings comes free
via `facingIndex`. Consider a small dead-zone so a cursor crossing directly
over a soldier doesn't make him spin.

## Done when

- In a playtest (`/playtest`), stationary soldiers turn to face the cursor as
  it moves around them, in all 8 facings; moving/wading/firing behaviour is
  unchanged.
- `npm run check` passes; no runtime import appears in `sim/` from `shell/`.
