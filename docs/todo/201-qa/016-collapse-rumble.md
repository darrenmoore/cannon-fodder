# 016 -- a building coming down should not sound like a grenade

> Building collapse rumble. sfxExplosion covers the grenade; the hut or
> factory actually coming down -- the most satisfying moment in a demolish
> mission -- shares it. A longer, lower crumble distinct from the blast.

## Findings

Confirmed. `collapse(world, b)` (`buildings.ts:284-300`):

```ts
b.standing = false;
b.hp = 0;
b.damageStage = 2;
b.ruinAge = 0;
for (const [tx, ty] of b.tiles) setTile(world.map, tx, ty, Tile.Rubble);
world.fx.explosion(b.centre);
world.shake += CONFIG.fx.screenShake * 1.6;
sfxExplosion();
```

The *visual* side already distinguishes a collapse from a blast: the shake is
1.6x, debris is thrown wide, and the footprint becomes walkable rubble. The
audio is the same `sfxExplosion()` the grenade fires -- so the biggest moment
in a demolish mission sounds identical to a grenade landing in a field.

`sfxExplosion` (`audio.ts:151-155`) is a 0.55s lowpassed noise burst sweeping
800 -> 90Hz plus `thump(110, 0.45, 0.8)`. A crumble wants: longer, lower,
*textured* rather than a single decay -- rubble is many small impacts, not
one. Nothing in `audio.ts` produces a rattle today; the nearest thing is
`burst()`'s loop over the shared noise buffer, which can be given a slower
decay and a bandpass sitting where debris lives.

**The sequencing is the whole effect.** A collapse is: bang, then a beat, then
the crumble. So the right answer is probably not to *replace* `sfxExplosion`
but to fire the collapse sound **on top of and slightly after it** -- which
also means the grenade that levelled the hut still sounds like a grenade,
because it was one. Worth trying both ways and saying which in the commit.

**Volume.** Buildings can chain: a blast primes neighbouring mines
(`mines.ts:38-46`) and a demolish mission can drop several huts inside a
second. Same throttle concern as issues 013 and 014 -- but here overlapping is
arguably correct, and a cap on concurrent crumbles is the milder fix.

## Classification

**Broken, cause found.** One shared emitter doing two jobs.

## Plan

One sitting.

1. `audio.ts`: `sfxCollapse()`. A long noise `burst` -- ~1.4s, lowpass
   sweeping 500 -> 60Hz, moderate Q -- plus a second, quieter mid-band burst
   with a slower attack for the rubble rattle, plus `thump(60, 0.9, 0.7)`
   under both. Scheduled ~120ms after the call so it arrives behind the blast.
2. Call it from `collapse` (`buildings.ts:295`) *in addition to*
   `sfxExplosion()`, not instead of -- unless the playtest says otherwise.
3. `loudAt` is already set by `sfxExplosion`, so the birds scatter correctly
   without touching it.
4. Cap concurrent crumbles at two or three so a chain does not clip.

Tune on a demolish mission with several huts -- `training-bridge` (two huts)
for the single case, and a later demolish map for the chain.

## Done when

- Levelling a hut sounds plainly different from a grenade going off next to
  one: a longer, lower fall arriving behind the blast. Judged by ear, in the
  real game.
- The grenade that did it still sounds like a grenade.
- Three huts levelled in quick succession do not clip or stack into mush.
- Effects off silences it.
- `npm run check` passes.
