import { describe, test, expect } from 'vitest';
import { Box3, Vector3, Color } from 'three';
import { createAvatar } from '../src/player/avatar.js';

const view = (o = {}) => ({ x: 0, y: 0, z: 0, yaw: 0, speed: 0, aim: [0, 0, -1], pointing: false, carrying: false, waveN: 0, ...o });
const run = (a, v, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) a.update(v, 1 / 60); };

describe('avatar', () => {
  test('is about 1.1 m tall, stands on its feet and casts shadows', () => {
    const a = createAvatar(0xf08a3c);
    run(a, view(), 0.2);
    const box = new Box3().setFromObject(a.group);
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
});
