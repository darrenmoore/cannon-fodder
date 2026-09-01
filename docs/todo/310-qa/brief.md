
convert all maps to yaml format
but first make a script that validates the format
then convert them
then use the script to validate them all
and make sure the comms element pops up etc..

---

what else can be moved to the map files?
the guide arrows i think could be added
i want to move as much logic that makes sense to the map data
and then the game is an engine
and it means our game config gets more powerful

and update the map-format file

---

in docs/ we have files in that directory, like characters.md etc..
we need to move them and their references to another directory
like docs/game/

and it's like a game design document
do's and dont's etc..

what are we missing?
what do typical small games have that we should have that will help AI agents make decisions?
and what skills need to reference them so they get read in at the right time?

---

explosions like a grendade needs to look more classic amiga days

---

in 018-ui-clicks
we have buttons like intro
in the game, settings etc..
make sure they are all using the same components

and make sure they have sound effects, i do not hear ANY ui sound effects at all!

---

in the bottom right is a centre button
i only saw it when i hovered over that area
remove it

are there any other buttons like this?
i think they were added when we tried to do a mobile version

---

when someone dies, make a dying sound

---

when a enemy troop is injured
the noise they make is a weird, sounds like a dog
improve it

also the graphic doesn't look right
make an alternative, like we can see his face a little

---

map: bone road
the waves sound effects sound ok
but there is a brushing sound in the background - fix it

---

when an enemy dies in the water
their body should sink
and then just have some red at the top like blood floating

---

i threw a grenade close to some enemies
and all of them ran towards where it landed
and all of them grouped up really close

it's good they went in that general direction
but it looked unusual

they need to split up a bit or something

perhaps when they go towards the noise we jitter it a little
so they don't all end up trying to get to the same pixel

---

data directory
we need to move to data/maps/
and then have possibly data/names.json / .ts or something with an array of names

what else in the game can be moved to a data file?

---

we made it so the enemy troops in the water would be more hidden than ours
but i don't like this it's too much
so review what we did
and make it so when they're swimming it's the same as the players troops

---

i started the map "the long white"
and i think i was paused
and the advisor bar at the bottom didn't disappear after a short while

---

map "the long white"
when the troops spawn they kind of spawn in the same place, trying to be the same pixel?
and when they come to to attack my base they're too uniform
almost following each other
which is kind of ok, but it needs a bit more jitter somewhere
i was thinking it was their spawn point, but i'm not sure

---

paused screen
it shows move, fire, grenade and pause keys
but it's hard to see the text, it's too light
fix it here and where ever else it is, make it lighter and easier to read

---

for invunerable buildings
do not show a power / enegy bar above the building
it might confuse people

---

is it possible different troops can have different personas
like we might render 20 troops, but they might have different attributes like..
- can see further
- wonders / patrols a bit more - how does patrol work? it should be in this persona thing
- is a bit of a coward
- more aggressive and runs into the battle
- throws more grenades

i don't want this in the map right now
but i thought it might be interesting for
- future game and maps
- the arena background battle

as we're changing our maps to yaml
i think we should be able to have levers to say what % or something that different troops have different personas, this means we can have some interesting maps.
we could have a map that just has 5 grunt players who always run at you.
i just want to have this option

when you write the spec, give me a list of our existing levers
and then make a list of others ones we could implement

and when you implement these levers review the code, don't just put it on top of what we have already - should the npc cpu player be split into multiple files, and like npc/ directory for example and those traits are in different files? it's up to you, but review first.

we don't nessisary need to define each trait in the map file, but perhaps we need a data/npc-personas/ directory? like solider.json etc...

---

when a troop dies, the dead body
- make some variants of it because it looks really repetative

---

troops spawning from their huts / buildings, should be spawning closer to the door, at the front.

---

the people i rescue they follow me
but they very often end up standing in the same pixel
so if i rescue 5 people
and i move around
they follow me
then i really can only see one person, because they are stacked up on each other

this feels like an infrastructure problem
like enemies and player this doesn't happen

so if we ever add another character in the game it shouldn't do this automatically

so find a reliable single method for this so it doesn't happen including spreading out like how the players troops do - try not to repeat the code.

---

mission screen
- when it's a new troop no need to say "New" - it uses up space on the screen

---

the left menu:

- lists our squad but it needs to be more in /style of the game, looks too clean
- the headings, squad, supply and orders
    - give them more space between them, but not the top one
    - the text is hard to read, lighten it up a little

---

when i click for troops to go somewhere
it makes a circle on the screen to show me where they'll go
but this circle is not in style / lore of the game
- we have a circle already in the game for objective, check and reuse that, perhaps make it a component if it's worth doing
