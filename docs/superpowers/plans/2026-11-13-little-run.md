# Little Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A two-player, browser-to-browser co-operative puzzle walk up a small island, built on three.js 0.187.0.

**Architecture:** Everything that decides anything is a pure module with no three.js and no network in it: the island layout, the walker's movement, each puzzle's rules, the message format. Thin shells wrap those: three.js views draw state, a PeerJS session moves messages, a worker-driven ticker steps logic even when the tab is hidden. The host steps all puzzle state and sends it; each browser moves only its own walker.

**Tech Stack:** three 0.187.0, peerjs, Vite, Vitest. Plain JavaScript ES modules. No art or sound files.

**Spec:** `docs/superpowers/specs/2026-11-13-little-run-design.md`

## Global Constraints

- three.js is pinned to exactly `0.187.0`.
- No framework, no physics engine, no asset files (all geometry built in code, all sound from the Web Audio API).
- Keyboard and mouse on desktop only. No jumping.
- Exactly two players. Host is player index `0` (orange scarf), joiner is index `1` (teal scarf).
- Only the room code goes to the PeerJS broker. Peer id is `littlerun-<CODE>`.
- Nothing can kill, fail or permanently strand a player.
- The `?debug` stand-in never appears without the `?debug` query flag.
- No commit steps: the folder is not a git repository and the owner has not asked for one.
- Yaw convention everywhere: yaw `0` faces `-Z`; forward is `(-sin(yaw)·cos(pitch), sin(pitch), -cos(yaw)·cos(pitch))`.
- Constants live in `src/config.js`: `WALK=3.2`, `RUN=5.5` (m/s), `STEP_UP=0.45`, `PLAYER_R=0.4`, `WATER_Y=0`, `DROWN_Y=-0.5`, `LOGIC_HZ=30`, `NET_HZ=15`, `MAX_DT=0.1`.

## Review Focus

1. A third browser joins with a code already in use by two walkers → it is told "This walk already has two walkers" and the pair carries on untouched. (Task 5)
2. A malformed network message (wrong type, non-finite number, oversized) → dropped silently; no throw, no walker at `NaN`. (Task 5)
3. A code typed in lower case, with spaces, or the wrong length → normalised or refused with a message before any connection attempt. (Task 1)
4. A puzzle part changes under a walker (gate closing while someone is in the doorway, lift sinking with a rider) → the walker is never shut inside a collider or dropped through the ground. (Tasks 6, 9)
5. A very long gap between logic steps (laptop sleep) → state advances by at most `MAX_DT`; the lift does not teleport and the beacon does not light itself. (Task 6)

---

## File Structure

```
package.json  vite.config.js  index.html
src/config.js               constants above
src/main.js                 boot: menu → session → Game
src/game.js                 Game: renderer, scene, loop, wiring of everything below
src/core/math.js            pure geometry helpers
src/core/ticker.js          fixed-rate ticker that keeps running in a hidden tab
src/net/code.js             room codes
src/net/protocol.js         message encode / decode / validation
src/net/session.js          PeerJS wrapper
src/world/layout.js         pure: island heights, ramps, blockers, puzzle sites
src/world/terrain.js        three.js: terrain mesh, water, sky, lights, scenery
src/player/controller.js    pure: movement, collision, respawn
src/player/input.js         keyboard + mouse → input state
src/player/camera.js        third-person orbit camera
src/player/avatar.js        pebble-folk mesh and animation
src/puzzles/index.js        createAll / stepAll / dynOf / promptFor / constraintFor
src/puzzles/{gate,signal,plank,lift,beam}.js          pure rules
src/puzzles/views/{gate,signal,plank,lift,beam}.js    three.js views
src/ui/menu.js  src/ui/hud.js
src/audio.js
src/debug/standin.js
tests/*.test.js   tests/helpers/reach.js
```

Shared shapes used across tasks:

```js
// dyn — what the puzzles currently do to the world
{ gateOpen: boolean, bridge: boolean, plank: boolean, lift: number /*0..1*/, ladder: boolean }

// PIn — one walker as the puzzle rules see them
{ present: boolean, x, y, z, aim: [x, y, z], hold: boolean, pressed: boolean }

// S — all puzzle state, JSON-serialisable, owned by the host
{ time: number, gate, signal, plank, lift, beam, ended: null | { time: number } }
```

---

### Task 1: Scaffold, maths helpers, room codes

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/config.js`, `src/core/math.js`, `src/net/code.js`
- Test: `tests/math.test.js`, `tests/code.test.js`

**Interfaces:**
- Produces (`math.js`): `clamp(v,a,b)`, `lerp(a,b,t)`, `lerpAngle(a,b,t)`, `dist2(ax,az,bx,bz)`, `pointSegDist(px,pz,ax,az,bx,bz) → {d,t}`, `segCircle(ax,az,bx,bz,cx,cz,r) → boolean`, `rayPointDist(o,d,p) → {d,t}` (3-vectors as arrays, `d` normalised, `t` clamped to ≥ 0), `dirFromYawPitch(yaw,pitch) → [x,y,z]`.
- Produces (`code.js`): `ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'`, `makeCode(rand = Math.random) → string`, `normalizeCode(text) → string | null`, `peerIdFor(code) → string`.

- [ ] **Step 1: Scaffold.** `npm init -y`; `npm i three@0.187.0 peerjs`; `npm i -D vite vitest`. Scripts: `dev: vite`, `build: vite build`, `test: vitest run`. `index.html` has a full-window `<canvas id="view">`, a `<div id="ui">`, and loads `/src/main.js` as a module.

- [ ] **Step 2: Write the failing tests**

