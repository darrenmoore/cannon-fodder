import { DIFFICULTIES } from './difficulty.js';
import { OBJECTIVE_TEXT } from './objectives.js';
import { button, fill, heading, meter, plate, readout } from './ui.js';
import { Phase } from './types.js';
import type { World } from './world.js';

/**
 * The sidebar and the end-of-mission panel.
 *
 * The original puts its status down the left edge, not across the top, and the
 * thing it gives most of that space to is a list of your soldiers' names. That
 * is a design decision, not a layout one: the column is what makes a casualty
 * legible as a person leaving the list rather than a counter going down.
 *
 * Plain DOM rather than canvas text — it stays crisp at any zoom and costs
 * nothing to lay out. Everything is rebuilt only when it actually changes; the
 * per-frame path just sets textContent on a handful of nodes.
 */
export class Hud {
  private readonly root = document.getElementById('hud') as HTMLElement;
  private readonly overlay = document.getElementById('overlay') as HTMLElement;
  private readonly overlayCard = document.getElementById('overlay-card') as HTMLElement;

  private readonly mission = document.createElement('div');
  private readonly roster = document.createElement('div');
  private readonly grenades = readout('grenades');
  private readonly objective = document.createElement('div');
  private readonly timer = meter('hold');

  /** One plate per soldier, rebuilt only when the squad changes size. */
  private plates: Array<{ root: HTMLElement; alive: boolean }> = [];
  private lastPhase: Phase | null = null;
  private lastMission = '';
  private lastGrenades = -1;
  /** While the briefing banner is up, `update` leaves the overlay alone. */
  private briefing = false;
  /** Set by main.ts, so the end panel's buttons can act on the shell. */
  onNext: (() => void) | null = null;
  onRetry: (() => void) | null = null;
  onMissions: (() => void) | null = null;
  /** False on the last mission, which turns "next" into a campaign end. */
  hasNext = true;

  constructor() {
    this.mission.className = 'hud-mission';
    this.roster.className = 'hud-roster';
    this.objective.className = 'hud-objective';

    const body = document.createElement('div');
    body.className = 'hud-body';
    body.append(
      this.mission,
      heading('squad'),
      this.roster,
      heading('supply'),
      this.grenades.root,
      this.timer.root,
      heading('orders'),
      this.objective,
    );

    const hint = document.createElement('div');
    hint.className = 'hud-hint';
    hint.innerHTML = [
      '<b>L-click</b> move',
      '<b>click target</b> engage',
      '<b>R-hold</b> fire',
      '<b>both</b> grenade',
      '<b>Esc</b> missions',
    ].join('<br>');

    fill(this.root, body, hint);
    this.timer.root.hidden = true;
  }

  /** Rebuilds the roster column. Only runs when the squad's size changes. */
  private ensureRoster(world: World): void {
    if (this.plates.length === world.soldiers.length) return;
    this.roster.textContent = '';
    this.plates = world.soldiers.map((s) => {
      const p = plate(s.name);
      this.roster.appendChild(p);
      return { root: p, alive: true };
    });
  }

  update(world: World): void {
    if (world.map.name !== this.lastMission) {
      this.lastMission = world.map.name;
      fill(this.mission,
        Object.assign(document.createElement('b'), { textContent: world.map.name }),
        Object.assign(document.createElement('span'), {
          className: `hud-diff diff-${world.difficulty}`,
          textContent: DIFFICULTIES[world.difficulty].name,
        }));
      this.plates = [];
      this.lastPhase = null;
    }

    this.ensureRoster(world);
    for (let i = 0; i < this.plates.length; i++) {
      const alive = world.soldiers[i].alive;
      if (alive === this.plates[i].alive) continue;
      this.plates[i].alive = alive;
      this.plates[i].root.classList.toggle('dead', !alive);
    }

    if (world.grenadesHeld !== this.lastGrenades) {
      // Only pulse once the count has been established, so entering a mission
      // does not flash a change that did not happen.
      if (this.lastGrenades >= 0) this.grenades.flash();
      this.lastGrenades = world.grenadesHeld;
      this.grenades.set(String(world.grenadesHeld));
    }
    this.objective.textContent = world.status;

    if (world.map.objective === 'survive') {
      this.timer.root.hidden = false;
      const left = Math.max(0, world.map.duration - world.time);
      this.timer.set(1 - left / world.map.duration, `${Math.ceil(left)}s`);
    } else {
      this.timer.root.hidden = true;
    }

    // The briefing owns the overlay until it is dismissed.
    if (this.briefing && world.phase === Phase.Playing) return;
    if (world.phase === this.lastPhase) return;
    this.lastPhase = world.phase;

    if (world.phase === Phase.Playing) {
      this.overlay.hidden = true;
      return;
    }
    this.showResult(world);
  }

