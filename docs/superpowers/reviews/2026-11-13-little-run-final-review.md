# Final review: Little Run, whole build (0cad7a6..a0a377e)

Reviewer: final whole-build seat. Read-only on the project. Reviewed in passes by me alone: design, plan, ledger, Task 13 brief and report, then every file under `src/` at head, then the tests. `npm test`: 17 files, 200 tests, all pass.

Beyond reading, I ran these checks (scripts live in the session scratchpad, not the project):

- A drop search for the plank against the real `plank.js` and layout.
- A fall-and-press simulation for a carried mirror against the real `beam.js`, controller and layout.
- A two-carrier walk through the zigzag with each side seeing the other 0 to 150 ms late.
- A scan of 192,452 standing positions (and the lift deck at every height) for a one-mirror solution.
- Probes for each of the five Review Focus items.
- A short dev-server session in the Browser pane with `?debug` and `?debug&pilot`, to photograph the signal wall and to measure what pilot mode does in a pane that is not on screen. Server stopped and tab closed afterwards.

## Verdict

**Ready to hand over: No. With fixes.**

The build is well made and most of it holds up to adversarial checking. Seven things need fixing first: two ways to lose a puzzle part for good, one puzzle that one player can read alone (and is likely to by accident), one freeze in the plank carry, two defects that stop pilot mode doing what the owner asked for, and one deferred minor worth promoting. All seven are small, local changes.

## Strengths

- **The architecture is what the plan promised.** Rules are pure modules with no three.js and no network. Views only read `S`. One `ORDER` table drives solved count, prompts, validation and debug solve (`src/puzzles/index.js:14-21`). That is why I could run every hazard check from Node.
- **The network edge is tight.** `decode` rebuilds messages field by field with bounds (`protocol.js:19-45`), `accepts` gates by role and handshake state (`protocol.js:49-53`), and the joiner re-validates every `S` per puzzle before adopting it (`game.js:201-205`). My probes got nothing malformed through and nothing threw.
- **The clamp is in the right place.** `stepAll` clamps once for all puzzles, including NaN and negative `dt` (`index.js:26`).
- **Walk-out collision rule.** A walker already overlapping a blocker may always move away from it (`controller.js:22-30`). This is what makes a closing gate safe, and it is tested.
- **The beam cannot be soloed.** My own scan agrees with the Task 10 reviewer: no standing position anywhere, and no height on the lift, lights the lens with one mirror.
- **Rejoin is carefully done.** Press baselines reset when the friend leaves (`game.js:159-162`), the plank drops, the mirror is released, and `welcome.solved` puts the joiner at the right checkpoint.
- **Task 13 Part A is right.** Seen from behind, each slot is a framed tile with its pips inside the top-left corner, clearly belonging to its glyph. Slot order and the dial posts' pip counts agree (`views/signal.js:62-96`, `:119-122`).
- **`path.js` is clean.** A* with no corner cutting, a drop limit, string-pulling, and tests that re-walk every leg under the walker's own rule.

## Issues

### Critical (must fix)

**C1. A dropped plank can come to rest with an end inside a standing stone, out of reach for good.**
- File: `src/puzzles/plank.js:22-34` (`settle`), with `GRAB_R = 1.2` at `:8`.
- What: on any release, `settle` re-centres the plank at its full 4 m along its last direction. If the two carriers are closer than 4 m, each end is pushed out beyond its carrier. A walker can get no nearer a stone's centre than `r + PLAYER_R` = 1.4 m, and the grab reach is 1.2 m.
- Evidence: with one carrier against a stone and the other 0.9 to 1.5 m behind, a release left an end 1.23 to 1.38 m from the nearest standable ground in 369 of 1,258 sampled set-ups. In every one the line between the carriers was clear of all stones, so the carry veto allows it. Example: carriers at (6.87, 24.85) and (6.02, 24.00), release, end B rests at (5.03, 23.01), the centre of stone 0.
- Why it matters: only one end can then be picked up, a lone holder is rooted by design, and nothing resets the plank. The pair can never cross to the lift. "Bunched up against a stone, let's drop it and start again" is a natural thing to do. Walkers pass through each other, so bunching is easy.
- Fix: in `settle`, treat an end inside a stone like an end over water and send the plank back to its rest. A more general form: send it back whenever either end has no standable ground within `GRAB_R`. Add a test using the example above.

