import type { ThemeData } from '@/lib/data/theme';
import type { AlbumId, Focus, MapCamera, StopId } from '@/lib/types';
import type { MapData } from './data';
import type { View } from '@/lib/url-state';

/** The header's two heights, the values of `MapInput.insetTop` (defined in lib/media.ts, which says why). */
export { HEADER_NARROW_PX, HEADER_PX } from '@/lib/media';

/** CSS px kept clear around the framed albums, inside the visible map area. */
export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Everything the app tells the map. MapStage builds it from the route and the app store. */
export interface MapInput {
  stop: StopId;
  focus: Focus | null;
  hot: AlbumId | null;
  selected: AlbumId | null;
  interactive: boolean;
  /** The route is /map (Explore): the one view that opens at the Overview (state/view.ts openingKind). */
  explore: boolean;
  /** Home, About, 404: low contrast, no pointer input. */
  dimmed: boolean;
  /** CSS px covered by the album panel on the left; the map re-centres on the rest. */
  insetLeft: number;
  /** CSS px of the canvas covered by the header along the top. `camera.position` is drawn at the centre of what is
   * below it (and right of `insetLeft`), and every fit, marker and label stays inside that area. */
  insetTop: number;
  /** Album framing, inside the visible map (below the header, right of the album panel): clear of the slider panel
   * (top-left on desktop, bottom on phones, where the bottom is measured). */
  framePadding: MapPadding;
  /** CSS px kept clear around the whole cloud in the overview (clear of the header, slider and hint). */
  fitPadding: MapPadding;
  /** CSS px covered by a full-width panel along the bottom (the phone slider): focus markers stay above it. */
  bottomCover: number;
}

export interface MapCallbacks {
  /** Pointer hover (after the 80 ms settle) or marker hover; null when it ends. */
  onHover: (id: AlbumId | null) => void;
  /** Click or tap on an album. */
  onPick: (id: AlbumId) => void;
  /** Click or tap on empty map. */
  onEmpty: () => void;
  /** The WebGL context was lost and not restored within a few seconds. */
  onContextLost: () => void;
}

export interface MapApi {
  /** Animated zoom around the centre of the visible area. */
  zoomBy: (factor: number) => void;
  /** Instant pan by CSS px: positive dx moves the view right, positive dy moves it up. */
  panBy: (dx: number, dy: number) => void;
  /** Focus framing when focused, else the selected album, else the whole cloud. */
  reset: () => void;
  /** Fly to an album and zoom until covers show. */
  flyTo: (id: AlbumId) => void;
  /** Glide (or jump, with `animate` false) to the framing /map opens at: the Overview, or the Whole map where
   * state/view.ts openingKind says so. */
  opening: (animate?: boolean) => void;
  /** On a route change to `to`. Arriving at a page (Home, About, 404) while the camera is still the Overview the map
   * opened at (or the glide to it is running) and nothing the visitor did moved it: true, keep no Explore camera; on
   * Home it also glides to the Whole map (Home's own framing). Otherwise false and the camera stays. */
  homeBackdrop: (to: View) => boolean;
  /** Fit the focus (seed and visible recs, at the target stop) inside the padded visible area. */
  frameFocus: (animate?: boolean) => void;
  getCamera: () => MapCamera;
  /** Where the camera tween under way will land, or null when none is running. */
  getTarget: () => MapCamera | null;
  setCamera: (camera: MapCamera, animate?: boolean) => void;
  /** Client (viewport) coordinates of an album at the current positions, or null. */
  screenPoint: (id: AlbumId) => { x: number; y: number } | null;
  isAnimating: () => boolean;
}

export interface MusicMapProps {
  data: MapData;
  /** Null while the theme loads and when there is none: the map then shows plain sky. */
  theme: ThemeData | null;
  input: MapInput;
  callbacks: MapCallbacks;
  /** Applied once after the first framing, e.g. the saved Explore camera. */
  initialCamera: MapCamera | null;
  onApi: (api: MapApi | null) => void;
}
