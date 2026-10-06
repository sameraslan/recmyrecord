/** Whether the map's region names are shown: remembered on this device, on by default. */
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
