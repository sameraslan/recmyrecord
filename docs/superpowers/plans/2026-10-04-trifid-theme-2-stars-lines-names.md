# Trifid Theme Part 2: Stars, Lines and Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw every album as a Trifid star inside the existing single instanced draw, replace the focus lines with white cased lines and the cover layout that keeps covers off them, and add the region names layer with its on/off toggle.

**Architecture:** The album sprite shader moves to premultiplied-alpha output with `THREE.CustomBlending` (`One`, `OneMinusSrcAlpha`), so one fragment can add star light and darken with the under-disc at once; covers, frames and hover marks stay in the same draw and keep their depth layers. Focus lines stay SVG, drawn as a casing group under a core group, with the layout rules of the prototype's `Focus.layout` merged into `layoutMarkers`. Region names are DOM lettering placed by a `useFrame` driver from a pure layout module; the toggle is one zustand flag saved in `localStorage`.

**Tech Stack:** Next 16, React 19, three 0.186 via @react-three/fiber 9, zustand 5, Tailwind 4 (plain CSS files in `src/styles/`), vitest (jsdom), Playwright (SwiftShader).

**Spec:** docs/design/trifid-theme/HANDOFF.md (section "Current state: decisions made on 2026-10-04")

This is part 2 of 3. Part 1 (`...-1-...`) provides the theme data and the gas mesh. Part 3 (`...-3-...`) provides the colour tokens, glass panels, the phone strip, Home and About, and the theme-coupled test updates. Run part 1 first, then this part, then part 3.

All commands start from the worktree root. Before any `npm` or `npx` command in a shell:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
```

## Global Constraints

- Album positions never move: no task changes `positions.json`, `normalizePositions` or `interpolateInto`.
- Nothing animates at rest: no `requestAnimationFrame` loop, no `invalidate()` from a frame that changed nothing, no looping CSS animation.
- Text reaches 4.5:1 against what is behind it (region names: against the dark halo solved for the gas under them).
- Covers stay legible: opaque, with a dark keyline, never tinted by star light at full zoom.
- Tap targets are at least 44 px on a phone.
- Every star is an album: no decorative points, no extra instances.
- Budgets in `frontcreck/scripts/perf/budgets.json` hold: one idle frame (`idleFrames: 1`), 50 ms frame gap (`frameGapMs`), 200 KB first-load JS (`firstLoadJsKb`).
- Copy rules: never show the owner's name; the catalogue is "4,000+" albums; never a number of recommendations; mood words are "handpicked"; no dashes or emoji in site copy. Any new wording needs the owner's approval before it ships.
- Machine rules: arm64 Node 22.23.3 (`export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"`; `node -p process.arch` must print `arm64`), one browser at a time, one Playwright project at a time, gentle on the laptop (no parallel test runs). Every Playwright command carries `--workers=1` (the config default is 2) and sets the PATH itself, so it can be pasted alone.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `albums.json` gains no fields. Star brightness uses album order as a stand-in for chart rank.
- Region names explain nothing: no hover, click, tooltip, legend, card, menu, pointer or search row. They are `aria-hidden` and take no pointer events.

## Review Focus

The five failure modes most likely to bite that would otherwise slip past the task tests. Each is pinned by a named test in the owning task.

1. **Theme data is null, or does not match the albums** (failed load, stale file). Stars must render white with no under-disc and no names must render. Pinned in Task 1 (`buildStarAttributes` "falls back to white stars..." tests) and Task 7 (`RegionNames.test.tsx` "renders nothing without theme data").
2. **No name can be placed**: a stop with zero labels, or a viewport so narrow or short that no box fits. The layout must return an empty list without throwing, and the driver must hide every name. Pinned in Task 5 ("returns nothing for a stop with no labels" and "returns nothing when no name fits").
3. **`localStorage` is unavailable or holds junk.** The toggle must default to on, never throw, and still work for the page load. Pinned in Task 6 (`namesPref.test.ts` "survives storage throwing on read and on write", "treats junk as on"; `store.test.ts` "still switches names off for the page load when storage is blocked").
4. **Tenor Sans has not loaded when names are first measured.** Widths measured with the fallback face must be thrown away when the face arrives. Pinned in Task 5 (`createWidthCache` "measures again after clear") and wired in Task 7 (`loadingdone` listener in `RegionNames.tsx`).
5. **Fewer recommendations than expected, or all on one side of the seed.** Zero or one recommendation must not divide by zero; a narrow fan must still end with every line at least 0.2 rad apart. Pinned in Task 3 ("lays out a seed alone and a seed with one recommendation", "fans out recommendations that all sit on one side of the seed").

## Interfaces shared with the other parts

Consumed from part 1 (not defined here):

```ts
// frontcreck/src/lib/data/theme.ts
export interface ThemeLabel { id: string; name: string; x: number; y: number; strong: boolean; n: number; p: number; rgb: [number, number, number]; lum: number }
export interface ThemeData { v: 1; n: number; positionsHash: string; bakeHalf: number; stars: { lead: number[]; bg: number[] }; labels: Record<'sonic' | 'balanced' | 'mood', ThemeLabel[]> }

// frontcreck/src/components/map/theme.ts  (all colours are [r, g, b] in 0..255)
export const SKY_RGB, EMBER_RGB /* five families */, NEUTRAL_RGB, STAR_WHITE, FRAME_RGB;
export const NAMES_BAND_PX = 13;
export const GAS_LUM_MAX = 0.6;

// frontcreck/src/components/map/data.ts
export function rawToWorld(data: Pick<MapData, 'tx'>, x: number, y: number): [number, number];
```

**Confirmed against part 1 (its Task 5):** the theme is in the map store, read as `useMapStore((s) => s.theme)` with type `ThemeData | null`; `MapStage` passes it to `MusicMap` as the `theme` prop, which writes it to the store. Task 2 step 1 still checks that it landed there and stops if it did not.

Produced by this part for part 3:

- `CLUSTER_RGB` is **removed** from `frontcreck/src/components/map/data.ts`. Task 2 puts a two-line stand-in in `MapPreviewStrip.tsx` (white dots from `STAR_WHITE`) so the build stays green; part 3 restyles the strip.
- `layoutMarkers` gains `options.minLine` (default 24). The phone strip should pass `minLine: 10` (prototype `pages.js` L120).
- `edgePoint(x0, y0, x1, y1, half): [number, number]`, `SEED_FRAME_PX = 4`, `REC_FRAME_PX = 1`, `HOT_FRAME_PX = 3` from `state/focusLayout.ts`, for drawing the strip's lines the same way.
- `useAppStore` gains `namesOn: boolean` and `setNamesOn(v: boolean): void`.
- `COPY.map.namesHide`, `COPY.map.namesShow` (wording pending approval).
- CSS classes `.rn-layer`, `.rn`, `.map-names`, `.mk-case`, `.mk-core`.

---

### Task 1: Star classes, tints and per-album attributes (pure)

**Files:**
- Create: `frontcreck/src/components/map/state/stars.ts`
- Test: `frontcreck/src/components/map/state/stars.test.ts`

**Interfaces:**
- Consumes: `ThemeData` (`@/lib/data/theme`); `EMBER_RGB`, `STAR_WHITE` (`../theme`); `DOT_BASE_PX`, `DOT_SCALE_PX`, `dotCssPx` (`./zoomLimits`).
- Produces:
  ```ts
  export const STAR_CLASS: readonly [40, 400, 1500];
  export const STAR_RADIUS: readonly [2.8, 1.9, 1.4, 1.1];
  export const STAR_GLOW: readonly [1, 0.55, 0.16, 0.12];
  export const STAR_ALPHA: readonly [1, 0.95, 0.85, 0.72];
  export const STAR_WIDE: readonly [6, 4.4, 2.6, 2.6];
  export const STAR_UNDER_HOLD = 0.5;
  export const STAR_UNDER_MAX = 0.26;
  export const DOT_AT_OVERVIEW: number;            // 1.8 + 12.5 / 3.15
  export function starClass(index: number): 0 | 1 | 2 | 3;
  export function starTint(lead: number): [number, number, number];
  export function starUnder(gasLum: number): number;
  export function starCoreCssPx(cls: number, zoom: number, canvasHeightCssPx: number): number;
  export interface StarAttributes { star: Float32Array; tint: Uint8Array; bg: Uint8Array }
  export function buildStarAttributes(n: number, theme: ThemeData | null): StarAttributes;
  ```

- [ ] **Step 1: Write the failing test**

Create `frontcreck/src/components/map/state/stars.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ThemeData } from '@/lib/data/theme';
import { EMBER_RGB, STAR_WHITE } from '../theme';
import { hitRadiusCssPx } from './hitTest';
import { DOT_MAX_PX, zoomForCoverPx } from './zoomLimits';
import { DOT_AT_OVERVIEW, STAR_ALPHA, STAR_GLOW, STAR_RADIUS, STAR_WIDE, buildStarAttributes, starClass, starCoreCssPx, starTint, starUnder } from './stars';

const H = 836;

function theme(n: number, lead: number[], bg: number[]): ThemeData {
  return { v: 1, n, positionsHash: 'x', bakeHalf: 1.75, stars: { lead, bg }, labels: { sonic: [], balanced: [], mood: [] } };
}

describe('starClass (album order stands in for chart rank)', () => {
  it('puts the first 40 albums in class 0, to 400 in class 1, to 1,500 in class 2, the rest in class 3', () => {
    expect([0, 39, 40, 399, 400, 1499, 1500, 4080].map(starClass)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('starTint', () => {
  it('is three quarters star white and one quarter the leading family hue', () => {
    const want = [0, 1, 2].map((k) => Math.round(STAR_WHITE[k] * 0.75 + EMBER_RGB[2][k] * 0.25));
    expect(starTint(2)).toEqual(want);
  });

  it('is plain star white for an album with no leading family, or a family that does not exist', () => {
    expect(starTint(-1)).toEqual([...STAR_WHITE]);
    expect(starTint(9)).toEqual([...STAR_WHITE]);
  });
});

describe('starUnder (how much dark disc the gas behind a star needs)', () => {
  it('is nothing on gas no brighter than 0.5, and never more than 0.26', () => {
    expect(starUnder(0)).toBe(0);
    expect(starUnder(0.5)).toBe(0);
    expect(starUnder(0.6)).toBeCloseTo(1 - 0.5 / 0.6, 6);
    expect(starUnder(10)).toBe(0.26);
  });
});

describe('buildStarAttributes', () => {
  it('packs class radius, glow, alpha and halo reach, the tint and the three gas luminances per album', () => {
    const a = buildStarAttributes(3, theme(3, [0, -1, 4], [10, 20, 30, 40, 50, 60, 70, 80, 90]));
    expect([...a.star.slice(0, 4)].map((v) => +v.toFixed(2))).toEqual([STAR_RADIUS[0], STAR_GLOW[0], STAR_ALPHA[0], STAR_WIDE[0]]);
    expect([...a.tint.slice(0, 3)]).toEqual(starTint(0));
    expect([...a.tint.slice(3, 6)]).toEqual([...STAR_WHITE]);
    expect([...a.tint.slice(6, 9)]).toEqual(starTint(4));
    expect([...a.bg]).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it('gives a late album the faintest class', () => {
    const a = buildStarAttributes(1501, null);
    expect([...a.star.slice(4 * 1500, 4 * 1500 + 4)].map((v) => +v.toFixed(2))).toEqual([STAR_RADIUS[3], STAR_GLOW[3], STAR_ALPHA[3], STAR_WIDE[3]]);
  });

  it('falls back to white stars with no under-disc when the theme data is missing', () => {
    const a = buildStarAttributes(2, null);
    expect([...a.tint]).toEqual([...STAR_WHITE, ...STAR_WHITE]);
    expect([...a.bg]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('falls back to white stars when the theme data is for a different number of albums', () => {
    const wrongN = buildStarAttributes(2, theme(3, [0, 1, 2], [9, 9, 9, 9, 9, 9, 9, 9, 9]));
    const short = buildStarAttributes(2, theme(2, [0], [9, 9, 9]));
    for (const a of [wrongN, short]) {
      expect([...a.tint]).toEqual([...STAR_WHITE, ...STAR_WHITE]);
      expect([...a.bg]).toEqual([0, 0, 0, 0, 0, 0]);
    }
  });
});

describe('star size against the dot size the hit test uses', () => {
  it('uses the dot rule relative to its value at 12.5 px covers', () => {
    expect(DOT_AT_OVERVIEW).toBeCloseTo(1.8 + 12.5 / 3.15, 10);
    expect(starCoreCssPx(0, zoomForCoverPx(12.5, H), H)).toBeCloseTo(2 * STAR_RADIUS[0], 6);
  });

  it('never draws a star core wider than the dot, so the 14 px and 24 px hit radii still cover it', () => {
    for (const cover of [1, 4, 8, 12.5, 16, 24, 32, 64]) {
      for (const cls of [0, 1, 2, 3]) {
        const core = starCoreCssPx(cls, zoomForCoverPx(cover, H), H);
        expect(core).toBeLessThanOrEqual(DOT_MAX_PX);
        expect(core / 2).toBeLessThan(hitRadiusCssPx('mouse'));
        expect(core / 2).toBeLessThan(hitRadiusCssPx('touch'));
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `(cd frontcreck && npm run test -- src/components/map/state/stars.test.ts)`
Expected: FAIL, `Failed to resolve import "./stars"`.

- [ ] **Step 3: Write the implementation**

Create `frontcreck/src/components/map/state/stars.ts`:

```ts
/** The Trifid stars: every album is one star, drawn by the album sprite shader (shaders/album.ts). This file
 * holds the numbers and the per-album attributes; the shader mirrors the formulas. */
import type { ThemeData } from '@/lib/data/theme';
import { EMBER_RGB, STAR_WHITE } from '../theme';
import { DOT_BASE_PX, DOT_SCALE_PX, dotCssPx } from './zoomLimits';

/** Album index below which a star is of class 0, 1 or 2; every later album is class 3. Album order stands in
 * for chart rank here: albums.json is in chart order and has no rank field (and must not gain one). Change the
 * brightness cut-offs in this one place. */
export const STAR_CLASS = [40, 400, 1500] as const;
/** Core radius per class, CSS px at the Overview scale (12.5 px covers). */
export const STAR_RADIUS = [2.8, 1.9, 1.4, 1.1] as const;
/** Bloom strength per class. */
export const STAR_GLOW = [1, 0.55, 0.16, 0.12] as const;
export const STAR_ALPHA = [1, 0.95, 0.85, 0.72] as const;
/** How far the bloom reaches, in core radii, once the map is zoomed in enough for wide halos. */
export const STAR_WIDE = [6, 4.4, 2.6, 2.6] as const;
/** Share of the leading family's hue in a star's colour; the rest is STAR_WHITE. */
export const STAR_TINT_MIX = 0.25;
/** The dark under-disc holds the gas beside a star to this luminance, with at most this alpha. */
export const STAR_UNDER_HOLD = 0.5;
export const STAR_UNDER_MAX = 0.26;
/** The dot diameter (state/zoomLimits.ts) when covers would be 12.5 px: star sizes are relative to it. */
export const DOT_AT_OVERVIEW = DOT_BASE_PX + 12.5 / DOT_SCALE_PX;

export function starClass(index: number): 0 | 1 | 2 | 3 {
  if (index < STAR_CLASS[0]) return 0;
  if (index < STAR_CLASS[1]) return 1;
  if (index < STAR_CLASS[2]) return 2;
  return 3;
}

/** Star colour, 0..255: near white with a quarter of the leading colour family's hue. */
export function starTint(lead: number): [number, number, number] {
  const hue = Number.isInteger(lead) && lead >= 0 && lead < EMBER_RGB.length ? EMBER_RGB[lead] : STAR_WHITE;
  return [0, 1, 2].map((k) => Math.round(STAR_WHITE[k] * (1 - STAR_TINT_MIX) + hue[k] * STAR_TINT_MIX)) as [number, number, number];
}

/** Alpha of the dark under-disc for gas of luminance `gasLum` behind the star (JS mirror of the vertex shader). */
export function starUnder(gasLum: number): number {
  return Math.min(STAR_UNDER_MAX, Math.max(0, 1 - STAR_UNDER_HOLD / Math.max(gasLum, 0.001)));
}

/** Diameter of a star's core in CSS px (JS mirror of the vertex shader, before the dimmed map's enlargement). */
export function starCoreCssPx(cls: number, zoom: number, canvasHeightCssPx: number): number {
  return 2 * Math.max(0.8, (STAR_RADIUS[cls] * dotCssPx(zoom, canvasHeightCssPx)) / DOT_AT_OVERVIEW);
}

export interface StarAttributes {
  /** 4 per album: class radius, glow, alpha, halo reach. */
  star: Float32Array;
  /** 3 per album: star colour, 0..255. */
  tint: Uint8Array;
  /** 3 per album: gas luminance under it at sonic, balanced, mood; 0..255 for 0..GAS_LUM_MAX. */
  bg: Uint8Array;
}

function usable(theme: ThemeData | null, n: number): theme is ThemeData {
  return !!theme && theme.n === n && theme.stars.lead.length === n && theme.stars.bg.length === 3 * n;
}

