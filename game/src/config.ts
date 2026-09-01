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
    /**
     * Chance that a killing hit puts an enemy down rather than out.
     *
     * Deliberately low. The original's men die in one shot and so do yours; a
     * wounded man is meant to be an event you remember, not a second health bar
     * bolted onto every trooper. At one in seven you see one every few
     * firefights, which is often enough to be a mechanic and rare enough to
     * still be a surprise.
     */
    woundChance: 0.14,
    /** Seconds between a wounded man's screams. */
    screamInterval: 2.6,
    /**
     * How far a scream carries, against `hearing`.
     *
     * Quieter than the death it replaces, and much longer-lived: a man you shot
     * and left keeps calling his friends to the spot every couple of seconds,
     * so walking away from one is a decision rather than an oversight.
     */
    woundAlarm: 0.7,
    impactAlarm: 0.7,
    /**
     * A floor, in pixels, on how far a round striking scenery carries.
     *
     * As a fraction of `hearing` alone it was **66px on Rookie** -- four tiles
     * -- so the decoy the briefs describe, and that a whole mission is now
     * built around, did nothing for most of the people who would ever try it.
     * Measured: a round into a rock stand pulled zero of eight sentries.
     *
     * The floor rather than a bigger fraction, because the *fraction* is right
     * -- a hit on scenery should always be quieter than the shot that caused
     * it, and on Elite it still is. What was wrong is that a mechanic the
     * player is invited to use was tuned out of existence at the difficulty
     * where they are most likely to be learning it. Twelve tiles: far enough to
     * pull a picket off a position, short enough that it is a decoy rather than
     * a whistle.
     */
    impactAlarmFloor: 190,
    /**
     * How much further than the investigate radius a noise is *noticed*.
     *
     * The response used to be binary -- inside the radius everybody dropped
     * what they were doing and walked to the noise, outside it nothing happened
     * at all -- which gave the player one bit of information and no warning
     * before it. A ring beyond it turns heads without moving feet: the man is
     * telling you, truthfully, that from here he can hear you and from twenty
     * paces closer he will see you.
     *
     * The glance is deliberately *predictable*. Same distance, same response,
     * every time; the idle fidget stays random, and the difference between the
     * two is what makes one of them readable as information.
     */
    noticeSpread: 2.1,
    /** How long a glance holds the head before he goes back to his post. */
    glanceHold: 1.6,
    /**
     * How far a walking squad carries, and how often it is heard.
     *
     * Short, and glance-only: a squad crossing open ground must never be able
     * to drag a garrison onto itself simply by walking, or every existing
     * mission changes. It may only turn heads -- which is the warning the brief
     * describes, and the reason moving carefully is a decision at all.
     */
    stepNoise: 150,
    stepInterval: 0.55,
    preferredRange: 70,
    patrolRadius: 46,
    patrolPause: [1.2, 3.0] as [number, number],
    /** Seconds between idle fidgets: a look around, or a step off the mark. */
    fidgetPause: [1.1, 3.4] as [number, number],
    /**
     * How far off his post an idle man will drift, before `levers.wander`.
     *
     * This was 7 -- under half a tile -- and the result was a garrison that was
     * fidgeting the whole time and read as fifteen statues. The mechanic was
     * never missing; it was smaller than the thing it was meant to be visible
     * against. A step is `fidgetRange * (0.4..1.0)`, so this is the widest of
     * them, and a man further than twice it from `home` is walked back: the
     * leash is what makes widening this safe on a map where somebody is
     * guarding something.
     */
    fidgetRange: 26,

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

  /**
   * The officer. The target of an `assassinate` mission, and nothing else.
   *
   * Deliberately not the hardest man on the map -- he is the *objective*, so
   * the difficulty is getting to him, not out-shooting him once you have. He
   * holds his post like a sniper and reaches about as far as a rifleman, which
   * makes reaching him a problem of the garrison around him rather than of him.
   */
  officer: {
    speed: 38,
    fireRange: 96,
    fireInterval: 1.5,
    spread: 0.05,
    aggroRadius: 140,
    reactionTime: 0.6,
    preferredRange: 80,
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

  /**
   * The objective item of a `collect` mission.
   *
   * A wider pickup reach than an ammo crate on purpose: missing a grenade
   * crate costs you grenades, and walking past the thing the mission is about
   * because you clipped it by two pixels is the game wasting your time.
   */
  supply: {
    radius: 8,
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
    /**
     * Below this share of a building's health, a hit is a scratch.
     *
     * A scratch keeps the damage it does -- sixty rifle rounds still level a
     * hut -- but says so differently: chips off the wall instead of the white
     * flash a real hit gets. The number matters less than the split existing;
     * at a tenth, a rifle (1 of 60) is always a scratch and a grenade (45 of
     * 60) never is, which is exactly the line the player needs drawn.
     */
    scratchFraction: 0.1,
    /** Blast damage falls off from the centre of the explosion. */
    blastDamage: 45,
    /** Seconds between troopers emerging from an intact enemy building. */
    spawnInterval: 7.5,
    /** A building stops reinforcing once this many of its troopers are alive. */
    maxSpawned: 3,
    /** It only reinforces when the squad is this close. */
    spawnAggroRange: 260,
  },

  /**
   * Pressure against standing in one place and shooting everything that comes.
   *
   * A hidden counter, and deliberately hidden: the player is meant to notice
   * that they are being *found*, not to watch a meter fill. It only moves on a
   * kill made from a spot the squad has not left, which is the exact behaviour
   * being discouraged -- a fighting retreat raises nothing, and neither does
   * standing still doing nothing.
   *
   * It applies at every difficulty on purpose. A per-tier lever would let
   * Rookie opt out, and Rookie is the tier where a player is most likely to
   * discover that camping works and learn the wrong lesson from it.
   */
  camping: {
    /** How far from the anchor a kill may be made and still count as camped. */
    stillRadius: 90,
    /**
     * Below this, in pixels a second, the squad counts as standing still.
     *
     * Asked as a *speed*, and it has to be. The first version asked whether the
     * squad had crossed `stillRadius` since it last did, which sounds the same
     * and is not: a squad walking at forty pixels a second takes over two
     * seconds to cover ninety, by which time the settle timer has run out and
     * the game has decided they are camping. Measured -- a squad that marched
     * eight hundred pixels was treated as stationary for nearly all of it.
     * Speed answers "are they moving"; distance-since-last answers "have they
     * moved far enough recently", which is a different and much worse question.
     */
    movingSpeed: 14,
    /** Kills-in-place before they start coming for you. The brief's "2". */
    huntFrom: 2,
    /** And it stops there, however long you sit. */
    cap: 4,
    /** Points drained per second while the squad is on the move. */
    relief: 0.55,
    /**
     * How long they must hold a spot before kills made from it start counting.
     *
     * Without it, "did the squad move" is a question about one frame, and the
     * answer is yes on the frame they arrive -- so the count drained on arrival
     * and a fighting withdrawal read the same as a firing position. Two seconds
     * is long enough that repositioning under fire is genuinely repositioning,
     * and short enough that nobody camps by accident.
     */
    settle: 2,
    /** Share off the spawn interval at full pressure: they arrive sooner. */
    spawnBoost: 0.45,
    /** Extra hearing at full pressure, as a multiplier. They find you. */
    hearingBoost: 0.5,
  },

  wave: {
    /**
     * Quiet at the top of the mission, before wave one.
     *
     * It was 10, chosen when Last Stand also opened with eighteen men already
     * standing on it -- so nobody ever experienced it as quiet. With the
     * opening garrison gone this is the whole of a wave mission's first act,
     * and ten seconds of an empty field reads as a level that has not loaded.
     * One full interval instead: long enough to walk the wire, find the gaps
     * and pick a corner, which is what a mission called Last Stand is asking
     * you to do before it starts.
     *
     * Five waves at 22 then land at 22, 44, 66, 88 and 110 against a
     * 120-second clock. The last arrives with ten seconds to go, which is as
     * late as it can be and still be a wave rather than a formality.
     */
    lead: 22,
    /** Gap between waves when a map names a count but not an interval. */
    interval: 22,
    /**
     * How many men are in the first wave, and how much bigger each one after
     * it is.
     *
     * Every wave used to be the same size -- `maxSpawned` scaled by how many
     * huts were still standing -- so the mission peaked at wave one and then
     * decayed, and the reported experience was sitting in one place shooting
     * them as they arrived. A ramp is the whole shape of a wave mission: the
     * first is a warning, the last is the reason the mission has a name.
     *
     * `first` is a floor, not a target: difficulty still multiplies through
     * `maxSpawned`, so Elite's fifth wave is a different event from Rookie's.
     */
    first: 5,
    /** Each wave is this much larger than the one before it. */
    growth: 0.45,
    /**
     * The `maxSpawned` that means "the sizes as written", and the range the
     * difficulty may move them over.
     *
     * `maxSpawned` is a *concurrency cap* for the proximity trickle -- 2 on
     * Rookie, 6 on Elite, times 1.5 for swarm doctrine -- so multiplying wave
     * sizes by it directly turns a first wave of five into forty-five and the
     * mission into a slideshow. Divided by the middle of its range it becomes
     * what is wanted here: a modest scale either side of the written number.
     * Clamped, because a doctrine multiplier on top of an Elite lever is how a
     * reasonable formula produces an unreasonable mission.
     */
    sizeFrom: 3,
    sizeRange: [0.6, 2.2] as [number, number],
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

  banner: {
    /**
     * The end-of-phase banner, drawn over the battlefield rather than over a
     * panel -- which is how the original does it
     * (`docs/original-images/elements/phase-complete.jpg`), and most of why it
     * feels like the game finishing rather than a dialog opening.
     */
    /** Seconds the lettering takes to fly up and settle. */
    rise: 0.55,
    /** Seconds before the results panel is allowed over the top of it. */
    hold: 1.9,
    /**
     * Seconds the battlefield takes to go black at the end of the hold.
     *
     * Every transition in the original passes through black, and this is the
     * first one here that does. It is also the one place the no-alpha rule is
     * deliberately spent: a full-screen fade to black is a thing the reference
     * itself does, and dithering it would read as a mistake rather than as a
     * transition.
     */
    fade: 0.4,
    /**
     * Fraction of the canvas width the widest line is scaled to fill.
     *
     * Bracketed by two critics who never saw each other's frames. At 0.74 the
     * first called it "a wall of text that swallows the entire playfield ...
     * burying the troops"; at 0.5 the second called it too small -- "large
     * empty green margins left and right ... it does not command the screen the
     * way the original does". Both are describing the same answer from
     * opposite sides -- but a third, shown 0.5 against 0.6, picked 0.5 and said
     * it was "not a close call". Two verdicts to one, so 0.5 stands and the
     * bracket is closed.
     */
    fill: 0.5,
  },

  swim: {
    /**
     * What a tile of deep water costs the route planner, in tiles of dry land.
     *
     * The whole point of letting everyone swim is that a bridge stops being the
     * only way over and becomes the *fast* way over. That only holds if the
     * search would rather walk a little further than get in: at four, a bridge
     * within about a dozen tiles still wins, and a river you would otherwise
     * have to go right round does not.
     */
    cost: 4,
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

  audio: {
    enabled: true,
    /**
     * The continuous mission bed -- river, wind, insects, birds. Every level
     * here is pre-master: the whole bed still obeys the Effects toggle and the
     * Loudness setting, because its bus hangs off the sfx master.
     */
    ambience: {
      /** Whole-bed trim. The bed is scenery; it must never fight a rifle. */
      level: 0.5,
      /** Per-layer levels, before the terrain curves scale them. */
      water: 0.28,
      wind: 0.4,
      rustle: 0.3,
      insects: 0.14,
      birds: 0.5,
      /** Tiles of `wetSdf` over which the river fades in (the sdf clamps at 6). */
      waterRange: 6,
      /** Tiles of `foliageSdf` over which birds, insects and rustle fade in. */
      foliageRange: 5,
      /** setTargetAtTime tau for the terrain-proximity gains, seconds. */
      ramp: 0.3,
      /** Control-update cadence, seconds. The maths is cheap; the ear is slow. */
      tick: 0.1,
      /** Seconds between bird calls at full foliage / at the treeline's edge. */
      birdMinGap: 2.5,
      birdMaxGap: 9,
      /** Seconds the birds stay silent after a shot or an explosion. */
      scareTime: 8,
      /** Tau for the birds fading back in once the field goes quiet. */
      birdRecover: 2.5,
    },
  },
} as const;

export type Config = typeof CONFIG;
