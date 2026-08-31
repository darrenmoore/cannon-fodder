import { isDifficultyId } from './difficulty.js';
import type { DifficultyId } from './difficulty.js';

/**
 * The meta-game: who is on the roster, who is buried, and what you have done.
 *
 * The simulation had no memory. A mission was a sealed box — you played it,
 * names died, and the next mission handed the same names back. `design.md` was
 * blunt about it: "losing one still costs nothing, which is the largest
 * remaining gap from the original."
 *
 * This module is that memory, and nothing else in the game is allowed to have
 * any. Every persistent fact lives in one record under one key, so the whole
 * meta-game can be reasoned about — and wiped — in one place.
 *
 * The rules it enforces are worth stating up front, because they are what make
 * the roster feel like people rather than inventory:
 *
 *   - **Only a win is written.** Losing costs you the mission and nothing else.
 *     Anticipating a loss is what makes you careful; actually confiscating an
 *     hour of promotions is what makes people stop playing. The dread does the
 *     work, so the punishment does not have to.
 *   - **A name is never reissued.** Once JOOLS is on the hill, no future recruit
 *     is called JOOLS. This is the single most important line in the file. A
 *     reissued name is what turned the original's casualties back into counters,
 *     and it is exactly what this codebase was doing.
 *   - **Rank is only ever earned by surviving.** There is no other source.
 */

const KEY = 'cf.campaign';
const VERSION = 1;

/**
 * The recruitment pool, in order. The first twelve are the original's names in
 * the original's order — Jools and Jops lead every squad and the recruits behind
 * them are the ones the game expects you to spend. Past that the war goes on
 * longer than Sensible planned for, so the queue keeps filling.
 */
export const RECRUITS = [
  'JOOLS', 'JOPS', 'STOO', 'RJ', 'GARY', 'ANDY',
  'BUZZ', 'TEDDY', 'HAWK', 'MAC', 'FRANK', 'WILL',
  'CHRIS', 'DAVE', 'ROB', 'JIM', 'KEV', 'PAUL',
  'NOBBY', 'TAFF', 'GEORDIE', 'SCOUSE', 'SMUDGE', 'DUSTY',
  'BROCK', 'HAGGIS', 'PIKE', 'WALKER', 'JONES', 'FRAZER',
  'BILKO', 'DOYLE', 'HUDSON', 'VASQUEZ', 'DRAKE', 'APONE',
];

/**
 * The ladder. `at` is the number of missions survived that earns the tier, so a
 * trooper's rank is derived from one integer and can never drift out of step
 * with it. The gaps widen deliberately: the early promotions come fast enough
 * to be noticed, and General is a thing almost nobody will see.
 */
export const RANKS = [
  { at: 0, name: 'Private', short: 'PVT' },
  { at: 1, name: 'Lance Corporal', short: 'LCP' },
  { at: 2, name: 'Corporal', short: 'CPL' },
  { at: 4, name: 'Sergeant', short: 'SGT' },
  { at: 6, name: 'Staff Sergeant', short: 'SSG' },
  { at: 9, name: 'Lieutenant', short: 'LT' },
  { at: 12, name: 'Captain', short: 'CPT' },
  { at: 16, name: 'Major', short: 'MAJ' },
  { at: 20, name: 'Colonel', short: 'COL' },
  { at: 25, name: 'General', short: 'GEN' },
];

/** The tier index for a number of missions survived. */
export function rankTier(missions: number): number {
  let tier = 0;
  for (let i = 0; i < RANKS.length; i++) if (missions >= RANKS[i].at) tier = i;
  return tier;
}

export const rankName = (missions: number): string => RANKS[rankTier(missions)].name;
export const rankShort = (missions: number): string => RANKS[rankTier(missions)].short;

/** Missions still to survive before the next promotion, or null at the top. */
export function nextPromotionIn(missions: number): number | null {
  const tier = rankTier(missions);
  if (tier >= RANKS.length - 1) return null;
  return RANKS[tier + 1].at - missions;
}

/** A living member of the roster. */
export interface Trooper {
  name: string;
  /** Missions survived. The only input to rank, and it only ever goes up. */
  missions: number;
  /** True if the player spent their one rename on this soldier. */
  own?: boolean;
}

/** A name on the hill. Written once and never edited. */
export interface Grave {
  name: string;
  /** Missions survived before the one that killed them. */
  missions: number;
  /** The mission's display name, which is what you actually remember. */
  mission: string;
  difficulty: DifficultyId;
  own?: boolean;
}

/** What you have managed on one mission, across every attempt at it. */
export interface MissionRecord {
  /** Most brought home. The number the sidebar dangles in front of you. */
  bestHome: number;
  /** Fastest clear, in seconds. */
  bestTime: number;
  /** Every difficulty it has been cleared on. Order follows DIFFICULTY_ORDER. */
  clears: DifficultyId[];
}

