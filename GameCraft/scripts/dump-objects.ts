// Diagnostic: per object, its materials as imported (color, maps, emissive, transparency) and UV ranges.
// Usage: npx tsx scripts/dump-objects.ts <file.blend> <object name regex>
import fs from 'node:fs';
import * as THREE from 'three';
import { blendToThree } from '../src/asset-import/blend/blendToThree';

const [file, filter] = process.argv.slice(2);
const res = blendToThree(new Uint8Array(fs.readFileSync(file)), {});
const re = new RegExp(filter, 'i');
const seen = new Set<string>();
res.root.traverse((o) => {
  if (!re.test(o.name) || seen.has(o.name)) return;
  seen.add(o.name);
  const m = o as THREE.Mesh;
  if (!m.isMesh) { console.log(`${o.name} (${o.type}) children=${o.children.map((c) => c.name).join(',')}`); return; }
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  const uv = m.geometry.getAttribute('uv');
  let uvr = '';
  if (uv) { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (let i = 0; i < uv.count; i++) { a = Math.min(a, uv.getX(i)); b = Math.max(b, uv.getX(i)); c = Math.min(c, uv.getY(i)); d = Math.max(d, uv.getY(i)); } uvr = `uv u[${a.toFixed(2)},${b.toFixed(2)}] v[${c.toFixed(2)},${d.toFixed(2)}]`; }
  const bb = new THREE.Box3().setFromObject(m); const s = bb.getSize(new THREE.Vector3());
  console.log(`${o.name}  size ${s.x.toFixed(2)}x${s.y.toFixed(2)}x${s.z.toFixed(2)} scale ${m.getWorldScale(new THREE.Vector3()).toArray().map((x) => x.toFixed(2))} ${uvr}`);
  for (const mt of mats as THREE.MeshStandardMaterial[]) console.log(`   ${mt.name}: color #${mt.color?.getHexString()} map=${!!mt.map}${mt.map ? ` rep=${mt.map.repeat.toArray()} rot=${mt.map.rotation.toFixed(2)}` : ''} emissive #${mt.emissive?.getHexString()}x${mt.emissiveIntensity} emap=${!!mt.emissiveMap} transparent=${mt.transparent} opacity=${mt.opacity} depthWrite=${mt.depthWrite}`);
});
console.log('animations:', res.animations.map((a) => `${a.name}(${a.duration.toFixed(2)}s)`).join(', '));
console.log('warnings:', [...new Set(res.warnings)].slice(0, 10).join(' | '));

