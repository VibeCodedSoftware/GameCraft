// Camera view presets: the camera, turned the renderer's way (YXZ), looks straight at its target from the preset's
// angle (2:1 isometric 30° down, true isometric 35.26°, top-down), quarter-turns go round by 90°, a Follow camera gets
// the view as its offset, and the Set camera view block turns it left / right while playing.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cameraPose } from '@shared/src/cameraPresets';
import { applyCameraView } from '@shared/src/cameraView';
import { makeInstance, DEFAULT_CAMERA } from '@shared/src/runtime/scene';
import { behaviorDefaults } from '@shared/src/runtime/behaviors';
import { ACTIONS } from '@shared/src/runtime/blockImpl';

const D = Math.PI / 180;
const forward = (rx: number, ry: number) => new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(rx * D, ry * D, 0, 'YXZ'));

describe('camera presets', () => {
  for (const id of ['iso21', 'iso', 'topdown'] as const) for (const turn of [0, 1, 2, 3]) it(`${id}, turn ${turn}: looks at the target`, () => {
    const p = cameraPose(id, 20, turn);
    const f = forward(p.rx, p.ry), toTarget = new THREE.Vector3(...p.offset).negate().normalize();
    expect(f.dot(toTarget)).toBeCloseTo(1, 6);
    expect(new THREE.Vector3(...p.offset).length()).toBeCloseTo(20, 6);
  });
  it('2:1 isometric is 30° down, true isometric 35.26°, from a corner; turns go round by 90°', () => {
    expect(cameraPose('iso21', 10).rx).toBeCloseTo(-30, 6);
    expect(cameraPose('iso', 10).rx).toBeCloseTo(-35.264, 3);
    expect([0, 1, 2, 3].map((t) => cameraPose('iso21', 10, t).ry)).toEqual([45, 135, 225, 315]);
  });
  it('a Follow camera gets the view as its offset; without Follow it keeps looking at the same ground spot', () => {
    const f = makeInstance(1, 'Camera', 'camera', { camera: { ...DEFAULT_CAMERA }, behaviors: [{ type: 'follow', props: { ...behaviorDefaults('follow'), offsetX: 0, offsetY: 6, offsetZ: 10 } }] });
    applyCameraView(f, 'iso21', 0);
    const p = f.behaviors[0].props;
    expect(Math.hypot(p.offsetX, p.offsetY, p.offsetZ)).toBeCloseTo(Math.hypot(6, 10), 2);
    expect(Math.atan2(p.offsetY, Math.hypot(p.offsetX, p.offsetZ)) / D).toBeCloseTo(30, 2);
    expect(f.camera!.type).toBe('orthographic');
    expect(p.lookAt).toBe(true);
    // No Follow: looking at (2, 0, -3) before and after.
    const c = makeInstance(2, 'Camera', 'camera', { x: 2, y: 10, z: 7, rx: -45, ry: 0, camera: { ...DEFAULT_CAMERA } });
    applyCameraView(c, 'iso', 1);
    const fw = forward(c.rx, c.ry), t = -c.y / fw.y;
    expect(c.x + fw.x * t).toBeCloseTo(2, 2); expect(c.z + fw.z * t).toBeCloseTo(-3, 2);
  });
  it('Set camera view turns left and right', () => {
    const c = makeInstance(1, 'Camera', 'camera', { x: 0, y: 10, z: 10, rx: -45, camera: { ...DEFAULT_CAMERA } });
    const run = (turn: string) => ACTIONS['camera.set_view']({} as any, { params: { preset: 'iso21', turn } } as any, {} as any, c as any);
    run('keep'); expect(c.camera!.preset).toEqual({ id: 'iso21', turn: 0 });
    run('left'); expect(c.camera!.preset!.turn).toBe(1); expect(c.ry).toBeCloseTo(135, 6);
    run('right'); run('right'); expect(c.camera!.preset!.turn).toBe(3); expect(c.ry).toBeCloseTo(315, 6);
  });
});
