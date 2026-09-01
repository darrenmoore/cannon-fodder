# 015 -- a horn when a wave leaves the huts

> A wave klaxon. Waves announce themselves with a transient in-world popup
> ("wave 2") that is easy to miss mid-fight; the sink work (200-qa 021) added
> the counter to the HUD, but a short distant horn when a wave leaves the huts
> would land the dread without the player reading anything.

## Findings

Accurate. `sim/buildings.ts:184`:

```ts
if (sent > 0 && target) world.fx.popup(target, `wave ${world.wavesSent}`, '#ff8a3c');
```

`fx.popup` lives `CONFIG.fx.popupLife` = **1.6 seconds** (`config.ts:625`),
rises 15px, and is drawn in world space at the building it came from -- so if
the camera is elsewhere, which it usually is when a wave arrives, the player
never sees it at all. The HUD counter from 200-qa 021 tells you *how many*
but not *now*.

`buildings.ts` already imports `sfxExplosion` from `shell/audio.ts`
(`buildings.ts:2`), so the sim/audio boundary for this file is established --
no new import shape to argue about.

**Where the call goes.** The wave logic runs around `buildings.ts:103-184`:
`world.wavesSent++` at :108, the per-building distribution at :129-151, and
the popup at :184 gated on `sent > 0 && target`. The horn belongs on the same
condition -- one horn per wave, not one per building that spawned.

**What "distant" means here.** There is no distance attenuation for one-shots
anywhere in the game (`sfxShot` is full volume wherever it happens). "Distant"
therefore has to be built into the patch rather than into the mix: a low
fundamental, a soft attack, a long-ish decay, and a lowpass -- air absorbs
high frequencies, which is what makes a far-off horn sound far off. Two
detuned sawtooths a fifth apart, lowpassed around 500Hz, ~0.9s, is the
klaxon shape and it costs nothing beyond what `sfxWin` already does with
scheduled oscillators.

**One thing to check before building it.** Waves land on a handful of maps
(`the-sink` is the showcase from 200-qa 021). Confirm which maps carry a
`waves:` block before tuning, so the horn is judged on the mission that has
the most of them.

## Classification

**New work.** Small, and the smallest of the eight sound items.

## Plan

One sitting, half an hour.

1. `audio.ts`: `sfxKlaxon()`. Two `sawtooth` oscillators a fifth apart, a
   shared lowpass at ~500Hz, gain envelope with a 60ms attack and a 0.9s
   decay, total gain low -- it must sit under gunfire, not over it. Behind
   `settings().sound`.
2. Call it at `buildings.ts:184`, on the same `sent > 0` condition, beside the
   popup.
3. Do **not** set `loudAt`: this is a sound *they* make, and it should not be
   treated as the player's gunfire for the purpose of scaring the birds.
   Arguably it should scare them -- try it, and say which way in the commit.
4. Keep the popup. It is still the right thing when the camera is on the huts.

## Done when

- On `the-sink`, each wave is announced by one horn, audible over an ongoing
  firefight, regardless of where the camera is.
- One horn per wave, not one per hut -- checked on a wave that spawns from
  three buildings.
- Effects off silences it.
- `npm run check` passes.
