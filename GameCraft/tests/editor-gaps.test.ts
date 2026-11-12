// Editor gaps: Procedural Animation "Show as blocks" writes a readable chain of real blocks; Change type and Replace
// model say what won't carry over before changing anything; animation clip renames follow into the blocks.
import { describe, expect, it } from 'vitest';
import { procAnimGroup, procChainText } from '../src/editor/procBlocks';
import { changeTypeReport, replaceModelReport } from '../src/editor/actions';
import { BLOCK_DEFS } from '@shared/src/blocks/definitions';
import { createLogicDocument, block, event } from '@shared/src/schema';
import { emptyScene, makeInstance } from '@shared/src/runtime/scene';
import { behaviorDefaults } from '@shared/src/runtime/behaviors';
import { renameAnimationRefs } from '@shared/ui/logicOps';

describe('procedural animation as blocks', () => {
  it('a spider gets its chain, every stage as a real block with its current settings, climbing included', () => {
    const g = procAnimGroup('Spider', 'spider', { ...behaviorDefaults('procanim'), stepLength: 1.4, climbWalls: true });
    expect(g.name).toBe('Spider procedural animation');
    expect((g.children[0] as any).text).toContain(procChainText('spider'));
    const ev = g.children.find((c) => c.kind === 'event') as any;
    const ids = ev.actions.map((b: any) => b.block);
    expect(ids).toEqual(['proc.legs', 'proc.ground', 'proc.feet', 'proc.body', 'proc.climb']);
    for (const b of ev.actions) { expect(BLOCK_DEFS[b.block]).toBeDefined(); expect(b.target).toBe('Spider'); }
    expect(ev.actions[0].params.stride).toBe('1.4');
    // A snake has no legs: no leg controller or foot placement.
    const s = procAnimGroup('Snake', 'snake', behaviorDefaults('procanim'));
    expect((s.children.find((c) => c.kind === 'event') as any).actions.map((b: any) => b.block)).toEqual(['proc.ground', 'proc.body']);
  });
});

describe('warnings before changing objects', () => {
  const project = () => {
    const s = emptyScene('s1', '3d');
    s.instances = [
      makeInstance(1, 'Guard', 'box', { behaviors: [{ type: 'procanim', props: { ...behaviorDefaults('procanim'), boneMap: '{"a":"leg"}' } }], animRoles: { walk: 'Walk' } }),
      makeInstance(2, 'Guard', 'box', {}),
    ];
    const logic = createLogicDocument('t', 'gamecraft', 'xz');
    logic.sheets[0].events = [event([block('system.every_tick')], [block('anim.play', { name: 'Walk' }, 'Guard'), block('platform.jump', {}, 'Hero')])];
    return { scenes: [s], logic } as any;
  };
  it('change type: blocks of the old type stop applying, the new type needs behaviors they lack', () => {
    const r = changeTypeReport(project(), [1], 'Hero');
    expect(r.join('\n')).toMatch(/block for "Guard" will no longer apply to these objects/);
    expect(r.join('\n')).toMatch(/Platform behavior/);
    expect(changeTypeReport(project(), [1], 'Guard')).toEqual([]);
  });
  it('replace model: clip names, bone mapping', () => {
    const r = replaceModelReport(project(), [1], { id: 'lib:x.glb', name: 'Knight', kind: 'model', source: 'library' } as any).join('\n');
    expect(r).toMatch(/Animation clip names/); expect(r).toMatch(/bone mapping/);
  });
  it('renaming a clip renames it in the blocks that play it', () => {
    const p = project();
    expect(renameAnimationRefs(p.logic, 'Walk', 'Stroll')).toBe(1);
    expect((p.logic.sheets[0].events[0] as any).actions[0].params.name).toBe('Stroll');
  });
});
