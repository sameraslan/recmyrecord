/** The favicon sources (the three SVGs that scripts/icons/build.mjs renders) use only the Trifid palette and keep the mark. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('favicon', () => {
  const ICONS = ['src/app/icon.svg', 'scripts/icons/icon-16.svg', 'scripts/icons/apple-icon.svg'];
  const icon = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

  it('uses only the Trifid palette: no colour of the old warm theme', () => {
    // Sky, raised edge, ash lines, dust stars, the lamp star (globals.css: room, room-4, ash, dust, lamp).
    const ALLOWED = ['#07060a', '#24222c', '#aaa49d', '#c4beb6', '#f1ece4'];
    for (const f of ICONS) {
      const used = [...new Set([...icon(f).matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()))];
      expect(used.filter((c) => !ALLOWED.includes(c)), f).toEqual([]);
      expect(used, f).toContain('#f1ece4');
    }
  });

  it('keeps the mark: three stars joined by lines', () => {
    for (const f of ICONS) {
      expect([...icon(f).matchAll(/<circle /g)].length, f).toBe(3);
      expect([...icon(f).matchAll(/<path /g)].length, f).toBe(1);
    }
  });
});
