/**
 * Level generator.
 *
 * Writes every mission in `data/` from the campaign table at the bottom of this
 * file. Each entry names a size, a theme, an objective and the one new idea the
 * mission is built around; the generator lays down terrain to suit and places
 * the entities that objective needs.
 *
 * Everything is seeded, so the same table always produces the same maps -- edit
 * a seed to reroll one level without disturbing the others. Generated files are
 * plain ASCII and meant to be hand-edited afterwards; see docs/map-format.md.
 *
 *   node tools/generate-levels.mjs             # write data/*.map
 *   node tools/generate-levels.mjs --check     # verify without writing
 *   node tools/generate-levels.mjs river-run   # regenerate one mission
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));

// ---------------------------------------------------------------- helpers

const GRASS = '.', SAND = ',', ROAD = '_', TREE = 'T', WATER = '~', DEEP = 'W',
      BRIDGE = '=', ROCK = '#', HUT = 'h', FACTORY = 'F', OUTPOST = 'O', FENCE = '+',
      TALL = '"', QUICK = '%', ICE = 'i', TENT = 'A';

/** Mulberry32: small, fast, and identical across runs. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Grid {
  constructor(w, h, fill = GRASS, seed = 1) {
    this.w = w;
    this.h = h;
    this.rnd = rng(seed);
    this.cells = Array.from({ length: h }, () => Array(w).fill(fill));
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inBounds(x, y) ? this.cells[y][x] : TREE; }
  set(x, y, c) { if (this.inBounds(x, y)) this.cells[y][x] = c; }

  /** Sets only if the target is one of `over` -- keeps features from stomping. */
  paint(x, y, c, over = null) {
    if (!this.inBounds(x, y)) return;
    if (over && !over.includes(this.cells[y][x])) return;
    this.cells[y][x] = c;
  }

  fillRect(x0, y0, w, h, c) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }

  /** Soft-edged blob, used for forests, clearings and hazard patches. */
  blob(cx, cy, r, c, density = 0.9, over = null) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = Math.hypot(x - cx, (y - cy) * 1.12);
        if (d > r) continue;
        if (this.rnd() > density * (1 - d / (r + 1.3))) continue;
        this.paint(x, y, c, over);
      }
    }
  }

  disc(cx, cy, r, c, over = null) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (Math.hypot(x - cx, y - cy) <= r) this.paint(x, y, c, over);
      }
    }
  }

  border(thickness, c) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (x < thickness || y < thickness || x >= this.w - thickness || y >= this.h - thickness) {
          this.set(x, y, c);
        }
      }
    }
  }

  /**
   * The wall around the world, as terrain rather than as a frame.
   *
   * `border` draws a rectangle of uniform thickness, and a rectangle is exactly
   * what you notice: the edge of every mission reads as a picture frame with a
   * ruler-straight inner line. The reference's maps are bounded by *landscape* —
   * a treeline that comes and goes, thickening into a headland here and thinning
   * to a few trunks there, with copses breaking off inland and clearings biting
   * into it.
   *
   * So the thickness is a smooth random walk per edge, and the inner boundary is
   * roughed up afterwards by throwing blobs at it from both sides. `min` is
   * honoured everywhere, so the world stays sealed however the walk wanders.
   */
  frame(c, { min = 3, max = 9, lumps = true } = {}) {
    // One thickness walk per edge, low-frequency so it undulates rather than
    // jitters. Two sines at odd ratios never repeat over a map's width.
    const phase = [this.rnd(), this.rnd(), this.rnd(), this.rnd()].map((v) => v * Math.PI * 2);
    const depth = (edge, i) => {
      const a = Math.sin(i / 11 + phase[edge]);
      const b = Math.sin(i / 4.3 + phase[edge] * 1.7);
      const t = (a * 0.68 + b * 0.32 + 1) / 2;
      return Math.round(min + t * (max - min));
    };

    for (let x = 0; x < this.w; x++) {
      const top = depth(0, x), bottom = depth(1, x);
      for (let y = 0; y < top; y++) this.set(x, y, c);
      for (let y = 0; y < bottom; y++) this.set(x, this.h - 1 - y, c);
    }
    for (let y = 0; y < this.h; y++) {
      const left = depth(2, y), right = depth(3, y);
      for (let x = 0; x < left; x++) this.set(x, y, c);
      for (let x = 0; x < right; x++) this.set(this.w - 1 - x, y, c);
    }

    if (!lumps) return;

    // Copses breaking inland off the treeline, and clearings biting back into
    // it. Both are pinned to the edge so they read as part of the same mass.
    const along = 2 * (this.w + this.h);
    const outcrops = Math.max(6, Math.round(along / 34));
    for (let i = 0; i < outcrops; i++) {
      const [x, y] = this.edgePoint(max + 2);
      this.blob(x, y, 2 + this.rnd() * 3.5, c, 0.92, [GRASS, SAND, TALL, ICE]);
    }
    for (let i = 0; i < Math.round(outcrops * 0.55); i++) {
      const [x, y] = this.edgePoint(min + 1);
      this.blob(x, y, 1.5 + this.rnd() * 2.5, GRASS, 0.85, [c]);
    }
  }

  /** A random point within `reach` tiles of some edge of the map. */
  edgePoint(reach) {
    const side = (this.rnd() * 4) | 0;
    const d = this.rnd() * reach;
    if (side === 0) return [this.rnd() * this.w, d];
    if (side === 1) return [this.rnd() * this.w, this.h - 1 - d];
    if (side === 2) return [d, this.rnd() * this.h];
    return [this.w - 1 - d, this.rnd() * this.h];
  }

  /**
   * Majority smoothing, the cellular-automaton kind.
   *
   * Blob painting leaves stragglers: single tiles of grass marooned in sand, or
   * a lone sand tile in a field. At one character per tile that is invisible in
   * the source, and on screen it is a hard-edged 16px square that no amount of
   * edge warping can disguise — the eye finds an isolated rectangle instantly.
   *
   * Each pass replaces a tile with whichever of its eight neighbours is most
   * common, but only when that neighbour holds a clear majority, so real
   * features keep their shape and only the noise dissolves. Solid terrain is
   * left alone: smoothing a treeline can seal a route.
   */
  smooth(passes = 1, kinds = [GRASS, SAND, TALL, ICE]) {
    const soft = new Set(kinds);
    for (let pass = 0; pass < passes; pass++) {
      const next = this.cells.map((row) => row.slice());
      for (let y = 1; y < this.h - 1; y++) {
        for (let x = 1; x < this.w - 1; x++) {
          if (!soft.has(this.get(x, y))) continue;
          const tally = new Map();
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const n = this.get(x + dx, y + dy);
              if (!soft.has(n)) continue;
              tally.set(n, (tally.get(n) ?? 0) + 1);
            }
          }
          let best = null, bestN = 0;
          for (const [tile, n] of tally) if (n > bestN) { best = tile; bestN = n; }
          // Six of eight neighbours agreeing is a clear majority; five is not.
          if (best && best !== this.get(x, y) && bestN >= 6) next[y][x] = best;
        }
      }
      this.cells = next;
    }
  }

  /** Free tiles a unit can stand on -- excludes every solid or hazardous tile. */
  isOpen(x, y) {
    return [GRASS, SAND, ROAD, TALL, ICE, BRIDGE].includes(this.get(x, y));
  }

  /** Flood fill of reachable tiles from a start, used for the sanity checks. */
  reachable(sx, sy) {
    const seen = new Set();
    const walkable = (x, y) => ![TREE, ROCK, HUT, FACTORY, OUTPOST, FENCE, DEEP].includes(this.get(x, y));
    if (!walkable(sx, sy)) return seen;
    const stack = [[sx, sy]];
    seen.add(`${sx},${sy}`);
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;
        if (!this.inBounds(nx, ny) || seen.has(key) || !walkable(nx, ny)) continue;
        seen.add(key);
        stack.push([nx, ny]);
      }
    }
    return seen;
  }

  toString() { return this.cells.map((r) => r.join('')).join('\n'); }
}

