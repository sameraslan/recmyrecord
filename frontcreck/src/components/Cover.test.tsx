import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THUMB_PER_SHEET } from '@/lib/data/sprites';
import { resetThumbSheets } from '@/lib/thumb-sheet';
import { Cover } from './Cover';

class FakeImage {
  static made: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() {
    FakeImage.made.push(this);
  }
}

const COVER = 'ab67616d0000b273' + 'c8b444df094279e70d0ed856';
const album = (id: number) => ({ id, title: 'Ys', coverId: COVER, cluster: 1 });

/** The fallback sprite comes from the thumbnail sheet the album is on: thumbs.webp, thumbs-1.webp, ... */
describe('Cover falls back to the album’s own thumbnail sheet', () => {
  beforeEach(() => {
    FakeImage.made = [];
    vi.stubGlobal('Image', FakeImage);
    resetThumbSheets();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetThumbSheets();
  });

  const failRemote = (id: number) => {
    const { container } = render(<Cover album={album(id)} size={60} />);
    expect(FakeImage.made).toHaveLength(0); // no sheet while the remote image may still load
    fireEvent.error(container.querySelector('img')!);
    return container;
  };

  it.each([
    [0, '/data/thumbs.webp'],
    [THUMB_PER_SHEET - 1, '/data/thumbs.webp'],
    [THUMB_PER_SHEET, '/data/thumbs-1.webp'],
    [THUMB_PER_SHEET + 104, '/data/thumbs-1.webp'],
    [2 * THUMB_PER_SHEET + 5, '/data/thumbs-2.webp'],
  ])('album %i uses %s', (id, sheetUrl) => {
    const container = failRemote(id);
    expect(FakeImage.made.map((i) => i.src)).toEqual([sheetUrl]);
    const cover = container.querySelector('.cover')!;
    expect(cover).toHaveAttribute('data-state', 'sprite');
    expect(container.querySelector('.spr')).toBeNull(); // not before the sheet has loaded
    act(() => FakeImage.made[0].onload!());
    expect(container.querySelector<HTMLElement>('.spr')!.style.backgroundImage.replaceAll('"', '')).toBe(`url(${sheetUrl})`);
  });

  it("shows the site's own copy of a ca: cover and falls back to the sprite when that fails", () => {
    const mbid = 'a415fc9b-1516-303e-b354-fc3a5b269f1b';
    const { container } = render(<Cover album={{ id: THUMB_PER_SHEET + 7, title: 'Chill Out', coverId: `ca:${mbid}`, cluster: 2 }} size={116} />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', `/covers/${mbid}.jpg`);
    expect(img).not.toHaveAttribute('crossorigin');
    expect(container.querySelector('.cover')).toHaveAttribute('data-state', 'remote');
    expect(container.querySelector('.cover')).not.toHaveAttribute('data-frame');
    expect(FakeImage.made).toHaveLength(0);
    fireEvent.error(img); // the file is missing, or did not arrive
    expect(container.querySelector('.cover')).toHaveAttribute('data-state', 'sprite');
    expect(container.querySelector('img')).toBeNull();
    expect(FakeImage.made.map((i) => i.src)).toEqual(['/data/thumbs-1.webp']);
    act(() => FakeImage.made[0].onload!());
    expect(container.querySelector<HTMLElement>('.spr')!.style.backgroundImage.replaceAll('"', '')).toBe('url(/data/thumbs-1.webp)');
    expect(container.querySelector('.fb')).toBeNull();
  });

  it('shows the lettered tile when that sheet fails, without touching another sheet', () => {
    const container = failRemote(THUMB_PER_SHEET + 104);
    act(() => FakeImage.made[0].onerror!());
    expect(container.querySelector('.cover')).toHaveAttribute('data-state', 'tile');
    expect(container.querySelector('.fb')).toHaveTextContent('Y');
    expect(FakeImage.made).toHaveLength(1);
  });
});
