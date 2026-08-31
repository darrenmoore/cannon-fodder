
# more maps

i want about 20 more maps

but they need to be interesting and different
mixed up
not 20 versions of the same wood with a different palette

and i want you to be able to just use the scripts to make them
not hand write 20 functions

--

reviewed the generator and the problem is there's no composition layer
every builder is the same skeleton
frame -> forest -> scatter -> clearing -> squad -> scatter enemies

and every primitive is noise thrown at random positions
no ridge, no valley, no coastline, no canyon, no crossroads, no compound

so we need a layout grammar
a table of macro shapes that decide the skeleton of the map
gauntlet, island, ring siege, delta with many crossings, canyon,
coastal strip, crossroads town, spiral compound, ridgeline, causeway chain

then a map is layout x dressing x objective x doctrine x seed
and 20 maps is a table, not 20 functions

reuse river, road, frame, smooth, Placer as they are

--

# game types

we added covert (don't kill anyone)
i want more

collecting the boxes or something
crates only give grenades right now

but hostages already do free -> follow -> delivered at a tent
so a collect and carry objective is that file with the sprite swapped
do it that way, don't write it twice

also worth adding:
- assassinate, one flagged officer, the original had this
- hold ground, stand in a zone for N seconds, reuses the extraction radius and the survive timer
- a timelimit header so any objective can be a race

--

# puzzles

sometimes we want a bit of a puzzle too

we own puzzle mechanics we've never used as puzzles

rubble - levelling a building makes its tiles walkable
a map where the only route is through a hut you have to demolish
that costs no new code

fence - blocks movement and bullets but not sight
you can watch them and not shoot them
used once as decoration

quicksand and ice appear once each as flavour, never as the point

deep water is swimmable now, slow, can't fire
nothing has been built around that yet

the decoy gunshot is a stealth mechanic with no stealth puzzle behind it

--

# designed maps

not everything should look organic

i want man made things
four bridges perfectly across a river that looks man made

checked and this already works, river() with wobble 0 and four crossings
so it's not a limitation, it's just never been asked for

what's missing is hard edged primitives next to the organic ones
wall(), compound() with gates, streets() as a grid with buildings in the blocks,
trench(), pier()

five short functions and an airfield or a dam or a walled town is buildable

--

# the map format doc

is it up to date? no

missing or wrong in docs/map-format.md:
- covert objective, shipped, has a mission and its own validator
- O outpost tile, role protect, mission lost if it falls
- doctrine header, 5 values, changes the whole fight
- waves header
- squad header
- dev header
- W deep water says impassable, it's swimmable now
- campaign table lists 8 missions, there are 12
- links to game/src/map.ts, tiles.ts, terrain.ts are all 404, they moved into sim/ and render/

design.md has the same broken links

--

# can another ai make a map from it

if i give the map format to chatgpt or another agent
could it understand it and make me a new map

mostly yes, and map.test.mjs already reads every .map in data/
not just generated ones
so an outside agent can write the file, run npm run check, and fix what it says

three things it would get wrong, all fixable in the doc:
- scale, the worked example is 24x5, real maps are 64 to 220 wide
- density, nothing says no isolated single tiles or don't draw a perfect rectangle border
- reachability, it will seal a pocket, the test catches it but the doc never warns

fix those three and the doc becomes a good prompt

--

# order

doc first, it's an hour and it unblocks me and any other agent
then the collect objective off the hostage code
then the layout grammar
then generate 20 and let npm run check be the filter

--

# a /map skill

make a /map skill too
it references the doc map format

and in the map format include about being creative
think about puzzles
and it should reference existing maps for ideas

--

# combinations that don't work

importantly it cannot put map ideas together that won't work

e.g. kill no one AND kill everyone

but it could be kill noone and get the hostages for example

but if it was something like that then we can't have the enemy
standing next to the hostage
