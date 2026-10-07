import { expect, test, type Page, type Route } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { THUMB_SHEET_RE, albumOnAnotherService, albumWithArchiveCover, albumWhoseFirstRecHasNoLink, albumWhoseFirstRecIsOnAnotherService, albumWithBracketedTitle, albumWithNoLink, albumWithoutAudio, recsOf } from './data';
import { ARCHIVE_COVER_RE, act, answerArchiveCovers, shot, visibleAlbumPoint, waitForCameraIdle, waitForMap } from './helpers';

const IR_SLUG = 'in-rainbows-radiohead';
const IR = `/album/${IR_SLUG}`;
// Sonic and balanced lists follow the audio features: expected from the data, never a pinned title.
const IR_BALANCED = recsOf(IR_SLUG, 'balanced').map((r) => r.title);
const IR_SONIC = recsOf(IR_SLUG, 'sonic').map((r) => r.title);
// The mood list barely depends on audio, so its first five are pinned by title (and checked against the data).
const IR_MOOD = ['Glitter', 'Have You in My Wilderness', 'Carrie & Lowell Live', 'Bon Iver, Bon Iver', 'Takk...'];
const titles = (page: Page) => page.locator('ol.rec-list .rec-title').allTextContents();

// Albums chosen from the data can have a Cover Art Archive cover, whose hosts are sometimes very slow: every
// test here gets a quick answer for them, but for the one that lets the real hosts answer.
let realArchive: () => Promise<void> = async () => {};
test.beforeEach(async ({ page }) => {
  realArchive = await answerArchiveCovers(page);
});

/** The accent colour of an album, read from the served data. */
async function accentOf(page: Page, slug: string): Promise<string> {
  return page.evaluate(async (s) => {
    const albums: { slug: string; w: string[] }[] = await (await fetch('/data/albums.json')).json();
    return albums.find((a) => a.slug === s)!.w[2];
  }, slug);
}

test('renders the seed, tags and the closest albums (balanced by default)', async ({ page }, info) => {
  const res = await page.goto(IR);
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle('In Rainbows by Radiohead · recmyrecord');
  await expect(page.getByRole('heading', { level: 1, name: 'In Rainbows' })).toBeVisible();
  await expect(page.locator('.seed-artist')).toHaveText('Radiohead');
  await expect(page.locator('.tags li')).toHaveText(['lush', 'melancholic', 'bittersweet', 'mellow', 'atmospheric', 'warm']);
  await expect(page.getByRole('heading', { level: 2, name: COPY.album.listHeading })).toBeVisible();
  await expect(page.locator('li.rec')).toHaveCount(5);
  expect(await titles(page)).toEqual(IR_BALANCED.slice(0, 5));
  await expect(page.locator('li.rec').first().locator('.rec-shared')).toContainText('Shares ');
  await expect(page.getByRole('link', { name: new RegExp(`^${COPY.album.openInSpotify}`) })).toHaveAttribute('href', /^https:\/\/open\.spotify\.com\/album\//);
  await expect(page.locator('li.rec').first().locator('a.rec-sp')).toHaveAttribute('target', '_blank');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await shot(page, info, 'album');
});

test('the map beside an album shows the hint line on desktop, as in the mockup', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the hint is desktop only');
  await page.goto(IR);
  await waitForMap(page);
  await waitForCameraIdle(page);
  await expect(page.locator('.map-hint')).toHaveText(COPY.map.hintAlbum);
  await expect(page.locator('.map-hint')).toBeVisible();
});

test('?by=mood shows the mood list', async ({ page }) => {
  expect(recsOf(IR_SLUG, 'mood').slice(0, 5).map((r) => r.title), 'the pinned mood titles are the data\u2019s').toEqual(IR_MOOD);
  await page.goto(`${IR}?by=mood`);
  await expect.poll(() => titles(page)).toEqual(IR_MOOD);
  expect(await page.evaluate(() => window.__rmr!.getState().stop)).toBe('mood');
});