/** Per-album star attributes. Without usable theme data every star is plain white with no under-disc. */
export function buildStarAttributes(n: number, theme: ThemeData | null): StarAttributes {
  const star = new Float32Array(4 * n);
  const tint = new Uint8Array(3 * n);
  const bg = new Uint8Array(3 * n);
  const ok = usable(theme, n);
  for (let i = 0; i < n; i++) {
    const c = starClass(i);
    star[4 * i] = STAR_RADIUS[c];
    star[4 * i + 1] = STAR_GLOW[c];
    star[4 * i + 2] = STAR_ALPHA[c];
    star[4 * i + 3] = STAR_WIDE[c];
    const t = ok ? starTint(theme.stars.lead[i]) : STAR_WHITE;
    tint[3 * i] = t[0];
    tint[3 * i + 1] = t[1];
    tint[3 * i + 2] = t[2];
    if (ok) for (let k = 0; k < 3; k++) bg[3 * i + k] = Math.min(255, Math.max(0, Math.round(theme.stars.bg[3 * i + k])));
  }
  return { star, tint, bg };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `(cd frontcreck && npm run test -- src/components/map/state/stars.test.ts)`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add frontcreck/src/components/map/state/stars.ts frontcreck/src/components/map/state/stars.test.ts
git commit -m "feat(map): star classes, tints and per-album star attributes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Stars in the one album draw (shader, material, attributes)

**Files:**
- Modify: `frontcreck/src/components/map/shaders/album.ts` (imports L1-14; comments L16-21 and L35-41; shaders L83-341)
- Modify: `frontcreck/src/components/map/shaders/album.test.ts` (imports L3-4; append tests after L85)
- Modify: `frontcreck/src/components/map/canvas/AlbumField.tsx` (L9, L30-38, L45-64, L67-99, new effect after L133)
- Modify: `frontcreck/src/components/map/data.ts` (L1, L9-12)
- Modify: `frontcreck/src/components/album/MapPreviewStrip.tsx` (L6, L14-15: stand-in only, part 3 owns the restyle)

**Interfaces:**
- Consumes: `buildStarAttributes`, `DOT_AT_OVERVIEW`, `STAR_UNDER_HOLD`, `STAR_UNDER_MAX` (Task 1); `FRAME_RGB`, `GAS_LUM_MAX`, `STAR_WHITE` (`../theme`, part 1); `useMapStore((s) => s.theme): ThemeData | null` (part 1, inferred).
- Produces: `ALBUM_VERTEX_SHADER`, `ALBUM_FRAGMENT_SHADER` with attributes `a_star` (vec4), `a_tint` (vec3), `a_bg` (vec3); `a_clusterId`, `u_clusterColors` and `CLUSTER_RGB` are gone. `spriteCssSize`, `renderedSpriteCssSize`, `selectedSpriteCssSize`, `selectedIsProminent` and every exported constant keep their signatures and values.

**Design notes the implementer needs.**

*Blending.* The fragment writes premultiplied colour: `vec4(rgb, a)` blended with `src = One`, `dst = OneMinusSrcAlpha`. A star fragment is `vec4(light, underAlpha)`: its light adds, its alpha (the under-disc) darkens what is behind. A cover fragment is `vec4(rgb * a, a)`, which is ordinary alpha blending. One draw does both.

*Depth layers with wide glow quads.* The material keeps `depthWrite: true` and `depthFunc: LessEqual`; the vertex shader puts each sprite at z = layer (0 default, 0.1 focus neighbour, 0.2 hover, 0.3 seed, 0.4 picked). A fragment that is not discarded writes depth over its whole footprint, so a wide glow on an elevated sprite would stop later neighbours from drawing inside its halo. The rule: **a sprite on any layer above 0 has no star light and no under-disc** (`starA = 0.0; under = 0.0;` in the vertex shader), and the fragment shader discards every fragment with neither colour nor alpha. Why this is correct:
  - All layer-0 fragments are written at the same depth, and `LessEqual` passes equal depth, so layer-0 halos blend over each other in instance order exactly as if the depth test were off. No halo can block another layer-0 sprite.
  - An elevated sprite keeps only its own shape (hover ring and core, anchor ring, picked cover with mat and frame). Those are the only pixels where it writes the nearer depth, and they are exactly the pixels where it should hide later, lower sprites. Everywhere else it is discarded, so it writes no depth and punches no hole.
  - An elevated sprite drawn after a neighbour's halo passes the depth test and paints over it; drawn before, the neighbour's halo is rejected only under the elevated shape.

*Hit test: nothing changes.* `albumAt` (`canvas/CursorTracker.tsx` L41-46) takes `renderedSpriteCssSize(...) / 2` as the drawn radius and `spriteHitRadiusCssPx` returns `max(14 or 24, size / 2)`. `renderedSpriteCssSize` still returns the dot or cover size, which this task does not change. A star's core diameter is `2 * STAR_RADIUS[c] * dot / DOT_AT_OVERVIEW`; the largest is `2 * 2.8 * 7.2 / 5.768 = 6.99` CSS px, under the 7.2 px dot and far under the 28 px mouse target. Task 1's "never draws a star core wider than the dot" test pins it. The glow is light, not the album, and is not a hit target.

*Known difference from the prototype.* The prototype draws all under-discs, then all star light. In one draw they interleave, so a later star's under-disc (at most 26%) can dim an earlier neighbour's glow where they overlap. Accepted.

- [ ] **Step 1: Check part 1's hand-off**

Run:

```bash
grep -n "theme" frontcreck/src/components/map/state/mapStore.ts
grep -n "export function rawToWorld\|export const \(FRAME_RGB\|STAR_WHITE\|EMBER_RGB\|GAS_LUM_MAX\|NAMES_BAND_PX\)" frontcreck/src/components/map/data.ts frontcreck/src/components/map/theme.ts
```

Expected: the first prints a `theme: ThemeData | null` field on `MapStore`; the second prints six lines. If the store has no `theme` field, or any export is missing, stop and report the mismatch between parts 1 and 2 to the orchestrator; do not invent the missing piece.

- [ ] **Step 2: Write the failing tests**

In `frontcreck/src/components/map/shaders/album.test.ts`, replace the import on L4:

```ts
import { ALBUM_VERTEX_SHADER, renderedSpriteCssSize, selectedIsProminent, selectedSpriteCssSize, spriteCssSize } from "./album";
```

with:

```ts
import { ALBUM_FRAGMENT_SHADER, ALBUM_VERTEX_SHADER, renderedSpriteCssSize, selectedIsProminent, selectedSpriteCssSize, spriteCssSize } from "./album";
```

and append at the end of the file:

```ts
describe("stars in the album draw", () => {
  it("takes the star, tint and gas attributes, and no cluster colour", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/attribute vec4 a_star;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/attribute vec3 a_tint;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/attribute vec3 a_bg;/);
    expect(ALBUM_VERTEX_SHADER + ALBUM_FRAGMENT_SHADER).not.toMatch(/a_clusterId|u_clusterColors|v_clusterId/);
  });

  it("mixes the gas luminance by the slider with the same piecewise rule as the positions", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float t = u_sliderT \* 2\.0;\s*return mix\(a_bg\.x, a_bg\.y, t\);/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/float t = \(u_sliderT - 0\.5\) \* 2\.0;\s*return mix\(a_bg\.y, a_bg\.z, t\);/);
  });

  it("sizes the star from the dot rule at Overview and fades it out as the cover fades in", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float sizeK = dotCss \/ 5\.7683;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/\* \(1\.0 - coverT\) \* clamp\(sizeK \* sizeK, 0\.45, 1\.0\)/);
  });

  it("holds the under-disc to gas of luminance 0.5 with at most 0.26 alpha", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float under = clamp\(1\.0 - 0\.5000 \/ max\(interpolateBg\(\) \* 0\.6000, 0\.001\), 0\.0, 0\.2600\);/);
  });

  it("gives a sprite on an elevated layer no glow and no under-disc, so its halo cannot write depth", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/if \(layer > 0\.0\) \{\s*starA = 0\.0;\s*under = 0\.0;\s*\}/);
  });

  it("keeps the sprite quad to the star's reach", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float reach = r \* mix\(2\.6, a_star\.w, haloT\) \+ 1\.0;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/quadCss = min\(max\(quadCss, starQuad\), capCss\);/);
  });

  it("writes premultiplied colour and discards fragments with neither colour nor alpha", () => {
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/vec3 rgb = col \* alpha \+ v_tint\.rgb \* light \* \(1\.0 - alpha\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/float a = alpha \+ under \* \(1\.0 - alpha\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/if \(a < 0\.004 && max\(rgb\.r, max\(rgb\.g, rgb\.b\)\) < 0\.004\) discard;/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/gl_FragColor = vec4\(rgb, a\);/);
  });

  it("uses the Trifid frame and backing colours, and none of the old lamp, paper or room literals", () => {
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/const vec3 FRAME = vec3\(0\.9451, 0\.9255, 0\.8941\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/const vec3 BACKING = vec3\(0\.0275, 0\.0235, 0\.0392\);/);
    expect(ALBUM_FRAGMENT_SHADER).not.toMatch(/\b(PAPER|LAMP|ROOM)\b/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `(cd frontcreck && npm run test -- src/components/map/shaders/album.test.ts)`
Expected: FAIL in "stars in the album draw" (8 failing), for example `expected '…' to match /attribute vec4 a_star;/`. The earlier tests still pass.

- [ ] **Step 4: Rewrite the shaders**

In `frontcreck/src/components/map/shaders/album.ts`, replace the import block (L1-14) with:

```ts
import { FRAME_RGB, GAS_LUM_MAX } from "../theme";
import { DOT_AT_OVERVIEW, STAR_UNDER_HOLD, STAR_UNDER_MAX } from "../state/stars";
import {
  COVER_FADE_END_PX,
  COVER_FADE_START_PX,
  COVER_MAX_PX,
  COVER_WORLD,
  DOT_BASE_PX,
  DOT_MAX_PX,
  DOT_MIN_PX,
  DOT_SCALE_PX,
  FRUSTUM_HALF_HEIGHT,
  coverCssPx,
  coverFade,
  dotCssPx,
} from "../state/zoomLimits";
```

Replace the comment on L16-20 with:

```ts
/**
 * Sprite sizes (see state/zoomLimits.ts): the album's body is a dot of 3 to 7 CSS px that grows gently with the
 * map scale, cross-fading to a cover whose size is linear in the map scale (COVER_WORLD world units, 16 to 32
 * CSS px during the fade, at most 64). While it is a dot, what is drawn is a star inside that dot size
 * (state/stars.ts) with a soft glow around it; the star fades out as the cover fades in. An album whose atlas
 * sheet has not loaded yet stays a star.
 */
```

Leave L22-81 (the JS mirrors and constants) as they are. Replace everything from `const f = (v: number) => v.toFixed(4);` (L83) to the end of the file with:

```ts
const f = (v: number) => v.toFixed(4);
const v3 = (c: readonly number[]) => `vec3(${c.map((v) => f(v / 255)).join(", ")})`;

/** The page colour (#07060a): the mat behind the picked cover, and the tone dimmed covers darken towards. */
const BACKING_RGB = [7, 6, 10] as const;
/** The dark casing under white marks, the same as the focus lines' casing (rgb 6, 6, 10). */
const CASING_RGB = [6, 6, 10] as const;
/** How far covers outside the focus darken towards the backing (prototype overlay.js: rgba(7,6,10,.6)). */
const FOCUS_COVER_DARK = 0.6;

export const ALBUM_VERTEX_SHADER = /* glsl */ `
  attribute vec2 a_pos_sonic;
  attribute vec2 a_pos_balanced;
  attribute vec2 a_pos_mood;
  attribute vec4 a_atlasUV;       // (u, v, w, h)
  attribute float a_atlasIndex;   // float so vertex attribs work
  attribute vec4 a_star;          // class radius (CSS px at Overview), glow, alpha, halo reach in radii
  attribute vec3 a_tint;          // star colour (sRGB, 0..1)
  attribute vec3 a_bg;            // gas luminance under the album at sonic, balanced, mood (0..1 of GAS_LUM_MAX)

  uniform float u_sliderT;
  uniform float u_zoom;          // real camera.zoom
  uniform float u_canvasHeight;  // CSS px
  uniform float u_pixelRatio;
  uniform float u_focusedAlbumIndex;
  uniform float u_neighborMask[12];  // focus album indices (seed first), padded with -1
  uniform float u_hoverIndex;   // -1 = no hover target
  uniform float u_selectedIndex; // album picked in Explore, -1 = none (always -1 in album view)
  uniform float u_maxSpritePx;  // device px cap, viewportHeightCssPx * 0.18 * dpr
  uniform float u_atlasLoaded[5];
  uniform float u_dotAlpha;     // eases from DOT_ALPHA to DOT_ALPHA_DIMMED as the map dims

  varying vec4 v_atlasRect;     // atlas cell: origin.xy, size.zw
  varying float v_atlasIndex;
  varying float v_dim;          // 1 = outside the focus in album view
  varying float v_hovered;      // 1 = this instance is the hover target
  varying float v_anchor;       // 1 = focus album, drawn as a small ring under its DOM cover
  varying float v_coverT;       // 0 = star, 1 = cover fully shown
  varying vec4 v_size;          // CSS px: body (dot or cover), point sprite, dot at this zoom, hover mark gap
  varying float v_sel;          // 1 = the picked album, drawn large and framed (cover mode)
  varying float v_selDim;       // 1 = another album while one is picked
  varying vec4 v_star;          // core radius and light reach (CSS px), glow, wide-halo amount
  varying vec4 v_tint;          // star colour, star alpha
  varying float v_under;        // alpha of the dark under-disc

  vec2 interpolatePos() {
    if (u_sliderT <= 0.5) {
      float t = u_sliderT * 2.0;
      return mix(a_pos_sonic, a_pos_balanced, t);
    }
    float t = (u_sliderT - 0.5) * 2.0;
    return mix(a_pos_balanced, a_pos_mood, t);
  }

  // The same piecewise rule as the positions, so the under-disc follows the gas through a slider morph.
  float interpolateBg() {
    if (u_sliderT <= 0.5) {
      float t = u_sliderT * 2.0;
      return mix(a_bg.x, a_bg.y, t);
    }
    float t = (u_sliderT - 0.5) * 2.0;
    return mix(a_bg.y, a_bg.z, t);
  }

  bool isHighlighted(float instanceIndex) {
    for (int i = 0; i < 12; i++) {
      if (abs(u_neighborMask[i] - instanceIndex) < 0.5) return true;
    }
    return false;
  }

  float atlasLoaded(int idx) {
    if (idx == 0) return u_atlasLoaded[0];
    if (idx == 1) return u_atlasLoaded[1];
    if (idx == 2) return u_atlasLoaded[2];
    if (idx == 3) return u_atlasLoaded[3];
    if (idx == 4) return u_atlasLoaded[4];
    return 0.0;
  }

  void main() {
    float instanceIndex = float(gl_InstanceID);
    vec2 worldPos = interpolatePos();

    // Sizes mirror spriteCssSize (shaders/album.ts) and state/zoomLimits.ts.
    float pxPerWorld = u_canvasHeight * u_zoom / ${f(2 * FRUSTUM_HALF_HEIGHT)};
    float dotCss = clamp(${f(DOT_BASE_PX)} + pxPerWorld * ${f(COVER_WORLD / DOT_SCALE_PX)}, ${f(DOT_MIN_PX)}, ${f(DOT_MAX_PX)});
    float coverCss = min(${f(COVER_MAX_PX)}, ${f(COVER_WORLD)} * pxPerWorld);
    float coverT = smoothstep(${f(COVER_FADE_START_PX)}, ${f(COVER_FADE_END_PX)}, coverCss)
      * step(0.5, atlasLoaded(int(a_atlasIndex)));
    // Star scale (state/stars.ts): the dot rule relative to its value at Overview, before the dimmed enlargement.
    float sizeK = dotCss / ${f(DOT_AT_OVERVIEW)};
    // The dimmed backdrop (Home, About, 404) draws larger, fainter stars (mockup muted), eased with the alpha.
    float mutedT = clamp((${f(DOT_ALPHA)} - u_dotAlpha) / ${f(DOT_ALPHA - DOT_ALPHA_DIMMED)}, 0.0, 1.0);
    dotCss *= 1.0 + ${f(MUTED_DOT_SCALE - 1)} * mutedT;
    float baseCss = mix(dotCss, coverCss, coverT);

    // Draw-order layers via depth (the material writes depth, LessEqual
    // test). All albums share one instanced draw, so without this a later
    // instance paints over an earlier one. Layers, toward the camera:
    // focused 0.3 > hovered 0.2 > highlighted neighbour 0.1 > everything
    // else 0.0. Same-layer sprites keep plain painter's order.
    // The picked album in cover mode (Explore) is above everything: 0.4.
    float layer = 0.0;
    if (u_focusedAlbumIndex >= 0.0 && isHighlighted(instanceIndex)) layer = 0.1;
    if (abs(u_hoverIndex - instanceIndex) < 0.5) layer = 0.2;
    if (abs(u_focusedAlbumIndex - instanceIndex) < 0.5) layer = 0.3;
    float isSelected = (u_selectedIndex >= 0.0 && abs(u_selectedIndex - instanceIndex) < 0.5) ? 1.0 : 0.0;
    v_sel = (isSelected > 0.5 && coverT > 0.5) ? 1.0 : 0.0;
    v_selDim = (u_selectedIndex >= 0.0 && isSelected < 0.5) ? 1.0 : 0.0;
    if (v_sel > 0.5) layer = 0.4;

    vec4 mvPos = modelViewMatrix * vec4(worldPos, layer, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // The star: core radius, how far its light reaches, and the dark disc the gas behind it needs.
    float r = a_star.x * sizeK * (1.0 + ${f(MUTED_DOT_SCALE - 1)} * mutedT);
    float faint = min(1.0, r / 0.8);   // a star smaller than 0.8 px is drawn at 0.8 px, fainter
    r = max(r, 0.8);
    float haloT = smoothstep(5.0, 7.0, coverCss);   // no wide halos while the map is zoomed far out
    float wideStar = step(3.0, a_star.w);           // the two brightest classes
    float reach = r * mix(2.6, a_star.w, haloT) + 1.0;
    float under = clamp(1.0 - ${f(STAR_UNDER_HOLD)} / max(interpolateBg() * ${f(GAS_LUM_MAX)}, 0.001), 0.0, ${f(STAR_UNDER_MAX)});
    float starA = a_star.z * faint * (1.0 - coverT) * clamp(sizeK * sizeK, 0.45, 1.0) * (u_dotAlpha / ${f(DOT_ALPHA)});
    // Depth rule: only layer-0 sprites reach past their own shape. An elevated sprite (focus, hover, picked)
    // writes a nearer depth wherever it is not discarded, so a glow on it would hide its neighbours.
    if (layer > 0.0) {
      starA = 0.0;
      under = 0.0;
    }

    v_dim = 0.0;
    v_anchor = 0.0;
    if (u_focusedAlbumIndex >= 0.0) {
      if (isHighlighted(instanceIndex)) {
        v_anchor = 1.0;   // focus albums are drawn as DOM covers; the point is a small ring on the true position
        baseCss = 12.0;
        coverT = 0.0;
      } else {
        v_dim = 1.0;   // same size as in the overview (mockup), only fainter
      }
    }
    v_hovered = (abs(u_hoverIndex - instanceIndex) < 0.5 && v_anchor < 0.5 && v_sel < 0.5) ? 1.0 : 0.0;
    if (v_sel > 0.5) baseCss = max(baseCss * ${f(SELECTED_SCALE)}, ${f(SELECTED_MIN_PX)});
    // Hover mark (mockup): a ring of radius 7 around a dot, a square stroke 3 px outside a cover, and in
    // between a stroke that follows the drawn shape at a gap that shrinks to 3 px. The sprite grows to hold it
    // and its dark casing (2 px either side of the stroke's centre).
    float markGap = mix(max(7.0 - 0.5 * baseCss, 3.0), 3.0, coverT);
    float quadCss = v_hovered > 0.5 ? max(baseCss + 2.0 * markGap + 6.0, 21.0) : baseCss;
    if (v_sel > 0.5) quadCss = baseCss + ${f(SELECTED_QUAD_EXTRA)};
    // Clamp at 240 device-px (most GPUs cap GL_POINTS sprites around 256) and at u_maxSpritePx (a
    // viewport-relative cap so a single cover never dominates a short window).
    float capCss = min(240.0, u_maxSpritePx) / u_pixelRatio;
    if (v_sel > 0.5 && quadCss > capCss) {
      // The frame keeps its size; the cover gives way (selectedSpriteCssSize mirrors this).
      baseCss = capCss - ${f(SELECTED_QUAD_EXTRA)};
      quadCss = capCss;
    } else if (quadCss > capCss) {
      baseCss *= capCss / quadCss;
      quadCss = capCss;
    }
    // The quad is only as large as the star needs: its light's reach, or the under-disc (gone at 3 r + 1).
    float starQuad = starA > 0.003 ? 2.0 * (max(reach, under > 0.0 ? 3.0 * r + 1.0 : 0.0) + 1.0) : 0.0;
    quadCss = min(max(quadCss, starQuad), capCss);
    gl_PointSize = quadCss * u_pixelRatio;

    v_coverT = coverT;
    v_size = vec4(baseCss, quadCss, dotCss, markGap);
    v_atlasRect = a_atlasUV;
    v_atlasIndex = a_atlasIndex;
    v_star = vec4(r, reach, a_star.y * mix(1.0, mix(0.3, 1.0, haloT), wideStar), wideStar * haloT);
    v_tint = vec4(a_tint, starA);
    v_under = under;
  }
`;

export const ALBUM_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D u_atlas0;
  uniform sampler2D u_atlas1;
  uniform sampler2D u_atlas2;
  uniform sampler2D u_atlas3;
  uniform sampler2D u_atlas4;
  uniform float u_pixelRatio;
  uniform float u_focusDim;   // star alpha factor outside the focus
  uniform float u_selDim;     // brightness factor of the other covers while an album is picked

  const vec3 FRAME = ${v3(FRAME_RGB)};
  const vec3 BACKING = ${v3(BACKING_RGB)};
  const vec3 CASING = ${v3(CASING_RGB)};

  varying vec4 v_atlasRect;
  varying float v_atlasIndex;
  varying float v_dim;
  varying float v_hovered;
  varying float v_anchor;
  varying float v_coverT;
  varying vec4 v_size;
  varying float v_sel;
  varying float v_selDim;
  varying vec4 v_star;
  varying vec4 v_tint;
  varying float v_under;

  /** Signed distance to a sharp-cornered square of half size h. */
  float squareSd(vec2 p, float h) {
    vec2 q = abs(p) - vec2(h);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  }

  vec3 sampleAtlas(int idx, vec2 uv) {
    if (idx == 0) return texture2D(u_atlas0, uv).rgb;
    if (idx == 1) return texture2D(u_atlas1, uv).rgb;
    if (idx == 2) return texture2D(u_atlas2, uv).rgb;
    if (idx == 3) return texture2D(u_atlas3, uv).rgb;
    return texture2D(u_atlas4, uv).rgb;
  }

  /** 1 inside a band of width w centred on d = 0, with a one-device-pixel soft edge. */
  float band(float d, float w, float aa) {
    return 1.0 - smoothstep(0.5 * w - 0.5 * aa, 0.5 * w + 0.5 * aa, abs(d));
  }

  /** Colour c at coverage a over (col, alpha), both straight alpha. */
  void over(inout vec3 col, inout float alpha, vec3 c, float a) {
    float outA = a + alpha * (1.0 - a);
    col = (c * a + col * alpha * (1.0 - a)) / max(outA, 0.0001);
    alpha = outA;
  }

  void main() {
    // Colours are authored in sRGB; ShaderMaterial does not apply the linear->sRGB output
    // conversion, so the literal values go straight to the framebuffer.
    // Everything below is in CSS px from the sprite centre (y down), so it is the same at every dpr.
    vec2 p = (gl_PointCoord - vec2(0.5)) * v_size.y;
    float aa = 1.0 / max(u_pixelRatio, 0.0001);   // one device pixel
    float d = length(p);

    // The star: a crisp core with a bloom that falls to nothing at its reach (light, added), and under it a
    // dark disc, strongest out to 0.8 r and gone by 3 r + 1 (alpha only). Both are zero on elevated sprites.
    float starA = v_tint.a * (v_dim > 0.5 ? u_focusDim : 1.0);
    float light = 0.0;
    float under = 0.0;
    if (starA > 0.0) {
      float r = v_star.x;
      float win = clamp(1.0 - d / v_star.y, 0.0, 1.0);
      float core = 1.0 - smoothstep(r - 0.6 * aa, r + 0.6 * aa, d);
      float x = d / r;
      float bloom = v_star.z * (0.5 * exp(-x * x * 0.3) + 0.2 * v_star.w * exp(-x * x * 0.045)) * win * win;
      light = (core + bloom * (1.0 - core)) * starA;
      float fall = clamp(1.0 - (d - r * 0.8) / (r * 2.2 + 1.0), 0.0, 1.0);
      under = v_under * min(1.0, starA * 1.4) * fall * fall;
    }

    // The album's body: a rounded box whose corner shrinks from a full circle (dot size) to 2 px (cover).
    float halfSize = 0.5 * v_size.x;
    float corner = mix(halfSize, min(halfSize, 2.0), v_coverT);
    vec2 q = abs(p) - vec2(halfSize - corner);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
    float mask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, sd);

    vec3 col = BACKING;
    float alpha = 0.0;
    if (v_coverT > 0.0) {
      vec2 local = clamp(p / max(v_size.x, 0.0001) + 0.5, 0.0, 1.0);
      col = sampleAtlas(int(v_atlasIndex), v_atlasRect.xy + local * v_atlasRect.zw);
      // Other covers step back by darkening, not by turning see-through, so they stay crisp on the gas.
      if (v_dim > 0.5) col = mix(col, BACKING, ${f(FOCUS_COVER_DARK)});
      if (v_selDim > 0.5) col = mix(col, BACKING, 1.0 - u_selDim);
      // A 1 px dark keyline just inside the edge keeps a pale cover apart from bright gas.
      col = mix(col, CASING, 0.9 * smoothstep(-1.0 - 0.5 * aa, -1.0 + 0.5 * aa, sd));
      // Squared: a half-faded cover would read as a dark box on the gas.
      alpha = mask * v_coverT * v_coverT;
    }
    if (v_sel > 0.5) {
      // The picked cover is opaque, on a dark mat that reaches its 2 px frame 4 px outside it.
      float frameSd = squareSd(p, halfSize + ${f(SELECTED_FRAME_GAP_PX)});
      col = mix(BACKING, col, mask);
      alpha = max(alpha, 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, frameSd));
      over(col, alpha, FRAME, band(frameSd, ${f(SELECTED_FRAME_PX)}, aa));
    }
    if (v_anchor > 0.5) {
      // A hollow ring on the album's true position (a filled dot would read as a bright star).
      float ring = d - 3.4;
      col = CASING;
      alpha = band(ring, 3.5, aa) * 0.8;
      over(col, alpha, FRAME, band(ring, 1.3, aa));
    }

    if (v_hovered > 0.5) {
      // A 1.5 px stroke v_size.w outside the drawn shape, on a dark casing: a circle around a star (radius
      // 7), a square with sharp corners around a full cover, following the shape through the cross-fade.
      float markHalf = halfSize + v_size.w;
      float markCorner = mix(markHalf, 0.0, v_coverT);
      vec2 mq = abs(p) - vec2(markHalf - markCorner);
      float msd = length(max(mq, 0.0)) + min(max(mq.x, mq.y), 0.0) - markCorner;
      // In star mode a core dot stands for the album, fading out as the cover fades in.
      float coreR = max(0.5 * v_size.z, 2.2);
      float core = (1.0 - smoothstep(coreR - 0.5 * aa, coreR + 0.5 * aa, d)) * (1.0 - smoothstep(0.0, 0.5, v_coverT));
      over(col, alpha, CASING, band(msd, 4.0, aa) * 0.8);
      over(col, alpha, FRAME, max(band(msd, 1.5, aa), core) * mix(0.95, 0.9, v_coverT));
    }

    // Premultiplied output (blend One, OneMinusSrcAlpha): the album's shape over the star's light, and the
    // under-disc as alpha with no colour, so it only darkens what is behind it.
    vec3 rgb = col * alpha + v_tint.rgb * light * (1.0 - alpha);
    float a = alpha + under * (1.0 - alpha);
    // Nothing here: write no colour and no depth.
    if (a < 0.004 && max(rgb.r, max(rgb.g, rgb.b)) < 0.004) discard;
    gl_FragColor = vec4(rgb, a);
  }
