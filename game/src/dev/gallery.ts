/**
 * The sprite gallery: every drawn thing in the game, on one page, in a browser.
 *
 * Nothing in this project is loaded from a file, so there is no folder of PNGs
 * to open and no way to look at a sprite except by making the game show it to
 * you. To see a wrecked hut you had to level a hut; to see all eight facings of
 * a bazookateer you had to find one and walk round him. `tools/sheet.mjs`
 * answered that with a headless PNG dump, which is fine for a commit and no use
 * at all while you are drawing: it cannot be zoomed, it has no link to one
 * sprite, and it is a picture of the atlas as it was when the tool last ran.
 *
 * This is the live version. It builds the atlas the game builds -- the same
 * `buildAtlas()`, the same bakes -- and puts it on a page at `/sprites.html`,
 * with `#some.dotted.id` deep-linking to a single sprite blown up. That link is
 * the point: when a sprite is added, the link to it can be handed over directly
 * rather than "run the sheet tool and look at row forty".
 *
 * It is a separate esbuild entry point, not a screen inside the game, for two
 * reasons. The game never boots here, so a broken mission cannot stop a sprite
 * being inspected; and `build.mjs` only emits it under `--watch`, so a
 * production build contains no gallery at all rather than a hidden one.
 *
 * The page is deliberately plain. It is scaffolding, and the visual laws that
 * bind the game do not bind it -- but it must not lie about what it is showing,
 * so the backgrounds are the real terrain ramps and the zoom is never smoothed.
 */

import { buildAtlas } from '../render/sprites/index.js';
import { surfaceFor, unpack } from '../render/palette.js';
import { Material } from '../render/terrain.js';
import { SPECIMENS } from './specimens.js';
import type { Sprite } from '../render/sprites/paint.js';
import type { Theme } from '../sim/tiles.js';

/** One row of the gallery: a name, and the canvases it stands for. */
interface Entry {
  id: string;
  group: string;
  note?: string;
  /** Deferred, so a specimen's bake is paid for only when it is looked at. */
  sprites: () => Sprite[];
}

/**
 * Which section of the rail a top-level atlas key belongs to.
 *
 * Anything missing falls into "other" rather than disappearing, which is the
 * important half: a sprite added to the atlas shows up here whether or not
 * anyone remembered this table. Adding the key just files it correctly.
 */
const SECTIONS: Record<string, string> = {
  player: 'units', enemy: 'units', camo: 'units', sniper: 'units',
  bazooka: 'units', officer: 'units', hostage: 'units',
  corpsePlayer: 'units', corpseEnemy: 'units', corpseHostage: 'units',
  trees: 'terrain', grassTufts: 'terrain', tallGrass: 'terrain', rocks: 'terrain',
  hut: 'buildings', cabin: 'buildings', factory: 'buildings',
  outpost: 'buildings', bunker: 'buildings', tent: 'buildings',
  crate: 'objects', supply: 'objects', barrel: 'objects',
  logo: 'branding', logoParts: 'branding',
  mine: 'objects', muzzle: 'objects', icons: 'objects',
};

/**
 * The tab bar, in this order, and shown whether or not anything is in them yet.
 *
 * `ui` and `branding` are both empty today. They are here anyway because the
 * level select and the logo are the next things to be drawn, and a tab reading
 * zero is a statement about what is missing -- which is more useful than a bar
 * that quietly grows a heading later and never says the work was outstanding.
 *
 * Anything filed under a name not in this list still appears, in a trailing
 * `other` tab, so a new sprite can never fall off the page.
 */
const SECTION_ORDER = ['units', 'terrain', 'buildings', 'objects', 'ui', 'branding', 'other'];

/* ------------------------------------------------------------------ grounds */

/**
 * The beds a sprite is judged on.
 *
 * The three themes are not swatches picked to look nice -- they are the actual
 * ground ramps out of `render/palette.ts`, interleaved 1:1 the way the terrain
 * baker interleaves them, because a sprite's outline reads completely
 * differently against a flat fill than against a dithered field, and the
 * dithered field is the one it will actually sit on.
 *
 * `grey` matches `tools/sheet.mjs` so the page and the PNG dump agree. `alpha`
 * is a magenta checker: this game has no alpha, so anything that shows through
 * it is a bug, and it is the fastest way to see one.
 */