test('show more reveals rows 6 to 10 and show fewer hides them', async ({ page, isMobile }) => {
  await page.goto(IR);
  const more = page.getByRole('button', { name: COPY.album.showMore });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(page.locator('li.rec')).toHaveCount(10);
  await expect(page.getByRole('button', { name: COPY.album.showFewer })).toHaveAttribute('aria-expanded', 'true');
  if (!isMobile) {
    await waitForMap(page);
    await expect(page.locator('.mk')).toHaveCount(11);
  }
  await page.getByRole('button', { name: COPY.album.showFewer }).click();
  await expect(page.locator('li.rec')).toHaveCount(5);
});

test.describe('desktop split view', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('the slider swaps the list in place and writes ?by= without a navigation', async ({ page }, info) => {
    await page.goto(IR);
    await waitForMap(page);
    const historyBefore = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: COPY.slider.stops.sonic, exact: true }).click();
    await expect(page).toHaveURL(`${IR}?by=sonic`);
    expect(IR_SONIC.slice(0, 5), 'the data gives the sonic stop its own list').not.toEqual(IR_BALANCED.slice(0, 5));
    await expect.poll(() => titles(page)).toEqual(IR_SONIC.slice(0, 5));
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    await waitForCameraIdle(page);
    await shot(page, info, 'album-sonic');
    await page.getByRole('button', { name: COPY.slider.stops.balanced, exact: true }).click();
    await expect(page).toHaveURL(IR);
  });

  test('a held arrow key on the slider ends on the last stop, even when a URL write lands just after it', async ({ page }) => {
    await page.goto(IR);
    await waitForMap(page);
    const range = page.getByRole('slider', { name: COPY.slider.label });
    await range.focus();
    // Key repeat at its worst moment: the next move comes the instant the app writes ?by=mood, before Next
    // has applied that URL (it does so in a transition).
    await page.evaluate(() => {
      const write = history.replaceState.bind(history);
      let armed = true;
      history.replaceState = (data, unused, url) => {
        write(data, unused, url);
        if (!armed || !String(url).includes('by=mood')) return;
        armed = false;
        const r = document.querySelector<HTMLInputElement>('.mode input[type="range"]')!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(r, '0');
        r.dispatchEvent(new Event('input', { bubbles: true }));
      };
    });
    await page.keyboard.press('ArrowRight'); // balanced -> mood, and at once mood -> sonic
    await expect(page).toHaveURL(`${IR}?by=sonic`);
    await expect(range).toHaveValue('0');
    await expect(page.getByRole('button', { name: COPY.slider.stops.sonic, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => titles(page)).toEqual(IR_SONIC.slice(0, 5));
  });

  test('rows and map markers highlight each other and light shared tags', async ({ page }) => {
    await page.goto(IR);
    await waitForMap(page);
    await waitForCameraIdle(page);
    // Any row with a "Shares" line: its words are exactly the header tags that light up.
    const row = page.locator('li.rec').filter({ has: page.locator('.rec-shared') }).first();
    await expect(row).toHaveCount(1);
    const id = await row.getAttribute('data-album-id');
    const words = (await row.locator('.rec-shared').innerText()).replace(COPY.album.shares([]), '').split(', ');
    await row.locator('a.rec-main').hover();
    await expect(row).toHaveClass(/hot/);
    await expect(page.locator(`.mk[data-album-id="${id}"]`)).toHaveAttribute('data-hot', 'true');
    await expect(page.locator('.tags li.lit')).toHaveText(words);
    await page.mouse.move(5, 890);
    const other = page.locator('li.rec').nth(3);
    const otherId = await other.getAttribute('data-album-id');
    // Markers take no pointer events (the canvas hit-tests their boxes), so move the mouse to the cover's centre.
    const box = (await page.locator(`.mk[data-album-id="${otherId}"]`).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(other).toHaveClass(/hot/);
    await expect(page.locator(`.mk[data-album-id="${otherId}"]`)).toHaveAttribute('data-hot', 'true');
  });

  test('the map stays right of the panel and a map click goes to that album', async ({ page }) => {
    await page.goto(IR);
    await waitForMap(page);
    await waitForCameraIdle(page);
    const panelRight = await page.locator('section.album').evaluate((el) => el.getBoundingClientRect().right);
    const lefts = await page.locator('.mk').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
    expect(Math.min(...lefts)).toBeGreaterThanOrEqual(panelRight);
    await expect(page.locator('.mode')).toBeVisible();
    const modeLeft = await page.locator('.mode').evaluate((el) => el.getBoundingClientRect().left);
    expect(modeLeft).toBeGreaterThanOrEqual(panelRight);
    const focusIds = await page.evaluate(() => {
      const f = window.__rmr!.getState().focus!;
      return [f.seed, ...f.recs];
    });
    let target = await visibleAlbumPoint(page, 100, 900);
    while (focusIds.includes(target.id) || target.x < panelRight + 20) target = await visibleAlbumPoint(page, target.id + 1, 2000);
    await page.mouse.click(target.x, target.y);
    await expect(page).not.toHaveURL(IR);
    await expect(page).toHaveURL(/\/album\//);
  });

  test('copy link puts the album URL (with by) on the clipboard and says so', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`${IR}?by=mood`);
    await page.getByRole('button', { name: COPY.album.copyLinkLabel }).click();
    await expect(page.getByRole('status').filter({ hasText: COPY.album.linkCopied })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/album\/in-rainbows-radiohead\?by=mood$/);
  });

  test('close and Escape return to the map and leave the store clean', async ({ page }) => {
    const albumState = () =>
      page.evaluate(() => {
        const s = window.__rmr!.getState();
        return { focus: s.focus, hot: s.hot, ambient: s.ambient, mapModeFor: s.mapModeFor, panelInset: s.panelInset, acc: document.documentElement.style.getPropertyValue('--acc') };
      });
    const clean = { focus: null, hot: null, ambient: null, mapModeFor: null, panelInset: 0, acc: '' };
    await page.goto(IR);
    await page.locator('li.rec').first().locator('a.rec-main').hover(); // make `hot` non-null first
    await page.getByRole('button', { name: COPY.album.close, exact: true }).click();
    await expect(page).toHaveURL('/map');
    await expect.poll(albumState).toEqual(clean);
    await page.goto(IR);
    await page.locator('#seed-title').focus();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL('/map');
    await expect.poll(albumState).toEqual(clean);
  });
});

