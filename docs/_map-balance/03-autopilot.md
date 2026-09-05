# 03 -- The autopilot

`src/sim/autopilot.ts`. A machine that plays the player's side of a mission
using only the three orders the player has, so a map can be measured without
anybody playing it.

## The bar it has to clear -- and the one it must not try to

**Complete, not clever.** It must clear every one of the nine objective types
on rookie, repeatably. It must *not* be tuned to win harder maps, because the
moment it is, its numbers stop being about the map and start being about the
bot. Every improvement to it changes every number in
[baseline.json](05-statistics.md#the-baseline-file), which is why the bot
carries a `version` and the baseline is stamped with it.

It reads `world.enemies` directly. It does not respect fog. It does not use
cover, retreat, split the squad, or flank. It will walk a formation into a
treeline if the objective is on the far side. Every report says this in its
header.

## Contract with the game

```ts
export class Autopilot {
  static readonly version = 1;      // bump on any behavioural change
  constructor(world: World);
  step(dt: number): void;           // call at ONE fixed point; see below
  readonly orders: number;          // for the run record
  readonly grenades: number;
}
```

`game.ts` calls `autopilot.step(dt)` **before** `stepWorld` in `Game.step`,
and the harness's `step(world, dt, autopilot?)` does the same. The point is
arbitrary; that it is the *same* point in both is not. It decides on the world
as it stood at the end of the previous step, then the step runs.

It imports only from `sim/`. It never touches `input`, the camera, the DOM, or
`game.ts`.

## Cadence and hysteresis

- **Rethink every 0.75 s**, not every step. Every order re-rolls the formation
  ring (`assignFormation`) and rebuilds the flow field; a squad re-ordered
  sixty times a second is permanently forming up and never walking.
- **Re-issue only when intent changes**: same `kind`, same `ref`, goal moved
  less than 40 px -> do nothing. `troops.ts` already repaths a moving target
  itself (`REPATH_DISTANCE`, `stepSoldiers`); re-ordering on top of that
  fights it.
- **Hysteresis on the threat override**: engage when an enemy is inside
  190 px, release only when the nearest is beyond 260 px. Without the gap the
  intent flips every rethink at the edge of a firefight, and each flip is a
  flow field.

## Intent, per objective

The objective first; an enemy in the way second. That order is the bot's whole
personality and it is deliberately the simple one: a bot that turned on every
enemy it could see would clear every map end to end and measure `eliminate`
whatever the header said.

| objective | intent |
|---|---|
| `demolish` | `orderDemolish` on the nearest standing building. Rifles do it (~17 rounds/s vs 60 hp); grenades when held. |
| `rescue` | `orderMove` to the nearest hostage that is alive, not freed, not delivered. When none are left loose, `orderMove` to the nearest tent (extraction zone). Freed hostages trail whoever freed them; there is no "escort" order, so free them all *then* walk home -- ordering back between each one crosses the map per hostage. |
| `collect` | `orderMove` to the nearest supply that is alive and not collected. Collected on touch. |
| `assassinate` | `orderAttack` on the living `EnemyKind.Officer`. |
| `reach`, `covert`, `hold` | `orderMove` to the nearest extraction zone. The formation ring of six sits ~36 px out and the zone radius is 46 px (`config.ts:657`), so ordering to the centre gets everyone in. |
| `survive` | If a `protect` building stands, `orderMove` to it -- the waves are walking at *it* (`buildings.ts:191` spawns them `Idle` for `siege`), so the squad has to be there or the objective is fought without it. No keep: stand still; the threat override does the rest. |
| `eliminate` | `orderAttack` on the nearest living enemy. When none stand and `kills < enemyTotal`, the rest are being *made*: `orderDemolish` the nearest standing spawner. An eliminate map with spawners is a demolish map with extra steps, and that is worth knowing about a map. |

## Threat override

Nearest living enemy of another faction inside the engage radius ->
`orderAttack` on it, whatever the objective intent was.

**Never on a `nokill` map.** Firing is allowed there and killing is not, and
`isFailed` ends the mission on the first body however it happened. A bot that
shot back would fail every covert map in its first firefight and report the map
as impossible. On `nokill` the bot only ever moves.

## Grenades

The rules are the player's rules, and they must be one copy. Step 1a extracts
them from `Game.tryGrenade` (`game.ts:172`) into `combat.ts`:

```ts
export function canThrowGrenade(w: World): boolean   // stock > 0, cooldown <= 0
export function squadThrow(w: World, at: Vec2): boolean
  // nearest living non-wading soldier throws; decrements stock; sets cooldown
```

`game.ts` calls them for the player; the bot calls them. A soldier holding his
rifle clear of the water cannot throw, and a bot that ignored that would land
throws the real game refuses.

Targeting, per rethink, when `canThrowGrenade`:
- Candidates: living hostile enemies inside `CONFIG.grenade.throwRange` (150).
- Aim point: the candidate with the most other candidates inside
  `blastRadius` (34). Throw only if that count is >= 2 -- `startingCount` is 2
  and `perCrate` is 3, so a bot that spent one per man is empty before the
  first hut and the run measures the grenade economy rather than the map.
- Never if any living soldier is inside `blastRadius` of the aim point.
- When demolishing: at the target building's centre if inside range, count
  irrelevant.

**Crates.** When `grenadesHeld` is 0 and the current intent needs blast
(demolish; eliminate-with-spawners) and a crate is nearer than the target,
detour to the crate first. Otherwise ignore crates. This is an optimisation of
the run, not a requirement of it.

## What to count

For the run record: `orders` issued, `grenades` thrown, and the current
`intent.kind` so a deadlock report can say *what it was trying to do*.

## Where this will fail first, and what to do

The objective gate ([04-runner.md](04-runner.md#the-objective-gate)) is
expected to fail on:

- **`covert`** -- the squad must cross a garrison without killing. If rookie
  covert cannot be done by walking, that is a map finding (Softly Softly is
  the only one). Do not add stealth to the bot.
- **`rescue`** -- hostages behind a garrison, then the walk back with them
  trailing. If they die on the way, look at the pen placement before the bot.
- **`demolish`** -- five huts and a finite grenade supply. If rifles are
  levelling them fine, the crate detour is not needed.

The triage question for every failure is the same: **would a player clicking
the same places have hit the same wall?** If yes, it is the game's (fix in
`troops.ts`/`pathfind.ts`, it ships). If a player would trivially have done
something the bot cannot -- waited, split, retreated -- it is the bot's, and
the fix is the *smallest* change that gets rookie through, not a smarter bot.
