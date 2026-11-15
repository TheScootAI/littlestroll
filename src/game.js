// Game: renderer, scene, the local walker and the render loop.
import {
  WebGLRenderer, Scene, PCFShadowMap, SRGBColorSpace, Vector3, Mesh, MeshBasicMaterial, SphereGeometry, RingGeometry,
  BufferGeometry, BufferAttribute, Line, LineBasicMaterial, DoubleSide,
} from 'three';
import { MAX_DT, LOGIC_HZ } from './config.js';
import { dirFromYawPitch, lerpAngle } from './core/math.js';
import { createTicker, tickerDrives } from './core/ticker.js';
import { netSnapshot, toPIn, pressTracker } from './net/protocol.js';
import { SITES, heightAt, lookDyn } from './world/layout.js';
import { aimPoint, edgeArrow } from './world/sight.js';
import { createAudio } from './audio.js';
import { clean, createLog, addLine, createGate } from './core/chat.js';
import { CHEST } from './puzzles/beam.js';
import { buildTerrain, followSun } from './world/terrain.js';
import { createPlayer, stepPlayer, needsRespawn, respawn } from './player/controller.js';
import { createInput, readInput } from './player/input.js';
import { createCamera } from './player/camera.js';
import { createAvatar } from './player/avatar.js';
import { endingProgress, endShot } from './core/ending.js';
import { createAll, validState, stepAll, solvedCount, solvedLine, dynOf, promptFor, constraintFor } from './puzzles/index.js';
import { createView as createGateView } from './puzzles/views/gate.js';
import { createView as createSignalView } from './puzzles/views/signal.js';
import { createView as createPlankView } from './puzzles/views/plank.js';
import { createView as createWreckView } from './puzzles/views/wreck.js';
import { createView as createLiftView } from './puzzles/views/lift.js';
import { createView as createBeamView } from './puzzles/views/beam.js';
import { createView as createCausewayView } from './puzzles/views/causeway.js';
import { createView as createBellsView } from './puzzles/views/bells.js';
import { createView as createMarshView } from './puzzles/views/marsh.js';
import { createView as createPillarsView } from './puzzles/views/pillars.js';
import { createView as createRingView } from './puzzles/views/ring.js';
import { createView as createLanternsView } from './puzzles/views/lanterns.js';
import { FINDS, countBy as findsBy, wornMask, news as findNews } from './puzzles/finds.js';
import { createLineQueue } from './core/lines.js';
import { createView as createFindsView } from './puzzles/views/finds.js';
import { createView as createRelayView } from './puzzles/views/relay.js';
import { mustWalk } from './puzzles/relay.js';
import { carrying, splashed } from './puzzles/plank.js';

export const SCARF = [0xf08a3c, 0x2fb5a6];   // host orange, joiner teal

// The ending shot: derived from the layout (see core/ending.js). The camera stands off the tor's
// far side from the Far Isle, a little above and to the side, looking back south over the lit
// great lamp, so the flame fills the upper half of the frame (the card takes the lower half) with
// the Far Isle's summit and the string of islands behind it.
const lampShot = () => {
  const [lx, lz] = SITES.lanterns.lamp;
  return endShot([lx, heightAt(lx, lz) + SITES.lanterns.lampH, lz], SITES.relay.great);
};
const smooth = (t) => t * t * (3 - 2 * t);

const RING_SECS = 1.5;                    // a shout's ring grows and fades over this
const RING_R = 25;                        // metres at the end
const PULSE_SECS = 2;                     // the friend arrow pulses this long after a shout
const FAR = 60;                           // beyond this the friend arrow shows even on screen
const HEARD = 60;                         // a shout is at full volume at 0 m and silent by here
const STEP_M = 2;                         // a footstep tick every this many metres walked

