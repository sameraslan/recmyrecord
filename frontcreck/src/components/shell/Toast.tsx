'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';

export function Toast() {
  const toast = useAppStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => useAppStore.getState().clearToast(), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);
  return (
    <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">
      {toast?.message ?? ''}
    </div>
  );
}
