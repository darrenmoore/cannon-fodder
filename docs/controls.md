# Controls

The original's scheme, plus the click-to-attack the brief asked for.

## Mouse

| Input | Effect |
|---|---|
| **Left click** on ground | Order the whole squad there. They path around obstacles as a herd and spread out on arrival. |
| **Left click** on an enemy | Attack order. The squad closes until in range with a clear shot, then stops and opens fire. Red brackets mark the target. |
| **Left click** on a building | Order fire onto it. Mostly useful for walking the squad into grenade range — rifles barely scratch a building. |
| **Hold right button** | Manual fire toward the cursor, as in the original. Overrides the current target while held. |
| **Left click while holding right** | Lob a grenade at the cursor. Thrown by whichever soldier is nearest it. |
| **Middle-drag** | Pan the view. |
| **Mouse near a screen edge** | Scroll the view. |

Moving the camera by hand suspends the follow-the-squad camera for about a second
and a half, so looking ahead does not immediately snap back.

## Keyboard

| Key | Effect |
|---|---|
| `R`, `Space`, `Enter` | Restart the mission (acted on from the win screen; a loss restarts itself). |
| `Esc` | Back to the mission list. |
| `1`–`8` | On the mission list, jump straight to that mission. `Enter` resumes the last one played. |

## Difficulty

Picked on the mission list; **any level can be replayed at any setting**. The
card shows what each one actually turns on, because difficulty here is a set of
levers rather than one dial.

| | What changes |
|---|---|
| **Rookie** | They shoot slowly and badly, and **only the nearest man** hears your gunfire. No fog. |
| **Veteran** | They hunt you across the map, flank hard, and the huts keep feeding. **No fog.** |
| **Elite** | Thick fog. They swarm, they flank, and they throw grenades. |

Each mission also has a **doctrine** — garrison, patrols, hunters, ambush or
swarm — which bends the difficulty in its own direction, so Veteran on one map
is not Veteran on the next. Traits are rolled per enemy, so within a mission some
hunt, some charge, and some flank; two runs of the same level are not the same
fight.

## Rules worth knowing

**Everyone dies in one hit** — your men and theirs. This is a positioning game.

### Noise and sight

- **Your gunfire carries.** From Veteran up, shooting alerts everything within
  earshot and they walk to the sound. Opening fire is a decision.
- **Explosions carry twice as far.**
- **They share sightings.** Once one of them sees you, the others know where you
  were, and hunters keep coming to it.
- **Fog of war** on Elite alone: you only see what your men can see, the
  ground you have crossed stays dimly remembered, and **enemies outside your
  sight are not drawn**. Tall grass blocks your vision exactly as it blocks
  theirs, so a grass map in fog is genuinely blind work.

### Movement and terrain

- **You cannot shoot while wading.** Shallow water and quicksand slow you and
  leave you defenceless. Deep water cannot be crossed at all — find a bridge.
- **Ice ruins your footing.** Acceleration drops hard, so your squad slides
  through turns and overshoots. Order shorter moves.
- **Roads are faster.** Worth following on a long march.
- **Tall grass hides you but not your bullets.** Enemies lose sight of you in it,
  while rounds pass straight through — so you can shoot from cover that is not
  really cover. Snipers own the open ground between patches.

### Combat

- **Ordered fire reaches 80px; unordered return fire reaches less.** A parked
  squad still defends itself, but walking past a sentry no longer quietly clears
  the map. Turn return fire off entirely with `soldier.autoEngage` in
  [`config.ts`](../game/src/config.ts).
- **Trees, rocks, huts and fences stop bullets.** Cover works.
- **Three enemy types.** Riflemen close in. **Snipers** (grey) shoot from long
  range with near-perfect accuracy and hold their post. **Bazookateers**
  (magenta) lob slow explosive rounds — you can see one coming, and it will kill
  a clustered squad, so spread out or kill them first.
- **Enemy grenadiers** on the harder settings throw at the *centre of your
  tightest cluster*, so bunching up behind one tree is how you lose three men at
  once.
- **Rushers** ignore sensible range and charge you. **Flankers** approach
  off-axis rather than down your sights.
- **Buildings keep sending out troopers** while you are near them, and only
  explosives bring them down — faster and in greater numbers as difficulty
  rises. A building visibly degrades as you work on it (pocked, then holed and
  smoking, then a wreck), and a levelled one becomes walkable rubble that smokes
  for a while.
- **Crates and barrels explode when shot**, and chain into each other. Three
  grenades if you walk over a crate; barrels are pure demolition. Blasts kill
  your own men too.
- **Mines are invisible until stepped on**, then a short fuse gives you a moment
  to run. Enemies set them off too — herding a patrol across a field is a
  legitimate way to clear one. A blast chains through nearby mines, so a barrel
  can open a lane.

### Objectives

Each mission states its own. Watch the HUD for progress:

- **Kill every enemy** — the default.
- **Level every building** — you will need grenades.
- **Walk every hostage to a tent** — get close to free one, and they follow.
  **One dead hostage loses the mission**, including to your own fire.
- **Get the squad to the extraction point** — everyone still standing.
- **Hold out until the clock runs down.**

## Debugging

`window.game` is exposed in the browser console — `game.world` holds the live
soldiers, enemies, buildings, mines, hostages and phase. It is what the headless
test driver uses.
