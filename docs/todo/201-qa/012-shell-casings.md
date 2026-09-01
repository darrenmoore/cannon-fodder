# 012 -- shell casings

> Shell casings. A single dark pixel ejected per rifle shot, resting where it
> lands for a few seconds. The original scattered debris everywhere; ours
> cleans up too politely. Strictly a particle, strictly one pixel.

## Findings

The hook point is clean. `fire()` (`combat.ts:25-57`) is the **only** place a
bullet is created, and it already computes the muzzle position and the firing
`angle`, and already calls `world.fx.muzzle(...)` right there
(`combat.ts:48`). A casing is one more call on the same line.

`Fx` (`render/fx.ts`) has eleven emitters and one `step`. What it does not
have is a particle that comes to rest -- and there is a trap in `step` that
bites exactly this feature:

```ts
// render/fx.ts:66-76
if (p.maxLife > 2) {
  p.vel.x *= Math.exp(-0.7 * dt);
  p.vel.y = Math.max(-34, p.vel.y - 6 * dt);   // rises
} else {
  const drag = Math.exp(-5.5 * dt);
  p.vel.x *= drag;
  p.vel.y *= drag;
}
```

`maxLife > 2` is the smoke branch, and it makes the particle **float upward**.
So a casing given a lifetime of "a few seconds" would drift up the screen like
smoke. It has to either stay under 2s or the branch has to become an explicit
flag on the particle rather than a lifetime heuristic. The flag is the right
answer -- the heuristic is already load-bearing in a way nothing declares.

"Resting where it lands" also has no expression today: every particle keeps
its velocity decayed by drag but never stops, and every particle fades or is
culled by `life`. A casing wants: brief arc, hard stop, then sit still for the
remainder of its life, then vanish. That is a `rest: number` field (seconds
after which velocity is zeroed) or simply a high drag constant plus a long
life -- the simplest version being drag so strong it is stationary within
~0.15s.

**Volume.** A firefight is a lot of rifle fire. At `CONFIG.soldier` fire
rates, six soldiers on auto will produce dozens of casings a second. The
particle array is unbounded (`particles: Particle[] = []` with only
life-based culling), so this needs either a short life (2s, which conveniently
also dodges the smoke branch) or a cap. Recommend 1.6-2.0s and no cap.

**Player only.** The brief says "per rifle shot"; enemy shots come through the
same `fire()`. Casings from every enemy on the map, most of them under fog,
is noise the player cannot read. Recommend player soldiers only -- it also
keeps the count down and makes the effect *say something*: that is your squad
shooting.

**Drawing.** `drawParticles` (`render.ts:498`) draws the existing set; a
one-pixel `fillRect` in a dark brass tone from `render/palette.ts` needs no
new draw path. No alpha fade -- the house rules forbid it; it should blink out
or simply disappear, like everything else here.

## Classification

**New work.** Small, with one trap named above.

## Plan

One sitting, under an hour.

1. `types.ts`: add an optional `heavy?: boolean` (or `rise?: boolean`) to
   `Particle` and switch `fx.step`'s branch onto it instead of `maxLife > 2`,
   setting it on the existing smoke emitter so nothing changes there. Comment
   why the heuristic went -- it is exactly the kind of load-bearing detail the
   house style marks.
2. `Fx.casing(pos: Vec2, angle: number)`: one particle, ejected perpendicular
   to `angle` (to the shooter's right, with jitter), speed ~30-50px/s, drag
   high enough to stop inside 0.2s, life 1.8s, colour a dark brass from the
   palette, size 1px.
3. Call it from `fire()` beside `world.fx.muzzle(...)`, player faction only.
4. `/pixel-check` after: one whole-pixel `fillRect`, no alpha, no rounding to
   fractional coordinates.

## Done when

- `tools/moment.mjs` on a mission, frozen a few steps after a volley, shows
  scattered single dark pixels behind the squad, and a capture two seconds
  later shows them gone.
- The casings sit still rather than drifting -- two captures one second apart
  show them in the same place.
- Smoke still rises (the `heavy` flag flip did not invert the smoke branch);
  checked with a moment capture of an explosion.
- The particle count does not grow without bound in a long firefight --
  logged from `window.game.world.fx.particles.length` in a playtest.
- `npm run check` passes.
