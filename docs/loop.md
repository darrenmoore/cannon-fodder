# The visual gauntlet loop

A record of the overnight run against `docs/original-images/`. Written down
because the loop only works if the three elements are fixed in advance and not
quietly renegotiated when a round is hard.

## Objective

The game's terrain, actors, HUD and menu read as the same game as the
screenshots in `docs/original-images/` — Sensible Software's *Cannon Fodder*,
1993, Amiga. Not a homage: the same density, the same palette weight, the same
organic terrain silhouettes.

## Metric

`node tools/shoot.mjs --out shots/<round>` drives the real game in a real
browser and writes real pixels. A critic with fresh context is shown those
pixels beside the reference and asked for the single largest remaining gap.
The critic inspects the image, never a summary of it — and never the diff.

Hard gates that run every round:

```bash
npm run check    # tsc --noEmit, level validation, map tests
node tools/shoot.mjs --out shots/<round>   # must be a clean run: zero page errors
```

## Boundary

- May change: `game/src/**`, `game/public/**`, `game/tools/**`, `data/**`, `docs/**`.
- Must not change: the ASCII map format's *authoring* contract. One character
  is still one tile. Richness is **derived** at load time, never hand-authored.
- Must not regress: `npm run check`, frame budget (terrain stays baked, not
  per-frame), or any mission's completability.
- Stop when a round produces no critic-agreed improvement, or the ranked gap
  list is exhausted.

## The ranked gap list, from the baseline

Ordered by how much screen area each one governs, which is the only honest
ordering when the objective is "looks like the reference".

1. **Ground reads as flat paint.** ~80% of every frame. The reference dithers
   two tones at pixel scale *and* varies tone in metre-scale blotches.
2. **Foliage is a grid of identical lollipops.** The reference has contiguous
   canopy masses with irregular silhouettes that merge into each other.
3. **No undergrowth fringe.** The reference edges every foliage mass with dark
   red-brown scrub. It is the most recognisable single detail in the game.
4. **Shorelines are a hard colour boundary.** The reference banks water with a
   rocky red-brown fringe.
5. **Arctic reads as white paper**, and its water reads as land.
6. **The whole palette sits too light and too desaturated.**
7. **The HUD is a browser toolbar**, not the game's left sidebar.
8. **The menu is a flat list** of identically-bordered rows.

## Rounds

Each round: build the part, capture, hand the pixels to a critic with fresh
context and the reference beside them, record the verdict and the next gap.

### 0 — the metric

Before anything was drawn, `tools/shoot.mjs`: enters every mission by the same
click path a player uses, aims the camera, and writes real pixels. Without it
there is no loop, only opinions.

It was wrong twice, and both times it produced a *confident false critique*,
which is the failure mode worth naming:

1. `centreOn` is undone by the squad-follow on the next frame, so every "aim at
   the water" shot silently framed the squad instead. A critic reported, with
   pixel counts, that the arctic mission contained no water. It contains 630
   tiles of it. Fixed by giving the camera an honest `lookAt`.
2. The feature-finding window was three times the size of the viewport, so it
   picked the map's centre of mass rather than the feature.

**A metric that can lie will eventually be believed.** Both fixes went in before
any further judgement was accepted.

### 1 — the ground

Replaced the per-tile fill-and-speckle painter with a per-pixel bake: tone ramps,
ordered dither, and a domain-warped material lookup. This is where the tiling
method changed from "one character, one square" to "one character, one sample
into a derived field", and `terrain.ts` exists from here on.

*Critic:* the ground reads as ground now; the hem around every treeline is a
diamond. It was — the distance fields used four-neighbour BFS. Chebyshev fixed it.

### 2 — the treeline

Trees stopped being one sprite per tile and became a single baked mass: warped
silhouette, cellular-noise lumps, lit from the top-left.

*Critic:* "our jungle looks like a modern hex-grid strategy game's forest tile."
Two specific measurements followed, and both were right:

- **The palette was the wrong hue.** The original's grass is olive — `#526b21`
  and `#949429`, red climbing to meet green and blue at almost nothing. Ours was
  blue-shifted emerald.
- **The dither contrast was a quarter of the original's**, so the two tones
  optically averaged back into one flat colour.

### 3 — the palette, and the things on the ground

Retinted everything to the measured olive. Added grass blades, undergrowth as
*plants* rather than as a dithered halo around every clump, and wind-combed sand.

