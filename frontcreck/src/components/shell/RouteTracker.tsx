'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { recordPath } from '@/lib/nav-history';

/** Records every pathname for `@/lib/nav-history`. Mounted before `<main>`, so its effect runs before the new
 * route's effects in the same commit. */
export function RouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordPath(pathname);
  }, [pathname]);
  return null;
}
