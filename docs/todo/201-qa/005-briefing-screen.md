# 005 -- the mission brief screen, closer to the original, with a controls strip

> on the mission brief screen i want it to look more like the original..
> C:\dev\games\cannon-fodder\docs\original-images\elements/next-mission.jpg
>
> - it's already a black screen
> - it should use one of our existing frames / panels
> - it needs to also include controls, depending if you're on mac or windows
>
> [controls tables -- see below]
>
> - why? because my friend wanted to play and he was on mac and had no idea
>   how to fire etc... so if we put a strip of info on the mission page no one
>   will miss it - but also keep it SIMPLE, take what i'm saying here as a
>   guide, it might need some graphics / and icon or something.

The F key itself is issue **006** -- the owner asked for it as a separate spec
doc, and this issue's controls strip is the thing that *describes* it.

## Findings

**The briefing exists and is exactly as plain as the brief says.**
`ui/hud.ts:449-490` (`showBriefing`) builds a `div.briefing` into
`#overlay-card` containing, in order: the map name, the objective line, the
map's `brief` string, a squad roll of `.briefing-man` chips, and a Boot Hill
count. `main.ts:465-533` puts it on the black, swallows the click that
dismisses it, and holds the simulation while it is up (`main.ts:230`).

Its CSS is `style.css:413-431` plus `:698-720`: text on black, a gold title
with a hard shadow, and **no frame, no plate, no border of any kind.** It is
the last screen in the game not wearing the plotted chrome -- the result panel
was the previous one and was fixed in 200-qa 026.

**The frames it should use already exist.** `ui/skin.ts` publishes
`--sk-frame` (from `bakeFrame`, brass, sliced 18), `--sk-plate`, `--sk-banner`
and the star/lock/icon set, all as `border-image` sources. Nothing new has to
be plotted for the box.

**The reference** (`docs/original-images/elements/next-mission.jpg`) is a
five-part stack on black:

| | |
|---|---|
| `MISSION 5` | large, centred, underlined by a full rule |
| `PHASE 2 OF 3` | small, wide-tracked, no rule |
| `A NICE SET OF BAZOOKAS` | largest type on the screen, rules above and below |
| a hairline-bordered box | titled `BRIEFING` |
| objective lines | inside the box, centred, small, wide-tracked |

Notably the box is **much taller than its text** -- the objective lines sit in
the top third and the bottom two thirds are empty. That empty space is exactly
where a controls strip goes without inventing a new region.

**What maps onto what.** We have no phases, but we do have a campaign index
and a theatre: `front.ts:271-274` already numbers missions within a theatre
(`01`, `02`...) and that number is passed to `offerMission`. The briefing does
not currently receive it -- `showBriefing(world)` only gets the world, and
`world.map` carries `name`, `brief`, `objective`, `order`, `doctrine`,
`timeLimit`. So the mission number has to be threaded in from `play()` in
`main.ts`, which knows `campaignLevels.findIndex(...)` already
(`main.ts:281`).

**The controls the brief lists, checked against the code:**

| Action | What `shell/input.ts` actually does |
|---|---|
| Move | left click -- yes (`pointer.ts` / `input.ts` order path) |
| Fire | hold right button -- yes; `fireDown`/`fireUp` at `input.ts:280-292` |
| Grenade | middle click, `G` (`input.ts:349`), or the left+right chord (`chordArmed`) -- all three real |
| Pan / zoom | arrows (`input.ts:361-364`), `+`/`-` (`input.ts:355-358`), edge scroll |
| Pause | `Escape` (`input.ts:341`) -- **not in the brief's table, and worth a line** |
| Recentre | `Space` (`input.ts:345`) -- also missing from the table |
| Restart | `R` (`input.ts:337`) |
| Music | `M` (`front.ts` only, not in mission) |

So the Windows column in the brief is accurate but incomplete; Escape and
Space are the two the strip should add. The Mac column is accurate *once 006
lands* -- and until it does, **there is no fire key at all**, which is the bug
the owner's friend hit.

Platform detection: `navigator.userAgentData?.platform` where available,
falling back to `navigator.platform` matching `/Mac|iPhone|iPad/`. There is no
existing platform check anywhere in `src/` -- this is the first.

## Classification

**New work** on the layout; **broken, cause found** on the controls (they are
nowhere in the UI, on any platform -- `ui/controls.ts` is the on-screen action
bar, not a help screen).

## Plan

Two sittings.

**Sitting one -- the frame and the stack.** `/style` first, `/pixel-check`
after.

1. Thread the mission number into the briefing: `hud.missionNumber` set from
   `play()` beside `hud.hasNext` (`main.ts:281-283`), read by `showBriefing`.
2. Restructure `div.briefing` to the reference's stack:
   `MISSION nn` + rule / theatre name in small tracked caps (our stand-in for
   `PHASE x OF y`) / rule / the map name as the largest type / then a framed
   box wearing `border-image: var(--sk-frame)` holding the word `BRIEFING`,
   the objective line and `map.brief`.
3. The squad roll and the Boot Hill count move **inside** the box, under the
   objective -- they are the half of this screen the original did not have and
   they earn their place (`hud.ts:468-486` comment: a roll-call beforehand is
   a stake).
4. Rules are `border-top`/`border-bottom` in `--ink-dim`, 2px, whole pixels.
   No gradients, no rounded corners.

**Sitting two -- the controls strip.**

5. A new `ui/controls-text.ts` (or a function in `ui/controls.ts`) exporting
   `controlLines(): Array<{ action: string; keys: string }>`, branching once
   on a memoised `isMac()`. One place, so the pause sheet can use the same
   list and the two can never disagree.
6. Render it as a two-column list in the bottom third of the briefing box --
   the empty space the reference leaves. Action in `--ink-dim`, keys in
   `--ink`, wide-tracked caps, and each key in a small plotted key-cap. Use
   `--sk-plate` for the cap rather than drawing a new one.
7. Add the same list to the pause sheet (`main.ts:390-404`, `showSheet`) so a
   player who missed the briefing has one place to go back to. The brief says
   "wherever the player already pauses/reads" -- this is both, and it costs
   one call because of step 5.
8. Keep it SIMPLE, as asked: **six rows maximum** -- Move, Fire, Grenade,
   Pan/zoom, Recentre, Pause. No icons in the first pass; if it reads thin,
   the plotted `bakeIcon` set (`door`, `restart`, `gear`, `pause`) is where
   icons come from, not new artwork.

Mac wording, per the brief and per what 006 will build:

- Fire -- Mac: `HOLD F` (or `CTRL+CLICK`). Elsewhere: `HOLD RIGHT` (or `F`).
- Grenade -- Mac: `G`. Elsewhere: `MIDDLE CLICK` or `G`.
- Everything else is identical on both.

**Ordering:** the strip's Mac column is a lie until 006 lands, so **do 006
first, or land sitting one alone and hold sitting two behind it.**

## Done when

- A briefing screenshot beside `next-mission.jpg` shows the same stack:
  numbered mission, rules, the name as the largest type, a bordered box.
- The box wears `--sk-frame`; no new plate is baked for it.
- `/grill` on the briefing, judged against the reference, does not name the
  missing frame or the flat text stack as the largest gap.
- With `navigator.platform` forced to `MacIntel` in Playwright, the strip says
  `HOLD F`; forced to `Win32`, it says `HOLD RIGHT`. Both asserted in a
  playtest script, not by reading the source.
- The same strip appears in the pause sheet and matches word for word.
- `npm run check` passes.
