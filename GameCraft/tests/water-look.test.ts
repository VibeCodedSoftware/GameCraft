// Water look (visual only): the shader patch finds every place it hooks into three's standard material (a missed hook
// would silently drop waves or foam), keeps an earlier patch, the options map onto its settings (waves on the top of a
// box, all round a sphere; all off by default), waves get a finer surface, and caustics tile about every 2.5 m.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { patchWaterMaterial, setWaterUniforms, waterGeometry, needsDepth, causticTiles, causticPose, causticShadowStart, MAX_RIPPLES } from '../src/engine/waterFx';
import { patchPs1 } from '../src/engine/postfx';
import { makeInstance } from '@shared/src/runtime/scene';
import { applyWaterLook, stylisedWaterSlot } from '@shared/src/runtime/water';

const compiled = (m: THREE.Material) => {
  const sh = { uniforms: {} as Record<string, any>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  m.onBeforeCompile(sh as any, null as any);
  return sh;
};
const water = (kind: string, fx: Record<string, any> = {}) => {
  const i = makeInstance(1, 'Water', kind as any, { sx: 10, sy: 2, sz: 6 });
  applyWaterLook(i); i.material!.water = fx;
  return i;
};

describe('caustics with something standing in the water', () => {
  const box = (a: number[], b: number[]) => new THREE.Box3(new THREE.Vector3(...a), new THREE.Vector3(...b));
  it('shadows start past a thing the light is inside, so the floor still gets caustics', () => {
    expect(causticShadowStart(new THREE.Vector3(0, 1, 0), [box([-1, 0, -1], [1, 2, 1])])).toBeCloseTo(1.01);
  });
  it('nothing around the light: shadows as usual', () => {
    expect(causticShadowStart(new THREE.Vector3(0, 1, 0), [box([3, 0, 3], [4, 2, 4])])).toBe(0);
  });
});

describe('water look', () => {
  it('the shader patch hooks into every chunk it needs', () => {
    const m = new THREE.MeshStandardMaterial();
    const sh = compiled((patchWaterMaterial(m), m));
    expect(sh.vertexShader).toMatch(/waveH\(wp0\.xz\)/);
    expect(sh.vertexShader).toMatch(/vWaterClip = gl_Position/);
    expect(sh.fragmentShader).toMatch(/wThick/);
    expect(sh.fragmentShader).toMatch(/vWaterTop > 0\.5/);
    expect(sh.fragmentShader).toMatch(/#include <opaque_fragment>/); // still drawn after the foam
    for (const k of ['uTime', 'uWave', 'uFoamWidth', 'uToon', 'uDeep', 'uClarity', 'uDepth', 'uHasDepth']) expect(sh.uniforms[k]).toBeDefined();
  });
  it('PS1 snapping on top keeps the water patch (and gets its own program key)', () => {
    const m = new THREE.MeshStandardMaterial();
    patchWaterMaterial(m); patchPs1(m);
    const sh = compiled(m);
    expect(sh.vertexShader).toMatch(/uSnap/); expect(sh.fragmentShader).toMatch(/wThick/);
    expect(m.customProgramCacheKey()).toMatch(/^ps1\|craft-water/);
  });
  it('options → settings: off by default; top waves on a box, all round on a sphere', () => {
    const u = patchWaterMaterial(new THREE.MeshStandardMaterial());
    setWaterUniforms(u, water('box'), 1);
    expect([u.uWave.value.x, u.uDetail.value, u.uFoamWidth.value, u.uToon.value, u.uClarity.value, u.uRippleN.value]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(u.uWave.value.w).toBe(1); // a top surface (rings still show on it)
    expect(needsDepth(u)).toBe(false);
    setWaterUniforms(u, water('box', { waves: true, waveHeight: 0.3, foam: true, clarity: 4 }), 2);
    expect(u.uWave.value.toArray()).toEqual([0.3, 4, 1, 1]);
    expect([u.uDetail.value, u.uReal.value, u.uHighlight.value]).toEqual([1, 1, 1]);
    const h = patchWaterMaterial(new THREE.MeshStandardMaterial());
    setWaterUniforms(h, water('box', { waves: true, highlights: 2.5 }), 2);
    expect(h.uHighlight.value).toBe(2.5);
    expect(u.uFoamWidth.value).toBeCloseTo(0.35);
    expect(needsDepth(u)).toBe(true);
    setWaterUniforms(u, water('sphere', { waves: true }), 2);
    expect(u.uWave.value.w).toBe(2);
  });
  it('waves get a finer surface; flat water keeps the shared one', () => {
    expect(waterGeometry('box', water('box'))).toBeNull();
    const g = waterGeometry('box', water('box', { waves: true }))!;
    expect((g as THREE.BoxGeometry).parameters.widthSegments).toBe(40); // 10 m at 0.25 m
    expect((g as THREE.BoxGeometry).parameters.depthSegments).toBe(24);
    expect(waterGeometry('sphere', water('sphere', { waves: true }))).toBeInstanceOf(THREE.SphereGeometry);
  });
  it('caustics: the light sits just under the surface pointing down, so nothing above the water is lit', () => {
    const box = new THREE.Box3(new THREE.Vector3(-10, -1.1, -10), new THREE.Vector3(10, 0.1, 10));
    const p = causticPose(box);
    expect(p.position.y).toBeLessThan(0.1); expect(p.position.y).toBeGreaterThan(0.05);
    expect(p.target.y).toBeLessThan(p.position.y);
    expect(p.angle).toBeLessThan(Math.PI / 2); // a point above the light is outside the cone
    // A rock poking out at (2, 0.4, 1): the angle from straight down is over 90°.
    const toRock = new THREE.Vector3(2, 0.4, 1).sub(p.position).normalize();
    expect(Math.acos(toRock.dot(new THREE.Vector3(0, -1, 0)))).toBeGreaterThan(p.angle);
    // The pool floor under the rock is lit.
    const toFloor = new THREE.Vector3(2, -1.1, 1).sub(p.position).normalize();
    expect(Math.acos(toFloor.dot(new THREE.Vector3(0, -1, 0)))).toBeLessThan(p.angle);
  });
  it('the shader has the ring and fine-detail code, and keeps the ripple normal map (tilts, not replaces)', () => {
    const m = new THREE.MeshStandardMaterial();
    patchWaterMaterial(m);
    const sh = compiled(m);
    expect(sh.fragmentShader).toMatch(/rippleHG\(vWaterWorld\.xz\)/);
    expect(sh.fragmentShader).toMatch(/normal = normalize\(normal \+/);
    expect(sh.vertexShader).toMatch(/rippleHG\(wp0\.xz\)/);
    expect(sh.uniforms.uRipples.value).toHaveLength(MAX_RIPPLES);
  });
  it('a stylised water keeps flat cartoon shading (no fine detail, no sky reflection)', () => {
    const u = patchWaterMaterial(new THREE.MeshStandardMaterial());
    const i = water('box', { waves: true });
    i.material!.maps = { color: stylisedWaterSlot() } as any;
    setWaterUniforms(u, i, 0);
    expect([u.uDetail.value, u.uReal.value]).toEqual([0, 0]);
  });
  it('caustics repeat about every 2.5 m (2 to 16 times across)', () => {
    expect(causticTiles(1)).toBe(2);
    expect(causticTiles(25)).toBe(10);
    expect(causticTiles(500)).toBe(16);
  });
});