// --------------------------------------------------------------- features

/**
 * A meandering river. Returns the crossings it left, so callers can route the
 * player through them. `deep` makes the channel impassable except at bridges.
 */
function river(g, { axis = 'v', width = 3, wobble = 6, crossings = [], deep = false } = {}) {
  const along = axis === 'v' ? g.h : g.w;
  const across = axis === 'v' ? g.w : g.h;
  const mid = across / 2;
  const phase = g.rnd() * Math.PI * 2;
  const centreAt = (i) =>
    Math.round(mid + wobble * Math.sin(i / 13 + phase) + (wobble * 0.45) * Math.sin(i / 5.5 + phase * 2));

  const body = deep ? DEEP : WATER;
  for (let i = 0; i < along; i++) {
    const c = centreAt(i);
    for (let k = -width; k <= width; k++) {
      const x = axis === 'v' ? c + k : i;
      const y = axis === 'v' ? i : c + k;
      // A shallow margin either side, so a deep river still has a wadeable lip.
      const edge = Math.abs(k) === width;
      g.set(x, y, deep && !edge ? DEEP : WATER);
    }
    const bankA = axis === 'v' ? [c - width - 1, i] : [i, c - width - 1];
    const bankB = axis === 'v' ? [c + width + 1, i] : [i, c + width + 1];
    g.paint(bankA[0], bankA[1], SAND, [GRASS, TALL]);
    g.paint(bankB[0], bankB[1], SAND, [GRASS, TALL]);
  }

  const bridges = [];
  for (const at of crossings) {
    const i = Math.round(at * (along - 1));
    // Two tiles wide, and only long enough to reach dry ground either side. A
    // crossing five tiles deep and four wider than the river is not a bridge,
    // it is a plaza with water under it.
    for (let d = -1; d <= 0; d++) {
      const c = centreAt(i + d);
      for (let k = -width - 1; k <= width + 1; k++) {
        const x = axis === 'v' ? c + k : i + d;
        const y = axis === 'v' ? i + d : c + k;
        if ([WATER, DEEP, SAND].includes(g.get(x, y))) g.set(x, y, BRIDGE);
      }
    }
    bridges.push(axis === 'v' ? { x: centreAt(i), y: i } : { x: i, y: centreAt(i) });
  }
  return bridges;
}

/** A road between two points, carved as a 2-wide track. */
function road(g, from, to) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    const wobble = Math.round(Math.sin(s / 9) * 1.5);
    for (let k = -1; k <= 1; k++) {
      g.paint(x + k, y + wobble, ROAD, [GRASS, SAND, TALL, ICE]);
      g.paint(x + wobble, y + k, ROAD, [GRASS, SAND, TALL, ICE]);
    }
  }
}

function forest(g, count, sizeRange = [3, 6]) {
  for (let i = 0; i < count; i++) {
    const x = g.rnd() * g.w;
    const y = g.rnd() * g.h;
    const r = sizeRange[0] + g.rnd() * (sizeRange[1] - sizeRange[0]);
    g.blob(x, y, r, TREE, 0.95, [GRASS, SAND, TALL]);
  }
}