`;
```

- [ ] **Step 5: Run the shader tests to verify they pass**

Run: `(cd frontcreck && npm run test -- src/components/map/shaders/album.test.ts)`
Expected: PASS, all tests (the two older source checks, "keep their overview size" and "draws its dots 1.35 times larger", still pass: the `v_dim = 1.0;` branch and the `mutedT` lines are unchanged).

- [ ] **Step 6: Remove `CLUSTER_RGB` and put the stand-in in the phone strip**

In `frontcreck/src/components/map/data.ts`, delete L1 (`import { hexToRgb } from '@/lib/color';`) and L9-12:

```ts
const rgb = (hex: string): [number, number, number] => hexToRgb(hex).map((v) => v / 255) as [number, number, number];

/** Dot colours by cluster k (k % 3: clay, moss, ochre), written straight to the framebuffer as sRGB literals. */
export const CLUSTER_RGB: [number, number, number][] = Array.from({ length: 8 }, (_, k) => rgb(['#c4886f', '#97a077', '#c8a560'][k % 3]));
```

In `frontcreck/src/components/album/MapPreviewStrip.tsx`, replace L6:

```ts
import { CLUSTER_RGB } from '@/components/map/data';
```

with:

```ts
import { STAR_WHITE } from '@/components/map/theme';
```

and replace L14-15:

```ts
/** The map's three dot colours (CLUSTER_RGB, by cluster % 3) at the strip's lower opacity. */
const DOT = CLUSTER_RGB.slice(0, 3).map(([r, g, b]) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},.42)`);
```

with:

```ts
/** Stand-in until the strip is restyled (Trifid plan part 3): every dot in star white at the strip's lower opacity. */
const DOT = [0, 1, 2].map(() => `rgba(${STAR_WHITE.join(',')},.42)`);
```

- [ ] **Step 7: Feed the attributes and the blending to the material**

In `frontcreck/src/components/map/canvas/AlbumField.tsx`:

Replace L9:

```ts
import { CLUSTER_RGB, interpolateInto, type MapData } from "../data";
```

with:

```ts
import { interpolateInto, type MapData } from "../data";
import { buildStarAttributes } from "../state/stars";
```

After L33 (`const invalidate = useThree((s) => s.invalidate);`) add:

```ts
  // Colour families and the gas luminance under each album; null until loaded, or when the load failed.
  const theme = useMapStore((s) => s.theme);
```

Replace L46-57:

```ts
    const atlasUV = new Float32Array(n * 4);
    const atlasIdx = new Float32Array(n);
    const clusterIds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const slot = atlasSlot(i);
      atlasUV[i * 4 + 0] = slot.u;
      atlasUV[i * 4 + 1] = slot.v;
      atlasUV[i * 4 + 2] = slot.size;
      atlasUV[i * 4 + 3] = slot.size;
      atlasIdx[i] = slot.sheet;
      clusterIds[i] = data.albums[i].k;
    }
```

with:

```ts
    const atlasUV = new Float32Array(n * 4);
    const atlasIdx = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const slot = atlasSlot(i);
      atlasUV[i * 4 + 0] = slot.u;
      atlasUV[i * 4 + 1] = slot.v;
      atlasUV[i * 4 + 2] = slot.size;
      atlasUV[i * 4 + 3] = slot.size;
      atlasIdx[i] = slot.sheet;
    }
    // White stars with no under-disc until the theme data arrives (the effect below fills tint and gas).
    const stars = buildStarAttributes(n, null);
```

Replace L64:

```ts
    pointsGeom.setAttribute("a_clusterId", new THREE.InstancedBufferAttribute(clusterIds, 1));
```

with:

```ts
    pointsGeom.setAttribute("a_star", new THREE.InstancedBufferAttribute(stars.star, 4));
    pointsGeom.setAttribute("a_tint", new THREE.InstancedBufferAttribute(stars.tint, 3, true));
    pointsGeom.setAttribute("a_bg", new THREE.InstancedBufferAttribute(stars.bg, 3, true));
```

Replace L70-78:

```ts
      transparent: true,
      // Depth carries the focus/hover draw-order layers (see `layer` in the
      // vertex shader). Three's default depthFunc is LessEqual, so sprites
      // in the same layer still draw in plain instance order; the fragment
      // shader discards outside the disc, so the sprite quad's corners never
      // write depth.
      depthWrite: true,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
```

with:

```ts
      transparent: true,
      // The fragment shader writes premultiplied colour: a star adds its light and darkens with its
      // under-disc in one fragment (rgb = light, a = under-disc), a cover is ordinary alpha (rgb * a, a).
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      // Depth carries the focus/hover draw-order layers (see `layer` in the
      // vertex shader). Three's default depthFunc is LessEqual, so sprites
      // in the same layer still draw in plain instance order. Only layer-0
      // sprites have a glow; an elevated sprite keeps its own shape and
      // discards the rest, so its quad never writes depth over a neighbour.
      depthWrite: true,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
```

Delete L98:

```ts
        u_clusterColors: { value: CLUSTER_RGB.map((c) => new THREE.Vector3(...c)) },
```

After the "Push texture changes into uniforms" effect (it ends at L133 with `}, [atlasTextures, material, invalidate]);`) add:

```ts
  // The theme data arrives after the albums (or not at all): rewrite the tint and gas attributes in place.
  useEffect(() => {
    const stars = buildStarAttributes(data.n, theme);
    const tint = geometry.getAttribute("a_tint") as THREE.InstancedBufferAttribute;
    const bg = geometry.getAttribute("a_bg") as THREE.InstancedBufferAttribute;
    (tint.array as Uint8Array).set(stars.tint);
    (bg.array as Uint8Array).set(stars.bg);
    // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
    tint.needsUpdate = true;
    bg.needsUpdate = true;
    invalidate();
  }, [theme, data, geometry, invalidate]);
```

- [ ] **Step 8: Typecheck, lint and run the unit tests**

Run, one at a time:

```bash
(cd frontcreck && npm run typecheck)
(cd frontcreck && npm run lint)
(cd frontcreck && npm run test)
```

Expected: typecheck clean (no remaining reference to `CLUSTER_RGB`, `hexToRgb` in `data.ts`, or `u_clusterColors`). Lint clean; if lint reports `react-hooks/immutability` on `bg.needsUpdate = true`, add the same `// eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design` line above it. All unit tests pass.

- [ ] **Step 9: Commit**

```bash
git add frontcreck/src/components/map/shaders/album.ts frontcreck/src/components/map/shaders/album.test.ts frontcreck/src/components/map/canvas/AlbumField.tsx frontcreck/src/components/map/data.ts frontcreck/src/components/album/MapPreviewStrip.tsx
git commit -m "feat(map): draw albums as Trifid stars in the one instanced draw

Premultiplied output with custom blending: star light adds, the under-disc
darkens, covers blend as before. Elevated sprites have no glow, so depth
layers survive the wider quads. CLUSTER_RGB is removed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Existing end-to-end checks this task breaks (part 3 updates them; do not edit them here):**
- `e2e/explore.spec.ts` L75 `isLamp` and L309: the picked cover's frame is now `FRAME_RGB` (241, 236, 228), not lamp amber.
- `e2e/explore.spec.ts` L318-327 `meanLuma` with `PANE_LUMA = 19`: other covers now darken towards `#07060a` instead of fading, over gas instead of the flat pane.

---

### Task 3: Cover layout that keeps covers off the lines

**Files:**
- Modify: `frontcreck/src/components/map/state/focusLayout.ts` (L7-8 constants, L38-42 options, L52-145 `layoutMarkers`)
- Test: `frontcreck/src/components/map/state/focusLayout.test.ts` (import L2; new `describe` blocks after L82)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  export const SEED_FRAME_PX = 4;      // the seed's drawn frame reaches this far past its cover
  export const REC_FRAME_PX = 1;       // a recommendation's hairline
  export const HOT_FRAME_PX = 3;       // a hot recommendation's ring and casing
  export const MIN_LINE_PX = 24;       // least visible length of a line between two frames
  export const LINE_CLEAR_PX = 6;      // least gap between a cover and another cover's line
  export const MIN_LINE_ANGLE = 0.2;   // radians between two lines leaving the seed
  export interface LayoutOptions { bounds?: MarkerBounds; gap?: number; minLine?: number }
  export function edgePoint(x0: number, y0: number, x1: number, y1: number, half: number): [number, number];
  export function layoutMarkers(anchors: readonly MarkerAnchor[], seedSize: number, recSize: number, options?: LayoutOptions): MarkerItem[];
  ```
  `layoutMarkers` keeps its signature. Without `bounds` the seed never moves. With `bounds` the group is shifted inside them as before, so the seed moves only when the bounds force it.

The rules are the prototype's `Focus.layout` (`docs/design/trifid-theme/prototype/src/focus.js` L15-69): after the ring and the box separation, every line shows at least 24 px between the two frames, every cover stays 6 px clear of every other cover's line, and two lines leave the seed at least 0.2 rad apart, relaxed together for up to 600 rounds. The app's bounds handling (shift the group, hold at the walls, separate again) is kept around it, so a pile in a corner still ends inside the bounds with no overlaps.

- [ ] **Step 1: Write the failing tests**

In `frontcreck/src/components/map/state/focusLayout.test.ts`, replace L2:

```ts
import { MARKER_GAP, MARKER_SIZE, focusCamera, layoutMarkers, markerAt, ringRadius, type MarkerBounds, type MarkerItem } from './focusLayout';
```

with:

```ts
import {
  LINE_CLEAR_PX,
  MARKER_GAP,
  MARKER_SIZE,
  MIN_LINE_ANGLE,
  MIN_LINE_PX,
  REC_FRAME_PX,
  SEED_FRAME_PX,
  edgePoint,
  focusCamera,
  layoutMarkers,
  markerAt,
  ringRadius,
  type MarkerBounds,
  type MarkerItem,
} from './focusLayout';
```

After the `outside` helper (L18) add the port of the prototype's `Focus.check`:

```ts
type Pt = [number, number];

/** Exact distance from segment ab to a square of half size h centred on (cx, cy). */
function segRect(a: Pt, b: Pt, cx: number, cy: number, h: number): number {
  const inside = (p: Pt) => Math.abs(p[0] - cx) <= h && Math.abs(p[1] - cy) <= h;
  if (inside(a) || inside(b)) return 0;
  const ptSeg = (px: number, py: number) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l));
    return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
  };
  const ptRect = (p: Pt) => Math.hypot(Math.max(Math.abs(p[0] - cx) - h, 0), Math.max(Math.abs(p[1] - cy) - h, 0));
  const cross = (p1: Pt, p2: Pt, p3: Pt, p4: Pt) => {
    const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
    if (!d) return false;
    const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
    const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  const c: Pt[] = [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]];
  for (let i = 0; i < 4; i++) if (cross(a, b, c[i], c[(i + 1) % 4])) return 0;
  return Math.min(ptRect(a), ptRect(b), ...c.map((p) => ptSeg(p[0], p[1])));
}

/** The prototype's Focus.check: a finding for every line shorter than 24 px, cover within 6 px of another
 * cover's line, pair of lines closer than 0.2 rad, and pair of overlapping covers. Empty when the layout is clean. */
function findings(items: MarkerItem[]): string[] {
  const out: string[] = [];
  if (items.length < 2) return out;
  const s = items[0];
  const recs = items.slice(1);
  const seg = new Map<number, [Pt, Pt]>();
  for (const it of recs) seg.set(it.rank, [edgePoint(s.x, s.y, it.x, it.y, s.size / 2 + SEED_FRAME_PX), edgePoint(it.x, it.y, s.x, s.y, it.size / 2 + REC_FRAME_PX)]);
  for (const it of recs) {
    const [a, b] = seg.get(it.rank)!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < MIN_LINE_PX - 0.6) out.push(`short ${it.rank}: ${len.toFixed(1)} px`);
    for (const o of recs) {
      if (o === it) continue;
      const [oa, ob] = seg.get(o.rank)!;
      const d = segRect(oa, ob, it.x, it.y, it.size / 2 + REC_FRAME_PX);
      if (d < LINE_CLEAR_PX - 0.6) out.push(`near ${it.rank} to line ${o.rank}: ${d.toFixed(1)} px`);
      if (o.rank > it.rank) {
        let g = Math.atan2(o.y - s.y, o.x - s.x) - Math.atan2(it.y - s.y, it.x - s.x);
        while (g > Math.PI) g -= 2 * Math.PI;
        while (g < -Math.PI) g += 2 * Math.PI;
        if (Math.abs(g) < MIN_LINE_ANGLE - 0.02) out.push(`angle ${it.rank} and ${o.rank}: ${Math.abs(g).toFixed(3)} rad`);
      }
    }
    for (const o of items) {
      if (o !== it && Math.abs(o.x - it.x) < (o.size + it.size) / 2 + 2 && Math.abs(o.y - it.y) < (o.size + it.size) / 2 + 2) out.push(`overlap ${it.rank} with ${o.rank}`);
    }
  }
  return out;
}

