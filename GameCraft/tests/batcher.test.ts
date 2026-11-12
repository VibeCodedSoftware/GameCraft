// Automatic instancing: who shares a draw call, and that nothing logic does can leave an object drawn wrong or not at all.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BATCHED_LAYER, Batcher, batchAwareSort, materialKey, type Batchable } from '../src/engine/batcher';

const box = new THREE.BoxGeometry();
const material = (color = 0xff0000) => new THREE.MeshStandardMaterial({ color });
let nextUid = 1;

function entry(root: THREE.Object3D, x = 0, z = 0, mat: THREE.Material = material(), geometry: THREE.BufferGeometry = box, extra: Partial<Batchable> = {}): Batchable & { mesh: THREE.Mesh } {
  const obj = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.userData.cull = true;
  obj.position.set(x, 0, z);
  obj.add(mesh); root.add(obj);
  return { uid: nextUid++, obj, visual: mesh, mesh, ...extra };
}
const OPTS = { mode2d: false, frustum: true };
function step(b: Batcher, root: THREE.Object3D, list: Batchable[], opts = OPTS as any) { root.updateMatrixWorld(true); b.update(list, opts); }
const drawsItself = (e: { mesh: THREE.Mesh }) => e.mesh.layers.mask === 1;
const batches = (b: Batcher) => b.root.children.filter((c) => c.visible) as THREE.InstancedMesh[];

function scene() { const root = new THREE.Group(); const b = new Batcher(); root.add(b.root); return { root, b }; }

describe('who shares a draw call', () => {
  it('identical objects do, each with its own transform', () => {
    const { root, b } = scene();
    const list = [entry(root, 1), entry(root, 2), entry(root, 3)];
    step(b, root, list);
    expect(b.stats).toEqual({ batches: 1, objects: 3, drawCallsSaved: 2 });
    expect(list.every((e) => !drawsItself(e))).toBe(true);
    const m = batches(b)[0];
    expect(m.count).toBe(3);
    const t = new THREE.Matrix4();
    m.getMatrixAt(2, t);
    expect(t.elements[12]).toBe(3);
  });
  it('a lone object just draws itself', () => {
    const { root, b } = scene();
    const e = entry(root);
    step(b, root, [e]);
    expect(b.stats.batches).toBe(0);
    expect(drawsItself(e)).toBe(true);
  });
  it('different colours, shapes or roughness never mix', () => {
    const { root, b } = scene();
    const rough = material(); rough.roughness = 0.1;
    const list = [entry(root, 1), entry(root, 2), entry(root, 1, 0, material(0x00ff00)), entry(root, 1, 0, rough), entry(root, 1, 0, material(), new THREE.SphereGeometry())];
    step(b, root, list);
    expect(b.stats).toMatchObject({ batches: 1, objects: 2 });
    expect(list.slice(2).every(drawsItself)).toBe(true);
  });
  it('far-apart objects use different batches, so off-screen ones can be skipped', () => {
    const { root, b } = scene();
    step(b, root, [entry(root, 0), entry(root, 1), entry(root, 200), entry(root, 201)]);
    expect(b.stats.batches).toBe(2);
    const spheres = batches(b).map((m) => m.boundingSphere!.center.x);
    expect(Math.min(...spheres)).toBeLessThan(5);
    expect(Math.max(...spheres)).toBeGreaterThan(190);
  });
  it('never takes the things that must draw themselves', () => {
    const { root, b } = scene();
    const glass = () => { const m = material(); m.transparent = true; m.opacity = 0.5; return m; };
    const flipped = entry(root, 1); flipped.obj.scale.x = -1;
    const flipped2 = entry(root, 2); flipped2.obj.scale.x = -1;
    const cases = [
      entry(root, 1, 0, glass()), entry(root, 2, 0, glass()),
      flipped, flipped2,
      entry(root, 1, 0, material(), box, { mixer: {} }), entry(root, 2, 0, material(), box, { mixer: {} }),
      entry(root, 1, 0, material(), box, { water: {} }), entry(root, 2, 0, material(), box, { water: {} }),
      entry(root, 1, 0, material(), box, { animMaps: [{}] }), entry(root, 2, 0, material(), box, { animMaps: [{}] }),
    ];
    step(b, root, cases);
    expect(b.stats.batches).toBe(0);
    expect(cases.every(drawsItself)).toBe(true);
  });
  it('sprites only in 2D, only a single frame, and one batch per depth', () => {
    const { root, b } = scene();
    const pic = new THREE.Texture(); const mat = () => { const m = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, map: pic.clone() }); return m; };
    const sprite = (x: number, z = 0, frames = 1) => { const e = entry(root, x, 0, mat(), new THREE.PlaneGeometry(), { spriteState: { frames, sheet: null } }); e.obj.position.set(x, 0, z); return e; };
    const list = [sprite(1), sprite(2), sprite(3, 0.5), sprite(4, 0.5), sprite(5, 0, 4), sprite(6, 0, 4)];
    step(b, root, list, { ...OPTS, mode2d: true });
    expect(b.stats).toMatchObject({ batches: 2, objects: 4 });
    expect(batches(b).map((m) => m.position.z).sort()).toEqual([0, 0.5]);
    expect(drawsItself(list[4])).toBe(true);
    b.clear();
    step(b, root, list, { ...OPTS, mode2d: false });
    expect(b.stats.batches).toBe(0);
  });
});