/**
 * Overlapping drifts of sand. Distinct from `scatter` in that the blobs are
 * large and deliberately allowed to merge, which is what makes a desert read as
 * one continuous surface with scrub on it rather than as spots on a lawn.
 */
function dunes(g, count, sizeRange = [6, 14]) {
  for (let i = 0; i < count; i++) {
    const x = g.rnd() * g.w;
    const y = g.rnd() * g.h;
    const r = sizeRange[0] + g.rnd() * (sizeRange[1] - sizeRange[0]);
    g.blob(x, y, r, SAND, 0.98, [GRASS, TALL]);
  }
}

/** Wears the ground either side of every road down to sand. */
function verge(g, reach = 2) {
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.get(x, y) !== ROAD) continue;
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          if (Math.hypot(dx, dy) > reach + g.rnd() * 0.8) continue;
          g.paint(x + dx, y + dy, SAND, [GRASS, TALL]);
        }
      }
    }
  }
}

function scatter(g, tile, count, sizeRange, over = [GRASS]) {
  for (let i = 0; i < count; i++) {
    const x = g.rnd() * g.w;
    const y = g.rnd() * g.h;
    const r = sizeRange[0] + g.rnd() * (sizeRange[1] - sizeRange[0]);
    g.blob(x, y, r, tile, 0.92, over);
  }
}

/** How far from the drop point a soldier may start, in tiles. */
const SQUAD_SPREAD = 4.4;

/**
 * Drops the squad around a spawn point.
 *
 * They were laid out on a perfect 3x2 lattice, two tiles apart, in every
 * mission — which reads exactly as what it is the moment the game starts. Real
 * men standing about waiting to be told what to do do not form a grid. This
 * keeps them clustered enough to be one squad and scatters them enough not to
 * be a formation, and it will not stack two on the same tile.
 */
function squad(g, place, at, count = 6) {
  // Clear the ground it needs rather than trusting the caller's `clearing()` to
  // have been generous enough. A radius-four pad cannot hold six men two and a
  // half tiles apart, so the scatter quietly failed and fell back to the very
  // lattice it exists to avoid -- silently, and only on some maps.
  g.disc(at.x, at.y, SQUAD_SPREAD + 1.5, GRASS, [TREE, ROCK, TALL, QUICK]);

  const taken = new Set();
  let placed = 0;
  for (let attempt = 0; attempt < 300 && placed < count; attempt++) {
    const a = g.rnd() * Math.PI * 2;
    const r = 1.6 + Math.sqrt(g.rnd()) * SQUAD_SPREAD;
    const x = Math.round(at.x + Math.cos(a) * r);
    const y = Math.round(at.y + Math.sin(a) * r * 0.85);
    const key = `${x},${y}`;
    if (taken.has(key) || !g.isOpen(x, y)) continue;
    // Never shoulder to shoulder: the herd steering wants room to spread.
    let tooClose = false;
    for (const k of taken) {
      const [tx, ty] = k.split(',').map(Number);
      if (Math.hypot(tx - x, ty - y) < 2.4) { tooClose = true; break; }
    }
    if (tooClose) continue;
    taken.add(key);
    g.set(x, y, 'P');
    place.used.push({ x, y });
    placed++;
  }
  // A mission is not shippable with a short squad, and the validator will say
  // so -- but fall back to the lattice rather than silently writing five men.
  for (let i = placed; i < count; i++) {
    g.set(at.x - 2 + (i % 3) * 2, at.y - 1 + Math.floor(i / 3) * 2, 'P');
  }
}

/** Clears a landing pad of open ground and returns its centre. */
function clearing(g, x, y, r) {
  g.disc(g.w * 0 + x, y, r, GRASS, [TREE, ROCK, TALL, QUICK]);
  return { x, y };
}

/** Places a w x h building block with a clear yard around it. */
function building(g, x, y, w, h, tile) {
  g.disc(x + w / 2, y + h / 2, Math.max(w, h) + 2.2, GRASS, [TREE, TALL, ROCK]);
  g.fillRect(x, y, w, h, tile);
}

// -------------------------------------------------------------- placement

/**
 * Collects open tiles for entity placement and hands them out without
 * repeating, keeping a minimum spacing so spawns are not stacked.
 */
class Placer {
  constructor(grid) {
    this.g = grid;
    this.used = [];
    /**
     * Tiles the squad can actually walk to, as `x,y` keys. Filled in by
     * `confineTo` once the terrain is final and the spawn is known.
     *
     * Without it, an organically shaped treeline will eventually seal off a
     * pocket and drop an enemy inside it, and an `eliminate` mission with an
     * unkillable enemy is unwinnable. The validator catches that, but catching
     * it at placement time is better than rerolling a whole map's seed.
     */
    this.reachable = null;
  }

  /** Restricts future placement to what is reachable from the squad's spawn. */
  confineTo(x, y) {
    this.reachable = this.g.reachable(Math.round(x), Math.round(y));
  }