type Bed = { id: string; label: string; paint: (g: CanvasRenderingContext2D, w: number, h: number) => void };

const flat = (hex: string) => (g: CanvasRenderingContext2D, w: number, h: number) => {
  g.fillStyle = hex;
  g.fillRect(0, 0, w, h);
};

/** Entries 2 and 3 of a ground ramp are the pair the reference alternates. */
const themeBed = (theme: Theme) => {
  const r = surfaceFor(theme, Material.Ground).ramp;
  const a = unpack(r[2]), b = unpack(r[3]);
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        g.fillStyle = ((x ^ y) & 1) ? a : b;
        g.fillRect(x, y, 1, 1);
      }
    }
  };
};

const BEDS: Bed[] = [
  { id: 'jungle', label: 'jungle', paint: themeBed('jungle') },
  { id: 'desert', label: 'desert', paint: themeBed('desert') },
  { id: 'arctic', label: 'arctic', paint: themeBed('arctic') },
  { id: 'grey', label: 'grey', paint: flat('#6b6b66') },
  { id: 'black', label: 'black', paint: flat('#000000') },
  { id: 'white', label: 'white', paint: flat('#ffffff') },
  {
    id: 'alpha',
    label: 'alpha',
    paint: (g, w, h) => {
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          g.fillStyle = (((x >> 2) ^ (y >> 2)) & 1) ? '#ff00ff' : '#ffffff';
          g.fillRect(x, y, 4, 4);
        }
      }
    },
  },
];

/**
 * Beds are painted at sprite resolution and then blown up with the sprite, so
 * the dither stays one screen pixel per game pixel at 1x and scales in step.
 * Cached per size: a page of 1300 sprites would otherwise repaint the same
 * 13x13 jungle several hundred times.
 */
const bedCache = new Map<string, HTMLCanvasElement>();

function bed(id: string, w: number, h: number): HTMLCanvasElement {
  const key = `${id}:${w}x${h}`;
  const hit = bedCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  (BEDS.find((b) => b.id === id) ?? BEDS[3]).paint(g, w, h);
  bedCache.set(key, c);
  return c;
}

/* ----------------------------------------------------------------- entries */

/**
 * Flattens the atlas to rows, whatever its nesting depth, naming each row by
 * its dotted path -- `trees.broadleaf.2`, `player.0.3`. Dots rather than the
 * brackets `sheet.mjs` uses because these names go in a URL fragment.
 *
 * A row is the innermost array of canvases: `player.0.3` is one man in one
 * facing, and the four walk frames sit side by side in it, which is the only
 * arrangement in which a walk cycle can be read at all.
 */
function collect(): Entry[] {
  const out: Entry[] = [];
  const atlas = buildAtlas() as unknown as Record<string, unknown>;

  const walk = (id: string, v: unknown, group: string): void => {
    if (!v) return;
    if (v instanceof HTMLCanvasElement) { out.push({ id, group, sprites: () => [v] }); return; }
    if (Array.isArray(v)) {
      if (v[0] instanceof HTMLCanvasElement) {
        out.push({ id, group, sprites: () => v as Sprite[] });
        return;
      }
      v.forEach((child, i) => walk(`${id}.${i}`, child, group));
      return;
    }
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      walk(`${id}.${k}`, child, group);
    }
  };

  for (const [key, value] of Object.entries(atlas)) {
    walk(key, value, SECTIONS[key] ?? 'other');
  }

  for (const s of SPECIMENS) {
    const entry: Entry = {
      id: s.id,
      group: s.group,
      sprites: () => { const r = s.draw(); return Array.isArray(r) ? r : [r]; },
    };
    if (s.note) entry.note = s.note;
    out.push(entry);
  }
  return out;
}

/* ------------------------------------------------------------------- pixels */

