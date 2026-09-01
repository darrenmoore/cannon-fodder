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
      TALL = '"', QUICK = '%', ICE = 'i', TENT = 'A', BUNKER = 'U';
// Entity markers the validator reasons about by name.
const SUPPLY = 'k', OFFICER = 'C';

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
  /**
   * `extra` narrows what counts as walkable without changing what walkable
   * means, which is how the covert check asks "and what if you also refuse to
   * go near anybody" of the same fill everything else uses.
   */
  /**
   * `throughBuildings` admits huts and factories as routes, because levelling
   * one leaves walkable rubble. Off by default and only ever turned on for a
   * map that declares `gated` -- see the `gated` field in map.ts. Never the
   * outpost: that is the squad's own and the mission is lost if it falls.
   */
  reachable(sx, sy, extra = null, throughBuildings = false) {
    const seen = new Set();
    const solid = throughBuildings
      ? [TREE, ROCK, OUTPOST, FENCE, DEEP]
      : [TREE, ROCK, HUT, FACTORY, OUTPOST, FENCE, DEEP];
    const walkable = (x, y) =>
      !solid.includes(this.get(x, y))
      && (!extra || extra(x, y));
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
    place.squad.push({ x, y });
    placed++;
  }
  // A mission is not shippable with a short squad, and the validator will say
  // so -- but fall back to the lattice rather than silently writing five men.
  for (let i = placed; i < count; i++) {
    const fx = at.x - 2 + (i % 3) * 2;
    const fy = at.y - 1 + Math.floor(i / 3) * 2;
    g.set(fx, fy, 'P');
    place.squad.push({ x: fx, y: fy });
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

// --------------------------------------------------- man-made primitives

/*
 * Everything above this line is organic: blobs, drifts, meanders, random walks.
 * That is the right default -- the reference's landscape is grown, not drawn --
 * but it means the toolbox could not express anything *built*. A dam, an
 * airfield, a walled town and four bridges square across a river all need a
 * straight edge, and a straight edge was the one thing nothing here could make.
 *
 * These are the hard-edged half. `smooth()` only ever rewrites soft ground
 * (grass, sand, tall grass, ice) into other soft ground, so nothing below can
 * be rounded off by the finishing pass -- which is asserted rather than assumed,
 * because a quietly smoothed compound wall is exactly the kind of failure that
 * is invisible in the source.
 */

/** A dead-straight run between two points. Bresenham, thickened. */
function wall(g, from, to, tile = FENCE, thickness = 1) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const laid = [];
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    for (let k = 0; k < thickness; k++) {
      // Thicken across the run rather than along it, so a diagonal stays a line.
      const across = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? [0, k] : [k, 0];
      g.set(x + across[0], y + across[1], tile);
      laid.push({ x: x + across[0], y: y + across[1] });
    }
  }
  return laid;
}

/**
 * A walled yard with gates, and open ground inside it.
 *
 * The gates are the whole point: a sealed box is scenery, and a box with one
 * way in is a corridor. Two or more openings make it a place with a near side
 * and a far side, which is what a defender and an attacker both need.
 */
function compound(g, x0, y0, w, h, { tile = FENCE, gates = 2, fill = GRASS } = {}) {
  g.fillRect(x0, y0, w, h, fill);
  wall(g, { x: x0, y: y0 }, { x: x0 + w - 1, y: y0 }, tile);
  wall(g, { x: x0, y: y0 + h - 1 }, { x: x0 + w - 1, y: y0 + h - 1 }, tile);
  wall(g, { x: x0, y: y0 }, { x: x0, y: y0 + h - 1 }, tile);
  wall(g, { x: x0 + w - 1, y: y0 }, { x: x0 + w - 1, y: y0 + h - 1 }, tile);

  // One gate per side, in rotation, each three tiles wide -- wide enough for the
  // herd to get through without the flow field bottling up on the post.
  const sides = [
    (i) => ({ x: x0 + Math.round(w / 2) + i, y: y0 }),
    (i) => ({ x: x0 + Math.round(w / 2) + i, y: y0 + h - 1 }),
    (i) => ({ x: x0, y: y0 + Math.round(h / 2) + i }),
    (i) => ({ x: x0 + w - 1, y: y0 + Math.round(h / 2) + i }),
  ];
  for (let n = 0; n < Math.min(gates, 4); n++) {
    for (let i = -1; i <= 1; i++) g.set(sides[n](i).x, sides[n](i).y, fill);
  }
  return { x: x0 + w / 2, y: y0 + h / 2 };
}

/**
 * A grid of streets with buildings in the blocks.
 *
 * The one layout in the toolbox that reads as a *town* rather than as a
 * clearing somebody happened to put huts in. Roads are laid first and buildings
 * inset into what is left, so no hut ever sits on a road and the routes through
 * are guaranteed open before anything is placed.
 */
function streets(g, x0, y0, w, h, { cols = 3, rows = 2, tile = HUT } = {}) {
  const cw = w / cols;
  const ch = h / rows;
  g.fillRect(x0, y0, w, h, GRASS);

  for (let c = 0; c <= cols; c++) {
    const x = Math.round(x0 + c * cw);
    for (let y = y0; y < y0 + h; y++) { g.set(x, y, ROAD); g.set(x + 1, y, ROAD); }
  }
  for (let r = 0; r <= rows; r++) {
    const y = Math.round(y0 + r * ch);
    for (let x = x0; x < x0 + w; x++) { g.set(x, y, ROAD); g.set(x, y + 1, ROAD); }
  }

  // A building inset into each block, never touching the road either side.
  const put = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const bx = Math.round(x0 + c * cw) + 4;
      const by = Math.round(y0 + r * ch) + 4;
      const bw = Math.max(2, Math.min(3, Math.floor(cw) - 7));
      const bh = Math.max(2, Math.min(3, Math.floor(ch) - 7));
      if (bw < 2 || bh < 2) continue;
      g.fillRect(bx, by, bw, bh, tile);
      put.push({ x: bx + bw / 2, y: by + bh / 2 });
    }
  }
  return put;
}

/**
 * A dug line: walkable floor with a raised lip either side.
 *
 * Cover that works the opposite way round from a treeline. You can move along
 * it under fire from the flanks and you cannot shoot out of it sideways, so it
 * is a route rather than a position -- and it is the only piece of terrain here
 * whose value depends on which way you are facing.
 */
function trench(g, from, to) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const alongX = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    g.set(x, y, ':');
    // The spoil, thrown up on both sides. Rock stops sight and shots, which is
    // what makes the floor of the trench worth being in.
    if (alongX) { g.paint(x, y - 1, ROCK, [GRASS, SAND, TALL, ICE]); g.paint(x, y + 1, ROCK, [GRASS, SAND, TALL, ICE]); }
    else { g.paint(x - 1, y, ROCK, [GRASS, SAND, TALL, ICE]); g.paint(x + 1, y, ROCK, [GRASS, SAND, TALL, ICE]); }
  }
}