```js
// tests/code.test.js
test('makeCode is five letters from the alphabet', () => {
  for (let i = 0; i < 200; i++) expect(makeCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
});
test('normalizeCode tidies what people type', () => {
  expect(normalizeCode(' abcde ')).toBe('ABCDE');
  expect(normalizeCode('ab c de')).toBe('ABCDE');
});
test('normalizeCode refuses bad codes', () => {
  for (const bad of ['', 'ABCD', 'ABCDEF', 'ABCD1', 'ABCDI', 'ABCDO', 'ABCDL', null, undefined])
    expect(normalizeCode(bad)).toBeNull();
});
test('peerIdFor', () => expect(peerIdFor('ABCDE')).toBe('littlerun-ABCDE'));

// tests/math.test.js
test('dirFromYawPitch follows the yaw convention', () => {
  expect(dirFromYawPitch(0, 0)).toEqual([expect.closeTo(0), expect.closeTo(0), expect.closeTo(-1)]);
  expect(dirFromYawPitch(Math.PI / 2, 0)[0]).toBeCloseTo(-1);
  expect(dirFromYawPitch(0, Math.PI / 2)[1]).toBeCloseTo(1);
});
test('segCircle', () => {
  expect(segCircle(-2, 0, 2, 0, 0, 0.5, 1)).toBe(true);
  expect(segCircle(-2, 0, 2, 0, 0, 1.5, 1)).toBe(false);
  expect(segCircle(-2, 0, -1.5, 0, 0, 0, 1)).toBe(false); // segment ends short
});
test('rayPointDist ignores points behind the origin', () => {
  expect(rayPointDist([0,0,0],[0,0,-1],[0.5,0,-4])).toEqual({ d: expect.closeTo(0.5), t: expect.closeTo(4) });
  expect(rayPointDist([0,0,0],[0,0,-1],[0,0,3]).t).toBe(0);
});
test('lerpAngle takes the short way round', () => {
  expect(lerpAngle(3.1, -3.1, 0.5)).toBeCloseTo(Math.PI, 1);
});
```

- [ ] **Step 3: Run** `npm test` — expect failures for missing modules.
- [ ] **Step 4: Implement** `src/core/math.js`, `src/net/code.js`, `src/config.js`.
- [ ] **Step 5: Run** `npm test` — expect all pass.

---

### Task 2: Island layout

**Files:**
- Create: `src/world/layout.js`, `tests/helpers/reach.js`
- Test: `tests/layout.test.js`

**Interfaces:**
- Consumes: `math.js`, `config.js`.
- Produces:
  - `DYN_NONE = { gateOpen:false, bridge:false, plank:false, lift:0, ladder:false }`
  - `heightAt(x, z, dyn) → number` — ground height in metres; below `DROWN_Y` is deep water.
  - `blockers(dyn) → { circles:[{x,z,r}], segments:[{ax,az,bx,bz}] }`
  - `zoneAt(x, z) → 'A'|'B'|'C'|'D'|'E'|'F'|null` — which plateau a point is on. A beach, B gate-to-signal terrace, C lookout, D plank terrace, E lift foot, F summit.
  - `SITES` — every puzzle anchor:
    ```js
    { spawn: [[x,z],[x,z]],
      checkpoints: [ [[x,z],[x,z]], … ],      // index = puzzles solved, 0..5
      gate:   { plateA:[x,z], plateB:[x,z], door:{ax,az,bx,bz} },
      signal: { lookout:[x,z], wall:{x,z,yaw}, dials:[[x,z]×4], dialZone:{x,z,r}, bridge:{ax,az,bx,bz} },
      plank:  { restA:[x,z], restB:[x,z], stones:[{x,z,r}], slot:[x,z], span:{ax,az,bx,bz} },
      lift:   { crank:[x,z], platform:{x,z,hw,hd}, low:number, high:number, post:[x,z] },
      beam:   { lamp:{o:[x,y,z], d:[x,y,z]}, mirrors:[[x,z],[x,z]], lens:[x,y,z],
                rocks:[{x,z,r,h}], hint:{p1:[x,z], p2:[x,z]} },
      beacon: [x,z] }
    ```

World model the builder implements: plateaus are unions of discs, each with one height, heights rising in trail order A→F (so stepping down a cliff only ever takes you backwards). Ramps are oriented rectangles that interpolate height between two ends; a ramp may be conditional on a `dyn` flag (bridge, plank, ladder). The lift platform is a rectangle whose height is `low + dyn.lift·(high − low)`. Anywhere not on a plateau or ramp is sea floor (below `DROWN_Y`), with a sloped beach around A. Every gap a puzzle spans is at least 3.5 m of deep water. The island fits in about 300 m. Exact coordinates are the builder's choice; the tests below are what pin it.

- [ ] **Step 1: Write `tests/helpers/reach.js`** — `reachable(from, dyn) → (x,z) => boolean`: breadth-first flood on a 0.5 m grid, 8 neighbours; a step is allowed when the neighbour's height is above `DROWN_Y`, rises no more than `STEP_UP`, and is at least `PLAYER_R` clear of every blocker. A target counts as reached if any visited cell is within 1 m.

- [ ] **Step 2: Write the failing tests**

```js
const D = (o) => ({ ...DYN_NONE, ...o });
const at = (p) => [p[0], p[1]];
test('nothing solved: the gate is the end of the road', () => {
  const r = reachable(SITES.spawn[0], DYN_NONE);
  expect(r(...SITES.gate.plateA)).toBe(true);
  expect(r(...SITES.gate.plateB)).toBe(false);
});
test('gate open: both halves of the signal, nothing past it', () => {
  const r = reachable(SITES.spawn[0], D({ gateOpen: true }));
  expect(r(...SITES.gate.plateB)).toBe(true);
  expect(r(...SITES.signal.lookout)).toBe(true);
  expect(r(SITES.signal.dialZone.x, SITES.signal.dialZone.z)).toBe(true);
  expect(r(...SITES.plank.restA)).toBe(false);
});
test('bridge out: the plank and its slot, not the lift', () => {
  const r = reachable(SITES.spawn[0], D({ gateOpen: true, bridge: true }));
  expect(r(...SITES.plank.restA)).toBe(true);
  expect(r(...SITES.plank.slot)).toBe(true);
  expect(r(...SITES.lift.crank)).toBe(false);
});
test('plank laid: the lift foot, not the ledge', () => {
  const r = reachable(SITES.spawn[0], D({ gateOpen: true, bridge: true, plank: true }));
  expect(r(...SITES.lift.crank)).toBe(true);
  expect(r(SITES.lift.platform.x, SITES.lift.platform.z)).toBe(true);
  expect(r(...SITES.lift.post)).toBe(false);
});
test('a raised lift carries its rider to the ledge and nobody else', () => {
  const up = D({ gateOpen: true, bridge: true, plank: true, lift: 1 });
  expect(reachable([SITES.lift.platform.x, SITES.lift.platform.z], up)(...SITES.lift.post)).toBe(true);
  expect(reachable(SITES.lift.crank, up)(...SITES.lift.post)).toBe(false);
});
test('ladder down: the summit and both mirrors', () => {
  const r = reachable(SITES.lift.crank, D({ gateOpen: true, bridge: true, plank: true, ladder: true }));
  expect(r(...SITES.lift.post)).toBe(true);
  for (const m of SITES.beam.mirrors) expect(r(...m)).toBe(true);
});
test('every checkpoint is dry land', () => {
  for (const pair of SITES.checkpoints) for (const [x, z] of pair)
    expect(heightAt(x, z, DYN_NONE)).toBeGreaterThan(0.2);
  expect(SITES.checkpoints).toHaveLength(6);
});
test('the lookout faces the back of the wall, close enough to read', () => {
  const { wall, lookout } = SITES.signal;
  const back = [Math.sin(wall.yaw), Math.cos(wall.yaw)];           // opposite of the wall's facing
  const to = [lookout[0] - wall.x, lookout[1] - wall.z];
  const len = Math.hypot(...to);
  expect(len).toBeLessThan(30);
  expect((to[0] * back[0] + to[1] * back[1]) / len).toBeGreaterThan(0.7);
});
test('the plank zigzag cannot be walked around', () => {
  // with the stones removed the slot is reachable; the stones only shape the way through
  expect(SITES.plank.stones.length).toBeGreaterThanOrEqual(6);
  const r = reachable(SITES.plank.restA, D({ gateOpen: true, bridge: true }));
  expect(r(...SITES.plank.slot)).toBe(true);
});
```

