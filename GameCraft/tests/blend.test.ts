// Native .blend reader: both template files (Blender 5.0 and 3.6 formats) convert without Blender.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { blendToThree, extractObject } from '../src/asset-import/blend/blendToThree';

const DUNGEON = 'asset-library/dungeonbound/DungeonBound_4.blend';
const BACKROOMS = 'asset-library/backrooms/Backrooms_V10.blend';
const sizeOf = (o: THREE.Object3D) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()); };

describe('.blend import', () => {
  it.skipIf(!fs.existsSync(DUNGEON))('Blender 5.0: skinned wizard with its actions, heart meshes', () => {
    const res = blendToThree(fs.readFileSync(DUNGEON));
    expect(res.version).toBeGreaterThanOrEqual(500);
    const wiz = extractObject(res, 'Wizard.001', (o) => SkeletonUtils.clone(o))!;
    let skinned: THREE.SkinnedMesh | null = null;
    wiz.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh; });
    expect(skinned).toBeTruthy();
    expect(skinned!.skeleton.bones.length).toBe(6);
    expect(wiz.animations.map((a) => a.name)).toEqual(expect.arrayContaining(['Idle', 'Walk', 'Jump']));
    const s = sizeOf(wiz.group);
    expect(s.y).toBeGreaterThan(5); expect(s.y).toBeLessThan(7); // Y up after the Z-up conversion
    const heart = extractObject(res, 'Heart1-', (o) => o.clone())!;
    expect(sizeOf(heart.group).x).toBeCloseTo(0.127, 2);
  });

  it.skipIf(!fs.existsSync(BACKROOMS))('Blender 3.6: rooms, ceiling, items, bacteria rig and packed textures', () => {
    let textures = 0;
    const res = blendToThree(fs.readFileSync(BACKROOMS), { makeTexture: () => { textures++; return new THREE.Texture(); } });
    expect(res.version).toBe(306);
    for (let n = 1; n <= 25; n++) expect(res.byName.has('p' + n)).toBe(true);
    const room = extractObject(res, 'p13', (o) => o.clone())!;
    const rs = sizeOf(room.group);
    expect(rs.x).toBeCloseTo(15.1, 0); expect(rs.z).toBeCloseTo(15.1, 0);
    for (const n of ['Ceiling', 'Bread', 'AlmondMilk', 'Medkit', 'Bandage', 'Glowstick', 'PlacableWall', 'GlowstickHold']) expect(res.byName.has(n)).toBe(true);
    const bac = extractObject(res, 'BacteriaaM.002', (o) => SkeletonUtils.clone(o))!;
    expect(bac.animations.map((a) => a.name)).toContain('Walk.002');
    expect(textures).toBeGreaterThan(10);
  });

  it.skipIf(!fs.existsSync(BACKROOMS))('procedural drop ceiling bakes one sharp tile and repeats it (30 × 30), with seams and bump', () => {
    const res = blendToThree(fs.readFileSync(BACKROOMS), { makeTexture: () => new THREE.Texture() });
    let mat: THREE.MeshStandardMaterial | null = null;
    extractObject(res, 'Ceiling', (o) => o.clone())!.group.traverse((o: any) => { if (o.isMesh) for (const m of [].concat(o.material)) if ((m as any).name === 'Celing.001') mat = m; });
    expect(mat).not.toBeNull();
    const map = mat!.map as THREE.DataTexture, nmap = mat!.normalMap as THREE.DataTexture;
    expect([map.repeat.x, map.repeat.y]).toEqual([30, 30]); // Voronoi scale 30, randomness 0 → 30 tiles across
    expect(nmap.repeat.x).toBe(30);
    expect(map.image.width).toBe(256); // one tile at 256 px (was 30 tiles squeezed into 512 px: ~17 px each)
    // A real seam: a clearly darker band crosses the tile (the 1 px lines of the old bake blurred away).
    const d = map.image.data as Uint8Array, W = map.image.width;
    const lum = (x: number, y: number) => d[(y * W + x) * 4] + d[(y * W + x) * 4 + 1] + d[(y * W + x) * 4 + 2];
    const row = Array.from({ length: W }, (_, x) => lum(x, W >> 2)), col = Array.from({ length: W }, (_, y) => lum(W >> 2, y)); // a quarter in: crosses the seam
    for (const line of [row, col]) {
      const hi = Math.max(...line), lo = Math.min(...line);
      expect(hi - lo).toBeGreaterThan(40);
      expect(line.filter((v) => v < (hi + lo) / 2).length).toBeGreaterThanOrEqual(3); // seam several pixels wide
    }
  });
});
