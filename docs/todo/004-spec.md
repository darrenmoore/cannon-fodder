# 004 — spec

The brief is [004.md](004.md), in the owner's words. This is that brief read
against the code: what is already true, what is actually broken, what each item
means, and how anyone can tell when it is done.

It is much larger than [003](003-spec.md) — sixteen items, several of them
systems rather than fixes. It is not one sitting's work, and pretending
otherwise would produce a commit nobody can review. Batches are ordered so that
every one of them is worth shipping on its own.

---

## What the code already says

Four items are partly or wholly answered by what is there, which changes what
they are asking for.

**Alerts already work, in three of the four ways asked for.** `raiseAlarm`
wakes every enemy within `levers.hearing` and walks them to the noise, and it
fires on gunfire (at the shooter), on explosions (at twice the radius), and the
moment anybody first sees the squad. That is why grenades already draw a crowd.
Two gaps: **a death is silent** — shoot a sentry and the man beside him learns
nothing — and **a round that hits a tree or a wall alerts nobody at the place it
landed**, which is the specific trick the brief describes (shoot over there, and
they go over there).

**There is already a bazooka man**, with his own sprite set (`EnemyKind.Bazooka`,
`atlas.bazooka`). The item is therefore about whether he *reads* as one at
thirteen pixels, not about adding him.

**Enemies can already cross shallow water** — it wades, it does not block. What
blocks is `DeepWater`, and it blocks *everyone* equally (`solid: true`). So
"enemies can swim" means letting actors cross deep water, and that has a
consequence: it is the thing River Run is built out of. See G5.

**The difficulty label bug is found.** `hud.update()` rebuilds the mission
header only when `world.map.name !== this.lastMission` — the guard ignores
difficulty. Replay the *same* mission at a new setting and the chip keeps the
old one. One-line fix, and it is E1 because it is the cheapest real bug here.

---

## Checks run before planning

Everything below was verified against the running game or the code on 31 Aug
2026, so no batch starts on a guess. Where a check failed to settle something,
it says so.

| | |
|---|---|
| **E1 chip** | **Reproduced.** Same map at Elite shows "Rookie" while the world is genuinely Elite (`aggro` 1.65 vs 1.16). A different map shows it correctly. Cosmetic: the player is lied to by the label, not given the wrong game. |
| **E2 grenades** | **Reproduced — three separate silent failures.** See E2. |
| **E3 alerts** | Confirmed by reading: alarms fire on gunfire, explosions and first sighting; nothing on a death or a round stopping on terrain. |
| **G1 buildings** | Confirmed: *every* standing building spawns reinforcements whenever a soldier is within `spawnAggroRange`. There is no role concept at all, and `survive` counts only the clock — nothing in the game knows a building can be something you protect. |
| **G2 attacking it** | Half of this already exists: `damageBuilding` is called for any round that stops on a building **regardless of faction**, so enemy fire already chips buildings by accident. What is missing is *intent* — `nearestVisibleSoldier` is the only thing an enemy ever targets. |
| **G3 waves** | `spawnInterval` and `maxSpawned` are the levers a hut already pushes back with; waves ride them rather than adding a dial. |
| **G5 swimming** | **The important find. See G5 — the naive change would put hostages in the sea.** |
| **I dev mode** | There is no dev flag: `build.mjs` passes no `define`, and every `.map` in `data/` is listed by the server, so a test map would appear in the menu of a production build. Both need solving before the test level exists. |
| **H capture** | `shoot.mjs` takes `--out --only --menu --zoom --width --height`: it frames *missions*, and has no concept of a moment. Confirms capture tooling is round zero for H. It also **defaulted to port 5199** — as did every other harness — which is the owner's dev server. All five now default to 5210. |
| **H1/H2 transitions** | Nothing fades anywhere. The only `opacity` and `transition` in the codebase are CSS button hovers and the Boot Hill crosses. Every transition in this batch is new work. |
| **H3 fonts** | The DOM uses the *player's system* monospace (`ui-monospace, Cascadia Mono, Menlo, Consolas`). So the chrome does not merely disagree with the baked canvas font — it looks different on every machine. |
| **H4 explosions** | Five-colour particles, a 0.09s flash and a scorch decal. No sprite anywhere, which is why it cannot make the reference's dithered mass with a hot core. |
| **H5 bazooka** | He is drawn with **four near-black pixels** — `gun: '#14181c'`, the same ink as every rifle. Differentiated only by a rust-coloured helmet palette. He reads as a rifleman, not as a man with a silver tube on his shoulder. |
| **F1 formations** | **Not reproduced.** Three harness attempts failed to stage a squad ordered into trees — the click path could not be driven reliably from outside. The claim rests on reading `assignFormation` and on the owner's own account of playing it. Staging this is itself an argument for Batch I. |