(The beam's sight-line tests live with the beam rules in Task 10, which owns the occlusion maths.)

- [ ] **Step 3: Run** `npm test` — expect failures.
- [ ] **Step 4: Implement `src/world/layout.js`** to the world model above.
- [ ] **Step 5: Run** `npm test` — expect all pass.

---

### Task 3: Walker movement

**Files:**
- Create: `src/player/controller.js`
- Test: `tests/controller.test.js`

**Interfaces:**
- Consumes: `heightAt`, `blockers`, `SITES` from `layout.js`; `config.js`.
- Produces:
  - `createPlayer(x, z) → { x, y, z, yaw, vy, dist }`
  - `stepPlayer(p, input, dt, dyn, veto = null) → void` — `input = { mx, mz, run, camYaw }` with `mx`/`mz` in −1..1 relative to the camera (`mz = 1` is forward). Moves on X and Z separately so walls slide; refuses a move that rises more than `STEP_UP`, enters a blocker, or for which `veto(nx, nz)` returns true. `y` follows the ground when it rises and falls under gravity when it drops. `yaw` turns toward travel. `dist` accumulates metres walked.
  - `needsRespawn(p, dyn) → boolean` — ground under the walker is below `DROWN_Y` and the walker has reached it.
  - `respawn(p, solvedCount, slot) → void` — to `SITES.checkpoints[solvedCount][slot]`.

- [ ] **Step 1: Write the failing tests**

```js
const fwd = { mx: 0, mz: 1, run: false, camYaw: 0 };
const run = (p, input, secs, dyn = DYN_NONE, veto) => { for (let i = 0; i < secs * 60; i++) stepPlayer(p, input, 1 / 60, dyn, veto); };
test('walks at WALK and runs at RUN', () => {
  const [x, z] = SITES.spawn[0];
  const a = createPlayer(x, z); run(a, { ...fwd, camYaw: Math.PI }, 1);   // toward +Z, open beach
  expect(a.dist).toBeCloseTo(3.2, 1);
  const b = createPlayer(x, z); run(b, { ...fwd, camYaw: Math.PI, run: true }, 1);
  expect(b.dist).toBeCloseTo(5.5, 1);
});
test('a closed gate stops a walker and an open one does not', () => {
  const { door, plateA, plateB } = SITES.gate;
  const head = Math.atan2(-(plateB[0] - plateA[0]), -(plateB[1] - plateA[1]));
  const shut = createPlayer(...plateA); run(shut, { ...fwd, camYaw: head }, 12);
  expect(zoneAt(shut.x, shut.z)).toBe('A');
  const open = createPlayer(...plateA); run(open, { ...fwd, camYaw: head }, 12, { ...DYN_NONE, gateOpen: true });
  expect(zoneAt(open.x, open.z)).toBe('B');
});
test('veto blocks a move', () => {
  const p = createPlayer(...SITES.spawn[0]); const x0 = p.x, z0 = p.z;
  run(p, fwd, 1, DYN_NONE, () => true);
  expect([p.x, p.z]).toEqual([x0, z0]);
});
test('walking into the sea asks for a respawn, and respawn lands on the checkpoint', () => {
  const p = createPlayer(...SITES.spawn[0]);
  run(p, { ...fwd, camYaw: Math.PI, run: true }, 60);          // straight out to sea
  expect(needsRespawn(p, DYN_NONE)).toBe(true);
  respawn(p, 0, 1);
  expect([p.x, p.z]).toEqual(SITES.checkpoints[0][1]);
  expect(needsRespawn(p, DYN_NONE)).toBe(false);
});
test('a rider follows the lift up and back down without falling through', () => {
  const { platform, low, high } = SITES.lift;
  const p = createPlayer(platform.x, platform.z);
  const idle = { mx: 0, mz: 0, run: false, camYaw: 0 };
  for (let f = 0; f <= 1; f += 0.02) stepPlayer(p, idle, 1 / 30, { ...DYN_NONE, lift: f });
  expect(p.y).toBeCloseTo(high, 1);
  for (let f = 1; f >= 0; f -= 0.02) for (let k = 0; k < 4; k++) stepPlayer(p, idle, 1 / 30, { ...DYN_NONE, lift: Math.max(0, f) });
  expect(p.y).toBeCloseTo(low, 1);
});
```

- [ ] **Step 2: Run** — expect failures. **Step 3: Implement** `controller.js`. **Step 4: Run** — expect pass.

---

### Task 4: A walkable island on screen

**Files:**
- Create: `src/world/terrain.js`, `src/player/input.js`, `src/player/camera.js`, `src/player/avatar.js`, `src/game.js`, `src/main.js`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `buildTerrain(scene) → void` — flat-shaded terrain mesh sampled from `heightAt(x,z,DYN_NONE)` at 1 m, vertex-coloured by height and zone (sand, grass, rock, trail), a water plane at `WATER_Y`, sky colour, fog, one sun light with shadows and a hemisphere light, scattered rocks and trees placed deterministically and never on a ramp or puzzle site.
  - `createInput(canvas) → { state: { mx, mz, run, hold, eN, q, shoutN, waveN, camYaw, camPitch }, forced: null | object, dispose() }` — pointer lock on click, Esc releases; while pointer lock is unavailable, dragging with the left button looks instead. `eN`, `shoutN`, `waveN` are counters that go up by one per key press. When `forced` is set its fields override `state` (used by the debug handle).
  - `createCamera(aspect) → { camera, update(player, input, dyn, dt) }` — orbits 5 m behind and above the walker; pulls in so it never goes under `heightAt`.
  - `createAvatar(colour) → { group, update(view, dt) }` where `view = { x, y, z, yaw, speed, aim:[x,y,z], pointing, carrying, waveN }` — pebble folk: rounded stone-coloured body, stubby legs that swing with `speed`, two arms, a scarf in `colour` (`0xf08a3c` host, `0x2fb5a6` joiner).
  - `class Game { constructor(canvas, { role, session, debug }); start(); }` — owns renderer (`WebGLRenderer`, antialias, shadows, pixel ratio capped at 2), scene, the local walker, and the render loop.

- [ ] **Step 1: Implement** the files above; `main.js` for now starts a `Game` directly with `role: 'host'`, `session: null`.
- [ ] **Step 2: Verify.** Run `npm run dev`, open it, click to capture the mouse. Expected: an island with a beach, a pebble-folk walker with an orange scarf, W A S D walks, Shift runs, the camera orbits and stays above ground, the walker stops at the closed gate's ramp, and walking into the sea returns it to the beach. No console errors.

---

### Task 5: Two browsers, one island

**Files:**
- Create: `src/net/protocol.js`, `src/net/session.js`, `src/core/ticker.js`, `src/ui/menu.js`, `src/ui/hud.js`
- Modify: `src/main.js`, `src/game.js`
- Test: `tests/protocol.test.js`

**Interfaces:**
- Produces (`protocol.js`):
  - `PROTOCOL_V = 1`, `MAX_BYTES = 16384`
  - `encode(msg) → string`, `decode(text) → msg | null`
  - Messages: `{t:'hello', v}`, `{t:'welcome', v, seed, solved}`, `{t:'full'}`, `{t:'p', x,y,z, yaw, ay, ap, speed, hold, eN, q, shoutN, waveN, dist}`, `{t:'s', S}`.
  - `shouldAccept(hasPartner: boolean) → boolean`
  - `toPIn(snapshot | null, lastEN) → PIn` — `present:false` for `null`; `pressed` is true when `eN !== lastEN`; `aim` from `dirFromYawPitch(ay, ap)`.
- Produces (`session.js`): `Session.host(code) → Session`, `Session.join(code, { timeoutMs = 12000 }) → Session`; instance: `role`, `send(msg)`, `onMessage = (msg) => {}`, `onStatus = (status) => {}` with status one of `'waiting' | 'connected' | 'lost' | 'failed' | 'full'`, `close()`. The host keeps its peer open after a partner drops so the same code works again, and answers any extra connection with `full` then closes it.
- Produces (`ticker.js`): `createTicker(hz, fn) → { stop() }` — driven by a `setInterval` inside an inline Worker so it keeps firing in a hidden tab; falls back to a page `setInterval` if Workers are unavailable. `fn(dt)` gets seconds since the last call.
- Produces (`menu.js`): `showMenu(root) → Promise<{ role: 'host'|'join', code: string }>` — title, **Start a walk**, **Join a walk** with a code field that uses `normalizeCode` and shows "That isn't a walk code — five letters." when it returns `null`.
- Produces (`hud.js`): `createHud(root) → { setCode(code|null), setStatus(text|null), setPrompt(text|null), setFriendArrow(angle|null), showEnding({time, dist}) }`.

- [ ] **Step 1: Write the failing tests**

```js
test('round-trips every message type', () => {
  const p = { t:'p', x:1, y:2, z:3, yaw:0.5, ay:0.1, ap:-0.2, speed:3.2, hold:true, eN:4, q:false, shoutN:1, waveN:0, dist:12.5 };
  expect(decode(encode(p))).toEqual(p);
  expect(decode(encode({ t:'hello', v:1 }))).toEqual({ t:'hello', v:1 });
});
test('drops anything malformed without throwing', () => {
  const bad = ['', 'not json', '[]', 'null', '{"t":"zap"}', '{"t":"p","x":"1"}',
    JSON.stringify({ t:'p', x:1e400 }), JSON.stringify({ t:'p', x:null, y:0, z:0 }),
    JSON.stringify({ t:'hello', v:2 }), 'x'.repeat(20000)];
  for (const b of bad) expect(decode(b)).toBeNull();
});
test('a walk takes one partner', () => {
  expect(shouldAccept(false)).toBe(true);
  expect(shouldAccept(true)).toBe(false);
});
test('toPIn', () => {
  expect(toPIn(null, 0).present).toBe(false);
  const a = toPIn({ x:1, y:2, z:3, ay:0, ap:0, hold:true, eN:5 }, 4);
  expect(a).toMatchObject({ present:true, x:1, y:2, z:3, hold:true, pressed:true });
  expect(a.aim[2]).toBeCloseTo(-1);
  expect(toPIn({ x:1, y:2, z:3, ay:0, ap:0, hold:false, eN:5 }, 5).pressed).toBe(false);
});
```

- [ ] **Step 2: Run** — expect failures. **Step 3: Implement** `protocol.js`. **Step 4: Run** — expect pass.
- [ ] **Step 5: Implement** `ticker.js`, `session.js`, `menu.js`, `hud.js`; wire `main.js` (menu → session → `Game`) and `game.js`: a ticker at `LOGIC_HZ`; every second tick sends a `p` message; the remote walker is a second avatar eased toward its latest snapshot; the host shows the code and "Waiting for your friend…" until `connected`; `lost` on the host shows that line again and the same code still works; `failed` on the joiner shows "Couldn't connect. Check the code — and some home networks block direct connections."; `full` shows "This walk already has two walkers." With `?debug` the menu is skipped and the game starts as host with no session.
- [ ] **Step 6: Verify.** `npm run dev`, two tabs. Start a walk in one, join with the code in the other. Expected: each tab shows two walkers, orange and teal; moving in one tab moves that walker in the other within a blink. Reload the joiner and rejoin with the same code: it works. Open a third tab and join: it is told the walk is full.

---

### Task 6: Puzzle frame, The Gate, and the stand-in

**Files:**
- Create: `src/puzzles/index.js`, `src/puzzles/gate.js`, `src/puzzles/views/gate.js`, `src/debug/standin.js`
- Modify: `src/game.js`
- Test: `tests/gate.test.js`, `tests/puzzles.test.js`

**Interfaces:**
- Produces (`index.js`):
  - `createAll(seed) → S`
  - `stepAll(S, players: [PIn, PIn], dt) → void` — clamps `dt` to `MAX_DT`; adds to `S.time` only while both are present and `S.ended` is null.
  - `solvedCount(S) → 0..5`
  - `dynOf(S) → dyn`
  - `promptFor(S, idx, players) → string | null`
  - `constraintFor(S, idx, players) → ((nx, nz) => boolean) | null`
- Produces (`gate.js`): `create() → { open:boolean, amt:number, solved:boolean }`, `step(s, players, dt)`, `prompt(s, idx, players)`. Rules: `open` when solved, or anyone present is within 1.0 m of `plateA` or `plateB`, or anyone present is within 0.9 m of the `door` segment. `amt` eases toward `open` over 0.5 s. `solved` when both are present and both in a zone other than `'A'`. `dynOf` reports `gateOpen` as `amt > 0.5 || open`.
- Produces (`views/gate.js`): `createView(scene) → { sync(s, dt) }` — two round plates that sink when stood on, a wooden gate across the ramp that swings with `amt`.
- Produces (`standin.js`): `createStandin(game) → { pin(): PIn-like snapshot, update(dt) }`, active only with `?debug`. Keys: **T** bring the stand-in to where I am, **Y** toggle it holding E, **I** one E press, **U** toggle following me at the offset it has right now, **O** cycle what it aims at (nothing → me → the lens), **P** send both walkers to the next checkpoint. Also sets `window.__lr = { game, input, S: () => S, standin, teleport(x, z) }`.
- Modifies (`game.js`): the host builds `[PIn, PIn]` each tick from its own walker and the partner's last snapshot (or the stand-in), calls `stepAll`, sends `{t:'s', S}` on net ticks; the joiner replaces its `S` with what arrives. Both pass `dynOf(S)` and `constraintFor` to `stepPlayer`, call `respawn(p, solvedCount(S), idx)` when `needsRespawn`, show `promptFor` in the HUD, and `sync` every view. A joiner's `welcome` carries `solved` so a rejoin starts at the right checkpoint.

- [ ] **Step 1: Write the failing tests**

```js
const P = (xz, o = {}) => ({ present: true, x: xz[0], y: 0, z: xz[1], aim: [0, 0, -1], hold: false, pressed: false, ...o });
const gone = { present: false };
const far = SITES.spawn[0];
const settle = (s, players) => { for (let i = 0; i < 60; i++) step(s, players, 1 / 30); };
test('shut with nobody on a plate; open while either plate is held', () => {
  const s = create(); settle(s, [P(far), P(far)]); expect(s.open).toBe(false);
  settle(s, [P(SITES.gate.plateA), P(far)]); expect(s.open).toBe(true); expect(s.amt).toBeCloseTo(1);
  settle(s, [P(far), P(far)]); expect(s.open).toBe(false); expect(s.amt).toBeCloseTo(0);
  settle(s, [P(far), P(SITES.gate.plateB)]); expect(s.open).toBe(true);
});
test('never closes on a walker in the doorway', () => {
  const s = create(); const d = SITES.gate.door;
  const mid = [(d.ax + d.bx) / 2, (d.az + d.bz) / 2];
  settle(s, [P(SITES.gate.plateA), P(mid)]);
  settle(s, [P(far), P(mid)]);
  expect(s.open).toBe(true);
});
test('solved only when both are through, and then stays open', () => {
  const s = create(); const b = SITES.gate.plateB;
  settle(s, [P(b), P(far)]); expect(s.solved).toBe(false);
  settle(s, [P(b), gone]); expect(s.solved).toBe(false);
  settle(s, [P(b), P([b[0] + 1, b[1]])]); expect(s.solved).toBe(true);
  settle(s, [P(far), P(far)]); expect(s.open).toBe(true);
});

// tests/puzzles.test.js
test('a huge step is clamped', () => {
  const S = createAll(1); const two = [P(far), P(far)];
  stepAll(S, two, 3600);
  expect(S.time).toBeCloseTo(0.1);
});
test('time only runs while both are here', () => {
  const S = createAll(1); stepAll(S, [P(far), gone], 0.05); expect(S.time).toBe(0);
});
test('dynOf starts as DYN_NONE and S survives JSON', () => {
  const S = createAll(7);
  expect(dynOf(S)).toEqual(DYN_NONE);
  expect(JSON.parse(JSON.stringify(S))).toEqual(S);
});
```

- [ ] **Step 2: Run** — expect failures. **Step 3: Implement** `gate.js`, `index.js`. **Step 4: Run** — expect pass.
- [ ] **Step 5: Implement** `views/gate.js`, `standin.js`, and the `game.js` wiring.
- [ ] **Step 6: Verify** in one tab with `?debug`: stand on the first plate → gate opens; step off → it shuts. Press **T** on the plate, walk through the open gate to the second plate, press **T** again from beyond it → HUD shows the puzzle solved and the gate stays open.

---

### Task 7: The Signal

**Files:**
- Create: `src/puzzles/signal.js`, `src/puzzles/views/signal.js`
- Modify: `src/puzzles/index.js`, `src/game.js`
- Test: `tests/signal.test.js`

**Interfaces:**
- Produces (`signal.js`): `SYMBOLS = 6`, `create(seed) → { answer:[4 ints 0..5], dials:[0,0,0,0], lit:boolean, bridge:number /*0..1*/, solved:boolean }`, `step`, `prompt`. Rules: `answer` is derived from `seed` and is never `[0,0,0,0]`. `lit` while anyone present is inside `dialZone`. A `pressed` walker within 1.0 m of a dial turns the nearest one: `(v + 1) % 6`. `solved` when `dials` equals `answer`; dials stop turning once solved. `bridge` eases 0→1 over 2 s after solving; `dynOf` reports `bridge` when `bridge >= 1`.
- Produces (`views/signal.js`): the wall with four 2 m symbols on its back that are drawn only while `lit` (plain dark stone otherwise) and are visible only from behind; four dial posts each showing its current symbol; a bridge that swings out with `bridge`. Six symbols, distinct at 30 m: circle, triangle, square, cross, crescent, zigzag.

- [ ] **Step 1: Write the failing tests**

```js
test('the answer comes from the seed and is never all zeros', () => {
  expect(create(5).answer).toEqual(create(5).answer);
  const seen = new Set();
  for (let seed = 0; seed < 500; seed++) {
    const a = create(seed).answer;
    expect(a).toHaveLength(4); for (const v of a) expect(v >= 0 && v < 6).toBe(true);
    expect(a.join('')).not.toBe('0000'); seen.add(a.join(''));
  }
  expect(seen.size).toBeGreaterThan(200);
});
test('symbols glow only while someone is at the dials', () => {
  const s = create(1); const z = SITES.signal.dialZone;
  step(s, [P(SITES.signal.lookout), P(far)], 0.03); expect(s.lit).toBe(false);
  step(s, [P(SITES.signal.lookout), P([z.x, z.z])], 0.03); expect(s.lit).toBe(true);
});
test('pressing at a dial turns that dial only, and wraps', () => {
  const s = create(1); const d2 = SITES.signal.dials[2];
  for (let i = 0; i < 7; i++) step(s, [P(d2, { pressed: true }), P(far)], 0.03);
  expect(s.dials).toEqual([0, 0, 1, 0]);
  step(s, [P(far, { pressed: true }), P(far)], 0.03);
  expect(s.dials).toEqual([0, 0, 1, 0]);
});
test('the right dials bring the bridge out and it stays', () => {
  const s = create(1);
  s.answer.forEach((v, i) => { for (let k = 0; k < v; k++) step(s, [P(SITES.signal.dials[i], { pressed: true }), P(far)], 0.03); });
  expect(s.solved).toBe(true);
  for (let i = 0; i < 90; i++) step(s, [P(far), P(far)], 1 / 30);
  expect(s.bridge).toBeCloseTo(1);
  step(s, [P(SITES.signal.dials[0], { pressed: true }), P(far)], 0.03);
  expect(s.solved).toBe(true);
});
```

- [ ] **Step 2: Run** — fail. **Step 3: Implement** `signal.js`, add to `index.js`. **Step 4: Run** — pass.
- [ ] **Step 5: Implement** the view and wire it.
- [ ] **Step 6: Verify** with `?debug`: park the stand-in at the dials (**T**), walk to the lookout: four symbols glow on the wall's back. Bring the stand-in away: they go dark. Park it again, read them, go and set the dials: the bridge swings out and can be walked.

---

### Task 8: The Plank

**Files:**
- Create: `src/puzzles/plank.js`, `src/puzzles/views/plank.js`
- Modify: `src/puzzles/index.js`, `src/game.js`, `src/player/avatar.js` (carrying pose)
- Test: `tests/plank.test.js`

**Interfaces:**
- Produces (`plank.js`): `LEN = 4`, `GRAB_R = 1.2`, `DROP_DIST = 5.5`, `PLACE_R = 2.5`; `create() → { ax, az, bx, bz, holdA: null|0|1, holdB: null|0|1, placed:boolean, solved:boolean }` starting at `restA`/`restB`; `step`; `prompt`; `veto(s, idx, players) → ((nx,nz) => boolean) | null`.
- Rules:
  - A `pressed` walker holding nothing, within `GRAB_R` of a free end, takes it. If both press for the same end in one step, the lower index gets it. One walker cannot hold both ends.
  - A `pressed` walker who holds an end lets go.
  - While both ends are held, each end sits at its holder's position.
  - If both are held and the holders are more than `DROP_DIST` apart, both let go. On any release the plank comes to rest centred on its midpoint at length `LEN`, along its last direction.
  - If either holder lets go while both were holding and the midpoint is within `PLACE_R` of `slot`, the plank is `placed` on `span` and `solved`. `dynOf` reports `plank` when `placed`.
  - If it comes to rest with its midpoint over water (`heightAt < 0.2`), it returns to `restA`/`restB`.
  - `veto` for a walker holding an end: with the other end free, refuse any move more than 0.6 m from that walker's own end as it rests; with both held, refuse any move where the line from the new position to the other holder crosses a stone (`segCircle` against each stone's radius). Drifting apart is never vetoed; it drops the plank. A walker holding nothing gets `null`.