test('going deeper keeps by, fills the trail, and the trail goes back', async ({ page }, info) => {
  await page.goto(`${IR}?by=mood`);
  await expect(page.locator('li.rec').first()).toContainText('Glitter');
  await page.locator('li.rec').first().locator('a.rec-main').click();
  await expect(page).toHaveURL('/album/glitter-pasteboard?by=mood');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Glitter');
  await expect(page.locator('#seed-title')).toBeFocused();
  const trail = page.getByRole('navigation', { name: COPY.album.trailNav });
  await expect(trail).toContainText(COPY.album.trailLabel);
  await expect(trail.getByRole('link', { name: 'In Rainbows' })).toBeVisible();
  await expect(trail.locator('[aria-current="page"]')).toHaveText('Glitter');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await shot(page, info, 'album-deeper');
  await trail.getByRole('link', { name: 'In Rainbows' }).click();
  await expect(page).toHaveURL(`${IR}?by=mood`);
  await expect(page.getByRole('navigation', { name: COPY.album.trailNav })).toHaveCount(0);
});

test('ambient colour and accent follow the album', async ({ page }) => {
  const acc = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--acc').trim());
  await page.goto(IR);
  await expect.poll(acc).toBe(await accentOf(page, 'in-rainbows-radiohead'));
  await expect(page.locator('.amb i.on')).toHaveCount(1);
  expect(await page.locator('.amb i.on').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('radial-gradient');
  const next = page.locator('li.rec').first().locator('a.rec-main');
  const nextSlug = (await next.getAttribute('href'))!.replace(/^\/album\//, '').replace(/\?.*$/, '');
  await next.click();
  await expect(page).toHaveURL(new RegExp(`/album/${nextSlug}`));
  await expect.poll(acc).toBe(await accentOf(page, nextSlug));
});

test('a direct ?by=mood load renders the mood list at once: no row animation, one focus', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __rowAnims: number; __focusSets: string[]; __rmr?: unknown };
    w.__rowAnims = 0;
    w.__focusSets = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
      if (this.matches('li.rec')) w.__rowAnims++;
      return animate.apply(this, args);
    };
    // The store assigns window.__rmr when it loads: subscribe then, before any component renders.
    let hooks: { subscribe?: (fn: (s: { focus: { recs: number[] } | null }, p: { focus: unknown }) => void) => void } | undefined;
    let subscribed = false;
    Object.defineProperty(window, '__rmr', {
      configurable: true,
      get: () => hooks,
      set: (v) => {
        hooks = v;
        if (!subscribed && v?.subscribe) {
          subscribed = true;
          v.subscribe((s: { focus: { recs: number[] } | null }, p: { focus: unknown }) => {
            if (s.focus && s.focus !== p.focus) w.__focusSets.push(s.focus.recs.join());
          });
        }
      },
    });
  });
  await page.goto(`${IR}?by=mood`);
  await expect.poll(() => titles(page)).toEqual(IR_MOOD);
  await waitForMap(page);
  await waitForCameraIdle(page);
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __rowAnims: number; __focusSets: string[] };
    return { anims: w.__rowAnims, focusSets: w.__focusSets, running: [...document.querySelectorAll('li.rec')].some((r) => r.getAnimations().length > 0) };
  });
  expect(seen.running).toBe(false);
  expect(seen.anims, 'no row glides or fades in on the first client render').toBe(0);
  const moodIds = await page.locator('li.rec').evaluateAll((els) => els.map((e) => e.getAttribute('data-album-id')).join());
  expect(seen.focusSets, 'the map gets one focus (the mood list), so it frames once').toEqual([moodIds]);
});