export interface CampaignState {
  v: number;
  squad: Trooper[];
  fallen: Grave[];
  records: Record<string, MissionRecord>;
  /**
   * How far down `RECRUITS` the war has eaten. Never rewound, which is what
   * guarantees a dead man's name is never handed to a replacement.
   */
  issued: number;
  /** The one rename, spent. */
  renameUsed: boolean;
}

const empty = (): CampaignState => ({
  v: VERSION, squad: [], fallen: [], records: {}, issued: 0, renameUsed: false,
});

/** The shape of one deployed soldier, as `createWorld` wants it. */
export interface Deployment {
  name: string;
  missions: number;
  own: boolean;
  /** True the first time this soldier is sent anywhere. Flagged in the briefing. */
  fresh: boolean;
}

/** What one resolved mission did to the roster. Drives the end-of-mission panel. */
export interface Aftermath {
  won: boolean;
  survivors: Array<{ name: string; missions: number; promoted: boolean; own: boolean }>;
  buried: Grave[];
  /** Set when this attempt beat a standing record, or set the first one. */
  recordHome: boolean;
  recordTime: boolean;
  /** Set when this clear was the first on this difficulty. */
  newClear: boolean;
  time: number;
}

/**
 * Reads the saved campaign, repairing anything that does not look right rather
 * than throwing. A corrupt save should cost you your progress, not the game —
 * and the only thing worse than losing a roster is a blank screen where it was.
 */
/**
 * What a difficulty written by an older build means now.
 *
 * `Regular` was dropped between four rungs and three, and saves in the wild
 * carry it -- in `clears`, which the star rating reads, and on every grave. It
 * becomes **Rookie**, on the reasoning that removed it: the complaint was that
 * the two were too similar to tell apart, so the lower of them is the honest
 * reading of a clear that might have been either.
 *
 * This is a coercion inside the existing load path and *not* a version bump on
 * purpose. `loadCampaign` answers a version mismatch by returning `empty()` --
 * so bumping to migrate would throw away every player's squad, their records
 * and their Boot Hill, which is a considerably worse outcome than a star being
 * one rung generous.
 */
const RETIRED: Record<string, DifficultyId> = { regular: 'rookie' };

const asDifficulty = (v: unknown): DifficultyId | null => {
  if (typeof v !== 'string') return null;
  if (isDifficultyId(v)) return v;
  return RETIRED[v] ?? null;
};

export function loadCampaign(): CampaignState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Private browsing. An in-memory campaign for this session is still better
    // than none, so carry on with a blank one.
    return empty();
  }
  if (!raw) return empty();

  try {
    const data = JSON.parse(raw) as Partial<CampaignState>;
    if (!data || data.v !== VERSION) return empty();

    const squad = Array.isArray(data.squad)
      ? data.squad
        .filter((t): t is Trooper => !!t && typeof t.name === 'string')
        .map((t) => ({ name: t.name, missions: Math.max(0, Math.floor(t.missions) || 0), own: !!t.own }))
      : [];

    const fallen = Array.isArray(data.fallen)
      ? data.fallen
        .filter((g): g is Grave => !!g && typeof g.name === 'string')
        .map((g) => ({
          name: g.name,
          missions: Math.max(0, Math.floor(g.missions) || 0),
          mission: typeof g.mission === 'string' ? g.mission : 'unknown',
          difficulty: asDifficulty(g.difficulty) ?? 'rookie',
          own: !!g.own,
        }))
      : [];

    const records: Record<string, MissionRecord> = {};
    for (const [id, r] of Object.entries(data.records ?? {})) {
      if (!r) continue;
      records[id] = {
        bestHome: Math.max(0, Math.floor(r.bestHome) || 0),
        bestTime: Number.isFinite(r.bestTime) && r.bestTime > 0 ? r.bestTime : Infinity,
        // Mapped, then de-duplicated: a save holding both `regular` and
        // `rookie` must not end up with rookie twice and claim two stars.
        clears: Array.isArray(r.clears)
          ? [...new Set(r.clears.map(asDifficulty).filter((d): d is DifficultyId => d !== null))]
          : [],
      };
    }

    return {
      v: VERSION,
      squad,
      fallen,
      records,
      // Never trust a stored `issued` lower than the names already spent, or a
      // reload could start handing out the names of the dead.
      issued: Math.max(Math.floor(data.issued ?? 0) || 0, squad.length + fallen.length),
      renameUsed: !!data.renameUsed,
    };
  } catch {
    return empty();
  }
}

export function saveCampaign(state: CampaignState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota or private browsing. The session keeps its state in memory either
    // way; there is nothing useful to tell the player mid-mission.
  }
}

/**
 * A name no living or dead soldier has ever had.
 *
 * Walks the pool first, then falls back to a numbered recruit. Running out is a
 * good problem — it means the campaign outlived thirty-six names.
 */
function nextName(state: CampaignState): string {
  const taken = new Set([...state.squad.map((t) => t.name), ...state.fallen.map((g) => g.name)]);
  while (state.issued < RECRUITS.length) {
    const name = RECRUITS[state.issued++];
    if (!taken.has(name)) return name;
  }
  let n = state.issued++ - RECRUITS.length + 1;
  while (taken.has(`RECRUIT ${n}`)) n++;
  return `RECRUIT ${n}`;
}