---

## Decisions needed before some of this can be built

1. ~~Does the player swim too?~~ **Everyone swims.** Settled; see G5.
2. ~~What is a wave?~~ **They come out of the huts.** Settled; see G3.
4. ~~Phases?~~ **The wording, not the structure.** One map per mission stays.
   The banner reads PHASE COMPLETE because that is what the original says on
   finishing a map; the between-missions screen drops the "phase 2 of 3" line.
   No campaign surgery, no change to records or Boot Hill.
5. ~~Author the new missions, or only the capability?~~ **Author them.** A
   covert mission and a one-man mission join the campaign table in the same
   batch as the features, so neither ships without somewhere to be used.
6. ~~Do your own men get wounded?~~ **Enemies only.** "Everyone dies in one
   hit" stays true for your six, which is the rule the whole game rests on.
3. **The OpenFodder link — corrected after actually opening it.**

   An earlier draft of this spec said that repository's `Source/Sprites/` was
   artwork extracted from the 1993 game. That was wrong, and it was asserted
   without looking. `Source/Sprites/` is **C++ source**: `Sprite_Troop.cpp`,
   `Sprite_Vehicle.cpp`, `Sprite_Helicopter.cpp`, `Sprite_Civilian.cpp`,
   `Sprite_Projectiles.cpp`, `Sprite_Effects.cpp`, `Sprite_Core.cpp`. OpenFodder
   ships no artwork at all — it is a re-implementation of the engine that
   requires the player to supply their own copy of the original game data.

   So there are two different constraints, and neither is the one first written
   down:

   - **The artwork is not there to copy**, which settles the question that was
     being asked. What we are missing — vehicles, a helicopter — has to be drawn
     here either way, as everything else in this project is.
   - **The code is GPL-3.0**, which is a real constraint of its own: reading it
     for *facts* is fine (that a helicopter exists, what it does, how a vehicle
     carries troops), transcribing its implementation into this MIT-spirited
     repo is not. Read it the way you would read documentation.

   That makes it a genuinely useful reference for **H5's catalogue question** --
   what entity types the original had -- rather than a source of pixels.

---

## Batch E — corrections — **DONE**

Small, independent, all shippable in one go. Verified in a browser against the
same failures that found them: the chip updates on a replay, all four grenade
paths throw, refusals speak, and on Veteran a round into a tree pulls three
enemies 65-78px toward the tree with the squad five hundred pixels away.

One thing fixed that was not in the brief: dismissing the briefing with a *key*
armed "swallow the next order" with no press to consume it, so it sat there and
ate whichever move order came next. Introduced by 003's D3, found by this
batch's own verification.

### E1. The difficulty chip goes stale

Diagnosed above. **Done when:** playing a mission, returning to the list,
changing difficulty and replaying *the same mission* shows the new difficulty in
the sidebar.

### E2. Grenades are unreliable to throw

Not a feeling. Driven in a browser, the chord fails in **three reproducible
ways, and every one of them fails silently**:

| what the player does | what happens |
|---|---|
| holds right, clicks left, hand still | throws — the case the playtest asserts |
| **hand drifts ~20px while clicking** | **nothing at all**: past the 12px tap budget, so it is a drag, not a tap |
| **releases right before left** | **nothing at all** |
| **throws twice inside 0.7s** | the second is dropped, no feedback |
| **out of grenades** | nothing, no feedback |

The middle row is the one that matters: a player aiming a grenade *moves the
mouse to aim it*, and moving disqualifies the throw. That is the whole
complaint, and it is why it feels random.

So the fix is two things, and the second is the bigger one:

- **Add middle click** as a throw that stands alone. Keep the chord, keep `G`.
- **Make failure audible and visible.** No grenades, not yet, wrong gesture —
  each says so. A control that silently does nothing is the worst thing a
  control can do, and it is currently what three of five paths do.

