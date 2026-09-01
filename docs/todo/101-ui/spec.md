# 007 — spec: the design batch

The brief is [101-ui.md](brief.md), but this document is
wider than that brief. It is **everything across 004, 005, 007 and 008 that is
judged by looking at it**, gathered into one place so it can be run as one
[gauntlet loop](../../../.claude/skills/gauntlet/SKILL.md) instead of as visual
rounds smuggled into four mechanical batches.

The split that decides what lands here is not "front end vs simulation". It is
**what the verdict comes from**:

| | |
|---|---|
| **Stays where it is** | Anything a test can settle. A wave that fires at the right second, a save that survives a migration, an enemy that turns toward a noise, a key that does what its cap says. |
| **Comes here** | Anything whose answer is *does this look like the reference* — where the only honest judge is a critic who did not build it. |

That line is why 005's batch M is split down the middle rather than moved
whole: the attract world *running* is a test, the vignette *over* it is a
gauntlet round.

---

## Why gather them

Three reasons, in order of how much they cost:

1. **A gauntlet run needs a quiet tree.** [loop.md](../../loop.md) records run 2
   ending early for exactly this: another session was rewriting `ui/hud.ts` and
   the mission table through the same hour, the campaign went from 12 missions
   to 32 mid-round, and *"a capture that comes back showing a mission nobody
   asked for is a capture that cannot be trusted about anything else in the
   frame either."* Visual rounds scattered through four batches guarantee they
   are judged while something else is moving.
2. **The objective has to be fixed before the first round, and it cannot be
   fixed per-item.** Plates, logo, level select, settings, buildings, fences and
   bridges are one visual language. Judged one at a time against seven separate
   objectives, they end up individually defensible and collectively incoherent —
   which is the failure the gauntlet's own "finish" step exists to catch, and it
   is cheaper to prevent than to sweep up.
3. **008 asks for `docs/style.md` and a `/style` skill.** That document *is* the
   fixed objective this batch needs. Writing it first is not overhead; it is
   round zero's other half.

---

## The three elements

Fixed here, before any code, and not renegotiated when a round gets hard.

**Objective.** Every screen and every object in this game reads as one game,
matched by eye to `docs/original-images/` — `elements/` for chrome, banners,
explosions and plates, `intro/` for the front end, `map/` for terrain. Pinned to
those files, never to an adjective.

**Metric.** A capture of the real thing from the real game, put beside the
reference for a subagent with no memory of building it, one round at a time.
**Never critiqued by the session that produced it.**

**Boundary.** `/gauntlet`'s default. May change `game/src/**`, `game/public/**`,
`game/tools/**`, `data/**`, `docs/**`. Must not regress `npm run check`, a clean
capture with zero page errors, any mission's completability, or the
one-character-per-tile map contract. Revert anything the critic does not call an
improvement. Attempt budget to be set by the owner per run — six rounds is the
default and this list is longer than six.

---

## Round zero is half done