**C2. A mirror can be left over deep water, out of reach.**
- File: `src/puzzles/beam.js:113` (carrier left) and `:121` (set down).
- What: a mirror is put down at its carrier's x,z with no check on what is there. A walker who walks off the summit rim is over water for about 1.3 s before the respawn. Pressing E in that window, or the carrier's connection dropping in it, leaves the mirror there.
- Evidence: simulated with the real modules. Host carries mirror 0 west off the rim and presses E mid-fall. The mirror ends at (-15.63, -44) over sea floor at -4 m, 2.75 m from the nearest ground, against a reach of 1.2 m.
- Why it matters: the beam needs both mirrors, so the walk cannot be finished. It is rare, since it needs E during a fall. It is recoverable only by an unprompted trick: jump in after it and press E while falling past. The Task 10 review's "a walker can always stand within 1.2 m of it again" does not hold for this case.
- Fix: when a mirror is released where `heightAt(x, z) < DROWN_Y`, put it back on its stand (`SITES.beam.mirrors[i]`).

**C3 (Task 13). As the joiner, the pilot's presses, holds and aim never reach the host.**
- File: `src/game.js:152`.
- What: the network snapshot is built from `this.input.state`, the raw keyboard and mouse state. The pilot writes only to `input.forced`. Everything else in the game reads `readInput(this.input)`, which lays `forced` over `state`.
- Evidence: in the browser, after `press()`, `press()`, `hold(true)`, `point(true)`, `wave()` and `look(1, 0.5)`, the tab acts on `eN 2, hold true, q true, waveN 1, camYaw 1, camPitch 0.5`. The snapshot it would send carries `eN 0, hold false, q false, waveN 0, ay 0, ap -0.15`.
- Why it matters: `?pilot&join=CODE` is the mode the owner asked for. In it Claude can walk but cannot turn a dial, take a plank end, hold the crank, kick the ladder, pick up a mirror or aim it. The session cannot get past the Plank. The Task 13 browser check exercised only the Gate, which needs position alone.
- Fix: `s.send(snapshot(this.player, readInput(this.input), this.speed))`.

**C4 (Task 13). In a Browser pane that is not on screen, the pilot never moves and `goTo` never answers.**
- File: `src/game.js:148` and `:380` (both keyed on `document.hidden`), `src/debug/pilot.js:48-49` (timeout counted in ticks).
- What: the hidden-tab hook assumes a hidden tab reports `document.hidden`. The pane does not.
- Evidence: measured in the Browser pane while it was reported hidden. `document.hidden` was false, `visibilityState` was "visible", and `requestAnimationFrame` delivered 0 frames in 6 s. The worker ticker ran at 30 Hz (60 ticks in 2 s). `await __pilot.goTo(...)` with `timeoutMs: 4000` had not resolved after 6 s and the walker had not moved.
- Why it matters: this is the setting pilot mode exists for. The Task 13 report said the real hidden case was not observed and was simulated by overriding `document.hidden`. The brief's verification step was therefore not met, and the real behaviour is the opposite of the simulated one.
- Fix: record the time of the last animation frame. In the ticker, run `update(dt)` whenever the pilot is attached and no frame has run for about 150 ms. Drop the `document.hidden` tests. Time `goTo`'s timeout by wall clock so it always resolves.

### Important (should fix)

**I1. The Signal can be read by one player, and probably will be by accident: the camera goes through the wall.**
- File: `src/player/camera.js:33-50` (the boom avoids terrain only), `src/puzzles/views/signal.js:167` (tiles shown to everyone while lit).
- What: a walker in the dial zone with their back to the wall has the camera up to 1.9 m behind the wall's back face. The symbols are lit by that same walker's presence.
- Evidence: at (-12, 76) looking east the camera is at (-16.94, 6.07, 76), against a back face at x = -15.1. The screenshot shows the lit bottom-row tiles filling the screen: a ring and a triangle with four pips, matching `answer = [0, 1, 0, 1]`. The stand-in was on the beach at the time. Standing 0.8 m west of either west dial does the same.
- Why it matters: this is the design's first anti-goal, and the spec added the "glow only while someone is at the dials" rule specifically to prevent one player doing both jobs. A dialler who turns to face their dials from the wall side gets the answer on screen without trying. Task 12's solo attempt at the Signal checked only that the wall is blank from the lookout.
- Fix: in the view, show the tiles only when the local walker is behind the wall, for example `lit && ctx.players[ctx.localIdx].x < wall.x`. Stopping the camera boom at blocker segments also works. Add a test for whichever is chosen.

