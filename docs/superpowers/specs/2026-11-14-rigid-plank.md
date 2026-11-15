# Little Stroll — the plank is a rigid board

Date: 2026-11-14. Changes puzzle 3 (The Plank) in `2026-11-13-little-run-design.md`; everything else there still holds.

## Why

The owner, after playing: "the board should not get shorter and longer. It is a fixed board size to work through the obstacles."

As first built, the board simply ran from one carrier to the other, so two walkers who stood close together carried a short board and slipped through the stones. The test that "proved" the zigzag could be carried did it by closing the carriers up from 4 m to 1.2 m.

## The rule now

- The board is always 4 m long. While two carry it, it lies centred between them, pointing from one to the other.
- The carriers must stay its length apart. They may be up to 0.8 m nearer or further than 4 m: that is room for two people on two computers to walk in step, not room to shorten the board (the board itself stays 4 m). A step that would take them further from 4 m than that is refused; a pair already outside it (just picked up, or lag) may step any way that mends it.
- It is the board, at its full length, that must clear the standing stones, not the line between the carriers.
- Whoever carries an end cannot run.
- Picking up, letting go, laying it at the slot and what happens when it is dropped are unchanged.

## The stones

The owner expected the obstacles to need rethinking. They did not: a search over where two carriers can stand (`tests/helpers/carry.js`) shows a rigid 4 m board can be carried from its rests to the slot through the six stones as they are, even when kept 0.6 m clear of every stone. The gaps are 4.1 m apart on the diagonal, so the board lies from one gap to the next and the pair weave through in single file. The stones stay where they were.

What changed is what the course asks of the players: side by side no longer works, and bunching up no longer works; the pair have to turn the board end-on and take it through together.

## Tested

- The board's length never changes while carried.
- Carriers can neither stretch nor squeeze it, and can always mend a wrong distance.
- The search finds a way through at full length, and every step of that way is accepted by the game's own movement check.
- A 7 m board cannot be carried through (the course is a real constraint), and with no stones it is trivial.
- Carried through for real in two connected browsers: 305 steps, never stuck, laid at the slot.
