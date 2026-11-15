# Little Stroll — the Signal's plate and wall

Date: 2026-11-15. Changes puzzle 2 (The Signal) in `2026-11-13-little-run-design.md`; everything else there still holds.

## Intent

The owner: "For the second puzzle, when the player goes up top, they need to stand on a plate to get the symbols to show. Then a wall comes up preventing the other player from going up there. When you come off the plate the wall goes down, but when you step on it again the patterns change. That way you can't go up, memorize them and then run down."

As built, the symbols on the back of the wall glow whenever someone stands at the dials, and anyone at the lookout can read them. So one walker can read all four, walk down and set them, with the friend doing nothing but standing by. The puzzle is meant to be "one sees, one does": the one who sees has to stay and tell.

## The rule now

- At the lookout there is a plate. The symbols show only while a walker stands on it (and, as before, only to someone on the lookout's side of the wall).
- While the plate is held, a stone barrier stands across the path up to the lookout, so the other walker cannot come up, and the one on the plate cannot come down without leaving it. The barrier never rises onto a walker: if someone is standing where it comes up, it waits until they have moved.
- The moment the plate is left, the barrier goes down and the symbols are dealt again: a new four, different from the last. So nothing read up there is worth carrying down.
- The dials only solve the puzzle while the plate is held: they have to match the symbols that are showing now.
- Once solved, the bridge swings out as before, the barrier is down for good, and the symbols stay lit.
- One walker alone cannot do it: the symbols they read are gone the moment they step off.
- Nothing can strand the pair. Two walkers who are both at the lookout when one steps on the plate are both up there behind the barrier; stepping off lets them out.
- No new prompt and no new text. The plate needs no key. "E — turn the dial" stays.

## How it fits the code

- `SITES.signal` gains `plate: { x, z, r }` (at the lookout) and `barrier` (a segment across the lookout's ramp). `dyn` gains `spur: boolean` (true while the barrier is up); `blockers(dyn)` adds the barrier's segment then. The pilot's path grid carries the new key.
- `S.signal` gains `seed`, `deal` (how many times the symbols have been dealt again), `held` (the plate is stood on) and `up` (the barrier is up). `lit` now means "the symbols are showing" (held, or solved). The wire format changes, so `PROTOCOL_V` goes up by one.
- The pilot's `state()` reports `held` and `up`, never the answer.

## Left to the builder

- Exactly where the barrier crosses the ramp, within: on the ramp, where there is no way round it, at least 3 m of ramp below it and well clear of the plate.
- The look of the plate and the barrier, in keeping with the gate's plates and the standing stones.
- The barrier's sound.
