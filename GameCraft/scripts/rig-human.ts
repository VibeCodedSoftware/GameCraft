// Developer tool: rig the LowPolyHuman OBJ onto the CC0 Quaternius "Universal Animation Library" skeleton and
// write a single GLB with the character and all of the library's animations.
//   npx vite-node scripts/rig-human.ts
// Steps: (1) turn/scale the OBJ onto the rig's T-pose (rig faces +Z, the OBJ faces +X), (2) move the arm bones down
// to the OBJ's arm height (its arms sit lower than the mannequin's), (3) skin weights from each vertex's distance to
// the bone segments, (4) keep the animations' rotations and drop per-bone translation keys that would undo the fit
// (hips and root keep theirs), (5) write the GLB (original buffer + the new mesh data).
import fs from 'node:fs';
import * as THREE from 'three';

const SRC = 'asset-library/animations/UniversalAnimationLibrary.glb';
const OBJ = 'Assets/LowPolyHuman.obj';
const MTL = 'Assets/LowPolyHuman.mtl';
const OUT = 'asset-library/characters/LowPolyHuman_Animated.glb';

// ---- read the source GLB
const glb = fs.readFileSync(SRC);
const jsonLen = glb.readUInt32LE(12);
const j = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen));

const parent = new Map<number, number>();
j.nodes.forEach((n: any, i: number) => n.children?.forEach((c: number) => parent.set(c, i)));
const localOf = (n: any) => new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1])));
const worldOf = (i: number): THREE.Matrix4 => { const p = parent.get(i); return p == null ? localOf(j.nodes[i]) : worldOf(p).multiply(localOf(j.nodes[i])); };
const skin = j.skins[0];
const joints: number[] = skin.joints;
const nameOf = (i: number) => j.nodes[i].name as string;
const byName = (n: string) => j.nodes.findIndex((x: any) => x.name === n);

// Mannequin height (rig units are meters).
const manMesh = j.meshes.find((m: any) => m.name === 'Mannequin');
const posAcc = j.accessors[manMesh.primitives[0].attributes.POSITION];
const rigHeight = posAcc.max[1] - posAcc.min[1];

// ---- the OBJ, turned to face +Z with arms along X, scaled to the rig height, feet at y = 0
const objText = fs.readFileSync(OBJ, 'utf8').split(/\r?\n/);
const V = objText.filter((l) => l.startsWith('v ')).map((l) => l.split(/\s+/).slice(1, 4).map(Number));
const F = objText.filter((l) => l.startsWith('f ')).map((l) => l.split(/\s+/).slice(1).filter(Boolean).map((s) => parseInt(s, 10) - 1));
const minY = Math.min(...V.map((p) => p[1])), maxY = Math.max(...V.map((p) => p[1]));
const s = rigHeight / (maxY - minY);
const P = V.map(([x, y, z]) => new THREE.Vector3(-z * s, (y - minY) * s, x * s)); // rotate -90° about Y, scale, ground
// Arm height of the OBJ: the hands (farthest out sideways).
const span = Math.max(...P.map((p) => Math.abs(p.x)));
const hands = P.filter((p) => Math.abs(p.x) > span * 0.85);
const meshArmY = hands.reduce((a, p) => a + p.y, 0) / hands.length;