/** A jetty of bridge tiles running out over water. Two wide, like a bridge. */
function pier(g, from, to) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const alongX = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    g.paint(x, y, BRIDGE, [WATER, DEEP, SAND, GRASS]);
    const [ox, oy] = alongX ? [0, 1] : [1, 0];
    g.paint(x + ox, y + oy, BRIDGE, [WATER, DEEP, SAND, GRASS]);
  }
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
    /** Where the squad actually stands; enemy placement keeps clear of it. */
    this.squad = [];
  }

  /** Restricts future placement to what is reachable from the squad's spawn. */
  confineTo(x, y) {
    this.reachable = this.g.reachable(Math.round(x), Math.round(y));
  }

  /** Nearest open tile to (x, y) that is `spacing` away from everything placed. */
  near(x, y, spread, spacing = 2, clearOfSquad = false) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const a = this.g.rnd() * Math.PI * 2;
      const r = Math.sqrt(this.g.rnd()) * spread;
      const px = Math.round(x + Math.cos(a) * r);
      const py = Math.round(y + Math.sin(a) * r);
      if (!this.g.isOpen(px, py)) continue;
      if (this.reachable && !this.reachable.has(`${px},${py}`)) continue;
      if (this.used.some((p) => Math.hypot(p.x - px, p.y - py) < spacing)) continue;
      // Half a tile over the validator's 12 so a placement can never sit
      // exactly on the boundary it is about to be judged against.
      if (clearOfSquad && this.squad.some((p) => Math.hypot(p.x - px, p.y - py) < 12.5)) continue;
      this.used.push({ x: px, y: py });
      return { x: px, y: py };
    }
    return null;
  }

  put(marker, x, y, spread, spacing = 2) {
    // Enemies respect the squad's opening ground (START_CLEAR in validate());
    // a hub beside the spawn sheds its garrison outward instead of onto it.
    const p = this.near(x, y, spread, spacing, 'ESBC'.includes(marker));
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

  /**
   * 01 -- basic training: this is how you shoot.
   *
   * The first thing a new player is asked to do is the one thing the game never
   * explains -- ordering a squad to move is a click, and making it *fire* is a
   * different button. So the mission is small, the ground is empty, and there
   * are five men in front of you and nothing else to work out.
   *
   * Deliberately sparse. Every feature on a teaching map is another thing that
   * might be the answer, and a player who has not yet learnt to shoot cannot
   * tell a distraction from an instruction.
   */
  'training-fire'(g, place) {
    g.fillRect(0, 0, g.w, g.h, GRASS);
    g.frame(TREE, { min: 4, max: 7 });
    // A few trees for shape, well off the line of fire: cover is not the lesson.
    forest(g, 4, [2, 3]);

    const spawn = clearing(g, 9, Math.round(g.h / 2), 4);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // In a line across the far half, in the open, close enough to be plainly
    // the point of the mission and far enough to need an order rather than luck.
    for (let i = 0; i < 5; i++) {
      place.put('E', g.w - 14, 6 + ((g.h - 12) / 4) * i, 3);
    }
  },

  /**
   * 02 -- second lesson: the bridge, the water, and what is lying on it.
   *
   * Four things at once, which is three more than the first mission, and they
   * are arranged so the order they are learnt in is not optional: the huts are
   * across the water, the only dry way over is the bridge, and the grenades are
   * *on* the bridge. A player who crosses has picked them up whether or not
   * they meant to, and then finds that rifles barely mark a building.
   *
   * That last part is the lesson, and it is taught by the wall rather than by
   * the briefing: sixty rifle rounds level a hut and one grenade nearly does.
   */
  'training-bridge'(g, place) {
    g.fillRect(0, 0, g.w, g.h, GRASS);
    g.frame(TREE, { min: 3, max: 6 });
    scatter(g, TREE, 6, [2, 4]);

    // A river across the waist, with exactly one crossing.
    //
    // `crossings` are fractions of the river's length, not tile coordinates --
    // passing a column number puts the span a thousand tiles off the map and
    // leaves a river with no way over it, which is what the first attempt did.
    // It hands back where it actually built them, so nothing here has to work
    // out where the wobble put the deck.
    const spans = river(g, { axis: 'h', width: 3, wobble: 2, crossings: [0.5] });
    const span = spans[0];

    const spawn = clearing(g, span.x, g.h - 7, 4);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    /*
     * The grenades sit on the crossing itself. Not beside it, not before it:
     * the tiles everybody has to walk over.
     *
     * Found by looking rather than by arithmetic -- `river` wobbles, so the
     * span is not reliably at the middle row, and a supply placed at a computed
     * coordinate lands in the water or on the bank and teaches nothing. The
     * first attempt did exactly that and put none on the bridge at all.
     */
    const deck = [];
    for (let y = 0; y < g.h; y++) {
      for (let x = span.x - 2; x <= span.x + 2; x++) {
        if (g.get(x, y) === BRIDGE) deck.push({ x, y });
      }
    }
    for (let i = 0; i < 3 && deck.length > 0; i++) {
      const at = deck[Math.floor(((deck.length - 1) * i) / 2)];
      // 'c', the grenade crate -- not 'k', the collect-mission supply box,
      // which grants nothing and left veteran two grenades short of the huts.
      place.put('c', at.x, at.y, 0, 1);
    }

    // The objective, on the far bank, with a thin guard -- enough that walking
    // straight up to a wall is punished, not enough to make it a firefight.
    building(g, Math.round(g.w * 0.28), 7, 2, 2, HUT);
    building(g, Math.round(g.w * 0.68), 7, 2, 2, HUT);
    for (let i = 0; i < 3; i++) place.put('E', g.w * (0.25 + 0.5 * g.rnd()), 8 + g.rnd() * 6, 5, 3);
  },

  /**
   * The decoy, as a mission rather than as a footnote.
   *
   * A round that stops on scenery raises the alarm *where it landed*, not where
   * it was fired from -- so a shot into the far trees walks the garrison into
   * the far trees. That has been true for two batches and no mission required
   * it, which is nearly the same as it not existing: a mechanic nobody is ever
   * made to use is a mechanic nobody discovers.
   *
   * `throw-your-voice` names the trick in its brief and is hand-written by
   * another hand; this is the second map the spec offered instead of editing
   * it, and it is built around hostages the way the brief pictures.
   *
   * The shape is the whole lesson. Prisoners on open ground so the last stretch
   * cannot be crossed in cover; a ring of sentries facing outward so fighting
   * through is expensive; and the noise-target far off the flank, well away
   * from the pen and on the *opposite* side from the squad -- because a
   * distraction you walk past on the way is not a distraction.
   */
  'the-far-trees'(g, place) {
    g.fillRect(0, 0, g.w, g.h, GRASS);
    g.frame(TREE, { min: 5, max: 11 });
    forest(g, 20, [3, 6]);
    scatter(g, TALL, 12, [3, 6]);

    const penX = Math.round(g.w * 0.6);
    const penY = Math.round(g.h * 0.52);

    // The pen: open ground, so the last stretch is crossed in the open. This is
    // what makes going round the ring worth the walk.
    g.disc(penX, penY, 9, GRASS, [TREE, TALL, ROCK]);
    for (let i = 0; i < 3; i++) place.put('H', penX, penY, 3);

    // A ring rather than a scatter, because the player has to be able to *see*
    // that it is a ring before deciding to pull it apart.
    const RING = 13;
    for (let a = 0; a < 360; a += 45) {
      const sx = Math.round(penX + Math.cos((a * Math.PI) / 180) * RING);
      const sy = Math.round(penY + Math.sin((a * Math.PI) / 180) * RING);
      g.disc(sx, sy, 2, GRASS, [TREE, TALL]);
      place.put('E', sx, sy, 2, 3);
    }
    // Two who walk, so the ring is not a photograph.
    for (let i = 0; i < 2; i++) place.put('p', penX, penY, 16, 6);

    /*
     * The far trees themselves: a stand of rock in among them.
     *
     * Rock as well as timber because a round has to *stop* on something to
     * raise the alarm where it landed, and a lone outcrop reads as a thing to
     * shoot at in a way that one more tree does not.
     */
    /*
     * Placed by the range the alarm actually carries, not by the look of the
     * map -- and the difference is the whole mission.
     *
     * A round on scenery is heard `impactAlarmFloor` away, which is twelve
     * tiles. The ring stands `RING` tiles out from the pen. So the stand has to
     * sit inside twelve tiles of the sentries on the near arc, which puts it
     * about `RING + 11` from the pen and not a step further: the first attempt
     * put it across the map, where it was twenty-one tiles from the closest
     * sentry and pulled precisely nobody.
     *
     * Nine rather than eleven, and it was measured rather than guessed: at
     * eleven the stand's near edge sat 148px from the closest sentry against a
     * 190px alarm, which pulled one man. At nine the whole near shoulder of the
     * ring is inside it. Closer still would pull them *across* the pen, which
     * is the one thing a decoy must not do.
     */
    const bearing = -Math.PI / 4;
    const decoyX = Math.round(penX + Math.cos(bearing) * (RING + 9));
    const decoyY = Math.round(penY + Math.sin(bearing) * (RING + 9));
    g.disc(decoyX, decoyY, 7, GRASS, [TREE, TALL]);
    g.disc(decoyX, decoyY, 4, ROCK, [GRASS]);
    forest(g, 3, [2, 3]);

    // In from the far corner: the shot goes one way and the walk goes another.
    const spawn = clearing(g, 9, Math.round(g.h * 0.8), 4);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // Home is behind them. Walking prisoners back out is the second half, and
    // the ring is still awake for it.
    building(g, 6, Math.round(g.h * 0.8) + 5, 2, 2, TENT);

    place.put('c', Math.round(g.w * 0.28), Math.round(g.h * 0.6), 6);
    place.put('c', Math.round(g.w * 0.42), Math.round(g.h * 0.3), 6);
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
  /**
   * The covert mission.
   *
   * Built the opposite way round from every other map here. `objective: covert`
   * -- get to the pickup and kill nobody -- is only a mission rather than a
   * cruel joke if a route exists that never has to walk into a sentry, so the
   * lane is drawn *first* and the garrison is placed into whatever is left, at
   * a distance from it. `validate` then proves the claim independently, on the
   * finished grid, rather than trusting the construction that made it.
   *
   * The clearance is eleven tiles, which is not arbitrary: a rifleman's aggro
   * radius is 132px and his range 88px, so a man standing at his post cannot
   * see the lane, let alone reach it. There are no snipers on this map for the
   * same reason -- a sniper reaches 190px and would make the lane a shooting
   * gallery from outside his own clearance. The huts are pushed out to
   * eighteen, past `spawnAggroRange`, so they stay quiet unless the player
   * chooses to go and disturb them.
   */
  'softly-softly'(g, place) {
    g.frame(TREE, { min: 4, max: 10 });
    forest(g, 30, [3, 7]);
    // Tall grass wall to wall rather than in patches. It hides you without
    // stopping a bullet, which is the entire mechanic of this mission: on every
    // other map cover is somewhere to shoot from, and here it is somewhere to
    // not be seen. An open field would have made the no-kill rule a punishment
    // rather than a way to play.
    scatter(g, TALL, 90, [4, 9]);
    scatter(g, ROCK, 9, [2, 4]);

    // The lane: a wandering line of it, west to east, kept clear of trees so
    // there is always a way through -- but drawn in the same grass as
    // everything around it, so it is a route rather than a corridor and
    // leaving it is a decision rather than an impossibility.
    const lane = [];
    let y = Math.floor(g.h / 2);
    let drift = 0;
    for (let x = 6; x < g.w - 6; x++) {
      drift = Math.max(-1.1, Math.min(1.1, drift + (g.rnd() - 0.5) * 0.9));
      y = Math.max(8, Math.min(g.h - 9, Math.round(y + drift)));
      lane.push({ x, y });
      for (let dy = -2; dy <= 2; dy++) g.paint(x, y + dy, TALL, [TREE, ROCK, GRASS, SAND]);
    }

    const start = lane[1];
    squad(g, place, start);
    place.used.push(start);
    place.confineTo(start.x, start.y);

    const end = lane[lane.length - 2];
    g.disc(end.x, end.y, 3, GRASS, [TREE, ROCK, TALL]);
    place.put('X', end.x, end.y, 2);

    /*
     * What the garrison has to keep away from: the lane, and the ground the
     * squad actually spawns on.
     *
     * The second half is not decoration. `squad()` scatters six men over a
     * radius-four pad, so measuring clearance from the lane's centre line alone
     * leaves a man four tiles nearer a sentry than the map claims -- which is
     * exactly what the validator caught the first time this was built.
     */
    const avoid = [...lane];
    for (let ay = 0; ay < g.h; ay++) {
      for (let ax = 0; ax < g.w; ax++) if (g.get(ax, ay) === 'P') avoid.push({ x: ax, y: ay });
    }
    const clearOf = (x, y, by) => avoid.every((q) => Math.hypot(q.x - x, q.y - y) >= by);

    /**
     * Somewhere open, reachable, and a stated distance clear of all of that.
     *
     * Searched over the whole map rather than around an anchor, because the
     * lane is drawn first and wanders: the places a sentry can stand are
     * whatever pockets it happens to leave, and looking for them is more
     * robust than deciding in advance where they ought to be.
     */
    const post = (marker, clear, near = null, spread = 7, spreadY = spread) => {
      for (let i = 0; i < 600; i++) {
        const px = near
          ? Math.round(near.x + (g.rnd() - 0.5) * spread * 2)
          : Math.round(4 + g.rnd() * (g.w - 8));
        const py = near
          ? Math.round(near.y + (g.rnd() - 0.5) * spreadY * 2)
          : Math.round(4 + g.rnd() * (g.h - 8));
        if (!g.isOpen(px, py)) continue;
        if (place.reachable && !place.reachable.has(`${px},${py}`)) continue;
        if (place.used.some((q) => Math.hypot(q.x - px, q.y - py) < 2)) continue;
        if (!clearOf(px, py, clear)) continue;
        place.used.push({ x: px, y: py });
        // A sentry stands in a cleared patch, not in the grass. He should be
        // something the player can see and go round; a man hidden in the same
        // cover the player is hiding in is an ambush, and this mission is not
        // supposed to be one.
        if (marker === 'E' || marker === 'B') g.disc(px, py, 2.4, GRASS, [TALL]);
        g.set(px, py, marker);
        return { x: px, y: py };
      }
      return null;
    };

    /*
     * Six posts of three: a knot rather than a picket line, so leaving the lane
     * anywhere puts you near somebody rather than near everybody.
     *
     * Each knot is pinned to a slice of the map's length and free to sit
     * anywhere across its width. Searching the whole map for every man instead
     * put two thirds of the garrison in the one big clearing it found first,
     * and left half the route unwatched.
     */
    for (let i = 0; i < 6; i++) {
      const anchor = lane[Math.round((lane.length * (i + 0.5)) / 6)];
      const head = post('E', 11, { x: anchor.x, y: g.h / 2 }, 8, g.h / 2);
      if (!head) continue;
      for (let k = 0; k < 2; k++) post('E', 11, head, 5);
    }
    // Two bazookateers, a third of the way in from each end.
    for (const t of [0.3, 0.7]) {
      const anchor = lane[Math.round(lane.length * t)];
      post('B', 11, { x: anchor.x, y: g.h / 2 }, 7, g.h / 2);
    }

    // Huts, pushed past `spawnAggroRange` so they stay quiet unless walking
    // into their range is the player's own idea.
    for (let i = 0; i < 2; i++) {
      for (let attempt = 0; attempt < 300; attempt++) {
        const hx = Math.round(8 + g.rnd() * (g.w - 18));
        const hy = Math.round(6 + g.rnd() * (g.h - 14));
        if (!g.isOpen(hx, hy) || !clearOf(hx, hy, 18)) continue;
        // `building` fills its footprint with `set`, which would happily paint
        // over a sentry that is already standing there.
        if (place.used.some((q) => Math.hypot(q.x - hx, q.y - hy) < 5)) continue;
        place.used.push({ x: hx, y: hy });
        building(g, hx, hy, 2, 2, HUT);
        break;
      }
    }

    // One crate off the lane. Grenades you have to break cover to collect, on
    // the one mission where using them ends the run.
    post('c', 9);
  },

  /**
   * A set piece: the canal.
   *
   * Everything else in this file is grown. This is the one that is *built* --
   * a dead-straight cut with four crossings square across it, evenly spaced,
   * because somebody dug it. `wobble: 0` is the whole trick, and it was always
   * available; nothing had ever asked for it.
   *
   * The crossings are the mission. Deep water either side means the bridges are
   * the only way over, four of them means the choice of which is real, and the
   * garrison on the far bank is spread so that no single crossing is safe and
   * none is suicide.
   */
  'four-bridges'(g, place) {
    g.frame(TREE, { min: 4, max: 9 });
    forest(g, 10, [3, 5]);
    scatter(g, TALL, 8, [3, 5]);

    const crossings = [0.2, 0.4, 0.6, 0.8];
    const bridges = river(g, { axis: 'h', width: 4, wobble: 0, crossings, deep: true });
    // A towpath down the near bank: this is a canal, and canals have one.
    const bankY = bridges[0].y + 6;
    for (let x = 5; x < g.w - 5; x++) g.paint(x, bankY, ROAD, [GRASS, SAND, TALL]);

    const spawn = clearing(g, 10, g.h - 8, 5);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // Two men dug in at the head of each crossing, and a pillbox behind it.
    for (const b of bridges) {
      for (let i = 0; i < 2; i++) place.put('E', b.x, b.y - 7, 4, 3);
      place.put('o', b.x, b.y - 5, 3);
    }
    // The objective, on the far bank: the lock houses that control the cut.
    for (let i = 0; i < 3; i++) {
      building(g, Math.round(g.w * (0.22 + i * 0.28)), Math.max(6, bridges[0].y - 16), 2, 2, HUT);
    }
    for (let i = 0; i < 6; i++) place.put('E', g.w * g.rnd(), bridges[0].y - 12, 8, 4);
    place.put('S', g.w * 0.5, Math.max(6, bridges[0].y - 15), 6);
    place.put('c', spawn.x + 12, spawn.y - 3, 5);
    place.put('c', g.w * 0.6, bankY - 3, 6);
  },

  /**
   * A set piece: the walled town, and the man in it.
   *
   * `streets()` laying roads first and insetting the buildings is what makes
   * this read as a town rather than as huts in a field -- the routes through
   * exist before anything is placed, so the block corners are cover rather than
   * a maze. The officer is in the middle of it, and the mission is over the
   * moment he is, which makes the whole thing a problem of getting in.
   */
  'walled-town'(g, place) {
    g.frame(TREE, { min: 4, max: 9 });
    forest(g, 12, [3, 6]);
    scatter(g, TALL, 10, [3, 6]);

    const cx = Math.round(g.w * 0.6);
    const cy = Math.round(g.h / 2);
    const tw = Math.round(g.w * 0.44);
    const th = Math.round(g.h * 0.5);
    compound(g, cx - Math.round(tw / 2), cy - Math.round(th / 2), tw, th, { gates: 3 });
    const blocks = streets(g, cx - Math.round(tw / 2) + 3, cy - Math.round(th / 2) + 3, tw - 6, th - 6, {
      cols: 3, rows: 2,
    });

    const spawn = clearing(g, 9, cy, 5);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // The officer in the middle block, with his bodyguard around him.
    const post = blocks[Math.floor(blocks.length / 2)] ?? { x: cx, y: cy };
    place.put('C', post.x + 3, post.y + 3, 3, 2);
    for (let i = 0; i < 4; i++) place.put('E', post.x + 3, post.y + 3, 6, 3);
    // The rest of the garrison on the streets, not in the blocks.
    for (const b of blocks) for (let i = 0; i < 2; i++) place.put('E', b.x + 3, b.y + 3, 7, 3);
    place.put('S', cx, cy - Math.round(th / 2) + 4, 5);
    place.put('B', cx + Math.round(tw / 2) - 5, cy, 5);
    place.put('c', spawn.x + 10, cy, 6);
    place.put('c', cx - Math.round(tw / 2) - 6, cy, 6);
  },

  /**
   * A set piece: a rescue nobody is allowed to hear.
   *
   * The mission the fused `covert` objective could not express. `nokill` is a
   * modifier now, so "recover the prisoners without killing anybody" is two
   * header lines rather than a new objective -- and the spatial rule that makes
   * it playable is the same one Softly Softly proved, pointed at the hostages
   * instead of at the extraction.
   *
   * Built lane-first for exactly that reason, and the pen is placed *on* the
   * lane rather than off it: a hostage the squad cannot reach quietly is not a
   * hard rescue, it is an unwinnable one, and the validator says so.
   */
  'not-a-sound'(g, place) {
    g.frame(TREE, { min: 4, max: 9 });
    forest(g, 24, [3, 6]);
    scatter(g, TALL, 70, [4, 8]);

    // The lane, west to east, in the same grass as everything around it.
    const lane = [];
    let y = Math.floor(g.h / 2);
    let drift = 0;
    for (let x = 6; x < g.w - 6; x++) {
      drift = Math.max(-1, Math.min(1, drift + (g.rnd() - 0.5) * 0.8));
      y = Math.max(9, Math.min(g.h - 10, Math.round(y + drift)));
      lane.push({ x, y });
      for (let dy = -2; dy <= 2; dy++) g.paint(x, y + dy, TALL, [TREE, ROCK, GRASS, SAND]);
    }

    const start = lane[1];
    squad(g, place, start);
    place.used.push(start);
    place.confineTo(start.x, start.y);

    // The tent, back beside the squad: the prisoners are walked home, not out.
    g.disc(start.x + 6, start.y, 4, GRASS, [TREE, ROCK, TALL]);
    g.fillRect(start.x + 5, start.y - 1, 2, 2, TENT);

    // The pen, at the far end of the lane and on it.
    const pen = lane[lane.length - 6];
    g.disc(pen.x, pen.y, 5, GRASS, [TREE, ROCK, TALL]);
    for (let i = 0; i < 3; i++) place.put('H', pen.x, pen.y, 3, 2);

    // Everything the garrison has to stay clear of: the lane, the pen, the tent
    // and the ground the squad actually spawns on.
    const avoid = [...lane, pen, { x: start.x + 5, y: start.y }];
    for (let ay = 0; ay < g.h; ay++) {
      for (let ax = 0; ax < g.w; ax++) if (g.get(ax, ay) === 'P' || g.get(ax, ay) === 'H') avoid.push({ x: ax, y: ay });
    }
    const clearOf = (x, yy, by) => avoid.every((q) => Math.hypot(q.x - x, q.y - yy) >= by);

    // Twelve tiles, not eight. The validator's clearance is a rifleman's aggro
    // radius exactly; building to the limit leaves a mission that passes and is
    // miserable, because every step of the route is on the edge of being seen.
    const post = (marker, anchor, spread, spreadY = spread) => {
      for (let i = 0; i < 700; i++) {
        const px = Math.round(anchor.x + (g.rnd() - 0.5) * spread * 2);
        const py = Math.round(anchor.y + (g.rnd() - 0.5) * spreadY * 2);
        if (!g.isOpen(px, py)) continue;
        if (place.reachable && !place.reachable.has(`${px},${py}`)) continue;
        if (place.used.some((q) => Math.hypot(q.x - px, q.y - py) < 2)) continue;
        if (!clearOf(px, py, 12)) continue;
        place.used.push({ x: px, y: py });
        g.disc(px, py, 2.2, GRASS, [TALL]);
        g.set(px, py, marker);
        return { x: px, y: py };
      }
      return null;
    };

    // No snipers: 13 tiles of aggro would reach the lane from outside their own
    // clearance and turn the route into a shooting gallery.
    const heads = [];
    for (let i = 0; i < 5; i++) {
      const anchor = lane[Math.round((lane.length * (i + 0.5)) / 5)];
      const head = post('E', { x: anchor.x, y: g.h / 2 }, 8, g.h / 2);
      if (head) {
        heads.push(head);
        for (let k = 0; k < 2; k++) post('E', head, 5);
      }
    }
    /*
     * Two marched routes, through the second and fourth groups: three `p`
     * nodes nine tiles apart, which is inside the twelve-tile chaining range
     * (see chainPatrolRoutes in world.ts), so each chains into a fixed
     * east-west march. The head of the group stands on the middle node and
     * walks it; his flankmates enlist if they landed near enough. The march
     * runs along the flank, never onto the lane -- on a no-kill map a patrol
     * is something the player times, not a wall he cannot pass.
     */
    for (const head of [heads[1], heads[3]]) {
      if (!head) continue;
      for (let i = -1; i <= 1; i++) {
        const nx = head.x + i * 9;
        if (nx < 4 || nx > g.w - 5) continue;
        g.disc(nx, head.y, 1.6, GRASS, [TREE, ROCK, TALL]);
        g.set(nx, head.y, 'p');
      }
    }
    post('c', lane[Math.round(lane.length * 0.5)], 10, 10);
  },

  /**
   * A set piece: the wall you have to knock down.
   *
   * The rubble puzzle, and the only map here that declares `gated: true`.
   * Levelling a building leaves walkable rubble, so a line of huts across the
   * only gap is a door -- but the completability fill treats buildings as
   * solid, and has to, or an objective *accidentally* sealed behind one would
   * start passing. So this map says the puzzle is deliberate and is judged by
   * the second fill.
   *
   * The supplies are behind the wall and there is no way round: a rifle does
   * one damage against sixty, so the grenades by the spawn are not a
   * convenience, they are the key.
   */
  'through-the-wall'(g, place) {
    g.fillRect(0, 0, g.w, g.h, GRASS);
    g.frame(ROCK, { min: 4, max: 9 });
    scatter(g, SAND, 12, [4, 8], [GRASS]);
    scatter(g, TALL, 8, [3, 5], [GRASS]);
    forest(g, 8, [2, 4]);

    // A rock wall clean across the map, with one gap in it.
    const wallX = Math.round(g.w * 0.46);
    const gapY = Math.round(g.h * 0.5);
    for (let y = 0; y < g.h; y++) {
      for (let k = 0; k < 3; k++) g.set(wallX + k, y, ROCK);
    }
    /*
     * The gap, filled by a factory. This is the door -- and it has to be the
     * size of the sprite that stands in it.
     *
     * It was five tiles tall against a 54px sprite, so the block was 80px of
     * footprint wearing 54px of building: twenty-six pixels of bare ground
     * showed between the roof and the stone above it, and the door read as a
     * hut parked in a hole rather than as the thing plugging it. The wall
     * itself was never the problem -- a flood fill from the west edge cannot
     * reach the east side either way -- but a door that visibly does not fill
     * its frame is a door nobody believes in.
     */
    for (let y = gapY - 1; y <= gapY + 1; y++) for (let k = 0; k < 3; k++) g.set(wallX + k, y, FACTORY);

    const spawn = clearing(g, 10, gapY, 5);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);

    // Grenades on the near side. Without them the wall does not come down.
    place.put('c', spawn.x + 8, spawn.y - 4, 4);
    place.put('c', spawn.x + 8, spawn.y + 4, 4);
    place.put('o', wallX - 5, gapY, 4);

    /*
     * The approach has teeth now (200-qa 017): a three-man picket walking a
     * fixed north-south beat in front of the wall. The mission used to be an
     * uncontested stroll to a demolition; the picket makes the walk itself a
     * timing problem, and the beat is learnable -- the nodes chain (see
     * chainPatrolRoutes in world.ts).
     */
    const picketX = Math.round(wallX * 0.68);
    for (const dy of [-9, 0, 9]) place.put('E', picketX, gapY + dy, 5, 3);
    for (const dy of [-8, 0, 8]) place.put('p', picketX, gapY + dy, 3, 3);

    // Everything past the wall is unreachable until it falls, so it is placed
    // by hand rather than through the confined Placer.
    const far = (mx, my, ch) => {
      for (let i = 0; i < 300; i++) {
        const px = Math.round(mx + (g.rnd() - 0.5) * 12);
        const py = Math.round(my + (g.rnd() - 0.5) * 16);
        if (!g.isOpen(px, py) || px <= wallX + 3) continue;
        if (place.used.some((q) => Math.hypot(q.x - px, q.y - py) < 2.5)) continue;
        place.used.push({ x: px, y: py });
        g.set(px, py, ch);
        return { x: px, y: py };
      }
      return null;
    };
    for (let i = 0; i < 4; i++) far(g.w * 0.72, g.h * (0.25 + i * 0.17), 'k');
    for (let i = 0; i < 10; i++) far(g.w * 0.7, g.h * g.rnd(), 'E');
    far(g.w * 0.85, g.h * 0.3, 'S');
    far(g.w * 0.85, g.h * 0.7, 'B');
    // A marched line between the supplies, so the far side moves.
    for (const fy of [0.35, 0.5, 0.65]) far(g.w * 0.66, g.h * fy, 'p');

    /*
     * The wall answers back (200-qa 017). Spawner huts behind it arm the
     * proximity trickle the moment the squad pushes through the breach --
     * "take the factory down and then have a few enemies" becomes take it
     * down and meet the men it was protecting. Flanking the gap, not on the
     * line through it, so the route to the supplies stays honest; seven
     * tiles clear of the wall so their yards cannot eat the rock.
     */
    building(g, wallX + 7, gapY - 11, 2, 2, HUT);
    building(g, wallX + 7, gapY + 9, 2, 2, HUT);
    building(g, Math.round(g.w * 0.82), gapY - 1, 2, 2, HUT);
  },

  /**
   * A forest narrows (200-qa 019): The Narrows' spirit under a canopy.
   *
   * One green corridor, no room, and a garrison you mostly cannot see --
   * every man tucked against the treeline or standing in the grass pockets
   * that fray the corridor's edges, with ambush doctrine holding their fire
   * until the squad is nearly on them. No clock: The Narrows owns the clock,
   * and this one trades it for dread. The lesson is the edges.
   */
  'the-choke'(g, place) {
    g.fillRect(0, 0, g.w, g.h, TREE);

    // The corridor, winding, pinching to under three tiles at its throats.
    const floor = [];
    let y = g.h * 0.5;
    for (let x = 2; x < g.w - 2; x++) {
      y += Math.sin(x / 11) * 0.6 + (g.rnd() - 0.5) * 0.4;
      y = Math.max(7, Math.min(g.h - 8, y));
      const half = 2.6 + Math.sin(x / 13) * 1.8;
      for (let k = -half; k <= half; k++) g.set(x, Math.round(y + k), GRASS);
      floor.push({ x, y: Math.round(y), half: Math.round(half) });
    }
    // Grass pockets fraying the edges: the cover the garrison hides in, and
    // the cover the squad can steal.
    for (const f of floor) {
      if (g.rnd() < 0.25) g.paint(f.x, f.y - f.half, TALL, [GRASS]);
      if (g.rnd() < 0.25) g.paint(f.x, f.y + f.half, TALL, [GRASS]);
      if (g.rnd() < 0.08) g.disc(f.x, f.y + (g.rnd() < 0.5 ? -f.half : f.half), 1.8, TALL, [GRASS, TREE]);
    }

    const spawn = clearing(g, 7, floor[5].y, 4);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);
    place.put('c', 13, floor[11].y, 4);

    // The extraction, at the far end.
    const end = floor[floor.length - 1];
    g.disc(end.x - 2, end.y, 4, GRASS, [TREE, TALL]);
    g.fillRect(end.x - 3, end.y - 1, 2, 2, TENT);

    // The garrison hugs the rim: each man dropped at the corridor's edge,
    // alternating sides, half of them standing in the grass itself.
    for (let i = 0; i < 13; i++) {
      const f = floor[Math.round(floor.length * (0.2 + i * 0.058))];
      const side = i % 2 === 0 ? -1 : 1;
      place.put('E', f.x, f.y + side * (f.half + 1), 3, 3);
    }
    const mid = floor[Math.round(floor.length * 0.45)];
    place.put('o', mid.x, mid.y, 6);
    const deep = floor[Math.round(floor.length * 0.6)];
    place.put('c', deep.x, deep.y, 5);
  },

  /**
   * Not a Sound's loud twin (200-qa 018).
   *
   * The owner liked the quiet map's bones and asked for them again, rotated
   * and armed: the lane runs east to west this time and drifts harder, there
   * is no pen, no tent, no rule against a body -- fifteen men hold the grass
   * and every one of them is the mission. No huts, per the brief: what is on
   * the field at the whistle is all there is.
   */
  'loud-and-clear'(g, place) {
    g.fillRect(0, 0, g.w, g.h, GRASS);
    g.frame(TREE, { min: 3, max: 7 });
    forest(g, 26, [3, 6]);
    scatter(g, TALL, 60, [4, 8]);

    // The lane, east to west, drifting harder than the original's.
    const lane = [];
    let y = Math.floor(g.h * 0.55);
    let drift = 0;
    for (let x = g.w - 7; x >= 6; x--) {
      drift = Math.max(-1.2, Math.min(1.2, drift + (g.rnd() - 0.5) * 0.9));
      y = Math.max(9, Math.min(g.h - 10, Math.round(y + drift)));
      lane.push({ x, y });
      for (let dy = -2; dy <= 2; dy++) g.paint(x, y + dy, TALL, [TREE, ROCK, GRASS, SAND]);
    }

    const start = lane[1];
    squad(g, place, start);
    place.used.push(start);
    place.confineTo(start.x, start.y);
    place.put('c', start.x - 8, start.y, 5);

    // Five fighting groups down the lane's flanks, alternating sides, two of
    // them marching three-node beats the player can time between.
    const heads = [];
    for (let i = 0; i < 5; i++) {
      const anchor = lane[Math.round((lane.length * (i + 0.55)) / 5.5)];
      const head = place.put('E', anchor.x, anchor.y + (i % 2 === 0 ? -7 : 7), 6, 3);
      if (!head) continue;
      heads.push(head);
      for (let k = 0; k < 2; k++) place.put('E', head.x, head.y, 5, 3);
    }
    for (const head of [heads[1], heads[3]]) {
      if (!head) continue;
      for (let i = -1; i <= 1; i++) {
        const nx = head.x + i * 9;
        if (nx < 5 || nx > g.w - 6) continue;
        g.disc(nx, head.y, 1.6, GRASS, [TREE, ROCK, TALL]);
        g.set(nx, head.y, 'p');
      }
    }

    // A bazooka overwatching mid-lane, barrels to answer him with, and a
    // second crate deep enough that reaching it is a decision.
    const mid = lane[Math.round(lane.length * 0.55)];
    place.put('B', mid.x, mid.y - 9, 6, 4);
    for (let i = 0; i < 2; i++) place.put('o', mid.x, mid.y, 9, 5);
    const deep = lane[Math.round(lane.length * 0.75)];
    place.put('c', deep.x, deep.y, 6);
  },

  /**
   * The Narrows, hand-cut (200-qa 012).
   *
   * The generated canyon gave four minutes for what the owner ran in sixty
   * seconds. This keeps the dash and adds the wrong turn: at mid-canyon the
   * floor forks, and the branch that carries straight on -- the obvious line
   * -- widens into a bowl with a garrison waiting in it and no way out,
   * while the true route bends hard south. A crate glints in the fork's
   * mouth as bait. The clock is a hundred seconds: enough to sprint the
   * truth, not enough to survive the lie -- the retry-often mission the
   * brief asked it to be.
   */
  'the-narrows'(g, place) {
    g.fillRect(0, 0, g.w, g.h, ROCK);

    // The true canyon, west to east, bending hard south after the fork.
    const floor = [];
    let y = g.h * 0.45;
    const forkX = Math.round(g.w * 0.52);
    for (let x = 2; x < g.w - 2; x++) {
      const drift = x > forkX && x < forkX + 26
        ? 0.55
        : Math.sin(x / 9) * 0.5 + (g.rnd() - 0.5) * 0.3;
      y = Math.max(7, Math.min(g.h - 8, y + drift));
      const half = 3.2 + Math.sin(x / 15) * 2.2;
      for (let k = -half; k <= half; k++) g.set(x, Math.round(y + k), GRASS);
      floor.push({ x, y: Math.round(y) });
    }

    // The lie: straight on from the fork, widening, then stopping dead.
    const forkY = floor[forkX - 2].y;
    let fy = forkY;
    for (let x = forkX; x < forkX + 34; x++) {
      fy += (g.rnd() - 0.5) * 0.4 - 0.1;
      const half = 2.8 + (x - forkX) * 0.05;
      for (let k = -half; k <= half; k++) g.set(x, Math.round(fy + k), GRASS);
    }
    const bowl = { x: forkX + 36, y: Math.round(fy) };
    g.disc(bowl.x, bowl.y, 7, GRASS, [ROCK]);

    scatter(g, SAND, 12, [3, 6], [GRASS]);

    const spawn = clearing(g, 7, floor[5].y, 4);
    squad(g, place, spawn);
    place.used.push(spawn);
    place.confineTo(spawn.x, spawn.y);
    place.put('c', 14, floor[12].y, 4);

    // The extraction, at the far end of the truth.
    const end = floor[floor.length - 1];
    g.disc(end.x - 2, end.y, 4, GRASS, [ROCK]);
    g.fillRect(end.x - 3, end.y - 1, 2, 2, TENT);

    // Ambush pockets down the true route, and a sniper watching the last leg.
    for (let i = 0; i < 12; i++) {
      const at = floor[Math.round(floor.length * (0.22 + 0.06 * i))];
      place.put('E', at.x, at.y, 4, 3);
    }
    const late = floor[Math.round(floor.length * 0.8)];
    place.put('S', late.x, late.y, 5, 4);

    // The wrong turn's payoff: a garrison stacked in the dead end, a barrel
    // among them, and the bait crate in the fork's mouth.
    place.put('c', forkX + 6, forkY, 3);
    for (let i = 0; i < 9; i++) place.put('E', bowl.x, bowl.y, 6, 2);
    place.put('S', bowl.x + 2, bowl.y - 2, 4, 3);
    place.put('o', bowl.x - 3, bowl.y + 2, 4);
  },

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

    // Huts ring the outpost at a distance, and every attacker in the mission
    // comes out of one of them.
    //
    // They used to come with two men standing beside them, which on eight huts
    // plus swarm doctrine's `extraEnemies` meant the mission opened with
    // eighteen enemies already on the field -- against a briefing that promises
    // "five waves come out of the huts", and against a squad that was wiped at
    // eleven seconds if left alone. An opening garrison is not a garnish on a
    // wave mission; it is a different mission happening first. So: none.
    for (let a = 0; a < 360; a += 45) {
      const ang = (a * Math.PI) / 180;
      const hx = Math.round(cx + Math.cos(ang) * (g.w * 0.38));
      const hy = Math.round(cy + Math.sin(ang) * (g.h * 0.38));
      if (hx < 5 || hy < 5 || hx > g.w - 7 || hy > g.h - 7) continue;
      building(g, hx, hy, 2, 2, HUT);
    }
    // No bazookateers standing off either. Two men shelling the outpost from
    // twenty tiles out is a good idea for this mission and a bad idea at t=0:
    // the brief asks for a field that is empty until the first wave, and half
    // an exception is still an exception. Wave *composition* is where they
    // belong -- every wave is riflemen today -- and that is its own change.
  },
};

