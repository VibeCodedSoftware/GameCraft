// The block encoders, read back by decoders written from the format specifications.
import { describe, expect, it } from 'vitest';
import { blockBytes, chainBytes, encodeChain, encodeLevel, halfImage, hasAlpha, type BlockFormat } from '../src/engine/textureCodec';

function picture(w: number, h: number, alpha = false) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4;
    d[p] = (x / w) * 255; d[p + 1] = (y / h) * 255; d[p + 2] = 128 + 60 * Math.sin((x + y) / 9);
    d[p + 3] = alpha ? (x / w) * 255 : 255;
  }
  return d;
}

function decodeColorBC(b: Uint8Array, at: number, out: number[][]) {
  const c0 = b[at] | (b[at + 1] << 8), c1 = b[at + 2] | (b[at + 3] << 8);
  const rgb = (c: number) => [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];
  const a = rgb(c0), z = rgb(c1), pal = c0 > c1 ? [a, z, a.map((v, i) => (2 * v + z[i]) / 3), a.map((v, i) => (v + 2 * z[i]) / 3)] : [a, z, a.map((v, i) => (v + z[i]) / 2), [0, 0, 0]];
  const idx = (b[at + 4] | (b[at + 5] << 8) | (b[at + 6] << 16) | (b[at + 7] << 24)) >>> 0;
  for (let i = 0; i < 16; i++) { const c = pal[(idx >>> (i * 2)) & 3]; out[i][0] = c[0]; out[i][1] = c[1]; out[i][2] = c[2]; }
}
function decodeAlphaBC(b: Uint8Array, at: number, out: number[][]) {
  const a0 = b[at], a1 = b[at + 1], pal = a0 > a1 ? [a0, a1, ...[1, 2, 3, 4, 5, 6].map((k) => ((7 - k) * a0 + k * a1) / 7)] : [a0, a1, ...[1, 2, 3, 4].map((k) => ((5 - k) * a0 + k * a1) / 5), 0, 255];
  for (let i = 0; i < 16; i++) {
    let v = 0;
    for (let n = 0; n < 3; n++) { const bit = i * 3 + n; if (b[at + 2 + (bit >> 3)] & (1 << (bit & 7))) v |= 1 << n; }
    out[i][3] = pal[v];
  }
}
const MODS = [[2, 8], [5, 17], [9, 29], [13, 42], [18, 60], [24, 80], [33, 106], [47, 183]];
function decodeEtc(b: Uint8Array, at: number, out: number[][]) {
  const diff = (b[at + 3] >> 1) & 1, flip = b[at + 3] & 1, t = [b[at + 3] >> 5, (b[at + 3] >> 2) & 7];
  const base = [[0, 0, 0], [0, 0, 0]];
  for (let c = 0; c < 3; c++) {
    if (diff) {
      const v = b[at + c] >> 3; let d = b[at + c] & 7; if (d > 3) d -= 8;
      const e = (x: number) => (x << 3) | (x >> 2);
      base[0][c] = e(v); base[1][c] = e(v + d);
    } else { base[0][c] = (b[at + c] >> 4) * 17; base[1][c] = (b[at + c] & 15) * 17; }
  }
  const msb = (b[at + 4] << 8) | b[at + 5], lsb = (b[at + 6] << 8) | b[at + 7];
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    const k = x * 4 + y, side = flip ? (y >= 2 ? 1 : 0) : x >= 2 ? 1 : 0, m = (((msb >> k) & 1) << 1) | ((lsb >> k) & 1);
    const [s, l] = MODS[t[side]], mod = [s, l, -s, -l][m];
    for (let c = 0; c < 3; c++) out[y * 4 + x][c] = Math.max(0, Math.min(255, base[side][c] + mod));
  }
}
const EAC = [[-3, -6, -9, -15, 2, 5, 8, 14], [-3, -7, -10, -13, 2, 6, 9, 12], [-2, -5, -8, -13, 1, 4, 7, 12], [-2, -4, -6, -13, 1, 3, 5, 12], [-3, -6, -8, -12, 2, 5, 7, 11], [-3, -7, -9, -11, 2, 6, 8, 10], [-4, -7, -8, -11, 3, 6, 7, 10], [-3, -5, -8, -11, 2, 4, 7, 10], [-2, -6, -8, -10, 1, 5, 7, 9], [-2, -5, -8, -10, 1, 4, 7, 9], [-2, -4, -8, -10, 1, 3, 7, 9], [-2, -5, -7, -10, 1, 4, 6, 9], [-3, -4, -7, -10, 2, 3, 6, 9], [-1, -2, -3, -10, 0, 1, 2, 9], [-4, -6, -8, -9, 3, 5, 7, 8], [-3, -5, -7, -9, 2, 4, 6, 8]];
function decodeEac(b: Uint8Array, at: number, out: number[][]) {
  const base = b[at], mult = b[at + 1] >> 4, tb = EAC[b[at + 1] & 15];
  let n = 0;
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++, n++) {
    let v = 0;
    for (let bit = 0; bit < 3; bit++) { const pos = n * 3 + bit, byte = at + 2 + (pos >> 3); if (b[byte] & (128 >> (pos & 7))) v |= 4 >> bit; }
    out[y * 4 + x][3] = Math.max(0, Math.min(255, base + tb[v] * mult));
  }
}

