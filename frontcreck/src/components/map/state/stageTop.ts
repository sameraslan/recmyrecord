/** CSS px at the top of the map canvas that the site header covers. 0 today: the stage, and the canvas with
 * it, starts below the header (styles/shell.css `.stage { top: var(--hdr) }`). When the stage is extended under
 * the header (Trifid plan part 3), that task calls setStageTop with the header's height, and the region names,
 * their chrome rectangles and the star glints keep below the header with no other change. A plain module-level
 * value, like state/overlayEls.ts, so the per-frame drivers read it without reading layout. */
let stageTop = 0;

export function getStageTop(): number {
  return stageTop;
}

export function setStageTop(px: number): void {
  stageTop = Number.isFinite(px) && px > 0 ? px : 0;
}