- Produces (view): the plank at rest or between its carriers, the standing stones, a marked slot at the gap, the laid plank across `span`. Avatars holding an end use the carrying pose.

- [ ] **Step 1: Write the failing tests**

```js
const A = SITES.plank.restA, B = SITES.plank.restB;
const press = (xz) => P(xz, { pressed: true });
test('each takes an end; one walker cannot take both', () => {
  const s = create();
  step(s, [press(A), P(far)], 0.03); expect(s.holdA).toBe(0);
  step(s, [P(A), P(far)], 0.03);
  step(s, [press(B), P(far)], 0.03);            // releases A (already holding), does not grab B
  expect([s.holdA, s.holdB]).toEqual([null, null]);
});
test('both press for the same end: the host gets it', () => {
  const s = create(); step(s, [press(A), press(A)], 0.03);
  expect([s.holdA, s.holdB]).toEqual([0, null]);
});
test('carried ends follow their holders; drifting apart drops it at full length', () => {
  const s = create();
  step(s, [press(A), press(B)], 0.03);
  step(s, [P([A[0] + 1, A[1]]), P([B[0] + 1, B[1]])], 0.03);
  expect([s.ax, s.az, s.bx, s.bz]).toEqual([A[0] + 1, A[1], B[0] + 1, B[1]]);
  step(s, [P([A[0] - 3, A[1]]), P([B[0] + 3, B[1] ])], 0.03);  // far apart
  expect([s.holdA, s.holdB]).toEqual([null, null]);
  expect(Math.hypot(s.bx - s.ax, s.bz - s.az)).toBeCloseTo(4);
});
test('letting go at the slot lays it; anywhere else just drops it', () => {
  const s = create(); const [sx, sz] = SITES.plank.slot;
  step(s, [press(A), press(B)], 0.03);
  step(s, [P([sx - 2, sz]), P([sx + 2, sz])], 0.03);
  step(s, [press([sx - 2, sz]), P([sx + 2, sz])], 0.03);
  expect(s.placed).toBe(true); expect(s.solved).toBe(true);
  const t = create(); step(t, [press(A), press(B)], 0.03); step(t, [press(A), P(B)], 0.03);
  expect(t.placed).toBe(false);
});
test('a lone holder at the slot lays nothing', () => {
  const s = create(); const [sx, sz] = SITES.plank.slot;
  s.ax = sx - 2; s.az = sz; s.bx = sx + 2; s.bz = sz;
  step(s, [press([sx - 2, sz]), P(far)], 0.03);
  step(s, [press([sx - 2, sz]), P(far)], 0.03);
  expect(s.placed).toBe(false);
});
test('veto: a lone holder is rooted', () => {
  const s = create(); step(s, [press(A), P(far)], 0.03);
  const lone = veto(s, 0, [P(A), P(far)]);
  expect(lone(A[0] + 0.3, A[1])).toBe(false); expect(lone(A[0] + 2, A[1])).toBe(true);
});
test('veto: a pair cannot swing the plank through a stone', () => {
  const st = SITES.plank.stones[0];
  const t = create(); t.holdA = 0; t.holdB = 1;
  const v = veto(t, 0, [P([st.x - 3, st.z - 3]), P([st.x + 3, st.z])]);
  expect(v(st.x - 3, st.z)).toBe(true);           // line to partner runs through the stone's centre
  expect(v(st.x - 3, st.z - 6)).toBe(false);      // well clear
  expect(veto(create(), 0, [P(A), P(B)])).toBeNull();   // holding nothing: no veto
});
test('dropped in the water, it goes back to its rest', () => {
  const s = create(); step(s, [press(A), press(B)], 0.03);
  step(s, [P([9999, 9999]), P([9999, 10001])], 0.03);
  step(s, [press([9999, 9999]), P([9999, 10001])], 0.03);
  expect([s.ax, s.az, s.bx, s.bz]).toEqual([...A, ...B]);
});
```

- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** — pass.
- [ ] **Step 5: Implement** the view, the carrying pose, and `constraintFor` → `plank.veto`.
- [ ] **Step 6: Verify** with `?debug`: grab one end, **T** + **I** the stand-in onto the other, **U** to make it follow, carry the plank through the stones (it cannot pass through one), release at the slot: it lies across the gap and can be walked.

---

### Task 9: The Lift

**Files:**
- Create: `src/puzzles/lift.js`, `src/puzzles/views/lift.js`
- Modify: `src/puzzles/index.js`, `src/game.js`
- Test: `tests/lift.test.js`

**Interfaces:**
- Produces (`lift.js`): `RISE = 0.25`, `SINK = 0.35` (fraction per second), `create() → { y:number /*0..1*/, cranking:boolean, ladder:boolean, solved:boolean }`, `step`, `prompt`. Rules: `cranking` while anyone present has `hold` within 1.5 m of `crank`. `y` rises at `RISE` while cranking, otherwise sinks at `SINK`, clamped 0..1. A `pressed` walker within 1.5 m of `post` and standing in zone `'F'` sets `ladder` for good. `solved` equals `ladder`. `dynOf` reports `lift: y` and `ladder`.
- Produces (view): a crank that turns while `cranking`, a platform on a rope at height `low + y·(high − low)`, a post with a rolled rope ladder that unrolls down the ledge when `ladder`.