  /**
   * The end-of-mission panel. The original makes a small ceremony of finishing
   * a mission, and the thing it never does is drop you straight back into the
   * next one — so this waits for a click and says who did not come home.
   */
  private showResult(world: World): void {
    const won = world.phase === Phase.Won;
    const dead = world.soldiers.filter((s) => !s.alive);
    const survivors = world.soldiers.filter((s) => s.alive);

    const card = document.createElement('div');
    card.className = `result ${won ? 'win' : 'lose'}`;

    card.appendChild(Object.assign(document.createElement('div'), {
      className: 'result-title',
      textContent: won ? 'Mission accomplished' : 'Mission failed',
    }));
    card.appendChild(Object.assign(document.createElement('div'), {
      className: 'result-sub',
      textContent: won
        ? `${world.map.name} — ${survivors.length} of ${world.soldiers.length} came home`
        : failureReason(world),
    }));

    if (dead.length > 0) {
      const roll = document.createElement('div');
      roll.className = 'result-roll';
      roll.appendChild(Object.assign(document.createElement('div'), {
        className: 'result-roll-head',
        textContent: won ? 'lost in action' : 'lost',
      }));
      for (const s of dead) roll.appendChild(plate(s.name));
      card.appendChild(roll);
    } else if (won) {
      card.appendChild(Object.assign(document.createElement('div'), {
        className: 'result-perfect',
        textContent: 'Not a scratch. Every man home.',
      }));
    }

    const actions = document.createElement('div');
    actions.className = 'result-actions';
    if (won && this.hasNext) {
      actions.appendChild(button('Next mission', {
        tone: 'good', key: 'Enter', onClick: () => this.onNext?.(),
      }));
    }
    actions.appendChild(button(won ? 'Replay' : 'Try again', {
      tone: won ? 'default' : 'warn', key: 'R', onClick: () => this.onRetry?.(),
    }));
    actions.appendChild(button('Mission list', {
      key: 'Esc', onClick: () => this.onMissions?.(),
    }));
    card.appendChild(actions);

    fill(this.overlayCard, card);
    this.overlay.hidden = false;
    this.overlay.classList.add('interactive');
  }

  /** Shown briefly at the start of a mission, so you know what you are doing. */
  showBriefing(world: World): void {
    this.briefing = true;
    this.overlay.classList.remove('interactive');

    const card = document.createElement('div');
    card.className = 'briefing';
    card.appendChild(Object.assign(document.createElement('div'), {
      className: 'briefing-title', textContent: world.map.name,
    }));
    const objective = OBJECTIVE_TEXT[world.map.objective] ?? world.map.objective;
    card.appendChild(Object.assign(document.createElement('div'), {
      className: 'briefing-obj', textContent: objective,
    }));
    if (world.map.brief) {
      card.appendChild(Object.assign(document.createElement('div'), {
        className: 'briefing-line', textContent: world.map.brief,
      }));
    }
    fill(this.overlayCard, card);
    this.overlay.hidden = false;
  }

  hideOverlay(): void {
    this.briefing = false;
    this.overlay.hidden = true;
    this.overlay.classList.remove('interactive');
    this.lastPhase = null;
  }
}

function failureReason(world: World): string {
  if (world.map.objective === 'rescue' && world.hostages.some((h) => !h.alive && !h.delivered)) {
    return 'A hostage was killed. There is no partial credit.';
  }
  return 'The squad was wiped out.';
}
