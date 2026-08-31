/**
 * The chrome's typeface, built as a real font at boot and installed as a
 * data-URI `@font-face`.
 *
 * ## Why this exists
 *
 * The canvas has had its own baked pixel font since the beginning. The DOM had
 * `ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace` -- which is to
 * say, whatever the player's operating system happens to supply. Two critics
 * shown a frame of the game and asked what could not have come from a 1993
 * machine both landed on it, the second in detail:
 *
 *   "The sub-pixel anti-aliased UI text in the left panel ... browser-rendered
 *   at native resolution with LCD sub-pixel fringing -- orange on one side of a
 *   stroke, cyan on the other. Colour fringes on glyph edges are a 2000s-LCD
 *   artefact; they cannot exist in a 1993 frame. It is made worse by the scale
 *   clash: the map is chunky 4x-ish pixels, the text is crisp 1:1, so the two
 *   halves of the screen read as different machines."
 *
 * Both halves of that are fixed by the same thing: a font whose glyphs *are*
 * pixels. There are no curves for an anti-aliaser to soften, and at a font size
 * that is a whole multiple of the design size every glyph pixel lands on a whole
 * device pixel, so the chrome is drawn at the same grid as the battlefield.
 *
 * ## Why it is generated rather than shipped
 *
 * A `.woff2` would be the first asset file in a project whose whole premise is
 * that there are none -- every sprite plotted, every inch of terrain derived,
 * the music synthesised. So the glyphs are a bitmap table below and this module
 * emits a TrueType file from them at runtime: each row of ink becomes a
 * rectangular contour, four points, no curves anywhere. It is about two hundred
 * lines to avoid one download, and it keeps the claim true.
 *
 * ## Built, verified, and not wired in
 *
 * **Nothing uses this yet.** The font builds, the browser accepts it, and it
 * measures exactly: ten characters at `font-size: 10px` come to 60.0px and at
 * 20px to 120.0px, against 54.98px for the fallback monospace -- so the glyph
 * grid is whole pixels, which was the entire point. Switching `style.css` onto
 * the family is one line.
 *
 * That line was tried and reverted. With the family on, capture after capture
 * showed a broken sidebar -- soldier names unpainted, panel content displaced --
 * while a DOM probe taken at the same moment reported the panel *correct*: every
 * name present, positioned, sized and coloured, at the right coordinates. The
 * picture and the DOM disagreed, which means the fault was never isolated and
 * may not even have been this file: another session was rewriting `ui/hud.ts`
 * and the mission table through the same hour, and one capture came back
 * showing a different mission from the one it had been told to load.
 *
 * So this is finished work waiting on a quiet tree, not a dead end. Wire it up,
 * capture, and if the sidebar paints, set the sizes in `style.css` to multiples
 * of ten and it is done.
 *
 * ## The one thing to know when editing
 *
 * `PIXEL` is 100 units against an em of 1000, so **one glyph pixel is one CSS
 * pixel at `font-size: 10px`**, two at 20px, three at 30px. Any other size is
 * fractional and the letters go soft -- which is the exact fault this file
 * exists to remove. Font sizes in style.css are multiples of ten for that
 * reason and not by taste.
 */

import { GLYPH_ADVANCE as ADVANCE, GLYPH_H, GLYPH_W, rowsFor as glyphRows } from '../glyphs.js';

/**
 * The design grid and the glyph table both come from `src/glyphs.ts`, which
 * `render/chromefont.ts` also reads. There is one table; this file turns it
 * into a font file and that one plots it onto a canvas.
 */

/** Font units per glyph pixel, against `UNITS_PER_EM`. */
const PIXEL = 100;
const UNITS_PER_EM = 1000;
const ASCENDER = 800;
const DESCENDER = -200;

/** Codepoints covered: printable ASCII, contiguous, so `cmap` is one segment. */
const FIRST = 0x20;
const LAST = 0x7e;

/** Rows of ink for a codepoint. */
const rowsFor = (code: number): string[] => glyphRows(String.fromCharCode(code));
/* ------------------------------------------------------------- binary output
 *
 * A TrueType file is a directory of tables, each padded to four bytes. Nothing
 * here is general: it emits exactly the tables a browser insists on, for a font
 * whose every contour is a rectangle.
 */

