import { DIFFICULTIES, DIFFICULTY_ORDER, DOCTRINES, describeLevers, isDifficultyId, isDoctrineId, resolveLevers } from '../sim/difficulty.js';
import { OBJECTIVE_TEXT } from '../sim/objectives.js';
import { bootHillOpen } from './boothill.js';
import { formatTime } from '../sim/campaign.js';
import { musicOn, musicSource, onMusicChange, syncMusic } from '../shell/music.js';
import { updateSettings } from './settings.js';
import type { CampaignState } from '../sim/campaign.js';
import type { DifficultyId, DoctrineId } from '../sim/difficulty.js';

/**
 * The level select. Missions are listed straight from `data/`, so dropping a
 * new .map file in there makes it playable without touching any code.
 *
 * Difficulty is picked here rather than baked into a mission: any level can be
 * replayed at any setting, and the card shows what actually changes -- whether
 * they hear you, hunt you, flank, throw grenades, and whether you get fog.
 */

/**
 * The music switch, drawn rather than set as a glyph so it stays on the pixel
 * grid and inherits the chrome's colours. The body is filled, the waves and the
 * strike are stroked; `style.css` colours them from one rule each.
 */
const SPEAKER_BODY = '<path class="cone" d="M4 9.5h3.6L12 5.4v13.2L7.6 14.5H4z"/>';
const SPEAKER_ON = `<svg viewBox="0 0 24 24" aria-hidden="true">${SPEAKER_BODY}`
  + '<path class="wave" d="M15.4 9.3a4 4 0 0 1 0 5.4"/>'
  + '<path class="wave" d="M18.1 6.7a7.6 7.6 0 0 1 0 10.6"/></svg>';
const SPEAKER_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true">${SPEAKER_BODY}`
  + '<path class="slash" d="M15.6 9.6l5 4.8"/><path class="slash" d="M20.6 9.6l-5 4.8"/></svg>';

export interface LevelInfo {
  id: string;
  /** A test map, listed only in a dev build. See `fetchLevels`. */
  dev?: boolean;
  name: string;
  theme: string;
  objective: string;
  doctrine: string;
  brief: string;
  mechanic: string;
  width: number;
  height: number;
}

export interface MenuChoice {
  id: string;
  difficulty: DifficultyId;
}

/**
 * Theatres. Missions are grouped by the ground they are fought over rather
 * than listed flat, because eight identical rows tell you nothing about the
 * shape of the campaign. The order here is the order they appear in; anything
 * with an unrecognised theme falls into the last group rather than vanishing.
 *
 * `locked` is not wired to anything yet. It is here so that making later
 * theatres earned is a data change rather than a redesign.
 */
export interface Theatre {
  id: string;
  name: string;
  note: string;
  themes: string[];
  locked?: boolean;
}

export const THEATRES: Theatre[] = [
  { id: 'jungle', name: 'The Jungle', note: 'Where every recruit starts', themes: ['jungle'] },
  { id: 'desert', name: 'The Desert', note: 'No cover, and a long way to walk', themes: ['desert'] },
  { id: 'arctic', name: 'The Ice', note: 'Cold ground, worse footing', themes: ['arctic'] },
];

/**
 * Where the test maps go: last, under their own heading, and never in front of
 * a player.
 *
 * They were landing in whichever theatre matched their theme, which put a test
 * range in the middle of the campaign looking like a mission. A group of their
 * own says what they are, and `fetchLevels` has already dropped them entirely
 * from a production build -- this only decides where they sit when they *are*
 * listed.
 */
const TEST_THEATRE: Theatre = {
  id: 'test', name: 'Test Range', note: 'Dev only — not part of the campaign', themes: [],
};

/** Buckets levels into theatres, dropping any theatre nothing landed in. */
export function groupByTheatre(levels: LevelInfo[]): Array<{ theatre: Theatre; levels: LevelInfo[] }> {
  const groups = THEATRES.map((theatre) => ({ theatre, levels: [] as LevelInfo[] }));
  const tests = { theatre: TEST_THEATRE, levels: [] as LevelInfo[] };
  const fallback = groups[groups.length - 1];
  for (const level of levels) {
    if (level.dev) { tests.levels.push(level); continue; }
    (groups.find((g) => g.theatre.themes.includes(level.theme)) ?? fallback).levels.push(level);
  }
  // Always last, whatever theme the test maps happen to use.
  return [...groups, tests].filter((g) => g.levels.length > 0);
}

/** Long, tall or roughly square -- worth showing, since it changes how it plays. */
function shapeOf(l: LevelInfo): string {
  const ratio = l.width / l.height;
  if (ratio > 1.9) return 'long';
  if (ratio < 0.85) return 'tall';
  return 'open';
}