test('a direct load leaves focus alone: the first Tab reaches the skip link', async ({ page }) => {
  await page.goto(IR);
  await expect(page.locator('li.rec')).toHaveCount(5);
  // The panel's effects have run once the accent is set.
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--acc'))).not.toBe('');
  await page.waitForTimeout(200); // nothing should happen: no late focus call moves focus off the body
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: COPY.skip })).toBeFocused();
});

test('Escape inside the search popover or the phone search sheet keeps the album open', async ({ page, isMobile }) => {
  if (isMobile) {
    await page.goto(IR);
    await page.getByRole('button', { name: COPY.search.open }).tap();
    const sheet = page.getByRole('dialog', { name: COPY.search.sheetLabel });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: COPY.search.close }).focus();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  } else {
    await page.route('**/data/albums.json', (route) => route.abort());
    await page.goto(IR);
    const input = page.locator('.top-search').getByRole('combobox', { name: COPY.search.label });
    await input.click();
    await input.pressSequentially('kid a');
    const alert = page.locator('.top-search').getByRole('alert');
    await expect(alert).toContainText(COPY.error.body);
    const retry = alert.getByRole('button', { name: COPY.error.retry });
    await input.press('Tab');
    await expect(retry).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(input).toBeFocused();
  }
  await page.waitForTimeout(500); // nothing should happen: that Escape must not close the album
  await expect(page).toHaveURL(IR);
  await expect(page.locator('section.album')).toBeVisible();
});

