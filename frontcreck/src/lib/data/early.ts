import { gasUrl } from '@/lib/data/theme';
import { THEME_BAKE } from '@/lib/data/theme.generated';
import { markOnce } from '@/lib/marks';
import type { StopId } from '@/lib/types';

/**
 * The nebula image of the stop a page opens on, asked for and decoded while the rest of the map is still on its
 * way (the map's code, WebGL, the positions). The map's gas layer takes it over when it mounts
 * (components/map/canvas/GasField.tsx) instead of starting its own download then.
 *
 * Its address must be known before theme.json is in: it is built from the hashes `npm run theme` writes into
 * theme.generated.ts. A build that serves another data set (RMR_DATA_DIR) has other images: there
 * process.env.RMR_EARLY_GAS is empty (next.config.ts), nothing starts here, and the gas layer loads its images
 * as before.
 *
 * It is asked for by the page's script (components/map/boot.ts decides when), not by a preload link in the HTML:
 * a preload starts with the page's own scripts and at their priority, and on a slow connection took bandwidth
 * from them; Home's search field was usable 0.8 s later for it (measured, issue 78).
 */

/** How a gas image is decoded, off the main thread. The alpha channel is data (what the dust lets through), so it
 * must not be multiplied into the colour: premultiplyAlpha "none", and never a 2D canvas. */
export const GAS_BITMAP: ImageBitmapOptions = { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };

/** The first gas image of a stop, as the committed theme names it. */
export const bakedGasUrl = (stop: StopId): string => gasUrl(stop, THEME_BAKE.stops[stop].hash);

let asked = false;
let held: { url: string; bitmap: Promise<ImageBitmap> } | null = null;

async function fetchBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Read as bytes, not with res.blob(): Chrome's blob() failed ("Failed to fetch") on a response that had taken
  // over a download already under way, on every slow phone-sized load, while reading the bytes worked. Nothing
  // starts this download ahead of this request any more, but the bytes are the safe way; the copy is 0.2 MB.
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
  if (!process.env.RMR_EARLY_GAS) return;
  markOnce('rmr-gas-fetch');
  const url = bakedGasUrl(stop);
  const bitmap = fetchBitmap(url);
  // Whoever takes the image hears of a failure; one that nobody takes must not be an unhandled rejection.
  bitmap.catch(() => {});
  held = { url, bitmap };
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