class Writer {
  private bytes: number[] = [];
  get length(): number { return this.bytes.length; }
  u8(v: number): void { this.bytes.push(v & 0xff); }
  u16(v: number): void { this.u8(v >> 8); this.u8(v); }
  i16(v: number): void { this.u16(v < 0 ? v + 0x10000 : v); }
  u32(v: number): void { this.u16((v >>> 16) & 0xffff); this.u16(v & 0xffff); }
  tag(s: string): void { for (const c of s) this.u8(c.charCodeAt(0)); }
  pad4(): void { while (this.bytes.length % 4 !== 0) this.u8(0); }
  bytesOut(): number[] { return this.bytes; }
}

/** Horizontal runs of ink, one rectangle each. */
function contours(rows: string[]): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (let r = 0; r < GLYPH_H; r++) {
    const row = rows[r] ?? '';
    let c = 0;
    while (c < GLYPH_W) {
      if (row[c] !== '#') { c++; continue; }
      let end = c;
      while (end + 1 < GLYPH_W && row[end + 1] === '#') end++;
      // TrueType's y runs up from the baseline, the bitmap's runs down.
      out.push([c * PIXEL, (GLYPH_H - 1 - r) * PIXEL, (end + 1) * PIXEL, (GLYPH_H - r) * PIXEL]);
      c = end + 1;
    }
  }
  return out;
}

/** One glyph's `glyf` entry. Empty glyphs contribute no bytes at all. */
function glyphData(rows: string[]): number[] {
  const rects = contours(rows);
  if (rects.length === 0) return [];

  const w = new Writer();
  w.i16(rects.length);
  w.i16(Math.min(...rects.map((r) => r[0])));
  w.i16(Math.min(...rects.map((r) => r[1])));
  w.i16(Math.max(...rects.map((r) => r[2])));
  w.i16(Math.max(...rects.map((r) => r[3])));
  for (let i = 0; i < rects.length; i++) w.u16((i + 1) * 4 - 1);
  w.u16(0);                                  // no instructions

  const pts: Array<[number, number]> = [];
  for (const [x0, y0, x1, y1] of rects) {
    pts.push([x0, y0], [x0, y1], [x1, y1], [x1, y0]);
  }
  // Every point on-curve, and both deltas written long: flag bit 0 is
  // on-curve, and leaving bits 1 and 4 clear is what makes x a 2-byte signed
  // delta rather than a byte or a repeat of the last one.
  for (let i = 0; i < pts.length; i++) w.u8(0x01);
  let prev = 0;
  for (const [x] of pts) { w.i16(x - prev); prev = x; }
  prev = 0;
  for (const [, y] of pts) { w.i16(y - prev); prev = y; }
  w.pad4();
  return w.bytesOut();
}

