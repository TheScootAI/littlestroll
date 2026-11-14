# Far Isle — final review (base 10ef6ab = main, head 0595079 on `far-isle`)

Reviewed in one pass by one reviewer, no subagents. Read: the Far Isle spec, briefs 14–17, far-isle-rules.md, the whole final diff, the ledger from "## Far Isle", the four task reviews, the Task 16 fix diff and report, and the full current text of game.js, controller.js, session.js, protocol.js, reconnect.js, ticker.js, layout.js, terrain.js, sight.js, camera.js, pilot.js, path.js (grid part), hud.js, audio.js, puzzles/index.js.

Ran: `npm test` (22 files, 346 passed); a production build into a scratch directory (succeeds; `__lr` is not in it, the pilot chunk is); throwaway node scripts against the real modules (controller sprints, path finder, state fuzz, reconnect dip, path generator over 20 000 seeds, heightAt timing); and two short `?debug` sessions on port 5174 (stopped; the tree is clean; 5173 was never touched and still serves). Side effect to know about: starting Vite on 5174 re-optimised `node_modules/.vite` (cache only, same chunk hashes; 5173 still returns 200 for its modules).

**Verdict: ready to go live with three fixes. No Critical finding: I found nothing that strands the pair for good.**

---

## Strengths

- The rules modules (bells.js, marsh.js, relay.js) are small, pure and tested against the real layout and the real controller, not mocks. A 300-run random fuzz (teleporting walkers, absences, `dt` of 600 s and NaN) never produced a state the joiner's `validState` rejects.
- The ending moved cleanly: `S.ended` is set only by the last `ORDER` row (index.js:42), on host and joiner alike; nothing else freezes on beam-solved. I lit the great brazier in a browser: card, time and both scarves appear, the brazier sits above the card.
- The no-run rule lives in the single input merge (`readInput`, input.js), so keyboard, stand-in, pilot and the wire all obey it. Confirmed in the browser: `run` reads false while carrying.
- Isolation is tested with real floods (no Far Isle site without the causeway, nothing past H with no tile solid), and I could not beat it with the real controller either (see check 3).
- `lookDyn` is the right shape of fix: one named function that says "this only looks".

---

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix — all three before this goes live)

**I1. A session with one old-build browser and one new-build browser fails silently, because `PROTOCOL_V` was not bumped.**
- File: src/net/protocol.js:5 (`PROTOCOL_V = 1`, unchanged while the shape of `S`, the meaning of beam-solved and the welcome range all changed).
- Old host + new joiner: the new joiner's `validState` rejects every state the old host sends (no `bells`/`marsh`/`relay` slices — confirmed by script: `false`). The joiner's world never changes: the gate never opens for them. Stuck at puzzle 1 with no message; only restarting both recovers.
- New host + old joiner: plays 1–5 normally, then at the beacon the old joiner gets no ending and no causeway (its `heightAt` has none) while the host is told "A causeway rises from the sea". Stuck on the summit with no message until the joiner thinks to reload. An old joiner also rejects any welcome with `solved > 5`.
- Why it matters: the site is GitHub Pages; a tab left open from the last walk (both people have played before) or a 10-minute-cached index.html is exactly this case, on the day the owner tries the new puzzles.
- Fix: bump `PROTOCOL_V` to 2. Either mix then ends in 12 s at "Couldn't connect…" instead of 20 minutes in. Add "…or one of you has an older copy of the page: both refresh" to that line (src/game.js:162), since the code and the network are not the cause.

**I2. A walker who is not on the watch-stone can test each neighbouring tile for free: an unsafe slab visibly sinks 0.55 m while they still stand safely on the 0.3 m margin.**
- File: src/puzzles/views/marsh.js:170–174 (`over` is the cell from `marshTileAt`; `give = over.has(i) && !((dynMask >> i) & 1)`).
- Measured in the running game (watcher parked on the plate, me on safe tile 2, leaning 0.2 m past its edge, my y still 6.15, not falling): unsafe neighbours 3 and 1 dropped to y 5.61 / 5.60; safe neighbour 7 stayed at 6.13.
- Why it matters: this is the leak the Task 16 fix round was for, through a different channel. The walker creeps to an edge, watches whether the next slab dips, and backs off or goes on — no guidance, no deaths. A cautious walker will find it without looking for it, because the dip starts ~0.1 s before the fall. The Task 16 review filed it as Minor 1 ("already evident"); it is not evident to the walker until the slab shows them.
- Fix: sink a slab only under a walker who is actually unsupported: build `over` from walkers for whom `heightAt(p.x, p.z, { marsh: dynMask }) < MARSH_SURFACE - 0.1` (and the tile they are over). Add a test at the view-rule level if the decision is extracted, or at least a browser check: lean 0.2 m into an unsafe neighbour, assert it does not move.

