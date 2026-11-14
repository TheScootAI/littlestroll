# Little Run — the Lantern Isle (three more puzzles, and things to find)

Date: 2026-11-14. Adds to `2026-11-13-little-run-design.md` and `2026-11-13-far-isle-design.md`; everything there still holds unless this document changes it.

## Intent

The owner asked: "Go ahead and add more puzzles to the game. Could add a little more exploration too." They have declined design questions before, so every choice here is my call.

Two standing rules from the owner shape this:

- **Prompts teach controls only.** No on-screen text may hint at how a puzzle is solved. A prompt names a key and what it does ("E — light the lantern"), nothing more. Working it out is the fun.
- One of the two walkers is often an AI driving `window.__pilot`. Anything a player can see must be readable from a screenshot, and the pilot's `state()` must never contain what a player cannot see.

Three new puzzles on a third island, each using a way of co-operating the first eight do not, and two kinds of exploration: a wide island that has to be searched, and small things hidden off the trail everywhere.

| Existing verbs | New | Verb |
| --- | --- | --- |
| hold / go, see / do, carry together, work / ride, aim together | **The Pillars** | keep pace |
| act at the same moment, guide / walk, hand it over | **The Ring** | each knows half |
| | **The Lanterns** | split up and cover ground |

## What changes in the existing game

- Lighting the great brazier (The Relay) no longer ends the walk. Its flash line stays "The Far Isle is lit".
- The walk ends when the last puzzle (The Lanterns) is solved. The ending card and camera pull-back move there.
- The Far Isle's summit J gains a small landing on its north side, where the pillars begin. Nothing else about the first eight puzzles' rules or positions changes.
- The ending card gains one line: how many owls the pair found (below).
- A full walk is now roughly 45–60 minutes.
- The wire format changes (three new slices of `S`, `solved` up to 11), so `PROTOCOL_V` goes up by one.

## The Lantern Isle

North of the Far Isle. Same world model: plateaus, ramps, deep water between, each puzzle the only way forward. Three kinds of ground:

- **K**, the landing: where the pillars arrive. Holds the ring of standing stones in its middle and a seeing stone out on each of two wings.
- **L**, the wide interior, a few metres above K and reached only by stone steps that rise when the ring is solved. Roughly 70–90 m across, an irregular shape with coves and spurs, wrapped round a central **tor**: a tall rock mass nobody can climb, which hides one side of the island from the other.
- The world grid used by the tests' flood fill and the pilot's path finder must grow to cover it.

Checkpoints continue: 9 on K where the pillars arrive (after The Pillars), 10 on L at the head of the steps (after The Ring), 11 on L (after The Lanterns; never used to respawn in practice, but the table must have it).

## The puzzles

9. **The Pillars** — keep pace. Two straight lines of nine stone pillars cross the sea from J's north landing to K, side by side and far enough apart that nobody can step from one line to the other. At rest every pillar's top sits below the deck level and cannot be stood on.
   - Neither line belongs to either walker; they choose. A walker's *place* is the pillar they stand over (0–8 on that line), or −1 while they stand on the near landing (this counts on both lines), or nowhere. The near landing is the small patch of J where the lines begin; the checkpoint on J is not on it.
   - Pillar *r* of one line is raised exactly while the **other** walker's place on the **other** line is *r* − 1, *r* or *r* + 1. Nobody raises their own pillars.
   - So the pair cross abreast, never more than one pillar apart. Step onto a pillar that is not raised and you fall into the sea and come back at the checkpoint on J.
   - A pillar that should drop stays up for **0.4 s** more, so crossing the seam between two pillars, or a slow connection, never drops anyone unfairly.
   - The moment either walker stands on K's landing, every pillar rises for good and the puzzle is solved.
   - One walker alone cannot start: with nobody else, no pillar ever rises.
   - If one walker falls or leaves, the other's pillar drops too, 0.4 s later. Each browser decides its own walker's fall, as everywhere else in the game; a partner who has already stepped back onto the landing simply stays there. Nobody can be stranded: until it is solved, nobody is on K.
   - No prompt. There is no key to press.

