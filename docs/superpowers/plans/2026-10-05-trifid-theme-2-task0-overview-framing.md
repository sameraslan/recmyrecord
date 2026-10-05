# Trifid Theme Part 2, Task 0: `/map` opens at the approved Overview framing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this task step by step. Steps use checkbox (`- [ ]`) syntax for tracking.

This is the new first task of part 2 (`2026-10-04-trifid-theme-2-stars-lines-names.md`). Run it before part 2's Task 1. Part 2's Global Constraints apply here unchanged (machine rules, `Refs #45`, push after review, never loosen a test, the gas shader in tests, the canvas at rest). Where this file and the build handoff (`2026-10-04-trifid-theme-build-handoff.md`) disagree, the handoff wins.

**The ruling (handoff, "Rules that changed", and ruling 9).** `/map` opens at the approved Overview framing: gas filling the screen, as in `docs/design/trifid-theme/options/final-overview.jpg`, the prototype's default view. The fit button gives the Whole map (`final-whole.jpg`). Today's site opens on the whole cloud. Cost if wrong: one constant to reverse (`MAP_OPENS_AT` below).

**Goal:** the first view of `/map` is the prototype's Overview; the fit button, the `0` key, the zoom-out floor, the idle nudge and every album route keep today's behaviour; the tests, the perf script and the capture scripts say which framing they measure, and every comparison with the baseline stays like for like.

**Tracking issue:** 45. **Pull request:** 47. Before every push: `git fetch origin && git rebase origin/feat/trifid-theme` (two sessions push to this branch, handoff update of 2026-10-05); never force push.

All commands start from the worktree root and set the PATH themselves:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
node -p process.arch   # must print arm64
```

---

## What the prototype does (read from the code)

| What | Where | Rule |
|---|---|---|
| Whole map | `docs/design/trifid-theme/prototype/src/camera.js` L20-26 `Cam.fitWhole` | every album of the stop inside the visible area less `FIT_PAD` (`src/config.js` L33: top 55, right 40, bottom 115, left 40); on a phone the free rectangle with 16 px sides. The app's `fitView` (`frontcreck/src/components/map/state/bounds.ts` L90-106) with `DESKTOP_FIT_PADDING` (`MapStage.tsx` L41) is the same rule on desktop. |
| Overview | `camera.js` L27-34 `Cam.fitOverview` | `ppw = max(whole.ppw, min((W - inset - 48) / (x99 - x1), (BAND_B - 0.5) / coverWorld))`; centre `x = (x1 + x99) / 2`, `y = medY + (free.top - free.bottom) / 2 / ppw` (free is null on desktop, so `y = medY`). `x1`, `x99`, `medY` are the 1st and 99th percentile of x and the median of y of the stop's world positions (`src/data.js` L116-123, quantile rule `sorted[floor(q * (n - 1))]`, L7). |
| The 12.5 px cap | `camera.js` L30-31; `src/config.js` L24 `BAND_B: 13`; `COVER_WORLD` 0.0068 (L19) | Overview is capped at 12.5 px covers, "just under the zoom where names start to fade, so Overview is always in band B". In the app: `NAMES_BAND_PX - 0.5` (`frontcreck/src/components/map/theme.ts` L16) over `COVER_WORLD` (`state/zoomLimits.ts` L27) = 1838.235 px per world unit. It is also under `ATLAS_LOAD_PX` 13 (`zoomLimits.ts` L34), so the opening view never fetches a cover sheet. |
| Opening | `src/app.js` L113 | first load: Home and About open on the whole map, the map on the Overview (`fit=whole` in the hash starts the map on the whole map, `README.md` L65). |
| Home or About to the map | `src/app.js` L118 | lands on the Overview. |
| Fit button | `src/app.js` L228-233 `framed`, `RMR.fit`; `UX.md` L22-23 | the prototype's button goes to Overview, and from Overview to Whole map. **The owner's ruling differs: the fit button gives the Whole map.** This task follows the ruling (open question 1). |
| Resize | `src/app.js` L436-437 | a framed view is framed again with the same kind; a visitor's own pan and zoom are kept. |
| Names zoom reference | `src/app.js` L82, L444 `ppwOverview`; `src/labels.js` L112; `src/stars.js` L79-82 | names grow with `clamp((ppw / ppwOverview) ^ 0.3, 0.85, 1.35)`; star sizes are relative to `dot(12.5)`, the desktop Overview cap. Part 2 already fixes the app's reference at 12.5 px covers (part 2 L2257). |
| Phone | `src/app.js` L71 (`narrow` under 900 px), L156-170 `measure()` | the free rectangle on the map is from the top of the stage (`top: 0`) to the slider panel's top (`bottom` = the panel's cover, safe area included). The app's `MapInput.bottomCover` (`MapStage.tsx` L187, L209) is that same number on a phone and 0 on desktop. |

## The scales on the app's own positions

Computed with plain `node` on `frontcreck/public/data/positions.json` (read only) through the app's `positionsTransform` / `normalizePositions` (`frontcreck/src/components/map/data.ts` L37-68, `tx = { cx: -0.269, cy: 0.154, s: 0.5795574 }`), the prototype formula above and the app's `fitView`. Canvas sizes are the stage below the header: 1440 x 836 for the 1440 x 900 window of the tests, perf and captures (`--hdr` 64 px, `globals.css` L33), 390 x 784 for the 390 x 844 phone (`--hdr` 60 px, L45). Phone bottom cover 165 px (`PHONE_SLIDER_COVER_FALLBACK_PX`; the measured panel is 164.5 px in the test browser).

| Window, stop | Whole map px/world (zoom) | Overview px/world (zoom) | Overview covers | Overview / whole | Overview camera (x, y) | Capped at 12.5 px |
|---|---|---|---|---|---|---|
| 1440 x 900, Balanced (the default) | 596.653 (0.78507) | **1639.476 (2.15721)** | 11.148 px | 2.75 | (0.033325, 0) | no |
| 1440 x 900, Sonic | 708.479 (0.93221) | 1534.717 (2.01937) | 10.436 px | 2.17 | (0.050132, -0.020864) | no |
| 1440 x 900, Mood | 618.156 (0.81336) | 1838.235 (2.41873) | 12.500 px | 2.97 | (0.050711, -0.017387) | yes |
| 390 x 844, Balanced | 267.847 (0.37581) | **402.802 (0.56516)** | 2.739 px | 1.50 | (0.033325, -0.204815) | no |
| 390 x 844, Sonic | 286.498 (0.40197) | 377.064 (0.52904) | 2.564 px | 1.32 | (0.050132, -0.239660) | no |
| 390 x 844, Mood | 487.285 (0.68369) | 584.842 (0.82057) | 3.977 px | 1.20 | (0.050711, -0.158450) | no |
| 1600 x 1000 (the approved pictures), Balanced | 686.2 | 1827.9 | 12.43 px | 2.66 | | no |

Percentile inputs, Balanced: `x1 = -0.3912012577`, `x99 = 0.4578503668`, `medY = 0` (the transform centres the Balanced median on 0).

What follows from these numbers (each is a check in this task or a note downstream):

- **Names.** Every Overview above is under 13 px covers (1,911.8 px per world unit), so names show at the opening view on every stop. At 1440 x 900 Balanced the Overview is 1639.5 px per world unit, above `NAME_LUM_PX_PER_WORLD` 600 (part 2 Task 5), so an unmoved name at rest on desktop takes the solved halo there; the Whole map (596.7) stays just under 600 and keeps the full halo. The names zoom factor at the desktop Overview is `clamp((11.148 / 12.5) ^ 0.3, 0.85, 1.35) = 0.966`.
- **Stars and dots.** `dotCssPx` at the desktop Overview is `1.8 + 11.148 / 3.15 = 5.34 px` (part 2's `DOT_AT_OVERVIEW` reference is the cap, 5.77 px). Phone: 3 px (the floor).
- **Atlases.** 12.5 px is under `ATLAS_LOAD_PX` 13: the opening view requests no cover sheet (`e2e/map.spec.ts` "renders on demand" keeps asserting it).
- **The idle nudge.** `CameraBounds` (`canvas/CameraBounds.tsx` L101-117) nudges an idle camera whose view covers under 25 percent of the whole cloud's box and that sits outside the box padded by 0.04. The Overview covers 0.347 of the box at 1440 x 900 Balanced (0.245 to 1.0 across the window sizes checked: 1920 x 1080, 2560 x 1440, 1366 x 768, 1024 x 768, 900 x 600, 360 x 640, 430 x 932, 844 x 390 landscape phone, 768 x 1024), and its centre is always inside the padded box, so `nudgeVector` returns null: the opening view is never nudged. A unit test pins this on the real positions.
- **The sharper gas image.** Part 1 fetches a stop's sharper image when the map shows more px per raw unit than the first image has texels (`gasSharpWanted`, `shaders/gas.ts` L293-296; `u_ppr = ppw * tx.s`, `GasField.tsx` L993). Balanced's first image has 1803 / 2.577 = 699.7 texels per raw unit. The desktop Overview is 1639.5 * 0.5796 = 950.2 px per raw unit, so **on an ordinary desktop with a GPU the opening view now fetches the sharper image** (818,584 bytes for Balanced) about a second after the map settles, and fades it in over up to 14 frames. The Whole map (345.8) never asked for it. Phones, tablets and software renderers never fetch it (part 1). Every script and test that counts frames or shoots at rest below waits for it to settle.
- **Gas filling the screen.** Read from Balanced's first gas image with `sharp`, mapped through the camera: at the Overview every point of the 4 x 3 grid that `gas.spec.ts` uses for its pictures (x from 260 to 1180, y from 220 to 690) lands on gas (image luma 55 to 169 of 255); at the Whole map 6 of the 12 land on bare sky or off the image. Step 13's browser test reads the screen for the same thing.

## Global constraints for this task

- **Album positions never move.** Nothing here touches `positions.json`, `normalizePositions`, `interpolateInto` or any layout. Only the camera's first framing changes.
- **The canvas does not redraw at rest.** The opening framing is applied in `InitialFrame`'s layout effect before the first frame, as today's snap is. The one new camera move (Home, About or 404 to the map, Step 9) is an ordinary 420 ms tween that ends. No timer, no loop, no `invalidate()` at rest.
- **No new site copy.** No string in `src/lib/copy.ts` changes. The fit button keeps its label "Reset view" (`COPY.map.reset`, `copy.ts` L71). It now leads somewhere other than the view the map opened on; whether the label should say so is for the owner (open question 2). Do not change it here.
- **Tap targets.** No control is added or resized; part 3's phone checks (`e2e/phone.spec.ts` "tap targets are at least 44 px") cover the opening view as before (it loads `/map` and taps an album on it).
- **The old opening stays reproducible.** One constant (`MAP_OPENS_AT`) switches the app back. One test switch (`window.__rmrOpen = 'whole'`, set before the map loads, like part 1's `__rmrGasLite`) opens a single page at the Whole map; the baseline's capture and hover scripts default to it so their shots and timings stay comparable with `docs/design/trifid-theme/reviews/baseline/`.
- **Budgets do not change.** `frontcreck/scripts/perf/budgets.json` is not edited. Budget checks still read the same keys, measured where the baseline measured them (the whole map).
- **The baseline folder is a record.** Its shots, perf files and README are not edited. Its two scripts gain flags whose defaults reproduce what they measured, plus one new capture state with new file names.
- **First-load JS.** The one first-load change is one boolean in `MapStage`'s input (`explore`) and one `useRef` with a few lines in `MapStage` (Step 9). Everything else lands in the lazy map chunk (`state/bounds.ts`, `state/view.ts`, `canvas/*`).

---

## Task 0: `/map` opens at the approved Overview framing

**Files:**
- Modify: `frontcreck/src/components/map/state/bounds.ts` (L1-3 imports; new code after `fitView`, L106)
- Modify: `frontcreck/src/components/map/state/bounds.test.ts` (L1-13 imports; new `describe` blocks at the end)
- Modify: `frontcreck/src/components/map/state/view.ts` (new code after L59, `isFramed`)
- Modify: `frontcreck/src/components/map/state/view.test.ts` (L3 import; new `describe` blocks at the end)
- Modify: `frontcreck/src/components/map/types.ts` (`MapInput` L14-29: one field; `MapApi` L42-58: two methods)
- Modify: `frontcreck/src/components/map/state/mapStore.ts` (`DEFAULT_INPUT` L7-18: one field)
- Modify: `frontcreck/src/components/map/canvas/InitialFrame.tsx` (L8-10 imports; the snap, L99-113)
- Modify: `frontcreck/src/components/map/canvas/CameraTween.tsx` (L12 import; `reset` L107-112; new `opening` after `flyTo` L113)
- Modify: `frontcreck/src/components/map/MapStage.tsx` (input memo L197-212; the view-change layout effects L227-252)
- Modify: `frontcreck/src/types/global.d.ts` (after L46, `__rmrGasLite`)
- Modify: `frontcreck/e2e/helpers.ts` (new helpers after `tabTo`, L112)
- Create: `frontcreck/e2e/opening.spec.ts`
- Modify: `frontcreck/e2e/map.spec.ts` (L37-66, two tests)
- Modify: `frontcreck/e2e/explore.spec.ts` (L198, one test title)
- Modify: `frontcreck/e2e/gas.spec.ts` (the `beforeEach`, L25-29)
- Modify: `frontcreck/scripts/perf/perf.mjs` (flag after L35; `PAGE_HELPERS` after L124; a new `openingFlow` before L184; two insertions in `exploreFlow` L184-263; `measure()` L319-320; notes L355-360; output L363)
- Modify: `frontcreck/scripts/perf/lib.mjs` (`ROWS` L65-66) and `frontcreck/scripts/perf/lib.test.mjs` (L69-78)
- Modify: `docs/design/trifid-theme/reviews/baseline/capture.mjs` (header L13-24; flags L57-71; `settle` L177-188; a new state after `map-zoom-steps`, after L319; runner L889, L900-901)
- Modify: `docs/design/trifid-theme/reviews/baseline/hover-measure.mjs` (header L27; flags L50-60; `oneLoad` L148-160)

Line numbers are those of `feat/trifid-theme` at `71683264`. Part 1's closing session may still land a small edit in `e2e/gas.spec.ts`; find every edit below by its quoted text, not only by its line.

**Interfaces:**
- Consumes: `fitView`, `percentileBounds`, `interpolatedPositions` (`state/bounds.ts`); `pxPerWorld`, `zoomForPxPerWorld`, `COVER_WORLD`, `MAX_ZOOM` (`state/zoomLimits.ts`); `NAMES_BAND_PX` (`components/map/theme.ts`); `setOverviewFraming`, `getOverviewFraming` (`state/view.ts`, unchanged: still the Whole map).
- Produces:
  ```ts
  // frontcreck/src/components/map/state/bounds.ts
  export const OVERVIEW_SIDE_PAD_PX = 24;
  export const OVERVIEW_COVER_MAX_PX: number;          // NAMES_BAND_PX - 0.5 = 12.5
  export interface OverviewExtent { x1: number; x99: number; medY: number }
  export interface OverviewArea { width: number; height: number; insetLeft: number; bottomCover: number }
  export function overviewExtent(xy: Float32Array): OverviewExtent;
  export function fitOverview(ext: OverviewExtent, wholeZoom: number, area: OverviewArea): { zoom: number; center: { x: number; y: number } };
  export function overviewView(data: MapData, sliderT: number, area: OverviewArea, wholeZoom: number): { zoom: number; center: { x: number; y: number } };

  // frontcreck/src/components/map/state/view.ts
  export type OpeningKind = 'overview' | 'whole';
  export const MAP_OPENS_AT: OpeningKind;              // 'overview': the one constant of the ruling
  export function openingKind(input: { explore: boolean; focus: unknown }, override?: unknown): OpeningKind;
  export function setFitKind(kind: OpeningKind, camera?: CameraView | null): void;  // the framing a resize re-fits, and where it put the camera
  export function getFitKind(): OpeningKind;
  export function getFitCamera(): CameraView | null;
  export function untouchedOverview(kind: OpeningKind, fitCamera: CameraView | null, camera: CameraView): boolean;

  // frontcreck/src/components/map/types.ts
  MapInput.explore: boolean;                           // the route is /map (Explore)
  MapApi.opening: (animate?: boolean) => void;         // glide to the framing /map opens at
  MapApi.homeBackdrop: () => boolean;                  // leaving /map for Home: the Whole map if the Overview is untouched

  // window (frontcreck/src/types/global.d.ts)
  __rmrOpen?: 'whole' | 'overview';                    // test and capture switch, read when the map frames itself

  // frontcreck/e2e/helpers.ts
  export async function waitForGasSharpSettled(page: Page, quietMs = 2500): Promise<void>;  // part 2 Task 8's helper, defined here
  export interface Spread { ... }  export async function albumSpread(page: Page): Promise<Spread>;
  export function overviewMiss(s: Spread): string[];   export function wholeMapMiss(s: Spread, phone: boolean): string[];
  ```

**Naming.** In today's code "overview" means the whole-cloud fit: `OverviewFraming`, `setOverviewFraming`, `getOverviewFraming`, `releaseView`'s `overview`, `CameraTween`'s `overview()`. They keep their names and their meaning (the Whole map: the fit button, the 0.8 zoom-out floor, the idle nudge box). Renaming them would break part 3 Task 3's before/after texts (it edits `import { getOverviewFraming } from "../state/view";` in `CameraRig.tsx` and `CameraBounds.tsx` by text). This task adds a comment on `OverviewFraming` saying so, and names everything new after the prototype's Overview (`fitOverview`, `overviewView`, `OVERVIEW_*`).

**What decides the opening framing.**
- First framing of a page load (`InitialFrame`, new data): `openingKind(input, window.__rmrOpen)`. The Overview only when the route is `/map` (`input.explore`) and no album is in focus; Home, About, 404 and every `/album/...` link (desktop and phone, list and map mode) frame the Whole map first, exactly as today, and an album then frames itself as today (`FocusFramer`). The switch `__rmrOpen` overrides `MAP_OPENS_AT` only on `/map`.
- Home, About or 404 to `/map` in the same page (Step 9): when the visitor has no saved Explore camera, the map glides to the opening framing, as the prototype does (`app.js` L118). When there is one (they explored before), the camera stays where they left it, as today (`explore.spec.ts` "the hint stays hidden over covers after a trip to About and back" pins that).
- `/map` to Home with the camera untouched since the map opened at the Overview (no drag, wheel, key, button or pick has moved it; the camera still equals the one the opening framing set): the map glides back to the Whole map behind the hero (420 ms), as the prototype does (`app.js` L114) and as a fresh load of Home frames it (`final-home.jpg`), and no Explore camera is saved, so the Map link opens at the Overview again. A resize on Home then fits the Whole map. With a touched camera, Home keeps the camera as today (and it is saved for the way back). About and 404 keep the camera in every case, as today and as the prototype (its pages other than Home are a still backdrop).
- An album closed back to `/map` with no saved camera still gets `reset()`, the Whole map (today's behaviour, `MapStage.tsx` L246-252, pinned by `explore.spec.ts` "leaving an album by the header nav ... frames the whole map"). "Explore this area" still leaves the camera where it is.
- The fit button and the `0` key (`reset()`): unchanged. Focus framing beside an album, else the picked album, else the Whole map.
- A resize before the visitor has touched the map (today's rule, `InitialFrame.tsx` L102-104) re-fits whichever of the two framings was last applied: the opening one, or the Whole map once the fit button gave it.
- The URL carries no camera (`src/lib/url-state.ts` has none); there is nothing else to restore.

### Steps

- [ ] **Step 1: Write the failing unit tests for the Overview fit**

In `frontcreck/src/components/map/state/bounds.test.ts`, replace the import block L1-13:

```ts
import { describe, expect, it } from "vitest";

import type { MapData } from "../data";
import {
  cloudCenter,
  fitView,
  getCloudBounds,
  nudgeVector,
  percentileBounds,
  viewportWorldRect,
  visibleFractionThreshold,
} from "./bounds";
import { FIT_ZOOM_MAX, FIT_ZOOM_MIN } from "./zoomLimits";
```

with:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildMapData, type MapData } from "../data";
import { NAMES_BAND_PX } from "../theme";
import {
  OVERVIEW_COVER_MAX_PX,
  OVERVIEW_SIDE_PAD_PX,
  cloudCenter,
  fitOverview,
  fitView,
  getCloudBounds,
  interpolatedPositions,
  nudgeVector,
  overviewExtent,
  overviewView,
  percentileBounds,
  viewportWorldRect,
  visibleFractionThreshold,
} from "./bounds";
import { ATLAS_LOAD_PX, COVER_WORLD, FIT_ZOOM_MAX, FIT_ZOOM_MIN, pxPerWorld, zoomForPxPerWorld } from "./zoomLimits";
```

Append at the end of the file:

```ts
describe("overviewExtent", () => {
  it("reads the 1st and 99th percentile of x and the median y with the prototype's quantile rule", () => {
    // 101 points: x = 0..100 (shuffled), y = 100 - x. floor(0.01 * 100) = 1, floor(0.99 * 100) = 99, floor(0.5 * 100) = 50.
    const pts: [number, number][] = Array.from({ length: 101 }, (_, i) => [(i * 37) % 101, 100 - ((i * 37) % 101)]);
    expect(overviewExtent(flat(pts))).toEqual({ x1: 1, x99: 99, medY: 50 });
  });

  it("does not sort or change the caller's array", () => {
    const xy = flat([[3, 1], [1, 3], [2, 2]]);
    const copy = Float32Array.from(xy);
    overviewExtent(xy);
    expect(xy).toEqual(copy);
  });
});

describe("fitOverview (prototype Cam.fitOverview, camera.js L27-34)", () => {
  const ext = { x1: -0.4, x99: 0.6, medY: 0.1 };
  const area = { width: 1440, height: 836, insetLeft: 0, bottomCover: 0 };

  it("fills the width less 24 px a side with the 1st..99th percentile span, centred on it and on the median row", () => {
    const wholeZoom = zoomForPxPerWorld(500, 836);
    const v = fitOverview(ext, wholeZoom, area);
    // (1440 - 48) / 1.0 = 1392 px per world unit, under the 12.5 px cover cap (1838.2).
    expect(pxPerWorld(v.zoom, 836)).toBeCloseTo(1392, 6);
    expect(v.center.x).toBeCloseTo(0.1, 12);
    expect(v.center.y).toBeCloseTo(0.1, 12);
    expect(OVERVIEW_SIDE_PAD_PX).toBe(24);
  });

  it("is capped at 12.5 px covers, half a pixel under the names band", () => {
    expect(OVERVIEW_COVER_MAX_PX).toBe(NAMES_BAND_PX - 0.5);
    expect(OVERVIEW_COVER_MAX_PX).toBe(12.5);
    const narrow = { x1: -0.1, x99: 0.1, medY: 0 }; // (1440 - 48) / 0.2 = 6960 px per world unit wanted
    const v = fitOverview(narrow, zoomForPxPerWorld(500, 836), area);
    expect(pxPerWorld(v.zoom, 836) * COVER_WORLD).toBeCloseTo(12.5, 9);
    // under the zoom at which cover sheets start to load, so the opening view fetches none
    expect(12.5).toBeLessThan(ATLAS_LOAD_PX);
  });

  it("never frames wider than the whole map: a narrow window keeps the whole map's scale", () => {
    const wide = { x1: -2, x99: 2, medY: 0 }; // (390 - 48) / 4 = 85.5 px per world unit, under the whole map's 200
    const v = fitOverview(wide, zoomForPxPerWorld(200, 784), { width: 390, height: 784, insetLeft: 0, bottomCover: 165 });
    expect(pxPerWorld(v.zoom, 784)).toBeCloseTo(200, 6);
  });

  it("on a phone sets the median row in the middle of the band above the slider panel", () => {
    const v = fitOverview(ext, zoomForPxPerWorld(100, 784), { width: 390, height: 784, insetLeft: 0, bottomCover: 165 });
    const ppw = pxPerWorld(v.zoom, 784); // (390 - 48) / 1.0 = 342
    expect(ppw).toBeCloseTo(342, 6);
    // camera.position is the canvas centre (y 392 of 784); the median row sits at (784 - 165) / 2 = 309.5, 82.5 px higher.
    const medianRowScreenY = 784 / 2 - (ext.medY - v.center.y) * ppw;
    expect(medianRowScreenY).toBeCloseTo((784 - 165) / 2, 6);
    expect(v.center.x).toBeCloseTo(0.1, 12);
  });

  it("fits the width right of the album panel", () => {
    const a = fitOverview(ext, 0.2, area);
    const b = fitOverview(ext, 0.2, { ...area, insetLeft: 400 });
    expect(pxPerWorld(b.zoom, 836)).toBeCloseTo(1440 - 400 - 48, 6);
    expect(pxPerWorld(a.zoom, 836)).toBeCloseTo(1440 - 48, 6);
  });
});

/** The committed catalogue and layouts: the scales Task 0 records are those of the real map. */
function realData(): MapData {
  const dir = path.resolve(process.cwd(), "public/data");
  const albums = JSON.parse(fs.readFileSync(path.join(dir, "albums.json"), "utf8"));
  const positions = JSON.parse(fs.readFileSync(path.join(dir, "positions.json"), "utf8"));
  return buildMapData(albums, positions);
}
const STOP_T = { sonic: 0, balanced: 0.5, mood: 1 } as const;
const DESKTOP_FIT = { top: 55, right: 40, bottom: 115, left: 40 }; // MapStage DESKTOP_FIT_PADDING
const PHONE_FIT = { top: 90, right: 40, bottom: 165 + 4, left: 40 }; // MapStage PHONE_FIT_PADDING with the fallback cover