  /** Nearest open tile to (x, y) that is `spacing` away from everything placed. */
  near(x, y, spread, spacing = 2) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const a = this.g.rnd() * Math.PI * 2;
      const r = Math.sqrt(this.g.rnd()) * spread;
      const px = Math.round(x + Math.cos(a) * r);
      const py = Math.round(y + Math.sin(a) * r);
      if (!this.g.isOpen(px, py)) continue;
      if (this.reachable && !this.reachable.has(`${px},${py}`)) continue;
      if (this.used.some((p) => Math.hypot(p.x - px, p.y - py) < spacing)) continue;
      this.used.push({ x: px, y: py });
      return { x: px, y: py };
    }
    return null;
  }

  put(marker, x, y, spread, spacing = 2) {
    const p = this.near(x, y, spread, spacing);
    if (p) this.g.set(p.x, p.y, marker);
    return p;
  }
}

// --------------------------------------------------------------- missions

/**
 * Each builder receives a fresh grid and a placer, lays out its terrain, and
 * returns nothing -- the grid is mutated in place.
 */
const BUILDERS = {
  /**
   * The shooting range. Dev only.
   *
   * Deliberately the emptiest map in the game: flat ground, no cover to hide
   * the result behind, a line of huts to level and a line of men to shoot. When
   * the question is "does hitting things work" -- hitboxes, blast falloff,
   * buildings coming down, a death animation -- every tree is something to rule
   * out first. The test range next door has one of everything; this has nothing
   * except the thing under test.
   */
  'test-shooting'(g, place) {
    g.frame(ROCK, { min: 2, max: 2 });

    // Squad on the left, everything to shoot on the right, nothing between.
    const spawn = clearing(g, 8, Math.floor(g.h / 2), 5);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // A row of huts, far enough apart that one grenade cannot reach two.
    for (let i = 0; i < 3; i++) building(g, 26 + i * 10, 5, 2, 2, HUT);

    // Men at increasing range, so a shot can be judged against distance.
    for (let i = 0; i < 6; i++) place.put('E', 24 + i * 6, Math.floor(g.h / 2) + (i % 2 ? 4 : -4), 4, 2);
    place.put('S', g.w - 10, 6, 4);
    place.put('B', g.w - 10, g.h - 8, 4);

    // Something to blow up, and something to pick up.
    place.put('o', 20, Math.floor(g.h / 2) - 8, 3);
    place.put('o', 21, Math.floor(g.h / 2) + 8, 3);
    place.put('c', 14, Math.floor(g.h / 2), 3);
  },

  /**
   * The test range. Dev only -- `dev: true` in its header keeps it out of a
   * real player's mission list, and `__DEV__` drops the debug panel that goes
   * with it from the production bundle entirely.
   *
   * Everything the game can draw or simulate, on one screen-and-a-bit, laid out
   * in bands so a new sprite or hazard can be looked at without playing three
   * missions to reach it. It is a real, completable map -- the validator holds
   * it to the same standard as the campaign -- because a test level that cannot
   * be finished stops being run.
   */
  'test-range'(g, place) {
    g.frame(ROCK, { min: 2, max: 3 });

    // --- terrain bands, left to right: grass, sand, water with a bridge,
    //     ice, quicksand. Each wide enough to stand a squad in.
    g.fillRect(1, 1, 14, g.h - 2, GRASS);
    g.fillRect(15, 1, 10, g.h - 2, SAND);
    g.fillRect(25, 1, 6, g.h - 2, WATER);
    g.fillRect(27, 12, 2, 6, DEEP);
    g.fillRect(25, 20, 6, 2, BRIDGE);
    g.fillRect(31, 1, 8, g.h - 2, ICE);
    g.fillRect(39, 1, 6, g.h - 2, QUICK);
    g.fillRect(45, 1, g.w - 46, g.h - 2, GRASS);

    // --- cover to hide in and shoot through
    scatter(g, TREE, 5, [2, 3], [GRASS]);
    scatter(g, TALL, 4, [2, 3], [GRASS]);
    scatter(g, ROCK, 3, [1, 2], [GRASS]);

    // --- the squad, bottom left on clean grass
    const spawn = clearing(g, 7, g.h - 6, 4);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // --- one of each building, spaced so a grenade reaches only one
    building(g, 48, 4, 2, 2, HUT);
    building(g, 54, 4, 3, 3, FACTORY);
    building(g, 48, 12, 2, 2, TENT);

    // --- one of each enemy, in the open where they can be looked at
    place.put('E', 50, 20, 4, 2);
    place.put('E', 54, 22, 4, 2);
    place.put('S', 58, 8, 4);
    place.put('B', 58, 16, 4);

    // --- every hazard and pickup
    for (let i = 0; i < 4; i++) place.put('*', 42, 6 + i * 5, 3);
    place.put('o', 46, 16, 3);
    place.put('o', 46, 19, 3);
    place.put('c', 12, 6, 3);
    place.put('H', 60, 24, 3);
  },

  /**
   * 09 -- one man, and no squad to hide behind.
   *
   * Everything this game teaches is about a herd: spread out, use the treeline,
   * accept losses. This takes the herd away. A single soldier cannot trade a
   * man for ground, cannot lay down fire while somebody moves, and dies to one
   * round like everyone else -- so the whole mission is about being somewhere
   * they are not.
   */
  'lone-wolf'(g, place) {
    g.frame(TREE, { min: 4, max: 10 });
    forest(g, 26, [3, 6]);
    scatter(g, TALL, 16, [3, 6]);
    scatter(g, ROCK, 8, [1, 3]);

    const spawn = clearing(g, 7, Math.floor(g.h / 2), 4);
    squad(g, place, spawn, 1);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // A long way to the pickup, with the ground between it and him held.
    for (let i = 1; i <= 6; i++) {
      const x = (g.w / 7) * i;
      for (let k = 0; k < 2; k++) place.put('E', x, g.h * g.rnd(), 7, 4);
      if (i % 2 === 0) place.put('S', x, g.h * g.rnd(), 6);
    }
    place.put('X', g.w - 8, Math.floor(g.h / 2), 4);
  },

  /** 01 -- the basics: move, take cover, engage. */
  'chicken-run'(g, place) {
    g.frame(TREE, { min: 3, max: 9 });
    forest(g, 16, [3, 6]);
    scatter(g, TALL, 5, [3, 5]);
    const spawn = clearing(g, 8, g.h - 8, 5);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    building(g, Math.floor(g.w * 0.7), 10, 2, 2, HUT);
    building(g, Math.floor(g.w * 0.78), 22, 2, 2, HUT);
    for (let i = 0; i < 11; i++) {
      place.put('E', g.w * (0.35 + g.rnd() * 0.6), g.h * g.rnd(), 8, 4);
    }
    for (let i = 0; i < 3; i++) place.put('p', g.w * (0.4 + g.rnd() * 0.5), g.h * g.rnd(), 6, 6);
    place.put('c', g.w * 0.35, g.h * 0.6, 6);
    place.put('c', g.w * 0.7, g.h * 0.4, 6);
  },

  /** 02 -- deep water: the river is now a wall, and bridges are chokepoints. */
  'river-run'(g, place) {
    g.frame(TREE, { min: 3, max: 8 });
    forest(g, 14, [3, 5]);
    const bridges = river(g, { axis: 'h', width: 4, wobble: 7, crossings: [0.3, 0.72], deep: true });
    const spawn = clearing(g, Math.floor(g.w / 2), g.h - 7, 5);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // Defenders dug in on the far bank, covering both crossings.
    for (const b of bridges) {
      for (let i = 0; i < 3; i++) place.put('E', b.x, b.y - 8, 7, 3);
      place.put('o', b.x, b.y - 6, 4);
    }
    for (let i = 0; i < 7; i++) place.put('E', g.w * g.rnd(), g.h * 0.25 * g.rnd(), 9, 4);
    place.put('S', g.w * 0.5, 6, 6);
    place.put('c', spawn.x + 10, spawn.y - 4, 5);
    place.put('c', g.w * 0.5, g.h * 0.2, 8);
  },

  /** 03 -- a long march down a road to an extraction point. */
  'long-road'(g, place) {
    // Sand first, in big overlapping drifts, so scrub and rock land on top of
    // it rather than the other way round. A "desert" mission whose ground is
    // all grass is just a green map with a beige palette.
    dunes(g, 34, [7, 16]);
    g.frame(TREE, { min: 3, max: 10 });
    scatter(g, TALL, 18, [3, 6]);
    forest(g, 24, [2, 5]);
    scatter(g, ROCK, 18, [1, 3]);
    // The verges are worn to sand by everything that has marched down it.
    road(g, { x: 6, y: Math.floor(g.h / 2) }, { x: g.w - 8, y: Math.floor(g.h / 2) });
    verge(g, 2);

    const spawn = clearing(g, 8, Math.floor(g.h / 2), 4);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // Ambushes strung along the road, thickening toward the far end.
    for (let i = 1; i <= 9; i++) {
      const x = (g.w / 10) * i;
      const count = 1 + Math.floor(i / 3);
      for (let k = 0; k < count; k++) place.put('E', x, g.h / 2 + (g.rnd() - 0.5) * g.h * 0.6, 7, 3);
      if (i % 3 === 0) place.put('o', x, g.h / 2, 4);
      if (i % 4 === 0) place.put('S', x, g.h / 2 + (g.rnd() - 0.5) * g.h * 0.5, 6);
    }
    place.put('c', g.w * 0.3, g.h / 2, 6);
    place.put('c', g.w * 0.6, g.h / 2, 6);

    // The pickup point, marked with a tent so it reads from a distance.
    const exit = { x: g.w - 9, y: Math.floor(g.h / 2) };
    g.disc(exit.x, exit.y, 5, GRASS, [TREE, TALL, ROCK]);
    g.fillRect(exit.x - 1, exit.y - 1, 2, 2, TENT);
  },

  /** 04 -- tall grass: cover you can walk through, and hide inside. */
  undergrowth(g, place) {
    // Most of the map is chest-high grass, cut through by clear lanes.
    g.fillRect(0, 0, g.w, g.h, TALL);
    g.frame(TREE, { min: 3, max: 9 });
    // Lanes and clearings cut through it. Wall-to-wall tall grass is a mission
    // with one texture and one tactic; the open ground is what makes the cover
    // worth using.
    scatter(g, GRASS, 26, [5, 11], [TALL]);
    forest(g, 10, [2, 4]);
    scatter(g, ROCK, 4, [2, 3], [GRASS, TALL]);

    const spawn = clearing(g, 8, g.h - 8, 4);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // Snipers make the grass worth using: cross open ground and you are seen.
    for (let i = 0; i < 4; i++) place.put('S', g.w * (0.4 + g.rnd() * 0.55), g.h * g.rnd(), 7);
    for (let i = 0; i < 12; i++) place.put('E', g.w * (0.3 + g.rnd() * 0.65), g.h * g.rnd(), 8, 4);
    for (let i = 0; i < 4; i++) place.put('p', g.w * (0.4 + g.rnd() * 0.5), g.h * g.rnd(), 6, 8);
    place.put('c', g.w * 0.4, g.h * 0.5, 7);
    place.put('c', g.w * 0.75, g.h * 0.3, 7);
  },

  /** 05 -- minefield: cross slowly, or blow a lane through it. */
  minefield(g, place) {
    g.fillRect(0, 0, g.w, g.h, SAND);
    g.frame(ROCK, { min: 3, max: 8 });
    // Islands of scrub in the sand, rather than the reverse, and enough rock
    // and dead growth that a march across it is not a march across a blank.
    scatter(g, GRASS, 14, [3, 7], [SAND]);
    scatter(g, QUICK, 7, [2, 4], [SAND, GRASS]);
    scatter(g, ROCK, 14, [1, 3], [SAND, GRASS]);
    scatter(g, TALL, 12, [2, 4], [SAND, GRASS]);
    forest(g, 12, [2, 4]);
    road(g, { x: 6, y: g.h - 8 }, { x: g.w - 8, y: 8 });

    const spawn = clearing(g, 8, g.h - 8, 4);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // A belt of mines across the middle, dense enough to demand care.
    for (let i = 0; i < 46; i++) {
      const t = g.rnd();
      place.put('*', g.w * (0.25 + t * 0.5), g.h * g.rnd(), 9, 3);
    }
    // Barrels among them, so a well-placed shot clears a corridor.
    for (let i = 0; i < 6; i++) place.put('o', g.w * (0.3 + g.rnd() * 0.45), g.h * g.rnd(), 7, 5);

    building(g, Math.floor(g.w * 0.72), 8, 2, 2, HUT);
    building(g, Math.floor(g.w * 0.8), 18, 2, 2, HUT);
    building(g, Math.floor(g.w * 0.66), 22, 2, 2, HUT);
    for (let i = 0; i < 8; i++) place.put('E', g.w * 0.75, g.h * g.rnd(), 10, 4);
    place.put('B', g.w * 0.78, g.h * 0.5, 6);
    place.put('c', g.w * 0.2, g.h * 0.5, 6);
    place.put('c', g.w * 0.55, g.h * 0.25, 6);
  },

  /** 06 -- buildings that keep producing troopers until you level them. */
  village(g, place) {
    g.frame(TREE, { min: 3, max: 9 });
    forest(g, 12, [3, 5]);
    scatter(g, TALL, 6, [3, 5]);
    river(g, { axis: 'v', width: 2, wobble: 5, crossings: [0.45] });

    const spawn = clearing(g, 8, g.h - 8, 4);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // A cluster of huts around a compound, fenced on the approach.
    const cx = Math.floor(g.w * 0.68);
    const cy = Math.floor(g.h * 0.42);
    g.disc(cx, cy, 15, GRASS, [TREE, TALL]);
    const huts = [
      [cx - 9, cy - 8], [cx + 3, cy - 9], [cx - 10, cy + 4],
      [cx + 6, cy + 3], [cx - 2, cy + 8], [cx + 9, cy - 2],
    ];
    for (const [hx, hy] of huts) building(g, hx, hy, 2, 2, HUT);
    for (let x = cx - 14; x <= cx + 14; x += 1) g.paint(x, cy - 14, FENCE, [GRASS, SAND]);

    for (let i = 0; i < 8; i++) place.put('E', cx, cy, 13, 4);
    place.put('B', cx, cy - 6, 5);
    place.put('S', cx + 12, cy + 10, 5);
    place.put('c', spawn.x + 14, spawn.y - 6, 5);
    place.put('c', cx - 16, cy, 6);
    for (let i = 0; i < 3; i++) place.put('o', cx, cy, 12, 6);
  },

  /** 07 -- ice and hostages: bad footing while escorting people who die easily. */
  'ice-station'(g, place) {
    g.fillRect(0, 0, g.w, g.h, GRASS);
    // The arctic maps get the deepest frame of all: near-black pine and rock is
    // where an otherwise white map gets its value range from.
    g.frame(TREE, { min: 4, max: 12 });
    scatter(g, ICE, 12, [4, 8]);
    forest(g, 10, [2, 4]);
    scatter(g, ROCK, 6, [2, 4]);
    river(g, { axis: 'h', width: 3, wobble: 5, crossings: [0.35, 0.75], deep: true });

    const spawn = clearing(g, 9, g.h - 8, 4);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // The tent the hostages have to reach, back on the friendly side.
    g.disc(spawn.x + 8, spawn.y, 4, GRASS, [TREE, ROCK, ICE]);
    g.fillRect(spawn.x + 7, spawn.y - 1, 2, 2, TENT);

    // Prisoners held in a compound on the far side of the water.
    const px = Math.floor(g.w * 0.68);
    const py = Math.floor(g.h * 0.22);
    g.disc(px, py, 10, GRASS, [TREE, ROCK, ICE]);
    building(g, px - 8, py - 6, 2, 2, HUT);
    building(g, px + 5, py - 5, 2, 2, HUT);
    for (let i = 0; i < 4; i++) place.put('H', px, py, 6, 3);
    for (let i = 0; i < 9; i++) place.put('E', px, py, 11, 4);
    place.put('S', px + 10, py + 8, 5);
    place.put('c', g.w * 0.3, g.h * 0.55, 7);
  },

  /** 08 -- hold a position while reinforcements keep coming. */
  'last-stand'(g, place) {
    g.fillRect(0, 0, g.w, g.h, GRASS);
    g.frame(ROCK, { min: 4, max: 11 });
    scatter(g, ICE, 8, [3, 6]);
    forest(g, 16, [2, 5]);
    scatter(g, ROCK, 8, [2, 4]);

    // A defensible outpost in the middle, ringed by rubble and barrels.
    const cx = Math.floor(g.w / 2);
    const cy = Math.floor(g.h / 2);
    g.disc(cx, cy, 11, GRASS, [TREE, ROCK, ICE]);
    for (let a = 0; a < 360; a += 7) {
      const r = 9.5;
      g.paint(Math.round(cx + Math.cos((a * Math.PI) / 180) * r),
              Math.round(cy + Math.sin((a * Math.PI) / 180) * r), FENCE, [GRASS, ICE]);
    }
    // Gaps in the wire, so it is a position to hold rather than a bunker.
    for (const a of [20, 110, 200, 290]) {
      for (let k = -2; k <= 2; k++) {
        const ang = ((a + k * 4) * Math.PI) / 180;
        g.paint(Math.round(cx + Math.cos(ang) * 9.5), Math.round(cy + Math.sin(ang) * 9.5), GRASS, [FENCE]);
      }
    }
    // The thing being held. An outpost rather than a hut: it is the squad's,
    // it produces nobody, and the mission is lost if it comes down.
    building(g, cx - 1, cy - 1, 2, 2, OUTPOST);

    // Inside the wire, on the near side of the hut. `squad` only clears the
    // four natural tile types, so the outpost's fence and hut survive it.
    squad(g, place, { x: cx, y: cy + 5 });
    place.used.push({ x: cx, y: cy });
    place.confineTo(cx, cy + 5);

    place.put('c', cx + 5, cy - 4, 3);
    place.put('c', cx - 5, cy + 4, 3);
    for (let i = 0; i < 4; i++) place.put('o', cx, cy, 8, 5);

    // Attackers ring the outpost at a distance, with huts feeding more in.
    for (let a = 0; a < 360; a += 45) {
      const ang = (a * Math.PI) / 180;
      const hx = Math.round(cx + Math.cos(ang) * (g.w * 0.38));
      const hy = Math.round(cy + Math.sin(ang) * (g.h * 0.38));
      if (hx < 5 || hy < 5 || hx > g.w - 7 || hy > g.h - 7) continue;
      building(g, hx, hy, 2, 2, HUT);
      for (let i = 0; i < 2; i++) place.put('E', hx, hy, 6, 3);
    }
    place.put('B', cx + 20, cy, 6);
    place.put('B', cx - 20, cy, 6);
  },
};

