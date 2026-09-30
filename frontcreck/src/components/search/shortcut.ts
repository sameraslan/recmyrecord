export interface SearchTarget {
  el: () => HTMLElement | null;
  focus: () => void;
}

const targets: SearchTarget[] = [];
let listening = false;

function isShown(el: HTMLElement | null): boolean {
  if (!el || el.getClientRects().length === 0) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range'))) return;
  for (let i = targets.length - 1; i >= 0; i--) {
    if (isShown(targets[i].el())) {
      e.preventDefault();
      targets[i].focus();
      return;
    }
  }
}

/** `/` focuses the most recently registered visible search field (spec 4.5). */
export function registerSearchTarget(target: SearchTarget): () => void {
  targets.push(target);
  if (!listening) {
    document.addEventListener('keydown', onKeyDown);
    listening = true;
  }
  return () => {
    const i = targets.indexOf(target);
    if (i >= 0) targets.splice(i, 1);
  };
}
