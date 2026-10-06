'use client';

import { memo, useLayoutEffect, useRef } from 'react';
import { COPY } from '@/lib/copy';
import { setNamesOn } from '@/lib/namesPref';
import { useAppStore } from '@/lib/store';

/** The "Aa" glyph of the Trifid prototype's namesToggle, number for number (its app.js, `AA`). */
const AA = '<path d="M2.5 18 7.5 6l5 12M4.4 13.6h6.2"/><circle cx="17.6" cy="14.6" r="3.2"/><path d="M20.8 11.2V18"/>';
const svg = (inner: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
const ICON_ON = svg(AA);
/** Off: the letters at 42%, cut by a mask along the slash (a 4.4 unit band), and a thin slash drawn in the gap.
 * A mask, unlike a stroke in the panel's colour, also works on a see-through panel. */
const ICON_OFF = svg(
  '<mask id="rmr-names-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff" stroke="none"/>' +
    '<path d="M1.5 22.5 22.5 1.5" stroke="#000" stroke-width="4.4" stroke-linecap="butt"/></mask>' +
    `<g mask="url(#rmr-names-cut)" opacity="0.42">${AA}</g><path d="M4 20 20 4" stroke-width="1.2" opacity="0.95"/>`,
);

/** Region names on or off: a separate box 8 px above the zoom stack (the owner's option B, approved
 * 2026-10-04). Icon only; the choice is remembered on this device (lib/namesPref.ts). One fixed accessible
 * label with a pressed state; the label never swaps.
 * PENDING OWNER APPROVAL: the label's wording (COPY.map.names).
 *
 * It is built the way the Trifid prototype's namesToggle builds it: a plain DOM button put in as the first
 * child of .map-zoom, so it comes before Zoom in in the document and in the Tab order, and every rule that
 * sizes, lifts or hides the zoom buttons applies to it. The map's own chunk (MusicMap) mounts it, so none of it
 * is first-load code. Both other ways were built and measured (part 2 Task 6), and each made the first load
 * larger for nothing: a child of ZoomControls, or even an empty box kept there for it, splits the first-load
 * chunk MapStage is in (+0.6 KB); a React portal from this chunk makes it import react-dom, which moves modules
 * between first-load chunks (+0.3 KB). Until it arrives, styles/map.css keeps its place free above Zoom in.
 *
 * `shown` is whether the zoom corner is on screen: the map input's `interactive`. MapStage draws ZoomControls on
 * that same condition and in the same commit, so the corner is in the document when the layout effect runs, and
 * the button is in before paint. Nothing here runs when the map re-renders for another reason (a hover beside
 * an album re-renders it on every album crossed). React never moves or removes the three zoom buttons one by
 * one, so a node of ours before them is safe; it goes with the corner, or in this effect's cleanup. */
export const NamesToggle = memo(function NamesToggle({ shown }: { shown: boolean }) {
  const on = useAppStore((s) => s.namesOn);
  const button = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    const corner = shown ? document.querySelector('.map-zoom') : null;
    if (!corner) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'map-names';
    b.setAttribute('aria-label', COPY.map.names);
    b.addEventListener('click', () => setNamesOn(!useAppStore.getState().namesOn));
    corner.prepend(b);
    button.current = b;
    return () => {
      b.remove();
      button.current = null;
    };
  }, [shown]);
  // After the effect above, so a button made in this commit is drawn in it. The same button is kept across a
  // click: it keeps the keyboard focus.
  useLayoutEffect(() => {
    const b = button.current;
    if (!b) return;
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = on ? ICON_ON : ICON_OFF;
  }, [shown, on]);
  return null;
});
