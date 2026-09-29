'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { SearchBox } from '@/components/search/SearchBox';
import { SearchSheet } from '@/components/search/SearchSheet';
import { registerSearchTarget } from '@/components/search/shortcut';
import { COPY } from '@/lib/copy';

/** Desktop: a field in the header (hidden on Home by CSS). Under 900 px: an icon that opens SearchSheet. */
export function HeaderSearch() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => registerSearchTarget({ el: () => toggleRef.current, focus: () => setSheetOpen(true) }), []);

  // Focus goes back to the toggle only after the sheet has unmounted: while it is open the header is inert.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !sheetOpen) toggleRef.current?.focus();
    wasOpen.current = sheetOpen;
  }, [sheetOpen]);

  const close = () => setSheetOpen(false);

  return (
    <>
      <div className="top-search">
        <SearchBox variant="header" showKbd shortcut key={pathname} />
      </div>
      <button
        ref={toggleRef}
        type="button"
        className="icon-btn search-toggle"
        aria-label={COPY.search.open}
        aria-expanded={sheetOpen}
        onClick={() => setSheetOpen(true)}
      >
        <Icon name="search" strokeWidth={1.6} />
      </button>
      {sheetOpen ? <SearchSheet onClose={close} /> : null}
    </>
  );
}