function buildFont(): Uint8Array {
  const count = LAST - FIRST + 1;
  const numGlyphs = count + 1;                // glyph 0 is .notdef, and empty

  const glyphs: number[][] = [[]];
  for (let code = FIRST; code <= LAST; code++) glyphs.push(glyphData(rowsFor(code)));

  const glyf = new Writer();
  const loca = new Writer();
  let offset = 0;
  for (const g of glyphs) {
    loca.u32(offset);
    for (const b of g) glyf.u8(b);
    offset += g.length;
  }
  loca.u32(offset);

  const head = new Writer();
  head.u32(0x00010000);
  head.u32(0x00010000);
  head.u32(0);                                // checkSumAdjustment, patched below
  head.u32(0x5f0f3cf5);
  head.u16(0x000b);                           // baseline at y=0, lsb at x=0
  head.u16(UNITS_PER_EM);
  for (let i = 0; i < 4; i++) head.u32(0);    // created, modified
  head.i16(0);
  head.i16(DESCENDER);
  head.i16(GLYPH_W * PIXEL);
  head.i16(GLYPH_H * PIXEL);
  head.u16(0);                                // macStyle
  head.u16(7);                                // lowestRecPPEM
  head.i16(2);                                // fontDirectionHint
  head.i16(1);                                // long loca
  head.i16(0);

  const hhea = new Writer();
  hhea.u32(0x00010000);
  hhea.i16(ASCENDER);
  hhea.i16(DESCENDER);
  hhea.i16(0);
  hhea.u16(ADVANCE * PIXEL);
  hhea.i16(0);
  hhea.i16(0);
  hhea.i16(GLYPH_W * PIXEL);
  hhea.i16(1); hhea.i16(0); hhea.i16(0);
  for (let i = 0; i < 4; i++) hhea.i16(0);
  hhea.i16(0);
  hhea.u16(numGlyphs);

  const hmtx = new Writer();
  for (let i = 0; i < numGlyphs; i++) { hmtx.u16(ADVANCE * PIXEL); hmtx.i16(0); }

  const maxp = new Writer();
  maxp.u32(0x00010000);
  maxp.u16(numGlyphs);
  maxp.u16(GLYPH_W * GLYPH_H * 4);            // maxPoints, generous
  maxp.u16(GLYPH_W * GLYPH_H);                // maxContours
  for (let i = 0; i < 11; i++) maxp.u16(0);
  maxp.u16(0); maxp.u16(0);

  // cmap: one format 4 subtable, one contiguous segment plus the terminator.
  const cmap = new Writer();
  cmap.u16(0); cmap.u16(1);
  cmap.u16(3); cmap.u16(1); cmap.u32(12);
  cmap.u16(4);
  cmap.u16(32);                               // length of this subtable
  cmap.u16(0);
  cmap.u16(4);                                // segCountX2
  cmap.u16(4); cmap.u16(1); cmap.u16(0);      // searchRange, entrySelector, rangeShift
  cmap.u16(LAST); cmap.u16(0xffff);           // endCode[]
  cmap.u16(0);                                // reservedPad
  cmap.u16(FIRST); cmap.u16(0xffff);          // startCode[]
  cmap.u16((1 - FIRST) & 0xffff); cmap.u16(1);
  cmap.u16(0); cmap.u16(0);                   // idRangeOffset[]

  const os2 = new Writer();
  os2.u16(4);
  os2.i16(ADVANCE * PIXEL);                   // xAvgCharWidth
  os2.u16(400); os2.u16(5);
  os2.i16(0);
  /*
   * Four each, not five.
   *
   * ySubscript and ySuperscript are XSize, YSize, XOffset, YOffset -- four
   * fields apiece. Writing five of each put two extra int16s into the table and
   * shifted everything after them four bytes late, including usWinAscent and
   * usWinDescent, which is what a browser sizes a line box from. The visible
   * result was a chrome where every string vanished: the metrics said the
   * baseline sat far below the box, so at a fixed line-height the glyphs were
   * drawn outside it and clipped, and at line-height:normal a ten-pixel plate
   * came out six hundred pixels tall with the text at the bottom.
   *
   * That is the fault that got this file written, verified, and then reverted
   * unwired -- and it was blamed on a noisy tree at the time. It was four bytes.
   */
  for (let i = 0; i < 4; i++) os2.i16(0);     // subscript: X/Y size, X/Y offset
  for (let i = 0; i < 4; i++) os2.i16(0);     // superscript: the same four
  os2.i16(PIXEL); os2.i16(4 * PIXEL);         // strikeout size and position
  os2.i16(0);
  for (let i = 0; i < 10; i++) os2.u8(0);     // panose
  os2.u32(0x00000003); os2.u32(0); os2.u32(0); os2.u32(0);
  os2.tag('CFDR');
  os2.u16(0x0040);                            // regular
  os2.u16(FIRST); os2.u16(LAST);
  os2.i16(ASCENDER); os2.i16(DESCENDER); os2.i16(0);
  os2.u16(ASCENDER); os2.u16(-DESCENDER);
  os2.u32(0); os2.u32(0);
  os2.i16(GLYPH_H * PIXEL);                   // sxHeight
  os2.i16(GLYPH_H * PIXEL);                   // sCapHeight
  os2.u16(0); os2.u16(FIRST); os2.u16(2);

  const NAMES = ['Boots & Bullets Pixel', 'Regular', 'BootsAndBulletsPixel-Regular',
    'Boots & Bullets Pixel', '1.0', 'BootsAndBulletsPixel-Regular'];
  const name = new Writer();
  name.u16(0); name.u16(NAMES.length); name.u16(6 + NAMES.length * 12);
  let strOffset = 0;
  const strings: number[] = [];
  NAMES.forEach((text, i) => {
    const utf16: number[] = [];
    for (const ch of text) { utf16.push(0, ch.charCodeAt(0)); }
    name.u16(3); name.u16(1); name.u16(0x0409); name.u16(i + 1);
    name.u16(utf16.length); name.u16(strOffset);
    strings.push(...utf16);
    strOffset += utf16.length;
  });
  for (const b of strings) name.u8(b);
  name.pad4();

  const post = new Writer();
  post.u32(0x00030000);
  post.u32(0); post.i16(0); post.i16(0);
  post.u32(1);                                // isFixedPitch
  for (let i = 0; i < 4; i++) post.u32(0);

  const tables: Array<[string, number[]]> = [
    ['OS/2', os2.bytesOut()], ['cmap', cmap.bytesOut()], ['glyf', glyf.bytesOut()],
    ['head', head.bytesOut()], ['hhea', hhea.bytesOut()], ['hmtx', hmtx.bytesOut()],
    ['loca', loca.bytesOut()], ['maxp', maxp.bytesOut()], ['name', name.bytesOut()],
    ['post', post.bytesOut()],
  ];
  // The directory must be in tag order, which is what a reader binary-searches.
  tables.sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const n = tables.length;
  const pow = 2 ** Math.floor(Math.log2(n));
  const out = new Writer();
  out.u32(0x00010000);
  out.u16(n);
  out.u16(pow * 16);
  out.u16(Math.log2(pow));
  out.u16(n * 16 - pow * 16);

  let pos = 12 + n * 16;
  const offsets: number[] = [];
  for (const [tag, data] of tables) {
    out.tag(tag);
    out.u32(0);                               // checksum; readers tolerate zero
    out.u32(pos);
    out.u32(data.length);
    offsets.push(pos);
    pos += data.length + ((4 - (data.length % 4)) % 4);
  }
  for (const [, data] of tables) {
    for (const b of data) out.u8(b);
    out.pad4();
  }
  return Uint8Array.from(out.bytesOut());
}

