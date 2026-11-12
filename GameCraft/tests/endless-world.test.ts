// Endless worlds in GameCraft: solid ground generated for any chunk, the same every time, and it really carries a body.
import { describe, expect, it } from 'vitest';
import { chunkCollider } from '../src/engine/endlessWorld';
import { defaultConfig, buildFeatures, worldHeight, applyTerrainPreset } from '@shared/src/world/features';

const heightOf = () => { const c = defaultConfig(); c.terrain.endless = true; applyTerrainPreset(c, 'Hills'); c.terrain.endless = true; return worldHeight(c, null, buildFeatures(c, [])); };

describe('streamed ground', () => {
  it('each box top is the ground there, far from the origin too', () => {
    const h = heightOf();
    for (const [x0, z0] of [[0, 0], [64 * 500, -64 * 900], [-64 * 40000, 64 * 12]]) {
      const col = chunkCollider(h, x0, z0, 64);
      expect(col.collider.boxes.length).toBe(21 * 21);
      for (const b of col.collider.boxes.slice(0, 40)) {
        const top = col.y + b[1] + b[4] / 2;
        expect(top).toBeCloseTo(h(col.x + b[0], col.z + b[2]), 4);
      }
      // The overall bounds cover every box: physics looks at these first.
      const hi = col.collider.size[1], o = col.collider.offset[1];
      for (const b of col.collider.boxes) expect(b[1] + b[4] / 2).toBeLessThanOrEqual(o + hi / 2 + 1e-6);
    }
  });
  it('comes back the same when you return', () => {
    const a = chunkCollider(heightOf(), 640, 1280, 64), b = chunkCollider(heightOf(), 640, 1280, 64);
    expect(a).toEqual(b);
  });
  it('neighbouring chunks meet', () => {
    const h = heightOf();
    const a = chunkCollider(h, 0, 0, 64), b = chunkCollider(h, 64, 0, 64);
    // The last column of one and the first of the next differ by one cell's worth of slope, not a step.
    const last = a.collider.boxes[20 * 21], first = b.collider.boxes[0];
    const ya = a.y + last[1] + last[4] / 2, yb = b.y + first[1] + first[4] / 2;
    expect(Math.abs(ya - yb)).toBeLessThan(3);
  });
  it('trunks and buildings go in with the ground', () => {
    const col = chunkCollider(heightOf(), 0, 0, 64, [[10, 20, 10, 1, 8, 1]]);
    expect(col.collider.boxes.length).toBe(21 * 21 + 1);
    const b = col.collider.boxes[col.collider.boxes.length - 1];
    expect(col.x + b[0]).toBe(10); expect(col.y + b[1]).toBe(20);
  });
});
