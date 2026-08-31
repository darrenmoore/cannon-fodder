# 100 — improvements: spec

The brief is [100-improvements.md](100-improvements.md), in the owner's words —
both parts of it. This is that brief read against the running game: what is
already true, what is actually broken, what each item turns out to be asking
for, and how anyone else could tell whether it passed.

**On the numbering.** 001–006 are finished briefs, kept for their record. 100
and [101](101-ui-spec.md) are living workstreams that accumulate: **100 is the
game** — mechanics, balance, maps, AI, and the behaviour of the shell — and
**101 is the screens**. A new note goes to whichever of the two it is about, and
nothing gets a new number for being new.

Seven headings in the brief become **four batches**. It is not one sitting, and
the front end alone is three. Batches are ordered so each is worth shipping on
its own, except where one genuinely cannot precede another — said so, where so.

> **The visual half of this spec now lives in [101-ui-spec.md](101-ui-spec.md).**
> Everything whose verdict comes from looking at it — the plate system, the
> logo, the vignette, the intro composition, the level-select screen, the
> restyled settings, the black between-missions plate — was gathered there so it
> can be run as one gauntlet loop against one fixed objective, rather than as
> visual rounds smuggled into a mechanical batch. What is left here is what a
> test can settle. Each item below says which half it kept.

---

## What the code already says

Five of the brief's claims are not what they look like, and two of them are the
opposite of what they look like.

**Last Stand really does open with a garrison, and it is bigger than it looks.**
Driven headless on Regular: **18 enemies alive at `t = 0`**, on a mission whose
own briefing says *"five waves come out of the huts"*. Sixteen come from the
`E` markers the generator rings the map with — two per hut, eight huts — and
`swarm` doctrine's `extraEnemies: 2` adds the rest. Left with no orders the
squad is **wiped at 11 seconds**, one second after wave one lands. The opening
garrison is not a presentation problem sitting on top of a working mission; it
is most of the mission.

**Wave one arrives at 10 seconds, not 20.** `CONFIG.wave.lead` is 10 and the
map header is `waves: 5@22`, so the schedule is 10, 32, 54, 76, 98 against a
120-second clock. The "about 20 seconds" in the brief is a guess at a number
that is really 10; the sidebar's own `wave 2/5 in 22s` countdown is probably
what was read. Worth knowing before "keep the same timing" is honoured, because
keeping it means keeping 10.

**The next mission does show a briefing.** This is the one claim that did not
reproduce. Winning Chicken Run and taking *Next mission* with the mouse puts a
card on screen titled **River Run**, visible on 39 of 40 sampled frames, with
the objective, the brief line and the roll-call. It does not jump straight in.
What is missing is the *sequence* — there is no black plate between the two
missions, and no fade back in — which is 004's H2, still open. So this item is
not a bug hunt; it is a screen that was never built. See batch K.

**But the end panel's key caps are lies, and one of them is on that exact
path.** The panel draws `R`, `Enter` and `Esc` beside its three buttons.
Measured, one at a time:

| cap | promises | actually does |
|---|---|---|
| `Enter` | Next mission | **nothing at all** |
| `R` | Replay | restarts — but via `input.ts`'s own binding, not the cap |
| `Esc` | Mission list | **opens the pause sheet on top of the win panel** |

The cause is one line's worth: `bindKeys()` in `ui/ui.ts` is what makes a
`data-key` cap real, and **it is called from `sheet.ts` and nowhere else**. The
HUD's overlay renders the caps and binds none of them. A player finishing a
mission and pressing the key the game just printed gets silence.

**Nothing in this game makes a noise by walking.** `raiseAlarm` has exactly six
callers — gunfire, a round stopping on scenery, a death, an explosion, a
wounded man's scream, and first sighting. Movement is not among them. So the
brief's *"if you're walking from a distance, they might hear you"* is not a
description of current behaviour that wants tuning: **you are only ever seen,
never heard**, and the whole of that paragraph is new work.

**The decoy the brief describes already exists.** A round that stops on terrain
raises an alarm *at the point it landed*, at `impactAlarm: 0.7` of hearing —
shoot the far trees and the garrison walks to the far trees. There is even a
mission built on it: **`throw-your-voice`, order 16**, jungle, *"They go to
where the round landed, not to who fired it."* Its objective is `collect`, not
the hostage rescue the brief pictures. So the ask is not the mechanic; it is a
hostage map built on the mechanic, plus making the mechanic *legible*, which it
currently is not — see below.

**There is no partial response, and no way to see one if there were.** The
enemy has five states: `Idle`, `Patrol`, `Investigate`, `Alert`, `Engage`.
`raiseAlarm` is binary — inside the radius every man drops what he is doing and
walks to the noise; outside it, nothing happens at all. The renderer draws
*nothing* about any of this: no marker, no cone, no colour. The only cue a
player ever gets is which of eight directions the sprite faces. That is exactly
the cue the brief wants to lean on, and it is free — except that `e.angle` is
overwritten from velocity every step a man moves, so an idle fidget wipes it.

**The settings screen is broken, and the break is one row.** Measured on a
1400×900 desktop: every row is ~61px tall except **Zoom, which is 217px**. Its
five-segment control does not fit the 376px row, so the label column collapses
to about 40px, the description sets one word per line — *How / much / ground /
fits / on* — and the control overlaps it. Below that, `Ruleset` and the `Done`
button fall off the bottom of the card with no scroll affordance. On a 390×844
phone every row stacks to 113px and the card is 743px of a 844px viewport.

**Boot Hill has exactly one door, and it is the one the brief asks to remove.**
`menu.ts` takes the callback as `_onBootHill` and never calls it; the only live
entry is the pause sheet. Removing that entry orphans 333 lines and the
campaign's one-time trooper rename with them.

**The front screen is nearer the mock than it looks.** It already groups by
theatre (The Jungle / The Desert / The Ice / Test Range), numbers the missions,
and prints the objective, the brief line, the doctrine and the map size on each
card — 36 of them. What it does not have is the mock's dress: the black ground,
the riveted plates, the theatre column down the left, the logo on top.

**The stars already exist, in a different shape.** This came in from
[100-improvements.md](100-improvements.md) after the first draft, and it is much cheaper
than it looked:

