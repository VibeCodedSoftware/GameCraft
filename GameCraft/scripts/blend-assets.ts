// Developer tool: measure objects inside the template .blend files and generate compound wall colliders
// for the Backrooms room tiles. Writes src/templates/blendData.ts (sizes, pivots, collider boxes).
// Usage: npx vite-node scripts/blend-assets.ts
import fs from 'node:fs';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { blendToThree, extractObject, type BlendResult } from '../src/asset-import/blend/blendToThree';

const CELL = 0.125; // collider raster resolution in Blender units

interface Measured { min: number[]; max: number[]; size: number[]; clips: string[]; world: number[] }

function measure(res: BlendResult, name: string): { m: Measured; group: THREE.Group } | null {
  const ex = extractObject(res, name, (o) => SkeletonUtils.clone(o));
  if (!ex) { console.warn('missing', name); return null; }
  ex.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(ex.group);
  const node = res.byName.get(name)!;
  const wp = new THREE.Vector3(); node.getWorldPosition(wp);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    m: { min: box.min.toArray().map(r), max: box.max.toArray().map(r), size: box.getSize(new THREE.Vector3()).toArray().map(r), clips: ex.animations.map((a) => a.name), world: wp.toArray().map(r) },
    group: ex.group,
  };
}

/** Rasterize everything taller than `minTop` above the floor onto an XZ grid and merge cells into boxes. */
function wallBoxes(group: THREE.Group, floorY: number): number[][] {
  const tris: THREE.Vector3[][] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const pos = m.geometry.attributes.position;
    const idx = m.geometry.index;
    const count = idx ? idx.count : pos.count;
    for (let t = 0; t + 2 < count; t += 3) {
      const tri = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(m.matrixWorld));
      tris.push(tri);
    }
  });
  const box = new THREE.Box3().setFromObject(group);
  const x0 = box.min.x, z0 = box.min.z;
  const W = Math.ceil((box.max.x - x0) / CELL) + 1, H = Math.ceil((box.max.z - z0) / CELL) + 1;
  const top = new Float32Array(W * H).fill(-Infinity);
  const mark = (x: number, z: number, y: number) => {
    const i = Math.floor((x - x0) / CELL), j = Math.floor((z - z0) / CELL);
    if (i < 0 || j < 0 || i >= W || j >= H) return;
    if (y > top[j * W + i]) top[j * W + i] = y;
  };
  for (const tri of tris) {
    const ys = tri.map((p) => p.y);
    const maxY = Math.max(...ys), minY = Math.min(...ys);
    // Skip floor/ceiling-like geometry: only things that rise at least 0.4 above the floor and start near it block.
    if (maxY < floorY + 0.4 || minY > floorY + 1.2) continue;
    // Edges (vertical walls project to lines) ...
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL * 0.5)) + 1;
      for (let s = 0; s <= n; s++) { const t = s / n; mark(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, maxY); }
    }
    // ... and interiors (horizontal tops of thick walls).
    const [a, b, c] = tri;
    const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
    if (Math.abs(area) < 1e-6) continue;
    const i0 = Math.floor((Math.min(a.x, b.x, c.x) - x0) / CELL), i1 = Math.floor((Math.max(a.x, b.x, c.x) - x0) / CELL);
    const j0 = Math.floor((Math.min(a.z, b.z, c.z) - z0) / CELL), j1 = Math.floor((Math.max(a.z, b.z, c.z) - z0) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = x0 + (i + 0.5) * CELL, pz = z0 + (j + 0.5) * CELL;
      const w1 = ((b.x - px) * (c.z - pz) - (c.x - px) * (b.z - pz)) / area;
      const w2 = ((c.x - px) * (a.z - pz) - (a.x - px) * (c.z - pz)) / area;
      if (w1 >= 0 && w2 >= 0 && w1 + w2 <= 1) mark(px, pz, maxY);
    }
  }
  // Greedy merge of occupied cells into rectangles (rows first, then extend downwards).
  const used = new Uint8Array(W * H);
  const occ = (i: number, j: number) => top[j * W + i] > -Infinity && !used[j * W + i];
  const boxes: number[][] = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!occ(i, j)) continue;
    let w = 1; while (i + w < W && occ(i + w, j)) w++;
    let h = 1;
    outer: while (j + h < H) { for (let k = 0; k < w; k++) if (!occ(i + k, j + h)) break outer; h++; }
    let ymax = -Infinity;
    for (let jj = j; jj < j + h; jj++) for (let ii = i; ii < i + w; ii++) { used[jj * W + ii] = 1; ymax = Math.max(ymax, top[jj * W + ii]); }
    const cx = x0 + (i + w / 2) * CELL, cz = z0 + (j + h / 2) * CELL;
    const r = (v: number) => Math.round(v * 1000) / 1000;
    boxes.push([r(cx), r((floorY + ymax) / 2), r(cz), r(w * CELL), r(ymax - floorY), r(h * CELL)]);
  }
  return boxes;
}

