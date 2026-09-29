'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { SearchBox } from '@/components/search/SearchBox';
import { COPY } from '@/lib/copy';

/** Full-screen phone search. Everything behind it is inert while it is open. */
export function SearchSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const behind = [document.querySelector<HTMLElement>('header.top'), document.getElementById('main')].filter(
      (el): el is HTMLElement => !!el,
    );
    behind.forEach((el) => (el.inert = true));
    // SearchBox's autoFocus is desktop-only, so focus the sheet's field here.
    document.querySelector<HTMLInputElement>('.search-sheet input')?.focus();
    return () => behind.forEach((el) => (el.inert = false));
  }, []);

  return createPortal(
    <div
      className="search-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={COPY.search.sheetLabel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="search-sheet-top">
        <SearchBox variant="sheet" autoFocus={false} onChosen={onClose} onEscapeEmpty={onClose} />
        <button type="button" className="icon-btn" aria-label={COPY.search.close} onClick={onClose}>
          <Icon name="x" strokeWidth={1.6} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