- `MissionRecord.clears` **already records every difficulty a mission has been
  cleared on**. A star rating needs no new save field and no format change.
- The mission card **already draws a row of four ribbons**, one per difficulty,
  lit for the ones you have earned and dimmed for the ones you have not — with
  a comment arguing for exactly the reasoning a three-star row uses: *"a locked
  thing you cannot see is not a goal; a gap in a row of four, on a card you are
  already looking at, is."*

So the work is not "add a rating system". It is: drop a tier, turn four ribbons
into three stars, and change the rule from *which* you cleared to *the highest*
you cleared. "Do it on Elite and you instantly get three stars" then falls out
for free, because a maximum is not a tally.

**But Veteran currently has fog, and the brief says it must not.** Today's four
tiers set `vision` to `0, 0, 215, 160` — fog on the top two. 008 asks for
`rookie / veteran / elite` with **veteran explicitly fog-free**, which leaves
fog on Elite alone. That is a real change to what two thirds of the ladder feels
like, not a relabelling.

**Dropping a tier has three sharp edges.** `'regular'` is written into twelve
places, most of them tests, but two of them matter: `loadDifficulty` returns it
as the default from `localStorage`, and `campaign.ts:187` uses it as the
fallback when coercing a corrupt save — both of which stop typechecking the
moment the union loses it. Worse, **existing saves hold `'regular'` inside
`clears`**, and `loadCampaign` does `if (data.v !== VERSION) return empty()` —
so bumping the save version to migrate would **throw away every player's Boot
Hill**. The migration has to happen without a bump.

**And nothing would catch the docs going stale.** `test/docs.test.mjs` reads
`docs/map-format.md`'s tables back out of the markdown and checks them against
the parser — but only for terrain, markers, headers, objectives and doctrines.
**The difficulty tiers are not covered**, and `docs/controls.md` names Regular
today. Dropping the tier would leave that doc quietly wrong.

---

## What part two says, checked

Nineteen items arrived from the tweaks brief. Three were checked when 101 was
split out; **eight more were checked here**. Five of those eight say the
mechanic already exists and cannot be *seen*, which is a different repair from
the one the brief asks for — and a much cheaper one.

**The second-click bug is real, reproduced, and its cause is a fix that missed
its twin.** Measured on Chicken Run: click 1 dismisses the briefing, **click 2
does nothing**, click 3 gives an order. Exactly as reported. Dismissing with the
keyboard instead and the very next click works — so the fault is on the pointer
path alone.

The cause: `dismissBriefing` calls `e.stopPropagation()` in the **capture**
phase on `window`, so the dismissing press never reaches the canvas — and then
also calls `input.swallowNextOrder()`, arming a swallow with nothing to consume
it. The next real order is eaten instead. 004 fixed precisely this fault on the
*keyboard* path and guarded it with `if (e.type === 'pointerdown')`, which tests
the event's type but not whether the game ever saw it. The `swallowNextOrder`
call is now not merely redundant but harmful: `stopPropagation` already does the
job it was added for.

**Hostages must stand on the tent because the delivery circle is smaller than
the tent.** `deliverRadius` is **18px**; a tent is a 2×2 block of 16px tiles, so
its centre — which is where the extraction point is computed — is **16px from
its own edge**. The circle clears the building by two pixels. Not a Sound's tent
is exactly this 2×2. The tent is walkable (`Tile.Tent` declares no `solid`), so
it is possible; it is just fiddly, which is the complaint. The radius wants
measuring from the tent's **edge** rather than its centre.

**Idle enemies do wander — by three to seven pixels.** `idleFidget` already
turns the head every 1.1–3.4 seconds and steps off the mark 55% of the time. But
`FIDGET_RANGE` is **7**, and the step is `7 × (0.4…1.0)` — **under half a tile**.
At the game's zoom that is invisible, which is why *"everyone stood still"* on a
map that was fidgeting the whole time. Not a Sound's garrison is 15 riflemen,
no snipers and no bazookas, so none of them are `rooted` and every one was
eligible.

**And the brief's own worry about it is already solved.** *"They might wander
away from what they are meant to be protecting"* — every enemy has a `home`
(defaulted to his spawn), the fidget is drawn around `home` rather than around
his current position, and a man more than `FIDGET_RANGE * 2` from home is sent
straight back. The leash exists; only the radius is too small to see.

**Wave huts are not invulnerable — a rifle does 1 damage to 60.**
`CONFIG.building.bulletDamage` is **1** against `hutHp` **60**, so a rifle round
moves the bar by 1.7% and sixty of them level a hut. A grenade or rocket does
**45**, three quarters of it, in one hit. So the reported *"the power bar never
goes down"* is a bar that moves by a sixtieth, and the design is deliberate:
*"Rifle rounds barely scratch a building; grenades, rockets and barrels level
it."* The repair is to make the refusal legible, not to change the number.

**Waves do not escalate.** `stepWaves` sizes every wave the same:
`maxSpawned × (standing huts / all huts)`. It shrinks as huts come down — which
is Last Stand's whole design — but wave five is never bigger than wave one. The
brief wants each wave harder, and that is genuinely new, and it **collides with
J1**: shrinking-with-huts and growing-with-time pull opposite ways and the
mission needs to say which wins.

**There is no bunker, and nothing indestructible.** Building roles are
`'spawner' | 'protect' | 'neutral'`, and `friendlyToKeep` only stops **player**
fire on a `protect` building — there is no invulnerable anything. Hold the
Junction's zone is a bare `X` on open road with no object under it at all, which
is why standing on it *"doesn't make sense"*: the game asks you to hold a circle
drawn on nothing. Its `duration` is **75** seconds and the zone radius is 46.

**Two theatres are short.** Non-test maps: **jungle 15, desert 10, arctic 9**.
008 asks for at least fifteen in each of three groups, so jungle already
qualifies exactly and the other two need **eleven new maps** between them.

**Checked earlier, when 101 was split out:** fences are drawn identically in
every direction while the 8-neighbour mask they need already exists; a levelled
building keeps the standing building's depth, so rubble sorts as something you
stand behind; and the sidebar cannot be under the canvas fade because it is DOM
outside the canvas.

