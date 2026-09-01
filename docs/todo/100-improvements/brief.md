# 100 — improvements

The living backlog for **the game itself** — mechanics, balance, maps, AI and
the behaviour of the shell. Screens and chrome are [101-ui.md](../101-ui/brief.md).

Two briefs in the owner's words, kept verbatim and dated rather than merged
into one voice: they were written at different times against different builds,
and flattening them would lose which complaint came from which session.
The plan read out of both is [spec.md](spec.md).

---

# Part one — the front end and the fixes

*Originally `005.md`.*


# the last stand

it spawns instantly with enemies
and then i saw it say "first wave" about 20 seconds later
so i think it should spawn with no enemies
then the first wave spawns - keep the same timing, 20 seconds was a guess


# distraction

we have some things in for distraction already, the enemy, and i want to improve it.
let's say we have a map where you have to get the hostage, and they are surrounded by enemy, then you need to distract the enemy by making a noise for example, like shooting a nearby rock or tree - then the enemy will go towards that rock or tree further from the hostage, which means you can sneak in and get the hostage.

also the enemy do a little walk around etc.. right now. if you're walking from a distance, they might hear you, they might not walk your way, but they'll face the direction for a bit - which is a good sign for the player that if they get closer they will see them.

also think of more ideas how to improve this type of mechanic - it's kinda fun and helps the player understand things. it should be predictable, but the idle movement is fine as it is.


# next level

when finishing a level and going to the next level
i don't see a mission intro, it just jumps straight in

after running we should see the phase-complete.jpg
then the screen fades
then it shows next-mission.jpg
and then the game fades back in


# images

C:\dev\games\cannon-fodder\docs\original-images\intro

logo - on the intro screen has a large dark drop shadow behind it

intro - and example of what we want it to look like

banner - cut this up so we can make it short or long, and it'll be used on the intro screen


# resume screen

settings
- fix up the style of the settings screen, it's all broken
- many of the options are confusing

remove boot hill

clean up the buttons to make more sense, it's a boring list right now, lay them out differently



# intro screen

i want the intro to be rendering a map
and it's got a dark overlay on it
and it has an active game happening, cpu vs cpu
we'll make a map just for this, it won't scroll, it's just to fit on the screen and for a background
and then the logo shows up and then there are options...

so for the background add that effect where it's darker around the corners for the overlay, it looks cooler, and it makes the edges look less shit.

- Play Now (continues from where you left off and got to)
- Level Select
- Settings

on this map, no fog of war, but make sure all the characters are aggressive and can see a distance. and it should be a jungle

and the music starts

so we need to build some sort of CPU controlled stuff
we already have enemies

make sure everything is loaded before showing this

so we'll need an intro loading screen that bootstraps the game

clicking on play now
- game fades to black
- shows the new black mission screen with the information

clicking on level select
- game fades to black
- shows the new level select screen

clicking settings
- loads up the existing settings dialog


# loading bootstrap

add a fun looking loading bootstrap into the game
when we need to load music, images etc..

this will be critical when we're making it a mobile app


---

# Part two — tweaks from play

*Originally `100-improvements.md`.*


fences look a bit crap
we need them for different directions
so they look like they're connected
and in corners too like an L shaped

---

not a sound
the building we need to get to / bring hostages to doesn't look good
or in lore with the game

---

when we do this task we also need a /style doc
so we keep things looking constant with the game
and it'll be also written to docs/style.md
and the skill will reference that document
and it'll explain elements, objects, animations, fonts, ui etc..

---

when a building is destoryed
if the troops walk over it
then it's on top of them, they should be walking on top of the destruction
check z-indexing

---

not make a sound map
to rescue the people
i brought them back, but they literially had to go into the house
they should be allowed to just be in the circle around the house
otherwise it gets tricky to move them around

also on this map
it's too easy, i expected the enemies in idle to move around a little
everyone stood still
this was regular mode, and even rookie they should at least wonder
so we need a wonder mechanic or something on the enemy, and perhaps different difficulty levels they wonder a little more or something? but the issue with that is they might wonder away from what they are meant to be protecting

---

