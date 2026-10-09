import type { MapPadding } from './types';

/**
 * The paddings of the map's framings, in CSS px. MapStage passes them to the map; the stand-in nebula of the first
 * paint (overlays/GasPlaceholder.tsx) is placed with the same numbers, so it sits where the map will draw.
 */

/** Space kept between framed albums and the top of the phone slider panel. */
export const PHONE_SLIDER_MARGIN_PX = 4;
/** CSS px the phone slider panel covers from the bottom of the map before it is first measured, and on phone
 * views without it (its 12 px offset plus its 152.5 px height, without a safe-area inset). */
export const PHONE_SLIDER_COVER_FALLBACK_PX = 165;

/** Album framing: clear of the slider panel (top-left on desktop, bottom on phones, where the bottom is measured). */
export const DESKTOP_PADDING: MapPadding = { top: 262, right: 96, bottom: 90, left: 96 };
export const PHONE_PADDING: MapPadding = { top: 80, right: 60, bottom: PHONE_SLIDER_COVER_FALLBACK_PX + PHONE_SLIDER_MARGIN_PX, left: 60 };
/** Overview framing of the whole cloud (mockup fitTarget); on phones clear of the bottom slider. */
// The mockup's fitTarget fits h - 170 and shifts the cloud up 30 px: top 85 - 30, bottom 85 + 30.
export const DESKTOP_FIT_PADDING: MapPadding = { top: 55, right: 40, bottom: 115, left: 40 };
// Phone: clear of the bottom slider panel (bottom measured).
export const PHONE_FIT_PADDING: MapPadding = { top: 90, right: 40, bottom: PHONE_SLIDER_COVER_FALLBACK_PX + PHONE_SLIDER_MARGIN_PX, left: 40 };