/**
 * What the page can say about a sprite that looking at it cannot.
 *
 * The semi-transparent count is the load-bearing one. Every sprite here is
 * plotted with hard `fillRect`s and should be either fully opaque or fully
 * absent; a pixel between the two means an anti-aliased edge got in, which is
 * the single thing the visual laws forbid most firmly and the hardest to catch
 * by eye at 1x.
 */
function stats(s: Sprite): { colors: number; semi: number; clear: number } {
  const g = s.getContext('2d')!;
  const d = g.getImageData(0, 0, s.width, s.height).data;
  const seen = new Set<number>();
  let semi = 0, clear = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) { clear++; continue; }
    if (a !== 255) semi++;
    seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  }
  return { colors: seen.size, semi, clear };
}

/* ---------------------------------------------------------------- rendering */

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** One sprite, blown up with no smoothing, on its bed. */
function plate(s: Sprite, scale: number, bedId: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = s.width * scale;
  c.height = s.height * scale;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(bed(bedId, s.width, s.height), 0, 0, c.width, c.height);
  g.drawImage(s, 0, 0, c.width, c.height);
  return c;
}

interface View { scale: number; bedId: string; filter: string; group: string; }

/*
 * Grey by default, and the same grey `tools/sheet.mjs` uses, so the page and
 * the PNG dump do not disagree about what a sprite looks like. Two hundred
 * sprites all sitting on a magnified jungle dither is a wall of vibration; the
 * themes are one click away, and the single-sprite view shows all of them at
 * once, which is where the question of "does this survive the ground" is asked.
 *
 * The tab lives in the query string (`?g=units`) rather than the fragment,
 * because the fragment is the sprite. Both survive together, so a link can be
 * to one sprite, to a tab, or to a sprite with the tab to go back to.
 */
const view: View = {
  scale: 4,
  bedId: 'grey',
  filter: '',
  group: new URLSearchParams(location.search).get('g') ?? 'all',
};

let entries: Entry[] = [];

/**
 * Cells are filled in only once they are on screen. The atlas is ~1400 canvases
 * and blowing every one of them up at 8x on load costs seconds and a lot of
 * memory for sprites nobody scrolled to.
 */
const lazy = new IntersectionObserver((rows) => {
  for (const row of rows) {
    if (!row.isIntersecting) continue;
    const fill = (row.target as HTMLElement & { __fill?: () => void }).__fill;
    if (fill) { fill(); delete (row.target as HTMLElement & { __fill?: () => void }).__fill; }
    lazy.unobserve(row.target);
  }
}, { rootMargin: '400px' });

function cell(e: Entry): HTMLElement {
  const root = el('div', 'cell') as HTMLElement & { __fill?: () => void };
  const link = el('a', 'cell-id');
  link.href = `#${e.id}`;
  link.textContent = e.id;
  root.appendChild(link);
  const strip = el('div', 'strip');
  root.appendChild(strip);
  if (e.note) root.appendChild(el('div', 'cell-note', e.note));

  root.__fill = () => {
    const sprites = e.sprites();
    sprites.forEach((s, i) => {
      const img = plate(s, view.scale, view.bedId);
      // A row of four is four sprites, and each of them is worth a link of its
      // own -- the third stage of a wrecked hut is a thing to point at.
      if (sprites.length === 1) { strip.appendChild(img); return; }
      const a = el('a');
      a.href = `#${e.id}.${i}`;
      a.appendChild(img);
      strip.appendChild(a);
    });
    const first = sprites[0];
    if (first) {
      const many = sprites.length > 1 ? ` x${sprites.length}` : '';
      link.title = `${first.width}x${first.height}${many}`;
    }
  };
  lazy.observe(root);
  return root;
}

/** Section order first, then anything unlisted, then alphabetical. */
const bySection = (a: string, b: string): number => {
  const ia = SECTION_ORDER.indexOf(a), ib = SECTION_ORDER.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
};

