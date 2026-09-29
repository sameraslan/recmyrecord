import { create } from 'zustand';
import { pushTrail, readTrail, writeTrail } from '@/lib/trail';
import { DEFAULT_STOP } from '@/lib/types';
import type { AlbumId, Ambient, Focus, MapCamera, StopId, TrailItem } from '@/lib/types';

export type WebglStatus = 'unknown' | 'ok' | 'unavailable';

export interface AppState {
  /** Similarity stop shared by the slider, the map morph and the album list. */
  stop: StopId;
  /** Album view: the seed and the visible recommendations the map highlights. */
  focus: Focus | null;
  /** Album hovered or focused in the list or on the map (two-way link). */
  hot: AlbumId | null;
  /** Explore view: album shown in the map card. */
  selected: AlbumId | null;
  /** Camera saved when leaving Explore, restored when coming back (close / Escape). */
  exploreCamera: MapCamera | null;
  /** Phone album view: full-screen map instead of the list. */
  mapMode: boolean;
  /** CSS px of the map covered by the album panel on the left (0 when there is none). */
  panelInset: number;
  webgl: WebglStatus;
  /** Ambient colours of the current album, null outside album view. */
  ambient: Ambient | null;
  trail: TrailItem[];
  toast: { message: string; id: number } | null;
  setStop: (stop: StopId) => void;
  setFocus: (focus: Focus | null) => void;
  setHot: (id: AlbumId | null) => void;
  setSelected: (id: AlbumId | null) => void;
  saveExploreCamera: (camera: MapCamera | null) => void;
  setMapMode: (on: boolean) => void;
  setPanelInset: (px: number) => void;
  setWebgl: (status: WebglStatus) => void;
  setAmbient: (ambient: Ambient | null) => void;
  visit: (item: TrailItem) => void;
  showToast: (message: string) => void;
  clearToast: () => void;
}

function sameFocus(a: Focus | null, b: Focus | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.seed !== b.seed || a.recs.length !== b.recs.length) return false;
  return a.recs.every((r, i) => r === b.recs[i]);
}

let toastSeq = 0;

export const useAppStore = create<AppState>()((set) => ({
  stop: DEFAULT_STOP,
  focus: null,
  hot: null,
  selected: null,
  exploreCamera: null,
  mapMode: false,
  panelInset: 0,
  webgl: 'unknown',
  ambient: null,
  trail: [],
  toast: null,
  setStop: (stop) => set((s) => (s.stop === stop ? s : { stop })),
  setFocus: (focus) => set((s) => (sameFocus(s.focus, focus) ? s : { focus })),
  setHot: (hot) => set((s) => (s.hot === hot ? s : { hot })),
  setSelected: (selected) => set((s) => (s.selected === selected ? s : { selected })),
  saveExploreCamera: (exploreCamera) => set({ exploreCamera }),
  setMapMode: (mapMode) => set((s) => (s.mapMode === mapMode ? s : { mapMode })),
  setPanelInset: (panelInset) => set((s) => (s.panelInset === panelInset ? s : { panelInset })),
  setWebgl: (webgl) => set((s) => (s.webgl === webgl ? s : { webgl })),
  setAmbient: (ambient) => set((s) => (s.ambient?.join() === ambient?.join() ? s : { ambient })),
  visit: (item) =>
    set((s) => {
      const trail = pushTrail(s.trail.length ? s.trail : readTrail(), item);
      writeTrail(trail);
      return { trail };
    }),
  showToast: (message) => set({ toast: { message, id: ++toastSeq } }),
  clearToast: () => set({ toast: null }),
}));

if (typeof window !== 'undefined') {
  window.__rmr = { ...window.__rmr, getState: useAppStore.getState };
}
