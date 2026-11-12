// Diagnostic: which meshes use a material, with their size and UV extents (UV units per metre).
// Usage: npx tsx scripts/dump-uses.ts <file.blend> <material regex>
import fs from 'node:fs';
import * as THREE from 'three';
import { blendToThree } from '../src/asset-import/blend/blendToThree';

const [file, filter] = process.argv.slice(2);
const res = blendToThree(new Uint8Array(fs.readFileSync(file)), {});
const re = new RegExp(filter, 'i');
res.root.updateMatrixWorld(true);
res.root.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh) return;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  mats.forEach((mt, mi) => {
    if (!re.test(mt.name)) return;
    const g = m.geometry, uv = g.getAttribute('uv'), pos = g.getAttribute('position');
    const grp = g.groups.find((x) => x.materialIndex === mi) ?? { start: 0, count: pos.count };
    let du = 0, dl = 0;
    const s = m.getWorldScale(new THREE.Vector3());
    for (let i = grp.start; i + 2 < grp.start + grp.count && i < grp.start + 300; i += 3) {
      if (!uv) break;
      const a = new THREE.Vector3().fromBufferAttribute(pos, i).multiply(s), b = new THREE.Vector3().fromBufferAttribute(pos, i + 1).multiply(s);
      dl += a.distanceTo(b); du += Math.hypot(uv.getX(i) - uv.getX(i + 1), uv.getY(i) - uv.getY(i + 1));
    }
    const rep = (mt as any).map?.repeat?.toArray();
    console.log(`${m.name} [${mt.name}] tris=${grp.count / 3} uvPerMetre=${dl ? (du / dl).toFixed(4) : '?'} mapRepeat=${rep} → texture tiles per metre=${rep && dl ? ((du / dl) * rep[0]).toFixed(3) : '?'}`);
  });
});