const out: Record<string, any> = {};

// ---- Backrooms
if (process.argv.includes('--dungeon-only')) {
  const prev = fs.readFileSync('src/templates/blendData.ts', 'utf8');
  out.backrooms = JSON.parse(prev.slice(prev.indexOf('{'), prev.lastIndexOf('} as const') + 1)).backrooms;
} else {
  const t0 = Date.now();
  const res = blendToThree(fs.readFileSync('asset-library/backrooms/Backrooms_V10.blend'));
  console.log('backrooms parsed in', Date.now() - t0, 'ms');
  const rooms: Record<string, any> = {};
  for (let n = 1; n <= 25; n++) {
    const r = measure(res, 'p' + n);
    if (!r) continue;
    const floorY = 0; // tile origin sits on the floor plane
    // Only geometry inside the 15.1 m tile counts (a few tiles carry stray helper objects far away).
    const boxes = wallBoxes(r.group, floorY).filter((b) => Math.abs(b[0]) < 7.6 && Math.abs(b[2]) < 7.6);
    // Free floor spots (for spawning the player and items): grid points with clearance from every wall box.
    const clear = 0.42;
    const free: number[][] = [];
    for (let z = -6.5; z <= 6.5; z += 0.5) for (let x = -6.5; x <= 6.5; x += 0.5) {
      if (boxes.every((b) => Math.abs(x - b[0]) > b[3] / 2 + clear || Math.abs(z - b[2]) > b[5] / 2 + clear)) free.push([x, z]);
    }
    free.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    const spawn = free[0] ?? [0, 0];
    // Spread item spots: greedy farthest-point picks.
    const spots: number[][] = [];
    for (const f of free) if (spots.every((s) => Math.hypot(s[0] - f[0], s[1] - f[1]) > 2.6)) spots.push(f);
    rooms['p' + n] = { ...r.m, boxes, spawn, spots: spots.slice(0, 14) };
    console.log(`p${n}: size ${r.m.size} min ${r.m.min} boxes ${boxes.length} free ${free.length} spots ${spots.length} spawn ${spawn}`);
  }
  const named: Record<string, Measured> = {};
  for (const n of ['Ceiling', 'BacteriaaM.002', 'AlmondMilk', 'Bread', 'Bandage', 'Medkit', 'Plank', 'BuildingMaterial', 'PlacableWall', 'Glowstick', 'WallPreview', 'PlankPreview',
    'AlmondMilkHold', 'BreadHold', 'BandageHold', 'MedkitHold', 'PlankHold', 'BuildingMaterialHold', 'GlowstickHold', 'Camera.001', 'Cube.004']) {
    const r = measure(res, n);
    if (r) { named[n] = r.m; console.log(`${n}: size ${r.m.size} min ${r.m.min} world ${r.m.world} clips ${r.m.clips}`); }
  }
  // First-person view models: where each *Hold object sits in the Blender camera's frame. The extracted model
  // has its world rotation baked in, so the instance rotation is the inverse camera rotation (same for all).
  const cam = res.byName.get('Camera.001')!;
  res.root.updateMatrixWorld(true);
  const camInv = cam.matrixWorld.clone().invert();
  const qc = new THREE.Quaternion(); cam.matrixWorld.decompose(new THREE.Vector3(), qc, new THREE.Vector3());
  const e = new THREE.Euler().setFromQuaternion(qc.clone().invert(), 'XYZ');
  const deg = (r: number) => Math.round((r * 180) / Math.PI * 100) / 100;
  const holds: Record<string, any> = {};
  for (const n of ['AlmondHold', 'BreadHold', 'BandageHold', 'MedkitHold', 'BuildingMaterialHold', 'GlowstickHold']) {
    const node = res.byName.get(n); if (!node) continue;
    const ex = extractObject(res, n, (o) => SkeletonUtils.clone(o))!;
    ex.group.updateMatrixWorld(true);
    // Box center in world space = extracted (origin-relative) center + the object's world position.
    const c = new THREE.Box3().setFromObject(ex.group).getCenter(new THREE.Vector3()).add(node.getWorldPosition(new THREE.Vector3()));
    const local = c.applyMatrix4(camInv);
    holds[n] = { pos: local.toArray().map((v) => Math.round(v * 1000) / 1000) };
    console.log(n, 'camera-local', holds[n].pos);
  }
  const playerBox = res.byName.get('player') ? new THREE.Box3().setFromObject(res.byName.get('player')!) : null;
  const camWorld = cam.getWorldPosition(new THREE.Vector3());
  const camInfo = { rot: [deg(e.x), deg(e.y), deg(e.z)], lens: cam.userData.blenderCamera?.focalLength, sensor: cam.userData.blenderCamera?.sensorWidth, eye: playerBox ? Math.round((camWorld.y - playerBox.min.y) * 1000) / 1000 : 0.9, playerSize: playerBox?.getSize(new THREE.Vector3()).toArray() };
  console.log('camera', camInfo);
  out.backrooms = { rooms, named, holds, camera: camInfo };
}

