import { describe, test, expect } from 'vitest';
import { Box3, Vector3, Color } from 'three';
import { createAvatar } from '../src/player/avatar.js';
import { hopHeight } from '../src/player/hop.js';

const view = (o = {}) => ({ x: 0, y: 0, z: 0, yaw: 0, speed: 0, aim: [0, 0, -1], pointing: false, carrying: false, waveN: 0, jumpN: 0, ...o });
const run = (a, v, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) a.update(v, 1 / 60); };

describe('avatar', () => {
  test('is about 1.1 m tall, stands on its feet and casts shadows', () => {
    const a = createAvatar(0xf08a3c);
    run(a, view(), 0.2);
    // what is shown: the clothes it is not wearing are there but hidden, and a hat is tall
    a.group.updateMatrixWorld(true);
    const box = new Box3();
    a.group.traverse((o) => { let on = o.isMesh; for (let q = o; q && on; q = q.parent) on = q.visible; if (on) box.expandByObject(o); });
    expect(box.max.y - box.min.y).toBeGreaterThan(0.95);
    expect(box.max.y - box.min.y).toBeLessThan(1.3);
    expect(box.min.y).toBeGreaterThan(-0.05);
    let meshes = 0, shadow = 0;
    a.group.traverse((o) => { if (o.isMesh) { meshes++; if (o.castShadow) shadow++; } });
    expect(meshes).toBeGreaterThan(6);
    expect(shadow).toBe(meshes);
  });

  test('the scarf is the given colour', () => {
    for (const hex of [0xf08a3c, 0x2fb5a6]) {
      const a = createAvatar(hex);
      const scarf = a.group.getObjectByName('scarf');
      expect(scarf.material.color.equals(new Color(hex))).toBe(true);
    }
  });

  test('follows the view position and eases toward its yaw', () => {
    const a = createAvatar(0xf08a3c);
    a.update(view(), 1 / 60);   // the first view places it outright
    a.update(view({ x: 3, y: 2, z: -4, yaw: 1 }), 1 / 60);
    expect(a.group.position.toArray()).toEqual([3, 2, -4]);
    expect(a.group.rotation.y).toBeGreaterThan(0);
    expect(a.group.rotation.y).toBeLessThan(1);
    run(a, view({ x: 3, y: 2, z: -4, yaw: 1 }), 2);
    expect(a.group.rotation.y).toBeCloseTo(1, 3);
  });

  test('faces −Z at yaw 0: the eyes are on the front', () => {
    const a = createAvatar(0xf08a3c);
    run(a, view(), 0.1);
    const eyes = a.group.getObjectByName('eyes');
    expect(eyes.getWorldPosition(new Vector3()).z).toBeLessThan(-0.2);
  });

  test('legs swing when walking and are still when standing', () => {
    const a = createAvatar(0xf08a3c);
    const leg = a.group.getObjectByName('legL');
    run(a, view(), 1);
    expect(Math.abs(leg.rotation.x)).toBeLessThan(0.02);
    let max = 0;
    for (let i = 0; i < 60; i++) { a.update(view({ speed: 3.2 }), 1 / 60); max = Math.max(max, Math.abs(leg.rotation.x)); }
    expect(max).toBeGreaterThan(0.3);
  });

  test('pointing raises the right arm along aim; carrying holds both forward', () => {
    const a = createAvatar(0xf08a3c);
    const armR = a.group.getObjectByName('armR'), armL = a.group.getObjectByName('armL');
    const along = (arm) => new Vector3(0, -1, 0).applyQuaternion(arm.getWorldQuaternion(new (arm.quaternion.constructor)()));
    run(a, view({ pointing: true, aim: [0, 0.5, -0.866] }), 1);
    const d = along(armR);
    expect(d.z).toBeLessThan(-0.7); expect(d.y).toBeGreaterThan(0.3);
    run(a, view({ carrying: true }), 1);
    expect(along(armR).z).toBeLessThan(-0.7);
    expect(along(armL).z).toBeLessThan(-0.7);
  });

  test('holding a mirror turns the walker to face the aim, both hands forward and raised with it', () => {
    const a = createAvatar(0xf08a3c);
    const armR = a.group.getObjectByName('armR'), armL = a.group.getObjectByName('armL');
    const along = (arm) => new Vector3(0, -1, 0).applyQuaternion(arm.getWorldQuaternion(new (arm.quaternion.constructor)()));
    // body yaw says "face -Z", aim says "look +X and up": the mirror wins
    run(a, view({ yaw: 0, mirror: true, carrying: true, aim: [0.866, 0.5, 0] }), 1);
    expect(a.group.rotation.y).toBeCloseTo(-Math.PI / 2, 2);
    for (const arm of [armR, armL]) { expect(along(arm).x).toBeGreaterThan(0.7); expect(along(arm).y).toBeGreaterThan(0.1); }
    run(a, view({ yaw: 0, mirror: false }), 1);
    expect(a.group.rotation.y).toBeCloseTo(0, 2);
  });

  test('a new waveN plays a wave that ends after about 1.2 s', () => {
    const a = createAvatar(0xf08a3c);
    const armL = a.group.getObjectByName('armL');
    run(a, view(), 0.5);
    const rest = armL.quaternion.clone();
    run(a, view({ waveN: 1 }), 0.6);
    expect(armL.quaternion.angleTo(rest)).toBeGreaterThan(1.5);
    run(a, view({ waveN: 1 }), 1.5);
    expect(armL.quaternion.angleTo(rest)).toBeLessThan(0.1);
  });

  const lift = (a) => new Box3().setFromObject(a.group).min.y;

  test('hopHeight: zero outside the hop, one smooth peak of about 0.7 m, never negative', () => {
    expect(hopHeight(-1)).toBe(0); expect(hopHeight(0)).toBe(0);
    expect(hopHeight(0.5)).toBe(0); expect(hopHeight(0.6)).toBe(0); expect(hopHeight(99)).toBe(0);
    let peak = 0, at = 0, prev = 0, ups = 0, downs = 0;
    for (let i = 0; i <= 600; i++) {
      const t = i / 1000, h = hopHeight(t);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(Math.abs(h - prev)).toBeLessThan(0.02);   // continuous
      if (h > prev + 1e-9) ups++; else if (h < prev - 1e-9) downs++;
      if (h > peak) { peak = h; at = t; }
      prev = h;
    }
    expect(peak).toBeGreaterThan(0.6); expect(peak).toBeLessThan(0.8);
    expect(at).toBeGreaterThan(0.2); expect(at).toBeLessThan(0.3);
    // rises, then falls: one hump
    for (let t = 0.01; t < at - 0.01; t += 0.01) expect(hopHeight(t + 0.01)).toBeGreaterThan(hopHeight(t));
    for (let t = at + 0.01; t < 0.49; t += 0.01) expect(hopHeight(t + 0.01)).toBeLessThan(hopHeight(t));
  });

  test('a rise in jumpN lifts the whole body for about half a second, then it lands where it took off', () => {
    const a = createAvatar(0xf08a3c);
    run(a, view({ y: 1.5 }), 0.3);
    const rest = lift(a);
    let max = 0;
    for (let i = 0; i < 30; i++) { a.update(view({ y: 1.5, jumpN: 1 }), 1 / 60); max = Math.max(max, lift(a) - rest); }
    expect(max).toBeGreaterThan(0.5);
    expect(a.group.position.y).toBe(1.5);   // the walker's real y is never touched
    run(a, view({ y: 1.5, jumpN: 1 }), 0.4);
    expect(lift(a)).toBeCloseTo(rest, 3);
  });

  test('the lift follows hopHeight with steady ground; when the ground under the hop rises the lift shrinks by the same amount and the body never sinks below it', () => {
    const lifter = (a) => a.group.getObjectByName('lifter').position.y;
    const a = createAvatar(0xf08a3c);
    run(a, view({ y: 1 }), 0.2);
    a.update(view({ y: 1, jumpN: 1 }), 0);                // take-off frame
    let t = 0;
    for (let i = 0; i < 12; i++) { a.update(view({ y: 1, jumpN: 1 }), 1 / 60); t += 1 / 60; expect(lifter(a)).toBeCloseTo(hopHeight(t), 6); }
    // a second hop, the ground rising by 0.9 during it (a walker landing on a barrel)
    const b = createAvatar(0xf08a3c);
    run(b, view({ y: 1 }), 0.3);
    b.update(view({ y: 1, jumpN: 1 }), 0);
    t = 0;
    for (let i = 0; i < 40; i++) {
      t += 1 / 60;
      const y = 1 + (t > 0.2 ? 0.9 : 0);
      b.update(view({ y, jumpN: 1 }), 1 / 60);
      const lift = Math.max(0, hopHeight(t) - (y - 1));
      expect(lifter(b)).toBeCloseTo(t < 0.5 ? lift : 0, 6);
      expect(y + lifter(b)).toBeGreaterThanOrEqual(y - 1e-9);
      expect(y + lifter(b)).toBeGreaterThanOrEqual(1 + Math.min(hopHeight(t), 0.9 * (t > 0.2)) - 1e-9);
    }
    run(b, view({ y: 1.9, jumpN: 1 }), 0.2);
    expect(lifter(b)).toBe(0);                             // once the hop's time is up
  });

  test('the hop lifts the body but not the group (the shadow stays on the ground)', () => {
    const a = createAvatar(0xf08a3c);
    run(a, view(), 0.2);
    run(a, view({ jumpN: 1 }), 0.25);
    expect(a.group.position.y).toBe(0);
    expect(a.group.getObjectByName('body').getWorldPosition(new Vector3()).y).toBeGreaterThan(0.4);
    for (const n of ['legL', 'legR', 'armL', 'armR', 'scarf']) expect(a.group.getObjectByName(n).getWorldPosition(new Vector3()).y).toBeGreaterThan(0.4);
  });

  test('the first jumpN an avatar sees is a baseline, not a hop', () => {
    const a = createAvatar(0xf08a3c);
    run(a, view({ jumpN: 7 }), 0.3);
    const rest = lift(a);
    run(a, view({ jumpN: 7 }), 0.3);
    expect(lift(a)).toBeCloseTo(rest, 3);
    expect(a.update(view({ jumpN: 7 }), 1 / 60)).toBeFalsy();
  });

  test('forget(): a friend who reloads and comes back with a lower jumpN does not hop on sight', () => {
    const a = createAvatar(0xf08a3c);
    run(a, view({ jumpN: 3 }), 0.3);
    const rest = lift(a);
    a.forget();
    run(a, view({ jumpN: 0 }), 0.25);
    expect(lift(a)).toBeCloseTo(rest, 3);
    run(a, view({ jumpN: 1 }), 0.25);            // and the next real jump still shows
    expect(lift(a) - rest).toBeGreaterThan(0.5);
  });

  test('a hop ends at once when the hands fill, so nothing carried is left behind', () => {
    for (const hands of [{ carrying: true }, { torch: true }]) {
      const a = createAvatar(0xf08a3c);
      run(a, view(), 0.2);
      const rest = lift(a);
      run(a, view({ jumpN: 1 }), 0.2);
      expect(lift(a) - rest).toBeGreaterThan(0.3);
      run(a, view({ ...hands, jumpN: 1 }), 0.05);
      expect(lift(a)).toBeCloseTo(rest, 3);
    }
  });

  test('update says when a hop starts', () => {
    const a = createAvatar(0xf08a3c);
    a.update(view(), 1 / 60);
    expect(a.update(view({ jumpN: 1 }), 1 / 60)).toBe(true);
    expect(a.update(view({ jumpN: 1 }), 1 / 60)).toBeFalsy();
  });

  test('a rise during a hop does not restart it; the press is not remembered either', () => {
    const a = createAvatar(0xf08a3c);
    run(a, view(), 0.2);
    const rest = lift(a);
    run(a, view({ jumpN: 1 }), 0.25);   // near the top
    const top = lift(a) - rest;
    a.update(view({ jumpN: 2 }), 1 / 60);   // a press at the top: no restart
    expect(lift(a) - rest).toBeLessThan(top + 0.05);
    run(a, view({ jumpN: 2 }), 0.4);        // landed
    expect(lift(a)).toBeCloseTo(rest, 3);
    run(a, view({ jumpN: 2 }), 0.3);        // and it did not queue a hop for later
    expect(lift(a)).toBeCloseTo(rest, 3);
    run(a, view({ jumpN: 3 }), 0.25);       // a fresh press after landing hops
    expect(lift(a) - rest).toBeGreaterThan(0.5);
  });

  test('a walker carrying something does not hop: a timber, a mirror, or the flame', () => {
    for (const hands of [{ carrying: true }, { torch: true }]) {
      const a = createAvatar(0xf08a3c);
      run(a, view(hands), 0.2);
      const rest = lift(a);
      run(a, view({ ...hands, jumpN: 1 }), 0.25);
      expect(lift(a)).toBeCloseTo(rest, 3);
    }
  });

  test('hopping while pointing and waving: arms still do their jobs', () => {
    const a = createAvatar(0xf08a3c);
    const armR = a.group.getObjectByName('armR');
    run(a, view({ pointing: true, aim: [0, 0, -1] }), 0.5);
    const q = armR.quaternion.clone();
    run(a, view({ pointing: true, aim: [0, 0, -1], jumpN: 1 }), 0.3);
    expect(armR.quaternion.angleTo(q)).toBeLessThan(0.1);
  });

  describe('clothing', () => {
    const PARTS = ['body', 'legL', 'legR', 'armL', 'armR'];
    const ownerOf = (m) => { for (let o = m.parent; o; o = o.parent) if (PARTS.includes(o.name)) return o.name; return null; };
    const clothes = (a) => { const out = []; a.group.traverse((o) => { if (o.isMesh && o.userData.find !== undefined) out.push(o); }); return out; };
    const shown = (a) => clothes(a).filter((m) => { for (let o = m; o; o = o.parent) if (!o.visible) return false; return true; });
    const wearing = (mask) => { const a = createAvatar(0xf08a3c); run(a, view({ wear: mask }), 0.1); return a; };
    const where = { 0: ['body'], 1: ['legL', 'legR'], 2: ['body'], 3: ['body'], 4: ['body'], 5: ['body'], 6: ['body'], 7: ['body'], 8: ['armL', 'armR'], 9: ['body'] };

    test('wear 0 (or no wear at all) shows no clothing, but every piece is built', () => {
      for (const v of [view(), view({ wear: 0 })]) {
        const a = createAvatar(0xf08a3c);
        run(a, v, 0.1);
        expect(shown(a)).toHaveLength(0);
        expect(new Set(clothes(a).map((m) => m.userData.find)).size).toBe(10);
      }
    });
    test('one bit set shows exactly that piece, under the right part', () => {
      for (let i = 0; i < 10; i++) {
        const a = wearing(1 << i);
        const on = shown(a);
        expect(on.length, `piece ${i}`).toBeGreaterThan(0);
        expect(new Set(on.map((m) => m.userData.find)), `piece ${i}`).toEqual(new Set([i]));
        expect(on.length).toBe(clothes(a).filter((m) => m.userData.find === i).length);
        expect([...new Set(on.map(ownerOf))].sort(), `piece ${i}`).toEqual([...where[i]].sort());
      }
    });
    test('boots come in a pair, one on each leg; gloves one on each arm', () => {
      for (const [i, p] of [[1, 'leg'], [8, 'arm']]) {
        const a = wearing(1 << i);
        for (const side of ['L', 'R']) expect(shown(a).filter((m) => ownerOf(m) === p + side).length).toBeGreaterThan(0);
      }
    });
    test('changing wear hides what is no longer worn and shows what now is', () => {
      const a = wearing(0b1111111111);
      expect(new Set(shown(a).map((m) => m.userData.find)).size).toBe(10);
      run(a, view({ wear: 1 << 9 }), 0.05);
      expect(new Set(shown(a).map((m) => m.userData.find))).toEqual(new Set([9]));
      run(a, view({ wear: (1 << 2) | (1 << 4) }), 0.05);
      expect(new Set(shown(a).map((m) => m.userData.find))).toEqual(new Set([2, 4]));
      run(a, view({ wear: 0 }), 0.05);
      expect(shown(a)).toHaveLength(0);
    });
    test('clothing swings with its part: boots with the legs, gloves with the arms', () => {
      const a = wearing(0b1100000010);
      const boot = shown(a).find((m) => m.userData.find === 1 && ownerOf(m) === 'legL');
      const rest = boot.getWorldPosition(new Vector3());
      run(a, view({ speed: 3, wear: 0b1100000010 }), 0.4);
      expect(boot.getWorldPosition(new Vector3()).distanceTo(rest)).toBeGreaterThan(0.02);
    });
    test('no piece covers either eye from the front, all worn at once', () => {
      const a = wearing(0b1111111111);
      const eyes = [];
      a.group.getObjectByName('eyes').children.forEach((e) => eyes.push(e.getWorldPosition(new Vector3())));
      expect(eyes).toHaveLength(2);
      for (const m of shown(a)) {
        const b = new Box3().setFromObject(m);
        for (const e of eyes) {
          const over = e.x > b.min.x && e.x < b.max.x && e.y > b.min.y && e.y < b.max.y && b.min.z < e.z;
          expect(over, `piece ${m.userData.find} covers an eye`).toBe(false);
        }
      }
    });
    test('clothing stays small and low: fully dressed, pirate hat and all, a walker is under 1.45 m and every mesh casts a shadow', () => {
      const a = wearing(0b1111111111);
      const box = new Box3().setFromObject(a.group);
      expect(box.max.y - box.min.y).toBeLessThan(1.45);
      expect(box.min.y).toBeGreaterThan(-0.05);
      expect(clothes(a).every((m) => m.castShadow)).toBe(true);
      let tris = 0;
      for (const m of clothes(a)) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      expect(tris).toBeLessThan(1200);
    });
    test('the scarf stays uncovered: nothing worn overlaps the scarf ring\'s middle front', () => {
      const a = wearing(0b1111111111);
      const sc = new Box3().setFromObject(a.group.getObjectByName('scarf'));
      const front = new Vector3((sc.min.x + sc.max.x) / 2, 0.84, sc.min.z + 0.02);
      for (const m of shown(a)) expect(new Box3().setFromObject(m).containsPoint(front), `piece ${m.userData.find}`).toBe(false);
    });
  });
});
