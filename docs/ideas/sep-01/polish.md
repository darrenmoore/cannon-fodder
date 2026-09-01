# Polish

One-pixel details, in the house's own sense: a thing happening in the world
rather than a label on it. None of these changes a rule; all of them change
how handled the world feels.

| Idea | Effort | Fun |
|---|---|---|
| End-of-mission stats | S-M | ★★★ |
| Bootprints in mud and snow | M | ★★ |
| Muzzle flashes in the factory glass | S | ★★ |
| Shell casings | S | ★ |
| The camping tell | M | ★★ |
| Briefing map glance | M | ★★ |
| Rank worn in the world | S | ★ |

**End-of-mission stats.** The sim already counts kills, time, casualties and
best-ever marks; the end panel (redone in 200-qa 026) shows a fraction of
it. Three more lines -- shots fired, accuracy, time against your best -- cost
almost nothing and give the "one more go" itch a number to chase. Pairs with
the par idea in [modes.md](modes.md).

**Bootprints in mud and snow.** The wading splash knows exactly when a foot
lands in mud (200-qa 002 moved that decision to one shared spot, enemies
included). Stamping a two-pixel print into the ground bake that fades after
a few seconds makes the bog *recorded* -- and on arctic maps the same stamp
in snow shows patrol routes to a player who reads ground, which is a stealth
mechanic disguised as decoration.

**Muzzle flashes in the factory glass.** The new factory roof (200-qa 006)
has runs of dark glass panes. A one-pixel glint that blinks in them while
the building's spawned troopers are alive would make a garrisoned factory
read as *inhabited* -- and quietly telegraph the trickle mechanic that
otherwise surprises people.

**Shell casings.** A single dark pixel ejected per rifle shot, resting where
it lands for a few seconds. The original scattered debris everywhere; ours
cleans up too politely. Strictly a particle, strictly one pixel.

**The camping tell.** `sim/pressure.ts` punishes standing-and-killing by
quietly ramping spawn rate and hearing -- and nothing shows it. The style
rule says prefer a world tell: after the pressure threshold, distant
whistles, or the wave popup arriving *angrier*. An invisible punishment
reads as rubber-banding; a telegraphed one reads as the enemy adapting.

**Briefing map glance.** The attract world already renders real terrain
behind the front end. The briefing card could show the actual mission
terrain, zoomed out, for two seconds -- no markers, just the shape of the
ground -- which rewards map literacy and makes the 220-tile maps less of a
blind walk. Kept marker-free so it never becomes a minimap.

**Rank worn in the world.** Promotion pips exist over soldiers' heads and
rank genuinely improves fire (`veteranEdge` in troops.ts), but nothing ever
says so. One line in Boot Hill or the briefing roster -- "Sgt: steadier
hands" -- makes survival visibly worth something, which is the whole meta.
