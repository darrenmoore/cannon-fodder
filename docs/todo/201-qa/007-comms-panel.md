# 007 -- the comms panel: someone on the wire, telling you what to do

> on the first two levels we have a tutorial
>
> the first one is telling you how to shoot
> so have something at the bottom of the screen like called an advice element
> and it'll tell them to do x to shoot (depending on platform)
>
> on the second map
> add the advice element as well, and tell them about grenades and to aim and
> throw them at the huts
>
> this advice element will be used in the future as well
> but let's keep it there for now
> and when the game starts, after a few seconds it "bounces in" - so it gets
> their attention
> and it stays there for the first two maps
>
> but we'll need more options later, but i don't know what yet.
> like when we add a new mechanic into another level
> and we might just show it for a short time.
>
> i also guess this could be cool later where we might even have it as a
> character
> so a character comes up on the left in a circle with their face, like a
> leader
> and it says something like "hey, remember we need to get all of our troops
> out!"
>
> so let's do that, not advisor, but something where someone is talking to the
> player.
>
> [...] but for the first two levels it'll be sticky and there all the time.
>
> and we'll put it on the third map too, but after x number of seconds, it'll
> pop back out of the screen.
>
> we'll need a prompt to build an avatar, perhaps an old man with a big
> mustaush, we need to give him a name.
>
> and when it pops up the text starts to type, and we need some sound effects
> when the letters appear, like it's been sent to you.
>
> and this character needs a persona [...] i like dry comedy like sean lock.
>
> we should also make this character slightly move, and blink so he feels
> alive.
>
> and this bar needs to be using some of existing sprite assets

Follow-up, same conversation:

> when the advisor talks, i want it to make a little sfx like they're talking,
> like a classic game would do - also let's design it so we can have different
> advisors in the future, or characters, so don't call it advisor bar or
> component, call it something different

## What it is called

**The comms panel.** `ui/comms.ts`, one element `#comms`.

Not "advisor": the panel is the *channel*, and who is on it is a separate
thing. That distinction is the whole of the "different characters later"
requirement, so it belongs in the names:

| | |
|---|---|
| **the comms panel** | the strip itself -- one on screen, owns the entrance, the retract, the typing |
| **a speaker** | who is talking: a name, a portrait, a voice, a register |
| **a transmission** | one thing said: a speaker plus a line plus how long it stays |

So the code reads `showTransmission(speaker, text, opts)`, and adding a second
character later is adding a `Speaker` to a table -- not touching the panel at
all. Major Trumper is the first speaker, not the only possible one, and the
panel must be built without a single reference to him by name.

## Findings

**Nothing like this exists.** No tutorial, hint, tip or advice system anywhere
in `src/` (grepped). The three things that come closest, and why none of them
is it:

- **`fx.popup`** (`render/fx.ts:94-107`) -- a world-space floating label that
  rises and dies in 1.6s (`config.ts:625`). Used for `RESCUED`, `wave 2`,
  `no grenades`. Drawn on the canvas at world coordinates, so it scrolls away
  with the map. Wrong surface, wrong lifetime.
- **The phase banner** (`render.ts:529-570`) -- big canvas type driven purely
  from `world.phase` and `world.phaseTime`, held for `CONFIG.banner.hold`.
  Right lifetime shape, but it is the end-of-mission banner and owns the
  middle of the screen.
- **The briefing** (`hud.ts:449-490`) -- says what to do, but it is a modal on
  black *before* the mission, dismissed by the first click. The owner's whole
  point is that his friend read something and still did not know how to fire;
  a card you click away is exactly what fails there.

**No portrait exists either.** `ui/pixelface.ts` sounds like it should be one
and is not: it is the **chrome typeface**, 365 lines that emit a TrueType file
from a bitmap glyph table at boot so DOM text lands on the battlefield's pixel
grid. Its own docblock says it is *"built, verified, and not wired in"*.
`render/sprites/units.ts` plots soldiers at battlefield scale -- a few pixels
tall, no head at portrait size. So the portrait is a genuinely new sprite.

**Which maps.** The first three by `order:`:

| order | file | name | mechanic |
|---|---|---|---|
| 1 | `training-fire.map` | Basic Training | `move, and then fire` |
| 2 | `training-bridge.map` | Over the Water | `the bridge, and what is on it` |
| 3 | `chicken-run.map` | Chicken Run | `basics` |

The owner's descriptions match the maps: mission 1 is fire, mission 2 is
`objective: demolish` against huts with grenade pickups on the bridge.

Note `training-fire`'s existing `brief:` line **already names the Windows
controls in prose** -- "Click to march; hold right-click, or FIRE, to shoot."
On a Mac that describes a button which does not exist. It should stop naming
controls once the panel does it properly.

**Where the copy lives.** Not in the map header: `data/*.map` is generated by
`tools/generate-levels.mjs` and hand edits are lost on `npm run levels`, and
the copy has to be platform-branched at runtime anyway (`HOLD F` vs
`HOLD RIGHT`). A table in `ui/comms.ts` keyed by mission id. A map-header
field can follow later for advice that is not about controls.

