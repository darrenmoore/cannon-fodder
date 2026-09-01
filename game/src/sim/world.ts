import { CONFIG } from '../config.js';
import { RECRUITS } from './campaign.js';
import { resolveLevers } from './difficulty.js';
import { Fog } from '../render/fog.js';
import { Fx } from '../render/fx.js';
import { nearestWalkable, restoreTiles } from './map.js';
import { SpatialHash } from './steering.js';
import { EnemyKind, EnemyState, Faction, Phase, SoldierState } from '../types.js';
import type { Deployment } from './campaign.js';
import type { DifficultyId, Levers } from './difficulty.js';
import type { GameMap, Zone } from './map.js';
import type { FlowField } from './pathfind.js';
import type {
  Actor, Building, Bullet, Crate, Enemy, EnemyStats, EnemyTraits, Grenade, Hostage, Mine,
  Soldier, Supply, Vec2,
} from '../types.js';

/**
 * The mutable state of one mission. Built fresh from the parsed map on every
 * restart, so restarting is just `createWorld` again -- no teardown, no reload.
 */
export interface World {
  map: GameMap;
  difficulty: DifficultyId;
  /** Difficulty profile with this mission's doctrine folded in. */
  levers: Levers;
  fog: Fog;
  /**
   * What difficulty and doctrine chose. Fixed for the mission, and what the
   * menu describes -- `levers` is this with in-mission pressure folded in, and
   * is what the systems read.
   */
  baseLevers: Levers;
  /** Counts down to the next footfall the garrison can hear. */
  stepNoise: number;
  /** Kills made without leaving the spot. Hidden; see `sim/pressure.ts`. */
  pressure: number;
  /** The spot, for as long as they are on it. */
  campAnchor: Vec2 | null;
  /** Seconds the squad has held it. Kills only count once this passes `settle`. */
  stillFor: number;
  /** Last position any enemy actually saw a soldier at, shared across them all. */
  lastKnown: Vec2 | null;
  lastKnownAge: number;
  soldiers: Soldier[];
  enemies: Enemy[];
  /** Soldiers and enemies together, for the spatial hash and collision passes. */
  actors: Actor[];
  bullets: Bullet[];
  grenades: Grenade[];
  crates: Crate[];
  mines: Mine[];
  hostages: Hostage[];
  /** Objective items for a `collect` mission. See `Supply`. */
  supplies: Supply[];
  buildings: Building[];
  extraction: Zone[];
  fx: Fx;
  hash: SpatialHash;

  /** Flow field for the herd's current destination; null when holding. */
  field: FlowField | null;
  orderGoal: Vec2 | null;
  orderMarker: number;
  /** Enemy the squad was ordered onto, if any. */
  squadTarget: Actor | null;
  /** Building the squad was ordered to level, if any. */
  targetBuilding: Building | null;
  /** Countdown before the attack flow field may be rebuilt again. */
  repathTimer: number;
  lastTargetPos: Vec2 | null;
  /** Pending camera shake, drained each step. */
  shake: number;

  grenadesHeld: number;
  grenadeCooldown: number;

  phase: Phase;
  /** Seconds spent in the current phase; drives the auto-restart. */
  phaseTime: number;
  time: number;
  kills: number;
  enemyTotal: number;
  /** Counts down for `survive` missions. */
  timeLeft: number;
  /**
   * Seconds accumulated for a `hold` mission, and whether the zone is occupied
   * right now.
   *
   * Held rather than derived from `time` because the clock only runs while
   * somebody is standing in the zone -- which is the whole difference between
   * `hold` and `survive`, and the reason leaving resumes rather than resets.
   */
  heldFor: number;
  inZone: boolean;
  /** Waves already sent. Only ever advances; `map.waves.count` caps it. */
  wavesSent: number;
  /** Seconds until the next wave leaves the huts. */
  waveTimer: number;
  /** One-line objective status for the HUD. */
  status: string;

  nextId: number;
}