*Critic (arctic):* the arctic has no black in it, and the original's does — a
quarter of its frame is near-black crag, and that is what the snow is bright
*against*.

### 4 — the shell

The HUD became the original's left sidebar, built from five reusable components
in `ui.ts`, with the squad listed by name — because a casualty should read as a
name leaving a list, not as a counter going down. The end-of-mission panel reads
the casualties back and offers the next mission. The mission select groups into
theatres. `tools/playtest.mjs` was written at the same time, to assert on the
paths a screenshot cannot reach.

### 5 — the machine-made tells

Both critics independently named the same thing: every shape betrayed its
generator. Fixed in order of how loudly:

| Tell | Fix |
|---|---|
| Shorelines drawn as three concentric bands | one narrow dark fringe, straight into saturated water |
| ~9px diagonal corduroy through the canopy | warp the cellular grid, but by *less* than one cell |
| Tall grass stamped on a readable 16px lattice | baked as a mass, like the trees |
| Rock outcrops as a wall of near-identical boulders | baked as a mass, faceted, snow-capped |
| Roads as evenly spaced full-width stripes | broken wandering ruts, and an eroded verge |
| Red plants strung evenly along the treeline contour | clustered into stands by a noise field |
| Anti-aliased translucent drop shadows | dithered coverage of a darkened ground tone |
| Rectangular map borders of uniform thickness | `frame()`: a thickness that walks, with copses and bays |
| Marooned single tiles reading as hard squares | `smooth()`, a majority filter, on every map |

### 6 — measuring instead of arguing