test('an album with no place to listen shows no listen link, in its header or as a row', async ({ page }) => {
  // An album (found in the data) with no Spotify release and no other link: no button to a service, never a search link.
  const none = albumWithNoLink();
  await page.goto(`/album/${encodeURIComponent(none.slug)}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(none.title);
  await expect(page.locator('.seed-actions a')).toHaveCount(0);
  await expect(page.getByRole('button', { name: COPY.album.copyLinkLabel })).toBeVisible();
  await expect(page.locator('a[href*="open.spotify.com/search"]')).toHaveCount(0);
  // An album (found in the data) whose closest balanced album has no link at all, and whose second has a Spotify release.
  const off = albumWhoseFirstRecHasNoLink('balanced');
  expect(off.first.spotifyId).toBe('');
  await page.goto(`/album/${encodeURIComponent(off.slug)}`);
  const row = page.locator('li.rec').first();
  await expect(row.locator('.rec-title')).toHaveText(off.first.title);
  await expect(row.locator('a.rec-main')).toBeVisible();
  await expect(row.locator('a.rec-sp')).toHaveCount(0);
  await expect(row.locator('a[target="_blank"]')).toHaveCount(0);
  await expect(page.locator('li.rec').nth(1).locator('a.rec-sp')).toHaveAttribute('href', `https://open.spotify.com/album/${off.second.spotifyId}`);
  await expect(page.locator('a[href*="open.spotify.com/search"]')).toHaveCount(0);
});

test('an album that is not on Spotify links to its other service, in its header and as a row', async ({ page }) => {
  // An album (found in the data) with no Spotify release and a link to another service.
  const other = albumOnAnotherService();
  expect(other.listen.url).not.toContain('spotify');
  await page.goto(`/album/${encodeURIComponent(other.slug)}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.title);
  const link = page.locator('.seed-actions a');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAccessibleName(`${other.listen.open} ${COPY.album.newTab}`);
  await expect(link).toHaveAttribute('href', other.listen.url);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('.seed-actions').getByText(COPY.album.openInSpotify)).toHaveCount(0);
  await expect(page.getByRole('button', { name: COPY.album.copyLinkLabel })).toBeVisible();
  // And as a row: an album (found in the data) whose closest balanced album is on another service only.
  const off = albumWhoseFirstRecIsOnAnotherService('balanced');
  await page.goto(`/album/${encodeURIComponent(off.slug)}`);
  const row = page.locator('li.rec').first();
  await expect(row.locator('.rec-title')).toHaveText(off.first.title);
  await expect(row.locator('a.rec-sp')).toHaveAttribute('href', off.listen.url);
  await expect(row.locator('a.rec-sp')).toHaveAttribute('target', '_blank');
  await expect(row.locator('a.rec-sp')).toHaveAccessibleName(COPY.listen.rowOpenIn(off.first.title, off.listen.name));
  await expect(page.locator('a[href*="open.spotify.com/search"]')).toHaveCount(0);
});

test('an album without audio says so at the sonic and balanced stops, and its button shows the mood list', async ({ page, isMobile }) => {
  const quiet = albumWithoutAudio();
  const url = `/album/${encodeURIComponent(quiet.slug)}`;
  const mood = recsOf(quiet.slug, 'mood').map((r) => r.title);
  expect(recsOf(quiet.slug, 'balanced')).toEqual([]);
  expect(recsOf(quiet.slug, 'sonic')).toEqual([]);
  expect(mood).toHaveLength(10);
  for (const by of ['', '?by=sonic']) {
    const res = await page.goto(url + by);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(quiet.title);
    await expect(page.getByRole('heading', { level: 2, name: COPY.album.listHeading })).toBeVisible();
    // The note stands where the list would be, with one control; there is no list and nothing to show more of.
    await expect(page.locator('.recs-note [role="status"]')).toHaveText(COPY.album.noAudio);
    await expect(page.locator('li.rec')).toHaveCount(0);
    await expect(page.getByRole('button', { name: COPY.album.showMore })).toHaveCount(0);
    await expect(page.getByRole('button', { name: COPY.album.noAudioAction })).toBeVisible();
  }
  // The page is live before the tap: the client has read ?by=sonic into the store and the panel's effects have
  // run (the accent is set). A tap on the server-rendered button before that would do nothing.
  await expect.poll(() => page.evaluate(() => window.__rmr?.getState().stop)).toBe('sonic');
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--acc'))).not.toBe('');
  await act(page.getByRole('button', { name: COPY.album.noAudioAction }), isMobile);
  await expect(page).toHaveURL(`${url}?by=mood`);
  await expect.poll(() => titles(page)).toEqual(mood.slice(0, 5));
  await expect(page.locator('.recs-note')).toHaveCount(0);
  await expect(page.getByRole('button', { name: COPY.album.noAudioAction })).toHaveCount(0);
  // Focus is not left on the removed button: the heading of the list has it.
  await expect(page.locator('#recs-h')).toBeFocused();
  expect(await page.evaluate(() => window.__rmr!.getState().stop)).toBe('mood');
  await act(page.getByRole('button', { name: COPY.album.showMore }), isMobile);
  await expect.poll(() => titles(page)).toEqual(mood);
  // A direct load at Mood shows the list at once, without the note.
  await page.goto(`${url}?by=mood`);
  await expect.poll(() => titles(page)).toEqual(mood.slice(0, 5));
  await expect(page.locator('.recs-note')).toHaveCount(0);
});

test('a title in another script with a Latin form in brackets shows both, the bracketed form in one piece', async ({ page }) => {
  const album = albumWithBracketedTitle();
  expect(album.bracket).toMatch(/^\[.+\]$/);
  expect(`${album.native} ${album.bracket}`).toBe(album.title);
  const res = await page.goto(`/album/${encodeURIComponent(album.slug)}`);
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle(`${COPY.titles.album(album.title, album.artist)} · recmyrecord`);
  const h1 = page.getByRole('heading', { level: 1 });
  // The same characters in the same order: nothing is dropped or replaced.
  await expect(h1).toHaveText(album.title);
  await expect(h1).toBeVisible();
  await expect(h1.locator('.bk')).toHaveText(album.bracket);
  await expect(page.locator('.seed-artist')).toHaveText(album.artist);
  // The native script is drawn with real glyphs: its text takes up room, and the title is not cut off sideways.
  const box = await h1.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height, overflow: el.scrollWidth - el.clientWidth };
  });
  expect(box.width).toBeGreaterThan(40);
  expect(box.height).toBeGreaterThan(20);
  expect(box.overflow).toBeLessThanOrEqual(1);
  // The bracketed form is one piece on one line where it fits (a short one does).
  const bk = await h1.locator('.bk').evaluate((el) => ({ rects: el.getClientRects().length, nowrap: getComputedStyle(el).whiteSpace }));
  if (bk.nowrap === 'nowrap') expect(bk.rects).toBe(1);
  await expect(page.locator('li.rec').first()).toBeVisible();
});

/**
 * A Cover Art Archive cover is asked for at coverartarchive.org, which answers with a redirect to archive.org,
 * which redirects to one of its file hosts (`*.archive.org`); those now and then answer 500. Playwright cannot
 * play a redirect chain itself (a request that follows a redirect is not routed), so the first test lets the
 * real hosts answer and the others answer the first request themselves.
 */
test.describe('a Cover Art Archive cover', () => {
  const album = albumWithArchiveCover();
  const url = `/album/${encodeURIComponent(album.slug)}`;
  const FIRST = `https://coverartarchive.org/release-group/${album.mbid}/front-250`;
  const ARCHIVE_RE = ARCHIVE_COVER_RE;
  // A 1 x 1 PNG.
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const sheetOf = (id: number) => (id < 4096 ? 'thumbs.webp' : `thumbs-${Math.floor(id / 4096)}.webp`);

  /** Console messages about the Content-Security-Policy. */
  function cspMessages(page: Page): string[] {
    const found: string[] = [];
    page.on('console', (m) => {
      if (/content security policy|refused to (load|connect)/i.test(m.text())) found.push(m.text());
    });
    return found;
  }

  test('comes through the real redirects with nothing refused by the Content-Security-Policy, and ends as the picture or the sprite', async ({ page }) => {
    test.setTimeout(120_000);
    await realArchive();
    const csp = cspMessages(page);
    // Every answer on the way: the two redirects and the file host's own.
    const hops: { host: string; status: number }[] = [];
    page.on('response', (r) => {
      const host = new URL(r.url()).host;
      if (host === 'coverartarchive.org' || host === 'archive.org' || host.endsWith('.archive.org')) hops.push({ host, status: r.status() });
    });
    // Not the load event: it waits for this very cover.
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(album.title);
    const cover = page.locator('.seed .cover');
    // The archive can be slow: the cover settles as the loaded picture, or (a 500, or no network) as the sprite.
    await expect(cover.locator('img.ok, .spr')).toBeVisible({ timeout: 90_000 });
    const state = await cover.getAttribute('data-state');
    const file = hops.find((h) => h.host.endsWith('.archive.org'));
    if (file?.status === 200) {
      // The file host answered with the picture: it is shown, so no hop was blocked.
      expect(state).toBe('remote');
      await expect(cover.locator('img')).toHaveAttribute('src', FIRST);
      expect(await cover.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(100);
      expect(hops.map((h) => h.host).slice(0, 2)).toEqual(['coverartarchive.org', 'archive.org']);
    } else {
      expect(state).toBe('sprite');
    }
    expect(csp).toEqual([]);
  });

  test('shows the picture the archive answers with, and fetches no thumbnail sheet', async ({ page }) => {
    const csp = cspMessages(page);
    const sheets: string[] = [];
    page.on('request', (r) => {
      if (THUMB_SHEET_RE.test(r.url())) sheets.push(r.url());
    });
    const asked: string[] = [];
    await page.route(ARCHIVE_RE, (route) => {
      asked.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
    });
    await page.goto(url);
    const cover = page.locator('.seed .cover');
    await expect(cover.locator('img')).toHaveAttribute('src', FIRST);
    await expect(cover.locator('img.ok')).toBeVisible();
    await expect(cover).toHaveAttribute('data-state', 'remote');
    await expect(cover).not.toHaveAttribute('data-frame', '');
    // The same URL can be asked for twice (the phone's map strip draws the same cover), never another one.
    expect([...new Set(asked)]).toEqual([FIRST]);
    expect(csp).toEqual([]);
    expect(sheets).toEqual([]);
  });

  for (const [what, answer] of [
    ['answers 500', (route: Route) => route.fulfill({ status: 500, body: 'error' })],
    ['cannot be reached', (route: Route) => route.abort('connectionfailed')],
    ['answers with something that is no picture', (route: Route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Internal Server Error</h1>' })],
  ] as const) {
    test(`falls back to the thumbnail sprite when the archive ${what}`, async ({ page }) => {
      await page.route(ARCHIVE_RE, answer);
      await page.goto(url);
      const cover = page.locator('.seed .cover');
      await expect(cover).toHaveAttribute('data-state', 'sprite');
      await expect(cover.locator('.spr')).toBeVisible();
      await expect(cover.locator('img')).toHaveCount(0);
      await expect(cover.locator('.fb')).toHaveCount(0);
      // The sprite is the album's own cell of its own sheet.
      expect(await cover.locator('.spr').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(`/data/${sheetOf(album.id)}`);
      // The rest of the page is unharmed.
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(album.title);
      await expect(page.getByRole('button', { name: COPY.album.copyLinkLabel })).toBeVisible();
    });
  }

  test('falls back to the lettered tile when the archive and the thumbnail sheet both fail', async ({ page }) => {
    await page.route(ARCHIVE_RE, (route) => route.fulfill({ status: 500, body: 'error' }));
    await page.route(THUMB_SHEET_RE, (route) => route.abort());
    await page.goto(url);
    await expect(page.locator('.seed .cover')).toHaveAttribute('data-state', 'tile');
    await expect(page.locator('.seed .cover .fb')).toBeVisible();
  });
});

test('unknown album slugs are 404s', async ({ page }) => {
  const res = await page.goto('/album/not-an-album');
  expect(res?.status()).toBe(404);
});
