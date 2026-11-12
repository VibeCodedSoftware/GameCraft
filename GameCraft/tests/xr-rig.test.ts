// VR rig placement: the headset's forward (−Z of the tracking space) must match the VR player's heading
// (world.forward: 0° = +X, 90° = −Z), and the tracking floor sits under the player's feet.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { XrHost } from '../src/engine/xr';
import { Runtime } from '@shared/src/runtime/runtime';
import { emptyScene, makeInstance } from '@shared/src/runtime/scene';
import { createLogicDocument } from '@shared/src/schema';
import { behaviorDefaults } from '@shared/src/runtime/behaviors';

describe('VR rig', () => {
  for (const [ry, want] of [[90, [0, -1]], [0, [1, 0]], [180, [-1, 0]], [-90, [0, 1]]] as const) {
    it(`heading ${ry}° → headset forward (${want.join(', ')})`, () => {
      const s = emptyScene('t', '3d');
      s.instances = [makeInstance(1, 'Player', 'box', { x: 2, y: 0.85, z: 3, ry, collider: { shape: 'box', size: [0.4, 1.7, 0.4], offset: [0, 0, 0] }, behaviors: [{ type: 'vrplayer', props: behaviorDefaults('vrplayer') }] })];
      const rt = new Runtime(s, createLogicDocument('t', 'gamecraft', 'xz'), { app: 'gamecraft' });
      const host = new XrHost({} as THREE.WebGLRenderer, new THREE.Scene());
      (host as any).placeRig(rt, rt.world.instances[0], false);
      host.rig.updateMatrixWorld(true);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(host.rig.quaternion);
      expect(fwd.x).toBeCloseTo(want[0], 5); expect(fwd.z).toBeCloseTo(want[1], 5);
      expect(host.rig.position.y).toBeCloseTo(0, 5); // feet on the floor
      expect([host.rig.position.x, host.rig.position.z]).toEqual([2, 3]);
    });
  }
});