function renderGallery(): void {
  const main = document.getElementById('main')!;
  main.textContent = '';
  main.className = 'gallery';

  const q = view.filter.trim().toLowerCase();
  const shown = entries.filter((e) =>
    (view.group === 'all' || e.group === view.group)
    && (!q || e.id.toLowerCase().includes(q)));

  const groups = new Map<string, Entry[]>();
  for (const e of shown) {
    const list = groups.get(e.group);
    if (list) list.push(e); else groups.set(e.group, [e]);
  }
  const order = [...groups.keys()].sort(bySection);

  if (order.length === 0) {
    // Two different kinds of nothing, and saying which is the point: a filter
    // that matched nothing is a typo, an empty tab is work not done yet.
    main.appendChild(el('p', 'empty', q
      ? `nothing matches "${view.filter}"`
      : `nothing in ${view.group} yet`));
    if (!q && (view.group === 'ui' || view.group === 'branding')) {
      main.appendChild(el('p', 'empty',
        'Fixed sprites go in the atlas and appear here on their own. '
        + 'Anything parametric -- a plate that takes a width -- registers in '
        + 'src/dev/specimens.ts instead.'));
    }
    return;
  }

  // Under a single tab the heading would only repeat the tab, and its count.
  const headed = order.length > 1;
  for (const g of order) {
    const section = el('section');
    section.id = `g-${g}`;
    if (headed) {
      const h = el('h2');
      h.appendChild(el('span', undefined, g));
      h.appendChild(el('span', 'count', String(groups.get(g)!.length)));
      section.appendChild(h);
    }
    const grid = el('div', 'grid');
    for (const e of groups.get(g)!) grid.appendChild(cell(e));
    section.appendChild(grid);
    main.appendChild(section);
  }
}

/**
 * One sprite, alone: the view a link in a message lands on.
 *
 * Every bed at once rather than the currently selected one, because the whole
 * question being asked of a single sprite is usually "does its outline survive
 * the ground it sits on", and that is four answers, not one.
 */
function renderDetail(id: string): void {
  const main = document.getElementById('main')!;
  main.textContent = '';
  main.className = 'detail';

  /*
   * `hut` is one entry holding four canvases, because four stages of damage
   * only mean anything side by side. But `hut.2` has to resolve too, or the
   * third stage is a thing that exists and cannot be linked to -- so an id that
   * matches nothing is retried as parent-plus-index before giving up.
   */
  let e = entries.find((x) => x.id === id);
  let pick: number | null = null;
  if (!e) {
    const m = /^(.*)\.(\d+)$/.exec(id);
    const parent = m ? entries.find((x) => x.id === m[1]) : undefined;
    if (m && parent && parent.sprites()[Number(m[2])]) {
      e = parent;
      pick = Number(m[2]);
    }
  }
  if (!e) {
    main.appendChild(el('p', 'empty', `no sprite called "${id}"`));
    const back = el('a', 'back', 'back to the gallery');
    back.href = '#';
    main.appendChild(back);
    return;
  }

  const back = el('a', 'back', '← all sprites');
  back.href = '#';
  main.appendChild(back);

  const all = e.sprites();
  const sprites = pick === null ? all : [all[pick]];
  const head = el('div', 'detail-head');
  head.appendChild(el('h1', undefined, id));
  const first = sprites[0];
  const st = stats(first);
  const meta = [
    `${first.width}x${first.height}`,
    sprites.length > 1 ? `${sprites.length} in the row` : null,
    `${st.colors} colours`,
    `${st.clear} transparent`,
    st.semi > 0 ? `${st.semi} SEMI-TRANSPARENT` : 'no soft pixels',
  ].filter(Boolean).join('  ·  ');
  const line = el('div', st.semi > 0 ? 'meta bad' : 'meta', meta);
  head.appendChild(line);
  if (e.note) head.appendChild(el('div', 'meta', e.note));
  if (pick !== null) {
    const row = el('a', 'meta', `one of ${all.length} — see the whole row`);
    row.href = `#${e.id}`;
    head.appendChild(row);
  }
  main.appendChild(head);

  const beds = el('div', 'bed-grid');
  for (const b of BEDS) {
    const box = el('div', 'bed-box');
    const strip = el('div', 'strip');
    for (const s of sprites) strip.appendChild(plate(s, view.scale, b.id));
    box.appendChild(strip);
    box.appendChild(el('div', 'bed-name', b.label));
    beds.appendChild(box);
  }
  main.appendChild(beds);

  main.appendChild(el('h2', undefined, 'scales'));
  const zooms = el('div', 'zooms');
  const strip = el('div', 'strip');
  for (const z of [1, 2, 3, 4, 6, 8, 12]) {
    const box = el('div', 'zoom');
    box.appendChild(plate(first, z, view.bedId));
    box.appendChild(el('div', 'zoom-label', `${z}x`));
    strip.appendChild(box);
  }
  zooms.appendChild(strip);
  main.appendChild(zooms);
}

