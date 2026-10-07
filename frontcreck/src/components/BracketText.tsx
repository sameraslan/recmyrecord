import { Fragment, type ReactNode } from 'react';
import { bracketStart, clipRanges, displayWidth } from '@/lib/display-text';
import { splitHighlights, type HighlightRange } from '@/lib/highlight';

/** Widths (displayWidth, brackets included) over which a bracketed form is too long for one line of a phone
 * row, and of a desktop row: `data-w` "m" and "l" (see `.bk` in search.css). */
const WIDTH_M = 24;
const WIDTH_L = 40;

function part(text: string, ranges: readonly HighlightRange[] | undefined): ReactNode {
  if (!ranges) return text;
  return splitHighlights(text, ranges).map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>));
}

/**
 * A title or an artist as text, with a trailing bracketed form (`native [Latin]`) in a `.bk` span that stays in
 * one piece where it fits on a line. A short part before it is one piece too (`.bh`), so the line breaks between
 * the two forms and not inside the native one (kana and ideographs can break anywhere). The text itself is
 * unchanged: the same characters in the same order.
 * `ranges` are search highlights in the whole string (SearchBox); they are kept on both sides of the split.
 */
export function BracketText({ text, ranges }: { text: string; ranges?: readonly HighlightRange[] }) {
  const at = bracketStart(text);
  if (at < 0) return <>{part(text, ranges)}</>;
  const width = displayWidth(text.slice(at));
  const headEnd = text.slice(0, at).trimEnd().length;
  const shortHead = displayWidth(text.slice(0, headEnd)) <= WIDTH_M;
  return (
    <>
      {shortHead ? (
        <>
          <span className="bh">{part(text.slice(0, headEnd), ranges && clipRanges(ranges, 0, headEnd))}</span>
          {text.slice(headEnd, at)}
        </>
      ) : (
        part(text.slice(0, at), ranges && clipRanges(ranges, 0, at))
      )}
      <span className="bk" data-w={width > WIDTH_L ? 'l' : width > WIDTH_M ? 'm' : undefined}>
        {part(text.slice(at), ranges && clipRanges(ranges, at, text.length))}
      </span>
    </>
  );
}