describe("the Overview on the real map (Task 0's recorded scales)", () => {
  const data = realData();
  const cases = [
    { name: "desktop 1440 x 900", width: 1440, height: 836, pad: DESKTOP_FIT, cover: 0, whole: { balanced: 596.653, sonic: 708.479, mood: 618.156 }, overview: { balanced: 1639.476, sonic: 1534.717, mood: 1838.235 } },
    { name: "phone 390 x 844", width: 390, height: 784, pad: PHONE_FIT, cover: 165, whole: { balanced: 267.847, sonic: 286.498, mood: 487.285 }, overview: { balanced: 402.802, sonic: 377.064, mood: 584.842 } },
  ] as const;

  for (const c of cases) {
    for (const stop of ["balanced", "sonic", "mood"] as const) {
      it(`${c.name}, ${stop}: whole ${c.whole[stop]} and Overview ${c.overview[stop]} px per world unit`, () => {
        const t = STOP_T[stop];
        const whole = fitView(getCloudBounds(data, t), { width: c.width, height: c.height, insetLeft: 0, padding: c.pad });
        expect(pxPerWorld(whole.zoom, c.height)).toBeCloseTo(c.whole[stop], 2);
        const ov = overviewView(data, t, { width: c.width, height: c.height, insetLeft: 0, bottomCover: c.cover }, whole.zoom);
        expect(pxPerWorld(ov.zoom, c.height)).toBeCloseTo(c.overview[stop], 2);
        // Covers stay dots and names show: under 13 px everywhere, at most 12.5.
        expect(pxPerWorld(ov.zoom, c.height) * COVER_WORLD).toBeLessThanOrEqual(12.5 + 1e-9);
      });
    }
  }

  it("desktop Balanced: the camera the map opens at", () => {
    const whole = fitView(getCloudBounds(data, 0.5), { width: 1440, height: 836, insetLeft: 0, padding: DESKTOP_FIT });
    const ov = overviewView(data, 0.5, { width: 1440, height: 836, insetLeft: 0, bottomCover: 0 }, whole.zoom);
    expect(ov.zoom).toBeCloseTo(2.15721, 4);
    expect(ov.center.x).toBeCloseTo(0.033325, 5);
    expect(ov.center.y).toBeCloseTo(0, 6);
    // the Whole map, unchanged from today (part 2 quotes 0.784 * 836 / 1.1 = 595.8, the zoom rounded)
    expect(whole.zoom).toBeCloseTo(0.78507, 4);
  });

  it("is never nudged by CameraBounds: the opening view is inside the padded cloud box at every window checked", () => {
    const sizes = [
      [1440, 836, 0], [1920, 1016, 0], [2560, 1376, 0], [1366, 704, 0], [1024, 704, 0], [900, 536, 0],
      [390, 784, 165], [360, 580, 165], [430, 872, 165], [844, 330, 165], [768, 964, 165],
    ] as const;
    for (const [w, h, cover] of sizes) {
      for (const stop of ["balanced", "sonic", "mood"] as const) {
        const t = STOP_T[stop];
        const cloud = getCloudBounds(data, t);
        const pad = cover ? { ...PHONE_FIT, bottom: cover + 4 } : DESKTOP_FIT;
        const whole = fitView(cloud, { width: w, height: h, insetLeft: 0, padding: pad });
        const ov = overviewView(data, t, { width: w, height: h, insetLeft: 0, bottomCover: cover }, whole.zoom);
        const halfH = 0.55 / ov.zoom; // FRUSTUM_HALF_HEIGHT / zoom
        const viewport = { halfW: halfH * (w / h), halfH };
        // CameraBounds' MARGIN (0.04) and its threshold above the fitted zoom
        expect(nudgeVector(ov.center, viewport, cloud, 0.04, visibleFractionThreshold(ov.zoom, whole.zoom)), `${w} x ${h} ${stop}`).toBeNull();
      }
    }
  });

  it("frames the same stop's own albums: the 1st and 99th percentile sit 24 px inside the sides on desktop", () => {
    const xy = interpolatedPositions(data, 0.5);
    const e = overviewExtent(xy);
    const whole = fitView(getCloudBounds(data, 0.5), { width: 1440, height: 836, insetLeft: 0, padding: DESKTOP_FIT });
    const ov = overviewView(data, 0.5, { width: 1440, height: 836, insetLeft: 0, bottomCover: 0 }, whole.zoom);
    const ppw = pxPerWorld(ov.zoom, 836);
    expect(720 + (e.x1 - ov.center.x) * ppw).toBeCloseTo(24, 6);
    expect(720 + (e.x99 - ov.center.x) * ppw).toBeCloseTo(1440 - 24, 6);
  });
});
```
- [ ] **Step 2: Write the failing unit tests for the opening rule**

In `frontcreck/src/components/map/state/view.test.ts`, L3, before: `import { releaseView } from "./view";` after:

```ts
import { MAP_OPENS_AT, getFitCamera, getFitKind, getOverviewFraming, openingKind, releaseView, setFitKind, setOverviewFraming, untouchedOverview } from "./view";
```

Append at the end of the file:

```ts
describe("openingKind (Task 0: /map opens at the Overview)", () => {
  const focus = { seed: 11, recs: [1, 2] };

  it("the one constant of the ruling says Overview", () => {
    expect(MAP_OPENS_AT).toBe("overview");
  });

  it("opens /map at the Overview when no album is in focus", () => {
    expect(openingKind({ explore: true, focus: null })).toBe("overview");
  });

  it("opens every other route at the Whole map, as today: Home, About, 404 and an album link", () => {
    expect(openingKind({ explore: false, focus: null })).toBe("whole");
    expect(openingKind({ explore: false, focus })).toBe("whole");
    // an album in focus always frames itself from the Whole map, whatever the route says
    expect(openingKind({ explore: true, focus })).toBe("whole");
  });

  it("takes the test switch on /map only, and ignores anything else in it", () => {
    expect(openingKind({ explore: true, focus: null }, "whole")).toBe("whole");
    expect(openingKind({ explore: true, focus: null }, "overview")).toBe("overview");
    expect(openingKind({ explore: false, focus: null }, "overview")).toBe("whole");
    expect(openingKind({ explore: false, focus }, "overview")).toBe("whole");
    for (const junk of [undefined, null, "", "WHOLE", 1, {}]) expect(openingKind({ explore: true, focus: null }, junk)).toBe("overview");
  });
});