// -------------------------------------------------------------- campaign

const CAMPAIGN = [
  {
    id: 'test-shooting', dev: true, doctrine: 'garrison', order: 98, seed: 90210, w: 54, h: 34,
    name: 'Shooting Range', theme: 'jungle', objective: 'eliminate',
    mechanic: 'nothing but targets',
    brief: 'Dev only. Flat ground, huts to level and men to shoot, and no cover to blame.',
  },
  {
    id: 'lone-wolf', squad: 1, doctrine: 'patrol', order: 9, seed: 887701, w: 84, h: 52,
    name: 'Lone Wolf', theme: 'jungle', objective: 'reach',
    mechanic: 'one man',
    brief: 'One soldier. No herd to hide in, and one hit is still all it takes.',
  },
  {
    id: 'test-range', dev: true, doctrine: 'garrison', order: 99, seed: 40404, w: 66, h: 30,
    name: 'Test Range', theme: 'jungle', objective: 'eliminate',
    mechanic: 'everything at once',
    brief: 'Dev only. One of everything, for looking at rather than winning.',
  },
  {
    id: 'chicken-run', doctrine: 'garrison', order: 1, seed: 20250830, w: 88, h: 56,
    name: 'Chicken Run', theme: 'jungle', objective: 'eliminate',
    mechanic: 'basics',
    brief: 'Move as a herd, use the treeline, and let them come to you.',
  },
  {
    id: 'river-run', doctrine: 'garrison', order: 2, seed: 771903, w: 64, h: 88,
    name: 'River Run', theme: 'jungle', objective: 'eliminate',
    mechanic: 'deep water',
    brief: 'Deep water cannot be crossed. Take a bridge, and expect it covered.',
  },
  {
    id: 'long-road', doctrine: 'ambush', order: 3, seed: 448210, w: 220, h: 44,
    name: 'The Long Road', theme: 'desert', objective: 'reach',
    mechanic: 'extraction',
    brief: 'A long march east. Get everyone still standing to the pickup.',
  },
  {
    id: 'undergrowth', doctrine: 'patrol', order: 4, seed: 913377, w: 96, h: 68,
    name: 'Undergrowth', theme: 'jungle', objective: 'eliminate',
    mechanic: 'tall grass',
    brief: 'Tall grass hides you but not your bullets. Snipers own the open ground.',
  },
  {
    id: 'minefield', doctrine: 'garrison', order: 5, seed: 610455, w: 92, h: 64,
    name: 'Minefield', theme: 'desert', objective: 'demolish',
    mechanic: 'mines',
    brief: 'Mines everywhere. Shoot a barrel to clear a lane, then level the huts.',
  },
  {
    id: 'village', doctrine: 'hunters', order: 6, seed: 328814, w: 96, h: 76,
    name: 'Village', theme: 'jungle', objective: 'demolish',
    mechanic: 'enemy buildings',
    brief: 'Huts keep sending out troopers. Grenades bring them down, rifles will not.',
  },
  {
    id: 'ice-station', doctrine: 'patrol', order: 7, seed: 175062, w: 100, h: 64,
    name: 'Ice Station', theme: 'arctic', objective: 'rescue',
    mechanic: 'hostages and ice',
    brief: 'Walk every prisoner back to the tent. Ice ruins your footing; one dead hostage ends it.',
  },
  {
    id: 'last-stand', doctrine: 'swarm', order: 8, seed: 502991, w: 76, h: 76, duration: 120,
    name: 'Last Stand', theme: 'arctic', objective: 'survive', waves: '5@22',
    mechanic: 'holding out',
    brief: 'Hold the outpost for two minutes. Five waves come out of the huts -- level a hut and the next one is smaller.',
  },
];

