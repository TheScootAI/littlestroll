# Final whole-branch review: lantern-isle (1fc612d..d49bd67)

Reviewer: final code review, read-only. I read the whole diff in passes (skipping the two scenery fixtures) and read the spec, plan and ledger. I ran the eight new and touched test files (195 tests, all pass) and probed geometry with scratch node scripts outside the repo.

## Strengths

- The cross-task seams agree. ORDER, createAll, stepAll, dynOf, validState, forceSolved, promptFor, the views list, `welcome.solved` 0–11, PROTOCOL_V 5, the path grid and the pilot all line up.
- The ending fires once, on ORDER.at(-1), and the Relay no longer ends the walk.
- Sequence holds by geometry and by rule:
  - The Pillars are dormant until `S.relay.solved`.
  - K is only reachable over raised pillars, and L only up the `ring` steps. Both are tested by flood fill (`layout-lantern.test.js` 85–116, 330).
  - So no later puzzle can be solved ahead of an earlier one.
- Checkpoints 9, 10 and 11 sit on always-solid K and L ground, so a reconnect with `solved` 9–11 lands on solid ground.
- The joiner side of the pillars is sound:
  - `pillarAt` is contiguous along a line (`floor(v/tile)`), so crossing a seam never yields a `null` place.
  - Under the abreast rule the pillar ahead is already raised before anyone steps.
  - A stale `dyn` errs toward "still up": a drop arrives late, which delays a fall rather than causing one.
  - The walker's view and the rules read the same mask, so what each player sees is what the rules use. Nothing leaves the host and joiner disagreeing for good. The one unfair-drop path is the side lip (Important 1).
- The Ring's deal is read only by `views/ring.js`, behind `seesFace` with the local index. Pilot `state()` leaves the deal out, and a wrong stone lights exactly like a right one.
- Every new slice has a strict `valid`. A worst-case encoded `S` is about 2.2 KB, well under MAX_BYTES of 16 KB. No per-frame allocation of note.
- Scenery for the first two islands is dealt over the old extent, so both fixtures hold.
- No home paths, usernames or e-mail addresses in any committed file.

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

**1. A walker on a pillar's side lip silently drops their partner.**

Where:
- `src/puzzles/pillars.js:20`: `placeOf` uses `pillarAt`.
- `src/world/layout.js:271`: `pillarAt` has no margin, |u| ≤ 1.2.
- `src/world/layout.js:287` and `:339`: the ground is solid out to |u| ≤ 1.5, the `edge` margin.

Effect:
- Probed: at |u| 1.25–1.45 on a raised pillar, the height is 12.45 (standing) but the place is `null`.
- Anyone who pauses on either side lip for 0.4 s drops their partner's pillar. The partner falls, and then their own pillar drops too.
- Neither player can see why. The column is drawn only 2.1 m wide with a 2.2 m cap (`views/pillars.js:14`), so the walker on the lip looks like they are standing in air.
- The spec says the margin and the grace mean nobody is ever dropped unfairly. This drops people unfairly.

Fix:
- Give `placeOf` the same margin: treat |u| ≤ tile/2 + edge, with v clamped to the line, as that pillar.
- Draw the cap at the standable width.
- Add a test: a walker at |u| = 1.45 keeps the other line's pillars raised.

**2. One owl is buried inside a boulder.**

Where:
- Owl 3 at `src/world/layout.js` `OWLS[3]` = [95, -48].
- Scenery from `placeFarScenery()` around it:
  - a boulder 0.64 m away (radius about 1.2 m),
  - a second boulder 1.14 m away (radius about 1.8 m),
  - a pine 0.82 m away.

Effect:
- The owl's body top is at about 6.57 m. The boulder's surface over it is at about 6.53 m, so at most the ear tufts show.
- A pair who search carefully can find 7, and the card says "of 8".
- The owl test checks distance to sites and blockers, but not to scenery. The old-island scenery cannot move, so the owl has to.

Fix:
- Move owl 3 a few metres to clear ground.
- Add a test: every owl is at least the item's radius plus 0.5 m from every tree, boulder and rock in `placeScenery` and `placeFarScenery`.
- Others checked: owl 2 has a pine 1.06 m away (trunk clear, canopy above) and owl 4 has trees about 1.5 m away. Both are visible.

