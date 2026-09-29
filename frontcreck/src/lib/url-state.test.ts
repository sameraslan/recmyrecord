import { afterEach, describe, expect, it } from 'vitest';
import { absoluteUrl, albumHref, hrefWithBy, isStopId, parseBy, replaceBy, slugFromPathname, viewFromPathname } from './url-state';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('url state', () => {
  it('parses by, defaulting to balanced', () => {
    expect(parseBy('sonic')).toBe('sonic');
    expect(parseBy('mood')).toBe('mood');
    expect(parseBy('balanced')).toBe('balanced');
    expect(parseBy(null)).toBe('balanced');
    expect(parseBy('loud')).toBe('balanced');
    expect(isStopId('mood')).toBe(true);
    expect(isStopId(3)).toBe(false);
  });

  it('builds album hrefs, omitting the default stop', () => {
    expect(albumHref('in-rainbows-radiohead')).toBe('/album/in-rainbows-radiohead');
    expect(albumHref('in-rainbows-radiohead', 'balanced')).toBe('/album/in-rainbows-radiohead');
    expect(albumHref('in-rainbows-radiohead', 'mood')).toBe('/album/in-rainbows-radiohead?by=mood');
  });

  it('rewrites by while keeping other params and the hash', () => {
    expect(hrefWithBy('/album/x?by=mood&q=1#top', 'sonic')).toBe('/album/x?by=sonic&q=1#top');
    expect(hrefWithBy('/album/x?by=mood', 'balanced')).toBe('/album/x');
  });

  it('replaces the URL without adding history', () => {
    window.history.replaceState(null, '', '/album/x');
    const before = window.history.length;
    replaceBy('mood');
    expect(window.location.pathname + window.location.search).toBe('/album/x?by=mood');
    replaceBy('balanced');
    expect(window.location.search).toBe('');
    expect(window.history.length).toBe(before);
  });

  it('derives the view and slug from a pathname', () => {
    expect(viewFromPathname('/')).toBe('home');
    expect(viewFromPathname('/map')).toBe('explore');
    expect(viewFromPathname('/album/in-rainbows-radiohead')).toBe('album');
    expect(viewFromPathname('/about')).toBe('about');
    expect(viewFromPathname('/nope')).toBe('other');
    expect(slugFromPathname('/album/in-rainbows-radiohead')).toBe('in-rainbows-radiohead');
    expect(slugFromPathname('/map')).toBeNull();
  });

  it('makes absolute URLs', () => {
    expect(absoluteUrl('/album/x?by=mood', 'https://recmyrecord.com')).toBe('https://recmyrecord.com/album/x?by=mood');
  });
});
