'use client';

import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';
import type { StopId } from '@/lib/types';
import { absoluteUrl, albumHref } from '@/lib/url-state';

function legacyCopy(text: string): boolean {
  // Selecting the textarea moves focus to it; give it back to the control that had it (the copy button).
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const ta = document.createElement('textarea');
  try {
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
    focused?.focus({ preventScroll: true });
  }
}

export function CopyLinkButton({ slug, stop }: { slug: string; stop: StopId }) {
  const copy = async () => {
    const url = absoluteUrl(albumHref(slug, stop));
    const { showToast } = useAppStore.getState();
    try {
      await navigator.clipboard.writeText(url);
      showToast(COPY.album.linkCopied);
    } catch {
      showToast(legacyCopy(url) ? COPY.album.linkCopied : COPY.album.copyFailed(url.replace(/^https?:\/\//, '')));
    }
  };
  return (
    <button type="button" className="icon-quiet" aria-label={COPY.album.copyLinkLabel} title={COPY.album.copyLink} onClick={copy}>
      <Icon name="link" />
    </button>
  );
}