export class Game {
  constructor(canvas, { role = 'host', session = null, debug = false, hud = null, code = null } = {}) {
    this.canvas = canvas;
    this.role = role;
    this.session = session;
    this.debug = debug;
    this.hud = hud;
    this.code = code;
    this.seed = Math.floor(Math.random() * 2 ** 31);   // host's once-chosen integer
    this.solved = 0;
    this.pilot = null;      // ?pilot only: set by main.js; its steering runs from update()
    this.standin = null;    // ?debug only: set by main.js, feeds `remote` like a network `p` message
    this.remote = null;     // null | latest snapshot from the friend
    this.friendPress = pressTracker();   // the friend's eN -> presses
    this.localPress = pressTracker();    // mine
    this.prompt = null;
    this.remoteShown = false;
    this.audio = createAudio();
    this.rings = [];          // live shout rings: { mesh, t }
    this.lastShout = null;    // my shoutN baseline
    this.friendShout = null;  // the friend's shoutN baseline (null while they are away)
    this.pulseUntil = 0;
    this.stepAcc = 0;
    this.gateAmt = 0;
    // "You found the …" lines, one at a time; the little fanfare plays as each one shows
    this.findLines = createLineQueue((line) => { if (!this.S?.ended) { this.hud?.flash(line); this.audio.find(); } });
    this.ending = null;     // set once S.ended appears: { t, shown, from, fromLook, look, fog }
    this.tick = 0;
    this.lastFrame = null;  // performance.now() of the last animation frame (null until start())
    this.lastUpdate = 0;    // performance.now() of the last movement update, whichever clock ran it
    this.idx = role === 'host' ? 0 : 1;

    const r = new WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFShadowMap;
    this.renderer = r;

    this.scene = new Scene();
    buildTerrain(this.scene);
    this.sun = this.scene.getObjectByName('sun');

    this.S = createAll(this.seed);
    this.dyn = dynOf(this.S);
    this.veto = null;
    // one view per puzzle, in trail order; each is { sync(s, ctx, dt) }
    this.views = [
      { key: 'gate', view: createGateView(this.scene) },
      { key: 'signal', view: createSignalView(this.scene) },
      { key: 'plank', view: createPlankView(this.scene) },
      { key: 'plank', view: createWreckView(this.scene) },
      { key: 'lift', view: createLiftView(this.scene) },
      { key: 'beam', view: createBeamView(this.scene) },
      { key: 'beam', view: createCausewayView(this.scene) },
      { key: 'bells', view: createBellsView(this.scene) },
      { key: 'marsh', view: createMarshView(this.scene) },
      { key: 'relay', view: createRelayView(this.scene) },
      { key: 'pillars', view: createPillarsView(this.scene) },
      { key: 'ring', view: createRingView(this.scene) },
      { key: 'lanterns', view: createLanternsView(this.scene) },
      { key: 'finds', view: createFindsView(this.scene) },
    ];
    this.input = createInput(canvas);
    // carrying the relay's flame or an end of the plank: no running, whoever asks (see readInput)
    this.input.mustWalk = () => (!!this.S.relay && mustWalk(this.S.relay, this.idx)) || (!!this.S.plank && carrying(this.S.plank, this.idx));
    this.player = createPlayer(...SITES.spawn[this.idx]);
    this.avatar = createAvatar(SCARF[this.idx]);
    this.scene.add(this.avatar.group);
    this.cam = createCamera(1);
    this.speed = 0;

    this.pointers = [this.makePointer(), this.makePointer()];   // [mine, friend's]

    this.remoteAvatar = createAvatar(SCARF[1 - this.idx]);
    this.remoteAvatar.group.visible = false;
    this.scene.add(this.remoteAvatar.group);

    this.chat = createLog();
    this.chatOut = createGate();
    this.chatIn = createGate();
    this.hud?.enableChat({ onSend: (t) => this.say(t), onOpen: () => this.input.release() });

    this.hint = this.makeHint();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.wireSession();
  }

  // Session wiring: statuses become HUD lines, messages become the friend's state.
  wireSession() {
    const s = this.session;
    this.startTicker();
    if (!s) return;
    const back = { label: 'Back to menu', onClick: () => window.location.reload() };
    s.getWelcome = () => ({ seed: this.seed, solved: this.solved ?? 0 });
    s.onMessage = (m) => this.onNet(m);
    s.onStatus = (st) => {
      const hud = this.hud;
      if (st === 'waiting' || (st === 'lost' && this.role === 'host')) {
        this.clearRemote();
        hud?.setCode(this.code);
        hud?.setStatus('Waiting for your friend…');
      } else if (st === 'connected') {
        hud?.setStatus(null);
        hud?.setCode(null);
      } else if (st === 'reconnecting') {
        this.clearRemote();   // same page, same walker: only the link is being rebuilt
        hud?.setStatus('Reconnecting to your friend…');
      } else if (st === 'lost') {
        this.clearRemote();
        hud?.setStatus("Your friend's stroll has ended.", back);
      } else if (st === 'failed') {
        hud?.setStatus("Couldn't connect. Check the code — and some home networks block direct connections.", back);
      } else if (st === 'version') {
        if (this.role === 'host') hud?.setCode(this.code);
        hud?.setStatus('You and your friend are on different versions — both refresh the page.', back);
      } else if (st === 'full') {
        hud?.setStatus('This stroll already has two people.', back);
      }
    };
  }