describe("the Whole map stays the published fit (fit button, zoom-out floor, idle nudge)", () => {
  it("setFitKind does not touch the published whole-map framing", () => {
    const whole = { zoom: 0.785, center: { x: 0.157, y: -0.14 }, bounds: { minX: -0.42, maxX: 0.74, minY: -0.65, maxY: 0.47 } };
    setOverviewFraming(whole);
    setFitKind("overview");
    expect(getOverviewFraming()).toBe(whole);
    expect(getFitKind()).toBe("overview");
    setFitKind("whole");
    expect(getFitKind()).toBe("whole");
    expect(getFitCamera()).toBeNull();
    setFitKind("overview", { x: 0.033, y: 0, zoom: 2.157 });
    expect(getFitCamera()).toEqual({ x: 0.033, y: 0, zoom: 2.157 });
  });
});

describe("untouchedOverview (/map to Home shows the Whole map only while the Overview is untouched)", () => {
  const opened = { x: 0.033325, y: 0, zoom: 2.15721 };

  it("is true while the camera is where the Overview put it", () => {
    expect(untouchedOverview("overview", opened, { ...opened })).toBe(true);
    expect(untouchedOverview("overview", opened, { x: opened.x + 1e-8, y: opened.y, zoom: opened.zoom })).toBe(true);
  });

  it("is false once anything moved the camera: a pan, a zoom, a pick's fly", () => {
    expect(untouchedOverview("overview", opened, { ...opened, x: opened.x + 0.001 })).toBe(false);
    expect(untouchedOverview("overview", opened, { ...opened, y: opened.y - 0.001 })).toBe(false);
    expect(untouchedOverview("overview", opened, { ...opened, zoom: opened.zoom * 1.4 })).toBe(false);
  });

  it("is false at the Whole map (the fit button, or a page that opened there) and when nothing was recorded", () => {
    expect(untouchedOverview("whole", opened, { ...opened })).toBe(false);
    expect(untouchedOverview("overview", null, { ...opened })).toBe(false);
  });
});
```

- [ ] **Step 3: Run the unit tests to see them fail**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/state/bounds.test.ts src/components/map/state/view.test.ts)`
Expected: FAIL. Both files fail to load: `overviewExtent`, `fitOverview`, `overviewView`, `OVERVIEW_SIDE_PAD_PX`, `OVERVIEW_COVER_MAX_PX`, `MAP_OPENS_AT`, `openingKind`, `setFitKind`, `getFitKind`, `getFitCamera`, `untouchedOverview` are not exported.

- [ ] **Step 4: Implement the Overview fit**

`frontcreck/src/components/map/state/bounds.ts`, L1-3, before:

```ts
import { interpolated, type MapData } from "../data";
import type { MapPadding } from "../types";
import { FIT_ZOOM_MAX, FIT_ZOOM_MIN, pxPerWorld, zoomForPxPerWorld } from "./zoomLimits";
```

after:

```ts
import { interpolated, type MapData } from "../data";
import { NAMES_BAND_PX } from "../theme";
import type { MapPadding } from "../types";
import { COVER_WORLD, FIT_ZOOM_MAX, FIT_ZOOM_MIN, MAX_ZOOM, pxPerWorld, zoomForPxPerWorld } from "./zoomLimits";
```

After `fitView` (after L106, before `export interface ViewportWorldRect`), insert:

```ts
/** Overview: CSS px kept clear at each side of the 1st..99th percentile span (prototype camera.js L31, `- 48`). */
export const OVERVIEW_SIDE_PAD_PX = 24;
/** Overview: the closest it frames, half a pixel under the covers at which names go (prototype `BAND_B - 0.5`),
 * so the opening view always shows names and never loads a cover sheet (ATLAS_LOAD_PX is 13). */
export const OVERVIEW_COVER_MAX_PX = NAMES_BAND_PX - 0.5;

export interface OverviewExtent {
  /** 1st and 99th percentile of x, and the median of y, of one layout (world units). */
  x1: number;
  x99: number;
  medY: number;
}

export interface OverviewArea {
  /** Canvas size in CSS px. */
  width: number;
  height: number;
  /** CSS px covered by the album panel on the left. */
  insetLeft: number;
  /** CSS px covered by the phone slider panel at the bottom (MapInput.bottomCover; 0 on desktop). */
  bottomCover: number;
}

/** The Overview's percentiles of a flat [x0, y0, ...] layout, with the prototype's quantile rule
 * (`sorted[floor(q * (n - 1))]`, prototype data.js L7 and L122). Sorts copies, never the caller's array. */
export function overviewExtent(xy: Float32Array): OverviewExtent {
  const n = Math.floor(xy.length / 2);
  if (n === 0) return { x1: 0, x99: 0, medY: 0 };
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = xy[i * 2];
    ys[i] = xy[i * 2 + 1];
  }
  xs.sort();
  ys.sort();
  const at = (arr: Float32Array, q: number) => arr[Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))))];
  return { x1: at(xs, 0.01), x99: at(xs, 0.99), medY: at(ys, 0.5) };
}

/**
 * The Overview, the framing /map opens at (prototype camera.js L27-34, `Cam.fitOverview`): the 1st..99th
 * percentile x-span fills the width right of the album panel less 24 px a side, capped at 12.5 px covers, never
 * wider than the Whole map (`wholeZoom`, fitView's zoom). Centred on the span in x and on the median row in y; on a
 * phone the median row sits in the middle of the band above the slider panel (the prototype's free rectangle).
 * Regions above and below run off screen. camera.position is the centre of the visible area (applyFrustum).
 */
export function fitOverview(ext: OverviewExtent, wholeZoom: number, area: OverviewArea): { zoom: number; center: { x: number; y: number } } {
  const { width, height, insetLeft, bottomCover } = area;
  const whole = pxPerWorld(wholeZoom, height);
  const across = Math.max(width - insetLeft - 2 * OVERVIEW_SIDE_PAD_PX, 40) / Math.max(ext.x99 - ext.x1, 1e-6);
  const cap = OVERVIEW_COVER_MAX_PX / COVER_WORLD;
  const zoom = Math.min(MAX_ZOOM, zoomForPxPerWorld(Math.max(whole, Math.min(across, cap)), height));
  const ppw = pxPerWorld(zoom, height);
  return { zoom, center: { x: (ext.x1 + ext.x99) / 2, y: ext.medY - bottomCover / 2 / ppw } };
}

/** The Overview of the layout at `sliderT` (the positions on screen). */
export function overviewView(data: MapData, sliderT: number, area: OverviewArea, wholeZoom: number): { zoom: number; center: { x: number; y: number } } {
  return fitOverview(overviewExtent(interpolatedPositions(data, sliderT)), wholeZoom, area);
}
```

(`components/map/theme.ts` imports nothing that pulls three.js or the store; `bounds.ts` is only imported from the map's lazy chunk and its tests.)

- [ ] **Step 5: Implement the opening rule**

`frontcreck/src/components/map/state/view.ts`. Above `export interface OverviewFraming {` (L24), add to the end of its doc comment, before ` */` on L23:

```ts
 *
 * Naming: "overview" here is the Whole map (the whole cloud fitted), named before the Trifid theme's Overview
 * existed. The map now OPENS at the Overview (state/bounds.ts fitOverview, Task 0 of the Trifid build); this
 * record stays the Whole map: the fit button, the zoom-out floor and the idle nudge box.
```

After the `CameraView` interface (after L66, so the new code can name the type), insert:

```ts
/** The two framings /map can show by itself: the prototype's Overview (state/bounds.ts fitOverview) and the Whole map. */
export type OpeningKind = "overview" | "whole";

/**
 * The framing /map opens at. The owner's ruling of 2026-10-05 (build handoff, ruling 9): the Overview, as the
 * approved picture final-overview.jpg and the prototype. 'whole' gives back today's opening view (the whole cloud).
 */
export const MAP_OPENS_AT: OpeningKind = "overview";

/**
 * The framing a page load starts the map at. The Overview only on /map with no album in focus; Home, About, 404
 * and every album link start at the Whole map, as before (an album then frames itself). `override` is
 * window.__rmrOpen, a switch for tests and review captures set before the map loads; anything but the two
 * names is ignored, and it never applies outside /map.
 */
export function openingKind(input: { explore: boolean; focus: unknown }, override?: unknown): OpeningKind {
  if (!input.explore || input.focus !== null) return "whole";
  if (override === "whole" || override === "overview") return override;
  return MAP_OPENS_AT;
}

/** The framing last applied by itself (the opening snap, the fit button, the glide to the opening view), and the
 * camera it set: what a resize re-fits while the visitor has not touched the camera, and what tells an untouched
 * Overview from a moved one when the visitor leaves /map for Home. */
let fitKind: OpeningKind = "whole";
let fitCamera: CameraView | null = null;

export function setFitKind(kind: OpeningKind, camera: CameraView | null = null): void {
  fitKind = kind;
  fitCamera = camera ? { x: camera.x, y: camera.y, zoom: camera.zoom } : null;
}

export function getFitKind(): OpeningKind {
  return fitKind;
}

export function getFitCamera(): CameraView | null {
  return fitCamera;
}

/** True while `camera` is still the Overview the map opened at (or glided to): nothing the visitor did moved it.
 * Leaving /map for Home then shows the Whole map, as a fresh load of Home does (prototype app.js L114). */
export function untouchedOverview(kind: OpeningKind, opened: CameraView | null, camera: CameraView): boolean {
  if (kind !== "overview" || opened === null) return false;
  return Math.hypot(camera.x - opened.x, camera.y - opened.y) + Math.abs(camera.zoom - opened.zoom) < 1e-6;
}
```

`frontcreck/src/components/map/types.ts`. In `MapInput`, after `interactive: boolean;` (L19) insert:

```ts
  /** The route is /map (Explore): the one view that opens at the Overview (state/view.ts openingKind). */
  explore: boolean;
```

In `MapApi`, after the `flyTo` line (L50) insert:

```ts
  /** Glide (or jump, with `animate` false) to the framing /map opens at: the Overview, or the Whole map where
   * state/view.ts openingKind says so. */
  opening: (animate?: boolean) => void;
  /** Leaving /map for Home: when the camera is still the untouched Overview, glide to the Whole map (Home's own
   * framing) and return true; otherwise leave the camera and return false. */
  homeBackdrop: () => boolean;
```

`frontcreck/src/components/map/state/mapStore.ts`, `DEFAULT_INPUT` L12, before: `  interactive: false,` after:

```ts
  interactive: false,
  explore: false,
```

`frontcreck/src/types/global.d.ts`, after L46 (`__rmrGasLite?: 'force' | 'off';`) insert:

```ts
    /** Set before the map loads by review captures, measurements and tests: the framing /map opens at on this
     * page load ('whole': the opening view of the site before the Trifid theme; 'overview': the default). It
     * changes nothing on Home, About, 404 or an album. */
    __rmrOpen?: 'whole' | 'overview';
```

- [ ] **Step 6: Run the unit tests to see them pass**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- src/components/map/state/bounds.test.ts src/components/map/state/view.test.ts)`
Expected: PASS, every test, the old ones included (the existing `fitView`, `nudgeVector`, `releaseView` tests are not touched and keep their numbers). If a recorded scale in "the Overview on the real map" is off in the second decimal, the code differs from the prototype formula: fix the code, do not change the number (they were computed independently with plain `node` while this plan was written).

- [ ] **Step 7: Wire the opening snap (`InitialFrame`)**

`frontcreck/src/components/map/canvas/InitialFrame.tsx`, L8-10, before:

```ts
import { fitView, getCloudBounds } from "../state/bounds";
import { useMapStore } from "../state/mapStore";
import { setFramed, setOverviewFraming } from "../state/view";
```

after:

```ts
import { fitView, getCloudBounds, overviewView } from "../state/bounds";
import { useMapStore } from "../state/mapStore";
import { getFitKind, openingKind, setFitKind, setFramed, setOverviewFraming } from "../state/view";
```

In the doc comment, replace the "Snap" bullet (L47-50):

```ts
 * - Snap: once per MapData the camera jumps, without animation, to the
 *   framing centre and fitted zoom. A resize re-snaps only while the user
 *   has not yet grabbed the camera and no album is in focus; a slider change
 *   never moves the camera.