/** The family name to ask for in CSS. */
export const PIXEL_FACE = 'Boots & Bullets Pixel';

let installed = false;

/**
 * Builds the font and installs it. Safe to call twice; does nothing the second
 * time, and does nothing at all outside a browser.
 *
 * Returns whether it went in, so the caller can say so rather than guess -- a
 * font that silently failed to load looks exactly like one that was never asked
 * for, and the fallback stack would quietly restore the very fault this fixes.
 */
export function installPixelFace(): boolean {
  if (installed) return true;
  if (typeof document === 'undefined') return false;

  let base64: string;
  try {
    const bytes = buildFont();
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    base64 = btoa(binary);
  } catch {
    return false;
  }

  /*
   * Declared for every weight, not just 400.
   *
   * The chrome sets `font-weight: 700` on plate labels and button captions. With
   * a single Regular face declared, the browser synthesises bold by smearing the
   * glyphs -- and on a face whose glyphs are unhinted rectangles that came out as
   * *nothing at all*: every bold string in the sidebar rendered blank while the
   * regular ones beside it were fine. Mapping 100-900 onto the one face means
   * there is nothing to synthesise. A bitmap font has one weight; saying so is
   * the fix.
   */
  const style = document.createElement('style');
  style.textContent = `@font-face{font-family:'${PIXEL_FACE}';`
    + `src:url(data:font/ttf;base64,${base64}) format('truetype');`
    + 'font-weight:100 900;font-style:normal;font-display:swap}';
  document.head.appendChild(style);
  installed = true;
  return true;
}
