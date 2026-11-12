// LOD simplification: levels must keep triangles and material groups (empty or group-less copies made objects vanish).
import { expect, it } from 'vitest';
import * as THREE from 'three';
import { level } from '../src/engine/lodWorker';

function twoMaterialTube() {
  const g = new THREE.CylinderGeometry(0.1, 0.1, 1, 32, 12).toNonIndexed();
  const n = g.attributes.position.count, half = n / 2 - ((n / 2) % 3);
  const src = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) src.setAttribute(k, g.attributes[k]);
  return { src, n, groups: [{ start: 0, count: half, materialIndex: 0 }, { start: half, count: n - half, materialIndex: 1 }] };
}

it('a single-material mesh simplifies to a smaller, non-empty mesh', () => {
  const { src, n } = twoMaterialTube();
  const l = level(src, undefined, 0.5, ['position', 'normal', 'uv'])!;
  expect(l.index!.length).toBeGreaterThan(30);
  expect(l.index!.length).toBeLessThan(n);
});

it('a multi-material mesh keeps one non-empty group per material', () => {
  const { src, n, groups } = twoMaterialTube();
  for (const keep of [0.5, 0.2]) {
    const l = level(src, groups, keep, ['position', 'normal', 'uv'])!;
    expect(l.groups!.map((g) => g.materialIndex)).toEqual([0, 1]);
    for (const g of l.groups!) expect(g.count).toBeGreaterThan(0);
    expect(l.index!.length).toBe(l.groups!.reduce((a, g) => a + g.count, 0));
    expect(l.index!.length).toBeLessThan(n);
    expect(Math.max(...l.index!)).toBeLessThan(l.attrs.position.array.length / 3);
  }
});
