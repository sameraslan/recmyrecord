import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AlbumRecord } from '@/lib/types';
import { THUMB_PER_SHEET, atlasCount, atlasSheetOf, atlasSlot, atlasUrl, thumbSheetOf, thumbStyle, thumbUrl } from './sprites';

describe('sprite maths', () => {
  it('places albums on atlas sheets in index order', () => {
    expect(atlasSlot(0)).toEqual({ sheet: 0, u: 0, v: 0, size: 1 / 32 });
    expect(atlasSlot(33)).toEqual({ sheet: 0, u: 1 / 32, v: 1 / 32, size: 1 / 32 });
    expect(atlasSlot(1024 + 31)).toEqual({ sheet: 1, u: 31 / 32, v: 0, size: 1 / 32 });
    expect(atlasCount(4081)).toBe(4);
    expect(atlasCount(10467)).toBe(11);
    expect(atlasUrl(2)).toBe('/data/atlas-2.webp');
  });

  it('handles row, sheet and catalog boundaries', () => {
    expect(atlasSlot(64)).toEqual({ sheet: 0, u: 0, v: 2 / 32, size: 1 / 32 });
    expect(atlasSlot(1023)).toEqual({ sheet: 0, u: 31 / 32, v: 31 / 32, size: 1 / 32 });
    expect(atlasSlot(1024)).toEqual({ sheet: 1, u: 0, v: 0, size: 1 / 32 });
    expect(atlasSlot(4080)).toEqual({ sheet: 3, u: 16 / 32, v: 31 / 32, size: 1 / 32 });
    expect(atlasCount(1024)).toBe(1);
    expect(atlasCount(1025)).toBe(2);
    const pos = (id: number) => String(thumbStyle(id).backgroundPosition).split(' ').map((p) => parseFloat(p));
    expect(pos(64)).toEqual([0, expect.closeTo(100 / 63, 9)]);
    expect(pos(1023)[0]).toBeCloseTo((63 / 63) * 100, 9);
    expect(pos(1023)[1]).toBeCloseTo((15 / 63) * 100, 9);
    expect(pos(4080)[0]).toBeCloseTo((48 / 63) * 100, 9);
    expect(pos(4080)[1]).toBe(100);
  });

  it('positions a thumbnail with size-independent percentages', () => {
    expect(thumbStyle(0)).toEqual({ backgroundImage: 'url(/data/thumbs.webp)', backgroundSize: '6400% 6400%', backgroundPosition: '0% 0%' });
    expect(thumbStyle(63).backgroundPosition).toBe('100% 0%');
    expect(thumbStyle(64 * 63).backgroundPosition).toBe('0% 100%');
  });
});

describe('the sprite sheets of the committed data (real public/data)', () => {
  const dir = path.join(process.cwd(), 'public', 'data');
  const n = (JSON.parse(fs.readFileSync(path.join(dir, 'albums.json'), 'utf8')) as AlbumRecord[]).length;
  const onDisk = (re: RegExp) => fs.readdirSync(dir).filter((f) => re.test(f)).sort();
  const file = (url: string) => url.replace('/data/', '');

  it('has one atlas sheet per 1,024 albums, the last album\u2019s included, and no other', () => {
    const want = Array.from({ length: atlasCount(n) }, (_, i) => file(atlasUrl(i))).sort();
    expect(onDisk(/^atlas-\d+\.webp$/)).toEqual(want);
    expect(want).toContain(file(atlasUrl(atlasSheetOf(n - 1))));
    expect(atlasCount(n)).toBe(11);
  });

  it('has one thumbnail sheet per 4,096 albums, the last album\u2019s included, and no other', () => {
    const sheets = Math.ceil(n / THUMB_PER_SHEET);
    expect(thumbSheetOf(n - 1)).toBe(sheets - 1);
    const want = Array.from({ length: sheets }, (_, i) => file(thumbUrl(i))).sort();
    expect(onDisk(/^thumbs(-\d+)?\.webp$/)).toEqual(want);
    expect(sheets).toBe(3);
  });

  it('holds sheets that are WebP files and not empty ones', () => {
    for (const f of [...onDisk(/^atlas-\d+\.webp$/), ...onDisk(/^thumbs(-\d+)?\.webp$/)]) {
      const head = Buffer.alloc(12);
      const fd = fs.openSync(path.join(dir, f), 'r');
      fs.readSync(fd, head, 0, 12, 0);
      fs.closeSync(fd);
      expect(head.toString('latin1', 0, 4) + head.toString('latin1', 8, 12), f).toBe('RIFFWEBP');
      expect(fs.statSync(path.join(dir, f)).size, f).toBeGreaterThan(50_000);
    }
  });
});
