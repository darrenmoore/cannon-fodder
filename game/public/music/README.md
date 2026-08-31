# Menu music

Drop a track in here named `theme`, and the front screen will play it on a loop.

The first of these that exists wins:

    theme.mp3
    theme.ogg
    theme.m4a
    theme.opus
    theme.wav

Nothing else needs changing — no code, no build step. Reload the page and the
button on the menu will read "playing your track".

With no file here, the menu plays a short original synth march instead, written
for this screen and generated in the browser. See [`src/music.ts`](../../src/music.ts).

## Why the repo ships no track

The tune this game is a homage to — Richard Joseph and Jon Hare's Cannon Fodder
theme — is somebody else's copyright, and this project has no licence to it.
Ripping it from YouTube and rehosting it here would be redistributing it, so the
file is a slot you fill locally rather than an asset in the repo.

If you want the real thing on your own machine, buy it. It has been released on
several Amiga soundtrack compilations, and both the CD32 version and the
Sensible Software retrospectives include it. That copy is yours to play locally,
which is exactly what this folder does with it.

Audio files here are gitignored, so a local track will not end up in a commit.
