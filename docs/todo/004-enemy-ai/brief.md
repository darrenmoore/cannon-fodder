
enemies..
on higher levels increase their intelligence
if someone around them dies then they respond to it, move around, try to find you

if they hear a gun shot they try to follow where the gun shot was, even if they can't see you - which means you can shoot, they go that direction and then you can move - OR you shoot, if you HIT something like a house, a tree they go towards where it was SHOT.

but i think this happens already, if i throw a grenade they seem to respond to it.

check it - see if it can be improved.

--

i want to slightly "hide" my troops.
i clicked on some trees, but they keep the same formation
if i click a few times and they are stuck they should change their formation

but this only applies when they are stuck

but also when clicking in any empty spot
they are always really uniform in their positions - it can be jittered or something a bit more

--

last stand.
it renders a building that i'm meant to be looking after
BUT enemy troops come out of it!
they shouldn't be spawning if i have to protect it

also are the enemy meant to be attacking the house?
they should be!

so make sure these elements are coded in so they are flexible, perhaps in the map level stuff, meaning we can generate different types of maps with different mechanisms easily.

also it was on rookie but i expected the enemy to come and attack me
they just sit there, i think waiting to be provoked or something

i don't want them all coming at the same time

but we need some sort of wave system coded in, for this type of level.
but also wave mechanism could be introduced to other levels in the future.
so they are pro-actively trying to find and get you.

--

maps should also include how many troops you have.
sometimes we might want just one troop

and there might be a covert style mission
where they have to get to the end without killing anyone - at all

--

enemies can swim

--

add camo guys, they are wearing green, like grass to help them hide
don't need to be super powerful

--

check this repo for sprites
we don't need to be exactly the same but i think we're missing vechicles, helicopter, etc..
https://github.com/OpenFodder/openfodder/tree/master/Source/Sprites

maybe it also has the cursors, chavrons, sand and water etc..

i added:
C:\dev\games\cannon-fodder\docs\original-images\elements

--

when the phase has finished show text like this..
phase-complete.jpg

in the original it shoots up from the bottom and sits in the middle of the screen

when this happens then our troops will either..
- face the camera and wave
- and maybe one of them jumps up and down for joy

and the screen will stay there for a bit, unless the user clicks then it'll fade out to black to the next mission screen.

the original has some happy fanfair music if you can add that it'll be great

--

next mission screen should reflect this screen:
next-mission.jpg

fully black, and text

--

question is, how can we handle the fonts everywhere?
can we find a old school game font to use that is free?

--

in the original a lot of transition to black / from black
keep the same feeling

--

throwing a grenade needs to look better.
also when it lands we need a proper looking explosion

for the explosion we could use the same sprite for:
- houses
- barrells etc..

this is a screenshot of an explosion..
explosion.jpg

there is a house below it
but what i see is like one sprite repeated at different stages scattered a little

same as if an enemy throws a grenade at you

--

throwing a grenade feels off
when i click both sometimes it doesn't throw it, or the troops will move or they'll shoot, perhaps we use the middle button instead.

--

sometimes, an enemy can be shot, but just sit there screaming and bleeding and their head bobs up and down, just needing a single shot to finish them off.
it shouldn't be too often.

but it does count to finishing them all off.

--

bug
i changed the level difficulty
and in the top left it still says rookie

--

do we have a bazoka guy?
he holds a silver bazoka on his shoulders
if not, we need him

--

we need a test level
a way to test:
- different enemies
- all the sprites and terrain
- ability for us to be invunerable
- a small map but different areas
- and we need a /playtest claude skill that helps us set it up
- and it's only available on dev mode
- so when we add something new you tell me to check out the playtest
- and it'll have buttons or something in the bottom right for debug stuff
- and we need these debug switches passed across or being able to check easily but not to litter the code
- 

