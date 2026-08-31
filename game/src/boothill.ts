import {
  RANKS, deploy, formatTime, nextPromotionIn, rankName, rankShort, rankTier,
  renameTrooper, resetCampaign, sanitiseName, saveCampaign,
} from './campaign.js';
import { button, fill, heading, plate } from './ui.js';
import type { CampaignState } from './campaign.js';

/**
 * Boot Hill.
 *
 * This screen has no effect on any mission. That is the entire point of it.
 *
 * The original's cruelty was never in its simulation — everyone dies in one hit
 * on both sides and always did. It was in the hill: a monument you walked past
 * on the way to the next mission, growing a cross at a time, each one carrying a
 * name you had watched work. It costs nothing to compute and it is the reason
 * anyone remembers Jools.
 *
 * So: the crosses are laid out deterministically from the name, because a
 * grave that moves between visits is a decoration and a grave that stays put is
 * a place. And the roster sits directly underneath the dead, which is the
 * comparison the screen exists to make.
 */

/** Stable 0..1 from a name, so a man is buried in the same spot every time. */
function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const PER_ROW = 9;
/** Six rows of crosses is already a bad war. Past this the hill just says how many. */
const MAX_CROSSES = PER_ROW * 6;

/**
 * The mound. Crosses fill front to back, and the middle of each row stands
 * higher than its ends, which is what makes a flat row of divs read as a hill.
 */
function mound(state: CampaignState): HTMLElement {
  const hill = document.createElement('div');
  hill.className = 'hill-mound';

  if (state.fallen.length === 0) {
    hill.appendChild(Object.assign(document.createElement('p'), {
      className: 'hill-empty',
      textContent: 'Nobody buried here yet.',
    }));
    return hill;
  }

  const shown = state.fallen.slice(-MAX_CROSSES);
  for (let i = 0; i < shown.length; i++) {
    const grave = shown[i];
    const row = Math.floor(i / PER_ROW);
    const col = i % PER_ROW;
    const jitter = hashUnit(grave.name);

    const cross = document.createElement('i');
    cross.className = 'hill-cross';
    // Rank rides with the man into the ground: a veteran gets a taller marker,
    // so a row of crosses is legible as a row of losses of different sizes.
    if (rankTier(grave.missions) >= 3) cross.classList.add('vet');
    if (grave.own) cross.classList.add('own');

    const across = (col + 0.5) / PER_ROW;
    // Back rows sit higher and smaller: cheap depth, no perspective maths.
    const depth = 1 - row / 8;
    cross.style.left = `${across * 100 + (jitter - 0.5) * 5}%`;
    cross.style.bottom = `${14 + row * 21 + Math.sin(across * Math.PI) * 20}px`;
    cross.style.transform = `translateX(-50%) scale(${(0.72 + depth * 0.3).toFixed(3)})`;
    cross.style.opacity = String(0.55 + depth * 0.45);
    cross.title = `${rankName(grave.missions)} ${grave.name} — ${grave.mission}`;
    hill.appendChild(cross);
  }

  if (state.fallen.length > MAX_CROSSES) {
    hill.appendChild(Object.assign(document.createElement('span'), {
      className: 'hill-more',
      textContent: `and ${state.fallen.length - MAX_CROSSES} more`,
    }));
  }
  return hill;
}

/** The roll of the dead, most recent first — the order you remember them in. */
function fallenRoll(state: CampaignState): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'hill-col';
  wrap.appendChild(heading(`the fallen — ${state.fallen.length}`));

  if (state.fallen.length === 0) {
    wrap.appendChild(Object.assign(document.createElement('p'), {
      className: 'hill-note',
      textContent: 'Every man you have taken out, you have brought back.',
    }));
    return wrap;
  }

  const list = document.createElement('div');
  list.className = 'hill-list';
  for (const g of [...state.fallen].reverse()) {
    const row = plate(g.name, rankShort(g.missions));
    row.classList.add('dead');
    if (g.own) row.classList.add('own');
    // The mission that killed them is the detail that turns a name into an
    // event, so it goes on the plate rather than into a tooltip.
    row.appendChild(Object.assign(document.createElement('span'), {
      className: 'hill-where', textContent: g.mission,
    }));
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

/**
 * The living roster, and the one rename.
 *
 * One, not six. If you can rename everyone it is a settings screen; if you can
 * rename one man it is a decision, and a decision is a thing you remember making
 * when that name later turns up on the other list.
 */
function rosterPanel(state: CampaignState, redraw: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'hill-col';
  wrap.appendChild(heading(`the roster — ${state.squad.length}`));

  const list = document.createElement('div');
  list.className = 'hill-list';

  for (const t of state.squad) {
    const row = plate(t.name, rankShort(t.missions));
    if (t.own) row.classList.add('own');

    const due = nextPromotionIn(t.missions);
    row.appendChild(Object.assign(document.createElement('span'), {
      className: 'hill-where',
      textContent: t.missions === 0
        ? 'not yet under fire'
        : due === null
          ? `${rankName(t.missions)} — nowhere left to go`
          : `${t.missions} missions · ${due} to ${RANKS[rankTier(t.missions) + 1].name}`,
    }));

    if (!state.renameUsed) {
      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'hill-rename';
      name.textContent = 'name';
      name.title = 'Name one soldier. You only get one.';
      name.addEventListener('click', (e) => {
        e.stopPropagation();
        openRename(row, t.name, state, redraw);
      });
      row.appendChild(name);
    }
    list.appendChild(row);
  }

  wrap.appendChild(list);
  wrap.appendChild(Object.assign(document.createElement('p'), {
    className: 'hill-note',
    textContent: state.renameUsed
      ? 'You have used your one name.'
      : 'You may name one soldier, once, for the whole war. Choose carefully.',
  }));
  return wrap;
}

/** Swaps a roster row for an input. Escape backs out, Enter commits. */
function openRename(row: HTMLElement, current: string, state: CampaignState, redraw: () => void): void {
  const editor = document.createElement('div');
  editor.className = 'hill-editor';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'hill-input';
  input.maxLength = 9;
  input.value = current;
  input.spellcheck = false;
  input.setAttribute('aria-label', `New name for ${current}`);

  const err = Object.assign(document.createElement('span'), { className: 'hill-err' });

  const commit = (): void => {
    const wanted = sanitiseName(input.value);
    if (!wanted) { err.textContent = 'needs a name'; return; }
    if (wanted === current) { redraw(); return; }
    if (!renameTrooper(state, current, wanted)) {
      err.textContent = 'that name is taken';
      return;
    }
    redraw();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') redraw();
  });

  editor.append(input, button('Name him', { tone: 'good', onClick: commit }),
    button('Cancel', { onClick: redraw }), err);
  fill(row, editor);
  input.focus();
  input.select();
}

