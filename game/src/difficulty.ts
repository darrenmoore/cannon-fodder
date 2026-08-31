/**
 * Difficulty, expressed as levers rather than a single multiplier.
 *
 * A one-dial difficulty makes enemies predictable: they just get accurate. What
 * actually changes how a level plays is *which* levers move -- whether they hear
 * you, whether they come looking, whether they charge or hold, whether they
 * flank, whether the huts keep feeding. So difficulty sets a whole profile, and
 * each mission's `doctrine` then bends that profile in its own direction, which
 * is what stops Veteran on one map feeling like Veteran on the next.
 */

export type DifficultyId = 'rookie' | 'regular' | 'veteran' | 'elite';

export interface Levers {
  /** Enemy aim error multiplier. Below 1 is tighter grouping. */
  spread: number;
  /** Time between enemy shots. Below 1 is faster. */
  fireInterval: number;
  /** How far they notice you. */
  aggro: number;
  /** Beat between spotting you and opening fire. */
  reaction: number;
  speed: number;
  fireRange: number;

  /** Extra enemies added to the map, as a fraction of its authored count. */
  extraEnemies: number;
  /** Seconds between troopers leaving a building. */
  spawnInterval: number;
  /** How many of its troopers a building keeps in the field. */
  maxSpawned: number;

  /**
   * How far a gunshot or a sighting travels as an alert, in world pixels.
   * Zero means every enemy fights alone -- the single biggest difficulty knob.
   */
  hearing: number;
  /** Fraction that will cross the map to find you once the alarm is raised. */
  hunters: number;
  /** Fraction that charge to close range instead of holding at distance. */
  rushers: number;
  /** Fraction carrying grenades to flush you out of cover. */
  grenadiers: number;
  /** How far off-axis they approach. 0 walks straight down your sights. */
  flank: number;

  /**
   * How far the squad can see, in world pixels. Zero means the whole map is
   * visible; anything else draws fog over what no soldier can currently see.
   */
  vision: number;

  /** Grenades the squad starts with. */
  grenades: number;
}

