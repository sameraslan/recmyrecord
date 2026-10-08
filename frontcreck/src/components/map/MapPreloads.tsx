import { preload } from 'react-dom';
import { PRELOADED_GAS_URL } from '@/lib/data/early';
import { THEME_URL } from '@/lib/data/theme';

/**
 * Preload links in the server HTML for what the map draws its first picture from, so the browser asks for all of
 * it while the page's scripts are still on their way, not one file after another once they have run.
 *
 * `as: 'fetch'` with `crossOrigin: 'anonymous'` is the request the page later makes with fetch() (CORS mode,
 * same-origin credentials: lib/data/client.ts fetchJson, lib/data/early.ts), so each file is downloaded once; any
 * other pairing is a second download and a console warning. Low priority: the page's own styles, fonts and scripts
 * go first, as they did when these files were asked for after first paint.
 *
 * The nebula image is the default stop's (every page is served for it), named by the hash `npm run theme` wrote
 * into theme.generated.ts. A build that serves another data set (RMR_DATA_DIR) has other images, so it gets no
 * link for one, and lib/data/early.ts then starts nothing.
 */
export function MapPreloads() {
  const hint = { as: 'fetch', crossOrigin: 'anonymous', fetchPriority: 'low' } as const;
  // The largest first: the album list is what the map waits for longest.
  preload('/data/albums.json', hint);
  preload('/data/positions.json', hint);
  preload(THEME_URL, hint);
  if (!process.env.RMR_DATA_DIR) preload(PRELOADED_GAS_URL, hint);
  preload('/data/vocab.json', hint);
  return null;
}