function psnr(orig: Uint8ClampedArray, w: number, h: number, data: Uint8Array, f: BlockFormat, ch: 'rgb' | 'a') {
  const size = blockBytes(f), bw = Math.ceil(w / 4), block = Array.from({ length: 16 }, () => [0, 0, 0, 255]);
  let se = 0, n = 0;
  for (let by = 0; by < Math.ceil(h / 4); by++) for (let bx = 0; bx < bw; bx++) {
    const at = (by * bw + bx) * size;
    if (f === 'bc1') decodeColorBC(data, at, block);
    else if (f === 'bc3') { decodeAlphaBC(data, at, block); decodeColorBC(data, at + 8, block); }
    else if (f === 'etc2') decodeEtc(data, at, block);
    else { decodeEac(data, at, block); decodeEtc(data, at + 8, block); }
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const sx = bx * 4 + x, sy = by * 4 + y; if (sx >= w || sy >= h) continue;
      const p = (sy * w + sx) * 4, c = block[y * 4 + x];
      if (ch === 'rgb') for (let k = 0; k < 3; k++) { se += (orig[p + k] - c[k]) ** 2; n++; }
      else { se += (orig[p + 3] - c[3]) ** 2; n++; }
    }
  }
  return 10 * Math.log10((255 * 255) / Math.max(1e-6, se / n));
}

describe('block encoders', () => {
  it.each(['bc1', 'bc3', 'etc2', 'etc2a'] as BlockFormat[])('%s keeps the picture close (over 30 dB) at the promised size', (f) => {
    const pic = picture(64, 64, f === 'bc3' || f === 'etc2a'), data = encodeLevel(pic, 64, 64, f);
    expect(data.length).toBe(16 * 16 * blockBytes(f));
    expect(psnr(pic, 64, 64, data, f, 'rgb')).toBeGreaterThan(30);
    if (f === 'bc3' || f === 'etc2a') expect(psnr(pic, 64, 64, data, f, 'a')).toBeGreaterThan(30);
  });
  it('a flat colour comes back nearly exact, in every format', () => {
    const pic = new Uint8ClampedArray(16 * 16 * 4).fill(0).map((_, i) => [200, 40, 90, 255][i % 4]);
    for (const f of ['bc1', 'bc3', 'etc2', 'etc2a'] as BlockFormat[]) expect(psnr(pic, 16, 16, encodeLevel(pic, 16, 16, f), f, 'rgb')).toBeGreaterThan(36);
  });
  it('levels smaller than one block are encoded', () => {
    expect(encodeLevel(picture(2, 2), 2, 2, 'bc1').length).toBe(8);
    expect(encodeLevel(picture(1, 1), 1, 1, 'etc2a').length).toBe(16);
  });
});

describe('mipmap chains', () => {
  it('runs down to one pixel, and takes a fraction of plain RGBA', () => {
    const { format, levels } = encodeChain(picture(256, 64), 256, 64, 'bc');
    expect(format).toBe('bc1');
    expect(levels.map((l) => `${l.width}x${l.height}`)).toEqual(['256x64', '128x32', '64x16', '32x8', '16x4', '8x2', '4x1', '2x1', '1x1']);
    const plain = 256 * 64 * 4 * 4 / 3;
    expect(chainBytes(levels) / plain).toBeLessThan(0.14);
  });
  it('see-through pictures choose the format with alpha', () => {
    expect(encodeChain(picture(16, 16, true), 16, 16, 'bc').format).toBe('bc3');
    expect(encodeChain(picture(16, 16, true), 16, 16, 'etc').format).toBe('etc2a');
    expect(encodeChain(picture(16, 16), 16, 16, 'etc').format).toBe('etc2');
    expect(hasAlpha(picture(4, 4))).toBe(false);
  });
  it('halving keeps the colour of see-through edges clean', () => {
    const d = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0]);
    const h = halfImage(d, 2, 2);
    expect([...h.data]).toEqual([255, 0, 0, 128]);
  });
  it('dropping top levels saves what streaming says', () => {
    const { levels } = encodeChain(picture(64, 64), 64, 64, 'bc');
    expect(chainBytes(levels, 1)).toBeLessThan(chainBytes(levels) * 0.3);
  });
});