**Not checked, and entering as symptoms rather than diagnoses:** the two
buildings that look out of lore, the bridge ends and Braided Water's reversed
tiles, heads clipping through rock, and the camping-pressure lever. A guess
dressed as a diagnosis is not a spec item, and these are guesses until somebody
reproduces them.

---

**And there is a real thing to load.** `public/music/theme.mp3` is **4.2 MB**,
gitignored, dropped in locally rather than shipped. Boot currently starts it,
fetches `/api/maps`, reads the campaign and bakes the whole sprite atlas with
nothing on screen. The loading bootstrap has genuine work to cover.

---

## Checks run before planning

Everything below was measured against the running game on 31 Aug 2026, on a
private server (`PORT=5210`), not read off the source and hoped for.

| | |
|---|---|
| **Last Stand opening** | **Reproduced.** 18 alive at `t=0`; buildings resolve to 8 `spawner` + 1 `protect`; `waveTimer` 10.0; wipe at 11.0s with no orders. |
| **Wave schedule** | **Measured.** Wave 1 fires at exactly `t=10.0` with 23 enemies alive after it. |
| **Next-mission briefing** | **Not reproduced.** The card appears, titled with the next map, on 39/40 frames. First check used `querySelector('.briefing')` alone, which stays truthy behind a hidden overlay — corrected to test `overlay.hidden` too before believing either result. |
| **End-panel keys** | **Reproduced, all three, one at a time.** Table above. |
| **Footstep noise** | Confirmed by reading: six `raiseAlarm` call sites, none in `troops.ts` or `steering.ts`. |
| **Decoy** | Confirmed present (`combat.ts`, impact alarm at the landing point) and already carrying a mission, `throw-your-voice`. |
| **Settings layout** | **Reproduced and measured**, desktop and phone, with a screenshot. Zoom row 217px against 61px for every other row. |
| **Boot Hill** | Confirmed: one entry point, `main.ts:250`. |
| **Attract map plumbing** | `dev: true` hides a map from the menu **only in a production build** (`fetchLevels`), so it is the wrong flag for a map that must load in production but never be listed. Needs its own. |
| **Star data** | Confirmed present: `MissionRecord.clears: DifficultyId[]`, written by `recordMission` on every first clear at a given tier. No save change needed. |
| **Star display** | Confirmed present: `menu.ts` draws `.m-ribbons`, four `.ribbon` elements, `.on` when cleared. Three stars is a change to that row, not a new one. |
| **Veteran fog** | Confirmed: `vision` is `0 / 0 / 215 / 160` across the four tiers. 008 wants the new middle tier fog-free, so fog ends up on Elite alone. |
| **Save migration** | Confirmed trap: `loadCampaign` discards the whole save on a version mismatch (`data.v !== VERSION`), Boot Hill included. A tier drop must migrate in place, without a bump. |
| **Doc coverage** | Confirmed gap: `docs.test.mjs` checks five tables against the code; difficulty is not one of them, and `docs/controls.md` names Regular. |

---

## Decisions taken

Recorded here so a later session does not quietly re-litigate them.

1. **Level select is chrome *and* stars — but not locking.** ~~The stars, the
   padlocks and the `5/12` counters are drawn as design.~~ **Amended** after
   [100-improvements.md](100-improvements.md): the stars are real, and batch N builds them.
   The **padlocks stay decoration** — 008 carries a whole unlocking scheme
   (first three of each theatre open, clearing one opens another, at least 15
   maps per theatre) which is a campaign-structure change with new maps behind
   it. That stays in 008 unless it is explicitly pulled forward. The `5/12`
   counters become real for free once the stars are, since both read `clears`.
2. **Three difficulties: rookie, veteran, elite.** From 008 — *"on regular I'm
   just finding it way too easy, it feels like rookie level"*. The new middle
   tier keeps today's Veteran levers but **loses the fog**, so fog is an Elite
   thing only. `regular` leaves the union entirely.
3. **A star is the highest tier you have cleared**, not a tally: rookie 1,
   veteran 2, elite 3. One Elite clear is three stars whether or not the easier
   tiers were ever played, exactly as the brief asks.
4. **Play Now deploys to the first campaign mission with no winning record**,
   falling back to the first mission. Replaying an old one from Level Select
   does not drag Play Now backwards.
5. **The logo is plotted in code, dithered**, like every other sprite here —
   for now. The owner has reserved the right to swap it for an image later, so
   it is built behind a seam: one module, one function, returns a canvas. If it
   does become a file, that is the repo's first asset and the premise in
   CLAUDE.md changes with it; that is a decision for then, not a thing to drift
   into.
6. **Boot Hill moves, it does not die.** Out of the pause sheet as asked, into
   the new front-end chrome.

---

## Batches

Order is: **J** the outright wrong things, **P** the five things that work and
cannot be seen, **N** the three difficulties and the stars, **M** the front
end, **K** the between-missions sequence, **L** distraction, **Q** waves and
camping, **R** the campaign's shape.

**P sits second on value, not on size.** Five complaints from play collapse
into one sitting because none of them needs a new system — and one of them,
the second click, is a bug that already survived a fix aimed at its twin.

J first because it is cheap and two of its items are on the path everything
else is judged from. **N before M** because 007's level-select screen draws the
stars and cannot be finished until it knows there are three of them — and
because N on its own answers the *"regular is way too easy"* complaint, which is
playable value inside a single sitting. M before K because K deploys through the
destination M4 routes to, so the routing has to exist first. L last only because
it is the one batch that depends on nothing — it can be pulled forward whole if
the front end is not what you want to spend a week on.

**This whole spec now runs ahead of [101-ui-spec.md](101-ui-spec.md), not after it.**
Everything here leaves the game working in its current dress; 007's run A then
gives it one, and runs B and C put it on. Building a screen twice is the waste
that ordering avoids — but a screen that does not exist yet cannot be judged
either, so the mechanical half genuinely does come first.

---

### J — the things that are simply wrong — **DONE**

One sitting. No new systems.

**J1 · Last Stand opens empty — DONE.** Drop the ring of `E` markers from the
`last-stand` builder so the mission starts with no garrison and the huts are
the only source of men. Keep the outpost, the wire, the barrels and the crates.
The huts stay where they are: they are what the waves come out of, and levelling
one is still how you make the next wave smaller.

