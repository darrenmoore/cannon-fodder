
landmine
- my head goes through it if i walk past it
- so it's fine it didn't explode it
- but check the z-indexing

---

we need a fav icon
make one and make it easily recongisable

---

does the music always start when the visitor comes to the game for the first time?

---

on home screen
at bottom
put "IMBF Games" and link to https://inselnova.com/imbf/

---

on the mission brief screen i want it to look more like the original..
C:\dev\games\cannon-fodder\docs\original-images\elements/next-mission.jpg

- it's already a black screen
- it should use one of our existing frames / panels
- it needs to also include controls, depending if you're on mac or windows

Controls
Windows (works today):

Action	Control
Move	Left click
Fire	Hold right button
Grenade	Middle click, or G, or left+right together
Pan / zoom	Arrows / +/- (or edge-scroll, wheel-less pinch)
Mac (once F is added):

Action	Control
Move	Click / tap
Fire	Hold F, or Ctrl+click-and-hold, or two-finger press
Grenade	G
Pan / zoom	Arrows / +/-
Middle click and the two-button chord simply don't exist on Apple hardware, so on Mac the keyboard keys are the controls, not the fallback.


..and see this, you need to get this working... as a different spec doc.
Mac-friendly fire key + platform-aware controls text

Bind hold-F to fire in game/src/shell/input.ts. On keydown for f/F call fireDown(), on keyup call fireUp() (both already exist at input.ts:280–292, used by the on-screen FIRE button). Guard e.repeat so key auto-repeat doesn't re-trigger, respect the existing focused-control guard, and make sure releaseAll() clears the held state on blur — a fire that survives Cmd+Tab is a bug. F must compose with the existing G grenade flow the same way the on-screen buttons do (hold F, tap G should behave like the current right-hold + grenade).
Show the controls, phrased per platform. Add a controls line to wherever the player already pauses/reads (pause or briefing screen). Detect Mac (navigator.platform/userAgentData) and phrase fire as "hold F (or Ctrl+click)" on Mac vs "hold right button (or F)" elsewhere; grenade as "G" on Mac vs "middle click or G" elsewhere. No new screens — one line of chrome in the existing UI style.
Verify with the real game, not just npm run check: drive it in Playwright (window.game), assert F down opens fire mode and F up ends it, and that G still throws while F is held.
Out of scope: WASD movement, rebindable keys, any change to the mouse scheme.


- why? because my friend wanted to play and he was on mac and had no idea how to fire etc... so if we put a strip of info on the mission page no one will miss it - but also keep it SIMPLE, take what i'm saying here as a guide, it might need some graphics / and icon or something.

---

on the first two levels we have a tutorial

the first one is telling you how to shoot
so have something at the bottom of the screen like called an advice element
and it'll tell them to do x to shoot (depending on platform)

on the second map
add the advice element as well, and tell them about grenades and to aim and throw them at the huts

this advice element will be used in the future as well
but let's keep it there for now
and when the game starts, after a few seconds it "bounces in" - so it gets their attention
and it stays there for the first two maps

but we'll need more options later, but i don't know what yet.
like when we add a new mechanic into another level
and we might just show it for a short time.

i also guess this could be cool later where we might even have it as a character
so a character comes up on the left in a circle with their face, like a leader
and it says something like "hey, remember we need to get all of our troops out!"

so let's do that, not advisor, but something where someone is talking to the player.

but for the first two levels it'll be sticky and there all the time.

and we'll put it on the third map too, but after x number of seconds, it'll pop back out of the screen.

we'll need a prompt to build an avatar, perhaps an old man with a big mustaush, we need to give him a name.

and when it pops up the text starts to type, and we need some sound effects when the letters appear, like it's been sent to you.

and this character needs a persona, a bit rough, silly, stupid, everything he says will make people laugh. we need to find a character on TV or a film like this, and then we can make a skill so we can keep in his tone, with examples, so give me some suggestions. i like dry comedy like sean lock.

we should also make this character slightly move, and blink so he feels alive.

and this bar needs to be using some of existing sprite assets

---

if it's showing a dialog like mission won / finished
no need to have the auto pausing feature

---

for the enemy they have a method to see us.
when the player is in shrubs or water, does that adjust?

because i'm thinking when they are in water it might be more of a sneak attack - or it just reduces the enemies vision a bit, as long as all the troops are in the water - or similar for example.

and for the shrubs, we need to be careful with this one, there is a map that is almost hidden with trees.

but it'll be cool if the player is getting chased by someone, and then they can jump in the water or the shrubs to hide, like hitman game style stuff. 

do we have any of those types of mechanics already?
are they easy enough to get in?
is it complicated?
could it mis-balance the game?