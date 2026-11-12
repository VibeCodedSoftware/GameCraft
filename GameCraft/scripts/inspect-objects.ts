// Developer tool: transforms, modifiers and mesh bounds for objects whose names match a regex.
// Usage: npx vite-node scripts/inspect-objects.ts <file.blend> <regex>
import fs from 'node:fs';
import { BlendFile } from '../src/asset-import/blend/blendFile';

const [file, pattern] = process.argv.slice(2);
const bf = new BlendFile(fs.readFileSync(file));
const MT: Record<number, string> = { 1: 'Subsurf', 5: 'Mirror', 8: 'Armature', 11: 'Boolean', 12: 'Array', 13: 'EdgeSplit', 24: 'Bevel', 33: 'Solidify', 44: 'Triangulate', 54: 'WeightedNormal', 55: 'Weld', 57: 'Nodes', 6: 'Decimate', 14: 'Displace', 28: 'SimpleDeform', 3: 'Curve', 16: 'Smooth', 41: 'Remesh' };
const re = new RegExp(pattern);
for (const o of bf.idBlocks('OB')) {
  if (!re.test(o.idName())) continue;
  const mods = bf.list(o.sub('modifiers')).map((m) => { const md = m.sub('modifier') ?? m; const t = md.num('type'); return `${md.str('name')}(${MT[t] ?? t}${t === 11 ? ' obj=' + (m.get('object')?.idName() ?? '?') : ''}${t === 12 ? ' count=' + m.num('count') : ''})`; });
  let bbox = '';
  const me = o.num('type') === 1 ? o.get('data') : null;
  if (me) {
    // positions: AttributeStorage (5.0) or CustomData 'position' layer
    const lsize = bf.structByName.get('CustomDataLayer')!.size;
    const cd = me.sub('vdata')!; const lb = cd.block('layers'); let pos: Float32Array | null = null;
    for (let i = 0; i < cd.num('totlayer') && lb; i++) { const l = bf.view('CustomDataLayer', lb.offset + i * lsize, me.owner); if (l.str('name') === 'position') { const db = l.block('data'); if (db) pos = bf.floatsAt(db.old, undefined, me.owner); } }
    if (pos?.length) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); } bbox = `bbox=[${mn.map((n) => n.toFixed(2))}]..[${mx.map((n) => n.toFixed(2))}]`; }
  }
  const mats = me ? Array.from({ length: me.num('totcol') }, (_, i) => { const b = me.block('mat'); return b ? bf.deref(bf.ptrAt(b.offset + i * 8), undefined, me.owner)?.idName() : '?'; }).join('|') : '';
  console.log(`${o.idName()} par=${o.get('parent')?.idName() ?? '-'} loc=${o.nums('loc').map((n) => n.toFixed(2))} rot=${o.nums('rot').map((n) => (n * 57.3).toFixed(0))} scale=${o.nums(['scale', 'size']).map((n) => n.toFixed(2))} mods=[${mods.join(', ')}] ${bbox} mats=${mats}`);
}
