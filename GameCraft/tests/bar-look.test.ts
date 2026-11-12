// The looks a bar can take (double-click a health bar): how much of it is full, and which pictures it uses.
import { beforeAll, describe, expect, it } from 'vitest';

class El {
  style: { cssText: string } = { cssText: '' };
  dataset: Record<string, string> = {};
  children: El[] = [];
  textContent = '';
  appendChild(c: El) { this.children.push(c); return c; }
}
let barLook: typeof import('../src/engine/hud').barLook;
beforeAll(async () => {
  (globalThis as any).document = { createElement: () => new El(), getElementById: () => null, head: new El() };
  ({ barLook } = await import('../src/engine/hud'));
});
const resolve = (id: string) => `/files/${id}`;
const look = (b: Parameters<typeof barLook>[0], v: number) => barLook(b, v, '#ff0000', resolve) as unknown as El;
const fullLayers = (cell: El) => cell.children.filter((c) => c.dataset.full === '1');

describe('bar looks', () => {
  it('hearts: one per point, with a partly full one', () => {
    const b = look({ kind: 'hearts', count: 4 }, 0.625);
    expect(b.children.length).toBe(4);
    expect(b.children.map((c) => fullLayers(c).length)).toEqual([1, 1, 1, 0]);
    expect(fullLayers(b.children[2])[0].style.cssText).toContain('width:50%');
    expect(fullLayers(b.children[0])[0].textContent).toBe('♥');
  });
  it('ticks default to ten, and an empty bar has none full', () => {
    const b = look({ kind: 'ticks' }, 0);
    expect(b.children.length).toBe(10);
    expect(b.children.every((c) => fullLayers(c).length === 0)).toBe(true);
  });
  it('your own icons replace the hearts', () => {
    const b = look({ kind: 'hearts', count: 1, full: 'a.png', empty: 'b.png' }, 1);
    const [empty, full] = b.children[0].children;
    expect(empty.style.cssText).toContain('/files/b.png');
    expect(full.style.cssText).toContain('/files/a.png');
    expect(full.textContent).toBe('');
  });
  it('your own picture fills from the left over the picture behind it', () => {
    const b = look({ kind: 'image', width: 100, height: 20, full: 'f.png', empty: 'e.png' }, 0.25);
    expect(b.style.cssText).toContain('/files/e.png');
    expect(b.children[0].style.cssText).toContain('width:25%');
    expect(b.children[0].children[0].style.cssText).toContain('/files/f.png');
  });
  it('the regular bar uses the chosen colours and size', () => {
    const b = look({ kind: 'bar', color: '#00ff00', bg: '#111111', width: 90, height: 8 }, 0.5);
    expect(b.style.cssText).toContain('width:90px');
    expect(b.style.cssText).toContain('#111111');
    expect(b.children[0].style.cssText).toContain('width:50%');
    expect(b.children[0].style.cssText).toContain('#00ff00');
  });
});
