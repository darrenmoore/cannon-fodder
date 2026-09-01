# 003 -- does the music start for a first-time visitor?

> does the music always start when the visitor comes to the game for the first
> time?

## Findings

**Yes -- it is *wanted* from the first frame, and it *sounds* on the first
click or keypress. It never sounds before one.**

The chain:

- `settings.ts:41-58` -- `DEFAULTS.music: true`. A first-time visitor has no
  `cf.settings` in `localStorage`, so they get the default: music on.
- `main.ts:69` calls `startMusic()` as the front end comes up (and again at
  `main.ts:567` on the way back from a mission). `stopMusic()` at
  `main.ts:268` kills it when a mission starts -- menu music only.
- `music.ts:133-183` (`apply`) probes for `theme.mp3`, builds an `<audio>`,
  and calls `el.play()`. Every browser refuses that before a user gesture, so
  the `catch` calls `armGesture()` (`music.ts:117-131`), which listens once
  for `pointerdown`/`keydown` and retries.
- If there is no track (offline, or the file 404s) it falls back to the
  synthesised march instead; same gesture rule.

So the honest answer to the question as asked is: on a genuine first visit the
music is on, silent, and starts the instant they touch anything -- usually
"PLAY NOW". `musictoggle.ts` already treats *on-but-blocked* as its own state
and says "Click anywhere to start the music", so the one case where a player
could be confused is already labelled.

Nothing here is broken. What it is worth knowing is that a first-time visitor
gets music **without ever having been asked**, at `musicVolume: 0.5`, on
whatever click they happened to make.

## Classification

**Already true.** No work required. Recorded so nobody re-checks it.

If the owner would rather a first-time visitor started muted, or got asked,
say so and this becomes a one-line change to `DEFAULTS.music` plus a first-run
flag. Not filed as a question, because the current behaviour is the ordinary
one and changing it is a preference, not a blocker.

## Done when

Nothing to do. Closed as answered.