`tools/moment.mjs` (`npm run moments`) already freezes the simulation, advances
it an exact number of steps and photographs twelve moments, asserting what it
captured **after** the screenshot rather than before — the fault that produced
two confident false critiques in run 2, recorded in
[loop.md](../../loop.md#run-2--the-presentation-batch).

**What it cannot yet capture is the entire front end.** There is no intro
screen, no level-select dialog and no black between-missions plate to photograph,
so every one of those needs its recipe written as the screen is built. The rule
from run 1 stands and no session waives it for itself: **nothing is judged until
a human has agreed that one captured frame is the right frame.**

---

## The list, ranked

Ordered by how much of the screen each governs, which is the only honest
ordering when the objective is "looks like the reference". Chrome before
objects, objects before icons.

| # | item | from | state |
|---|---|---|---|
| 1 | The plate system — `frame.png`, four states, any width | [100 M1](../100-improvements/spec.md), [101](brief.md) | new |
| 2 | The between-missions black screen | [004 H2](../004-enemy-ai/spec.md), [100 K](../100-improvements/spec.md) | open since 004 |
| 3 | Fonts — one type system, not two | [004 H3](../004-enemy-ai/spec.md) | built, unwired |
| 4 | The logo, dithered, with its hard drop shadow | [100 M3](../100-improvements/spec.md) | new |
| 5 | The intro screen: the attract world, the vignette, the composition **and the routing** | [100 M2/M4](../100-improvements/spec.md) | new |
| 6 | Level select: layout, groups, cards, stars, dialog | [101](brief.md) | new |
| 7 | Settings and pause, restyled | [100 M6](../100-improvements/spec.md) | new |
| 8 | Explosions — one dithered sprite, hot core, legible arc | [004 H4](../004-enemy-ai/spec.md) | open since 004 |
| 9 | Rank chevrons back on the name plates, counted | [004 gap 4](../004-enemy-ai/spec.md) | open since 004 |
| 10 | The bazooka man reads as one | [004 H5](../004-enemy-ai/spec.md) | open since 004 |
| 11 | The loading bootstrap — the first screen anybody sees | [100 M0](../100-improvements/spec.md) | new |
| 12 | The in-mission controls: exit, info, restart, and one confirmation | [100](../100-improvements/brief.md) | sprites made |
| 13 | Desert sand and water, against the reference | [004 gap 6](../004-enemy-ai/spec.md) | **blocked** |

**Two more arrived when 100 was reconciled.** The **loading bootstrap** is a
screen -- the first one anybody sees, and the one that decides what the game
looks like before it looks like anything. What it loads and how it fails is
plain behaviour and could have sat in 100; putting it there would have split a
third screen down the middle, which is the mistake this document has now made
once and does not need to make again.

The **in-mission controls** -- exit, info, restart, and the reusable
confirmation behind two of them -- come here because the sprites for them
already exist in this batch's work. The component is the load-bearing half: this
game has one confirmation pattern today and it is the pause sheet, which is a
list of actions rather than a question, so every "are you sure" so far has been
either skipped or improvised. It wants a title, a description that can be
styled, and a set of buttons each with its own variant and text.

**The whole of a screen belongs to whoever owns the screen.** 100 used to keep
the *routing* half of the intro on the grounds that a route is testable and a
picture is not. That is true and it was still the wrong cut: it put two sessions
inside one screen. The home screen, the intro, the logo and the level select are
this document's, composition and behaviour together -- including the attract
world that plays behind the intro, which is a thing to look at before it is
anything else.

**Seven items left this list for [100](../100-improvements/spec.md)** when the two
documents were reorganised: `docs/style.md` and the `/style` skill, the two
out-of-lore buildings, the bridges, the fences, the rubble and rock depth
problems, and the sidebar that is not under the fade. **They are batch S over
there now** -- they had been named here and given no home there, which is how
ten items came to sit in a sentence rather than in a plan.

That was decided on a **subject** split rather than a verdict one — **101 is
screens, 100 is the game** — and a fence is a game object, not a piece of
chrome. It is a defensible line, and easier to navigate than "who judges it",
which is what the first draft of this document used.

It has one cost, and it is better said than discovered: **those seven are still
judged by looking at them.** They need a critic with no build history and a
quiet tree exactly as much as the eleven that stayed. 100 owns the items; this
document owns the method, including `docs/style.md`, which 100 now builds and
every round here is judged against. Anything visual built over there comes
through the loop described here, or it is being marked by the session that made
it.

Item 13 was struck during run 2 and stays struck: the gap is orange sand against
navy water at a shoreline, and **neither desert mission has a drop of water on
it**. It needs a desert map with a coast — which [100](../100-improvements/spec.md)
batch R now has a reason to build anyway, since the desert theatre is five maps
short of its quota.

---

## What was checked before gathering

The 004 and 005 items were verified when those specs were written. The 008 items
arrive from a brief that has had no spec pass, so three of the cheap ones were
checked rather than taken on trust. All three hold, and two came with their
cause:

**Fences are drawn the same way in every direction.** `ground.ts` draws
`Tile.Fence` as two horizontal rails plus posts, with **no neighbour check at
all** — so a north-south run is a stack of left-to-right rails and a corner has
no corner. The interesting part is that the machinery is already there and this
tile does not use it: `Tile.Bridge` two branches above tests `railed(dx, dy)`
against its neighbours, and `Tile.Road` tests whether it runs vertically.
`terrain.ts` computes an **8-neighbour same-material bitmask** for every tile.
The fence needs to read the mask that already exists, not have one invented.

**A ruin keeps the standing building's depth.** Buildings go into the same
`sortY` list as actors, and a levelled one is drawn as sprite index 3 of the
same set — so rubble still sorts as a thing you stand *behind* rather than
ground you stand *on*. That is exactly the reported symptom.

**The sidebar cannot be under the fade, by construction.** `drawFadeOut` is step
10 of `render.ts` and paints the canvas; the sidebar is `<aside id="hud">`, DOM,
outside it. No amount of tuning the canvas fade reaches it — the fade has to
become something both surfaces obey, which makes this a small architectural item
rather than a cosmetic one.

The remaining 008 items — the two ugly buildings, the bridge ends, the heads
clipping rock — are reported symptoms with no cause found yet, and they enter
the list as such. **A guess dressed as a diagnosis is not a spec item.**

---

## Item 1 comes first, and is not optional

`docs/style.md` is what the other sixteen are judged against. 008 asks for it to
explain *"elements, objects, animations, fonts, ui etc."*, with a `/style` skill
referencing it — the same shape as `/pixel-check`, which pairs its law with a
standing list of the places currently in breach.

The distinction it has to carry is the one this project keeps rediscovering:
`/pixel-check` is **the law** — no anti-aliasing, no alpha, no gradients,
integer coordinates. `docs/style.md` is **the vocabulary** — which greens, which
plate, how a rivet is stamped, how a shadow is cast, how thick an outline is.
A drawing can pass the law and still look like a different game, and item 1 is
what makes that difference sayable out loud instead of settled by argument.

> **Done when** `docs/style.md` states the palette, the plate, the type, the
> shadow rule and the animation timings with a reference image beside each;
> `/style` reads it and carries a worklist of current breaches the way
> `/pixel-check` does; and the doc's tables are checked against the code by
> `test/docs.test.mjs`, which already does exactly this for five of
> `map-format.md`'s tables and would otherwise let this one rot.

---

## What is *not* in this batch

Left where it is, deliberately, because a test settles it:

- **005 J** — Last Stand's opening garrison, the wave lead, the end panel's
  dead key caps.
- **005 N** — three difficulties, the save migration, and the *rule* that a star
  is the highest tier cleared. Only **drawing** the star is item 7 here.
- **005 M0/M2** — the loading bootstrap's behaviour, and the attract world
  running CPU-vs-CPU with a fixed camera and no fog. Their *looks* are items 6
  and 7.
- **005 K's sequencing** — that results, black, plate and fade-in happen in that
  order. The plate itself is item 3.
- **005 L** — the whole distraction batch. L3, "make the decoy legible", is the
  one that could have come here; it stays because the tell it needs is a held
  facing, which is a simulation change measured in degrees, not pixels.
- **008's mechanics** — the second-click bug, hostage delivery radius, idle
  wander, wave difficulty, invulnerable spawner huts, the training missions, the
  in-mission button bar and its confirmation component. Those want a spec pass
  of their own.

**A note on the in-mission buttons.** 008 asks for exit / info / restart at the
bottom right and a reusable confirmation component. The component is mechanical
and stays in 008; but the moment those buttons exist they are chrome, and chrome
is item 2's plate. Whichever lands second should wear what the first one built,
rather than inventing a second button.

---

## Scale, honestly

Seventeen items, one of them blocked, four of them carried over from 004 and
never finished. **This is not one gauntlet run.** Six rounds is the loop's
default budget and it does not reach halfway down this list.

Proposed as three runs, each with its own quiet tree:

| run | items | what it settles |
|---|---|---|
| **A** | 1, 3 | The plate and the type. Nothing else can be judged until these are fixed, and both have been built and reverted once already. |
| **B** | 2, 4, 5, 6, 7, 11, 12 | Every screen, wearing A: the loader, the intro, the logo, level select, the black between-missions plate, the settings restyle, the in-mission controls. |
| **C** | 8, 9, 10 | What is left on the battlefield -- explosions, chevrons, the bazooka man. The rest of that work is 100's batch S. |

Run A is the one that must not be skipped. Items 2 and 4 are both *already
built and reverted once* — the plate got as far as `.ui-action` in 004, and the
generated font in `ui/pixelface.ts` is finished, verified, and unwired because
wiring it broke the sidebar and the fault was never found. Both were reverted
under a critic's verdict with no vocabulary to appeal to. That is what item 1
is for.

---

## Two things worth saying plainly

**This batch cannot be run by the session that builds it, and that includes
this one.** `/gauntlet` is user-invoked. Nothing here starts on my initiative,
and no round is self-judged.

**Four of these have been open since 004 and were not finished for a stated
reason** — the tree was not quiet. Gathering them does not fix that. If the
answer is "run it anyway while another session works", that is a legitimate
call, but it should be made on purpose and written into the run's boundary,
because it changes what a verdict is worth.

---

# Addendum — 1 September 2026

Written after a second brief from the owner, and after auditing whether the
first one ever made it into this document. Everything below was checked against
the running game before it was written down; where a claim held, the cause is
named.

## The audit: what [101-ui.md](brief.md) asked for, and where it went

The brief is one table row. **Item 6 — "Level select: layout, groups, cards,
stars, dialog" — is standing in for roughly a dozen separate asks**, and the
specifics have no home: nothing in this document records them, and nothing
states when any of them is done. That is the gap the owner suspected.

| the brief asked for | state |
|---|---|
| Level select is an extension of the intro, attract world still running behind | in item 5/6 as a sentence, no criteria |
| Fade in and out; the logo shrinks and moves up | **absent** — no item covers a transition |
| The back button moves somewhere else | **absent** |
| Left rail of groups: portrait, total missions, how many done | in item 6, uncosted |
| Clicking a group highlights it — "joyful, but immediate" | **absent** |
| Groups created now even if empty, aligned to what we have | **absent** |
| Mission card: big yellow number, name in caps | in item 6 |
| Description, 8–10 words, **NOT italic** | **absent**, and currently violated |
| Stars: always three, unearned ones hollow | drawn (`bakeStar`); the row is not specced |
| Locked missions use the disabled state, muted text, a padlock | drawn (`bakeLock`); the rule is not specced |
| Mission dialog: number, name, description, **no small fonts** | **absent**, and currently violated |
| Dialog shows stars earned, then difficulty choice, and closes | **absent** |
| "These things should be components so they can be reused" | satisfied by the `ui` tab |

So: **the brief is referenced, not carried.** Six of its asks appear nowhere,
and two of those — no italic, no small fonts — are rules the game currently
breaks. This addendum states them.

## Findings — the second brief, checked

### The overlay does not cover the sidebar, and the dialog is not centred

**Both true, one cause, and it is one line.**

[`style.css:968`](../../../game/public/style.css) says:

```css
[data-layout="wide"] #overlay { inset: 0 0 0 var(--sidebar-w); }
```

Measured on a 1280×800 viewport with the mission-failed panel up: `#overlay` is
`x: 188, w: 1092` — inset from the left by exactly the sidebar width. So:

- **The black bar.** The scrim starts after the sidebar, leaving a 188px strip
  uncovered. `#blackout` sits underneath at full opacity, so what shows there is
  pure black. The sidebar *is* under it and does show faintly through the 0.78
  scrim everywhere else, which is the "still there kind of".
- **The off-centre dialog.** The card centres inside the overlay, at x 734.
  The viewport centre is 640. It is 94px right of where it looks like it should
  be, on every wide layout.

Not DOM order — the stacking is correct (`#blackout` 8, `#overlay` 12, both
`position: fixed`, both direct children of `<body>`). It was a deliberate choice
to keep the sidebar readable under a briefing, and it is wrong for a modal.

### Italic is used in six places

`font-style: italic` at `style.css` lines 412 (`.briefing-line`), 450
(`.result-perfect`), 522, 589 (`.m-mech` — the mission description), 708 and
905. The result panel's own note is italic, which is the line the owner could
not read.

### The type is half the size the owner wants, and the dialog with it

Measured on the mission-failed panel: the card is **440×439 in a 1280×800
viewport**. Its sub-line and note are `--fs-sm` and `--fs-micro` — both 10px
after the font work. The buttons inside it (`TRY AGAIN`, `MISSION LIST`) set
their captions at `--fs-sm`, 10px, *smaller* than a button elsewhere in the
game. Nothing here is a bug; it is a scale that was chosen for a system-font
chrome and never revisited when the chrome became a bitmap face.

### Three screens do not exist at all

- **No loading screen.** Nothing in `ui/`, nothing in `index.html`, no boot
  element. Item 11 is untouched.
- **No intro or attract screen.** A cold boot lands on the mission list.
- **No between-missions title card.** `ui/blackout.ts` fades both surfaces
  through black, which is 004 H2's *transition*, but nothing draws a mission
  title on that black. Item 2 is half done and the half that remains is the
  picture.

### What already exists and should not be rebuilt

- **Groups are real data.** `groupByTheatre()` in `ui/menu.ts` buckets levels
  into theatres and the menu already renders a section per theatre. The level
  select needs a *rail*, not a grouping mechanism.
- **The unlock rule is built.** `sim/unlock.ts`: three free per theatre plus one
  per clear. "Locked" is a question with an answer already.
- **Stars are a settled rule.** A star is the highest tier cleared, 1–3.
- **The chrome exists.** Plates, buttons in four states, frame, banner, stars,
  padlock, and a 5×7 face shared by DOM and canvas.

## Decisions taken

**The front end stays DOM; the generated sprites dress it.** Plates, buttons and
frames become `border-image` and backgrounds cut from the same canvases the
`ui` tab shows. Text layout, list scrolling, focus and keyboard keep working,
and the attract world shows through because the canvas is already behind. The
alternative — drawing the screens on canvas — is truer to the pixel grid and
costs a re-implementation of every one of those, which is not a trade worth
making for chrome that looks identical either way.

**The type ladder becomes 20 / 30 / 40.** Body and labels 20px, headings and
names 30px, titles 40px — double today. The chrome face is only sharp at whole
multiples of 10px, so those are the only sizes available; there is no 24. Every
box that holds text grows with it, which is the same ask stated twice.

**No italic anywhere in the chrome.** Not a preference: a bitmap face has no
italic, so the browser synthesises one by shearing the glyphs, which puts a
diagonal edge on letters made of squares. It is unreadable *because* it is
out of lore.

## New items

Numbered from 14 so the existing table is not renumbered under another session.

| # | item | from |
|---|---|---|
| 14 | The modal layer: cover the whole screen, centre on the whole screen | second brief |
| 15 | The type scale, and every box that holds text | second brief |
| 16 | Italic removed everywhere | second brief |
| 17 | Every button becomes the generated plate | second brief |
| 18 | Dialogs restyled — briefing, result, pause, confirm | second brief |
| 19 | The loading screen | 100 M0 / item 11 |
| 20 | The intro screen, and how it arrives | 101, second brief |
| 21 | Level select: the screen, the rail, the cards, the dialog | [101-ui.md](brief.md) |
| 22 | The mission screen, from `next-mission.jpg` | 004 H2 / item 2 |
| 23 | The transitions between all four screens | second brief |

### 14 · The modal layer

Delete the `[data-layout="wide"]` inset. The scrim covers the viewport and the
card centres on the viewport. The briefing — which is a caption, not a modal,
and is the reason the inset existed — keeps the sidebar readable by being
*positioned* over the play area rather than by shrinking the layer everything
else uses.

> **Done when** on a 1280×800 wide layout the overlay's bounding box is
> `0,0,1280,800`, the card's centre is within 1px of the viewport centre, no
> strip of sidebar or blackout is visible beside a result panel, and the
> briefing still does not obscure the sidebar.

### 15 · The type scale

`--fs-body` 20, `--fs-lg` 30, `--fs-display`/`--fs-title` 40, micro and sm fold
into 20. Then every container that was sized around 10px type is re-measured:
the result card, the briefing, the pause sheet, the mission rows, the roster
plates.

> **Done when** no rule in `style.css` sets a font size that is not a multiple
> of 10; the mission-failed card is at least 640px wide on a 1280×800 viewport;
> and no text clips or overflows its box at 360px, 768px and 1280px wide.

### 16 · Italic

> **Done when** `grep -c "font-style: *italic" game/public/style.css` returns 0
> and no element sets it inline.

### 17 · Buttons

One button, everywhere: the four-state plate from `sprites/plates.ts`, applied
through `border-image` so it stretches to any label. Replaces `.ui-btn`, the
difficulty tabs, the menu actions, the result choices and the pause sheet's
rows.

> **Done when** every clickable control in the DOM chrome resolves to one CSS
> class; hover, active, disabled and pressed are the four generated states; and
> a capture of the menu, the pause sheet and the result panel shows no control
> using the old bevel.

### 18 · Dialogs

Briefing, result, pause and a new confirm share one shell: a frame, a banner
heading, body text at 20px, and a row of buttons. The result panel loses its
italic note and gains the room the bigger type needs.

> **Done when** all four are built from the same shell; the mission-failed panel
> reads at arm's length on a laptop; and every string in them is 20px or larger.

### 19 · The loading screen

The first thing anybody sees. Free hand, but it is the game's first impression
and it must not be a spinner: the logo assembling itself out of its own pieces
is in reach, because the pieces are separate sprites already.

> **Done when** a cold load shows it before the bundle's first frame, it never
> shows for less than 400ms (a flash is worse than nothing), and a failure to
> boot says so on it rather than leaving it up forever.

### 20 · The intro screen

Attract world behind, vignette over it, logo, and a column of arcade-sized
buttons. The logo arrives — drops, settles — rather than appearing.

> **Done when** a cold boot lands here rather than on the mission list; the
> attract world runs five minutes with no page error and both sides still have
> men; and the buttons are at least 44px tall with 30px captions.

### 21 · Level select

The whole of [101-ui.md](brief.md), which is listed in the audit above and not
repeated here. Groups exist for every theatre whether or not they have missions;
portraits may be placeholders. **The rail remembers which group was last open**,
in the same store the campaign already uses.

> **Done when** every row of the audit table is either built or explicitly
> deferred in writing; a locked mission cannot be started and says why; the
> remembered group survives a reload; and no text in the mission dialog is under
> 20px.

### 22 · The mission screen

`docs/original-images/elements/next-mission.jpg`: black, a big underlined
serif mission number, a rule, the mission name underlined, and a boxed BRIEFING
panel with the objectives in caps. `render/bigfont.ts` is that face and was
built for this screen. No phase line — 004 decision 4 settled that.

> **Done when** it appears on the black between missions, uses `bigfont`, and a
> critic with no history puts it beside the reference and calls the composition
> a match.

### 23 · Transitions

Loading → intro → level select → mission, each eased rather than cut, all
driven from one clock so a capture can freeze them.

> **Done when** every screen change passes through the existing blackout rather
> than swapping; no transition is shorter than 200ms or longer than 600ms; and
> `tools/moment.mjs` can photograph the midpoint of each one.

## Scale, honestly

**This is not a few hours and it is not one run.** Ten new items on top of
thirteen. Items 14, 15 and 16 are an evening between them — they are deletions
and constants. Item 17 is a sitting. Items 19 to 23 are a screen each, and 21 is
two.

Ordered by value per hour, which is not the same as the order above:

| | |
|---|---|
| **first** | 14, 16, 15 — reported bugs, cheap, and everything else is judged on top of them |
| **then** | 17, 18 — the chrome the screens are made of |
| **then** | 22, 19 — the two screens with a fixed reference and no invention |
| **last** | 20, 21, 23 — the most work and the most taste |

## What I will not do

**I will not run `/gauntlet`.** It is blocked from model invocation by design
and the block is right: this document says twice that the batch cannot be judged
by the session that builds it. Building these items and then grading them myself
would be the same failure with more steps. `/grill` on a finished screen is the
most I should do, and it is not a substitute.

**I will not invent the group portraits yet.** Six small paintings is a
different kind of work from chrome, the brief says a placeholder is acceptable,
and doing them badly in a hurry would set a bar the real ones then have to
match.
