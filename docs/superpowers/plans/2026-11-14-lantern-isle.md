# The Lantern Isle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third island with three new co-operative puzzles (The Pillars, The Ring, The Lanterns) and eight hidden owls to Little Run.

**Architecture:** Same as the first two islands. Pure modules (`src/world/layout.js`, `src/puzzles/<name>.js`) hold geometry and rules with no three.js or DOM; thin three.js views in `src/puzzles/views/` only read state; the host steps all puzzle state `S` and sends it whole; `src/puzzles/index.js` is the one place puzzles are listed.

**Tech Stack:** Plain JavaScript ES modules, three.js 0.187, Vite 8, Vitest 5 (node environment, no DOM in tests), PeerJS.

**Spec:** `docs/superpowers/specs/2026-11-14-lantern-isle-design.md` (it adds to `2026-11-13-far-isle-design.md` and `2026-11-13-little-run-design.md`).

## Global Constraints

- Work on branch `lantern-isle`. Commit at the end of your task with a short plain message ending in the line `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Never push, never touch `main`, never change git config.
- No absolute home paths, usernames or e-mail addresses in any committed file.
- No new dependencies. Pure modules stay pure: no `three`, no `document`/`window` in `src/world/layout.js`, `src/puzzles/*.js`, `src/core/*.js`, `src/net/protocol.js`.
- **Prompts teach controls only.** The only new prompt strings are exactly `E — touch the stone` and `E — light the lantern` (em dash, as in the existing prompts). The Pillars has no prompt. No other new on-screen text except the flash lines and the ending-card line named in this plan. Nothing on screen may explain how a puzzle is solved.
- The first eight puzzles' rules and positions do not change. Every existing test keeps passing unless this plan says to change it. The scenery already placed on the first island (`tests/helpers/scenery-island1.json`) and on the Far Isle must not move.
- Test-first for every pure function: write the test, run it, see it fail for the right reason, then write the code. Put the RED and GREEN runs in your report. `npm test` must pass in full and `npm run build` must succeed before you commit.
- Follow the code style you find: small modules with a header comment that states the rule, terse code, comments only where a rule is not obvious. Read the Far Isle equivalent of what you are building before you write (named in each task).
- Views never write to `S`. A view is `createView(scene) -> { sync(slice, ctx, dt) }` with `ctx = { players: [host, joiner], localIdx, dyn }`.
- A puzzle module exports `create`, `step(s, players, dt)`, `prompt(s, idx, players)`, `valid(s)`, `forceSolve(s)`. `players[i]` is `{ present, x, y, z, aim, hold, pressed }`; `pressed` is true for one tick per E press. Always check `present`.
- Exact values from the spec: 9 pillars per line, pillar grace 0.4 s, 8 standing stones, 4 in the order, seeing stones ≥ 30 m apart, 6 lanterns, burn 25 s, 8 owls (3 / 2 / 3 by island), owl found within 1.2 m, owls ≥ 6 m from the trail.

## Review Focus

Things the spec implies that are easy to miss; each has a test in the task named.

1. A garbled or hostile `S` from the host must be rejected, not adopted: every new slice's `valid` rejects wrong lengths, non-finite numbers, repeated signs, out-of-range indices and masks. (Tasks 3, 4, 5, 6)
2. A walker who leaves (`present: false`) mid-puzzle: the other's pillar drops, ring touches stop counting, lanterns keep burning down, nothing is stuck and nothing throws. (Tasks 3, 4, 5)
3. A joiner who reconnects with `solved` 9, 10 or 11 respawns on ground that is solid in the world state that count implies. (Task 1: checkpoints; Task 3: `welcome.solved` range)
4. The walk must not end at The Relay any more, and must end exactly once, at The Lanterns. (Tasks 3 and 5)
5. Nothing on the first two islands moves or becomes reachable early: reachability of every existing site in every existing world state is unchanged, and both scenery fixtures are unchanged. (Tasks 1 and 2)

---

### Task 1: Layout for the Lantern Isle

Pure geometry only: the island, the pillar lines, every new site, and the bigger world grid. No rules, no views. Read first: `src/world/layout.js` in full (the marsh is the model for the pillar lines), `tests/layout.test.js` (style of the property tests), `tests/helpers/reach.js`, and the spec.

**Files:**
- Modify: `src/world/layout.js`
- Modify: `tests/helpers/reach.js`, `src/debug/path.js` (grid bounds only)
- Create: `tests/layout-lantern.test.js`
- Create: `tests/helpers/scenery-island2.json` and one test in `tests/scenery.test.js`
- Modify (only if needed to keep tests and the build green): `src/world/terrain.js`, `tests/layout.test.js`, `tests/path.test.js`

**Interfaces:**
- Consumes: everything `layout.js` exports today.
- Produces (later tasks use these names exactly):
  - `DYN_NONE` gains `pillars: 0, ring: false`.
  - `export const PILLAR_SURFACE` — deck height of a raised pillar, within `STEP_UP` of both J's north landing and K.
  - `export function pillarAt(x, z) -> { line: 0 | 1, r: 0..8 } | null` — which pillar a point is over, no margin.
  - `export function pillarCentre(line, r) -> [x, z]`.
  - `export const PILLAR_BITS = 18`; bit `line * 9 + r` of `dyn.pillars` set = that pillar is raised.
  - `SITES.pillars = { n: 9, tile, edge: 0.3, lines: [{ origin: [x, z] }, { origin: [x, z] }], fwd: [fx, fz], near: { x, z, r }, far: { x, z, r } }` — `near` is a disc on J's north landing that takes in the ground before both lines' first pillars; `far` a disc on K that takes in the ground past both lines' last pillars (a walker stepping off pillar 8 of either line is inside it within 1 m); neither overlaps a pillar, and neither slot of checkpoint 8 is inside `near`.
  - `SITES.ring = { centre: [x, z], r, stones: [[x, z] × 8], entrance: [x, z], seeing: [{ stone: [x, z], spot: { x, z, r: 1.5 }, yaw }, × 2], steps: seg }` — `r` is the radius of "inside the ring"; `stones[0]` is the first stone clockwise from the entrance seen from above; `seeing[i].yaw` is the way the stone's face points (toward its spot), same yaw convention as `SITES.signal.wall`.
  - `SITES.lanterns = { posts: [[x, z] × 6], tally: [x, z], lamp: [x, z] }` — `lamp` is on top of the tor.
  - `SITES.owls = [[x, z] × 8]` — indices 0–2 first island, 3–4 Far Isle, 5–7 Lantern Isle.
  - `SITES.checkpoints[9]`, `[10]`, `[11]` — two slots each, on K, on L at the head of the steps, on L.
  - A ramp K → L with flag `ring`; `TRAIL` continued from J over the pillars (down the middle between the two lines is fine for a line on a map), through the ring, up the steps and to the tally stone.
  - New zone letters `K` (landing), `L` (interior), `T` (the tor: higher than L by at least 6 m, reachable from nowhere). J gains a north landing at J's height.
  - `blockers()` circles gain the eight standing stones, the two seeing stones, the six lantern posts and the tally stone.

**Decisions already made (do not reopen):**
- The island lies north of the Far Isle (smaller z). The pillar lines run north from J's north landing. Grow the grid in `tests/helpers/reach.js` and `src/debug/path.js` (same bounds in both) so it covers every zone disc with at least 5 m to spare; keep it square and keep `STEP` 0.5.
- Pillar ground works exactly like the marsh: over each line's rectangle the ground is the sea floor except within `edge` of a pillar whose bit is set, where it is `PILLAR_SURFACE`; `zoneAt` is `null` there. The two lines' rectangles are at least 4 m apart.
- Heights: K a little above `PILLAR_SURFACE`; L 3 m above K (the steps are a ramp like the bells' steps); the tor well above L.
- `lookDyn` is not changed: nothing about the pillars is hidden.
- `src/debug/path.js` builds its grid from a normalised copy of `dyn` (`gridFor`): add `pillars` and `ring` there, or the pilot will plan as if they were never set. Add to `tests/path.test.js`: `findPath` from `near` to `far` finds a route with all 18 bits set and none with 0; and from checkpoint 9 to checkpoint 10 only with `ring: true`.
- Put the lantern posts round the tor so that the two distance tests below pass with burn = 25 s and `RUN` from `src/config.js`. Shape L with coves and spurs; it should not be a plain disc.

- [ ] **Step 1: Freeze the Far Isle's scenery.** Before changing anything, write `placeFarScenery()`'s output to `tests/helpers/scenery-island2.json` (same form as `scenery-island1.json`; see how `tests/scenery.test.js` uses that one) and add a test that it is unchanged. Run it: PASS. This is the one test that passes at once; it guards the rest of the task.

- [ ] **Step 2: Write `tests/layout-lantern.test.js`, failing.** One `test` per line below, using `reachable` / `walkDistance` from `tests/helpers/reach.js`. `FAR` = every flag of the first eight puzzles set and the marsh mask full; `full` = all 18 pillar bits.
  - grid: every `ZONES` disc lies at least 5 m inside the grid of `reach.js`, and `src/debug/path.js` uses the same bounds.
  - `DYN_NONE.pillars === 0` and `DYN_NONE.ring === false`.
  - with `FAR`: from checkpoint 8, `SITES.pillars.near` is reachable; `SITES.pillars.far`, the ring centre and every lantern post are not.
  - with `FAR` + `pillars: full`: `far`, the ring centre, a point 1 m short of each standing stone, both seeing spots and checkpoint 9 are reachable; no lantern post, nor the tally, nor checkpoint 10 is.
  - with `FAR` + `pillars: full` + `ring: true`: a point within 1.4 m of every lantern post, the tally and checkpoints 10 and 11 are reachable; `SITES.lanterns.lamp` is not.
  - a single line fully raised (bits 0–8 only, then 9–17 only) joins `near` to `far`; with only pillars 0–3 of both lines raised `far` is not reachable.
  - `heightAt(pillarCentre(l, r), D({ pillars: 1 << (l * 9 + r) })) === PILLAR_SURFACE`, sea floor with the bit clear, for all 18; with the bit set the ground is still `PILLAR_SURFACE` 0.25 m outside the pillar's square and is sea floor 0.4 m outside it (on the side facing away from the line's other pillars).
  - `pillarAt(...pillarCentre(l, r))` round-trips for all 18; `pillarAt` is `null` on `near`, on `far` and midway between the two lines; `zoneAt` is `null` over a pillar.
  - `near` and `far`: the point 0.5 m before pillar 0 of each line is inside `near`, the point 0.8 m past pillar 8 of each line is inside `far`; neither slot of checkpoint 8 is inside `near`; no pillar centre is inside either.
  - the two lines are at least 4 m apart at every pillar, and no point of one line's rectangle is within 3 m of the other's.
  - stepping `near` → pillar 0 → … → pillar 8 → `far` never rises more than `STEP_UP` (sample the ground every 0.25 m along each line's centre with all bits set).
  - ring: eight stones evenly spaced on a circle of radius 5–7 m about `centre`; `SITES.ring.r` ≥ that radius + 2; the entrance lies on the circle's rim direction between `stones[7]` and `stones[0]`; all of it on zone K.
  - seeing stones: the two spots are ≥ 30 m apart; each is ≥ 15 m from the ring centre and outside `SITES.ring.r`; each spot is level ground on K; each stone is 1.5–2.5 m from its spot and `yaw` points from the stone to the spot (within 0.1 rad).
  - lanterns, one walker: over all 720 orders of the six posts, the shortest straight-line path is ≥ `1.1 * 25 * RUN` metres.
  - lanterns, two walkers: there is a split of the six posts into two shares such that each share has an order whose walked length (`walkDistance`, first post to last, with `FAR` + full + ring) is ≤ `15 * RUN` metres.
  - lanterns, hidden: for at least three posts the straight line from checkpoint 10 to the post crosses a zone-`T` disc.
  - owls: eight; each ≥ 6 m from every `TRAIL` segment; each reachable with everything solved; each on level ground (the eight points 1 m around it are within 0.2 m of its height); each ≥ 3 m from every puzzle anchor and blocker; owls 0–2 on zones A–F, 3–4 on G–J, 5–7 on K or L; every pair of owls is at least 10 m apart.
  - checkpoints 9–11: both slots ≥ 1 m apart, on K / L / L, level, and reachable in the world state their number implies.
  - `TRAIL`: every vertex after J's is within 0.5 m of walkable ground with everything solved, and consecutive vertices are ≤ 45 m apart.
  - the first two islands: with `FAR`, every checkpoint 0–8 and every existing site is exactly as reachable as before (assert the ones `tests/layout.test.js` already asserts for the last world state still hold when `pillars` and `ring` are added as 0 / false).

  Run: `npx vitest run tests/layout-lantern.test.js` — Expected: FAIL (missing exports / sites).

- [ ] **Step 3: Build the geometry in `src/world/layout.js`** until every test in the new file passes. Update the header comment's world model with a Lantern Isle paragraph in the style of the Far Isle one. Grow the grids.

- [ ] **Step 4: Run the whole suite.** `npm test` — Expected: all pass, including `scenery-island1.json` and `scenery-island2.json` unchanged. If a terrain or path test fails only because the world is bigger, fix the smallest thing and say so in your report. `npm run build` — Expected: success.

- [ ] **Step 5: Commit** — `Lantern Isle: layout for a third island, the pillar lines and the new sites`.

---

### Task 2: Ground and scenery for the Lantern Isle

What the island looks like before any puzzle is drawn: its terrain colours, sea, and trees, rocks and tufts from its own seeded stream. Read first: `src/world/terrain.js` in full (the Far Isle's `placeFarScenery` is the model) and `tests/scenery.test.js`.

**Files:**
- Modify: `src/world/terrain.js`, `tests/scenery.test.js`, `tests/terrain-mesh.test.js` (if needed)

**Interfaces:**
- Consumes: Task 1's zones `K`, `L`, `T`, `SITES.ring`, `SITES.lanterns`, `SITES.owls`, `SITES.pillars`, `TRAIL`.
- Produces: `export function placeLanternScenery(seed = 20261115) -> { trees, boulders, tufts }` (same shape as `placeFarScenery`), drawn by `buildScenery`.

- [ ] **Step 1: Failing tests in `tests/scenery.test.js`:** `placeLanternScenery()` is deterministic; every item is on zone K or L, on level ground; no tree or boulder within 2.5 m of a standing stone, seeing stone or its spot, lantern post, the tally, an owl, a checkpoint slot, or within 2 m of the steps and of `TRAIL`; none inside `SITES.ring.r`; L carries at least 25 trees (it should feel wooded enough to hide a lantern); `placeScenery()` and `placeFarScenery()` still equal their fixtures.
  Run: `npx vitest run tests/scenery.test.js` — Expected: FAIL (`placeLanternScenery` is not exported).
- [ ] **Step 2: Implement** `placeLanternScenery` from its own `mulberry32` stream and draw it. Give K, L and the tor ground colours that sit with the existing palette (the tor reads as bare rock). Make sure the terrain mesh, the sea and the fog reach the new island (`terrainExtent` already follows `ZONES`; check the sea plane and the shadow box are not sized for the old extent).
- [ ] **Step 3:** `npm test` — all pass. `npm run build` — success.
- [ ] **Step 4: Commit** — `Lantern Isle: ground and scenery`.

In your report, list what should be looked at in a browser (you cannot see it): the controller will.

---

### Task 3: The Pillars

Read first: the spec's section 9, `src/puzzles/marsh.js` + `tests/marsh.test.js` (a mask of solid tiles driven by where walkers stand), `src/puzzles/views/marsh.js`, `src/puzzles/index.js`, and how `src/game.js` wires views, sounds and the pilot (`src/debug/pilot.js` `state()`).

**Files:**
- Create: `src/puzzles/pillars.js`, `tests/pillars.test.js`, `src/puzzles/views/pillars.js`
- Modify: `src/puzzles/index.js`, `src/net/protocol.js`, `src/game.js`, `src/debug/pilot.js`, `src/audio.js`, `tests/puzzles.test.js`, `tests/protocol.test.js`

**Interfaces:**
- Consumes: `SITES.pillars`, `pillarAt`, `PILLAR_BITS` from Task 1.
- Produces:
  - `export const LINGER = 0.4;`
  - `export const create = () => ({ t: Array(18).fill(0), solved: false })` — `t[bit]` = seconds that pillar stays raised.
  - `export function placeOf(p) -> { line: 0 | 1 | null, r: number } | null` — `{ line: null, r: -1 }` on the near landing, `{ line, r }` on a pillar, `null` anywhere else or when not present.
  - `export function step(s, players, dt)`, `export const maskOf = (s) => number`, `export const prompt = () => null`, `export const valid`, `export function forceSolve(s)`.
  - `index.js`: `pillars` row appended to `ORDER` with `done: 'The pillars stand'`; `dynOf` gains `pillars: pillars.maskOf(S.pillars)` and `ring: false` (Task 4 replaces the `false`).
  - `protocol.js`: `PROTOCOL_V = 5`; `welcome.solved` accepts 0–11.

**Rules (the spec is the authority):**
- For each walker `i` whose place is not `null`: on the near landing they raise pillar 0 of **both** lines; on pillar `q` of line `m` they raise pillars `q − 1`, `q`, `q + 1` (those that exist) of line `1 − m`. A walker's place never raises anything for themselves: the bits a walker sets are the other line's, or pillar 0 when on the landing. With one walker present nothing is ever raised (the raising walker must have a present *other* walker; test it).
- Each tick: every raised bit gets `t = LINGER`; every other `t` falls by `dt`, not below 0. `maskOf` = bits with `t > 0`, or all 18 once solved.
- Solved the moment any present walker is inside `SITES.pillars.far`. Solved is for good.

- [ ] **Step 1: `tests/pillars.test.js`, failing.** Tests: one walker on the near landing, any number of ticks → mask 0; two walkers on the landing → exactly pillar 0 of both lines; A on line 0 pillar 3 and B on line 1 pillar 3 → line 0 has 2–4 and line 1 has 2–4; A on pillar 0, B on the landing → A's line has pillar 0 only, B's line has 0 and 1; both on the same line → the other line is raised, their own is not; a pillar outlives its cause by `LINGER` and no longer (step 0.3 s: still raised; 0.5 s: down); B leaves (`present: false`) → A's pillar is down after `LINGER`; a walker inside `far` → solved, mask all 18, and it stays solved when everyone leaves; a full abreast crossing driven tick by tick keeps both walkers' pillars raised at every step; a walker can never be standing on a raised pillar two ahead of the other (for every pair of places with `|q1 − q2| ≥ 2` the leader's bit is clear after `LINGER`); `placeOf` for landing, pillar, elsewhere, absent; `valid` accepts `create()` and a JSON round-trip, rejects wrong length, a negative, `LINGER + 1`, `NaN`, a non-boolean `solved`; `forceSolve` → solved and mask all 18; a huge `dt` is clamped like the other puzzles (see `MAX_DT`).
  Run: `npx vitest run tests/pillars.test.js` — Expected: FAIL (module not found).
- [ ] **Step 2: Implement `src/puzzles/pillars.js`.** GREEN.
- [ ] **Step 3: Wire it in, tests first.** In `tests/puzzles.test.js` and `tests/protocol.test.js`: `forceSolved(S, 8)` no longer ends the walk and `forceSolved(S, 9)` does (Task 5 moves it again); `solvedCount` reaches 9; `dynOf(createAll(seed))` deep-equals `DYN_NONE`; `validState` rejects a bad `pillars` slice; `PROTOCOL_V` is 5; `welcome` decodes with `solved` 0, 9, 11 and is rejected with 12. See them fail, then change `index.js` and `protocol.js`.
- [ ] **Step 4: The view, `src/puzzles/views/pillars.js`.** Eighteen stone columns standing in the sea from the sea floor, square, a little narrower than the tile so the lines read as separate stones. A column's top rests about 2.2 m below `PILLAR_SURFACE`; while its bit is set in `ctx.dyn.pillars` it rises to the deck level in about 0.3 s and sinks at the same speed when cleared. A raised column has a lighter cap. The top of a raised column must sit exactly at `PILLAR_SURFACE` (no gap under a walker's feet, no z-fighting with the terrain mesh: the terrain has no ground there). Add it to `game.js`'s `views` with key `pillars`.
- [ ] **Step 5: Sound and pilot.** `audio.thud()`: one soft low knock (use the existing `tone` helper, wrapped in `safe`, counted in `audio.calls.thud`), played from `game.applyState` when a bit of the mask newly sets, at most once per 0.15 s. `pilot.state().puzzles.pillars = { mask, solved }` and one `help()` line: `pillars: mask bit line*9+r = raised`.
- [ ] **Step 6:** `npm test`, `npm run build` — all pass.
- [ ] **Step 7: Commit** — `Lantern Isle: The Pillars`.

---

### Task 4: The Ring

Read first: the spec's section 10, `src/puzzles/signal.js` and `src/puzzles/views/signal.js` (seeded deal, symbol textures, a face only some walkers see), `src/puzzles/marsh.js` `seesPath`, `src/puzzles/bells.js` + `views/bells.js` (rising steps).

**Files:**
- Create: `src/puzzles/ring.js`, `tests/ring.test.js`, `src/puzzles/views/ring.js`, `src/puzzles/views/signs.js`
- Modify: `src/puzzles/views/signal.js` (only to import its symbol textures from `signs.js`; its look must not change), `src/puzzles/index.js`, `src/game.js`, `src/debug/pilot.js`, `src/audio.js`, `tests/puzzles.test.js`

**Interfaces:**
- Consumes: `SITES.ring` from Task 1; `rng` from `src/core/math.js`.
- Produces:
  - `export const STONES = 8, LEN = 4, REACH = 1.5;`
  - `export function deal(seed) -> { signs: number[8], order: number[4] }` — `signs[i]` is the sign (0–7, all different) carved for stone `i`; `order` is four different stone indices, first to last. Seeded so it does not repeat the Signal's or the Marsh's stream for the same seed (offset the seed).
  - `export const create = (seed = 0) => ({ ...deal(seed), touched: [], miss: 999, steps: 0, solved: false })` — `touched` = the stones lit so far, in the order they were touched (0–4 different stone indices); `miss` = seconds since the ring last judged four wrong (capped 999).
  - `export const inside = (p) => boolean`, `export const bothInside = (players) => boolean`, `export const atSpot = (p, i) => boolean`.
  - `export function seesFace(s, face, players, idx) -> boolean` — face 0 is the order, face 1 the picture of the ring. True when `s.solved`, or when `players[idx]` is at spot `face` and `players[1 - idx]` is at spot `1 - face`.
  - `step`, `prompt`, `valid`, `forceSolve`.
  - `index.js`: `ring` row with `done: 'The steps rise again'`; `dynOf.ring = S.ring.steps >= 1`.
  - `src/puzzles/views/signs.js`: `export const SIGN_COUNT = 8; export function signTexture(i) -> CanvasTexture` — the Signal's six symbols unchanged as 0–5, plus two new ones (6 and 7) that are bold and unlike the others at 15 m: suggest a five-point star and a spiral.

**Rules (the spec is the authority):**
- A press by a present walker within `REACH` of the nearest standing stone is a touch on that stone. It counts only if `bothInside(players)`. Presses are taken in walker order (host first).
- A counting touch on a stone not in `touched` appends it, **right or wrong** — the ring gives nothing away one stone at a time. On a stone already in `touched` → nothing.
- When `touched.length === LEN`: if it equals `order` element for element → solved (and `touched` stays, so the four stay lit); otherwise `touched = []` and `miss = 0`. Nothing is re-dealt.
- `touched` is kept when a walker steps out of the ring or leaves; touches just stop counting.
- Once solved, `steps` rises from 0 to 1 over 2.5 s.
- `prompt`: `'E — touch the stone'` when not solved, the walker is within `REACH` of a stone and `bothInside(players)`; otherwise `null`.

- [ ] **Step 1: `tests/ring.test.js`, failing.** Tests: `deal` is deterministic; `signs` is a permutation of 0–7 and `order` four different indices 0–7 for seeds 0–199; at least 150 different deals among those seeds; one walker alone touching every stone in the right order → `touched` stays empty; two walkers but one outside the ring → nothing counts; both inside, the right four in order → solved, `touched` equals `order`, and `steps` reaches 1 after 2.5 s and `dynOf(S).ring` turns true only then; a wrong stone lights exactly like a right one (after one, two and three touches `touched` holds them whatever they are, and `miss` is unchanged); four touches that are not the order, including the right four in the wrong order → `touched` empty, `miss` 0, not solved; touching a lit stone changes nothing; after a wrong four the same deal is still there and the right four then solve it; a touch 1.6 m from a stone is not a touch; with two stones in reach the nearer is touched; both walkers pressing in one tick → the host's touch is recorded first; a walker leaving mid-order keeps `touched` but further touches do not count; `seesFace` over the whole table (alone at a spot: false; both at the right spots: each sees their own face only; swapped: each sees the other face; one at a spot, other in the ring: false; solved: true); `prompt` only when it should, with the exact string; `valid` accepts `create(seed)` and its JSON round-trip, rejects repeated signs, an order with a repeat or an 8, `touched` with five entries, with a repeat or with an 8, `steps` 1.5, `NaN`, wrong lengths; `forceSolve` → `touched` equals `order`, `steps` 1, solved.
  Run: `npx vitest run tests/ring.test.js` — Expected: FAIL (module not found).
- [ ] **Step 2: Implement `src/puzzles/ring.js`.** GREEN.
- [ ] **Step 3: Wire it in, tests first** (`tests/puzzles.test.js`): `solvedCount` reaches 10; `forceSolved(S, 9)` no longer ends the walk, `forceSolved(S, 10)` does; `validState` rejects a bad `ring` slice; `dynOf(createAll(seed))` still deep-equals `DYN_NONE`. Then `index.js`.
- [ ] **Step 4: The view.** Move the six symbol textures into `signs.js` and add two. Then `views/ring.js`:
  - eight tall blank standing stones on `SITES.ring.stones`; an entrance that reads clearly from above and from the ground (two short posts and a flat threshold slab at `SITES.ring.entrance`); a flat floor disc of radius `SITES.ring.r` that glows softly while `bothInside(ctx.players)`.
  - a stone in `touched` glows (the same glow whether it is right or wrong); when the ring judges four wrong (`miss` < 0.6) every stone flashes dull red briefly.
  - two seeing stones at `SITES.ring.seeing[i].stone`, face toward `yaw`, with a worn flat slab on the ground at each spot. Face 0: the four signs of the order in a row, left to right, with 1–4 small pips under them (the way the Signal's tiles carry pips). Face 1: the eight signs laid out in a circle exactly as the stones stand seen from above with the entrance at the bottom, and a clear notch or arrow marking the entrance. A face is drawn only when `seesFace(s, i, ctx.players, ctx.localIdx)`; otherwise the stone is blank. Signs must be large enough to tell apart in a screenshot taken from the spot.
  - stone steps on `SITES.ring.steps` that rise with `s.steps`, built the way the bells' steps are.
  Add it to `game.js`'s `views` with key `ring`.
- [ ] **Step 5: Sound and pilot.** `audio.chimeStone(n)` a soft rising note for the n-th stone lit (the same note right or wrong) and `audio.dud()` a soft low note when four are judged wrong, both from `applyState` by comparing `touched.length` and `miss` with the previous state. `pilot.state().puzzles.ring = { touched: [...], both: bothInside(...), steps, solved }` — never `signs` or `order`.
- [ ] **Step 6:** `npm test`, `npm run build` — all pass.
- [ ] **Step 7: Commit** — `Lantern Isle: The Ring`.

---

### Task 5: The Lanterns and the new ending

Read first: the spec's section 11, `src/puzzles/relay.js` + `views/relay.js` (flames, a burn timer both walkers see, the great brazier), `src/game.js` `endShot` / `beginEnding` / `updateEnding`, `src/core/ending.js`.

**Files:**
- Create: `src/puzzles/lanterns.js`, `tests/lanterns.test.js`, `src/puzzles/views/lanterns.js`
- Modify: `src/puzzles/index.js`, `src/game.js`, `src/core/ending.js`, `tests/ending.test.js`, `src/debug/pilot.js`, `src/audio.js`, `tests/puzzles.test.js`

**Interfaces:**
- Consumes: `SITES.lanterns` from Task 1; `RUN` from `src/config.js`.
- Produces:
  - `export const BURN = 25, REACH = 1.5, POSTS = 6;`
  - `export const create = () => ({ t: [0, 0, 0, 0, 0, 0], solved: false })` — `t[i]` = seconds lantern `i` has left; 0 is dark.
  - `step`, `prompt`, `valid`, `forceSolve`.
  - `index.js`: `lanterns` row, last in `ORDER`, with `done: 'The Lantern Isle is lit'`.
  - `src/core/ending.js`: `export function endShot(focus, behind) -> { pos: [x, y, z], look: [x, y, z] }` where `focus = [x, y, z]` is the great lamp and `behind = [x, z]` is the Far Isle's great brazier; pure (no three.js, no layout import).

**Rules (the spec is the authority):**
- Each tick, unless solved: every `t` falls by `dt`, not below 0; then each present walker's press within `REACH` of the nearest post sets that `t` to `BURN`; then if all six are `> 0`, solved and every `t` is set to `BURN`.
- Once solved nothing changes.
- `prompt`: `'E — light the lantern'` when not solved and within `REACH` of a post; otherwise `null`.

- [ ] **Step 1: `tests/lanterns.test.js`, failing.** Tests: a press lights the nearest post to `BURN`; a press 1.6 m away does nothing; a lit lantern is dark again after `BURN` seconds and not before; a press on a burning lantern tops it up to `BURN`; six lit by two walkers within the burn → solved, and all stay at `BURN` for another minute of ticks; five lit, then the first goes out before the sixth is lit → not solved; an absent walker's press does nothing; lanterns keep burning down while a walker is absent; a huge `dt` is clamped; exact prompt string and when; `valid` accepts `create()` and a JSON round-trip, rejects length 5, `BURN + 1`, a negative, `NaN`, a non-boolean; `forceSolve`. And the two geometry tests against the real `SITES.lanterns.posts` using this module's `BURN`: one walker (720 orders, straight lines, `≥ 1.1 * BURN * RUN`), two walkers (a split with each share's walked route `≤ 0.6 * BURN * RUN`).
  Run: `npx vitest run tests/lanterns.test.js` — Expected: FAIL (module not found).
- [ ] **Step 2: Implement `src/puzzles/lanterns.js`.** GREEN.
- [ ] **Step 3: Wire it in, tests first** (`tests/puzzles.test.js`): `solvedCount` reaches 11; `forceSolved(S, 10)` does not end the walk, `forceSolved(S, 11)` does and stamps the time once; with the relay solved and the pillars unsolved `S.ended` stays `null`; `validState` rejects a bad `lanterns` slice. Then `index.js`.
- [ ] **Step 4: The ending shot, test first.** Move `endShot` out of `game.js` into `src/core/ending.js` with the signature above, keeping its framing idea: the camera stands off the focus on the side away from `behind`, a little above and to one side, looking back past the focus toward `behind`. In `tests/ending.test.js`: `pos` is 20–35 m from the focus horizontally and above it; the horizontal direction from `pos` to `look` is within 20° of the direction from the focus to `behind`; `look` is below the focus. In `game.js` call it with the great lamp (`SITES.lanterns.lamp`, its ground height plus the lamp's height) and `SITES.relay.great`.
- [ ] **Step 5: The view, `src/puzzles/views/lanterns.js`.** Six lantern posts (a post, a small cage, a flame) that read as lanterns from 30 m; the flame's size follows `t / BURN` (still plainly alight in its last seconds; gone at 0); a tally stone at `SITES.lanterns.tally`: a low slab with a plain straight row of six niches, niche `i` glowing while `t[i] > 0` (the row is in index order and must not mirror the island's layout); a great lamp on the tor at `SITES.lanterns.lamp`, dark until solved, then a large steady flame that is the brightest thing in the ending shot. Flames are emissive meshes like the relay's, not point lights. Add it to `game.js`'s `views` with key `lanterns`.
- [ ] **Step 6: Sound and pilot.** From `applyState`: a lantern catching (`t` jumping up) → `audio.pass()`; solved → `audio.roar()`. `pilot.state().puzzles.lanterns = { t: [...rounded], solved }`.
- [ ] **Step 7:** `npm test`, `npm run build` — all pass.
- [ ] **Step 8: Commit** — `Lantern Isle: The Lanterns and the new ending`.

---

### Task 6: The owls

Read first: the spec's "Things to find", `src/puzzles/index.js`, `src/ui/hud.js` `showEnding` and `flash`, `src/game.js` `applyState` and `updateEnding`.

**Files:**
- Create: `src/puzzles/owls.js`, `tests/owls.test.js`, `src/puzzles/views/owls.js`
- Modify: `src/puzzles/index.js`, `src/game.js`, `src/ui/hud.js`, `src/debug/pilot.js`, `src/audio.js`, `tests/puzzles.test.js`

**Interfaces:**
- Consumes: `SITES.owls` from Task 1.
- Produces:
  - `export const OWLS = 8, FOUND_R = 1.2;`
  - `export const create = () => 0` — `S.owls` is a bitmask, bit `i` = owl `i` found.
  - `export function step(found, players) -> number` (pure: returns the new mask), `export const count = (found) => number`, `export const valid = (found) => boolean` (an integer 0–255).
  - `index.js`: `createAll` adds `owls: owls.create()`; `stepAll` does `S.owls = owls.step(S.owls, players)`; `validState` checks it. Owls are **not** in `ORDER`, `solvedCount`, `forceSolved` or `promptFor`.
  - `hud.showEnding({ time, dist, owls: [found, total] })` adds the line `Owls found 5 of 8` under the time; without `owls` the card is as before.

- [ ] **Step 1: `tests/owls.test.js`, failing.** Tests: a present walker within 1.2 m finds an owl; at 1.3 m does not; an absent walker finds nothing; a found owl stays found; two owls cannot be found in one tick by one walker unless both are in reach (they never are: assert every pair of `SITES.owls` is more than 2.4 m apart); `count`; `valid` for 0, 255, 256, −1, 1.5, `NaN`, a string. In `tests/puzzles.test.js`: `createAll(seed).owls === 0`; `stepAll` with a walker on an owl sets its bit; `validState` rejects `owls: 256` and a missing `owls`; finding all eight changes neither `solvedCount` nor `ended`.
  Run: `npx vitest run tests/owls.test.js` — Expected: FAIL (module not found).
- [ ] **Step 2: Implement and wire.** GREEN.
- [ ] **Step 3: The view, `src/puzzles/views/owls.js`.** Eight small low-poly stone owls (about 0.6 m tall) sitting on the ground at `SITES.owls`, the colour of the rock around them so they are easy to walk past. A found owl's eyes glow warm and it stays that way. Key `owls` in `game.js`'s `views` (the slice is the mask).
- [ ] **Step 4: Game, HUD, sound, pilot.** In `applyState`, when `count(S.owls)` rises: `hud.flash('An owl — 3 of 8')` with the new count, and `audio.hoot()` (two soft low notes). Do not flash on the first state after a `welcome` (a reconnecting joiner must not get eight flashes): take the first count seen as the baseline. `updateEnding` passes `owls: [count(S.owls), OWLS]` to `showEnding`. `pilot.state().owls = count`.
- [ ] **Step 5:** `npm test`, `npm run build` — all pass.
- [ ] **Step 6: Commit** — `Owls: eight things to find off the trail`.
