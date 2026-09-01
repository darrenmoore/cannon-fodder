# Questions -- 201-qa

Two decisions only you can make. An issue blocked on one of these is not
worked on until it is answered. Type your answer after the `>`.

---

## ~~Q1 -- who is the man in the circle, and what is he called?~~ (issue 007)

**Answered: 1, with a Sean Lock comedy twist.** A blustering old officer,
played with Lock's flat timing and absurd specifics. Copied into
[007](007-comms-panel.md) under **Decision**. His name was not picked, so
`Major Trumper` is taken as the working name -- say the word and it changes.

You asked for suggestions and for a name. The persona decides the avatar, the
lines, and a `/speakers` skill that keeps every future line in tone -- so it has
to be settled before anything is drawn.

All four are dry rather than jokey, and all four fit "a bit rough, silly,
stupid".

1. **A blustering old officer -- Mainwaring / Sergeant-Major Williams.**
   Pompous, certain, completely out of his depth. Gives orders that are
   obviously wrong and never notices. Most on-theme: this *is* a squad game,
   and the big-moustache officer you described is already this character.
   Example: *"Right. The enemy are over there. Or possibly behind us. Either
   way, forward."*
2. **Sean Lock's own register.** Flat delivery, absurdly specific, total
   commitment to a stupid premise. Closest to what you said you like. Harder
   to keep consistent, and it does not naturally explain why he is talking to
   a squad. Example: *"Grenades. Little metal pineapples. You throw them. Do
   not eat them, we lost a man that way."*
3. **Windy Miller -- a certain, irrelevant old countryman.** Warm, gentle,
   never mean. Safest tone for a game where your men die and get names on a
   hill. Example: *"Lovely bit of grass, that. You could hide a whole war in
   it."*
4. **Rimmer.** Self-important, cowardly, quotes regulations. Sharper and
   funnier first time, most likely to grate on the tenth mission.

**Recommend 1**, played with 2's timing -- the officer is the character your
avatar description already draws, the register is the one the original game
lived in, and he gives a natural reason for a voice to be talking to you at
all.

Also needed: **his name.** Suggestions in that key -- *Major Cobb*,
*Sergeant-Major Pike*, *Colonel Bunty*, *Major Trumper*. Or pick your own.

> 1 but with sean lock comedy twist

---

## ~~Q2 -- how much should grass and water hide you?~~ (issue 010)

**Answered: 1 -- both, at range only.** Tall grass and deep water each cut an
enemy's notice range while you stand still in them, floored at about 3 tiles.
The "cut both ways" recommendation stands unopposed, so it is taken as **yes**:
cover hides enemies from the player's fog on the same terms. Copied into
[010](010-hiding-in-cover.md) under **Decision**.

Right now the code claims tall grass hides you and does not actually do it:
sight is only blocked by grass *between* you and them, never by the grass
you are standing in. Water does nothing at all. Fixing it is easy. Getting the
amount right is not, because **`undergrowth` is 52% tall grass** and full
invisibility would turn that mission into a walk.

The mechanism is the same either way: standing in cover shrinks how far an
enemy can notice you, and it fades with distance -- hidden across a clearing,
plainly visible at three tiles. That is the "jump in the bushes to break a
chase" you described.

1. **Both, at range only.** Tall grass and deep water each cut an enemy's
   notice range to about a third while you are standing still in them, but
   never below about 3 tiles. Someone chasing you loses you if you get ahead
   of him; someone standing next to you sees you fine.
2. **Water only.** Leave grass exactly as it is. Deep water becomes the one
   hiding place, which suits it -- you are slow, you cannot shoot, and the
   trade is that they lose you. No risk to `undergrowth` or the three stealth
   maps at all.
3. **Both, but only under `modern` rules.** The game already has a
   `classic` / `modern` rules setting. Concealment goes in as a `modern`
   mechanic the 1993 original did not have, and `classic` plays exactly as
   today. Safest, and doubles the work -- every affected map has to be
   winnable both ways.

**Recommend 1.** It is the mechanic you described, the range floor is what
keeps it from breaking anything, and it makes four maps better instead of
one. It does mean re-judging `undergrowth`, `not-a-sound`, `softly-softly`
and `loud-and-clear` in a playtest, which is budgeted in the issue.

One extra decision inside whichever you pick: **should it cut both ways?**
If grass hides your squad it should also hide enemies from your fog, or
`undergrowth` gets easier twice over. Recommend yes.

> 1