> **Done when** a fresh Last Stand reports `enemies.filter(alive).length === 0`
> at `t=0` on every difficulty, the first enemy in the world arrives from a
> doorway, `npm run check` still passes it as completable, and a squad given no
> orders survives past 11 seconds.

**J2 · Say what the lead is, out loud — DONE.** The brief asked to keep the timing and
guessed it at 20s; it is 10. Pick one deliberately now that the opening is
empty — 10 seconds of quiet on an empty map reads as a bug, not as a lull.
Recommend raising `CONFIG.wave.lead` toward the interval (22) so the mission
opens with time to take up positions, and re-checking that five waves still fit
inside `duration: 120`.

> **Done when** the lead is a chosen number with a comment saying why, the five
> waves and the mission clock are shown to fit, and the sidebar countdown agrees
> with when men actually appear.

**J3 · Make the end panel's key caps true — DONE.** Call `bindKeys` for the HUD overlay
the way `sheet.ts` does for a sheet, so `Enter` takes the next mission and `R`
replays through its own cap rather than by accident. `Esc` needs the extra
thought: it currently reaches `input.onPause` and stacks a pause sheet on a win
panel. The panel's binding must win while the panel is up.

> **Done when** `Enter`, `R` and `Esc` on a resolved mission each do the thing
> printed beside them, `Esc` cannot produce two modals at once, and all three
> are covered in `tools/playtest.mjs`.


**What building it turned up.** P1 was not a tuning problem. The range was too
small, but `idleFidget` also returned its destination on the **single tick** the
timer expired and `null` on every tick after — so a man was handed an impulse
rather than somewhere to walk, decelerated at once, and covered about a fifth of
a pixel. Widening the range alone would have changed nothing: he was never going
to reach any of it. It holds its goal until he arrives now, the way `patrol`
already did. Measured on Not a Sound: **before, 0 of 15 men moved more than 4px
in 25 seconds; after, 15 of 15 move, median peak drift 24px, furthest 32px, and
none past the leash.**

**And J3 had a second half.** Binding the caps made `Esc` on a resolved mission
go to the mission list, as it had always claimed — which broke a playtest step
that reached the list by pressing `Esc` for the pause sheet and *then* clicking
Mission list. The harness was asserting the bug. It has the direct route now,
and a check that no second modal opens.

---

### N — three difficulties, and the stars — **DONE**

One sitting. Pulled forward out of [100-improvements.md](100-improvements.md) at the
owner's instruction, because the stars on the level-select screen are meaningless
until the ladder they measure is the one 008 describes.

This is the batch that answers the objection the first draft of this spec raised
against the stars — *a rating means nothing when the player sets the difficulty
from a control at the top of the same screen*. 008's answer is that **the
difficulty is the rating**. That is a good answer, and it costs almost nothing
because the data is already saved.

**N1 · Drop Regular — DONE.** `DifficultyId` becomes `'rookie' | 'veteran' | 'elite'`
and `DIFFICULTY_ORDER` follows. The new Veteran keeps today's Veteran levers —
hunters, hard flanking, huts still feeding — but **`vision: 0`**, so fog belongs
to Elite alone. Twelve `'regular'` literals go with it; the two that are not in
tests are `loadDifficulty`'s default and `campaign.ts`'s coercion fallback, and
both should become `'rookie'` rather than the new middle, because a player who
never chose is not a player who asked for the hard tier.

> **Done when** `tsc --noEmit` passes with the tier gone, the menu offers three,
> a mission run on the new Veteran has no fog, and `describeLevers` says
> "fog of war" for Elite and only Elite.

**N2 · Migrate the saves without losing anyone — DONE.** An existing save holds
`'regular'` inside `records[*].clears`, and `loadCampaign` currently answers a
version mismatch by returning `empty()` — **which would delete Boot Hill**. So
the migration is a coercion inside the existing load path, not a version bump:
a stored `'regular'` clear maps to `'rookie'`, on the brief's own reasoning that
the two were too similar to tell apart. Anything unrecognised is dropped rather
than defaulted, so a corrupt tier cannot silently award a star.

> **Done when** a save written by today's build loads under the new build with
> its squad, its graves and its records intact; a `clears: ['regular','elite']`
> record reads back as `['rookie','elite']` and shows three stars; `VERSION` is
> unchanged; and there is a test for each of those in
> `test/campaign.test.mjs` alongside the existing tampering checks.

**N3 · Four ribbons become three stars — DONE.** The `.m-ribbons` row already exists
and already draws the unearned ones dim — keep that argument, change the shape
and the rule. A star is lit up to the **highest** tier cleared, so an Elite
clear lights all three. Stars are plotted like everything else: no glyph, no
font, no anti-aliasing.

> **Done when** a mission never played shows three dark stars, one cleared on
> Rookie shows one lit, one cleared only on Elite shows **three** lit, the
> theatre counters read from the same source, and `/pixel-check` passes the
> star.

**Not in this batch:** 008's unlocking scheme, its "at least 15 maps per
theatre", its reordering so three of a kind never run together, and the theatre
rename. Those are campaign structure and new maps; they stay in 008.

---

### M — the front end: **M6 only, and DONE; the rest is [101](101-ui-spec.md)**

Every screen in this game belongs to [101](101-ui-spec.md), whole -- composition
*and* behaviour. This spec used to keep the routing half of the intro on the
grounds that a route is testable and a picture is not; that split put two
sessions inside one screen and is withdrawn. **A screen has one owner.**

Gone to 101: the plate system (**M1**), the attract world (**M2**), the logo
(**M3**), the intro screen and its routing (**M4**), the level select (**M5**),
and the loading bootstrap (**M0**) -- which is a screen like any other, and the
first one anybody sees.

One item is left here, and it is not a screen: it is a measurement.

**M6 · The settings sheet's layout, and its content — DONE.**

The fault first, because it is measured rather than judged. `.sheet-row` needs a
real two-column rule so a control that will not fit drops to its own line
instead of crushing the label. The Zoom row is the proof and the test --
**217px against 61px** for every other row, its description setting one word per
line, the segmented control overlapping it. On a 390x844 phone every row stacks
to 113px and the card is 743px of an 844px viewport.

Then the confusing options, which is a content question rather than a visual
one:

