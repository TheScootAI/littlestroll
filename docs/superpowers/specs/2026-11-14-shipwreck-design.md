# Little Stroll — the shipwreck (the plank has to be found)

Date: 2026-11-14. Changes puzzle 3 (The Plank) again, on top of `2026-11-14-rigid-plank.md`; everything else in the earlier designs still holds.

## Intent

The owner: "Instead of the plank being where it is obvious, it should just be on the beach leaning against a rock where you start, so you need to go to the gap and then realize you need to go back and get the board. Have a couple of other pieces there as well that are not the correct size. The one that is too long can't make it through, then there is one that is too short, etc. Maybe even a few other shapes. It is from a ship that wrecked on shore."

So the plank stops being handed to the players at the stones. A ship has wrecked on the beach where the stroll begins. Its timbers lean against a rock there. The pair walk past them, solve the gate and the signal, thread the standing stones, reach the gap, and only then see they need something to bridge it. They go back and choose.

Prompts still teach controls only. Nothing on screen says which piece is right.

## The wreck

On the beach (zone A), a few metres from where the walkers start, a broken hull lies half in the sand at the shore, with loose debris round it: ribs, a mast stump, barrels, a crate. That is scenery: it cannot be picked up and does not block anyone.

Four loose timbers lean against a rock beside it. Each is rigid and needs two carriers, one at each end, exactly as the plank does now:

| Piece | Length | What happens |
| --- | --- | --- |
| the plank | 4 m | the right one: fits through the stones and bridges the gap |
| a spar (a round pole) | 6.5 m | too long: it cannot be turned through the standing stones |
| a short board | 2.5 m | goes through the stones easily; too short for the gap |
| a hatch cover (short and wide) | 1.8 m | the same: too short |

- Lengths are fixed. A search over carrier positions shows that under the game's own carrying rules boards up to 5 m can be taken through the stones and boards of 5.5 m and over cannot; the spar is well past that, the plank well inside it.
- The gap is 3.6 m of water. A piece at least 3.8 m long bridges it.
- Letting go of a piece at the slot: if it is long enough it is laid and the puzzle is solved ("The plank is down"), otherwise it tips into the water with a splash and is back at the wreck, leaning on its rock. Nothing else is lost.
- A piece let go anywhere else stays where it is put down, if both its ends are on dry ground and clear of the stones; otherwise it is back at the wreck.
- Everything else about carrying is as in the rigid-plank design: the carriers stay the piece's length apart (0.8 m either way), it is the piece at its full length that must clear the stones, a lone holder cannot walk off with an end, carriers cannot run, and carriers who end up far apart drop it.
- One walker alone still cannot do it: every piece needs two.
- Nothing can strand the pair: any piece can always be put down or fetched again from the wreck.

## How it fits the code

- `SITES.wreck = { rock: [x, z], pieces: [{ kind, len, a: [x, z], b: [x, z] }], hull: { x, z, yaw } }`. `pieces[0]` is the plank. `a` is the end on the sand, `b` the end up on the rock; they are `len` apart. The rock is an existing scenery boulder near the start (first-island scenery must not move).
- `S.plank` becomes `{ boards: [{ ax, az, bx, bz, holdA, holdB }], placed: null | index, splash: seconds, solved }`. `dyn.plank` is `placed !== null`. The wire format changes, so `PROTOCOL_V` goes up by one.
- The pilot's `state().puzzles.plank` lists the pieces (length, ends, holders) and which is laid: all things a player can see.
- `SITES.plank.restA / restB` stay in the layout as plain anchors (the patch of ground before the stones that the scenery keeps clear); no piece rests there any more.

## Anti-goals

- No text that says which piece to take, or that the others are wrong.
- No piece one walker can move alone.
- The right piece must not be the only one that can be lifted: the wrong ones are real, carriable, and fail for a reason the players can see.

## Left to the builder

- Exactly where the hull and each timber lie, within: on the beach's flat sand, near the start, the four timbers' ends far enough apart that a walker picks up the one they mean, clear of the trail and of the spot where the owl hides.
- The look of the hull, the debris and the four timbers, within "plainly a wreck, plainly different lengths and shapes at a glance".
- The splash's look and sound.
