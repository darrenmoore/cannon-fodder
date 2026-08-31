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

  const body = el('span', 'ui-btn-body');
  body.appendChild(el('span', 'ui-btn-label', label));
  if (opts.hint) body.appendChild(el('span', 'ui-btn-hint', opts.hint));
  b.appendChild(body);
  if (opts.key) b.appendChild(el('kbd', 'ui-key', opts.key));

  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}

/**
 * A name plate: chevrons, a label, and an optional right-hand value.
 *
 * This is the shape the original hangs its whole sidebar off. The chevrons are
 * not decoration — they are what makes a plate read as a plate at 12px without
 * a border, and a border is exactly what the project owner asked to be rid of.
 */
export function plate(label: string, value?: string): HTMLDivElement {
  const p = el('div', 'ui-plate');
  p.appendChild(el('i', 'ui-chev left'));
  p.appendChild(el('span', 'ui-plate-label', label));
  if (value !== undefined) p.appendChild(el('span', 'ui-plate-value', value));
  p.appendChild(el('i', 'ui-chev right'));
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
