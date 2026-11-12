// Regression for "I was able to clip through the floor by colliding with a cube": random walking, turning and
// jumping into every prop of the Physics Playground must never put the character below the floor.
// (Cause: a crate shoved into the character during a jump was "resolved" by pushing the character down through the
// floor, then out of the floor slab sideways. Movers now leave pre-existing overlaps the shortest safe way.)
import { describe, expect, it } from 'vitest';
import { physicsTemplate } from '../src/templates/physics';
import { Runtime } from '@shared/src/runtime/runtime';
import { deepClone } from '@shared/src/schema';
import { Rng } from '@shared/src/runtime/rng';

describe('Physics Playground fuzz', () => {
  it('150 runs of walking, turning and jumping into props: never below the floor', () => {
    const props = ['Crate', 'Ice cube', 'Feather box', 'Boulder', 'Beach ball', 'Bouncy ball'];
    for (let run = 0; run < 150; run++) {
      const p = physicsTemplate(); const rt = new Runtime(deepClone(p.scenes[0]), p.logic, { app: 'gamecraft' });
      for (let i = 0; i < 90; i++) rt.tick();
      const pl = rt.world.instances.find((i) => i.name === 'Player')!;
      const r = new Rng(run * 7919 + 1);
      const target = rt.world.instances.find((i) => i.name === props[run % props.length])!;
      const a0 = r.next() * Math.PI * 2;
      pl.x = target.x - Math.cos(a0) * 1.6; pl.z = target.z - Math.sin(a0) * 1.6; pl.y = 0.01;
      let dir = a0, lowest = Infinity, maxStep = 0;
      for (let i = 0; i < 360; i++) {
        if (i % 25 === 0) dir = Math.atan2(target.z - pl.z, target.x - pl.x) + (r.next() - 0.5) * 1.6;
        pl.vx = Math.cos(dir) * 5.5; pl.vz = Math.sin(dir) * 5.5;
        if (r.next() < 0.04) rt.input.keyDown('Space'); else rt.input.keyUp('Space');
        const x0 = pl.x, z0 = pl.z;
        rt.tick();
        lowest = Math.min(lowest, pl.y);
        maxStep = Math.max(maxStep, Math.hypot(pl.x - x0, pl.z - z0));
      }
      expect(lowest, `run ${run} (${target.name})`).toBeGreaterThan(-0.05);
      expect(maxStep, `run ${run}: never teleported sideways`).toBeLessThan(1.2);
    }
  });
});