/** What you have done, per mission, at a glance. */
function recordPanel(state: CampaignState, missionNames: Map<string, string>): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'hill-col wide';
  const entries = Object.entries(state.records);
  wrap.appendChild(heading(`missions cleared — ${entries.length}`));

  if (entries.length === 0) {
    wrap.appendChild(Object.assign(document.createElement('p'), {
      className: 'hill-note', textContent: 'Nothing cleared yet.',
    }));
    return wrap;
  }

  const list = document.createElement('div');
  list.className = 'hill-list';
  for (const [id, r] of entries) {
    const row = plate(missionNames.get(id) ?? id);
    row.appendChild(Object.assign(document.createElement('span'), {
      className: 'hill-where',
      textContent: `${r.bestHome} home · ${formatTime(r.bestTime)} · ${r.clears.length}/4`,
    }));
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

/** True while the hill is up, so the mission select ignores its own hotkeys. */
export function bootHillOpen(): boolean {
  const el = document.getElementById('hill');
  return !!el && !el.hidden;
}

/**
 * Shows the hill. Resolves when the player leaves it.
 *
 * `state` is mutated in place — a rename or a wipe committed here is visible to
 * the caller when the promise resolves, which is what lets the menu re-render
 * with the new name without threading a result back out.
 */
export function showBootHill(
  state: CampaignState,
  missionNames: Map<string, string>,
  squadSize: number,
): Promise<void> {
  const root = document.getElementById('hill') as HTMLElement;
  const inner = document.getElementById('hill-inner') as HTMLElement;
  root.hidden = false;

  return new Promise((resolve) => {
    let confirmingWipe = false;

    const leave = (): void => {
      // Must match the capture flag it was added with, or it never comes off.
      window.removeEventListener('keydown', onKey, true);
      root.hidden = true;
      inner.textContent = '';
      resolve();
    };

    const draw = (): void => {
      const title = document.createElement('div');
      title.className = 'hill-head';
      title.appendChild(Object.assign(document.createElement('h2'), { textContent: 'Boot Hill' }));
      title.appendChild(Object.assign(document.createElement('p'), {
        className: 'hill-sub',
        textContent: state.fallen.length === 0
          ? 'No graves. Yet.'
          : `${state.fallen.length} buried · ${state.squad.length} still serving`,
      }));

      const cols = document.createElement('div');
      cols.className = 'hill-cols';
      cols.append(fallenRoll(state), rosterPanel(state, draw), recordPanel(state, missionNames));

      const actions = document.createElement('div');
      actions.className = 'hill-actions';
      actions.appendChild(button('Back', { tone: 'good', key: 'Esc', onClick: leave }));
      actions.appendChild(button(confirmingWipe ? 'Wipe it all — sure?' : 'New war', {
        tone: confirmingWipe ? 'warn' : 'default',
        hint: confirmingWipe ? 'this cannot be undone' : 'wipes the roster and the hill',
        onClick: () => {
          if (!confirmingWipe) { confirmingWipe = true; draw(); return; }
          const fresh = resetCampaign();
          // Mutate in place: the caller is holding this object.
          Object.assign(state, fresh);
          // Enlist immediately, so the player never sees an empty roster.
          deploy(state, squadSize);
          confirmingWipe = false;
          draw();
        },
      }));

      fill(inner, title, mound(state), cols, actions);
    };

    /**
     * The hill swallows the keyboard whole while it is up.
     *
     * It can be opened from the end-of-mission panel, which means a live Game is
     * still listening on window underneath it — and `R` restarts a mission. A
     * player reading the graves must not be able to restart the war by typing a
     * name. Capture phase on window runs before every bubble listener, so
     * stopping here stops all of them.
     */
    const onKey = (e: KeyboardEvent): void => {
      // Let the rename field have its own keys.
      if (e.target instanceof HTMLInputElement) return;
      e.stopPropagation();
      if (e.key === 'Escape') leave();
    };
    window.addEventListener('keydown', onKey, true);

    // Keep the roster topped up whenever the hill is opened, so a player who has
    // just been wiped out sees who replaced the dead rather than a short list.
    deploy(state, squadSize);
    saveCampaign(state);
    draw();
  });
}
