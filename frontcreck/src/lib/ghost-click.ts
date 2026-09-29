/** After a touch selection made on pointerup, the browser still fires a click at the same spot, which can
 * land on whatever the selection revealed (a card button, a row). Swallow that one click, but disarm on the
 * next pointerdown so a fast real second tap is never lost. */
const RADIUS_PX = 12;
const WINDOW_MS = 700;
let armed: { x: number; y: number; until: number } | null = null;
let installed = false;

function onPointerDown(): void {
  armed = null;
}

function onClick(e: MouseEvent): void {
  if (!armed) return;
  const hit = performance.now() <= armed.until && Math.abs(e.clientX - armed.x) <= RADIUS_PX && Math.abs(e.clientY - armed.y) <= RADIUS_PX;
  armed = null;
  if (hit) {
    e.preventDefault();
    e.stopPropagation();
  }
}

export function suppressGhostClick(x: number, y: number): void {
  if (!installed) {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    installed = true;
  }
  armed = { x, y, until: performance.now() + WINDOW_MS };
}