// ------------------------------------------------------- layout grammar

/*
 * Layouts, dressing and population as three separate passes.
 *
 * The twelve builders above each do all three at once, which is why they all
 * came out the same shape: `frame` then `forest` then `scatter` then a spawn
 * then enemies thrown at random positions. Every terrain primitive places blobs
 * uniformly, so nothing in that toolbox can produce a *silhouette* -- and twenty
 * more of them would have been twenty recolours of one wood.
 *
 * So a layout decides the skeleton only: where the impassable mass is, where
 * the routes are, where the chokepoints are. It returns the anchors a mission
 * needs -- a spawn, a far end, and the places worth fighting over -- and knows
 * nothing about objectives. `dress` then adds the theme's foliage and hazards,
 * and `populate` puts down whatever the objective requires, reading the anchors.
 *
 * The twelve existing builders are deliberately left alone. They are the
 * shipped campaign and they are tuned; rewriting them into this to prove a
 * point about tidiness would risk twelve regressions and buy nothing.
 */

/** Theme-appropriate hard terrain: what the world is walled in with. */
const MASS = { jungle: TREE, desert: ROCK, arctic: ROCK };

/**
 * Each layout takes the grid and returns `{ spawn, far, hubs }` in tiles.
 *
 * `spawn` is where the squad lands, `far` is the other end of the mission, and
 * `hubs` are the places a garrison or an objective belongs -- a clearing, a
 * yard, an island. Populate never invents a position; it only ever asks for one
 * of these, which is what keeps a mission's shape and its contents agreeing.
 */
