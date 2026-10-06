import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapCard } from '@/components/map/overlays/MapCard';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';
import type { RecRow as Row, SeedData } from '@/lib/types';
import { RecList } from './RecList';
import { RecRow } from './RecRow';
import { SeedHeader } from './SeedHeader';

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));

const base = { id: 4200, slug: 'ys-joanna-newsom', title: 'Ys', artist: 'Joanna Newsom', coverId: '', cluster: 1 };
const seed = (extra: Partial<SeedData>): SeedData => ({ ...base, spotifyId: '', tags: [], ambient: ['#222222', '#333333', '#d9a066'], ...extra });
const row = (extra: Partial<Row>): Row => ({ ...base, spotifyId: '', rank: 1, shared: [], ...extra });
const S = 'A'.repeat(22);

describe('the one listen link, wherever the Spotify link shows', () => {
  afterEach(() => {
    cleanup();
    useAppStore.getState().setStop('balanced');
  });

  it('is the Spotify button on the seed, as before', () => {
    render(<SeedHeader seed={seed({ spotifyId: S })} lit={new Set()} titleRef={createRef()} stop="balanced" />);
    const a = screen.getByText(COPY.album.openInSpotify).closest('a');
    expect(a).toHaveTextContent(COPY.album.newTab);
    expect(a).toHaveAttribute('href', `https://open.spotify.com/album/${S}`);
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('is the first other service on a seed without Spotify, with the same target and rel', () => {
    render(<SeedHeader seed={seed({ links: { bc: 'joannanewsom.bandcamp.com/album/ys', sc: 'joanna-newsom/sets/ys-39' } })} lit={new Set()} titleRef={createRef()} stop="balanced" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('Open in Bandcamp');
    expect(links[0]).toHaveAttribute('href', 'https://joannanewsom.bandcamp.com/album/ys');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('is absent on a seed with neither', () => {
    render(<SeedHeader seed={seed({})} lit={new Set()} titleRef={createRef()} stop="balanced" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('is labelled for its service on a row', () => {
    render(<ol><RecRow row={row({ links: { am: 'us/204051949' } })} stop="balanced" /></ol>);
    const a = screen.getByRole('link', { name: 'Open Ys in Apple Music (opens in a new tab)' });
    expect(a).toHaveAttribute('href', 'https://music.apple.com/us/album/204051949');
    expect(a).toHaveAttribute('title', 'Open in Apple Music');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    cleanup();
    render(<ol><RecRow row={row({})} stop="balanced" /></ol>);
    expect(screen.getAllByRole('link')).toHaveLength(1); // only the row's own link
  });

  it('is named for its service on the map card', () => {
    render(<MapCard album={{ ...base, spotifyId: '', links: { yt: 'AfChn_NjI9w' } }} stop="balanced" onClose={() => {}} />);
    const a = screen.getByText('YouTube').closest('a');
    expect(a).toHaveTextContent(COPY.album.newTab);
    expect(a).toHaveAttribute('href', 'https://www.youtube.com/watch?v=AfChn_NjI9w');
    expect(a).toHaveAttribute('target', '_blank');
  });
});

describe('the list of an album without audio', () => {
  afterEach(() => {
    cleanup();
    useAppStore.getState().setStop('balanced');
  });

  it('shows the note in place of the rows, and its control moves the slider to Mood', () => {
    useAppStore.getState().setStop('sonic');
    render(<RecList seedId={1} rows={[]} total={0} stop="sonic" expanded={false} onToggle={() => {}} note />);
    expect(screen.getByText(COPY.album.noAudio)).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByText(COPY.album.showMore)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: COPY.album.noAudioAction }));
    expect(useAppStore.getState().stop).toBe('mood');
  });

  it('shows no note for any other list', () => {
    render(<RecList seedId={1} rows={[row({ spotifyId: S })]} total={1} stop="mood" expanded={false} onToggle={() => {}} />);
    expect(screen.queryByText(COPY.album.noAudio)).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