**Done when:** middle click throws from the nearest man who can; the chord
tolerates the hand moving; releasing the buttons in either order throws; and
every refusal — empty, cooling down — tells the player why.

### E3. Alerts get the two missing sources

- **A death raises an alarm at the body.** Radius scales with `hearing`, but
  smaller than a gunshot: a man dropping is quieter than the shot that did it.
- **A round that stops on terrain raises an alarm where it stopped**, quieter
  again. This is what makes shooting a hut a decoy rather than noise.
- Both are difficulty-scaled, so Rookie stays deaf-ish and Elite reads the whole
  map. This *is* the "increase their intelligence on higher levels" item: the
  levers already exist, they are just not being fed.

**Done when:** on Veteran, shooting a tree away from the squad visibly draws
investigators to the tree; killing one man of a pair makes the second react; and
Rookie is not measurably harder than it is today.

---

## Batch F — the squad

### F1. Formations stop being a lattice

Two complaints, one cause. `assignFormation` builds a clean ring and drops any
slot that is blocked, so in trees the squad either stacks up or falls back to
the bare centre point.

- **Jitter every slot** by a few pixels, seeded per soldier, so a squad at rest
  never looks stamped.
- **When a soldier cannot reach his slot** — the stuck case the brief names —
  re-roll *that* slot rather than the whole formation, biasing into cover.

**Done when:** clicking into a treeline puts men between the trunks instead of
in a line at its edge; clicking the same empty spot twice does not produce the
identical arrangement; and nobody ends up standing inside a tree.

### F2. Squad size comes from the map

A `squad:` header, defaulting to the number of `P` markers, so a mission can
field one man. Feeds `deploy()` and the roster.

**Two things currently hard-code six**, and both must move in step or the build
goes red the moment a one-man map exists:

- `test/map.test.mjs:146` — `assert.equal(map.playerSpawns.length, 6, 'six
  soldiers, as in the original')`, asserted for *every* mission.
- `tools/generate-levels.mjs` — `squad(g, place, at, count = 6)`, which pads up
  to six with a lattice rather than "silently writing five men".

The assertion becomes "the squad matches the map's stated size", which is the
thing actually worth proving.

**Done when:** a map with `squad: 1` starts one soldier, the sidebar shows one,
losing him loses the mission, and `npm run check` proves every map fields the
squad it declares.

---

## Batch G — mission mechanics as data

The brief's real request: *"make sure these elements are coded in so they are
flexible, perhaps in the map level stuff, meaning we can generate different
types of maps with different mechanisms easily."* Map headers are already
free-form `key: value`, so this is additive.

### G1. Buildings get a role

Today every building spawns reinforcements, which is why Last Stand asks you to
defend a hut that is producing the men attacking you. A `buildings:` header
naming roles per marker: `spawner` (as now), `protect` (an objective — if it
falls you lose), `neutral` (scenery with hit points).

**Done when:** Last Stand's outpost produces nobody, and levelling it loses the
mission.

### G2. The enemy attacks what you are protecting

Enemies with no target and a `protect` building on the map advance on it and
shoot it. This is what makes "hold out" mean something other than "stand still".

**Done when:** left alone on Last Stand, the outpost visibly takes damage and
will eventually fall.

### G3. Waves — *decided*

**Waves come out of the huts.** Not the map edge, not thin air: a wave is the
garrison buildings emptying themselves at you, which means **levelling the huts
is how you turn the tap off**. That single rule is what makes the mechanic a
decision rather than a timer — grenades spent on a building buy quiet later, and
a map with no buildings left cannot send another wave.

**Size and pace scale with difficulty**, off the existing levers rather than a
new dial: `spawnInterval` and `maxSpawned` already describe how hard a hut
pushes back, so a wave is those numbers applied in bursts instead of a trickle.
Rookie gets small waves with long gaps; Elite gets crowds with barely a pause.

A `waves:` header turns it on and sets count and interval; the buildings supply
the men. Between waves the map is quiet, and a wave arrives together and hunts
rather than waiting to be provoked.

**Done when:** Last Stand on Rookie is a sequence of attacks with pauses
between, not a static garrison; destroying a hut visibly reduces the next wave;
destroying all of them ends them entirely; the HUD says which wave is coming;
and no wave spawns inside the squad's view.

### G4. A covert objective — *and a mission for it*

`objective: covert` — reach the extraction with **no kills**. Firing is allowed;
killing fails the mission the moment it happens.

