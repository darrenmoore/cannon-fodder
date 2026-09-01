# 014 -- the wounded man's scream

> The wounded man's scream. stepWounded (sim/enemies.ts) runs a scream
> mechanic -- a repeating alarm that draws enemies to the body -- with no audio
> at all. The player is being hunted by a sound they cannot hear. A
> pitched-down cry on the same timer would make the mechanic legible and is
> exactly the "thing happening in the world" style.md prefers over labels.

## Findings

**Exactly as described.** `stepWounded` (`enemies.ts:126-132`) is six lines:

```ts
e.screamTimer -= dt;
if (e.screamTimer > 0) return;
e.screamTimer = CONFIG.enemy.screamInterval * (0.8 + Math.random() * 0.4);
raiseAlarm(world, e.pos, world.levers.hearing * CONFIG.enemy.woundAlarm);
world.fx.blood(e.pos);
```

So on each scream it raises an alarm at `hearing * woundAlarm` and spits
blood. The blood is easy to miss on a body that is already bleeding, and the
alarm is silent. A player who shoots someone, moves on, and is then swarmed
from three directions has been given no information at all about why.

`stepEnemies` calls it and `continue`s (`enemies.ts:144`), so a wounded man is
stepped but does nothing else -- no acquire, no steering, no weapon. Confirmed.

`shell/audio.ts` has `sfxDeath` (`audio.ts:149`) --
`burst({ duration: 0.22, gain: 0.5, freq: vary(320), q: 0.7, sweepTo: 120,
type: 'lowpass' })`. That is the noise-based death grunt, and the scream is
its longer, higher, more voiced cousin. The brief's "pitched-down cry" is
right: the game has no voice synthesis, so a cry has to be built from swept
oscillators the way `chirp()` in `ambience.ts:308-355` builds bird syllables.
That is the nearest working model, and it produces something recognisably
*animal* rather than a filter sweep.

**Two things to get right.**

1. **It has to be locatable.** The whole value is telling the player *where*
   the noise drawing enemies is. Nothing in the game pans a sound today --
   `chirp()` is the only user of `createStereoPanner` (`ambience.ts:311`).
   Panning this one by the body's x-offset from the camera centre is the
   difference between a mood sound and a mechanic. The camera is not reachable
   from the sim, so the pan has to be computed in the renderer or passed
   through -- simplest is `sfxScream(pan: number)` with the pan computed where
   the call is made, and the sim does not have the camera either. Cleanest:
   fire a flag on the enemy (`e.screamed = true`), and let the renderer, which
   has the camera, drain it. Worth a look at how `world.shake` is drained
   before choosing.
2. **It must not be constant.** `CONFIG.enemy.screamInterval` sets the rate;
   several wounded men at once would overlap. Cap concurrent screams, or
   throttle in `audio.ts` as issue 013 does.

## Classification

**Broken, cause found.** Half a mechanic, shipped.

## Plan

One sitting.

1. `audio.ts`: `sfxScream(pan = 0)`. Two or three swept oscillator syllables
   in the 300-600Hz range with a falling contour, `sawtooth` for rasp, a short
   noise `burst` under the attack for breath, ~0.5s total, through a
   `StereoPannerNode`. Behind `settings().sound`. Throttled.
2. Do **not** set `loudAt` -- a scream is not gunfire, and scattering the
   birds on it would be wrong. (Or do, deliberately, if it plays better; note
   the choice in the commit.)
3. Wire it to `stepWounded`, with the pan resolved where the camera is known.
   Keep the sim free of a renderer import.
4. Tune against the volume of `sfxDeath` -- the scream is quieter than the
   death but longer, because it repeats.

## Done when

- Wounding an enemy and walking away produces a repeating cry from the
  direction of the body, and it stops when he dies or is finished off.
- The cry pans: with the body off the left of the camera it comes from the
  left. Asserted by ear plus a check that the pan value tracks the offset.
- Three wounded men at once do not stack into noise.
- Effects off silences it.
- `npm run check` passes.
