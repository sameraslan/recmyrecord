'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { BracketText } from '@/components/BracketText';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import { listenLink, listenText } from '@/lib/data/catalog';
import { titleStep } from '@/lib/display-text';
import type { SeedData, StopId } from '@/lib/types';
import { CopyLinkButton } from './CopyLinkButton';

/**
 * The album's own title. At the smallest size step it is cut after 3 lines (4 on a phone, album.css); a title
 * that fits is plain text. One that is cut has its whole text in the page all the same (the cut is CSS), in the
 * heading's `title`, and opens and closes from a button around it (`aria-expanded`). Whether it is cut is
 * measured after layout and again when the box or the fonts change, never on scroll or per frame.
 */
function SeedTitle({ title, titleRef }: { title: string; titleRef: RefObject<HTMLHeadingElement | null> }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const step = titleStep(title);
  const [cutFor, setCutFor] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const cut = cutFor === title;
  const open = cut && openFor === title;

  useLayoutEffect(() => {
    const el = boxRef.current;
    // Open, the box is not cut, so there is nothing to compare: it stays a button until it is closed again.
    // Only the smallest step is cut at all (album.css).
    if (!el || open || step !== 'len-l') return;
    let live = true;
    // Cut means at least a line is hidden. Tall glyphs alone make the content a little higher than its box
    // (the line height is tight), so the margin is half the font size, far under a line and over that.
    const margin = parseFloat(getComputedStyle(el).fontSize) / 2 || 8;
    const measure = () => {
      if (live) setCutFor(el.scrollHeight > el.clientHeight + margin ? title : null);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    // A web font arriving can change the number of lines without changing the size of a box that is cut.
    void document.fonts?.ready.then(measure);
    return () => {
      live = false;
      ro?.disconnect();
    };
  }, [title, step, open, cut]);

  const box = (
    <span className="seed-title-box" ref={boxRef}>
      <BracketText text={title} />
    </span>
  );
  return (
    <h1
      className={`seed-title ${step}${open ? ' is-open' : ''}`.replace(/\s+/g, ' ').trim()}
      id="seed-title"
      tabIndex={-1}
      ref={titleRef}
      title={cut ? title : undefined}
    >
      {cut ? (
        <button type="button" className="seed-title-btn" aria-expanded={open} onClick={() => setOpenFor(open ? null : title)}>
          {box}
        </button>
      ) : (
        box
      )}
    </h1>
  );
}

export function SeedHeader({ seed, lit, titleRef, stop }: { seed: SeedData; lit: Set<string>; titleRef: RefObject<HTMLHeadingElement | null>; stop: StopId }) {
  // Spotify, or the album's first other service; with neither, no link (never a search link).
  const listen = listenLink(seed);
  return (
    <div className="seed">
      <Cover album={seed} size={116} eager />
      <p className="seed-artist">
        <BracketText text={seed.artist} />
      </p>
      <SeedTitle title={seed.title} titleRef={titleRef} />
      <div className={`seed-actions${listen ? '' : ' seed-actions--solo'}`}>
        {listen ? (
          <a className="btn btn-lamp" href={listen.url} target="_blank" rel="noopener noreferrer">
            {listenText(listen.service).open}
            <Icon name="ext" />
            <span className="sr-only">{COPY.album.newTab}</span>
          </a>
        ) : null}
        {/* The only action of an album with no link: a labelled button, not a lone icon. */}
        <CopyLinkButton slug={seed.slug} stop={stop} labelled={!listen} />
      </div>
      {seed.tags.length ? (
        <ul className="tags" aria-label={COPY.album.tagsLabel}>
          {seed.tags.map((t) => (
            <li key={t} className={lit.has(t) ? 'lit' : undefined}>
              {t}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
