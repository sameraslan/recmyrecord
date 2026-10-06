import { useAppStore } from '@/lib/store';

/** Whether the map's region names are shown: remembered on this device, on by default.
 *
 * Only the map's own chunk loads this module (through overlays/NamesToggle.tsx), so none of it is first-load
 * code: the app store has the `namesOn` flag and nothing else. Whatever shows or sets the names must be in that
 * chunk too, and change the flag through `setNamesOn`. */
export const NAMES_KEY = 'rmr-names';

/** Only an exact '0' means off; a missing value, junk or blocked storage all mean on. */
export function readNamesOn(): boolean {
  try {
    return window.localStorage.getItem(NAMES_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeNamesOn(on: boolean): void {
  try {
    window.localStorage.setItem(NAMES_KEY, on ? '1' : '0');
  } catch {
    // storage can be blocked; the choice then lasts for this page load only
  }
}

/** Shows or hides the names and saves the choice. An unchanged choice tells no one and writes nothing. */
export function setNamesOn(on: boolean): void {
  if (useAppStore.getState().namesOn === on) return;
  useAppStore.setState({ namesOn: on });
  writeNamesOn(on);
}

// The saved choice, applied when the map's chunk loads: before the map, the toggle or any name first renders, and
// long after hydration (nothing on the server or in the first client render depends on it). The store starts on,
// so only a saved "off" changes anything.
if (typeof window !== 'undefined' && !readNamesOn()) useAppStore.setState({ namesOn: false });
