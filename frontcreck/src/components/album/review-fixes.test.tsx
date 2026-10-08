import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BracketText } from '@/components/BracketText';
import { Cover, TILE, tileColor } from '@/components/Cover';
import { MapCard } from '@/components/map/overlays/MapCard';
import { SimilaritySlider } from '@/components/map/overlays/SimilaritySlider';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';
import type { RecRow as Row, SeedData } from '@/lib/types';
import { useInView } from '@/lib/useInView';
import { CopyLinkButton } from './CopyLinkButton';
import { MapModeButton } from './MapModeButton';
import { mapPillHidden } from './mapPill';
import { RecList } from './RecList';
import { RecRow } from './RecRow';
import { SeedHeader } from './SeedHeader';

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));

const TITLE = 'アダンの風 [Windswept Adan]';
const ARTIST = '青葉市子 [Ichiko Aoba]';
const base = { id: 4103, slug: 'windswept-adan-ichiko-aoba', title: TITLE, artist: ARTIST, coverId: '', cluster: 1 };
const seed = (extra: Partial<SeedData> = {}): SeedData => ({ ...base, spotifyId: '', tags: [], ambient: ['#222222', '#333333', '#d9a066'], ...extra });
const row = (extra: Partial<Row> = {}): Row => ({ ...base, spotifyId: '', shared: [], ...extra });
const S = 'A'.repeat(22);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useAppStore.getState().setStop('balanced');
});

describe('BracketText: the trailing bracketed form in its own span', () => {
  it('wraps the bracket and keeps the text as it was', () => {
    const { container } = render(<p><BracketText text={TITLE} /></p>);
    const bk = container.querySelector('.bk');
    expect(bk).toHaveTextContent('[Windswept Adan]');
    expect(container.querySelector('p')!.textContent).toBe(TITLE);
  });

  it('keeps a short part before the bracket in one piece too, and a long one as plain text', () => {
    const short = render(<p><BracketText text={TITLE} /></p>).container;
    expect(short.querySelector('.bh')!.textContent).toBe('アダンの風');
    expect(short.querySelector('p')!.textContent).toBe(TITLE);
    const long = `${'a'.repeat(25)} [b]`;
    const plain = render(<p><BracketText text={long} /></p>).container;
    expect(plain.querySelector('.bh')).toBeNull();
    expect(plain.querySelector('.bk')).toHaveTextContent('[b]');
    expect(plain.querySelector('p')!.textContent).toBe(long);
  });

  it('adds no span to a string without one', () => {
    const { container } = render(<p><BracketText text="OK Computer" /></p>);
    expect(container.querySelector('.bk')).toBeNull();
    expect(container.querySelector('p')!.innerHTML).toBe('OK Computer');
  });

  it('marks how long the form is, for where a long one has to flow as plain text', () => {
    const w = (text: string) => render(<p><BracketText text={text} /></p>).container.querySelector('.bk')!.getAttribute('data-w');
    expect(w('x [Pneuma]')).toBeNull();
    expect(w(`x [${'a'.repeat(23)}]`)).toBe('m');
    expect(w(`x [${'a'.repeat(39)}]`)).toBe('l');
  });

  it('keeps search highlights on both sides of the split', () => {
    // "Aoba" in the bracket, "青葉" in the head.
    const { container } = render(<p><BracketText text={ARTIST} ranges={[{ start: 0, end: 2 }, { start: 13, end: 17 }]} /></p>);
    const marks = [...container.querySelectorAll('mark')].map((m) => m.textContent);
    expect(marks).toEqual(['青葉', 'Aoba']);
    expect(container.querySelector('.bk mark')).toHaveTextContent('Aoba');
    expect(container.querySelector('p')!.textContent).toBe(ARTIST);
  });
});

