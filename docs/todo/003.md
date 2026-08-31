
if blow up a building
make sure the roof jumps off it a little
and then the roof will look gray as it's been destroyed
i think you tried to make it grey or something before
but it didn't work, so review what is there and fix it

and if they are close to it..
if too close then they die
if a little further they get pushed back
otherwise no problems

this should be the same code/mechanic for explosive barrels

make sure to have a small animation for "pushed back"

---

check collision on troops
sometimes i can shoot their head and they don't die
the collision seems to work more around their body and legs

---

when listing the troops
it shows chevrons pointing left and right
remove these

the chavrons are meant to be showing their rank
check the original game
and i think when they get upgraded then it shows the chevrons above their head

make sure this is a nice easy shared component

--

mission accomplished
- the promoted names are red, it's fine for lost in action but not for promoted, it's hard to see it, also remove the left and right chevrons
- remove boot hill link
- align the buttons better...
    - replay left, with a left icon
    - next mission right on the same line with an icon
    - something about mission list, i'm not sure what

--

when starting a new mission it shows the mission
keep this up until they click
and make sure when clicking it doesn't move their troops until it's closed.

--

enemies, make them roam a little, move around while they are idle
look left and right, occassionally pase, depending on their persona.
but all personas should move a little, they look too static

--

when i shoot a light cone comes out of the gun, i think this was added for mobile, remove this for now, it looks weird and not in lore.

--

when in water, a blue line appears below them, which looks really odd
in the original game they "sunk" so you could only see their shoulders

also adjust for mud or something, it showed the water rectangle block at the bottom half of their body too

--

landmines - i cannot see them at all!

also when sending an entire group of your people, it kills all of them.
see what we're doing about the house explosion and the barrell explosion with distance and being pushed away. one person should die for sure, maybe two sometimes, but it depends on distance - so check the grouping code and the distance between them when they are grouped up.

--

getting into the extraction point with all your army is tough
you need to perfectly align them all in the middle
so make a hidden circle they have to get into, which will make it easier

--

when a troop, either mine or an enemy gets killed
they just instantly turn into squish
give them a few animations
and a little bit more blood

--

organise the src directory
into multiple directories grouped by their domain
e.g. we want to keep the actual game together, and not with interface stuff


also sprites needs to be organised
i worry we'll be adding more and that file will get too big and then the AI agents will struggle to update or maintain it