```

with:

```ts
 * - Snap: once per MapData the camera jumps, without animation, to the
 *   opening framing (state/view.ts openingKind): the Overview on /map
 *   (state/bounds.ts fitOverview), the whole-cloud fit everywhere else. The
 *   published framing stays the whole-cloud fit. A resize re-snaps, to the
 *   framing last applied (getFitKind), only while the user has not yet
 *   grabbed the camera and no album is in focus; a slider change never moves
 *   the camera.
```

In `recomputeFraming`, L90 reads `const { input } = useMapStore.getState();` and L91-97 publish the whole fit; leave them as they are. Replace the snap block L104-113, before:

```ts
    if (newData || (sizeChanged && untouched)) {
      framedData.current = data;
      // eslint-disable-next-line react-hooks/immutability -- mutating the R3F camera in place (position/zoom/frustum) is the standard R3F pattern; the camera is a long-lived GPU-backed object, not React-owned state, and this is not itself inside a hook callback.
      camera.position.x = center.x;
      camera.position.y = center.y;
      // eslint-disable-next-line react-hooks/immutability -- see the comment above.
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      setFramed(true);
    }
```

after:

```ts
    if (newData || (sizeChanged && untouched)) {
      framedData.current = data;
      // A page load opens at the route's framing; a resize re-fits the framing on screen (the fit button may have
      // turned the Overview into the whole map).
      const kind = newData ? openingKind(input, window.__rmrOpen) : getFitKind();
      const view =
        kind === "overview"
          ? overviewView(data, currentSliderT, { width, height, insetLeft: useMapStore.getState().insetCurrent, bottomCover: input.bottomCover }, zoom)
          : { zoom, center };
      setFitKind(kind, { x: view.center.x, y: view.center.y, zoom: view.zoom });
      // eslint-disable-next-line react-hooks/immutability -- mutating the R3F camera in place (position/zoom/frustum) is the standard R3F pattern; the camera is a long-lived GPU-backed object, not React-owned state, and this is not itself inside a hook callback.
      camera.position.x = view.center.x;
      camera.position.y = view.center.y;
      // eslint-disable-next-line react-hooks/immutability -- see the comment above.
      camera.zoom = view.zoom;
      camera.updateProjectionMatrix();
      setFramed(true);
    }
```

`input` is the route's input of this commit: `MusicMap` writes `data` and `input` to the store in its layout effects (`MusicMap.tsx` L26-34) before `InitialFrame` re-renders with the data.

- [ ] **Step 8: The fit button records the Whole map; `opening()` (`CameraTween`)**

`frontcreck/src/components/map/canvas/CameraTween.tsx`, L12, before: `import { getOverviewFraming } from '../state/view';` after:

```ts
import { overviewView } from '../state/bounds';
import { getFitCamera, getFitKind, getOverviewFraming, openingKind, setFitKind, untouchedOverview } from '../state/view';
```

`reset` (L107-112), before:

```ts
      reset: () => {
        const { input, rearmFocus } = useMapStore.getState();
        // Back to the focus framing, and FocusFramer follows stop and inset changes again.
        if (input.focus) rearmFocus();
        start(focusTarget() ?? (input.selected !== null ? flyTarget(input.selected) : overview()), DURATION.camera);
      },
      flyTo: (id) => start(flyTarget(id), FLY_MS),
```

after:

```ts
      reset: () => {
        const { input, rearmFocus } = useMapStore.getState();
        // Back to the focus framing, and FocusFramer follows stop and inset changes again.
        if (input.focus) rearmFocus();
        const framed = focusTarget() ?? (input.selected !== null ? flyTarget(input.selected) : null);
        // The fit button's whole map (Task 0): a resize before the visitor moves the map keeps it.
        if (framed === null) setFitKind('whole', overview());
        start(framed ?? overview(), DURATION.camera);
      },
      flyTo: (id) => start(flyTarget(id), FLY_MS),
      opening: (animate = true) => {
        const { input, data, sliderT, insetCurrent } = useMapStore.getState();
        if (!data) return;
        const kind = openingKind(input, window.__rmrOpen);
        const { width, height } = get().size;
        const whole = overview();
        const to = kind === 'overview' ? overviewView(data, sliderT, { width, height, insetLeft: insetCurrent, bottomCover: input.bottomCover }, whole.zoom) : null;
        const target = to ? { x: to.center.x, y: to.center.y, zoom: to.zoom } : whole;
        setFitKind(kind, target);
        start(target, animate ? DURATION.camera : 0);
      },
      homeBackdrop: () => {
        // Still the Overview the map opened at (no tween running, nothing moved it): Home's Whole map, as on a fresh
        // load of Home (prototype app.js L114). A moved camera stays, as today.
        if (tween.current || !untouchedOverview(getFitKind(), getFitCamera(), current())) return false;
        const whole = overview();
        setFitKind('whole', whole);
        start(whole, DURATION.camera);
        return true;
      },
```

(`reset` keeps its targets exactly: focus framing, else the picked album, else the Whole map. `opening` and `homeBackdrop` are not camera grabs: like `reset` they do not call `registerCameraGrab`. `overview()` is the published whole fit, recomputed by `InitialFrame` on data, size and slider changes (not on a new input). On desktop it is exactly Home's fresh framing. On a phone it may carry `/map`'s measured slider cover (164.5 px) where a fresh Home has the fallback (165): the zoom is the same (the phone fit is tight across) and the centre is 0.25 px lower, which the browser test allows for. The zoom clamp in `start` changes neither target: both are at or above the whole map, far under `MAX_ZOOM`.)

- [ ] **Step 9: `MapStage`: the route flag, and Home, About or 404 to the map**

`frontcreck/src/components/map/MapStage.tsx`, the input memo (L197-212), after `      interactive,` (L203) insert `      explore: view === 'explore',`. The dependency list already holds `view` (L211).

In the first view-change layout effect (L231-242), first the save on leaving Explore (L236-239), before:

```ts
    if (prev === 'explore') {
      if (apiRef.current) s.saveExploreCamera(apiRef.current.getCamera());
      s.setSelected(null);
    }
```

after:

```ts
    if (prev === 'explore') {
      // To Home with the Overview untouched: Home shows the Whole map, as on a fresh load (prototype app.js L114,
      // final-home.jpg), and nothing is kept, so the Map link opens at the Overview again (Task 0).
      const toHome = view === 'home' && apiRef.current?.homeBackdrop() === true;
      if (toHome) s.saveExploreCamera(null);
      else if (apiRef.current) s.saveExploreCamera(apiRef.current.getCamera());
      s.setSelected(null);
    }
```

(`MusicMap` applies Home's input in its own layout effect before this one, so the glide reads Home's whole fit. A pick flies the camera, so with a card open the Overview is not untouched and nothing changes for that path.) Then, before:

```ts
    pendingReturn.current = view === 'explore' && prev === 'album' && !exploreHere.current;
    exploreHere.current = false;
  }, [view]);
```

after:

```ts
    pendingReturn.current = view === 'explore' && prev === 'album' && !exploreHere.current;
    // Home, About or 404 to the map, with no camera saved in Explore: the map glides to its opening view (Task 0,
    // prototype app.js L118). A saved camera stays where the visitor left it.
    pendingOpening.current = view === 'explore' && (prev === 'home' || prev === 'about' || prev === 'other') && s.exploreCamera === null;
    exploreHere.current = false;
  }, [view]);
```

and declare the ref beside the others (after `const exploreHere = useRef(false);`, L229):

```ts
  const pendingOpening = useRef(false);
```

After the second layout effect (after L252, `}, [view, input]);`), insert:

```ts
  // Runs in the commit whose input says Explore (MusicMap applied it in its own layout effect). Without a map yet
  // there is nothing to move: when the map mounts, InitialFrame opens it at the same framing.
  useLayoutEffect(() => {
    if (!pendingOpening.current || view !== 'explore' || input.focus !== null) return;
    pendingOpening.current = false;
    apiRef.current?.opening(true);
  }, [view, input]);
```

Update the comment above the explore camera memory (L224-226), before:

```ts
  // Explore camera memory (mockup render: exploreCam). Leaving Explore saves the camera and drops the card;
  // coming back from an album (its close control, Escape or the header nav) restores it, or frames the whole map.
```

after:

```ts
  // Explore camera memory (mockup render: exploreCam). Leaving Explore saves the camera and drops the card;
  // coming back from an album (its close control, Escape or the header nav) restores it, or frames the whole map;
  // coming from Home, About or 404 with nothing saved glides to the opening view (the Overview); leaving for Home
  // with the Overview untouched glides back to the whole map and keeps nothing.
```

- [ ] **Step 10: Typecheck and the unit suite**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck && npm run lint && npm run test)`
Expected: all pass. The typecheck is the caller check for the two interface changes: every `MapInput` (MapStage, `DEFAULT_INPUT`) has `explore`, and every `MapApi` (CameraTween) has `opening`.

- [ ] **Step 11: Test helpers**

`frontcreck/e2e/helpers.ts`, append after `tabTo` (after L112). The first helper is part 2 Task 8's `waitForGasSharpSettled`, copied from part 2 (its Task 8 step 11 code) with one change: its quiet time defaults to 2.5 s, longer than a failed sharper image's retry wait (`GAS_SHARP_RETRY_MS` 2000, `shaders/gas.ts` L342). **Part 2 Task 8 reuses this helper and must not add a second copy** (it adds only `twinkleOff`).