**I3. In `?pilot` mode the walker's route finder reads the live marsh mask, so one `goTo` to the far shore walks the secret path.**
- File: src/debug/pilot.js:58–59 (`j.dyn = { ...game.dyn }` → `findPath`), with src/debug/path.js:57–59 carrying `marsh` into the grid.
- Measured in the running game (`?debug&pilot`, silent watcher on the plate, secret 4,9,8,7,12,11,10,15,20,25,26,27): `__pilot.goTo(126.5, -59.6)` returned `arrived: true` having walked tiles 4,9,8,7,12,11,10,15,20,25, and stood at the lever.
- Why it matters: the Task 16 fix report kept this as "debug only". It is not: the pilot chunk ships in the production build, and `?pilot&join=CODE` is how the owner walks with Claude — the session that prompted this addition. When the owner watches and Claude walks, the Marsh needs no guiding at all. It also breaks pilot.js's own contract ("does nothing a keyboard and mouse could not").
- Fix: plan and steer on `lookDyn(game.dyn)` until `S.marsh.solved` (then the real dyn: the path is visible to everyone). A straight `goTo` across then sinks like a human's would; tile-by-tile `goTo` under guidance still works. Add a path test: with a held mask and unsolved marsh, the pilot's planning dyn has every tile solid.

### Minor (Nice to Have)

1. **The ending card is clocked by clamped frame time — the cause of the controller's "card never appears".** src/game.js:453 clamps each update's `dt` to 0.1 s and src/game.js:510 adds it to `e.t`; the card shows at `e.t >= 4.4`, i.e. after at least 44 updates however long they take. Reproduced: with animation frames throttled to 1 per second, 20 s after lighting `ending.t` was 1.9, `shown` false, no card; at 40 s it would be 4.0 — camera exactly at its final shot, card still four frames away, which is what the controller saw. With frames restored the card appeared at once. At 60 fps (my first run) the card appears ~4.4 s after lighting. This is pre-existing (main has the same lines) and for real players it only bites below 10 fps, but the fix is two lines: stamp `performance.now()` in `beginEnding` and derive `e.t` from it. I could not see the controller's session, so this is the cause I can prove from the code and reproduce, not a certainty about their tab.
2. src/game.js:520–522: `e.shown = true` is set before `showEnding`, which reads `this.S.ended.time` at card time. A joiner whose reconnect `welcome` lands in the frame before the card (S is reset, `ended` null until the next `s`) throws there: the card never shows and the frame loop stops. A window of one message interval. Capture the time in `beginEnding`; set `shown` after the call.
3. src/puzzles/index.js:31: every puzzle's `dt` is clamped to 0.1 s per logic step, so a host that freezes for 5–8 s (short sleep, link survives) does not age the bell timers or burn the flame. The bells cannot ring themselves, but a joiner could ring one, run to the other during the freeze and have both count; a joiner carrying the flame keeps walking on a stopped clock. Needs the host's machine to stall at the right moment, so not a trick anyone can perform on demand. Bell timers could take the unclamped `dt`.
4. src/puzzles/views/relay.js:172/183/211: taking, passing and burn-out compile nothing (the small and carried lights swap, programs stayed at 24), but the lighting frame compiled 17 new programs (24 → 41; one 56 ms frame on this machine, more on a slower one) at the climax. A `renderer.compile` warm-up when the relay begins, or keeping those meshes and lights always in the scene, removes it.
5. README.md:3 still says five puzzles.
6. src/puzzles/views/marsh.js: 30 wash quads are drawn every frame at opacity 0 (set `wash.visible` with the rim); two `Set`s per frame (169–170).
7. During `reconnecting` the joiner's last `S` stays in force: a joiner who was carrying the flame cannot run for up to 30 s, and one standing on a held tile stays up. Harmless; listed so nobody is surprised.