/** Deterministic random numbers in 0..1. */
function lcg(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
```

After the `describe('layoutMarkers', ...)` block (it closes on L82) add:

```ts
describe('edgePoint', () => {
  it('is where the line towards a point leaves a square', () => {
    expect(edgePoint(0, 0, 100, 0, 36)).toEqual([36, 0]);
    expect(edgePoint(0, 0, 0, -50, 24)).toEqual([0, -24]);
    const [x, y] = edgePoint(10, 10, 110, 60, 20);
    expect(x).toBeCloseTo(30, 6);
    expect(y).toBeCloseTo(20, 6);
  });

  it('does not divide by zero for two points on the same spot', () => {
    for (const v of edgePoint(5, 5, 5, 5, 20)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('layoutMarkers keeps covers off the lines (prototype Focus.check)', () => {
  it('leaves no finding in random clusters of one, two, five and ten recommendations', () => {
    for (const n of [1, 2, 5, 10]) {
      const rand = lcg(11 + n);
      for (let t = 0; t < 300; t++) {
        const spread = 40 + rand() * 500;
        const anchors = Array.from({ length: n + 1 }, (_, i) => ({ id: i, x: 600 + (i ? (rand() - 0.5) * spread : 0), y: 400 + (i ? (rand() - 0.5) * spread : 0) }));
        expect(findings(layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec)), `${n} recs, round ${t}`).toEqual([]);
      }
    }
  });

  it('leaves no finding in a pile of eleven on one spot', () => {
    const pile = Array.from({ length: 11 }, (_, i) => ({ id: i, x: 300, y: 300 }));
    expect(findings(layoutMarkers(pile, MARKER_SIZE.seed, MARKER_SIZE.rec))).toEqual([]);
  });

  it('never moves the seed when there are no bounds', () => {
    const rand = lcg(5);
    for (let t = 0; t < 100; t++) {
      const anchors = Array.from({ length: 11 }, (_, i) => ({ id: i, x: 300 + rand() * 80, y: 300 + rand() * 80 }));
      const out = layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec);
      expect([out[0].x, out[0].y]).toEqual([anchors[0].x, anchors[0].y]);
    }
  });

  it('lays out a seed alone and a seed with one recommendation', () => {
    expect(layoutMarkers([{ id: 4, x: 50, y: 60 }], 64, 46).map((m) => [m.x, m.y])).toEqual([[50, 60]]);
    const two = layoutMarkers([{ id: 0, x: 100, y: 100 }, { id: 1, x: 104, y: 100 }], 64, 46);
    expect(two.every((m) => Number.isFinite(m.x) && Number.isFinite(m.y))).toBe(true);
    expect(findings(two)).toEqual([]);
  });

  it('fans out recommendations that all sit on one side of the seed', () => {
    for (const n of [5, 10]) {
      const rand = lcg(99 + n);
      for (let t = 0; t < 200; t++) {
        const anchors = [{ id: 0, x: 300, y: 300 }, ...Array.from({ length: n }, (_, i) => ({ id: i + 1, x: 420 + rand() * 300, y: 300 + (rand() - 0.5) * 30 }))];
        expect(findings(layoutMarkers(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec)), `${n} recs, round ${t}`).toEqual([]);
      }
    }
    const row = [{ id: 0, x: 300, y: 300 }, ...Array.from({ length: 5 }, (_, i) => ({ id: i + 1, x: 420 + 40 * i, y: 300 }))];
    expect(findings(layoutMarkers(row, MARKER_SIZE.seed, MARKER_SIZE.rec))).toEqual([]);
  });

  it('takes a shorter minimum line for small markers', () => {
    const pile = Array.from({ length: 6 }, (_, i) => ({ id: i, x: 195, y: 86 }));
    const loose = layoutMarkers(pile, 38, 28, { gap: 8 });
    const tight = layoutMarkers(pile, 38, 28, { gap: 8, minLine: 10 });
    const reach = (items: MarkerItem[]) => Math.max(...items.map((m) => Math.hypot(m.x - items[0].x, m.y - items[0].y)));
    expect(reach(tight)).toBeLessThan(reach(loose));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `(cd frontcreck && npm run test -- src/components/map/state/focusLayout.test.ts)`
Expected: FAIL. The new blocks fail on the missing exports (`edgePoint is not a function`); the older tests still pass.

- [ ] **Step 3: Write the implementation**

In `frontcreck/src/components/map/state/focusLayout.ts`, after L8 (`export const MARKER_GAP = 10;`) add:

```ts
/** How far a marker's drawn frame reaches past its cover (styles/map.css): the seed's dark gap and ring, a
 * recommendation's hairline, a hot recommendation's ring and casing. Lines end on the frame's edge. */
export const SEED_FRAME_PX = 4;
export const REC_FRAME_PX = 1;
export const HOT_FRAME_PX = 3;
/** Least length of a line that shows between the seed's frame and its recommendation's frame. */
export const MIN_LINE_PX = 24;
/** Least gap between a cover and any other cover's line. */
export const LINE_CLEAR_PX = 6;
/** Least angle, in radians, between two lines leaving the seed. */
export const MIN_LINE_ANGLE = 0.2;
```

Replace the `LayoutOptions` interface (L38-42) with:

```ts
export interface LayoutOptions {
  bounds?: MarkerBounds;
  /** Minimum space between two marker boxes; defaults to MARKER_GAP (the preview strip uses a smaller one). */
  gap?: number;
  /** Least visible length of a line; defaults to MIN_LINE_PX (the preview strip uses a shorter one). */
  minLine?: number;
}
```

Replace everything from the `layoutMarkers` doc comment (L52) through the closing brace of `layoutMarkers` (L145) with:

```ts
/** Where the line from (x0, y0) towards (x1, y1) leaves a square of half size `half` centred on (x0, y0). */
export function edgePoint(x0: number, y0: number, x1: number, y1: number, half: number): [number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy) || 1;
  const k = half / (Math.max(Math.abs(dx), Math.abs(dy)) / d || 1);
  return [x0 + (dx / d) * k, y0 + (dy / d) * k];
}

/** anchors[0] is the seed. Recommendations too close to the seed go to a ring around it. Then four rules are
 * relaxed together, for up to 600 rounds (the prototype's Focus.layout): boxes stay `gap` apart, pushed along
 * the axis of least overlap; every line shows at least `minLine` px between the two frames; every cover stays
 * LINE_CLEAR_PX clear of every other cover's line; two lines leave the seed at least MIN_LINE_ANGLE apart.
 * Without `bounds` the seed never moves. With `bounds`, the laid-out group is shifted inside them as a whole
 * (which keeps every rule), and only if a marker is still outside is it held at the wall and the rules relaxed
 * again inside the walls, ending with a plain box separation so that the result has no overlaps. */
export function layoutMarkers(anchors: readonly MarkerAnchor[], seedSize: number, recSize: number, options: LayoutOptions = {}): MarkerItem[] {
  const gap = options.gap ?? MARKER_GAP;
  const minLine = options.minLine ?? MIN_LINE_PX;
  const bounds = options.bounds ?? null;
  const items: MarkerItem[] = anchors.map((a, n) => ({ id: a.id, rank: n, ax: a.x, ay: a.y, x: a.x, y: a.y, size: n === 0 ? seedSize : recSize, seed: n === 0 }));
  if (items.length === 0) return items;
  const s0 = items[0];
  const recs = items.length - 1;
  if (recs > 0) {
    const ring = ringRadius(recs, s0.size, recSize);
    items.slice(1).forEach((it, n) => {
      let dx = it.ax - s0.ax;
      let dy = it.ay - s0.ay;
      let d = Math.hypot(dx, dy);
      if (d >= ring) return;
      if (d < 3) {
        const a = -Math.PI / 2 + (n * Math.PI * 2) / recs;
        dx = Math.cos(a);
        dy = Math.sin(a);
        d = 1;
      }
      it.x = s0.ax + (dx / d) * ring;
      it.y = s0.ay + (dy / d) * ring;
    });
  }

  const range = (it: MarkerItem, axis: Axis, walls: boolean): [number, number] => {
    if (!walls || !bounds) return [-Infinity, Infinity];
    const h = it.size / 2;
    return axis === 'x' ? [bounds.left + h, bounds.right - h] : [bounds.top + h, bounds.bottom - h];
  };
  /** Moves `it` by `d` along `axis`, held by the walls when `walls`; returns how far it actually moved. */
  const moveBy = (it: MarkerItem, axis: Axis, d: number, walls: boolean): number => {
    const [lo, hi] = range(it, axis, walls);
    const before = it[axis];
    it[axis] = Math.min(Math.max(before + d, lo), hi);
    return it[axis] - before;
  };
  const moveTo = (it: MarkerItem, x: number, y: number, walls: boolean): void => {
    moveBy(it, 'x', x - it.x, walls);
    moveBy(it, 'y', y - it.y, walls);
  };

  /** One round of box separation. `seedWeight` is the seed's share of a push: 0 keeps it where it is. */
  const separateOnce = (walls: boolean, seedWeight: number): boolean => {
    let moved = false;
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const p = items[a];
        const q = items[b];
        const need = (p.size + q.size) / 2 + gap;
        const ox = need - Math.abs(q.x - p.x);
        const oy = need - Math.abs(q.y - p.y);
        if (ox <= 0 || oy <= 0) continue;
        const axis: Axis = ox < oy ? 'x' : 'y';
        const d = q[axis] - p[axis];
        const sign = d === 0 ? (b % 2 ? 1 : -1) : Math.sign(d);
        const total = (axis === 'x' ? ox : oy) + 0.5;
        const wp = p.seed ? seedWeight : 0.5;
        const wq = q.seed ? seedWeight : 0.5;
        const movedP = -sign * moveBy(p, axis, (-sign * total * wp) / (wp + wq), walls);
        const movedQ = sign * moveBy(q, axis, sign * (total - movedP), walls);
        if (movedP + movedQ < total) moveBy(p, axis, -sign * (total - movedP - movedQ), walls);
        moved = true;
      }
    }
    return moved;
  };

  /** One round of the three line rules; the seed is never moved by them. */
  const linesOnce = (walls: boolean): boolean => {
    let moved = false;
    const seedHalf = s0.size / 2 + SEED_FRAME_PX;
    for (let a = 1; a < items.length; a++) {
      const it = items[a];
      // Enough line between the two frames.
      const dx = it.x - s0.x;
      const dy = it.y - s0.y;
      const d = Math.hypot(dx, dy) || 1;
      const need = (seedHalf + it.size / 2 + REC_FRAME_PX) / (Math.max(Math.abs(dx), Math.abs(dy)) / d || 1) + minLine;
      if (d < need - 0.5) {
        moveTo(it, s0.x + (dx / d) * need, s0.y + (dy / d) * need, walls);
        moved = true;
      }
      // Sideways off every other recommendation's line.
      for (let b = 1; b < items.length; b++) {
        if (b === a) continue;
        const o = items[b];
        const lx = o.x - s0.x;
        const ly = o.y - s0.y;
        const len = Math.hypot(lx, ly) || 1;
        const ux = lx / len;
        const uy = ly / len;
        const t = (it.x - s0.x) * ux + (it.y - s0.y) * uy;
        if (t <= 0 || t >= len) continue;
        const perp = (it.x - s0.x) * -uy + (it.y - s0.y) * ux;
        const reach = (it.size / 2 + REC_FRAME_PX) * (Math.abs(ux) + Math.abs(uy)) + LINE_CLEAR_PX;
        if (Math.abs(perp) >= reach) continue;
        const push = (reach - Math.abs(perp) + 0.5) * (perp === 0 ? (a % 2 ? 1 : -1) : Math.sign(perp));
        moveTo(it, it.x - uy * push, it.y + ux * push, walls);
        moved = true;
      }
    }
    // Two lines must not leave the seed in nearly the same direction: both turn, half each, about the seed.
    for (let a = 1; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const p = items[a];
        const q = items[b];
        const ap = Math.atan2(p.y - s0.y, p.x - s0.x);
        const aq = Math.atan2(q.y - s0.y, q.x - s0.x);
        let d = aq - ap;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        if (Math.abs(d) >= MIN_LINE_ANGLE) continue;
        const half = ((MIN_LINE_ANGLE - Math.abs(d) + 0.02) / 2) * (d >= 0 ? 1 : -1);
        for (const [it, ang] of [[p, ap - half], [q, aq + half]] as const) {
          const r = Math.hypot(it.x - s0.x, it.y - s0.y);
          moveTo(it, s0.x + Math.cos(ang) * r, s0.y + Math.sin(ang) * r, walls);
        }
        moved = true;
      }
    }
    return moved;
  };

  const relax = (walls: boolean, seedWeight: number): void => {
    for (let iter = 0; iter < 600; iter++) {
      const boxes = separateOnce(walls, seedWeight);
      const lines = linesOnce(walls);
      if (!boxes && !lines) return;
    }
  };

  relax(false, 0);
  if (bounds) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const it of items) {
      const h = it.size / 2;
      x0 = Math.min(x0, it.x - h);
      x1 = Math.max(x1, it.x + h);
      y0 = Math.min(y0, it.y - h);
      y1 = Math.max(y1, it.y + h);
    }
    const shift = (lo: number, hi: number, min: number, max: number) => (hi - lo > max - min ? 0 : lo < min ? min - lo : hi > max ? max - hi : 0);
    const sx = shift(x0, x1, bounds.left, bounds.right);
    const sy = shift(y0, y1, bounds.top, bounds.bottom);
    let held = false;
    for (const it of items) {
      it.x += sx;
      it.y += sy;
      if (moveBy(it, 'x', 0, true) !== 0) held = true;
      if (moveBy(it, 'y', 0, true) !== 0) held = true;
    }
    if (held) {
      // The group does not fit: relax inside the walls (the seed gives way a little, as before), then make
      // sure no boxes overlap, whatever the line rules could not reach.
      relax(true, 0.2);
      for (let iter = 0; iter < 300; iter++) if (!separateOnce(true, 0.2)) break;
    }
  }
  return items;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `(cd frontcreck && npm run test -- src/components/map/state/focusLayout.test.ts)`
Expected: PASS, every test, including the older `layoutMarkers`, `ringRadius`, `focusCamera` and `markerAt` blocks unchanged. (This algorithm was run against all of these cases while the plan was written: no findings, no overlaps, nothing outside the bounds.)

- [ ] **Step 5: Typecheck and commit**

Run: `(cd frontcreck && npm run typecheck)`
Expected: clean.

```bash
git add frontcreck/src/components/map/state/focusLayout.ts frontcreck/src/components/map/state/focusLayout.test.ts
git commit -m "feat(map): cover layout keeps covers off the focus lines

Ports the prototype's rules into layoutMarkers: 24 px of every line
visible, 6 px clearance from other lines, 0.2 rad between lines. The seed
no longer moves unless the bounds force it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: White cased lines, frames and badges

**Files:**
- Modify: `frontcreck/src/components/map/overlays/FocusMarkers.tsx` (L34-41, the `<svg>`)
- Modify: `frontcreck/src/components/map/canvas/MarkerDriver.tsx` (L6, L17-18, L76-90)
- Modify: `frontcreck/src/styles/map.css` (L72-95)
- Test: `frontcreck/e2e/focus.spec.ts` (L42 and L73-90, check (d))

**Interfaces:**
- Consumes: `edgePoint`, `SEED_FRAME_PX`, `REC_FRAME_PX`, `HOT_FRAME_PX` (Task 3); tokens `--color-lamp` (off-white `#f1ece4`) and `--color-room` (`#07060a`) from part 3.
- Produces: DOM contract for the lines: `svg.mk-lines > g.mk-case` (all casings) before `g.mk-core` (all cores). Core lines keep `line[data-to="<id>"]` and `line[data-leader="<id>"]`; casings are `line[data-case="<id>"]` and `line[data-leader-case="<id>"]`. `data-hot="true"` is set on a hot recommendation's casing and core.

The per-album accent `--acc` is no longer used on the map: seed and hot rings and the hot badge use the lamp token. Until part 3 changes the token values the rings show in the old amber; that is expected between the parts.

- [ ] **Step 1: Write the failing end-to-end check**

In `frontcreck/e2e/focus.spec.ts`, after L42 (`await expect(page.locator('svg.mk-lines line[data-to]')).toHaveCount(5);`) add:

```ts
  // Every line is a dark casing under a white core, and all casings are drawn below all cores.
  await expect(page.locator('svg.mk-lines g.mk-case line[data-case]')).toHaveCount(5);
  expect(await page.locator('svg.mk-lines > g').evaluateAll((gs) => gs.map((g) => g.getAttribute('class')))).toEqual(['mk-case', 'mk-core']);
```

Replace check (d), from the comment on L73 through the closing brace of its `for` loop on L90:

```ts
  // (d) each line runs from the seed cover's centre to its recommendation's cover centre
  const lines = await page.locator('svg.mk-lines line[data-to]').evaluateAll((els) => {
    const svg = (els[0] as SVGLineElement).ownerSVGElement!.getBoundingClientRect();
    return els.map((l) => ({
      to: Number(l.getAttribute('data-to')),
      x1: svg.left + Number(l.getAttribute('x1')),
      y1: svg.top + Number(l.getAttribute('y1')),
      x2: svg.left + Number(l.getAttribute('x2')),
      y2: svg.top + Number(l.getAttribute('y2')),
    }));
  });
  for (const l of lines) {
    const end = boxes.find((b) => b.id === l.to)!;
    expect(Math.abs(l.x1 - seed.cx), `line ${l.to} x1`).toBeLessThanOrEqual(2);
    expect(Math.abs(l.y1 - seed.cy), `line ${l.to} y1`).toBeLessThanOrEqual(2);
    expect(Math.abs(l.x2 - end.cx), `line ${l.to} x2`).toBeLessThanOrEqual(2);
    expect(Math.abs(l.y2 - end.cy), `line ${l.to} y2`).toBeLessThanOrEqual(2);
  }
```

with:

```ts
  // (d) each line runs from the edge of the seed's frame (4 px outside its cover) to the edge of its
  // recommendation's frame (1 px outside), along the straight line between the two centres, and at least
  // 24 px of it shows.
  const lines = await page.locator('svg.mk-lines line[data-to]').evaluateAll((els) => {
    const svg = (els[0] as SVGLineElement).ownerSVGElement!.getBoundingClientRect();
    return els.map((l) => ({
      to: Number(l.getAttribute('data-to')),
      x1: svg.left + Number(l.getAttribute('x1')),
      y1: svg.top + Number(l.getAttribute('y1')),
      x2: svg.left + Number(l.getAttribute('x2')),
      y2: svg.top + Number(l.getAttribute('y2')),
    }));
  });
  const cheb = (x: number, y: number, b: { cx: number; cy: number }) => Math.max(Math.abs(x - b.cx), Math.abs(y - b.cy));
  for (const l of lines) {
    const end = boxes.find((b) => b.id === l.to)!;
    expect(Math.abs(cheb(l.x1, l.y1, seed) - (seed.w / 2 + 4)), `line ${l.to} starts on the seed frame`).toBeLessThanOrEqual(1.5);
    expect(Math.abs(cheb(l.x2, l.y2, end) - (end.w / 2 + 1)), `line ${l.to} ends on its cover's frame`).toBeLessThanOrEqual(1.5);
    // Collinear with the two centres: the cross product of (end - seed) and (point - seed) is near zero.
    const dx = end.cx - seed.cx;
    const dy = end.cy - seed.cy;
    const len = Math.hypot(dx, dy);
    for (const [x, y] of [[l.x1, l.y1], [l.x2, l.y2]]) expect(Math.abs(dx * (y - seed.cy) - dy * (x - seed.cx)) / len, `line ${l.to} aims at the centres`).toBeLessThanOrEqual(1.5);
    expect(Math.hypot(l.x2 - l.x1, l.y2 - l.y1), `line ${l.to} shows`).toBeGreaterThanOrEqual(23);
  }
```

Check that `boxes` in that test carries `w`, `cx`, `cy` and `id` (it does: L62-64 use `boxes[a].w`, `.cx`, `.cy`, `.id`).

- [ ] **Step 2: Run it to verify it fails**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/focus.spec.ts --project=desktop -g "numbered covers" --workers=1)`
Expected: FAIL at `g.mk-case line[data-case]` (count 0).

- [ ] **Step 3: Render the casing and core groups**

In `frontcreck/src/components/map/overlays/FocusMarkers.tsx`, replace the `<svg>` element (L34-41):

```tsx
      <svg className="mk-lines" ref={(el) => { setOverlayEl('lines', el); }}>
        {focus.recs.map((id) => (
          <line key={`to-${id}`} data-to={id} data-hot={isHot(id) ? 'true' : undefined} />
        ))}
        {ids.map((id) => (
          <line key={`leader-${id}`} data-leader={id} style={{ display: 'none' }} />
        ))}
      </svg>
```

with:

```tsx
      <svg className="mk-lines" ref={(el) => { setOverlayEl('lines', el); }}>
        {/* Every dark casing first, then every white core, so no casing ever crosses a core. */}
        <g className="mk-case">
          {focus.recs.map((id) => (
            <line key={`case-${id}`} data-case={id} data-hot={isHot(id) ? 'true' : undefined} />
          ))}
          {ids.map((id) => (
            <line key={`leader-case-${id}`} data-leader-case={id} style={{ display: 'none' }} />
          ))}
        </g>
        <g className="mk-core">
          {focus.recs.map((id) => (
            <line key={`to-${id}`} data-to={id} data-hot={isHot(id) ? 'true' : undefined} />
          ))}
          {ids.map((id) => (
            <line key={`leader-${id}`} data-leader={id} style={{ display: 'none' }} />
          ))}
        </g>
      </svg>
```

- [ ] **Step 4: Place the lines from frame edge to frame edge**

In `frontcreck/src/components/map/canvas/MarkerDriver.tsx`, replace L6:

```ts
import { MARKER_SIZE, layoutMarkers, type PlacedMarker } from '../state/focusLayout';
```

with:

```ts
import { HOT_FRAME_PX, MARKER_SIZE, REC_FRAME_PX, SEED_FRAME_PX, edgePoint, layoutMarkers, type PlacedMarker } from '../state/focusLayout';
```

Replace L17-18:

```ts
/** Rank badge offset from the cover's top-left corner (mockup: 6 px up and left). */
const BADGE_OFFSET = 6;
```

with:

```ts
/** Rank badge offset from the cover's top-left corner (prototype: 0.4 of the 18 px badge, up and left). */
const BADGE_OFFSET = 7;
```

Replace L76-90:

```ts
    const svg = getOverlayEl<SVGSVGElement>('lines');
    if (svg && placed.length) {
      const seed = placed[0];
      const byId = new Map(placed.map((p) => [p.id, p]));
      svg.querySelectorAll<SVGLineElement>('line[data-to]').forEach((l) => {
        const it = byId.get(Number(l.dataset.to));
        if (it) setLine(l, seed.x, seed.y, it.x, it.y);
      });
      svg.querySelectorAll<SVGLineElement>('line[data-leader]').forEach((l) => {
        const it = byId.get(Number(l.dataset.leader));
        const show = !!it && Math.hypot(it.x - it.ax, it.y - it.ay) > LEADER_MIN_PX;
        l.style.display = show ? '' : 'none';
        if (show && it) setLine(l, it.ax, it.ay, it.x, it.y);
      });
    }
```

with:

```ts
    const svg = getOverlayEl<SVGSVGElement>('lines');
    if (svg && drawn.length) {
      const seed = drawn[0];
      const byId = new Map(drawn.map((p) => [p.id, p]));
      const seedHalf = seed.drawn / 2 + SEED_FRAME_PX;
      /** Half size of a marker's cover plus its frame: where its lines end. */
      const frameHalf = (it: PlacedMarker) => it.drawn / 2 + (it.seed ? SEED_FRAME_PX : it.drawn !== it.size ? HOT_FRAME_PX : REC_FRAME_PX);
      // From the edge of the seed's frame to the edge of the recommendation's frame; casing and core alike.
      svg.querySelectorAll<SVGLineElement>('line[data-to], line[data-case]').forEach((l) => {
        const it = byId.get(Number(l.dataset.to ?? l.dataset.case));
        if (!it) return;
        const [x1, y1] = edgePoint(seed.x, seed.y, it.x, it.y, seedHalf);
        const [x2, y2] = edgePoint(it.x, it.y, seed.x, seed.y, frameHalf(it));
        setLine(l, x1, y1, x2, y2);
      });
      // A thin leader from a moved cover's frame back to the album's true position (the shader draws a ring
      // there); none while the true position is still under the cover.
      svg.querySelectorAll<SVGLineElement>('line[data-leader], line[data-leader-case]').forEach((l) => {
        const it = byId.get(Number(l.dataset.leader ?? l.dataset.leaderCase));
        const half = it ? frameHalf(it) : 0;
        const show = !!it && Math.hypot(it.x - it.ax, it.y - it.ay) > LEADER_MIN_PX && Math.max(Math.abs(it.ax - it.x), Math.abs(it.ay - it.y)) > half;
        l.style.display = show ? '' : 'none';
        if (show && it) {
          const [x1, y1] = edgePoint(it.x, it.y, it.ax, it.ay, half);
          setLine(l, x1, y1, it.ax, it.ay);
        }
      });
    }
```

- [ ] **Step 5: Restyle lines, frames and badges**

In `frontcreck/src/styles/map.css`, replace L72-95 (from the comment `/* focus markers: the mockup's canvas drawing ...` through the `.mk-n[data-hot]` rule) with:

```css
/* focus markers: the Trifid prototype's drawing (overlay.js L32-74). On the map the only accent is white. */
.mk-layer { position: absolute; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; }
.mk-lines { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
/* White lines on a dark casing, so they hold on any gas; every casing lies under every core. */
.mk-lines line { stroke-linecap: round; }
.mk-case line { stroke: rgba(6, 6, 10, .8); stroke-width: 4.5; }
.mk-case line[data-hot] { stroke-width: 5.25; }
.mk-case line[data-leader-case] { stroke-width: 3; }
.mk-core line { stroke: rgba(255, 255, 255, .92); stroke-width: 1.5; }
.mk-core line[data-hot] { stroke: #fff; stroke-width: 2.25; }
.mk-core line[data-leader] { stroke: rgba(255, 255, 255, .7); stroke-width: 1; }
/* Markers take no pointer events: the canvas hit-tests their boxes, so drags and pinches that start on a cover reach it. */
.mk { position: absolute; left: 0; top: 0; pointer-events: none; will-change: transform; background: var(--color-room); box-shadow: 0 4px 14px rgba(0, 0, 0, .6); }
.mk .cover { width: 100% !important; }
/* Square frames (an outline would follow the cover's 2 px radius). A recommendation: a white hairline with a
 * dark hairline outside it. The seed: a 2 px dark gap, then a 2 px lamp ring. A hot recommendation: a 2 px lamp
 * ring with a dark hairline outside it. MarkerDriver ends the lines on these frames (SEED_FRAME_PX 4,
 * REC_FRAME_PX 1, HOT_FRAME_PX 3). */
.mk::after { content: ""; position: absolute; inset: -1px; border: 1px solid rgba(255, 255, 255, .6); box-shadow: 0 0 0 1px rgba(6, 6, 10, .7); pointer-events: none; }
.mk--seed { z-index: 3; }
.mk--seed::after { inset: -4px; border: 2px solid var(--color-lamp); box-shadow: inset 0 0 0 2px var(--color-room); }
.mk[data-hot] { z-index: 2; }
.mk[data-hot]::after { inset: -2px; border: 2px solid var(--color-lamp); box-shadow: 0 0 0 1px rgba(6, 6, 10, .8); }
/* Badges in their own layer above every cover and ring (drawn last). Solid, not glass: digits must hold on any gas. */
.mk-badges { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.mk-n {
  position: absolute; left: 0; top: 0; min-width: 18px; will-change: transform; height: 18px; padding: 0 4px; display: grid; place-items: center;
  background: #0b0a0f; border: 1px solid rgba(255, 255, 255, .55); color: #fff; font: 600 11px/1 var(--font-sans);
}
/* Inverted when hot: room-coloured digits on the lamp token (17:1 with the Trifid values). */
.mk-n[data-hot] { background: var(--color-lamp); border-color: var(--color-room); color: var(--color-room); }
```

- [ ] **Step 6: Run the checks**

Run, one at a time:

```bash
(cd frontcreck && npm run typecheck)
(cd frontcreck && npm run lint)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/focus.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/focus.spec.ts --project=phone --workers=1)
```

Expected: typecheck and lint clean; `focus.spec.ts` passes on both projects, including the new casing count and check (d). If check (b) (boxes at least the 10 px gap apart) or (c) (seed cover within 40 px of its album) fails, stop: the layout from Task 3 is wrong, not the test. If only the "shows" assertion of check (d) fails on the phone project, a marker was held at the edge of the visible map; report the measured length instead of loosening the check.

- [ ] **Step 7: Commit**

```bash
git add frontcreck/src/components/map/overlays/FocusMarkers.tsx frontcreck/src/components/map/canvas/MarkerDriver.tsx frontcreck/src/styles/map.css frontcreck/e2e/focus.spec.ts
git commit -m "feat(map): white cased focus lines from frame edge to frame edge

Casings under cores, round caps, leaders back to the true position, and
white frames and badges in place of the per-album accent.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Region names layout (pure)

**Files:**
- Create: `frontcreck/src/components/map/state/namesLayout.ts`
- Test: `frontcreck/src/components/map/state/namesLayout.test.ts`

**Interfaces:**
- Consumes: `ThemeLabel` (`@/lib/data/theme`); `NAMES_BAND_PX` (`../theme`); `STOP_T` (`../data`); `ViewBounds` (`./projection`); `StopId` (`@/lib/types`).
- Produces:
  ```ts
  export const NAMES_MAX = 17;
  export const NAMES_MAX_PHONE = 4;
  export const NAME_SIZE_K = 0.88;
  export const NAME_TRACK_EM = 0.26;
  export const NAME_EDGE_PX = 10;
  export const NAME_CONTRAST = 4.5;
  export const NAME_FAIR_ALPHA = 0.82;
  export const NAME_OFFSETS: readonly (readonly [number, number])[];
  export const nameKey: (stop: StopId, id: string) => string;          // "name:<stop>:<id>"
  export function namesShown(coverPx: number): boolean;
  export function nameZoomK(coverPx: number): number;
  export function nameFontPx(label: Pick<ThemeLabel, 'strong' | 'n'>, phone: boolean, zoomK: number): number;
  export interface NameFade { stop: StopId; alpha: number }
  export function nameFades(sliderT: number, from: StopId, to: StopId): NameFade[];
  export function luminance(rgb: readonly number[]): number;
  export function nameContrast(bgLum: number, inkLum: number, inkAlpha: number, halo: number): number;
  export function haloFor(bgLum: number, inkLum: number, inkAlpha?: number, ratio?: number): number;
  export interface NameCandidate { key: string; label: ThemeLabel; x: number; y: number; alpha: number }
  export interface PlacedName { key: string; x: number; y: number; fontPx: number; alpha: number; halo: number }
  export type NameLine = readonly [number, number, number, number];
  export interface NamesInput { candidates: readonly NameCandidate[]; visible: ViewBounds; blockers: readonly ViewBounds[]; lines: readonly NameLine[]; phone: boolean; zoomK: number; fullHalo: boolean; widthOf: (label: ThemeLabel, fontPx: number) => number; sticky: Map<string, number> }
  export function layoutNames(input: NamesInput): PlacedName[];
  export interface ChromeInput { width: number; height: number; inset: number; phone: boolean; bottomCover: number; focus: boolean; card: boolean }
  export function chromeBlockers(c: ChromeInput): ViewBounds[];
  export interface WidthCache { widthOf: (label: ThemeLabel, fontPx: number) => number; clear: () => void }
  export function createWidthCache(measure100: (text: string) => number): WidthCache;
  ```

**Rules, from the prototype's `labels.js` and the 2026-10-04 decisions.**
- Names show while covers would be under `NAMES_BAND_PX` (13 px) and are gone above it. No partial fade by zoom.
- All labels of the current stop are candidates, highest `p` first; the cap is 17 on desktop and 4 on a phone, and never more than one name per 160 x 90 px of free map.
- During a slider morph the outgoing stop's names fade out over the first 40% and the incoming stop's fade in over the last 40%. Names do not travel.
- Size tiers (labels.js L66-70, k = 0.88): strong `0.88 * (17 + 7 * min(1, sqrt(n / 346)))`, others `0.88 * (15 + 3 * min(1, sqrt(n / 346)))`; times a zoom factor `clamp((coverPx / 12.5) ^ 0.3, 0.85, 1.35)` on desktop, in half-pixel steps; on a phone `clamp(size * 0.72, 13, 16)`. `ThemeLabel` has no broad-area level, so the prototype's third tier is not used. The zoom factor is relative to 12.5 px covers, the same reference the stars use (inferred: the prototype measures it against its Overview framing, which the app does not have as a separate view).
- A name tries its true centre, then the prototype's twelve nudges (`OFFSETS`), keeping its last spot first. A box must stay 10 px inside the visible map and clear of chrome, of other names, of focus covers and of focus lines (8 px).
- **Halo and contrast.** The dark halo round the glyphs is the name's immediate surround, so contrast is measured against it. With gas luminance `bg`, ink luminance `ink`, ink opacity `a` and halo strength `h`: the surround is `b = bg * (1 - h)^2.2` (the gas seen through a black layer of opacity `h`, blended in gamma space), the ink over it is `t = (a * ink^(1/2.2) + (1 - a) * b^(1/2.2))^2.2`, and the ratio is `(t + 0.05) / (b + 0.05)`. `haloFor` takes the first `h` in 0.50, 0.55 … 1.00 that reaches 4.5 and adds 0.15 (capped at 1). A name that was nudged off its centre, any name during a morph, and every name on a phone gets the full halo (1), because `label.lum` was measured under the unmoved box, at rest, at the desktop overview scale (part 1 Task 3: 600 px per world unit); on a phone a name covers more than twice that much of the map.
- Chrome rectangles are fixed numbers read from `styles/map.css` and `styles/phone.css`, not measured, so no layout is read per frame. The zoom corner is the taller one: the detached names toggle (one box) 8 px above the three zoom buttons.

- [ ] **Step 1: Write the failing test**

Create `frontcreck/src/components/map/state/namesLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ThemeLabel } from '@/lib/data/theme';
import {
  NAMES_MAX_PHONE,
  NAME_EDGE_PX,
  chromeBlockers,
  createWidthCache,
  haloFor,
  layoutNames,
  luminance,
  nameContrast,
  nameFades,
  nameFontPx,
  nameKey,
  namesShown,
  nameZoomK,
  type NameCandidate,
  type NamesInput,
} from './namesLayout';

function label(id: string, p: number, extra: Partial<ThemeLabel> = {}): ThemeLabel {
  return { id, name: 'Playful Way', x: 0, y: 0, strong: true, n: 300, p, rgb: [240, 236, 228], lum: 0.4, ...extra };
}
function cand(id: string, x: number, y: number, p: number, extra: Partial<ThemeLabel> = {}, alpha = 1): NameCandidate {
  return { key: nameKey('balanced', id), label: label(id, p, extra), x, y, alpha };
}
const widths = createWidthCache((text) => text.length * 62);
const DESKTOP = { width: 1440, height: 836, inset: 0, phone: false, bottomCover: 0, focus: false, card: false };

function input(over: Partial<NamesInput>): NamesInput {
  return {
    candidates: [],
    visible: { left: 0, top: 0, right: 1440, bottom: 836 },
    blockers: chromeBlockers(DESKTOP),
    lines: [],
    phone: false,
    zoomK: 1,
    fullHalo: false,
    widthOf: widths.widthOf,
    sticky: new Map(),
    ...over,
  };
}

describe('when names show', () => {
  it('is while covers would be under 13 px, and not above', () => {
    expect(namesShown(4)).toBe(true);
    expect(namesShown(12.9)).toBe(true);
    expect(namesShown(13)).toBe(false);
    expect(namesShown(32)).toBe(false);
  });
});

describe('name sizes', () => {
  it('follows the two tiers at k = 0.88, in half-pixel steps', () => {
    expect(nameFontPx({ strong: true, n: 346 }, false, 1)).toBe(21);
    expect(nameFontPx({ strong: true, n: 300 }, false, 1)).toBe(20.5);
    expect(nameFontPx({ strong: false, n: 346 }, false, 1)).toBe(16);
    expect(nameFontPx({ strong: false, n: 50 }, false, 0.85)).toBe(12);
  });

  it('is clamped to 13 to 16 px on a phone, whatever the zoom', () => {
    expect(nameFontPx({ strong: true, n: 1000 }, true, 1.35)).toBe(15);
    expect(nameFontPx({ strong: false, n: 10 }, true, 0.85)).toBe(13);
  });

  it('scales gently with the zoom, between 0.85 and 1.35', () => {
    expect(nameZoomK(12.5)).toBe(1);
    expect(nameZoomK(1)).toBe(0.85);
    expect(nameZoomK(64)).toBe(1.35);
  });
});

describe('nameFades (slider morph)', () => {
  it('shows the current stop at rest', () => {
    expect(nameFades(0.5, 'balanced', 'balanced')).toEqual([{ stop: 'balanced', alpha: 1 }]);
    expect(nameFades(1, 'balanced', 'mood')).toEqual([{ stop: 'mood', alpha: 1 }]);
  });

  it('fades the outgoing names out over the first 40% and the incoming in over the last 40%', () => {
    expect(nameFades(0.5, 'balanced', 'mood')).toEqual([{ stop: 'balanced', alpha: 1 }]);
    const early = nameFades(0.6, 'balanced', 'mood');
    expect(early).toHaveLength(1);
    expect(early[0].stop).toBe('balanced');
    expect(early[0].alpha).toBeCloseTo(0.5, 6);
    expect(nameFades(0.75, 'balanced', 'mood')).toEqual([]);
    const late = nameFades(0.9, 'balanced', 'mood');
    expect(late).toHaveLength(1);
    expect(late[0].stop).toBe('mood');
    expect(late[0].alpha).toBeCloseTo(0.5, 6);
  });

  it('works across the middle stop and backwards', () => {
    expect(nameFades(0.5, 'sonic', 'mood')).toEqual([]);
    expect(nameFades(0.9, 'mood', 'sonic')[0]).toEqual({ stop: 'mood', alpha: expect.closeTo(0.75, 6) });
  });
});

describe('halo strength and contrast', () => {
  it('reaches 4.5:1 against the brightest gas, for full and for fair names', () => {
    let worst = Infinity;
    for (let bg = 0; bg <= 1.0001; bg += 0.05) {
      for (const ink of [0.5, 0.7, luminance([240, 236, 228]), 1]) {
        for (const a of [1, 0.82]) worst = Math.min(worst, nameContrast(bg, ink, a, haloFor(bg, ink, a)));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });

  it('is weaker on dim gas than on bright gas, and never under 0.65', () => {
    expect(haloFor(0.1, 0.8)).toBe(0.65);
    expect(haloFor(1, 0.8)).toBeGreaterThan(haloFor(0.1, 0.8));
    expect(haloFor(1, 0.8)).toBeLessThanOrEqual(1);
  });

  it('is full when no halo can reach the ratio', () => {
    expect(haloFor(1, 0.1)).toBe(1);
  });

  it('measures luminance as WCAG does', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(luminance([0, 0, 0])).toBe(0);
  });
});

describe('layoutNames', () => {
  it('places the higher priority name on its centre and nudges the other, with a full halo once nudged', () => {
    const sticky = new Map<string, number>();
    const out = layoutNames(input({ candidates: [cand('a', 700, 400, 5), cand('b', 705, 405, 9)], sticky }));
    expect(out.map((p) => p.key)).toEqual([nameKey('balanced', 'b'), nameKey('balanced', 'a')]);
    expect([out[0].x, out[0].y]).toEqual([705, 405]);
    expect(out[0].halo).toBe(haloFor(0.4, luminance([240, 236, 228])));
    expect([out[1].x, out[1].y]).not.toEqual([700, 400]);
    expect(out[1].halo).toBe(1);
    expect(sticky.get(nameKey('balanced', 'b'))).toBe(0);
  });

  it('keeps a name on the spot it had, so it does not jump while the map moves', () => {
    const sticky = new Map<string, number>([[nameKey('balanced', 'a'), 2]]);
    const out = layoutNames(input({ candidates: [cand('a', 700, 400, 5)], sticky }));
    expect([out[0].x, out[0].y]).toEqual([700, 422]);
  });

  it('skips names whose album cloud is off screen, and names fully faded out', () => {
    const out = layoutNames(input({ candidates: [cand('off', 2000, 400, 9), cand('gone', 700, 400, 8, {}, 0), cand('in', 700, 600, 1)] }));
    expect(out.map((p) => p.key)).toEqual([nameKey('balanced', 'in')]);
  });

  it('never puts a name over the slider card, the zoom corner or the hint line, or within 10 px of the edge', () => {
    const blockers = chromeBlockers(DESKTOP);
    const cands = [cand('slider', 140, 80, 9), cand('zoom', 1410, 740, 8), cand('hint', 150, 825, 7), cand('edge', 30, 400, 6)];
    const out = layoutNames(input({ candidates: cands }));
    for (const p of out) {
      const w = widths.widthOf(label('x', 0), p.fontPx) / 2 + 6;
      const h = (p.fontPx * 1.05) / 2 + 4;
      const box = { left: p.x - w, top: p.y - h, right: p.x + w, bottom: p.y + h };
      for (const k of blockers) expect(box.left < k.right && box.right > k.left && box.top < k.bottom && box.bottom > k.top, p.key).toBe(false);
      expect(box.left).toBeGreaterThanOrEqual(NAME_EDGE_PX);
      expect(box.right).toBeLessThanOrEqual(1440 - NAME_EDGE_PX);
    }
  });

  it('keeps names off focus lines', () => {
    const out = layoutNames(input({ candidates: [cand('a', 700, 400, 5)], lines: [[600, 400, 800, 400]] }));
    expect(out).toHaveLength(1);
    expect(Math.abs(out[0].y - 400)).toBeGreaterThan(20);
  });

  it('shows at most four names on a phone', () => {
    const phone = { width: 390, height: 780, inset: 0, phone: true, bottomCover: 165, focus: false, card: false };
    const cands = Array.from({ length: 9 }, (_, i) => cand(`n${i}`, 195, 60 + 55 * i, i));
    const out = layoutNames(input({ candidates: cands, phone: true, visible: { left: 0, top: 0, right: 390, bottom: 780 }, blockers: chromeBlockers(phone) }));
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(NAMES_MAX_PHONE);
    for (const p of out) expect(p.fontPx).toBeGreaterThanOrEqual(13);
  });

  it('gives every name the full halo during a morph', () => {
    const out = layoutNames(input({ candidates: [cand('a', 700, 400, 5, {}, 0.5)], fullHalo: true }));
    expect(out[0].halo).toBe(1);
    expect(out[0].alpha).toBe(0.5);
  });

  it('returns nothing for a stop with no labels', () => {
    expect(layoutNames(input({ candidates: [] }))).toEqual([]);
  });

  it('returns nothing when no name fits (a very narrow or very short map)', () => {
    expect(layoutNames(input({ candidates: [cand('a', 60, 40, 5)], visible: { left: 0, top: 0, right: 120, bottom: 80 }, blockers: [] }))).toEqual([]);
    expect(layoutNames(input({ candidates: [cand('a', 700, 20, 5)], visible: { left: 0, top: 0, right: 1440, bottom: 40 }, blockers: [] }))).toEqual([]);
  });
});

describe('chromeBlockers', () => {
  it('covers the slider card, the taller zoom corner (toggle plus zoom stack) and the hint line on desktop', () => {
    const b = chromeBlockers(DESKTOP);
    expect(b).toContainEqual({ left: 12, top: 12, right: 272, bottom: 154 });
    expect(b).toContainEqual({ left: 1440 - 68, top: 836 - 196, right: 1440, bottom: 836 });
    expect(b).toContainEqual({ left: 0, top: 836 - 46, right: 380, bottom: 836 });
  });

  it('follows the album panel inset, and swaps the hint for the card', () => {
    const b = chromeBlockers({ ...DESKTOP, inset: 648, focus: true });
    expect(b).toContainEqual({ left: 660, top: 12, right: 920, bottom: 154 });
    expect(b).toContainEqual({ left: 648, top: 836 - 46, right: 648 + 580, bottom: 836 });
    expect(b).toContainEqual({ left: 1440 - 200, top: 12, right: 1440, bottom: 68 });
    const withCard = chromeBlockers({ ...DESKTOP, card: true });
    expect(withCard).toContainEqual({ left: 12, top: 836 - 200, right: 428, bottom: 836 });
    expect(withCard).not.toContainEqual({ left: 0, top: 836 - 46, right: 380, bottom: 836 });
  });

  it('covers the bottom slider and the zoom corner above it on a phone', () => {
    const b = chromeBlockers({ width: 390, height: 780, inset: 0, phone: true, bottomCover: 165, focus: false, card: false });
    expect(b).toContainEqual({ left: 0, top: 780 - 165 - 10, right: 390, bottom: 780 });
    expect(b).toContainEqual({ left: 390 - 64, top: 780 - 165 - 200, right: 390, bottom: 780 - 165 });
  });
});

describe('createWidthCache', () => {
  it('measures a name once at 100 px, adds the tracking and scales', () => {
    let calls = 0;
    const cache = createWidthCache((text) => {
      calls++;
      expect(text).toBe('PLAYFUL WAY');
      return 620;
    });
    expect(cache.widthOf(label('a', 1), 20)).toBeCloseTo(((620 + 100 * 0.26 * 11) * 20) / 100, 6);
    cache.widthOf(label('a', 1), 16);
    expect(calls).toBe(1);
  });

  it('measures again after clear (the face arrived after the first measurement)', () => {
    let width = 500;
    const cache = createWidthCache(() => width);
    const before = cache.widthOf(label('a', 1), 20);
    width = 620;
    expect(cache.widthOf(label('a', 1), 20)).toBe(before);
    cache.clear();
    expect(cache.widthOf(label('a', 1), 20)).toBeGreaterThan(before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `(cd frontcreck && npm run test -- src/components/map/state/namesLayout.test.ts)`
Expected: FAIL, `Failed to resolve import "./namesLayout"`.

- [ ] **Step 3: Write the implementation**

Create `frontcreck/src/components/map/state/namesLayout.ts`:

```ts
/** Region names: which show, how large, where, and how strong a halo each needs. Pure; RegionNamesDriver
 * feeds it screen positions each rendered frame and writes the result to the DOM. Ported from the Trifid
 * prototype's labels.js. Names are plain lettering: nothing here knows about hover, click or focus. */
import type { ThemeLabel } from '@/lib/data/theme';
import type { StopId } from '@/lib/types';
import { STOP_T } from '../data';
import { NAMES_BAND_PX } from '../theme';
import type { ViewBounds } from './projection';

/** Most names at once on desktop (every approved Balanced name) and on a phone. */
export const NAMES_MAX = 17;
export const NAMES_MAX_PHONE = 4;
/** Tenor Sans runs wide: its sizes are 0.88 of the original lettering's. */
export const NAME_SIZE_K = 0.88;
/** Letter spacing in em (styles/map.css .rn b uses the same value). */
export const NAME_TRACK_EM = 0.26;
/** Covers are this size at the zoom the size tiers were drawn for. */
const NAME_REF_COVER_PX = 12.5;
/** A name stays this far inside the visible map. */
export const NAME_EDGE_PX = 10;
/** Names stay this far from a focus line. */
const NAME_LINE_CLEAR_PX = 8;
/** One name per this much free map, at most. */
const NAME_AREA_PX = 160 * 90;
export const NAME_CONTRAST = 4.5;
/** Opacity of a name that is not `strong` (styles/map.css .rn.fair). */
export const NAME_FAIR_ALPHA = 0.82;
/** Nudges tried in order when the true centre is taken; small, so a name stays on its region. */
export const NAME_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0], [0, -22], [0, 22], [-40, 0], [40, 0], [0, -46], [0, 46], [-70, -30], [70, 30], [70, -30], [-70, 30], [0, -78], [0, 78],
];

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** Overlay key of a name's element (ids repeat across stops, so the stop is part of it). */
export const nameKey = (stop: StopId, id: string): string => `name:${stop}:${id}`;

/** Names show at Whole map and Overview and are gone once the map is zoomed in. No partial fade. */
export function namesShown(coverPx: number): boolean {
  return coverPx < NAMES_BAND_PX;
}

export function nameZoomK(coverPx: number): number {
  return clamp(Math.pow(coverPx / NAME_REF_COVER_PX, 0.3), 0.85, 1.35);
}

/** Font size in CSS px, in half-pixel steps so the element's font-size is rewritten only on a visible change. */
export function nameFontPx(label: Pick<ThemeLabel, 'strong' | 'n'>, phone: boolean, zoomK: number): number {
  const s = Math.min(1, Math.sqrt(label.n / 346));
  const base = NAME_SIZE_K * (label.strong ? 17 + 7 * s : 15 + 3 * s);
  const px = phone ? clamp(base * 0.72, 13, 16) : base * zoomK;
  return Math.round(px * 2) / 2;
}

export interface NameFade {
  stop: StopId;
  alpha: number;
}

/** Which stops' names show at slider position `sliderT` on the way from stop `from` to stop `to`: the outgoing
 * names fade out over the first 40% of the way, the incoming fade in over the last 40%. Names do not travel:
 * ids differ between stops. */
export function nameFades(sliderT: number, from: StopId, to: StopId): NameFade[] {
  const a = STOP_T[from];
  const b = STOP_T[to];
  if (a === b) return [{ stop: to, alpha: 1 }];
  const k = clamp((sliderT - a) / (b - a), 0, 1);
  const out: NameFade[] = [];
  const fadeOut = clamp(1 - k / 0.4, 0, 1);
  const fadeIn = clamp((k - 0.6) / 0.4, 0, 1);
  if (fadeOut > 0) out.push({ stop: from, alpha: fadeOut });
  if (fadeIn > 0) out.push({ stop: to, alpha: fadeIn });
  return out;
}

const linear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance of an sRGB colour, 0..255 per channel. */
export function luminance(rgb: readonly number[]): number {
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

/** Contrast of ink (luminance `inkLum`, opacity `inkAlpha`) against its dark halo of strength `halo` over gas
 * of luminance `bgLum`. The halo is the name's immediate surround, so it is what the ink is measured against. */
export function nameContrast(bgLum: number, inkLum: number, inkAlpha: number, halo: number): number {
  const b = bgLum * Math.pow(Math.max(0, 1 - halo), 2.2);
  const t = Math.pow(inkAlpha * Math.pow(inkLum, 1 / 2.2) + (1 - inkAlpha) * Math.pow(b, 1 / 2.2), 2.2);
  return (t + 0.05) / (b + 0.05);
}

/** Halo strength (the CSS --h, 0.65..1) that brings a name to `ratio`:1 over gas of luminance `bgLum`: the
 * first strength from 0.5 in steps of 0.05 that reaches it, plus 0.15. Full when none does. */
export function haloFor(bgLum: number, inkLum: number, inkAlpha = 1, ratio = NAME_CONTRAST): number {
  for (let step = 10; step <= 20; step++) {
    const h = step / 20;
    if (nameContrast(bgLum, inkLum, inkAlpha, h) >= ratio) return Math.min(1, h + 0.15);
  }
  return 1;
}

export interface NameCandidate {
  key: string;
  label: ThemeLabel;
  /** Screen position of the label's point, canvas CSS px. */
  x: number;
  y: number;
  /** 1, or less while its stop fades in or out during a slider morph. */
  alpha: number;
}

export interface PlacedName {
  key: string;
  /** Centre of the name, canvas CSS px. */
  x: number;
  y: number;
  fontPx: number;
  alpha: number;
  halo: number;
}

/** A focus line, x1, y1, x2, y2 in canvas CSS px. */
export type NameLine = readonly [number, number, number, number];

export interface NamesInput {
  candidates: readonly NameCandidate[];
  /** The part of the canvas that shows the map. */
  visible: ViewBounds;
  /** Rectangles no name may touch: chrome, focus covers, the picked album. */
  blockers: readonly ViewBounds[];
  lines: readonly NameLine[];
  phone: boolean;
  zoomK: number;
  /** Every name gets the full halo (during a slider morph and on a phone, when label.lum does not describe the gas). */
  fullHalo: boolean;
  /** Width of a name's text at a font size, CSS px. */
  widthOf: (label: ThemeLabel, fontPx: number) => number;
  /** The offset each name last used; read and written, so a name does not jump while the map moves. */
  sticky: Map<string, number>;
}

/** Liang-Barsky: does the segment cross the box grown by `pad`? */
function lineHitsBox(l: NameLine, b: ViewBounds, pad: number): boolean {
  const x0 = b.left - pad;
  const y0 = b.top - pad;
  const x1 = b.right + pad;
  const y1 = b.bottom + pad;
  const dx = l[2] - l[0];
  const dy = l[3] - l[1];
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, l[0] - x0], [dx, x1 - l[0]], [-dy, l[1] - y0], [dy, y1 - l[1]]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

const overlapsAny = (a: ViewBounds, list: readonly ViewBounds[]): boolean => list.some((k) => a.left < k.right && a.right > k.left && a.top < k.bottom && a.bottom > k.top);

/** Places names in priority order. Returns only the names that found a spot; the caller hides the rest. */
export function layoutNames(input: NamesInput): PlacedName[] {
  const { visible: v, blockers, lines, phone, zoomK, sticky } = input;
  let blocked = 0;
  for (const k of blockers) {
    blocked += Math.max(0, Math.min(k.right, v.right) - Math.max(k.left, v.left)) * Math.max(0, Math.min(k.bottom, v.bottom) - Math.max(k.top, v.top));
  }
  const area = Math.max(0, v.right - v.left) * Math.max(0, v.bottom - v.top);
  const budget = Math.min(phone ? NAMES_MAX_PHONE : NAMES_MAX, Math.max(1, Math.floor((area - blocked) / NAME_AREA_PX)));
  const cands = input.candidates.filter((c) => c.alpha > 0).sort((p, q) => q.label.p - p.label.p || (p.key < q.key ? -1 : 1));
  const placed: PlacedName[] = [];
  const boxes: ViewBounds[] = [];
  for (const c of cands) {
    if (placed.length >= budget) break;
    if (c.x < v.left || c.x > v.right || c.y < v.top || c.y > v.bottom) continue;
    const fontPx = nameFontPx(c.label, phone, zoomK);
    const w = input.widthOf(c.label, fontPx) / 2 + 6;
    const h = (fontPx * 1.05) / 2 + 4;
    const keep = sticky.get(c.key) ?? 0;
    let box: ViewBounds | null = null;
    let used = 0;
    // The spot it had last time first, then the others in order.
    for (let n = 0; n <= NAME_OFFSETS.length && !box; n++) {
      const k = n === 0 ? keep : n - 1;
      if ((n > 0 && k === keep) || !NAME_OFFSETS[k]) continue;
      const x = c.x + NAME_OFFSETS[k][0];
      const y = c.y + NAME_OFFSETS[k][1];
      const b = { left: x - w, top: y - h, right: x + w, bottom: y + h };
      if (b.left < v.left + NAME_EDGE_PX || b.right > v.right - NAME_EDGE_PX || b.top < v.top + NAME_EDGE_PX || b.bottom > v.bottom - NAME_EDGE_PX) continue;
      if (overlapsAny(b, blockers) || overlapsAny(b, boxes) || lines.some((l) => lineHitsBox(l, b, NAME_LINE_CLEAR_PX))) continue;
      box = b;
      used = k;
    }
    if (!box) continue;
    sticky.set(c.key, used);
    boxes.push(box);
    placed.push({
      key: c.key,
      x: Math.round((box.left + box.right) * 5) / 10,
      y: Math.round((box.top + box.bottom) * 5) / 10,
      fontPx,
      alpha: c.alpha,
      // label.lum is the brightest gas under the unmoved name at rest: anywhere else, take the full halo.
      halo: input.fullHalo || used !== 0 ? 1 : haloFor(c.label.lum, luminance(c.label.rgb), c.label.strong ? 1 : NAME_FAIR_ALPHA),
    });
  }
  return placed;
}

export interface ChromeInput {
  /** Canvas size, CSS px. */
  width: number;
  height: number;
  /** CSS px covered by the album panel on the left. */
  inset: number;
  phone: boolean;
  /** CSS px covered by the phone slider panel along the bottom (MapInput.bottomCover). */
  bottomCover: number;
  /** Album view: "Explore this area" and the longer hint are shown. */
  focus: boolean;
  /** Explore with a picked album: its card is shown (and the hint is not). */
  card: boolean;
}

/** Height of the zoom corner: the names toggle, an 8 px gap, three zoom buttons (40 px each; 44 on a phone). */
const ZOOM_CORNER_DESKTOP_PX = 40 + 8 + 3 * 40;
const ZOOM_CORNER_PHONE_PX = 44 + 8 + 3 * 44;

/** The map's controls as rectangles in canvas CSS px, from the fixed positions in styles/map.css and
 * styles/phone.css with a few px to spare (nothing is measured, so no layout is read per frame). */
export function chromeBlockers(c: ChromeInput): ViewBounds[] {
  const { width: W, height: H, inset: L } = c;
  const out: ViewBounds[] = [];
  if (c.phone) {
    // The slider panel across the bottom, and the zoom corner 8 px above it on the right.
    out.push({ left: 0, top: H - c.bottomCover - 10, right: W, bottom: H });
    out.push({ left: W - 64, top: H - c.bottomCover - 16 - ZOOM_CORNER_PHONE_PX, right: W, bottom: H - c.bottomCover });
    if (c.card) out.push({ left: 0, top: H - c.bottomCover - 160, right: W, bottom: H });
    if (c.focus) {
      out.push({ left: 0, top: 0, right: 230, bottom: 68 }); // "Explore this area", top left
      out.push({ left: W - 110, top: 0, right: W, bottom: 64 }); // the List button, top right
    }
    return out;
  }
  out.push({ left: L + 12, top: 12, right: L + 272, bottom: 154 }); // the slider card, top left
  out.push({ left: W - 68, top: H - 28 - ZOOM_CORNER_DESKTOP_PX, right: W, bottom: H }); // toggle plus zoom stack
  if (c.card) out.push({ left: L + 12, top: H - 200, right: L + 428, bottom: H });
  else out.push({ left: L, top: H - 46, right: L + Math.min(c.focus ? 580 : 380, W - L - 80), bottom: H }); // the hint line
  if (c.focus) out.push({ left: W - 200, top: 12, right: W, bottom: 68 }); // "Explore this area", top right
  return out;
}

export interface WidthCache {
  widthOf: (label: ThemeLabel, fontPx: number) => number;
  /** Forget every width (the lettering face arrived, or changed). */
  clear: () => void;
}

/** Text widths, measured once per name at 100 px by `measure100` (the capitals, without tracking) and scaled.
 * Widths taken before the face loaded are wrong: call clear() when it arrives. */
export function createWidthCache(measure100: (text: string) => number): WidthCache {
  const at100 = new Map<string, number>();
  return {
    widthOf(label, fontPx) {
      let w = at100.get(label.name);
      if (w === undefined) {
        w = measure100(label.name.toUpperCase()) + 100 * NAME_TRACK_EM * label.name.length;
        at100.set(label.name, w);
      }
      return (w * fontPx) / 100;
    },
    clear() {
      at100.clear();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `(cd frontcreck && npm run test -- src/components/map/state/namesLayout.test.ts)`
Expected: PASS, 25 tests.

- [ ] **Step 5: Commit**

```bash
git add frontcreck/src/components/map/state/namesLayout.ts frontcreck/src/components/map/state/namesLayout.test.ts
git commit -m "feat(map): region names layout, sizes, morph fades and halo contrast

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Names toggle (saved preference, store flag, detached button)

**Approval status.** The control's look is **approved**: option B, chosen by the owner on 2026-10-04 (`docs/design/trifid-theme/options/toggle-b-on.jpg`, `toggle-b-off.jpg`, `toggle-options.jpg`; prototype `src/app.js` `namesToggle()` and the `toggle` block at the end of `src/css/pages.css`, variant `b`). **Still pending the owner's approval, and marked so in the code:** the two accessible labels ("Hide place names" / "Show place names", proposed wording) and the final off-state icon. Option B was never rendered on a phone; Task 8 step 4 takes the 390 x 844 screenshots for his sign-off. Do not ship this task's wording without his yes.

**Files:**
- Create: `frontcreck/src/lib/namesPref.ts`
- Test: `frontcreck/src/lib/namesPref.test.ts`
- Modify: `frontcreck/src/lib/store.ts` (L2 import, L8-41 `AppState`, L56-88 store, L90-93 test hooks)
- Test: `frontcreck/src/lib/store.test.ts` (append inside the top-level `describe`)
- Modify: `frontcreck/src/components/Icon.tsx` (L30, new entries after `list`)
- Modify: `frontcreck/src/lib/copy.ts` (after L79, `exploreHere`)
- Create: `frontcreck/src/components/map/overlays/NamesToggle.tsx`
- Test: `frontcreck/src/components/map/overlays/NamesToggle.test.tsx`
- Modify: `frontcreck/src/components/map/overlays/ZoomControls.tsx` (L3-9)
- Modify: `frontcreck/src/styles/map.css` (new rules after the `.mk-n[data-hot]` rule from Task 4)

**Interfaces:**
- Consumes: `Icon` (`@/components/Icon`), `COPY`, `useAppStore`.
- Produces:
  ```ts
  // src/lib/namesPref.ts
  export const NAMES_KEY = 'rmr-names';
  export function readNamesOn(): boolean;          // default true; never throws
  export function writeNamesOn(v: boolean): void;  // never throws
  // src/lib/store.ts (AppState)
  namesOn: boolean;
  setNamesOn: (v: boolean) => void;
  // src/components/Icon.tsx
  IconName gains 'names' | 'namesOff'
  // src/lib/copy.ts
  COPY.map.namesHide: 'Hide place names';   // pending approval
  COPY.map.namesShow: 'Show place names';   // pending approval
  // src/components/map/overlays/NamesToggle.tsx
  export function NamesToggle(): React.JSX.Element;   // <button class="map-names" aria-pressed>
  ```

**Placement (which of the two the brief allowed, and why).** The button is the **first child of `.map-zoom`** in `ZoomControls.tsx`, with `margin-bottom: 8px` and its own full border, not a sibling. That way the existing phone rules apply to it with no new CSS: `.has-card .map-zoom { display: none; }` hides it with the zoom stack while the Explore card is open, and `.map-zoom { bottom: calc(var(--slider-cover, …) + 8px); }` keeps the whole corner above the slider panel. It takes the generic `.map-zoom button` size and glass style (40 px; 44 px on a phone from `styles/phone.css` L46), which part 3 owns.

**No hydration mismatch.** The store starts with `namesOn: true` on the server and in the first client render. The saved value is applied in the store module's existing browser-only block. Nothing rendered on the server depends on `namesOn`: the toggle (inside `ZoomControls`) and the names (inside the dynamically imported `MusicMap`) both mount only on the client after the map data has loaded. Task 8 checks a reload with the preference off for hydration errors.

**The icon.** The prototype's "Aa" glyph. Its flaw at 16 px was the off state: a slash drawn straight over the dimmed letters turned to mud. Here the letters are dimmed to 42% **and cut by a mask** along the slash (a 4.6 unit band in the 24 unit box, about 3 px at 16 px), and the slash (1.6 units, about 1 px) is drawn at full strength in the gap. That leaves about 1 px of clear panel on each side of the slash; a mask, unlike a stroke in the panel colour, also works on a see-through glass panel.

On:

```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false">
  <g stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.5 18 7.5 6l5 12M4.4 13.6h6.2"/>
    <circle cx="17.6" cy="14.6" r="3.2"/>
    <path d="M20.8 11.2V18"/>
  </g>
</svg>
```

Off:

```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false">
  <mask id="rmr-names-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
    <rect width="24" height="24" fill="#fff" stroke="none"/>
    <path d="M3.5 21 20.5 3" stroke="#000" stroke-width="4.6" stroke-linecap="round"/>
  </mask>
  <g mask="url(#rmr-names-cut)" opacity="0.42" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.5 18 7.5 6l5 12M4.4 13.6h6.2"/>
    <circle cx="17.6" cy="14.6" r="3.2"/>
    <path d="M20.8 11.2V18"/>
  </g>
  <path d="M3.5 21 20.5 3" stroke-width="1.6" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 1: Write the failing preference test**

Create `frontcreck/src/lib/namesPref.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAMES_KEY, readNamesOn, writeNamesOn } from './namesPref';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('names preference', () => {
  it('is on by default', () => {
    expect(readNamesOn()).toBe(true);
  });

  it('round-trips off and on through localStorage', () => {
    writeNamesOn(false);
    expect(window.localStorage.getItem(NAMES_KEY)).toBe('0');
    expect(readNamesOn()).toBe(false);
    writeNamesOn(true);
    expect(window.localStorage.getItem(NAMES_KEY)).toBe('1');
    expect(readNamesOn()).toBe(true);
  });

  it('treats junk as on', () => {
    for (const junk of ['', 'false', 'off', '{bad json', 'null', '00']) {
      window.localStorage.setItem(NAMES_KEY, junk);
      expect(readNamesOn(), junk).toBe(true);
    }
  });

  it('survives storage throwing on read and on write', () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    expect(readNamesOn()).toBe(true);
    expect(() => writeNamesOn(false)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `(cd frontcreck && npm run test -- src/lib/namesPref.test.ts)`
Expected: FAIL, `Failed to resolve import "./namesPref"`.

- [ ] **Step 3: Write the preference module**

Create `frontcreck/src/lib/namesPref.ts`:

```ts
/** Whether the map's region names are shown: remembered on this device, on by default. */
export const NAMES_KEY = 'rmr-names';

/** Only an exact '0' means off; a missing value, junk or blocked storage all mean on. */
export function readNamesOn(): boolean {
  try {
    return window.localStorage.getItem(NAMES_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeNamesOn(on: boolean): void {
  try {
    window.localStorage.setItem(NAMES_KEY, on ? '1' : '0');
  } catch {
    // storage can be blocked; the choice then lasts for this page load only
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `(cd frontcreck && npm run test -- src/lib/namesPref.test.ts)`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing store tests**

In `frontcreck/src/lib/store.test.ts`, add before the closing `});` of the top-level `describe`:

```ts
  it('shows region names by default, and saves the choice when it changes', () => {
    window.localStorage.clear();
    expect(useAppStore.getState().namesOn).toBe(true);
    const calls = countNotifications(() => {
      useAppStore.getState().setNamesOn(true);
      useAppStore.getState().setNamesOn(false);
      useAppStore.getState().setNamesOn(false);
    });
    expect(calls).toBe(1);
    expect(useAppStore.getState().namesOn).toBe(false);
    expect(window.localStorage.getItem('rmr-names')).toBe('0');
  });

  it('still switches names off for the page load when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    useAppStore.getState().setNamesOn(false);
    expect(useAppStore.getState().namesOn).toBe(false);
  });

  it('starts from the saved choice in the browser', async () => {
    window.localStorage.setItem('rmr-names', '0');
    vi.resetModules();
    const fresh = await import('./store');
    expect(fresh.useAppStore.getState().namesOn).toBe(false);
    window.localStorage.clear();
  });
```

- [ ] **Step 6: Run them to verify they fail**

Run: `(cd frontcreck && npm run test -- src/lib/store.test.ts)`
Expected: FAIL, `setNamesOn is not a function` and `expected undefined to be true`.

- [ ] **Step 7: Add the flag to the store**

In `frontcreck/src/lib/store.ts`:

After L2 (`import { pushTrail, readTrail, writeTrail } from '@/lib/trail';`) add:

```ts
import { readNamesOn, writeNamesOn } from '@/lib/namesPref';
```

In `AppState`, after the `toast` field (L28) add:

```ts
  /** Whether the map's region names are shown (the names toggle; remembered on this device). */
  namesOn: boolean;
```

and after `clearToast: () => void;` (L40) add:

```ts
  setNamesOn: (namesOn: boolean) => void;
```

In the store, after `toast: null,` (L67) add:

```ts
  // On for the server render and the first client render; the saved choice is applied below, in the browser.
  namesOn: true,
```

and after `clearToast: () => set({ toast: null }),` (L87) add:

```ts
  setNamesOn: (namesOn) => {
    if (get().namesOn === namesOn) return;
    set({ namesOn });
    writeNamesOn(namesOn);
  },
```

Replace the test-hooks block (L90-93):

```ts
// Test hooks (Playwright, the perf script). getState includes the setters, so these can change state as well.
if (typeof window !== 'undefined') {
  window.__rmr = { ...window.__rmr, getState: useAppStore.getState, subscribe: useAppStore.subscribe };
}
```

with:

```ts
if (typeof window !== 'undefined') {
  // The saved names choice. Safe before hydration: nothing rendered on the server depends on it (the toggle
  // and the names mount only on the client, once the map data has loaded).
  useAppStore.setState({ namesOn: readNamesOn() });
  // Test hooks (Playwright, the perf script). getState includes the setters, so these can change state as well.
  window.__rmr = { ...window.__rmr, getState: useAppStore.getState, subscribe: useAppStore.subscribe };
}
```

- [ ] **Step 8: Run the store tests to verify they pass**

Run: `(cd frontcreck && npm run test -- src/lib/store.test.ts)`
Expected: PASS, every test.

- [ ] **Step 9: Add the icons and the proposed labels**

In `frontcreck/src/components/Icon.tsx`, after the `list` entry (L30) add:

```tsx
  // The names toggle. PENDING OWNER APPROVAL: the off-state drawing (letters at 42%, cut by a mask along the slash).
  names: (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 18 7.5 6l5 12M4.4 13.6h6.2" />
      <circle cx="17.6" cy="14.6" r="3.2" />
      <path d="M20.8 11.2V18" />
    </g>
  ),
  namesOff: (
    <>
      <mask id="rmr-names-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" stroke="none" />
        <path d="M3.5 21 20.5 3" stroke="#000" strokeWidth="4.6" strokeLinecap="round" />
      </mask>
      <g mask="url(#rmr-names-cut)" opacity="0.42" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 18 7.5 6l5 12M4.4 13.6h6.2" />
        <circle cx="17.6" cy="14.6" r="3.2" />
        <path d="M20.8 11.2V18" />
      </g>
      <path d="M3.5 21 20.5 3" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
```

In `frontcreck/src/lib/copy.ts`, after L79 (`exploreHere: 'Explore this area',`) add:

```ts
    /** The names toggle's labels. PENDING OWNER APPROVAL (proposed wording, 2026-10-04). */
    namesHide: 'Hide place names',
    namesShow: 'Show place names',
```

- [ ] **Step 10: Write the failing toggle test**

Create `frontcreck/src/components/map/overlays/NamesToggle.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';
import { NamesToggle } from './NamesToggle';

beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState({ namesOn: true });
});
afterEach(() => useAppStore.setState({ namesOn: true }));

describe('NamesToggle', () => {
  it('is an icon-only pressed button that switches the names off and on and saves the choice', () => {
    const { getByRole, unmount } = render(<NamesToggle />);
    const button = getByRole('button', { name: COPY.map.namesHide });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('type', 'button');
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(button);
    expect(useAppStore.getState().namesOn).toBe(false);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('aria-label', COPY.map.namesShow);
    expect(button.querySelector('mask')).not.toBeNull();
    expect(window.localStorage.getItem('rmr-names')).toBe('0');
    fireEvent.click(button);
    expect(useAppStore.getState().namesOn).toBe(true);
    expect(window.localStorage.getItem('rmr-names')).toBe('1');
    unmount();
  });
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `(cd frontcreck && npm run test -- src/components/map/overlays/NamesToggle.test.tsx)`
Expected: FAIL, `Failed to resolve import "./NamesToggle"`.

- [ ] **Step 12: Write the toggle and mount it above the zoom stack**

Create `frontcreck/src/components/map/overlays/NamesToggle.tsx`:

```tsx
'use client';

import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';

/** Region names on or off: a separate box 8 px above the zoom stack (the owner's option B, approved
 * 2026-10-04). Icon only; the choice is remembered on this device (lib/namesPref.ts).
 * PENDING OWNER APPROVAL: both labels (COPY.map.namesHide, COPY.map.namesShow) and the off-state icon. */
export function NamesToggle() {
  const on = useAppStore((s) => s.namesOn);
  return (
    <button
      type="button"
      className="map-names"
      aria-pressed={on}
      aria-label={on ? COPY.map.namesHide : COPY.map.namesShow}
      onClick={() => useAppStore.getState().setNamesOn(!on)}
    >
      <Icon name={on ? 'names' : 'namesOff'} />
    </button>
  );
}
```

In `frontcreck/src/components/map/overlays/ZoomControls.tsx`, replace L3-9:

```tsx
import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import type { MapApi } from '../types';

export function ZoomControls({ api }: { api: React.RefObject<MapApi | null> }) {
  return (
    <div className="map-zoom">
```

with:

```tsx
import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import type { MapApi } from '../types';
import { NamesToggle } from './NamesToggle';

export function ZoomControls({ api }: { api: React.RefObject<MapApi | null> }) {
  return (
    <div className="map-zoom">
      {/* First child, so the phone rules that lift or hide the zoom stack (styles/map.css) cover it too. */}
      <NamesToggle />
```

In `frontcreck/src/styles/map.css`, directly after the `.mk-n[data-hot]` rule (the last rule of the block Task 4 wrote) add:

```css

/* names toggle: its own box 8 px above the zoom stack (the owner's option B). It is the first child of
 * .map-zoom, so it takes the zoom buttons' size and glass, and the phone rules that lift or hide the stack. */
.map-zoom .map-names { margin-bottom: 8px; }
/* The zoom-in button under it gets its top border back (.map-zoom button + button removes it). */
.map-zoom .map-names + button { border-top: 1px solid var(--color-rule); }
```

- [ ] **Step 13: Run the checks**

Run, one at a time:

```bash
(cd frontcreck && npm run test -- src/components/map/overlays/NamesToggle.test.tsx src/lib/copy.test.ts)
(cd frontcreck && npm run typecheck)
(cd frontcreck && npm run lint)
```

Expected: PASS (the copy rules test reads the two new strings: no dashes, no emoji, no owner name); typecheck and lint clean.

- [ ] **Step 14: Commit**

```bash
git add frontcreck/src/lib/namesPref.ts frontcreck/src/lib/namesPref.test.ts frontcreck/src/lib/store.ts frontcreck/src/lib/store.test.ts frontcreck/src/components/Icon.tsx frontcreck/src/lib/copy.ts frontcreck/src/components/map/overlays/NamesToggle.tsx frontcreck/src/components/map/overlays/NamesToggle.test.tsx frontcreck/src/components/map/overlays/ZoomControls.tsx frontcreck/src/styles/map.css
git commit -m "feat(map): names toggle above the zoom stack, remembered on the device

Option B (detached box), approved 2026-10-04. The two labels and the
off-state icon still await the owner's approval.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Region names layer (font, DOM layer, frame driver)

**Files:**
- Modify: `frontcreck/src/app/layout.tsx` (L2, L17-22, L41)
- Create: `frontcreck/src/components/map/state/nameWidths.ts`
- Create: `frontcreck/src/components/map/overlays/RegionNames.tsx`
- Test: `frontcreck/src/components/map/overlays/RegionNames.test.tsx`
- Create: `frontcreck/src/components/map/canvas/RegionNamesDriver.tsx`
- Modify: `frontcreck/src/components/map/MusicMap.tsx` (L5-6 imports; L38-39 today, L41-42 once part 1 has added its layout effect)
- Modify: `frontcreck/src/components/map/canvas/Scene.tsx` (the `PickController` import: L26 today, L27 after part 1; `<MarkerDriver />` and `<FrameCounter />`: L171-172 today, L176-177 after part 1)
- Modify: `frontcreck/src/styles/map.css` (new rules after the names toggle rules from Task 6)

**Interfaces:**
- Consumes: Task 5 (`namesLayout.ts`); Task 6 (`useAppStore` `namesOn`); `useMapStore((s) => s.theme)`, `rawToWorld`, `NAMES_BAND_PX` (part 1); `getOverlayEl`, `setOverlayEl`, `getPlacedMarkers` (`state/overlayEls.ts`); `canvasRect`, `visibleArea`, `worldToScreen` (`state/projection.ts`); `coverCssPx` (`state/zoomLimits.ts`); `requestRender` (`state/invalidate.ts`); `isNarrow` (`@/lib/media`).
- Produces:
  ```ts
  // state/nameWidths.ts
  export const nameWidths: WidthCache;
  export function setNameFontFamily(family: string): void;
  // overlays/RegionNames.tsx
  export function RegionNames(): React.JSX.Element | null;   // <div class="rn-layer" aria-hidden="true"> of <div class="rn off" data-stop><b>name</b></div>
  // canvas/RegionNamesDriver.tsx
  export function RegionNamesDriver(props: { positionsRef: React.RefObject<Float32Array> }): null;
  ```
  CSS variable `--font-names-face` on `<html>` (Tenor Sans 400).

**How it stays cheap.** The names are 30 DOM elements at most (17 + 7 + 6), each its own compositor layer. The driver runs only on frames the map already renders (`frameloop="demand"`), never asks for a frame, and reads no layout. Per frame it writes `transform` (and the two custom properties `--a`, `--h`) only when the value differs from what it wrote last; `font-size` changes only in half-pixel steps while the zoom changes. A frame is requested from outside the driver in exactly three cases: the names mount or unmount (theme loaded, toggle), and a web font finishes loading.

- [ ] **Step 1: Load Tenor Sans off the critical path**

In `frontcreck/src/app/layout.tsx`, replace L2:

```ts
import { Cormorant_Garamond, Schibsted_Grotesk } from 'next/font/google';
```

with:

```ts
import { Cormorant_Garamond, Schibsted_Grotesk, Tenor_Sans } from 'next/font/google';
```

After the `sans` declaration (L17-22) add:

```ts
// The map's region names. Not preloaded: it is fetched when the names first render, after the map has loaded.
const names = Tenor_Sans({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-names-face',
  display: 'swap',
  preload: false,
});
```

Replace L41:

```tsx
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
```

with:

```tsx
    <html lang="en" className={`${serif.variable} ${sans.variable} ${names.variable}`}>
```

- [ ] **Step 2: Write the failing component test**

Create `frontcreck/src/components/map/overlays/RegionNames.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ThemeData, ThemeLabel } from '@/lib/data/theme';
import { useAppStore } from '@/lib/store';
import { useMapStore } from '../state/mapStore';
import { RegionNames } from './RegionNames';

const lab = (id: string, name: string, strong: boolean): ThemeLabel => ({ id, name, x: 0, y: 0, strong, n: 100, p: 1, rgb: [240, 236, 228], lum: 0.3 });
const THEME: ThemeData = {
  v: 1,
  n: 0,
  positionsHash: 'x',
  bakeHalf: 1.75,
  stars: { lead: [], bg: [] },
  labels: { sonic: [], balanced: [lab('a', 'Warm Halo', true), lab('b', 'Eclectic Cloud', false)], mood: [lab('a', 'The Quiet Deep', true)] },
};

afterEach(() => {
  useMapStore.setState({ theme: null });
  useAppStore.setState({ namesOn: true });
});

describe('RegionNames', () => {
  it('renders nothing without theme data', () => {
    useMapStore.setState({ theme: null });
    const { container, unmount } = render(<RegionNames />);
    expect(container.firstChild).toBeNull();
    unmount();
  });

  it('renders nothing while names are switched off', () => {
    useMapStore.setState({ theme: THEME });
    useAppStore.setState({ namesOn: false });
    const { container, unmount } = render(<RegionNames />);
    expect(container.firstChild).toBeNull();
    unmount();
  });

  it('renders one plain, hidden name per label of every stop, and none for a stop with no labels', () => {
    useMapStore.setState({ theme: THEME });
    const { container, unmount } = render(<RegionNames />);
    const layer = container.querySelector('.rn-layer')!;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    const names = [...container.querySelectorAll<HTMLElement>('.rn')];
    expect(names.map((n) => [n.dataset.stop, n.textContent])).toEqual([
      ['balanced', 'Warm Halo'],
      ['balanced', 'Eclectic Cloud'],
      ['mood', 'The Quiet Deep'],
    ]);
    // Hidden until the driver places them; the second Balanced name is not a strong one.
    expect(names.every((n) => n.classList.contains('off'))).toBe(true);
    expect(names.map((n) => n.classList.contains('fair'))).toEqual([false, true, false]);
    expect(names[0].style.getPropertyValue('--lc')).toBe('rgb(240,236,228)');
    // Plain lettering: nothing to focus, click or hover, and no explanation attached.
    expect(container.querySelectorAll('a, button, [tabindex], [role], [title]')).toHaveLength(0);
    unmount();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `(cd frontcreck && npm run test -- src/components/map/overlays/RegionNames.test.tsx)`
Expected: FAIL, `Failed to resolve import "./RegionNames"`.

- [ ] **Step 4: Write the width holder and the DOM layer**

Create `frontcreck/src/components/map/state/nameWidths.ts`:

```ts
import { createWidthCache, type WidthCache } from './namesLayout';

/** The page's one cache of region name widths, measured with a 2D canvas in the lettering face. A plain
 * module-level bridge, like state/overlayEls.ts: RegionNames sets the face and clears it, the driver reads it. */
let family = 'sans-serif';
let ctx: CanvasRenderingContext2D | null | undefined;

function measure100(text: string): number {
  if (ctx === undefined) {
    try {
      ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    } catch {
      ctx = null;
    }
  }
  // No canvas (tests, a locked-down browser): a rough width, so names still keep apart.
  if (!ctx) return text.length * 66;
  ctx.font = `400 100px ${family}`;
  return ctx.measureText(text).width;
}

export const nameWidths: WidthCache = createWidthCache(measure100);

/** The computed font-family of the names layer (next/font gives the face a generated name). */
export function setNameFontFamily(next: string): void {
  if (!next || next === family) return;
  family = next;
  nameWidths.clear();
}
```

Create `frontcreck/src/components/map/overlays/RegionNames.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { STOP_IDS } from '@/lib/types';
import { requestRender } from '../state/invalidate';
import { useMapStore } from '../state/mapStore';
import { nameWidths, setNameFontFamily } from '../state/nameWidths';
import { nameKey } from '../state/namesLayout';
import { setOverlayEl } from '../state/overlayEls';

/** The region names: plain lettering over the map, placed by RegionNamesDriver. Nothing to hover, focus or
 * click, no explanation, hidden from assistive technology, and no pointer events (styles/map.css). One element
 * per label of every stop, each hidden (`off`) until the driver shows it. Renders nothing without theme data
 * or while the names are switched off. */
export function RegionNames() {
  const theme = useMapStore((s) => s.theme);
  const namesOn = useAppStore((s) => s.namesOn);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const shown = !!theme && namesOn;

  useEffect(() => {
    // Mounted, unmounted or relabelled: the driver places (or stops placing) names on the next frame.
    requestRender();
    const layer = layerRef.current;
    if (!shown || !layer) return;
    setNameFontFamily(getComputedStyle(layer).fontFamily);
    const fonts = document.fonts;
    if (!fonts) return;
    // Widths measured before the face arrived are the fallback's: measure again and place again.
    const again = () => {
      nameWidths.clear();
      requestRender();
    };
    fonts.addEventListener('loadingdone', again);
    return () => fonts.removeEventListener('loadingdone', again);
  }, [shown, theme]);

  if (!theme || !namesOn) return null;
  return (
    <div
      className="rn-layer"
      aria-hidden="true"
      ref={(el) => {
        layerRef.current = el;
        setOverlayEl('names', el);
      }}
    >
      {STOP_IDS.flatMap((stop) =>
        theme.labels[stop].map((label) => (
          <div
            key={nameKey(stop, label.id)}
            className={`rn off${label.strong ? '' : ' fair'}`}
            data-stop={stop}
            style={{ '--lc': `rgb(${label.rgb.join(',')})` } as React.CSSProperties}
            ref={(el) => {
              setOverlayEl(nameKey(stop, label.id), el);
            }}
          >
            <b>{label.name}</b>
          </div>
        )),
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `(cd frontcreck && npm run test -- src/components/map/overlays/RegionNames.test.tsx)`
Expected: PASS, 3 tests. (`STOP_IDS` is `['sonic', 'balanced', 'mood']` in `@/lib/types`; if its order differs, the expected order in the third test follows it.)

- [ ] **Step 6: Write the frame driver**

Create `frontcreck/src/components/map/canvas/RegionNamesDriver.tsx`:

```tsx
'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type * as THREE from 'three';
import type { ThemeLabel } from '@/lib/data/theme';
import { isNarrow } from '@/lib/media';
import { useAppStore } from '@/lib/store';
import { STOP_IDS } from '@/lib/types';
import type { StopId } from '@/lib/types';
import { STOP_T, rawToWorld } from '../data';
import { useMapStore } from '../state/mapStore';
import { nameWidths } from '../state/nameWidths';
import { chromeBlockers, layoutNames, nameFades, nameKey, namesShown, nameZoomK, type NameCandidate, type NameLine, type PlacedName } from '../state/namesLayout';
import { getOverlayEl, getPlacedMarkers } from '../state/overlayEls';
import { canvasRect, visibleArea, worldToScreen } from '../state/projection';
import { coverCssPx } from '../state/zoomLimits';

/** Extra room kept round a focus cover and round the picked album, CSS px. */
const COVER_CLEAR_PX = 12;
const PICK_CLEAR_PX = 22;

/** What the driver last wrote to an element, so an unchanged value is never written again. */
interface Written {
  transform: string;
  fontPx: number;
  alpha: string;
  halo: string;
  off: boolean;
}
const written = new WeakMap<Element, Written>();

function stateOf(el: Element): Written {
  let w = written.get(el);
  if (!w) {
    // As RegionNames renders it: hidden, nothing set.
    w = { transform: '', fontPx: 0, alpha: '', halo: '', off: true };
    written.set(el, w);
  }
  return w;
}

function show(el: HTMLElement, p: PlacedName): void {
  const w = stateOf(el);
  const transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
  if (w.transform !== transform) {
    el.style.transform = transform;
    w.transform = transform;
  }
  if (w.fontPx !== p.fontPx) {
    el.style.fontSize = `${p.fontPx}px`;
    w.fontPx = p.fontPx;
  }
  const alpha = p.alpha.toFixed(2);
  if (w.alpha !== alpha) {
    el.style.setProperty('--a', alpha);
    w.alpha = alpha;
  }
  const halo = p.halo.toFixed(2);
  if (w.halo !== halo) {
    el.style.setProperty('--h', halo);
    w.halo = halo;
  }
  if (w.off) {
    el.classList.remove('off');
    w.off = false;
  }
}

function hide(el: HTMLElement | null): void {
  if (!el) return;
  const w = stateOf(el);
  if (w.off) return;
  el.classList.add('off');
  w.off = true;
}

interface WorldLabel {
  key: string;
  label: ThemeLabel;
  wx: number;
  wy: number;
}

/** Every rendered frame: decides which region names show and where (state/namesLayout.ts) and writes their
 * transforms. It never asks for a frame and reads no layout, so nothing happens at rest. Mounted after
 * MarkerDriver, whose placed markers it keeps the names clear of. */
export function RegionNamesDriver({ positionsRef }: { positionsRef: React.RefObject<Float32Array> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const get = useThree((s) => s.get);
  const theme = useMapStore((s) => s.theme);
  const data = useMapStore((s) => s.data);
  // Label points in world units, once per theme (labels carry raw position units).
  const world = useMemo(() => {
    if (!theme || !data) return null;
    const out = {} as Record<StopId, WorldLabel[]>;
    for (const stop of STOP_IDS) {
      out[stop] = theme.labels[stop].map((label) => {
        const [wx, wy] = rawToWorld(data, label.x, label.y);
        return { key: nameKey(stop, label.id), label, wx, wy };
      });
    }
    return out;
  }, [theme, data]);
  // The stop the slider last rested on: a morph fades its names out and the target's in.
  const rest = useRef<StopId>(useMapStore.getState().input.stop);
  const sticky = useRef(new Map<string, number>());

  useFrame(() => {
    // No theme data, or the names are switched off (RegionNames renders no layer): nothing to place.
    if (!world || !getOverlayEl('names')) return;
    const { input, sliderT, insetCurrent } = useMapStore.getState();
    if (sliderT === STOP_T[input.stop]) rest.current = input.stop;
    const { width, height } = get().size;
    const coverPx = coverCssPx(camera.zoom, height);
    // Overview and Whole map only; never on the dimmed backdrop (Home, About, 404).
    const on = useAppStore.getState().namesOn && !input.dimmed && namesShown(coverPx);
    const fades = on ? nameFades(sliderT, rest.current, input.stop) : [];
    const rect = canvasRect(width, height);

    const candidates: NameCandidate[] = [];
    for (const f of fades) {
      for (const w of world[f.stop]) {
        const p = worldToScreen(w.wx, w.wy, rect, camera);
        candidates.push({ key: w.key, label: w.label, x: p.x, y: p.y, alpha: f.alpha });
      }
    }

    let placed: PlacedName[] = [];
    if (candidates.length) {
      // The animated inset, so names follow the map while the album panel slides.
      const inset = Math.max(0, insetCurrent);
      const phone = isNarrow();
      const blockers = chromeBlockers({
        width,
        height,
        inset,
        phone,
        bottomCover: input.bottomCover,
        focus: input.focus !== null,
        card: input.focus === null && input.selected !== null,
      });
      const lines: NameLine[] = [];
      if (input.focus) {
        // The focus covers and the lines between them, as MarkerDriver placed them in this frame.
        const markers = getPlacedMarkers();
        const seed = markers[0];
        for (const m of markers) {
          const h = m.drawn / 2 + COVER_CLEAR_PX;
          blockers.push({ left: m.x - h, top: m.y - h, right: m.x + h, bottom: m.y + h });
          if (seed && m !== seed) lines.push([seed.x, seed.y, m.x, m.y]);
        }
      } else if (input.selected !== null) {
        // A name never sits on the picked album.
        const pos = positionsRef.current;
        const p = worldToScreen(pos[2 * input.selected], pos[2 * input.selected + 1], rect, camera);
        blockers.push({ left: p.x - PICK_CLEAR_PX, top: p.y - PICK_CLEAR_PX, right: p.x + PICK_CLEAR_PX, bottom: p.y + PICK_CLEAR_PX });
      }
      placed = layoutNames({
        candidates,
        visible: visibleArea(inset, width, height, 0),
        blockers,
        lines,
        phone,
        zoomK: nameZoomK(coverPx),
        // label.lum was measured under the name's box at the desktop overview scale. On a phone the same name
        // covers far more of the map, and mid-morph the gas is between two stops: the full halo in both cases.
        fullHalo: phone || fades.length !== 1 || fades[0].alpha < 1,
        widthOf: nameWidths.widthOf,
        sticky: sticky.current,
      });
    }

    const shown = new Set<string>();
    for (const p of placed) {
      shown.add(p.key);
      const el = getOverlayEl(p.key);
      if (el) show(el, p);
    }
    for (const stop of STOP_IDS) {
      for (const w of world[stop]) if (!shown.has(w.key)) hide(getOverlayEl(w.key));
    }
  });

  return null;
}
```

- [ ] **Step 7: Mount the layer and the driver**

In `frontcreck/src/components/map/MusicMap.tsx`, replace L5-6:

```ts
import { FocusMarkers } from './overlays/FocusMarkers';
import { HoverLabel } from './overlays/HoverLabel';
```

with:

```ts
import { FocusMarkers } from './overlays/FocusMarkers';
import { HoverLabel } from './overlays/HoverLabel';
import { RegionNames } from './overlays/RegionNames';
```

and replace L38-39 (L41-42 after part 1):

```tsx
      <Scene initialCamera={initialCamera} onApi={onApi} />
      <FocusMarkers albums={data.albums} />
```

with:

```tsx
      <Scene initialCamera={initialCamera} onApi={onApi} />
      {/* Under the focus markers, the hover label and the map's controls (z-index 2). */}
      <RegionNames />
      <FocusMarkers albums={data.albums} />
```

Part 1 adds a `theme` prop and one layout effect to `MusicMap` and leaves this fragment as it is, so the before text still matches; only the line numbers move.

In `frontcreck/src/components/map/canvas/Scene.tsx`, after the import `import { PickController } from "./PickController";` (L26 today, L27 after part 1) add:

```ts
import { RegionNamesDriver } from "./RegionNamesDriver";
```

and replace L171-172 (L176-177 after part 1):

```tsx
      <MarkerDriver positionsRef={positionsRef} />
      <FrameCounter />
```

with:

```tsx
      <MarkerDriver positionsRef={positionsRef} />
      {/* After MarkerDriver: names keep clear of the markers it placed in this same frame. */}
      <RegionNamesDriver positionsRef={positionsRef} />
      <FrameCounter />
```

Part 1 adds its gas mesh to `SceneInner` near `AlbumField`; these two lines are below it and do not depend on it.

- [ ] **Step 8: Style the names**

In `frontcreck/src/styles/map.css`, directly after the two names toggle rules from Task 6 add:

```css

/* region names: plain lettering over the map (RegionNamesDriver places them). Nothing to hover, focus or
 * click; hidden from assistive technology. Tenor Sans, wide capitals. */
.rn-layer { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; font-family: var(--font-names-face), var(--font-sans); }
.map-pane.is-dimmed .rn-layer { display: none; }
.rn { position: absolute; left: 0; top: 0; padding: 4px 8px; text-align: center; white-space: nowrap; font-size: 16px; pointer-events: none; will-change: transform; contain: layout style; transition: opacity .2s var(--out), visibility 0s; }
.rn.off { opacity: 0; visibility: hidden; transition: opacity .2s var(--out), visibility 0s linear .2s; }
.rn b {
  display: block; font-weight: 400; font-style: normal; letter-spacing: .26em; padding-left: .26em; text-transform: uppercase; line-height: 1.05; color: var(--lc); opacity: var(--a, 1);
  /* The halo: a dark stroke under the fill and soft stacked shadows, as strong as the gas behind needs (--h,
   * solved by state/namesLayout.ts haloFor so the ink is 4.5:1 against it). */
  -webkit-text-stroke: 2.1px rgba(4, 4, 8, calc(var(--h, .85) * .85)); paint-order: stroke fill;
  text-shadow: 0 0 2px rgba(4, 4, 8, var(--h, .85)), 0 0 4px rgba(4, 4, 8, var(--h, .85)), 0 0 4px rgba(4, 4, 8, var(--h, .85)), 0 0 8px rgba(4, 4, 8, var(--h, .85)), 0 0 8px rgba(4, 4, 8, var(--h, .85)), 0 0 14px rgba(4, 4, 8, var(--h, .85)), 0 0 14px rgba(4, 4, 8, var(--h, .85)), 0 0 26px rgba(4, 4, 8, calc(var(--h, .85) * .85)), 0 0 44px rgba(4, 4, 8, calc(var(--h, .85) * .6));
}
.rn.fair b { opacity: calc(var(--a, 1) * .82); }
```

- [ ] **Step 9: Run the checks**

Run, one at a time:

```bash
(cd frontcreck && npm run typecheck)
(cd frontcreck && npm run lint)
(cd frontcreck && npm run test)
```

Expected: typecheck and lint clean; all unit tests pass. If lint flags the `layerRef.current = el` assignment in the ref callback or the module-level `WeakMap` in the driver, follow the file's existing convention: a single `// eslint-disable-next-line <rule> -- <reason>` on that line, with the rule name lint printed.

- [ ] **Step 10: Commit**

```bash
git add frontcreck/src/app/layout.tsx frontcreck/src/components/map/state/nameWidths.ts frontcreck/src/components/map/overlays/RegionNames.tsx frontcreck/src/components/map/overlays/RegionNames.test.tsx frontcreck/src/components/map/canvas/RegionNamesDriver.tsx frontcreck/src/components/map/MusicMap.tsx frontcreck/src/components/map/canvas/Scene.tsx frontcreck/src/styles/map.css
git commit -m "feat(map): region names in Tenor Sans, shown at Overview and Whole map

Plain lettering placed each rendered frame; gone when zoomed in, on the
dimmed backdrop and while switched off. Transform-only writes, no frame
requested at rest.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end checks for names and the toggle, phone screenshots, final verification

**Files:**
- Create: `frontcreck/e2e/names.spec.ts`

**Interfaces:**
- Consumes: `e2e/helpers.ts` (`camera`, `shot`, `tabTo`, `waitForCameraIdle`, `waitForMap`, `waitForMapQuiet`), `COPY`, `window.__rmr`. (The brief named `e2e/data.ts`; there is no such file. The helpers live in `e2e/helpers.ts`.)
- Produces: screenshots `frontcreck/test-results/shots/{desktop,phone}-names-toggle-{on,off}.png` for the owner's sign-off.

These checks need part 1's theme data file to be served, so that names exist at all.

- [ ] **Step 1: Write the spec**

Create `frontcreck/e2e/names.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { camera, shot, tabTo, waitForCameraIdle, waitForMap, waitForMapQuiet } from './helpers';

/** A region name the driver has placed. */
const SHOWN = '.rn:not(.off)';

async function openMap(page: Page, expectNames = true): Promise<void> {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  if (expectNames) await expect.poll(() => page.locator(SHOWN).count(), { timeout: 15_000 }).toBeGreaterThan(0);
  // The lettering face has arrived and the names have been measured again with it.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await waitForMapQuiet(page, 300);
}

test('region names show at the overview, as plain lettering inside the map', async ({ page, isMobile }) => {
  await openMap(page);
  const count = await page.locator(SHOWN).count();
  if (isMobile) expect(count).toBeLessThanOrEqual(4);
  else expect(count).toBeGreaterThan(4);
  await expect(page.locator('.rn-layer')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('.rn-layer').evaluate((el) => el.querySelectorAll('a, button, [tabindex], [role], [title]').length)).toBe(0);
  const vp = page.viewportSize()!;
  const boxes = await page.locator(`${SHOWN} b`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })));
  for (const b of boxes) {
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(vp.width);
    expect(b.bottom).toBeLessThanOrEqual(vp.height);
  }
  // No name sits on the slider card or the zoom corner.
  for (const sel of ['.mode', '.map-zoom']) {
    const k = (await page.locator(sel).boundingBox())!;
    for (const b of boxes) expect(b.left < k.x + k.width && b.right > k.x && b.top < k.y + k.height && b.bottom > k.y, `a name over ${sel}`).toBe(false);
  }
  // Wide capitals in Tenor Sans.
  const style = await page.locator(`${SHOWN} b`).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { transform: cs.textTransform, tenor: document.fonts.check(`400 16px ${cs.fontFamily}`), size: parseFloat(cs.fontSize) };
  });
  expect(style.transform).toBe('uppercase');
  expect(style.tenor).toBe(true);
  if (isMobile) {
    expect(style.size).toBeGreaterThanOrEqual(13);
    expect(style.size).toBeLessThanOrEqual(16);
  }
});

test('region names are gone once the map is zoomed in, and back at the overview', async ({ page }) => {
  await openMap(page);
  await page.locator('canvas.map-canvas').focus();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('+');
    await waitForCameraIdle(page);
  }
  await expect(page.locator(SHOWN)).toHaveCount(0);
  await page.keyboard.press('0');
  await waitForCameraIdle(page);
  await expect.poll(() => page.locator(SHOWN).count()).toBeGreaterThan(0);
});

test('region names never take pointer events', async ({ page, isMobile }) => {
  await openMap(page);
  const centres = await page.locator(SHOWN).evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { x, y, onName: !!top?.closest('.rn-layer'), onCanvas: !!top?.classList.contains('map-canvas') };
    }),
  );
  expect(centres.length).toBeGreaterThan(0);
  expect(centres.filter((c) => c.onName)).toEqual([]);
  expect(await page.locator('.rn-layer').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  if (isMobile) return;
  // A drag that starts on a name pans the map under it.
  const start = centres.find((c) => c.onCanvas)!;
  const before = await camera(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 40, { steps: 6 });
  await page.mouse.up();
  await waitForCameraIdle(page);
  expect((await camera(page)).x).toBeLessThan(before.x);
});

test('with names on, the idle map still draws at most one frame', async ({ page }) => {
  await openMap(page);
  expect(await page.locator(SHOWN).count()).toBeGreaterThan(0);
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200); // nothing should happen: the idle window in which the map must not draw
  const f2 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  expect(f2 - f1).toBeLessThanOrEqual(1);
});

test('the slider swaps one stop\'s names for the other\'s', async ({ page }) => {
  await openMap(page);
  await expect(page.locator(`${SHOWN}[data-stop="balanced"]`).first()).toBeVisible();
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  await expect.poll(() => page.locator(`${SHOWN}[data-stop="mood"]`).count(), { timeout: 10_000 }).toBeGreaterThan(0);
  await waitForMapQuiet(page, 300);
  await expect(page.locator(`${SHOWN}:not([data-stop="mood"])`)).toHaveCount(0);
});

test('the names toggle hides the names, is remembered across a reload, and brings them back', async ({ page, isMobile }, info) => {
  const hydration: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /hydrat/i.test(m.text())) hydration.push(m.text());
  });
  await openMap(page);
  const hide = page.getByRole('button', { name: COPY.map.namesHide });
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
  // A separate box of the zoom buttons' size, 8 px above the stack; 44 px on a phone.
  const box = (await hide.boundingBox())!;
  const zoomIn = (await page.getByRole('button', { name: COPY.map.zoomIn }).boundingBox())!;
  expect([box.width, box.height]).toEqual([zoomIn.width, zoomIn.height]);
  expect(Math.round(zoomIn.y - (box.y + box.height))).toBe(8);
  expect(Math.round(box.x)).toBe(Math.round(zoomIn.x));
  if (isMobile) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  await shot(page, info, 'names-toggle-on');

  if (isMobile) await hide.tap();
  else await hide.click();
  await expect(page.locator('.rn')).toHaveCount(0);
  const show = page.getByRole('button', { name: COPY.map.namesShow });
  await expect(show).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.localStorage.getItem('rmr-names'))).toBe('0');
  await waitForMapQuiet(page, 300);
  await shot(page, info, 'names-toggle-off');

  await page.reload();
  await openMap(page, false);
  await expect(page.getByRole('button', { name: COPY.map.namesShow })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.rn')).toHaveCount(0);
  expect(hydration).toEqual([]);

  const again = page.getByRole('button', { name: COPY.map.namesShow });
  if (isMobile) await again.tap();
  else await again.click();
  await expect.poll(() => page.locator(SHOWN).count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.localStorage.getItem('rmr-names'))).toBe('1');
});

test('the names toggle is reachable and usable with the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard');
  await openMap(page);
  await tabTo(page, (el, label) => el.getAttribute('aria-label') === label, 40, COPY.map.namesHide);
  await page.keyboard.press('Enter');
  await expect(page.locator('.rn')).toHaveCount(0);
  await expect(page.getByRole('button', { name: COPY.map.namesShow })).toBeFocused();
  await page.keyboard.press('Space');
  await expect.poll(() => page.locator(SHOWN).count()).toBeGreaterThan(0);
});

test('the dimmed map behind Home shows no names', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await expect(page.locator(SHOWN)).toHaveCount(0);
  await expect(page.locator('.rn-layer')).toBeHidden();
});
```

- [ ] **Step 2: Run it on desktop**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/names.spec.ts --project=desktop --workers=1)`
Expected: PASS, 8 tests. Wait for it to finish before the next command (one browser at a time).

