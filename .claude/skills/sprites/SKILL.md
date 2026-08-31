---
name: sprites
description: Open the live sprite gallery at /sprites.html — every baked sprite in the game, on one page, deep-linkable one at a time. For looking at what already exists before drawing, and for handing over a link to what you just drew.
argument-hint: [what to look at, e.g. "the hut damage stages" or "everything I just added"]
allowed-tools: Bash(npm run *) Bash(node *) Bash(netstat *) Read Write Edit Glob Grep
---

Every sprite in this game is plotted in code at boot. There are no image files,
so there is no folder to open, and until this page existed the only way to look
at a sprite was to make the game show it to you — level a hut to see a wrecked
one, walk a bazookateer in a circle to see eight facings.

`/sprites.html` is the answer to that. It builds the same atlas the game builds
and lays all of it out, live.

## Two things to do with it

**Before you draw**, look at what is already there. This codebase has 270-odd
sprite entries and a strong house style — a helmet is a bright crown over a
near-black body, a rock is angular, shading is dithered coverage. Something
drawn without looking at its neighbours reads as pasted in, and that is the one
failure mode a screenshot of the whole game hides.

**After you draw**, hand over the link. Not "run the sheet tool", not "it's in
the atlas" — the URL of the thing itself:

```
http://localhost:5199/sprites.html#hut.2
```

That is the whole point of the page. Say what changed and give the link to it.

## Running it

The page is emitted into `public/` **only by `npm run dev`**, and `npm run
build` deletes it. Dev-only means absent: a production build has no gallery
rather than a hidden one, and the two emitted files are gitignored.

**Port 5199 belongs to the user.** He keeps `npm run dev` running there and
plays while you work. Never kill what is listening on it — a force-kill is
indistinguishable from a crash and nothing brings it back.

So: if his dev server is up, `http://localhost:5199/sprites.html` is already
live and already rebuilding on save, and there is nothing for you to start.
Give him that URL. If you need your own to drive in Playwright:

```bash
cd game
node -e "import('esbuild').then(e=>e.build({entryPoints:['src/dev/gallery.ts'],\
outfile:'public/sprites.js',bundle:true,format:'esm',target:'es2022',logLevel:'error'}))"
cp src/dev/sprites.html public/sprites.html
PORT=5217 node server.js          # your own port, and kill only what you started
```

## The tabs

Across the top: **all · units · terrain · buildings · objects · ui · branding**,
each with its count. The tab is in the query string, so it is linkable and it
survives a reload:

```
http://localhost:5199/sprites.html?g=buildings
http://localhost:5199/sprites.html?g=terrain#hut.2     tab and sprite together
```

**`ui` and `branding` read zero, and that is deliberate.** They are where the
level select's plates and frames and the logo go, and an empty tab saying so is
worth more than a heading that quietly appears later. Click one and it tells you
where to put the thing you are about to draw.

The filter box narrows within the current tab. `other` only appears if something
is filed under a name nobody declared.

## The link scheme

Ids are the atlas's own shape as a dotted path, and the fragment is the id.

| | |
|---|---|
| `#bunker` | a lone sprite |
| `#hut` | the row — four stages of damage side by side, which is the only way damage means anything |
| `#hut.2` | one stage out of that row |
| `#player.0.3` | variant 0, facing 3 — the four walk frames in a row |
| `#trees.palm.1.canopy` | a tree is stored as canopy and trunk, and shows as two |
| `#icons.grenade` | a named leaf |

Dots rather than brackets because these go in a URL. An id that matches nothing
is retried as parent-plus-index before the page gives up, which is why `hut.2`
resolves even though `hut` is one entry holding four canvases.

## Making something appear on it

**A fixed sprite: put it in the atlas and it appears.** `buildAtlas()` in
[render/sprites/index.ts](../../../game/src/render/sprites/index.ts) is walked
recursively, so a new key — a canvas, an array of them, an object of them,
nested however deep — is on the page with no gallery change at all. This is the
normal case and it needs nothing from you.

The one optional tidy-up: add the top-level key to `SECTIONS` in
[dev/gallery.ts](../../../game/src/dev/gallery.ts) to file it under a tab.
Anything missing lands in **other** rather than vanishing, so forgetting costs
you a tab, not a sprite.

**A parametric drawing: register a specimen.** A UI plate is not a sprite; it is
`drawPlate(w, h, tone)`, with no natural size. Do not invent an atlas entry at
some arbitrary width purely so the gallery can see it — add it to `SPECIMENS` in
[dev/specimens.ts](../../../game/src/dev/specimens.ts) with the sample sizes
worth looking at. The page shows specimens and atlas entries side by side and
does not distinguish between them.

```ts
{
  id: 'ui.plate.brass',
  group: 'ui',                    // this is the tab it lands on
  note: '160x28, 240x28, 420x28',
  draw: () => [160, 240, 420].map((w) => drawPlate(w, 28, TONES.brass)),
}
```

`draw()` is called lazily and only when the specimen scrolls into view, so an
expensive bake costs nothing until someone looks at it.

## What the single-sprite view tells you

Beyond making it big: **every ground at once**, and a pixel audit.

The three theme beds are the real ramps out of `render/palette.ts`, interleaved
1:1 the way the terrain baker interleaves them — a sprite's outline reads
completely differently against a flat fill than against a dithered field, and
the dithered field is the one it will sit on. `grey` is the same grey
`tools/sheet.mjs` uses, so the page and the PNG dump cannot disagree.

The `alpha` bed is a magenta checker, and the line above it counts
semi-transparent pixels. **This game has no alpha.** Every sprite is plotted
with hard `fillRect`s and should be fully opaque or fully absent; a pixel
between the two is an anti-aliased edge, which is the visual law broken most
easily and the hardest to catch by eye at 1x. If that line comes back red, the
sprite is wrong however good it looks — go and read `/pixel-check`.

## What it is not

It is not a judge. It shows you pixels; it has no opinion, and neither do you
about your own work in the session that drew it — that is what `/grill` and
`/gauntlet` are for, and they exist because you will see what you intended
whether or not it reached the screen.

It is not the whole picture either. A tree's canopy and trunk are separate
entries and the gallery does not composite them, so a tree looks like two
things here and one thing in the game. Sprites that only mean something
together still need a real capture — `tools/moment.mjs`.

`tools/sheet.mjs` still exists and still has a job: a headless PNG of the whole
atlas, which can go in a commit or a message. Use it for a record. Use this for
looking.