- **`Crisp pixels` and `Resolution` are two words for one question**, and
  neither is answerable by a player who has not read the source.
- **`Ruleset`** decides a mechanic from a menu that does not describe it.
- **`volume` is a saved, coerced, persisted setting with no control at all** --
  it has never been reachable.

And Boot Hill leaves the pause sheet, as the brief asks. Its new door is in the
front end, which is 101's; **this batch only removes the old one**, so the two
halves must not both land before the door exists or the screen is orphaned.

*What both sheets look like afterwards is [101](101-ui-spec.md) item 7.*

> **Done when** no settings row is more than 1.4x the height of the shortest,
> nothing overlaps at 390px or 1400px, the last row and `Done` are reachable
> without a hidden scroll, every remaining option can be explained in one line
> to someone who has not read the source, `volume` is either exposed or removed,
> and Boot Hill is absent from pause.

---

### K — between missions: the sequence — **DONE**

One sitting. The **plate itself is [101-ui-spec.md item 3](101-ui-spec.md)**; what
stays here is that the four states happen, in order, and that the screen is a
destination rather than a step.

The order the brief describes: **results panel → fade to black → the
next-mission screen → fade back in → the mission**. The fade *out* was built in
004 (`drawFadeOut`, `CONFIG.banner.fade`); the fade *in* is new.

Built as a **destination, not a step** — 004 already settled this and M4 makes
it load-bearing: Play Now and Level Select both route through the same screen,
so it cannot be a thing that only happens between two missions.

**One thing the fade cannot currently do**, and it is 008's complaint too: the
sidebar stays lit through it. `drawFadeOut` paints the canvas and the sidebar is
`<aside id="hud">`, DOM, outside it — so no tuning reaches it. The fade has to
become something both surfaces obey. That is small and architectural, it belongs
here rather than with the pixels, and [101-ui-spec.md item 15](101-ui-spec.md) depends
on it being done.

> **Done when** finishing a mission and taking the next one passes through all
> four states in order; the sidebar goes dark with the battlefield rather than
> hanging over it; the same destination is what Play Now and Level Select deploy
> through; `Enter` advances from it (J3); and `tools/moment.mjs` can capture
> each of the four states with an assertion that it captured the right one.

---

### L — distraction — **DONE**

One sitting for the mechanics, plus a map. Depends on nothing; can be pulled
forward.

The brief's own sentence is the design, and it is a *third* response between
"heard nothing" and "walked over to look":

**L1 · Footsteps carry — DONE.** Movement raises a noise at the walker, scaled by
speed, much shorter-ranged than a gunshot — and **glance-only**, never a full
investigate. A squad crossing open ground must never be able to drag a garrison
onto itself by walking; it must only turn heads. This changes the feel of every
existing mission, which is why the range is short and the response is weak.

**L2 · The glance — DONE.** A sixth response: a man who hears something beyond his
investigate radius but inside a wider hearing radius **turns to face it and
holds the facing** for a beat, without moving. Two things make it work:
- the facing must survive — `e.angle` is written from velocity whenever a man
  moves faster than 2, so a glance has to suppress the idle fidget for its
  duration or it is wiped the same second;
- it must be **predictable**, which the brief asks for explicitly. Same input,
  same response. The idle fidget stays random; the glance does not.

**L3 · Make the decoy legible — DONE, and it was L2 all along.** The mechanic works and nothing tells the
player it worked. Whatever the tell is, it is a thing in the world and not a
label on it — the wounded man reads as alive among corpses because he twitches,
and this should be judged the same way. A held facing (L2) may be the whole
answer.

**L4 · A map that teaches it — DONE, as a new mission.** `throw-your-voice` already exists at order 16
with the right doctrine and the right brief line, but its objective is
`collect`. The brief pictures **hostages ringed by a garrison, where the only
way in is to make a noise somewhere else**. Either give that map hostages or
build a second one; `/map` is the tool for it, and the route has to be *proved*
— a map where the distraction is the intended solution but not a provable one
is a map that will be beaten by walking round the back.

> **Done when** an enemy at a measured distance from a walking squad turns
> toward it and does not move; the same enemy at the same distance from a shot
> does move; the response is identical on repeated runs; the new map is
> completable with the distraction and is shown to be *harder* without it; and
> every one of those is a check in `tools/playtest.mjs` rather than a thing
> somebody watched once.

---

### P — the five things that already work and cannot be seen — **DONE**

One sitting, and it is the best-value batch in this spec. Five separate
complaints from play turn out to be one fault wearing five hats: **the mechanic
is there and the player cannot perceive it.** None of them needs a new system.

**P1 · Widen the idle fidget until it reads — DONE, and the range was not the whole of it.** `FIDGET_RANGE` 7 is under half a
tile. Raise it until a watching player can see a sentry shift, and let
difficulty scale it — the brief asks for that and the leash that makes it safe
(`home`, and the return past `FIDGET_RANGE * 2`) is already written.

> **Done when** a garrison filmed for ten seconds shows visible movement at
> every difficulty including Rookie, and no enemy ends further from his `home`
> than the leash allows — measured over a thousand steps, not watched once.

**P2 · Make a building refusing damage legible — DONE.** A rifle doing 1 of 60 is the
intended design and should stay; what must change is that it currently looks
identical to doing nothing. Whatever the tell is, it belongs on the building.

> **Done when** sixty rifle rounds still level a hut, one rifle round produces a
> visible refusal distinct from a hit, and a grenade still reads as three
> quarters of the job.

**P3 · Deliver hostages from the tent's edge, not its centre — DONE.** Measure
`deliverRadius` from the footprint rather than the centre point, so a 2×2 tent
has a ring around it instead of a circle inside it.

> **Done when** a hostage walked adjacent to any tent delivers without stepping
> onto it, on tents of every size present in `data/`, and Not a Sound is
> completable without herding three people onto a 32×32 pad.

**P4 · Fix the second click — DONE.** Drop the `swallowNextOrder()` call from
`dismissBriefing`: `stopPropagation` in capture already prevents the dismissing
press from reaching the game, and the swallow now eats a later order instead.
Check the keyboard path still behaves, since it is the half that was fixed.

> **Done when** the click after a pointer-dismissed briefing gives an order, the
> click that dismissed it does not, the keyboard path is unchanged, and
> `tools/playtest.mjs` covers both — this bug survived a fix aimed at its twin
> and will survive another one.

