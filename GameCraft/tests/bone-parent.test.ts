// Parent to a bone: the child follows the pose, keeps its own size whatever scale the rig has inside, stays where it
// was when parented, and comes off again in place.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { socketFor, socketMatrix, updateSocket, type BoneSocket } from '../src/engine/boneSockets';
import { boneSockets, reparent, worldMatrix } from '../src/editor/parenting';
import { makeInstance } from '@shared/src/runtime/scene';
import { World } from '@shared/src/runtime/world';

function rig(modelScale = 1) {
  const owner = new THREE.Group(); owner.position.set(5, 0, 0);
  const model = new THREE.Group(); model.scale.setScalar(modelScale); owner.add(model);
  const arm = new THREE.Bone(); arm.name = 'arm'; arm.position.set(0, 1 / modelScale, 0); model.add(arm);
  const hand = new THREE.Bone(); hand.name = 'hand'; hand.position.set(1 / modelScale, 0, 0); arm.add(hand);
  return { owner, model, arm, hand };
}
const close = (v: THREE.Vector3, x: number, y: number, z: number) => { expect(v.x).toBeCloseTo(x, 4); expect(v.y).toBeCloseTo(y, 4); expect(v.z).toBeCloseTo(z, 4); };

describe('parent to bone', () => {
  it('a child on a socket follows its bone as the pose changes', () => {
    const r = rig(), sockets = new Map<string, BoneSocket>();
    const k = socketFor(sockets, r.owner, r.model, 'hand')!;
    const gun = new THREE.Object3D(); gun.position.set(0.5, 0, 0); k.group.add(gun);
    updateSocket(k, r.owner);
    close(gun.getWorldPosition(new THREE.Vector3()), 6.5, 1, 0);
    r.arm.rotation.z = Math.PI / 2; // the arm swings up: the hand and the gun swing with it
    updateSocket(k, r.owner);
    close(gun.getWorldPosition(new THREE.Vector3()), 5, 2.5, 0);
  });

  it('the rig\'s inner scale does not shrink the child (a centimetre rig)', () => {
    const r = rig(0.01), sockets = new Map<string, BoneSocket>();
    const k = socketFor(sockets, r.owner, r.model, 'hand')!;
    const gun = new THREE.Object3D(); gun.position.set(0, 1, 0); k.group.add(gun);
    updateSocket(k, r.owner);
    close(gun.getWorldScale(new THREE.Vector3()), 1, 1, 1);
    close(gun.getWorldPosition(new THREE.Vector3()), 6, 2, 0);
  });

  it('no bone of that name, or no model yet: no socket (it stays on the parent)', () => {
    const r = rig(), sockets = new Map<string, BoneSocket>();
    expect(socketFor(sockets, r.owner, r.model, 'tail')).toBeNull();
    expect(socketFor(sockets, r.owner, undefined, 'hand')).toBeNull();
  });

  it('a swapped model finds the bone of that name on the new model', () => {
    const a = rig(), sockets = new Map<string, BoneSocket>();
    const k1 = socketFor(sockets, a.owner, a.model, 'hand')!;
    const b = rig(); b.owner.remove(b.model); a.owner.remove(a.model); a.owner.add(b.model);
    const k2 = socketFor(sockets, a.owner, b.model, 'hand')!;
    expect(k2.bone).toBe(b.hand);
    expect(k2.group).toBe(k1.group); // children hung on it stay on it
  });

  it('parenting keeps the object where it is; detaching too', () => {
    const r = rig(), sockets = new Map<string, BoneSocket>();
    const owner = makeInstance(1, 'Hero', 'mesh', { x: 5 }), gun = makeInstance(2, 'Gun', 'box', { x: 7, y: 3, z: 1 });
    const s: any = { instances: [owner, gun] };
    boneSockets.at = (_o, bone) => { const k = socketFor(sockets, r.owner, r.model, bone); return k && socketMatrix(k, r.owner); };
    r.arm.rotation.z = 0.7;
    const before = new THREE.Vector3().setFromMatrixPosition(worldMatrix(s, gun));
    reparent(s, [gun.uid], owner.uid, undefined, 'hand');
    expect(gun.parent).toBe(owner.uid); expect(gun.parentBone).toBe('hand');
    const on = new THREE.Vector3().setFromMatrixPosition(worldMatrix(s, gun));
    expect(on.distanceTo(before)).toBeLessThan(1e-3);
    expect(gun.x).not.toBeCloseTo(7); // now an offset from the bone
    reparent(s, [gun.uid], null);
    expect(gun.parent).toBeUndefined(); expect(gun.parentBone).toBeUndefined();
    expect(new THREE.Vector3(gun.x, gun.y, gun.z).distanceTo(before)).toBeLessThan(1e-3);
    boneSockets.at = null;
  });

  it('logic reads the posed position the renderer last wrote', () => {
    const owner = makeInstance(1, 'Hero', 'mesh', { x: 1 });
    const gun = makeInstance(2, 'Gun', 'box', { parent: 1, parentBone: 'hand' });
    const w = new World({ plane: 'xz', objectTypes: [], instances: [owner, gun] } as any);
    const g = w.instances.find((i) => i.type === 'Gun')!;
    expect(w.worldPos(g)[0]).toBeCloseTo(1); // no renderer: the parent
    g.state.boneWorld = [2, 3, 4];
    expect(w.worldPos(g)).toEqual([2, 3, 4]);
  });
});