export interface Difficulty {
  id: DifficultyId;
  name: string;
  /** One line for the menu, describing what actually changes. */
  blurb: string;
  levers: Levers;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  rookie: {
    id: 'rookie',
    name: 'Rookie',
    blurb: 'They hold their ground, shoot slowly, and never call for help.',
    levers: {
      spread: 1.4, fireInterval: 1.4, aggro: 0.8, reaction: 1.6, speed: 0.9, fireRange: 0.88,
      extraEnemies: 0, spawnInterval: 1.7, maxSpawned: 2,
      hearing: 0, hunters: 0, rushers: 0, grenadiers: 0, flank: 0,
      vision: 0,
      grenades: 4,
    },
  },
  regular: {
    id: 'regular',
    name: 'Regular',
    blurb: 'Gunfire carries. Some will come looking, and they do not walk straight at you.',
    levers: {
      spread: 1, fireInterval: 1, aggro: 1, reaction: 1, speed: 1, fireRange: 1,
      extraEnemies: 0, spawnInterval: 1, maxSpawned: 3,
      hearing: 130, hunters: 0.25, rushers: 0.1, grenadiers: 0, flank: 0.3,
      vision: 0,
      grenades: 2,
    },
  },
  veteran: {
    id: 'veteran',
    name: 'Veteran',
    blurb: 'Fog of war. They hunt you across the map, flank hard, and the huts keep feeding.',
    levers: {
      spread: 0.7, fireInterval: 0.76, aggro: 1.25, reaction: 0.68, speed: 1.12, fireRange: 1.12,
      extraEnemies: 0.25, spawnInterval: 0.66, maxSpawned: 4,
      hearing: 220, hunters: 0.55, rushers: 0.3, grenadiers: 0.12, flank: 0.55,
      vision: 215,
      grenades: 2,
    },
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    blurb: 'Thick fog. They swarm, they flank, and they throw grenades.',
    levers: {
      spread: 0.48, fireInterval: 0.58, aggro: 1.5, reaction: 0.42, speed: 1.26, fireRange: 1.22,
      extraEnemies: 0.5, spawnInterval: 0.45, maxSpawned: 6,
      hearing: 320, hunters: 0.85, rushers: 0.5, grenadiers: 0.28, flank: 0.8,
      vision: 160,
      grenades: 2,
    },
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['rookie', 'regular', 'veteran', 'elite'];

export const isDifficultyId = (v: string): v is DifficultyId =>
  (DIFFICULTY_ORDER as string[]).includes(v);

/**
 * A mission's standing orders. Applied on top of the difficulty profile, so the
 * same difficulty produces a different fight on each map -- a garrison digs in
 * and lets you come, hunters abandon their posts to find you, ambushers sit
 * quietly until you are close and then hit hard.
 */
export type DoctrineId = 'garrison' | 'patrol' | 'hunters' | 'ambush' | 'swarm';

export interface Doctrine {
  id: DoctrineId;
  name: string;
  blurb: string;
  /** Multiplied into the difficulty levers. Anything absent stays as-is. */
  mod: Partial<Levers>;
}

export const DOCTRINES: Record<DoctrineId, Doctrine> = {
  garrison: {
    id: 'garrison',
    name: 'Garrison',
    blurb: 'Dug in. They hold what they have and make you come to them.',
    mod: { hunters: 0.35, rushers: 0.4, aggro: 1.1, hearing: 0.8, flank: 0.6, vision: 1.15 },
  },
  patrol: {
    id: 'patrol',
    name: 'Patrols',
    blurb: 'Roving pickets. Contact spreads quickly once the first shot goes off.',
    mod: { hearing: 1.25, hunters: 1.1, speed: 1.06 },
  },
  hunters: {
    id: 'hunters',
    name: 'Hunters',
    blurb: 'They abandon their posts to find you. Standing still is not an option.',
    mod: { hunters: 1.8, hearing: 1.5, speed: 1.12, rushers: 1.4, aggro: 1.15 },
  },
  ambush: {
    id: 'ambush',
    name: 'Ambush',
    blurb: 'Quiet until you are close, then fast and accurate.',
    mod: { aggro: 0.62, reaction: 0.55, spread: 0.7, hearing: 0.6, rushers: 1.5, hunters: 0.5, vision: 0.8 },
  },
  swarm: {
    id: 'swarm',
    name: 'Swarm',
    blurb: 'Many, close, and careless. They will trade lives to reach you.',
    mod: {
      extraEnemies: 2, rushers: 1.8, spread: 1.35, fireInterval: 1.2,
      speed: 1.1, spawnInterval: 0.7, maxSpawned: 1.5, hunters: 1.3,
    },
  },
};

export const isDoctrineId = (v: string): v is DoctrineId => v in DOCTRINES;

/** Difficulty levers with the mission's doctrine folded in. */
export function resolveLevers(difficulty: DifficultyId, doctrine: DoctrineId): Levers {
  const base = DIFFICULTIES[difficulty].levers;
  const mod = DOCTRINES[doctrine].mod;
  const out = { ...base };
  for (const key of Object.keys(mod) as Array<keyof Levers>) {
    const factor = mod[key];
    if (factor === undefined) continue;
    out[key] = base[key] * factor;
  }
  // Fractions are probabilities; keep them meaningful.
  out.hunters = Math.min(1, out.hunters);
  out.rushers = Math.min(1, out.rushers);
  out.grenadiers = Math.min(1, out.grenadiers);
  out.flank = Math.min(1, out.flank);
  out.maxSpawned = Math.max(1, Math.round(out.maxSpawned));
  return out;
}

/** Short list of what is actually turned on, for the menu and the HUD. */
export function describeLevers(levers: Levers): string[] {
  const notes: string[] = [];
  if (levers.vision > 0) notes.push('fog of war');
  if (levers.hearing <= 0) notes.push('deaf');
  else if (levers.hearing >= 250) notes.push('hears everything');
  else notes.push('hears gunfire');
  if (levers.hunters >= 0.5) notes.push('hunts you down');
  else if (levers.hunters > 0) notes.push('investigates');
  if (levers.rushers >= 0.35) notes.push('charges');
  if (levers.grenadiers > 0) notes.push('grenades');
  if (levers.flank >= 0.5) notes.push('flanks');
  if (levers.extraEnemies >= 0.4) notes.push(`+${Math.round(levers.extraEnemies * 100)}% enemies`);
  return notes;
}
