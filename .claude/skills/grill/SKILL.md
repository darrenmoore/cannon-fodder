---
name: grill
description: Grill one screen. Captures the game and puts it in front of a subagent with no history, beside the reference, blind — and takes back the single largest gap without softening it.
argument-hint: [what to look at, and optionally the reference image path]
allowed-tools: Bash(npm run *) Bash(node *) Read Glob Agent
---

One round of [gauntlet](../gauntlet/SKILL.md)'s judgement step, without the
loop. For when you want a second opinion on one screen rather than an overnight
run.

## Why it is a separate pair of eyes

The session that built a thing cannot judge it. It knows what it intended, and
it will see the intention whether or not it made it to the screen — the more
carefully it was thought about, the more reliably it is imagined. Every critique
here therefore runs in a subagent with no conversation history, and is shown
only the pixels.

## Steps

1. **Find the reference.** `docs/original-images/map/` for terrain and missions,
   `docs/original-images/elements/` for UI, explosions, banners and plates. If
   the user named one, use theirs. If there is none, say so and stop: a critique
   with nothing to compare against is an opinion.

2. **Capture the real game.** `node tools/shoot.mjs` for missions; for anything
   it cannot reach, drive the game in Playwright and screenshot the moment.
   Serve on `PORT=5210` — never take port 5199, the user plays there.

   **Look at the capture yourself first.** Not to judge it: to check it is the
   frame you think it is. A capture that silently framed the wrong thing has
   produced confident, detailed, entirely wrong critiques in this repo before.

3. **Ask a fresh subagent**, giving it both images and no context:

   ```
   Here are two images. One is a reference and one is an attempt at it.
   1. Which is the reference? If you cannot tell, say so.
   2. The single largest difference, by how much of the frame it governs.
   3. Anything present in one and absent in the other.
   Judge the pixels. Do not speculate about code.
   ```

4. **Report** the verdict as given, including the part that is unflattering.
   Add your own reading only after the critic's, and marked as yours.

Change nothing. This skill looks; `/gauntlet` is the one that builds.
