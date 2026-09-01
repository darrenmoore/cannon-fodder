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
  /**
   * Can cross deep water. Everybody can -- it is a capability rather than a
   * setting, and it is here rather than assumed so that the movement code never
   * has to ask what *kind* of thing it is moving. Hostages are not Actors and
   * are the reason that matters: they keep walking round the river.
   */
  canSwim: boolean;
  /** In deep water right now: slower still, and no shadow to cast. */
  swimming: boolean;
  /**
   * Hit and down, but not dead. Cannot move, cannot shoot, and screams -- so he
   * is a noise source rather than a threat, and he still counts against the
   * objective until somebody finishes him.
   *
   * Lives on `Actor` rather than on `Enemy` so the movement and draw paths can
   * ask one question, but only enemies are ever set: the squad's one-hit rule is
   * the game's central bargain and is enforced in `damage`.
   */
  wounded: boolean;
  /** Counts down to his next scream. */
  screamTimer: number;
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
   * Rising while he is trying to reach his slot and getting nowhere.
   *
   * A ring of arrival slots is drawn without knowing what is standing in it, so
   * ordering a squad into a treeline hands two or three men a slot inside a
   * trunk. They would shove at it forever. Past a threshold he is given a
   * different one -- see `reslot`.
   */
  slotStuck: number;
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

/**
 * Where a man is looking because he heard something, and for how long.
 *
 * Not a state: he is still idle, still at his post, still doing whatever he was
 * doing the moment before. It is the head only, which is the whole point --
 * a state change would move him, and moving is what the player is being warned
 * about rather than subjected to.
 */
export interface Glance {
  at: Vec2;
  time: number;
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
  /** Dressed for the ground: dark jungle greens instead of the blue uniform. */
  camo: boolean;
}

/** Rifleman, sniper or bazookateer -- see CONFIG for the per-kind stats. */
export enum EnemyKind {
  Rifle = 0,
  Sniper = 1,
  Bazooka = 2,
  /** The target of an `assassinate` mission. Holds his post like a sniper. */
  Officer = 3,
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
  /**
   * The ordered chain of patrol nodes this enemy marches, end to end and back,
   * when his node chained into one. Null (or a lone node) keeps the old random
   * beat around `home`. Routes are what make a patrol *learnable*: the player
   * can time a fixed march, never a random shuffle.
   */
  route: Vec2[] | null;
  routeIndex: number;
  routeDir: 1 | -1;
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
  /** Heard something too far off to be worth walking to. Head only. */
  glance: Glance | null;
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

/**
 * A supply box: the objective of a `collect` mission.
 *
 * Deliberately not a `Crate`. An ammo crate is a reward that also happens to
 * be a bomb, and detonating one is a tactic; this is the thing the mission is
 * about, so it does not explode, does not give grenades, and losing one to a
 * stray round ends the mission. Two objects that look similar and behave
 * oppositely need to be two types, or somebody will pass one to the other.
 */
export interface Supply {
  pos: Vec2;
  /** Destroyed by a blast. The mission cannot be completed after this. */
  alive: boolean;
  /** Walked over by a soldier. Collected on touch -- there is no carrying. */
  collected: boolean;
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
  kind: 'hut' | 'factory' | 'outpost' | 'bunker';
  /**
   * What this building is *for*, which is a mission mechanic rather than a
   * shape.
   *
   * Every building used to reinforce, which is why Last Stand asked the player
   * to defend an outpost that was producing the men attacking him. A `spawner`
   * feeds the garrison; a `protect` building is the player's, and losing it
   * loses the mission; `neutral` is scenery with hit points.
   */
  role: 'spawner' | 'protect' | 'neutral';
  /** Takes fire, shows it, and never falls. See `createWorld`. */
  indestructible: boolean;
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
  /**
   * Rises and spreads instead of settling: smoke, not debris.
   *
   * This used to be inferred from `maxLife > 2`, which was an undeclared rule
   * that happened to be true because smoke was the only long-lived particle in
   * the game. The first one that was not -- a shell casing meant to lie where
   * it lands for a couple of seconds -- floated up the screen like a plume
   * (201-qa 012). Say it rather than imply it.
   */
  rise?: boolean;
}

export enum Phase {
  Playing = 0,
  Won = 1,
  Lost = 2,
}
