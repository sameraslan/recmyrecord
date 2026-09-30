'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import { previousPath } from '@/lib/nav-history';

/**
 * Goes back to where About was opened from; Home when About was loaded directly. Escape and a press on the
 * backdrop around the card (mockup about-layer pointerdown) do the same.
 */
export function AboutClose() {
  const router = useRouter();
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    const prev = previousPath();
    if (prev && prev !== '/about') router.back();
    else router.push('/');
  }, [router]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t instanceof HTMLInputElement || t?.closest('textarea, select, [contenteditable="true"]')) return;
      // Dialogs (the phone search sheet) and the search popover handle their own Escape.
      if (t?.closest('[aria-modal="true"], .combo')) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);
  useEffect(() => {
    const layer = ref.current?.closest<HTMLElement>('.about-page');
    if (!layer) return;
    const onDown = (e: PointerEvent) => {
      if (e.target === layer) close();
    };
    layer.addEventListener('pointerdown', onDown);
    return () => layer.removeEventListener('pointerdown', onDown);
  }, [close]);
  return (
    <button ref={ref} type="button" className="x" aria-label={COPY.about.close} onClick={close}>
      <Icon name="x" strokeWidth={1.6} />
    </button>
  );
}
