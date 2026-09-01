# Menu music

`theme.mp3` ships in the repo and plays on the front screen, preloaded during
the loading bar so it starts the moment the game is up (or on the first click,
where the browser insists on a gesture before audio).

To use a different track, replace it. The first of these that exists wins:

    theme.mp3
    theme.ogg
    theme.m4a
    theme.opus
    theme.wav

Nothing else needs changing — no code, no build step.

With no file at all, the menu falls back to a short original synth march,
generated in the browser. See [`src/shell/music.ts`](../../src/shell/music.ts).

The shipped track is the owner's choice and the owner's responsibility. It is
the one deliberate exception to the project's no-asset-files premise, which
CLAUDE.md records; everything else in the game is still generated.
