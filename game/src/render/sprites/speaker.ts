/**
 * Portraits for whoever is on the comms panel.
 *
 * ## Where this art comes from, and why it is the exception
 *
 * Every other sprite in this game is plotted by hand, because an imported one
 * matches nothing around it (CLAUDE.md). Major Trumper was plotted by hand
 * first -- a 64x63 mask of cap, eyes, moustache and tunic, seven frames. The
 * owner looked at it beside `docs/original-images/elements/major-trumper.png`
 * and chose the reference. The mask was never committed, so it is gone: wanting
 * it back means drawing it again.
 *
 * That is a decision about **one character**, taken with the alternative on the
 * screen, and it is not a precedent: the plates, the bezel, the terrain, the
 * men and the chrome are all still drawn in code.
 *
 * ## What "using the reference" means here
 *
 * It does not mean shipping a PNG. `tools/cut-sheet.mjs` runs by hand and
 * writes `trumper-art.ts`: a palette and a run-length-encoded index per pixel,
 * which this file plots at boot through the same `rect()` calls as everything
 * else. No image file, no fetch, no decode -- and because the tool hard-
 * thresholds alpha after the resample and median-cuts the tones, no
 * anti-aliased edge and no gradient either. The renderer cannot tell.
 *
 * ## Why a stepped disc rather than a circle
 *
 * There is no `ctx.arc` in this game and no alpha: the extraction ring and the
 * mine's shock front were both caught being arcs and both became discrete
 * pixels, and a soft-edged round avatar would be the most out-of-period thing
 * on the screen, sitting in the exact spot the player is reading. So the disc
 * is solved a row at a time from the circle equation.
 *
 * The disc is a **clip**, not a frame. The brass ring the player sees is
 * `bakeBezel` in `plates.ts`, stacked as a second background layer on the same
 * element; a rim drawn in here as well would be two rings.
 *
 * ## Frames
 *
 * `trumper-art.ts` holds the art and its frame order. `loops` below holds the
 * choreography -- which frames play, in what order, held how long. Two tables,
 * because they answer different questions: adding a mouth shape is a re-cut,
 * deciding he talks too fast is one number here.
 *
 * Frames swapped on a timer, never a tween. There is no interpolation in sprite
 * work here and a fading eyelid is alpha by another name.
 *
 * Nothing in this file knows who the speaker is; `ART` is keyed by id and a
 * second portrait is another entry.
 */

import { CELL, FRAMES, PALETTE, RUNS } from './trumper-art.js';
import { addOutline, makeCanvas, rect } from './paint.js';
import type { Sprite } from './paint.js';

/** One loop within a portrait's frames: which, in what order, held how long. */
export interface FaceLoop {
  /** Frame indices, in play order. */
  frames: number[];
  /** Seconds each is held. */
  hold: number;
}

/** Everything the comms panel needs to drive a face without knowing whose. */
export interface FaceSet {
  /** How many frames the strip carries. */
  count: number;
  /** Source pixels per frame, square. */
  cell: number;
  idle: FaceLoop;
  talk: FaceLoop;
}

interface FaceArt {
  cell: number;
  frames: number;
  palette: string[];
  runs: number[];
  loops: Omit<FaceSet, 'count' | 'cell'>;
}

const ART: Record<string, FaceArt> = {
  trumper: {
    cell: CELL,
    frames: FRAMES,
    palette: PALETTE,
    runs: RUNS,
    loops: {
      idle: { frames: [0], hold: 1 },
      /*
       * Frames 1 to 5 in strip order, held 0.12s each -- about eight a second.
       * Lips together, "oo", open, wide, closing: a cycle that opens and shuts
       * once rather than flapping between two extremes.
       *
       * Note frame 0 is **not** in the loop. It is the idle face, from the
       * sheet's other row, and dropping into it mid-sentence is the thing that
       * made an earlier cut read as a lurch rather than as speech.
       *
       * Deliberately **not** synchronised to the letters. Typing runs at 0.035s
       * a character, which is thirty a second, and a mouth driven off that
       * would be a buzz -- the same reason the voice blip only fires on every
       * second character. A mouth moving at a speaking rate over text arriving
       * at a typing rate is what reads as speech.
       *
       * Both numbers were set on the bench with the loop playing at ship size.
       */
      talk: { frames: [1, 2, 3, 4, 5], hold: 0.12 },
    },
  },
};