**3. The tally reads the lanterns in clockwise order.**

Where:
- `src/puzzles/views/lanterns.js:100–104` lays the niches out in index order.
- `POSTS` (`layout.js`) is built as `k·π/3` clockwise from north.

Effect:
- The row lists the lanterns clockwise, starting due north. That is a meaningful order.
- The spec says "the niches are in no meaningful order". The plan says the row "must not mirror the island's layout".
- Players are told where the dark lantern is rather than working it out.

Fix: in the view, place niche *i* at a fixed scrambled slot (for example `[3,0,4,1,5,2]`). Add a test that no two neighbouring niches are neighbouring posts.

### Minor (Nice to Have)

1. **Only half the posts are hidden.** From the head of the steps, the tor hides posts 0, 1 and 5; posts 2, 3 and 4 are in plain view. The spec says "most of them out of sight". The test asserts ≥ 3 (`layout-lantern.test.js:252`), so it passes at exactly half.
2. **A falling walker passes through stone.** A lowered column's top is 2.2 m under the deck (`views/pillars.js:11`). A walker who steps on it, or whose pillar sinks, visibly drops through it.
3. **Pilot `state()` is more precise than the screen.** `lanterns.t` reports exact seconds left (`pilot.js:112`), while a player sees only flame size. A 0–1 flame level would match the screen.
4. **An owl's flash line can be lost.** If an owl is found in the same `applyState` as a solve, its flash is suppressed (`game.js:237`). The hoot still plays, but the "An owl — n of 8" line never appears.
5. **`__pilot.pillar(line, r)` returns points past the line** for r outside 0–8, instead of null.
6. **`heightAt` scans more discs.** ZONES grew to 98, and the pointer ray-march calls `heightAt` many times. Fine today; watch it.
7. **Per-frame string building.** `views/ring.js:183` builds join strings every frame while a face is shown. Trivial.

## Deferred minors triage

- **Must fix before merge:** Task 3, "columns 2.1 m wide on a 2.4 m tile". It is half of Important 1, so fix it with that.
- **Fine to leave:**
  - Task 1 and Task 2: test-only nits (keys-only check, redundant loops, the fwd copy, rock and tuft clearance). The code does keep rocks clear; only the tests don't check it.
  - Task 3: the dt re-clamp.
  - Task 4: `valid` not tying fields together; wrong-stone test on a fresh state only.
  - Task 5: the `LAMP_H` location, the unused imports, the missing RED for tallyYaw, the mis-indented line (`views/lanterns.js:92`).
  - Task 6: no test of the `applyState` owl baseline; a possible NaN on the card (the caller sanitises with `|0`); horizontal-only owl distance (no owl sits under walkable ground).

## Declined to judge

- **The ring prompt and floor glow show only while both walkers are inside.** The spec prescribes both.
- **The deal can be read in the joiner's `S`, and through `window.__lr` under ?debug or DEV.** The spec accepts the first. The second is a pre-existing debug handle that already exposed the Signal answer and the Marsh path.
- **The ?debug stand-in can hold a pillar line or the ring for one human, never falls, and P force-solves.** This is debug by design.
- **On welcome, `S` resets to `createAll` until the first `s` arrives,** so a walker who reconnects mid-pillar or on the steps falls. This pattern predates the branch (causeway, marsh). The partner's pillar drops on disconnect anyway.
- **Both faces show to everyone once the Ring is solved.** The spec is silent, and the answer no longer matters then.
- **A wrong stone can only be cleared by finishing a four.** This is the spec's "judged at four".
- **The solo-lantern test ignores the 1.5 m reach.** The spec names straight-line distances. Allowing for reach, about 155 m against 137.5 m at a run still leaves about 13% margin.
- **Logic runs on the host's frame loop, so timers depend on the host tab.** This predates the branch.
- **Load time of about 4 s.** No baseline to compare against.
- **The commit trailer names "Claude Fable 5.2".** The plan prescribes it.

## Assessment

**Ready to merge? With fixes.**

No stuck states, solo solves or answer leaks; the seams, sequence, validation and protocol are sound. Three fixes are needed first:
1. Count a walker on the standable side lip as on that pillar (and draw the cap that wide).
2. Move the owl buried in a Far Isle boulder.
3. Scramble the tally's niche order.

Each is a small change with a test.