**Existing sprite assets, as the brief requires.** `ui/skin.ts` publishes
`--sk-plate`, `--sk-frame`, `--sk-banner`, `--sk-btn`, `--sk-star-*`,
`--sk-lock` and four `bakeIcon` glyphs, all as sliced `border-image` sources.
The panel wears one of those and bakes nothing new. The **portrait** is the
one new bake, and because it goes in the atlas it shows up in `/sprites.html`
for free, which is how it gets reviewed.

**The circle.** The brief asks for a circular portrait. **Rendering has no
alpha, no anti-aliasing and no `ctx.arc`** (CLAUDE.md, `/pixel-check`). So it
is a *stepped* circle -- the technique the extraction ring and the mine shock
front already use, both after being caught as `ctx.arc` -- or a chamfered
octagon in the style of `bakePlate`. A soft round avatar would be the most
out-of-period thing on screen, in the exact spot the player is reading.

**Where it mounts.** `#viewport` (`index.html`) is the canvas's positioning
context and already hosts `#controls`, the action bar, anchored there so it
lands inside the battlefield on a phone and beside the sidebar on desktop.
The comms panel belongs in the same box for the same reason, and must not
collide with `#controls`, which is bottom-left or bottom-right depending on
`settings().handedness`.

**Motion.** `settings.reducedMotion()` (`settings.ts:113-119`) resolves
against `prefers-reduced-motion`. The bounce and the blink both need a
fallback under it.

### The talking sound

The owner asked twice: once for "sound effects when the letters appear, like
it's been sent to you", and again for "a little sfx like they're talking, like
a classic game would do". Those are the same effect and it is a well-known
one -- a short blip per character while text types, as Zelda, Animal Crossing,
Banjo-Kazooie and Undertale all do. It reads as speech without anyone
recording a syllable, which is exactly right for a game with no audio files.

What the classics get right, and what a naive version gets wrong:

- **Not one blip per character.** At a readable typing speed that is ~25/sec
  and becomes a buzz. Blip every second or third character.
- **Silence on spaces and punctuation.** This is most of what makes it sound
  like words rather than a machine.
- **A little pitch jitter per blip**, or it is a dial tone. `vary()` already
  exists in `audio.ts:139` for precisely this on gunfire.
- **The pitch is the character.** A low slow blip is a big gruff man; a high
  fast one is somebody else entirely. So the voice is a property of the
  *speaker*, which is what makes the second character free.

`shell/audio.ts` has the vocabulary: `burst()` for filtered noise, `thump()`
for a sine body, and `sfxOrder` (45ms, 2400Hz, Q3) as the existing blip. A
speaker voice is `{ wave, baseHz, jitter, everyNth }` and one shared
`sfxVoice(voice)` emitter.

## Decision (Q1, answered)

**Option 1, with a Sean Lock comedy twist.**

A blustering old officer -- pompous, certain, out of his depth -- delivered in
Lock's register rather than a shouty one. The two halves combine like this,
and this is the pair of rules the `/speakers` skill is built on:

- **The officer supplies the situation.** He is your superior, he is telling
  you what to do, and he genuinely believes he is helping. That is why a voice
  is talking to you at all, and why he says "we" about a war he is nowhere
  near.
- **Lock supplies the delivery.** Flat, unhurried, never winking. The joke is
  an absurdly specific detail stated as ordinary fact, then total commitment
  to it. No punchlines, and he never acknowledges being funny.

What that rules out: shouting, catchphrases, exclamation marks, anything that
plays as a gag. **If a line would work with a drum sting after it, it is the
wrong line.**

Draft lines in the register, to be pinned as the skill's examples:

- *"Right. Click where you want them, and they'll go there. Mostly. Wilson
  went to Dover once."*
- *"The enemy are in the huts. Grenades go in the huts. I have thought about
  this a great deal."*
- *"Tall grass. You can hide in it. I hid in some in 1961 and nobody has found
  me since, in a sense."*
- *"Try not to lose all of them. It's a small squad and it looks bad on the
  paperwork."*

**Working name: `Major Trumper`.** Not chosen by the owner -- taken as a
default so nothing waits on it. One entry in the speaker table plus the
skill's title; say the word and it changes.

## Classification

**New work.** The largest item in either brief.

## Plan

Four sittings.

**This lands as four commits, not one**, each tagged `201-qa 007`. The house
rule is *never batch several issues into one commit*, and its reason is that
the owner controls scope by reverting and reordering -- four commits for a
four-part feature serves that better than one thousand-line commit does. What
must not happen is 007 sharing a commit with any other issue.

**Sitting one -- the panel, no speaker.** Text only, no face, no voice. It
has to be correct and shippable on its own.

1. `ui/comms.ts`: `showTransmission(speaker, text, opts)` / `hideComms()`,
   mounting one `#comms` into `#viewport`. Three states: hidden, coming in,
   up. Options: `sticky`, or `seconds` for the auto-retract.
2. Wear `--sk-banner` as a `border-image`, `--ink` text, the chrome's tracked
   caps. Whole-pixel border widths, no new bake.
3. Entrance: a delay (default 3s after the briefing comes down), then a
   translate-up-and-overshoot. Exit is the reverse. Both collapse to a plain
   show/hide under `reducedMotion()`.