- [ ] **Step 1: Write the failing tests**

```js
const secs = (s, players, t) => { for (let i = 0; i < t * 30; i++) step(s, players, 1 / 30); };
test('rises only while the crank is held, and sinks when let go', () => {
  const s = create(); const c = SITES.lift.crank;
  secs(s, [P(c, { hold: true }), P(far)], 2); expect(s.y).toBeCloseTo(0.5, 1);
  secs(s, [P(c, { hold: true }), P(far)], 4); expect(s.y).toBe(1);
  secs(s, [P(c), P(far)], 1); expect(s.y).toBeCloseTo(0.65, 1);
  secs(s, [P(c), P(far)], 5); expect(s.y).toBe(0);
});
test('holding E somewhere else does nothing', () => {
  const s = create(); secs(s, [P(far, { hold: true }), P(far)], 2); expect(s.y).toBe(0);
});
test('the ladder is kicked down from the ledge only, and stays down', () => {
  const s = create(); const post = SITES.lift.post;
  step(s, [P(SITES.lift.crank, { pressed: true }), P(far)], 0.03); expect(s.ladder).toBe(false);
  step(s, [P(post, { pressed: true }), P(far)], 0.03); expect(s.ladder).toBe(true);
  secs(s, [P(far), P(far)], 1); expect(s.ladder).toBe(true); expect(s.solved).toBe(true);
});
```