10. **The Ring** — each knows half. In the middle of K stands a ring of eight blank standing stones with a marked entrance. Out on K's two wings stand two seeing stones, at least 30 m apart, each with a place to stand before it.
    - Each session deals, from the seed, a different carved sign for each of the eight standing stones (the signs are not shown on them) and an order of four of the stones.
    - One seeing stone's face shows **the order**: the four signs, first to last. The other's shows **the ring**: a picture of the eight stones with the entrance marked and each stone's sign.
    - A seeing stone's face shows only to a walker standing before it, and only while the other walker stands before the other seeing stone. To anyone else it is blank. So the two must each read one half at the same moment and tell each other what they see.
    - E beside a standing stone touches it (the nearest one in reach). A touch counts only while **both** walkers are inside the ring; the ring's floor glows while they are. Any stone touched lights, right or wrong: the ring gives nothing away one stone at a time. A stone already lit does nothing.
    - When four are lit the ring judges them. The right four in the right order: stone steps rise from K up to L. Anything else: all four go out and the pair start again. Nothing is re-dealt, so a slip costs only the walk round the ring.
    - Guessing is hopeless (1,680 possible orders, and a wrong one says nothing about which stone was wrong), so the seeing stones have to be read.
    - Lit stones stay lit if a walker steps out of the ring; touches simply stop counting until both are inside again. If both walkers touch in the same tick, the host's touch is taken first.
    - One walker alone cannot: no face ever shows to them and no touch ever counts.
    - Prompt beside a standing stone while both are inside the ring: "E — touch the stone".

11. **The Lanterns** — split up and cover ground. Six lantern posts stand around L, spread right round the tor, most of them out of sight of the head of the steps. By the head of the steps is a tally stone: a plain row of six small niches, one per lantern, each glowing while its lantern burns. The niches are in no meaningful order.
    - E beside a lantern lights it, or tops it up if it is already burning. A lit lantern burns for **25 s**, its flame visibly sinking as it goes.
    - All six burning at the same moment: solved. They then burn for good, a great lamp on the tor catches, and the walk ends.
    - One walker alone cannot: at a run, the shortest possible way through all six (an open path, starting at whichever lantern they like) takes longer than 25 s (tested with straight-line distances, with a margin of at least 10%).
    - Two walkers who split the six between them can, with room to spare: some split lets each walker run their share, first lantern to last, in at most 15 s (tested on walked routes).
    - Nothing is lost when one goes out. The pair try again.
    - Prompt beside a lantern: "E — light the lantern".

## Things to find: the owls

Eight small stone owls sit off the trail: three on the first island, two on the Far Isle, three on the Lantern Isle. Each is at least 6 m from the trail's line, somewhere a walker can reach once everything before it is solved (an owl may sit behind a puzzle; nothing ever closes behind the pair, so they can walk back for one they missed), and tucked where a walker following the trail would not walk into it.

- Walk within 1.2 m of an owl and it is found, for both walkers. It hoots, its eyes light, and a flash line says "An owl — 3 of 8" (the count so far). That is the only text about owls during the walk.
- Owls are not puzzles. They gate nothing, they are not counted in `solved`, and missing all of them changes nothing but the card.
- The ending card shows "Owls found 5 of 8".

## How it fits the code

- `dyn` gains `pillars: number` (bit `line * 9 + r` set = that pillar is raised) and `ring: boolean` (the steps to L). `DYN_NONE` has 0 / false. Ground over the pillar lines works like the marsh: deep water except within a small margin of a raised pillar.
- `S` gains `pillars`, `ring`, `lanterns` slices and `owls` (a bitmask of found owls). Puzzle order: gate, signal, plank, lift, beam, bells, marsh, relay, pillars, ring, lanterns. `solvedCount` runs 0–11 and `welcome.solved` accepts 0–11. `owls` is validated like any slice but is not in the order.
- The Ring's deal travels in `S` to the joiner, like the Signal's answer and the Marsh's path. The view decides who sees a face. The pilot's `state()` leaves the deal out and reports only what a player could see: which stones are lit, whether the steps are up.
- The ending shot is derived from the layout as before: it frames the tor's great lamp with the Far Isle and the first island strung out behind.
- Scenery on the Lantern Isle comes from its own seeded stream, so nothing already placed moves.

## Anti-goals (unchanged, restated for these three)

- No puzzle one walker can finish alone by any trick — tested: no pillar rises for one walker; no ring touch counts for one walker; the lantern round is too long.
- No puzzle whose difficulty is the controls — the pillar margin and 0.4 s grace, the reach of a touch, and the 25 s burn are generous.
- Nothing that leaves the pair stuck for good.
- No text that explains a solution.

## Left to the builder

- The Lantern Isle's exact shape and coordinates, within the constraints above; the look of pillars, standing stones, seeing stones, signs, lanterns, tally stone, great lamp and owls.
- The eight signs, within "bold and distinct at 15 m, and unlike each other in a screenshot". The Signal's six symbols may be reused and added to.
- Where each owl sits, within its rules.
- Sounds, within "soft, and different from the ones already there".
