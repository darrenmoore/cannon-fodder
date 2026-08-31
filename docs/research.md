# Research: what Cannon Fodder actually is

Notes gathered before writing any code, and the design decisions taken from
them. Sources are listed at the bottom.

## The game

*Cannon Fodder* (Sensible Software, 1993, Amiga) is a top-down action/strategy
game designed by Jon Hare. You command a squad of soldiers across 24 missions
(72 levels) of jungle, desert and snow, using a **point-and-click control scheme
more usually found in strategy games than in shooters**. That tension — an
action game driven like an RTS — is the thing worth reproducing.

## Mechanics that matter

### Squad and control

- Up to **six men** per mission, splittable into up to **three groups** (Snake,
  Eagle and Panther) so you can take separate positions or risk fewer men in the
  open.
- **Left click** sets a destination: the leader advances and the rest **follow in
  rank and file**. It is a loose herd, not a rigid formation.
- **Right click** fires the machine guns in the direction of the cursor.
- **Both buttons together** lobs a grenade or fires a rocket from limited stocks
  picked up on the map.

### Lethality

This is the load-bearing detail. **Machine guns kill infantry in one shot**, in
both directions. Your men are heavily outnumbered and die instantly, so the game
is about caution, planning and positioning rather than reflexes. Every design
decision downstream follows from one-hit kills.

### Terrain

- Trees and buildings block movement and sight.
- **Rivers slow soldiers and prevent them from firing** while they wade.
- Also present in the original: quicksand, mines and booby traps.
- Buildings spawn enemies; destroying them is often the objective.
- **Ammo crates explode when shot** — you can deliberately detonate one to kill a
  cluster of enemies rather than spending a man on them.

### Enemies

Infantry, plus jeeps, tanks, helicopters and missile turrets in later missions.
Enemies hold ground or patrol until they see you.

## Prior art

| Project | Language | Status | Use to us |
|---|---|---|---|
| [Open Fodder](https://github.com/OpenFodder/openfodder) | C++ | Playable | The definitive open reimplementation. Reference for mechanics and level structure. Ships cover-disk demos and supports retail data; has a JS interpreter for random map generation. |
| [krazyjakee/CannonFodder](https://github.com/krazyjakee/CannonFodder) | JavaScript | Marked *unplayable* on [osgameclones](https://osgameclones.com/cannon-fodder/) | Nothing usable. |

There is no healthy JavaScript remake to borrow from, so this prototype is
written from scratch against the mechanics above.

## What this prototype takes, and what it leaves

**Taken:**

- One hit kills, for everyone. `CONFIG.soldier`/`CONFIG.enemy` both spawn with
  `hp: 1`.
- Left click to move the herd; right click to fire manually; both buttons to
  throw a grenade.
- Follow-the-herd movement rather than a locked formation — implemented as a
  shared flow field plus per-soldier arrival slots.
- A river that is **fordable but slows you and stops you firing** (`waterSpeed`,
  and the `wading` guard in `troops.ts`), with a bridge as the fast crossing.
- Crates that give grenades when collected and **detonate when shot**, chaining
  into other crates.
- Enemies that hold ground or patrol, with a reaction beat before they open fire.

**Left out**, as out of scope for a prototype:

- Squad splitting into Snake/Eagle/Panther — the brief asked for one herd.
- Vehicles, turrets, destructible buildings, mines and quicksand.
- The campaign, the recruitment hill, promotions and the theme tune.

## Tuning derived from the original

The original ran at 320x200 with 16px tiles: roughly 20x12 tiles visible, with
soldiers about 8-10px tall — around 3% of the screen width. This prototype uses
the same 16px tile and renders at zoom 3, putting a 13px soldier at 39px on a
1440px-wide window: about 2.7% of screen width. That is why the soldiers feel
correctly *small* rather than arbitrarily so.

## Sources

- [Cannon Fodder (video game) — Wikipedia](https://en.wikipedia.org/wiki/Cannon_Fodder_(video_game))
- [Open Fodder](https://github.com/OpenFodder/openfodder) and [openfodder.com](https://openfodder.com/)
- [osgameclones — Cannon Fodder](https://osgameclones.com/cannon-fodder/)
- [Cannon Fodder — Retro Game Wiki](https://retro-game.fandom.com/wiki/Cannon_Fodder)
- [Indie Retro News — Cannon Fodder](https://www.indieretronews.com/2018/06/cannon-fodder-sensible-software-game.html)
- [MobyGames — Cannon Fodder](https://www.mobygames.com/game/210/cannon-fodder/)
