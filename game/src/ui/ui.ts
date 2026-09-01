/**
 * The UI kit.
 *
 * Everything chrome-shaped in the game is built from these five pieces, so the
 * sidebar, the mission select and the end-of-mission panel cannot drift apart.
 * The look is the original's: bevelled military-green plates, chevrons where a
 * modern UI would put a border, and type that is always uppercase and always
 * letterspaced.
 *
 * These return plain elements and never touch the document. The caller decides
 * where a thing goes; this file only decides what it looks like.
 */

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K, className: string, text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export type PanelTone = 'default' | 'dark' | 'warn' | 'good';

/** A bevelled plate. The base of everything else here. */
export function panel(tone: PanelTone = 'default'): HTMLDivElement {
  return el('div', `ui-panel tone-${tone}`);
}

export interface ButtonOptions {
  tone?: PanelTone;
  /** Shown small and dim under the label. */
  hint?: string;
  /** Keyboard shortcut, drawn as a key cap on the right. */
  key?: string;
  /**
   * A direction arrow, drawn on the side it points to.
   *
   * "Back" and "onward" are the two things the end-of-mission panel is asking
   * about, and an arrow says which is which faster than reading two labels.
   */
  arrow?: 'back' | 'forward';
  onClick?: () => void;
}

/**
 * The standard button. One shape for every affordance in the game — the mission
 * list, "next mission", "try again", the difficulty tabs — so the player only
 * ever has to learn one thing to click.
 */
export function button(label: string, opts: ButtonOptions = {}): HTMLButtonElement {
  const b = el('button', `ui-btn tone-${opts.tone ?? 'default'}`);
  b.type = 'button';

  // The arrow sits on the button beside the body, not inside it: the body is a
  // column (label over hint), and an arrow in there stacks instead of pointing.
  if (opts.arrow === 'back') b.appendChild(el('span', 'ui-btn-arrow back', '◀'));
  const body = el('span', 'ui-btn-body');
  body.appendChild(el('span', 'ui-btn-label', label));
  if (opts.hint) body.appendChild(el('span', 'ui-btn-hint', opts.hint));
  b.appendChild(body);
  if (opts.arrow === 'forward') b.appendChild(el('span', 'ui-btn-arrow fwd', '▶'));
  // Recorded on the element as well as drawn, so `bindKeys` can make the cap
  // mean something rather than leaving it as decoration that lies.
  if (opts.key) {
    b.dataset.key = opts.key;
    b.appendChild(el('kbd', 'ui-key', opts.key));
  }

  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}

/**
 * A name plate: a label, and an optional right-hand value.
 *
 * It used to be flanked by two chevrons, on the reasoning that they were what
 * made a plate read as a plate without a border. They read as arrows instead --
 * identical on every plate whatever the man's rank, and pointing at nothing.
 * Chevrons mean rank, so rank is the only thing they are allowed to say now,
 * and they say it over a promoted soldier's head in the world where it can
 * change a decision. See `rankPips` in render.ts.
 */
export function plate(label: string, value?: string): HTMLDivElement {
  const p = el('div', 'ui-plate');
  p.appendChild(el('span', 'ui-plate-label', label));
  if (value !== undefined) p.appendChild(el('span', 'ui-plate-value', value));
  return p;
}

/** A small stat: a label above a value, for counters that change. */
export function readout(label: string, value = '0'): {
  root: HTMLDivElement; set(v: string): void; flash(): void;
} {
  const root = el('div', 'ui-readout');
  const v = el('b', 'ui-readout-value', value);
  root.appendChild(v);
  root.appendChild(el('span', 'ui-readout-label', label));
  let last = value;
  return {
    root,
    set(next: string): void {
      if (next === last) return;
      last = next;
      v.textContent = next;
    },
    /** Pulses the value, for when something was spent or gained. */
    flash(): void {
      v.classList.remove('pulse');
      // Reading offsetWidth restarts the animation; without it a second flash
      // inside one animation cycle does nothing at all.
      void v.offsetWidth;
      v.classList.add('pulse');
    },
  };
}

