import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';
import { CopyLinkButton } from './CopyLinkButton';

describe('CopyLinkButton', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAppStore.getState().clearToast();
  });

  it('keeps focus on the button when it falls back to the legacy copy', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
    document.execCommand = vi.fn(() => true);
    // As in browsers (jsdom's select() leaves focus alone): selecting the textarea focuses it.
    const select = vi.spyOn(HTMLTextAreaElement.prototype, 'select').mockImplementation(function (this: HTMLTextAreaElement) {
      this.focus();
    });
    render(<CopyLinkButton slug="in-rainbows-radiohead" stop="mood" />);
    const button = screen.getByRole('button', { name: COPY.album.copyLinkLabel });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(useAppStore.getState().toast?.message).toBe(COPY.album.linkCopied));
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    expect(select).toHaveBeenCalled();
    expect(button).toHaveFocus();
    select.mockRestore();
  });
});
