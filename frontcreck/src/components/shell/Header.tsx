'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { COPY } from '@/lib/copy';

export function Header() {
  const pathname = usePathname();
  const isHome = pathname === '/';
  return (
    <header className={`top${isHome ? ' top--home' : ''}`}>
      <Link className="wordmark" href="/">
        {COPY.wordmark}
      </Link>
      <div className="top-search" />
      <nav aria-label={COPY.nav.label}>
        <Link className="navbtn" href="/map" aria-current={pathname === '/map' ? 'page' : undefined}>
          {COPY.nav.map}
        </Link>
        <Link className="navbtn" href="/about" aria-current={pathname === '/about' ? 'page' : undefined}>
          {COPY.nav.about}
        </Link>
      </nav>
    </header>
  );
}
