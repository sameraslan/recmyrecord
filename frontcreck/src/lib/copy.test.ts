import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG_SIZE_LABEL, COPY } from './copy';

// The owner's first and last name, stored encoded so this guard never spells them.
const OWNER_NAME_RE = new RegExp(Buffer.from('c2FtZXJ8YXNsYW4=', 'base64').toString('utf8'), 'i');

// Sample arguments for the copy functions: (text, text, words) first, then (words).
const ARG_SETS: unknown[][] = [['zzkq', 'Radiohead', ['lush', 'warm']], [['lush', 'warm']]];

function collect(value: unknown, out: string[]): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    const fn = value as (...a: unknown[]) => unknown;
    for (const args of ARG_SETS) {
      try {
        collect(fn(...args), out);
        return out;
      } catch {
        // try the next argument set
      }
    }
    throw new Error(`no sample arguments fit ${fn.toString()}`);
  } else if (Array.isArray(value)) value.forEach((v) => collect(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collect(v, out));
  return out;
}

const ALL = collect(COPY, []);

describe('copy rules (spec section 8)', () => {
  it('has the approved key strings', () => {
    expect(COPY.hero).toBe('Start with an album you like.');
    expect(COPY.heroSub).toBe('Get the most similar albums to it, by sound and by mood.');
    expect(COPY.search.placeholder).toBe('Search albums or artists');
    expect(COPY.search.noMatches('zzkq')).toBe('No album matches zzkq. Try the artist\u2019s name, or fewer words.');
    expect(COPY.album.listHeading).toBe('Closest albums');
    expect(COPY.album.shares(['lush', 'melancholic'])).toBe('Shares lush, melancholic');
    expect(COPY.slider.notes).toEqual({ sonic: 'Closest in sound.', balanced: 'Sound and mood together.', mood: 'Closest in mood.' });
    expect(COPY.map.cardPrimary).toBe('See closest albums');
    expect(COPY.titles.album('In Rainbows', 'Radiohead')).toBe('In Rainbows by Radiohead');
    expect(COPY.about.body[2]).toContain(CATALOG_SIZE_LABEL);
    expect(COPY.about.body).toHaveLength(4);
    expect(COPY.about.body[3]).toBe('Recommendations use more features than a two-dimensional map can show, so placing albums on it means giving up some accuracy. An album\u2019s closest albums sit nearby, but not always right beside it.');
  });

  it('never uses em or en dashes or emoji', () => {
    for (const s of ALL) {
      expect(s, s).not.toMatch(/[\u2013\u2014]/);
      expect(s, s).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('uses the typographic apostrophe, never the straight one', () => {
    for (const s of ALL) expect(s, s).not.toContain("'");
  });

  it('never names the owner or counts recommendations or the catalog', () => {
    for (const s of ALL) {
      expect(s, s).not.toMatch(OWNER_NAME_RE);
      expect(s, s).not.toMatch(/made by/i);
      expect(s, s).not.toMatch(/\b(five|ten|top 10|top ten)\b/i);
      expect(s.replace(CATALOG_SIZE_LABEL, ''), s).not.toMatch(/\d/);
    }
  });

  it('keeps em dashes and the owner name out of every source file', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const files = (fs.readdirSync(root, { recursive: true }) as string[]).filter(
      (f) => /\.(tsx?|css)$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'),
    );
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) {
      const text = fs.readFileSync(path.join(root, f), 'utf8');
      expect(text, f).not.toMatch(/[\u2013\u2014]/);
      expect(text, f).not.toMatch(OWNER_NAME_RE);
    }
  });
});