/** A row of small squares, one per unit. Dead ones go dark. */
export function pips(count: number): { root: HTMLDivElement; set(alive: boolean[]): void } {
  const root = el('div', 'ui-pips');
  const cells = Array.from({ length: count }, () => {
    const c = el('i', 'ui-pip');
    root.appendChild(c);
    return c;
  });
  return {
    root,
    set(alive: boolean[]): void {
      for (let i = 0; i < cells.length; i++) cells[i].classList.toggle('dead', !alive[i]);
    },
  };
}

/** A labelled horizontal bar, for timers and building health. */
export function meter(label: string): {
  root: HTMLDivElement; set(fraction: number, text?: string): void;
} {
  const root = el('div', 'ui-meter');
  const head = el('div', 'ui-meter-head');
  const name = el('span', 'ui-meter-label', label);
  const text = el('span', 'ui-meter-text', '');
  head.appendChild(name);
  head.appendChild(text);
  const track = el('div', 'ui-meter-track');
  const fill = el('i', 'ui-meter-fill');
  track.appendChild(fill);
  root.appendChild(head);
  root.appendChild(track);
  return {
    root,
    set(fraction: number, label2?: string): void {
      fill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
      if (label2 !== undefined) text.textContent = label2;
    },
  };
}

/** A section heading inside a panel. */
export const heading = (text: string): HTMLDivElement => el('div', 'ui-heading', text);

/** Clears an element and appends the given children. */
export function fill(host: HTMLElement, ...children: Node[]): void {
  host.textContent = '';
  for (const c of children) host.appendChild(c);
}

/**
 * A round action button, for the bar that sits over the battlefield.
 *
 * Different from `button` on purpose: that one is a plate in a list of plates
 * and reads left to right, this one is a target a thumb finds without looking.
 * It carries a glyph, a short label, an optional count badge and an optional
 * cooldown ring, because every one of those is something the player otherwise
 * has to infer from a press that did nothing.
 */
export interface ActionOptions {
  glyph: string;
  label: string;
  /** Drawn small under the label. The keyboard shortcut, on a desktop. */
  hint?: string;
  tone?: PanelTone;
  /** Bigger, for the one action the thumb should land on by default. */
  primary?: boolean;
}

export interface ActionButton {
  root: HTMLButtonElement;
  /** A number in the corner: grenades left. `null` removes it. */
  setBadge(value: string | null): void;
  /** 0..1 of a cooldown remaining. Drains anticlockwise; 0 clears it. */
  setCooldown(fraction: number): void;
  setActive(on: boolean): void;
  setDisabled(on: boolean): void;
}

export function action(opts: ActionOptions): ActionButton {
  const root = el('button', `ui-action tone-${opts.tone ?? 'default'}`);
  root.type = 'button';
  if (opts.primary) root.classList.add('primary');

  const ring = el('i', 'ui-action-ring');
  const glyph = el('span', 'ui-action-glyph', opts.glyph);
  const label = el('span', 'ui-action-label', opts.label);
  const badge = el('i', 'ui-action-badge');
  badge.hidden = true;
  root.append(ring, glyph, label, badge);
  if (opts.hint) root.append(el('span', 'ui-action-hint', opts.hint));

  return {
    root,
    setBadge(value: string | null): void {
      badge.hidden = value === null;
      if (value !== null) badge.textContent = value;
    },
    setCooldown(fraction: number): void {
      const f = Math.max(0, Math.min(1, fraction));
      ring.style.opacity = f > 0.001 ? '1' : '0';
      // A conic gradient rather than an SVG arc: one property to animate, and
      // it costs nothing on a phone.
      ring.style.background =
        `conic-gradient(rgba(10,13,5,0.72) ${f * 360}deg, transparent 0)`;
    },
    setActive(on: boolean): void { root.classList.toggle('on', on); },
    setDisabled(on: boolean): void {
      root.classList.toggle('off', on);
      root.disabled = on;
    },
  };
}

