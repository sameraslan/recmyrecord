import { describe, expect, it } from 'vitest';
import { bracketStart, clipRanges, displayWidth, isLatinChar, isWideChar, splitBracket, titleStep } from './display-text';

describe('splitBracket: a trailing bracketed form, as in `native [Latin]`', () => {
  it('splits the title and the artist of a new album', () => {
    expect(splitBracket('アダンの風 [Windswept Adan]')).toEqual({ head: 'アダンの風 ', bracket: '[Windswept Adan]' });
    expect(splitBracket('青葉市子 & 12 Ensemble [Ichiko Aoba]')).toEqual({ head: '青葉市子 & 12 Ensemble ', bracket: '[Ichiko Aoba]' });
  });

  it('keeps every character: head plus bracket is the string', () => {
    for (const s of ['The Beatles [White Album]', 'Кино [Kino]', 'a  [b c]']) {
      const { head, bracket } = splitBracket(s);
      expect(head + (bracket ?? '')).toBe(s);
    }
  });

  it('leaves a string without a trailing bracket whole', () => {
    for (const s of ['OK Computer', '[Untitled]', 'Mother (マザー)', 'A [B] C', 'Kid A[b]', 'x []', 'x [ ]', '']) {
      expect(splitBracket(s)).toEqual({ head: s, bracket: null });
      expect(bracketStart(s)).toBe(-1);
    }
  });

  it('takes only the last bracket, and not one with a bracket inside', () => {
    expect(splitBracket('A [B] [C d]')).toEqual({ head: 'A [B] ', bracket: '[C d]' });
    expect(splitBracket('A [B [C]]').bracket).toBeNull();
  });
});

describe('clipRanges: search highlights on either side of the split', () => {
  it('cuts a range that crosses the split and shifts the part after it', () => {
    const ranges = [{ start: 1, end: 3 }, { start: 5, end: 9 }, { start: 10, end: 12 }];
    expect(clipRanges(ranges, 0, 6)).toEqual([{ start: 1, end: 3 }, { start: 5, end: 6 }]);
    expect(clipRanges(ranges, 6, 14)).toEqual([{ start: 0, end: 3 }, { start: 4, end: 6 }]);
    expect(clipRanges([], 0, 4)).toEqual([]);
  });
});

describe('the title size step counts East Asian wide characters as two', () => {
  it('knows wide characters', () => {
    for (const ch of ['ア', '風', '青', '달', '，', 'Ａ', 'の']) expect(isWideChar(ch.codePointAt(0)!)).toBe(true);
    for (const ch of ['A', 'é', 'К', 'ዘ', ' ', '[', 'ｱ']) expect(isWideChar(ch.codePointAt(0)!)).toBe(false);
  });

  it('measures Latin text as its length, as before', () => {
    expect(displayWidth('OK Computer')).toBe(11);
    expect(displayWidth('Кино')).toBe(4);
    expect(displayWidth('')).toBe(0);
  });

  it('measures wide text as twice its length', () => {
    expect(displayWidth('アダンの風')).toBe(10);
    expect(displayWidth('アダンの風 [Windswept Adan]')).toBe(27);
  });

  it('keeps today’s steps for Latin titles: over 12 is medium, over 22 is small', () => {
    expect(titleStep('Ys')).toBe('');
    expect(titleStep('OK Computer!')).toBe('');
    expect(titleStep('OK Computer!!')).toBe('len-m');
    expect(titleStep('a'.repeat(22))).toBe('len-m');
    expect(titleStep('a'.repeat(23))).toBe('len-l');
  });

  it('steps a wide title down where its character count alone would not', () => {
    expect(titleStep('無罪モラトリアム')).toBe('len-m'); // 8 characters, width 16
    expect(titleStep('素晴らしき日々〜不連続存在〜')).toBe('len-l'); // 14 characters, width 28
    expect(titleStep('アダンの風 [Windswept Adan]')).toBe('len-l');
  });
});

describe('isLatinChar: the working definition, a code point below U+0250', () => {
  it('is true for Latin letters and digits, with accents', () => {
    for (const ch of ['A', 'z', '7', 'É', 'ß', 'Ł', 'ɏ']) expect(isLatinChar(ch)).toBe(true);
  });

  it('is false from U+0250 on, and for an empty string', () => {
    for (const ch of ['ɐ', 'К', 'ア', '風', '달', 'ዘ', '\u{1D504}', '']) expect(isLatinChar(ch)).toBe(false);
  });
});