**P5 · Give Hold the Junction something to hold — DONE.** The zone is a circle on bare
road. It wants an object under it that cannot be destroyed — the brief says a
bunker, and there is no such thing today. That is a new tile or a fourth
building role, and it is the honest half of item 15's *"invulnerable"* wish:
**the thing you defend** should be indestructible, not the huts attacking you.

> **Done when** the hold zone sits on a placed object, the object cannot be
> levelled by any weapon in the game, the map still validates, and the hold
> duration has been re-chosen deliberately rather than left at 75.

---

### Q — waves, and the difficulty of standing still — **DONE**

One to two sittings. These are balance changes and they interact, so they ship
together or they undo each other.

**Q1 · Waves escalate — DONE, and the collision was resolved by the owner.** Every wave is the same size today. Make later waves
larger and make them arrive from more than one doorway. **This collides with
J1**: wave size currently shrinks as huts fall, which is Last Stand's entire
design — *"level a hut and the next one is smaller"*. Growing-with-time and
shrinking-with-huts pull opposite ways, and the mission has to say which wins.
Recommend the hut count stays a *multiplier* on a growing base, so levelling
huts still helps but never makes the mission trivial.

**Q2 · A pressure lever against camping — DONE.** The brief's own design: a counter
that rises while the squad stands still and kills, feeding spawn rate and
aggression, **capped**, and active even at Rookie. It asks explicitly for this
to be a proper lever rather than a bolt-on, and `difficulty.ts` is already
fifteen independent levers — so it is one more, not a special case.

> **Done when** a squad that holds one position and farms kills faces measurably
> more pressure than one that moves; the counter provably caps; the effect is
> present at Rookie; and a mission played normally is not measurably harder than
> it is today.


**How the J1 collision was settled.** The owner's answer was to make **wave
spawn buildings indestructible**, which removes the conflict rather than
balancing it: with nothing to switch off, shrinking-with-huts cannot exist and
the ramp is the only shape left. Levelling the garrison had been the answer to
every wave mission, and it made the back half of one a formality.

Four things changed together, because separately each one is undone by the
others:

- **First wave of five, growing 45% a wave**, scaled by difficulty through a
  clamped ratio of `maxSpawned` rather than by `maxSpawned` itself -- that lever
  is a concurrency cap running 2 to 6 and multiplying by it turned a first wave
  of five into forty-five.
- **Sent at the thing you are defending.** Waves used to spawn hunting the
  squad, so a squad standing off to one side pulled the whole assault away from
  the outpost and the objective became a spectator. Where a mission has a keep
  they spawn `Idle`, which is the state `siege` acts on.
- **`siege` could not actually reach anything.** It returned the keep's
  *centre* as a move target, and a keep's centre is a solid tile, so no route
  could be planned and every besieger stood where he was. Measured: seventy-nine
  attackers, two hundred seconds, an undefended outpost, **zero damage**. It
  aims at firing range along the attacker's own bearing now, which also spreads
  the ring instead of queuing everyone at one door. Same measurement after:
  **all seventy-nine within firing range of the keep.**
- **Spread across the doorways**, offset by the wave number, so a wave arrives
  from several sides rather than emptying the nearest hut first.

**One balance question this raised and did not answer.** Undefended, the outpost
is at 75% when the clock runs out -- so ignoring the mission entirely still wins
it. That is not a wave problem, it is what Q2 exists for, and it wants a player
rather than a harness to judge.

---

### R — the campaign's shape — **DONE**

Two sittings, and the larger half is map generation.

**R1 · Eleven more maps — DONE.** Jungle has 15 and qualifies; desert has 10 and arctic
has 9. 006's layout grammar is what generates them, so this is a table change
rather than eleven functions. The brief also asks that no three of a kind run
together in the order, and that the arctic theatre be renamed.

**R2 · Unlocking — DONE.** First three of each theatre always open; clearing any
mission opens another in that theatre. **This is the gate on
[101-ui-spec.md](101-ui-spec.md)'s level-select screen**, which has a rule that
a mission with no stars cannot be chosen — a rule that locks the entire game on
a fresh save unless R2 lands first.

**R3 · Two training missions — DONE.** The brief specifies both: one small map teaching
right-click to shoot, one that teaches grenades, water, bridges and pickups by
putting grenades on the bridge you have to cross. They become missions 1 and 2,
which shifts every `order:` behind them.

> **Done when** each theatre has fifteen or more, a fresh save can start three
> missions in every theatre and no more, clearing one opens exactly one more,
> the two training missions are first and are completable by doing only what
> they teach, and `npm run check` validates all of it.


### What these four turned up

**Q2 needed the refactor the brief asked for, and it was small.** `world.levers`
was fixed at world creation and read in eleven places; camping needs two of them
to move at runtime. So `baseLevers` is what difficulty and doctrine chose and
what the menu describes, and `levers` is that with pressure folded in and is
what the systems read. **Assigning the whole base over the top each step was the
obvious way to write it and was wrong** -- it silently reverted anything else
that had set a lever mid-mission, including the debug panel's fog switch and a
harness poking `hearing`. Both looked like they had worked and neither had.
Pressure now writes only the two levers it owns.

**L2's glance is the answer to L3.** The decoy has always worked and nothing
told the player it had; a held facing *is* the tell, and it needed no marker
over anybody's head. Measured: **0 degrees of facing error, zero drift, and
still `Idle`** -- it is a head turning, not a state change.

**L1 had to be measured with the enemy blinded.** Footsteps carry 150px at full
speed against an `aggroRadius` of 132-165, so in the open you are seen at about
the distance you are heard and the mechanic only bites *in cover* -- which is a
coherent rule and the reason tall grass is worth walking through. It also means
a test of hearing has to remove sight, or it measures sight.

**K's fade could never have covered the sidebar.** It was a `fillRect` on the
canvas and the sidebar is DOM outside it, so the battlefield went out and six
names and a grenade count stayed lit. It is one element over the whole screen
now, and the overlay was raised above it -- the first attempt put the blackout
on top of the results panel, which made the ending perfect and invisible.

