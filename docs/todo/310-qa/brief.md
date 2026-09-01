
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

