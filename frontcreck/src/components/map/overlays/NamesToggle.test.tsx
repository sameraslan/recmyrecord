import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';
import { NamesToggle } from './NamesToggle';

beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState({ namesOn: true });
});
afterEach(() => useAppStore.setState({ namesOn: true }));

describe('NamesToggle', () => {
  it('is an icon-only pressed button that switches the names off and on and saves the choice', () => {
    const { getByRole, unmount } = render(<NamesToggle />);
    const button = getByRole('button', { name: 'Place names' });
    expect(COPY.map.names).toBe('Place names');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('type', 'button');
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(button.querySelector('svg')).toHaveAttribute('stroke-width', '1.6');
    expect(button.querySelector('mask')).toBeNull();
    fireEvent.click(button);
    expect(useAppStore.getState().namesOn).toBe(false);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.querySelector('mask')).not.toBeNull();
    expect(window.localStorage.getItem('rmr-names')).toBe('0');
    fireEvent.click(button);
    expect(useAppStore.getState().namesOn).toBe(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('rmr-names')).toBe('1');
    unmount();
  });

  it('keeps one fixed accessible name in both states: only the pressed state changes', () => {
    const { getByRole, unmount } = render(<NamesToggle />);
    const button = getByRole('button', { name: COPY.map.names });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-label', COPY.map.names);
    expect(getByRole('button', { name: COPY.map.names, pressed: false })).toBe(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-label', COPY.map.names);
    expect(getByRole('button', { name: COPY.map.names, pressed: true })).toBe(button);
    unmount();
  });
});
