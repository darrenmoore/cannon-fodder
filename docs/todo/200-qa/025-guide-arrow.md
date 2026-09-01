# 025 -- the guide arrow: bigger, in lore, animated

> map: the long road
> there is a guide arrow
> but it doesn't look in style or lore with the game
> it needs to be a lot bigger
> and it should slightly animate, like point them in the right direction

## Findings

The arrow is the off-screen objective marker, `drawOffscreen` -> `mark()`
(`render/render.ts:698-750`), on every map -- long road (220 tiles wide,
extraction far east) just shows it near-permanently. The owner's style
instinct is confirmed twice over:

- It is a `beginPath`/`lineTo`/`fill` triangle with **raw float vertices**,
  so the canvas anti-aliases every edge -- soft edges on a hard-pixel game.
- It draws at **`globalAlpha = 0.75`** inside the world -- alpha is banned
  outside the fog mask.
- It is 7 screen pixels, flat `#8fd44a`, and has **no animation** at all.
- `/pixel-check`'s standing worklist does not list it (its greps look for
  arc/gradient, not paths), so this is a new entry for that list too.

## Classification

Broken (two visual-law breaches), cause found -- plus the sizing/animation
ask.

## Plan (one sitting)

Replace the path triangle with a plotted chevron/arrow stamped in hard
pixels (bake 8 or 16 rotations at boot like other facing sprites, or step a
filled triangle with integer rows), roughly 3-4x the current size, full
opacity with a dark outline so it sits on any ground. Animate by nudging it
a few pixels along its own direction on a stepped cycle (frame-quantised,
not smooth sine -- the hardware couldn't). Same treatment inherits to the
enemy/hostage arrows, whose distance-alpha fade becomes a tone ramp. Add or
strike entries on `/pixel-check`'s worklist. Judge with `/grill` on long
road.

## Done when

- `/pixel-check` finds no alpha or anti-aliased edges in `drawOffscreen`.
- The objective arrow is at least ~24 screen px, outlined, and visibly
  pulses along its pointing direction (`/moments` capture).
- Enemy/hostage markers still distinguishable; a long road `/grill` does
  not name the arrow.
