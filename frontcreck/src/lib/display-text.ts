import type { HighlightRange } from '@/lib/highlight';

/**
 * Helpers for titles and artists as they are shown. A new album's title and artist can read `native [Latin]`
 * (display_title and display_artist in the pipeline's catalog.py): the bracketed form at the end is kept in one
 * piece where it fits on a line, and gives a cover tile its letter when the title starts in another script.
 */

/** A trailing `[...]` after white space, with something before it and a non-space inside it. */
const TRAILING_BRACKET = /\s(\[[^[\]]*[^[\]\s][^[\]]*\])$/u;

/** Index where the trailing bracketed form starts (its `[`), or -1 when the string does not end with one. */
export function bracketStart(text: string): number {
  const m = TRAILING_BRACKET.exec(text);
  if (!m || !text.slice(0, m.index).trim()) return -1;
  return m.index + 1;
}

/** The string in two parts that join back into it: everything up to the trailing bracketed form (with the space
 * before it, where a line may break), and that form with its brackets; `bracket` is null when there is none. */
export function splitBracket(text: string): { head: string; bracket: string | null } {
  const at = bracketStart(text);
  return at < 0 ? { head: text, bracket: null } : { head: text.slice(0, at), bracket: text.slice(at) };
}

/** The parts of `ranges` inside [from, to), shifted so that `from` is 0 (search highlights on one side of a split). */
export function clipRanges(ranges: readonly HighlightRange[], from: number, to: number): HighlightRange[] {
  const out: HighlightRange[] = [];
  for (const r of ranges) {
    const start = Math.max(r.start, from);
    const end = Math.min(r.end, to);
    if (end > start) out.push({ start: start - from, end: end - from });
  }
  return out;
}

/** Code point ranges of East Asian wide and fullwidth characters (kana, CJK ideographs, Hangul, fullwidth forms). */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf],
  [0xa960, 0xa97f], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f], [0x1f900, 0x1f9ff], [0x20000, 0x3fffd],
];

export function isWideChar(codePoint: number): boolean {
  for (const [lo, hi] of WIDE) if (codePoint >= lo && codePoint <= hi) return true;
  return false;
}

/** The string's length with every East Asian wide character counted as two: a kana or an ideograph is set about
 * twice as wide as a Latin letter. Text without wide characters measures exactly its `length`, as before. */
export function displayWidth(text: string): number {
  let width = text.length;
  for (const ch of text) if (isWideChar(ch.codePointAt(0) ?? 0)) width++;
  return width;
}

/** Size step of the album's own title (album.css `.seed-title`): '' up to 12 wide, 'len-m' up to 22, then 'len-l'. */
export function titleStep(title: string): '' | 'len-m' | 'len-l' {
  const width = displayWidth(title);
  return width > 22 ? 'len-l' : width > 12 ? 'len-m' : '';
}

/**
 * Whether a letter or digit counts as Latin script for a cover tile's letter: a code point below U+0250 (Basic
 * Latin to Latin Extended-B). The same test as the pipeline's, which draws the map sprites' letters
 * (TILE_LETTER_BELOW in data-pipeline/rmr_pipeline/images.py): change both together.
 */
export function isLatinChar(ch: string): boolean {
  const cp = ch.codePointAt(0);
  return cp !== undefined && cp < 0x250;
}