const BASE_STATS: Record<EnemyKind, EnemyStats> = {
  [EnemyKind.Rifle]: {
    speed: CONFIG.enemy.speed,
    fireRange: CONFIG.enemy.fireRange,
    fireInterval: CONFIG.enemy.fireInterval,
    spread: CONFIG.enemy.spread,
    aggroRadius: CONFIG.enemy.aggroRadius,
    reactionTime: CONFIG.enemy.reactionTime,
    preferredRange: CONFIG.enemy.preferredRange,
  },
  [EnemyKind.Sniper]: { ...CONFIG.sniper },
  [EnemyKind.Officer]: { ...CONFIG.officer },
  [EnemyKind.Bazooka]: {
    speed: CONFIG.bazooka.speed,
    fireRange: CONFIG.bazooka.fireRange,
    fireInterval: CONFIG.bazooka.fireInterval,
    spread: CONFIG.bazooka.spread,
    aggroRadius: CONFIG.bazooka.aggroRadius,
    reactionTime: CONFIG.bazooka.reactionTime,
    preferredRange: CONFIG.bazooka.preferredRange,
  },
};

/** Base stats scaled by the difficulty levers. */
function scaledStats(kind: EnemyKind, levers: Levers): EnemyStats {
  const base = BASE_STATS[kind];
  return {
    speed: base.speed * levers.speed,
    fireRange: base.fireRange * levers.fireRange,
    fireInterval: base.fireInterval * levers.fireInterval,
    spread: base.spread * levers.spread,
    aggroRadius: base.aggroRadius * levers.aggro,
    reactionTime: base.reactionTime * levers.reaction,
    // Scaled by the same lever as fireRange: an unscaled standing distance
    // meant veteran could *hit* from 6.2 tiles but still walked to 4.4 before
    // settling -- reading as "they want to get very close before firing".
    preferredRange: base.preferredRange * levers.fireRange,
  };
}

/** Rolls one enemy's personality from the mission's levers. */
function rollTraits(levers: Levers, kind: EnemyKind): EnemyTraits {
  // Snipers and bazookateers hold their post; charging would waste them.
  const mobile = kind === EnemyKind.Rifle;
  return {
    hunter: mobile && Math.random() < levers.hunters,
    rusher: mobile && Math.random() < levers.rushers,
    grenadier: mobile && Math.random() < levers.grenadiers,
    flank: mobile ? levers.flank * (0.5 + Math.random()) * 46 : 0,
    flankSide: Math.random() < 0.5 ? -1 : 1,
    // Riflemen only. A sniper is already hidden by not moving, and a man with a
    // silver tube on his shoulder is not hiding from anybody.
    camo: mobile && Math.random() < levers.camo,
  };
}

/**
 * The roster of last resort.
 *
 * Who actually deploys is decided by `campaign.ts` and passed in, because the
 * roster outlives the mission now. This fallback exists for the throwaway world
 * the renderer builds to read building placements from, which never gets shown
 * to anyone — see `renderer.prepare` in main.ts.
 */
const FALLBACK_ROSTER: Deployment[] = RECRUITS.slice(0, 12)
  .map((name) => ({ name, missions: 0, own: false, fresh: false }));

const spawnActor = (counter: { nextId: number }, pos: Vec2, faction: Faction, radius: number): Actor => ({
  id: counter.nextId++,
  faction,
  pos: { x: pos.x, y: pos.y },
  prev: { x: pos.x, y: pos.y },
  vel: { x: 0, y: 0 },
  radius,
  // Facing south, but not all of them exactly. Six men standing in a clearing
  // all looking precisely the same way is the tell that they were placed rather
  // than that they are waiting -- and the sprite has eight facings, so a
  // scatter of a couple of steps either side costs nothing and reads at once.
  angle: Math.PI / 2 + ((counter.nextId * 2654435761) % 5 - 2) * (Math.PI / 4),
  alive: true,
  hp: 1,
  fireCooldown: 0,
  walkPhase: 0,
  wading: false,
  canSwim: true,
  swimming: false,
  wounded: false,
  screamTimer: 0,
  sliding: false,
  stagger: 0,
  deathTime: -1,
});