The last critic round contradicted the earlier ones. It claimed our canopy was
lighter than the grass (the original's is darker), and that our snow was
"mint-cyan, not white".

`tools/measure.mjs` was written to settle it, and settled it both ways:

- **Wrong about the snow.** Our dominant snow tone is `#bcdde2` at luminance
  214. The original's dominant snow tone is `#bcdde2` at luminance 214. An exact
  match, so it was left alone.
- **Right about the ratio.** The original's grass mixes its two tones 28.9% to
  28.1% — almost exactly 1:1. Ours was 1.9:1, dark-biased, which is why it read
  as murky. One `bias` constant.
- **Right about the black.** The original's arctic frame is 14.3% pure `#000000`.
  Ours bottomed out at `#04070a` and never reached it.

**A critic is evidence, not a verdict.** Three of the claims in that round were
measurably false and the rest were measurably true, and there was no way to tell
which without measuring.

### 7 — the men

*Owner:* "the troops and enemies need work — they look too perfect."

Cropping both ours and the original's to the same magnification (`tools/crop.mjs`)
made the answer obvious in one look. The original's soldier is a bright helmet
crown over a hot orange face over a near-black body flecked with kit, entirely
asymmetric. Ours was stacked, symmetric, evenly shaded rectangles.

"Too perfect" turned out to be true at three separate levels, and fixing only the
sprite would have left most of it:

| Level | Was | Now |
|---|---|---|
| The sprite | symmetric stacked rectangles, evenly shaded | lit helmet, dark body, asymmetric kit flecks |
| The roster | one sprite set, so six identical men | four baked variants, chosen by actor id |
| The spawn | a 3x2 lattice, all facing south | scattered, each on its own facing |

## Where it stands

Every gate green: `npm run check` (36 map assertions across 8 missions),
`npm run playtest` (13 assertions on the mission shell), and a clean capture run
with no page errors.

The ranked gap list from the baseline is exhausted. What is left is not on it:

- **The map is stiller than it was.** Per-tree wind was a property of there being
  one sprite per tree. The treeline is one baked layer now and does not move.
- **Individual plant variety.** The canopy varies in tone and lump size across a
  map, but a palm and a broadleaf are the same mass with different colours.
- **Water has no surface life** beyond the existing shimmer pass — no current, no
  wake where a soldier wades.


---

# Run 2 — the presentation batch

The second run, against `docs/original-images/elements/`. Written down here in
full rather than pointed at, because a run whose terms live somewhere else is a
run whose terms can be quietly edited when a round gets hard.

## Objective

The end-of-mission moment, the between-missions screen and an explosion read as
the same game as `docs/original-images/elements/`. Pinned to files, not to
adjectives:

| | |
|---|---|
| `phase-complete.jpg` | Heavy outlined display serif, two lines, centred **over the live battlefield** -- not over black. The grass is still visible behind it. |
| `next-mission.jpg` | Full black. Centred stack, horizontal rules, a bordered briefing box, and *two* type sizes -- a large display face for the titles and a small blocky one for the detail. |
| `explosion.jpg` | One dithered sprite, repeated at several stages and scattered, with a hot core low in the blast. |
| `buttons-and-troop-chevron-status.jpg` | Gold rank chevrons flanking each name on the plates, **varying in number per soldier**. |
| `target.jpg` | The aim marker is a red ring with four spokes. A circle, every pixel of it placed. |

## Metric

`npm run moments` (`tools/moment.mjs`) writes one frame per ranked gap to
`game/shots/moments/`, each with the state it was captured in recorded beside
it. A critic with no memory of the build is shown the reference and the capture
and asked for the single largest remaining gap.

Hard gates every round:

```bash
npm run check                      # tsc, level validation, map tests
npm run moments --out shots/h-N    # every frame must verify, none SUSPECT
```

## Boundary

- **May change:** `game/src/**`, `game/public/**`, `game/tools/**`, `docs/**`.
- **Must not change:** `data/**`. This run is presentation; a round that wants a
  map has left the batch.
- **No asset files.** H3's font is generated in code -- a `.woff2` would be the
  repo's first shipped asset and the premise of the project is that there are
  none. Settled by the owner, 31 Aug 2026.
- **Must not regress:** `npm run check`, `npm run playtest`, a capture run with
  zero page errors and zero SUSPECT frames.
- **Stop when:** a round produces no critic-agreed improvement, the ranked list
  is exhausted, or the budget is spent.
- **Budget:** six rounds, one per surviving gap. Set by the owner before the
  first round, 31 Aug 2026.

## The ranked gap list

Ordered by how much of the screen each governs.

| | gap | frame |
|---|---|---|
| 1 | There is no phase-complete moment at all -- no banner, no celebration, no hold, no fade | `win` |
| 2 | The end panel is a DOM card where the reference is full black, rule-lined type and nothing else | `win`, `lose` |
| 3 | Explosions are particles where the reference is a dithered sprite | `explosion-01/04/10` |
| 4 | The name plates lost their rank chevrons | `plates` |
| 5 | Two type systems disagree -- baked pixel font on canvas, the player's OS monospace in the DOM | `briefing` |
| 6 | **Struck.** Sand and water washed out -- unclosable inside this boundary; see round zero | `shoreline` |
| 7 | The bazooka man carries a rifle as far as the eye can tell | `men` |


## Round zero — proving the capture, before there is anything to judge

Run 1's lesson, in its own words: **a metric that can lie will eventually be
believed.** So nothing in this batch is judged until a capture exists that
provably shows what it claims to.

`shoot.mjs` cannot take these pictures. It frames *missions*: it aims a camera
at terrain and photographs a standing world. Batch H is a banner flying up, an
explosion three frames in, a name plate at four times size and a screen that is
supposed to be entirely black. So round zero built `tools/moment.mjs`
(`npm run moments`) -- eleven named recipes, one per ranked gap, each of which
arranges the world, advances it by an exact number of *simulation* steps, and
photographs the result.

Three things about it are deliberate.

**The steps are counted, not timed.** A new dev-only switch, `debug.paused`,
freezes the simulation and leaves the draw running, so the harness advances the
world by hand: frame 4 of an explosion is frame 4 on every machine and every
run. Waiting fifty milliseconds and hoping is how two runs of the same build
produce different pictures and an argument about whether anything changed.

**Every frame reports what it was.** Each moment asserts something about the
state it captured -- the phase, whether the panel is up, how many men are
alive, the age of the oldest particle -- and prints it beside the filename,
into a `README.md` next to the images. A frame that fails its assertion is
still written and loudly marked SUSPECT, because a wrong picture you know is
wrong is worth something and a wrong picture you trust is worth less than
nothing.

**The assertion is read after the shot, not before it.** This was wrong first
time and is worth recording, because it is run 1's failure in miniature: the
first version asked the game what it looked like at the end of the setup, which
is before the loop has drawn a frame or the HUD has reacted. It reported "no end
panel" on ten frames out of eleven, over pictures that were about to have one.
Two of those reports were about the single most important moment in the batch.

### What round zero found before a single pixel changed

- **Gap 6 cannot be photographed.** The gap reads "desert sand and water are
  washed out against the reference", pinned to `elements/sand-and-water.jpg`.
  Neither desert mission has a drop of water on it -- the best sand-beside-water
  window on `long-road` and `minefield` is zero tiles. The shoreline frame is
  therefore taken on `village`, which is jungle, and a second frame
  (`desert-ground`) shows the desert palette with no water in it at all. **Gap 6
  as written is not closable inside H's boundary**: it needs a desert map with a
  shoreline on it, which is a mission-design change.
- **Freezing the simulation froze the end panel too.** The first version of the
  pause gate wrapped the whole frame callback, and the HUD is what raises the
  end-of-mission panel -- so the one moment worth photographing, winning, became
  the one moment that could not be photographed. The gate is around the step
  alone now.
- **The dev panel was in every frame**, with `freeze` lit green, announcing to
  any critic that the picture was staged. It is hidden at capture time.

### The eleven frames

`npm run moments` writes them to `game/shots/moments/`, with a README beside
them recording the state each one was captured in.

| | gap |
|---|---|
| `win`, `lose` | 1 and 2 -- the end-of-mission moment, and the DOM card where the reference is full black |
| `briefing` | 2 and 5 -- the mission card, and both type systems in one frame |
| `explosion-01/04/10` | 3 -- three stages of one blast, provably three different frames |
| `grenade-in-flight` | 3 -- the throw, mid-arc |
| `plates` | 4 -- the sidebar, six men at six different ranks |
| `men` | 7 -- soldier, rifleman, sniper and bazookateer side by side at 8x, nobody firing |
| `shoreline`, `desert-ground` | 6 -- and the finding above |

**Round zero ends here, and the loop does not start until a human has looked at
one of these frames and agreed it is the right frame.** That is the rule from
run 1 and it is not this session's to waive.

## Round 1 — the phase-complete moment · **KEPT**

Gap 1. There was no end-of-phase moment at all: the mission resolved and a DOM
card arrived on the same frame.

Built: `render/bigfont.ts`, a 10x13 display serif plotted glyph by glyph in the
same idiom as everything else here -- a webfont would have been the repo's first
asset file. Baked with a solid offset shadow and a hard 1px halo, no alpha. The
banner is drawn in *screen* space over the battlefield, derived entirely from
`phase` and `phaseTime` so there is no banner state to keep in sync, and it
flies up from below the frame on an ease-out. `hud` holds the results panel back
for `CONFIG.banner.hold` seconds so the moment exists at all.

`moment.mjs` gained `win-panel`: gap 1 and gap 2 are now different frames,
because the banner and the card are no longer the same instant.

**Critic (fresh, shown the reference and both captures under neutral names):**
*"Image B is much closer. It reproduces the actual event -- the same words, in
the same stacked two-line serif slab, drawn over live terrain -- whereas C
substitutes a modern menu dialog with different wording, and so isn't in the
same category."*

**Kept.** The next gap, in the critic's words:

> **Scale.** The letters are enormous relative to the world; in the original the
> banner is a modest overlay sitting on a battlefield, not a wall of text that
> swallows the entire playfield.

and, on the lettering itself:

> Thicken the strokes and drop the letters' internal contrast. B's letters are
> drawn narrow-stroked with long, thin, spindly slab serifs and much more white
> space inside each glyph, which makes them read as a wide display typeface
> rather than the original's chunky one.

## Round 2 — scale and weight · **KEPT**

The critic's gap from round 1, both halves of it. `CONFIG.banner.fill` 0.74 ->
0.5, and a `WEIGHT` pass in `bigfont.ts` that dilates the plotted ink one pixel
to the right: every vertical stem goes to 3px and the counters close by a pixel
a side, while the horizontal serifs -- already the full width of their letter --
barely move. So the serif-to-stem *ratio* drops, which was the actual fault,
without re-plotting twenty-six glyphs and hoping.

**Critic (fresh, round 2 against round 1):**
*"B is closer. Its cap height is roughly the reference's relative to the terrain
... C is grossly inflated -- the caps are ~4 troop-heights tall ... spilling from
sidebar edge to screen edge and burying the troops."* On size: *"B's is about
right -- arguably a hair large, but within range."*

**Kept.** The next gap, in the critic's words:

> **The drop shadow / outline treatment.** In the reference the lettering is
> cream with a thin, tight dark outline hugging every stroke, offset barely a
> pixel or two, and the letters therefore sit *on* the grass. In B the dark
> casing is a fat, offset black slab down and to the right, several pixels wide,
> which detaches the type from the ground.

## Round 3 — the shadow · **KEPT**

`SHADOW` 2px -> 1px. At two, the halo and the shadow together made a dark mass
three pixels deep on the lower right, which at a five-times draw scale is
fifteen screen pixels of black hanging off every letter.

**Critic:** *"B is closer ... in C the counter of the P is solid black except
for a single 2x2 green pixel, the gap between P and H is filled black to the
baseline, and adjacent glyphs' outlines fuse into one mass under COMPLETE. In B
the outline is roughly one pixel thinner, so terrain still reads inside the P
bowl."* Near-black coverage over the banner box: 26.2% against 30.7%.

## Round 4 — removing the keyline · **REVERTED**

Round 3's critic named the black keyline as the largest remaining fault, and was
emphatic that the reference has none: *"the letters are plain cream on live
terrain, with the ground's own dither running right up to and through the
counters."*

**That claim was checked rather than taken.** Sampling the reference directly:
the pixels immediately around its lettering have a median luminance of **106
against a field of 66** -- brighter than the grass, not darker. There is no
keyline. What reads as one is JPEG ringing between bright ink and dark field.
The ground behind the word is 65 against 73 outside it, so at most a very slight
darkening. The critic was right about the artefact.

So the casing was removed. **And a fresh critic judged it worse**, unprompted
and specifically: *"B's letters are flat cream fills with only a soft, thin dark
smear on the lower-right and no defined outline at all -- the glyphs bleed into
the grass, and the strokes are uniformly thin, so PHASE reads as a light serif
rather than a heavy display face."*

**Reverted**, per the rule that anything the critic does not call an improvement
goes back. Worth recording *why* the measurement and the verdict disagreed, since
both were correct about different things: the reference is a 1x screenshot of a
1x screen, and this game draws that face at five times size. At 1x, ink against
dark grass needs no help holding its edge. At 5x it does. Copying the
reference's pixel facts rather than its *result* is how a reproduction ends up
further away than it started -- which is the same failure as run 1's, wearing
different clothes.

**Two critics also bracketed the banner's size rather than contradicting each
other.** Round 2's called 0.74 of the screen width "grossly inflated ... burying
the troops" and 0.5 "about right, arguably a hair large". Round 4's, seeing only
0.5, called it too small: *"the lettering occupies maybe half the frame width
and sits with large empty green margins left and right ... it does not command
the screen the way the original does."* Between the two, the answer is above 0.5
and well below 0.74.

## Round 5 — the banner at 0.6 · **REVERTED**

The bracket from round 4, split down the middle. A third critic, shown 0.5
against 0.6, picked 0.5: *"C, clearly -- not a close call."* Reverted, and the
bracket is closed at 0.5 by two verdicts to one.

Worth noting what that critic *said* the difference was, because it was wrong
about the cause while being right about the frame: it described 0.6 as "wide,
widely-spaced and blobby" with "mushy" serifs against 0.5's "condensed, tightly
packed" letters. The two frames use the same font, the same tracking and the
same weight -- they differ only in draw scale. A critic reasons about what it
sees and reaches for a vocabulary; the *verdict* is the metric, the diagnosis
is not.

## Round 6 — the action buttons · **KEPT**

Not from the ranked list. Round 5's critic was asked, banner aside, for the
single most un-1993 thing in the frame, and named the pause control without
hesitation: *"a smooth anti-aliased circle with a soft translucent dark fill
sitting on top of the terrain ... it reads as a modern mobile-game touch control
pasted onto the frame."*

Three breaches of the house rules in one widget -- an anti-aliased curve, alpha,
and a blurred shadow -- on screen in every single frame of the game. Now a hard
rectangular plate: opaque fill, solid offset shadow, the 2px inset border the
name plates already use. `opacity: 0.4` for unavailable became a darker plate,
because a blend is a blend. The tap targets did not change size.

**Critic (fresh, told to ignore the lettering entirely and compare the rest):**
*"B is the era-correct one ... C replaces it with a circle. The ring is a smooth
anti-aliased curve with grey intermediate pixels all around its circumference,
and the fill is alpha-blended over the terrain -- 47 unique colours in the same
interior sample, none dominant, against 19 with one dominant in B. A 1993 Amiga
does not draw a soft-edged translucent disc."* Scored **6/10 against 4/10** for
"could be a screenshot of a 1993 Amiga game".

**Kept.**

## Round 7 — the chrome's typeface · **REVERTED**

Gap 5, named by two critics in a row and by the second in detail: the DOM text
was drawn by the browser at native resolution with LCD sub-pixel colour fringing
on every stem, next to a battlefield drawn at four times scale, so *"the two
halves of the screen read as different machines"*.

Built `ui/pixelface.ts`: a 5x7 bitmap face and a TrueType writer that emits it at
boot as a data-URI `@font-face`. Every row of ink becomes a rectangular contour,
four points, no curves for an anti-aliaser to soften. Generated rather than
shipped because a `.woff2` would be the first asset file in a project whose
premise is that there are none.

**The font itself is right, and that was measured before anything was judged.**
The browser accepts it; ten characters come to exactly 60.0px at `font-size:
10px` and 120.0px at 20px, against 54.98px for the fallback monospace. Whole
glyph pixels on whole device pixels, which was the entire point.

**Wiring it into the chrome broke the sidebar**, in four captures running:
soldier names unpainted, panel content displaced, and one frame showing a
different mission from the one the harness had been told to load. Backing the
family out fixed it every time, so the correlation looked certain. Then a DOM
probe taken under the font reported the panel **correct** -- all six names
present, positioned at the right coordinates, right size, right colour. The
picture and the DOM disagreed.

**Reverted**, and the module left in the tree, finished and unwired, with the
one line that switches it on documented at the top.

### The finding that matters more than the round

That disagreement is the run's second lesson, and it is about the conditions
rather than the pixels. **This run did not have the tree to itself.** Another
session was rewriting `ui/hud.ts` and the mission table through the same hour --
the campaign went from 12 missions to 32 while these rounds were being judged --
and a capture that comes back showing a mission nobody asked for is a capture
that cannot be trusted about anything else in the frame either.

Round zero's rule proves a *harness* shows what it claims. It cannot prove the
*build under it* is the one you think you are judging. A gauntlet run needs a
quiet tree, and that belongs in the boundary next time alongside the ports and
the file globs.

# Where run 2 stands

Seven rounds. **Four kept, three reverted.** The budget was six; the owner
extended it and the seventh ended the run for a reason that had nothing to do
with the pixels.

| | | |
|---|---|---|
| 1 | The phase-complete banner, over the battlefield | kept |
| 2 | Its scale and weight | kept |
| 3 | Its shadow, 2px to 1px | kept |
| 4 | Removing its keyline | **reverted** |
| 5 | Its scale at 0.6 | **reverted** |
| 6 | The action buttons, circle to plate | kept |
| 7 | The chrome's typeface, generated as a bitmap font | **reverted** |

Gap 1 is closed and gap 6 is struck as unclosable inside the boundary. **Gaps 2,
3, 4, 5 and 7 are untouched** -- the black between-missions screen, explosions,
the rank chevrons, the two type systems, and the bazooka man.

Round 6's critic named the next one independently, which is the strongest signal
this run produced about where to go next:

> The worst remaining anachronism is the sub-pixel anti-aliased UI text in the
> left panel. "CHICKEN RUN" and the control hints are browser-rendered at native
> resolution with LCD sub-pixel fringing -- orange on one side of a stroke, cyan
> on the other. Colour fringes on glyph edges are a 2000s-LCD artefact; they
> cannot exist in a 1993 frame. It is made worse by the scale clash: the map is
> chunky 4x-ish pixels, the text is crisp 1:1, so the two halves of the screen
> read as different machines.

That is gap 5, arrived at from the other direction, and it now looks larger than
its position in the list suggested. **It is where a run 3 should start**, and it
is already settled that the face must be generated in code rather than shipped.

## What this run taught, beyond the pixels

Run 1's lesson was that a metric can lie. Run 2's is narrower and sharper: **a
correct measurement of the reference is not the same as a correct target.**

Round 4 sampled the reference and proved it has no keyline around its lettering
-- median edge luminance 106 against a field of 66. That measurement was right.
Removing our keyline to match was still wrong, and a fresh critic said so
immediately, because the reference is a 1x screenshot of a 1x screen and this
game draws that face at five times size. At 1x, cream ink on dark grass holds
its own edge. At 5x it does not.

Copying the reference's pixel *facts* rather than its *result* is a way to get
further from it while being able to prove you got closer. Round zero's rule
catches a lying capture; nothing but the critic catches this one.

---

# Run 3 — the plotted chrome

The third run, against `docs/original-images/intro/`. Everything judged here was
drawn on 31 August and 1 September by the session that is now running the loop,
and none of it has been looked at by anybody else. That is the reason for the
run and it is also its risk: **six artifacts share one primitive.** The
wordmark, the plates, the buttons, the banner, the stars and the padlock are all
painted by `render/sprites/bevel.ts`, so a fault in the bevel is a fault in all
of them at once, and a critic looking at one of them is really looking at the
lighting model behind six.

## Objective

The plotted chrome reads as the same hardware as the art it was drawn from:

| artifact | reference |
|---|---|
| the wordmark | `docs/original-images/intro/logo.png` |
| the plates and buttons | `docs/original-images/intro/frame.png` |
| the banner | `docs/original-images/intro/banner.png` |

Judged one artifact at a time, each against its own file. Not "looks good" and
not "matches the palette" — **a fresh critic shown the two images unlabelled
should struggle to say which is the reference**, and where it can, its reason is
the gap.

## Metric

The real sprite out of the real atlas — `window.__atlas`, the same object the
renderer draws from — captured at the size the game draws it, placed beside the
reference region resampled to the same width, on the neutral grey both this
loop's tools already use. `tools/pixelate.mjs beside` does exactly this and was
written for it.

Judged by a subagent with no history of the build, one per round, given both
images without being told which is which.

**Two things this run must not do**, both bought at the price of a previous run:

- **Run 1's lesson.** A metric that can lie will eventually be believed. Round
  zero is proving the capture shows what it claims, and nothing is judged until
  a human has agreed one frame is the right frame.
- **Run 2's lesson, which is the live danger here.** A correct measurement of
  the reference is not a correct target. This session measured the reference
  repeatedly with `tools/pixelate.mjs` and changed the drawing to match the
  numbers — the ampersand's proportions, the B's counter widths. Those were
  right. The same move made wrongly is round 4 of run 2, where a correct
  measurement of the reference's missing keyline produced a worse frame. **The
  critic decides, not the measurement.**

## Boundary

The default.

- **May change:** `game/src/**`, `game/public/**`, `game/tools/**`, `data/**`,
  `docs/**`
- **Must not regress:** `npm run check`, a capture with zero page errors, any
  mission's completability, the one-character-per-tile map contract
- **Stop when:** the critic reports no improvement for a round, the ranked list
  is exhausted, or six rounds are spent

Six rounds, at roughly one build-capture-critique cycle each. Nothing is
committed by the run; it is reviewed as one diff afterwards.

## The ranked gap list

Ordered by how much of the screen each governs, which is the only honest
ordering when the objective is "looks like the reference".

1. **The wordmark.** It is the intro screen. Nothing else on that screen is
   larger, and it is the artifact with the most invention in it.
2. **The plates and buttons.** Every screen is made of them; they are small
   individually and total more area than anything else.
3. **The banner.** One strip, but it carries a heading on every screen.
4. **The stars and the padlock.** Icons. Smallest area, judged last.

Ranked before the baseline critique, from area alone. The critic reorders within
an artifact; it does not reorder the artifacts.

## Round zero — the capture, and the confound it had in it

`tools/pixelate.mjs beside` already existed and did the mechanical half: pull
the sprite out of the live atlas, resample the reference region to the same
width, put them on one strip at the same zoom. The first frame it produced was
honest about the pixels and useless as a metric, for a reason that had nothing
to do with the pixels: **the reference still had its chroma-green background on
it.** A critic asked which of two images is the reference answers "the green
one" and never looks at anything else, and question 1 — the only question that
measures the objective — is dead.

Keyed to the same grey before the resample rather than after, because the
resample averages green into every edge pixel and no threshold gets it back.
Round zero's rule earned its keep again: the tool was not lying, but the frame
it produced could not have answered the question it was made to ask.

## Round 1 — lighter strokes, open counters · **REVERTED**

The baseline critic's ranked gap: "the letterforms — stroke weight and counter
size", 55-60% of the frame, with the O's counters called "a narrow vertical slot"
and the B's "pinholes". Stems went 13→11 and bars 10→8 on both lines.

The next critic called it **further**, and measured why: the reference O's
counter is 21% of the glyph width, the version before this round was 37%, and
this round took it to 49%. "The reference letterform is a fat slab with a
pinched slot punched out of it; B turned it into a thin ring around a nearly
square hole."

**Two fresh critics gave opposite directions on the same feature.** That is the
finding of this round, and it is worth more than the round. The first said the
counters were too small; the second measured them and said every attempt so far
had been too open. A single critic's ranked gap is a hypothesis, not a
measurement, and this loop treats it as one from here.

## Round 2 — a lighting model on the faces · **KEPT**

The critic's next gap: "the letters have no lighting on them" — sampling down a
stem returned two values alternating in a fixed checker with no positional
trend, where the reference ramps from bright at the top to dark at the foot.

`face` went from a pair to a **ramp**, and the dither now resolves only the
fraction between two *neighbouring* entries, positioned by how far down the
shape a pixel is. Two tones mixed at a fixed ratio is a texture; it is one flat
colour with noise on it however many tones are in the pair.

Verdict: **closer**. "Face luminance in A spanned p5-p95 = 92-111 — effectively
a flat fill; in B it spans 69-140 against the reference's 67-122." The change is
in `bevel.ts`, so the helmet and the wings got it too, and the critic named both
unprompted.

## Round 3 — tracking and glyph widths · **KEPT**

Next gap: the words were fusing. "The reference breaks into seven separate runs
with clear 6-10px gaps; the attempt breaks into three — B-U-L-L is one
continuous 294px slab." Tracking 1→4, and every glyph trimmed 3px so the words
did not grow.

Verdict: **closer**, with the letter widths measured to within 3px of the
reference's and the counters called "compact squares and a narrow vertical slot,
which is what the reference has".

## Round 4 — an extruded side face, and darker ramps · **REVERTED**

Next gap: "pale flat stencilling" — the reference has a wide dark bevel face
down the right and bottom of every stroke, ours had one pixel. Added
`shadeWidth` and pushed both ramps darker.

Verdict: **further**, and badly. "Roughly triple the reference's top-to-bottom
falloff... about 50 RGB units too dark in every band... zero pixels above V 0.9
in BULLETS where the reference has 25%." At a 13px stem a three-pixel side face
is most of the stroke, so the letters filled in rather than gaining depth.

Reverted precisely rather than with `git checkout`, because rounds 2 and 3 were
uncommitted in the same two files.

## Round 5 — the backing mass · **KEPT**

Not the last critic's headline. Its headline was the letterforms — the same
answer rounds 1 and 3 had already chased. This round took instead **the gap
three separate critics had each mentioned and none had ranked first**: the
reference sets its wordmark on a dark olive field, and ours showed bare page
through 15% of the block against the reference's 4%.

A dilated silhouette of the two words, in dark olive, behind everything — **with
the counters cut back out of it.** That last part is a deliberate departure. In
the reference the counters read black, because the foliage is behind them too;
this logo has to sit over an animating battlefield and the owner has already
asked, in as many words, for the holes in the letters to stay holes. Air between
the letters, daylight through them.

Verdict: **closer**. The critic attributed the gain to colour — "the dead-black
keyline was replaced with a dark olive that reads the way the reference's edges
do" — which is a contrast effect from the darker surround rather than a palette
change, and is exactly the improvement that was wanted.

## Where run 3 stands

Three rounds kept, two reverted, the budget spent. `npm run check` green, the
capture clean with zero page errors, and the chrome that shares `bevel.ts`
checked afterwards for regression: all four plate tones still distinct, the
banner and stars unchanged in kind.

**The gap still at the top of the list, and it is the expensive one.** Every
critic from round 3 onward has converged on the same thing in different words:
the wordmark is a rigid grid where the reference is a hand-cut mass. "Every
glyph the same width and weight, bolt-upright, evenly spaced, dead-flat
baseline" against "fat hand-cut slabs of varying width and height, leaning and
splaying outward in perspective, overlapping and touching on a curved baseline".

That is not a parameter. It is per-glyph variation — individual widths, vertical
offsets, a fanned arrangement, letters allowed to overlap — and it is a redesign
of `lineMask` rather than a tuning of it. It is also the point at which this
run should stop and the owner should decide, because the current letterforms are
*legible and consistent* and the reference's are neither, and "closer to the
reference" and "better for a menu at 300 pixels" may not be the same direction.

**What this run taught, beyond the pixels.** Run 1 learned that a metric can
lie. Run 2 learned that a correct measurement of the reference is not a correct
target. Run 3 adds a third: **a single fresh critic's ranked gap is a
hypothesis.** Rounds 1 and 4 were both built on one critic's confident,
measured, first-ranked gap, and both were reverted by the next critic on
measurements just as confident. The gaps that survived — the flat faces, the
fused words, the missing backing — were the ones more than one critic named
independently. Corroboration across critics is the signal; a single ranked gap
is where to look, not what to do.
