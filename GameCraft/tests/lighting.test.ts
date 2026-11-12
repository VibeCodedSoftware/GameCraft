// P1 lighting: per-light shadow resolution / bias / falloff / sun shadow area, and quality presets.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { updateLight } from '../src/engine/blenderStyle';
import { QUALITY, setCurrentQuality } from '../src/engine/quality';
import { DEFAULT_LIGHT, type LightData } from '@shared/src/runtime/scene';

const light = (d: Partial<LightData>) => { const h = new THREE.Object3D(); updateLight(h, { ...DEFAULT_LIGHT, ...d }); return h.children.find((c) => (c as any).isLight) as any; };

describe('lights and quality presets', () => {
  it('High (default) keeps the long-standing shadow sizes; presets scale them', () => {
    setCurrentQuality('high');
    expect(light({ type: 'sun' }).shadow.mapSize.x).toBe(2048);
    expect(light({ type: 'point' }).shadow.mapSize.x).toBe(1024);
    setCurrentQuality('low');
    expect(light({ type: 'sun' }).shadow.mapSize.x).toBe(1024);
    setCurrentQuality('ultra');
    expect(light({ type: 'spot' }).shadow.mapSize.x).toBe(2048);
    setCurrentQuality('high');
  });

  it("a light's own shadow resolution wins (rounded to a power of two), plus its bias settings", () => {
    setCurrentQuality('low');
    const s = light({ type: 'sun', shadowResolution: 3000, shadowBias: -0.002, shadowNormalBias: 0.05, shadowArea: 12 });
    expect(s.shadow.mapSize.x).toBe(4096);
    expect(s.shadow.bias).toBe(-0.002); expect(s.shadow.normalBias).toBe(0.05);
    expect(s.shadow.camera.right).toBe(12);
    setCurrentQuality('high');
  });

  it('falloff: realistic, linear, none', () => {
    expect(light({ type: 'point' }).decay).toBe(2);
    expect(light({ type: 'point', falloff: 'linear' }).decay).toBe(1);
    expect(light({ type: 'spot', falloff: 'none' }).decay).toBe(0);
  });

  it('presets differ in shadow filtering and pixel ratio, from fastest to sharpest', () => {
    expect(QUALITY.low.shadowType).toBe(THREE.BasicShadowMap);
    expect(QUALITY.high.shadowType).toBe(THREE.PCFSoftShadowMap);
    expect(QUALITY.low.maxPixelRatio).toBeLessThan(QUALITY.ultra.maxPixelRatio);
  });
});
