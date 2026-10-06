import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearNameWidths, clearNamesPlacer, nameWidthsVersion, placeNamesNow, setNameFontFamily, setNamesPlacer } from './nameWidths';

afterEach(() => setNamesPlacer(null));

describe('nameWidths version (the names driver lays names out again when it changes)', () => {
  it('rises by one when the widths are cleared', () => {
    const v = nameWidthsVersion();
    clearNameWidths();
    expect(nameWidthsVersion()).toBe(v + 1);
  });

  it('rises when the lettering face changes, and not when it is set to the same face again', () => {
    setNameFontFamily('"Tenor Sans Test A", sans-serif');
    const v = nameWidthsVersion();
    setNameFontFamily('"Tenor Sans Test B", sans-serif');
    expect(nameWidthsVersion()).toBe(v + 1);
    setNameFontFamily('"Tenor Sans Test B", sans-serif');
    expect(nameWidthsVersion()).toBe(v + 1);
  });
});

describe('placeNamesNow (names are placed again without drawing a map frame)', () => {
  it('says there is no driver until one registers, and after it leaves', () => {
    expect(placeNamesNow()).toBe(false);
    const place = vi.fn(() => true);
    setNamesPlacer(place);
    expect(placeNamesNow()).toBe(true);
    expect(place).toHaveBeenCalledTimes(1);
    setNamesPlacer(null);
    expect(placeNamesNow()).toBe(false);
    expect(place).toHaveBeenCalledTimes(1);
  });

  it('passes on that the driver could not place (no labels yet), so the caller asks for a frame', () => {
    setNamesPlacer(() => false);
    expect(placeNamesNow()).toBe(false);
  });

  it('a driver that leaves clears only its own placement, never a newer driver\'s', () => {
    const old = vi.fn(() => true);
    const fresh = vi.fn(() => true);
    setNamesPlacer(old);
    setNamesPlacer(fresh);
    clearNamesPlacer(old);
    expect(placeNamesNow()).toBe(true);
    expect(fresh).toHaveBeenCalledTimes(1);
    clearNamesPlacer(fresh);
    expect(placeNamesNow()).toBe(false);
  });
});
