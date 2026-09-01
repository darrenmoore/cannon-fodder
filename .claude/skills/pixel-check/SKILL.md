---
name: pixel-check
description: Check drawing code against the game's visual laws — no anti-aliasing, no alpha, no smooth curves, no gradients — and find the places that break them. The "is this in lore?" check.
argument-hint: [what you just drew, or nothing to audit the whole renderer]
allowed-tools: Bash(npm run *) Bash(node *) Read Edit Glob Grep
---

## The laws

This is a 1993 Amiga game. The hardware being imitated had no alpha blending, no
anti-aliasing, no gradients and no way to draw a curve except by placing pixels
on it. Every one of those absences is visible in the reference images, and the
eye catches a violation *immediately* — a single soft edge in a dithered frame
reads as a different game pasted into this one.

**Round shapes are not the sin — smooth ones are.** The original's aim marker
(`docs/original-images/elements/target.jpg`) is a red ring with four spokes. It
is a circle. It is also every pixel placed by hand, which is the difference.

| Never | Instead |
|---|---|
| `ctx.arc`, `ellipse`, `arcTo`, `bezierCurveTo` | Step around the shape and `fillRect` whole pixels — `shockRing` in render.ts. Keep the circle; lose the curve. |
| `globalAlpha` for shading or fade | Dither: alternate two solid tones on a threshold — `threshAt` in palette.ts |
| `createLinearGradient` / `createRadialGradient` | A tone ramp, stepped in bands |
| `shadowBlur`, `filter: blur()` | A hard silhouette, offset — `silhouette()` in render.ts |
| Fractional coordinates | `Math.round` everything that touches the canvas |
| A colour picked by eye | The theme's ramp in `sprites/paint.ts` or `palette.ts` |

**The tell to watch for is geometric perfection.** Real debris is ragged; a
compass circle is not. When something expands, scatter it.

## The known exception

`imageSmoothingEnabled = true` on the **fog mask only** (`render.ts`). The mask
is one pixel per tile, blown up to world scale, and the smoothing is what turns
hard tile edges into a soft falloff. It is deliberate, documented at the call
site, and it is the only one. Anything else that turns smoothing on is a bug.

## Running the check

```bash
# Smooth curves anywhere in the renderer
grep -rn "\.arc(\|\.ellipse(\|arcTo\|quadraticCurveTo\|bezierCurveTo" game/src/

# Blends, gradients and blur
grep -rn "globalAlpha\|createLinearGradient\|createRadialGradient\|shadowBlur" game/src/

# Smoothing turned on anywhere but the fog mask
grep -rn "imageSmoothingEnabled = true" game/src/
```

A hit is not automatically a fault — `globalAlpha` on a whole-screen fade to
black is fine, since the reference does exactly that. Judge each one by whether
a player would see a soft edge *inside the world*.

Then **look at it**. A grep proves the primitive is there; only pixels prove how
it reads. Capture the moment and use `/grill` if it is a judgement call.

## Standing worklist

Found by this check on 31 Aug 2026, worst first. The mine has been fixed; the
rest are open.

1. ~~**Mine fuse ring**~~ — was an anti-aliased `arc` with a sine-faded alpha,
   expanding out of a mine at the moment the player was looking hardest. Now a
   jittered pixel shock front with a hard on/off blink.
2. **Order marker** (`drawOrderMarker`) — an expanding `arc` on every click.
   The most frequently seen violation in the game. It should stay a ring and
   become hard pixels, not disappear.
3. ~~**Extraction zone**~~ — was two concentric `arc`s with a sine pulse;
   became a dashed pixel ring, then (200-qa 004) lost its off-palette cyan
   and its double animation: gold over a dark backing pixel, jittered per
   dash, marching only.
4. **Grenade thrower ring** — an `arc` around the man who will throw.
5. **Crate, barrel and bullet shadows** — `ellipse` with alpha, where every
   other shadow in the game is a hard silhouette.
6. ~~**Quicksand ripples**~~ — were concentric `ellipse` strokes in `rgba`
   baked into the terrain; rewritten as stepped `fillRect` crust rings, then
   (200-qa 002) made rare, jittered and free to straddle tiles once mud got
   its own `Material` and stopped needing them to be visible at all.
7. **Target brackets** (`drawTargetMarkers`, render.ts) — `stroke()`ed
   corner brackets at a *fractional pulsing radius* (`8 + sin(t*7) * 0.8`),
   found while fixing 3. The greps above do not catch it: the sin is in the
   radius, not an `arc`. Same family as 2.

With 3 and 6 gone, fixing 2 removes the violation a player sees most; 7 is
its cousin and the same sitting could take both.