// ---- Dungeon Bound: the user's level, one entry per top-level object with its world position and 3D colliders.
/** Voxelize a mesh group's surfaces (voxels centered on the surface) and greedily merge into boxes. */
function voxelBoxes(group: THREE.Group, VOX = 0.5): number[][] {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return [];
  const o = box.min.clone().subScalar(VOX);
  const W = Math.ceil((box.max.x - o.x) / VOX) + 2, H = Math.ceil((box.max.y - o.y) / VOX) + 2, D = Math.ceil((box.max.z - o.z) / VOX) + 2;
  const vox = new Uint8Array(W * H * D);
  const idx = (i: number, j: number, k: number) => (k * H + j) * W + i;
  const mark = (p: THREE.Vector3) => { const i = Math.round((p.x - o.x) / VOX), j = Math.round((p.y - o.y) / VOX), k = Math.round((p.z - o.z) / VOX); if (i >= 0 && j >= 0 && k >= 0 && i < W && j < H && k < D) vox[idx(i, j, k)] = 1; };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  group.traverse((ob) => {
    const m = ob as THREE.Mesh; if (!m.isMesh) return;
    let hidden = false; for (let q: THREE.Object3D | null = m; q; q = q.parent) if (!q.visible) hidden = true;
    if (hidden) return;
    const pos = m.geometry.attributes.position; const ix = m.geometry.index; const n = ix ? ix.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      a.fromBufferAttribute(pos, ix ? ix.getX(t) : t).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, ix ? ix.getX(t + 1) : t + 1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, ix ? ix.getX(t + 2) : t + 2).applyMatrix4(m.matrixWorld);
      const steps = Math.min(400, Math.ceil(Math.max(a.distanceTo(b), a.distanceTo(c), b.distanceTo(c)) / (VOX * 0.5)) + 1);
      for (let u = 0; u <= steps; u++) for (let v = 0; v <= steps - u; v++) {
        const w = steps - u - v;
        p.set((a.x * u + b.x * v + c.x * w) / steps, (a.y * u + b.y * v + c.y * w) / steps, (a.z * u + b.z * v + c.z * w) / steps);
        mark(p);
      }
    }
  });
  const used = new Uint8Array(vox.length);
  const free = (i: number, j: number, k: number) => vox[idx(i, j, k)] && !used[idx(i, j, k)];
  const out: number[][] = [];
  const r = (x: number) => Math.round(x * 1000) / 1000;
  for (let k = 0; k < D; k++) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!free(i, j, k)) continue;
    let w = 1; while (i + w < W && free(i + w, j, k)) w++;
    let d = 1; grow: while (k + d < D) { for (let x = 0; x < w; x++) if (!free(i + x, j, k + d)) break grow; d++; }
    let h = 1; growY: while (j + h < H) { for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) if (!free(i + x, j + h, k + z)) break growY; h++; }
    for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) used[idx(i + x, j + y, k + z)] = 1;
    // Voxel (i,j,k) is centered on o + (i,j,k) * VOX.
    out.push([r(o.x + (i + w / 2 - 0.5) * VOX), r(o.y + (j + h / 2 - 0.5) * VOX), r(o.z + (k + d / 2 - 0.5) * VOX), r(w * VOX), r(h * VOX), r(d * VOX)]);
  }
  return out;
}