```ts
/** Waits until part 1's sharper gas image has settled: the flag is not 'loading', and neither it nor the frame
 * count has changed for `quietMs` (longer than GAS_SHARP_RETRY_MS, so a failed load's retry is not missed).
 * Phones say 'off'; the software test browser 'waiting' or 'off'; a desktop GPU the stop once it is in. Call it
 * before counting frames at rest. Defined in part 2 Task 0; Task 8 reuses it. */
export async function waitForGasSharpSettled(page: Page, quietMs = 2500): Promise<void> {
  await page.waitForFunction(
    (quiet) => {
      const w = window as unknown as { __gsF?: number; __gsS?: string; __gsT?: number };
      const s = String(window.__rmr?.gasSharp);
      const f = window.__rmr?.frames ?? 0;
      const now = performance.now();
      if (s === 'loading' || w.__gsF !== f || w.__gsS !== s) {
        w.__gsF = f;
        w.__gsS = s;
        w.__gsT = now;
        return false;
      }
      return now - (w.__gsT ?? now) >= quiet;
    },
    quietMs,
    { polling: 50, timeout: 45_000 },
  );
}

/** Where every album is on screen (client px), with the canvas's edges and, on a phone, the slider panel's
 * cover of the canvas bottom (MapStage's sliderCover). Percentiles use the prototype's rule. */
export interface Spread {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cover: number;
  n: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  x1: number;
  x99: number;
  medY: number;
}

export async function albumSpread(page: Page): Promise<Spread> {
  return page.evaluate(() => {
    const api = window.__rmr!.map!;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let id = 0; ; id++) {
      const p = api.screenPoint(id);
      if (!p) break;
      xs.push(p.x);
      ys.push(p.y);
    }
    const r = document.querySelector('canvas.map-canvas')!.getBoundingClientRect();
    // The phone slider panel's cover of the canvas (MapStage sliderCover); Home and About have no panel, and their
    // fit keeps MapStage's fallback (PHONE_SLIDER_COVER_FALLBACK_PX, 165).
    const mode = innerWidth < 900 ? document.querySelector<HTMLElement>('.mode') : null;
    const cover = innerWidth >= 900 ? 0 : mode && mode.getClientRects().length ? Math.max(0, r.bottom - mode.getBoundingClientRect().top) : 165;
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    const at = (a: number[], q: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))];
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, cover, n: xs.length, minX: xs[0], maxX: xs[xs.length - 1], minY: ys[0], maxY: ys[ys.length - 1], x1: at(xs, 0.01), x99: at(xs, 0.99), medY: at(ys, 0.5) };
  });
}

/** What is wrong with `s` as the Overview (prototype Cam.fitOverview), for a window where the span is not capped
 * (1440 x 900 and 390 x 844 at Balanced): the 1st and 99th percentile albums 24 px inside the canvas sides, the
 * median row in the middle of the canvas above the slider panel, and some albums off screen (it is a crop, not the
 * whole map). Empty when it is the Overview. Tolerance 1 px. */
export function overviewMiss(s: Spread): string[] {
  const out: string[] = [];
  const near = (a: number, b: number, what: string) => {
    if (Math.abs(a - b) > 1) out.push(`${what}: ${a.toFixed(1)} px, expected ${b.toFixed(1)}`);
  };
  near(s.x1, s.left + 24, '1st percentile x');
  near(s.x99, s.right - 24, '99th percentile x');
  near(s.medY, s.top + (s.bottom - s.cover - s.top) / 2, 'median row y');
  if (s.minX >= s.left && s.maxX <= s.right && s.minY >= s.top && s.maxY <= s.bottom) out.push('every album is on screen: that is not a crop');
  return out;
}

/** What is wrong with `s` as the Whole map: every album inside the canvas less MapStage's fit padding (desktop
 * top 55, sides 40, bottom 115; phone top 90, sides 40, bottom the slider panel plus 4), and the cloud touching the
 * padding at both ends of one axis (the fit is tight on that axis and centred). Empty when it is. Tolerance 1 px. */
export function wholeMapMiss(s: Spread, phone: boolean): string[] {
  const box = phone
    ? { l: s.left + 40, t: s.top + 90, r: s.right - 40, b: s.bottom - (s.cover + 4) }
    : { l: s.left + 40, t: s.top + 55, r: s.right - 40, b: s.bottom - 115 };
  const out: string[] = [];
  if (s.minX < box.l - 1) out.push(`an album ${(box.l - s.minX).toFixed(1)} px left of the fit box`);
  if (s.maxX > box.r + 1) out.push(`an album ${(s.maxX - box.r).toFixed(1)} px right of the fit box`);
  if (s.minY < box.t - 1) out.push(`an album ${(box.t - s.minY).toFixed(1)} px above the fit box`);
  if (s.maxY > box.b + 1) out.push(`an album ${(s.maxY - box.b).toFixed(1)} px below the fit box`);
  const tightX = Math.abs(s.minX - box.l) <= 1 && Math.abs(s.maxX - box.r) <= 1;
  const tightY = Math.abs(s.minY - box.t) <= 1 && Math.abs(s.maxY - box.b) <= 1;
  if (!tightX && !tightY) out.push(`not fitted: slack x ${(s.minX - box.l).toFixed(1)} / ${(box.r - s.maxX).toFixed(1)}, y ${(s.minY - box.t).toFixed(1)} / ${(box.b - s.maxY).toFixed(1)}`);
  return out;
}
```

On the phone the Whole map's bottom padding is computed from the slider panel's height when the fit was last published (`InitialFrame` recomputes on data, size and slider changes, not on a new panel measurement). At 390 x 844 the fit is tight across (x), so a sub-pixel difference between the fallback cover (165) and the measured one (164.5) cannot fail `wholeMapMiss`.

- [ ] **Step 12: Write the failing browser tests (`e2e/opening.spec.ts`)**

Create `frontcreck/e2e/opening.spec.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { act, albumSpread, camera, isPhone, overviewMiss, waitForCameraIdle, waitForGasSharpSettled, waitForMap, wholeMapMiss } from './helpers';

/** Task 0 of part 2: /map opens at the approved Overview (final-overview.jpg); the fit button gives the Whole map.
 * Zooms recorded in the plan (docs/superpowers/plans/2026-10-05-trifid-theme-2-task0-overview-framing.md) from the
 * committed positions: desktop 1440 x 900 (canvas 836 tall) and phone 390 x 844 (canvas 784 tall), Balanced. */
const OVERVIEW_ZOOM = { desktop: 2.15721, phone: 0.56516 };
const WHOLE_ZOOM = { desktop: 0.78507, phone: 0.37581 };

async function openMap(page: Page): Promise<void> {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
}

const same = (a: { x: number; y: number; zoom: number }, b: { x: number; y: number; zoom: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(a.zoom - b.zoom);

test('/map opens at the Overview: the 1st to 99th percentile span fills the pane less 24 px a side, the median row in the middle', async ({ page }, info) => {
  await openMap(page);
  const s = await albumSpread(page);
  expect(overviewMiss(s)).toEqual([]);
  const z = (await camera(page)).zoom;
  expect(z).toBeCloseTo(OVERVIEW_ZOOM[isPhone(info) ? 'phone' : 'desktop'], 3);
  // covers stay dots and names can show: under 13 px (12.5 at most)
  const h = s.bottom - s.top;
  expect((z * h) / 1.1 * 0.0068).toBeLessThan(12.5 + 1e-6);
});

test('the fit button gives the Whole map, and pressing it again stays there', async ({ page, isMobile }, info) => {
  await openMap(page);
  const opened = await camera(page);
  await act(page.getByRole('button', { name: COPY.map.reset }), isMobile);
  await waitForCameraIdle(page);
  expect(wholeMapMiss(await albumSpread(page), isPhone(info))).toEqual([]);
  const whole = await camera(page);
  expect(whole.zoom).toBeCloseTo(WHOLE_ZOOM[isPhone(info) ? 'phone' : 'desktop'], 3);
  expect(whole.zoom).toBeLessThan(opened.zoom);
  await act(page.getByRole('button', { name: COPY.map.reset }), isMobile);
  await waitForCameraIdle(page);
  expect(same(await camera(page), whole)).toBeLessThan(1e-6);
  if (!isMobile) {
    // the 0 key is the fit button
    await page.locator('canvas.map-canvas').focus();
    await page.keyboard.press('+');
    await waitForCameraIdle(page);
    await page.keyboard.press('0');
    await waitForCameraIdle(page);
    expect(same(await camera(page), whole)).toBeLessThan(1e-6);
  }
});

test('the opening switch gives back the old opening view exactly: the fit button\'s Whole map', async ({ page, isMobile }) => {
  await openMap(page);
  await act(page.getByRole('button', { name: COPY.map.reset }), isMobile);
  await waitForCameraIdle(page);
  const fit = await camera(page);
  await page.addInitScript(() => {
    window.__rmrOpen = 'whole';
  });
  await openMap(page);
  expect(same(await camera(page), fit)).toBeLessThan(1e-6);
});

test('an album link opens on the album whatever the opening switch says', async ({ page, isMobile }) => {
  const openAlbum = async () => {
    await page.goto('/album/in-rainbows-radiohead');
    await waitForMap(page);
    if (isMobile) {
      await page.getByRole('button', { name: COPY.phone.mapLabel }).tap();
      await waitForMap(page);
    }
    await expect(page.locator('.mk')).toHaveCount(6);
    await waitForCameraIdle(page);
    return camera(page);
  };
  const plain = await openAlbum();
  await page.addInitScript(() => {
    window.__rmrOpen = 'overview';
  });
  const switched = await openAlbum();
  expect(same(switched, plain)).toBeLessThan(1e-6);
  // and it is the album's own framing, not the Overview's
  expect(Math.abs(plain.zoom - OVERVIEW_ZOOM[isMobile ? 'phone' : 'desktop'])).toBeGreaterThan(0.05);
});

test('from Home the map link glides to the Overview; a camera saved in Explore is kept', async ({ page, isMobile }) => {
  await page.goto('/');
  await waitForMap(page);
  const nav = page.getByRole('navigation', { name: COPY.nav.label });
  await act(nav.getByRole('link', { name: COPY.nav.map, exact: true }), isMobile);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await waitForMap(page); // the gas flag drops to 'loading' when Home turns into the map
  await waitForCameraIdle(page);
  expect(overviewMiss(await albumSpread(page))).toEqual([]);
  // The visitor zooms, leaves for About and comes back: the map is where they left it, not the Overview again.
  await act(page.getByRole('button', { name: COPY.map.zoomIn }), isMobile);
  await waitForCameraIdle(page);
  const left = await camera(page);
  await act(nav.getByRole('link', { name: COPY.nav.about, exact: true }), isMobile);
  await expect(page).toHaveURL('/about');
  await act(nav.getByRole('link', { name: COPY.nav.map, exact: true }), isMobile);
  await expect(page).toHaveURL('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(same(await camera(page), left)).toBeLessThan(1e-6);
});

test('/map to Home with the Overview untouched shows Home\'s Whole map, and the Map link opens at the Overview again; a moved camera stays', async ({ page, isMobile }) => {
  // Home's own framing (final-home.jpg): a fresh load of Home.
  await page.goto('/');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const homeFresh = await camera(page);
  await openMap(page);
  await act(page.locator('a.wordmark'), isMobile);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'home');
  await waitForMap(page);
  await waitForCameraIdle(page);
  // The same zoom, and the same centre to under a pixel: on a phone the whole fit published on /map may carry the
  // measured slider cover (164.5 px) where a fresh Home has the fallback (165), a 0.25 px shift of the centre.
  const back = await camera(page);
  const canvasH = await page.evaluate(() => document.querySelector('canvas.map-canvas')!.getBoundingClientRect().height);
  expect(Math.abs(back.zoom - homeFresh.zoom)).toBeLessThan(1e-6);
  expect(Math.hypot(back.x - homeFresh.x, back.y - homeFresh.y) * ((homeFresh.zoom * canvasH) / 1.1)).toBeLessThan(1);
  expect(wholeMapMiss(await albumSpread(page), isMobile)).toEqual([]);
  // Nothing was saved: the Map link opens at the Overview again.
  const nav = page.getByRole('navigation', { name: COPY.nav.label });
  await act(nav.getByRole('link', { name: COPY.nav.map, exact: true }), isMobile);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(overviewMiss(await albumSpread(page))).toEqual([]);
  // Moved by the visitor: Home keeps the camera, as today.
  await act(page.getByRole('button', { name: COPY.map.zoomIn }), isMobile);
  await waitForCameraIdle(page);
  const moved = await camera(page);
  await act(page.locator('a.wordmark'), isMobile);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'home');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(same(await camera(page), moved)).toBeLessThan(1e-6);
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop framing');

  test('after the Overview glided back to Home, a resize on Home fits the Whole map, as a fresh load of Home at that size', async ({ page }) => {
    const canvasWidth = () => page.evaluate(() => document.querySelector('canvas.map-canvas')!.getBoundingClientRect().width);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await waitForMap(page);
    await waitForCameraIdle(page);
    const homeAt1280 = await camera(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page);
    await page.locator('a.wordmark').click();
    await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'home');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(canvasWidth).toBe(1280);
    await waitForCameraIdle(page);
    expect(same(await camera(page), homeAt1280)).toBeLessThan(1e-6);
  });

  test('on a desktop with a GPU the Overview asks for the sharper gas image without a zoom, and its fade ends', async ({ page }) => {
    const theme = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public/data/theme/theme.json'), 'utf8')) as { gas: Record<string, { hash: [string, string] }> };
    const sharpUrl = `/data/theme/gas-balanced-sharp.${theme.gas.balanced.hash[1]}.webp`;
    await page.addInitScript(() => {
      window.__rmrGasLite = 'off';
      window.__rmrGasSharp = 'force'; // the test browser is a software renderer, which would not ask by itself
    });
    const sharpRequests: string[] = [];
    page.on('request', (r) => {
      if (/-sharp\./.test(r.url())) sharpRequests.push(new URL(r.url()).pathname);
    });
    await openMap(page);
    const opened = await camera(page);
    // 950 px per raw unit at the Overview against 700 texels in Balanced's first image (the Whole map: 346)
    await expect.poll(() => sharpRequests, { timeout: 20_000 }).toEqual([sharpUrl]);
    await expect.poll(() => page.evaluate(() => window.__rmr!.gasSharp), { timeout: 30_000 }).toBe('balanced');
    await waitForGasSharpSettled(page);
    expect(same(await camera(page), opened), 'no camera move').toBeLessThan(1e-6);
    const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
    await page.waitForTimeout(1000);
    expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - f1).toBe(0);
    expect(sharpRequests).toEqual([sharpUrl]);
  });

  test('a resize before the map is touched re-fits the Overview; after the fit button it re-fits the Whole map', async ({ page }) => {
    await openMap(page);
    const canvasWidth = () => page.evaluate(() => document.querySelector('canvas.map-canvas')!.getBoundingClientRect().width);
    await page.setViewportSize({ width: 1280, height: 800 });
    // R3F sees the new size through a ResizeObserver: wait for it before waiting for the camera
    await expect.poll(canvasWidth).toBe(1280);
    await waitForCameraIdle(page);
    expect(overviewMiss(await albumSpread(page))).toEqual([]);
    await page.getByRole('button', { name: COPY.map.reset }).click();
    await waitForCameraIdle(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(canvasWidth).toBe(1440);
    await waitForCameraIdle(page);
    expect(wholeMapMiss(await albumSpread(page), false)).toEqual([]);
  });

  test('the gas fills the screen at the Overview, the Whole map leaves sky beside it, and nothing draws at rest', async ({ page }) => {
    await page.addInitScript(() => {
      window.__rmrGasLite = 'off'; // the full shader, as gas.spec.ts reads the gas
    });
    await openMap(page);
    expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
    const grid = async (): Promise<number[]> => {
      const vp = page.viewportSize()!;
      const out: number[] = [];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) out.push(await medianLuma(page, { x: 200 + (i * (vp.width - 520)) / 3, y: 160 + (j * (vp.height - 440)) / 2, w: 120, h: 120 }));
      return out;
    };
    const overview = await grid();
    overview.forEach((v, i) => expect(v, `patch ${i} at the Overview: ${overview.map((x) => x.toFixed(1)).join(', ')}`).toBeGreaterThan(SKY_LUMA + 4));
    await waitForGasSharpSettled(page);
    const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
    await page.waitForTimeout(1200);
    expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - f1).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: COPY.map.reset }).click();
    await waitForCameraIdle(page);
    const whole = await grid();
    expect(whole.filter((v) => v <= SKY_LUMA + 4).length, `patches at the Whole map: ${whole.map((x) => x.toFixed(1)).join(', ')}`).toBeGreaterThanOrEqual(2);
  });
});

/** Luma of the empty sky, rgb(6, 6, 9) (gas.spec.ts SKY_LUMA). */
const SKY_LUMA = 6.2;

/** Median luma of a client-px rectangle of a screenshot (gas.spec.ts lumaAt with q = 0.5). */
async function medianLuma(page: Page, r: { x: number; y: number; w: number; h: number }): Promise<number> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, rect]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const d = ctx.getImageData(Math.round(rect.x * k), Math.round(rect.y * k), Math.round(rect.w * k), Math.round(rect.h * k)).data;
      const l: number[] = [];
      for (let i = 0; i < d.length; i += 4) l.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      l.sort((a, b) => a - b);
      return l[Math.floor((l.length - 1) / 2)];
    },
    [png, r] as const,
  );
}
```

