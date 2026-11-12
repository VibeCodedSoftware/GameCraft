// Shatter: an object's own mesh is cut into many closed pieces (outside keeps its material, cuts get the inside one).
import { expect, it } from 'vitest';
import * as THREE from 'three';
import { DebrisSystem, averageColor, collect, fracture, piecesFor, sampleSurface } from '../src/engine/shatter';

it('a model still loading is not cut: its purple placeholder box is never the pieces', () => {
  const g = new THREE.Group();
  const ph = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x8a5cf6 })); ph.name = 'placeholder'; g.add(ph);
  expect(collect(g)).toBeNull();
  const d = new DebrisSystem(new THREE.Group());
  expect(d.prepare(g, 'k', { pieces: 10, inside: '' })).toBe(false);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial({ color: 0x00ff00 })));
  expect(collect(g)!.materials.map((m) => (m as THREE.MeshStandardMaterial).color.getHex())).toEqual([0x00ff00]);
  expect(d.prepare(g, 'k', { pieces: 10, inside: '' })).toBe(true);
});

it('outer and inner textures go on the outside and the cut faces, not each other', () => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 })));
  const outer = new THREE.Texture(), inner = new THREE.Texture();
  const d = new DebrisSystem(new THREE.Group());
  d.textureOf = (id) => (id === 'out' ? outer : id === 'in' ? inner : null);
  expect(d.prepare(g, 'k', { pieces: 8, inside: '', outsideTexture: 'out', insideTexture: 'in' })).toBe(true);
  const mats = (d as any).cache.get('k').materials as THREE.MeshStandardMaterial[];
  expect(mats[0].map).toBe(outer); expect(mats[0].color.getHex()).toBe(0xffffff);
  expect(mats[mats.length - 1].map).toBe(inner);
  // The object's own material is not touched.
  expect((g.children[0] as THREE.Mesh<any, THREE.MeshStandardMaterial>).material.map).toBeNull();
  // Low quality gets the outer texture too, and its own colour if there is none.
  const plain = new DebrisSystem(new THREE.Group());
  expect(plain.prepare(g, 'low', { pieces: 50, quality: 'low', inside: '' })).toBe(true);
  expect((plain as any).bitCache.get('low').col[0]).toBeGreaterThan(0.9);
});

it('quality: medium makes fewer real pieces, low bits are capped', () => {
  expect(piecesFor('high', 120)).toBe(120);
  expect(piecesFor('medium', 120)).toBe(30);
  expect(piecesFor('medium', 40)).toBe(10);
  expect(piecesFor('low', 1000)).toBe(400);
});

it('a posed skinned mesh is cut where its skeleton has it, not where its file put it', () => {
  // Two-bone strip; the second bone moved 3 up. Bound vertices at y=1 must come out at y=4.
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const n = geo.getAttribute('position').count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, k) => (k % 4 === 0 ? 1 : 0)), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, k) => (k % 4 === 0 ? 1 : 0)), 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
  const a = new THREE.Bone(), b = new THREE.Bone(); a.add(b);
  const root = new THREE.Group(); root.add(mesh); root.add(a);
  mesh.bind(new THREE.Skeleton([a, b]));
  b.position.y = 3; root.updateMatrixWorld(true); mesh.skeleton.update();
  const got = collect(root)!;
  let top = -Infinity; for (let i = 1; i < got.soup.pos.length; i += 3) top = Math.max(top, got.soup.pos[i]);
  expect(top).toBeCloseTo(3.5, 4);
});

it('the cut colour comes from the whole object, not whichever part came first', () => {
  const g = new THREE.Group();
  // A tiny purple part first, a big brown one after.
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x8000ff })));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0x8b5a2b })));
  const got = collect(g)!;
  const avg = averageColor(got.soup, got.materials), brown = new THREE.Color(0x8b5a2b);
  expect(avg.r).toBeCloseTo(brown.r, 2); expect(avg.b).toBeCloseTo(brown.b, 2);
});