export async function fetchLevels(): Promise<LevelInfo[]> {
  const res = await fetch('/api/maps');
  if (!res.ok) throw new Error(`could not list missions: ${res.status}`);
  const levels = (await res.json()) as LevelInfo[];
  // The test range lives in `data/` like every other map, so the server lists
  // it; a real player must never see it. Belt and braces with the `__DEV__`
  // define -- this hides it, and the define drops the debug panel entirely.
  return __DEV__ ? levels : levels.filter((l) => !l.dev);
}

/**
 * Renders the menu and resolves with the chosen mission and difficulty.
 * Resolves once, then tears its own listeners down.
 */
export function showMenu(
  levels: LevelInfo[],
  lastPlayed: string | null,
  initialDifficulty: DifficultyId,
  onDifficultyChange: (d: DifficultyId) => void,
  campaign: CampaignState,
  // Off the front screen for now. The hill is still reachable from the sidebar
  // mid-mission, so this stays wired rather than being torn out and rebuilt.
  _onBootHill: () => Promise<void>,
): Promise<MenuChoice> {
  const root = document.getElementById('menu') as HTMLElement;
  const list = document.getElementById('menu-list') as HTMLElement;
  const tabs = document.getElementById('menu-difficulty') as HTMLElement;
  const blurb = document.getElementById('menu-blurb') as HTMLElement;
  root.hidden = false;

  let difficulty: DifficultyId = initialDifficulty;

  return new Promise((resolve) => {
    const cleanup: Array<() => void> = [];

    // --- the music switch
    //
    // Pinned to the corner rather than sat in the row of buttons. It is the one
    // control here that is not about choosing a mission, you touch it once and
    // then forget it, and a speaker with its waves struck out says "off" without
    // needing a word -- so it carries no label at all.
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'music-toggle';
    root.appendChild(toggle);

    const finish = (id: string): void => {
      for (const off of cleanup) off();
      root.hidden = true;
      list.textContent = '';
      tabs.textContent = '';
      toggle.remove();
      resolve({ id, difficulty });
    };

    const renderToggle = (): void => {
      const on = musicOn();
      const source = musicSource();
      // On-and-playing, on-but-held-back, and off are three different states,
      // and the button has to tell them apart. A player whose browser is sitting
      // on the autoplay is owed a reason rather than a switch that looks broken.
      const blocked = on && source === 'none';
      toggle.classList.toggle('on', on && !blocked);
      toggle.classList.toggle('blocked', blocked);
      toggle.setAttribute('aria-pressed', String(on));
      toggle.title = !on
        ? 'Music off  (M)'
        : blocked ? 'Click anywhere to start the music  (M)'
        : source === 'synth' ? 'Music on — house march  (M)'
        : 'Music on  (M)';
      toggle.setAttribute('aria-label', toggle.title);
      toggle.innerHTML = on ? SPEAKER_ON : SPEAKER_OFF;
    };

    const flipMusic = (): void => {
      updateSettings({ music: !musicOn() });
      syncMusic();
      renderToggle();
    };
    toggle.addEventListener('click', flipMusic);

    // --- difficulty tabs
    const renderTabs = (): void => {
      tabs.textContent = '';
      for (const id of DIFFICULTY_ORDER) {
        const d = DIFFICULTIES[id];
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `diff diff-${id}${id === difficulty ? ' on' : ''}`;
        tab.textContent = d.name;
        tab.addEventListener('click', () => {
          difficulty = id;
          onDifficultyChange(id);
          renderTabs();
          renderList();
        });
        tabs.appendChild(tab);
      }
      blurb.textContent = DIFFICULTIES[difficulty].blurb;
    };

    // --- mission cards, re-rendered when difficulty changes so the lever
    //     summary on each card stays honest.
    const renderList = (): void => {
      list.textContent = '';
      let n = 0;

      for (const { theatre, levels: group } of groupByTheatre(levels)) {
        const section = document.createElement('section');
        section.className = 'theatre';

        const head = document.createElement('div');
        head.className = 'theatre-head';
        head.appendChild(Object.assign(document.createElement('span'), {
          className: 'theatre-name', textContent: theatre.name,
        }));
        head.appendChild(Object.assign(document.createElement('i'), { className: 'theatre-rule' }));
        head.appendChild(Object.assign(document.createElement('span'), {
          className: 'theatre-note', textContent: theatre.note,
        }));
        section.appendChild(head);

        const grid = document.createElement('div');
        grid.className = 'theatre-grid';
        for (const level of group) grid.appendChild(card(level, ++n));
        section.appendChild(grid);
        list.appendChild(section);
      }
    };

    /** One mission card. `index` is its campaign number, not its position. */
    const card = (level: LevelInfo, index: number): HTMLButtonElement => {
      const doctrine: DoctrineId = isDoctrineId(level.doctrine) ? level.doctrine : 'garrison';
      const levers = resolveLevers(difficulty, doctrine);

      const el = document.createElement('button');
      el.className = `mission theme-${level.theme}`;
      el.type = 'button';
      // Addressable by mission id, so the capture harness can enter a level by
      // the same click path a player uses.
      el.dataset.id = level.id;
      if (level.id === lastPlayed) el.classList.add('last');

      el.innerHTML = `
        <span class="m-num">${String(index).padStart(2, '0')}</span>
        <span class="m-body">
          <span class="m-name"></span>
          <span class="m-obj"></span>
          <span class="m-mech"></span>
          <span class="m-levers"></span>
        </span>
        <span class="m-meta">
          <span class="m-theme"></span>
          <span class="m-doctrine"></span>
          <span class="m-size"></span>
          <span class="m-ribbons"></span>
          <span class="m-best"></span>
        </span>`;

      // Map headers are author-supplied text; set them as text, never HTML.
      el.querySelector('.m-name')!.textContent = level.name;
      el.querySelector('.m-obj')!.textContent = OBJECTIVE_TEXT[level.objective] ?? level.objective;
      el.querySelector('.m-mech')!.textContent = level.brief || level.mechanic;
      el.querySelector('.m-theme')!.textContent = level.theme;
      el.querySelector('.m-doctrine')!.textContent = DOCTRINES[doctrine].name;
      el.querySelector('.m-size')!.textContent = `${level.width}x${level.height} ${shapeOf(level)}`;

      const leverBar = el.querySelector('.m-levers') as HTMLElement;
      for (const note of describeLevers(levers)) {
        const chip = document.createElement('i');
        chip.className = 'lever';
        chip.textContent = note;
        leverBar.appendChild(chip);
      }

      // Ribbons.
      //
      // All four are always drawn, and the ones you have not earned are drawn
      // dim rather than hidden. A locked thing you cannot see is not a goal; a
      // gap in a row of four, on a card you are already looking at, is. This is
      // also why `Theatre.locked` stays unwired — hiding the later theatres
      // would take away the very thing that makes them worth reaching.
      const record = campaign.records[level.id];
      const ribbons = el.querySelector('.m-ribbons') as HTMLElement;
      for (const id of DIFFICULTY_ORDER) {
        const cleared = !!record?.clears.includes(id);
        const rib = document.createElement('i');
        rib.className = `ribbon diff-${id}${cleared ? ' on' : ''}`;
        rib.title = cleared
          ? `Cleared on ${DIFFICULTIES[id].name}`
          : `Not yet cleared on ${DIFFICULTIES[id].name}`;
        ribbons.appendChild(rib);
      }
      if (record) el.classList.add('cleared');

      // The par. Shown on the card as well as in the sidebar so that choosing a
      // mission and playing it are anchored to the same number.
      const best = el.querySelector('.m-best') as HTMLElement;
      best.textContent = record
        ? `best ${record.bestHome} home · ${formatTime(record.bestTime)}`
        : '';

      el.addEventListener('click', () => finish(level.id));
      return el;
    };

    // Number keys pick a mission, left/right change difficulty.
    const onKey = (e: KeyboardEvent): void => {
      // The hill draws over the menu without hiding it, so a number key would
      // otherwise launch a mission out from under someone reading the graves.
      if (root.hidden || bootHillOpen()) return;
      if (e.key === 'm' || e.key === 'M') {
        flipMusic();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= Math.min(9, levels.length)) {
        finish(levels[n - 1].id);
        return;
      }
      if (e.key === 'Enter' && levels.length > 0) {
        finish(lastPlayed ?? levels[0].id);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const at = DIFFICULTY_ORDER.indexOf(difficulty);
        const next = DIFFICULTY_ORDER[Math.min(DIFFICULTY_ORDER.length - 1, Math.max(0, at + step))];
        if (next !== difficulty) {
          difficulty = next;
          onDifficultyChange(next);
          renderTabs();
          renderList();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    cleanup.push(() => window.removeEventListener('keydown', onKey));

    renderToggle();
    renderTabs();
    renderList();

    // A blocked autoplay starts later, on the first gesture. The button has to
    // stop claiming "click anywhere to start" the moment it actually does.
    cleanup.push(onMusicChange(() => renderToggle()));
  });
}

/** Reads the remembered difficulty, falling back to Regular. */
export function loadDifficulty(key: string): DifficultyId {
  try {
    const saved = localStorage.getItem(key);
    if (saved && isDifficultyId(saved)) return saved;
  } catch {
    // Private browsing; the default is fine.
  }
  return 'regular';
}

export function saveDifficulty(key: string, value: DifficultyId): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Remembering the setting is not worth failing over.
  }
}
