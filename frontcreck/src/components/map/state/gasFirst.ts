/** Whether the map is still waiting for its first gas image. The region names read it and stay hidden until the
 * nebula is on screen: lettering over an empty sky has a halo solved for gas that is not there yet, and on a
 * software renderer rasterising 17 haloed names in the map's first frame held the first gas upload back by a
 * fifth of a second (the upload waits behind a GPU fence, canvas/GasField.tsx whenGpuDone). A plain module-level
 * bridge between GasField and state/namesPlacer.ts, like state/overlayEls.ts; both sit in the lazy map chunk.
 *
 * Not awaited at all when no gas begins to load (no theme, or a GPU whose textures are too small): the names are
 * placed at once. Settled by the first image going in, by its failing or being refused (plain sky), and, so that
 * the names can never stay hidden, by NAMES_GAS_WAIT_MS passing. */

/** The longest the names wait for the first gas image, from the moment the gas begins to load, ms. Normally the
 * image is in within about a third of a second of the map's first frame. The gas itself lets its first upload
 * wait up to GAS_FIRST_UPLOAD_CAP_MS (1.5 s) for the GPU; a second more covers the fetch and decode of a file
 * that is already on its way. On a slower connection the names then show over the stars alone, as they did
 * before they waited. */
export const NAMES_GAS_WAIT_MS = 2500;

let waiting = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function clear(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/** True while the gas is loading its first image and the names should not show yet. */
export function gasFirstPending(): boolean {
  return waiting;
}

/** The gas began to load. `giveUp` is called if nothing is settled within NAMES_GAS_WAIT_MS (the wait is over
 * by then): it places the names without a map frame. */
export function gasFirstBegin(giveUp: () => void): void {
  clear();
  waiting = true;
  timer = setTimeout(() => {
    timer = null;
    waiting = false;
    giveUp();
  }, NAMES_GAS_WAIT_MS);
}

/** The first image is settled (in, or given up as plain sky), or the gas is gone. The caller draws the frame
 * that shows the gas, and the names are placed by that frame. */
export function gasFirstEnd(): void {
  clear();
  waiting = false;
}