What each test proves:
- "opens at the Overview": the opening framing is the prototype's rule, read from where the albums land on screen (an independent oracle, not the app's own function), the recorded zoom on both projects, and the 12.5 px cap.
- "the fit button gives the Whole map": the fit button and the `0` key give the whole-cloud fit (every album inside the padded pane, tight on one axis), it is the recorded zoom of today's opening view, and pressing again is a fixed point (the strictness the old "returns to the start zoom" assertion had).
- "the opening switch": `__rmrOpen = 'whole'` opens exactly where the fit button leads, so captures and perf runs that use it are like for like with the baseline, which opened there.
- "an album link": album routes end at the same album framing whatever the switch says. It cannot see the first frame: `FocusFramer` tweens to the album framing from any start, so a page that first snapped to the Overview would end the same. That an album route never starts from the Overview rests on the `openingKind` unit test ("opens every other route at the Whole map").
- "from Home": the common path (Home, then the Map link) also lands on the Overview, and Explore's camera memory still wins over it.
- "a resize": the untouched re-fit keeps the framing kind on screen.
- "/map to Home with the Overview untouched": Home behind the hero is exactly a fresh load's framing (the approved `final-home.jpg` framing) after a visit to `/map`, nothing is saved so the Map link opens at the Overview again, and a camera the visitor moved stays on Home as today.
- "a resize on Home": after that glide a resize gives the same camera as a fresh load of Home at the new size (the fit kind is the Whole map).
- "the sharper gas image at the Overview": the one new GPU behaviour of the opening view (part 1's rule, now met without a zoom) asks for one image, ends its fade, and then draws nothing at rest.
- "the gas fills the screen": the approved picture's defining trait, with the Whole map as the control, and nothing drawn at rest once the sharper image (if any) has settled. Its thresholds come from Balanced's first gas image read with `sharp` (every grid point on gas at the Overview, 6 of 12 bare at the Whole map); the browser reading itself was not run while this plan was written. If a patch fails, print the 12 numbers and look at the screenshot; do not lower the threshold. On the first green run, copy the 12 Overview and the 12 Whole map numbers the test prints (add a `console.log` of both arrays for that run, or read them from the assertion messages with `--reporter=list`) into the PR description, so a later change to the gas curve has a screen reference and nobody retunes the thresholds silently.

- [ ] **Step 13: Rewrite the two `map.spec.ts` tests that assumed reset returns to the opening view**

`frontcreck/e2e/map.spec.ts`, L3, before:

```ts
import { camera, coversSettled, shot, visibleAlbumPoint, waitForCameraIdle, waitForMap, waitForMapQuiet } from './helpers';
```

after:

```ts
import { albumSpread, camera, coversSettled, isPhone, shot, visibleAlbumPoint, waitForCameraIdle, waitForMap, waitForMapQuiet, wholeMapMiss } from './helpers';
```

Replace L37-66 ("keyboard pans and zooms, 0 resets" and "zoom buttons work") with:

```ts
test('keyboard pans and zooms, 0 gives the whole map', async ({ page }, info) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const start = await camera(page);
  await page.locator('canvas.map-canvas').focus();
  await page.keyboard.press('ArrowRight');
  expect((await camera(page)).x).toBeGreaterThan(start.x);
  await page.keyboard.press('ArrowUp');
  expect((await camera(page)).y).toBeGreaterThan(start.y);
  await page.keyboard.press('+');
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeGreaterThan(start.zoom);
  await page.keyboard.press('0');
  await waitForCameraIdle(page);
  // The map opens at the Overview (Task 0); 0 is the fit button, which gives the whole map.
  expect(wholeMapMiss(await albumSpread(page), isPhone(info))).toEqual([]);
  const whole = await camera(page);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('0');
  await waitForCameraIdle(page);
  const again = await camera(page);
  expect(Math.hypot(again.x - whole.x, again.y - whole.y) + Math.abs(again.zoom - whole.zoom)).toBeLessThan(1e-6);
});

test('zoom buttons work', async ({ page }, info) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const start = await camera(page);
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeGreaterThan(start.zoom);
  await page.getByRole('button', { name: COPY.map.reset }).click();
  await waitForCameraIdle(page);
  expect(wholeMapMiss(await albumSpread(page), isPhone(info))).toEqual([]);
  const whole = await camera(page);
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  await page.getByRole('button', { name: COPY.map.reset }).click();
  await waitForCameraIdle(page);
  const again = await camera(page);
  expect(Math.hypot(again.x - whole.x, again.y - whole.y) + Math.abs(again.zoom - whole.zoom)).toBeLessThan(1e-6);
});
```

What they still prove: arrows pan the right way, `+` and Zoom in zoom in, and `0` and Reset return to one fixed framing however the map was moved (the old tests proved that by "back to the start zoom", which is no longer the same framing by design; now by "the whole map, the same camera every time", which also pins x and y, so it is stricter). The phone project runs "keyboard pans and zooms" as before (it never skipped it); `wholeMapMiss` takes the phone padding there.

Tests in `map.spec.ts` that need no edit, and why they hold: "renders on demand" (the opening view is under 13 px covers, so it still requests no atlas and the 1200 ms idle window still counts one frame at most: the test browser is a software renderer, which never fetches the sharper gas image, `gasSharp` is `'off'`); "hover shows a label, drag pans, wheel zooms, click selects and flies" (relative moves; `0` then `visibleAlbumPoint` works at the Whole map as before); "tap selects an album" (any visible album); "Home shows the map dimmed" (no camera check).

- [ ] **Step 14: `explore.spec.ts` and `gas.spec.ts`**

`frontcreck/e2e/explore.spec.ts` L198, before:

```ts
test('the hint hides once covers show and returns at the overview', async ({ page, isMobile }) => {
```

after:

```ts
test('the hint hides once covers show and returns at the whole map', async ({ page, isMobile }) => {
```

The body is unchanged. It still proves the hint shows at the opening view (now the Overview, 11.1 px covers, where covers have not started), hides once covers show, and comes back after the fit button (now the Whole map). Only the title named the framing.

`frontcreck/e2e/gas.spec.ts`, the `beforeEach` (L25-29, found by its text), before:

```ts
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
});
```

after:

```ts
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
    // Every reading here was measured at the map's old opening view, the whole cloud ("as the map opens, the whole
    // cloud fits the pane", the lighter shader's mip level "at the overview", the registration test's px per raw
    // unit). /map now opens at the Overview (Task 0 of part 2); these tests open where they were written, and
    // e2e/opening.spec.ts reads the gas at the Overview.
    window.__rmrOpen = 'whole';
  });
});
```

What it still proves: every gas test runs exactly the framing and readings it was written for (the switch reproduces the old opening to 1e-6, pinned by "the opening switch" test). Nothing is loosened. Without it three tests would change meaning rather than fail honestly: the sharper image test (L768-772: at the Overview the first image is magnified, so it would be wanted at once), the lighter shader test (L1417-1422: at the Overview the read is level 0, under its 0.3 floor), and the registration test (L1266-1332: its tolerances are in px at the whole map's scale). Gas at the Overview is covered by `opening.spec.ts`.

Specs checked and left as they are (each loads `/map` and makes only relative moves, picks a visible album, or frames an album): `a11y.spec.ts` (L51-79, L130-145), `focus.spec.ts` (`openFocus` L26-33 frames a focus; the morph tests L147-205 need album 11 on screen through the morph: at the desktop Overview it sits at (739, 763) at Balanced, (516, 813) at Sonic, (819, 828) at Mood, all on the 900 px window; the phone tests at L270-303 use albums on screen), `flows.spec.ts` (L71-85, L118-132), `phone.spec.ts` (L120-145, L161-169), `pages.spec.ts` (L147-151), `explore.spec.ts` (every other test: picks, saved camera, album closing; "leaving an album by the header nav ... frames the whole map" still compares with `reset()`, which is still the Whole map), `search.spec.ts`, `album.spec.ts`, `smoke.spec.ts`, `nowebgl.spec.ts`.

- [ ] **Step 15: Run the browser tests: the new spec fails first**

See it fail first. `next build` type-checks the whole project (Playwright's web server runs `npm run build`), and Step 5 made `MapInput.explore` and `MapApi.opening` required, so the interface changes must be stashed with the code that fills them, or the build fails before any assertion runs. Keep `global.d.ts` (the spec sets `window.__rmrOpen`), the `state/` helpers and the e2e files:

```bash
git stash push frontcreck/src/components/map/canvas frontcreck/src/components/map/MapStage.tsx frontcreck/src/components/map/types.ts frontcreck/src/components/map/state/mapStore.ts
```

Then run:

`(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/opening.spec.ts --project=desktop --workers=1)`

Expected: FAIL on "opens at the Overview" (`overviewMiss` lists the 1st percentile about 200 px right of 24, and "every album is on screen"), "from Home", "/map to Home ..." (the Map link does not reach the Overview), "a resize", "the gas fills the screen" (the Overview patches at the far left and right read sky) and "the sharper gas image" (no request at the Whole map). "a resize on Home" passes already (today Home never leaves the Whole map). "the fit button" and "the opening switch" and "an album link" pass already: today the opening view is the Whole map. Restore (`git stash pop`), then:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/opening.spec.ts e2e/map.spec.ts e2e/explore.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/opening.spec.ts e2e/map.spec.ts e2e/explore.spec.ts --project=phone --workers=1)
```

Expected: all pass, except the picked cover test of `explore.spec.ts`, which is red on purpose since part 1 (handoff). Then the whole suite, one project at a time, failing test names to a file:

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test --project=desktop --workers=1 2>&1 | tee test-results/task0-desktop.txt)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test --project=phone --workers=1 2>&1 | tee test-results/task0-phone.txt)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test --project=nowebgl --workers=1 2>&1 | tee test-results/task0-nowebgl.txt)
```

Expected: everything passes as after part 1 (that one red test aside). A test outside the list in Step 14 that fails on a camera, a screen position or a gas reading is reporting a framing assumption this plan missed: report it with the failing assertion; do not add `__rmrOpen` to it without saying what it measured and why that framing is the one it was written for.

- [ ] **Step 16: `perf.mjs`: the opening view on its own fresh load, the budget rows exactly as the baseline measured them, the sharper image settled before the idle window**

The baseline measured drag, zoom, deep zoom and the idle window on a fresh `/map`, which opened on the whole cloud: first gesture of the page, cold atlas, no sharper gas image. After this task a fresh `/map` opens at the Overview, so the script measures the two kinds of row on two fresh loads:

1. **Opening view, reported only.** A fresh `/map` with no switch, as a visitor opens it (the Overview). The script waits for the sharper image to settle, then runs the same 2 s drag and 2 s wheel: `openingDragGapMs`, `openingZoomGapMs`.
2. **Budget rows, unchanged.** `window.__rmrOpen = 'whole'` is set by an init script, then `/map` is loaded fresh and today's `exploreFlow` body runs as it is (drag, wheel, deep zoom drag, deep morph, idle window). So the budgeted drag and zoom rows again meet a fresh page at the Whole map with a cold atlas and no sharper image, as in the baseline. The one change in that body is a wait for the sharper image before the 3 s idle window.

Why the idle wait (an independent check of the script): the idle window (L256-260) begins 1.5 s after `setCamera(home)` and `settled()`, without waiting for part 1's sharper image. On a GPU desktop the sharper image starts about 250 ms after a quiet moment plus an idle callback when it is wanted (the deep zoom and the stop change before the window make it be fetched or freed and fetched again), and its fade draws up to 14 frames. The window must start only once the image has settled.

Startup rows (search usable, startup long task, map first frame, nebula visible) are measured on Home, which still opens at the Whole map, and do not move. `albumFlow` is not touched (its `settled` array keeps its meaning; nothing new is written under that key).

`frontcreck/scripts/perf/perf.mjs`, after L35 (`const GAS_LITE = opt('--gas-lite');`) insert:

```js
// --open whole: skip the fresh /map load at the opening view (the Overview since part 2's Task 0). The budget rows
// are measured at the whole map in every run, as the baseline measured them.
const OPEN = opt('--open');
if (OPEN !== null && OPEN !== 'whole') {
  console.error('--open takes whole');
  process.exit(2);
}
```

In `PAGE_HELPERS`, after `gaps(ms) { ... },` (after L124) insert:

```js
    /** Waits until part 1's sharper gas image has settled: the flag is not 'loading' and neither it nor the frame
     * count changed for `quietMs` (longer than the 2 s retry wait of a failed load, shaders/gas.ts
     * GAS_SHARP_RETRY_MS). Phones say 'off', software renderers 'waiting' or 'off', a page with no gas layer has no
     * flag. Resolves false after `max`. */
    async sharpSettled(quietMs = 2500, max = 45000) {
      const t0 = performance.now();
      let flag = String(window.__rmr?.gasSharp);
      let frames = window.__rmr?.frames ?? 0;
      let since = t0;
      while (performance.now() - t0 < max) {
        await new Promise((r) => setTimeout(r, 50));
        const f = String(window.__rmr?.gasSharp);
        const m = window.__rmr?.frames ?? 0;
        if (f === 'loading' || f !== flag || m !== frames) {
          flag = f;
          frames = m;
          since = performance.now();
        } else if (performance.now() - since >= quietMs) return true;
      }
      return false;
    },
```

Before `exploreFlow` (before L184) insert a new flow:

```js
/** The opening view, reported only: a fresh /map as a visitor opens it (the Overview since part 2's Task 0), its
 * first drag and first wheel zoom, the same gestures as exploreFlow's. Runs before exploreFlow sets __rmrOpen. */
async function openingFlow(page, isPhone) {
  await page.goto(`${BASE}/map`, { waitUntil: 'load' });
  await page.waitForFunction((noGas) => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (noGas || window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'), NO_GAS, { timeout: 20000 });
  await page.waitForTimeout(1500);
  return page.evaluate(async (phone) => {
    const P = window.__perf;
    const res = { openingSharpSettled: await P.sharpSettled(), openingCamera: window.__rmr.map.getCamera() };
    const c = document.querySelector('canvas.map-canvas');
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const type = phone ? 'touch' : 'mouse';
    const fire = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: type, pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
    fire('pointerdown', cx, cy);
    let longest = 0;
    let last = performance.now();
    const t0 = last;
    while (performance.now() - t0 < 2000) {
      const k = (performance.now() - t0) / 2000;
      fire('pointermove', cx + Math.sin(k * 6.28) * 140, cy + Math.cos(k * 6.28) * 100);
      const now = await P.raf();
      longest = Math.max(longest, now - last);
      last = now;
    }
    fire('pointerup', cx, cy);
    res.openingDragGapMs = Math.round(longest);
    await new Promise((r2) => setTimeout(r2, 500));
    longest = 0;
    last = performance.now();
    const t1 = last;
    while (performance.now() - t1 < 2000) {
      const k = (performance.now() - t1) / 2000;
      c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx + 60, clientY: cy - 40, deltaY: k < 0.5 ? -40 : 40 }));
      const now = await P.raf();
      longest = Math.max(longest, now - last);
      last = now;
    }
    res.openingZoomGapMs = Math.round(longest);
    return res;
  }, isPhone);
}
```

(The gesture code is copied from `exploreFlow` L195-221 character for character, so the two rows are the same gestures as the budget rows.)

In `exploreFlow` (L184-263), two insertions; everything else stays as it is. At its start, before L185 (`await page.goto(`${BASE}/map`, { waitUntil: 'load' });`), insert:

```js
  // The budget rows are measured where the baseline measured them: a fresh /map at the whole map (the site's
  // opening view before part 2's Task 0). The init script applies to this load and any later one of this page.
  await page.addInitScript(() => {
    window.__rmrOpen = 'whole';
  });
```

Before L256 (`    window.__lt.length = 0;`), after the `await new Promise((r2) => setTimeout(r2, 1500));` of L255, insert:

```js
    // Part 1's sharper gas image: the deep zoom and the stop change above make it be fetched (or freed and fetched
    // again) at rest, and its fade draws up to 14 frames. The idle window starts once it has settled.
    res.idleSharpSettled = await P.sharpSettled();
    res.sharpFlag = String(window.__rmr?.gasSharp);
    res.wholeCamera = window.__rmr.map.getCamera();
```

`measure()`, L319-320, before:

```js
    ...(await albumFlow(page, vpName === 'phone')),
    ...(await exploreFlow(page, vpName === 'phone')),
```

after:

```js
    ...(await albumFlow(page, vpName === 'phone')),
    ...(OPEN ? {} : await openingFlow(page, vpName === 'phone')),
    ...(await exploreFlow(page, vpName === 'phone')),
```

The new keys (`openingSharpSettled`, `openingCamera`, `openingDragGapMs`, `openingZoomGapMs`, `idleSharpSettled`, `sharpFlag`, `wholeCamera`) collide with nothing `albumFlow` returns.

In the warning loop (L357-360), inside the same `for (const r of rows)` loop, after the `settled` warning add:

```js
      if (r.openingSharpSettled === false || r.idleSharpSettled === false) console.warn(`WARNING ${r.mode} ${r.vp}: the sharper gas image did not settle before a step (opening ${r.openingSharpSettled}, idle ${r.idleSharpSettled})`);
```

After L356 (`if (GAS_LITE) console.log(...)`) insert:

```js
    if (OPEN) console.log('Run with --open whole: the opening view rows were not measured (n/a). The budget rows are measured at the whole map in every run.\n');
```

L363, before: `JSON.stringify({ js, rows, fails }, null, 1)` after: `JSON.stringify({ js, rows, fails, open: OPEN ?? 'app' }, null, 1)`.

`frontcreck/scripts/perf/lib.mjs`, after L66 (`['Zoom worst frame gap', ...],`) insert:

```js
  ['Drag worst frame gap at the opening view (reported only)', (r) => ms(r.openingDragGapMs)],
  ['Zoom worst frame gap at the opening view (reported only)', (r) => ms(r.openingZoomGapMs)],
```

`GAP_KEYS` and `checkBudgets` are not changed: the gate stays the four rows the baseline gated, at the same framing. The two opening rows are judged by hand against the same 50 ms (`frameGapMs`) in the write-up (open question 3 asks whether they should gate).

`frontcreck/scripts/perf/lib.test.mjs`, in "prints n/a for a reported-only value ..." (L69-78), after L73 add:

```js
    expect(none).toContain('| Drag worst frame gap at the opening view (reported only) | n/a |');
    expect(none).toContain('| Zoom worst frame gap at the opening view (reported only) | n/a |');
```

and replace L74 with:

```js
    const some = formatTable([{ mode: 'gpu', ...ok, gasShownMs: 640, deepDragGapMs: 21, deepMorphGapMs: 33, openingDragGapMs: 18, openingZoomGapMs: 24 }]);
```

and after L77 add:

```js
    expect(some).toContain('| Drag worst frame gap at the opening view (reported only) | 18 ms |');
    expect(some).toContain('| Zoom worst frame gap at the opening view (reported only) | 24 ms |');
```

Run, test first: before the `lib.mjs` edit `npm run test -- scripts/perf/lib.test.mjs` fails on the two new rows; after it, it passes. Then the script on one viewport to see it run (not a timing claim):

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test -- scripts/perf/lib.test.mjs)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run build && nice -n 10 node scripts/perf/perf.mjs --mode software --viewport desktop)
```

Expected: the table has both opening rows; in the JSON under `scripts/perf/out/`, `openingCamera.zoom` is 2.157 (desktop) and `wholeCamera.zoom` 0.785 (the whole map, put back before the idle window); no WARNING line. A run with `--open whole` shows n/a in the two opening rows and the same budget rows. Judging speed follows the handoff (median of three, old and new builds in turn, mains power) and is part 2 Task 9's job; on a cloud machine with no GPU the gpu rows cannot be measured and nothing here is compared with the baseline (handoff update of 2026-10-05).

- [ ] **Step 17: `capture.mjs`: keep every baseline-named shot at the baseline's framing; add the opening view; settle the sharper image**

The baseline shots that start from `/map` were taken at the old opening view: `map-overview` ("the default view: the whole cloud fitted"), `map-whole` (two Zoom out presses from it: the floor), `map-overview-sonic` and `-mood`, `rm-map-overview`, `hover-map-*` (hovered at the opening view), and every state whose steps are relative to it (`map-zoom-steps`, `focus-rings`, `search`). The script gets `--open whole|app`, default `whole`, which opens each fresh page at the Whole map through `window.__rmrOpen`, so every baseline name keeps its framing and old runs are reproducible as they were. A new state, `map-opening`, always takes the app's own opening view, under new names.

`docs/design/trifid-theme/reviews/baseline/capture.mjs`:

Header, after the `--gas` paragraph (after L24) insert:

```js
 *   --open       where /map opens: whole (default: the whole cloud, as the site opened when the baseline was
 *                captured, so every baseline-named shot keeps its framing; it sets window.__rmrOpen before the app
 *                loads and means nothing to a build from before part 2's Task 0) or app (the app's own opening
 *                view, the Overview since Task 0). The state `map-opening` always uses the app's own opening view.
