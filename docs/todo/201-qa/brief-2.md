End-of-mission stats. The sim already counts kills, time, casualties and
best-ever marks; the end panel (redone in 200-qa 026) shows a fraction of it.
Three more lines -- shots fired, accuracy, time against your best -- cost
almost nothing and give the "one more go" itch a number to chase. Pairs with
the par idea in modes.md.

---

Shell casings. A single dark pixel ejected per rifle shot, resting where it
lands for a few seconds. The original scattered debris everywhere; ours
cleans up too politely. Strictly a particle, strictly one pixel.

---

Wading splash / mud squelch. Found while fixing the mud (200-qa 002): the sim
already decides water-vs-mud per step and fires a particle
(fx.splash(pos, thick), now for enemies too) -- there is simply no sound on
it. Two short synth patches, keyed off the same call: a bright plip for
water, a low sucking squelch for mud. The sink is a whole mission spent
wading in silence today.

---

The wounded man's scream. stepWounded (sim/enemies.ts) runs a scream
mechanic -- a repeating alarm that draws enemies to the body -- with no audio
at all. The player is being hunted by a sound they cannot hear. A
pitched-down cry on the same timer would make the mechanic legible and is
exactly the "thing happening in the world" style.md prefers over labels.

---

A wave klaxon. Waves announce themselves with a transient in-world popup
("wave 2") that is easy to miss mid-fight; the sink work (200-qa 021) added
the counter to the HUD, but a short distant horn when a wave leaves the huts
would land the dread without the player reading anything.

---

Building collapse rumble. sfxExplosion covers the grenade; the hut or
factory actually coming down -- the most satisfying moment in a demolish
mission -- shares it. A longer, lower crumble distinct from the blast.

---

Theme ambience beds. The ambience system already synthesises a bed keyed to
distance-from-water. The same trick, keyed to distance-from-canopy, gives
the jungle birdsong and insect hum; keyed to open ground on arctic maps, a
wind howl. Three beds, one existing mechanism.

---

UI clicks. The plotted buttons are silent. One dry click (the order blip
re-pitched) on press, nothing on hover.
