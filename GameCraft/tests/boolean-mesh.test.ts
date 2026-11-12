// Boolean meshes (three-bvh-csg): Difference opens a doorway (no surface left in the hole), Union joins, holes cut
// while playing are applied in the object's own space, and clearing the ops restores the mesh.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { updateBoolean } from '../src/engine/booleanMesh';

function thing(geo: THREE.BufferGeometry, pos: [number, number, number], scale: [number, number, number]) {
  const obj = new THREE.Group(); obj.position.set(...pos); obj.scale.set(...scale);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial()); obj.add(mesh);
  return { obj, visual: obj as THREE.Object3D, mesh };
}
/** Does a ray from far in front, straight through the point, hit the mesh? */
const solidAt = (m: THREE.Mesh, x: number, y: number) => { (m.parent ?? m).updateMatrixWorld(true); const r = new THREE.Raycaster(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1)); return r.intersectObject(m).length > 0; };

describe('boolean meshes', () => {
  it('Difference cuts a doorway; clearing the op restores the wall', () => {
    const wall = thing(new THREE.BoxGeometry(1, 1, 1), [0, 1.5, 0], [6, 3, 0.3]);
    const door = thing(new THREE.BoxGeometry(1, 1, 1), [0, 1, 0], [1.2, 2, 1]);
    const inst: any = { uid: 1, name: 'Wall', boolean: { ops: [{ with: 2, op: 'difference' }] } };
    expect(solidAt(wall.mesh, 0, 1)).toBe(true);
    expect(updateBoolean(wall, inst, undefined, () => door.visual)).toBe(true);
    expect(solidAt(wall.mesh, 0, 1)).toBe(false);   // the doorway
    expect(solidAt(wall.mesh, 0, 2.5)).toBe(true);  // the lintel above it
    expect(solidAt(wall.mesh, 2, 1)).toBe(true);
    const cut = wall.mesh.geometry;
    // Unchanged cutter: no recompute.
    updateBoolean(wall, inst, undefined, () => door.visual);
    expect(wall.mesh.geometry).toBe(cut);
    // Move the cutter: recomputed there.
    door.obj.position.x = 2; updateBoolean(wall, inst, undefined, () => door.visual);
    expect(solidAt(wall.mesh, 0, 1)).toBe(true); expect(solidAt(wall.mesh, 2, 1)).toBe(false);
    inst.boolean = undefined;
    expect(updateBoolean(wall, inst, undefined, () => door.visual)).toBe(false);
    expect(solidAt(wall.mesh, 2, 1)).toBe(true);
  });

  it('holes cut while playing, in the object\'s own units', () => {
    const wall = thing(new THREE.BoxGeometry(1, 1, 1), [0, 1.5, 0], [6, 3, 0.3]);
    // A 0.5 m round hole at x = 1.5 m: in the wall's units x = 0.25, size 0.5/6 × 0.5/3 × 0.5/0.3.
    updateBoolean(wall, { uid: 1, name: 'Wall' } as any, [{ shape: 'sphere', center: [0.25, 0, 0], size: [0.5 / 6, 0.5 / 3, 0.5 / 0.3] }], () => undefined);
    expect(solidAt(wall.mesh, 1.5, 1.5)).toBe(false);
    expect(solidAt(wall.mesh, 1.5, 2.0)).toBe(true);
  });

  it('Union joins two shapes into one mesh', () => {
    const a = thing(new THREE.BoxGeometry(1, 1, 1), [0, 0, 0], [1, 1, 1]);
    const b = thing(new THREE.SphereGeometry(0.5, 16, 12), [1, 0, 0], [1, 1, 1]);
    updateBoolean(a, { uid: 1, name: 'A', boolean: { ops: [{ with: 2, op: 'union' }] } } as any, undefined, () => b.visual);
    a.mesh.geometry.computeBoundingBox();
    expect(a.mesh.geometry.boundingBox!.max.x).toBeCloseTo(1.5, 1);
  });
});
