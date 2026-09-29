'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { SearchBox } from '@/components/search/SearchBox';
import { COPY } from '@/lib/copy';

/** Full-screen phone search. The skip link, header and main are inert while it is open (only the ones
 * the sheet itself made inert are released on close), and the page behind cannot scroll. */
export function SearchSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const behind = [
      document.querySelector<HTMLElement>('a.skip'),
      document.querySelector<HTMLElement>('header.top'),
      document.getElementById('main'),
    ].filter((el): el is HTMLElement => !!el && !el.inert);
    behind.forEach((el) => (el.inert = true));
    const body = document.body.style;
    const overflow = body.overflow;
    body.overflow = 'hidden';
    // SearchBox's autoFocus is desktop-only, so focus the sheet's field here.
    document.querySelector<HTMLInputElement>('.search-sheet input')?.focus();
    return () => {
      behind.forEach((el) => (el.inert = false));
      body.overflow = overflow;
    };
  }, []);

  return createPortal(
    <div
      className="search-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={COPY.search.sheetLabel}
      onKeyDown={(e) => {
        // An Escape that ends an IME composition belongs to the IME, not to the sheet.
        if (e.key === 'Escape' && !e.nativeEvent.isComposing && e.keyCode !== 229) onClose();
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
