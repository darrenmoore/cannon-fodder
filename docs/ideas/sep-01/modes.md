# Modes and meta

The engine is closer to several of these than it looks -- most of what a mode
needs already exists and is merely unwired. Ordered by payoff per sitting.

| Idea | Effort | Fun |
|---|---|---|
| The daily patrol (daily seeded mission) | S-M | ★★★ |
| Time-attack medals -- surface the par | M | ★★★ |
| Iron man campaign | M | ★★ |
| Endless hold | M | ★★ |
| Mutators | M | ★★ |
| Paste-a-map | L | ★★★ |

**The daily patrol.** The whole campaign is generated from *seeds* -- the
same table always produces the same maps, and `build()` re-rolls
deterministically. Seed a layout+objective from today's date and everyone in
the world plays the same never-seen-before mission that day. The generator,
the validator and the winnability check already guarantee it is playable; the
only new code is a "Daily" card on the front and a seed derived from the
date. Best-time on it makes it a conversation. This is the highest
fun-per-line-of-code item in this whole directory.

**Time-attack medals.** `bestTime` is already recorded per mission and shown
as a quiet "YOUR BEST" line in the sidebar; the campaign table knows nothing
about what a *good* time is. Give each mission a par (the table already
carries a designer who just set 100 seconds on The Narrows by feel) and award
a third star -- or a small brass stopwatch -- for beating it. The end panel
(reworked in 200-qa 026) is where it lands: "2:41 -- 19 seconds inside par."

**Iron man campaign.** Boot Hill and the persistent roster already make
losses permanent *between* missions; iron man is one toggle: no retry, a
failed mission stays failed, the campaign runs on whatever men are left. The
systems all exist -- this is mostly a front-end promise ("one life each") and
a separate record slot so a casual save is not contaminated.

**Endless hold.** `survive` + `waves` already scale wave sizes by count with
no ceiling (`first * (1 + (n-1) * growth)`); an endless variant is a map
whose wave count is unbounded and whose score is waves survived. Cold Keep is
the obvious host. Needs a leaderboard-ish record (`bestWaves`) and a death
screen that says the number proudly.

**Mutators.** Difficulty is already ~15 independent levers
(`sim/difficulty.ts`) that the menu describes honestly. A mutator screen is
those levers exposed as toggles -- fog on rookie, double rushers, deaf
enemies, two-man squad -- with records kept only for unmutated runs.
Cheap because the levers were built to be independent; the work is UI and
restraint.

**Paste-a-map.** Missions are plain ASCII text with a documented contract
(`docs/map-format.md` is even written to be handed to a model). A "custom
mission" screen that accepts pasted map text, runs the same parser and
validator the check suite uses, and plays it -- suddenly the format is a
community tool. The map format doc becomes user-facing; the validator's
errors already name coordinates. Larger because it needs input UI, error
display, and a decision about persistence.
