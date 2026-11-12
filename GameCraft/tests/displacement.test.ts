// True displacement (Material › Height as: Displacement): only with a height map, dense enough to move, built at
// the object's real size so the displacement amount is in metres on every face.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { displacedGeometry, displacedSize } from '../src/engine/displacement';

const inst = (kind: string, s: [number, number, number], material: any) => ({ uid: 1, kind, sx: s[0], sy: s[1], sz: s[2], material } as any);
const height = { maps: { height: { asset: 'proj:rock_height.png' } } };

describe('height displacement geometry', () => {
  it('only with Displacement on and a height map', () => {
    expect(displacedGeometry(inst('box', [2, 2, 2], { ...height }))).toBeNull();
    expect(displacedGeometry(inst('box', [2, 2, 2], { displace: true }))).toBeNull();
    expect(displacedGeometry(inst('torus', [2, 2, 2], { ...height, displace: true }))).toBeNull();
  });

  it('a floor is built at its size with about 16 points per metre on top', () => {
    const g = displacedGeometry(inst('box', [10, 0.5, 4], { ...height, displace: true }))!;
    g.computeBoundingBox();
    const size = g.boundingBox!.getSize(new THREE.Vector3());
    expect([size.x, size.y, size.z]).toEqual([10, 0.5, 4]);
    expect(displacedSize(inst('box', [10, 0.5, 4], {}))).toEqual([10, 0.5, 4]);
    // top face: (160 + 1) × (64 + 1) points
    const top = (g as THREE.BoxGeometry).parameters;
    expect([top.widthSegments, top.depthSegments]).toEqual([160, 64]);
  });

  it('detail scales the subdivision and is capped', () => {
    const fine = displacedGeometry(inst('box', [4, 4, 4], { ...height, displace: true, displaceDetail: 2 })) as THREE.BoxGeometry;
    expect(fine.parameters.widthSegments).toBe(128);
    const huge = displacedGeometry(inst('box', [100, 1, 100], { ...height, displace: true, displaceDetail: 4 })) as THREE.BoxGeometry;
    expect(huge.parameters.widthSegments).toBe(256);
  });
});
