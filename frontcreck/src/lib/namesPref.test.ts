import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAMES_KEY, readNamesOn, writeNamesOn } from './namesPref';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

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
