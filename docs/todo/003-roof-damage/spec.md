# 003 — spec

The brief is [003.md](brief.md), in the owner's words. This is that brief turned
into work: what each item means, what it is allowed to change, and how anyone
can tell when it is done. Four decisions were taken by the owner up front and
are recorded in place rather than left implicit.

Items ship in four batches. Each batch is separately releasable, so a bad call
in one is revertable without taking the others with it.

**All four batches are done.** Three things turned out differently from the
spec and are recorded where they happened: the grey wreck was never the bug
(B2), the extraction radius doubled rather than nudged (D4), and the hitbox fix
makes every soldier on both sides easier to kill (C1).

| Batch | Contents | Why here |
|---|---|---|
| **A** | 12 — directory reorganisation, sprites split | First, by decision. Every later item lands in its final home. |
| **B** | 1, 10 — the blast model; mines visible | One shared mechanic; the biggest gameplay change in the brief. |
| **C** | 2, 6, 7, 8, 11 — hitboxes, idle roaming, muzzle cone, water, deaths | All of it is what the game looks and feels like in a firefight. |
| **D** | 3, 4, 5, 9 — rank pips, results panel, briefing, extraction | The shell around the mission. |

---

## Decisions taken

1. **Refactor first**, before any behaviour change.
2. **The blast model is symmetric** — one code path for buildings, barrels,
   grenades, mines and rockets, applied to your men and theirs alike. This is
   accepted as a combat balance change: a grenade will no longer wipe a
   clustered squad, in either direction.
3. **Rank shows as pips above the head**, permanently, for promoted men only —
   and **never on a corpse**.
4. **`src/` is grouped `sim` / `render` / `ui` / `shell`.**

---

## Batch A — structure

### A1. `src/` grouped by domain

```
src/
  main.ts  loop.ts  config.ts  types.ts
  sim/     world game troops enemies combat buildings mines hostages
           pickups objectives steering pathfind map tiles difficulty campaign
  render/  render ground canopy terrain palette fx camera fog pixelfont
           sprites/
  ui/      hud menu sheet boothill settings controls layout ui
  shell/   input aim pointer audio music analytics
```

`game.ts` sits in `sim/` despite naming `Camera`, `Renderer` and `Input`,
because it imports all three as types only — they erase at compile time, so no
runtime dependency crosses the boundary.

**Done when:** every import resolves, `npm run check` passes, `npm run playtest`
passes unchanged, and the module maps in `CLAUDE.md`, `docs/design.md` and the
README layout section describe the new tree. Behaviour is byte-identical; this
batch is a file move and nothing else.

### A2. `sprites.ts` split by subject

1,132 lines becomes `render/sprites/` — `index.ts` (the `Atlas`, `buildAtlas`,
palettes, shared helpers), `units.ts`, `buildings.ts`, `terrain.ts`, `icons.ts`.

**Done when:** `buildAtlas()` returns the same atlas shape, `npm run sheet`
renders every sprite as before, and no single file exceeds ~400 lines.

---

## Batch B — explosions

### B1. One blast model, with falloff

Today `explode()` kills everything inside one radius, friend or foe. It becomes
two rings:

- **inside `lethal`** — dies, as now
- **between `lethal` and `radius`** — survives, and is **pushed back**, away
  from the centre, with a short animation
- **outside `radius`** — untouched

Applied by every explosion: building collapse, barrel, grenade, mine, rocket.
`lethal` is a fraction of each explosion's existing radius, in `config.ts`, so
the tuning stays in the one place tuning lives.

**Done when:** a grenade on a bunched squad kills one man, sometimes two, and
pushes the rest clear; the same holds for a hut and for a barrel; enemies are
pushed by your grenades exactly as your men are pushed by theirs; and the push
cannot shove anybody through a wall or into deep water.

### B2. Buildings die visibly

**The diagnosis here was wrong, and the truth was worse.** The grey wreck was
never drawn at all: `renderer.prepare()` runs once per map against a *throwaway*
world, and every scenery item held a reference to a building inside it — an
object nobody was playing with, permanently intact and permanently stage zero.
No building had ever shown a damage stage, a ruin, or a damage bar. Items now
carry a building *id* and resolve against the live world each frame, which also
survives a restart building a new one.

On top of that fix, the roof lifts and fades as the building collapses, because
the swap on its own still read as a recolour: the eye is caught by movement and
there was none.

**Done when:** a building being destroyed is legible without watching the
health bar, and the wreck that remains is unmistakably ash grey.

### B3. Mines can be seen

They are invisible in play today. A mine reads as a small, deliberate object on
the ground — visible to the player, not camouflaged.

**Done when:** a mine can be spotted before it is stood on, at normal zoom, on
every theme's ground tone.

---

## Batch C — the fight

### C1. Hitboxes reach the head

A soldier's `pos` is at his feet and the sprite is drawn 12px above it, while
the bullet test is a 4.6px circle around `pos` — so the head is unhittable and
the boots are not. Hit tests get a body that covers the drawn figure.

**Done when:** a shot at the head kills, a shot at the legs kills, and a shot
that visibly misses above the helmet does not. Applies to both sides.

### C2. Idle enemies move

Every enemy, whatever its persona, breaks stillness — looking about, shifting
weight, the occasional step. Frequency and range vary with persona; a rooted
sniper still holds his post.

**Done when:** no enemy stands perfectly still for more than a few seconds
before contact, and no enemy wanders off the post it was placed on.

### C3. Remove the muzzle cone

The light cone drawn from the gun goes. Muzzle flash itself stays.

### C4. Water reads as depth

Today a blue rectangle is painted across the lower body. Instead, a wading man
is **submerged** — drawn from roughly the shoulders up, with a ripple at the
waterline. Mud gets the same treatment at a shallower depth and its own tone,
not the water block.

**Done when:** a man in deep water looks like he is standing in it rather than
behind a blue bar, and the same is true in mud.

### C5. Dying takes a moment

A killed man currently becomes a corpse in one frame. He gets a short death
animation and more blood.

**Done when:** a death is readable as an event, for your men and theirs, and
the decal setting still turns the mess off.

---

## Batch D — the shell

### D1. Rank pips

Chevrons come off the name plates entirely. A promoted soldier carries small
rank pips above his head in the world. **A corpse carries none.** One shared
component, used by the sidebar, the results panel and Boot Hill.

### D2. The results panel

- Promoted names stop being red — red stays for the dead only, and promotion
  gets a colour that reads as good news.
- The Boot Hill link comes off this panel. It stays in the pause sheet.
- Buttons align: **Replay** left with a left-pointing icon, **Next mission**
  right with a forward icon, on one line. **Mission list** becomes the quieter
  third option below them, since it is the one you want least often.

### D3. The briefing waits

The briefing currently hides itself after 2.2 seconds. It stays up until
dismissed, and **the click that dismisses it does not also order the squad**.

### D4. Extraction is forgiving

Standing in the zone currently means being within 22px of its centre, which
demands the squad be aligned almost perfectly. The zone becomes a generous
circle a whole squad can occupy at once.

**Done when:** a squad that has plainly arrived at the pickup extracts, without
shuffling anybody into place.
