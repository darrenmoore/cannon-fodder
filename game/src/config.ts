/**
 * Every tunable in the game lives here. World units are pixels at 1x zoom,
 * where one map tile is TILE px. Tweak, save, the dev server rebuilds.
 */
export const CONFIG = {
  /** Map tile edge in world pixels. Must match the `tile:` header in the .map file. */
  TILE: 16,

  /** Simulation runs at a fixed step; rendering interpolates between steps. */
  STEP_HZ: 60,
  /** Never simulate more than this many steps in one frame (tab-switch guard). */
  MAX_STEPS_PER_FRAME: 5,

  camera: {
    /** Integer scale factor. 3 => a 10px soldier draws 30px on screen. */
    zoom: 3,
    /** Higher = snappier follow. Units: 1/sec. */
    follow: 4.5,
    /** Squad centroid can drift this far from centre before the camera chases. */
    deadzone: 26,
    /** Mouse within this many screen px of an edge scrolls the view. */
    edgeMargin: 48,
    edgeSpeed: 420,
  },

  soldier: {
    radius: 3.4,
    speed: 74,
    /** How hard neighbours push each other apart, relative to move speed. */
    separation: 1.5,
    separationRadius: 11,
    /** Steering responsiveness. Higher = less momentum, more arcade. */
    accel: 900,
    /** Acceleration multiplier on ice -- low means long, sliding turns. */
    iceAccel: 0.16,
    /** Ordered fire. Deliberately short: a firefight should be close work. */
    fireRange: 80,
    fireInterval: 0.34,
    /** Random aim error in radians, +/-. */
    spread: 0.055,
    /** Stop closing on a target once this deep inside fireRange. */
    engageBuffer: 10,
    /** Idle soldiers return fire at anything they can see within fireRange. */
    autoEngage: true,
    /**
     * Unordered return fire reaches less far than an ordered attack, so walking
     * past a sentry does not silently clear the map for you.
     */
    autoEngageRange: 0.68,
  },

  enemy: {
    radius: 3.4,
    speed: 52,
    separation: 1.5,
    separationRadius: 11,
    accel: 700,
    iceAccel: 0.16,
    fireRange: 88,
    fireInterval: 0.72,
    /** Deliberately worse than the player's. */
    spread: 0.16,
    aggroRadius: 132,
    /** Beat before a startled enemy opens fire. */
    reactionTime: 0.42,
    /** Once alerted, keeps hunting for this long after losing sight. */
    alertMemory: 5,
    preferredRange: 70,
    patrolRadius: 46,
    patrolPause: [1.2, 3.0] as [number, number],

    /** Rushers close to this instead of preferredRange. */
    rushRange: 26,
    /** Seconds an investigating enemy sweeps the area before giving up. */
    searchTime: 2.6,
    /** How long the squad's last known position stays worth chasing. */
    trailMemory: 6,

    /** Enemy grenades: range band, cluster threshold and reload. */
    grenadeRange: 118,
    grenadeMinRange: 34,
    grenadeMinCluster: 2,
    grenadeCooldown: 4.5,
    /** How many a grenadier carries. */
    grenadeCount: 2,
  },

  /** Holds position at long range and hits hard. Flush them out with grenades. */
  sniper: {
    speed: 34,
    fireRange: 190,
    fireInterval: 1.9,
    spread: 0.02,
    aggroRadius: 210,
    reactionTime: 0.85,
    preferredRange: 165,
  },

  /** Fires slow explosive rounds. The original called them your worst enemy. */
  bazooka: {
    speed: 44,
    fireRange: 128,
    fireInterval: 2.4,
    spread: 0.07,
    aggroRadius: 150,
    reactionTime: 0.7,
    preferredRange: 105,
    /** Rocket flight speed and the blast it leaves. */
    rocketSpeed: 132,
    blastRadius: 26,
  },

  bullet: {
    speed: 430,
    life: 1.1,
    radius: 1.2,
    /** Muzzle offset so rounds do not spawn inside the shooter. */
    muzzle: 4.5,
  },

  grenade: {
    flightTime: 0.62,
    blastRadius: 34,
    startingCount: 2,
    perCrate: 3,
    throwRange: 150,
    cooldown: 0.7,
  },

  crate: {
    radius: 5,
    /** A crate detonates when shot -- chain-kill the enemies standing around it. */
    blastRadius: 40,
  },

  /** Scenery explosives: no pickup, pure hazard and opportunity. */
  barrel: {
    radius: 5,
    blastRadius: 46,
  },

  mine: {
    radius: 6,
    /** Triggered by anyone, including the enemy. */
    triggerRadius: 7,
    blastRadius: 30,
    /** Seconds between contact and detonation -- just long enough to react. */
    fuse: 0.35,
  },

  building: {
    /** Seconds a ruin keeps smoking after it comes down. */
    smokeDuration: 22,
    /** Rifle rounds barely scratch a hut; explosives level it. */
    hutHp: 60,
    factoryHp: 140,
    bulletDamage: 1,
    /** Blast damage falls off from the centre of the explosion. */
    blastDamage: 45,
    /** Seconds between troopers emerging from an intact enemy building. */
    spawnInterval: 7.5,
    /** A building stops reinforcing once this many of its troopers are alive. */
    maxSpawned: 3,
    /** It only reinforces when the squad is this close. */
    spawnAggroRange: 260,
  },

  hostage: {
    radius: 3.2,
    speed: 66,
    /** A soldier this close frees the hostage, who then follows. */
    freeRadius: 14,
    /** How far behind its escort a following hostage trails. */
    followDistance: 16,
    /** Delivered once this close to a tent. */
    deliverRadius: 18,
  },

  extraction: {
    /** Soldiers inside this radius of a zone count as extracted. */
    radius: 22,
  },

  fx: {
    bloodParticles: 14,
    explosionParticles: 26,
    /** Blood and corpses are burnt into a persistent decal layer. */
    decals: true,
    screenShake: 5,
    /** Seconds a "+3 GRENADES" label stays up after a pickup. */
    popupLife: 1.6,
    /** How far it drifts upward over that life, in world pixels. */
    popupRise: 15,
  },

  /** Foliage sway. Amplitude is in world pixels at the top of the sprite. */
  wind: {
    speed: 1.15,
    amplitude: 1.35,
    /** Secondary gust that drifts across the map, so sway is not uniform. */
    gustSpeed: 0.27,
    gustScale: 0.006,
  },

  fog: {
    /** How dark the never-seen parts of the map are. */
    unexplored: 0.94,
    /** How dark the remembered-but-unwatched parts are. */
    remembered: 0.55,
  },

  /** Seconds the MISSION FAILED banner holds before the auto-restart. */
  restartDelay: 2.4,

  audio: { enabled: true, volume: 0.35 },
} as const;

export type Config = typeof CONFIG;