// ----------------------------------------------------------------- build

function generate(spec) {
  const g = new Grid(spec.w, spec.h, GRASS, spec.seed);
  const place = new Placer(g);
  BUILDERS[spec.id](g, place);

  // Every mission gets the same finishing pass: dissolve the marooned single
  // tiles that blob painting leaves behind. Only soft ground is touched, and
  // only into other soft ground, so nothing here can wall a route off or move
  // an entity — which is why it can safely run after the builder has placed
  // everything rather than needing a call in each of the eight.
  g.smooth(2);

  const header = [
    `name: ${spec.name}`,
    `theme: ${spec.theme}`,
    `objective: ${spec.objective}`,
    `doctrine: ${spec.doctrine ?? 'garrison'}`,
    `order: ${spec.order}`,
    `mechanic: ${spec.mechanic}`,
    `brief: ${spec.brief}`,
    ...(spec.dev ? ['dev: true'] : []),
    ...(spec.squad ? [`squad: ${spec.squad}`] : []),
    ...(spec.waves ? [`waves: ${spec.waves}`] : []),
    'tile: 16',
    ...(spec.duration ? [`duration: ${spec.duration}`] : []),
    '---',
  ].join('\n');

  return { text: `${header}\n${g}\n`, grid: g };
}

/**
 * Catches the failures that make a level unplayable: no squad, nothing to do,
 * or an objective walled off from the spawn.
 */