(`post` is in zone `'F'` by Task 2's layout; add `expect(zoneAt(...SITES.lift.post)).toBe('F')` to `tests/layout.test.js`.)

- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** — pass.
- [ ] **Step 5: Implement** the view and wiring.
- [ ] **Step 6: Verify** with `?debug`: park the stand-in at the crank with **T**, stand on the platform, press **Y**: the lift carries the walker up smoothly; step onto the ledge; press **Y** again and watch the empty platform sink. Press E at the post: the ladder drops. Walk off the ledge edge beside the ladder, then climb back up it.

---

### Task 10: The Beam and the ending

**Files:**
- Create: `src/puzzles/beam.js`, `src/puzzles/views/beam.js`
- Modify: `src/puzzles/index.js`, `src/game.js`, `src/ui/hud.js`, `src/player/avatar.js` (mirror in hand)
- Test: `tests/beam.test.js`

**Interfaces:**
- Produces (`beam.js`):
  - `HIT_R = 0.9`, `LENS_R = 1.5`, `CHARGE = 2`, `REACH = 60`, `CHEST = 0.9`
  - `occluded(a:[x,y,z], b:[x,y,z]) → boolean` — the straight line from `a` to `b` passes through a rock in `SITES.beam.rocks` (a vertical cylinder of radius `r` from the ground to height `h`).
  - `trace(holders: [{ pos:[x,y,z], aim:[x,y,z] } | null, same]) → { segs: [[x,y,z,x,y,z]…], onLens: boolean }` — follow the lamp's ray; the nearest holder not yet used whose chest (`pos`, already at chest height) is within `HIT_R` of the ray, in front of its origin, and not `occluded` from the origin, takes the beam; the ray continues from their chest along their `aim`. At each leg, if no holder takes it and the ray passes within `LENS_R` of `lens` unoccluded, the leg ends at the lens and `onLens` is true. A leg that hits nothing ends at the first rock it meets or after `REACH` metres. A leg that ends on a holder or the lens is drawn to that point exactly.
  - `create() → { mirrors:[{x,z,by:null|0|1}×2], segs:[], onLens:false, charge:0, solved:false }`, `step`, `prompt`. Rules: a `pressed` walker with no mirror within 1.2 m of a free mirror picks it up; a `pressed` walker carrying one sets it down where they stand. `charge` rises with `dt` while `onLens`, falls at the same rate otherwise, clamped 0..`CHARGE`; `solved` when it reaches `CHARGE`.
- `stepAll`: when `beam.solved` first becomes true, `S.ended = { time: S.time }`.
- Produces (view): the lamp, both mirrors (on stands, or in a walker's hands), the rock outcrop, the beacon tower with its lens, and the beam drawn from `segs` as bright additive tubes. The beacon glows with `charge / CHARGE` and blazes when solved.
- Ending in `game.js`: on `S.ended`, input stops, the camera eases back to a wide view of the island and the lit beacon, and `hud.showEnding({ time, dist: [hostMetres, joinerMetres] })` shows "You walked it together", the time as `m:ss`, and each walker's metres.

- [ ] **Step 1: Write the failing tests**

```js
const { lamp, lens, hint, rocks } = SITES.beam;
const chest = ([x, z]) => [x, heightAt(x, z, DYN_NONE) + 0.9, z];
const aimAt = (from, to) => { const d = to.map((v, i) => v - from[i]); const l = Math.hypot(...d); return d.map((v) => v / l); };
test('with no mirrors the beam leaves the lamp and misses the lens', () => {
  const r = trace([null, null]);
  expect(r.segs).toHaveLength(1); expect(r.onLens).toBe(false);
});
test('no single bounce can reach the lens', () => {
  for (let t = 0.5; t < 40; t += 0.5) {
    const p = lamp.o.map((v, i) => v + lamp.d[i] * t);
    if (occluded(lamp.o, p)) break;
    expect(occluded(p, lens)).toBe(true);
  }
});
test('the designed two-bounce path lights the lens', () => {
  const a = chest(hint.p1), b = chest(hint.p2);
  const r = trace([{ pos: a, aim: aimAt(a, b) }, { pos: b, aim: aimAt(b, lens) }]);
  expect(r.onLens).toBe(true); expect(r.segs).toHaveLength(3);
  expect(r.segs[2].slice(3)).toEqual(lens.map((v) => expect.closeTo(v)));
});
test('aim is forgiving by a few degrees and no more', () => {
  const a = chest(hint.p1), b = chest(hint.p2);
  const yawed = (d, rad) => [d[0] * Math.cos(rad) - d[2] * Math.sin(rad), d[1], d[0] * Math.sin(rad) + d[2] * Math.cos(rad)];
  const go = (rad) => trace([{ pos: a, aim: aimAt(a, b) }, { pos: b, aim: yawed(aimAt(b, lens), rad) }]).onLens;
  expect(go(0.03)).toBe(true); expect(go(0.35)).toBe(false);
});
test('a mirror out of the beam does nothing, whatever it points at', () => {
  const b = chest(hint.p2);
  expect(trace([null, { pos: b, aim: aimAt(b, lens) }]).onLens).toBe(false);
});
const carrying = () => { const s = create(); s.mirrors[0].by = 0; s.mirrors[1].by = 1; return s; };
const pair = (good) => {
  const a = chest(hint.p1), b = chest(hint.p2);
  return [P(hint.p1, { y: a[1] - 0.9, aim: aimAt(a, b) }),
          P(hint.p2, { y: b[1] - 0.9, aim: good ? aimAt(b, lens) : [0, 1, 0] })];
};
const hold = (s, good, t) => { for (let i = 0; i < Math.round(t * 30); i++) step(s, pair(good), 1 / 30); };
test('two seconds on the lens lights the beacon', () => {
  const s = carrying(); hold(s, true, 1.9); expect(s.solved).toBe(false);
  hold(s, true, 0.2); expect(s.solved).toBe(true);
});
test('a flicker does not', () => {
  const s = carrying(); hold(s, true, 1); hold(s, false, 1.5); hold(s, true, 1);
  expect(s.solved).toBe(false);
});
test('picking up and setting down a mirror', () => {
  const s = create(); const m = SITES.beam.mirrors[0];
  step(s, [P(m, { pressed: true }), P(far)], 0.03); expect(s.mirrors[0].by).toBe(0);
  step(s, [P(far, { pressed: true }), P(far)], 0.03);
  expect(s.mirrors[0]).toMatchObject({ by: null, x: far[0], z: far[1] });
});
```

Also in `tests/puzzles.test.js`: with the same carrying, two-bounce set-up inside a full `S`, one `stepAll(S, players, 3600)` leaves `S.beam.solved` false (the clamp), and after 2.1 s of 1/30 steps `S.ended` is `{ time: expect.any(Number) }`.

- [ ] **Step 2: Run** — fail. **Step 3: Implement** `beam.js`, extend `index.js`. **Step 4: Run** — pass.
- [ ] **Step 5: Implement** the view, the mirror-in-hand pose, the ending.
- [ ] **Step 6: Verify** with `?debug`: pick up a mirror, give the other to the stand-in (**T** at the mirror, **I**), stand in the lamp's beam and aim at the stand-in parked at the second spot with **O** set to aim at the lens: the beam bends twice, the beacon charges and lights, the camera pulls back and the ending card shows.

---

### Task 11: Pointing, shouting, waving, sound

**Files:**
- Create: `src/audio.js`
- Modify: `src/game.js`, `src/player/avatar.js`, `src/ui/hud.js`

**Interfaces:**
- Consumes: `q`, `shoutN`, `waveN`, `ay`, `ap` already carried in `p` messages (Task 5).
- Produces (`audio.js`): `createAudio() → { step(), chime(), shout(near: number /*0..1*/), creak(), resume() }` — Web Audio oscillators and noise only; quiet; `resume()` is called on the first click because browsers start audio suspended.
- Behaviour:
  - **Q** held: the avatar's arm points along the walker's aim, and a small bright marker sits where that ray first meets the ground or 40 m out, whichever comes first. The friend sees both.
  - **F**: a ring expands from the shouter over 1.5 s, drawn on top of terrain; the friend hears a tone, louder when nearer.
  - **1**: the avatar waves for 1.2 s.
  - Whenever the friend is off screen, `hud.setFriendArrow(angle)` shows an arrow at the screen edge pointing toward them; it pulses for 2 s after they shout.
  - Footsteps tick with walking speed; a chime plays when `solvedCount(S)` goes up; the gate creaks when it moves.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** in two tabs: point in one tab and see the arm and marker in the other; shout and see the ring and edge arrow; wave and see the wave. Solve The Gate and hear the chime in both.

---

### Task 12: Whole-walk check

**Files:**
- Modify: whatever the checks below turn up.

- [ ] **Step 1:** `npm test` — every test passes.
- [ ] **Step 2:** `npm run build` — finishes with no errors and writes `dist/`.
- [ ] **Step 3: Two tabs, real connection.** Start and join. Both walkers visible and moving in both tabs. Solve The Gate using both tabs. Switch away from the host tab for 30 s with the joiner standing on a plate: on return the gate is in the right state and the joiner was never frozen out. Reload the joiner and rejoin with the same code: it appears beyond the gate with the gate still open.
- [ ] **Step 4: One tab with `?debug`, beach to ending.** Play all five puzzles in order with the stand-in. At each, first try the solo route (do it without using the stand-in) and confirm it cannot be done. Reach the ending card.
- [ ] **Step 5:** Open the game without `?debug` and confirm T, Y, U, I, O, P do nothing and `window.__lr` is undefined.
- [ ] **Step 6:** Read the browser console after both sessions — no errors.