If "region names show at the overview" fails on the count (`toBeGreaterThan(4)`), print how many labels the theme file holds for Balanced and how many the driver placed before changing anything: the layout is expected to place most of the 17 on a 1440 x 900 window.

- [ ] **Step 3: Run it on the phone project**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/names.spec.ts --project=phone --workers=1)`
Expected: PASS, 7 tests and 1 skipped (keyboard).

- [ ] **Step 4: Phone screenshots of the toggle for the owner's sign-off**

Option B was never rendered on a phone. The phone project's viewport is 390 x 844, and step 3 saved:

```
frontcreck/test-results/shots/phone-names-toggle-on.png
frontcreck/test-results/shots/phone-names-toggle-off.png
frontcreck/test-results/shots/desktop-names-toggle-on.png
frontcreck/test-results/shots/desktop-names-toggle-off.png
```

Open the two phone images and check, before showing them: the toggle is a separate 44 px box 8 px above the three zoom buttons, the whole corner clears the slider panel, and in the off image the slash is crisp with a clear gap through the dimmed letters. Then show all four to the owner and ask for three approvals: the phone placement, the off-state icon, and the two labels ("Hide place names" / "Show place names"). Record his answers in `docs/design/trifid-theme/HANDOFF.md` only when he has given them; do not write the approval yourself.

- [ ] **Step 5: Run the suites this part touches, one at a time**

```bash
(cd frontcreck && npm run test)
(cd frontcreck && npm run typecheck)
(cd frontcreck && npm run lint)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/map.spec.ts e2e/focus.spec.ts e2e/album.spec.ts e2e/a11y.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npx playwright test e2e/map.spec.ts e2e/focus.spec.ts e2e/phone.spec.ts --project=phone --workers=1)
```

Expected: all pass. `e2e/map.spec.ts` "renders on demand" still sees at most one idle frame with the names on. `e2e/a11y.spec.ts` passes axe on `/map` with the names layer present (it is `aria-hidden`) and on the hot badge (room-coloured digits on the lamp token).

Do **not** run or fix `e2e/explore.spec.ts` here: its `isLamp` and `meanLuma` assertions are expected to fail after Task 2 and belong to part 3 (listed at the end of Task 2).

- [ ] **Step 6: Commit**

```bash
git add frontcreck/e2e/names.spec.ts
git commit -m "test(e2e): region names and the names toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Fidelity check of this part (one reviewer subagent, no browser)**

