---
name: speakers
description: The voice of whoever is on the comms panel — Major Trumper's register, what he may and may not say, and how to add a second character. Read before writing any line the game speaks to the player in a character's voice.
argument-hint: [the mission or the mechanic he is about to explain, or nothing for the whole register]
allowed-tools: Bash(npm run *) Bash(node *) Read Edit Glob Grep
---

The comms panel (`game/src/ui/comms.ts`) is a *channel*. Who is on it is a
**speaker**, and one thing they say is a **transmission**. This skill is about
what the speakers sound like, because the panel does not care and must not.

The owner's ask, in his words: *"this character needs a persona, a bit rough,
silly, stupid, everything he says will make people laugh ... i like dry comedy
like sean lock."* And, when asked to choose: **the blustering officer, with a
Sean Lock comedy twist.**

## Major Trumper

An old officer who is certain, wrong, and nowhere near the fighting. He is your
superior, he is genuinely trying to help, and it has never once occurred to him
that he might not be qualified.

Two rules, and every line has to satisfy both.

**The officer supplies the situation.** He outranks you and he is telling you
what to do. That is why a voice is talking to you at all, and it is why he can
say "we" about a war he is not in. It is also the reason he can carry a
tutorial without it feeling like a tutorial: an officer explaining the obvious
at length is in character.

**Lock supplies the delivery.** Flat, unhurried, never winking. The joke is an
absurdly specific detail stated as ordinary fact, and then total commitment to
it. He does not do punchlines. He does not know he is funny. He never nudges.

### The test

> **If a line would work with a drum sting after it, it is the wrong line.**

That single test throws out most of what is wrong: exclamation marks,
catchphrases, wordplay, anything that plays as a gag rather than as a man
talking.

### He sounds like this

- *"Click where you want them and they'll go there. Hold right or F to shoot.
  That is the whole of it."*
- *"The grenades are on the bridge. Walk over them. Middle click or G to aim,
  click to throw. At the huts, ideally."*
- *"Move as a herd and use the trees. I hid in some trees in 1961. Nobody has
  found me since, in a sense."*
- *"Try not to lose all of them. It's a small squad and it looks bad on the
  paperwork."*
- *"The enemy are in the huts. Grenades go in the huts. I have thought about
  this a great deal."*

### He does not sound like this

| wrong | why |
|---|---|
| *"Let's do this, soldier!"* | a rallying cry; he is not excited about anything |
| *"Time to bring the pain!"* | a punchline, and a drum sting would fit |
| *"Careful — snipers ahead!"* | a hint the player has not earned; see below |
| *"Ha! Classic Trumper."* | he does not know he is a character |
| *"HOLD F!!!"* | shouting. He has never raised his voice in his life |

## What a speaker may not say

**Never a hint the player has not earned.** He may explain a control, a rule,
or an objective the briefing already gave. He may not say where the enemy is,
what is behind a treeline, or that a mine is coming up. The game's difficulty
is the player's to discover; a voice that spoils it has taken the mission away
from them.

**Never a control name.** Those are platform-branched -- `HOLD F` on a Mac,
`HOLD RIGHT` elsewhere -- and the branch lives in
`game/src/ui/controltext.ts`. Interpolate `controlLines()` into the line; do
not type a key into it. A hard-coded `RIGHT-CLICK` is a lie on half the
machines that will read it, which is the exact bug this whole run of work
exists to fix.

**Never more than about two sentences.** The strip is one or two lines of a
readable size on a 1024-wide window, and it types at 35ms a character. A
paragraph is still typing when the player has stopped caring.

## Adding a second speaker

Three edits, and none of them is in the panel:

1. A mask in `game/src/render/sprites/speaker.ts` -- twenty rows of characters,
   keyed by id in `ART`, plus any `BLINK` overrides. It is published
   automatically as `--sk-face-<id>-<frame>` and appears in
   [/sprites.html](http://localhost:5199/sprites.html).
2. An entry in `SPEAKERS` in `game/src/ui/comms.ts`: id, name, portrait id, and
   a `voice`. **The voice is where a character stops sounding like Trumper** --
   a low slow square wave is a big gruff man, a fast high triangle is somebody
   else entirely.
3. A section in this file, in the same shape as his: two rules, a test, five
   lines he would say, and a table of what he would not.

If you find yourself editing `comms.ts` for anything but the table, stop: the
panel is not allowed to know who is speaking, and that is the property that
makes the third speaker as cheap as the second.

## Before you commit a line

- Read it aloud flat, with no emphasis anywhere. If it needs emphasis to work,
  rewrite it.
- Check it against the drum-sting test.
- Check it names no key and no enemy position.
- Run it in the game -- `npm run dev`, mission one -- and watch it type. A line
  that reads fine in a source file can still be four seconds of typing at a
  moment the player wants to be playing.
