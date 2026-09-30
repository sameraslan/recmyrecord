import type { AlbumId, Focus, MapCamera, StopId } from '@/lib/types';
import type { MapData } from './data';

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
  /** Home, About, 404: low contrast, no pointer input. */
  dimmed: boolean;
  /** CSS px covered by the album panel on the left; the map re-centres on the rest. */
  insetLeft: number;
  framePadding: MapPadding;
}

export interface MapCallbacks {
  /** Pointer hover (after the 80 ms settle) or marker hover; null when it ends. */
  onHover: (id: AlbumId | null) => void;
  /** Click or tap on an album. */
  onPick: (id: AlbumId) => void;
  /** Click or tap on empty map. */
  onEmpty: () => void;
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
  /** Fit the focus (seed and visible recs, at the target stop) inside the padded visible area. */
  frameFocus: (animate?: boolean) => void;
  getCamera: () => MapCamera;
  setCamera: (camera: MapCamera, animate?: boolean) => void;
  /** Client (viewport) coordinates of an album at the current positions, or null. */
  screenPoint: (id: AlbumId) => { x: number; y: number } | null;
  isAnimating: () => boolean;
}

export interface MusicMapProps {
  data: MapData;
  input: MapInput;
  callbacks: MapCallbacks;
  /** Applied once after the first framing, e.g. the saved Explore camera. */
  initialCamera: MapCamera | null;
  onApi: (api: MapApi | null) => void;
}