4. Position: bottom-centre of `#viewport`, above the safe-area inset, offset
   clear of `#controls` on whichever side `handedness` puts it.
5. `Speaker` type defined now, with a `NARRATOR` speaker that has no portrait
   and no voice, so the panel can be exercised before either exists.

**Sitting two -- the tutorial copy.** The half that fixes the actual
complaint.

6. Copy table in `ui/comms.ts` keyed by mission id, for `training-fire`,
   `training-bridge` and `chicken-run`. Each entry is a function of the
   platform strings from issue **005**'s `controlLines()` -- one source for
   "how do you fire", never two.
7. Wire into `main.ts`'s `play()`: look up the mission id, fire the
   transmission once the briefing is dismissed (`teardownBriefing`,
   `main.ts:509`), tear down on mission end beside `pauseTeardown`.
8. Missions 1 and 2 sticky for the whole mission; mission 3 retracts after
   **12 seconds** -- a number, not a question: long enough to read twice,
   short enough not to nag.
9. Drop the control names from `training-fire`'s `brief:` line in the campaign
   table and regenerate, so the briefing stops naming a Windows-only control.
   Keep the flavour: "Five of them, in the open."

Draft copy, platform-branched, in the plain register for now -- Trumper
rewrites them in sitting four:

- **Basic Training** -- "CLICK TO MARCH. {FIRE} TO SHOOT."
- **Over the Water** -- "WALK OVER THE GRENADES. {GRENADE} TO AIM, CLICK TO
  THROW AT THE HUTS."
- **Chicken Run** -- "MOVE AS A HERD. USE THE TREELINE."

where `{FIRE}` is `HOLD F` on Mac, `HOLD RIGHT-CLICK` elsewhere, and
`{GRENADE}` is `G` / `MIDDLE CLICK OR G`.

**Sitting three -- the speaker: portrait and voice.** `/style` and
`/pixelate` first, `/pixel-check` after, judged by `/grill` -- not by the
session that drew it.

10. `bakeSpeaker(id, frame)` in `render/sprites/`: an old officer, big
    moustache, in a stepped-circle or chamfered frame, on the game's palette.
    Three frames -- eyes open, half, shut. Published through `ui/skin.ts` the
    way `--sk-logo` is. Appears in `/sprites.html` as `#speaker.trumper.0`.
11. `audio.ts`: `sfxVoice(voice: SpeakerVoice)` -- one short blip, pitch from
    the speaker, jittered by `vary()`. Trumper's voice: low, `square`,
    ~320Hz, `everyNth: 2`.
12. Typewriter reveal in `ui/comms.ts`: one character per tick, `sfxVoice`
    every Nth **non-space, non-punctuation** character. Skipped entirely
    under `reducedMotion()` (text appears whole) and when
    `settings().sound` is off.
13. Blink loop on the portrait, plus a slow two-pixel idle shift. Frames
    swapped on a timer -- no interpolation, per house style. Both stop under
    reduced motion.

**Sitting four -- the voice on the page.**

14. `.claude/skills/speakers/SKILL.md`: the register rules above, the four
    example lines, the speaker table, and the standing prohibitions -- never a
    hint the player has not earned, and **never a control name**, because
    those are platform-branched and belong to sitting two.
15. Rewrite the three tutorial lines in Trumper's voice.

## Dependencies

Needs **006** (the F key) and **005**'s `controlLines()` before sitting two,
or the Mac copy names a key that does nothing. Sitting one can start now.

## Done when

**Panel (sitting one/two):**

- Entering Basic Training, the panel bounces in about three seconds after the
  briefing goes and stays up for the whole mission. Two `tools/moment.mjs`
  captures at different step counts.
- With `navigator.platform` forced to `MacIntel` it reads `HOLD F`; forced to
  `Win32`, `HOLD RIGHT-CLICK`. Asserted in a Playwright run.
- On Chicken Run it retracts on its own and the mission carries on.
- It never overlaps the action bar, at either handedness, at the narrowest
  desktop width.
- Under `prefers-reduced-motion: reduce` it appears without the bounce.
- It wears a plate from `ui/skin.ts`; `git diff` shows no new bake in this
  sitting.

**Speaker (sitting three/four):**

- The portrait is in `/sprites.html` under `#speaker.trumper.0/.1/.2`, and
  `/pixel-check` finds no alpha, no arc, no fractional coordinate in it.
- A `/grill` of the first mission with the panel up does not name the portrait
  as the largest gap.
- The text types in with a blip that reads as speech: blips on letters, none
  on spaces, pitch jittering. Judged by ear in the real game.
- Sound off types silently; reduced motion shows the text whole.
- He blinks at least once in a ten-second capture, and not at all under
  reduced motion.

**The design requirement itself:**

- **Adding a second speaker is a table entry.** Proved, not asserted: add a
  throwaway second speaker with a different pitch and a different portrait
  frame set, show a transmission from them, and confirm no file outside the
  speaker table changed. Delete it before committing.
- Nothing in `ui/comms.ts` mentions Trumper by name.
- `npm run check` passes.
