import { DIFFICULTIES, DIFFICULTY_ORDER, DOCTRINES, describeLevers, isDifficultyId, isDoctrineId, resolveLevers } from './difficulty.js';
import { OBJECTIVE_TEXT } from './objectives.js';
import type { DifficultyId, DoctrineId } from './difficulty.js';

/**
 * The level select. Missions are listed straight from `data/`, so dropping a
 * new .map file in there makes it playable without touching any code.
 *
 * Difficulty is picked here rather than baked into a mission: any level can be
 * replayed at any setting, and the card shows what actually changes -- whether
 * they hear you, hunt you, flank, throw grenades, and whether you get fog.
 */

export interface LevelInfo {
  id: string;
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

/** Buckets levels into theatres, dropping any theatre nothing landed in. */
export function groupByTheatre(levels: LevelInfo[]): Array<{ theatre: Theatre; levels: LevelInfo[] }> {
  const groups = THEATRES.map((theatre) => ({ theatre, levels: [] as LevelInfo[] }));
  const fallback = groups[groups.length - 1];
  for (const level of levels) {
    (groups.find((g) => g.theatre.themes.includes(level.theme)) ?? fallback).levels.push(level);
  }
  return groups.filter((g) => g.levels.length > 0);
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
  return res.json() as Promise<LevelInfo[]>;
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
): Promise<MenuChoice> {
  const root = document.getElementById('menu') as HTMLElement;
  const list = document.getElementById('menu-list') as HTMLElement;
  const tabs = document.getElementById('menu-difficulty') as HTMLElement;
  const blurb = document.getElementById('menu-blurb') as HTMLElement;
  root.hidden = false;

  let difficulty: DifficultyId = initialDifficulty;

  return new Promise((resolve) => {
    const cleanup: Array<() => void> = [];
    const finish = (id: string): void => {
      for (const off of cleanup) off();
      root.hidden = true;
      list.textContent = '';
      tabs.textContent = '';
      resolve({ id, difficulty });
    };

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

      el.addEventListener('click', () => finish(level.id));
      return el;
    };

    // Number keys pick a mission, left/right change difficulty.
    const onKey = (e: KeyboardEvent): void => {
      if (root.hidden) return;
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

    renderTabs();
    renderList();
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
