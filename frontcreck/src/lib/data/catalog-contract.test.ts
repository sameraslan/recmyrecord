import { describe, expect, it } from 'vitest';
import { COPY } from '@/lib/copy';
import type { AlbumRecord, Recs } from '@/lib/types';
import { buildAlbumPageData, buildCatalog, coverUrl, coverUrlAt, isFrameCover, listenLink, listenText, moodTags, ogCover, toSummary } from './catalog';

/** The catalog (10k) data contract: cover id forms, listen links beyond Spotify, albums without audio. */
const W: [string, string, string] = ['#222222', '#333333', '#d9a066'];
const base: Pick<AlbumRecord, 'k' | 'd' | 'w'> = { k: 0, d: [], w: W };

// The same examples as data-pipeline/tests/test_covers.py (cover_url), so both sides build the same URLs, except
// for a YouTube frame: the pipeline downloads hqdefault.jpg and cuts its black bars off itself, a page cannot, so
// it asks for mqdefault.jpg, which has none (see coverUrlAt).
const SP_REF = 'ab67616d0000b273' + 'c8b444df094279e70d0ed856';
const MD5 = '0123456789abcdef0123456789abcdef';
const AM_PATH = 'Music115/v4/aa/bb/cc/aabbcc-dd/cover.jpg';

describe('cover URLs for every form of the cover id', () => {
  it('builds the same URLs as the pipeline', () => {
    expect(coverUrlAt(SP_REF, 640)).toBe('https://i.scdn.co/image/' + SP_REF);
    expect(coverUrlAt(SP_REF, 300)).toBe('https://i.scdn.co/image/ab67616d00001e02' + SP_REF.slice(16));
    expect(coverUrlAt(SP_REF, 64)).toBe('https://i.scdn.co/image/ab67616d00004851' + SP_REF.slice(16));
    expect(coverUrlAt('8a403ef64b2939cd' + '0'.repeat(24), 300)).toBe('https://i.scdn.co/image/8a403ef64b2939cd' + '0'.repeat(24));
    expect(coverUrlAt('dz:' + MD5, 200)).toBe(`https://cdn-images.dzcdn.net/images/cover/${MD5}/250x250-000000-80-0-0.jpg`);
    expect(coverUrlAt('dz:' + MD5, 600)).toBe(`https://cdn-images.dzcdn.net/images/cover/${MD5}/1000x1000-000000-80-0-0.jpg`);
    expect(coverUrlAt('am:' + AM_PATH, 200)).toBe(`https://is1-ssl.mzstatic.com/image/thumb/${AM_PATH}/200x200bb.jpg`);
    expect(coverUrlAt('bc:0123456789', 300)).toBe('https://f4.bcbits.com/img/a0123456789_2.jpg');
    expect(coverUrlAt('bc:0123456789', 640)).toBe('https://f4.bcbits.com/img/a0123456789_16.jpg');
    expect(coverUrlAt('yt:AfChn_NjI9w', 300)).toBe('https://i.ytimg.com/vi/AfChn_NjI9w/mqdefault.jpg');
    expect(coverUrlAt('', 300)).toBeNull();
  });

  it('picks the smallest fixed size that covers the request, and the largest when none does', () => {
    expect(coverUrlAt('dz:' + MD5, 56)).toContain('/56x56-');
    expect(coverUrlAt('dz:' + MD5, 57)).toContain('/250x250-');
    expect(coverUrlAt('dz:' + MD5, 5000)).toContain('/1000x1000-');
    expect(coverUrlAt('bc:1', 100)).toBe('https://f4.bcbits.com/img/a1_3.jpg');
    expect(coverUrlAt('bc:1', 210)).toBe('https://f4.bcbits.com/img/a1_9.jpg');
    expect(coverUrlAt('bc:1', 350)).toBe('https://f4.bcbits.com/img/a1_2.jpg');
    expect(coverUrlAt('bc:1', 700)).toBe('https://f4.bcbits.com/img/a1_16.jpg');
    expect(coverUrlAt('bc:1', 5000)).toBe('https://f4.bcbits.com/img/a1_10.jpg');
  });

  it('sizes for 2x density from CSS px, as for Spotify', () => {
    expect(coverUrl('dz:' + MD5, 60)).toContain('/250x250-');
    expect(coverUrl('dz:' + MD5, 116)).toContain('/250x250-');
    expect(coverUrl('dz:' + MD5, 320)).toContain('/1000x1000-');
    expect(coverUrl('am:' + AM_PATH, 60)).toBe(`https://is1-ssl.mzstatic.com/image/thumb/${AM_PATH}/120x120bb.jpg`);
    expect(coverUrl('am:' + AM_PATH, 37.5)).toBe(`https://is1-ssl.mzstatic.com/image/thumb/${AM_PATH}/75x75bb.jpg`);
    expect(coverUrl('bc:42', 60)).toBe('https://f4.bcbits.com/img/a42_9.jpg');
    expect(coverUrl('bc:42', 116)).toBe('https://f4.bcbits.com/img/a42_2.jpg');
    expect(coverUrl('yt:abc', 60)).toBe('https://i.ytimg.com/vi/abc/mqdefault.jpg');
    expect(coverUrl('', 60)).toBeNull();
  });
});

