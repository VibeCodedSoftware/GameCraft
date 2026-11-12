// The Multi-jump pack on every template with a player character: template logic must not get in its way.
import { expect, it } from 'vitest';
import { PACK_BY_ID, installPack, packDefaults } from '@shared/src/packs';
import { Runtime } from '@shared/src/runtime/runtime';
import { TEMPLATES } from '../src/templates';

const pack = PACK_BY_ID['move.multijump'];
// (Mail Delivery starts at the wheel of the truck, where Space does nothing.)
const withPlayer = TEMPLATES.filter((t) => t.id !== 'maildelivery' && t.build().scenes.some((s) => s.instances.some((i) => i.type === 'Player' && i.kind !== 'text')));

it.each(withPlayer.map((t) => [t.id, t] as const))('%s', (_id, t) => {
  const p = t.build(), s = p.scenes.find((x) => x.instances.some((i) => i.type === 'Player'))!;
  installPack(p.logic, p.logic.sheets[0].id, s, pack, { ...packDefaults(pack), count: 4 }, { app: 'gamecraft', mode: s.mode });
  const rt = new Runtime(s, p.logic, { app: 'gamecraft' });
  const pl = rt.world.of('Player')[0];
  for (let k = 0; k < 90; k++) rt.tick();
  const results: number[] = [];
  // (Counted from the character's own jump counter: a walker's upward speed is not in vy.)
  const on: { n: number } = { n: 0 };
  const count = () => (pl.state.platform?.jumps ?? pl.state.walker?.jumps ?? 0);
  for (let k = 0; k < 7; k++) {
    const before = count();
    rt.input.keyDown('Space'); rt.tick(); rt.input.keyUp('Space'); rt.tick();
    on.n++;
    results.push(count() > before ? 1 : 0);
    for (let n = 0; n < 4; n++) rt.tick();
  }
  expect(pl.behaviors.filter((b) => ['platform', 'surfacewalker', 'eightdir', 'car'].includes(b.type)).length, 'one mover only').toBe(1);
  expect(results.reduce((a, b) => a + b, 0), `${t.id}: ${results.join('')}`).toBe(4);
});