// ---- fitted skeleton: same rotations, arm chains lowered to the OBJ's arm height
const W = new Map<number, THREE.Matrix4>();
for (const ji of joints) W.set(ji, worldOf(ji));
const pos = (ji: number) => new THREE.Vector3().setFromMatrixPosition(W.get(ji)!);
const rigArmY = pos(byName('DEF-upper_arm.L')).y;
const dy = meshArmY - rigArmY;
const inArm = (ji: number) => { for (let k: number | undefined = ji; k != null; k = parent.get(k)) if (/DEF-shoulder\.[LR]$/.test(nameOf(k))) return true; return false; };
const fitted = new Map<number, THREE.Matrix4>();
for (const ji of joints) {
  const m = W.get(ji)!.clone();
  if (inArm(ji)) { const p = new THREE.Vector3().setFromMatrixPosition(m); p.y += dy; m.setPosition(p); }
  fitted.set(ji, m);
}
// New local transforms (translation changes only) for every joint.
for (const ji of joints) {
  const p = parent.get(ji);
  const parentW = p == null ? new THREE.Matrix4() : fitted.get(p) ?? worldOf(p);
  const local = parentW.clone().invert().multiply(fitted.get(ji)!);
  const t = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  local.decompose(t, q, sc);
  j.nodes[ji].translation = t.toArray();
}
console.log(`rig height ${rigHeight.toFixed(3)} m, OBJ scale ${s.toFixed(4)}, arm height rig ${rigArmY.toFixed(3)} -> mesh ${meshArmY.toFixed(3)} (dy ${dy.toFixed(3)})`);

// ---- bone segments for skinning (fingers/thumbs belong to the hand)
const segs: { joint: number; a: THREE.Vector3; b: THREE.Vector3 }[] = [];
const fp = (n: string) => new THREE.Vector3().setFromMatrixPosition(fitted.get(byName(n))!);
const add = (n: string, to: string | THREE.Vector3) => segs.push({ joint: joints.indexOf(byName(n)), a: fp(n), b: typeof to === 'string' ? fp(to) : to });
add('DEF-hips', 'DEF-spine.001'); add('DEF-spine.001', 'DEF-spine.002'); add('DEF-spine.002', 'DEF-spine.003'); add('DEF-spine.003', 'DEF-neck');
add('DEF-neck', 'DEF-head'); add('DEF-head', fp('DEF-head').add(new THREE.Vector3(0, 0.22, 0)));
for (const side of ['L', 'R']) {
  add(`DEF-shoulder.${side}`, `DEF-upper_arm.${side}`); add(`DEF-upper_arm.${side}`, `DEF-forearm.${side}`); add(`DEF-forearm.${side}`, `DEF-hand.${side}`);
  add(`DEF-hand.${side}`, fp(`DEF-hand.${side}`).add(new THREE.Vector3(side === 'L' ? 0.2 : -0.2, 0, 0)));
  add(`DEF-thigh.${side}`, `DEF-shin.${side}`); add(`DEF-shin.${side}`, `DEF-foot.${side}`); add(`DEF-foot.${side}`, `DEF-toe.${side}`);
  add(`DEF-toe.${side}`, fp(`DEF-toe.${side}`).add(new THREE.Vector3(0, 0, 0.08)));
}
const segDist = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => { const ab = b.clone().sub(a); const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return a.clone().addScaledVector(ab, t).distanceTo(p); };
function weightsFor(p: THREE.Vector3): [number[], number[]] {
  const d = segs.map((sg) => ({ joint: sg.joint, d: segDist(p, sg.a, sg.b) }));
  // Keep a vertex on its own side of the body for limbs (no arm vertex pulled by the other arm).
  const filtered = d.filter((x) => { const n = nameOf(joints[x.joint]); return !(/\.L$/.test(n) && p.x < -0.04) && !(/\.R$/.test(n) && p.x > 0.04); });
  filtered.sort((a, b) => a.d - b.d);
  const best = filtered[0].d;
  const cand = filtered.filter((x) => x.d <= best * 1.5 + 0.02).slice(0, 4);
  const w = cand.map((x) => 1 / Math.pow(x.d + 0.02, 4));
  const sum = w.reduce((a, b) => a + b, 0);
  const J = [0, 0, 0, 0], Wt = [0, 0, 0, 0];
  cand.forEach((x, i) => { J[i] = x.joint; Wt[i] = w[i] / sum; });
  return [J, Wt];
}