Dispatch one fresh reviewer subagent that did not write this part. Give it only the paths below and this brief. It opens the images one at a time with the Read tool and starts no browser.

> Compare what part 2 built with the approved pictures and list every difference, worst first. App images, all under `frontcreck/test-results/shots/` (written by the runs of Steps 2, 3 and 5): `desktop-explore.png`, `desktop-focus.png`, `desktop-album.png`, `desktop-names-toggle-on.png`, `desktop-names-toggle-off.png`, `phone-names-toggle-on.png`, `phone-album-mapmode.png`. Approved, under `docs/design/trifid-theme/options/`: `final-overview.jpg`, `final-album.jpg`, `toggle-b-on.jpg`, `toggle-b-off.jpg`, `final-phone-map.jpg`. Judge only what this part built: the stars (size by class, tint, glow, the dark disc under them on bright gas), covers and their keyline, the white cased lines and where they start and end, frames and rank badges, the region names (face, capitals, spacing, size, halo, which show, none over a control) and the names button (a separate box above the zoom stack, the on and off icons). Mark each difference "worse than approved", "equal" or "expected until part 3". The only expected ones: rings, focus outlines and the hot badge are still amber, panels and the header are still solid warm brown, and the pane beyond the gas is still brown, because part 3 changes those token values.

