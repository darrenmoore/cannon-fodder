/**
 * Counting who played, and how much.
 *
 * The constraint that shaped this: Render's free plan has an ephemeral
 * filesystem and spins the instance down after fifteen minutes idle, so
 * anything this process counted for itself would reset several times a day.
 * Persisting it means a database, and a database is a bigger commitment than
 * the question deserves. So the counting is somebody else's problem --
 * GoatCounter, which is cookieless, stores no personal data, and therefore
 * needs no consent banner in front of a game.
 *
 * Two rules hold everything here together:
 *
 *   - **It can never break a mission.** Every call is wrapped, and the whole
 *     module no-ops when the script is absent -- which it will be for anyone
 *     running an ad blocker, and on localhost, where GoatCounter's script
 *     deliberately counts nothing so development does not pollute the numbers.
 *     Undercounting is the accepted price; a counter that can throw inside a
 *     firefight is not.
 *   - **Events are shapes, not identities.** A mission id, a difficulty and a
 *     time bucket. Nothing here can say who anybody is, which is the point.
 *
 * The loader is `async`, so `window.goatcounter` may not exist yet when the
 * first event fires. Events queue until it does rather than being dropped.
 */

interface GoatCounter {
  count?: (o: { path: string; title?: string; event: boolean }) => void;
}

const holder = window as unknown as { goatcounter?: GoatCounter };

/** Events raised before the script finished loading. */
const pending: string[] = [];
/** Stops the flush poll from running forever on a page where it never arrives. */
const GIVE_UP_AFTER = 40;
let polls = 0;
let polling = 0;

const send = (path: string): boolean => {
  const count = holder.goatcounter?.count;
  if (!count) return false;
  count({ path, title: path, event: true });
  return true;
};

const flush = (): void => {
  while (pending.length > 0) {
    if (!send(pending[0])) return;
    pending.shift();
  }
};

const startPolling = (): void => {
  if (polling) return;
  polling = window.setInterval(() => {
    flush();
    if (pending.length === 0 || ++polls > GIVE_UP_AFTER) {
      window.clearInterval(polling);
      polling = 0;
      // Nothing arrived, so nothing ever will on this page. Drop the backlog
      // rather than holding it against a session that may run for an hour.
      if (polls > GIVE_UP_AFTER) pending.length = 0;
    }
  }, 250);
};

/** Records one thing that happened. Silent and harmless if it cannot. */
export function track(path: string): void {
  try {
    if (send(path)) return;
    pending.push(path);
    startPolling();
  } catch {
    // A counter is never worth an exception on the way into a mission.
  }
}

/**
 * Coarse buckets rather than a number.
 *
 * A raw duration would make every session its own row in the dashboard, which
 * answers "how long did visitor 4,182 stay" -- a question nobody has -- while
 * making "do people play for more than a minute" unreadable.
 */
function bucket(seconds: number): string {
  if (seconds < 30) return 'under-30s';
  if (seconds < 120) return '30s-2m';
  if (seconds < 300) return '2-5m';
  if (seconds < 900) return '5-15m';
  if (seconds < 1800) return '15-30m';
  return 'over-30m';
}

export const missionStarted = (id: string, difficulty: string): void =>
  track(`start/${id}/${difficulty}`);

export const missionResolved = (id: string, difficulty: string, won: boolean): void =>
  track(`${won ? 'win' : 'loss'}/${id}/${difficulty}`);

/**
 * How long the visit lasted, sent once as the page goes away.
 *
 * `pagehide` is the reliable one on desktop and `visibilitychange` is what
 * actually fires on a phone, where a page is far more often backgrounded than
 * closed -- so both are listened for and the first one wins. Anything sent
 * during unload has to be fire-and-forget; there is no time for a response.
 */
export function startSession(): void {
  const openedAt = Date.now();
  let sent = false;

  const close = (): void => {
    if (sent) return;
    sent = true;
    track(`session/${bucket((Date.now() - openedAt) / 1000)}`);
  };

  window.addEventListener('pagehide', close);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) close();
  });
}
