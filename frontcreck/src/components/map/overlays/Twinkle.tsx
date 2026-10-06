'use client';

import { setOverlayEl } from '../state/overlayEls';
import type { ViewBounds } from '../state/projection';
import { glintBackground, type Glint, type GlintHandle } from '../state/twinkle';

/** The star glints' layer: over the map canvas and under the region names. Empty as far as React knows;
 * TwinkleDriver adds and removes the glints itself (two nodes each, at most three glints at once). Decoration
 * only: hidden from assistive technology, and nothing in it takes pointer events (styles/map.css). */
export function TwinkleLayer() {
  return (
    <div
      className="tw-layer"
      aria-hidden="true"
      ref={(el) => {
        setOverlayEl('twinkle', el);
      }}
    />
  );
}

/** Every surface the stylesheet makes glass (a blur of what is behind it): the selector list of the one rule
 * that uses --glass-blur, in styles/shell.css. overlays/Twinkle.test.tsx fails when the two differ. On a phone
 * the same surfaces are solid; a glint is kept from under them all the same. */
export const TWINKLE_GLASS = '.top, .panel, .album, .map-zoom button, .map-names, .map-msg, .about, .combo--hero .combo-field, .fab-map--on';

/** The glass surfaces that lie over the glint layer, as rectangles in the layer's own CSS px (the map canvas's:
 * the layer covers it exactly). This reads layout (one box per surface, about ten), so it is called only when a
 * glint is about to be made: on the timer's tick, at most once every 1.2 s, never in a frame and never on the
 * pointer's path. It is measured each time and not kept, because what it depends on has no single signal: the
 * window's size, the route, the album panel sliding, the picked album's card, the message boxes and the phone's
 * list button all move or come and go, some from another React root and some by CSS alone. At rest the page's
 * layout is clean, so the read computes nothing new. `root` is the document. */
export function glassRects(layer: HTMLElement, root: ParentNode = document): ViewBounds[] {
  const o = layer.getBoundingClientRect();
  const out: ViewBounds[] = [];
  for (const el of root.querySelectorAll(TWINKLE_GLASS)) {
    const r = el.getBoundingClientRect();
    // Not laid out, or nowhere over the layer.
    if (r.width <= 0 || r.height <= 0 || r.right <= o.left || r.left >= o.right || r.bottom <= o.top || r.top >= o.bottom) continue;
    out.push({ left: r.left - o.left, top: r.top - o.top, right: r.right - o.left, bottom: r.bottom - o.top });
  }
  return out;
}

/** Puts one glint in the layer: a positioned <i> the size of the bloom, centred on the star, holding one <b>
 * that the CSS keyframe `tw-glint` animates (opacity and transform only); the flare is the <b>'s two
 * pseudo-elements. Nothing is read from layout or style: the writes are one appendChild with inline styles and,
 * later, one remove(). `ended` is called when the animation ends.
 *
 * The centre is moved to the nearest point half a CSS px off a device pixel edge (at most half a device pixel
 * from the star): the flare's arms are 1 CSS px thick and cross at the centre, so anywhere else an arm is spread
 * over two rows or columns at half strength, and the two arms differ from glint to glint. */
export function addGlint(layer: HTMLElement, glint: Glint, ended: () => void, dpr: number = window.devicePixelRatio || 1): GlintHandle {
  const el = document.createElement('i');
  const dot = document.createElement('b');
  el.className = 'tw';
  // Which album's star this sits on (browser tests check the glint is centred on it).
  el.dataset.album = String(glint.index);
  const cx = Math.round((glint.x - 0.5) * dpr) / dpr + 0.5;
  const cy = Math.round((glint.y - 0.5) * dpr) / dpr + 0.5;
  el.style.transform = `translate(${(cx - glint.radius).toFixed(2)}px,${(cy - glint.radius).toFixed(2)}px)`;
  el.style.width = `${(2 * glint.radius).toFixed(2)}px`;
  el.style.height = `${(2 * glint.radius).toFixed(2)}px`;
  dot.style.background = glintBackground(glint.rgb);
  dot.style.setProperty('--peak', glint.peak.toFixed(2));
  if (glint.flare !== null) {
    dot.className = 'tw-flare';
    dot.style.setProperty('--fl', `${glint.flare.toFixed(1)}px`);
  }
  dot.style.animationDuration = `${glint.durMs}ms`;
  dot.addEventListener('animationend', ended);
  el.appendChild(dot);
  layer.appendChild(el);
  return { durMs: glint.durMs, remove: () => el.remove() };
}
