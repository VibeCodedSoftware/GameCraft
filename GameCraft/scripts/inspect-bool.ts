import fs from 'node:fs';
import { BlendFile } from '../src/asset-import/blend/blendFile';

const [file, pattern] = process.argv.slice(2);
const bf = new BlendFile(fs.readFileSync(file));
const re = new RegExp(pattern);
for (const o of bf.idBlocks('OB')) {
  if (!re.test(o.idName())) continue;
  for (const m of bf.list(o.sub('modifiers'))) {
    const md = m.sub('modifier')!;
    if (md.num('type') !== 11) continue;
    const op = m.ptr('object'), col = m.ptr('collection');
    console.log(`${o.idName()} ${md.str('name')} objPtr=${op} -> ${m.get('object')?.idName() ?? 'unresolved'} colPtr=${col} -> ${m.get('collection')?.idName() ?? '-'} operation=${m.num('operation')} flag=${m.num('flag')} mode=${md.num('mode')} dt=${o.num('dt')} visibility=${o.num('visibility_flag')}`);
  }
}
for (const o of bf.idBlocks('OB')) if (/Cutter|Cube\.00[2-4]$|^Cube\.03[2-9]|Collider|KillBox|player$|^b1$/.test(o.idName())) console.log(`  ${o.idName()} dt=${o.num('dt')} visibility_flag=${o.num('visibility_flag')} restrict=${o.num('restrictflag')} type=${o.num('type')}`);