it('low quality bits sit on the surface with its colours', () => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 })));
  const got = collect(g)!;
  const s = sampleSurface(got.soup, got.materials, 100, 5);
  expect(s.pos.length).toBe(300);
  for (let i = 0; i < 100; i++) {
    const m = Math.max(Math.abs(s.pos[i * 3]), Math.abs(s.pos[i * 3 + 1]), Math.abs(s.pos[i * 3 + 2]));
    expect(m).toBeCloseTo(0.5, 4); // on a face of the box, not inside or off it
    expect(s.col[i * 3]).toBeGreaterThan(0.9); expect(s.col[i * 3 + 1]).toBe(0);
  }
});

function crate() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 2, 2, 2), new THREE.MeshStandardMaterial({ color: 0x8b5a2b })));
  return g;
}

it('cuts a box into the requested number of pieces with caps inside', () => {
  const got = collect(crate())!;
  const inside = new THREE.MeshStandardMaterial();
  const fr = fracture(got.soup, got.materials, 60, 7, inside);
  expect(fr.pieces.length).toBeGreaterThanOrEqual(55);
  expect(fr.materials[fr.materials.length - 1]).toBe(inside);
  const capIndex = fr.materials.length - 1;
  const withCaps = fr.pieces.filter((p) => p.geo.groups.some((gr) => gr.materialIndex === capIndex));
  expect(withCaps.length).toBe(fr.pieces.length); // every piece of a closed box is closed by cut faces
  const withSkin = fr.pieces.filter((p) => p.geo.groups.some((gr) => gr.materialIndex === 0));
  expect(withSkin.length).toBeGreaterThan(fr.pieces.length * 0.5);
  // Cut faces point out of their (convex) piece, so they are lit from outside.
  let out = 0, inn = 0;
  for (const p of fr.pieces) {
    const pos = p.geo.getAttribute('position'), nrm = p.geo.getAttribute('normal');
    // The average of a convex piece's vertices is inside it (its bounding-box centre may not be, for slanted slivers).
    const m = new THREE.Vector3(); for (let k = 0; k < pos.count; k++) m.add(new THREE.Vector3().fromBufferAttribute(pos, k)); m.divideScalar(pos.count);
    for (const gr of p.geo.groups) if (gr.materialIndex === capIndex) for (let k = gr.start; k < gr.start + gr.count; k += 3) {
      const cx = (pos.getX(k) + pos.getX(k + 1) + pos.getX(k + 2)) / 3 - m.x, cy = (pos.getY(k) + pos.getY(k + 1) + pos.getY(k + 2)) / 3 - m.y, cz = (pos.getZ(k) + pos.getZ(k + 1) + pos.getZ(k + 2)) / 3 - m.z;
      if (cx * nrm.getX(k) + cy * nrm.getY(k) + cz * nrm.getZ(k) > 0) out++; else inn++;
      // Winding agrees with the normal (front faces are the outside).
      const a = new THREE.Vector3().fromBufferAttribute(pos, k), b = new THREE.Vector3().fromBufferAttribute(pos, k + 1), c = new THREE.Vector3().fromBufferAttribute(pos, k + 2);
      const fn = b.sub(a).cross(c.sub(a));
      if (fn.lengthSq() > 1e-12) expect(fn.dot(new THREE.Vector3().fromBufferAttribute(nrm, k))).toBeGreaterThan(0);
    }
  }
  expect(inn).toBe(0);
  expect(out).toBeGreaterThan(0);
  // Pieces stay inside the original box.
  for (const p of fr.pieces) for (const c of p.center.toArray()) expect(Math.abs(c)).toBeLessThanOrEqual(0.5001);
});

it('a thousand pieces in reasonable time', () => {
  const got = collect(crate())!;
  const t = performance.now();
  const fr = fracture(got.soup, got.materials, 1000, 3, new THREE.MeshStandardMaterial());
  expect(fr.pieces.length).toBeGreaterThan(900);
  expect(performance.now() - t).toBeLessThan(8000);
});