describe('the link-preview image', () => {
  it('is the 640 px Spotify cover, as before', () => {
    expect(ogCover(SP_REF)).toEqual({ url: coverUrl(SP_REF, 320), width: 640, height: 640 });
    expect(ogCover('')).toBeNull();
  });

  it('states the size each other host serves', () => {
    expect(ogCover('dz:' + MD5)).toEqual({ url: `https://cdn-images.dzcdn.net/images/cover/${MD5}/1000x1000-000000-80-0-0.jpg`, width: 1000, height: 1000 });
    expect(ogCover('am:' + AM_PATH)).toEqual({ url: `https://is1-ssl.mzstatic.com/image/thumb/${AM_PATH}/640x640bb.jpg`, width: 640, height: 640 });
    expect(ogCover('bc:7')).toEqual({ url: 'https://f4.bcbits.com/img/a7_16.jpg', width: 700, height: 700 });
    expect(ogCover('yt:abc')).toEqual({ url: 'https://i.ytimg.com/vi/abc/mqdefault.jpg', width: 320, height: 180 });
  });

  it('is the cover as stored for a Spotify id without a size prefix', () => {
    const bare = '8a403ef64b2939cd' + '0'.repeat(24);
    expect(ogCover(bare)).toEqual({ url: 'https://i.scdn.co/image/' + bare, width: 640, height: 640 });
  });

  it('asks for the one YouTube frame that has no black bars, at every size', () => {
    // hqdefault.jpg (480 x 360) letterboxes a 16:9 picture, and its centre square keeps both bars.
    for (const px of [1, 64, 96, 300, 640, 2000]) expect(coverUrlAt('yt:abc', px)).toBe('https://i.ytimg.com/vi/abc/mqdefault.jpg');
  });

  it('knows which covers are video frames', () => {
    expect(isFrameCover('yt:abc')).toBe(true);
    expect(isFrameCover(SP_REF)).toBe(false);
    expect(isFrameCover('')).toBe(false);
  });
});

