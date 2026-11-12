// Bone Edit: edits sit on top of the animation every frame without piling up, on animated and still bones alike,
// and removing an edit puts the bone back.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyBonePose, hasBonePose, resetBonePose } from '../src/engine/bonePose';

function rig() {
  const root = new THREE.Group();
  const hips = new THREE.Bone(); hips.name = 'hips';
  const arm = new THREE.Bone(); arm.name = 'arm'; arm.position.set(0.3, 1, 0);
  const head = new THREE.Bone(); head.name = 'head'; head.position.set(0, 1.5, 0);
  root.add(hips); hips.add(arm, head);
  // The clip turns the hips only.
  const clip = new THREE.AnimationClip('Sway', 1, [new THREE.QuaternionKeyframeTrack('hips.quaternion', [0, 1], [...new THREE.Quaternion().toArray(), ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1, 0)).toArray()])]);
  const mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play();
  return { root, hips, arm, head, mixer };
}
const frame = (r: ReturnType<typeof rig>, pose: any, dt = 0.1) => { resetBonePose(r.root, pose); r.mixer.update(dt); applyBonePose(r.root, pose); };
const deg = (q: THREE.Quaternion) => THREE.MathUtils.radToDeg(new THREE.Euler().setFromQuaternion(q).z);

describe('bone edit', () => {
  it('a still bone keeps exactly its edit, frame after frame', () => {
    const r = rig();
    const pose = { arm: { rot: [0, 0, -60] as [number, number, number] }, head: { scale: 1.5 } };
    for (let k = 0; k < 20; k++) frame(r, pose);
    expect(deg(r.arm.quaternion)).toBeCloseTo(-60, 3); // not -1200
    expect(r.head.scale.x).toBeCloseTo(1.5);
    expect(r.arm.position.x).toBeCloseTo(0.3);
  });

  it('an animated bone gets the animation, then the edit on top', () => {
    const r = rig();
    frame(r, {}, 0.5);
    const animated = r.hips.quaternion.clone();
    const r2 = rig();
    frame(r2, { hips: { rot: [0, 0, 30] } }, 0.5);
    const expected = animated.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, THREE.MathUtils.degToRad(30))));
    // (Animation tracks are 32-bit floats: a few millionths of a radian is the same pose.)
    expect(r2.hips.quaternion.angleTo(expected)).toBeLessThan(1e-3);
    expect(r2.hips.quaternion.angleTo(animated)).toBeGreaterThan(0.5); // the edit really is there (30°)
  });

  it('removing an edit puts the bone back at rest', () => {
    const r = rig();
    const pose = { arm: { pos: [0, 0.2, 0] as [number, number, number] } };
    frame(r, pose);
    expect(r.arm.position.y).toBeCloseTo(1.2);
    resetBonePose(r.root, pose); // the scene view does this once when the edit is gone
    expect(r.arm.position.y).toBeCloseTo(1);
    expect(hasBonePose({})).toBe(false);
    expect(hasBonePose({ a: { rot: [0, 0, 0], scale: 1 } })).toBe(false);
    expect(hasBonePose({ a: { scale: 2 } })).toBe(true);
  });
});
