import { describe, expect, it } from 'vitest';
import { previousPath, recordPath } from './nav-history';

describe('nav history', () => {
  it('remembers the previous distinct path', () => {
    expect(previousPath()).toBeNull();
    recordPath('/');
    recordPath('/');
    expect(previousPath()).toBeNull();
    recordPath('/about');
    expect(previousPath()).toBe('/');
  });
});
