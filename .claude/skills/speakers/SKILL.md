---
name: speakers
description: The voice of whoever is on the comms panel — Major Trumper's register, what a speaker may never say, and how to add a second character. Read before writing any line the game speaks to the player in a character's voice.
argument-hint: [the mission or mechanic he is about to explain, or nothing for the whole register]
allowed-tools: Bash(npm run *) Bash(node *) Read Edit Glob Grep
---

Read [docs/characters.md](../../../docs/characters.md) first. It is the whole
of the register — who Major Trumper is, the two halves every line has to
satisfy, the drum-sting test, five lines he would say and six he would not, and
the two things no speaker may ever say. This file is the *procedure*; that one
is the *character*.

## What this skill is for

The comms panel is a **channel**. Who is on it is a **speaker**; one thing they
say is a **transmission**. The panel is not allowed to know who is speaking,
and this skill exists to keep it that way — because the moment a line is
written in the wrong place, the second character costs a refactor instead of a
table entry.

## Writing a line

1. **Read the character.** `docs/characters.md`. If you are about to write for
   somebody who is not in it, you are inventing a speaker — go to *Adding one*
   below and write his section first, or you will end up with two characters
   who sound the same.

2. **Say what to do, then be funny.** In that order, every time. The joke
   arrives *after* the instruction has already landed properly. A line where
   the joke is the instruction has failed at the job the panel is there to do,
   which is the job the owner's friend needed on a Mac and did not get.

3. **Interpolate the controls, never type them.**

   ```ts
   const keys = new Map(controlLines().map((l) => [l.action, l.keys]));
   `... ${keys.get('fire')} TO SHOOT.`
   ```

   A hard-coded `RIGHT-CLICK` is a lie on every Mac that reads it.

4. **Check it against the test.** If it would work with a drum sting after it,
   it is the wrong line.

5. **Watch it type.** `npm run dev`, then the mission it belongs to. Thirty-five
   milliseconds a character: a line that reads fine in a source file can still
   be four seconds of typing at a moment the player wants to be playing. This
   is the step that gets skipped and it is the one that catches length.

## Where things are

| | |
|---|---|
| the panel | `game/src/ui/comms.ts` — entrance, retract, typing, blink |
| the lines | `transmissionFor()` in the same file, keyed by map id |
| the speaker table | `SPEAKERS`, same file. **The only thing in there that may name a character** |
| portraits | `game/src/render/sprites/speaker.ts` — character masks, one per speaker id |
| the voice | part of the speaker entry: `{ wave, hz, jitter, everyNth }` |
| controls | `game/src/ui/controltext.ts` — platform-branched, shared with the briefing and the pause sheet |

## Adding one

The three edits are listed in `docs/characters.md`. The rule worth repeating
here, because it is the one under pressure when you are in a hurry:

> If you find yourself editing `comms.ts` for anything but the speaker table,
> stop.

A new character needs a mask, a table entry, and a section in the doc. Nothing
else. If a fourth edit seems necessary, the thing you are adding probably
belongs to the panel rather than to the speaker, and it should work for every
speaker rather than for this one.

## Checking it

`npm run check` proves nothing about a line — there is no test for whether a
joke lands. What can be checked, and is worth checking after any change here:

- The panel still comes in and retracts on the right missions.
- It names the right controls on both platforms (spoof `navigator.platform`).
- The text finishes typing before the transmission retracts.
- Effects off types silently; `prefers-reduced-motion` shows the line whole
  with no blink.

## One thing outstanding

The portrait has never been through **`/grill`**. The house rule is that the
session which drew a thing does not judge it, and the session that drew Trumper
is the session that wrote this. Before the next character is drawn, somebody
should grill the first one — a second portrait matched to an unjudged first is
two problems instead of one.
