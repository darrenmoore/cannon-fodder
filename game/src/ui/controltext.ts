/**
 * What the controls are, in words, for whichever machine this is.
 *
 * ## Why this exists at all
 *
 * The owner's friend sat down to play on a Mac and could not work out how to
 * fire. He was right not to: the mouse scheme is hold-right, and Apple
 * hardware has neither a second button nor a middle click, so until F was
 * bound (201-qa 006) there was no fire control on that machine outside the
 * on-screen plate, which is not where anyone looks. The game never told him
 * either -- there is no controls text anywhere in it.
 *
 * ## Why it is one list rather than two
 *
 * The briefing wants it and the pause sheet wants it, and a game with two
 * copies of "how do I fire" is a game where one of them is wrong within a
 * month. So both call `controlLines()` and neither knows what platform it is
 * on. When a control changes, it changes here.
 *
 * ## Detecting a Mac
 *
 * `navigator.userAgentData.platform` where it exists, `navigator.platform`
 * where it does not, and neither is load-bearing beyond the wording: get it
 * wrong and the player is told about a key that works anyway, because F is
 * bound everywhere and the mouse scheme is unchanged. That is deliberate --
 * the wording is a hint, never a gate.
 *
 * Memoised, because it cannot change while the page is open and because the
 * briefing rebuilds this list on every mission.
 */

interface UaData { platform?: string }

let mac: boolean | null = null;

/** True on Apple hardware. Memoised; safe to call as often as you like. */
export function isMac(): boolean {
  if (mac !== null) return mac;
  try {
    const ua = (navigator as Navigator & { userAgentData?: UaData }).userAgentData;
    const p = ua?.platform ?? navigator.platform ?? '';
    mac = /mac|iphone|ipad|ipod/i.test(p);
  } catch {
    // Some hardened browsers throw on navigator.platform. Assume not-a-Mac,
    // which names F as a shortcut rather than as the only way to fire -- the
    // less wrong of the two answers if we cannot tell.
    mac = false;
  }
  return mac;
}

export interface ControlLine {
  action: string;
  /** The keys or buttons, already phrased for this platform. */
  keys: string;
}

/**
 * The six that matter, in the order a player needs them.
 *
 * Six, not ten: the owner asked for SIMPLE, and a strip nobody finishes
 * reading has told them nothing. Escape and Space are in it even though the
 * brief's own table left them out -- pausing and re-centring are the two
 * things a lost player reaches for first, and neither was written down
 * anywhere.
 */
export function controlLines(): ControlLine[] {
  const onMac = isMac();
  return [
    { action: 'move', keys: 'CLICK' },
    // On a Mac, Ctrl+click is turned into a right click by the OS before the
    // page ever sees it, so the existing mouse path covers it and it costs no
    // code -- only this sentence.
    { action: 'fire', keys: onMac ? 'HOLD F  or  CTRL+CLICK' : 'HOLD RIGHT  or  F' },
    { action: 'grenade', keys: onMac ? 'G' : 'MIDDLE CLICK  or  G' },
    { action: 'pan / zoom', keys: 'ARROWS  ·  + −' },
    { action: 'recentre', keys: 'SPACE' },
    { action: 'pause', keys: 'ESC' },
  ];
}