**I2. Carrying the plank, both carriers can freeze with no way out but dropping it.**
- File: `src/puzzles/plank.js:108-110`.
- What: the pair veto refuses any step whose new line to the partner touches a stone. If the line already touches one, every step is refused. Each browser checks against a partner position that is about 100 ms old, so two carriers moving at once can end with the true line inside a stone.
- Evidence: in my two-carrier simulation at 100 ms lag with loose spacing, 2 of 40 runs ended with neither carrier able to move in any of 16 directions. With tidy spacing (3.6 m apart) 40 of 40 runs got through at up to 150 ms lag, walking or running. The puzzle is fair; the hazard is the scrape.
- Why it matters: the prompt still reads "Carry it to the gap together" and nothing says to press E. It is the same shape as the lone-holder freeze fixed in Task 8, which that review flagged for the pair as well. Dropping to escape is also the route into C1.
- Fix: give the pair veto the escape the blockers have. If the current line already touches a stone, allow a step that does not bring the line closer to that stone's centre.

### Minor (nice to have)

1. `src/game.js:132`: the joiner is told "Your friend's walk has ended." on any drop, including a network blip or the host's 4 s silence watchdog, though the same code lets them back in. Suggest "Lost the connection. Rejoin with the same code."
2. `src/game.js:357`: the on-screen hint teaches look, walk and run. Q (point), F (shout) and 1 (wave) are never shown anywhere, and E only through prompts. The friend has not read the design.
3. `src/main.js:10-11`: `npm run build` ships the stand-in and pilot chunks, and `?debug` works in the built folder (solo play with P skipping puzzles). The design says the stand-in "never ships as a way to play". Gating `?debug` on `import.meta.env.DEV` is one line. `?pilot` is the owner's call. See Rulings.
4. `src/game.js:406`: `speed` is only recomputed in `update()`. If the host hides the tab mid-stride, the friend sees the host's legs walking on the spot until the host returns.
5. `src/puzzles/views/lift.js:125`: the joiner sees the deck, and their own ride, move in 15 Hz steps of about 8 cm. Easing the deck toward `s.y` in the view would smooth it.
6. `src/net/session.js:57-59`: a rejoin inside 2.5 s of the old connection's last message is told "already has two walkers" if the old channel has not yet closed. A human typing a code is slower; a reload of `?pilot&join=CODE` may not be.
7. `src/debug/path.js:137`: the final hop to `to` is taken without `lineOk` when nothing longer passes. A target in the sea within 0.75 m of land walks the pilot off the edge. A target inside a blocker, such as the beacon, gives `no-path`. Worth a line in `help()`.
8. `src/ui/hud.js:74-83`: a status with a button ("Back to menu") appears while the pointer is still locked, so the player must know to press Esc first. `beginEnding` already exits pointer lock; do the same here.
9. `tests/path.test.js:15-27`: `walkable` does not assert the 0.6 m drop limit the brief asks the path to respect.

## Review Focus: what I found

1. **Third browser.** Holds. `_incoming` (`session.js:56-65`) answers `full` once the newcomer's channel opens, closes it after 500 ms, and never touches `this.conn` or attaches data handlers. The joiner shows "This walk already has two walkers." Read from code; the Task 5 report records the in-browser check. The 2.5 s stale rule that lets a rejoining partner displace a dead connection is correct.
2. **Malformed messages.** Holds. 23 hostile inputs (wrong types, 1e999, fractional counters, arrays, non-strings, over-length, a `__proto__` key): none accepted, none threw. 7 malformed `S` objects all rejected by `validState`. The host acts on nothing but `p` after the handshake.
3. **Codes.** Holds. Lower case and inner whitespace are normalised. Wrong length, digits, look-alike letters, accents, punctuation and non-strings return null. The menu shows its message and makes no connection (`menu.js:51-55`). `?pilot&join=` uses the same function.
4. **Parts changing under a walker.** Holds. A rider on a deck cycled up and down at network rate was never below the deck (0.000 m). A walker standing on the door line when it shuts can leave either way. A walker standing where the ladder appears is lifted onto it, not buried. The related problem is not the walker but the parts: see C1 and C2.
5. **Long gap.** Holds. One 86,400 s step moves the lift 0.025 and charges the beam 0.1 s, with no solve and no ending. NaN, infinite, negative and string `dt` leave the state valid.

## What matters most to the players: what I found

