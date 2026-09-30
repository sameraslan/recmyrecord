import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AlbumRecord } from '@/lib/types';
import { contrastRatio } from './contrast';

const T = {
  room: '#15110d', room2: '#1c1712', room3: '#262019', room4: '#322a21', float: '#1a1511', pane: '#17120e',
  paper: '#ede5d5', dust: '#b3a792', ash: '#a39887', lamp: '#e6a856', lampInk: '#1a130b',
};

describe('WCAG AA contrast', () => {
  it('computes reference ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('every text token passes 4.5:1 on every surface it is used on', () => {
    for (const fg of [T.paper, T.dust, T.ash, T.lamp]) {
      for (const bg of [T.room, T.room2, T.room3, T.room4, T.float, T.pane]) {
        expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrastRatio(T.lampInk, T.lamp)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(T.lampInk, T.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it('every album accent passes 4.5:1 on the room colour', () => {
    const albums = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/albums.json'), 'utf8')) as AlbumRecord[];
    const bad = albums.filter((a) => contrastRatio(a.w[2], T.room) < 4.5).map((a) => `${a.slug} ${a.w[2]}`);
    expect(bad).toEqual([]);
  });
});
