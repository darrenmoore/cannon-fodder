import { DIFFICULTIES } from '../sim/difficulty.js';
import { OBJECTIVE_TEXT } from '../sim/objectives.js';
import { formatTime, rankName, rankShort, rankTier } from '../sim/campaign.js';
import { button, fill, heading, meter, plate, readout } from './ui.js';
import { Phase } from '../types.js';
import type { Aftermath, MissionRecord } from '../sim/campaign.js';
import type { World } from '../sim/world.js';

/**
 * The sidebar and the end-of-mission panel.
 *
 * The original puts its status down the left edge, not across the top, and the
 * thing it gives most of that space to is a list of your soldiers' names. That
 * is a design decision, not a layout one: the column is what makes a casualty
 * legible as a person leaving the list rather than a counter going down.
 *
 * Since the roster started persisting, the column carries rank as well, which is
 * what turns a name into a career. A plate reading `HAWK  SGT` is a man who has
 * come home six times; losing him is not the same event as losing the recruit
 * under him, and the sidebar has to make that difference visible *before* the
 * decision, not after it.
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
  private readonly par = document.createElement('div');
  private readonly timer = meter('hold');

  /** One plate per soldier, rebuilt only when the squad changes. */
  private plates: Array<{ root: HTMLElement; alive: boolean; name: string }> = [];
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
  /**
   * The standing record for this mission, and what the campaign made of the
   * attempt just finished. Both are set by main.ts before the panel goes up.
   */
  record: MissionRecord | null = null;
  aftermath: Aftermath | null = null;
  /** How many are on the hill, for the briefing's one cold line. */
  buried = 0;

  constructor() {
    this.mission.className = 'hud-mission';
    this.roster.className = 'hud-roster';
    this.objective.className = 'hud-objective';
    this.par.className = 'hud-par';

    /**
     * The panels are grouped rather than poured into one column, because the
     * three layouts are three arrangements of these four groups: a column on a
     * desktop, corner clusters over the battlefield on a phone in landscape, a
     * bar along the bottom in portrait. Grouping them here is what lets that be
     * a stylesheet decision instead of three builders.
     */
    const group = (className: string, ...children: Node[]): HTMLDivElement => {
      const g = document.createElement('div');
      g.className = className;
      g.append(...children);
      return g;
    };

    const body = document.createElement('div');
    body.className = 'hud-body';
    body.append(
      this.mission,
      group('hud-squad', heading('squad'), this.roster),
      group('hud-supply', heading('supply'), this.grenades.root, this.timer.root),
      group('hud-orders', heading('orders'), this.objective, this.par),
    );

    // Only ever shown in the sidebar layout, and only to a mouse: on touch
    // every one of these is a button on the action bar instead.
    const hint = document.createElement('div');
    hint.className = 'hud-hint';
    hint.innerHTML = [
      '<b>Tap / L-click</b> move',
      '<b>on a target</b> engage',
      '<b>drag</b> pan',
      '<b>FIRE</b> / R-hold',
      '<b>GRENADE</b> / G',
    ].join('<br>');

    fill(this.root, body, hint);
    this.timer.root.hidden = true;
  }

  /**
   * Rebuilds the roster column. Keyed on the names as well as the count, since
   * the squad that deploys changes between missions now even when its size
   * does not.
   */
  private ensureRoster(world: World): void {
    const same = this.plates.length === world.soldiers.length
      && this.plates.every((p, i) => p.name === world.soldiers[i].name);
    if (same) return;

    this.roster.textContent = '';
    this.plates = world.soldiers.map((s) => {
      const p = plate(s.name, rankShort(s.rank));
      // Sergeant and up read as veterans at a glance. The threshold is where the
      // promotions start to slow down, so the mark means something.
      if (rankTier(s.rank) >= 3) p.classList.add('vet');
      if (s.own) p.classList.add('own');
      p.title = `${rankName(s.rank)} — ${s.rank} mission${s.rank === 1 ? '' : 's'} survived`;
      this.roster.appendChild(p);
      return { root: p, alive: true, name: s.name };
    });
  }

  /**
   * The par line.
   *
   * One number, self-referential, no leaderboard. It exists so that with five
   * men alive and a best of five, the sixth is load-bearing in a way no
   * objective text could make him — and so a finished mission stays an open
   * loop instead of a closed one.
   */
  private updatePar(world: World): void {
    const r = this.record;
    if (!r || r.bestHome <= 0) {
      this.par.hidden = true;
      return;
    }
    this.par.hidden = false;
    const alive = world.soldiers.filter((s) => s.alive).length;
    fill(this.par,
      heading('your best'),
      plate(`${r.bestHome} came home`, formatTime(r.bestTime)));
    this.par.classList.toggle('beating', alive > r.bestHome);
    this.par.classList.toggle('behind', alive < r.bestHome && world.phase === Phase.Playing);
  }

  update(world: World): void {
    // Keyed on the difficulty as well as the map. It used to be the map name
    // alone, so replaying the *same* mission at a new setting kept the old chip
    // -- the world was genuinely Elite and the sidebar still said Rookie.
    const header = `${world.map.name}/${world.difficulty}`;
    if (header !== this.lastMission) {
      this.lastMission = header;
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
      this.updatePar(world);
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
      this.updatePar(world);
      return;
    }
    this.showResult(world);
  }

  /**
   * The end-of-mission panel. The original makes a small ceremony of finishing
   * a mission, and the thing it never does is drop you straight back into the
   * next one — so this waits for a click and says who did not come home.
   *
   * The ceremony now has three beats rather than one: what it cost, what it
   * earned, and what it beat. The promotions matter most. A casualty roll on
   * its own is a bill; a casualty roll next to a promotion list is a trade, and
   * a trade is a thing a player argues with themselves about.
   */
  private showResult(world: World): void {
    const won = world.phase === Phase.Won;
    const dead = world.soldiers.filter((s) => !s.alive);
    const survivors = world.soldiers.filter((s) => s.alive);
    const after = this.aftermath;

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

    // Records first: they are the thing that makes a win with casualties still
    // feel like it went somewhere.
    if (won && after) {
      const flags: string[] = [];
      if (after.recordHome) flags.push(`best yet — ${survivors.length} home`);
      if (after.recordTime) flags.push(`fastest — ${formatTime(after.time)}`);
      if (after.newClear) flags.push(`first clear on ${DIFFICULTIES[world.difficulty].name}`);
      if (flags.length > 0) {
        const bar = document.createElement('div');
        bar.className = 'result-records';
        for (const f of flags) {
          bar.appendChild(Object.assign(document.createElement('i'), {
            className: 'result-ribbon', textContent: f,
          }));
        }
        card.appendChild(bar);
      }
    }

    if (dead.length > 0) {
      const roll = document.createElement('div');
      roll.className = 'result-roll';
      roll.appendChild(Object.assign(document.createElement('div'), {
        className: 'result-roll-head',
        textContent: won ? 'lost in action' : 'lost',
      }));
      for (const s of dead) roll.appendChild(plate(s.name, rankShort(s.rank)));
      // A loss changes nothing on the roster, and saying so is what stops the
      // player treating a retry as a punishment to be avoided.
      if (!won) {
        roll.appendChild(Object.assign(document.createElement('div'), {
          className: 'result-note', textContent: 'Not buried. A failed mission costs you nothing but the mission.',
        }));
      }
      card.appendChild(roll);
    } else if (won) {
      card.appendChild(Object.assign(document.createElement('div'), {
        className: 'result-perfect',
        textContent: 'Not a scratch. Every man home.',
      }));
    }

    const promoted = won && after ? after.survivors.filter((s) => s.promoted) : [];
    if (promoted.length > 0) {
      const roll = document.createElement('div');
      roll.className = 'result-roll promotions';
      roll.appendChild(Object.assign(document.createElement('div'), {
        className: 'result-roll-head', textContent: 'promoted',
      }));
      for (const s of promoted) roll.appendChild(plate(s.name, rankName(s.missions)));
      card.appendChild(roll);
    }

    /**
     * Where you go next, laid out as the choice it actually is.
     *
     * Back on the left, onward on the right, on one line, each with an arrow
     * pointing the way it goes -- so the two answers to "again, or on?" are one
     * glance apart instead of a stack of similar buttons. The mission list is
     * the quiet third option underneath, because it is the one you want least
     * often. Boot Hill is not offered here at all: it is reachable from the
     * pause sheet, and a link to the graves is a strange thing to put in front
     * of somebody who has just won.
     */
    const actions = document.createElement('div');
    actions.className = 'result-actions';

    const choice = document.createElement('div');
    choice.className = 'result-choice';
    choice.appendChild(button(won ? 'Replay' : 'Try again', {
      tone: won ? 'default' : 'warn', key: 'R', arrow: 'back',
      onClick: () => this.onRetry?.(),
    }));
    if (won && this.hasNext) {
      choice.appendChild(button('Next mission', {
        tone: 'good', key: 'Enter', arrow: 'forward',
        onClick: () => this.onNext?.(),
      }));
    }
    actions.appendChild(choice);
    actions.appendChild(button('Mission list', {
      key: 'Esc', onClick: () => this.onMissions?.(),
    }));
    card.appendChild(actions);

    fill(this.overlayCard, card);
    this.overlay.hidden = false;
    this.overlay.classList.add('interactive');
  }

  /**
   * Shown briefly at the start of a mission, so you know what you are doing.
   *
   * It also reads the squad out by rank before they go in. Naming the men on the
   * way to the fight rather than on the way back is the whole trick: a roll-call
   * afterwards is an invoice, and the same list beforehand is a stake.
   */
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

    const roll = document.createElement('div');
    roll.className = 'briefing-squad';
    for (const s of world.soldiers) {
      const chip = document.createElement('i');
      chip.className = 'briefing-man';
      if (rankTier(s.rank) >= 3) chip.classList.add('vet');
      if (s.fresh) chip.classList.add('fresh');
      if (s.own) chip.classList.add('own');
      chip.textContent = s.fresh ? `${s.name} — new` : `${s.name} ${rankShort(s.rank)}`;
      roll.appendChild(chip);
    }
    card.appendChild(roll);

    if (this.buried > 0) {
      card.appendChild(Object.assign(document.createElement('div'), {
        className: 'briefing-hill',
        textContent: `${this.buried} on Boot Hill`,
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