// ---- flat-shaded, non-indexed mesh data (low-poly look)
const pos3: number[] = [], nrm3: number[] = [], jnt: number[] = [], wgt: number[] = [];
const vw = P.map((p) => weightsFor(p));
for (const f of F) for (let k = 1; k + 1 < f.length; k++) {
  const tri = [f[0], f[k], f[k + 1]];
  const [a, b, c] = tri.map((i) => P[i]);
  const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  for (const i of tri) { pos3.push(P[i].x, P[i].y, P[i].z); nrm3.push(n.x, n.y, n.z); jnt.push(...vw[i][0]); wgt.push(...vw[i][1]); }
}
const count = pos3.length / 3;

// ---- material color from the MTL
const kd = (fs.readFileSync(MTL, 'utf8').match(/^Kd\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/m) ?? [, '0.8', '0.8', '0.8']).slice(1, 4).map(Number);

// ---- append buffers
const chunks: Buffer[] = [bin];
let offset = bin.length;
const pad4 = () => { const p = (4 - (offset % 4)) % 4; if (p) { chunks.push(Buffer.alloc(p)); offset += p; } };
function addView(buf: Buffer) { pad4(); const view = j.bufferViews.length; j.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length }); chunks.push(buf); offset += buf.length; return view; }
function addAccessor(view: number, componentType: number, type: string, cnt: number, extra: any = {}) { j.accessors.push({ bufferView: view, componentType, count: cnt, type, ...extra }); return j.accessors.length - 1; }
const f32 = (a: number[]) => Buffer.from(new Float32Array(a).buffer);
const mn = [0, 1, 2].map((i) => Math.min(...pos3.filter((_, k) => k % 3 === i))), mx = [0, 1, 2].map((i) => Math.max(...pos3.filter((_, k) => k % 3 === i)));
const aPos = addAccessor(addView(f32(pos3)), 5126, 'VEC3', count, { min: mn, max: mx });
const aNrm = addAccessor(addView(f32(nrm3)), 5126, 'VEC3', count);
const aJnt = addAccessor(addView(Buffer.from(new Uint16Array(jnt).buffer)), 5123, 'VEC4', count);
const aWgt = addAccessor(addView(f32(wgt)), 5126, 'VEC4', count);
// Inverse bind matrices for the fitted skeleton.
const ibm: number[] = [];
for (const ji of joints) ibm.push(...fitted.get(ji)!.clone().invert().toArray());
skin.inverseBindMatrices = addAccessor(addView(f32(ibm)), 5126, 'MAT4', joints.length);

j.materials.push({ name: 'LowPolyHuman', pbrMetallicRoughness: { baseColorFactor: [...kd, 1], metallicFactor: 0, roughnessFactor: 0.75 } });
manMesh.name = 'LowPolyHuman';
manMesh.primitives = [{ attributes: { POSITION: aPos, NORMAL: aNrm, JOINTS_0: aJnt, WEIGHTS_0: aWgt }, material: j.materials.length - 1, mode: 4 }];
j.nodes.forEach((n: any) => { if (n.name === 'Mannequin') n.name = 'LowPolyHuman'; });

// ---- animations: rotations drive the motion; translation keys only on hips and root
const keepT = new Set([byName('root'), byName('DEF-hips')]);
let dropped = 0;
for (const anim of j.animations) {
  const before = anim.channels.length;
  anim.channels = anim.channels.filter((c: any) => c.target.path !== 'translation' || keepT.has(c.target.node));
  dropped += before - anim.channels.length;
}
j.asset.generator = 'GameCraft rig-human.ts (LowPolyHuman on Quaternius Universal Animation Library, CC0)';

// ---- write GLB
pad4();
const binOut = Buffer.concat(chunks);
j.buffers = [{ byteLength: binOut.length }];
let jsonBuf = Buffer.from(JSON.stringify(j), 'utf8');
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binOut.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binOut.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync('asset-library/characters', { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([header, jh, jsonBuf, bh, binOut]));
console.log(`wrote ${OUT}: ${count / 3} triangles, ${joints.length} joints, ${j.animations.length} animations, dropped ${dropped} translation channels`);