  // Movement stays on the render frame; the ticker runs the puzzle rules (host) and
  // keeps the friend informed, even when the tab is hidden and rAF stops.
  startTicker() {
    this.ticker = createTicker(LOGIC_HZ, (dt) => {
      const s = this.session;
      if (this.standin) this.remote = this.standin.pin();
      // ?pilot: when animation frames have stopped (hidden tab, or a pane that is simply not
      // drawn), the walker updates from this clock instead; nothing is rendered
      const now = performance.now();
      if (tickerDrives(this.pilot, now, this.lastFrame)) this.update(this.sinceUpdate(now));
      if (this.role === 'host') this.logicTick(dt);
      if (++this.tick % 2) return;
      if (s && s.status === 'connected') {
        s.send(netSnapshot(this.player, this.input, this.speed));
        if (this.role === 'host') s.send({ t: 's', S: this.S });
      }
    });
  }

  // The friend is gone: forget them, and their eN baseline with them.
  clearRemote() {
    this.remote = null;
    this.friendPress.reset();
    this.remoteAvatar?.forget();
  }

  // [host, joiner] as the puzzle rules see them. `consume` turns eN changes into
  // one-tick `pressed` flags (logic ticks only).
  pins(consume) {
    const inp = readInput(this.input);
    const me = {
      present: true, x: this.player.x, y: this.player.y, z: this.player.z,
      aim: dirFromYawPitch(inp.camYaw, inp.camPitch), hold: !!inp.hold,
      pressed: false,
    };
    const friend = toPIn(this.remote, this.remote?.eN);
    if (consume) {
      me.pressed = this.localPress.seen(inp.eN);
      if (this.remote) friend.pressed = this.friendPress.seen(this.remote.eN);
      else this.friendPress.reset();
    }
    return this.idx === 0 ? [me, friend] : [friend, me];
  }

  logicTick(dt) {
    stepAll(this.S, this.pins(true), dt);
    this.applyState();
  }

