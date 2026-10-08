import { describe, expect, it } from 'vitest';
import config from '../../../next.config';
import { THEME_BAKE } from './theme.generated';

/** The Cache-Control a path gets: of the rules of next.config.ts whose source matches it, the last one's (Next's
 * rule for a header set twice). Sources here are `/prefix/:name*` or `/prefix/:name(regex)`. */
async function cacheControl(pathname: string): Promise<string | undefined> {
  const rules = await config.headers!();
  let value: string | undefined;
  for (const rule of rules) {
    const source = rule.source
      .replace(/[.+?^${}|[\]\\]/g, (c) => (c === '\\' ? c : `\\${c}`))
      .replace(/\/:\w+\*/g, '(?:/.*)?');
    const custom = /^(.*)\/:\w+\((.*)\)$/.exec(rule.source);
    const re = custom ? new RegExp(`^${custom[1]}/(?:${custom[2]})$`) : new RegExp(`^${source}$`);
    if (!re.test(pathname)) continue;
    value = rule.headers.find((h) => h.key === 'Cache-Control')?.value ?? value;
  }
  return value;
}

describe('cache lifetimes of /data (next.config.ts)', () => {
  const DAY = 'public, max-age=86400, stale-while-revalidate=604800';
  const FOR_GOOD = 'public, max-age=31536000, immutable';

  it('the nebula images, named by a hash of their own bytes, are kept for a year and never asked about again', async () => {
    for (const stop of ['sonic', 'balanced', 'mood'] as const) {
      const [first, sharp] = THEME_BAKE.stops[stop].hash;
      expect(await cacheControl(`/data/theme/gas-${stop}.${first}.webp`), stop).toBe(FOR_GOOD);
      expect(await cacheControl(`/data/theme/gas-${stop}-sharp.${sharp}.webp`), stop).toBe(FOR_GOOD);
    }
  });

  it('every file whose name does not change with its content keeps the day', async () => {
    for (const p of ['/data/theme/theme.json', '/data/albums.json', '/data/positions.json', '/data/vocab.json', '/data/atlas-0.webp', '/data/thumbs.webp', '/data/recs.json']) {
      expect(await cacheControl(p), p).toBe(DAY);
    }
    // a gas image without a hash in its name (none is written any more) would not be kept for good
    expect(await cacheControl('/data/theme/gas-balanced.webp')).toBe(DAY);
    expect(await cacheControl('/data/theme/gas-balanced.nothexchar.webp')).toBe(DAY);
    expect(await cacheControl('/data/theme/gas-balanced.8ea311ea05.webp.bak')).toBe(DAY);
  });
});
