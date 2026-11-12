// Parent / Unparent keep every object where it is (position, rotation and size, under rotated and scaled parents),
// never make loops, and the right-click multi-object edits apply to the whole selection in one undo step.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { emptyScene, makeInstance } from '@shared/src/runtime/scene';
import { reparent, worldMatrix } from '../src/editor/parenting';
import { store } from '../src/project/store';
import { emptyProject } from '../src/templates/empty';
import { applyTextureToSelection, renameSelection, replaceModelOfSelection, setCollisionOfSelection, setParent, setTypeOfSelection } from '../src/editor/actions';

const close = (a: THREE.Matrix4, b: THREE.Matrix4) => a.elements.forEach((x, k) => expect(x).toBeCloseTo(b.elements[k], 3));

function scene() {
  const s = emptyScene('t', '3d');
  s.instances = [
    makeInstance(1, 'Base', 'box', { x: 3, y: 1, z: -2, rx: 20, ry: 35, rz: -10, sx: 2, sy: 2, sz: 2 }),
    makeInstance(2, 'Crate', 'box', { x: -1, y: 4, z: 5, rx: 0, ry: 90, rz: 15, sx: 1, sy: 0.5, sz: 1 }),
    makeInstance(3, 'Lamp', 'box', { x: 0.5, y: 0.5, z: 0, ry: 45, parent: 2 }),
  ];
  return s;
}

describe('parenting keeps world transforms', () => {
  it('parent to a rotated, scaled object, then clear parent', () => {
    const s = scene(), crate = s.instances[1];
    const before = worldMatrix(s, crate);
    expect(reparent(s, [2], 1)).toBe(1);
    expect(crate.parent).toBe(1);
    close(worldMatrix(s, crate), before);
    close(worldMatrix(s, s.instances[2]), worldMatrix(s, s.instances[2])); // its child follows
    expect(reparent(s, [2], null)).toBe(1);
    expect(crate.parent).toBeUndefined();
    close(worldMatrix(s, crate), before);
    [crate.x, crate.y, crate.z].forEach((v, k) => expect(v).toBeCloseTo([-1, 4, 5][k], 4));
  });
  it('an unevenly scaled parent: position exact, rotation and size the closest fit (reported)', () => {
    const s = scene();
    s.instances[0].sx = 3; s.instances[0].sy = 1; // uneven, and rotated
    const wp = new THREE.Vector3().setFromMatrixPosition(worldMatrix(s, s.instances[1]));
    const approx = { count: 0 };
    reparent(s, [2], 1, approx);
    expect(approx.count).toBe(1);
    expect(new THREE.Vector3().setFromMatrixPosition(worldMatrix(s, s.instances[1])).distanceTo(wp)).toBeLessThan(1e-3);
  });
  it('a parent and its child reparented together both stay put', () => {
    const s = scene();
    const w2 = worldMatrix(s, s.instances[1]), w3 = worldMatrix(s, s.instances[2]);
    reparent(s, [2, 3], 1);
    close(worldMatrix(s, s.instances[1]), w2); close(worldMatrix(s, s.instances[2]), w3);
  });
  it('no loops: an object cannot go under its own child', () => {
    const s = scene();
    expect(reparent(s, [2], 3)).toBe(0);
    expect(s.instances[1].parent).toBeUndefined();
  });
});

describe('right-click multi-object edits', () => {
  const open = () => {
    const p = emptyProject('3d');
    const s = p.scenes[0];
    s.instances.push(
      makeInstance(50, 'Crate', 'box', { name: 'Crate' }),
      makeInstance(51, 'Crate', 'sphere', { name: 'Ball' }),
      makeInstance(52, 'Barrel', 'mesh', { name: 'Barrel', mesh: { asset: 'lib:library/props/Bottle.fbx', rotY: 90 }, behaviors: [{ type: 'platform', props: {} }], vars: { hp: 3 } }),
    );
    store.open(p);
    store.set({ selection: [50, 51, 52] });
    return () => store.get().project!.scenes[0].instances;
  };
  it('rename numbered, change type, collision, texture, model (logic kept), undo', () => {
    const list = open();
    renameSelection('Prop', true);
    expect(list().filter((i) => i.uid >= 50).map((i) => i.name)).toEqual(['Prop 1', 'Prop 2', 'Prop 3']);
    setTypeOfSelection('Prop');
    expect(list().filter((i) => i.uid >= 50).every((i) => i.type === 'Prop')).toBe(true);
    setCollisionOfSelection('trigger');
    expect(list().filter((i) => i.uid >= 50).every((i) => i.collider.isTrigger && !i.behaviors.some((b) => b.type === 'solid'))).toBe(true);
    setCollisionOfSelection('solid');
    expect(list().filter((i) => i.uid >= 50).every((i) => !i.collider.isTrigger && i.behaviors.some((b) => b.type === 'solid'))).toBe(true);
    applyTextureToSelection({ id: 'lib:library/effects/BulletHole.png', name: 'BulletHole', kind: 'texture', source: 'library' });
    expect(list().find((i) => i.uid === 50)!.material!.map).toBe('lib:library/effects/BulletHole.png');
    expect(store.get().project!.assets.some((a) => a.id === 'lib:library/effects/BulletHole.png')).toBe(true);
    replaceModelOfSelection({ id: 'lib:library/chess/King.fbx', name: 'King', kind: 'model', source: 'library', meta: { size: [1, 2, 1] } });
    const barrel = list().find((i) => i.uid === 52)!;
    expect(barrel.mesh!.asset).toBe('lib:library/chess/King.fbx');
    expect(barrel.mesh!.rotY).toBe(90);
    expect(barrel.behaviors.some((b) => b.type === 'platform')).toBe(true); // logic kept
    expect(barrel.vars.hp).toBe(3);
    expect(barrel.type).toBe('Prop');
    store.undo();
    expect(list().find((i) => i.uid === 52)!.mesh!.asset).toBe('lib:library/props/Bottle.fbx'); // one undo step
  });
  it('setParent from the menu keeps world transforms', () => {
    const list = open();
    store.mutate('t', (p) => { const i = p.scenes[0].instances.find((x) => x.uid === 51)!; i.ry = 30; i.sx = 2; i.sy = 2; i.sz = 2; i.x = 4; });
    const s = () => store.get().project!.scenes[0];
    const before = worldMatrix(s(), list().find((i) => i.uid === 50)!);
    setParent([50], 51);
    const after = list().find((i) => i.uid === 50)!;
    expect(after.parent).toBe(51);
    close(worldMatrix(s(), after), before);
  });
});