/** Builds an enemy of the given kind. Also used for building reinforcements. */
export function makeEnemy(
  counter: { nextId: number },
  pos: Vec2,
  kind: EnemyKind,
  home: Vec2 | null,
  levers: Levers,
  spawnedBy = -1,
): Enemy {
  const traits = rollTraits(levers, kind);
  return {
    ...spawnActor(counter, pos, Faction.Enemy, CONFIG.enemy.radius),
    faction: Faction.Enemy,
    kind,
    stats: scaledStats(kind, levers),
    state: home ? EnemyState.Patrol : EnemyState.Idle,
    home: home ? { ...home } : { ...pos },
    patrols: home !== null,
    // Specialists hold their firing position instead of closing in.
    rooted: kind !== EnemyKind.Rifle,
    goal: null,
    path: [],
    target: null,
    reaction: 0,
    memory: 0,
    pause: Math.random() * 2,
    stuck: 0,
    traits,
    investigate: null,
    glance: null,
    searchTime: 0,
    idleTimer: Math.random() * 2,
    grenades: traits.grenadier ? CONFIG.enemy.grenadeCount : 0,
    grenadeCooldown: CONFIG.enemy.grenadeCooldown * Math.random(),
    spawnedBy,
  };
}

export function createWorld(map: GameMap, difficulty: DifficultyId, roster?: Deployment[]): World {
  // Undo any demolition from the previous attempt at this level.
  restoreTiles(map);
  const levers = resolveLevers(difficulty, map.doctrine);
  const counter = { nextId: 1 };
  const squad = roster && roster.length > 0 ? roster : FALLBACK_ROSTER;

  // The map may place more spawns than the mission fields -- a one-man mission
  // still needs somewhere sensible for that man to stand.
  const soldiers: Soldier[] = map.playerSpawns.slice(0, map.squadSize).map((p, i) => {
    // The map may place more spawns than the roster holds; wrapping keeps the
    // mission playable rather than fielding an undefined name.
    const t = squad[i % squad.length];
    return {
      ...spawnActor(counter, p, Faction.Player, CONFIG.soldier.radius),
      faction: Faction.Player,
      state: SoldierState.Idle,
      slot: null,
      slotStuck: 0,
      name: t.name,
      rank: t.missions,
      own: t.own,
      fresh: t.fresh,
    };
  });

  /** An enemy standing near a patrol node walks a beat; the rest hold ground. */
  const nearestNode = (p: Vec2): Vec2 | null => {
    let home: Vec2 | null = null;
    let bestD = CONFIG.enemy.patrolRadius * 1.6;
    for (const node of map.patrolNodes) {
      const d = Math.hypot(node.x - p.x, node.y - p.y);
      if (d < bestD) { bestD = d; home = node; }
    }
    return home;
  };

  const enemies: Enemy[] = [
    ...map.enemySpawns.map((p) => makeEnemy(counter, p, EnemyKind.Rifle, nearestNode(p), levers)),
    ...map.sniperSpawns.map((p) => makeEnemy(counter, p, EnemyKind.Sniper, null, levers)),
    ...map.bazookaSpawns.map((p) => makeEnemy(counter, p, EnemyKind.Bazooka, null, levers)),
    ...map.officers.map((p) => makeEnemy(counter, p, EnemyKind.Officer, null, levers)),
  ];

  // Higher difficulties thicken the garrison by doubling up on existing posts,
  // which keeps reinforcements where the level author meant them to be. The
  // anchors are shuffled so the thickening spreads over the whole garrison
  // rather than stacking on whichever posts the file listed first, and an
  // extra never lands inside the 12-tile opening the maps guarantee the squad
  // (the anchor itself already honours it, so it is the safe fallback).
  const extra = Math.round(map.enemySpawns.length * levers.extraEnemies);
  const anchors = [...map.enemySpawns];
  for (let i = anchors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [anchors[i], anchors[j]] = [anchors[j], anchors[i]];
  }
  const startClear = 12 * map.tile;
  const squadAt = map.playerSpawns.slice(0, map.squadSize);
  for (let i = 0; i < extra && anchors.length > 0; i++) {
    const anchor = anchors[i % anchors.length];
    let at = anchor;
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 26;
      const c = nearestWalkable(map, { x: anchor.x + Math.cos(a) * r, y: anchor.y + Math.sin(a) * r });
      if (squadAt.every((p) => Math.hypot(c.x - p.x, c.y - p.y) >= startClear)) { at = c; break; }
    }
    enemies.push(makeEnemy(counter, at, EnemyKind.Rifle, nearestNode(at), levers));
  }

  const buildings: Building[] = map.buildings.map((b, i) => {
    // An outpost is built to be held, so it takes as much killing as a factory.
    const hp = b.kind === 'hut' ? CONFIG.building.hutHp : CONFIG.building.factoryHp;
    /*
     * Two buildings in this game cannot be taken away, for opposite reasons.
     *
     * A **bunker** is a position the mission asks you to hold, and a position
     * that can be demolished is a demolition puzzle wearing a defence
     * objective's clothes.
     *
     * A **wave map's spawner** is the tap the schedule comes out of, and
     * levelling it used to turn the tap down -- which read as the answer to
     * every wave mission and made the back half of them trivial. Waves ramp
     * now, and a ramp you can switch off is not a ramp. The huts still take
     * fire, still flash, still show a bar; the bar simply never empties, which
     * is the honest signal that this is not the way through.
     */
    const indestructible = b.kind === 'bunker' || (map.waves !== null && b.role === 'spawner');
    return {
      indestructible,
      damageStage: 0,
      ruinAge: 0,
      id: i,
      kind: b.kind,
      role: b.role,
      tiles: b.tiles,
      centre: { ...b.centre },
      x0: b.x0, y0: b.y0, w: b.w, h: b.h,
      hp,
      maxHp: hp,
      standing: true,
      // Staggered so a village does not disgorge everyone on the same tick.
      spawnTimer: CONFIG.building.spawnInterval * levers.spawnInterval * (0.4 + Math.random() * 0.8),
      spawned: 0,
      flash: 0,
    };
  });

  const hostages: Hostage[] = map.hostages.map((p) => ({
    id: counter.nextId++,
    pos: { ...p },
    prev: { ...p },
    vel: { x: 0, y: 0 },
    radius: CONFIG.hostage.radius,
    angle: Math.PI / 2,
    alive: true,
    walkPhase: 0,
    freed: false,
    delivered: false,
  }));

  const world: World = {
    map,
    difficulty,
    levers,
    fog: new Fog(map, levers.vision),
    baseLevers: { ...levers },
    stepNoise: 0,
    pressure: 0,
    campAnchor: null,
    stillFor: 0,
    lastKnown: null,
    lastKnownAge: 0,
    soldiers,
    enemies,
    actors: [...soldiers, ...enemies],
    bullets: [],
    grenades: [],
    crates: [
      ...map.crates.map((p) => ({ pos: { ...p }, alive: true, barrel: false })),
      ...map.barrels.map((p) => ({ pos: { ...p }, alive: true, barrel: true })),
    ],
    mines: map.mines.map((p) => ({ pos: { ...p }, alive: true, fuse: -1, triggered: false })),
    hostages,
    supplies: map.supplies.map((p) => ({ pos: { ...p }, alive: true, collected: false })),
    buildings,
    extraction: map.extraction.map((p) => ({ ...p })),
    fx: new Fx(),
    hash: new SpatialHash(24),
    field: null,
    orderGoal: null,
    orderMarker: 0,
    squadTarget: null,
    targetBuilding: null,
    repathTimer: 0,
    lastTargetPos: null,
    shake: 0,
    grenadesHeld: levers.grenades,
    grenadeCooldown: 0,
    phase: Phase.Playing,
    phaseTime: 0,
    time: 0,
    kills: 0,
    enemyTotal: enemies.length,
    timeLeft: map.duration,
    heldFor: 0,
    inZone: false,
    wavesSent: 0,
    waveTimer: map.waves ? CONFIG.wave.lead : 0,
    status: '',
    nextId: counter.nextId,
  };

  world.fog.refresh(map, soldiers);
  return world;
}

export const livingSoldiers = (w: World): Soldier[] => w.soldiers.filter((s) => s.alive);

/** Centre of mass of the surviving squad; what the camera follows. */
export function squadCentre(w: World): Vec2 | null {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const s of w.soldiers) {
    if (!s.alive) continue;
    x += s.pos.x;
    y += s.pos.y;
    n++;
  }
  return n === 0 ? null : { x: x / n, y: y / n };
}