  // Derive dyn, the solved count and the "solved" flash from S.
  applyState() {
    this.dyn = dynOf(this.S);
    const n = solvedCount(this.S);
    let flashed = false;
    if (n > this.solved) { this.hud?.flash(solvedLine(n - 1)); this.audio.riff(n - 1, !!this.S.ended); flashed = true; }
    this.solved = n;
    // a too-short piece tipped into the water: splash restarts from 0 (host or joiner alike)
    const sp = this.S.plank?.splash;
    if (Number.isFinite(sp)) { if (splashed(this.splashPrev, sp)) this.audio.splash?.(); this.splashPrev = sp; }
    // a piece of clothing found (host or joiner alike); the first state after a welcome only sets the
    // baseline. Each line waits for a "solved" flash from the same update to finish (that one lasts
    // 3 s), and two found at once show one after the other, 3.2 s apart; nothing is flashed over the ending.
    const found = findNews(this.findPrev, this.S.finds, this.idx);
    for (const line of found.lines) this.findLines.push(line, flashed ? 3200 : 0);
    this.findPrev = found.next;
    const amt = this.S.gate?.amt ?? 0;
    if (Math.abs(amt - this.gateAmt) > 1e-4) this.audio.creak();
    this.gateAmt = amt;
    // a bell's timer jumping back down means it was just rung (host or joiner alike)
    const b = this.S.bells;
    if (b) {
      if (this.bellPrev) { if (b.a < this.bellPrev[0]) this.audio.bell(0); if (b.b < this.bellPrev[1]) this.audio.bell(1); }
      this.bellPrev = [b.a, b.b];
    }
    // the lookout barrier rising or sinking (host or joiner alike); the first state after a welcome only sets the baseline
    const up = !!this.S.signal?.up;
    if (this.spurPrev != null && up !== this.spurPrev) this.audio.creak();
    this.spurPrev = up;
    // a pillar newly rising: a soft knock, at most one per 0.15 s
    const pm = this.dyn.pillars | 0;
    if (pm & ~(this.pillarPrev | 0)) {
      const now = performance.now();
      if (!(now - (this.thudAt ?? -1e9) < 150)) { this.audio.thud(); this.thudAt = now; }
    }
    this.pillarPrev = pm;
    // a stone lit in the ring (the same note right or wrong), and four judged wrong (a dud)
    const rg = this.S.ring;
    if (rg) {
      if (this.ringPrev) {
        if (rg.touched.length > this.ringPrev.n) this.audio.chimeStone(rg.touched.length - 1);
        if (rg.miss < this.ringPrev.miss) this.audio.dud();
      }
      this.ringPrev = { n: rg.touched.length, miss: rg.miss };
    }
    // the flame changing hands (whoosh), and the great brazier catching (roar)
    const rl = this.S.relay;
    if (rl) {
      if (this.relayPrev) {
        if (rl.holder !== null && this.relayPrev.holder !== null && rl.holder !== this.relayPrev.holder) this.audio.pass();
        if (rl.solved && !this.relayPrev.solved) this.audio.roar();
      }
      this.relayPrev = { holder: rl.holder, solved: rl.solved };
    }
    // a lantern catching or being topped up (its time jumps up): a whoosh; all six alight: the roar
    const ln = this.S.lanterns;
    if (ln) {
      if (this.lanternPrev) {
        if (ln.t.some((v, i) => v > this.lanternPrev.t[i] + 1e-6) && !ln.solved) this.audio.pass();
        if (ln.solved && !this.lanternPrev.solved) this.audio.roar();
      }
      this.lanternPrev = { t: [...ln.t], solved: ln.solved };
    }
  }

  // One chat line from this walker (the box or the pilot). True when it was sent / shown.
  say(text) {
    const line = clean(text);
    if (!line) return false;
    const t = performance.now();
    if (!this.chatOut.allow(t)) return false;
    if (this.session && this.session.status !== 'connected') {
      const msg = "Not delivered — your friend isn't connected";
      addLine(this.chat, 'system', msg, t);
      this.hud?.chatLine(null, msg);
      return false;
    }
    addLine(this.chat, this.idx, line, t);
    this.hud?.chatLine(this.idx, line);
    if (this.session) this.session.send({ t: 'c', text: line });
    return true;
  }

  onNet(m) {
    if (m.t === 'p') this.remote = m;
    else if (m.t === 'c') {
      const t = performance.now();
      if (!this.chatIn.allow(t)) return;
      addLine(this.chat, 1 - this.idx, m.text, t);
      this.hud?.chatLine(1 - this.idx, m.text);
      this.audio.blip();
    }
    else if (m.t === 's') {
      if (this.role !== 'host' && validState(m.S)) {
        // adopt only what validates; a bad candidate leaves the previous S in place
        const prev = this.S;
        try { this.S = m.S; this.applyState(); } catch { this.S = prev; this.applyState(); }
      }
    } else if (m.t === 'welcome') {
      this.seed = m.seed;
      this.S = createAll(m.seed);
      this.dyn = dynOf(this.S);
      this.solved = m.solved;
      this.bellPrev = null; this.spurPrev = null; this.pillarPrev = 0; this.ringPrev = null;
      this.relayPrev = null; this.lanternPrev = null; this.findPrev = null; this.splashPrev = null;
      this.findLines.clear();
      // only the first welcome spawns; one after a reconnect keeps position, distance, camera
      if (!this.welcomedOnce) respawn(this.player, m.solved, this.idx);
      this.welcomedOnce = true;
    }
  }

  // Is walker i carrying one of the beam's mirrors?
  holdsMirror(i) {
    return this.S.beam.mirrors.some((m) => m.by === i);
  }

  // Is walker i holding an end of one of the wreck's timbers (and none yet laid)?
  holdsPlank(i) {
    return carrying(this.S.plank, i);
  }

  // Is walker i carrying the relay's flame?
  holdsFlame(i) {
    return this.S.relay?.holder === i && !this.S.relay.solved;
  }