```

and in the usage line (L14 and the `console.error` at L62) add ` [--open whole|app]` after `[--gas full|lighter]`.

After the `--gas` check (L71-74, `if (GAS !== 'full' && GAS !== 'lighter') { ... }`) insert:

```js
const OPEN = flags.open ?? 'whole';
if (OPEN !== 'whole' && OPEN !== 'app') {
  console.error('--open takes whole or app');
  process.exit(2);
}
```

After `mapQuiet` (after its closing brace, before `cameraIdle`), add:

```js
/** Part 1's sharper gas image has settled: its flag is not 'loading' and neither it nor the frame count changed for
 * `quietMs` (longer than a failed load's 2 s retry wait). A build with no gas layer (gas absent or 'off') is settled
 * at once. Mirrors frontcreck/e2e/helpers.ts waitForGasSharpSettled. */
const sharpSettled = (p, quietMs = 2500) =>
  p.waitForFunction(
    (quiet) => {
      const g = window.__rmr?.gas;
      if (g === undefined || g === 'off') return true;
      const w = window;
      const s = String(window.__rmr?.gasSharp);
      const f = window.__rmr?.frames ?? 0;
      const now = performance.now();
      if (s === 'loading' || w.__capSF !== f || w.__capSS !== s) {
        w.__capSF = f;
        w.__capSS = s;
        w.__capST = now;
        return false;
      }
      return now - (w.__capST ?? now) >= quiet;
    },
    quietMs,
    { polling: 50, timeout: 45000 },
  );
```

`settle` (L177-188), before:

```js
  if (map) await mapQuiet(p, 300).catch(warn(name, 'map still drawing'));
}
```

after:

```js
  if (map) await mapQuiet(p, 300).catch(warn(name, 'map still drawing'));
  // A shot at rest must not catch the sharper gas image's fade (up to 14 frames about a second after the map
  // settles; at the Overview it is wanted from the first view on a GPU).
  if (map) await sharpSettled(p).catch(warn(name, 'sharper gas image still changing'));
}
```

On a build without the gas (the baseline's own) this returns at once, so old runs take the same time and the same pictures. On a themed build it adds up to 2.5 s to each settle (gpu mode; software and phone say `'off'` within a moment and still wait out the quiet 2.5 s once per settle). Part 2 Task 9's `--still` should reuse `sharpSettled` instead of adding its own wait (Downstream).

After the `map-zoom-steps` state (after L319, the state's closing `},`), insert:

```js
  {
    // The map as a visitor opens it since part 2's Task 0: the Overview (compare with options/final-overview.jpg),
    // then the fit button's Whole map, which must be the framing of the baseline's `map-overview`. Not in the
    // baseline. Always the app's own opening view, whatever --open says.
    name: 'map-opening', on: 'both', open: 'app',
    async run(p, s) {
      await go(p, '/map');
      await settle(p, 'map');
      await s.shot('map-opening');
      await press(p, SEL.reset, 1, s.phone);
      await settle(p, 'map');
      await s.shot('map-opening-fit');
    },
  },
```

Runner: the log object (L889) gains `open: OPEN` after `gasShader: GAS,`. After L901 (`await ctx.addInitScript((v) => { window.__rmrGasLite = v; }, ...);`) insert:

```js
      if (OPEN === 'whole' && state.open !== 'app') await ctx.addInitScript(() => { window.__rmrOpen = 'whole'; });
