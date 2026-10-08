/** CSS px at the top of the map canvas that the site header covers. The map pane, and the canvas in it, run
 * under the header (styles/map.css `.map-pane`), and MusicMap calls setStageTop with the header's height, the
 * camera's `MapInput.insetTop`, so the star glints keep below the header. 0 until then. A plain module-level
 * value, like state/overlayEls.ts, so the per-frame drivers read it without reading layout. */
let stageTop = 0;

export function getStageTop(): number {
  return stageTop;
}

export function setStageTop(px: number): void {
  stageTop = Number.isFinite(px) && px > 0 ? px : 0;
}
