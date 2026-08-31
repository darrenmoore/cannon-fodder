/** Shared vocabulary. Kept dependency-free so every module can import it. */

export interface Vec2 {
  x: number;
  y: number;
}

export enum Faction {
  Player = 0,
  Enemy = 1,
}

/** Anything that walks, steers and can be shot. */
export interface Actor {
  id: number;
  faction: Faction;
  pos: Vec2;
  /** Position at the end of the previous sim step, for render interpolation. */
  prev: Vec2;
  vel: Vec2;
  radius: number;
  /** Facing in radians. Drives which of the 8 sprite facings is drawn. */
  angle: number;
  alive: boolean;
  /** Everyone dies in one hit, as in the original. Kept as a number for tuning. */
  hp: number;
  /** Seconds until this actor may fire again. */
  fireCooldown: number;
  /** Distance walked, used to advance the walk-cycle frame. */
  walkPhase: number;
  /** True while standing in water or quicksand: slowed, and unable to shoot. */
  wading: boolean;
  /** True while standing on ice: steering is sluggish and skiddy. */
  sliding: boolean;
  /**
   * Seconds left of being blown off your feet.
   *
   * A man inside a blast but outside its lethal core is thrown clear rather
   * than killed. While this is running he does not steer, shoot or take
   * orders -- his own velocity carries him -- which is what makes an explosion
   * something you survive *badly* rather than something that merely missed.
   */
  stagger: number;
  /**
   * Seconds since this one was killed, or -1 while alive.
   *
   * A man used to become a corpse decal in the same frame the round reached
   * him: one moment upright, the next a stain, with nothing in between for the
   * eye to catch. He now collapses first, and only then is stamped into the
   * decal layer and forgotten about.
   */
  deathTime: number;
}

export enum SoldierState {
  Idle = 0,
  Moving = 1,
  Engaging = 2,
}

export interface Soldier extends Actor {
  faction: Faction.Player;
  state: SoldierState;
  /** Personal arrival slot, so the herd spreads out instead of piling on the click. */
  slot: Vec2 | null;
  /**
   * The name on the roster. The original's cruelty is entirely in this field:
   * a nameless casualty is a number, and a named one is Jools.
   */
  name: string;
  /**
   * How many missions this one has survived. Promotes them up the roster, and
   * buys a small edge in the firing solution — see `veteranEdge` in troops.ts.
   * `campaign.ts` derives the rank tier from it; nothing else may write it.
   */
  rank: number;
  /** True if the player spent their one rename on this soldier. */
  own: boolean;
  /** First mission for this one. The briefing flags them; the sidebar does not. */
  fresh: boolean;
}

export enum EnemyState {
  Idle = 0,
  Patrol = 1,
  Alert = 2,
  Engage = 3,
  /** Heard something and is walking to it. The state that makes them hunt. */
  Investigate = 4,
}

/**
 * Rolled per enemy from the mission's difficulty and doctrine. Two enemies with
 * the same stats behave very differently depending on these, which is what stops
 * a firefight playing out the same way twice.
 */
export interface EnemyTraits {
  /** Crosses the map to the squad's last known position once the alarm goes up. */
  hunter: boolean;
  /** Closes to knife range instead of holding at `preferredRange`. */
  rusher: boolean;
  /** Carries grenades and will use them on a clustered squad. */
  grenadier: boolean;
  /** How far off-axis it approaches, in world pixels of lateral offset. */
  flank: number;
  /** Which way it circles. Fixed per enemy so it does not dither. */
  flankSide: number;
}

/** Rifleman, sniper or bazookateer -- see CONFIG for the per-kind stats. */
export enum EnemyKind {
  Rifle = 0,
  Sniper = 1,
  Bazooka = 2,
}

export interface EnemyStats {
  speed: number;
  fireRange: number;
  fireInterval: number;
  spread: number;
  aggroRadius: number;
  reactionTime: number;
  preferredRange: number;
}

export interface Enemy extends Actor {
  faction: Faction.Enemy;
  kind: EnemyKind;
  stats: EnemyStats;
  state: EnemyState;
  /** Anchor for patrolling enemies; null means this one holds its ground. */
  home: Vec2 | null;
  patrols: boolean;
  /** Snipers and bazookateers hold their post rather than closing in. */
  rooted: boolean;
  goal: Vec2 | null;
  /** Waypoints from a fallback A*, used only after it gets wedged on scenery. */
  path: Vec2[];
  target: Actor | null;
  reaction: number;
  memory: number;
  pause: number;
  /** Rising while the enemy is failing to make progress; triggers a repath. */
  stuck: number;
  traits: EnemyTraits;
  /** Where it is walking to look, while investigating. */
  investigate: Vec2 | null;
  /** Seconds spent looking around at the end of an investigation. */
  searchTime: number;
  /**
   * Counts down to the next idle fidget: a look around, a shift of weight, a
   * step off the mark and back. Nobody stands still for minutes on end, and an
   * enemy who does reads as scenery until he shoots you.
   */
  idleTimer: number;
  /** Grenades left, and the cooldown between throws. */
  grenades: number;
  grenadeCooldown: number;
  /** The building that produced it, so reinforcements stay capped. */
  spawnedBy: number;
}

export interface Bullet {
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  faction: Faction;
  life: number;
  /** Damage dealt to buildings; actors always die in one hit. */
  buildingDamage: number;
  /** Non-zero for bazooka rounds: explodes on impact with this radius. */
  blast: number;
}

export interface Grenade {
  pos: Vec2;
  prev: Vec2;
  from: Vec2;
  to: Vec2;
  /** 0..1 along its arc. */
  t: number;
  duration: number;
  faction: Faction;
}

export interface Crate {
  pos: Vec2;
  alive: boolean;
  /** Barrels are scenery explosives with nothing to collect. */
  barrel: boolean;
}

export interface Mine {
  pos: Vec2;
  alive: boolean;
  /** Counts down once something steps on it; -1 while dormant. */
  fuse: number;
  /**
   * Whether the mine has been *set off*, not whether it can be seen.
   *
   * Mines are drawn from the moment a mission starts. They were hidden until
   * stepped on, which made a minefield indistinguishable from open ground --
   * there was no decision to make and no skill in surviving it, only the memory
   * of where the last one killed somebody. Visible, it is a puzzle about lanes.
   */
  triggered: boolean;
}

export interface Hostage {
  id: number;
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  radius: number;
  angle: number;
  alive: boolean;
  walkPhase: number;
  /** Freed by a soldier getting close; then trails behind them. */
  freed: boolean;
  /** Reached a tent and is out of the fight. */
  delivered: boolean;
}

/** A hut or factory: solid until levelled, and a source of reinforcements. */
export interface Building {
  id: number;
  kind: 'hut' | 'factory';
  tiles: Array<[number, number]>;
  centre: Vec2;
  x0: number;
  y0: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  standing: boolean;
  /** Seconds until the next trooper emerges. */
  spawnTimer: number;
  /** How many of its troopers are currently alive. */
  spawned: number;
  /** Rises when hit, decays -- drives the damage flash. */
  flash: number;
  /** 0 intact, 1 scarred, 2 barely standing. Drives which sprite is drawn. */
  damageStage: number;
  /** Seconds since it collapsed; ruins smoke for a while, then just smoulder. */
  ruinAge: number;
}

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export enum Phase {
  Playing = 0,
  Won = 1,
  Lost = 2,
}
