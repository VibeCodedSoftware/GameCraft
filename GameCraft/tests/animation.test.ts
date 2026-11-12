// The rigged LowPolyHuman (scripts/rig-human.ts) carries the CC0 Universal Animation Library clips, and every
// behavior animation the templates use resolves to a real clip that actually moves the body.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveClip } from '../src/engine/animClips';
import { HUMAN_ANIMS } from '../src/templates/kit';

const FILE = 'asset-library/characters/LowPolyHuman_Animated.glb';

function load(): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const b = fs.readFileSync(FILE);
  return new Promise((res, rej) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', (g) => res(g as any), rej));
}

describe('animated LowPolyHuman', () => {
  it.skipIf(!fs.existsSync(FILE))('maps every behavior animation to a clip and the clips deform the mesh', async () => {
    const g = await load();
    expect(g.animations.length).toBeGreaterThanOrEqual(40);
    let sk: THREE.SkinnedMesh | null = null;
    g.scene.traverse((o: any) => { if (o.isSkinnedMesh) sk = o; });
    expect(sk).toBeTruthy();
    const size = () => { g.scene.updateMatrixWorld(true); sk!.skeleton.update(); sk!.computeBoundingBox(); return sk!.boundingBox!.getSize(new THREE.Vector3()); };
    const tpose = size();
    expect(tpose.y).toBeCloseTo(1.83, 1);
    const mixer = new THREE.AnimationMixer(g.scene);
    for (const anim of ['idle', 'walk', 'run', 'jump', 'fall', 'attack', 'hit', 'death']) {
      const clip = resolveClip(g.animations, anim, HUMAN_ANIMS);
      expect(clip?.name, anim).toBe(HUMAN_ANIMS[anim]);
      mixer.stopAllAction(); mixer.clipAction(clip!).reset().play(); mixer.setTime(clip!.duration * 0.5);
      const s = size();
      // Out of the T-pose: arms come in (narrower than the 1.9 m arm span) and the body keeps a human size.
      expect(s.x, anim).toBeLessThan(tpose.x * 0.9);
      expect(Math.max(s.x, s.y, s.z), anim).toBeLessThan(2.3);
    }
    // Death ends lying down.
    const death = resolveClip(g.animations, 'death', HUMAN_ANIMS)!;
    mixer.stopAllAction(); mixer.clipAction(death).reset().play(); mixer.setTime(death.duration - 0.01);
    expect(size().y).toBeLessThan(1);
  });
});
