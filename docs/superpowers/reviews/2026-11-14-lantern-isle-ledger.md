# SDD ledger — plan: docs/superpowers/plans/2026-11-14-lantern-isle.md

Spec: docs/superpowers/specs/2026-11-14-lantern-isle-design.md. Branch: lantern-isle (from main at 1fc612d). Never push.

## Builder check (before the plan)
- Ring could be brute-forced one stone at a time with a passive partner -> Ruling: every touched stone lights, right or wrong; judged only at four; state is `touched[]` not a count — keeps "each knows half" honest without punishing slips — costs a little clarity if players expect per-stone feedback.
- Pillar "place" table, near landing vs checkpoint 8, per-browser falls, lantern solo = open path at RUN, owls may sit behind puzzles: all written into spec/plan.

## Pre-flight
| Tasks | Produces / consumes | Found |
| --- | --- | --- |
| 1 -> 3 | SITES.pillars, pillarAt, PILLAR_BITS, dyn.pillars | agree |
| 1 -> 3 (pilot) | path.js gridFor normalises dyn | plan lacked it -> added to Task 1 with path tests |
| 1 -> 4 | SITES.ring, ramp flag `ring`, dyn.ring | agree |
| 1 -> 5 | SITES.lanterns; T1 tests use literal 25 s, T5 uses BURN=25 | agree (15*RUN == 0.6*BURN*RUN) |
| 1 -> 6 | SITES.owls; T6 asserts pairs > 2.4 m apart | T1 did not guarantee -> added "every pair >= 10 m" to T1 |
| 1 -> 2 | zones K, L, T; sites to keep clear | agree |
| 3 -> 4 -> 5 | ORDER grows; ending moves each task; dynOf.ring false then real | agree; tests re-pointed in each task |
| 3 | protocol welcome.solved 0–11 while ORDER has 9 | harmless: checkpoints 9–11 exist from T1 |
| 5 | endShot moves to core/ending.js (pure) | agree with T3/T4 leaving game.js endShot alone |
| each task alone | tests named vs code named | T1 had one garbled test line (pillar edge) -> rewritten |

Ruling: commits happen per task on the feature branch (the owner chose subagent-driven builds before, and the Far Isle was built the same way) — nothing reaches main or GitHub without their say — costs nothing if wrong, the branch can be dropped.

