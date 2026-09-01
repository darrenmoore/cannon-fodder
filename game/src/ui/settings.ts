/**
 * Player preferences, persisted.
 *
 * Everything here has a default that makes the game correct on a fresh install,
 * so nothing in the codebase may branch on "has the player visited settings" --
 * only on the values. Reads are synchronous and cheap; writes notify, because
 * the layout, the camera and the audio all have to react to one.
 *
 * `localStorage` can throw outright in private browsing, so every access is
 * wrapped: a player who cannot save settings still gets to play with them.
 */

export type Handedness = 'right' | 'left';
export type Resolution = 'full' | 'half';
export type Rules = 'classic' | 'modern';

export interface Settings {
  /** Steps away from the scale the viewport would pick, -1..+1. */
  zoomBias: number;
  sound: boolean;
  /** Menu music. Off is a real choice, so it survives a refresh like the rest. */
  music: boolean;
  /** Effects level, 0..1. Gunfire, explosions and the ambience bed. */
  volume: number;
  /** Music level, 0..1, on its own bar so a loud march never sets how loud a rifle is. */
  musicVolume: number;
  haptics: boolean;
  /** Which side of the screen the action bar lives on. */
  handedness: Handedness;
  /** `half` renders at half device resolution, for weak GPUs. */
  resolution: Resolution;
  /** Snap the device pixel ratio to an integer so sprite edges stay hard. */
  crisp: boolean;
  /** null follows `prefers-reduced-motion`. */
  reducedMotion: boolean | null;
  /** `modern` unlocks mechanics the 1993 original did not have. */
  rules: Rules;
  /**
   * Hold the arena's camera still in the middle of the map instead of letting
   * it follow the fighting.
   *
   * Persisted rather than being a flag on the screen, because it is a way of
   * *watching* -- somebody who wants the battle framed like a painting wants it
   * framed that way every time -- and because it is what the intro backdrop
   * will want as its permanent setting.
   */
  arenaLockCamera: boolean;
  /** Show the arena's two-side readout. Off makes the screen pure battlefield. */
  arenaShowScore: boolean;
}

const KEY = 'cf.settings';

const DEFAULTS: Settings = {
  zoomBias: 0,
  sound: true,
  music: true,
  volume: 0.35,
  /*
   * 0.5, up from 0.35 on the owner's ask. Note the limit of a default: anyone
   * with saved settings keeps their saved number, which is why MUSIC_LEVEL in
   * music.ts rose alongside it -- that half reaches everyone.
   */
  musicVolume: 0.5,
  haptics: true,
  handedness: 'right',
  resolution: 'full',
  crisp: false,
  reducedMotion: null,
  rules: 'classic',
  arenaLockCamera: false,
  arenaShowScore: true,
};

let current: Settings = { ...DEFAULTS };
const listeners = new Set<(s: Settings) => void>();

/** Coerces whatever was in storage, field by field, so one bad key is not fatal. */
function coerce(raw: unknown): Settings {
  const out = { ...DEFAULTS };
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.zoomBias === 'number') out.zoomBias = Math.max(-1, Math.min(1, Math.round(r.zoomBias)));
  if (typeof r.sound === 'boolean') out.sound = r.sound;
  if (typeof r.music === 'boolean') out.music = r.music;
  if (typeof r.volume === 'number') out.volume = Math.max(0, Math.min(1, r.volume));
  if (typeof r.musicVolume === 'number') out.musicVolume = Math.max(0, Math.min(1, r.musicVolume));
  if (typeof r.haptics === 'boolean') out.haptics = r.haptics;
  if (r.handedness === 'left' || r.handedness === 'right') out.handedness = r.handedness;
  if (r.resolution === 'half' || r.resolution === 'full') out.resolution = r.resolution;
  if (typeof r.crisp === 'boolean') out.crisp = r.crisp;
  if (typeof r.reducedMotion === 'boolean' || r.reducedMotion === null) {
    out.reducedMotion = r.reducedMotion as boolean | null;
  }
  if (r.rules === 'modern' || r.rules === 'classic') out.rules = r.rules;
  return out;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    current = coerce(raw ? JSON.parse(raw) : null);
  } catch {
    current = { ...DEFAULTS };
  }
  return current;
}

export const settings = (): Settings => current;

/** Applies a patch, persists it, and tells everyone who cares. */
export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private browsing: the setting still applies for this session.
  }
  for (const fn of listeners) fn(current);
  return current;
}

export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Resolved against the system preference when the player has not chosen. */
export function reducedMotion(): boolean {
  if (current.reducedMotion !== null) return current.reducedMotion;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * A short haptic tick. Silently absent on iOS, which has never shipped the
 * Vibration API -- so nothing may depend on it having happened.
 */
export function haptic(ms: number | number[]): void {
  if (!current.haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Some browsers throw on a vibrate outside a user gesture. Not worth caring.
  }
}
