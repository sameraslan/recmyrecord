import { describe, expect, it } from 'vitest';
import { entryFrom, previousPath, recordPath, recordedPath } from './nav-history';

describe('nav history', () => {
  it('remembers the previous distinct path and the last recorded one', () => {
    expect(previousPath()).toBeNull();
    expect(recordedPath()).toBeNull();
    recordPath('/');
    recordPath('/');
    expect(previousPath()).toBeNull();
    expect(recordedPath()).toBe('/');
    recordPath('/about');
    expect(previousPath()).toBe('/');
    expect(recordedPath()).toBe('/about');
  });
});

describe('entryFrom (how an album panel arrived)', () => {
  it('slides in from another route, fades between albums, and is still on a direct load', () => {
    expect(entryFrom('/album/a', null, null)).toBe('none');
    expect(entryFrom('/album/a', '/map', null)).toBe('slide');
    expect(entryFrom('/album/a', '/', '/map')).toBe('slide');
    expect(entryFrom('/album/b', '/album/a', '/map')).toBe('fade');
  });

  it('looks past the path of the album itself when the route tracker already recorded it', () => {
    // a direct load whose content commits after the first commit (useSearchParams makes it client render late)
    expect(entryFrom('/album/a', '/album/a', '/map')).toBe('slide');
    expect(entryFrom('/album/b', '/album/b', '/album/a')).toBe('fade');
    expect(entryFrom('/album/a', '/album/a', null)).toBe('none');
  });
});
