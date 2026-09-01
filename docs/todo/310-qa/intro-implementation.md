# The attract world: the arena behind the front end

> **Built.** Shipped in the commit after this file was written. What follows
> is the plan as it stood, corrected in place where the building disagreed
> with it — see [docs/arena.md](../../arena.md) for what it actually is now.

101 asked for it in one line — *"when they click on level select, the background
still keeps animating, cpu vs cpu"* ([101's brief](../101-ui/brief.md)) — and
[101's spec](../101-ui/spec.md) item 5 has been holding it open ever since,
because there was no CPU-vs-CPU to put back there.

There is now. [300](../300-cpu-vs-cpu/) built it, and it was built with this job
in mind: see [docs/arena.md](../../arena.md) for what it is and the rules that
are not guessable from the code. **This file is only the difference between the
arena as a screen you walk into and the arena as the ground the front end stands
on.** It is a small difference, deliberately.

---

## What already exists

Almost all of it, and two pieces were put in specifically for this.

| | |
|---|---|
| The battle | `ArenaGame` runs a world, commanders and camera with no player. [`sim/arena-game.ts`](../../../game/src/sim/arena-game.ts) |
| **A no-input mode** | `Input.mode = 'sealed'` drops orders, aim, grenades **and the camera** — pan, drag, edge-scroll, zoom, arrow keys. Written during 300, unused, for exactly this. [`shell/input.ts`](../../../game/src/shell/input.ts) |
| **A locked camera** | `settings().arenaLockCamera` pins the view to the middle of the map and ignores the shake. A persisted preference, so the backdrop sets it rather than being a second code path. |
| **A hidden readout** | `settings().arenaShowScore`. |
| The canvas already sits behind | `#front` is `z-index: 14` over `#stage`, and its own stylesheet comment says so: *"The ground the front end sits on. When the attract world lands it goes behind this and only the vignette stays."* |
| Decals age out | Bodies and blood clear after thirty seconds, so a backdrop left running for an hour does not silt up. |
| The dead are reaped | `world.actors` stays bounded, so an idle front screen does not get slower the longer somebody looks at it. |

## The switches, in one place

This is the answer to *"which switches does it need to use"*:

```ts
input.mode = 'sealed';                        // nothing at all reaches it
updateSettings({ arenaLockCamera: true,       // a still frame, not a chase
                 arenaShowScore: false });    // no readout
document.body.dataset.mode = 'backdrop';      // see the stylesheet section
```

**`sealed`, not `spectator`.** `spectator` keeps the camera for the viewer,
which is right for a screen somebody walked into and wrong for a backdrop: the
front end's own buttons and the battlefield's edge-scroll would be fighting for
the same pointer, and edge-scroll wins by being invisible. This is the bug the
mode was written in advance to prevent.

**Locked, not drifting.** A camera that chases the fighting is the best thing
about the arena as a screen and the worst thing about it as a backdrop: text
sits on it. A moving background under a menu reads as the menu sliding about.

---

## The work

### 1. The lifecycle question, which is the only real decision

The arena is currently *entered and left* — `playArena()` builds a world, runs
until the viewer leaves, and tears down. A backdrop is the opposite: it wants to
exist for as long as the page does, and be **interrupted** by missions.

Two shapes, and the second is the recommendation:

- **(a) Own it in `boot()`.** Build one `ArenaGame` after the atlas bake, keep
  it in a variable beside `game`, and step it in the loop whenever `game` is
  null. The front screen never starts or stops it.
- **(b) Own it in the front screen.** `showFront` starts it and stops it.

**(a).** The front end is shown, hidden, and shown again — from boot, from the
end of a mission, from Boot Hill — and under (b) each of those is a fresh world:
a battle that restarts every time the player backs out of the level select,
which is exactly the thing 101 asked *not* to happen. Under (a) the battle is
simply always there, and the front end is a thing that appears over it.

The cost of (a) is that the arena's world exists during a mission too. Do not
step it then: one `if` in the loop, and the sim goes to zero cost.

### 2. The renderer is single-instance, and this is the sharp edge

`Renderer.prepare(map, world)` bakes terrain, scenery, the decal canvas and the
fog mask **per map**, into fields on the one renderer. A mission calls it. So
does the arena. They cannot both be prepared at once.

So the backdrop has to be re-prepared every time it comes back up:

```
front screen shown   ->  renderer.prepare(arenaMap, arenaWorld)   -> step + draw
mission starts       ->  renderer.prepare(missionMap, missionWorld)
mission ends         ->  renderer.prepare(arenaMap, arenaWorld)   -> resume
```

The **world** survives (the battle carries on where it left off, which is the
point); only the renderer's per-map bake is redone. Measure it before assuming
it is cheap — it is the longest step in the boot — and if it is not, the honest
answer is a second `Renderer` for the backdrop rather than making `prepare`
incremental.

*This is the one item likely to be more work than it looks.* Do it first.

### 3. The stylesheet

`#front` already sits over `#stage`. What is needed is:

- **The vignette.** `#front`'s background is currently an opaque radial
  gradient — it *is* the ground. It has to become a vignette that darkens the
  battle toward the edges and leaves the middle legible, without hiding it.
  This is the one place in the game where a soft gradient is allowed at all, and
  it is allowed because it is DOM chrome rather than a drawn frame: it does not
  touch the canvas and cannot put a soft edge in a dithered image. Say that in
  the comment, or somebody will delete it for breaking the visual laws.
- **A `backdrop` mode**, alongside `spectator`, that hides the sidebar and the
  action bar (as `spectator` does) but leaves the front end's own chrome alone.
- **Legibility is the risk.** The battlefield is a busy mid-green with muzzle
  flashes in it, and the level select is small text. If the vignette is not
  enough, darken the whole canvas draw rather than putting a panel over it —
  a menu you cannot read is worse than no attract world.

### 4. Routing

**Built, and the button did not survive.** `playArena()` stays — a full-size
view is what you want while working on the mode — but it moved to the `#arena`
fragment, `__DEV__`-only, and the front screen's BATTLE button was removed on
the owner's say-so once the backdrop landed. A front page offering a look at its
own wallpaper is a front page explaining itself. The two are mutually exclusive
by construction: `stopBackdrop()` runs before either a mission or `playArena`.

### 5. Performance

The front end has to stay responsive on a phone. The arena is ~40 actors and
the whole simulation is cheap headlessly, but the *draw* is the question and it
is now competing with a DOM screen that animates.

Do this rather than guessing:

- Step the backdrop at the fixed rate but consider drawing it at **30fps**, or
  not at all while a modal is up.
- **Stop it entirely when the tab is hidden.** There is already a
  `visibilitychange` handler for missions.
- On a `compact` or `stacked` layout — a phone — consider not running it at all.
  A still frame of a battle is a perfectly good background, and the brief asked
  for this on a desktop front end.

### 6. What to measure

- `npm run check` green, and no mission playing differently.
- The front screen shown, hidden and shown again ten times: one world, one
  battle, no leak — `world.actors.length` bounded and the commanders' squad
  count not climbing.
- **Five minutes on the front screen with no interaction**, then click LEVEL
  SELECT and a mission: no page error, and the mission starts clean.
- Every front-screen control still works with a battle running under it. This is
  what `sealed` is for and it is worth proving rather than trusting.
- `/grill` the composed screen — the vignette, the text over the battle, the
  logo. **The composition is the deliverable here, not the battle.**

---

## Open questions for the owner

1. **Does the battle carry on across a mission, or restart?** Recommendation:
   carries on. It costs nothing and it is the difference between a world and a
   screensaver.
2. **Which map?** `arena-forest` is built for watching close up. A backdrop is
   seen behind text at a fixed camera, and might want its own — wider, with the
   fighting arranged to sit away from where the level-select panel lands. This
   is a map file, not code.
3. **On a phone too, or desktop only?** See performance above.
4. **Does the level select dim it further than the intro does?** The intro has
   almost no text on it; the level select is a wall of it.