Fix every "worse than approved" item in the task that owns it, run that task's checks again and have the same reviewer look again. Save its final list as `docs/design/trifid-theme/reviews/app-fidelity-part2.md` and commit it (`docs(design): part 2 fidelity notes`, with the trailer). The reviewer sees stills only. It cannot judge motion in flight (the name fades during a slider move, the star to cover cross-fade) or a real phone, which is why the owner's own preview checklist in part 3 Task 8 stays.

---

## Self-review

**Spec coverage** (HANDOFF "Current state: decisions made on 2026-10-04" and the part 2 brief):

| Requirement | Task |
|---|---|
| Four star classes by album order, radii, glow, alpha; one constant with the rank caveat | 1 |
| 75% star white + 25% Ember family tint; white with no under-disc when theme data is missing | 1, 2 |
| Stars in the one existing draw, premultiplied output, `CustomBlending` One / OneMinusSrcAlpha | 2 |
| Under-disc: max 0.26, strongest to 0.8 r, gone at 3 r + 1, `clamp(1 - 0.5 / bg, 0, 0.26)`, gas mixed by slider | 2 |
| Stars fade as covers fade in (16 to 32 px) | 2 |
| Depth layers survive wide glow quads (rule and proof) | 2 |
| `a_clusterId`, `u_clusterColors`, `CLUSTER_RGB` removed; Trifid frame and backing colours | 2 |
| Hit test and `renderedSpriteCssSize` unchanged, with proof | 1 (test), 2 (note) |
| Dimmed Home and About map still eases alpha and size | 2 (the `mutedT` lines and their existing test are kept) |
| Quads no larger than the prototype's `ext` rule | 2 |
| Layout: 24 px of line, 6 px clearance, 0.2 rad, 600 rounds, seed never moves | 3 |
| Lines: casing `rgba(6,6,10,.8)` under white core, 4.5/1.5, hot 5.25/2.25, leader 3/1, round caps, casings below cores, frame edge to frame edge | 4 |
| Frames and badges per prototype, lamp token, no `--acc` on the map | 4 |
| Names: Tenor Sans 400 via `next/font`, `preload: false`, wide capitals, .26em, size tiers at k = 0.88, colour from `label.rgb`, stroke and shadow halo from `label.lum` | 5, 7 |
| Names only under `NAMES_BAND_PX`, all labels of the stop, morph fades 40% / 40%, phone cap 4 and 13 to 16 px | 5, 7 |
| Blockers: slider card, zoom corner including the toggle, hint line, edge margin | 5 |
| 4.5:1 formula and unit test | 5 |
| No hover, click, tooltip; `aria-hidden`; `pointer-events: none` | 7, 8 |
| Transform-only writes, only on change, nothing at rest | 7, 8 (idle frame test) |
| Toggle: option B, detached box above the zoom stack, `aria-pressed`, keyboard, remembered in `rmr-names`, default on, junk and blocked storage safe, no hydration mismatch | 6, 8 |
| Crisp off-state icon with exact SVG; phone screenshot at 390 x 844; pending approvals marked | 6, 8 |
| Unit tests in the `album.test.ts` style; Playwright checks listed in the brief | 1 to 8 |

