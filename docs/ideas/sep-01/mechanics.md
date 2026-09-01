# Mechanics

From small honest fixes the research turned up, to the one big thing the
original had that this game does not.

| Idea | Effort | Fun |
|---|---|---|
| Mud that pulls | S-M | ★★★ |
| AI should hate the bog (pathfind cost) | S | ★★ |
| Weapon pickups: the bazooka is right there | M | ★★★ |
| Decoy tools -- a thrown stone | M | ★★ |
| Weather that means something | L | ★★ |
| Night missions | L | ★★ |
| Vehicles | XL | ★★★ |

**Mud that pulls.** The 002 research found quicksand is only a slow tile: no
sinking, no escape mechanic, nothing (`tiles.ts` -- `speed: 0.24, wade` and
that is all). The name promises more. Smallest honest version: standing
*still* in mud sinks you -- a rising per-soldier timer while stationary, a
visible settle in the sprite (the wade waterline already exists and can
deepen), death if ignored, reset the moment you move. Suddenly the sink's
hold mission is about *where* you stand, and "effectively a trap" in the
legend becomes true.

**AI should hate the bog.** Same research, near-bug: `pathfind.ts` prices
deep water (`swim.cost = 4`) but quicksand at 1 -- ordinary ground -- so
enemies route through the slowest terrain in the game as if it were grass,
arriving late and helpless (they cannot fire while wading). One cost term
makes hunters route around the sink like players do. Arguably a fix, listed
here because it changes AI feel enough to deserve its own playtest.

**Weapon pickups.** The engine already runs three enemy weapon kinds with
their own stats and sprites; the squad only ever has rifles and grenades. A
dropped bazooka (from a dead bazookateer, rarely) that one soldier can walk
over and carry -- slower fire, splash damage, a visible tube on the sprite --
is the original's rocket pickup in spirit and reuses `bakeBazooka`'s art
language. The work is in the carrying rules and not letting it trivialise
demolish missions (limited rounds does it).

**Decoy tools.** The alarm system already investigates the *impact point* of
a shot, and one mission (`the-far-trees`) is built on teaching it. A
throwable stone -- short range, no damage, raises the same alarm at the
landing spot without the gunshot's map-wide noise -- turns that one-mission
trick into a standing stealth verb. Cheap: it is `raiseAlarm` on a lobbed
arc that already exists for grenades.

**Weather.** Wind already exists as a render concept (the trees sway to it).
Let a mission header declare rain or a gale: rain shortens everyone's
hearing (`levers.hearing * 0.6`) and dapples the ground; a gale bends
grenade arcs. Weather that changes a lever is a mechanic; weather that only
draws is wallpaper -- this is only worth doing if it reaches the sim.

**Night missions.** Elite's fog-of-war (`levers.vision`) is already a
sight-radius mechanic; night is its dramatic cousin -- a dark palette bake
per theme, vision for *both* sides shortened, muzzle flashes lighting a
beat. The renderer bakes ground per theme already, so a night variant is a
second bake, not a lighting engine. The cost is in doing the palette work
three times (one per theme) to the gauntlet's standard.

**Vehicles.** The original's later missions had them; nothing in this sim
does. A driveable jeep alone touches steering, collision, the sprite
pipeline (rotations), enemy targeting and map design -- a real project with
its own brief, listed so nobody mistakes its absence for an oversight. The
payoff is equally real: it is the most-remembered thing about the original's
mid-game.