const LAYOUTS = {
  /** A long corridor with cover in alternating bays. Everything is forward. */
  gauntlet(g, mass) {
    g.frame(mass, { min: 5, max: 12 });
    const midY = Math.round(g.h / 2);
    const hubs = [];
    const bays = Math.max(4, Math.round(g.w / 26));
    for (let i = 0; i < bays; i++) {
      const x = Math.round((g.w / (bays + 1)) * (i + 1));
      // Alternating shoulders pinching the corridor, so the route weaves.
      const y = i % 2 === 0 ? midY - Math.round(g.h * 0.28) : midY + Math.round(g.h * 0.28);
      g.blob(x, y, 4 + g.rnd() * 4, mass, 0.95, [GRASS, SAND, TALL]);
      hubs.push({ x, y: i % 2 === 0 ? midY + 4 : midY - 4 });
    }
    return { spawn: { x: 8, y: midY }, far: { x: g.w - 9, y: midY }, hubs };
  },

  /** Land in the middle of deep water, reached by two causeway bridges. */
  island(g, mass) {
    g.fillRect(0, 0, g.w, g.h, DEEP);
    const cx = g.w / 2;
    const cy = g.h / 2;
    const r = Math.min(g.w, g.h) * 0.36;
    g.disc(cx, cy, r, GRASS);
    g.disc(cx, cy, r + 1.2, SAND, [DEEP]);
    // A shallow lip, so the shore is a beach rather than a cliff into the sea.
    for (let a = 0; a < 360; a += 3) {
      const rad = (a * Math.PI) / 180;
      g.paint(Math.round(cx + Math.cos(rad) * (r + 2)), Math.round(cy + Math.sin(rad) * (r + 2)), WATER, [DEEP]);
    }
    const spawn = { x: Math.round(cx - r * 0.72), y: Math.round(cy) };
    g.disc(spawn.x, spawn.y, 5, GRASS);
    const hubs = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6;
      hubs.push({ x: Math.round(cx + Math.cos(a) * r * 0.55), y: Math.round(cy + Math.sin(a) * r * 0.55) });
    }
    return { spawn, far: { x: Math.round(cx + r * 0.7), y: Math.round(cy) }, hubs };
  },

  /** A walled compound in the middle, approachable from every side. */
  ringSiege(g, mass) {
    g.frame(mass, { min: 4, max: 10 });
    const cx = Math.round(g.w / 2);
    const cy = Math.round(g.h / 2);
    const w = Math.round(Math.min(g.w, g.h) * 0.34);
    const h = Math.round(Math.min(g.w, g.h) * 0.3);
    g.disc(cx, cy, Math.max(w, h) * 0.9, GRASS, [TREE, ROCK, TALL]);
    compound(g, cx - Math.round(w / 2), cy - Math.round(h / 2), w, h, { gates: 4 });
    const hubs = [{ x: cx, y: cy }];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      hubs.push({
        x: Math.round(cx + Math.cos(a) * g.w * 0.33),
        y: Math.round(cy + Math.sin(a) * g.h * 0.33),
      });
    }
    return { spawn: { x: cx, y: g.h - 8 }, far: { x: cx, y: cy }, hubs };
  },

  /** A braided river with several crossings and land between the channels. */
  delta(g, mass) {
    g.frame(mass, { min: 4, max: 9 });
    river(g, { axis: 'h', width: 3, wobble: 6, crossings: [0.22, 0.5, 0.78], deep: true });
    river(g, { axis: 'v', width: 2, wobble: 8, crossings: [0.3, 0.68] });
    const hubs = [];
    for (let i = 0; i < 6; i++) {
      hubs.push({
        x: Math.round(g.w * (0.18 + 0.64 * ((i % 3) / 2))),
        y: Math.round(g.h * (i < 3 ? 0.22 : 0.78)),
      });
    }
    return { spawn: { x: 9, y: g.h - 9 }, far: { x: g.w - 9, y: 9 }, hubs };
  },

  /** Rock walls with a narrow winding floor, and no way round. */
  canyon(g, mass) {
    g.fillRect(0, 0, g.w, g.h, ROCK);
    let y = g.h / 2;
    const hubs = [];
    for (let x = 2; x < g.w - 2; x++) {
      y += Math.sin(x / 9) * 0.55 + (g.rnd() - 0.5) * 0.35;
      y = Math.max(7, Math.min(g.h - 8, y));
      // The floor pinches and opens, so there are places to fight and places to
      // only pass through.
      const half = 3.5 + Math.sin(x / 17) * 2.6;
      for (let k = -half; k <= half; k++) g.set(x, Math.round(y + k), GRASS);
      if (x % Math.round(g.w / 6) === 0 && x > 10 && x < g.w - 12) hubs.push({ x, y: Math.round(y) });
    }
    scatter(g, SAND, 12, [3, 6], [GRASS]);
    return { spawn: { x: 7, y: Math.round(g.h / 2) }, far: { x: g.w - 8, y: Math.round(y) }, hubs };
  },

  /** Sea down one side, a strip of land, and piers running out into it. */
  coast(g, mass) {
    g.frame(mass, { min: 3, max: 8 });
    const shore = Math.round(g.h * 0.62);
    for (let x = 0; x < g.w; x++) {
      const edge = shore + Math.round(Math.sin(x / 14) * 4 + Math.sin(x / 5.5) * 1.6);
      for (let y = edge; y < g.h; y++) g.set(x, y, y > edge + 3 ? DEEP : WATER);
      g.paint(x, edge - 1, SAND, [GRASS, TALL]);
      g.paint(x, edge - 2, SAND, [GRASS, TALL]);
    }
    const hubs = [];
    for (let i = 0; i < 5; i++) {
      const x = Math.round((g.w / 6) * (i + 1));
      hubs.push({ x, y: Math.round(shore * 0.55) });
      if (i % 2 === 0) pier(g, { x, y: shore - 2 }, { x, y: Math.min(g.h - 3, shore + 8) });
    }
    return { spawn: { x: 9, y: Math.round(shore * 0.4) }, far: { x: g.w - 10, y: Math.round(shore * 0.4) }, hubs };
  },

  /** Two roads meeting, with a town in the quadrants. */
  crossroads(g, mass) {
    g.frame(mass, { min: 4, max: 9 });
    forest(g, 10, [3, 6]);
    const cx = Math.round(g.w / 2);
    const cy = Math.round(g.h / 2);
    road(g, { x: 5, y: cy }, { x: g.w - 6, y: cy });
    road(g, { x: cx, y: 5 }, { x: cx, y: g.h - 6 });
    verge(g, 2);
    const tw = Math.round(g.w * 0.3);
    const th = Math.round(g.h * 0.3);
    const put = streets(g, cx - Math.round(tw / 2), cy - Math.round(th / 2), tw, th, { cols: 3, rows: 2 });
    return { spawn: { x: 8, y: cy }, far: { x: cx, y: cy }, hubs: put.length ? put : [{ x: cx, y: cy }] };
  },

  /** A spiral wall: one long way in, and no shortcuts across it. */
  spiral(g, mass) {
    g.frame(mass, { min: 4, max: 9 });
    const cx = Math.round(g.w / 2);
    const cy = Math.round(g.h / 2);
    const maxR = Math.min(g.w, g.h) * 0.42;
    g.disc(cx, cy, maxR + 2, GRASS, [TREE, ROCK, TALL]);
    // Three arcs at increasing radius, each with its opening a third of a turn
    // round from the last, so getting in means walking most of a lap per ring.
    for (let ring = 0; ring < 3; ring++) {
      const r = maxR * (0.4 + ring * 0.28);
      const gap = ring * 2.1;
      for (let a = 0; a < 360; a += 2) {
        const rad = (a * Math.PI) / 180;
        if (Math.abs(((rad - gap + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > Math.PI - 0.42) continue;
        g.paint(Math.round(cx + Math.cos(rad) * r), Math.round(cy + Math.sin(rad) * r), FENCE, [GRASS, SAND, TALL, ICE]);
      }
    }
    const hubs = [{ x: cx, y: cy }];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      hubs.push({ x: Math.round(cx + Math.cos(a) * maxR * 0.72), y: Math.round(cy + Math.sin(a) * maxR * 0.72) });
    }
    return { spawn: { x: cx, y: g.h - 7 }, far: { x: cx, y: cy }, hubs };
  },

  /** A diagonal spine of rock with a handful of passes through it. */
  ridgeline(g, mass) {
    g.frame(mass, { min: 4, max: 9 });
    const passes = [0.24, 0.55, 0.82];
    for (let i = 0; i < g.w; i++) {
      const t = i / g.w;
      const y = Math.round(g.h * (0.18 + t * 0.62) + Math.sin(i / 12) * 3);
      const near = passes.some((p) => Math.abs(t - p) < 0.035);
      if (near) continue;
      for (let k = -3; k <= 3; k++) g.paint(i, y + k, ROCK, [GRASS, SAND, TALL, ICE]);
    }
    const hubs = passes.map((p) => ({
      x: Math.round(g.w * p),
      y: Math.round(g.h * (0.18 + p * 0.62)),
    }));
    hubs.push({ x: Math.round(g.w * 0.5), y: Math.round(g.h * 0.14) });
    hubs.push({ x: Math.round(g.w * 0.5), y: Math.round(g.h * 0.88) });
    return { spawn: { x: 8, y: 8 }, far: { x: g.w - 9, y: g.h - 9 }, hubs };
  },

  /** A chain of islands joined by narrow causeways. Nowhere to spread out. */
  causeway(g, mass) {
    g.fillRect(0, 0, g.w, g.h, DEEP);
    const n = Math.max(4, Math.round(g.w / 24));
    const hubs = [];
    let prev = null;
    for (let i = 0; i < n; i++) {
      const x = Math.round((g.w / (n + 1)) * (i + 1));
      const y = Math.round(g.h * (0.32 + 0.36 * ((i % 2 + Math.sin(i)) / 2 + 0.5)));
      const r = 6 + g.rnd() * 4;
      g.disc(x, y, r, GRASS);
      g.disc(x, y, r + 1.1, SAND, [DEEP]);
      if (prev) pier(g, prev, { x, y });
      prev = { x, y };
      hubs.push({ x, y });
    }
    return { spawn: hubs[0], far: hubs[hubs.length - 1], hubs: hubs.slice(1, -1) };
  },
};

/** Theme dressing: what grows on the skeleton. Never changes what is passable. */
function dress(g, spec) {
  if (spec.theme === 'desert') {
    dunes(g, 22, [6, 13]);
    scatter(g, TALL, 10, [2, 5], [SAND, GRASS]);
    scatter(g, ROCK, 9, [1, 3], [SAND, GRASS]);
    scatter(g, QUICK, 4, [2, 4], [SAND]);
  } else if (spec.theme === 'arctic') {
    scatter(g, ICE, 10, [3, 7], [GRASS]);
    forest(g, 8, [2, 4]);
    scatter(g, ROCK, 7, [1, 3], [GRASS, ICE]);
  } else {
    forest(g, 14, [2, 5]);
    scatter(g, TALL, 14, [3, 6], [GRASS]);
    scatter(g, ROCK, 5, [1, 3], [GRASS]);
  }
}

/**
 * Puts down whatever the objective needs, using the layout's anchors.
 *
 * Never invents a position: everything lands on a hub, the spawn or the far
 * end. That is what keeps a generated mission's contents agreeing with its
 * shape -- an objective dropped at a random open tile is how a "canyon map"
 * ends up being about a corner of the canyon nobody was routed through.
 */
function populate(g, place, spec, at) {
  const { spawn, far, hubs } = at;
  /*
   * Hubs come off the layouts on half-tiles -- a corridor's midpoint, a
   * crossroads' centre -- and a *marker* is happy with that while a *building*
   * is not: `fillRect` walks integer rows and a fractional y indexes nothing.
   * It surfaced as a crash on the one layout whose hubs happened to land on a
   * half, which is the kind of fault that waits for the map after next, so it
   * is rounded here rather than at each of the six places that build on one.
   */
  const pick = (i) => {
    const h = hubs[i % hubs.length] ?? far;
    return { ...h, x: Math.round(h.x), y: Math.round(h.y) };
  };
  const guards = spec.guards ?? 10;

  switch (spec.objective) {
    case 'reach':
      g.disc(far.x, far.y, 4, GRASS, [TREE, ROCK, TALL, QUICK]);
      g.fillRect(far.x - 1, far.y - 1, 2, 2, TENT);
      break;
    case 'rescue': {
      g.disc(spawn.x + 7, spawn.y, 4, GRASS, [TREE, ROCK, TALL, QUICK, ICE]);
      g.fillRect(spawn.x + 6, spawn.y - 1, 2, 2, TENT);
      const pen = pick(hubs.length - 1);
      g.disc(pen.x, pen.y, 6, GRASS, [TREE, ROCK, TALL, QUICK, ICE]);
      for (let i = 0; i < 4; i++) place.put('H', pen.x, pen.y, 4, 3);
      break;
    }
    case 'demolish':
      for (let i = 0; i < Math.min(5, hubs.length); i++) {
        const h = pick(i);
        building(g, h.x - 1, h.y - 1, 2, 2, HUT);
      }
      break;
    case 'collect':
      for (let i = 0; i < 5; i++) {
        const h = pick(i);
        place.put('k', h.x, h.y, 5, 4);
      }
      break;
    case 'assassinate': {
      const post = pick(0);
      g.disc(post.x, post.y, 5, GRASS, [TREE, ROCK, TALL, QUICK, ICE]);
      place.put('C', post.x, post.y, 2, 2);
      // His bodyguard, close enough that reaching him is the problem.
      for (let i = 0; i < 4; i++) place.put('E', post.x, post.y, 6, 3);
      break;
    }
    case 'hold': {
      /*
       * A hold zone needs something in it.
       *
       * It used to be a marker on cleared ground, so the mission asked the
       * player to stand on a coordinate -- and a circle drawn on bare road
       * looks like a bug rather than a position, because nothing about the map
       * explains why *there*. A bunker explains it: the ground is worth holding
       * because somebody built something on it, and the thing they built cannot
       * be blown up, so the mission stays a defence instead of quietly becoming
       * a demolition puzzle with a hidden answer.
       *
       * The zone marker sits beside the bunker rather than on it -- the tile is
       * solid, and the extraction pad is measured from the block's edge anyway.
       */
      const zx = pick(0).x;
      const zy = pick(0).y;
      g.disc(zx, zy, 6, GRASS, [TREE, ROCK, TALL, QUICK, ICE]);
      building(g, zx - 1, zy - 1, 2, 2, BUNKER);
      place.used.push({ x: zx, y: zy });
      place.put('X', zx, zy + 2, 1);

      /*
       * Somewhere for the pressure to come from.
       *
       * `hold` and `survive` are the same mission -- stand somewhere while they
       * come for you -- and only one of them had a way of producing anybody. A
       * hold map fielded a fixed garrison, so once it was dead the player stood
       * in a circle watching a clock, which is a wait rather than a defence.
       * Four huts well out from the zone, and the `waves:` header in the
       * campaign table does the rest.
       *
       * Placed at the compass points and clear of the zone by a good margin, so
       * a wave has ground to cross and the player has time to see it coming.
       */
      const reach = Math.round(Math.min(g.w, g.h) * 0.34);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const hx = zx + dx * reach;
        const hy = zy + dy * reach;
        if (hx < 5 || hy < 5 || hx > g.w - 7 || hy > g.h - 7) continue;
        building(g, hx, hy, 2, 2, HUT);
        place.used.push({ x: hx, y: hy });
      }
      break;
    }
    case 'survive': {
      building(g, spawn.x - 1, spawn.y - 6, 2, 2, OUTPOST);
      for (let i = 0; i < Math.min(4, hubs.length); i++) {
        const h = pick(i);
        building(g, h.x - 1, h.y - 1, 2, 2, HUT);
      }
      break;
    }
    default:
      break;
  }

  /*
   * The garrison, spread over the hubs rather than over the map, so every part
   * of the layout that was worth building is a part somebody is holding.
   *
   * **Unless the mission is made of waves.** On a `waves:` map the schedule is
   * the mission and the field is meant to be empty until the first one lands --
   * a standing garrison on top of it is a different mission happening first,
   * and it was the original complaint about Last Stand. That was fixed for Last
   * Stand alone; the brief said to check them all and six other wave maps were
   * still opening with ten men on the ground. So it is a rule here rather than
   * an edit there, and a wave map added tomorrow inherits it.
   */
  const waveMission = spec.waves != null;
  for (let i = 0; !waveMission && i < guards; i++) {
    const h = pick(i);
    place.put('E', h.x, h.y, 7, 3);
  }
  for (let i = 0; !waveMission && i < Math.max(1, Math.round(guards / 5)); i++) {
    const h = pick(i * 2 + 1);
    place.put(i % 2 === 0 ? 'S' : 'B', h.x, h.y, 6, 4);
  }
  for (let i = 0; i < 3; i++) place.put('p', pick(i * 3).x, pick(i * 3).y, 6, 6);
  place.put('c', spawn.x + 9, spawn.y, 6);
  place.put('c', pick(1).x, pick(1).y, 7);
  for (let i = 0; i < 2; i++) place.put('o', pick(i + 2).x, pick(i + 2).y, 6, 5);

  /*
   * Camps: garrisoned spots a table row pins by hand, as map fractions.
   *
   * The layouts route everything through their hubs, which is what leaves a
   * corner of the map empty when no hub landed there -- Dust Devils shipped
   * with a bare bottom-left quarter (200-qa 022). `camps` lets a row say
   * "and put something *there*" without the mission graduating to a
   * hand-written builder: a clearing, riflemen, a short patrol beat between
   * two nodes, barrels, optionally spawner huts. Skipped wholesale on wave
   * maps, whose fields must open empty.
   */
  for (const camp of waveMission ? [] : spec.camps ?? []) {
    const cx = Math.round(g.w * camp.at[0]);
    const cy = Math.round(g.h * camp.at[1]);
    clearing(g, cx, cy, 6);
    for (let i = 0; i < (camp.huts ?? 0); i++) {
      building(g, cx - 5 + (i % 2) * 8, cy - 4 + ((i / 2) | 0) * 7, 2, 2, HUT);
    }
    for (let i = 0; i < (camp.guards ?? 0); i++) place.put('E', cx, cy, 6, 3);
    for (let i = 0; i < (camp.barrels ?? 0); i++) place.put('o', cx, cy, 7, 4);
    // Two nodes eight tiles apart: inside chaining range, so the camp's
    // guards march a short fixed beat rather than standing in a ring.
    place.put('p', cx - 4, cy, 3, 3);
    place.put('p', cx + 4, cy, 3, 3);
  }
}

