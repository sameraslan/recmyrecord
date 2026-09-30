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
    expect(COPY.heroSub).toBe('Get the most similar albums, by sound and by mood.');
    expect(COPY.search.placeholder).toBe('Search albums or artists');
    expect(COPY.search.noMatches('zzkq')).toBe('No album matches zzkq. Try the artist\u2019s name, or fewer words.');
    expect(COPY.album.listHeading).toBe('Closest albums');
    expect(COPY.album.shares(['lush', 'melancholic'])).toBe('Shares lush, melancholic');
    expect(COPY.slider.notes).toEqual({ sonic: 'Closest in sound.', balanced: 'Sound and mood together.', mood: 'Closest in mood.' });
    expect(COPY.map.cardPrimary).toBe('See closest albums');
    expect(COPY.titles.album('In Rainbows', 'Radiohead')).toBe('In Rainbows by Radiohead');
    expect(COPY.about.body).toEqual([
      'recmyrecord helps you find new music you may like, or step out of your comfort zone into music far outside your usual territory. Pick an album you love to get ones similar to it, and use the map to wander as far from it as you want.',
      'Every album here has two core properties that make it what it is: sound and mood. Sound (sonic values) comes from the audio itself: measurements such as energy, tempo, danceability and acousticness, taken from the recording. Mood descriptors are words listeners use for the feelings or atmosphere an album evokes, such as melancholic or warm.',
      'Pick an album and you get the ones most similar to it. By default that means similar in both sound and mood; use the slider to match on sound only or mood only.',
      `The map places ${CATALOG_SIZE_LABEL} albums so that similar ones sit near one another and different ones sit further apart.`,
      'Listening history plays no part in finding similar albums. Most streaming services base their recommendations on songs the same listeners play together, which reflects listening habits more than the music itself.',
      'Neither do genres or genre tags; it all comes from the sound and the mood each album evokes. Albums from the same genre often cluster together anyway, but the albums around a given one are not always from its genre. That can help you get into a new genre, since you start from something that sounds and feels a lot like music you already like.',
      'An album\u2019s closest albums sit nearby on the map, but not always right beside it. Recommendations use more features than a two-dimensional map can show, so placing albums on it means giving up some accuracy.',
    ]);
    expect(COPY.about.signoff).toBe('Time for exploration!');
    expect(COPY.notFound.heading).toBe('That page isn\u2019t here.');
    expect(COPY.notFound.sub).toBe('Search for an album, or explore the map. Experimental exploration!');
    expect(COPY).not.toHaveProperty('home.wander');
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