- **Can two people finish?** Yes on the designed path, with the two part-loss cases above (C1, C2). I found no way for a walker to be stuck for good. Every fall is either walkable back or a respawn, and checkpoints are clear of blockers.
- **Solo by any trick.** Gate, Plank, Lift and Beam: none found. Signal: I1.
- **Difficulty is the controls.** The zigzag is passable with margin when the carriers keep sensible spacing. The freeze (I2) is the one place the controls, not the co-operation, stop play.
- **Host and joiner asymmetry.** No joiner-only defect in a human session. The joiner's plank veto, prompts, respawn and ending all work from received state. The one asymmetric bug is C3, which only pilot mode hits. Note the gap in evidence: the joiner side of puzzles 2 to 5 has never run in two real browsers. Task 12 covered the Gate, and the stand-in runs inside the host with no delay.
- **Disconnect and rejoin mid-puzzle.** Plank end: dropped and settled, subject to C1. Mirror: released where last carried, subject to C2. Crank: lift sinks. All solved puzzles survive.
- **Debug affordances.** Without the flags, `window.__lr` and `window.__pilot` do not exist, no stand-in or pilot code is loaded, and T/Y/U/I/O/P are unbound. Both flags work in the production build (Minor 3).

## Task 13: spec compliance

- Part A: compliant. Checked in the browser from behind the wall.
- Part B, met: flag-only and dynamically imported; `join=` handling; input-fields-only driving; the badge; `path.js` and its tests; the `state()` shape with no answer; `goTo`, `follow`, `stop` and the rest; `help()`; nothing throws.
- Part B, not met: "works in a real session as host or joiner" (C3), and the hidden-tab rule together with its verification step (C4).

## Deferred minors: triage

Fix now:
- **Task 4, `lockFailed` sticky** (`src/player/input.js:76`, `:96-97`, `:109`). One refused pointer lock leaves mouse-look on click-and-drag for the rest of the walk. Browsers refuse a re-lock for about a second after Esc, so clicking back in quickly triggers it. The host cannot reload without ending the walk. Retry the lock on every click instead of latching the failure.
- **Task 8 review's "end may be out of reach" note** is the stone case of C1. Fix with C1.

Cheap enough to do in the same wave, not blocking:
- Task 10: add `expect(S.beam.charge).toBeCloseTo(0.1)` to the clamp test. As written it would still pass if `stepAll` skipped the beam.

Everything else in the ledger's deferred lines can stay deferred. Two notes:
- Task 7's pip-placement minor is closed by Task 13 Part A.
- Task 11: nobody has listened to the sound. The owner must.

## Rulings

I agree with every ruling except the framing of one.

- **Task 13 without a task review.** The ruling priced the risk as "a pilot-mode defect is found one step later", and that is what happened, so it worked as designed. I disagree with calling it a dev-only feature: it is the owner's stated way to play. I also disagree with accepting DONE_WITH_CONCERNS where the brief's own hidden-tab check had been replaced by a simulation. That check was the one that would have found C4.
- **Task 8 lone-holder amendment.** Right, and it should now be extended to the pair (I2).
- **Minor 3 needs an owner ruling.** The plan reads "never ships as a way to play" as "needs the flag". The built folder contains a solo mode for anyone who knows the flag.

## Declined to judge

- Sound: not heard by anyone, and it cannot be judged by reading.
- Whether a walk takes 20 to 30 minutes, and whether the plank and beam tolerances feel right to two people. My simulation shows the zigzag is steerable, not that it is pleasant.
- Whether the look reads as a copy of Big Walk. I did not compare against that game. The code contains only its own names and shapes built in code, and no imported art.
- Real-network behaviour: the connection-failure message on a blocking home network, broker outages, relay use.
- Browsers other than the Chromium pane (pointer lock and Worker behaviour in Safari and Firefox).
- Whether `?pilot` should exist in the built folder. The owner asked for the mode; where it ships is theirs to decide.
- Review Focus 1 in a live browser. I verified it by reading and relied on the Task 5 report's run.

## Recommendations

- Land C1, C2, I1 and I2 each with a test. All four are pure-module changes and the test set-ups are in this report.
- After C3 and C4, re-run the Task 13 verification with the pane actually off screen. Then play one whole walk in two real browsers before the owner's friend joins, since the joiner side of puzzles 2 to 5 is so far covered by reading only.

## Assessment

**Ready to hand over: With fixes.**

The core game is sound and its five named failure modes all hold. It should not go to its owner while a dropped plank or mirror can end a walk, while the Signal shows its answer to the dialler's camera, or while pilot mode cannot press E as the joiner or move in a pane that is off screen.
