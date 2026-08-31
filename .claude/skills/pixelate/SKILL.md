---
name: pixelate
description: Turn a reference image into pixels you can plot, and fine-tune a sprite against the thing it is copying. Measures the real size, reads the shape off as a mask, samples the palette, and puts our sprite beside the reference at the same scale.
argument-hint: [what to pixelate, e.g. "the logo ampersand" or "the level-select padlock"]
allowed-tools: Bash(npm run *) Bash(node *) Bash(netstat *) Read Write Edit Glob Grep
---

Every sprite here is plotted in code. The references in `docs/original-images/`
are the opposite: 2000-pixel renders with soft bevels, photographic grime and
anti-aliased edges. None of it can be used directly — tracing is out
([CLAUDE.md](../../../CLAUDE.md)), and a downsample is alpha fringe, which the
renderer forbids absolutely.

So a reference is not a thing to convert. It is a thing to **measure**, and this
is the tool that measures it.

```bash
cd game
node tools/pixelate.mjs read <image> [--rect x,y,w,h] [--width N] [--grid WxH] [--lum N] [--colors N] [--out FILE]
node tools/pixelate.mjs beside <image> --rect ... --sprite <atlas id> --port 5210
```

`read` needs nothing running. `beside` needs a server with the gallery on it —
and **never 5199**, which is the user's.

## The rule that matters more than the tool

**Measure the size before you draw a single pixel.**

This is not advice, it is the record of what went wrong. The `&` in the logo was
drawn freehand twice and rejected twice, and both attempts failed the same way:
they were 27×36. The reference ampersand measures 117×118 source pixels, which
at the game's 300-wide crest is **20×20 — square**. No amount of moving strokes
around fixes a glyph whose proportions are wrong, and two rounds went into
trying. One `--rect` would have caught it in ten seconds.

The same tool then settled a second argument the same way. The logo's B "looked
like an 8" through three attempts at thickening walls. Reading the reference B
off as a mask showed the actual proportions — a 12-wide stem, an **8-wide**
counter, a 12-wide wall — where the version on screen had counters nearly twice
that. The counters were too big, not the walls too thin.

Both of those were arguments about taste that turned out to be facts.

## Using it

### 1. Find the region

`--rect auto` (the default) trims chroma green and transparency, which gives you
the whole artwork. That is the number for "how big is this thing overall".

For one piece of it, pass `--rect x,y,w,h` and iterate with `--out` until the
PNG shows what you meant. **Look at that PNG every time** — a rect that framed
the wrong thing produces a confident, detailed, wrong answer, which is the
failure [docs/loop.md](../../../docs/loop.md) exists to warn about.

### 2. Pick the target width

`--width` is the size the game actually draws at, and it decides everything
else. The world runs at zoom 3–5 over roughly 430×270 to 577×360 world pixels,
so:

| | |
|---|---|
| a crest across the intro screen | ~300 |
| a UI plate | 100–250 wide, 20–30 tall |
| a building | 30–40 |
| a man | 13 |
| a HUD badge | 8–12 |

Render the reference at your candidate width **and one smaller**, and look at
both. Half the detail in a reference cannot exist at 1x, and drawing it anyway
produces noise rather than fidelity.

### 3. Read the shape

`--grid WxH` prints a `#`/`.` mask, already quoted, ready to paste into a sprite
module:

```
  '..######....######.',
  '..################.',
```

`--ink` moves the coverage threshold — raise it to thin a shape, lower it to
fatten one. `--lum N` additionally requires brightness, which is the difference
between reading a glyph and reading the whole picture when the art sits on dark
ground rather than on chroma.

**The output is a starting point, never a finished glyph.** A threshold cannot
tell a stem from a JPEG artefact, and it will happily include the neighbouring
letter. Hand-clean every row. If you paste it unedited you have traced, which is
both against the rules here and worse-looking than drawing it.

### 4. Take the palette

`--colors N` gives the most common colours with counts. Use them as the centre
of a ramp rather than as the ramp: the reference's own tones are a
JPEG-flattened average, and the bevel wants a light and a dark either side of
them, plus a rim brighter than anything sampled — at 1x a one-pixel highlight
carries the whole read of a raised edge.

## Fine-tuning something that already exists

`beside` puts the reference and one of our sprites on one strip at the same
scale, with the atlas id the sprite gallery uses:

```bash
node tools/pixelate.mjs beside ../docs/original-images/intro/logo.png \
  --rect 520,150,235,285 --sprite logoParts.glyphB --width 19 --zoom 8 \
  --out shots/b.png --port 5210
```

Same scale is the point. Two pictures at different sizes cannot be compared and
you will believe whatever you already thought.

Then look at it in the gallery — `/sprites`, `#logoParts.glyphB` — which gives
you every ground at once and the semi-transparent count.

## What this does not do

**It does not judge.** It shows you pixels and hands you numbers. Whether the
result is any good is not a question you can answer in the session that drew it,
which is what `/grill` and `/gauntlet` are for.

**It does not trace.** If you find yourself pasting a 40-row mask in unedited,
stop — the reason nothing here is traced is not a rule about the pictures, it is
that every sprite around it is plotted, and an imported one matches nothing.

**It cannot see the laws.** No alpha, no anti-aliasing, no gradients, no
fractional coordinates. The tool resamples with smoothing on, because that is a
*measurement*; everything downstream of it is hard pixels. Run `/pixel-check`
over what you write.

## Where the pieces are

| | |
|---|---|
| [tools/pixelate.mjs](../../../game/tools/pixelate.mjs) | the tool |
| [render/sprites/bevel.ts](../../../game/src/render/sprites/bevel.ts) | mask ops — rect, taper, chamfer, holes — and the slab bevel every plate and letter is painted with |
| [render/sprites/logo.ts](../../../game/src/render/sprites/logo.ts) | the worked example: measured, plotted, and the failures written down |
| `/sprites` | look at the result, and hand over its link |
