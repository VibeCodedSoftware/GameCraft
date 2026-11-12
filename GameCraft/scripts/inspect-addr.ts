import fs from 'node:fs';
import { BlendFile } from '../src/asset-import/blend/blendFile';

const bf = new BlendFile(fs.readFileSync(process.argv[2]));
const seen = new Map<number, number>();
for (const b of bf.blocks) seen.set(b.old, (seen.get(b.old) ?? 0) + 1);
const dups = [...seen].filter(([, n]) => n > 1);
console.log('blocks', bf.blocks.length, 'unique old', seen.size, 'duplicated', dups.length, dups.slice(0, 5));
const me = bf.idBlocks('ME').find((m) => m.idName() === (process.argv[3] ?? 'Cube.002'))!;
const as = me.sub('attribute_storage')!;
const p = as.ptr('dna_attributes');
const idx = bf.blocks.findIndex((b) => b.old === p);
console.log('mesh block', bf.blocks.find((b) => b.offset === me.offset), 'attr ptr', p, 'num', as.num('dna_attributes_num'));
for (let i = Math.max(0, idx - 2); i < idx + 12; i++) { const b = bf.blocks[i]; console.log(i, b.code, bf.structs[b.sdna]?.name, 'len', b.len, 'nr', b.nr, 'old', b.old); }
