// Collider outlines (collider outlines / Collision View) show the collider's own shape: a sphere is round (not the
// 16 box slices physics uses), a ramp is a wedge, a tilted crate is rotated, a character stays upright, compound
// colliders show their boxes.
import { describe, expect, it } from 'vitest';
import { World } from '@shared/src/runtime/world';
import { emptyScene, makeInstance } from '@shared/src/runtime/scene';
import { behaviorDefaults } from '@shared/src/runtime/behaviors';
import { colliderOutline } from '../src/engine/colliderShapes';

const world = (...insts: any[]) => { const s = emptyScene('t', '3d'); s.instances = insts.map((o, k) => makeInstance(k + 1, o.type ?? 'X', o.kind ?? 'box', o)); return new World(s); };
const pts = (a: number[]) => { const o: number[][] = []; for (let k = 0; k < a.length; k += 3) o.push([a[k], a[k + 1], a[k + 2]]); return o; };

describe('collider outlines', () => {
  it('a sphere is drawn round, on its radius', () => {
    const w = world({ kind: 'sphere', x: 2, y: 1, z: -1, sx: 2, sy: 2, sz: 2, collider: { shape: 'sphere', size: [1, 1, 1], offset: [0, 0, 0] } });
    const o = colliderOutline(w, w.instances[0])!;
    const d = pts(o.lines).map(([x, y, z]) => Math.hypot(x - 2, y - 1, z + 1));
    expect(Math.min(...d)).toBeCloseTo(1, 3); expect(Math.max(...d)).toBeCloseTo(1, 3);
    expect(o.tris.length).toBeGreaterThan(100 * 9);
  });
  it('a ramp is a wedge: full height at the front, nothing at the back', () => {
    const w = world({ kind: 'ramp', x: 0, y: 0.5, z: 0, sx: 2, sy: 1, sz: 4, collider: { shape: 'box', size: [1, 1, 1], offset: [0, 0, 0] } });
    const p = pts(colliderOutline(w, w.instances[0])!.lines);
    const tops = p.filter(([, y]) => y > 0.99);
    expect(tops.length).toBeGreaterThan(0);
    expect(tops.every(([, , z]) => z < -1.99)).toBe(true); // only the front edge is high
  });
  it('a tilted crate is drawn rotated; a character stays upright', () => {
    const w = world(
      { kind: 'box', x: 0, y: 0, z: 0, rz: 45, collider: { shape: 'box', size: [2, 2, 2], offset: [0, 0, 0] } },
      { kind: 'box', x: 0, y: 0, z: 0, rz: 45, collider: { shape: 'box', size: [2, 2, 2], offset: [0, 0, 0] }, behaviors: [{ type: 'platform', props: behaviorDefaults('platform') }] },
    );
    const tilted = pts(colliderOutline(w, w.instances[0])!.lines), upright = pts(colliderOutline(w, w.instances[1])!.lines);
    expect(Math.max(...tilted.map(([x]) => x))).toBeCloseTo(Math.SQRT2, 3); // corner turned out to √2
    expect(Math.max(...upright.map(([x]) => x))).toBeCloseTo(1, 3);
  });
  it('compound colliders show their boxes; no collider, no outline', () => {
    const w = world(
      { kind: 'mesh', collider: { shape: 'box', size: [4, 1, 4], offset: [0, 0, 0], boxes: [[0, 0, 0, 1, 1, 1], [2, 0, 0, 1, 1, 1]] } },
      { kind: 'box', collider: { shape: 'none', size: [1, 1, 1], offset: [0, 0, 0] } },
    );
    expect(colliderOutline(w, w.instances[0])!.lines.length).toBe(2 * 12 * 6);
    expect(colliderOutline(w, w.instances[1])).toBeNull();
  });
});
