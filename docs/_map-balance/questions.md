# Questions

Decisions that change what gets built. Answer inline under each; anything left
blank is built the way the recommendation says.

---

## 1. The numbers: tier multipliers and tier bands

Two sets of constants live in `balance.mjs` and `baseline.json`.

**Declared tiers** -- how much harder than its family median a map is allowed
to be *on purpose*:

- `standard` 1.0x (default)
- `hard` 1.6x
- `brutal` 2.5x

**Difficulty bands** -- what veteran and elite should be, relative to rookie,
on expected time to clear:

- veteran / rookie: **1.3 - 1.8x** (you said 1.5x)
- elite / rookie: **2.5 - 4.5x** (you said 3-4x)
- `maxOutside`: up to **6** maps may sit outside a band before the tier fails

**Recommended:** start with these, run the first sweep, and read the
campaign-wide report before touching them. The unit is expected time to clear
([05](05-statistics.md#the-metric)); casualties per win is reported beside it.

**Answer:**

---

## 2. Should the player see the mission seed?

Step 0 gives every mission a seed. It is logged in a dev build. The
end-of-mission panel *could* show it -- "seed 4471" under the stats -- which
would let a player report an exact run.

- (a) Dev-only. Nothing in the player's chrome changes.
- (b) On the end-of-mission panel, small, beside the mission time.

**Recommended:** (a) for now; (b) is one line later.

**Answer:**

---

## 3. Should the attract backdrop pin a seed?

The arena behind the front screen is random today. With step 0 it could run a
seed somebody chose -- the same opening battle every visit.

- (a) Random, as now.
- (b) Pinned to a known-good seed, chosen by watching a few.
- (c) Random, but drawn from a short list of good ones.

**Recommended:** (a) until somebody has watched enough of them to have a
favourite.

**Answer:**

---

## 4. The replay route: dev-only, or shipped unadvertised like `#arena`?

`#simulate/<map>/<difficulty>/<seed>` needs the autopilot in the bundle.

- (a) `__DEV__` only. The module is dead code in production and esbuild drops
  it. Replays need `npm run dev`.
- (b) Ships, unadvertised, as `#arena` does -- the arena's own argument was
  that gating a fragment hides something already in the bundle. Here the
  module is *not* otherwise in the bundle, so shipping it adds it.

**Recommended:** (a). The tool is for you and the agents; the live site
should not carry a bot.

**Answer:**

---

## 5. Where do reports and the baseline live?

You suggested `docs/map_reports/<map>/review-001.md` and a medians file. This
folder puts everything under one roof:

- `docs/_map-balance/baseline.json`
- `docs/_map-balance/reports/<map>/review-NNN.md`
- `docs/_map-balance/runs/*.jsonl` (gitignored)

**Recommended:** as above -- one folder that is the design, the data, and the
history. Rename the folder if `_map-balance` was a placeholder; nothing in the
code will depend on the path except `balance.mjs`'s defaults.

**Answer:**
