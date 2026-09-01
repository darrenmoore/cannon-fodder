# 010 -- hiding in the water and the long grass

> for the enemy they have a method to see us.
> when the player is in shrubs or water, does that adjust?
>
> because i'm thinking when they are in water it might be more of a sneak
> attack - or it just reduces the enemies vision a bit, as long as all the
> troops are in the water - or similar for example.
>
> and for the shrubs, we need to be careful with this one, there is a map that
> is almost hidden with trees.
>
> but it'll be cool if the player is getting chased by someone, and then they
> can jump in the water or the shrubs to hide, like hitman game style stuff.
>
> do we have any of those types of mechanics already?
> are they easy enough to get in?
> is it complicated?
> could it mis-balance the game?

## Findings

Answering the four questions in order.

### Do we have any of it already? Half of it, and not the half you would think.

**Tall grass already blocks sight -- but only when it is *between* you and
them, never when you are *standing in it*.**

`TILES[Tile.TallGrass]` is `{ blocksSight: true, speed: 0.82 }`
(`sim/tiles.ts:101`), commented "Cover you can walk through: hides you without
stopping bullets". `nearestVisibleSoldier` (`enemies.ts:271-282`) tests
`hasLineOfSight(world.map, e.pos, s.pos)`, whose comment says "Tall grass
breaks sight, which is what makes it worth hiding in."

But `walkLine` (`sim/map.ts:503-536`) is a DDA that **returns `true` the
moment it reaches the target tile, before testing it**:

```ts
if (x === ex && y === ey) return true;
const def = TILES[tileAt(map, x, y)];
if (mode === 'sight' ? def.blocksSight : def.blocksShots) return false;
```

The target's own tile is never consulted. So a soldier who runs into the long
grass and stops is seen perfectly; the grass only helps him while he is on the
far side of a different patch of it. **The mechanic the comments describe is
not the mechanic the code implements.** That is the single finding here.

**Water does nothing at all.** `Tile.Water` is
`{ wade: true, speed: 0.45 }` and `Tile.DeepWater` is
`{ solid: true, swim: true, wade: true, speed: 0.34 }` (`tiles.ts:86-97`).
Neither sets `blocksSight`, and no lever anywhere reads "is the target in
water". A swimming man is up to his neck, cannot fire, moves at a third speed
-- and is exactly as visible as a man standing in a road. `troops.ts:175` uses
`blocksSight` when picking a slot ("cover is better still"), which is the only
place the sim treats cover as a thing worth having.

There is no stance, stealth, concealment or detection-strength concept in the
sim. Sight is binary and instantaneous: a clear ray inside `aggroRadius` is a
sighting, which fires `raiseAlarm` and tells the whole map
(`enemies.ts:238-251`).

### Is it easy? The grass is one line. The water is a small design decision.

Grass: test the destination tile in `walkLine`, for `sight` only, and only
past some minimum range so a man is not invisible to somebody standing next
to him. Perhaps ten lines with the range rule.

Water: needs a new idea, because water does not block a ray -- a swimmer is
low in it, which is a *detection* effect, not a geometry one. Cheapest honest
version: scale `e.stats.aggroRadius` by a concealment factor read from the
soldier's tile, inside `nearestVisibleSoldier`. That is the "reduces the
enemy's vision a bit" the brief already suggests, it is one multiply, and it
gives grass and water one shared mechanism instead of two.

### Is it complicated? No. Is it risky? Yes, and here is the number.

Tall grass by map:

| map | tall-grass tiles | of about | share |
|---|---|---|---|
| `undergrowth` | 3404 | 6531 | **52%** |
| `not-a-sound` | 1931 | 6267 | 31% |
| `softly-softly` | 1802 | 5827 | 31% |
| `loud-and-clear` | 1641 | 6267 | 26% |
| everything else | under 240 | | under 4% |

`undergrowth` is `objective: eliminate`, `doctrine: patrol`, and its
`mechanic:` is literally "tall grass" with the brief line *"Tall grass hides
you but not your bullets."* -- so the map was designed for the mechanic the
code does not have. But at 52% coverage, full invisibility-while-standing-in
would let the squad cross it untouched and shoot from concealment with no
counterplay, which turns the mission the brief describes into a walk.

The three `softly-softly` / `not-a-sound` / `loud-and-clear` maps are the
stealth set and would gain the most.

**So it can mis-balance the game, and the lever that stops it is range.**
Concealment that degrades with distance -- invisible far off, plainly visible
close -- keeps a patrol dangerous, rewards the player for breaking contact,
and is the Hitman behaviour the brief actually describes: you hide from
someone across the clearing, not from someone standing on your foot.

