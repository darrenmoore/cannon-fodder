# Style

The vocabulary. `/pixel-check` is the **law** — no anti-aliasing, no alpha, no
gradients, no smooth curves, integer coordinates — and this is the **language**:
which greens, how thick an outline is, where the light comes from, how long a
thing takes to happen.

The distinction matters because **a drawing can pass the law and still look like
a different game.** Two of this project's items have been built, judged and
reverted with nothing to appeal to except taste; that is what this document is
for. It is not a style guide in the abstract — every rule here is read off
something already in the tree, and where the tree disagrees with itself it says
so.

Read with [`/pixel-check`](../.claude/skills/pixel-check/SKILL.md), which owns
the prohibitions and the standing list of breaches.

---

## Light

**One source, from the north-west, and it never moves.** Every sprite in the
game is lit from the upper left and shaded to the lower right. It is why a
silhouette reads as solid rather than as a shape: the eye is told the same
story by the helmet, the hut, the crate and the plate.

- **Lit edge:** the top and left run of a form.
- **Shaded edge:** the bottom and right.
- **Cast shadow:** down and to the *right*, hard-edged, and always a separate
  flat tone rather than a darkening of what is under it.

There are exactly two shadow offsets in the tree and they should stay that way:
`{ x: 2, y: 3 }` for a figure, `{ x: 1, y: 1 }` for lettering. A third one is a
new idiom and needs a reason.

## Tone

**Three tones make a form. Two make a line. Four is a gradient wearing a
disguise.** A lit face, a body, a shaded face — and a dither seam between two of
them if the step is too hard for the size of the object.

Ramps live in `render/palette.ts` (terrain, per theme) and
`render/sprites/paint.ts` (everything that moves). **Never pick a colour by
eye.** If a new object needs a tone that is not in a ramp, the ramp is what
should change.

### The greens

| | | |
|---|---|---|
| **Your men** | `#5e8c2c` helmet, `#2a4014` body, `#8ad655` kit | Lighter, with a lime kit and rank pips. |
| **Their men** | `#5a72a0` helmet, blue-grey | Cool against your warm. |
| **Camouflage** | `#3a5220` helmet, `#1f3210` body | Pitched at *tree shadow*, deliberately below the grass — matching the grass would make him invisible rather than hard to see, and matching it loosely would make him look like one of yours. |
| **Canopy** | `#404000` → `#808010` | Straight off the reference: red equal to green, blue at almost nothing. |
| **Chrome** | `#4a5228` face, `#6b7439` lit, `#2e3419` shaded | The plate the panels are cut from. |

**Gold is the only warm colour in the chrome**, and it means *this one*: the
selected tab, the earned star, the active plate. Spending it anywhere else takes
the meaning away from where it is needed.

**Red is damage and nothing else.** Blood, a burning building, a failed
objective. Never a highlight, never a border.

## Outline

**One pixel, near-black, on everything that stands up off the ground.** Figures,
buildings, crates, barrels. Not on terrain, which is a continuous mass rather
than a set of objects — this is what makes a soldier read as *on* the ground
rather than *in* it.

The outline colour is the object's own darkest tone pushed further, not a
universal black: `#0a1204` for your men, `#05070c` for theirs, `#141310` for
buildings. A single shared black flattens everything to the same distance.

## Edges and shapes

- **A circle is stepped and `fillRect`ed**, one span per row. Keep the circle;
  lose the curve.
- **A diagonal is a staircase**, and the step is the shape rather than an
  artefact of it — so make it large enough to read as deliberate.
- **Debris is ragged.** The tell to watch for is geometric perfection: when
  something expands or breaks, scatter it.
- **A bevel is two flat tones with a dither seam**, never a ramp.

## Texture

Every large surface needs something, and it is always **one pixel**: a scanline
on a plate, a grain on sand, a crack in ice, a rut in a road.

**And it must not repeat per tile.** This is the failure the quicksand had — four
concentric ellipses drawn identically in every tile of a flat, so a large sink
read as wallpaper and the eye found the grid before it found the hazard. Two
rules follow:

1. **Pull the variation off the tile's own noise** (`NoisePlane.at`), so no two
   neighbours agree.
2. **Leave some tiles bare.** An unbroken field of *anything* tiles, however
   varied each one is.

## Movement

Nothing in this game is still, and almost nothing is smooth.

| | |
|---|---|
| **Idle** | A shift of weight every 1.1–3.4s, over ~26px. Small enough to be a fidget, large enough to *see* — it was 7px and fifteen men reading as statues was the result. |
| **A tell** | One pixel, on a per-object cycle. The wounded man twitches; that is the whole of how he is told from a corpse. |
| **A transition** | Through black, and the black covers the *screen* — canvas and chrome alike. |
| **A fade** | 0.4s. The one place alpha is deliberately spent. |

**Prefer a thing happening in the world to a label on it.** A wounded man
twitches rather than wearing a marker; a building that shrugs off a rifle round
throws chips back along its path rather than flashing a number; a sentry who has
heard you turns his head rather than sprouting an exclamation mark. This is the
rule most often broken by the cheapest available fix.

## Type

Two systems exist and that is one too many — a baked pixel font on the canvas
(`render/pixelfont.ts`, `render/bigfont.ts`) and whatever monospace the player's
machine supplies in the DOM. Closing that is
[101](todo/101-ui-spec.md)'s item 3.

Until it closes: **canvas text is baked, DOM text is uppercase with wide
tracking**, and neither borrows the other's idiom.

---

## What this document is not

It is not a defence of anything already drawn. Where the tree and this disagree,
**the tree is what is wrong** — these rules were read off the parts that work,
and the parts that do not are listed in `/pixel-check`'s worklist and in
[100](todo/100-improvements-spec.md)'s batch S.

And it settles nothing about whether a drawing is *good*. That is still a
critic's call, made by somebody who did not draw it, through
[`/gauntlet`](../.claude/skills/gauntlet/SKILL.md). This only makes the
argument sayable.
