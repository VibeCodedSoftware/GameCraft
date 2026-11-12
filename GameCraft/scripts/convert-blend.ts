// Developer tool: run the .blend -> three.js converter and report what it produced.
// Usage: npx vite-node scripts/convert-blend.ts <file.blend> [ObjectName ...]
import fs from 'node:fs';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { blendToThree, extractObject } from '../src/asset-import/blend/blendToThree';

const [file, ...names] = process.argv.slice(2);
const t0 = Date.now();
const res = blendToThree(fs.readFileSync(file));
console.log(`converted in ${Date.now() - t0} ms, Blender ${res.version}, fps ${res.fps}, ${res.objects.length} objects, ${res.animations.length} clips`);
for (const c of res.animations) console.log(`  clip ${c.name.padEnd(20)} ${c.duration.toFixed(2)}s tracks=${c.tracks.length} ${JSON.stringify(c.userData)}`);
console.log('warnings:', [...new Set(res.warnings)].slice(0, 25));
for (const n of names) {
  const ex = extractObject(res, n, (o) => SkeletonUtils.clone(o));
  if (!ex) { console.log('missing', n); continue; }
  ex.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(ex.group);
  let meshes = 0, tris = 0, skinned = 0, bones = 0;
  ex.group.traverse((o: any) => { if (o.isMesh) { meshes++; tris += o.geometry.attributes.position.count / 3; if (o.isSkinnedMesh) { skinned++; bones = o.skeleton.bones.length; } } });
  const info = res.objects.find((o) => o.name === n);
  console.log(`${n}: size ${box.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(2))} min ${box.min.toArray().map((v) => v.toFixed(2))} meshes=${meshes} tris=${tris} skinned=${skinned} bones=${bones} clips=[${ex.animations.map((a) => a.name)}] mats=${info?.materials.join('|')}`);
}