/** Every portrait id there is. `src/dev/specimens.ts` enumerates from this. */
export const SPEAKER_IDS = Object.keys(ART);

/**
 * How a portrait moves. Metadata only -- this never bakes, so `ui/` can ask
 * what the frames do without pulling a canvas into the DOM layer.
 *
 * Unknown ids fall back to the first portrait rather than throwing, for the
 * same reason `bakeSpeaker` does.
 */
export function speakerFace(id: string): FaceSet {
  const art = ART[id] ?? ART[SPEAKER_IDS[0]];
  return { count: art.frames, cell: art.cell, ...art.loops };
}

/** Every frame side by side, as the runs encode it, before the disc. */
function paintStrip(art: FaceArt): Sprite {
  const w = art.cell * art.frames;
  const { c, g } = makeCanvas(w, art.cell);
  let at = 0;
  for (let i = 0; i < art.runs.length; i += 2) {
    const v = art.runs[i];
    const len = art.runs[i + 1];
    if (v) {
      const ink = art.palette[v - 1];
      /*
       * A run is drawn as one `fillRect` per row it touches rather than as
       * `len` single pixels. Most of him is flat tunic and flat cap, which is
       * why the encoding is worth having at all, and undoing that here by
       * plotting a pixel at a time would keep the file size and throw away the
       * only thing it bought.
       */
      let k = 0;
      while (k < len) {
        const q = at + k;
        const x = q % w;
        const run = Math.min(len - k, w - x);
        rect(g, x, (q / w) | 0, run, 1, ink);
        k += run;
      }
    }
    at += len;
  }
  return c;
}

/** The strip, painted once and sliced by every call after the first. */
const stripCache = new Map<string, Sprite>();
const stripFor = (id: string, art: FaceArt): Sprite => {
  const hit = stripCache.get(id);
  if (hit) return hit;
  const s = paintStrip(art);
  stripCache.set(id, s);
  return s;
};

/**
 * One portrait, one frame, clipped to the disc.
 *
 * Unknown ids fall back to the first portrait rather than throwing: a missing
 * face should be somebody else's face, not a blank panel in front of a player.
 */
export function bakeSpeaker(id: string, frame = 0): Sprite {
  const key = ART[id] ? id : SPEAKER_IDS[0];
  const art = ART[key];
  const f = Math.max(0, Math.min(art.frames - 1, frame));
  const size = art.cell;
  const src = stripFor(key, art);
  const { c, g } = makeCanvas(size, size);

  /*
   * The disc, solved per row.
   *
   * An earlier version also drew a brass rim in here by testing "inside with a
   * neighbour outside", which was correct and is now `bakeBezel`'s job. Worth
   * the sentence, because the version before *that* filled any row wider than
   * the one above it, and turned the whole top half of the circle into a solid
   * dome with the face crushed into a dark band across the middle. The picture
   * was the only thing that showed it.
   */
  const r = size / 2 - 0.5;
  const mid = size / 2 - 0.5;
  for (let y = 0; y < size; y++) {
    const dy = y - mid;
    const half = r * r - dy * dy;
    if (half < 0) continue;
    const wide = Math.floor(Math.sqrt(half));
    const x = Math.ceil(mid - wide);
    const w = Math.floor(mid + wide) - x + 1;
    // The ground first, so where he does not cover the disc it reads as the
    // inside of a housing rather than as a hole in the panel.
    rect(g, x, y, w, 1, '#1a2010');
    g.drawImage(src, f * size + x, y, w, 1, x, y, w, 1);
  }

  addOutline(c, '#0a0d05');
  return c;
}

/**
 * Every frame of one portrait, left to right, each in its own disc.
 *
 * This is what the panel wears. Separate data URLs meant the first play of each
 * frame was a fresh decode, and a talk loop reaches every frame inside the
 * first second of a line -- so the first cycle flashed. One image, already
 * decoded, moved with `background-position`, cannot.
 */
export function bakeSpeakerStrip(id: string): Sprite {
  const { count, cell } = speakerFace(id);
  const { c, g } = makeCanvas(cell * count, cell);
  for (let f = 0; f < count; f++) g.drawImage(bakeSpeaker(id, f), cell * f, 0);
  return c;
}
