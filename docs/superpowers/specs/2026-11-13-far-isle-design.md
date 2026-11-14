# Little Run — the Far Isle (three more puzzles)

Date: 2026-11-13. Adds to `2026-11-13-little-run-design.md`; everything there still holds unless this document changes it.

## Intent

The owner finished the walk with a partner and asked for more puzzles: "That was great! I want more!" They declined design questions, so every choice here is my call.

Three new puzzles on a second island. Each uses a way of co-operating the first five do not:

| Existing | Verb | New | Verb |
| --- | --- | --- | --- |
| Gate | one holds, one goes | **The Bells** | act at the same moment |
| Signal | one sees, one does | **The Marsh** | one guides, one walks |
| Plank | carry together | **The Relay** | hand it over |
| Lift | one works, one rides | | |
| Beam | aim together | | |

## What changes in the existing game

- Lighting the beacon no longer ends the walk. It raises a **causeway** out of the sea from the summit to a second island, the Far Isle. A flash line says "A causeway rises from the sea".
- The walk ends when the last puzzle (The Relay) is solved. The ending card and camera pull-back move there; the camera frames the Far Isle's summit and its lit brazier.
- Nothing about the first five puzzles' rules or positions changes.
- A full walk is now roughly 30–45 minutes.

## The Far Isle

Reached by the causeway (present only once the beam puzzle is solved; at least 30 m of open sea under it). Four plateaus in trail order: **G** landing and bells, **H** marsh near side, **I** marsh far side and relay start, **J** summit. Same world model as the first island: plateaus, ramps, deep water between, each puzzle the only way forward. Heights on the Far Isle rise from G to J; the causeway slopes down from F to G.

Checkpoints continue: 5 on F at the causeway head (after the Beam), 6 on H (after the Bells), 7 on I (after the Marsh), 8 on J (after the Relay).

## The puzzles

6. **The Bells** — act at the same moment. Two bells stand on two outcrops of G, at least 25 m apart in a straight line, each reached by its own path. Pressing E beside a bell rings it; both walkers see it swing and hear it. When both bells are rung within **1.0 s** of each other, stone steps rise from G up to H. Ringing one alone does nothing but ring. One walker cannot do it: the bells are more than four seconds' run apart. Prompt at a bell: "E — ring the bell"; after a lone ring: "Ring them together — count it down".

7. **The Marsh** — one guides, one walks. Between H and I lies a marsh covered by a 5 × 6 grid of identical flat stone tiles. A safe path of tiles runs from the near side to the far side, picked at random each session; it moves only forward or sideways, never diagonally. On H, set back from the marsh, is a raised watch-stone with a plate.
   - While someone stands on the watch-stone plate, the safe tiles are solid. All other tiles never are: step on one and you sink into the marsh and come back at the checkpoint on H, a few steps away.
   - Only a walker standing on the watch-stone plate sees which tiles are safe: they glow for that walker alone. From anywhere else all thirty look the same.
   - If nobody is on the plate, no tile is solid. So the watcher must stay while the walker crosses, and one walker alone cannot even start.
   - On I is a lever. Pulling it (E) makes the safe path solid and visible for good, and the watcher crosses.
   - Safe tiles are forgiving at their edges: the solid area extends 0.3 m past each safe tile.
   - Prompts: on the plate "Stay here — the stones hold while you watch. Guide your friend."; at the marsh edge with nobody on the plate "Someone has to watch from the stone"; at the lever "E — pull the lever".

8. **The Relay** — hand it over. On I stands a small lit brazier; on the summit J a great unlit one. The walkable route between them is 55–70 m.
   - Press E at the small brazier to take the flame. A carried flame burns for **6 s**, shown as a shrinking ring around the carrier that both walkers can see.
   - The carrier cannot run.
   - The other walker takes the flame by pressing E within 1.8 m of the carrier. That resets the 6 s.
   - If it burns out, the flame is simply back at the small brazier. Nothing else is lost.
   - Press E with the flame within 2 m of the great brazier to light it. That ends the walk.
   - One walker alone cannot do it: 6 s at walking pace is under 20 m.
   - Prompts: at the small brazier "E — take the flame"; carrying "Pass it on before it burns out — you can't run"; beside the carrier "E — take the flame"; carrying at the great brazier "E — light the brazier".

## How it fits the code

- `dyn` gains `causeway: boolean`, `bells: boolean` (the steps to H), `marsh: number` (bit i set = tile i solid now). `DYN_NONE` has them false / 0.
- `S` gains `bells`, `marsh`, `relay` slices. Puzzle order: gate, signal, plank, lift, beam, bells, marsh, relay. `S.ended` is set when the last one is solved. `solvedCount` runs 0–8, and the `welcome` message's `solved` accepts 0–8.
- The Marsh's safe path travels in `S` to the joiner like the Signal's answer does; the view decides who sees the glow (the local walker on the plate, or everyone once solved). The pilot handle's `state()` leaves the path out, as it leaves out the Signal's answer.
- The Relay's no-running rule is applied where each browser reads its own input, so it covers keyboard, stand-in and pilot alike.
- Nothing new can strand the pair: a sunk walker respawns at the checkpoint beside the marsh; a burnt-out flame returns to its brazier; a carrier who disconnects loses the flame to the brazier.

## Anti-goals (unchanged, restated for these three)

- No puzzle one walker can finish alone by any trick — tested: bell distance, marsh needs the plate held, relay distance.
- No puzzle whose difficulty is the controls — the ring window, tile edges and hand-over reach are generous.
- Nothing that leaves the pair stuck for good.

## Left to the builder

- The Far Isle's exact shape and coordinates, the look of bells, tiles, watch-stone, lever and braziers.
- Bell tones, within "two different pitches that sound good together".
- Exactly how the flame and its burn ring are drawn.
