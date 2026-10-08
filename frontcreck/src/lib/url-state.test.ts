import { afterEach, describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  albumHref,
  hrefWithBy,
  isOwnBy,
  isStopId,
  parseBy,
  isPendingOwnBy,
  replaceBy,
  slugFromPathname,
  viewFromPathname,
} from './url-state';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('url state', () => {
  it('parses by, defaulting to balanced', () => {
    // the address bar says "sound" for the stop the code and the data files call sonic
    expect(parseBy('sound')).toBe('sonic');
    // and "sonic" is not an address: like any unknown value it gives the default stop, without an error
    expect(parseBy('sonic')).toBe('balanced');
    expect(parseBy('Sound')).toBe('balanced');
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

  it('encodes special characters in album hrefs', () => {
    expect(albumHref('a b/c?d#e%')).toBe('/album/a%20b%2Fc%3Fd%23e%25');
    expect(albumHref('sigur-r\u00f3s', 'sonic')).toBe('/album/sigur-r%C3%B3s?by=sound');
  });

  it('rewrites by while keeping other params and the hash', () => {
    expect(hrefWithBy('/album/x?by=mood&q=1#top', 'sonic')).toBe('/album/x?by=sound&q=1#top');
    expect(hrefWithBy('/album/x?by=mood', 'balanced')).toBe('/album/x');
  });

  it('round trips every stop through the address: what choosing a stop writes is what selects it', () => {
    window.history.replaceState(null, '', '/album/x');
    replaceBy('sonic');
    expect(window.location.search).toBe('?by=sound');
    expect(parseBy(new URLSearchParams(window.location.search).get('by'))).toBe('sonic');
    for (const stop of ['sonic', 'balanced', 'mood'] as const) {
      expect(parseBy(new URL(albumHref('x', stop), 'http://x.invalid').searchParams.get('by'))).toBe(stop);
      expect(parseBy(new URL(hrefWithBy('/album/x', stop), 'http://x.invalid').searchParams.get('by'))).toBe(stop);
    }
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

  it('remembers the stops it wrote until the URL catches up, and forgets them on back or forward', () => {
    window.history.replaceState(null, '', '/album/x');
    window.dispatchEvent(new PopStateEvent('popstate')); // forget earlier tests' writes
    replaceBy('mood');
    expect(isPendingOwnBy('mood')).toBe(true);
    expect(isOwnBy('sonic')).toBe(false);
    expect(isOwnBy('mood')).toBe(true);
    expect(isOwnBy('mood')).toBe(false);
    replaceBy('mood'); // already in the URL: nothing written, nothing remembered
    expect(isPendingOwnBy('mood')).toBe(false);
    replaceBy('sonic');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(isOwnBy('sonic')).toBe(false);
  });

  it('recognises an older own write that Next applies after a newer one', () => {
    window.history.replaceState(null, '', '/album/x');
    window.dispatchEvent(new PopStateEvent('popstate')); // forget earlier tests' writes
    replaceBy('mood');
    replaceBy('sonic');
    expect(isOwnBy('mood')).toBe(true);
    expect(isOwnBy('sonic')).toBe(true);
    // A newer write catching up also forgets the older ones Next skipped.
    replaceBy('mood');
    replaceBy('balanced');
    expect(isOwnBy('balanced')).toBe(true);
    expect(isOwnBy('mood')).toBe(false);
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

  it('decodes encoded slugs and returns null for malformed escapes', () => {
    expect(slugFromPathname('/album/sigur-r%C3%B3s')).toBe('sigur-r\u00f3s');
    expect(slugFromPathname(albumHref('a b/c?d#e%'))).toBe('a b/c?d#e%');
    expect(slugFromPathname('/album/100%')).toBeNull();
    expect(slugFromPathname('/album/%zz')).toBeNull();
    expect(viewFromPathname('/album/100%')).toBe('other');
  });

  it('agrees with slugFromPathname on what is an album view', () => {
    expect(slugFromPathname('/album/')).toBeNull();
    expect(viewFromPathname('/album/')).toBe('other');
    expect(slugFromPathname('/album/x/y')).toBeNull();
    expect(viewFromPathname('/album/x/y')).toBe('other');
    expect(slugFromPathname('/album/x/')).toBe('x');
    expect(viewFromPathname('/album/x/')).toBe('album');
    expect(viewFromPathname(null)).toBe('home');
    expect(slugFromPathname(null)).toBeNull();
  });

  it('makes absolute URLs', () => {
    expect(absoluteUrl('/album/x?by=mood', 'https://recmyrecord.com')).toBe('https://recmyrecord.com/album/x?by=mood');
  });
});