**R2's locking broke every capture harness the moment it landed** -- `enter()`
clicks a card, and three quarters of the campaign was suddenly disabled. The
rule is exempt in a dev build and proved instead in `test/campaign.test.mjs`,
where it is a pure function and all six cases are cheap. That is the better
place for it: a browser driver seeding a campaign save to reach a mission is a
test of the seeding.

**R1 surfaced a latent crash.** Layout hubs come back on half-tiles, which a
marker tolerates and `building` does not -- `fillRect` walks integer rows and a
fractional `y` indexes nothing. It had been waiting for the first layout whose
hubs happened to land on a half, and `crossroads` was it. Rounded once in
`pick`, rather than at each of the six places that build on a hub.

**And R3 found that `crossings` are fractions.** `river(..., { crossings: [x] })`
takes a fraction of the river's length, not a column, so passing a tile
coordinate put the span a thousand tiles off the map and produced a river with
no way over it. It hands back where it actually built them; the builder uses
that rather than working out where the wobble went.

---

### S — the things on the ground that look wrong — **7 done, 2 did not reproduce, 1 needs a critic**

**This batch is the reconciliation's finding, and it should not have needed
one.** When 101 was created it gathered every pixel-judged item; when the owner
ruled that all of the tweaks brief belongs to 100, seven of them were handed
back. They were *named* in 101's hand-back note and never given a batch here, so
they have been sitting in a sentence in the wrong document rather than in a
plan. Three more items from the brief were never batched at all. Ten in total.

They are grouped here because they are the same job: **objects on the
battlefield that do not look like they belong to this game.** None of them is a
screen, so none of them is 101's.

**Three of them are already diagnosed** -- checked when 101 was split out, and
the cause found:

**S1 · Fences have one direction.** `ground.ts` draws `Tile.Fence` as two
horizontal rails and posts, with **no neighbour check at all**, so a north-south
run is a stack of left-to-right rails and a corner has no corner. The machinery
is already there and this tile does not use it: `Tile.Bridge` two branches above
tests `railed(dx, dy)` against its neighbours, `Tile.Road` tests whether it runs
vertically, and `terrain.ts` computes an **8-neighbour same-material bitmask**
for every tile. The fence needs to read a mask that exists, not have one
invented. Wanted: runs in both axes, and L-shaped corners that join.

**S2 · Rubble keeps the standing building's depth.** Buildings go into the same
`sortY` list as actors and a levelled one is sprite index 3 of the same set, so
wreckage still sorts as something you stand *behind* rather than ground you
stand *on*. Walk a soldier over a demolished hut and the hut is drawn over him.

**S3 · Bridges.** Four separate faults in one item, and the brief lists them:
the deck is flat and uninteresting; **it does not change where it meets land**,
so a bridge onto ice looks like a bridge onto grass; the edges want the rough
pixel of cut timber rather than a ruled line; and a broken bridge does not look
broken at its break. Plus one that is a plain bug -- **on Braided Water the
bridge top right runs north-south and its end tiles face the other way**, which
is the same neighbour-mask problem as S1 wearing different clothes.

**And these have no cause found yet.** They enter as reported symptoms, because
a guess dressed as a diagnosis is not a spec item:

**S4 · Not a Sound's delivery building** does not look good, and is out of lore
for the game around it.

**S5 · Through the Wall's building near the rocks** is, in the brief's word,
laughable -- and it **does not read as blocking the way**, which is a gameplay
fault and not only a cosmetic one. The brief suspects the gap between the house
roof and the stone above it. That part is checkable and should be checked before
anything is drawn.

**S6 · Heads clip through rocks.** Acceptable for a tree, where it reads as
foliage overhead; wrong for stone. The brief asks for the same review across
anything else that should be solid rather than leafy.

**S7 · The hold zone's ring is not in lore** -- and it is already on
`/pixel-check`'s standing worklist for the reason: `ctx.arc`, `globalAlpha` and
a hairline stroke are three things this renderer is not allowed. It was made
*truthful* during P3 (it draws the real radius now, pad included) and left ugly.

**S8 · A valley between mountains, and an ice one.** The brief liked that map
and wants a second in the arctic. There are two canyon-layout arctic missions
now -- `white-cut` and `the-crevasse` -- so this may already be answered; it
needs looking at rather than building.

**S9 · The theatre rename.** "The Ice" was to be renamed, and was not.

**S10 · `docs/style.md`, and a `/style` skill to read it.** The brief asks for
it *"when we do this task"* -- the task being all of the above. It is the
vocabulary the rest of S is judged against, and it is the reason S1-S7 keep
being argued rather than settled: `/pixel-check` is the **law** (no
anti-aliasing, no alpha, no gradients) and `docs/style.md` would be the
**vocabulary** (which greens, how a rivet is stamped, how thick an outline is).
A drawing can pass the law and still look like a different game.

**How S is judged.** Every one of S1-S8 is settled by looking at it, which means
**none of them may be judged by the session that draws them** -- the same rule
101 runs under, and the same reason. S is 100's work because a fence is a game
object rather than a screen; the *method* is still the loop, and `/gauntlet` is
the owner's to invoke.

> **Done when** a fence run reads as connected in both axes and turns a corner;
> a soldier walks over rubble rather than under it; a bridge meets each ground
> type differently, looks like timber, and shows its break; Braided Water's
> bridge ends face along it; the two buildings and the hold ring have been
> redrawn and judged by somebody who did not draw them; heads do not pass
> through stone; `docs/style.md` exists with a reference beside each rule and
> `test/docs.test.mjs` checks its tables against the code, the way it already
> does for five of `map-format.md`'s.

---


### What S turned up

**S1 fences — done.** Posts always, rails only along the sides that continue,
and a corner gets one rail east and one south joined at the post. It reads the
neighbours the way `Tile.Bridge` and `Tile.Road` already did.

**S2 rubble — done.** A levelled building sorts to the back of the depth list
rather than to its own footprint, so every actor is drawn in front of it. It was
sharing the standing building's `sortY`, which is right for a wall and nonsense
for a heap of one.

