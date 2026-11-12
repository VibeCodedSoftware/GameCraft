// Things only an exported game has: its page must let clicks reach the game, and the Quest export must say what it is.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { questReadme } from '../src/project/exportGame';

describe('the exported player page', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../player.html'), 'utf8');
  it('never turns on clicks for the whole HUD layer, which would stop them reaching the game', () => {
    expect(html).not.toMatch(/#overlay\s*>\s*\*\s*\{[^}]*pointer-events:\s*auto/);
    expect(html).toMatch(/#overlay\s*>\s*:not\(\.gc-hud\)/);
  });
  it('says what to do when opened straight from a folder, instead of sitting on Loading', () => {
    // An ordinary script, so it runs even though the browser refuses the game's module script on file://.
    expect(html).toMatch(/<script>[^]*location\.protocol === 'file:'[^]*<\/script>\s*<script type="module"/);
    expect(html).toContain('export for <b>Windows</b>');
  });
  it('keeps the Multiplayer button out of the corners, where HUD text goes', () => {
    expect(html).toMatch(/#net\s*\{[^}]*top:\s*50%/);
  });
});

describe('the Meta Quest export', () => {
  it('says it is not native, gives Meta\'s steps, and warns when VR is off', () => {
    const on = questReadme('Game', 'com.me.game', true), off = questReadme('Game', '', false);
    expect(on).toMatch(/not a native OpenXR app/);
    expect(on).toMatch(/has not tested this on a headset/);
    for (const step of ['@meta-quest/bubblewrap-cli', '--metaquest', 'assetlinks.json', 'targetSdk = 32', 'adb install']) expect(on).toContain(step);
    expect(on).toContain('com.me.game');
    expect(on).not.toContain('WARNING');
    expect(off).toContain('WARNING: VR is off');
  });
});