/** Builds a mission from a layout rather than from a hand-written builder. */
function fromLayout(g, place, spec) {
  const mass = MASS[spec.theme] ?? TREE;
  const at = LAYOUTS[spec.layout](g, mass);
  dress(g, spec);

  const spawn = clearing(g, at.spawn.x, at.spawn.y, 5);
  squad(g, place, spawn, spec.squad ?? 6);
  place.used.push(spawn);
  place.confineTo(spawn.x, spawn.y);

  populate(g, place, spec, { ...at, spawn });
}

// -------------------------------------------------------------- campaign

const CAMPAIGN = [
  {
    id: 'test-shooting', dev: true, doctrine: 'garrison', order: 98, seed: 90210, w: 54, h: 34,
    name: 'Shooting Range', theme: 'jungle', objective: 'eliminate',
    mechanic: 'nothing but targets',
    brief: 'Dev only. Flat ground, huts to level and men to shoot, and no cover to blame.',
  },
  {
    id: 'lone-wolf', squad: 1, doctrine: 'patrol', order: 11, seed: 887701, w: 84, h: 52,
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
  /*
   * The two missions before the campaign starts.
   *
   * Everything this game asks of a player is taught by a mission rather than by
   * a page of controls: the first one is five men in a field and the discovery
   * that moving and shooting are different buttons, the second is a bridge with
   * grenades lying on it and two huts that rifles will not touch.
   */
  {
    // No grenades at all: this mission is about marching and shooting, and a
    // full pouch is a third thing to think about while learning the first two.
    grenades: 0,
    id: 'training-fire', doctrine: 'garrison', order: 1, seed: 110001, w: 52, h: 34,
    name: 'Basic Training', theme: 'jungle', objective: 'eliminate',
    mechanic: 'move, and then fire',
    // No control names in here any more. This line named a right-click, which
    // is a button Apple hardware does not have, and the briefing had no way to
    // say anything else -- the comms panel does it now, branched per platform
    // (201-qa 007).
    brief: 'Five of them, in the open. Nothing between you and them.',
  },
  {
    // None to start with either -- the whole mission is the grenades you walk
    // over on the bridge, and arriving with four makes that pickup mean
    // nothing at all.
    grenades: 0,
    id: 'training-bridge', doctrine: 'garrison', order: 2, seed: 110002, w: 46, h: 60,
    name: 'Over the Water', theme: 'jungle', objective: 'demolish',
    mechanic: 'the bridge, and what is on it',
    brief: 'Both huts, and rifles will barely mark them. There are grenades on the bridge -- walk over them, then use them.',
  },
  {
    id: 'chicken-run', doctrine: 'garrison', order: 3, seed: 20250830, w: 88, h: 56,
    name: 'Chicken Run', theme: 'jungle', objective: 'eliminate',
    mechanic: 'basics',
    brief: 'Move as a herd, use the treeline, and let them come to you.',
  },
  {
    id: 'river-run', doctrine: 'garrison', order: 4, seed: 771903, w: 64, h: 88,
    name: 'River Run', theme: 'jungle', objective: 'eliminate',
    mechanic: 'deep water',
    brief: 'Deep water cannot be crossed. Take a bridge, and expect it covered.',
  },
  {
    id: 'long-road', doctrine: 'ambush', order: 5, seed: 448210, w: 220, h: 44,
    name: 'The Long Road', theme: 'desert', objective: 'reach',
    mechanic: 'extraction',
    brief: 'A long march east. Get everyone still standing to the pickup.',
  },
  {
    id: 'undergrowth', doctrine: 'patrol', order: 6, seed: 913377, w: 96, h: 68,
    name: 'Undergrowth', theme: 'jungle', objective: 'eliminate',
    mechanic: 'tall grass',
    brief: 'Tall grass hides you but not your bullets. Snipers own the open ground.',
  },
  {
    id: 'minefield', doctrine: 'garrison', order: 7, seed: 610455, w: 92, h: 64,
    name: 'Minefield', theme: 'desert', objective: 'demolish',
    mechanic: 'mines',
    brief: 'Mines everywhere. Shoot a barrel to clear a lane, then level the huts.',
  },
  {
    id: 'village', doctrine: 'hunters', order: 8, seed: 328814, w: 96, h: 76,
    name: 'Village', theme: 'jungle', objective: 'demolish',
    mechanic: 'enemy buildings',
    brief: 'Huts keep sending out troopers. Grenades bring them down, rifles will not.',
  },
  {
    id: 'ice-station', doctrine: 'patrol', order: 9, seed: 175062, w: 100, h: 64,
    name: 'Ice Station', theme: 'arctic', objective: 'rescue',
    mechanic: 'hostages and ice',
    brief: 'Walk every prisoner back to the tent. Ice ruins your footing; one dead hostage ends it.',
  },
  {
    id: 'softly-softly', doctrine: 'garrison', order: 12, seed: 664218, w: 104, h: 56,
    name: 'Softly Softly', theme: 'jungle', objective: 'covert',
    mechanic: 'not being seen',
    brief: 'Walk out the far side without killing anybody. Firing is allowed; a body is not.',
  },
  /*
   * ---- grown from the layout grammar ------------------------------------
   *
   * A row, not a function. Every one of the ten layouts appears at least once
   * and every objective at least twice across the campaign, which is the point
   * of the grammar: the spread is something you arrange in a table rather than
   * something you hope for.
   *
   * The names and briefs are written by hand and always will be. The grammar
   * generates terrain; it does not generate a reason to play a level, and a
   * mission whose brief was autogenerated would read like one.
   */
  {
    id: 'dry-run', layout: 'gauntlet', doctrine: 'ambush', order: 22, seed: 411903, w: 168, h: 52,
    name: 'Dry Run', theme: 'desert', objective: 'reach',
    mechanic: 'a corridor with shoulders',
    brief: 'One way east, and the walls keep closing on you. Nothing here is optional.',
  },
  {
    id: 'no-way-off', layout: 'island', doctrine: 'garrison', order: 23, seed: 720184, w: 96, h: 86,
    name: 'No Way Off', theme: 'jungle', objective: 'eliminate', guards: 14,
    mechanic: 'nowhere to fall back to',
    brief: 'The sea is on every side. Clear it, because there is nowhere else to be.',
  },
  {
    id: 'cold-keep', layout: 'ringSiege', doctrine: 'swarm', order: 24, seed: 338261, w: 88, h: 88,
    duration: 110, waves: '5@20',
    name: 'Cold Keep', theme: 'arctic', objective: 'survive',
    mechanic: 'a wall with four gates',
    brief: 'Four ways in and one outpost. Level a hut and the next wave is thinner.',
  },
  {
    id: 'braided-water', layout: 'delta', doctrine: 'patrol', order: 25, seed: 509772, w: 104, h: 82,
    name: 'Braided Water', theme: 'jungle', objective: 'collect',
    mechanic: 'channels and crossings',
    brief: 'Five crates scattered across the delta. Every one of them is over water.',
  },
  {
    id: 'the-narrows', doctrine: 'ambush', order: 26, seed: 186540, w: 152, h: 58,
    timelimit: 100,
    name: 'The Narrows', theme: 'desert', objective: 'reach',
    mechanic: 'a clock, and a wrong turn',
    brief: 'A hundred seconds to the far end of the canyon, and the canyon lies about the way.',
  },
  {
    id: 'landing-ground', layout: 'coast', doctrine: 'hunters', order: 27, seed: 843017, w: 124, h: 72,
    name: 'Landing Ground', theme: 'jungle', objective: 'demolish', guards: 12,
    mechanic: 'piers and open shore',
    brief: 'Everything they land is stored above the beach. Take it all down.',
  },
  {
    id: 'hold-the-junction', layout: 'crossroads', doctrine: 'garrison', order: 28, seed: 265419, w: 104, h: 88,
    duration: 75, waves: '4@11',
    name: 'Hold the Junction', theme: 'desert', objective: 'hold',
    mechanic: 'ground, measured in seconds',
    brief: 'Take the bunker on the crossroads and stand there. Four waves come for it. Leaving stops the clock.',
  },
  {
    id: 'the-coil', layout: 'spiral', doctrine: 'patrol', order: 29, seed: 972330, w: 90, h: 90,
    name: 'The Coil', theme: 'arctic', objective: 'assassinate',
    mechanic: 'three rings, three gaps',
    brief: 'He is at the centre and every ring makes you walk most of a lap. Only he has to die.',
  },
  {
    id: 'the-spine', layout: 'ridgeline', doctrine: 'hunters', order: 30, seed: 604158, w: 112, h: 78,
    name: 'The Spine', theme: 'arctic', objective: 'eliminate', guards: 13,
    mechanic: 'a ridge with three passes',
    brief: 'Rock from end to end and three ways through it. They know which three.',
  },
  {
    id: 'stepping-stones', layout: 'causeway', doctrine: 'garrison', order: 31, seed: 117622, w: 144, h: 60,
    name: 'Stepping Stones', theme: 'jungle', objective: 'rescue',
    mechanic: 'islands, one at a time',
    brief: 'The prisoners are at the far end of the chain. Every causeway is a decision.',
  },
  {
    id: 'the-long-white', layout: 'gauntlet', doctrine: 'swarm', order: 32, seed: 488251, w: 150, h: 54,
    duration: 75, waves: '4@11',
    name: 'The Long White', theme: 'arctic', objective: 'hold',
    mechanic: 'holding a corridor',
    brief: 'Walk the length of it, take the far bunker, and keep somebody standing on it while they come.'
  },
  {
    id: 'white-cut', layout: 'canyon', doctrine: 'swarm', order: 33, seed: 733806, w: 138, h: 56,
    duration: 100, waves: '4@22',
    name: 'White Cut', theme: 'arctic', objective: 'survive',
    mechanic: 'nowhere to spread out',
    brief: 'A canyon floor, four waves, and walls that stop you going round them.',
  },
  {
    id: 'salt-flats', layout: 'delta', doctrine: 'patrol', order: 34, seed: 951274, w: 108, h: 80,
    name: 'Salt Flats', theme: 'desert', objective: 'eliminate', guards: 14,
    mechanic: 'water where there should be none',
    brief: 'Channels across a flat nobody expected water on. Clear both banks.',
  },
  {
    id: 'cold-shore', layout: 'coast', doctrine: 'ambush', order: 35, seed: 622085, w: 128, h: 70,
    name: 'Cold Shore', theme: 'arctic', objective: 'reach',
    mechanic: 'open ground beside deep water',
    brief: 'A strip of shore, a long way east, and no cover worth the name.',
  },
  {
    id: 'the-drum', layout: 'ringSiege', doctrine: 'hunters', order: 36, seed: 380916, w: 92, h: 92,
    name: 'The Drum', theme: 'jungle', objective: 'demolish', guards: 12,
    mechanic: 'a compound to get into',
    brief: 'Everything worth levelling is inside the wire, and they will not wait for you.',
  },
  {
    id: 'market-day', layout: 'crossroads', doctrine: 'ambush', order: 37, seed: 297643, w: 108, h: 86,
    name: 'Market Day', theme: 'jungle', objective: 'collect',
    mechanic: 'a town with sightlines',
    brief: 'Five crates among the blocks. Every street is a lane somebody is watching.',
  },

  // ---- set pieces: hand-written, because the shape is the point ----------
  {
    id: 'four-bridges', doctrine: 'garrison', order: 13, seed: 310577, w: 108, h: 70,
    name: 'Four Bridges', theme: 'jungle', objective: 'demolish',
    mechanic: 'a cut somebody dug',
    brief: 'A straight canal, four crossings, and every one of them covered. Pick your bridge.',
  },
  {
    id: 'walled-town', doctrine: 'patrol', order: 14, seed: 664901, w: 104, h: 72,
    name: 'The Walled Town', theme: 'desert', objective: 'assassinate',
    mechanic: 'streets, and one man in them',
    brief: 'He is somewhere in the middle. Nothing else on this map has to die.',
  },
  {
    id: 'not-a-sound', doctrine: 'garrison', order: 15, seed: 907714, w: 108, h: 58,
    name: 'Not a Sound', theme: 'jungle', objective: 'rescue', nokill: true,
    mechanic: 'a rescue nobody hears',
    brief: 'Walk three prisoners home through the grass. One body and it is over.',
  },
  {
    id: 'loud-and-clear', doctrine: 'garrison', order: 17, seed: 3315870, w: 108, h: 58,
    name: 'Loud and Clear', theme: 'jungle', objective: 'eliminate',
    mechanic: 'the quiet map, armed',
    brief: 'The same grass, the other way round. This time nobody is walking past anybody: clear it.',
  },
  {
    id: 'the-choke', doctrine: 'ambush', order: 20, seed: 411387, w: 150, h: 54,
    name: 'The Choke', theme: 'jungle', objective: 'reach',
    mechanic: 'edges you cannot read',
    brief: 'One green corridor to the far end. They are in the grass at its edges, and they will let you get close.',
  },
  {
    id: 'through-the-wall', doctrine: 'garrison', order: 16, seed: 155038, w: 96, h: 64, gated: true,
    name: 'Through the Wall', theme: 'desert', objective: 'collect',
    mechanic: 'the door is a building',
    brief: 'The supplies are on the far side and there is no way round. Bring the wall down.',
  },

  {
    id: 'last-stand', doctrine: 'swarm', order: 10, seed: 502991, w: 76, h: 76, duration: 150,
    name: 'Last Stand', theme: 'arctic', objective: 'survive', waves: '5@22',
    mechanic: 'holding out',
    brief: 'Hold the outpost for two minutes. Five waves come out of the huts -- level a hut and the next one is smaller.',
  },

  /*
   * Eleven more, to bring the desert and the ice up to the same fifteen the
   * jungle already had.
   *
   * Written as table rows rather than as builders, which is what 006's layout
   * grammar was for: a mission is layout x dressing x objective x doctrine x
   * seed, and eleven of them is a table. Ordered so no three consecutive
   * missions share an objective -- a run of three demolitions in a row is the
   * same mission three times however different the ground is.
   */
  {
    id: 'the-far-trees', doctrine: 'garrison', order: 19, seed: 640217, w: 100, h: 58,
    name: 'The Far Trees', theme: 'jungle', objective: 'rescue',
    mechanic: 'a shot that lands elsewhere',
    brief: 'Three of ours, ringed and out in the open. Put a round in the far trees and they go to the far trees.',
  },
  {
    id: 'salt-pan', layout: 'island', doctrine: 'ambush', order: 38, seed: 517742, w: 96, h: 72,
    name: 'Salt Pan', theme: 'desert', objective: 'collect',
    mechanic: 'flat, bright and overlooked',
    brief: 'Crates scattered across the pan, and nowhere at all to stand out of sight.',
  },
  {
    id: 'the-quarry', layout: 'canyon', doctrine: 'garrison', order: 39, seed: 863401, w: 112, h: 64,
    name: 'The Quarry', theme: 'desert', objective: 'demolish',
    mechanic: 'terraces and dead ground',
    brief: 'They work the pit from the rim. Level what they built and get out.',
  },
  {
    id: 'bone-road', layout: 'causeway', doctrine: 'patrol', order: 40, seed: 294118, w: 180, h: 48,
    name: 'Bone Road', theme: 'desert', objective: 'reach',
    mechanic: 'a road with no shoulder',
    brief: 'One road, water either side, and pickets all the way along it.',
  },
  {
    id: 'dust-devils', layout: 'ridgeline', doctrine: 'hunters', order: 41, seed: 706233, w: 104, h: 80,
    // The ridgeline's hubs left the bottom-left quarter bare (200-qa 022);
    // a pinned camp with a marched beat fills it without rerolling a map the
    // owner called nice.
    camps: [{ at: [0.16, 0.82], guards: 5, barrels: 2 }],
    name: 'Dust Devils', theme: 'desert', objective: 'eliminate',
    mechanic: 'high ground, both ways',
    brief: 'They own the ridge and they will not stay on it. Take it anyway.',
  },
  {
    id: 'the-cistern', layout: 'spiral', doctrine: 'garrison', order: 43, seed: 448970, w: 88, h: 88,
    name: 'The Cistern', theme: 'desert', objective: 'rescue',
    mechanic: 'a compound wound inward',
    brief: 'They are held at the middle of it, and every turn of the spiral is watched.',
  },
  {
    id: 'black-ice', layout: 'delta', doctrine: 'patrol', order: 42, seed: 655012, w: 108, h: 76,
    name: 'Black Ice', theme: 'arctic', objective: 'reach',
    mechanic: 'many crossings, none safe',
    brief: 'The river braids here and the ice is thin. Pick a crossing and commit.',
  },
  {
    id: 'the-hangar', layout: 'crossroads', doctrine: 'garrison', order: 44, seed: 138265, w: 96, h: 84,
    name: 'The Hangar', theme: 'arctic', objective: 'demolish',
    mechanic: 'a junction they built on',
    brief: 'Four roads meet at their sheds. Take the sheds down and the roads are yours.',
  },
  {
    id: 'snow-blind', layout: 'gauntlet', doctrine: 'ambush', order: 45, seed: 981744, w: 148, h: 52,
    name: 'Snow Blind', theme: 'arctic', objective: 'assassinate',
    mechanic: 'a corridor, and one man in it',
    brief: 'He is somewhere along the pass, and so is everybody guarding him.',
  },
  {
    id: 'frozen-lake', layout: 'island', doctrine: 'swarm', order: 46, seed: 322806, w: 84, h: 84,
    duration: 75, waves: '4@11',
    name: 'Frozen Lake', theme: 'arctic', objective: 'hold',
    mechanic: 'ground you cannot leave',
    brief: 'Take the bunker on the ice and stay on it. Four waves come across for it.',
  },
  {
    id: 'the-crevasse', layout: 'canyon', doctrine: 'hunters', order: 47, seed: 570439, w: 128, h: 60,
    name: 'The Crevasse', theme: 'arctic', objective: 'collect',
    mechanic: 'a split you cannot cross',
    brief: 'Supplies down both sides of a gap, and they will come round it faster than you.',
  },
  {
    id: 'north-station', layout: 'coast', doctrine: 'garrison', order: 48, seed: 811527, w: 116, h: 68,
    name: 'North Station', theme: 'arctic', objective: 'rescue',
    mechanic: 'a shore with one way up it',
    brief: 'They are held at the station above the beach. Walk them back down to the tent.',
  },
];

// ----------------------------------------------------------------- build

function generate(spec) {
  const g = new Grid(spec.w, spec.h, GRASS, spec.seed);
  const place = new Placer(g);
  // A mission is either hand-written or grown from a layout. The twelve
  // originals are the former and stay that way; everything after them is a row
  // in the table rather than a function.
  if (spec.layout) fromLayout(g, place, spec);
  else BUILDERS[spec.id](g, place);

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
    // `covert` already implies it, and Softly Softly's file should not change
    // shape just because the rule behind it grew a name.
    ...(spec.nokill && spec.objective !== 'covert' ? ['nokill: true'] : []),
    ...(spec.timelimit ? [`timelimit: ${spec.timelimit}`] : []),
    ...(spec.gated ? ['gated: true'] : []),
    // Only when the mission overrides the difficulty's number. `0` is a real
    // answer, so the test is against undefined rather than against falsiness.
    ...(spec.grenades !== undefined ? [`grenades: ${spec.grenades}`] : []),
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

  // `covert` is an alias for `reach` plus the no-kill rule, unfolded here the
  // same way the parser unfolds it, so the validator and the game agree on what
  // the file means. See `Modifiers` in map.ts.
  const objective = spec.objective === 'covert' ? 'reach' : spec.objective;
  const nokill = spec.objective === 'covert' || spec.nokill === true;

  const squad = find('P');
  const want = spec.squad ?? 6;
  if (squad.length !== want) problems.push(`expected ${want} player spawns, found ${squad.length}`);
  if (squad.length === 0) return problems;

  /*
   * Nobody opens the mission already in the fight: every enemy at least
   * twelve tiles from every squad spawn. Twelve is just past a veteran
   * rifleman's notice radius (132px x 1.25 over 16px tiles = 10.3) and the
   * figure the hand-built maps had already chosen for themselves. Close is
   * fine -- No Way Off opened a rifleman 3.6 tiles out, inside his own fire
   * range before the player touched the mouse, and that is what this forbids.
   * Mirrored in test/map.test.mjs, which also judges the hand-written maps
   * this generator never sees.
   */
  const START_CLEAR = 12;
  for (const e of [...find('E'), ...find('S'), ...find('B'), ...find(OFFICER)]) {
    const d = Math.min(...squad.map((p) => Math.hypot(e.x - p.x, e.y - p.y)));
    if (d < START_CLEAR) {
      problems.push(`enemy at ${e.x},${e.y} starts ${d.toFixed(1)} tiles from the squad (min ${START_CLEAR})`);
    }
  }

  // Judged by the fill the map declares: strict by default, and the one that
  // treats a hut as a door only for a mission built around levelling it.
  const reach = grid.reachable(squad[0].x, squad[0].y, null, spec.gated === true);
  const need = {
    eliminate: ['E', 'S', 'B'], demolish: [], rescue: ['H'],
    reach: ['X', TENT], survive: [],
    hold: ['X', TENT], collect: [SUPPLY], assassinate: [OFFICER],
  };

  for (const ch of need[objective] ?? []) {
    for (const p of find(ch)) {
      if (!reach.has(`${p.x},${p.y}`)) problems.push(`'${ch}' at ${p.x},${p.y} is unreachable`);
    }
  }

  const enemies = find('E').length + find('S').length + find('B').length;
  if (objective === 'eliminate' && enemies === 0) problems.push('eliminate map has no enemies');
  if (objective === 'rescue' && find('H').length === 0) problems.push('rescue map has no hostages');
  // A tent registers as an extraction point in the parser, so either will do.
  if (objective === 'reach' && find('X').length === 0 && find(TENT).length === 0) {
    problems.push('reach map has no extraction zone or tent');
  }
  if (objective === 'rescue' && find('X').length === 0 && find(TENT).length === 0) {
    problems.push('rescue map has nowhere to deliver hostages to');
  }
  if (objective === 'demolish') {
    const huts = find(HUT).length + find(FACTORY).length;
    if (huts === 0) problems.push('demolish map has no buildings');
  }
  if (objective === 'hold' && find('X').length === 0 && find(TENT).length === 0) {
    problems.push('hold map has no zone to hold');
  }
  if (objective === 'collect' && find(SUPPLY).length === 0) {
    problems.push('collect map has no supply boxes');
  }
  if (objective === 'assassinate') {
    // Exactly one. Two officers is not a harder mission, it is an ambiguous
    // one -- the sidebar would say "the officer" about whichever is left.
    const officers = find(OFFICER).length;
    if (officers !== 1) problems.push(`assassinate map has ${officers} officers, expected exactly 1`);
  }
  /*
   * A no-kill map has to be possible without killing.
   *
   * Anything else here proves the objective can be *got to*; this proves it can
   * be got to without a fight, which on a no-kill mission is the same question.
   * The fill is the ordinary walkable one with a second refusal bolted on -- no
   * tile within eight of a sentry -- and eight is a rifleman's aggro radius of
   * 132px over a 16px tile. Proved on the finished grid, so a seed that happens
   * to seal the lane fails the build rather than the player.
   *
   * It checks every objective entity, not only the extraction. A no-kill rescue
   * with a rifleman beside a hostage is unwinnable rather than hard: the
   * hostage dies in the firefight the mission never allowed you to have.
   */
  if (nokill) {
    const posts = [...find('E'), ...find('S'), ...find('B')];
    const exits = [...find('X'), ...find(TENT)];
    const AVOID = 8;
    if (posts.length === 0) problems.push('no-kill map has nobody to avoid');

    // What this mission has to reach quietly, by objective.
    const needed = [];
    if (objective === 'reach') {
      if (exits.length === 0) problems.push('no-kill map has no extraction zone');
      needed.push(...exits.map((p) => ['extraction', p]));
    }
    if (objective === 'rescue') {
      needed.push(...find('H').map((p) => ['hostage', p]));
      needed.push(...exits.map((p) => ['tent', p]));
    }
    if (objective === 'collect') needed.push(...find(SUPPLY).map((p) => ['supply box', p]));
    if (objective === 'hold') needed.push(...exits.map((p) => ['zone', p]));

    const clearOf = (x, y) => posts.every((p) => Math.hypot(p.x - x, p.y - y) >= AVOID);
    const unseen = grid.reachable(squad[0].x, squad[0].y, clearOf);
    for (const [what, p] of needed) {
      if (!clearOf(p.x, p.y)) {
        problems.push(`${what} at ${p.x},${p.y} is inside a garrison's aggro radius`);
      } else if (!unseen.has(`${p.x},${p.y}`)) {
        problems.push(`no route to the ${what} at ${p.x},${p.y} that stays ${AVOID} tiles clear of every garrison`);
      }
    }
    for (const p of squad) {
      if (!unseen.has(`${p.x},${p.y}`)) problems.push(`squad spawn at ${p.x},${p.y} starts inside a garrison`);
    }
  }

  // Every squad member has to start somewhere it can actually walk out of.
  for (const p of squad) {
    if (!reach.has(`${p.x},${p.y}`)) problems.push(`squad spawn at ${p.x},${p.y} is walled in`);
  }
  return problems;
}

/**
 * How many seeds a mission may burn before the build gives up on it.
 *
 * A hand-tuned mission never needs one: the author looks at the failure and
 * moves a hut. A generated one does -- a layout, an objective and a seed that
 * happen not to fit is an ordinary event, not a bug, and twenty of them written
 * from a table cannot each be nursed by hand.
 */
const MAX_REROLLS = 32;

/**
 * Generate a mission, rerolling the seed until it validates.
 *
 * The reroll is *deterministic*: seed n failing always lands on the same n+k,
 * so `npm run levels` stays reproducible, which is the property the whole
 * campaign table is built on. A random retry would make the same table produce
 * different maps on different days and quietly destroy that.
 *
 * The attempt count is reported rather than swallowed, because a mission that
 * took thirty seeds is telling you its layout and its objective do not fit each
 * other -- which is a design problem, and invisible if the build only says ok.
 */
function build(spec) {
  let last = [];
  for (let attempt = 0; attempt <= MAX_REROLLS; attempt++) {
    // An odd stride well clear of any structure in mulberry32's seeding, so
    // consecutive attempts are unrelated maps rather than near-misses.
    const seed = (spec.seed + attempt * 7919) >>> 0;
    const { text, grid } = generate({ ...spec, seed });
    const problems = validate(spec, grid);
    if (problems.length === 0) return { text, grid, seed, attempt, problems: [] };
    last = problems;
  }
  return { problems: last, attempt: MAX_REROLLS };
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
    const { text, grid, seed, attempt, problems } = build(spec);
    if (problems.length) {
      failed++;
      console.error(`  FAIL ${spec.id} -- no valid map in ${MAX_REROLLS + 1} seeds`);
      for (const p of problems) console.error(`       ${p}`);
      continue;
    }
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

    if (!check) await writeFile(join(DATA_DIR, `${spec.id}.map`), text, 'utf8');
    console.log(
      `  ok   ${spec.id.padEnd(15)} ${String(spec.w).padStart(3)}x${String(spec.h).padEnd(3)}` +
      ` ${spec.theme.padEnd(7)} ${spec.objective.padEnd(11)}` +
      ` ${counts.enemies} enemies${counts.hostages ? `, ${counts.hostages} hostages` : ''}` +
      `${counts.mines ? `, ${counts.mines} mines` : ''}` +
      // Demolition-gating is never allowed to be a silent property: a map whose
      // objective is only reachable once a building comes down is judged by a
      // weaker fill, and the build has to say which maps those are.
      `${spec.gated ? '  [demolition-gated]' : ''}` +
      `${spec.nokill || spec.objective === 'covert' ? '  [no-kill]' : ''}` +
      `${attempt ? `  [seed ${seed}, ${attempt} reroll${attempt === 1 ? '' : 's'}]` : ''}`,
    );
  }

  console.log(`\n  ${specs.length - failed}/${specs.length} missions ${check ? 'validated' : 'written'}\n`);
  if (failed) process.exit(1);
}

await main();