{
  const res = blendToThree(fs.readFileSync('asset-library/dungeonbound/DungeonBound_4.blend'));
  res.root.updateMatrixWorld(true);
  const named: Record<string, Measured> = {};
  for (const n of ['Wizard.001', 'Heart1-', 'Heart2-', 'Heart3-', 'Key', 'Key.001', 'Circle', 'Lever1', 'Lever2', 'Door', 'Door2', 'Door2.002']) {
    const r = measure(res, n);
    if (r) { named[n] = r.m; console.log(`${n}: size ${r.m.size} min ${r.m.min} world ${r.m.world} clips ${r.m.clips}`); }
  }
  // Level pieces: every visible top-level mesh except the player rig and HUD hearts.
  const SKIP = /^(Wizard|Heart|PlayerCollider)/;
  const level: Record<string, { world: number[]; size: number[]; min: number[]; boxes?: number[][] }> = {};
  let total = 0;
  for (const o of res.objects) {
    if (o.type !== 'mesh' || o.parent || o.hidden || SKIP.test(o.name)) continue;
    const r = measure(res, o.name); if (!r) continue;
    const noCollide = /^(Key|Circle|Lever|Tourch)/.test(o.name);
    const t0 = Date.now();
    // Scenery and rough rock pillars get coarser voxels (only their walkable tops really matter).
    const vox = /^Mountain/.test(o.name) ? 2 : /^Platform/.test(o.name) ? 1 : 0.5;
    const boxes = noCollide ? undefined : voxelBoxes(r.group, vox);
    if (Date.now() - t0 > 2000) console.log(`  (${o.name} voxelized in ${Date.now() - t0} ms)`);
    total += boxes?.length ?? 0;
    level[o.name] = { world: r.m.world, size: r.m.size, min: r.m.min, boxes };
    console.log(`level ${o.name.padEnd(16)} world ${r.m.world} size ${r.m.size} boxes ${boxes?.length ?? '-'}`);
  }
  console.log('dungeon collider boxes total', total);
  const cam = res.byName.get('PlayerCamera'), pc = res.byName.get('PlayerCollider');
  const camOffset = cam && pc ? cam.getWorldPosition(new THREE.Vector3()).sub(pc.getWorldPosition(new THREE.Vector3())).toArray().map((v) => Math.round(v * 100) / 100) : [0, 8, 35];
  const respawn = res.byName.get('Respawn')?.getWorldPosition(new THREE.Vector3()).toArray().map((v) => Math.round(v * 100) / 100) ?? [0, 2, 0];
  const lights = res.objects.filter((o) => o.type === 'light').map((o) => { const n = res.byName.get(o.name)!; const dir = new THREE.Vector3(0, 0, -1).transformDirection(n.matrixWorld); return { name: o.name, world: n.getWorldPosition(new THREE.Vector3()).toArray().map((v) => Math.round(v * 100) / 100), dir: dir.toArray().map((v) => Math.round(v * 1000) / 1000), light: n.userData.blenderLight }; });
  console.log('camera offset', camOffset, 'respawn', respawn, 'lens', cam?.userData.blenderCamera?.focalLength, 'lights', JSON.stringify(lights));
  out.dungeon = { named, level, camOffset, respawn, lens: cam?.userData.blenderCamera?.focalLength ?? 50, lights, floors: {} as Record<string, number> };
  // Floor probe: highest box top under (x, z) below `below`, and whether 4 units above it are clear.
  const allBoxes = Object.values(level).flatMap((v) => (v.boxes ?? []).map((b) => [b[0] + v.world[0], b[1] + v.world[1], b[2] + v.world[2], b[3], b[4], b[5]]));
  const floorAt = (x: number, z: number, below = 30) => {
    let top = -Infinity;
    for (const b of allBoxes) if (Math.abs(x - b[0]) <= b[3] / 2 && Math.abs(z - b[2]) <= b[5] / 2) { const t = b[1] + b[4] / 2; if (t < below && t > top) top = t; }
    const clear = allBoxes.every((b) => !(Math.abs(x - b[0]) < b[3] / 2 + 1 && Math.abs(z - b[2]) < b[5] / 2 + 1 && b[1] - b[4] / 2 < top + 4 && b[1] + b[4] / 2 > top + 0.3));
    return { y: Math.round(top * 100) / 100, clear };
  };
  const probes = (process.env.PROBES ?? '').split(';').filter(Boolean).map((s) => s.split(',').map(Number));
  for (const [x, z, below] of probes) { const f = floorAt(x, z, below ?? 30); out.dungeon.floors[`${x},${z}`] = f.y; console.log('probe', x, z, JSON.stringify(f)); }
  // Coin spots: the top of each parkour platform.
  const coins: number[][] = [];
  for (const [name, v] of Object.entries(level)) if (/^Platform/.test(name)) { const f = floorAt(v.world[0], v.world[2]); coins.push([v.world[0], Math.round((f.y + 2.2) * 100) / 100, v.world[2]]); }
  out.dungeon.coins = coins;
  // Top-down floor-height map for placing gameplay pieces (dev aid).
  if (process.argv.includes('--map')) {
    const all = Object.entries(level).flatMap(([, v]) => (v.boxes ?? []).map((b) => [b[0] + v.world[0], b[1] + v.world[1], b[2] + v.world[2], b[3], b[4], b[5]]));
    // Cells of 3 (x) by 5 (z) units, x -135..150, z 5..-440; keep the highest top below y=30 per cell.
    const NX = 96, NZ = 90, top = new Float32Array(NX * NZ).fill(-Infinity);
    for (const b of all) {
      const t = b[1] + b[4] / 2; if (t >= 30) continue;
      const i0 = Math.max(0, Math.ceil((b[0] - b[3] / 2 + 135) / 3)), i1 = Math.min(NX - 1, Math.floor((b[0] + b[3] / 2 + 135) / 3));
      const k0 = Math.max(0, Math.ceil((5 - (b[2] + b[5] / 2)) / 5)), k1 = Math.min(NZ - 1, Math.floor((5 - (b[2] - b[5] / 2)) / 5));
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) top[k * NX + i] = Math.max(top[k * NX + i], t);
    }
    const rows: string[] = [];
    for (let k = 0; k < NZ; k++) {
      let s = String(5 - k * 5).padStart(5) + ' ';
      for (let i = 0; i < NX; i++) { const t = top[k * NX + i]; s += t === -Infinity ? ' ' : t < -5 ? '_' : t < 0 ? '.' : t < 3 ? '-' : t < 8 ? '=' : '#'; }
      rows.push(s);
    }
    fs.writeFileSync(process.env.TEMP + '/dungeon-map.txt', rows.join('\n'));
  }
}

if (!process.argv.includes('--dry')) {
  const body = `// Generated by scripts/blend-assets.ts from the template .blend files - do not edit by hand.
// Sizes/bounds are in Blender units in the extracted object's frame (Y up, object origin at 0).
// Room "boxes" are compound wall colliders: [centerX, centerY, centerZ, sizeX, sizeY, sizeZ].
export const BLEND_DATA = ${JSON.stringify(out)} as const;
`;
  fs.writeFileSync('src/templates/blendData.ts', body);
  console.log('wrote src/templates/blendData.ts', (body.length / 1024).toFixed(0), 'KB');
}
