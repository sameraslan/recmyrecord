'use client';

import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';
import type { StopId } from '@/lib/types';
import { absoluteUrl, albumHref } from '@/lib/url-state';

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
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
