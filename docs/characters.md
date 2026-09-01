# Characters

Everyone in this game who *talks*. Not the squad — they have names and ranks
and die, but they never say anything — and not the enemy. This is the comms
panel: the strip at the foot of the play area, and whoever is on it.

The vocabulary matters and is used exactly this way throughout the code:

| | |
|---|---|
| **the comms panel** | the strip itself. One on screen. Owns the entrance, the retract and the typing. `game/src/ui/comms.ts` |
| **a speaker** | who is talking: a name, a portrait, a voice. An entry in `SPEAKERS` |
| **a transmission** | one thing said, with how long it stays |

The split is load-bearing rather than tidy-minded. The panel is not allowed to
know who is speaking; that is what makes a second character a table entry
instead of a rewrite, and it is the property to protect if any of this is ever
touched again.

---

## Major Trumper

**An old officer who is certain, wrong, and nowhere near the fighting.**

He is your superior. He is genuinely trying to help. It has never once occurred
to him that he might not be qualified to.

He is the only speaker so far, and he arrived from a specific brief: *"a bit
rough, silly, stupid, everything he says will make people laugh ... i like dry
comedy like sean lock"*, resolved to **the blustering officer, with a Sean Lock
comedy twist**.

### The two halves

Every line has to satisfy both. They do different jobs and dropping either one
produces something that is not him.

**The officer supplies the situation.** He outranks you and he is telling you
what to do. That is why a voice is talking to you at all, and why he can say
"we" about a war he is not in. It is also what lets him carry a tutorial
without it feeling like a tutorial — an officer explaining the obvious at
length is *in character*, where a disembodied hint is just a hint.

**Lock supplies the delivery.** Flat, unhurried, never winking. The joke is an
absurdly specific detail stated as ordinary fact, and then total commitment to
it. He does not do punchlines. He does not know he is funny. He never nudges.

### The test

> **If a line would work with a drum sting after it, it is the wrong line.**

That one test throws out nearly everything that goes wrong: exclamation marks,
catchphrases, wordplay, and anything that plays as a gag rather than as a man
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

Note what the funny ones have in common: the joke is never *about* the
instruction, it arrives after the instruction has already been given properly.
He is useful first and absurd second, in that order, every time. A line that
reverses it has failed at the job he is there to do.

### He does not sound like this

| wrong | why |
|---|---|
| *"Let's do this, soldier!"* | a rallying cry. He is not excited about anything |
| *"Time to bring the pain!"* | a punchline, and a drum sting would fit |
| *"Careful — snipers ahead!"* | a hint the player has not earned |
| *"Ha! Classic Trumper."* | he does not know he is a character |
| *"HOLD F!!!"* | shouting. He has never raised his voice in his life |
| *"Grenades: your friend and mine!"* | a joke instead of an instruction |

### How he is built

| | |
|---|---|
| portrait | `game/src/render/sprites/speaker.ts`, id `trumper`. A 22×20 character mask inside a plotted 32px disc, three frames — eyes open, half, shut |
| voice | `{ wave: 'square', hz: 320, jitter: 0.06, everyNth: 2 }`. Low, square, unhurried: a big man in no rush |
| entry | `SPEAKERS.trumper` in `game/src/ui/comms.ts` |
| his lines | `transmissionFor()` in the same file, keyed by map id |

**The cap is a third of him and the moustache is another third.** That
proportion is the character — it is why he reads at 64 pixels where a
correctly-proportioned head would read as a blob. If the portrait is ever
redrawn, that is the thing to keep.

---

## What any speaker may never say

These are not stylistic. They are the two ways a speaker can actively damage
the game.

**Never a hint the player has not earned.** He may explain a control, a rule,
or an objective the briefing already gave. He may not say where the enemy is,
what is behind a treeline, or that there is a minefield coming up. The
difficulty is the player's to discover, and a voice that spoils it has taken
the mission away from them.

**Never a control name typed into the prose.** Controls are platform-branched —
`HOLD F` on a Mac, `HOLD RIGHT` everywhere else — and the branch lives in
`game/src/ui/controltext.ts`. Interpolate `controlLines()`; never type a key
into a line. A hard-coded `RIGHT-CLICK` is a lie on half the machines that will
read it, and that exact bug is why the comms panel exists at all: the owner's
friend sat down on a Mac and could not work out how to fire.

**And keep it to about two sentences.** The strip is one or two lines at a
readable size on a 1024-wide window, and it types at 35ms a character. A
paragraph is still typing when the player has stopped caring.

---

## Adding a second speaker

Three edits, and none of them is in the panel.

1. **A portrait.** Twenty rows of characters in `SPEAKER_ART`
   (`render/sprites/speaker.ts`), keyed by id, plus any `BLINK` overrides. It
   is published automatically as `--sk-face-<id>-<frame>` and shows up in
   [/sprites.html](http://localhost:5199/sprites.html).
2. **A table entry** in `SPEAKERS` (`ui/comms.ts`): id, name, portrait id,
   voice. **The voice is where a character stops sounding like Trumper** — a
   low slow square wave is a big gruff man; a fast high triangle is somebody
   else entirely.
3. **A section in this file**, in the same shape as his: who he is, two halves,
   a test, five lines he would say, and a table of what he would not.

If you find yourself editing `comms.ts` for anything but the table, stop. The
panel is not allowed to know who is speaking, and that is the property that
makes the third speaker as cheap as the second.

---

## Before committing a line

- Read it aloud flat, with no emphasis anywhere. If it needs emphasis to work,
  rewrite it.
- Check it against the drum-sting test.
- Check it names no key and no enemy position.
- Run it — `npm run dev`, mission one — and *watch it type*. A line that reads
  fine in a source file can still be four seconds of typing at a moment the
  player wants to be playing.
