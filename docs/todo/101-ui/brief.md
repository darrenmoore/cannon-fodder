
# overview

our level select needs to be different
it needs to be an extension of the intro screen that was defined in 005

so when they click on level select, the background still keeps animating, cpu vs cpu.

and then this new "dialog" shows up.

there is a new frame.png
per rows..
- normal
- disabled
- active
- grey frame

you need to cut this up it's a chroma green background

then see level-select.png as an example

and these things should be components so they can be reused


# intro to this page

this is a game
so when clicking level select we need subtle animations
and perhaps a fade in fade out - what do you think?

perhaps the logo on the front page shrinks and moves up


# layout

the level-select.png is a bit wrong

so we need the back button somewhere else

a list of the groups of maps on the left - keep a placeholder for the images, or use one of the images that is there now and we'll replace them later.

we need to also align our different groups with what we have, so create them anyway now, even if they are empty.

## left

- list of the groups, with total missions and how many you have done
- with a portrait image, like jungle is a tree, desert is a cactus etc..
- clicking on an group shows the list on the right
- clicking on a group makes the button highlighted - and make it joyful - but immediate


# right / main

- list all the missions
- have a big yellow number and then the name in capitals
- under it have the description of the map, very short, 8-10 words max, NOT italic, otherwise it's hard to read
- and then the stars, where they got to on it, so if they do basic level and finish it they get 1 star etc.. so three stars is the max
- they can only choose a level if they have at least one star in it otherwise it's disabled
- if it's disabled use the disabled state, and the text looks mute, and add a padlock, there is a padlock image on level-select you can try to extract
- clicking on one will load a new dialog
- the stars should be a component, there will always be three stars, but the ones they haven't done will be greyed out or something, hollowed out


# level select dialog
- the number, name and description, NO small fonts
- how many stars they have already
- and then choose difficulty
- they can close it to go back to level select


