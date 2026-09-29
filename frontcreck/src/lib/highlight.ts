/** Half-open range [start, end) in the original (unfolded) string. */
export interface HighlightRange {
  start: number;
  end: number;
}

export function splitHighlights(text: string, ranges: readonly HighlightRange[]): { text: string; mark: boolean }[] {
  const out: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start > at) out.push({ text: text.slice(at, r.start), mark: false });
    if (r.end > r.start) out.push({ text: text.slice(r.start, r.end), mark: true });
    at = Math.max(at, r.end);
  }
  if (at < text.length || out.length === 0) out.push({ text: text.slice(at), mark: false });
  return out;
}
