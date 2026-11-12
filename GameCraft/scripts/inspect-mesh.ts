// Developer tool: dump a mesh's CustomData layers and AttributeStorage attributes, plus struct layouts.
// Usage: npx vite-node scripts/inspect-mesh.ts <file.blend> <MeshName> [Struct ...]
import fs from 'node:fs';
import { BlendFile } from '../src/asset-import/blend/blendFile';

const [file, meshName, ...extra] = process.argv.slice(2);
const bf = new BlendFile(fs.readFileSync(file));
const me = bf.idBlocks('ME').find((m) => m.idName() === meshName)!;
const lsize = bf.structByName.get('CustomDataLayer')!.size;
for (const cdName of ['vdata', 'edata', 'pdata', 'ldata']) {
  const cd = me.sub(cdName)!;
  const b = cd.block('layers');
  for (let i = 0; i < cd.num('totlayer') && b; i++) {
    const l = bf.view('CustomDataLayer', b.offset + i * lsize, me.owner);
    const db = l.block('data');
    console.log(`${cdName} type=${l.num('type')} name=${l.str('name')} data=${db ? `${db.len} bytes, ${bf.structs[db.sdna]?.name} nr=${db.nr}` : 'none'}`);
  }
}
const as = me.sub('attribute_storage');
if (as) {
  const b = as.block('dna_attributes');
  for (let i = 0; i < as.num('dna_attributes_num') && b; i++) {
    const a = bf.view('Attribute', b.offset + i * 24, me.owner);
    const nb = a.block('name');
    const arr = a.get('data', a.num('storage_type') === 0 ? 'AttributeArray' : 'AttributeSingle');
    const db = arr?.block('data');
    console.log(`ATTR ${nb ? bf.cstr(nb.offset, nb.len) : '?'} type=${a.num('data_type')} domain=${a.num('domain')} storage=${a.num('storage_type')} size=${arr?.num('size')} bytes=${db?.len}`);
  }
}
console.log('face offsets', me.block(['face_offset_indices', 'poly_offset_indices'])?.len, 'vgroups:', bf.list(me.sub('vertex_group_names')).map((g) => g.str('name')).join(','), 'mats:', Array.from({ length: me.num('totcol') }, (_, i) => bf.deref(me.f.resolve(me.ptr('mat'), me.owner) ? bf.ptrAt(me.block('mat')!.offset + i * 8) : 0n)?.idName()).join(','));
for (const s of extra) {
  const st = bf.structByName.get(s);
  console.log(`struct ${s} (${st?.size}): ` + (st?.list ?? []).filter((f) => !/_pad|runtime/.test(f.name)).map((f) => `${f.offset}:${f.type} ${f.raw}`).join(', '));
}