/**
 * Tops the roster up to `size` and returns who is going in.
 *
 * Called on the way into every mission, including a restart, so the squad you
 * deploy is always the squad you currently have. Mutates and saves, because an
 * enlistment is a real event: a recruit named here keeps that name even if the
 * player walks away before the mission starts.
 */
export function deploy(state: CampaignState, size: number): Deployment[] {
  const fresh = new Set<string>();
  while (state.squad.length < size) {
    const name = nextName(state);
    fresh.add(name);
    state.squad.push({ name, missions: 0 });
  }
  // Veterans lead. The list is the order they are drawn in the sidebar and the
  // order they take spawn points, so the men who have been here longest stand
  // at the front — which is exactly where you do not want them.
  state.squad.sort((a, b) => b.missions - a.missions);
  saveCampaign(state);

  return state.squad.slice(0, size).map((t) => ({
    name: t.name,
    missions: t.missions,
    own: !!t.own,
    fresh: fresh.has(t.name),
  }));
}

/**
 * Commits one finished mission.
 *
 * Losses are deliberately not written. See the header: the fear of the hill is
 * doing the work, and confiscating an evening's promotions on top of it is how
 * you turn a tense game into an abandoned one. A loss still returns an
 * `Aftermath` so the end panel can talk about it — it simply changes nothing.
 */
export function recordMission(
  state: CampaignState,
  outcome: {
    won: boolean;
    missionId: string;
    missionName: string;
    difficulty: DifficultyId;
    time: number;
    /** Names as deployed, so the roster is matched by name not by index. */
    survived: string[];
    died: string[];
  },
): Aftermath {
  const { won, missionId, missionName, difficulty, time } = outcome;
  const byName = new Map(state.squad.map((t) => [t.name, t]));

  const survivors = outcome.survived.map((name) => {
    const t = byName.get(name);
    const before = t?.missions ?? 0;
    return {
      name,
      missions: won ? before + 1 : before,
      promoted: won && rankTier(before + 1) > rankTier(before),
      own: !!t?.own,
    };
  });

  const buried: Grave[] = outcome.died.map((name) => {
    const t = byName.get(name);
    return {
      name,
      missions: t?.missions ?? 0,
      mission: missionName,
      difficulty,
      own: !!t?.own,
    };
  });

  if (!won) {
    return { won, survivors, buried, recordHome: false, recordTime: false, newClear: false, time };
  }

  // Promote the living and bury the dead in one pass, so a name cannot end up
  // on the roster and the hill at the same time.
  const gained = new Map(survivors.map((s) => [s.name, s.missions]));
  const died = new Set(outcome.died);
  state.squad = state.squad
    .filter((t) => !died.has(t.name))
    .map((t) => (gained.has(t.name) ? { ...t, missions: gained.get(t.name)! } : t));
  state.fallen.push(...buried);

  const prev = state.records[missionId];
  const home = outcome.survived.length;
  const record: MissionRecord = prev ?? { bestHome: 0, bestTime: Infinity, clears: [] };
  const recordHome = !prev || home > record.bestHome;
  const recordTime = !prev || time < record.bestTime;
  const newClear = !record.clears.includes(difficulty);

  record.bestHome = Math.max(record.bestHome, home);
  record.bestTime = Math.min(record.bestTime, time);
  if (newClear) record.clears.push(difficulty);
  state.records[missionId] = record;

  saveCampaign(state);
  return { won, survivors, buried, recordHome, recordTime, newClear, time };
}

/**
 * Spends the one rename. Returns false if it was already spent or the name is
 * unusable, so the caller never has to guess whether it took.
 *
 * One, not six. If you can rename everyone it is a settings screen; if you can
 * rename one person it is a decision, and a decision is a thing you remember
 * making when that name later turns up on the hill.
 */
export function renameTrooper(state: CampaignState, current: string, wanted: string): boolean {
  if (state.renameUsed) return false;
  const name = sanitiseName(wanted);
  if (!name) return false;

  const taken = new Set([...state.squad.map((t) => t.name), ...state.fallen.map((g) => g.name)]);
  taken.delete(current);
  if (taken.has(name)) return false;

  const trooper = state.squad.find((t) => t.name === current);
  if (!trooper) return false;

  trooper.name = name;
  trooper.own = true;
  state.renameUsed = true;
  saveCampaign(state);
  return true;
}

/**
 * The roster is drawn in a fixed-width column and read back aloud in the
 * casualty roll, so a name has to fit both. Uppercase because every other name
 * in the game is, and a lowercase one would read as a different kind of thing.
 */
export function sanitiseName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 '-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 9);
}

/** Wipes everything. Behind a confirmation in the UI; there is no undo. */
export function resetCampaign(): CampaignState {
  const fresh = empty();
  saveCampaign(fresh);
  return fresh;
}

/** `2:41`. Used on the mission cards and the sidebar's par line. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--';
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
