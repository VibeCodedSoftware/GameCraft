// Texture patches rewrite three's texture lookups, which sit inside #include chunks when onBeforeCompile runs: the
// chunks must be expanded first or the patch silently does nothing (random tiling and animated sprite-sheet slots).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { expandMapChunks, patchRandomTiling } from '../src/engine/materialMaps';

const compiled = (m: THREE.Material) => {
  const sh = { uniforms: {} as Record<string, any>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  m.onBeforeCompile(sh as any, null as any);
  return sh;
};

describe('material texture patches', () => {
  it('expands only the chunks that sample a map', () => {
    const src = expandMapChunks(THREE.ShaderLib.standard.fragmentShader);
    expect(src).toMatch(/texture2D\(\s*map\s*,\s*vMapUv\s*\)/);
    expect(src).not.toMatch(/#include <map_fragment>/);
    expect(src).toMatch(/#include <lights_fragment_begin>/); // others stay includes
  });
  it('random tiling reaches the colour and normal lookups', () => {
    const m = new THREE.MeshStandardMaterial();
    patchRandomTiling(m, { seed: 1, amount: 1 } as any);
    const fs = compiled(m).fragmentShader;
    expect(fs).toMatch(/craftTex\(map, vMapUv, true\)/);
    expect(fs).toMatch(/craftTex\(normalMap, vNormalMapUv, false\)/);
    expect(fs).toMatch(/craftTex\(aoMap, vAoMapUv, true\)/);
  });
  it('random tiling keeps an animated sheet reading its current frame', () => {
    const m = new THREE.MeshStandardMaterial();
    const u = { value: new THREE.Vector4(8, 5, 2, 1) };
    patchRandomTiling(m, { seed: 1, amount: 1, mode: 'blend' }, [['map', u]]);
    const sh = compiled(m);
    expect(sh.fragmentShader).toMatch(/craftBlend\(map, vMapUv, true, uSheet_map\)/);
    expect(sh.fragmentShader).toMatch(/craftBlend\(normalMap, vNormalMapUv, false\)/); // no sheet: the plain form
    expect(sh.fragmentShader).toContain('uniform vec4 uSheet_map;');
    expect(sh.uniforms.uSheet_map).toBe(u);
  });
  it('a new picture in a slot keeps its UV but not the old frame layout', async () => {
    const { replaceSlotImage } = await import('@shared/src/materialMaps');
    const toon = { asset: 'toon', tiling: [3, 2] as [number, number], offset: [0.5, 0] as [number, number], rotation: 45, animated: { frames: 40, cols: 8, rows: 5, fps: 20, scroll: [0, 0] as [number, number], spin: 0 } };
    const a = replaceSlotImage(toon, 'mine');
    expect(a).toMatchObject({ asset: 'mine', tiling: [3, 2], offset: [0.5, 0], rotation: 45 });
    expect(a.animated).toBeUndefined();
    const b = replaceSlotImage({ ...toon, animated: { ...toon.animated, scroll: [0.1, 0] } }, 'mine');
    expect(b.animated).toMatchObject({ frames: 0, cols: 1, rows: 1, scroll: [0.1, 0] });
    expect(replaceSlotImage(toon, 'gif', { frames: 6, rows: 2, fps: 10 }).animated).toMatchObject({ frames: 6, cols: 3, rows: 2, fps: 10 });
  });
  it('PBR sets pick up height and ambient occlusion maps as their own slots', async () => {
    const { groupPbrSets, MAP_SLOTS } = await import('@shared/src/materialMaps');
    const [set] = groupPbrSets(['rock_basecolor.png', 'rock_normal.png', 'rock_height.png', 'rock_ao.png'].map((p, k) => ({ id: 'a' + k, path: 'tex/' + p })));
    expect(Object.keys(set.maps).sort()).toEqual(['ao', 'color', 'height', 'normal']);
    expect(MAP_SLOTS.find((s) => s.slot === 'height')?.three).toBe('bumpMap');
    expect(MAP_SLOTS.find((s) => s.slot === 'ao')?.three).toBe('aoMap');
  });
});