---

## The six deliberate checks

**1. Regression in what shipped.** Puzzles 1–5: rules untouched except gate.js `through()` (same answer for every first-island zone). `heightAt` for first-island points is unchanged (the marsh rectangle, watch-stone and flagless Far Isle ramps are all 80+ m away; test "a dyn without the new keys reads exactly like one with their defaults" covers 800 samples). `zoneAt` now returns null in a 1 m × 4 m strip at F's east rim (the absent causeway's head) — the only `=== 'F'` user is the ladder post 17 m away. Reconnect logic: session.js untouched; welcome range widened; welcome resets the bell and relay sound baselines. `?pilot`: grid key extended; grid covers the Far Isle (x ≤ 156 of 160). Ending: moved, verified in a browser. Two cosmetic changes to the shipped island: its scenery is re-dealt (the sampling extent grew), and the trail tint now runs to the causeway head before the causeway exists. Mixed builds: **not graceful — I1.**

**2. Stranding.** None found.
- Mid-marsh, watcher (joiner) drops: host walker falls within a tick of the close (or keeps the tiles for up to 8 s on a silent link), respawns at checkpoint 6 on H; joiner reconnects in place on the plate.
- Mid-marsh, link drops with joiner walking: joiner's last `S` holds; on the welcome `S` is reset for one message interval — scripted: 0.07 s → 8 cm dip, 0.3 s → 0.95 m, 0.9 s → still recovers; over ~1 s → respawn on H. Same on the causeway (respawn at F).
- Mid-relay: carrier drops → flame home (relay.js:23); receiver drops → flame burns out, home.
- Respawns at checkpoints 5–8 with each puzzle half-done all land on dry ground from which the puzzle is reachable; all sea, the marsh pit and the summit moat are below DROWN_Y, so there is no dry pit.
- Watcher falls off the stone: lands on H (the stone is wholly over H), walks back up the ramp.
- Both on I with the lever unpulled: not reachable honestly, and the lever is on I anyway.
- Going back over the marsh or causeway after solving: both are permanent (`solved`, `beam.solved`).

**3. Solo and bypass.** None found. Real-controller sprints at run speed: from H onto the unwatched marsh, off the watch-stone, along both marsh sides, off F with no causeway, off G with no steps — all drown. A one-tile gap between solid areas is 1.8 m; a runner falls past STEP_UP after 1.17 m. Corner-touching margins only join consecutive-but-one path tiles (`pathOk` forbids the rest; 20 000 seeds all legal, 2 146 distinct paths). Bells are 28 m apart on foot against a 1.0 s window. Relay: 19.2 m per flame against 60.5 m, no upward shortcut (every leg is above I; the 1.5 m moat cannot be jumped: 0.74 m fall against 0.45 m step). Respawn never moves anyone forward of a solved puzzle; a reconnect keeps position; a fresh join spawns at `checkpoints[solved]`. Lever is 2.1 m from the nearest marsh point against a 1.5 m reach. The two real holes are information leaks, not bypasses: **I2, I3.**

