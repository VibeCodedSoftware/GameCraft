// User reports on the Physics Playground: the character clipped through the floor after bumping a cube, and the
// small tan "Feather box" went wild when stood on and walked across from some angles. Every prop, every heading.
import { describe, expect, it } from 'vitest';
import { physicsTemplate } from '../src/templates/physics';
import { Runtime } from '@shared/src/runtime/runtime';
import { deepClone } from '@shared/src/schema';

function start() {
  const p = physicsTemplate();
  const rt = new Runtime(deepClone(p.scenes[0]), p.logic, { app: 'gamecraft' });
  for (let i = 0; i < 120; i++) rt.tick(); // let everything settle
  const pl = rt.world.instances.find((i) => i.name === 'Player')!;
  return { rt, pl };
}
const prop = (rt: Runtime, name: string) => rt.world.instances.find((i) => i.name === name)!;
const FLOOR_TOP = 0;

describe('Physics Playground: walking into and over props', () => {
  for (const name of ['Crate', 'Ice cube', 'Feather box', 'Boulder', 'Beach ball', 'Bouncy ball']) {
    it(`${name}: approached from 24 headings, the character never sinks into the floor`, () => {
      for (let h = 0; h < 24; h++) {
        const { rt, pl } = start();
        const b = prop(rt, name), a = (h / 24) * Math.PI * 2;
        const bb = rt.world.aabb(b);
        pl.x = (bb[0] + bb[3]) / 2 - Math.cos(a) * 3; pl.z = (bb[2] + bb[5]) / 2 - Math.sin(a) * 3; pl.y = 0.01; pl.vx = pl.vy = pl.vz = 0;
        let lowest = Infinity;
        for (let i = 0; i < 150; i++) {
          pl.vx = Math.cos(a) * 5.5; pl.vz = Math.sin(a) * 5.5; // keep walking into / over it
          rt.tick();
          lowest = Math.min(lowest, pl.y); // the model's origin is at its feet
        }
        expect(lowest, `heading ${h * 15}°`).toBeGreaterThan(FLOOR_TOP - 0.05);
        expect(Number.isFinite(b.y) && b.y > -1, `${name} stays in the world`).toBe(true);
      }
    });
  }

  it('Feather box: standing on it and walking around on top never makes it go wild', () => {
    for (let h = 0; h < 24; h++) {
      const { rt, pl } = start();
      const b = prop(rt, 'Feather box');
      pl.x = b.x; pl.z = b.z; pl.y = b.y + 0.3 + 0.5; pl.vx = pl.vy = pl.vz = 0;
      for (let i = 0; i < 60; i++) rt.tick(); // land on it
      const a = (h / 24) * Math.PI * 2;
      let maxSpin = 0, maxSpeed = 0, lowest = Infinity;
      for (let i = 0; i < 240; i++) {
        // Shuffle back and forth across the top, then walk off.
        const dir = i < 180 ? (Math.floor(i / 20) % 2 ? -1 : 1) * 1.5 : 4;
        pl.vx = Math.cos(a) * dir; pl.vz = Math.sin(a) * dir;
        rt.tick();
        maxSpin = Math.max(maxSpin, Math.hypot(...((b.state.rigid?.w ?? [0, 0, 0]) as number[])));
        maxSpeed = Math.max(maxSpeed, Math.hypot(b.vx, b.vz));
        lowest = Math.min(lowest, pl.y); // the model's origin is at its feet
      }
      expect(maxSpin, `spin, heading ${h * 15}°`).toBeLessThan(12);
      expect(maxSpeed, `speed, heading ${h * 15}°`).toBeLessThan(4);
      expect(lowest, `character height, heading ${h * 15}°`).toBeGreaterThan(-0.05);
      // Afterwards it calms down and comes to rest.
      pl.x = 50; for (let i = 0; i < 240; i++) rt.tick();
      expect(Math.hypot(b.vx, b.vz)).toBeLessThan(0.1);
    }
  });
});