when a new map loads it shows the mission
and i click to close it, and it closes
but the next click never registers anything
but the third click works fine
check why the second click does nothing
it's a bug

---

through the wall
the building near the rocks is laughable, it doesn't look in game at all
fix it, and also make sure style is updated
look at the other buildings

also on this map it doesn't look like this building is BLOCKING the way - perhaps because it looks so awful, but also it's a pretty big gap from the house roof to the stone above it. that needs a review.

---

through the wall
at the top of the map an enemy was walking around and their heads clipped through the rocks - this is ok for things like trees, but not rocks, when it's a tree it looks like it's overhead, but not when it's a rock. check other things that this should be improved with.

---

when playing a map on the left we need the ability to
- click on a button that shows the map objective again
- restart button, perhaps just a nice icon, a typical restart button
- these should be bottom right

so maybe three buttons..
1. exit - a door, with a confirmation
2. view info - an i
3. restart - with are you sure dialog

make sure to make a standard component for confirmation with options like which buttons show, title, description (can be styled) and buttons and the button variant to use and the button text.

---

on regular i'm just finding it way too easy, it feels like rookie level!

let's have for now three levels
- rookie
- veteran - no fog of war
- elite

regular and rookie are just too similar

and this then aligns with our level stars
rookie you get one star
veteran you get two
elite you get three

if there is a level you've never done, if you do elite, you instantly get three stars.

---

aligning the maps
so we need to align our maps based on...

when first joining the game, they can flick between the different locations, like jungle, each of them have the first 3 available - always. all the others are locked, they must complete 1 to unlock another.

so if they choose jungle, choose to do the second map and finish it then another jungle map opens up for them.

this helps giving the player options and things to explore if they get stuck.

and the unlock is for any level

- where they are, e.g. jungle

then we also need to order them, not to be too boring, not to have 3 of the same type one after another

and we also need to look at generating some more maps for locations that don't have enough

we should have at least 15 for each group

and this needs to balance and fill up the space as squares on the level select screen.

we'll have the three locations for now..
- jungle
- the desert
- the ice (rename this)

and each of them will start from 1 in each group

---

when finishing the level
it fades out, good
but the left bar is still there,
that should be on the overlay too

---

the first two levels should be training...

1. small map, mission is to destroy all troops, tell them to right click to shoot the troops

2. small map, but travels up, add water a bridge and the mission is to destroy the houses, on the bridge include grenades so they are almost forced to pick them up, and then in the description tell them they must destroy the huts with their grenades, and add a few enemy troops too


this should be enough to each them about...
- shooting
- grenade
- water
- bridges
- things to pick up

---

map cold deep

- if it's a wave type of map troops shouldn't spawn until the first wave starts
- it was too easy, i just sat there shooting them, add more people to the waves and make sure they come from different directions
- each wave should have more people and be more of a challenge, this is the same for ALL wave type maps, check them all


---

wave type games
- they spawn from huts and those huts are invunderable, they can be shot but the power bar never goes down, make sure to get this into the map maker or something

---

bridge design
- looks flat and not interesting
- when it touches land make it look more natural, it's flat, make sure to know if it's going onto grass, ice etc..
- make it a little pixel rough on the edges, like wood
- if the bridge is "broken" make sure it looks broken at the end

- on braided water, there is a bridge top right but the start and end has one tile in a weird direction, the bridge is going north to south but the end parts face the other way

---

there is a map that is like a valley between mountains
- this was fun, and i could imagine is interesting
- add another one that is ice

---

sometimes you can just stay in one place and shoot everyone from a distance
we need a hidden variable in the background that is counting this
and it only counts if they are still and killing people
and it goes up each time they kill someone
and then perhaps when it gets to 2 then the enemies spawn a little faster and they start to come for you

but be careful with this it needs to cap

we're doing this so the player needs to move
and it'll happen at rookie too

make sure to design the correct levers for this
we should have this as a well designed thing already
so if it requires some refactoring - do that refactoring

---

hold the junction
- the place it told me to hold is off a little, it doesn't make sense, it's not right over the house, should it be?
- the styling of the circle is not in lore
- the hold is too long
- the hold should be on something else in the middle that cannot be destroyed, not another house, but something different like a bunker or something