## Tasks
Task 1: implemented (583e9c3..5fc43f0), in review. Concerns handled:
- Ruling: the pillars' landing is reachable before the Relay is solved (the climb is always walkable), so the pair could skip the Relay — Task 3 gates the pillars on S.relay.solved (nothing rises until the great brazier burns) — costs one extra argument to pillars.step; if wrong the walk could end with the Relay unsolved.
- Ruling: `near`/`far` discs are tight (must not overlap a pillar), so a walker stepping off a line's outer edge would be "nowhere" and drop their friend — Task 3's placeOf pads `near` by 1.5 m (after pillarAt) and "solved" is any walker on zone K or L, not the far disc — if wrong, a friend falls at the very start or end of a clean crossing.
Task 1: complete (commits 583e9c3..5fc43f0, review clean). Minors carried into Task 2's dispatch: scenery guards compare only the first 20 items (make them whole-output); tautological TRAIL assertion in layout.test.js; new TRAIL test samples vertices only; SITES.pillars.fwd shares the module's array; no test of sea clearance between the Lantern Isle and the first island.
Browser look (controller): island loads in ~4 s, landing/K/L/tor render; the tor is a plain drum -> Task 2 dresses it.
Task 2: complete (commits 5fc43f0..8723efb, review clean). Browser look (controller): wooded, tor reads as a crag, no console errors.
Minor (deferred): scenery test "placing them does not move the rest" checks keys only; `upTo.length > 1` adds nothing; per-vertex TRAIL loop now mostly redundant; no test pins the fwd copy; rocks/tufts not covered by the clearance tests.
(off-plan, owner request mid-build) 5d3b824: a riff on every solve replaces the chime — src/core/riff.js + tests/riff.test.js, audio.riff(n, last). Done by the controller, tested; not heard.
Task 3: implemented (8723efb..e754745). Review: 1 Important (raise rule needed both walkers to have a place; spec needs only the raiser's place + friend present), minors.
Task 3: fix round 1/5 (fix 502940c; re-review dispatched; controller read the fix diff: guard is now both-present, loop skips null places).
Task 3: minor (deferred): step re-clamps dt (harmless); columns 2.1 m wide on a 2.4 m tile so a walker at the very edge stands just past the cap.
Browser look (controller, Task 3): gated until relay solved (mask 0 at solved 7); abreast crossing holds y=12.45 on all 9; out of step -> fall -> checkpoint 8; stepping onto K -> solved 9, all 18 up, flash "The pillars stand"; no console errors.
Task 3: fix round 1/5 (3 addressed, 0 open; commits 5d3b824..502940c)
Task 3: complete (commits 8723efb..502940c, review clean)
Task 4: implemented (502940c..143048a). Review: approved, minors only. Controller's browser check: rules behave (alone: no prompt, no touch; three wrong stones light like right ones; fourth wrong clears; right order solves; steps rise; solved 10); both faces match the deal (orientation north-up, entrance at bottom) — but the avatar hid the bottom of each face.
Task 4: fix round 1/5 (faces raised 1.2 m, facePos extracted + tested; commit 02a612b; controller re-checked both faces in the browser: fully clear of the avatar, still match the deal; scoped re-review dispatched)
Task 4: minor (deferred): valid() does not tie solved/touched/order together (harmless); "wrong stone lights like a right one" test checks miss only on a fresh state.
Task 4: fix round 1/5 (2 addressed, 0 open; commits 143048a..02a612b)
Task 4: complete (commits 502940c..02a612b, review clean)
Task 5: implemented (02a612b..9b9c424). Review: 1 Important (tally faced checkpoint 9 not 10), minors. Controller's browser check: prompt, lighting, halo, tally niches follow t, six lit -> solved 11 -> ending + card; but the great lamp was pale and half behind the card.
Task 5: fix round 1/5 (tallyYaw() helper + test; great lamp 1.6x with a solid core; endShot look point puts the focus ~37.5% down the frame, tested; commit 843abae; controller re-checked in the browser: tally faces the steps, flame bold and clear of the card, islands behind; scoped re-review dispatched)
Task 5: minor (deferred): valid() does not tie solved to t; LAMP_H (a view/shot constant) lives in the rule module; unused import in lanterns.test.js; tallyYaw written before its test (no RED).
Task 5: fix round 1/5 (2 addressed, 0 open; commits 9b9c424..843abae)
Task 5: complete (commits 02a612b..843abae, review clean)
Task 5: minor (deferred): views/lanterns.js imports LAMP_H unused; one mis-indented line.
Task 6: complete (commits 843abae..a54349e, review clean). Controller's browser check: owl visible, found at <1.2 m, flash "An owl — 1 of 8", eyes glow; a transient vite 500 seen while the implementer was mid-edit, gone on reload.
Task 6: minor (deferred): no test for applyState's owl baseline/flash; showEnding would print NaN for a non-finite owls entry (caller sanitises); owl distance is horizontal only.
(off-plan) d49bd67 README; d1aa7bd dev-server-only ?handle (console handle on a real two-browser walk; absent from builds).
Two-browser run on the dev server (controller, real PeerJS link): both pilots walked J -> jetty -> landing; crossed all 9 pillars abreast, no falls, solved 9; each tab saw only its own seeing-stone face; chat carried the order; right four stones -> steps; lanterns split 4,3,2 / 5,0,1 lit in 20.4 s of 25 -> solved 11, card "Owls found 0 of 8". No console errors.
Ruling: lantern burn 25 s -> 28 s — with a piloted walker the pair needed 20.4 s, leaving under 5 s for an unsynchronised start; 28 s keeps the solo bound (straight-line 170 m vs 1.1*28*5.5 = 169.4 m; walked solo round is ~190 m = 34.5 s) — if wrong, the solo margin is thinner than the spec's 10% in practice (it is exactly at it).
Ruling: spec said "most" lanterns hidden from the steps; three of six are (as tested) — spec wording changed to "half" rather than moving posts — costs a little hide-and-seek if wrong.
Final review (opus): no Critical; 3 Important (pillar side margin = nowhere; owl 3 inside a boulder; tally in clockwise order); minors triaged. One fix wave dispatched with final-fixes.md.
Final: minor (deferred): pilot state gives exact lantern seconds (a player sees flame size); an owl's flash is dropped if it coincides with a solve (hoot still plays); 98 discs in heightAt, fine now; ring view builds strings per frame while a face shows.
Final: fix wave c4f2eae (all five items); scoped re-review: all ADDRESSED, no new breakage. Five owls moved (0-4 failed the new scenery-clearance test).
Ruling: after the fix wave both Far Isle owls stood 3 m from the two bells (found without looking) — one more small fix (574b4ae) moved owl 3 to H's south-east rim (107.75, -49.75); no spot on the Far Isle is both legal and well hidden (it is 3 m from checkpoint 6 and 2.3 m from the marsh edge, 6.4 m off the trail) — accepted: the Far Isle's two owls are the easy ones, the Lantern Isle's the hard ones — costs some hide-and-seek on the middle island if wrong.
Controller's browser checks after the fixes: side-edge walker stays up and holds the friend's pillars; caps 3 m wide and contiguous; unraised pillars under the water; tally niches scrambled (lanterns 0,1 -> first and last niche); owls 0, 2, 3 visible and clear of scenery; no failing requests.
(off-plan, owner request mid-build) Feedback button: src/core/feedback.js (pure, tested), src/ui/feedback.js, wired in main.js; opens GitHub's new-issue page with the note filled in; nothing is sent from the game. Checked in the browser with window.open intercepted.