**4. Fairness to the joiner.** Fine. A joiner's press and position travel in the same `p` snapshot, so their own position is never stale relative to their press. Bells: 0.1–0.25 s of lateness against 1.0 s; in the browser a 0.6 s gap solved. Hand-over: the only error is the carrier's movement since the joiner last saw them, under 0.5 m against 1.8 m. Marsh: the joiner walks on their own position; staleness matters only when the watcher steps on or off (≤ 0.3 s, in the walker's favour when stepping off).

**5. Long gap between logic steps.** Bells do not ring themselves: `dt` clamps to 0.1 (scripted: ring, one tick after "an hour", no solve without a second press). Flame: loses 0.1 s for the whole gap. Steps: advance by clamped logic `dt`, walkable only at 1. Causeway animation: frame-clocked, simply resumes. The clamp's side effect is Minor 3; the same clamp on the ending is Minor 1.

**6. Cost.** No sign of trouble on this machine; nothing structurally worrying.
- State: 636 bytes per `s` message (limit 16 384), ~9.5 kB/s.
- `heightAt`: 131 ns per call with 72 discs and 12 ramps; under 30 µs per frame.
- Mesh: sea cells are skipped, so the terrain grows by roughly a quarter. Per-frame triangles (shadow pass included): 148 k at spawn, 117–150 k on the Far Isle.
- Draw calls: 228 at spawn; 166–344 on the Far Isle; 477–568 in the ending shot.
- Lights: four more point lights, three live at once, in every lit fragment everywhere. This is the one cost I could not measure where it matters (see Declined).
- Frame time: a steady 16.7 ms throughout at 2× pixel ratio, worst frame 56 ms (Minor 4).

---

## Task 16 fix round (`lookDyn`) — verified

The fix closes the leak the Task 16 review described. In the running game, with a watcher on the plate, I aimed the Q pointer from checkpoint 6 at all 30 tile centres: the marker landed at y 6.21–6.24 on safe tiles and 6.15–6.25 on unsafe ones — no difference. The friend's pointer goes through the same function; the camera boom takes the same dyn. `(1 << 30) - 1` is a valid int32 and makes every point of the rectangle read MARSH_SURFACE. The three new tests are real (the second proves the raw dyn leaks).

Other channels checked and clean: glow and rim (local `seesPath` only; nothing glowed for me off the plate), slab colours/tilt/moss (fixed seed, independent of the path), prompts (depend on `held` only), sound (none per tile), pilot `state()` (no path), `window.__lr` (dev build only), edge behaviour (no resistance at an unsafe edge).

Channels still open: **I2** (sinking slab on the margin) and **I3** (pilot route finder). The fix report examined both call sites and kept them, on two wrong premises: that the sink bit is "the true footing under a walker" (not on the margin), and that the pilot is debug-only (it ships).

---

## Deferred minors — triage

Fix before live:
- Task 15 minor 7 (PROTOCOL_V) — this is I1.
- Task 16 minor 1 / Task 14 minor 4's "sink decision must use heightAt" — this is I2.

Rest stay deferred: T14 1–3, 5–8; T15 1–6, 8 (the causeway replay is harmless: a walker spawns 24 m from its head); T16 2–7 (the fallback path is legal — checked); T17 1–7 (T17 minor 3 is narrower than written: no recompile on take/pass/burn-out, only at the lighting — my Minor 4); the friend arrow over the prompt bubble.

## Rulings I disagree with

- Leaving the PROTOCOL_V bump as "a project call" (T15): it must be bumped (I1).
- Grading the margin sink as a Minor (T16): it is a free read of the path (I2).
- The fix round's "pilot … kept (debug only)": the pilot is a shipped play mode and the owner's own (I3).
- No disagreement with skipping a plan document or with folding the fix re-review into this one.

## Declined to judge

- How the bells, the pass and the roar sound: the audio context never ran in my pane.
- Frame rate on a weak integrated GPU: measured only on this Mac. Four extra point lights are the cost most likely to show there.
- A live two-browser PeerJS session: the mixed-build and reconnect conclusions come from the code and scripts, not from two real browsers.
- Looks: the Far Isle has no trees or grass tufts (terrain.js GREEN stops at F); the burn ring on slopes; the bell frames.
- The first island's re-dealt scenery and the trail tint to the causeway head: cosmetic changes to what shipped; the owner's call.
- A walker brute-forcing the marsh by trial and error with a silent watcher, and a pair walking the relay side by side passing every second: both allowed by the spec as written.
- A pilot on the watch-stone cannot read the path from `state()` and must look at the screen: the spec's choice.
- Tampered clients (the path is in every `s` message): out of scope for two friends.
- A host reload ending the walk: pre-existing.
- Whether the controller's missing card had a second cause beyond the frame-clocked ending: I could not see their session.

## Recommendations

- After the three fixes, re-run the two browser checks above (lean into an unsafe neighbour; pilot `goTo` across with a silent watcher) and expect: no slab moves; the pilot sinks.
- Add one line to the deploy habit: any change to the shape of `S` or `dyn` bumps `PROTOCOL_V`.
- Clock the ending by wall time (Minor 1) in the same fix wave; it is already on the list.

## Assessment

**Ready to merge? With fixes.**

**Reasoning:** The three puzzles are sound — I could not solo, bypass or strand any of them with the real controller, and reconnects recover everywhere. What stands between this and live is one silent failure for a stale page (a one-line version bump) and two remaining ways to read the marsh's secret without the watcher (a one-line view change and a one-line pilot change).
