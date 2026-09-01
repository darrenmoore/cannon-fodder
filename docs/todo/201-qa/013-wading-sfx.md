# 013 -- a sound for wading and for the mud

> Wading splash / mud squelch. Found while fixing the mud (200-qa 002): the sim
> already decides water-vs-mud per step and fires a particle
> (fx.splash(pos, thick), now for enemies too) -- there is simply no sound on
> it. Two short synth patches, keyed off the same call: a bright plip for
> water, a low sucking squelch for mud. The sink is a whole mission spent
> wading in silence today.

## Findings

**Every word checks out.** Two call sites, both already deciding the material:

- `troops.ts:238` -- `world.fx.splash(s.pos, t === Tile.Quicksand)`
- `enemies.ts:212` -- `world.fx.splash(e.pos, wt === Tile.Quicksand)`

`Fx.splash(pos, thick)` (`fx.ts:252-265`) branches on `thick` for particle
count, speed, lifetime and colour, and does nothing else. `shell/audio.ts`
exports eleven sounds and **none of them is a wading sound** -- confirmed by
reading the export list.

The synthesis vocabulary is already there:

- `burst(o)` (`audio.ts:91-118`) -- a slice of the shared noise buffer through
  a biquad with an optional downward sweep. `sfxDenied` is 70ms of it.
- `thump(freq, duration, gain)` (`audio.ts:120-135`) -- a sine with a downward
  pitch ramp. The squelch's body.

So a plip is `burst` with a high bandpass and a short decay; a squelch is
`burst` low-passed with a slow sweep plus a `thump` under it. No new
machinery.

**The problem the brief does not mention: rate.** `splash` is fired **per
step** while a soldier is in the water, subject to whatever gate `troops.ts`
puts in front of it -- and there are up to six soldiers plus every enemy in
the sink doing it at once. Naively wiring a sound to that call is a
continuous roar, not a splash. Two things are needed:

1. A throttle, in `audio.ts` beside the emitter, that drops a call inside
   ~120ms of the last one. Same shape as `vary()` exists for: keeping a
   repeated sound from becoming a drone.
2. A distance or on-screen check. Every enemy in the sink wading audibly at
   full volume, most of them under fog, is wrong. The sim has no per-sound
   panning or attenuation today (`sfxShot` is not attenuated either), so the
   cheapest honest version is: **player soldiers only**, matching how the
   splash particle reads as a thing your squad is doing. Enemy wading stays
   visual.

Check the gate in `troops.ts:233-239` before wiring, since it decides the
natural call rate.

## Classification

**Broken, cause found** in the sense the brief means: the mechanic is built
and half of it was never connected.

## Plan

One sitting.

1. `audio.ts`: `sfxWade(thick: boolean)`.
   - water: `burst({ duration: 0.09, gain: 0.22, freq: vary(2200), q: 2,
     sweepTo: vary(900) })` -- bright, short, no body.
   - mud: `burst({ duration: 0.26, gain: 0.22, freq: 420, q: 1.2,
     sweepTo: 140, type: 'lowpass' })` plus `thump(90, 0.2, 0.25)` -- the
     suck is the sweep, the body is the thump.
   - Both behind `settings().sound`, like every other emitter, and behind a
     shared 120ms throttle.
2. Call it from `troops.ts:238` beside the `fx.splash`, player only. Leave
   `enemies.ts:212` visual.
3. Tune by ear on `the-sink` (693 quicksand tiles) and on a water map --
   `swim-for-it` or `braided-water`.

Do not route it through `loudAt`: wading is not gunfire and must not scare
the birds.

## Done when

- Walking the squad into water on `swim-for-it` produces a bright plip per
  footfall; walking into the bog on `the-sink` produces a low squelch, and the
  two are plainly different sounds.
- Six soldiers wading together do not produce a continuous roar -- the
  throttle holds.
- Effects off silences both.
- The ambience bed is unaffected (birds do not scatter when the squad wades).
- `npm run check` passes.
