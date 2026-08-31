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
    /**
     * Zoom is derived from the viewport rather than fixed, by `layout.ts`.
     *
     * A constant scale factor applied to *device* pixels meant a retina laptop
     * showed half as much world as a non-retina one -- the field of view was
     * already inconsistent between two desktops before any phone turned up. So
     * what is pinned here is the field of view the simulation is tuned around,
     * and the scale factor falls out of it: a sniper reaches 190 world pixels,
     * so a viewport much shorter than that means being shot from off-screen.
     */
    zoom: {
      /** The Amiga's own field of view, which is what the missions are built for. */
      targetWorldW: 320,
      targetWorldH: 200,
      /**
       * The point at which the view stops being playable and starts being a
       * letterbox, and the floor the auto-pick is never allowed to cross.
       *
       * Deliberately well below `targetWorldW/H`. Those describe the framing
       * the missions were built for; this describes the framing below which
       * the game stops working, and testing against the former made a cliff --
       * a desktop window a few pixels short of the ideal dropped the whole way
       * to zoom 2 and halved every sprite on screen.
       */
      minWorldW: 240,
      minWorldH: 150,
      /**
       * What the auto-pick actually aims at, in world pixels.
       *
       * Between the two framings this has been through. A 1920x1080 desktop
       * running at scale 3 shows 577x360 world pixels, which is what the game
       * always did and reads as distant -- a soldier is ten pixels tall and
       * there are thirty-six tiles across. Scale 5 shows 346x216, which is too
       * close to read a firefight. 430x270 is scale 4 there, and scale 3 on a
       * laptop, which is where both sizes want to be.
       */
      idealWorldW: 430,
      idealWorldH: 270,
      /**
       * The auto-pick stays inside this. Anything closer than 4 is the
       * player's own decision, never one made for them: a scale nobody asked
       * for that crops the battlefield is worse than one that is merely
       * further away than they would have chosen.
       */
      autoMax: 4,
      /** Below 2 a soldier stops being legible; above 6 a 4K desktop gains nothing. */
      min: 2,
      max: 6,
      /** Used until the layout has measured anything. */
      start: 3,
    },
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
    separation: 1.6,
    separationRadius: 15,
    /**
     * Radius step between rings of arrival slots, in world pixels.
     *
     * This is a *look* as much as a rule. Two soldiers touch at twice their
     * radius -- under seven pixels -- and a ring step much beyond that still
     * lands them shoulder to shoulder once the herd has settled, which reads as
     * a huddle rather than a squad. A soldier sprite is thirteen pixels wide,
     * so anything under about sixteen has them overlapping on screen.
     */
    formationSpacing: 18,
    /**
     * How far a slot is nudged off the ring, in world pixels.
     *
     * Enough that six men never land in a shape you could measure with a
     * compass; not so much that the formation stops reading as one.
     */
    formationJitter: 5,
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

  /**
   * What surviving buys you.
   *
   * These are multipliers applied to the soldier's own numbers, interpolated
   * from 1 at Private to the value here at General. They are small on purpose:
   * big enough that a veteran demonstrably shoots straighter, small enough that
   * losing one is a loss and not a defeat.
   *
   * The point of the edge being *real* rather than cosmetic is the decision it
   * creates. A rank that only changed a label would make the sidebar prettier;
   * a rank that changes the odds makes "who do I send across the open ground"
   * an actual question, with a veteran's better chances on one side and a
   * veteran's worse loss on the other.
   */
  veteran: {
    /** Aim error at the top of the ladder, relative to a recruit's. */
    spread: 0.55,
    /** Time between shots at the top of the ladder. */
    fireInterval: 0.84,
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
    /**
     * How far a death and a round striking scenery carry, as fractions of
     * `hearing`.
     *
     * Both are quieter than the shot that caused them, which is what makes them
     * useful rather than noisy: a man dropping is a thud, and a round hitting a
     * hut is a distant crack that pulls a sentry the *wrong way*. That second
     * one is the decoy -- shoot a tree over there, and they go over there.
     */
    deathAlarm: 0.55,
    impactAlarm: 0.7,
    preferredRange: 70,
    patrolRadius: 46,
    patrolPause: [1.2, 3.0] as [number, number],
    /** Seconds between idle fidgets: a look around, or a step off the mark. */
    fidgetPause: [1.1, 3.4] as [number, number],

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

  /**
   * What an explosion does to a man, at any range, from any source.
   *
   * Every blast in the game -- grenade, barrel, crate, mine, rocket, a building
   * coming down -- has a radius of its own, and these turn that one number into
   * two rings. Inside `lethal` (a fraction of the radius) you die. Beyond it,
   * out to the full radius, you are thrown clear and land badly.
   *
   * This is why a grenade into a bunched squad kills one man and scatters the
   * rest instead of erasing all six. It cuts both ways deliberately: your own
   * grenades stopped being a delete button on the same day theirs did.
   */
  blast: {
    /** Fraction of a blast's radius that actually kills. */
    lethal: 0.42,
    /** Speed, in px/s, given to a man at the very edge of the lethal ring. */
    knockback: 190,
    /** Seconds spent off your feet, at the inner edge. Scales down with range. */
    stagger: 0.55,
    /** How fast the throw bleeds off. Higher stops him sooner. */
    drag: 6,
  },

  /**
   * The shape a bullet has to cross to hit a man.
   *
   * An actor's position is his *feet* -- it is what the steering, the collision
   * and the sort order all work in -- but his sprite is drawn upward from
   * there, so a circle around the position covered his boots and shins and
   * nothing else. You could put a round through a man's head and watch him
   * keep walking, which is the single most game-breaking thing on this list.
   *
   * So the target is a vertical capsule standing on the position: `rise` up
   * from the feet, `drop` below them, `radius` wide. It covers the drawn figure
   * and no more. Both sides use it -- enemies became easier to hit on the same
   * day your men did.
   */
  body: {
    /** Up from the feet, to the top of the helmet. */
    rise: 11,
    /** Below the feet, so a round at the ground still connects. */
    drop: 1,
    radius: 3.2,
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

  wave: {
    /** Quiet at the top of the mission, so it does not open with a rush. */
    lead: 10,
    /** Gap between waves when a map names a count but not an interval. */
    interval: 22,
    /**
     * How much of the interval difficulty is allowed to move.
     *
     * `levers.spawnInterval` runs from about 1.7 down to 0.3, and applying it
     * whole would land every Elite wave in the first third of the mission and
     * leave the rest of the clock silent. Blending it keeps the schedule
     * recognisable at every setting -- Rookie waits a little longer, Elite a
     * little less -- and lets wave *size* carry the difficulty instead.
     */
    pace: 0.4,
    /** A doorway this close to a living soldier is not used to spawn a wave. */
    hideRadius: 190,
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
    /**
     * How close to the pickup counts as being at the pickup.
     *
     * It was 22px, which is barely wider than the formation the squad arrives
     * in: six men who had plainly walked to the extraction point still had to
     * be nudged into a huddle one at a time before the mission would end. The
     * objective is reaching the pickup, not parking. A ring step is 18px and
     * the outer ring of six sits about 36px out, so this comfortably holds a
     * whole squad standing as it naturally stands.
     */
    radius: 46,
  },

  fx: {
    bloodParticles: 22,
    /** How long a man takes to fall before he becomes a decal. */
    deathTime: 0.34,
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
