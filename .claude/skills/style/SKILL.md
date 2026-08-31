---
name: style
description: The game's visual vocabulary — which greens, where the light comes from, how thick an outline is, how long a thing takes. Read before drawing anything, and used to settle "does this look like our game" without arguing from taste.
argument-hint: [what you are about to draw, or nothing for the whole vocabulary]
allowed-tools: Bash(npm run *) Bash(node *) Read Edit Glob Grep
---

Read [docs/style.md](../../../docs/style.md) first. It is the whole of the
vocabulary and it is short on purpose.

## What this is for

`/pixel-check` is the **law** — no anti-aliasing, no alpha, no gradients, no
smooth curves, integer coordinates. This is the **language**. The two are
different jobs and the difference is the reason this skill exists:

> **A drawing can pass the law and still look like a different game.**

Two items in this project have been built, judged by a critic, and reverted with
nothing to appeal to except taste. That is what an unwritten vocabulary costs.

## Using it

**Before drawing**, read the rules for the thing you are about to make. Most of
them are already decided and writing them down means not re-deciding:

- Light comes from the north-west, always. Cast shadows are hard, offset down
  and right, and their own flat tone.
- Three tones make a form; two make a line.
- Colours come from a ramp in `render/palette.ts` or `render/sprites/paint.ts`.
  Never from the eye. A new tone means the ramp changes.
- Gold means *this one*. Red means damage. Spending either elsewhere takes the
  meaning from where it is needed.
- One-pixel outline on anything that stands off the ground; the object's own
  darkest tone, not a shared black.
- Texture is one pixel, pulled off the tile's own noise, and some tiles are left
  bare — or it tiles.
- Prefer a thing happening in the world to a label on it.

**After drawing**, check the drawing against those and against
`/pixel-check`'s prohibitions. If it satisfies both and still looks wrong, that
is a real finding: say so, and say which rule is missing rather than adjusting
until it stops itching.

## What it cannot do

**It cannot tell you whether the drawing is good.** That is a critic's call, made
by somebody with no memory of building it, through `/gauntlet` or `/grill`. This
skill makes the argument *sayable*; it does not settle it, and a session must
never use it to sign off its own work.

## Keeping it honest

`docs/style.md` is read off the parts of the tree that work. When it and the
code disagree, **the code is what is wrong** — the standing list of places that
break the law is in `/pixel-check`, and the list of things that look wrong is
batch S in [docs/todo/100-improvements-spec.md](../../../docs/todo/100-improvements-spec.md).

If you find yourself wanting a rule that is not here, add it — but add it with
the thing in the tree it was read off, or it is a preference rather than a
vocabulary.
