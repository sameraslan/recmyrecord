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

/** `labelled`: a bordered button with the control's name as its visible label, for where it is the only action
 * (an album with no link to listen to); otherwise the icon alone, named by `aria-label`. */
export function CopyLinkButton({ slug, stop, labelled = false }: { slug: string; stop: StopId; labelled?: boolean }) {
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
  if (labelled) {
    return (
      <button type="button" className="btn btn-line" onClick={copy}>
        <Icon name="link" />
        {COPY.album.copyLinkLabel}
      </button>
    );
  }
  return (
    <button type="button" className="icon-quiet" aria-label={COPY.album.copyLinkLabel} title={COPY.album.copyLink} onClick={copy}>
      <Icon name="link" />
    </button>
  );
}
