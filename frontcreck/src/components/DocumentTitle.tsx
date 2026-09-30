'use client';

import { useEffect } from 'react';

/** Sets document.title on the client, for pages whose metadata Next may not apply (the 404 page). */
export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}