**Not covered here, on purpose:** the DOM ring round the Explore pick in dot mode (`.map-sel`, `styles/map.css` L17-18) keeps its lamp border with no dark casing; it turns off-white with part 3's token and may need a casing on bright gas. The prototype also shows the seed's region name beside an open album at any zoom; the brief's rule (names only under 13 px covers) is what is built.

**Placeholder scan:** no "TBD", "TODO", "similar to", or "add error handling" in any step; every new file is given in full, every edit as before and after. Two steps say what to do if lint flags a line (Task 2 step 8, Task 7 step 9); they name the exact comment to add.

**Type consistency:** `StarAttributes` (`star` Float32Array x4, `tint` and `bg` Uint8Array x3) matches the three `InstancedBufferAttribute` sizes in Task 2 and the shader's `vec4 a_star`, `vec3 a_tint`, `vec3 a_bg`. `edgePoint`, `SEED_FRAME_PX`, `REC_FRAME_PX`, `HOT_FRAME_PX` are defined in Task 3 and used with the same signatures in Task 4 and its CSS insets (4, 1, 3). `ViewBounds` is the one rectangle type for `layoutNames`, `chromeBlockers` and `visibleArea`. `nameKey(stop, id)` is the overlay key in `RegionNames` and `RegionNamesDriver`. `ChromeInput` has no button count: the zoom corner height is a constant in `namesLayout.ts`, and its test expects the same numbers (196 desktop, 200 phone). `namesOn` / `setNamesOn` are added to `AppState` in Task 6 and read in Tasks 6, 7 and 8. `COPY.map.namesHide` / `namesShow` are added in Task 6 and used in Tasks 6 and 8.