The other guard is that **it must cut both ways.** Enemies use the same
`hasLineOfSight`, and the player's fog is `world.fog`. If grass hides the
squad but not the garrison, `undergrowth` gets easier twice over. It should
hide camo troopers from the player just as well -- which is what `camo` as a
difficulty lever already gestures at (`difficulty.ts:41-50`).

## Classification

**Broken, cause found** for the grass -- the comments claim a mechanic the
`walkLine` early return silently drops. **New work** for the water.

## Decision (Q2, answered)

**Option 1 -- both, at range only. And it cuts both ways.**

- Tall grass **and** deep water both conceal. Shallow water does not: you are
  standing upright in it, and it is already a speed penalty.
- Concealment shrinks how far an enemy notices you -- it does not block a ray.
  Target about **a third** of the normal notice range while a soldier is in
  cover.
- **Floored at roughly 3 tiles.** Nobody is invisible to a man standing next
  to them. This floor is the whole reason `undergrowth` survives the change,
  so it is not a tunable to quietly relax later.
- **Symmetric**: an enemy in cover is likewise hidden from the player's fog on
  the same terms. Otherwise `undergrowth` gets easier twice over.

Open inside the decision, to be settled by playing rather than by asking:
whether concealment should require **standing still**. The brief's chase
fantasy ("jump in the water to hide") works either way, but a squad that stays
hidden while sprinting through grass is a different game. Start with movement
allowed -- it is the simpler rule and the one the maps were drawn for -- and
tighten it only if the playtest shows the stealth maps have stopped being
tense.

## Plan

Two sittings. The second is the balance pass and is not optional.

**Sitting one -- the mechanism.**

1. `concealment` on the tile definition in `sim/tiles.ts`, beside `speed` and
   `blocksSight`: a multiplier, 1 by default, ~0.35 on `Tile.TallGrass` and
   `Tile.DeepWater`. Putting it on the tile rather than in a branch means a
   future tile (a reed bed, a snowdrift) needs no new code.
2. `concealmentAt(map, pos): number` beside `tileAtWorld`, and a shared
   `noticeRange(base, target)` helper that applies it and clamps to the
   3-tile floor, so the two call sites can never drift apart.
3. Apply it in `nearestVisibleSoldier` (`enemies.ts:271-282`) -- scale
   `bestD` per candidate soldier, not once for the whole loop, since different
   men are in different cover.
4. Apply the mirror in the player's fog so an enemy in grass is hidden at
   range. Check what `world.fog.isVisible` is driven by first; the renderer
   already gates enemy drawing on it (`render.ts:468`), so the visual half may
   fall out for free.
5. A `concealment` lever in `sim/difficulty.ts`, multiplied into the tile
   value -- per that module's own rule that difficulty is levers, not one
   multiplier. Elite sees through grass better than Rookie; a doctrine can
   bend it. Rookie 1.0, Elite around 0.6 of the effect, to be tuned in
   sitting two.

**Sitting two -- the balance pass.** The four maps that carry real cover:

| map | tall grass | what to watch |
|---|---|---|
| `undergrowth` | 52% | must still be a fight, not a stroll -- it is `eliminate` under `patrol` doctrine |
| `not-a-sound` | 31% | the stealth showcase; should get *better* |
| `softly-softly` | 31% | same |
| `loud-and-clear` | 26% | same |

Plus a water map -- `swim-for-it` or `braided-water` -- for the deep-water
half.

6. Playtest each on Veteran, driving the real game, and record whether the
   squad takes casualties without player skill applied.
7. `npm run check`'s winnability test must still pass on all 40+ maps. If
   `undergrowth` has become trivial, the lever to move is the difficulty
   `concealment` value or the 0.35 multiplier -- **not** the 3-tile floor.

## Done when

- A soldier standing still in tall grass, 10+ tiles from an idle enemy, is not
  acquired; walked to 3 tiles, he is. Asserted against `window.game` in a
  playtest, not read from source.
- The same for deep water. Shallow water conceals nothing, and that is
  asserted too -- it is the case most likely to be added by accident.
- The effect is symmetric: an enemy in grass is likewise hidden from the
  player's fog at range.
- `npm run check` passes, including the winnability test on all 40+ maps.
- A playtest of `undergrowth` still ends in a fight, not a stroll -- judged by
  whether the squad takes casualties on Veteran with no player skill applied.
