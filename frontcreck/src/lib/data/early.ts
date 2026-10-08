import { gasUrl } from '@/lib/data/theme';
import { THEME_BAKE } from '@/lib/data/theme.generated';
import { markOnce } from '@/lib/marks';
import { DEFAULT_STOP, type StopId } from '@/lib/types';

/**
 * The nebula image of the stop a page opens on, asked for and decoded while the rest of the map is still on its
 * way (the album list, the map's code, WebGL). The map's gas layer takes it over when it mounts
 * (components/map/canvas/GasField.tsx) instead of starting its own download then.
 *
 * Its address must be known before theme.json is in: it is built from the hashes `npm run theme` writes into
 * theme.generated.ts. The server HTML asks for the default stop's image with a preload link (app/MapPreloads.tsx),
 * and this file asks with the same kind of request, so the two are one download. A page without that link (a build
 * that serves another data set, RMR_DATA_DIR) starts nothing here, and the gas layer loads its images as before.
 */

/** How a gas image is decoded, off the main thread. The alpha channel is data (what the dust lets through), so it
 * must not be multiplied into the colour: premultiplyAlpha "none", and never a 2D canvas. */
export const GAS_BITMAP: ImageBitmapOptions = { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };

/** The first gas image of a stop, as the committed theme names it. */
export const bakedGasUrl = (stop: StopId): string => gasUrl(stop, THEME_BAKE.stops[stop].hash);

/** The one image the server HTML asks for: every page is served for the default stop (a `?by=` is not known there). */
export const PRELOADED_GAS_URL = bakedGasUrl(DEFAULT_STOP);

let asked = false;
let held: { url: string; bitmap: Promise<ImageBitmap> } | null = null;

function preloaded(url: string): boolean {
  for (const link of document.querySelectorAll('link[rel="preload"][as="fetch"]')) if (link.getAttribute('href') === url) return true;
  return false;
}

async function fetchBitmap(url: string): Promise<ImageBitmap> {
  // The same request as the preload link's (CORS mode, same-origin credentials): the browser hands over that download.
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Read as bytes, not with res.blob(): on a response that took over a preload still arriving, Chrome's blob()
  // fails the moment the download ends ("Failed to fetch"; seen on every slow phone-sized load), while reading
  // the bytes works, as json() does for the data files. The copy is 0.2 MB.
  const type = res.headers.get('content-type') ?? 'image/webp';
  const bitmap = await createImageBitmap(new Blob([await res.arrayBuffer()], { type }), GAS_BITMAP);
  markOnce('rmr-gas-decoded');
  return bitmap;
}

/**
 * Asks for the first gas image of `stop`, the stop this page load opens on, and decodes it. Once per page load;
 * later calls do nothing. Call from an effect.
 */
export function startEarlyGas(stop: StopId): void {
  if (asked || typeof document === 'undefined') return;
  asked = true;
  if (!preloaded(PRELOADED_GAS_URL)) return;
  markOnce('rmr-gas-fetch');
  const url = bakedGasUrl(stop);
  const bitmap = fetchBitmap(url);
  // Whoever takes the image hears of a failure; one that nobody takes must not be an unhandled rejection.
  bitmap.catch(() => {});
  held = { url, bitmap };
  // An album link that opens on another stop: the preloaded image is still claimed, so the browser does not report
  // a preload nobody used. It stays in the HTTP cache for when the map loads that stop.
  if (url !== PRELOADED_GAS_URL) void fetch(PRELOADED_GAS_URL, { credentials: 'same-origin' }).then((res) => res.arrayBuffer()).catch(() => {});
}

/**
 * Hands over the image asked for early, if `url` is that image: the caller owns it from here (and closes it), and
 * a second call gets null. It rejects as a load of its own would. null when nothing was asked for at this address.
 */
export function takeEarlyGas(url: string): Promise<ImageBitmap> | null {
  if (held?.url !== url) return null;
  const { bitmap } = held;
  held = null;
  return bitmap;
}

/** Frees the image asked for early when no map will take it: there is no WebGL, or the theme that arrived names
 * other images (`keep`: the addresses a map could still ask for). */
export function dropEarlyGas(keep: readonly string[] = []): void {
  if (!held || keep.includes(held.url)) return;
  const { bitmap } = held;
  held = null;
  void bitmap.then((b) => b.close(), () => {});
}

/** Tests only. */
export function resetEarlyGas(): void {
  asked = false;
  held = null;
}
