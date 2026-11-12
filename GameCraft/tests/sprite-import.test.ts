// Animated sprite import: numbered pictures group into animations, names become movement roles, and every
// animation gets its own row of the packed sheet.
import { describe, expect, it } from 'vitest';
import { animName, sequenceKey, sheetLayout } from '../src/editor/spriteImport';

describe('sprite animation import', () => {
  it('groups numbered pictures by name and orders them by number', () => {
    expect(sequenceKey('Hero_Walk_03.png')).toEqual({ group: 'Hero_Walk', order: 3 });
    expect(sequenceKey('run-12.webp')).toEqual({ group: 'run', order: 12 });
    expect(sequenceKey('jump 1.png')).toEqual({ group: 'jump', order: 1 });
    expect(sequenceKey('idle.gif')).toEqual({ group: 'idle', order: 0 });
  });
  it('names animations after the movement role in the file name, without clashes', () => {
    const taken = new Set<string>();
    expect(animName('Hero_Walk', taken)).toBe('walk');
    expect(animName('hero-idle', taken)).toBe('idle');
    expect(animName('Knight Hurt', taken)).toBe('hit'); // hurt -> the "hit" role
    expect(animName('Slash Combo', taken)).toBe('slash_combo');
    expect(animName('walk_fast', taken)).toBe('walk2'); // "walk" is taken
    expect(animName('Walkway', new Set())).toBe('walkway'); // a role inside another word is not a role
  });
  it('packs one animation per row, as wide as the longest', () => {
    const l = sheetLayout([4, 6, 1]);
    expect([l.cols, l.rows]).toEqual([6, 3]);
    expect(l.ranges).toEqual([[0, 3], [6, 11], [12, 12]]);
  });
});
