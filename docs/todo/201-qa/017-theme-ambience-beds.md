# 017 -- theme ambience beds

> Theme ambience beds. The ambience system already synthesises a bed keyed to
> distance-from-water. The same trick, keyed to distance-from-canopy, gives
> the jungle birdsong and insect hum; keyed to open ground on arctic maps, a
> wind howl. Three beds, one existing mechanism.

## Findings

**This is already built -- all three of it.** The claim describes
`shell/ambience.ts` as it was before it grew themes; it has had them for a
while.

`ambience.ts:50-64` defines a `VOICES` table keyed by `Theme`:

| theme | wind cutoff | whistle | insects | birds |
|---|---|---|---|---|
| jungle | 400Hz | no | crickets, floor 0 | jungle, rate 1, floor 0 |
| desert | 700Hz | no | cicadas, floor 0.35 | desert, rate 0.4, floor 0.3 |
| arctic | 300Hz | **yes** | none | arctic, rate 0.25, floor 0.2 |

And `updateAmbience` (`ambience.ts:365-444`) drives them from exactly the
fields the brief proposes:

- `info.wetSdf` sampled at five points across the view -->
  `water01` --> the river layer (`ambience.ts:388-400`).
- **`info.foliageSdf` sampled at the view centre --> `foliage01` --> the
  rustle layer, the insect drive (`insectDrive = max(foliage01,
  voice.insectsFloor)`) and the bird-call rate
  (`drive = max(foliage01, voice.birdFloor)`)** (`ambience.ts:401-402`,
  `:411`, `:438-443`). That is the distance-from-canopy bed the brief asks
  for, including both the birdsong and the insect hum.
- The arctic wind howl is `voice.whistle` -- "a narrow drifting band on top of
  the bed" (`ambience.ts:39`), built at `ambience.ts:252-258`, and the arctic
  voice also has the darkest wind cutoff (300Hz) and the highest wind trim
  (1.3x). Arctic birds are a single long falling gull cry
  (`ambience.ts:333-336`).

There is more than the brief asks for, too: gunfire scatters the birds and
briefly ducks the insects (`lastLoudAt`, `ambience.ts:410-414`), the rustle is
cubed inside the gust peaks so leaves are only heard when the trees are
visibly bending, and the whole bed eases to silence rather than cutting when
the world is held.

`ambienceState()` (`ambience.ts:165-168`) exposes the live target levels, so
any of this can be verified from a playtest rather than argued about.

## Classification

**Already true.** No work.

If anything is wrong here it is a *tuning* complaint -- "the jungle is too
quiet", "the arctic howl never comes up" -- and that is a different issue with
a different shape: it would want `ambienceState()` logged across a mission on
each theme and the `A` constants in `CONFIG.audio.ambience` moved, not new
machinery.

## Done when

Nothing to do. Closed as already built. Recorded so nobody re-checks it.
