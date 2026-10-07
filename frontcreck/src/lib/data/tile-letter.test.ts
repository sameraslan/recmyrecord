import { describe, expect, it } from 'vitest';
import { COPY } from '@/lib/copy';
import { initialLetter, tileLetter } from './catalog';

/** The cases of the pipeline's test of the same rule (test_the_tile_letter_rule in data-pipeline/tests/test_images.py). */
describe('tileLetter: the letter on a cover tile, by the rule the map sprites are drawn with', () => {
  it('is today’s letter for the four albums that have no cover today', () => {
    const titles = ['Spiritual Unity', 'Chill Out', 'Dark & Long', 'Gimix'];
    expect(titles.map(tileLetter)).toEqual(['S', 'C', 'D', 'G']);
    expect(titles.map(tileLetter)).toEqual(titles.map(initialLetter));
  });

  it('is the first letter or digit, upper-cased, after a leading "The "', () => {
    expect(tileLetter('Chill Out')).toBe('C');
    expect(tileLetter('midtown 120 Blues')).toBe('M');
    expect(tileLetter('The Gate')).toBe('G');
    expect(tileLetter('the  Old Kit Bag')).toBe('O');
    expect(tileLetter('Theatre')).toBe('T');
  });

  it('takes a digit first, and passes over punctuation', () => {
    expect(tileLetter('12 Hits From Hell')).toBe('1');
    expect(tileLetter('4k God')).toBe('4');
    expect(tileLetter('...And Justice')).toBe('A');
    expect(tileLetter('(What\'s the Story)')).toBe('W');
    expect(tileLetter('¿Dónde?')).toBe('D');
  });

  it('keeps diacritics below U+0250 and folds one above it to its base letter', () => {
    expect(tileLetter('Étoile')).toBe('É');
    expect(tileLetter('älskar')).toBe('Ä');
    expect(tileLetter('Völkerball')).toBe('V');
    expect(tileLetter('Ế')).toBe('E');
    expect(tileLetter('ệ x')).toBe('E');
    expect(tileLetter('ßig')).toBe('ß');
  });

  it('comes from the bracket at the end when the title is not Latin', () => {
    expect(tileLetter('アダンの風 [Windswept Adan]')).toBe('W');
    expect(tileLetter('Симфония № 5 [Symphony No. 5]')).toBe('S');
    expect(tileLetter('ゼルダ [The Legend of Zelda]')).toBe('T'); // "The" is dropped at the title's start only
    expect(tileLetter('한 [‘한’ 1st take]')).toBe('1');
    expect(tileLetter('プネウマ [pneuma] ')).toBe('P');
  });

  it('is empty when the title is not Latin and has no Latin form', () => {
    expect(tileLetter('보편적인 노래')).toBe('');
    expect(tileLetter('Мор. Утопия')).toBe('');
    expect(tileLetter('悲愴 [悲愴]')).toBe('');
    expect(tileLetter('マザー (Mother)')).toBe(''); // only a square bracket at the end counts
    expect(tileLetter('\u{1D504}lpha')).toBe('');
  });

  it('lets a Latin first character decide even when the rest is not Latin', () => {
    expect(tileLetter('MarioKart Wii (マリオ)')).toBe('M');
    expect(tileLetter('1984年 [Nineteen]')).toBe('1');
  });

  it('is the placeholder when the title has no letter or digit at all', () => {
    expect(tileLetter('( )')).toBe(COPY.cover.noInitial);
    expect(tileLetter('')).toBe(COPY.cover.noInitial);
    expect(COPY.cover.noInitial).toBe('·');
  });
});