Authored alongside, per the decision above: a covert mission and a one-man
mission join the campaign table in `generate-levels.mjs`. Both are generated and
validated like every other map — spawns on walkable ground, objective provably
reachable — so a mission that cannot be completed without killing somebody fails
the build rather than the player.

**Done when:** a kill on a covert map ends it immediately with a reason; the
briefing says so before the player finds out the hard way; the new missions
generate reproducibly from their seeds; and the completability flood fill proves
a route to the extraction that never has to pass through a garrison.

### G5. Swimming — *decided*

**Everyone swims.** Deep water stops being a wall and becomes a bad idea: slow,
unable to shoot, and drawn low in the water the way wading already draws a man
to the shoulders. Symmetrical, so the enemy can cross it at you too.

This changes River Run rather than breaking it. Its bridges were chokepoints
because the river was impassable; they become the *fast* way across, with the
water as a costly alternative for anyone willing to be helpless in it for a few
seconds. That is a better chokepoint than a wall, but it is a mission-design
change and River Run should be replayed on the strength of it.

**This cannot be done by making `DeepWater` non-solid.** One flag feeds
everything: `isSolidAt` is what `circleBlocked` reads, and that is used for
pathfinding, **enemy spawn placement, patrol-point picking, an enemy backing
off, and hostage movement** — and the same solid set is reimplemented in
`test/map.test.mjs` to prove every mission is completable. Flip the flag and
hostages wander into the sea, reinforcements spawn in the river, and the
completability test quietly starts asserting something else.

So swimming is a **movement rule, not a terrain property**: deep water stays
solid for placement and for anything choosing a destination, and becomes
passable only for an actor deliberately crossing it, at swimming speed, unable
to shoot. The map test's solid set stays as it is, because what it proves —
that a mission can be completed on foot — is still what we want proven.

**Done when:** a soldier ordered across deep water swims it, cannot fire while
swimming, and is visibly in it; enemies do the same; hostages and spawns never
enter it; and `npm run check` still proves every mission completable.

---

## Batch H — presentation

The largest batch, the one with the least mechanical risk, and the one that must
**not** be judged by the session that builds it.

H is run as a [gauntlet loop](../../.claude/skills/gauntlet/SKILL.md), the way
`docs/original-images/map/` was matched in [loop.md](../loop.md). Its three
elements, fixed here rather than at the moment a round gets hard:

- **Objective.** The end-of-mission moment, the between-missions screen, and an
  explosion read as the same game as `docs/original-images/elements/`.
- **Metric.** A capture of the real moment from the real game, put beside the
  reference for a critic with no memory of building it. Which means **round zero
  is capture tooling**: `tools/shoot.mjs` can frame a mission and cannot frame a
  banner flying up, an explosion three frames in, or a plate at 4x. Nothing is
  judged until a human has agreed one captured frame is the right frame.
- **Boundary.** As `/gauntlet`'s default. Six rounds, revert anything the critic
  does not call an improvement, stop when the ranked list is exhausted.

**A correction to the pixel laws, from `elements/target.jpg`.** The original's
aim marker is a *circle* — a red ring with four spokes. So circles are not the
sin, and `/pixel-check`'s worklist overstated it: what the hardware could not do
is an **anti-aliased** circle. The order marker and the extraction ring should
stay round and become hard pixels, and the aim marker should probably look like
that reference rather than like a crosshair.

**And a second, from `elements/sand-and-water.jpg`.** The reference shoreline is
vivid orange sand against deep navy water. Ours is pale khaki (`#a5924f`)
against muted teal (`#2f6d92`) — desaturated on both sides of exactly the
boundary the eye is drawn to. This is loop.md's old gap 6 ("the whole palette
sits too light and too desaturated") still alive in the desert theme.

The ranked gap list against the new references, ordered by how much of the frame
each governs:

1. **There is no phase-complete moment at all** — no banner, no celebration, no
   hold, no fade.
2. **The end panel is a DOM card** where the reference is full black, rule-lined
   type and nothing else.
3. **Explosions are particles** where the reference is one dithered sprite,
   scattered at several stages, with a hot core low in the blast.
4. **The name plates lost their rank chevrons.** `elements/buttons-and-troop-chevron-status.jpg`
   shows gold chevrons flanking each name, **varying in number per soldier** --
   which is what "the chevrons are meant to be showing their rank" meant. 003
   removed them from the plates entirely and put them over the men's heads. The
   heads were right; the plates should have kept theirs and made them count.