  updateRemote(dt) {
    const av = this.remoteAvatar, r = this.remote;
    if (!r) { av.group.visible = false; this.remoteShown = false; return; }
    const g = av.group;
    if (!this.remoteShown || Math.hypot(r.x - this.rx, r.z - this.rz) > 10) {
      this.rx = r.x; this.ry = r.y; this.rz = r.z; this.ryaw = r.yaw;
      this.remoteShown = true;
    } else {
      const k = 1 - Math.exp(-dt / 0.1);
      this.rx += (r.x - this.rx) * k;
      this.ry += (r.y - this.ry) * k;
      this.rz += (r.z - this.rz) * k;
      this.ryaw = lerpAngle(this.ryaw, r.yaw, k);
    }
    g.visible = true;
    av.update({
      x: this.rx, y: this.ry, z: this.rz, yaw: this.ryaw, speed: r.speed,
      aim: dirFromYawPitch(r.ay, r.ap), pointing: r.q, waveN: r.waveN, jumpN: r.jumpN,
      carrying: this.holdsPlank(1 - this.idx) || this.holdsMirror(1 - this.idx), mirror: this.holdsMirror(1 - this.idx), torch: this.holdsFlame(1 - this.idx),
      wear: wornMask(this.S.finds, 1 - this.idx),
    }, dt);
  }

  // HUD prompt and every puzzle view. Views only read S.
  syncPuzzles(pins, inp, dt) {
    const prompt = promptFor(this.S, this.idx, pins);
    if (prompt !== this.prompt) { this.prompt = prompt; this.hud?.setPrompt(prompt); }
    const p = this.player;
    // `lift`: how far each walker's body is off its feet in a hop, for what a view draws in their hands
    const mine = { present: true, x: p.x, y: p.y, z: p.z, yaw: p.yaw, aim: dirFromYawPitch(inp.camYaw, inp.camPitch), lift: this.avatar.lift() };
    const theirs = this.remote && this.remoteShown
      ? { present: true, x: this.rx, y: this.ry, z: this.rz, yaw: this.ryaw, aim: dirFromYawPitch(this.remote.ay, this.remote.ap), lift: this.remoteAvatar.lift() }
      : { present: false };
    const ctx = { players: this.idx === 0 ? [mine, theirs] : [theirs, mine], localIdx: this.idx, dyn: this.dyn };
    for (const v of this.views) v.view.sync(this.S[v.key], ctx, dt);
  }

  // A pointer: a small bright marker where the ray meets the ground, and a faint line from the hand.
  makePointer() {
    const marker = new Mesh(new SphereGeometry(0.16, 12, 8), new MeshBasicMaterial({ color: 0xffe35a, fog: false }));
    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
    const line = new Line(lineGeo, new LineBasicMaterial({ color: 0xffe35a, transparent: true, opacity: 0.35 }));
    line.frustumCulled = false;
    marker.visible = line.visible = false;
    this.scene.add(marker, line);
    return { marker, line };
  }

  // Show (or hide) one walker's pointer. `arm` is that avatar's right-arm pivot.
  updatePointer(ptr, avatar, on, pos, aim) {
    ptr.marker.visible = ptr.line.visible = on;
    if (!on) return;
    const chest = [pos[0], pos[1] + CHEST, pos[2]];
    const hit = aimPoint(chest, aim, lookDyn(this.dyn));   // looking, not standing: never the live marsh mask
    const hand = avatar.group.getObjectByName('armR').getWorldPosition(new Vector3());
    hand.x += aim[0] * 0.5; hand.y += aim[1] * 0.5; hand.z += aim[2] * 0.5;
    ptr.marker.position.set(hit[0], hit[1] + 0.1, hit[2]);
    ptr.line.geometry.attributes.position.set([hand.x, hand.y, hand.z, hit[0], hit[1] + 0.1, hit[2]]);
    ptr.line.geometry.attributes.position.needsUpdate = true;
  }

