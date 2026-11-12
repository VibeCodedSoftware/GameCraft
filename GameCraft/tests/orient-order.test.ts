// Physics' rotation maths must match the renderer: every viewport object turns in three.js' YXZ order. With XYZ the
// collider of an object turned about two axes pointed elsewhere than the drawn object.
import { expect, it } from 'vitest';
import * as THREE from 'three';
import { eulerFromQuat, quatFromEuler, quatMatrix } from '@shared/src/runtime/orient';

const D = Math.PI / 180;
const cases: [number, number, number][] = [[30, 40, 0], [0, 50, 25], [-20, 120, 70], [80, -35, 10], [10, 0, 60]];

it('quatFromEuler is three.js YXZ', () => {
  for (const [x, y, z] of cases) {
    const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(x * D, y * D, z * D, 'YXZ'));
    const q = quatFromEuler(x, y, z);
    const same = Math.abs(q[0] * want.x + q[1] * want.y + q[2] * want.z + q[3] * want.w);
    expect(same).toBeCloseTo(1, 6);
  }
});

it('eulerFromQuat round-trips, and the matrix turns points like the renderer', () => {
  for (const [x, y, z] of cases) {
    const [rx, ry, rz] = eulerFromQuat(quatFromEuler(x, y, z));
    const a = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * D, ry * D, rz * D, 'YXZ'));
    const b = new THREE.Quaternion().setFromEuler(new THREE.Euler(x * D, y * D, z * D, 'YXZ'));
    expect(Math.abs(a.dot(b))).toBeCloseTo(1, 6);
    const m = quatMatrix(quatFromEuler(x, y, z)), p = new THREE.Vector3(1, 2, 3);
    const r = [m[0] * 1 + m[1] * 2 + m[2] * 3, m[3] * 1 + m[4] * 2 + m[5] * 3, m[6] * 1 + m[7] * 2 + m[8] * 3];
    const want = p.clone().applyQuaternion(b);
    expect(r[0]).toBeCloseTo(want.x, 6); expect(r[1]).toBeCloseTo(want.y, 6); expect(r[2]).toBeCloseTo(want.z, 6);
  }
});