describe('listen links', () => {
  const S = 'A'.repeat(22);
  it('prefers Spotify, exactly as before', () => {
    expect(listenLink({ spotifyId: S })).toEqual({ service: 'spotify', url: `https://open.spotify.com/album/${S}` });
    expect(listenLink({ spotifyId: S, links: { am: 'us/1' } })).toEqual({ service: 'spotify', url: `https://open.spotify.com/album/${S}` });
  });

  it('builds each other service', () => {
    expect(listenLink({ spotifyId: '', links: { am: 'us/1440650428' } })).toEqual({ service: 'am', url: 'https://music.apple.com/us/album/1440650428' });
    expect(listenLink({ spotifyId: '', links: { bc: 'artist.bandcamp.com/album/some-record' } })).toEqual({ service: 'bc', url: 'https://artist.bandcamp.com/album/some-record' });
    expect(listenLink({ spotifyId: '', links: { dz: '302127' } })).toEqual({ service: 'dz', url: 'https://www.deezer.com/album/302127' });
    expect(listenLink({ spotifyId: '', links: { yt: 'AfChn_NjI9w' } })).toEqual({ service: 'yt', url: 'https://www.youtube.com/watch?v=AfChn_NjI9w' });
    expect(listenLink({ spotifyId: '', links: { sc: 'artist/sets/record' } })).toEqual({ service: 'sc', url: 'https://soundcloud.com/artist/sets/record' });
  });

  it('gives one link: the first available of Apple Music, Bandcamp, Deezer, YouTube, SoundCloud', () => {
    expect(listenLink({ spotifyId: '', links: { sc: 'a/b', yt: 'v', dz: '1', bc: 'x.bandcamp.com/album/y', am: 'gb/2' } })?.service).toBe('am');
    expect(listenLink({ spotifyId: '', links: { sc: 'a/b', yt: 'v', dz: '1', bc: 'x.bandcamp.com/album/y' } })?.service).toBe('bc');
    expect(listenLink({ spotifyId: '', links: { sc: 'a/b', yt: 'v', dz: '1' } })?.service).toBe('dz');
    expect(listenLink({ spotifyId: '', links: { sc: 'a/b', yt: 'v' } })?.service).toBe('yt');
    expect(listenLink({ spotifyId: '', links: { sc: 'a/b', am: '' } })?.service).toBe('sc');
  });

  it('gives nothing when the album has neither', () => {
    expect(listenLink({ spotifyId: '' })).toBeNull();
    expect(listenLink({ spotifyId: '', links: {} })).toBeNull();
  });

  it('labels Spotify with the existing strings and the others in the same pattern', () => {
    expect(listenText('spotify')).toEqual({ open: COPY.album.openInSpotify, short: COPY.map.cardSpotify, row: COPY.album.rowSpotify });
    expect(listenText('am').open).toBe('Open in Apple Music');
    expect(listenText('am').short).toBe('Apple Music');
    expect(listenText('bc').row('Loveless')).toBe('Open Loveless in Bandcamp (opens in a new tab)');
    expect(listenText('dz').open).toBe('Open in Deezer');
    expect(listenText('yt').open).toBe('Open in YouTube');
    expect(listenText('sc').open).toBe('Open in SoundCloud');
  });
});

describe('album rows with the optional keys', () => {
  const vocab = ['lush', 'warm', 'dark', 'calm', 'epic', 'raw', 'cold', 'slow'];
  const albums: AlbumRecord[] = [
    { slug: 'a', t: 'A', a: 'X', s: 'A'.repeat(22), c: 'dz:' + MD5, ...base, d: [0, 1, 2, 3, 4, 5, 6, 7] },
    { slug: 'b', t: 'B', a: 'Y', s: '', c: 'yt:abc', ...base, l: { bc: 'y.bandcamp.com/album/b', yt: 'abc' } },
    { slug: 'c', t: 'C', a: 'Z', s: '', c: '', ...base, n: 1 },
  ];
  const recs: Recs = { sonic: [[1], [0], []], balanced: [[1], [0], []], mood: [[1, 2], [0, 2], [0, 1]] };
  const catalog = buildCatalog(albums, vocab);

  it('carries the links only for albums that have them, so today’s summaries are unchanged', () => {
    expect(toSummary(albums, 0)).toStrictEqual({ id: 0, slug: 'a', title: 'A', artist: 'X', spotifyId: 'A'.repeat(22), coverId: 'dz:' + MD5, cluster: 0 });
    expect(toSummary(albums, 1).links).toEqual({ bc: 'y.bandcamp.com/album/b', yt: 'abc' });
    expect(listenLink(toSummary(albums, 1))).toEqual({ service: 'bc', url: 'https://y.bandcamp.com/album/b' });
    expect(listenLink(toSummary(albums, 2))).toBeNull();
  });

  it('marks the seed that has no audio and keeps its empty sonic and balanced rows', () => {
    const page = buildAlbumPageData(catalog, recs, 2);
    expect(page.seed.noAudio).toBe(true);
    expect(page.recs.sonic).toEqual([]);
    expect(page.recs.balanced).toEqual([]);
    expect(page.recs.mood.map((r) => r.id)).toEqual([0, 1]);
    expect(buildAlbumPageData(catalog, recs, 0).seed).not.toHaveProperty('noAudio');
  });

  it('assumes no particular number of descriptors', () => {
    expect(moodTags(albums[0], vocab)).toHaveLength(6);
    expect(moodTags(albums[0], vocab, 20)).toHaveLength(8);
  });
});