describe('what logic does next is safe', () => {
  it('moving one updates its copy', () => {
    const { root, b } = scene();
    const list = [entry(root, 1), entry(root, 2)];
    step(b, root, list);
    const m = batches(b)[0];
    const v = m.instanceMatrix.version;
    list[1].obj.position.x = 5;
    step(b, root, list);
    const t = new THREE.Matrix4(); m.getMatrixAt(1, t);
    expect(t.elements[12]).toBe(5);
    expect(m.instanceMatrix.version).toBeGreaterThan(v);
    expect(m.boundingSphere!.radius).toBeGreaterThan(1);
  });
  it('nothing changed: nothing is sent to the graphics card', () => {
    const { root, b } = scene();
    const list = [entry(root, 1), entry(root, 2)];
    step(b, root, list);
    const m = batches(b)[0], v = m.instanceMatrix.version;
    step(b, root, list); step(b, root, list);
    expect(m.instanceMatrix.version).toBe(v);
  });
  it('hiding one takes it out; showing it brings it back', () => {
    const { root, b } = scene();
    const list = [entry(root, 1), entry(root, 2), entry(root, 3)];
    step(b, root, list);
    list[1].obj.visible = false;
    step(b, root, list);
    expect(batches(b)[0].count).toBe(2);
    list[1].obj.visible = true;
    step(b, root, list);
    expect(batches(b)[0].count).toBe(3);
  });
  it('recolouring one sends it to draw itself at once', () => {
    const { root, b } = scene();
    const list = [entry(root, 1), entry(root, 2), entry(root, 3)];
    step(b, root, list);
    (list[0].mesh.material as THREE.MeshStandardMaterial).color.set(0x0000ff);
    step(b, root, list);
    expect(drawsItself(list[0])).toBe(true);
    expect(b.stats.objects).toBe(2);
    expect((batches(b)[0].material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xff0000);
  });
  it('fading one sends it to draw itself', () => {
    const { root, b } = scene();
    const list = [entry(root, 1), entry(root, 2), entry(root, 3)];
    step(b, root, list);
    const m = list[2].mesh.material as THREE.MeshStandardMaterial; m.transparent = true; m.opacity = 0.4;
    step(b, root, list);
    expect(drawsItself(list[2])).toBe(true);
  });
  it('the last two parting: both draw themselves, the batch disappears', () => {
    const { root, b } = scene();
    const list = [entry(root, 1), entry(root, 2)];
    step(b, root, list);
    list[1].obj.visible = false;
    step(b, root, list);
    expect(batches(b)).toEqual([]);
    expect(drawsItself(list[0])).toBe(true);
    expect(drawsItself(list[1])).toBe(true);
  });
  it('a destroyed first member: the batch carries on with a material still in use', () => {
    const { root, b } = scene();
    const list = [entry(root, 1), entry(root, 2), entry(root, 3)];
    step(b, root, list);
    step(b, root, list.slice(1));
    expect(batches(b)[0].material).toBe(list[1].mesh.material);
    expect(batches(b)[0].count).toBe(2);
  });
  it('more objects than the batch holds: it grows', () => {
    const { root, b } = scene();
    const list = Array.from({ length: 4 }, (_, n) => entry(root, n * 0.5));
    step(b, root, list);
    for (let n = 0; n < 40; n++) list.push(entry(root, n * 0.1));
    step(b, root, list);
    expect(batches(b)).toHaveLength(1);
    expect(batches(b)[0].count).toBe(44);
  });
  it('an object excluded later (it gets an effect) draws itself', () => {
    const { root, b } = scene();
    const list = [entry(root, 1), entry(root, 2), entry(root, 3)];
    step(b, root, list);
    step(b, root, list, { ...OPTS, excluded: (u: number) => u === list[0].uid });
    expect(drawsItself(list[0])).toBe(true);
  });
  it('turning it off or leaving play puts every object back', () => {
    const { root, b } = scene();
    const list = [entry(root, 1), entry(root, 2)];
    step(b, root, list);
    expect(b.active).toBe(true);
    b.clear();
    expect(list.every(drawsItself)).toBe(true);
    expect(b.root.children).toHaveLength(0);
    expect(b.active).toBe(false);
  });
  it('clicks still reach the original objects, never a batch', () => {
    const { root, b } = scene();
    const list = [entry(root, 1), entry(root, 3)];
    step(b, root, list);
    const ray = new THREE.Raycaster(new THREE.Vector3(3, 0, 10), new THREE.Vector3(0, 0, -1));
    ray.layers.enable(BATCHED_LAYER);
    const hits = ray.intersectObjects([root], true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => !(h.object as THREE.InstancedMesh).isInstancedMesh)).toBe(true);
    expect(hits[0].object).toBe(list[1].mesh);
  });
});

describe('details', () => {
  it('the same picture cloned for each sprite counts as the same look; another frame does not', () => {
    const t = new THREE.Texture();
    const a = new THREE.MeshBasicMaterial({ map: t.clone() }), c = new THREE.MeshBasicMaterial({ map: t.clone() });
    expect(materialKey(a)).toBe(materialKey(c));
    c.map!.offset.x = 0.5;
    expect(materialKey(a)).not.toBe(materialKey(c));
  });
  it('a batch takes the draw-order place of its first object among equals', () => {
    const item = (z: number, id: number, sortId?: number) => ({ groupOrder: 0, renderOrder: 0, z, id, object: { userData: { sortId } } as any });
    const batch = item(0, 500, 10), player = item(0, 20);
    expect(batchAwareSort(batch, player)).toBeLessThan(0); // the tiles first, the player on top, as without batching
    expect(batchAwareSort(item(1, 1), item(0, 2))).toBeLessThan(0); // farther first
  });
});
