/**
 * The front end: the intro screen and the level select, which are one screen.
 *
 * That is the whole design and it comes straight from the brief -- *"going
 * between the intro screen and level select is seamless, it's the same page
 * basically"*. So there is one root, one logo, and two panes that swap
 * underneath it. The logo does not reload, reflow or reappear when you move
 * between them; it shrinks and rises, and the panel below it changes. Nothing
 * unmounts, so there is nothing to fade back in.
 *
 * **What it is made of.** Every plate, button, frame and star on these screens
 * is the plotted chrome, reaching the DOM through `ui/skin.ts` as sliced
 * `border-image`. There is no second set of CSS bevels here and there must not
 * be one: the whole point of `sprites/plates.ts` was that a control looks the
 * same wherever it is drawn.
 *
 * **What it does not do yet.** The attract world does not run behind it -- the
 * owner deferred that -- so the ground is the vignette alone. When the attract
 * mode lands it goes behind `#front` and nothing here has to change, because
 * this screen never draws its own background.
 *
 * It keeps `showMenu`'s contract exactly: same arguments, resolves with the
 * same `MenuChoice`. `main.ts` swapped one call and knows nothing else about
 * any of this.
 */

import { DIFFICULTIES, DIFFICULTY_ORDER, DOCTRINES, isDifficultyId, isDoctrineId } from '../sim/difficulty.js';
import { confirm } from './confirm.js';
import { formatTime } from '../sim/campaign.js';
import { flipMusic, mountMusicToggle } from './musictoggle.js';
import { setBlackout } from './blackout.js';
import { groupByTheatre, starsFor } from './menu.js';
import { installSkin } from './skin.js';
import { resolveUnlocks } from '../sim/unlock.js';
import type { CampaignState } from '../sim/campaign.js';
import type { DifficultyId } from '../sim/difficulty.js';
import type { FrontChoice, LevelInfo } from './menu.js';

/**
 * Which theatre the rail was left on.
 *
 * Asked for by name in the brief. Kept in `localStorage` beside the campaign
 * rather than in memory, because "remembers which group you were on" is only
 * worth anything across a reload -- within a session the pane never unmounts
 * and remembering is free.
 */
const GROUP_KEY = 'cf.lastGroup';

const readGroup = (): string | null => {
  try { return localStorage.getItem(GROUP_KEY); } catch { return null; }
};
const writeGroup = (id: string): void => {
  try { localStorage.setItem(GROUP_KEY, id); } catch { /* private mode; not worth a branch */ }
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** A button wearing the plotted plate. One shape for everything clickable. */
function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', `fx-btn ${cls}`);
  b.type = 'button';
  b.appendChild(el('span', 'fx-btn-label', label));
  b.addEventListener('click', onClick);
  return b;
}

/** Three stars, always. The ones not earned are the hollow drawing. */
function stars(n: number): HTMLElement {
  const row = el('div', 'fx-stars');
  for (let i = 0; i < 3; i++) row.appendChild(el('i', i < n ? 'fx-star on' : 'fx-star'));
  return row;
}

/**
 * A mission description, cut to something a card can hold.
 *
 * The brief asks for eight to ten words and explicitly not italic. The map
 * files carry a `brief` written for a briefing screen, which is longer than
 * that, so it is trimmed here rather than rewritten in thirty-eight files --
 * and trimmed at a word, with an ellipsis, so it never ends mid-syllable.
 */
function shortBrief(level: LevelInfo): string {
  const src = (level.brief || level.mechanic || '').trim();
  if (!src) return '';
  const words = src.split(/\s+/);
  return words.length <= 10 ? src : `${words.slice(0, 9).join(' ')}…`;
}

