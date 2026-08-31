# Cannon Fodder — prototype

A browser prototype of Sensible Software's *Cannon Fodder* (1993): a top-down,
mouse-driven squad shooter. Herd six fragile soldiers across a scrolling map,
click to move, click an enemy to engage, and try not to lose all of them.

Eight missions across jungle, desert and arctic, each built around one new idea,
playable at four difficulties — from a garrison that never calls for help to one
that hears every shot, hunts you through fog, and throws grenades.

## Run it

```bash
cd game
npm install
npm run dev      # esbuild in watch mode + the server on http://localhost:5199
```

Then open <http://localhost:5199> and pick a mission. Edit anything under
`game/src/` and reload — esbuild rebuilds on save.

```bash
npm run build    # one-off production bundle
npm start        # serve without the watcher
npm run levels   # regenerate data/*.map from the campaign table
npm run check    # tsc --noEmit + level validation + map tests
npm run shots    # screenshot every mission (needs the server running)
npm run playtest # drive the mission shell in a browser and assert on it
PORT=5200 npm run dev   # if 5199 is taken
```

## Deploy it

[`render.yaml`](render.yaml) is a Render blueprint. In the Render dashboard:
**New -> Blueprint**, point it at this repo, and it creates the web service —
no secrets, no database, nothing to fill in.

Pick the `region` and `plan` in `render.yaml` *before* the first deploy; neither
can be changed later without recreating the service. It ships on `free`, which
spins down after 15 minutes idle and takes ~30s to wake.

The server binds `127.0.0.1` by default and reads `HOST` to override it, which is
the one thing a platform health-checking the port from outside needs.

## Counting who plays

[GoatCounter](https://cannonfodder.goatcounter.com), because the alternative was
a database. Render's free plan wipes the filesystem on restart and spins the
instance down when idle, so anything the server counted for itself would reset
several times a day.

It is cookieless and stores no personal data, so there is nothing to put behind
a consent banner. Four things are counted, and they are shapes rather than
people — a mission id, a difficulty, a bucket:

| | |
|---|---|
| a visit | how many played at all |
| `start/<mission>/<difficulty>` | which missions get chosen, and at what setting |
| `win/…` and `loss/…` | how far anybody actually gets |
| `session/<bucket>` | how long a visit lasted, in coarse bands |

[`src/analytics.ts`](game/src/analytics.ts) sends them, and the whole module
no-ops when the script is absent — an ad blocker, or localhost, where GoatCounter
deliberately counts nothing so development does not pollute the numbers. The
numbers therefore undercount, which is the accepted price of a counter that can
never throw inside a firefight.

## Working on it with Claude Code

Two project skills live in [.claude/skills/](.claude/skills/), so they are
checked in and work for anyone who clones this:

| | |
|---|---|
| `/commit` | Reviews the tree and commits in the repo's voice. Stages by name rather than `git add -A`, because more than one session edits this tree at once. Never pushes. |
| `/release` | Refuses a dirty tree, runs `npm run check` and `npm run build`, pushes `main`, then **waits until the deployed URL is serving that exact commit** before saying it is live. |

`/release` does not trust a green dashboard. `GET /api/version` returns the
commit the running process was built from — Render injects `RENDER_GIT_COMMIT`
at runtime — so the deployed artifact identifies itself, which is the only way
to tell a finished deploy from the old instance still serving. It is also the
health check path, so a build that boots but cannot serve never goes live.

It needs `RENDER_URL` in `.claude/settings.local.json` (gitignored):

```json
{ "env": { "RENDER_URL": "https://cannon-fodder.onrender.com" } }
```

`RENDER_API_KEY` and `RENDER_SERVICE_ID` are optional and buy better failure
messages — the *verdict* never depends on them.

## What it looks like

The bar is the Amiga original, and the screenshots in
[docs/original-images/](docs/original-images) are what everything is measured
against. Three things follow from taking that seriously:

- **Nothing is drawn per tile if it forms a mass.** The treeline, the tall grass
  and the rock outcrops are each baked as one continuous layer with an organic
  silhouette, because one sprite per tile on a 16px grid is a repeating motif you
  can read across a whole mission.
- **The map format stays one character per tile.** All the richness is *derived*
  at load time — signed distance fields, neighbour masks, mass sizes — so a
  mission is still a text file you can edit in any editor.
- **No alpha, no anti-aliasing.** Shadows are dithered coverage of a darkened
  ground tone; edges are hard. Both are things the hardware being imitated could
  not do, and the eye spots a soft gradient in a dithered frame immediately.

[docs/design.md](docs/design.md) has the detail. [docs/loop.md](docs/loop.md) is
the log of the build-and-critique loop that got it there.

## Controls

Left-click to move the herd · left-click a target to engage · hold right to fire
manually · both buttons to throw a grenade · middle-drag or screen edges to
scroll · `Esc` for the mission list. Full list in
[docs/controls.md](docs/controls.md).

Difficulty is picked on the mission list and **any level can be replayed at any
setting**. It is a set of levers, not one dial — whether they hear your gunfire,
hunt you, charge, flank, throw grenades, and whether you get fog of war — and
each mission's *doctrine* bends that profile its own way.

Everyone dies in one hit, as in the original — including your men. It is a game
about where you stand.

## The campaign

| # | Mission | Size | Theme | Objective | New idea |
|---|---|---|---|---|---|
| 1 | Chicken Run | 88x56 | jungle | kill all | The basics |
| 2 | River Run | 64x88 **tall** | jungle | kill all | Deep water; bridges are chokepoints |
| 3 | The Long Road | 220x44 **long** | desert | extraction | A long march to the pickup |
| 4 | Undergrowth | 96x68 | jungle | kill all | Tall grass hides you; snipers own the open ground |
| 5 | Minefield | 92x64 | desert | demolish | Mines, and barrels to blow a lane with |
| 6 | Village | 96x76 | jungle | demolish | Huts that keep producing troopers |
| 7 | Ice Station | 100x64 | arctic | rescue | Hostages, and ice that ruins your footing |
| 8 | Last Stand | 76x76 | arctic | survive | Holding a position for two minutes |

Missions are generated by [`game/tools/generate-levels.mjs`](game/tools/generate-levels.mjs)
into `data/` as plain, hand-editable ASCII. Seeds make it reproducible — change
one to reroll a level. Every generated map is validated (spawns on walkable
ground, objective reachable) before it is written.

## Layout

```
docs/     research, architecture, map format, controls, the visual loop
data/     ASCII mission files
game/     the game itself
  server.js   slim node:http server, zero runtime dependencies
  build.mjs   esbuild bundle + watch
  src/        ~24 modules — see docs/design.md
  tools/      level generator, screenshot harness, playtest, pixel stats
  test/       map and mission assertions
```

## Documentation

- [docs/research.md](docs/research.md) — what the original does, and what this
  takes from it
- [docs/design.md](docs/design.md) — architecture, herd movement, terrain model,
  AI, rendering, tuning
- [docs/map-format.md](docs/map-format.md) — the ASCII map spec, the tile
  legend, and how to add a mission
- [docs/controls.md](docs/controls.md) — controls and rules
- [docs/loop.md](docs/loop.md) — the objective, metric and boundary the visual
  work was run against, and what each round actually changed

## Dependencies

Three, all dev-only: `esbuild`, `typescript` and `playwright` — the last only so
the screenshot and playtest harnesses can drive a real browser. **No runtime
dependencies, and no art or audio files**: every sprite is plotted pixel by pixel
into an offscreen canvas at boot, every square inch of terrain is generated, and
the sound is synthesised with WebAudio.