describe('titles and artists with a bracketed form', () => {
  it('are split on the album header, and the title takes the small step for its wide characters', () => {
    render(<SeedHeader seed={seed()} lit={new Set()} titleRef={createRef()} stop="balanced" />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveClass('len-l');
    expect(h1.textContent).toBe(TITLE);
    expect(h1.querySelector('.bk')).toHaveTextContent('[Windswept Adan]');
    expect(document.querySelector('.seed-artist .bk')).toHaveTextContent('[Ichiko Aoba]');
  });

  it('are split in a list row, whose accessible name is unchanged', () => {
    render(<ol><RecRow row={row()} stop="balanced" /></ol>);
    expect(document.querySelector('.rec-title .bk')).toHaveTextContent('[Windswept Adan]');
    expect(document.querySelector('.rec-artist .bk')).toHaveTextContent('[Ichiko Aoba]');
    expect(document.querySelector('.rec-title')!.textContent).toBe(TITLE);
    expect(screen.getByRole('link', { name: COPY.album.rowLabel(TITLE, ARTIST, []) })).toBeInTheDocument();
  });

  it('are split on the map card', () => {
    render(<MapCard album={{ ...base, spotifyId: '' }} stop="balanced" onClose={() => {}} />);
    expect(document.querySelector('.card .t .bk')).toHaveTextContent('[Windswept Adan]');
    expect(document.querySelector('.card .a .bk')).toHaveTextContent('[Ichiko Aoba]');
    expect(document.querySelector('.card .t')!.textContent).toBe(TITLE);
  });
});

describe('the album title when it is too long for its lines', () => {
  const LONG = 'Burritos, Inspiration Point, Fork Balloon Sports, Cards in the Spokes, Automatic Biographies, Kites, Kung Fu, Trophies';
  const overflow = (scroll: number, client: number) => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scroll);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(client);
  };

  it('is plain text, with no button and no tooltip, when it fits', () => {
    overflow(87, 87);
    render(<SeedHeader seed={seed({ title: LONG })} lit={new Set()} titleRef={createRef()} stop="balanced" />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.querySelector('button')).toBeNull();
    expect(h1).not.toHaveAttribute('title');
    expect(h1.textContent).toBe(LONG);
  });

  it('is not taken for cut by the few pixels tall glyphs add, nor at a step that is never cut', () => {
    overflow(88, 87);
    const { unmount } = render(<SeedHeader seed={seed({ title: LONG })} lit={new Set()} titleRef={createRef()} stop="balanced" />);
    expect(screen.getByRole('heading', { level: 1 }).querySelector('button')).toBeNull();
    unmount();
    overflow(174, 87);
    render(<SeedHeader seed={seed({ title: 'OK Computer' })} lit={new Set()} titleRef={createRef()} stop="balanced" />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.querySelector('button')).toBeNull();
    expect(h1).not.toHaveAttribute('title');
  });

  it('opens and closes from a button when it is cut, with the whole title in the page and in its tooltip', () => {
    overflow(174, 87);
    const titleRef = createRef<HTMLHeadingElement>();
    render(<SeedHeader seed={seed({ title: LONG })} lit={new Set()} titleRef={titleRef} stop="balanced" />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(titleRef.current).toBe(h1);
    expect(h1).toHaveAttribute('id', 'seed-title');
    expect(h1).toHaveAttribute('title', LONG);
    expect(h1.textContent).toBe(LONG);
    const button = screen.getByRole('button', { name: LONG });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(h1).not.toHaveClass('is-open');
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: LONG })).toHaveAttribute('aria-expanded', 'true');
    expect(h1).toHaveClass('is-open');
    fireEvent.click(screen.getByRole('button', { name: LONG }));
    expect(screen.getByRole('button', { name: LONG })).toHaveAttribute('aria-expanded', 'false');
    expect(h1).not.toHaveClass('is-open');
  });

  it('starts closed again on the next album', () => {
    overflow(174, 87);
    const props = { lit: new Set<string>(), titleRef: createRef<HTMLHeadingElement>(), stop: 'balanced' as const };
    const { rerender } = render(<SeedHeader seed={seed({ title: LONG })} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: LONG }));
    rerender(<SeedHeader seed={seed({ title: `${LONG} II`, slug: 'other' })} {...props} />);
    expect(screen.getByRole('button', { name: `${LONG} II` })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('the copy-link control', () => {
  it('is the icon beside the listen link, as before', () => {
    render(<SeedHeader seed={seed({ spotifyId: S })} lit={new Set()} titleRef={createRef()} stop="balanced" />);
    const button = screen.getByRole('button', { name: COPY.album.copyLinkLabel });
    expect(button).toHaveClass('icon-quiet');
    expect(button.textContent).toBe('');
    expect(button).toHaveAttribute('title', COPY.album.copyLink);
  });

  it('is a labelled bordered button when the album has no link, with its accessible name as the label', () => {
    render(<SeedHeader seed={seed()} lit={new Set()} titleRef={createRef()} stop="balanced" />);
    const button = screen.getByRole('button', { name: COPY.album.copyLinkLabel });
    expect(button).toHaveClass('btn', 'btn-line');
    expect(button).not.toHaveClass('icon-quiet');
    expect(button.textContent).toBe(COPY.album.copyLinkLabel);
    expect(button).not.toHaveAttribute('aria-label');
    expect(document.querySelector('.seed-actions')).toHaveClass('seed-actions--solo');
  });

  it('takes the label only when asked to', () => {
    render(<CopyLinkButton slug="x" stop="balanced" />);
    expect(screen.getByRole('button', { name: COPY.album.copyLinkLabel }).textContent).toBe('');
  });
});

describe('the cover tile', () => {
  it('takes its letter from the bracketed Latin form when the title starts in another script', () => {
    const { container } = render(<Cover album={{ id: 1, title: 'プネウマ [Pneuma]', coverId: '', cluster: 1 }} size={60} />);
    expect(container.querySelector('.fb')).toHaveTextContent('P');
  });

  it('shows no letter when there is no Latin form', () => {
    const { container } = render(<Cover album={{ id: 1, title: '星間性交', coverId: '', cluster: 1 }} size={60} />);
    expect(container.querySelector('.cover')).toHaveAttribute('data-state', 'tile');
    expect(container.querySelector('.fb')!.textContent).toBe('');
  });

  it('is never darker than the floor, in the hue of its cluster colour', () => {
    for (const k of [0, 1, 2, 4]) {
      const c = tileColor(k);
      expect(c).not.toBe(TILE[k % 3]);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      expect((Math.max(r, g, b) + Math.min(r, g, b)) / 510).toBeGreaterThanOrEqual(0.235);
    }
    const { container } = render(<Cover album={{ id: 1, title: 'Dark & Long', coverId: '', cluster: 1 }} size={116} />);
    expect((container.querySelector('.cover') as HTMLElement).style.getPropertyValue('--fb')).toBe(tileColor(1));
  });

  it('marks a video-frame cover, and only that, for the slight zoom that hides the frame’s edges', () => {
    const yt = render(<Cover album={{ id: 1, title: 'Dead as Dreams', coverId: 'yt:mnjH-ZYe59c', cluster: 1 }} size={116} />);
    expect(yt.container.querySelector('.cover')).toHaveAttribute('data-frame');
    const sp = render(<Cover album={{ id: 2, title: 'Ys', coverId: 'ab67616d0000b273c8b444df094279e70d0ed856', cluster: 1 }} size={116} />);
    expect(sp.container.querySelector('.cover')).not.toHaveAttribute('data-frame');
  });
});

describe('the slider beside an album without audio', () => {
  it('names its first stop "Sound": on the button and in what the slider reads out', () => {
    render(<SimilaritySlider stop="sonic" onChange={() => {}} />);
    expect([...document.querySelectorAll('.mode-stops button')].map((b) => b.textContent)).toEqual(['Sound', 'Balanced', 'Mood']);
    expect(screen.getByRole('slider', { name: COPY.slider.label })).toHaveAttribute('aria-valuetext', 'Sound');
    expect(screen.getByRole('button', { name: 'Sound' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Sonic')).toBeNull();
  });

  it('is as before for every other album', () => {
    render(<SimilaritySlider stop="balanced" onChange={() => {}} />);
    for (const s of ['sonic', 'balanced', 'mood'] as const) {
      const b = screen.getByRole('button', { name: COPY.slider.stops[s] });
      expect(b).not.toHaveClass('is-off');
      expect(b).not.toHaveAttribute('aria-describedby');
      expect(b).not.toHaveAttribute('title');
    }
    expect(document.querySelector('.mode-note')).toHaveTextContent(COPY.slider.notes.balanced);
    expect(document.querySelectorAll('.mode-track i.is-off')).toHaveLength(0);
  });

  it('dims the Sonic and Balanced stops, which keep their names and say why', () => {
    render(<SimilaritySlider stop="balanced" onChange={() => {}} noAudio />);
    for (const s of ['sonic', 'balanced'] as const) {
      const b = screen.getByRole('button', { name: COPY.slider.stops[s] });
      expect(b).toHaveClass('is-off');
      expect(b).toHaveAccessibleDescription(COPY.album.noAudio);
      expect(document.getElementById(b.getAttribute('aria-describedby')!)).toHaveTextContent(COPY.album.noAudio);
      expect(b).toHaveAttribute('title', COPY.album.noAudio);
      expect(b).not.toBeDisabled();
    }
    const mood = screen.getByRole('button', { name: COPY.slider.stops.mood });
    expect(mood).not.toHaveClass('is-off');
    expect(mood).not.toHaveAttribute('aria-describedby');
    expect(mood).not.toHaveAttribute('title');
    const dots = [...document.querySelectorAll('.mode-track i')].map((i) => i.classList.contains('is-off'));
    expect(dots).toEqual([true, true, false]);
    expect(screen.getByRole('button', { name: COPY.slider.stops.balanced })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the note in place of the caption at those stops, and the caption at Mood', () => {
    const { rerender } = render(<SimilaritySlider stop="balanced" onChange={() => {}} noAudio />);
    expect(document.querySelector('.mode-note')!.textContent).toBe(COPY.album.noAudio);
    rerender(<SimilaritySlider stop="sonic" onChange={() => {}} noAudio />);
    expect(document.querySelector('.mode-note')!.textContent).toBe(COPY.album.noAudio);
    rerender(<SimilaritySlider stop="mood" onChange={() => {}} noAudio />);
    expect(document.querySelector('.mode-note')!.textContent).toBe(COPY.slider.notes.mood);
  });

  it('leaves the dimmed stops operable', () => {
    const onChange = vi.fn();
    render(<SimilaritySlider stop="mood" onChange={onChange} noAudio />);
    fireEvent.click(screen.getByRole('button', { name: COPY.slider.stops.sonic }));
    expect(onChange).toHaveBeenCalledWith('sonic');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith('balanced');
  });
});

describe('the note of an album without audio', () => {
  it('has a bordered button under it, outside the status region', () => {
    render(<RecList seedId={1} rows={[]} total={0} stop="balanced" expanded={false} onToggle={() => {}} note />);
    const button = screen.getByRole('button', { name: COPY.album.noAudioAction });
    expect(button).toHaveClass('btn', 'btn-line');
    expect(button).not.toHaveClass('textbtn');
    expect(screen.getByRole('status').contains(button)).toBe(false);
    expect(button.closest('.recs-note')).not.toBeNull();
  });
});

describe('the floating Map button on a phone', () => {
  it('is hidden while the map strip is on screen, and only in the list', () => {
    expect(mapPillHidden({ mapMode: false, stripInView: true })).toBe(true);
    expect(mapPillHidden({ mapMode: false, stripInView: false })).toBe(false);
    // In map mode it is the List button, the only way back.
    expect(mapPillHidden({ mapMode: true, stripInView: true })).toBe(false);
    expect(mapPillHidden({ mapMode: true, stripInView: false })).toBe(false);
  });

  it('takes the class that hides it', () => {
    const { rerender } = render(<MapModeButton on={false} onToggle={() => {}} hidden />);
    expect(screen.getByRole('button', { name: COPY.phone.mapLabel, hidden: true })).toHaveClass('fab-map--away');
    rerender(<MapModeButton on={false} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: COPY.phone.mapLabel })).not.toHaveClass('fab-map--away');
  });

  describe('useInView', () => {
    type Entry = { isIntersecting: boolean };
    let observers: { cb: (entries: Entry[]) => void; observed: Element[]; disconnected: boolean }[] = [];
    beforeEach(() => {
      observers = [];
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          rec: (typeof observers)[number];
          constructor(cb: (entries: Entry[]) => void) {
            this.rec = { cb, observed: [], disconnected: false };
            observers.push(this.rec);
          }
          observe(el: Element) {
            this.rec.observed.push(el);
          }
          disconnect() {
            this.rec.disconnected = true;
          }
        },
      );
    });

    function Probe({ enabled }: { enabled: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      const seen = useInView(ref, enabled);
      return <div ref={ref} data-testid="probe" data-seen={String(seen)} />;
    }

    it('follows the observer, with no scroll listener', () => {
      const add = vi.spyOn(window, 'addEventListener');
      const docAdd = vi.spyOn(document, 'addEventListener');
      const { unmount } = render(<Probe enabled />);
      const probe = screen.getByTestId('probe');
      expect(probe).toHaveAttribute('data-seen', 'false');
      expect(observers).toHaveLength(1);
      expect(observers[0].observed).toEqual([probe]);
      act(() => observers[0].cb([{ isIntersecting: true }]));
      expect(probe).toHaveAttribute('data-seen', 'true');
      act(() => observers[0].cb([{ isIntersecting: false }]));
      expect(probe).toHaveAttribute('data-seen', 'false');
      expect([...add.mock.calls, ...docAdd.mock.calls].filter(([type]) => type === 'scroll')).toHaveLength(0);
      unmount();
      expect(observers[0].disconnected).toBe(true);
    });

    it('observes nothing, and reports false, while it is off', () => {
      const { rerender } = render(<Probe enabled />);
      act(() => observers[0].cb([{ isIntersecting: true }]));
      rerender(<Probe enabled={false} />);
      expect(screen.getByTestId('probe')).toHaveAttribute('data-seen', 'false');
      expect(observers[0].disconnected).toBe(true);
      expect(observers).toHaveLength(1);
    });
  });
});