function validate(spec, grid) {
  const problems = [];
  const find = (ch) => {
    const out = [];
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) if (grid.get(x, y) === ch) out.push({ x, y });
    }
    return out;
  };

  const squad = find('P');
  const want = spec.squad ?? 6;
  if (squad.length !== want) problems.push(`expected ${want} player spawns, found ${squad.length}`);
  if (squad.length === 0) return problems;

  const reach = grid.reachable(squad[0].x, squad[0].y);
  const need = { eliminate: ['E', 'S', 'B'], demolish: [], rescue: ['H'], reach: ['X', TENT], survive: [] };

  for (const ch of need[spec.objective] ?? []) {
    for (const p of find(ch)) {
      if (!reach.has(`${p.x},${p.y}`)) problems.push(`'${ch}' at ${p.x},${p.y} is unreachable`);
    }
  }

  const enemies = find('E').length + find('S').length + find('B').length;
  if (spec.objective === 'eliminate' && enemies === 0) problems.push('eliminate map has no enemies');
  if (spec.objective === 'rescue' && find('H').length === 0) problems.push('rescue map has no hostages');
  // A tent registers as an extraction point in the parser, so either will do.
  if (spec.objective === 'reach' && find('X').length === 0 && find(TENT).length === 0) {
    problems.push('reach map has no extraction zone or tent');
  }
  if (spec.objective === 'rescue' && find('X').length === 0 && find(TENT).length === 0) {
    problems.push('rescue map has nowhere to deliver hostages to');
  }
  if (spec.objective === 'demolish') {
    const huts = find(HUT).length + find(FACTORY).length;
    if (huts === 0) problems.push('demolish map has no buildings');
  }
  // Every squad member has to start somewhere it can actually walk out of.
  for (const p of squad) {
    if (!reach.has(`${p.x},${p.y}`)) problems.push(`squad spawn at ${p.x},${p.y} is walled in`);
  }
  return problems;
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const only = args.filter((a) => !a.startsWith('--'));
  const specs = only.length ? CAMPAIGN.filter((s) => only.includes(s.id)) : CAMPAIGN;
  if (specs.length === 0) {
    console.error(`no missions matched. Known: ${CAMPAIGN.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  await mkdir(DATA_DIR, { recursive: true });
  let failed = 0;

  for (const spec of specs) {
    const { text, grid } = generate(spec);
    const problems = validate(spec, grid);
    // Count in the grid, not the file -- the header text contains letters too.
    const tally = (ch) => {
      let n = 0;
      for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (grid.get(x, y) === ch) n++;
      return n;
    };
    const counts = {
      enemies: tally('E') + tally('S') + tally('B'),
      hostages: tally('H'),
      mines: tally('*'),
    };

    if (problems.length) {
      failed++;
      console.error(`  FAIL ${spec.id}`);
      for (const p of problems) console.error(`       ${p}`);
      continue;
    }
    if (!check) await writeFile(join(DATA_DIR, `${spec.id}.map`), text, 'utf8');
    console.log(
      `  ok   ${spec.id.padEnd(13)} ${String(spec.w).padStart(3)}x${String(spec.h).padEnd(3)}` +
      ` ${spec.theme.padEnd(7)} ${spec.objective.padEnd(9)}` +
      ` ${counts.enemies} enemies${counts.hostages ? `, ${counts.hostages} hostages` : ''}` +
      `${counts.mines ? `, ${counts.mines} mines` : ''}`,
    );
  }

  console.log(`\n  ${specs.length - failed}/${specs.length} missions ${check ? 'validated' : 'written'}\n`);
  if (failed) process.exit(1);
}

await main();