5. **Two type systems disagree** — a baked pixel font on the canvas, and in the
   DOM whatever monospace the player's operating system happens to supply.
6. **Desert sand and water are washed out** against the reference's orange and
   navy, at the shoreline where the contrast should be strongest.
7. **The bazooka man carries a rifle** as far as the eye can tell.

### H1. Phase complete

Reference: `docs/original-images/elements/phase-complete.jpg`. The banner flies
up from the bottom and settles centre screen; the surviving squad turns to face
the camera and waves, one of them jumping; it holds until clicked, then fades to
black into the next screen. Fanfare if one can be synthesised — `music.ts`
already has the machinery.

**Done when:** winning plays the banner and the celebration, a click moves on,
and nothing about it can be missed by a player who looked away for a second.

### H2. Next mission, and black

Reference: `next-mission.jpg`. Full black, text only. Every transition in the
original passes through black; keep that. This replaces the current end panel's
route into the following mission.

### H3. Fonts

The canvas already has its own baked pixel font (`pixelfont.ts`); the DOM does
not. Find a free, licence-clean bitmap-style face for the DOM chrome so the two
halves stop disagreeing, or extend the baked font to cover the chrome.

### H4. Grenades and explosions

Reference: `explosion.jpg` — one sprite, repeated at several stages, scattered.
Bake an explosion sprite set and use it for grenades, barrels, buildings and
rockets alike. The throw itself gets an arc worth watching.

**Done when:** the same explosion reads at every scale it is used at, and a
thrown grenade is legible from the moment it leaves the hand.

### H5. Missing men and machines

Camo enemies (green, hard to see against grass, no tougher than a rifleman);
the bazooka man made to read as one. Vehicles and a helicopter are named in the
brief and are a batch of their own — noted, not specced.

### H6. Wounded — enemies only

Occasionally an *enemy* is hit and not killed: down, bleeding, screaming,
needing a second round. Still counts toward the objective while alive. Your own
six keep the one-hit rule, which is the game's central bargain and what makes
every record honest.

A wounded man is also a noise source — he is screaming — so he pairs with E3's
death alarm: leaving one alive keeps drawing his friends to you.

**Done when:** it happens rarely enough to be an event, never on the player's
own men without the same rule, and a wounded man cannot be forgotten about and
leave a mission uncompletable.

---

## Batch I — the test level

The brief asks for a way to see everything at once, and it is the item that
makes every later batch cheaper to verify.

A dev-only mission with a small map of mixed terrain, one of every enemy, every
building state, water, mud, ice and mines — plus debug controls in the corner:
invulnerability, spawn an enemy, trigger a phase, toggle fog. Reachable only in
dev, and the switches must be readable from one place rather than sprinkled
through the modules.

**Two things have to exist first, and neither does.** `build.mjs` passes no
`define`, so nothing in the code can currently tell a dev build from a
production one — `__DEV__`, true under `--watch` and false otherwise, is the
smallest thing that works and lets esbuild drop the whole test level from the
production bundle. And the server lists *every* `.map` in `data/`, so a test map
would appear in a real player's mission list: it needs a `dev: true` header,
passed through `summarise()` in `server.js`, that the menu filters on.

There is a second argument for building this early. Three separate attempts to
stage "a squad ordered into a treeline" from outside the game failed (F1), which
is a harness problem, not a game one. A map built for staging solves it.

Paired with a `/playtest` skill that launches it, so "check the new thing" is
one command.

**Done when:** a new sprite or enemy can be looked at without playing a mission
to reach it, and none of it ships in a production build.

---

## Suggested order

| | Batch | Why here |
|---|---|---|
| 1 | **E** | Real bugs and cheap wins; nothing depends on them. |
| 2 | **I** | Build the test level early and everything after it is easier to check. |
| 3 | **F** | Small, visible, self-contained. |
| 4 | **G** | The systems work. Needs the two decisions above. |
| 5 | **H** | The biggest, and the one nobody can judge by describing it. Run as a gauntlet loop, capture tooling first. |

The skills this leans on are checked in: `/spec` wrote this document, `/gauntlet`
runs H, `/grill` is one round of its judgement on demand, and `/playtest` grows
the test level in Batch I.
