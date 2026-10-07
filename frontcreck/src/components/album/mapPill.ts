/**
 * Whether the phone's floating Map button is hidden: while the inline map strip (its preview and its "Open map"
 * row) is on screen, the list already offers the map there. In map mode the same button is the List button, the
 * only way back, and always shows.
 */
export function mapPillHidden({ mapMode, stripInView }: { mapMode: boolean; stripInView: boolean }): boolean {
  return !mapMode && stripInView;
}
