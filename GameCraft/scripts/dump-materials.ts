// Diagnostic: print the node tree of every material in a .blend (shader chain, linked inputs, images, blend mode).
// Usage: npx tsx scripts/dump-materials.ts <file.blend> [name filter regex]
import fs from 'node:fs';
import { BlendFile } from '../src/asset-import/blend/blendFile';

const [file, filter] = process.argv.slice(2);
const bf = new BlendFile(new Uint8Array(fs.readFileSync(file)));
const re = filter ? new RegExp(filter, 'i') : null;
for (const b of bf.blocks) {
  if (b.code !== 'MA') continue;
  const ma = bf.view(bf.structs[b.sdna].name, b.offset, b.idx);
  const name = ma.idName();
  if (re && !re.test(name)) continue;
  const tree = ma.get('nodetree');
  console.log(`\n== ${name}  blend_method=${ma.num('blend_method')} use_nodes=${ma.num('use_nodes')} base=(${[ma.num('r'), ma.num('g'), ma.num('b')].map((x) => x.toFixed(2))})`);
  if (!tree) continue;
  const nodes = bf.list(tree.sub('nodes'));
  const links = bf.list(tree.sub('links'));
  const nameOf = new Map(nodes.map((n) => [n.from, `${n.str('idname')}(${n.str('name')})`]));
  for (const n of nodes) {
    const id = n.str('idname');
    let extra = '';
    if (id === 'ShaderNodeTexImage') { const im = n.get('id'); extra = im ? ` image="${im.idName()}" file="${im.str('filepath')}" packed=${!!im.ptr('packedfile') || bf.list(im.sub('packedfiles')).length > 0}` : ' (no image)'; }
    const ins = bf.list(n.sub('inputs')).map((s) => {
      const l = links.find((k) => k.ptr('tonode') === n.from && k.ptr('tosock') === s.from);
      const dv = s.get('default_value');
      let v = '';
      try { const nums = dv?.nums('value'); if (nums) v = '=' + nums.slice(0, 4).map((x) => +x.toFixed(2)).join(','); } catch { /* not numeric */ }
      return l ? `${s.str('identifier')}<-${nameOf.get(l.ptr('fromnode'))}.${bf.deref(l.ptr('fromsock'), undefined, tree.owner)?.str('identifier')}` : /Scale|Rotation|Location|Randomness|Detail/.test(s.str('identifier')) ? `${s.str('identifier')}${v}` : (/Alpha|Emission|Strength|Base Color|Color$/.test(s.str('identifier')) ? `${s.str('identifier')}${v}` : '');
    }).filter(Boolean);
    console.log(`  ${id}(${n.str('name')})${extra}  ${ins.join('  ')}`);
  }
}