**S3 bridges — done, and the Braided Water bug had a cause.** The span direction
was read off *one tile's* east-west neighbours, and `river` builds crossings
**two tiles wide** -- so the body of a north-south span had an east-west
neighbour and laid its boards across itself, while the one-tile ends had none
and laid theirs correctly. Counting the run in each direction answers it for a
bridge of any width and gives every tile the same answer. Also: rails nicked a
pixel here and there rather than ruled; the deck takes the ground's own tone
where it lands, so a span onto ice no longer looks like a span onto grass; and
where a deck ends over water it ends broken, in pieces.

**S7 hold ring — done.** `ctx.arc`, a hairline stroke and a pulsing
`globalAlpha` -- three prohibitions in four lines, on the thing a `hold` mission
asks you to stare at for forty-five seconds. It is a marching dashed ring of
placed pixels now, with four ticks pointing in, and the pulse is a tone change
between two solid colours.

**S8 the valley map — already true.** The arctic has three valley-shaped
missions: `the-spine` (ridgeline), `white-cut` and `the-crevasse` (canyon), the
last added by R1. Nothing to build.

**S9 the rename — done.** "The Ice" named the surface where the other two
theatres name places; fifteen missions of snow, sea ice, frozen rivers and
mountain passes are a front. **The Frozen North.**

**S10 `docs/style.md` and `/style` — done**, and it is the reason the rest of
this batch could be argued at all. `/pixel-check` is the law; this is the
language. Both are read off parts of the tree that already work.

---

**S5's blocking half did not reproduce, and the real fault was next to it.** A
flood fill from the west edge cannot reach the east side: **the wall blocks.**
What is wrong is the door. The gap was **five tiles tall against a 54px
sprite** -- 80px of footprint wearing 54px of building, so twenty-six pixels of
bare ground showed between the roof and the stone above it. That is the "pretty
big gap from the house roof to the stone" exactly, and it is why the wall did
not read as blocking: a door that visibly does not fill its frame is a door
nobody believes in. The gap is three tiles now and the sprite fills it.

*I made two measurement errors reaching that, both reported the map was broken
when it was not. Worth remembering: a flood fill answers "can they get round
it"; scanning left and right from a building answers nothing at all.*

**S6 heads through rock did not reproduce.** `paintCrag` already writes into the
same overhead layer as the canopy, so a man inside a rock mass is covered and a
man south of one is drawn in front -- which is correct. Photographed at two
placements against a crag face on Through the Wall, including with the head
inside the rock tile, and it was right both times. **Not fixed, because nothing
was found to fix.** If it is real it wants the exact spot: which map, which
edge, and roughly where.

**S4 -- Not a Sound's delivery building -- is not done.** It is pure drawing,
with no cause to find and nothing measurable to check, and the session that
draws a building is the one that cannot say whether it looks like this game.
It stays open for a critic, with S5's *sprite* beside it.

---

## Scale, honestly

| batch | items | state |
|---|---|---|
| **J** | 3 | done |
| **N** | 3 | done |
| **K** | 1 | done |
| **P** | 5 | done |
| **Q** | 2 | done |
| **R** | 3 | done |
| **M** | 1 (M6) | open |
| **L** | 1 (L4) | open |
| **S** | 10 | open |

**Twelve items left, in three sittings.** Twenty-one are done.

- **One sitting: M6 and L4.** A measured layout bug with a number attached, and
  one map. Neither depends on anything.
- **Two sittings: S.** Ten items, three of them already diagnosed, and one of
  them (`docs/style.md`) is what the other nine are judged against -- so it goes
  first even though it is the only one that draws nothing.

**S cannot be finished in the sitting that builds it.** Eight of its ten items
are settled by looking at them, and the session that draws a thing is the one
session that cannot tell whether it worked. Building is 100's; judging is the
loop's, and `/gauntlet` is the owner's to invoke.

**Nothing here is a screen any more.** Every screen -- the loader, the intro,
the logo, the level select, the settings restyle, the black between-missions
plate, the in-mission controls -- is [101](101-ui-spec.md)'s, composition and
behaviour together. The one thing left in M is a `.sheet-row` that crushes its
own label, which is a measurement rather than a judgement.

---

## Things I will not do, and one to decide later

**The logo is a trademark, not just artwork.** Everything else matched here is
terrain and sprites, looked at and re-drawn; the wordmark is the name of
somebody's product. The decision above is to plot it in code and keep the
composition rather than trace the crest, which is the same standing the rest of
the project takes. If it later becomes a PNG dropped into `public/`, that is
both the repo's first asset file and a copied mark, and CLAUDE.md's premise has
to be edited to say so honestly rather than left to contradict the tree. Worth
noting the music took exactly this route already and was handled the same way:
a slot you fill locally, gitignored, with a README saying why.

**`intro.png` and `level-select.png` are mock-ups of this project, not
screenshots of a shipped game** — the level-select mock names Chicken Run, River
Run, Undergrowth, Village, Lone Wolf, The Long Road, Minefield and Last Stand,
which are this repo's missions. They are design targets, and good ones. They are
also *renders*, at a fidelity this renderer cannot reach and should not try to:
matching their layout, hierarchy and colour is the objective; matching their
gradients is not.

**I argued against the stars, and 008 answered it.** The objection was that a
three-star rating means nothing when the player sets the difficulty from a
control at the top of the same screen. 008's answer is that **the difficulty
*is* the rating** — one star for Rookie, two for Veteran, three for Elite — so
the number is not a judgement of how well you played but a record of what you
were willing to take on. That is coherent, it needs no `par`, and the data has
been in the save all along. Batch N builds it. Recorded here rather than
deleted, because the reason it is a good idea is the part worth keeping.

**The doc test should grow a sixth table while N is open.** `docs.test.mjs`
already reads five tables out of the markdown and checks them against the code;
`docs/controls.md` names Regular and nothing would have caught it. Adding the
difficulty tiers to that harness is a few lines and it is the only reason this
particular staleness is being found by hand today.

**One thing pulled forward, and the rest left alone.** N comes out of 008 at the
owner's explicit instruction. Nothing else does: 008's unlocking scheme, its map
quotas, its theatre rename and its ordering rules are a campaign-structure
change with new map generation behind it, and folding them in here would turn a
front-end batch into a campaign rewrite. They are named in N so that a later
session can see they were considered and left, rather than missed.

**The vignette needs `/pixel-check` before it is written, not after.** "Darker
around the corners" is a radial gradient in every other codebase, and a radial
gradient is the single most obvious violation available here.