function route(): void {
  const id = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (id) renderDetail(id); else renderGallery();
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------- chrome */

function buildRail(): void {
  const rail = document.getElementById('rail')!;

  const search = document.getElementById('search') as HTMLInputElement;
  search.addEventListener('input', () => {
    view.filter = search.value;
    if (!location.hash) renderGallery();
  });

  const scale = document.getElementById('scale') as HTMLSelectElement;
  for (const z of [1, 2, 3, 4, 6, 8, 12, 16]) {
    const o = el('option', undefined, `${z}x`);
    o.value = String(z);
    if (z === view.scale) o.selected = true;
    scale.appendChild(o);
  }
  scale.addEventListener('change', () => { view.scale = Number(scale.value); route(); });

  const beds = document.getElementById('beds')!;
  const paint = () => {
    for (const b of beds.children) {
      b.classList.toggle('on', (b as HTMLElement).dataset.bed === view.bedId);
    }
  };
  for (const b of BEDS) {
    const btn = el('button', 'swatch', b.label);
    btn.dataset.bed = b.id;
    btn.addEventListener('click', () => { view.bedId = b.id; paint(); route(); });
    beds.appendChild(btn);
  }
  paint();

  rail.appendChild(el('p', 'total', `${entries.length} entries`));
}

/**
 * The tabs.
 *
 * Every name in `SECTION_ORDER` gets one whether or not it has anything in it,
 * plus `all` in front and any group nobody declared at the end. A tab reading
 * zero is dimmed but not disabled -- clicking an empty one is how you find out
 * where the thing you are about to draw is supposed to go.
 */
function buildTabs(): void {
  const bar = document.getElementById('tabs')!;
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.group, (counts.get(e.group) ?? 0) + 1);

  // `other` is the exception to showing an empty tab: it is not a place to put
  // anything, it is where things land when nobody said where they go, so an
  // empty one is the correct state and does not need announcing.
  const names = ['all', ...new Set([...SECTION_ORDER, ...counts.keys()].sort(bySection))]
    .filter((g) => g === 'all'
      || (g !== 'other' && SECTION_ORDER.includes(g))
      || (counts.get(g) ?? 0) > 0);

  for (const g of names) {
    const n = g === 'all' ? entries.length : counts.get(g) ?? 0;
    const tab = el('button', n === 0 ? 'tab bare' : 'tab');
    tab.dataset.group = g;
    tab.appendChild(el('span', undefined, g));
    tab.appendChild(el('span', 'count', String(n)));
    tab.addEventListener('click', () => {
      view.group = g;
      // A tab click means "show me this group", so it leaves the single-sprite
      // view if that is where you are -- and the hash change routes for us.
      if (location.hash) { location.hash = ''; return; }
      syncUrl();
      paintTabs();
      renderGallery();
      window.scrollTo(0, 0);
    });
    bar.appendChild(tab);
  }
  paintTabs();
}

function paintTabs(): void {
  for (const t of document.getElementById('tabs')!.children) {
    t.classList.toggle('on', (t as HTMLElement).dataset.group === view.group);
  }
}

/** The tab in the address bar, without adding a history entry per click. */
function syncUrl(): void {
  const q = view.group === 'all' ? '' : `?g=${encodeURIComponent(view.group)}`;
  history.replaceState(null, '', `${location.pathname}${q}${location.hash}`);
}

entries = collect();
buildRail();
buildTabs();
syncUrl();
route();
window.addEventListener('hashchange', () => { syncUrl(); paintTabs(); route(); });
