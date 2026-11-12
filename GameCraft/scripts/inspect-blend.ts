// Developer tool: summarize a .blend (objects, meshes, materials, images, armatures, actions, struct layouts).
// Usage: npx vite-node scripts/inspect-blend.ts <file.blend> [StructName ...]
import fs from 'node:fs';
import { BlendFile } from '../src/asset-import/blend/blendFile';

const [file, ...structs] = process.argv.slice(2);
const bf = new BlendFile(fs.readFileSync(file));
console.log(`version ${bf.version}, ${bf.blocks.length} blocks, ${bf.structs.length} structs`);
const count = new Map<string, number>();
for (const b of bf.blocks) count.set(b.code, (count.get(b.code) ?? 0) + 1);
console.log('block codes:', [...count].filter(([c]) => c.length === 2).map(([c, n]) => `${c}:${n}`).join(' '));
const OBT: Record<number, string> = { 0: 'EMPTY', 1: 'MESH', 2: 'CURVE', 10: 'LIGHT', 11: 'CAMERA', 25: 'ARMATURE', 4: 'FONT' };
for (const o of bf.idBlocks('OB')) {
  const data = o.get('data');
  const par = o.get('parent');
  const mods = bf.list(o.sub('modifiers')).map((m) => m.str('name') + ':' + m.num('type'));
  console.log(`OB ${o.idName().padEnd(28)} ${(OBT[o.num('type')] ?? o.num('type')).toString().padEnd(8)} data=${data?.idName() ?? '-'} parent=${par?.idName() ?? '-'} loc=${o.nums('loc').map((n) => n.toFixed(2))} mods=[${mods.join(',')}] action=${o.get('adt')?.get('action')?.idName() ?? '-'} hide=${o.num('visibility_flag')}`);
}
for (const m of bf.idBlocks('ME')) console.log(`ME ${m.idName().padEnd(28)} verts=${m.num(['verts_num', 'totvert'])} faces=${m.num(['faces_num', 'totpoly'])} corners=${m.num(['corners_num', 'totloop'])} mats=${m.num('totcol')}`);
for (const m of bf.idBlocks('MA')) console.log(`MA ${m.idName().padEnd(28)} rgb=${[m.num('r'), m.num('g'), m.num('b')].map((n) => n.toFixed(2))} nodes=${m.num('use_nodes')}`);
for (const i of bf.idBlocks('IM')) console.log(`IM ${i.idName().padEnd(28)} path=${i.str(['filepath', 'name'])} packed=${!!i.ptr('packedfile') || bf.list(i.sub('packedfiles')).length > 0}`);
for (const a of bf.idBlocks('AR')) console.log(`AR ${a.idName()} bones=${bf.list(a.sub('bonebase')).length}`);
for (const a of bf.idBlocks('AC')) console.log(`AC ${a.idName().padEnd(28)} curves=${bf.list(a.sub('curves')).length} layers=${a.num('layer_array_num')} slots=${a.num('slot_array_num')} range=${a.nums('frame_start').concat(a.nums('frame_end'))}`);
for (const s of structs) {
  const st = bf.structByName.get(s);
  console.log(`\nstruct ${s} (${st?.size} bytes):`);
  for (const f of st?.list ?? []) console.log(`  ${f.offset.toString().padStart(4)} ${f.type} ${f.raw}`);
}
