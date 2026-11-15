// Pebble folk: a rounded stone body on stubby legs, two short arms, small dark eyes
// and a bright scarf. Local −Z is the front, so rotation.y = yaw matches the
// game's yaw convention.
import {
  Group, Mesh, MeshLambertMaterial, IcosahedronGeometry, CapsuleGeometry, SphereGeometry,
  TorusGeometry, BoxGeometry, Color, Vector3, Quaternion,
} from 'three';
import { lerpAngle } from '../core/math.js';
import { WALK } from '../config.js';
import { HOP_SECS, hopHeight } from './hop.js';
import { wornParts } from './wardrobe.js';

const STONE = 0xa9a39b;
const STONE_DARK = 0x8d877f;
const EYE = 0x2b2622;
const WAVE_SECS = 1.2;
const DOWN = new Vector3(0, -1, 0);

const mat = (hex, extra = {}) => new MeshLambertMaterial({ color: hex, flatShading: true, ...extra });

export function createAvatar(colour) {
  const group = new Group();
  const stone = mat(STONE), limb = mat(STONE_DARK);
  const scarfMat = mat(colour, { emissive: new Color(colour).multiplyScalar(0.18) });

  // body: a slightly squashed pebble sitting on the legs; `body` bobs as a whole
  // `lifter` holds body and legs: a hop lifts it, so the shadow and the real position stay put
  const lifter = new Group();
  lifter.name = 'lifter';
  group.add(lifter);
  const body = new Group();
  body.name = 'body';
  lifter.add(body);
  const pebble = new Mesh(new IcosahedronGeometry(0.42, 1), stone);
  pebble.scale.set(1, 1.08, 0.88);
  pebble.position.y = 0.66;
  body.add(pebble);

  // eyes on the front (−Z), a little above the middle
  const eyes = new Group();
  eyes.name = 'eyes';
  eyes.position.set(0, 0.97, -0.27);
  const eyeGeo = new SphereGeometry(0.045, 6, 4);
  for (const sx of [-1, 1]) {
    const e = new Mesh(eyeGeo, mat(EYE));
    e.position.set(sx * 0.11, 0, 0);
    e.scale.set(1, 1.3, 0.6);
    eyes.add(e);
  }
  body.add(eyes);

  // scarf: a ring round the "neck" plus a tail down the back that flutters
  const scarf = new Mesh(new TorusGeometry(0.36, 0.085, 5, 12), scarfMat);
  scarf.name = 'scarf';
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.84;
  scarf.scale.set(1, 0.9, 1);   // the torus lies in XY before rotation: y here is depth
  body.add(scarf);
  const tailPivot = new Group();
  tailPivot.position.set(0.12, 0.84, 0.33);
  const tail = new Mesh(new BoxGeometry(0.13, 0.34, 0.05), scarfMat);
  tail.position.y = -0.16;
  tailPivot.add(tail);
  body.add(tailPivot);

  // legs: pivot at the hip, the leg hangs below
  const legGeo = new CapsuleGeometry(0.1, 0.1, 2, 6);
  const legs = [-1, 1].map((sx) => {
    const pivot = new Group();
    pivot.name = sx < 0 ? 'legL' : 'legR';
    pivot.position.set(sx * 0.17, 0.3, 0);
    const leg = new Mesh(legGeo, limb);
    leg.position.y = -0.15;
    pivot.add(leg);
    lifter.add(pivot);
    return pivot;
  });

  // arms: pivot at the shoulder; the arm hangs along local −Y
  const armGeo = new CapsuleGeometry(0.075, 0.2, 2, 6);
  const arms = [-1, 1].map((sx) => {
    const pivot = new Group();
    pivot.name = sx < 0 ? 'armL' : 'armR';
    pivot.position.set(sx * 0.42, 0.78, 0);
    const arm = new Mesh(armGeo, limb);
    arm.position.y = -0.17;
    pivot.add(arm);
    body.add(pivot);
    return pivot;
  });
  const [armL, armR] = arms;

  // clothing: every piece built once, hidden, under the part it moves with (boots on the legs, gloves
  // on the arms, the rest on the body); `wear` in the view says which are showing
  const partOf = { body, legL: legs[0], legR: legs[1], armL, armR };
  const clothes = [];
  for (let i = 0; i < 10; i++) {
    const meshes = [];
    for (const { on, mesh } of wornParts(i)) {
      mesh.visible = false;
      mesh.traverse((o) => { o.userData.find = i; });
      partOf[on].add(mesh);
      meshes.push(mesh);
    }
    clothes.push(meshes);
  }
  let worn = 0;

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  let yaw = null, phase = 0, swing = 0, lastWave = null, waveT = 0, lastJump = null, hopT = -1, hopFromY = 0;
  const q = new Quaternion(), tmp = new Vector3(), qRest = new Quaternion();
  const invYaw = new Quaternion(), yAxis = new Vector3(0, 1, 0);

  // Carrying pose for a mirror: both hands forward, raised or lowered with the aim's pitch.
  const mirrorArm = (sx, aim) => tmp.set(sx, Math.max(-0.6, Math.min(0.8, aim[1])) - 0.15, -1).normalize();

  // Ease an arm toward pointing along local direction v (or toward rest + swing).
  const aimArm = (arm, v, k) => { q.setFromUnitVectors(DOWN, v); arm.quaternion.slerp(q, k); };

  function update(view, dt) {
    group.position.set(view.x, view.y, view.z);
    // holding a mirror, the walker turns to face where they are looking (the mirror's aim)
    const mirror = !!(view.mirror && view.aim && Math.hypot(view.aim[0], view.aim[2]) > 1e-3);
    const wantYaw = mirror ? Math.atan2(-view.aim[0], -view.aim[2]) : view.yaw;
    yaw = yaw === null ? wantYaw : lerpAngle(yaw, wantYaw, 1 - Math.exp(-12 * dt));
    group.rotation.y = yaw;

    // clothing: show exactly the pieces in the view's wear bitmask
    const wear = Number.isInteger(view.wear) ? view.wear : 0;
    if (wear !== worn) {
      worn = wear;
      clothes.forEach((ms, i) => { const on = !!(wear & (1 << i)); for (const m of ms) m.visible = on; });
    }

    // stride: legs swing with speed, body bobs twice per stride
    const sp = Math.max(0, view.speed || 0);
    const amt = Math.min(1, sp / WALK);
    swing += (amt - swing) * (1 - Math.exp(-10 * dt));
    phase += dt * (4 + 2.2 * sp);
    const s = Math.sin(phase);
    legs[0].rotation.x = s * 0.7 * swing;
    legs[1].rotation.x = -s * 0.7 * swing;
    body.position.y = Math.abs(Math.cos(phase)) * 0.05 * swing;
    tailPivot.rotation.x = 0.15 + swing * (0.5 + 0.15 * Math.sin(phase * 2));

    // wave: a fresh waveN starts a 1.2 s wave with the left arm
    if (lastWave === null) lastWave = view.waveN;
    if (view.waveN !== lastWave) { lastWave = view.waveN; waveT = WAVE_SECS; }
    waveT = Math.max(0, waveT - dt);

    // hop: a fresh jumpN (the count the controller approved) starts one, but only with empty hands
    // (no mirror, timber or flame: those are drawn from where the walker stands and would be left
    // behind). A press in the air is dropped, never queued. The walker's own y is what it stands on,
    // so the lift is the hop's arc less however far that has risen since take-off (a walker landing
    // on a barrel): one smooth arc up and down onto the top.
    let hopped = false;
    const handsFull = !!((view.carrying && !view.mirror) || view.torch);   // a timber or the flame; a mirror hops with you
    if (lastJump === null) lastJump = view.jumpN;
    if (view.jumpN !== lastJump) {
      lastJump = view.jumpN;
      if (hopT < 0 && !handsFull) { hopT = 0; hopFromY = view.y; hopped = true; }
    }
    if (handsFull) hopT = -1;   // picked something up in the air: down at once
    if (hopT >= 0) { hopT += dt; if (hopT >= HOP_SECS) hopT = -1; }
    lifter.position.y = hopT >= 0 ? Math.max(0, hopHeight(hopT) - (view.y - hopFromY)) : 0;

    const k = 1 - Math.exp(-14 * dt);
    invYaw.setFromAxisAngle(yAxis, -yaw);
    const restSwing = (sign) => {
      qRest.setFromAxisAngle(tmp.set(1, 0, 0), -sign * s * 0.5 * swing);
      return qRest;
    };

    // right arm: point > carry > swing
    if (view.pointing && view.aim) {
      tmp.fromArray(view.aim).applyQuaternion(invYaw).normalize();
      aimArm(armR, tmp, k);
    } else if (view.torch) {
      aimArm(armR, tmp.set(0.12, 1, -0.25).normalize(), k);   // the flame held up high
    } else if (mirror) {
      aimArm(armR, mirrorArm(0.22, view.aim), k);
    } else if (view.carrying) {
      aimArm(armR, tmp.set(0.15, -0.25, -1).normalize(), k);
    } else armR.quaternion.slerp(restSwing(-1), k);

    // left arm: wave > carry > swing
    if (waveT > 0) {
      const w = Math.sin((WAVE_SECS - waveT) * 14) * 0.45;
      tmp.set(-0.35 + w, 1, -0.2).normalize();
      aimArm(armL, tmp, k);
    } else if (mirror) {
      aimArm(armL, mirrorArm(-0.22, view.aim), k);
    } else if (view.carrying) {
      aimArm(armL, tmp.set(-0.15, -0.25, -1).normalize(), k);
    } else armL.quaternion.slerp(restSwing(1), k);
    return hopped;   // true on the frame a hop begins (the local walker's whup)
  }

  // The walker this avatar shows has gone (the friend left or is reconnecting): whoever it
  // shows next starts from their own counters, so an old jump or wave is not replayed.
  const forget = () => { lastWave = lastJump = null; waveT = 0; hopT = -1; };

  // how far the body is off its feet right now (a hop): things drawn in its hands elsewhere add this
  const lift = () => lifter.position.y;

  return { group, update, forget, lift };
}
