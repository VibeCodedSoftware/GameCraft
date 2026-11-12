// Graphics presets, value checks, performance warnings and black bars.
import { describe, expect, it } from 'vitest';
import { GRAPHICS_PRESETS, PRESET_KEYS, letterboxRect, presetPatch, renderPatch, validMaxFps, validRenderScale } from '../src/engine/quality';
import { DEFAULT_RENDER } from '../src/engine/culling';
import { estimateTextureBytes, perfWarnings } from '../src/engine/profiler';
import { referencedAssets } from '../src/project/exportGame';

describe('graphics presets', () => {
  it('every preset sets the same settings', () => {
    for (const p of Object.values(GRAPHICS_PRESETS)) expect(Object.keys(p.values).sort()).toEqual([...PRESET_KEYS].sort());
  });
  it('choosing one names it; changing one of its settings makes it Custom', () => {
    expect(presetPatch('low').preset).toBe('low');
    expect(renderPatch({ shadowFilter: 'vsm' }).preset).toBe('custom');
  });
  it('settings outside a preset leave it alone', () => {
    expect(renderPatch({ maxFps: 60 }).preset).toBeUndefined();
    expect(renderPatch({ drawDistance: 50 }).preset).toBeUndefined();
  });
  it('older projects get no new setting by default, so they keep their look', () => {
    for (const k of PRESET_KEYS) if (k !== 'quality') expect(DEFAULT_RENDER[k]).toBeUndefined();
  });
  it('bad values never reach the renderer', () => {
    expect(validRenderScale('nonsense')).toBe(1);
    expect(validRenderScale(0)).toBe(1);
    expect(validRenderScale(99)).toBe(2);
    expect(validRenderScale(0.01)).toBe(0.25);
    expect(validMaxFps(-5)).toBe(0);
    expect(validMaxFps(3)).toBe(10);
    expect(validMaxFps(59.6)).toBe(60);
  });
});

describe('performance panel', () => {
  const calm = { fps: 60, logicMs: 1, moveMs: 1, drawMs: 3, gpuMs: null, calls: 100, triangles: 1000, worstMs: 18, frameMs: 16.7 };
  it('says nothing when all is well', () => { expect(perfWarnings(calm)).toEqual([]); });
  it('names each problem', () => {
    expect(perfWarnings({ ...calm, fps: 20 })[0]).toMatch(/Low frame rate/);
    expect(perfWarnings({ ...calm, logicMs: 12 })[0]).toMatch(/Event sheets/);
    expect(perfWarnings({ ...calm, gpuMs: 20 })[0]).toMatch(/graphics card/);
    expect(perfWarnings({ ...calm, calls: 2000 })[0]).toMatch(/draw calls/);
    expect(perfWarnings({ ...calm, worstMs: 200 })[0]).toMatch(/Stutter/);
  });
  it('estimates graphics memory from texture sizes', () => {
    expect(estimateTextureBytes([{ width: 100, height: 100, mipmaps: false }])).toBe(40000);
    expect(estimateTextureBytes([{ width: 300, height: 100, mipmaps: true }])).toBeCloseTo(160000);
  });
});

describe('keep shape (black bars)', () => {
  it('a wide window gets bars at the sides', () => {
    expect(letterboxRect(2000, 720, '16:9')).toEqual({ left: 360, top: 0, width: 1280, height: 720 });
  });
  it('a tall window gets bars above and below', () => {
    expect(letterboxRect(1280, 1000, '16:9')).toEqual({ left: 0, top: 140, width: 1280, height: 720 });
  });
  it('no shape, or a nonsense one, fills the window', () => {
    for (const a of [undefined, '', 'wide', '16:0', '0:9']) expect(letterboxRect(800, 600, a)).toBeNull();
  });
});

describe('export', () => {
  it('a picture chosen for a bar or a background goes into the game', () => {
    const ids = referencedAssets({ scenes: [{ instances: [{ text: { barStyle: { kind: 'image', full: 'proj:imported/files/bar.png' }, style: { bgImage: 'lib:ui/panel.png' } } }] }], logic: {}, prefabs: [], particlePresets: [], assets: [] } as never);
    expect(ids).toContain('proj:imported/files/bar.png');
    expect(ids).toContain('lib:ui/panel.png');
  });
});
