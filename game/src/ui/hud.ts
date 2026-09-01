import { CONFIG } from '../config.js';
import { DIFFICULTIES } from '../sim/difficulty.js';
import { objectiveText } from '../sim/objectives.js';
import { formatTime, rankName, rankShort, rankTier } from '../sim/campaign.js';
import { protectedBuilding } from '../sim/objectives.js';
import { bindKeys, button, fill, heading, meter, plate, readout } from './ui.js';
import { setBlackout } from './blackout.js';
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

  /** The mission's own orders, worded once and shown for the whole mission. */
  private readonly goal = document.createElement('div');

  /**
   * The three tools at the foot of the sidebar: leave, restart, settings.
   * The hud only reports the press; what a press means -- and the confirmation
   * in front of two of them -- belongs to main.ts, which owns the mission.
   */
  onExit: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onSettings: (() => void) | null = null;

  /** One plate per soldier, rebuilt only when the squad changes. */
  private plates: Array<{ root: HTMLElement; alive: boolean; name: string }> = [];
  private lastPhase: Phase | null = null;
  private lastMission = '';
  private lastGrenades = -1;
  /** While the briefing banner is up, `update` leaves the overlay alone. */
  private briefing = false;

  /**
   * True while the player is still reading the briefing.
   *
   * The shell holds the simulation still for exactly as long as this is set. A
   * mission that starts behind its own title screen spends the player's first
   * seconds without him: men walk, the survive clock runs down, and on a bad
   * map somebody can be shot before the objective has been read.
   */
  get briefingUp(): boolean { return this.briefing; }
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
/*
     * The tools live at the very bottom, under the hints: reachable all
     * mission, and as far as a control can be from the battlefield reads --
     * these are the three buttons whose cost is highest and urgency lowest.
     */
    const tools = document.createElement('div');
    tools.className = 'hud-tools';
    const tool = (cls: string, label: string, fire: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hud-tool ' + cls;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', fire);
      return b;
    };
    tools.append(
      tool('t-exit', 'Leave the mission', () => this.onExit?.()),
      tool('t-restart', 'Restart the mission', () => this.onRestart?.()),
      tool('t-gear', 'Settings', () => this.onSettings?.()),
    );

    // The key-shortcut crib that used to sit here is gone on the owner's
    // say-so. The action bar already labels every control it fronts, and five
    // lines of grey micro-text made the sidebar read as documentation.
    fill(this.root, body, tools);
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
    /*
     * The screen goes out with the mission, chrome included.
     *
     * Driven from `phaseTime` rather than a CSS transition, so it takes the
     * same time on every machine and a capture can be frozen at an exact point
     * in it -- the same bargain the fixed simulation step makes. The one place
     * the no-alpha rule is deliberately spent, and the reference spends it in
     * the same place.
     */
    if (world.phase !== Phase.Playing) {
      const { hold, fade } = CONFIG.banner;
      setBlackout(Math.max(0, Math.min(1, (world.phaseTime - (hold - fade)) / fade)));
    }
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
      // The orders, in words, for the life of the mission. The ORDERS panel
      // below counts the live state; this is the standing answer to "what am I
      // actually here to do", which the owner asked to be visible at all times.
      this.goal.className = 'hud-goal';
      this.goal.textContent = objectiveText(world.map);
      this.mission.appendChild(this.goal);
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
    // A hold clock that stops is a mission that quietly stopped moving: say it
    // in colour, not only in the two words at the end of the status line.
    this.objective.classList.toggle('stalled',
      world.map.objective === 'hold' && !world.inZone && world.phase === Phase.Playing);

    // Two different clocks, drawn the same way: `survive` counts you toward
    // winning, `timelimit` counts you toward losing. Both are "seconds left",
    // which is the only thing the player has to act on.
    const span = world.map.timeLimit > 0 ? world.map.timeLimit
      : world.map.objective === 'survive' ? world.map.duration
        : 0;
    if (span > 0) {
      this.timer.root.hidden = false;
      // The label is the difference between the two clocks. On `survive` the
      // bar filling is you winning; under a `timelimit` it is you running out,
      // and calling both of them "hold" told the player the wrong thing about
      // which one he was looking at.
      const head = this.timer.root.querySelector('.ui-meter-label');
      if (head) head.textContent = world.map.timeLimit > 0 ? 'time left' : 'hold';
      // m:ss, not a bare seconds count -- "240S" read as a unit nobody ships.
      const left = Math.max(0, span - world.time);
      this.timer.set(1 - left / span, formatTime(Math.ceil(left)));
    } else {
      this.timer.root.hidden = true;
    }

    // The briefing owns the overlay until it is dismissed.
    if (this.briefing && world.phase === Phase.Playing) return;
    if (world.phase === this.lastPhase) return;
    // And the banner owns the screen when a mission ends. The panel used to
    // arrive on the same frame the mission resolved, which left no moment at
    // all between playing and reading -- the ceremony the original makes of
    // finishing is the banner, and a card over the top of it cancels it.
    if (world.phase !== Phase.Playing && world.phaseTime < CONFIG.banner.hold) return;
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

    /*
     * The caps this panel draws have to be real.
     *
     * `button()` renders a `data-key` cap beside each label, and `bindKeys` is
     * what turns one into a key you can press -- but it was called by sheet.ts
     * and by nothing else, so the end panel printed `R`, `Enter` and `Esc` and
     * honoured none of them. Measured, one at a time: Enter did nothing at all,
     * R restarted only because input.ts happens to bind R itself, and Esc
     * reached the pause handler and stacked a second modal on top of the win
     * panel. A player who presses the key the game has just printed at him is
     * owed the thing it says.
     *
     * It binds in capture and stops the press, which is also what keeps Esc
     * from reaching `input.onPause` underneath.
     */
    this.unbindResultKeys?.();
    this.unbindResultKeys = bindKeys(this.overlay);
  }

  /** Dropped when the panel comes down, so its keys die with it. */
  private unbindResultKeys: (() => void) | null = null;

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
    const objective = objectiveText(world.map);
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
    // A hidden panel must not keep answering keys: the mission underneath owns
    // R and Esc again the moment the card is gone.
    this.unbindResultKeys?.();
    this.unbindResultKeys = null;
  }
}

function failureReason(world: World): string {
  if (world.map.objective === 'rescue' && world.hostages.some((h) => !h.alive && !h.delivered)) {
    return 'A hostage was killed. There is no partial credit.';
  }
  // Checked before the wipe-out line, because a squad standing in the open
  // watching its outpost come down is not a squad that was wiped out, and being
  // told it was is the game failing to explain what just happened.
  const keep = protectedBuilding(world);
  if (keep && !keep.standing) return 'The outpost was levelled. There was nothing left to hold.';
  if (world.map.objective === 'collect' && world.supplies.some((s) => !s.alive && !s.collected)) {
    return 'The supplies went up. There was nothing left to recover.';
  }
  // Before the wipe-out line for the same reason as the others: a squad that
  // ran out of time is standing there reading the panel.
  if (world.map.timeLimit > 0 && world.time >= world.map.timeLimit) {
    return 'The clock ran out.';
  }
  // Same reasoning: a squad that got somebody killed on a covert approach is
  // not a squad that was wiped out, and it is still standing there reading it.
  if (world.map.nokill && world.kills > 0) {
    return 'Somebody died. A covert approach is over the moment it makes a body.';
  }
  // Says the part of the rules the mission never states on screen: the men
  // you brought were the mission's whole supply (200-qa 001 -- the owner sat
  // waiting for reinforcements that do not exist in this game).
  return 'The squad was wiped out. Nobody else was coming.';
}