```

Check (no browser needed): `node --check ../docs/design/trifid-theme/reviews/baseline/capture.mjs` from `frontcreck/`. A run of one state on the built app proves the rest: `(export PATH=...; cd frontcreck && node ../docs/design/trifid-theme/reviews/baseline/capture.mjs test-results/task0-capture http://127.0.0.1:3400 --start --mode software --only map-) ` and then, in `test-results/task0-capture/capture-log-desktop.json`, the camera of `map-opening-fit` equals the camera of `map-overview` (to 1e-6) and `map-opening` has zoom 2.157 on desktop, 0.565 on the phone.

- [ ] **Step 18: `hover-measure.mjs`: hover at the baseline's framing by default; settle the sharper image before the idle**

The baseline's hover numbers were taken on a fresh `/map` at its old opening view ("at Overview" in the script header meant the whole cloud). `docs/design/trifid-theme/reviews/baseline/hover-measure.mjs`:

Header L27, before: `Arguments: <outFile.json> <baseURL> [--start] [--mode gpu|software|both] [--loads 5]` after:

```js
 * Arguments: <outFile.json> <baseURL> [--start] [--mode gpu|software|both] [--loads 5] [--open whole|app]
 *   --open  where /map opens: whole (default: the whole cloud, where the baseline hovered, through window.__rmrOpen;
 *           it means nothing to a build from before part 2's Task 0) or app (the app's own opening view, the
 *           Overview since Task 0). Either way the sharper gas image (part 1) is let settle before the idle.
```

and in the usage line L50 add ` [--open whole|app]`. After L55 (`const LOADS = ...`) insert:

```js
const OPEN = flags.open ?? 'whole';
if (OPEN !== 'whole' && OPEN !== 'app') {
  console.error('--open takes whole or app');
  process.exit(2);
}
```

In `oneLoad`, after L153 (`await page.addInitScript(INIT);`) insert:

```js
  if (OPEN === 'whole') await page.addInitScript(() => { window.__rmrOpen = 'whole'; });
```

and replace L159-160:

```js
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2000); // idle: the first hover starts from a quiet page, as a visitor's would
```

with:

```js
    await page.evaluate(() => document.fonts.ready);
    // Part 1's sharper gas image: not 'loading', and neither its flag nor the frame count changed for 2.5 s (longer
    // than a failed load's retry wait). A build with no gas layer has nothing to wait for.
    await page.waitForFunction(() => {
      const g = window.__rmr?.gas;
      if (g === undefined || g === 'off') return true;
      const w = window;
      const s = String(window.__rmr?.gasSharp);
      const f = window.__rmr?.frames ?? 0;
      const now = performance.now();
      if (s === 'loading' || w.__hvSF !== f || w.__hvSS !== s) {
        w.__hvSF = f;
        w.__hvSS = s;
        w.__hvST = now;
        return false;
      }
      return now - (w.__hvST ?? now) >= 2500;
    }, null, { polling: 50, timeout: 45000 });
    await page.waitForTimeout(2000); // idle: the first hover starts from a quiet page, as a visitor's would
```

`result` (L229) gains `open: OPEN` after `loads: LOADS,`. Check: `node --check ../docs/design/trifid-theme/reviews/baseline/hover-measure.mjs`. Part 2 Task 9 runs it twice on the final build: default (like for like with the baseline) and `--open app` (what a visitor's first hover meets now).

- [ ] **Step 19: Full unit suite, typecheck, lint, then review**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck && npm run lint && npm run test)`
Expected: all pass.

Hand the diff to a fresh reviewer with this file. The reviewer checks in particular: the opening snap still lands before the first frame (it is inside the same layout effect); `getOverviewFraming()` is still the Whole map in every consumer (`CameraRig` floor, `CameraBounds` box, `CameraTween` `reset`, `releaseView`); no album route ever starts from the Overview; `homeBackdrop` moves the camera only when it is the untouched Overview and saves no Explore camera then; nothing draws at rest; no string in `copy.ts` changed; the first-load change is the `explore` flag and the `MapStage` glide only (`npm run build` route table: `/` first-load JS within 0.2 KB of 191.2 KB).

- [ ] **Step 20: Commit and push (after the review has passed)**

```bash
git add frontcreck/src/components/map/state/bounds.ts frontcreck/src/components/map/state/bounds.test.ts \
  frontcreck/src/components/map/state/view.ts frontcreck/src/components/map/state/view.test.ts \
  frontcreck/src/components/map/types.ts frontcreck/src/components/map/state/mapStore.ts \
  frontcreck/src/components/map/canvas/InitialFrame.tsx frontcreck/src/components/map/canvas/CameraTween.tsx \
  frontcreck/src/components/map/MapStage.tsx frontcreck/src/types/global.d.ts \
  frontcreck/e2e/helpers.ts frontcreck/e2e/opening.spec.ts frontcreck/e2e/map.spec.ts frontcreck/e2e/explore.spec.ts frontcreck/e2e/gas.spec.ts \
  frontcreck/scripts/perf/perf.mjs frontcreck/scripts/perf/lib.mjs frontcreck/scripts/perf/lib.test.mjs \
  docs/design/trifid-theme/reviews/baseline/capture.mjs docs/design/trifid-theme/reviews/baseline/hover-measure.mjs
git commit -m "$(cat <<'EOF'
feat(map): /map opens at the Overview; the fit button gives the whole map

The prototype's Cam.fitOverview: the 1st to 99th percentile width fills the
pane less 24 px a side, centred on the median row (above the slider panel on
a phone), capped at 12.5 px covers. 1639.5 px per world unit at 1440 x 900
(Balanced), 402.8 on a 390 x 844 phone; the whole map stays 596.7 and 267.8.
One constant (MAP_OPENS_AT) reverts it. Home, About, 404 and album links open
as before; Home or About to the map glides to the Overview unless Explore has
a saved camera.

Tests: e2e/opening.spec.ts; map.spec's reset tests check the whole map by
where the albums land; gas.spec opens at the whole map it was measured at
(window.__rmrOpen). perf: two reported rows at the opening view on their own
fresh /map; the budget rows on a fresh /map at the whole map, as in the
baseline; the idle window waits for the sharper gas image. capture.mjs and
hover-measure.mjs: --open whole by default, a new map-opening state, sharper
image settled before shots and hovers. /map to Home with the camera untouched
glides back to the whole map (prototype app.js L114).

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018o5wEPKTzFy2Pafgts8FKM
EOF
)"
git fetch origin && git rebase origin/feat/trifid-theme && git push origin feat/trifid-theme
```

Move issue 45's board card only if the orchestrator asks (it is already In progress).

---

## Every test touched, and what it proves

| Test | Change | What it proves after the change |
|---|---|---|
| `bounds.test.ts` "overviewExtent" (2, new) | new | the percentiles use the prototype's quantile rule; the caller's array is untouched |
| `bounds.test.ts` "fitOverview" (5, new) | new | width fill less 24 px a side, the 12.5 px cap (and that it is under `ATLAS_LOAD_PX`), never wider than the whole map, the phone's median row above the slider panel, the album panel inset |
| `bounds.test.ts` "the Overview on the real map" (9, new) | new | the recorded scales of both framings on both projects at all three stops; the desktop opening camera; `CameraBounds` never nudges the opening view at 11 window sizes and 3 stops; the 1st and 99th percentile land 24 px inside the sides |
| `bounds.test.ts` existing (`fitView`, `nudgeVector`, ...) | none | unchanged: the whole-map fit and the nudge keep their numbers |
| `view.test.ts` "openingKind" (4, new) and "the Whole map stays the published fit" (1, new) | new | the constant says Overview; only `/map` with no focus opens there; album links and pages open at the Whole map; the switch works on `/map` only and ignores junk; the fit-kind record does not touch the published whole-map framing |
| `view.test.ts` "untouchedOverview" (3, new) | new | `/map` to Home shows the Whole map only while the camera is still the Overview the map opened at: not after a pan, a zoom or a pick's fly, not at the Whole map, not when nothing was recorded |
| `view.test.ts` `releaseView` (3) | none | unchanged |
| `scripts/perf/lib.test.mjs` "prints n/a for a reported-only value ..." | 4 assertions added | the two opening rows print, and print n/a for older results |
| `e2e/opening.spec.ts` (10, new; 6 on the phone) | new | see Step 12 |
| `e2e/map.spec.ts` "keyboard pans and zooms, 0 resets" -> "..., 0 gives the whole map" | rewritten | arrows and `+` move the camera; `0` gives the whole map (geometry) and is a fixed point (camera equal to 1e-6 after another move): stricter than "the start zoom" |
| `e2e/map.spec.ts` "zoom buttons work" | rewritten | Zoom in zooms; Reset gives the whole map and is a fixed point |
| `e2e/explore.spec.ts` "... returns at the overview" -> "... returns at the whole map" | title only | the hint shows at the opening view, hides over covers, shows again after the fit button |
| `e2e/gas.spec.ts`, every test | `beforeEach` sets `__rmrOpen = 'whole'` | each test runs at the framing its readings were measured at, which the switch reproduces exactly |
| `e2e/helpers.ts` | 4 helpers added | `waitForGasSharpSettled` is part 2 Task 8's helper, defined here first |

## Downstream: what this changes for the rest of part 2 and part 3

The part 2 items below have been written into `2026-10-04-trifid-theme-2-stars-lines-names.md` (change log, Global Constraints, Interfaces, Task 5 halo numbers, Task 8 helper ownership and Step 11, the `names.spec.ts` comment, Task 9 steps 7, 8, 9 and 11). The part 3 items are notes for part 3's reconciler.

- **Part 2 Task 5 (names layout).** The zoom reference stays 12.5 px covers, as part 2 already says (L2257). The scale Task 0 records for 1440 x 900 is 1639.476 px per world unit at Balanced (11.148 px covers; zoom factor 0.966), 1534.7 at Sonic, 1838.2 at Mood (capped). All three are above `NAME_LUM_PX_PER_WORLD` 600, so on the opening view an unmoved name at rest gets the solved halo; the Whole map (596.7, 708.5, 618.2) is under 600 at Balanced and Mood and over it at Sonic (708.5), so at Sonic's whole map names already take the solved halo. Part 2's L2261 sentence "the Whole map ... just under 600 ... every name has the full halo" holds for Balanced only: say so in Task 5's notes. Phone Overview 402.8 px per world unit: names on a phone always take the full halo anyway.
- **Part 2 Task 9.** `names.spec.ts`'s zoom comment: the map opens at the Overview (names showing, 11.1 px covers); "back at the overview" after zooming in means pressing the fit button, which now gives the Whole map, where names also show. Step 8 (hover): `hover-measure.mjs` hovers at the Whole map by default; run it again with `--open app` for the opening view; it already lets the sharper image settle before the idle (the fade can no longer land in a hover window). Step 9 (captures): the Overview picture to judge against `final-overview.jpg` is **`map-opening.jpg`**; `map-overview.jpg` stays the whole-cloud fit (the baseline's framing, to compare with the baseline and with `final-whole.jpg`); `map-whole.jpg` stays the zoom-out floor (0.8 of the whole map). `--still` reuses the `sharpSettled` wait that `settle` now does instead of adding a second one. Step 11's reviewer brief lists `map-opening.jpg` beside `final-overview.jpg`. Step 7 (perf) reads the two new opening rows against 50 ms.
- **Part 2 Task 8.** Reuses `waitForGasSharpSettled` from `e2e/helpers.ts` (defined in Task 0 with `quietMs = 2500`); it adds only `twinkleOff`. The twinkle's `openAtRest` and `twinkle-cost.mjs` start at the Overview now (more stars on screen, larger: 5.3 px dots at 1440 x 900): fine for the twinkle, but its cost measurement is not comparable with a run at the Whole map; say which framing in its write-up, or pass `__rmrOpen = 'whole'` for a like-for-like number.
- **Part 2 Task 2 / Task 7 / Task 9 pixel checks.** Any new browser check that reads the map at "the overview" should say which framing: the opening view is now the Overview (crop, gas everywhere), the fit button gives the Whole map.
- **Part 3 Task 3 (map under the header).** `InitialFrame.tsx` callers moved: the snap now has two fits, `fitView` and `overviewView`. `fitOverview` and `overviewView` must take `insetTop` too: the Overview's width term is unchanged, its px per world unit uses the visible height, and its median row goes to the middle of the area below the header and above the slider panel. Once part 3's frustum draws `camera.position` at the centre of the area below the header, that is still `center.y = medY - bottomCover / 2 / ppw`; check it against part 3's `visibleScale` algebra rather than trusting this line. Their unit tests gain the same "a canvas with a top inset equals a shorter canvas" pair as `fitView`. `CameraTween.opening` is one more caller. The before/after texts part 3 quotes for `InitialFrame.tsx` L91-96 (`const { zoom, center } = fitView(bounds, {`) and for the `getOverviewFraming` imports are unchanged by this task, but every line number from L99 on moved (the snap block is 8 lines longer). Re-list the callers from the code.
- **Part 3 `e2e/framing.spec.ts`.** "The overview and the whole map" must record both: the opening view (the Overview) and the fit button's Whole map; "the zoom-out floor is 0.8 of the fitted overview" stays true of the Whole map (`getOverviewFraming`, unchanged); "Reset comes back to the overview exactly" becomes "the fit button comes back to the Whole map exactly"; "Overview: every album is below the bar by the overview's top padding" holds for the Whole map only (at the Overview albums run off screen by design; check instead that the median row and the 1st/99th percentile land where `overviewMiss` says, below the header). The framing record is taken after Task 0 (part 3 reconcile notes L15).
- **Part 3 Task 9 (perf) and `compare.mjs`.** Two new reported rows with no baseline value (show "n/a" for the baseline column); the budget rows are like for like. The JSON gains `openingSharpSettled`, `openingCamera`, `openingDragGapMs`, `openingZoomGapMs`, `idleSharpSettled`, `sharpFlag`, `wholeCamera` and the top-level `open`; `settled` is still `albumFlow`'s alone.
- **Part 3 Task 10 (review shots and regression brief).** `review-shots.mjs`'s `c1-explore` is now the Overview (matches `final-overview.jpg`); a whole-map state must press the fit button (`c4-explore-whole`). Add "the map opens at the Overview", "from the untouched Overview, Home glides back to the Whole map" and "on a desktop with a GPU the opening view fetches the stop's sharper gas image (about 0.8 MB)" to the "changed on purpose" list and to "Changed from today's site, for the owner to see". The regression checklist's "In Explore a stop change never moves the camera" still compares `map-overview`, `-sonic` and `-mood` (all at the whole map with the default `--open whole`).
- **Part 3 Task 6 (Home).** Home still opens at the Whole map, and a visitor who opens `/map` and goes Home without moving the map now glides back to it (420 ms; prototype `app.js` L114), so Home's backdrop is `final-home.jpg`'s framing on both paths. A visitor who moved the map sees their own view dimmed behind the hero, as today: the Home contrast table is computed for the Whole map and must also hold over any dimmed view (it already must today). Home review shots should be taken on a fresh load of `/`.

## Open questions

Decided by the orchestrator on 2026-10-05; the implementer does not wait on them:

1. **Decided: the fit button gives the Whole map** (the handoff's ruling), one press, always. The prototype's button goes to the Overview and from there to the Whole map (`UX.md` L23, `app.js` L229-233); the owner may confirm, and the toggle would be a few lines in `reset`.
3. **Decided: the opening-view drag and zoom rows are reported only.** The perf gate stays like for like with the baseline; the write-up judges the two rows against 50 ms by hand.
4. **Decided: closing an album opened from a link keeps today's behaviour.** With no saved Explore camera it goes to the Whole map (`reset()`).
5. **Decided: the sharper gas image at the opening view is accepted** under part 1's ruling for desktops (0.6 to 0.8 MB and about 60 MB of GPU memory on every `/map` visit on a desktop with a GPU, from about 1366 x 768 up). Its cost is measured by this task's perf rows (the opening rows run after it has settled; the idle window waits for it) and pinned by "the sharper gas image at the Overview" in `opening.spec.ts`.
6. **Decided: Home, About or 404 to the map glides to the Overview** when Explore has no saved camera (the prototype's behaviour); a saved camera is kept.
7. **Decided: `/map` to Home with the Overview untouched glides back to the Whole map**, and a resize on Home fits the Whole map (the prototype, `app.js` L114; Home keeps `final-home.jpg`'s framing). A moved camera stays as today. About and 404 keep the camera.

Still for the owner:

2. **The fit button's label.** It stays "Reset view" (`COPY.map.reset`). After this task it no longer returns to the view the map opened on. A label such as "Whole map" (the prototype's tooltip names the framing) is new site copy and needs the owner's approval. Not changed here.