/** A small inline tag. Used for a cancel affordance and for card metadata. */
export function chip(text: string, className = ''): HTMLSpanElement {
  return el('span', `ui-chip ${className}`.trim(), text);
}

export interface SegmentedOptions<T extends string> {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange(id: T): void;
}

/**
 * A row of mutually exclusive choices, each at least one tap tall.
 *
 * The difficulty tabs were a row of 30px-high buttons that a media query hid on
 * a narrow screen. This is the same control at a size a thumb can hit, and it
 * scrolls sideways rather than disappearing when four of them will not fit.
 */
export function segmented<T extends string>(opts: SegmentedOptions<T>): {
  root: HTMLDivElement; set(value: T): void;
} {
  const root = el('div', 'ui-segmented');
  const buttons = opts.options.map(({ id, label }) => {
    const b = el('button', `ui-seg diff-${id}`);
    b.type = 'button';
    b.textContent = label;
    b.dataset.id = id;
    // The control moves its own highlight. It used to only call onChange and
    // trust the caller to call set() back, which no caller did -- so every
    // setting changed for real while the buttons claimed nothing had.
    b.addEventListener('click', () => { set(id); opts.onChange(id); });
    root.appendChild(b);
    return b;
  });
  const set = (value: T): void => {
    for (const b of buttons) b.classList.toggle('on', b.dataset.id === value);
  };
  set(opts.value);
  return { root, set };
}

export interface SliderOptions {
  /** 0..1. */
  value: number;
  /** Fired on every change while dragging, so volume can be heard live. */
  onChange(value: number): void;
}

/**
 * A horizontal level bar with a square handle: track, fill, block. Values are
 * quantised to twenty steps -- a slider that reports 0.4137 is a modern
 * control wearing a costume, and nothing downstream can hear the difference
 * anyway.
 */
export function slider(opts: SliderOptions): { root: HTMLDivElement; set(value: number): void } {
  const root = el('div', 'ui-slider');
  const track = el('div', 'ui-slider-track');
  const fillBar = el('i', 'ui-slider-fill');
  const handle = el('i', 'ui-slider-handle');
  track.append(fillBar, handle);
  root.appendChild(track);

  let current = 0;
  const paint = (): void => {
    const pct = `${Math.round(current * 100)}%`;
    fillBar.style.width = pct;
    handle.style.left = pct;
  };
  const set = (value: number): void => {
    current = Math.round(Math.max(0, Math.min(1, value)) * 20) / 20;
    paint();
  };
  set(opts.value);

  const fromEvent = (e: PointerEvent): void => {
    const r = track.getBoundingClientRect();
    const before = current;
    set((e.clientX - r.left) / r.width);
    if (current !== before) opts.onChange(current);
  };
  root.addEventListener('pointerdown', (e) => {
    root.setPointerCapture(e.pointerId);
    fromEvent(e);
  });
  root.addEventListener('pointermove', (e) => {
    if (root.hasPointerCapture(e.pointerId)) fromEvent(e);
  });

  return { root, set };
}

/**
 * Makes the key caps on a set of buttons real.
 *
 * `button({ key: 'Enter' })` has always drawn a keycap and never bound
 * anything, so the end-of-mission panel has been advertising shortcuts that do
 * not work. This binds every declared key while the container is up, and hands
 * back the teardown -- which is why it takes a container rather than being done
 * per button: the binding has to end when the panel does.
 */
export function bindKeys(root: HTMLElement): () => void {
  const onKey = (e: KeyboardEvent): void => {
    const el2 = document.activeElement;
    if (el2 instanceof HTMLInputElement || el2 instanceof HTMLTextAreaElement) return;
    const wanted = e.key === 'Escape' ? 'esc' : e.key.toLowerCase();
    for (const b of root.querySelectorAll<HTMLButtonElement>('button[data-key]')) {
      if (b.dataset.key?.toLowerCase() !== wanted) continue;
      e.preventDefault();
      // Stop the same press also reaching the mission underneath.
      e.stopPropagation();
      b.click();
      return;
    }
  };
  // Capture, so a panel that is up wins the key over the game behind it.
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}
