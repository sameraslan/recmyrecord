import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAMES_KEY, readNamesOn, setNamesOn, writeNamesOn } from './namesPref';
import { useAppStore } from './store';

beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState({ namesOn: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  useAppStore.setState({ namesOn: true });
});

function countNotifications(run: () => void): number {
  let calls = 0;
  const unsub = useAppStore.subscribe(() => calls++);
  run();
  unsub();
  return calls;
}

describe('names preference', () => {
  it('is on by default', () => {
    expect(readNamesOn()).toBe(true);
  });

  it('round-trips off and on through localStorage', () => {
    writeNamesOn(false);
    expect(window.localStorage.getItem(NAMES_KEY)).toBe('0');
    expect(readNamesOn()).toBe(false);
    writeNamesOn(true);
    expect(window.localStorage.getItem(NAMES_KEY)).toBe('1');
    expect(readNamesOn()).toBe(true);
  });

  it('treats junk as on', () => {
    for (const junk of ['', 'false', 'off', '{bad json', 'null', '00']) {
      window.localStorage.setItem(NAMES_KEY, junk);
      expect(readNamesOn(), junk).toBe(true);
    }
  });

  it('survives storage throwing on read and on write', () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    expect(readNamesOn()).toBe(true);
    expect(() => writeNamesOn(false)).not.toThrow();
  });
});

// These three were store tests while the setter and the read lived in lib/store.ts (first-load code). They moved
// here with them, and assert the same things.
describe('names choice in the app store', () => {
  it('shows region names by default, and saves the choice when it changes', () => {
    expect(useAppStore.getState().namesOn).toBe(true);
    const calls = countNotifications(() => {
      setNamesOn(true);
      setNamesOn(false);
      setNamesOn(false);
    });
    expect(calls).toBe(1);
    expect(useAppStore.getState().namesOn).toBe(false);
    expect(window.localStorage.getItem('rmr-names')).toBe('0');
    // An unchanged choice writes nothing either.
    const write = vi.spyOn(Storage.prototype, 'setItem');
    setNamesOn(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('still switches names off for the page load when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    setNamesOn(false);
    expect(useAppStore.getState().namesOn).toBe(false);
  });

  it('starts from the saved choice in the browser, as soon as this module loads', async () => {
    window.localStorage.setItem('rmr-names', '0');
    vi.resetModules();
    await import('./namesPref');
    const fresh = await import('./store');
    expect(fresh.useAppStore.getState().namesOn).toBe(false);
  });

  it('tells nobody when the saved choice is on, missing, junk or unreadable: the store already says on', async () => {
    const load = async (): Promise<{ on: boolean; calls: number }> => {
      vi.resetModules();
      const fresh = await import('./store');
      let calls = 0;
      fresh.useAppStore.subscribe(() => calls++);
      await import('./namesPref');
      return { on: fresh.useAppStore.getState().namesOn, calls };
    };
    expect(await load()).toEqual({ on: true, calls: 0 });
    for (const saved of ['1', 'junk']) {
      window.localStorage.setItem('rmr-names', saved);
      expect(await load(), saved).toEqual({ on: true, calls: 0 });
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(await load()).toEqual({ on: true, calls: 0 });
    vi.restoreAllMocks();
    window.localStorage.setItem('rmr-names', '0');
    expect(await load()).toEqual({ on: false, calls: 1 });
  });
});