  // A ring at the shouter's feet, drawn over everything.
  spawnRing(x, y, z, colour) {
    const mat = new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: DoubleSide, fog: false });
    const mesh = new Mesh(new RingGeometry(0.92, 1, 64), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.15, z);
    mesh.renderOrder = 999;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.rings.push({ mesh, t: 0 });
  }

  // Shouts, pointers, rings, the friend arrow and footsteps.
  updateComms(inp, dt, moved) {
    const p = this.player, r = this.remote;
    // my shout: a rising shoutN
    if (this.lastShout === null) this.lastShout = inp.shoutN;
    if (inp.shoutN !== this.lastShout) { this.lastShout = inp.shoutN; this.spawnRing(p.x, p.y, p.z, SCARF[this.idx]); }
    // the friend's shout: a rising shoutN in their snapshot
    if (!r) this.friendShout = null;
    else {
      if (this.friendShout === null) this.friendShout = r.shoutN;
      if (r.shoutN !== this.friendShout) {
        this.friendShout = r.shoutN;
        this.pulseUntil = performance.now() + PULSE_SECS * 1000;
        if (this.remoteShown) {
          this.spawnRing(this.rx, this.ry, this.rz, SCARF[1 - this.idx]);
          this.audio.shout(1 - Math.min(1, Math.hypot(this.rx - p.x, this.rz - p.z) / HEARD));
        }
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const g = this.rings[i];
      g.t += dt;
      const k = g.t / RING_SECS;
      if (k >= 1) { this.scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); this.rings.splice(i, 1); continue; }
      g.mesh.scale.setScalar(0.5 + RING_R * smooth(k));
      g.mesh.material.opacity = 0.9 * (1 - k);
    }
    // pointers
    this.updatePointer(this.pointers[0], this.avatar, !!inp.q && !this.ending, [p.x, p.y, p.z], dirFromYawPitch(inp.camYaw, inp.camPitch));
    const show = !!(r && this.remoteShown && r.q) && !this.ending;
    this.updatePointer(this.pointers[1], this.remoteAvatar, show, [this.rx, this.ry, this.rz], show ? dirFromYawPitch(r.ay, r.ap) : [0, 0, -1]);
    // footsteps: one soft tick per STEP_M walked
    if (moved > 0 && moved < 1 && this.speed > 0.5) {
      this.stepAcc += moved;
      if (this.stepAcc >= STEP_M) { this.stepAcc -= STEP_M; this.audio.step(); }
    }
    this.updateArrow(inp);
  }

  // The friend arrow: only while they are present and off screen (or very far away).
  updateArrow(inp) {
    if (!this.hud) return;
    if (!this.remote || !this.remoteShown || this.ending) { this.hud.setFriendArrow(null); return; }
    const c = this.cam.camera, p = this.player;
    c.updateMatrixWorld();
    const to = new Vector3(this.rx, this.ry + CHEST, this.rz);
    const fwd = c.getWorldDirection(new Vector3());
    const ahead = to.clone().sub(c.position).dot(fwd) > 0;
    const ndc = to.clone().project(c);
    const onScreen = ahead && Math.abs(ndc.x) < 0.92 && Math.abs(ndc.y) < 0.92;
    const far = Math.hypot(this.rx - p.x, this.rz - p.z) > FAR;
    if (onScreen && !far) { this.hud.setFriendArrow(null); return; }
    this.hud.setFriendArrow(edgeArrow(inp.camYaw, [p.x, p.z], [this.rx, this.rz]), performance.now() < this.pulseUntil);
  }

  makeHint() {
    const ui = document.getElementById('ui');
    if (!ui) return null;
    const el = document.createElement('div');
    el.textContent = 'Click to look around · WASD to stroll · Shift to run · Space to jump · Enter to chat';
    Object.assign(el.style, {
      position: 'absolute', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
      padding: '8px 16px', borderRadius: '999px', background: 'rgba(60, 48, 40, 0.55)',
      color: '#fff7ea', font: '500 15px/1.3 system-ui, sans-serif', letterSpacing: '0.02em',
      transition: 'opacity 0.6s', whiteSpace: 'nowrap',
    });
    ui.appendChild(el);
    return el;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.camera.aspect = w / h;
    this.cam.camera.updateProjectionMatrix();
  }

  // Seconds since the last movement update (frame- or ticker-driven), so the two clocks
  // never count the same stretch of time twice.
  sinceUpdate(now) {
    const dt = Math.min(Math.max((now - this.lastUpdate) / 1000, 0), MAX_DT);
    this.lastUpdate = Math.max(this.lastUpdate, now);
    return dt;
  }

  start() {
    const frame = (now) => {
      now = performance.now();
      this.lastFrame = now;
      this.update(this.sinceUpdate(now));
      this.render();
      this.raf = requestAnimationFrame(frame);
    };
    // one frame straight away so the island is on screen before the first rAF
    this.lastFrame = this.lastUpdate = performance.now();
    this.update(0);
    this.render();
    this.raf = requestAnimationFrame(frame);
  }

  update(dt) {
    dt = Math.min(Math.max(dt, 0), MAX_DT);
    this.pilot?._tick(dt);
    if (this.S.ended && !this.ending) this.beginEnding();
    const inp = readInput(this.input);
    const p = this.player;

    const pins = this.pins(false);
    this.veto = constraintFor(this.S, this.idx, pins);
    const before = p.dist;
    // once the walk has ended the walkers stand still where they are
    const hands = this.holdsPlank(this.idx) || this.holdsMirror(this.idx);   // a timber or a mirror
    const move = { ...inp, noHop: this.holdsPlank(this.idx) || this.holdsFlame(this.idx) };   // a timber or the flame: no hop (a mirror hops with you)
    if (this.ending) { move.mx = 0; move.mz = 0; move.run = false; }
    const hopN = p.hopN;
    stepPlayer(p, move, dt, this.dyn, this.veto);
    if (needsRespawn(p, this.dyn)) respawn(p, this.solved, this.idx);
    this.standin?.update(dt);
    if (dt > 0) this.speed = (p.dist - before) / dt;

    this.avatar.update({
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: this.speed,
      aim: dirFromYawPitch(inp.camYaw, inp.camPitch),
      pointing: !!inp.q, waveN: inp.waveN, jumpN: p.hopN,   // the hops the controller approved, not the presses
      carrying: hands, mirror: this.holdsMirror(this.idx), torch: this.holdsFlame(this.idx),
      wear: wornMask(this.S.finds, this.idx),
    }, dt);
    if (p.hopN !== hopN) this.audio.hop();   // only the local walker's own approved hop makes the sound
    this.updateRemote(dt);
    this.syncPuzzles(pins, inp, dt);
    if (this.ending) this.updateEnding(dt);
    else this.cam.update(p, inp, lookDyn(this.dyn), dt);   // the camera only looks
    this.updateComms(inp, dt, p.dist - before);
    if (this.sun) followSun(this.sun, p.x, p.y, p.z);

    if (this.hint && this.input.captured) {
      const el = this.hint;
      this.hint = null;
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 700);
    }
  }

  // The last puzzle is solved: stop taking movement, let go of the pointer, and start the pull-back.
  beginEnding() {
    const c = this.cam.camera, p = this.player;
    this.ending = {
      started: performance.now(), time: this.S.ended.time, shown: false,
      shot: (() => { const s = lampShot(); return { pos: new Vector3(...s.pos), look: new Vector3(...s.look) }; })(),
      from: c.position.clone(),
      fromLook: new Vector3(p.x, p.y + 1.3, p.z),
      look: new Vector3(),
      fog: this.scene.fog ? [this.scene.fog.near, this.scene.fog.far] : null,
    };
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.prompt = null;
    this.hud?.setPrompt(null);
    if (this.hint) { this.hint.remove(); this.hint = null; }
  }

  // Ease the camera to the wide shot over END_SECS, then show the card.
  updateEnding(dt) {
    const e = this.ending, c = this.cam.camera;
    const { k, card } = endingProgress((performance.now() - e.started) / 1000);   // wall time, not summed dt
    c.position.copy(e.from).lerp(e.shot.pos, k);
    e.look.copy(e.fromLook).lerp(e.shot.look, k);
    c.lookAt(e.look);
    if (e.fog) {                            // let the haze fall back so the whole island shows
      this.scene.fog.near = e.fog[0] + (200 - e.fog[0]) * k;
      this.scene.fog.far = e.fog[1] + (560 - e.fog[1]) * k;
    }
    if (!e.shown && card) {
      const mine = this.player.dist, theirs = this.remote?.dist ?? 0;
      this.hud?.showEnding({ time: e.time, dist: this.idx === 0 ? [mine, theirs] : [theirs, mine], finds: [findsBy(this.S.finds, this.idx), findsBy(this.S.finds, 1 - this.idx), FINDS] });
      e.shown = true;
    }
  }

  render() {
    this.renderer.render(this.scene, this.cam.camera);
  }
}
