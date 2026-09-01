# Questions

Four decisions that change what gets built. Answer inline under each; anything
left blank is built the way the plan recommends.

---

## 1. Map size: "fits on the screen" and "I can scroll around"

The brief asks for both, and they are opposites. At the shipped zoom a viewport
is roughly **530 x 300 world pixels**, so a map that fits entirely on screen has
nowhere to scroll to.

**Recommended:** ~48 x 34 tiles (768 x 544 px) -- about 1.5 screens wide and
1.8 tall. Both sides' huts are always within a short pan; the fight is usually
inside one screen, but the ground is not.

- (a) 48 x 34, as recommended -- a little bigger than a screen
- (b) Truly one screen (~33 x 19 tiles) -- no scrolling, the whole battle framed
- (c) Bigger (~64 x 44) -- more manoeuvre, more walking, less on screen at once

**Answer:**: a

---

## 2. Which hut belongs to which side

The map format has no notion of a building's owner. Two ways to add one:

**Recommended:** decide it by the map's midline in `arena.ts` -- west huts are
green, east huts are blue. Costs nothing, changes no file format, and is
replaceable later.

- (a) Midline rule, as recommended
- (b) A real marker: a new tile character (say `G`) for a green-owned hut, in
  the legend, the map format doc and the validators. Cleaner and permanent, but
  it also wants a tinted hut sprite so the two read apart, which is drawing
  work this prototype does not otherwise need.

**Answer:**: b, make tints flexible across sprites, can be useful for making variants of elements, so make a standard interface for this like roof:red, or something better

---

## 3. Where the door is

**Recommended:** a `__DEV__`-gated **BATTLE** button on the front screen, plus a
`#arena` hash for harnesses. Invisible in a production build until you say
otherwise.

- (a) Dev-only button, as recommended
- (b) Visible to everyone from the start -- it ships as a feature, not a
  prototype
- (c) Hash only (`#arena`), no button at all

**Answer:** a, later it will be a backdrop on the intro page

---

## 4. Should the sides be able to level each other's huts?

Rifle rounds barely scratch a building, and only the grenadier trait carries
explosives. If huts can fall, one side eventually loses its production and the
battle ends -- which is a *game*, and the brief says version one is a thing to
watch.

**Recommended:** huts are indestructible in the arena, so the fight runs
forever and the camera always has something to look at. Making them
destructible is the natural first thing to add afterwards, and it is the point
at which the arena gains a winner.

- (a) Indestructible, as recommended -- endless battle
- (b) Destructible -- the battle has an ending, and item 006 needs a result
  panel and a restart

**Answer:** a, no