export function showFront(
  levels: LevelInfo[],
  lastPlayed: string | null,
  initialDifficulty: DifficultyId,
  onDifficultyChange: (d: DifficultyId) => void,
  campaign: CampaignState,
  _onBootHill: () => Promise<void>,
): Promise<FrontChoice> {
  installSkin();

  const root = document.getElementById('front')!;
  const intro = document.getElementById('intro')!;
  const select = document.getElementById('select')!;
  const railBox = document.getElementById('select-rail')!;
  const listBox = document.getElementById('select-list')!;
  const introActions = document.getElementById('intro-actions')!;
  const selectHead = document.getElementById('select-head')!;
  const logo = document.getElementById('front-logo')!;

  let difficulty = initialDifficulty;
  const unlocks = resolveUnlocks(levels, campaign);
  const groups = groupByTheatre(levels);

  return new Promise<FrontChoice>((resolve) => {
    let settled = false;
    /** Leaves the front screen, whatever is on the other side of it. */
    const leave = (with_: FrontChoice): void => {
      if (settled) return;
      settled = true;
      /*
       * Black goes up *behind* the front before the front fades. Without this
       * the fade revealed whatever the stage happened to hold -- the sidebar,
       * one frame of the last mission -- for the gap between this screen going
       * and the briefing arriving, which the owner saw as the old menu flashing
       * up before every mission. The blackout sits under this layer, so raising
       * it first means the fade only ever uncovers black.
       */
      setBlackout(1);
      root.classList.add('leaving');
      window.setTimeout(() => {
        unmountToggle();
        document.removeEventListener('keydown', onKey);
        root.hidden = true;
        root.classList.remove('leaving');
        resolve(with_);
      }, 260);
    };
    const choose = (id: string): void => leave({ id, difficulty });

    /* ---------------------------------------------------------- the panes */

    const goto = (pane: 'intro' | 'select'): void => {
      root.classList.toggle('on-select', pane === 'select');
      intro.hidden = pane !== 'intro';
      select.hidden = pane !== 'select';
      // Focus follows the pane, or the keyboard is stranded on a hidden button.
      const first = (pane === 'intro' ? intro : select).querySelector('button');
      (first as HTMLElement | null)?.focus();
    };

    // The logo is the way back from the select -- the door BACK used to be.
    // Assigned, not addEventListener'd: the logo never unmounts and showFront
    // runs once per visit to the menu, so listeners would otherwise stack.
    logo.onclick = (): void => {
      if (root.classList.contains('on-select')) goto('intro');
    };

    /* --------------------------------------------------------- the intro */

    const resume = lastPlayed && levels.some((l) => l.id === lastPlayed && unlocks.open.has(l.id))
      ? lastPlayed
      : null;
    const firstUnplayed = levels.find((l) => unlocks.open.has(l.id) && !campaign.records[l.id]);

    introActions.textContent = '';
    introActions.appendChild(button('PLAY NOW', 'primary', () => {
      const target = firstUnplayed?.id ?? resume ?? levels.find((l) => unlocks.open.has(l.id))?.id;
      if (target) choose(target);
    }));
    introActions.appendChild(button('LEVEL SELECT', '', () => goto('select')));
    /*
     * The way into the CPU-vs-CPU arena, and dev-only for now.
     *
     * `__DEV__` is a literal `false` under `npm run build`, so esbuild folds
     * this branch away and the button is *absent* from a production bundle
     * rather than hidden in it -- the same rule the debug panel follows. The
     * arena's real home is behind this screen rather than in front of it: see
     * `docs/todo/300-cpu-vs-cpu/`.
     */
    if (__DEV__) {
      introActions.appendChild(button('BATTLE', '', () => leave({ arena: true })));
    }
    // BOOT HILL left this screen on the owner's say-so. Note what that means:
    // the graves are reachable from nowhere until somebody rehomes the door --
    // the same hole the old menu's comment records being caught by a playtest.

    /*
     * The mission dialog: what a card opens instead of deploying on the spot.
     *
     * The original brief asked for exactly this and it went unbuilt for a
     * while: the number, the name, a description in no small fonts, the stars
     * already earned, and then the difficulty -- chosen here, per launch,
     * rather than set globally in a corner of the screen. Escape, the backdrop
     * and BACK all put you back on the list with nothing spent.
     *
     * It is the standard confirmation wearing mission furniture, which is the
     * whole reason confirm() takes an element for a body: a second bespoke
     * dialog would drift from the first within a week.
     */
    const offerMission = (level: LevelInfo, n: number): Promise<void> => {
      const record = campaign.records[level.id];
      const body = el('div', 'mi');

      const desc = (level.brief || level.mechanic || '').trim();
      if (desc) body.appendChild(el('p', 'mi-desc', desc));

      const meta = el('div', 'mi-meta');
      const doctrine = isDoctrineId(level.doctrine) ? DOCTRINES[level.doctrine].name : level.doctrine;
      meta.appendChild(el('span', 'mi-chip', doctrine.toUpperCase()));
      if (level.nokill) meta.appendChild(el('span', 'mi-chip warn', 'NO KILLING'));
      if (level.timeLimit > 0) meta.appendChild(el('span', 'mi-chip warn', `${formatTime(level.timeLimit)} LIMIT`));
      body.appendChild(meta);

      const earned = el('div', 'mi-earned');
      earned.appendChild(stars(starsFor(record)));
      if (record) {
        earned.appendChild(el('span', 'mi-best',
          `BEST: ${record.bestHome} CAME HOME · ${formatTime(record.bestTime)}`));
      }
      body.appendChild(earned);

      return confirm({
        title: `${String(n).padStart(2, '0')} · ${level.name.toUpperCase()}`,
        body,
        /*
         * One button per difficulty, on one line; the one you last played
         * wears the gold. No BACK: Escape and the backdrop are the way out,
         * and a fourth button made the three that matter wrap. No stars
         * either -- clears are already told above by the mi-earned row, and
         * the suffix both repeated it and padded the buttons toward wrapping.
         */
        buttons: [
          ...DIFFICULTY_ORDER.map((id) => ({
            label: DIFFICULTIES[id].name.toUpperCase(),
            value: id as string,
            variant: (id === difficulty ? 'primary' : 'normal') as 'primary' | 'normal',
          })),
        ],
        dismiss: 'back',
      }).then((v) => {
        if (v === 'back' || !isDifficultyId(v)) return;
        difficulty = v;
        onDifficultyChange(v);
        choose(level.id);
      });
    };

    /* -------------------------------------------------- the select header */

    // The head is empty now: BACK and the SELECT MISSION banner both left on
    // the owner's ask, and the logo hanging over the frame's top edge is the
    // screen's title instead. Escape still returns to the intro -- which is
    // the only way back, so a touch player currently has no door; noted, as
    // Boot Hill's exile is noted above, until somebody rehomes it.
    selectHead.textContent = '';
    selectHead.hidden = true;

    /* ------------------------------------------------------------ the rail */

    let current = readGroup() ?? groups[0]?.theatre.id ?? '';
    if (!groups.some((g) => g.theatre.id === current)) current = groups[0]?.theatre.id ?? '';

    const paintRail = (): void => {
      for (const b of railBox.children) {
        b.classList.toggle('on', (b as HTMLElement).dataset.group === current);
      }
    };

    const paintList = (): void => {
      const group = groups.find((g) => g.theatre.id === current);
      listBox.textContent = '';
      if (!group) return;
      for (const level of group.levels) {
        const open = unlocks.open.has(level.id);
        const record = campaign.records[level.id];
        const card = el('button', open ? 'fx-card' : 'fx-card locked');
        card.type = 'button';
        card.disabled = !open;

        // Numbered within the theatre, not across the campaign. The rail is
        // already saying which theatre you are in, and a desert list that runs
        // 05, 07, 14 reads as a list with holes in it rather than as a front.
        const n = group.levels.indexOf(level) + 1;
        card.appendChild(el('span', 'fx-card-num', String(n).padStart(2, '0')));

        const body = el('span', 'fx-card-body');
        body.appendChild(el('span', 'fx-card-name', level.name.toUpperCase()));
        const brief = shortBrief(level);
        if (brief) body.appendChild(el('span', 'fx-card-desc', brief));
        card.appendChild(body);

        const tail = el('span', 'fx-card-tail');
        if (open) tail.appendChild(stars(starsFor(record)));
        else tail.appendChild(el('i', 'fx-lock'));
        card.appendChild(tail);

        if (open) card.addEventListener('click', () => { void offerMission(level, n); });
        listBox.appendChild(card);
      }
    };

    railBox.textContent = '';
    for (const g of groups) {
      const done = g.levels.filter((l) => campaign.records[l.id]).length;
      const b = button('', 'fx-group', () => {
        current = g.theatre.id;
        writeGroup(current);
        paintRail();
        paintList();
      });
      b.dataset.group = g.theatre.id;
      b.textContent = '';
      // A portrait placeholder, as the brief allows. It carries the theatre's
      // own tint so the rail is not six identical squares while the real
      // paintings are outstanding.
      const art = el('i', `fx-group-art t-${g.theatre.id}`);
      const body = el('span', 'fx-group-body');
      body.appendChild(el('span', 'fx-group-name', g.theatre.name.toUpperCase()));
      // One meta line, not a third column: at twenty-pixel type a name, a
      // count and a score cannot share a 280px row without colliding.
      const meta = el('span', 'fx-group-meta');
      meta.appendChild(el('span', 'fx-group-count', `${g.levels.length} MISSIONS`));
      meta.appendChild(el('span', 'fx-group-done', `${done}/${g.levels.length}`));
      body.appendChild(meta);
      b.appendChild(art);
      b.appendChild(body);
      railBox.appendChild(b);
    }

    document.getElementById('select-foot')!.textContent = '';

    paintRail();
    paintList();

    /* -------------------------------------------------------------- enter */

    const unmountToggle = mountMusicToggle(root);

    root.hidden = false;
    // A frame's grace so the browser has the pane laid out before the class
    // that animates it lands; without it the entrance plays from nothing.
    requestAnimationFrame(() => root.classList.add('in'));
    /*
     * The black comes down only once this screen is up to receive the eye.
     * main.ts used to drop it before showing the list, which opened the same
     * seam as leaving had: a beat of naked stage between the black lifting and
     * the screen fading in. The screen that covers the stage is the one that
     * knows when it is safe to uncover it.
     */
    window.setTimeout(() => setBlackout(0), 340);
    goto('intro');

    const onKey = (e: KeyboardEvent): void => {
      if (settled) return;
      if (e.key === 'm' || e.key === 'M') { flipMusic(); return; }
      if (e.key === 'Escape' && root.classList.contains('on-select')) goto('intro');
    };
    document.addEventListener('keydown', onKey);
  });
}
