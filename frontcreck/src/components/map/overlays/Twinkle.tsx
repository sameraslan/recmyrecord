'use client';

import { setOverlayEl } from '../state/overlayEls';
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

/** Puts one glint in the layer: a positioned <i> the size of the bloom, centred on the star, holding one <b>
 * that the CSS keyframe `tw-glint` animates (opacity and transform only); the flare is the <b>'s two
 * pseudo-elements. Nothing is read from layout or style: the writes are one appendChild with inline styles and,
 * later, one remove(). `ended` is called when the animation ends. */
export function addGlint(layer: HTMLElement, glint: Glint, ended: () => void): GlintHandle {
  const el = document.createElement('i');
  const dot = document.createElement('b');
  el.className = 'tw';
  // Which album's star this sits on (browser tests check the glint is centred on it).
  el.dataset.album = String(glint.index);
  el.style.transform = `translate(${(glint.x - glint.radius).toFixed(2)}px,${(glint.y - glint.radius).toFixed(2)}px)`;
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
