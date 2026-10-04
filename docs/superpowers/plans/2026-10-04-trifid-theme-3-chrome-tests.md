# Trifid Theme Part 3: Glass Chrome, Phone and Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the real app (`frontcreck/`) the Trifid prototype's glass chrome: cool near-black tokens, see-through blurred panels over the nebula on desktop, near-solid panels on phones and wherever glass is unsupported or unwanted, with every text colour proven at 4.5:1 in the worst case, the phone strip and the Home, About and 404 pages restyled, the theme-coupled tests rewritten without weakening them, and the budgets, real-phone trial, visual comparison, docs and pull request planned.

**Architecture:** The existing token names keep their names and change their values in `@theme` in `src/app/globals.css`, so components need no renames. Three surface colours (`--color-float`, `--panel-bg`, `--top-bg`) and one filter (`--glass-blur`) decide glass or solid; one CSS rule in `shell.css` applies `backdrop-filter: var(--glass-blur)` to every glass surface, and three one-line blocks in `globals.css` switch all four values to the solid fallback (phone width, no `backdrop-filter` support, reduced transparency). Worst-case contrast is a pure function in `src/lib/contrast.ts` (CSS `saturate` and `brightness` on the backdrop, then the panel tint painted over it) tested against the values parsed from the stylesheets; text that sits directly on the nebula is measured from screenshots in Playwright.

**Tech Stack:** Next 16, React 19, Tailwind 4.3 (`@theme`), plain CSS in `src/styles/`, vitest (jsdom), Playwright on SwiftShader (projects `desktop`, `phone`, `nowebgl`), `scripts/perf/perf.mjs` and `scripts/review-shots.mjs` on Chrome.

**Spec:** docs/design/trifid-theme/HANDOFF.md (section "Current state: decisions made on 2026-10-04")

## Global Constraints

- Album positions never move: nothing in this part touches `positions.json`, the camera or the layout of the map.
- Nothing animates at rest: no CSS animation or transition runs without user input; the map still draws at most one frame in 3 idle seconds.
- Text holds 4.5:1 against what is behind it, in the worst case (numbers in Task 1 and Task 2). The album accent is a mark, never a text colour, and holds 3:1.
- Covers stay legible: no tint, blur or scrim is drawn over a cover in the album list, the shelf or the map markers.
- 44 px tap targets on phone (`e2e/phone.spec.ts`, "tap targets are at least 44 px", must stay green).
- Every star is an album: this part adds no decorative dots; the phone strip draws one dot per album and nothing else.
- Budgets in `frontcreck/scripts/perf/budgets.json` stay unchanged: one idle frame, 50 ms frame gap, 200 KB first-load JS, 250 ms startup long task (and the other six values as they are).
- Copy rules: never show the owner's name, say "4,000+" albums, never state a number of recommendations, mood words are "handpicked", no dashes or emoji. Any new or changed site wording needs the owner's approval before it ships. This part adds and changes no site string.
- Machine rules: arm64 Node 22.23.3 only (`export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"`; `node -p process.arch` must print `arm64`). One browser at a time, never several: every Playwright command takes `--workers=1` and one `--project`; never start a second run while one is going. Be gentle by day: prefix long commands with `nice -n 10`. Every command in a `bash` block below sets the PATH itself and runs in its own subshell from the worktree root, so each line can be pasted alone or the block run as it is.
- No edits to `data-pipeline/rmr_pipeline/validate.py`, `constants.py`, `build.py` or `frontcreck/public/data/albums.json`.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Paths in this plan are relative to the worktree root. Run `git` from the root and `npm`/`npx` from `frontcreck/`.
- Order: Tasks 1 and 2 can start at once. Tasks 3, 4 (its e2e step), 5, 7 and 8 need parts 1 and 2 on the branch (the gas, `src/components/map/theme.ts`, `src/lib/data/theme.ts`, the off-white frame in the shader).

## Review Focus

The failure modes most likely to bite that an ordinary task test would not cover, and the test that pins each:

1. **A browser without `backdrop-filter`** shows unblurred see-through panels over bright gas. Pinned by `src/styles/glass.test.ts` ("phones, browsers without backdrop-filter and reduced transparency get the same solid panels") and by `e2e/glass.spec.ts` ("the built CSS keeps the Safari prefix and the no-support fallback"). Task 2.
2. **The reduced-transparency preference** is ignored. Pinned by `e2e/glass.spec.ts` ("with reduced transparency the panels are near-solid and unblurred"), which emulates the media feature through CDP. Task 2.
3. **The weakest album accent (`#d44f4f`, Making Movies) on glass over the brightest gas.** Pinned by `src/lib/contrast.test.ts` ("every album accent passes 4.5:1 on the room colour, and 3:1 as a mark on the panels", and "the album accent is never a text colour" in `glass.test.ts`) and by `e2e/glass.spec.ts` ("text on the panels keeps 4.5:1 over the map, with the weakest accent"). Tasks 1 and 2.
4. **The `nowebgl` project: no gas at all behind see-through panels.** Pinned by the new test in `e2e/nowebgl.spec.ts` ("without WebGL the see-through panels sit on the plain sky and keep 4.5:1"). Task 2.
5. **The phone strip before the gas image has loaded (or when it fails).** Pinned by `src/components/album/MapPreviewStrip.test.ts` ("draws everything without the gas image"). Task 3.
6. **Safari's `-webkit-backdrop-filter` dropped by the CSS build.** Pinned by `e2e/glass.spec.ts` ("the built CSS keeps the Safari prefix and the no-support fallback"), which reads the served stylesheets as text. Task 2.
7. **axe stops judging contrast on glass.** With a canvas behind a see-through panel axe reports text contrast as "incomplete", not as a violation, so `e2e/a11y.spec.ts` no longer proves contrast there. Pinned by `contrastOverBackdrop` (Task 2), which measures the real pixels behind the text on the album panel, the slider, the hint, Home, About and 404. Tasks 2 and 4.

## Reference: final token table

| Token | Old | New | Where |
|---|---|---|---|
| `--color-room` | `#15110d` | `#07060a` | `@theme` |
| `--color-room-2` | `#1c1712` | `#0e0d13` | `@theme` |
| `--color-room-3` | `#262019` | `#17161d` | `@theme` |
| `--color-room-4` | `#322a21` | `#24222c` | `@theme` |
| `--color-paper` | `#ede5d5` | `#f3eee7` | `@theme` |
| `--color-dust` | `#b3a792` | `#c4beb6` | `@theme` |
| `--color-ash` | `#a39887` | `#aaa49d` | `@theme` |
| `--color-rule` | `rgba(237, 229, 213, 0.11)` | `rgba(241, 236, 228, 0.14)` | `@theme` |
| `--color-rule-2` | `rgba(237, 229, 213, 0.2)` | `rgba(241, 236, 228, 0.26)` | `@theme` |
| `--color-rule-3` | none | `rgba(241, 236, 228, 0.45)` | `@theme`, new |
| `--color-lamp` | `#e6a856` | `#f1ece4` | `@theme` |
| `--color-lamp-hover` | literal `#efb86c` | `#ffffff` | `@theme`, new |
| `--color-lamp-ink` | `#1a130b` | `#121016` | `@theme` |
| `--color-clay`, `--color-moss`, `--color-ochre` | `#c4886f`, `#97a077`, `#c8a560` | removed | unused once part 2 removes `CLUSTER_RGB` |
| `--color-pane` | `#17120e` | `#07060a` | `@theme` |
| `--color-float` | `#1a1511` | `rgba(10, 9, 14, 0.66)`; solid `rgba(10, 9, 14, 0.92)` | `@theme`; fallback blocks |
| `--panel-bg` | none (`--color-room`) | `rgba(8, 7, 11, 0.7)`; solid `rgba(10, 9, 14, 0.92)` | `:root`, new |
| `--top-bg` | literal `rgba(21, 17, 13, .96)` | `rgba(7, 6, 10, 0.58)`; solid `rgba(10, 9, 14, 0.92)` | `:root`, new |
| `--glass-blur` | none | `blur(22px) saturate(1.2) brightness(0.58)`; solid `none` | `:root`, new |
| `--acc` (default accent) | `#d9a066` | unchanged | `:root`; per album from `AlbumPanel.tsx` |

## Reference: worst-case contrast (computed with `node`, WCAG 2 formula, on 2026-10-04)

Backdrop model: the brightest thing that can be behind a panel is pure white (a white cover on the map); the brightest gas is cream `rgb(244, 238, 222)`. `backdrop-filter` applies `saturate(1.2)` then `brightness(.58)` in sRGB, then the panel tint is painted over. The blur does not change a flat backdrop.

| Surface | Over white | Over cream gas | paper | dust | ash | lamp |
|---|---|---|---|---|---|---|
| `--panel-bg` glass (.7) | `rgb(50, 49, 52)` | `rgb(48, 46, 46)` | 11.20 / 11.69 | 7.01 / 7.32 | 5.24 / 5.47 | 10.99 / 11.48 |
| `--color-float` glass (.66) | `rgb(57, 56, 60)` | `rgb(55, 53, 52)` | 10.08 / 10.57 | 6.31 / 6.62 | 4.71 / 4.94 | 9.89 / 10.38 |
| `--top-bg` glass (.58) | `rgb(66, 66, 68)` | `rgb(64, 61, 59)` | 8.69 / 9.34 | 5.44 / 5.84 | 4.06 / 4.37, not used | 8.53 / 9.16 |
| Solid fallback (.92, no filter) | `rgb(30, 29, 33)` | `rgb(29, 27, 31)` | 14.52 / 14.81 | 9.09 / 9.27 | 6.79 / 6.92 | 14.25 / 14.53 |

(Each cell: over white / over cream.) Findings that changed the numbers:

- **Header:** ash would fail on the header glass (4.06). The header only sets paper (wordmark) and dust (nav links, icon), and its search field is opaque, so nothing is raised; the test pins that the header rules use paper and dust.
- **Home search field:** the prototype's `rgba(10, 9, 14, .5)` fails for its ash placeholder (3.35 over white) and for dust (4.48). Raised to `var(--color-float)` (.66): ash 4.71.
- **Album wash:** at full strength the brightest wash (`#545721`, A Tab in the Ocean) puts dust at 4.49. With the prototype's `.amb { opacity: .9 }` it is 4.70 on glass, 5.03 on the solid fallback. So `opacity: .9` is required, not cosmetic. Ash at the centre of that wash is 3.51 (3.2 in today's warm theme); no ash text sits in the wash's centre, and this part does not make it worse.
- **Weakest accent `#d44f4f`:** 4.84 on the new room (4.50 on the old), 3.10 on glass over white, 3.23 over cream, 4.02 on the fallback. It cannot reach 4.5 on glass: even a .9 tint gives 4.35 and `brightness(.3)` gives 4.06. It does not need to: no rule uses the accent as a text colour (lit tag: paper text, 7.14 worst; hot row bar and lit tag border: marks, 3:1 applies; hot badge: opaque accent with room digits, 4.84). The test pins both facts.
- **Hint line** (text directly on the map): paper on a `rgba(4, 4, 8, .62)` band over unfiltered white is 5.19.
- **Home hero** behind its dark pad and the veil, over unfiltered white: dust 5.33. The shelf caption (ash) depends on how far part 1 dims the gas on Home, so it is measured in Task 4, not computed.

## Reference: every colour literal under `frontcreck/src`

| File and line | Literal | Decision |
|---|---|---|
| `app/globals.css` L10-25 | tokens | New values (table above). Task 1. |
| `app/globals.css` L36 | `--acc: #d9a066` | Leave: the default accent before an album sets one; it stays inside the album panel; 5.65 on the worst glass panel. |
| `app/layout.tsx` L32 | `themeColor: '#15110d'` | `'#07060a'`. Task 1. |
| `app/icon.svg` L1-5 | `#15110d`, `#322a21`, `#b3a792`, `#c4886f`, `#97a077`, `#e6a856` | Optional Task 6, owner's call. |
| `styles/shell.css` L22 | grain `feColorMatrix` `0 0 0 0 1 0 0 0 0 .95 0 0 0 0 .85 0 0 0 .9 0` | Cool tint `0 0 0 0 .95 0 0 0 0 .94 0 0 0 0 1 0 0 0 .9 0`. Task 2. |
| `styles/shell.css` L30 | `rgba(21, 17, 13, .96)` | `var(--top-bg)`. Task 2. |
| `styles/shell.css` L57 | `#efb86c` | `var(--color-lamp-hover)`. Task 2. |
| `styles/shell.css` L59 | `rgba(237, 229, 213, .4)`, `rgba(237, 229, 213, .04)` | `var(--color-rule-3)`, `rgba(241, 236, 228, .05)`. Task 2. |
| `styles/shell.css` L63 | `rgba(237, 229, 213, .35)` | `rgba(241, 236, 228, .35)`. Task 2. |
| `styles/map.css` L11, L21 | `rgba(0, 0, 0, .8)` shadows | Leave: neutral black shadow. |
| `styles/map.css` L47, L48 | `rgba(230, 168, 86, .35)` focus halo | `0 0 0 3px var(--color-room), 0 0 0 5px var(--color-lamp)`. Task 2. |
| `styles/map.css` L75, L77, L80, L83, L92 | `rgba(237, 229, 213, …)`, `rgba(10, 8, 6, .55)` | Part 2 owns L75-95. Not touched here. |
| `styles/map.css` L135 | veil `rgba(21, 17, 13, .72/.3/.15)` | `rgba(7, 6, 10, .1)`. Task 4. |
| `styles/phone.css` L6 | veil `rgba(21, 17, 13, .8/.52/.4)` | Rule removed. Task 4. |
| `styles/phone.css` L41 | `rgba(0, 0, 0, .8)` shadow | Leave. |
| `styles/home.css` L24 | `rgba(12, 10, 8, .72)` | `rgba(5, 4, 8, .3)`. Task 2. |
| `styles/home.css` L25 | `#000` shadow | Leave. |
| `styles/home.css` L30 | `#d9d0bf` | `#e0dbd3` (9.38 on the worst glass panel). Task 2. |
| `styles/home.css` L36 | `rgba(12, 10, 8, .55)` | `rgba(5, 4, 8, .55)`. Task 2. |
| `styles/album.css` L22 | `rgba(0, 0, 0, .85)` shadow | Leave. |
| `styles/album.css` L30 | `rgba(237, 229, 213, .4)` | `var(--color-rule-3)`. Task 2. |
| `styles/album.css` L44 | `rgba(237, 229, 213, .045)` | `rgba(241, 236, 228, .06)`. Task 2. |
| `styles/album.css` L54 | `rgba(237, 229, 213, .06)` | `rgba(241, 236, 228, .07)`. Task 2. |
| `styles/search.css` L25 | `rgba(0, 0, 0, .7)` shadow | Leave. |
| `styles/search.css` L35 | `rgba(230, 168, 86, .8)` | `var(--color-lamp)`. Task 2. |
| `styles/search.css` L50 | `#2c241c` | Leave: fallback for `--fb`, which `Cover.tsx` always sets. |
| `styles/search.css` L53 | `rgba(237, 229, 213, .78)` | `rgba(243, 238, 231, .78)`. Task 2. |
| `components/Cover.tsx` L10 | `TILE` `#3b2a22`, `#2c3024`, `#3b3120` | Leave: mirrors `FALLBACK_TILE` in `data-pipeline/rmr_pipeline/constants.py` L59, which `images.py` bakes into the map's cover sheets. `constants.py` must not be edited, so changing one side would make a lettered tile differ between the list and the map. A failure state only. |
| `components/album/AmbientWash.tsx` L7-12 | `rgba(...)` built from the album's own washes | Leave the code; the panel layer gets `opacity: .9` and the map layer is hidden in CSS. Task 2. |
| `components/album/MapPreviewStrip.tsx` L15, L98, L118, L131, L133, L135, L166 | cluster dots, warm lines, frames, badge, default accent | Rewritten on `STAR_WHITE`, `FRAME_RGB`, `SKY_RGB`. Task 3. |
| `components/map/data.ts` L12 | `CLUSTER_RGB` | Part 2 removes it. |
| `components/map/shaders/album.ts` L235-237 | `PAPER`, `LAMP`, `ROOM` | Part 2. |
| `lib/contrast.test.ts` L50-51 | `#000000`, `#ffffff`, `#777777` | Leave: reference ratios. |
| `lib/contrast.test.ts` L55-56 | `#15110d`, `#1a130b` | `#07060a`, `#121016`. Task 1. |
| `lib/types.ts` L9 | comment `#15110d` | Comment extended. Task 5. |
| `lib/color.test.ts` L6-7 | `#15110d`, `#E6A856` | Leave: sample inputs for the hex parser, not theme values. |
| Test fixtures (`SearchBox.test.tsx` L38, `data.test.ts` L5, `MapPreviewStrip.test.ts` L5 and L21, `AmbientWash.test.ts` L6-10, `search.test.ts` L217, `catalog.test.ts` L9, `client.test.ts` L4, `useData.test.ts` L8) | made-up album colours | Leave, except `MapPreviewStrip.test.ts`, rewritten in Task 3. |

Coupled literals outside `src`: `e2e/smoke.spec.ts` L14, `e2e/search.spec.ts` L143, L145, L227 (Task 1 and Task 5), `e2e/explore.spec.ts` L75, L326 (Task 5), `scripts/icons/*.svg` (Task 6).

---

### Task 1: Tokens, glass switch and the worst-case contrast function

**Files:**
- Modify: `frontcreck/src/lib/contrast.ts` (append after L18)
- Modify: `frontcreck/src/lib/contrast.test.ts` (whole file, L1-96)
- Modify: `frontcreck/src/app/globals.css` L9-38
- Modify: `frontcreck/src/app/layout.tsx` L32 (L40 once part 2 has added the names font above it)
- Modify: `frontcreck/e2e/smoke.spec.ts` L14
- Modify: `frontcreck/e2e/search.spec.ts` L227

**Interfaces:**
- Consumes: `hexToRgb` from `src/lib/color.ts`; `public/data/albums.json` (`w[2]` accents).
- Produces: tokens of the table above; CSS custom properties `--panel-bg`, `--top-bg`, `--glass-blur` and the three fallback blocks; from `src/lib/contrast.ts`: `type Rgb = [number, number, number]`, `interface Tint { rgb: Rgb; alpha: number }`, `interface GlassFilter { saturate: number; brightness: number }`, `rgbToHex(rgb: Rgb): string`, `filterBackdrop(rgb: Rgb, filter: GlassFilter): Rgb`, `paintOver(top: Rgb, alpha: number, bottom: Rgb): Rgb`, `surfaceOver(backdrop: Rgb, filter: GlassFilter | null, tint: Tint): string`.

- [ ] **Step 1: Replace `frontcreck/src/lib/contrast.test.ts` with the failing test**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hexToRgb } from '@/lib/color';
import type { AlbumRecord } from '@/lib/types';
import { contrastRatio, paintOver, rgbToHex, surfaceOver, type GlassFilter, type Rgb, type Tint } from './contrast';

const css = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf8');
const GLOBALS = css('app/globals.css');

/** The hex colour tokens as globals.css defines them (`--color-room` → `room`, `--acc` → `acc`). */
const TOKENS: Record<string, string> = Object.fromEntries(
  [...GLOBALS.matchAll(/--(?:color-)?([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2].toLowerCase()]),
);
const tok = (name: string) => {
  const v = TOKENS[name];
  if (!v) throw new Error(`no colour token --${name} in globals.css`);
  return v;
};

/** The three see-through surfaces. Their first value in globals.css is the glass one; every later one is a solid fallback. */
type Surface = 'color-float' | 'panel-bg' | 'top-bg';
const SURFACES: Surface[] = ['color-float', 'panel-bg', 'top-bg'];
function tints(name: Surface): Tint[] {
  const re = new RegExp(`--${name}:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)`, 'g');
  const out = [...GLOBALS.matchAll(re)].map((m): Tint => ({ rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: Number(m[4]) }));
  if (!out.length) throw new Error(`no rgba value for --${name} in globals.css`);
  return out;
}
const GLASS = Object.fromEntries(SURFACES.map((s) => [s, tints(s)[0]])) as Record<Surface, Tint>;
const SOLID = Object.fromEntries(SURFACES.map((s) => [s, tints(s).slice(1)])) as Record<Surface, Tint[]>;
/** What the glass does to the map behind a panel (the blur does not change a flat colour). */
const FILTER: GlassFilter = (() => {
  const m = /--glass-blur:\s*blur\(22px\) saturate\(([\d.]+)\) brightness\(([\d.]+)\);/.exec(GLOBALS);
  if (!m) throw new Error('no glass filter (--glass-blur) in globals.css');
  return { saturate: Number(m[1]), brightness: Number(m[2]) };
})();

/** The brightest things a panel can sit over: a white cover, and the brightest (cream) gas. */
const WHITE: Rgb = [255, 255, 255];
const CREAM: Rgb = [244, 238, 222];
/** The text tokens each surface carries. The header sets only paper and dust (checked below). */
const TEXT_ON: Record<Surface, string[]> = {
  'color-float': ['paper', 'dust', 'ash', 'lamp'],
  'panel-bg': ['paper', 'dust', 'ash', 'lamp'],
  'top-bg': ['paper', 'dust'],
};

/** The declarations of the first rule whose selector is exactly `selector` in a stylesheet. */
function rule(sheet: string, selector: string): Record<string, string> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`).exec(sheet);
  if (!m) throw new Error(`no rule ${selector}`);
  return Object.fromEntries(
    m[1].split(';').map((d) => d.split(':')).filter((p) => p.length > 1).map(([k, ...v]) => [k.trim(), v.join(':').trim()]),
  );
}

/** A value's colour: a token (`var(--color-x)`), or the album accent for `var(--acc)`. */
function resolve(value: string, acc: string): string {
  const v = /var\(--(?:color-)?([a-z0-9-]+)\)/.exec(value)?.[1];
  if (!v) throw new Error(`not a token: ${value}`);
  return v === 'acc' ? acc : tok(v);
}

const ALBUMS = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/albums.json'), 'utf8')) as AlbumRecord[];
/** Every accent the page can show: each album's, plus the default before an album sets one. */
const ACCENTS: Array<[string, string]> = [['default', tok('acc')], ...ALBUMS.map((a): [string, string] => [a.slug, a.w[2]])];

describe('WCAG AA contrast', () => {
  it('computes reference ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('reads the tokens, the glass surfaces and the glass filter from globals.css', () => {
    expect(tok('room')).toBe('#07060a');
    expect(tok('lamp-ink')).toBe('#121016');
    expect(GLASS['color-float']).toEqual({ rgb: [10, 9, 14], alpha: 0.66 });
    expect(GLASS['panel-bg']).toEqual({ rgb: [8, 7, 11], alpha: 0.7 });
    expect(GLASS['top-bg']).toEqual({ rgb: [7, 6, 10], alpha: 0.58 });
    expect(FILTER).toEqual({ saturate: 1.2, brightness: 0.58 });
    const solid: Tint = { rgb: [10, 9, 14], alpha: 0.92 };
    // Three fallback blocks (phone width, no backdrop-filter, reduced transparency), the same value in each.
    for (const s of SURFACES) expect(SOLID[s], s).toEqual([solid, solid, solid]);
  });

  it('models a glass panel: saturate, brightness, then the tint', () => {
    expect(surfaceOver(WHITE, FILTER, GLASS['panel-bg'])).toBe('#323134');
    expect(surfaceOver(WHITE, FILTER, GLASS['color-float'])).toBe('#39383c');
    expect(surfaceOver(WHITE, FILTER, GLASS['top-bg'])).toBe('#424244');
    expect(surfaceOver(WHITE, null, SOLID['panel-bg'][0])).toBe('#1e1d21');
    expect(rgbToHex(paintOver([255, 255, 255], 0.5, [0, 0, 0]))).toBe('#808080');
  });

  it('every text token passes 4.5:1 on every opaque surface', () => {
    for (const fg of ['paper', 'dust', 'ash', 'lamp'].map(tok)) {
      for (const bg of ['room', 'room-2', 'room-3', 'room-4', 'pane'].map(tok)) {
        expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const sel of ['.btn-lamp', '.skip']) {
      const r = rule(css('styles/shell.css'), sel);
      expect(contrastRatio(resolve(r.color, ''), resolve(r.background, '')), sel).toBeGreaterThanOrEqual(4.5);
    }
    // The hovered lamp button, and the paper pills (toast, phone map button), set lamp-ink.
    expect(contrastRatio(tok('lamp-ink'), tok('lamp-hover'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tok('lamp-ink'), tok('paper'))).toBeGreaterThanOrEqual(4.5);
  });

  it('every text token passes 4.5:1 on glass over the brightest backdrop', () => {
    for (const [name, backdrop] of [['white', WHITE], ['cream gas', CREAM]] as const) {
      for (const s of SURFACES) {
        const bg = surfaceOver(backdrop, FILTER, GLASS[s]);
        for (const t of TEXT_ON[s]) expect(contrastRatio(tok(t), bg), `${t} on --${s} glass over ${name} (${bg})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('the header sets only paper and dust, the two tokens that pass on its glass', () => {
    const shell = css('styles/shell.css');
    expect(rule(shell, '.wordmark').color).toBe('var(--color-paper)');
    expect(rule(shell, '.navbtn, .icon-btn').color).toBe('var(--color-dust)');
    expect(rule(shell, '.top').background).toBe('var(--top-bg)');
  });

  it('every text token passes 4.5:1 on the solid fallback over an unfiltered white backdrop', () => {
    for (const s of SURFACES) {
      for (const tint of SOLID[s]) {
        const bg = surfaceOver(WHITE, null, tint);
        for (const t of ['paper', 'dust', 'ash', 'lamp']) expect(contrastRatio(tok(t), bg), `${t} on solid --${s} (${bg})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('every album accent passes 4.5:1 on the room colour, and 3:1 as a mark on the panels', () => {
    const room = tok('room');
    const glassPanel = surfaceOver(WHITE, FILTER, GLASS['panel-bg']);
    const solidPanel = surfaceOver(WHITE, null, SOLID['panel-bg'][0]);
    const bad = ACCENTS.flatMap(([s, acc]) => [
      contrastRatio(acc, room) < 4.5 ? `${s} ${acc} on the room ${contrastRatio(acc, room).toFixed(2)}` : '',
      contrastRatio(acc, glassPanel) < 3 ? `${s} ${acc} on the glass panel ${contrastRatio(acc, glassPanel).toFixed(2)}` : '',
      contrastRatio(acc, solidPanel) < 3 ? `${s} ${acc} on the solid panel ${contrastRatio(acc, solidPanel).toFixed(2)}` : '',
    ]).filter(Boolean);
    expect(bad).toEqual([]);
  });

  it('the hot rank badge on the map passes 4.5:1 for every album accent', () => {
    const hot = rule(css('styles/map.css'), '.mk-n[data-hot]');
    const bad = ACCENTS.filter(([, acc]) => contrastRatio(resolve(hot.color, acc), resolve(hot.background, acc)) < 4.5).map(
      ([s, acc]) => `${s} ${acc} ${contrastRatio(resolve(hot.color, acc), resolve(hot.background, acc)).toFixed(2)}`,
    );
    expect(bad).toEqual([]);
  });

  it('a lit mood tag passes 4.5:1 for every album accent, on the glass panel and on the solid one', () => {
    const lit = rule(css('styles/album.css'), '.tags li.lit');
    const mix = /color-mix\(in srgb, var\(--acc\) (\d+)%, transparent\)/.exec(lit.background);
    expect(mix, lit.background).not.toBeNull();
    const pct = Number(mix![1]) / 100;
    const panels = [surfaceOver(WHITE, FILTER, GLASS['panel-bg']), surfaceOver(WHITE, null, SOLID['panel-bg'][0])];
    const bad = ACCENTS.flatMap(([s, acc]) =>
      panels.filter((p) => contrastRatio(resolve(lit.color, acc), rgbToHex(paintOver(hexToRgb(acc), pct, hexToRgb(p)))) < 4.5).map((p) => `${s} ${acc} on ${p}`),
    );
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd frontcreck && npm run test -- src/lib/contrast.test.ts`
Expected: FAIL, the file does not load: `Error: no rgba value for --color-float in globals.css`.

- [ ] **Step 3: Add the pure functions to `frontcreck/src/lib/contrast.ts`**

Append after the last line (`contrastRatio`, L18):

```ts

export type Rgb = [number, number, number];
/** A see-through colour: `rgba(r, g, b, alpha)`. */
export interface Tint {
  rgb: Rgb;
  alpha: number;
}
/** The colour part of `backdrop-filter: blur(...) saturate(s) brightness(k)`. */
export interface GlassFilter {
  saturate: number;
  brightness: number;
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, v));

export const rgbToHex = (rgb: Rgb): string => `#${rgb.map((c) => Math.round(clamp255(c)).toString(16).padStart(2, '0')).join('')}`;

/** CSS `saturate(s)` then `brightness(k)` on an sRGB colour, as `backdrop-filter` applies them (the filter
 * functions work on the sRGB values, each result clamped). A blur leaves a flat backdrop unchanged, so this is
 * what a glass panel sees of a uniformly bright area behind it. */
export function filterBackdrop([r, g, b]: Rgb, { saturate: s, brightness: k }: GlassFilter): Rgb {
  const sat = [
    (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
  ];
  return sat.map((c) => clamp255(clamp255(c) * k)) as Rgb;
}

/** `top` at `alpha` painted over the opaque `bottom` (source-over in sRGB, as the browser composites). */
export function paintOver(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  return top.map((c, i) => c * alpha + bottom[i] * (1 - alpha)) as Rgb;
}

/** The colour a panel shows over `backdrop`, as #rrggbb: the backdrop filtered (glass) or left as it is
 * (`filter` null: the solid fallback has no backdrop-filter), then the panel's tint painted over it. */
export function surfaceOver(backdrop: Rgb, filter: GlassFilter | null, tint: Tint): string {
  return rgbToHex(paintOver(tint.rgb, tint.alpha, filter ? filterBackdrop(backdrop, filter) : backdrop));
}
```

- [ ] **Step 4: Change the tokens in `frontcreck/src/app/globals.css`**

Replace L9-38 (the `@theme` block and the `:root` block) with:

```css
@theme {
  --color-room: #07060a;
  --color-room-2: #0e0d13;
  --color-room-3: #17161d;
  --color-room-4: #24222c;
  --color-paper: #f3eee7;
  --color-dust: #c4beb6;
  --color-ash: #aaa49d;
  --color-rule: rgba(241, 236, 228, 0.14);
  --color-rule-2: rgba(241, 236, 228, 0.26);
  --color-rule-3: rgba(241, 236, 228, 0.45);
  --color-lamp: #f1ece4;
  --color-lamp-hover: #ffffff;
  --color-lamp-ink: #121016;
  --color-pane: #07060a;
  --color-float: rgba(10, 9, 14, 0.66);
  --font-serif: var(--font-serif-face), "Iowan Old Style", "Palatino Linotype", Palatino, serif;
  --font-sans: var(--font-sans-face), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

:root {
  --out: cubic-bezier(.22, .72, .2, 1);
  --dur: .4s;
  --hdr: 64px;
  --gut: 32px;
  --panel: min(45vw, 660px);
  --acc: #d9a066;
  /* Glass: the album panel and the header are see-through like --color-float, and every glass surface blurs and
     dims the map behind it with --glass-blur (the one rule that uses it is in styles/shell.css). The numbers are
     checked for 4.5:1 text contrast over a white backdrop in src/lib/contrast.test.ts. */
  --panel-bg: rgba(8, 7, 11, 0.7);
  --top-bg: rgba(7, 6, 10, 0.58);
  --glass-blur: blur(22px) saturate(1.2) brightness(0.58);
  color-scheme: dark;
}

/* Solid panels instead of glass, in three cases, the same four values in each. Glass has not run on a real phone
   yet: deleting the first of the three lines below is the whole change that turns it on there. */
@media (max-width: 899px) { :root { --glass-blur: none; --color-float: rgba(10, 9, 14, 0.92); --panel-bg: rgba(10, 9, 14, 0.92); --top-bg: rgba(10, 9, 14, 0.92); } }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { :root { --glass-blur: none; --color-float: rgba(10, 9, 14, 0.92); --panel-bg: rgba(10, 9, 14, 0.92); --top-bg: rgba(10, 9, 14, 0.92); } }
@media (prefers-reduced-transparency: reduce) { :root { --glass-blur: none; --color-float: rgba(10, 9, 14, 0.92); --panel-bg: rgba(10, 9, 14, 0.92); --top-bg: rgba(10, 9, 14, 0.92); } }
```

`--color-clay`, `--color-moss` and `--color-ochre` are gone. Confirm nothing uses them: `grep -rn "color-clay\|color-moss\|color-ochre" frontcreck/src` must print nothing.

- [ ] **Step 5: Point the header at its token in `frontcreck/src/styles/shell.css`**

The test in Step 1 reads `.top`'s background. L30, before:

```css
  background: rgba(21, 17, 13, .96); border-bottom: 1px solid var(--color-rule);
```

after:

```css
  background: var(--top-bg); border-bottom: 1px solid var(--color-rule);
```

- [ ] **Step 6: Run the unit test to pass**

Run: `cd frontcreck && npm run test -- src/lib/contrast.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 7: Update the three places that pin a token's value**

`frontcreck/src/app/layout.tsx` L32 (L40 after part 2), before: `  themeColor: '#15110d',` after: `  themeColor: '#07060a',`

`frontcreck/e2e/smoke.spec.ts` L14, before: `  expect(bg).toBe('rgb(21, 17, 13)');` after: `  expect(bg).toBe('rgb(7, 6, 10)');`

`frontcreck/e2e/search.spec.ts` L227 (an empty cover box shows `--color-room-3`), before: `    await expect(cover).toHaveCSS('background-color', 'rgb(38, 32, 25)');` after: `    await expect(cover).toHaveCSS('background-color', 'rgb(23, 22, 29)');`

Both e2e lines still prove what they proved: the body paints the room token, and a loading cover is an empty box in the raised-surface colour.

- [ ] **Step 8: Typecheck, lint, full unit run**

Run: `cd frontcreck && npm run typecheck && npm run lint && npm run test`
Expected: all pass. (Part 2 removes `CLUSTER_RGB` and leaves a stand-in in `MapPreviewStrip.tsx`, so the strip and its test still load and pass here; Task 3 rewrites both. Nothing in this task touches them or the shader test.)

- [ ] **Step 9: Commit**

```bash
git add frontcreck/src/lib/contrast.ts frontcreck/src/lib/contrast.test.ts frontcreck/src/app/globals.css frontcreck/src/app/layout.tsx frontcreck/src/styles/shell.css frontcreck/e2e/smoke.spec.ts frontcreck/e2e/search.spec.ts
git commit -m "feat(theme): Trifid glass tokens, solid fallback switch and worst-case contrast checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Glass surfaces and the literal sweep

**Files:**
- Create: `frontcreck/src/styles/glass.test.ts`
- Create: `frontcreck/e2e/glass.spec.ts`
- Modify: `frontcreck/src/lib/contrast.test.ts` (imports at L6, new `describe` appended)
- Modify: `frontcreck/e2e/helpers.ts` (append `contrastOverBackdrop`)
- Modify: `frontcreck/e2e/nowebgl.spec.ts` (imports L1-2, new test appended)
- Modify: `frontcreck/src/styles/shell.css` L22, L33, L57, L59, L63
- Modify: `frontcreck/src/styles/map.css` L39, L44, L45, L47, L48, L58 (never the focus markers block, which part 2 owns: L72-95 today, L72 to about L123 once part 2 has rewritten it and added the names rules)
- Modify: `frontcreck/src/styles/album.css` L1, L2, L8, L30, L44, L54
- Modify: `frontcreck/src/styles/home.css` L24, L25, L30, L36
- Modify: `frontcreck/src/styles/search.css` L35, L43, L53
- Modify: `frontcreck/src/styles/phone.css` L11

**Interfaces:**
- Consumes: Task 1's tokens and `surfaceOver`, `paintOver`, `rgbToHex`; `ambientBackground(a, 'panel')` from `src/components/album/AmbientWash.tsx`; from part 1, a WebGL canvas with the gas behind the panels (the e2e checks measure whatever is there).
- Produces: one CSS rule that makes `.top, .panel, .album, .map-zoom button, .map-names, .map-tip, .map-msg, .about, .combo--hero .combo-field, .fab-map--on` glass. `.map-names` is part 2's names toggle (its Task 6): a `<button class="map-names">` that is the first child of `.map-zoom`, 8 px above the three zoom buttons. `.map-zoom button` already matches it, so it takes the zoom buttons' size and glass; `.map-names` stays in the list so the rule still covers it if it is ever moved out of the stack. `e2e/helpers.ts` exports `contrastOverBackdrop(page: Page, scope: string, selectors: string[]): Promise<Array<{ selector: string; ratio: number }>>`.
- Note on part 2 (not edited here): its plan replaces `map.css` L72-95 and makes the rank badge `.mk-n` opaque, and the hot badge room digits on `--color-lamp`. If it lands after this task and `.mk-n` still uses `var(--color-float)`, the badge is see-through and unblurred for that while: paper digits still pass (5.7 over white).

- [ ] **Step 1: Write the failing structure test, `frontcreck/src/styles/glass.test.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf8');
const SHEETS = ['app/globals.css', 'styles/shell.css', 'styles/home.css', 'styles/search.css', 'styles/map.css', 'styles/album.css', 'styles/phone.css'];
const SOLID = '--glass-blur: none; --color-float: rgba(10, 9, 14, 0.92); --panel-bg: rgba(10, 9, 14, 0.92); --top-bg: rgba(10, 9, 14, 0.92);';

/** A stylesheet without the map marker rules (map.css, "focus markers" up to the phone block): the map-markers
 * work restyles those itself. */
const mine = (file: string) => (file === 'styles/map.css' ? read(file).replace(/\/\* focus markers[\s\S]*?(?=\n@media)/, '') : read(file));

describe('glass', () => {
  it('one rule gives every glass surface the blur, with the Safari prefix first', () => {
    const m = /\n([^{}\n]+)\{\s*-webkit-backdrop-filter: var\(--glass-blur\); backdrop-filter: var\(--glass-blur\);\s*\}/.exec(read('styles/shell.css'));
    expect(m, 'the glass rule in shell.css').not.toBeNull();
    expect(m![1].split(',').map((s) => s.trim())).toEqual([
      '.top', '.panel', '.album', '.map-zoom button', '.map-names', '.map-tip', '.map-msg', '.about', '.combo--hero .combo-field', '.fab-map--on',
    ]);
  });

  it('no surface sets a blur of its own, so --glass-blur switches all of them', () => {
    // globals.css only defines the property (and names backdrop-filter in its @supports test); the rules are in styles/.
    for (const f of SHEETS.filter((s) => s !== 'app/globals.css')) {
      const own = [...read(f).matchAll(/backdrop-filter:\s*([^;]+);/g)].map((x) => x[1]).filter((v) => v !== 'var(--glass-blur)' && v !== 'none');
      expect(own, f).toEqual([]);
    }
  });

  it('the Home header stays clear', () => {
    expect(read('styles/shell.css')).toContain('.top.top--home { -webkit-backdrop-filter: none; backdrop-filter: none; }');
  });

  it('phones, browsers without backdrop-filter and reduced transparency get the same solid panels', () => {
    const globals = read('app/globals.css');
    for (const block of [
      `@media (max-width: 899px) { :root { ${SOLID} } }`,
      `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { :root { ${SOLID} } }`,
      `@media (prefers-reduced-transparency: reduce) { :root { ${SOLID} } }`,
    ]) {
      expect(globals).toContain(block);
    }
  });

  it('the album panel is glass on wide screens and opaque as the phone list', () => {
    expect(read('styles/album.css')).toMatch(/^\.album \{[^}]*background: var\(--panel-bg\);/m);
    expect(read('styles/phone.css')).toMatch(/\n {2}\.album \{[^}]*background: var\(--color-room\);/);
  });

  it('the album wash stays inside the panel', () => {
    expect(read('styles/album.css')).toContain('.map-amb { display: none; }');
  });

  it('no colour of the old warm theme is left in the stylesheets', () => {
    const OLD = ['237, 229, 213', '21, 17, 13', '12, 10, 8', '230, 168, 86', '#efb86c', '#d9d0bf', '#15110d', '#1a1511', '#17120e', '#e6a856'];
    for (const f of SHEETS) {
      const text = mine(f);
      expect(OLD.filter((c) => text.includes(c)), f).toEqual([]);
    }
  });

  it('the album accent is never a text colour', () => {
    for (const f of SHEETS) expect(/(?:^|[\s;{])color:\s*var\(--acc\)/m.test(read(f)), f).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd frontcreck && npm run test -- src/styles/glass.test.ts`
Expected: FAIL. "the glass rule in shell.css: expected null not to be null", the album and wash tests fail, and the old-colour test lists `237, 229, 213` and others in `shell.css`, `map.css`, `home.css`, `album.css`, `search.css`, `phone.css`. ("the album accent is never a text colour" and the three fallback blocks already pass.)

- [ ] **Step 3: Edit `frontcreck/src/styles/shell.css`**

L22 (the grain's tint, inside the data URL), before: `feColorMatrix values='0 0 0 0 1 0 0 0 0 .95 0 0 0 0 .85 0 0 0 .9 0'` after: `feColorMatrix values='0 0 0 0 .95 0 0 0 0 .94 0 0 0 0 1 0 0 0 .9 0'`

After L33 (`.top.top--home { background: transparent; border-color: transparent; }`) insert:

```css
/* Glass: these surfaces blur and dim the map behind them. --glass-blur is `none` wherever panels are solid
   (phones, no backdrop-filter, reduced transparency: see globals.css). The prefixed line is for Safari before 18. */
.top, .panel, .album, .map-zoom button, .map-names, .map-tip, .map-msg, .about, .combo--hero .combo-field, .fab-map--on {
  -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur);
}
.top.top--home { -webkit-backdrop-filter: none; backdrop-filter: none; }
```

L57, before: `.btn-lamp:hover { background: #efb86c; }` after: `.btn-lamp:hover { background: var(--color-lamp-hover); }`

L59, before: `.btn-line:hover { border-color: rgba(237, 229, 213, .4); background: rgba(237, 229, 213, .04); }` after: `.btn-line:hover { border-color: var(--color-rule-3); background: rgba(241, 236, 228, .05); }`

L63, before: `.textbtn.u span { text-decoration: underline; text-decoration-color: rgba(237, 229, 213, .35); text-underline-offset: 5px; }` after: `.textbtn.u span { text-decoration: underline; text-decoration-color: rgba(241, 236, 228, .35); text-underline-offset: 5px; }`

- [ ] **Step 4: Edit `frontcreck/src/styles/map.css` (all six lines are above the focus markers block, so part 2 does not move them)**

L39, before: `.mode-track::before { content: ""; position: absolute; left: 8px; right: 8px; top: 10px; height: 2px; background: var(--color-rule-2); }` after: the same with `background: var(--color-rule-3);`

L44, in `::-webkit-slider-thumb`, before: `border: 3px solid var(--color-float);` after: `border: 3px solid var(--color-room-2);`

L45, in `::-moz-range-thumb`, before: `border: 3px solid var(--color-float);` after: `border: 3px solid var(--color-room-2);`

L47, before: `.mode input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 1px var(--color-lamp), 0 0 0 5px rgba(230, 168, 86, .35); }` after: `.mode input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 1px var(--color-lamp), 0 0 0 3px var(--color-room), 0 0 0 5px var(--color-lamp); }`

L48, before: `.mode input[type=range]:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 1px var(--color-lamp), 0 0 0 5px rgba(230, 168, 86, .35); }` after: `.mode input[type=range]:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 1px var(--color-lamp), 0 0 0 3px var(--color-room), 0 0 0 5px var(--color-lamp); }`

L58 (the hint is text directly on the map, so it gets the prototype's band: `docs/design/trifid-theme/prototype/src/css/trifid.css` L16-19), before:

```css
.map-hint { position: absolute; left: 20px; bottom: 20px; right: 90px; font-size: 13px; color: var(--color-ash); pointer-events: none; text-shadow: 0 1px 8px var(--color-pane); transition: opacity .25s var(--out), visibility 0s; }
```

after:

```css
/* Text straight on the nebula: a soft full-width band under it (z-index -1 keeps it under the zoom buttons and the
 * card), dark enough from 50% down that paper holds 4.5:1 over a white backdrop (contrast.test.ts). */
.map-hint { position: absolute; left: 0; right: 0; bottom: 0; z-index: -1; padding: 44px 120px 18px 20px; font-size: 13px; color: var(--color-paper); pointer-events: none; background: linear-gradient(rgba(4, 4, 8, 0), rgba(4, 4, 8, .62) 50%, rgba(4, 4, 8, .78)); transition: opacity .25s var(--out), visibility 0s; }
```

L135 (the veil) is changed in Task 4.

- [ ] **Step 5: Edit `frontcreck/src/styles/album.css`**

L1, before: `background: var(--color-room);` after: `background: var(--panel-bg);` (rest of the line unchanged).

L2, before: `.amb { position: absolute; left: 0; right: 0; top: 0; height: 440px; pointer-events: none; }` after: `.amb { position: absolute; left: 0; right: 0; top: 0; height: 440px; pointer-events: none; opacity: .9; }`

L8, before: `.map-amb { position: absolute; inset: 0; pointer-events: none; }` after:

```css
/* The album's wash stays inside the panel: over the nebula a per-album tint would fight the map's own colours. */
.map-amb { display: none; }
```

L30, before: `.icon-quiet:hover { color: var(--color-paper); border-color: rgba(237, 229, 213, .4); }` after: `.icon-quiet:hover { color: var(--color-paper); border-color: var(--color-rule-3); }`

L44, before: `.rec.hot .rec-main { background: rgba(237, 229, 213, .045); }` after: `.rec.hot .rec-main { background: rgba(241, 236, 228, .06); }`

L54, before: `.rec-sp:hover { color: var(--color-paper); background: rgba(237, 229, 213, .06); }` after: `.rec-sp:hover { color: var(--color-paper); background: rgba(241, 236, 228, .07); }`

- [ ] **Step 6: Edit `frontcreck/src/styles/home.css` (About and 404 surfaces; the hero, shelf and veil are Task 4)**

L24, before: `background: rgba(12, 10, 8, .72); }` after: `background: rgba(5, 4, 8, .3); }`

L25, before: `background: var(--color-room);` after: `background: var(--panel-bg);`

L30, before: `.about p { font-size: 16.5px; line-height: 1.65; color: #d9d0bf; margin-top: 16px; }` after: `.about p { font-size: 16.5px; line-height: 1.65; color: #e0dbd3; margin-top: 16px; }`

L36, before: `background: rgba(12, 10, 8, .55); }` after: `background: rgba(5, 4, 8, .55); }`

- [ ] **Step 7: Edit `frontcreck/src/styles/search.css` and `frontcreck/src/styles/phone.css`**

`search.css` L35, before: `.opt mark { background: none; color: var(--color-paper); box-shadow: inset 0 -1px 0 rgba(230, 168, 86, .8); }` after: `.opt mark { background: none; color: var(--color-paper); box-shadow: inset 0 -1px 0 var(--color-lamp); }`

`search.css` L43 (the prototype's `.5` tint fails for the ash placeholder; `--color-float` passes at 4.71), before: `.combo--hero .combo-field { height: 58px; padding: 0 16px 0 18px; }` after: `.combo--hero .combo-field { height: 58px; padding: 0 16px 0 18px; background: var(--color-float); }`

`search.css` L53, before: `color: rgba(237, 229, 213, .78);` after: `color: rgba(243, 238, 231, .78);`

The search popover (`.combo-pop`, `--color-room-2`) and the phone search sheet (`--color-room`) stay opaque: no edit.

`phone.css` L11, before: `  .album { width: 100%; border-right: 0; transition: transform var(--dur) var(--out), visibility 0s; }` after: `  .album { width: 100%; border-right: 0; background: var(--color-room); transition: transform var(--dur) var(--out), visibility 0s; }`

- [ ] **Step 8: Run the structure test to pass**

Run: `cd frontcreck && npm run test -- src/styles/glass.test.ts`
Expected: PASS, 8 tests. If "no colour of the old warm theme" still lists `rgba(21, 17, 13` for `map.css` or `phone.css`, that is the veil: do Task 4 Step 3 now (two lines) and rerun.

- [ ] **Step 9: Add the wash, About and hint contrast tests to `frontcreck/src/lib/contrast.test.ts`**

Add after the `hexToRgb` import (L4): `import { ambientBackground } from '@/components/album/AmbientWash';`

Append at the end of the file:

```ts

describe('text over washes and bands', () => {
  const WORST_PANEL = hexToRgb(surfaceOver(WHITE, FILTER, GLASS['panel-bg']));

  it('paper and dust pass 4.5:1 on every album wash at full strength, on the brightest glass panel', () => {
    const opacity = Number(rule(css('styles/album.css'), '.amb').opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(1);
    const bad: string[] = [];
    for (const a of ALBUMS) {
      // The alphas ambientBackground gives the two washes (the panel variant paints w[0], then w[1]).
      const alphas = [...ambientBackground(a.w, 'panel').matchAll(/rgba\(\d+,\d+,\d+,([\d.]+)\)/g)].map((m) => Number(m[1]));
      a.w.slice(0, 2).forEach((wash, i) => {
        const bg = rgbToHex(paintOver(hexToRgb(wash), alphas[i] * opacity, WORST_PANEL));
        for (const t of ['paper', 'dust']) {
          if (contrastRatio(tok(t), bg) < 4.5) bad.push(`${a.slug} ${wash} ${t} ${contrastRatio(tok(t), bg).toFixed(2)}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it('the About card is the glass panel and its body text passes on it', () => {
    const home = css('styles/home.css');
    expect(rule(home, '.about').background).toBe('var(--panel-bg)');
    expect(contrastRatio(rule(home, '.about p').color, rgbToHex(WORST_PANEL))).toBeGreaterThanOrEqual(4.5);
  });

  it('the Home search field is the float surface, on which its ash placeholder passes', () => {
    expect(rule(css('styles/search.css'), '.combo--hero .combo-field').background).toBe('var(--color-float)');
  });

  it('the map hint is paper on a band that holds 4.5:1 over an unfiltered white backdrop', () => {
    const hint = rule(css('styles/map.css'), '.map-hint');
    expect(hint.color).toBe('var(--color-paper)');
    const band = /rgba\(4, 4, 8, ([\d.]+)\) 50%/.exec(hint.background);
    expect(band, hint.background).not.toBeNull();
    const bg = surfaceOver(WHITE, null, { rgb: [4, 4, 8], alpha: Number(band![1]) });
    expect(contrastRatio(tok('paper'), bg), bg).toBeGreaterThanOrEqual(4.5);
  });
});
```

Run: `cd frontcreck && npm run test -- src/lib/contrast.test.ts`
Expected: PASS, 14 tests. To see the wash test bite, set `.amb`'s `opacity: .9` to `1` for one run: it fails with `a-tab-in-the-ocean-nektar #545721 dust 4.49`. Put `.9` back.

- [ ] **Step 10: Add the pixel contrast helper to `frontcreck/e2e/helpers.ts`**

Append at the end of the file:

```ts

/**
 * WCAG contrast of the text of each selector's first visible element against what is really painted behind it.
 * axe cannot judge text over a canvas or over a see-through panel (it reports "incomplete"), so this does: the text
 * under `scope` is made transparent for one screenshot, and the background is the 95th-percentile relative
 * luminance inside the element's box (a lone star does not decide it; a bright patch does).
 */
export async function contrastOverBackdrop(page: Page, scope: string, selectors: string[]): Promise<Array<{ selector: string; ratio: number }>> {
  const targets = await page.evaluate(
    (sels) =>
      sels.map((selector) => {
        const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
        if (!el) return { selector, rect: null, rgb: [0, 0, 0] };
        const r = el.getBoundingClientRect();
        const rgb = (getComputedStyle(el).color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        return { selector, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, rgb };
      }),
    selectors,
  );
  const missing = targets.filter((t) => !t.rect).map((t) => t.selector);
  if (missing.length) throw new Error(`contrastOverBackdrop: not visible: ${missing.join(', ')}`);
  const style = await page.addStyleTag({
    content: `${scope}, ${scope} * { color: transparent !important; -webkit-text-fill-color: transparent !important; -webkit-text-stroke-color: transparent !important; text-decoration-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; transition: none !important; }`,
  });
  const png = (await page.screenshot()).toString('base64');
  await style.evaluate((el) => el.remove());
  return page.evaluate(
    async ([data, list]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      return list.map((t) => {
        const x0 = Math.max(0, Math.round(t.rect!.x * k));
        const y0 = Math.max(0, Math.round(t.rect!.y * k));
        const x1 = Math.min(img.width, Math.round((t.rect!.x + t.rect!.w) * k));
        const y1 = Math.min(img.height, Math.round((t.rect!.y + t.rect!.h) * k));
        const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
        const lums: number[] = [];
        for (let i = 0; i < d.length; i += 4) lums.push(lum(d[i], d[i + 1], d[i + 2]));
        lums.sort((a, b) => a - b);
        const bg = lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.95))];
        const fg = lum(t.rgb[0], t.rgb[1], t.rgb[2]);
        return { selector: t.selector, ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) };
      });
    },
    [png, targets] as const,
  );
}
```

- [ ] **Step 11: Write `frontcreck/e2e/glass.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';
import { contrastOverBackdrop, waitForAnimations, waitForCameraIdle, waitForMap } from './helpers';

const GLASS = 'blur(22px) saturate(1.2) brightness(0.58)';
const SOLID = 'rgba(10, 9, 14, 0.92)';
/** The album whose accent has the lowest contrast in the catalog (#d44f4f). */
const WEAKEST = '/album/making-movies-dire-straits';

const styleOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { filter: cs.backdropFilter, bg: cs.backgroundColor };
  });

test('panels are glass on wide screens and near-solid on phones; the Home header is clear', async ({ page, isMobile }) => {
  await page.goto('/map');
  await waitForMap(page);
  await expect(page.locator('.map-zoom button').first()).toBeVisible();
  if (isMobile) {
    for (const sel of ['.mode.panel', 'header.top', '.map-zoom button']) expect(await styleOf(page, sel), sel).toEqual({ filter: 'none', bg: SOLID });
  } else {
    expect(await styleOf(page, '.mode.panel')).toEqual({ filter: GLASS, bg: 'rgba(10, 9, 14, 0.66)' });
    expect(await styleOf(page, '.map-zoom button')).toEqual({ filter: GLASS, bg: 'rgba(10, 9, 14, 0.66)' });
    expect(await styleOf(page, 'header.top')).toEqual({ filter: GLASS, bg: 'rgba(7, 6, 10, 0.58)' });
  }
  await page.goto('/album/in-rainbows-radiohead');
  // The phone album list is opaque; the desktop panel is glass.
  expect(await styleOf(page, 'section.album')).toEqual(isMobile ? { filter: 'none', bg: 'rgb(7, 6, 10)' } : { filter: GLASS, bg: 'rgba(8, 7, 11, 0.7)' });
  await page.goto('/');
  expect(await styleOf(page, 'header.top')).toEqual({ filter: 'none', bg: 'rgba(0, 0, 0, 0)' });
});

test('with reduced transparency the panels are near-solid and unblurred', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones are already solid');
  await page.goto('/album/in-rainbows-radiohead');
  await waitForMap(page);
  await expect(page.locator('.map-zoom button').first()).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), 'the browser must emulate the preference').toBe(true);
  for (const sel of ['.mode.panel', 'section.album', 'header.top', '.map-zoom button', '.map-explore']) {
    expect(await styleOf(page, sel), sel).toEqual({ filter: 'none', bg: SOLID });
  }
});

test('the built CSS keeps the Safari prefix and the no-support fallback', async ({ page }) => {
  await page.goto('/map');
  const cssText = await page.evaluate(async () => {
    const linked = await Promise.all([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => fetch(l.href).then((r) => r.text())));
    return [...linked, ...[...document.querySelectorAll('style')].map((s) => s.textContent ?? '')].join('\n');
  });
  // Read as text: Chromium drops the prefixed property from the parsed rules, Safari before 18 needs it.
  expect(cssText).toMatch(/-webkit-backdrop-filter:\s*var\(--glass-blur\)/);
  expect(cssText).toMatch(/[;{]\s*backdrop-filter:\s*var\(--glass-blur\)/);
  expect(cssText).toMatch(/@supports\s+not\s*\(\(backdrop-filter:\s*blur\(1px\)\)\s*or\s*\(-webkit-backdrop-filter:\s*blur\(1px\)\)\)/);
  expect(cssText).toMatch(/prefers-reduced-transparency:\s*reduce/);
});

test('text on the panels keeps 4.5:1 over the map, with the weakest accent', async ({ page, isMobile }) => {
  await page.goto(WEAKEST);
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  const results = await contrastOverBackdrop(page, 'section.album', ['.seed-artist', '.seed-title', '.tags li', '.recs-h', '.rec-n', '.rec-title', '.rec-artist', '.rec-shared']);
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  // The hint is desktop only (display: none under 900 px).
  results.push(...(await contrastOverBackdrop(page, '.map-ui', ['.mode .cap', '.mode-stops button', '.mode-note', ...(isMobile ? [] : ['.map-hint'])])));
  for (const r of results) expect(r.ratio, r.selector).toBeGreaterThanOrEqual(4.5);
});
```

- [ ] **Step 12: Add the no-WebGL check to `frontcreck/e2e/nowebgl.spec.ts`**

L1-2, before:

```ts
import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';
```

after:

```ts
import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { contrastOverBackdrop, waitForAnimations } from './helpers';
```

Append at the end of the file:

```ts

test('without WebGL the see-through panels sit on the plain sky and keep 4.5:1', async ({ page }) => {
  await page.goto('/album/making-movies-dire-straits');
  await expect(page.locator('li.rec')).toHaveCount(5);
  await expect(page.getByText(COPY.map.noWebgl)).toBeVisible();
  await waitForAnimations(page);
  // No gas behind the glass: the pane is the plain sky colour, which the glass panels must not turn muddy or pale.
  expect(await page.locator('.map-pane').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(7, 6, 10)');
  const results = [
    ...(await contrastOverBackdrop(page, 'section.album', ['.seed-artist', '.tags li', '.rec-n', '.rec-artist', '.rec-shared'])),
    ...(await contrastOverBackdrop(page, '.map-pane', ['.map-msg', '.mode .cap', '.mode-stops button', '.mode-note'])),
  ];
  for (const r of results) expect(r.ratio, r.selector).toBeGreaterThanOrEqual(4.5);
});
```

- [ ] **Step 13: Run the browser checks, one at a time**

Each command builds the site first (several minutes). Wait for one to finish before starting the next.

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/glass.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/glass.spec.ts --project=phone --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/nowebgl.spec.ts --project=nowebgl --workers=1)
```

Expected: desktop 4 passed; phone 3 passed, 1 skipped; nowebgl 3 passed. If "with reduced transparency" fails on its `matchMedia` line, the bundled Chromium does not emulate the feature through CDP: do not delete the test; replace the `cdp.send` line with `await page.emulateMedia({ reducedTransparency: 'reduce' } as Parameters<typeof page.emulateMedia>[0]);`, and if that fails too, report it (the unit test in Step 1 still pins the block). If "text on the panels" fails for a selector, raise that surface's tint alpha in `globals.css` by .04, update the pinned values in `contrast.test.ts` ("reads the tokens", "models a glass panel"), rerun both, and record the final number in the PR body.

- [ ] **Step 14: Typecheck, lint, unit tests, commit**

Run: `cd frontcreck && npm run typecheck && npm run lint && npm run test`
Expected: all pass.

```bash
git add frontcreck/src/styles frontcreck/src/lib/contrast.test.ts frontcreck/e2e/glass.spec.ts frontcreck/e2e/helpers.ts frontcreck/e2e/nowebgl.spec.ts
git commit -m "feat(theme): glass panels over the map with a solid fallback, cool literals throughout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Phone strip on the nebula, and the phone layout guard

**Files:**
- Modify: `frontcreck/src/components/album/MapPreviewStrip.tsx` (whole file, L1-190)
- Modify: `frontcreck/src/components/album/MapPreviewStrip.test.ts` (whole file, L1-27)
- Modify: `frontcreck/e2e/phone.spec.ts` (append one test)

**Interfaces:**
- Consumes from part 1: `SKY_RGB`, `STAR_WHITE`, `FRAME_RGB` (each `[r, g, b]` in 0 to 255) from `src/components/map/theme.ts`; `loadTheme(): Promise<ThemeData>` with `ThemeData.bakeHalf: number` from `src/lib/data/theme.ts`; the files `public/data/theme/gas-{sonic,balanced,mood}.webp`, each covering the raw square `[-bakeHalf, bakeHalf]²`. Confirmed against part 1's plan (Tasks 2 and 3): `loadTheme` memoises its promise; the image is stored upright (pixel (0, 0) is raw (-bakeHalf, +bakeHalf), north up, as the strip draws) with straight alpha, where alpha is what the dust lets through, so drawing it over the sky fill with ordinary source-over is right; neither `components/map/theme.ts` nor `lib/data/theme.ts` imports three.js. Check the same three facts in the code before starting.
- Consumes from part 2: `CLUSTER_RGB` no longer exists in `src/components/map/data.ts` (part 2 leaves a two-line stand-in in `MapPreviewStrip.tsx`, which this task replaces); the names toggle is one more 44 px button in the zoom corner, class `.map-names`, the first child of `.map-zoom` (so it is the top button), shown at every zoom; `layoutMarkers` takes `options.minLine`, and part 2 asks the strip to pass `minLine: 10` for its small covers (the prototype's value).
- Produces: `drawStrip(ctx, w, h, albums, pos, focus, gas, onReady)` where `gas: StripGas | null` and `interface StripGas { image: CanvasImageSource; bakeHalf: number }`. The `accent` parameter is gone (the seed's frame is off-white, like the map's).

- [ ] **Step 1: Replace `frontcreck/src/components/album/MapPreviewStrip.test.ts` with the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { FRAME_RGB, SKY_RGB, STAR_WHITE } from '@/components/map/theme';
import type { AlbumRecord } from '@/lib/types';
import { drawStrip } from './MapPreviewStrip';

const W: [string, string, string] = ['#222222', '#333333', '#d9a066'];
const albums: AlbumRecord[] = Array.from({ length: 30 }, (_, i) => ({ slug: `a${i}`, t: `A${i}`, a: 'X', s: '', c: '', k: i % 8, d: [], w: W }));
const pos = albums.flatMap((_, i) => [(i % 6) / 6 - 0.5, Math.floor(i / 6) / 6 - 0.5]);
const FOCUS = { seed: 7, recs: [8, 13, 1] };

/** Records every method call and every property set, in order. */
function fakeCtx() {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => { calls.push(`${k}(${args.map((a) => (typeof a === 'number' ? Math.round(a) : a)).join(',')})`); }),
    set: (t, k: string, v) => { t[k] = v; calls.push(`${k}=${v}`); return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
const count = (calls: string[], prefix: string) => calls.filter((c) => c.startsWith(prefix)).length;

describe('drawStrip', () => {
  it('draws everything without the gas image: sky, a star per album, cased lines, tiles and numbered badges', () => {
    const { ctx, calls } = fakeCtx();
    drawStrip(ctx, 390, 172, albums, pos, FOCUS, null, vi.fn());
    // The sky is filled first, so the strip is never an empty box while the image loads or after it failed.
    expect(calls.slice(0, 2)).toEqual([`fillStyle=rgba(${SKY_RGB.join(',')},1)`, 'fillRect(0,0,390,172)']);
    expect(count(calls, 'drawImage(')).toBe(0);
    expect(count(calls, 'arc(')).toBeGreaterThan(10);
    expect(count(calls, 'lineTo(')).toBe(2 * 3); // a dark casing and a white line per recommendation
    expect(count(calls, 'fillRect(')).toBe(1 + 1 + 4 + 3); // sky, the seed's backing, four tiles (no cover ids), three badges
    expect(calls.filter((c) => c.startsWith('fillText(')).map((c) => c.split(',')[0])).toEqual(['fillText(1', 'fillText(2', 'fillText(3']);
  });

  it('draws the gas under the stars, placed by bakeHalf in the strip\'s own scale', () => {
    const { ctx, calls } = fakeCtx();
    const image = { toString: () => 'GAS' } as unknown as CanvasImageSource;
    drawStrip(ctx, 390, 172, albums, pos, FOCUS, { image, bakeHalf: 1 }, vi.fn());
    // Scale 336 px per unit, centred on (-0.25, -0.3333): the square [-1, 1]² is 672 px wide from (-57, -362).
    expect(calls).toContain('drawImage(GAS,-57,-362,672,672)');
    expect(calls.indexOf('drawImage(GAS,-57,-362,672,672)')).toBeLessThan(calls.findIndex((c) => c.startsWith('arc(')));
  });

  it('uses the theme colours: star-white dots, off-white frames, no cluster colours', () => {
    const { ctx, calls } = fakeCtx();
    drawStrip(ctx, 390, 172, albums, pos, FOCUS, null, vi.fn());
    expect(calls).toContain(`fillStyle=rgba(${STAR_WHITE.join(',')},0.7)`);
    expect(calls).toContain(`strokeStyle=rgba(${FRAME_RGB.join(',')},1)`);
    expect(calls.some((c) => /196,136,111|151,160,119|200,165,96|237,229,213/.test(c))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd frontcreck && npm run test -- src/components/album/MapPreviewStrip.test.ts`
Expected: FAIL on the first assertion (`expected [ 'clearRect(0,0,390,172)', … ]`). The old file still compiles, before part 2 and after it (part 2 swaps the `CLUSTER_RGB` import for a `STAR_WHITE` stand-in), and typecheck reports the changed `drawStrip` arguments.

- [ ] **Step 3: Replace `frontcreck/src/components/album/MapPreviewStrip.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { TILE } from '@/components/Cover';
import { MARKER_GAP, layoutMarkers } from '@/components/map/state/focusLayout';
import { FRAME_RGB, SKY_RGB, STAR_WHITE } from '@/components/map/theme';
import { COPY } from '@/lib/copy';
import { coverUrl } from '@/lib/data/catalog';
import { loadTheme } from '@/lib/data/theme';
import { useCatalog, usePositions } from '@/lib/data/useData';
import { useIsNarrow } from '@/lib/media';
import type { AlbumRecord, Focus, StopId } from '@/lib/types';

const rgba = ([r, g, b]: readonly number[], a: number) => `rgba(${r},${g},${b},${a})`;
/** The map's empty sky, its stars and its off-white frames (components/map/theme.ts), plus two tokens of globals.css. */
const SKY = rgba(SKY_RGB, 1);
const STAR = rgba(STAR_WHITE, 0.7);
const FRAME = rgba(FRAME_RGB, 1);
const FRAME_QUIET = rgba(FRAME_RGB, 0.6);
const BADGE_EDGE = rgba(FRAME_RGB, 0.45);
const ROOM = '#07060a'; // --color-room
const PAPER = '#f3eee7'; // --color-paper
/** The lines to the closest albums, as on the map: white on a dark casing, so they hold on any gas. */
const LINE_CASING = 'rgba(4,4,8,.8)';
const LINE = 'rgba(255,255,255,.92)';
/** Strip covers are smaller than the map's markers (64 / 46): the mockup's compact MapView sizes. */
const STRIP_SEED = 38;
const STRIP_REC = 28;
/** The gas of one slider stop, drawn under the strip's stars. */
export interface StripGas {
  image: CanvasImageSource;
  /** The image covers the raw square [-bakeHalf, bakeHalf]², north up (theme.json). */
  bakeHalf: number;
}
/** The strip shows a small part of the 2048 px gas image, so it keeps a 512 px copy and lets the full decode go. */
const GAS_PX = 512;
const gasCopies = new Map<StopId, Promise<HTMLCanvasElement>>();

function loadGas(stop: StopId): Promise<HTMLCanvasElement> {
  let copy = gasCopies.get(stop);
  if (!copy) {
    const im = new Image();
    im.decoding = 'async';
    im.src = `/data/theme/gas-${stop}.webp`;
    copy = im.decode().then(() => {
      const c = document.createElement('canvas');
      c.width = GAS_PX;
      c.height = GAS_PX;
      c.getContext('2d')?.drawImage(im, 0, 0, GAS_PX, GAS_PX);
      return c;
    });
    // A failed load is forgotten, so the next strip tries again; this one draws without gas.
    copy.catch(() => gasCopies.delete(stop));
    gasCopies.set(stop, copy);
  }
  return copy;
}

const images = new Map<string, { im: HTMLImageElement; decoded: boolean; failed: boolean; waiting: Set<() => void> }>();

/** A cover is drawn only after img.decode() resolved (off the main thread); until then the tile is drawn. */
function readyImage(url: string, onReady: () => void): HTMLImageElement | null {
  let entry = images.get(url);
  if (!entry) {
    const im = new Image();
    im.decoding = 'async';
    im.src = url;
    const e = { im, decoded: false, failed: false, waiting: new Set<() => void>() };
    entry = e;
    images.set(url, e);
    im.decode().then(
      () => {
        e.decoded = true;
        e.waiting.forEach((f) => f());
        e.waiting.clear();
      },
      // A cover that cannot be decoded keeps its tile: drawing a lettered tile is the designed fallback, so the
      // failure is recorded (no retry, no redraw) rather than reported.
      () => {
        e.failed = true;
        e.waiting.clear();
      },
    );
  }
  if (entry.decoded) return entry.im;
  if (!entry.failed) entry.waiting.add(onReady);
  return null;
}

/** The compact map of the phone album list: the sky, the stop's gas when it has loaded, a star per album, cased
 * lines to the closest albums, small covers (seed 38 px, recs 28 px, kept inside the canvas) and rank badges
 * drawn last, so no cover hides one. Without `gas` everything else is still drawn. */
export function drawStrip(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  albums: readonly AlbumRecord[],
  pos: readonly number[],
  focus: Focus,
  gas: StripGas | null,
  onReady: () => void,
): void {
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, w, h);
  const ids = [focus.seed, ...focus.recs];
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const i of ids) {
    x0 = Math.min(x0, pos[2 * i]);
    x1 = Math.max(x1, pos[2 * i]);
    y0 = Math.min(y0, pos[2 * i + 1]);
    y1 = Math.max(y1, pos[2 * i + 1]);
  }
  const pad = 30;
  const k = Math.min(Math.max(Math.min((w - 2 * pad) / Math.max(x1 - x0, 0.3), (h - 2 * pad) / Math.max(y1 - y0, 0.3)), Math.min(w, h) / 8), 5000);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const sx = (x: number) => w / 2 + (x - cx) * k;
  const sy = (y: number) => h / 2 - (y - cy) * k;
  if (gas) {
    // The strip uses raw positions, so the image's square [-bakeHalf, bakeHalf]² maps with the same scale; the
    // image's alpha (dust) lets the sky fill show through.
    const side = 2 * gas.bakeHalf * k;
    ctx.drawImage(gas.image, sx(-gas.bakeHalf), sy(gas.bakeHalf), side, side);
  }
  ctx.beginPath();
  for (let i = 0; i < albums.length; i++) {
    const x = sx(pos[2 * i]);
    const y = sy(pos[2 * i + 1]);
    if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
    ctx.moveTo(x + 1.3, y);
    ctx.arc(x, y, 1.3, 0, Math.PI * 2);
  }
  ctx.fillStyle = STAR;
  ctx.fill();
  const placed = layoutMarkers(ids.map((id) => ({ id, x: sx(pos[2 * id]), y: sy(pos[2 * id + 1]) })), STRIP_SEED, STRIP_REC, {
    // 6 px: room for the badges (4 px out, top-left) and the seed's frame (5 px out).
    bounds: { left: 6, top: 6, right: w - 6, bottom: h - 6 },
    gap: MARKER_GAP,
    // The strip's covers are small: 10 px of visible line is enough (part 2's layoutMarkers defaults to 24).
    minLine: 10,
  });
  for (const [stroke, width] of [[LINE_CASING, 3], [LINE, 1.2]] as const) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    for (const it of placed.slice(1)) {
      ctx.beginPath();
      ctx.moveTo(placed[0].x, placed[0].y);
      ctx.lineTo(it.x, it.y);
      ctx.stroke();
    }
  }
  for (const it of [...placed.slice(1), placed[0]]) {
    const a = albums[it.id];
    const s = it.size;
    const x = it.x - s / 2;
    const y = it.y - s / 2;
    if (it.seed) {
      // The seed's frame sits on a dark backing, so it reads on the brightest gas too.
      ctx.fillStyle = ROOM;
      ctx.fillRect(x - 5, y - 5, s + 10, s + 10);
    }
    const url = coverUrl(a.c, s);
    const im = url ? readyImage(url, onReady) : null;
    if (im) ctx.drawImage(im, x, y, s, s);
    else {
      ctx.fillStyle = TILE[a.k % 3];
      ctx.fillRect(x, y, s, s);
    }
    ctx.strokeStyle = it.seed ? FRAME : FRAME_QUIET;
    ctx.lineWidth = it.seed ? 2 : 1;
    const o = it.seed ? 4 : 0.5;
    ctx.strokeRect(x - o, y - o, s + 2 * o, s + 2 * o);
  }
  const b = 14;
  ctx.font = '600 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  for (const it of placed.slice(1)) {
    const bx = it.x - it.size / 2 - 4;
    const by = it.y - it.size / 2 - 4;
    ctx.fillStyle = ROOM;
    ctx.fillRect(bx, by, b, b);
    ctx.strokeStyle = BADGE_EDGE;
    ctx.strokeRect(bx + 0.5, by + 0.5, b - 1, b - 1);
    ctx.fillStyle = PAPER;
    ctx.fillText(String(it.rank), bx + b / 2, by + b / 2 + 0.5);
  }
}

export function MapPreviewStrip({ focus, stop, onOpen }: { focus: Focus; stop: StopId; onOpen: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The strip only exists under 900 px; on wider screens it is display:none, so load nothing for it there.
  const narrow = useIsNarrow();
  const { catalog } = useCatalog(narrow);
  const { positions } = usePositions(narrow);
  const recsKey = focus.recs.join(',');
  // The gas of one stop; the strip draws without it until it arrives, and for good if it cannot load.
  const [gas, setGas] = useState<(StripGas & { stop: StopId }) | null>(null);

  useEffect(() => {
    if (!narrow) return;
    let live = true;
    Promise.all([loadGas(stop), loadTheme()]).then(
      ([image, theme]) => {
        if (live) setGas({ stop, image, bakeHalf: theme.bakeHalf });
      },
      // Decoration only: the strip without gas (sky, stars, lines, covers) is the designed fallback.
      () => {},
    );
    return () => {
      live = false;
    };
  }, [narrow, stop]);

  const stopGas = gas?.stop === stop ? gas : null;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !catalog || !positions) return;
    let raf = 0;
    // A cover that finishes decoding after this effect was cleaned up must not redraw (the callback stays queued).
    let live = true;
    const draw = () => {
      if (!live) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const recs = recsKey ? recsKey.split(',').map(Number) : [];
        drawStrip(ctx, r.width, r.height, catalog.albums, positions[stop], { seed: focus.seed, recs }, stopGas, draw);
      });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [catalog, positions, stop, focus.seed, recsKey, stopGas]);

  return (
    <div className="strip">
      <canvas ref={ref} className="strip-canvas" role="img" aria-label={COPY.map.preview} onClick={onOpen} />
      <button type="button" className="strip-open" onClick={onOpen}>
        <span>{COPY.map.openMap}</span>
        <Icon name="fit" />
      </button>
    </div>
  );
}
```

If part 1's `loadTheme` has another name or shape, change only the import and the `theme.bakeHalf` read; if its image has south up, change `sy(gas.bakeHalf)` and add a vertical flip. Say so in the commit message.

- [ ] **Step 4: Run the unit test to pass**

Run: `cd frontcreck && npm run test -- src/components/album/MapPreviewStrip.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the phone layout guard to `frontcreck/e2e/phone.spec.ts`**

Append at the end of the file:

```ts

test('the zoom corner, with the names button, clears the slider below it and whatever is above it', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout');
  // The smallest phone the layout is checked on.
  await page.setViewportSize({ width: 360, height: 640 });
  /** The buttons of the bottom right corner (names, zoom in, zoom out, whole map), top to bottom. */
  const corner = () =>
    page.locator('.map-zoom button, button.map-names, .map-names button').evaluateAll((els) =>
      els
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ y: r.y, w: Math.round(r.width), h: Math.round(r.height) }))
        .sort((a, b) => a.y - b.y),
    );
  const check = async (ceiling: number, label: string) => {
    const buttons = await corner();
    const mode = (await page.locator('.mode').boundingBox())!;
    for (const b of buttons) {
      expect(b.w, label).toBeGreaterThanOrEqual(44);
      expect(b.h, label).toBeGreaterThanOrEqual(44);
    }
    // No two overlap, the lowest ends 8 px above the slider panel (map.css: --slider-cover + 8px), the highest
    // starts at least 8 px under what is above it.
    for (let i = 1; i < buttons.length; i++) expect(buttons[i].y - (buttons[i - 1].y + buttons[i - 1].h), label).toBeGreaterThanOrEqual(-1);
    const last = buttons[buttons.length - 1];
    expect(mode.y - (last.y + last.h), label).toBeGreaterThanOrEqual(7);
    expect(buttons[0].y - ceiling, label).toBeGreaterThanOrEqual(8);
    return buttons.length;
  };
  // Explore at the overview: three zoom buttons and the names button, under the header.
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const header = (await page.locator('header.top').boundingBox())!;
  expect(await check(header.y + header.height, 'explore')).toBeGreaterThanOrEqual(4);
  // An album's map mode: the corner must also clear the Explore and List buttons of the top row.
  await page.goto(IR);
  await waitForMap(page);
  await page.getByRole('button', { name: COPY.phone.mapLabel }).tap();
  await expect(page.locator('.mode')).toBeVisible();
  await waitForCameraIdle(page);
  const list = (await page.locator('.fab-map--on').boundingBox())!;
  const explore = (await page.locator('.map-explore').boundingBox())!;
  expect(await check(Math.max(list.y + list.height, explore.y + explore.height), 'album map mode')).toBeGreaterThanOrEqual(3);
});
```

Before part 2 lands this fails on its count (three buttons, four expected): that is the red state. With part 2 it must pass. Worked out by hand at 360 x 640: the stage is 580 px tall and the slider covers about 165 px, so the corner ends 173 px above the stage's bottom; four 44 px buttons and one 8 px gap are 184 px, which puts the top button 223 px under the header and 163 px under the top row. The names button is the first child of `.map-zoom` (part 2 Task 6), so it has no position of its own: it is lifted with the stack by the phone rule `.map-zoom { bottom: calc(var(--slider-cover, …) + 8px); }` in `map.css`. If the test fails on position, that rule or the button's `margin-bottom: 8px` was changed; fix it there. No CSS change is needed in `phone.css` or in that rule; the 44 px targets, the Map/List pill (`--color-paper` with `--color-lamp-ink`, 16.37:1) and the bottom slider keep their rules and take the new tokens.

- [ ] **Step 6: Run the phone checks**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/phone.spec.ts --project=phone --workers=1)
```

Expected: all pass, including "tap targets are at least 44 px" and "list first, then the map strip". Then look at `frontcreck/test-results/shots/phone-album-list.png`: the strip shows gas under white stars, white cased lines, an off-white frame round the seed.

- [ ] **Step 7: Typecheck, lint, commit**

Run: `cd frontcreck && npm run typecheck && npm run lint`
Expected: both pass.

```bash
git add frontcreck/src/components/album/MapPreviewStrip.tsx frontcreck/src/components/album/MapPreviewStrip.test.ts frontcreck/e2e/phone.spec.ts
git commit -m "feat(theme): phone map strip on the nebula, drawn with or without the gas image

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Home, About and 404 over the nebula

**Files:**
- Modify: `frontcreck/src/styles/home.css` L3, L5, L11, L54
- Modify: `frontcreck/src/styles/map.css` L132-136 (about L162-166 once part 2 and Task 2 have run; the block starts with the comment `/* Home: a radial veil`)
- Modify: `frontcreck/src/styles/phone.css` L4-6
- Modify: `frontcreck/e2e/pages.spec.ts` (import at L3 or wherever `./helpers` is imported; one test appended)

**Interfaces:**
- Consumes: part 1's dimmed gas on Home, About and 404; part 2 hides the region names in the dimmed mode; `contrastOverBackdrop` from Task 2.
- Produces: no new interface. The hero (`components/home/HomeHero.tsx`), the shelf (`components/home/Shelf.tsx`) and `src/app/page.tsx` are not edited; nothing about regions is added.

- [ ] **Step 1: Write the failing test in `frontcreck/e2e/pages.spec.ts`**

Add `contrastOverBackdrop` to the names imported from `./helpers` in the existing import line. Append at the end of the file:

```ts

test('text over the nebula keeps 4.5:1 on Home, About and 404, and Home says nothing about regions', async ({ page }) => {
  const PAGES: Array<[string, string, string[]]> = [
    ['/', '.home', ['.hero h1', '.hero .lede', '.hero-row a.textbtn', '.hero-row button.textbtn', '.shelf-now .cap']],
    ['/about', '.about', ['.about h1', '.about p', '.about .about-h2', '.about .about-credits']],
    ['/nothing-here', '.notfound', ['.notfound h1', '.notfound-sub', '.notfound .textbtn']],
  ];
  for (const [url, scope, selectors] of PAGES) {
    await page.goto(url);
    await waitForMap(page);
    await waitForMapQuiet(page);
    await waitForAnimations(page);
    for (const r of await contrastOverBackdrop(page, scope, selectors)) expect(r.ratio, `${url} ${r.selector}`).toBeGreaterThanOrEqual(4.5);
  }
  await page.goto('/');
  await expect(page.locator('.home')).not.toContainText(/region/i);
});
```

(`waitForMap`, `waitForMapQuiet` and `waitForAnimations` are already imported in this file; if one is not, add it to the same import.)

- [ ] **Step 2: Run it and see it fail**

Run: `(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/pages.spec.ts --project=desktop --workers=1 -g "text over the nebula")`
Expected: FAIL on `/ .shelf-now .cap` (ash text straight on the gas, no scrim). If it passes on this machine because part 1 dims the Home gas far enough, note the printed ratios and continue: the test is then a guard.

- [ ] **Step 3: Move the veil to the cool near-black**

`frontcreck/src/styles/map.css` L132-136 today (about L162-166 by now), before:

```css
/* Home: a radial veil over the dimmed map, darkest behind the hero (mockup lines 167 to 172). Opacity only. */
.veil {
  position: absolute; inset: 0; z-index: 4; cursor: pointer;
  background: radial-gradient(50% 55% at 50% 45%, rgba(21, 17, 13, .72), rgba(21, 17, 13, .3) 70%, rgba(21, 17, 13, .15));
}
```

after:

```css
/* Home: a light even veil over the dimmed nebula; the hero has its own dark pad (home.css). Opacity only. */
.veil {
  position: absolute; inset: 0; z-index: 4; cursor: pointer;
  background: rgba(7, 6, 10, .1);
}
```

`frontcreck/src/styles/phone.css` L4-6, delete these three lines (the phone veil was darker because overlapping dots added up; the gas does not):

```css
  /* Home: the fitted cloud is denser on a phone, and overlapping WebGL dots add up where the mockup's canvas
   * fills each cluster once, so the veil is darker here and centred on the map to keep the backdrop as quiet. */
  .veil { background: radial-gradient(60% 50% at 50% 55%, rgba(21, 17, 13, .8), rgba(21, 17, 13, .52) 70%, rgba(21, 17, 13, .4)); }
```

- [ ] **Step 4: Give the hero its pad and the shelf its scrim in `frontcreck/src/styles/home.css`**

L3, before: `.home { position: absolute; inset: 0; z-index: 8; overflow-y: auto; pointer-events: none; display: flex; flex-direction: column; }` after: `.home { position: absolute; inset: 0; z-index: 8; overflow-x: hidden; overflow-y: auto; pointer-events: none; display: flex; flex-direction: column; }`

After L5 (`.hero { position: relative; … }`) insert:

```css
/* A soft dark pad behind the hero, so its text holds over the nebula (prototype pages.css line 22). Static. */
.hero::before { content: ""; position: absolute; inset: clamp(18px, 8vh, 92px) -6px -4px; z-index: -1; background: rgba(5, 4, 8, .72); border-radius: 40px; filter: blur(26px); pointer-events: none; }
```

L11, before: `.shelf { margin: auto auto 0; width: 100%; max-width: calc(1240px + 2 * var(--gut)); padding: 36px var(--gut) 28px; }` after:

```css
.shelf { position: relative; margin: auto auto 0; width: 100%; max-width: calc(1240px + 2 * var(--gut)); padding: 36px var(--gut) 28px; }
/* A full-width scrim under the shelf's caption and covers (the .home layer clips its overhang). */
.shelf::before { content: ""; position: absolute; inset: 0 -50vw; z-index: -1; pointer-events: none; background: linear-gradient(rgba(7, 6, 10, 0), rgba(7, 6, 10, .7) 30px); }
```

In the `@media (max-width: 899px)` block, after L54 (`  .hero { padding-top: 40px; }`) insert: `  .hero::before { inset: 22px 0 -4px; }`

The About and 404 scrims and the About card were changed in Task 2 Step 6.

- [ ] **Step 5: Run to pass, desktop then phone; tune only if it fails**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/pages.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/pages.spec.ts --project=phone --workers=1)
```

Expected: all pass. If the new test still fails, change exactly one number per run and rerun, in this order, and write the final values in the PR body:

1. `/ .shelf-now .cap`: the shelf scrim's `.7` goes up by `.06` (to at most `.88`).
2. `/ .hero-row …` or `/ .hero .lede`: the hero pad's `.72` goes up by `.06` (to at most `.9`).
3. `/nothing-here …`: the `.notfound, .page-msg` scrim's `.55` goes up by `.06` (to at most `.79`).
4. `/about …`: cannot fail unless Task 1's panel numbers were changed; recheck those.

Do not lower the threshold, widen the percentile or drop a selector.

- [ ] **Step 6: Compare with the approved picture**

Open `frontcreck/test-results/shots/desktop-home.png` (written by "hero, search, buttons and shelf over the dimmed map") beside `docs/design/trifid-theme/options/final-home.jpg`. The nebula must be visible round the hero and behind the header band's lower edge, the hero text must sit on a soft dark area with no visible box, and the shelf must read as covers on a dark floor. Differences in the gas itself are part 1's. The full comparison is Task 8.

- [ ] **Step 7: Commit**

```bash
git add frontcreck/src/styles/home.css frontcreck/src/styles/map.css frontcreck/src/styles/phone.css frontcreck/e2e/pages.spec.ts
git commit -m "feat(theme): Home, About and 404 over the nebula with measured text contrast

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Theme-coupled tests

**Files:**
- Modify: `frontcreck/e2e/explore.spec.ts` L52-75, L295-328
- Modify: `frontcreck/e2e/search.spec.ts` L137-145
- Modify: `frontcreck/src/components/map/MusicMap.tsx` L11 (comment; L12 after part 2 adds an import)
- Modify: `frontcreck/src/lib/types.ts` L9 (comment)
- Read only: `frontcreck/e2e/a11y.spec.ts` L82-98, `frontcreck/src/components/map/shaders/album.test.ts`

**Interfaces:**
- Consumes from part 2: the picked album's frame in `shaders/album.ts` is `FRAME_RGB` `rgb(241, 236, 228)`, 2 px wide, centred 36 px from the centre of a 64 px picked cover (`SELECTED_FRAME_GAP_PX = 4`, `SELECTED_FRAME_PX = 2`, unchanged geometry); the other covers still dim while a pick lasts (`SELECTION_DIM = 0.5`). Part 2 owns `shaders/album.test.ts`; if it pins the frame colour, it must pin `FRAME_RGB`. Nothing here edits it.
- Produces: no interface.

- [ ] **Step 1: Rewrite the helpers in `frontcreck/e2e/explore.spec.ts` L52-75**

Before (L52-75): the `meanLuma` function and `const isLamp = ([r, g, b]: number[]) => Math.abs(r - 230) < 30 && Math.abs(g - 168) < 30 && Math.abs(b - 86) < 35;`

After (replace those lines):

```ts
type Box = { x: number; y: number; w: number; h: number };

/** Mean, over `boxes` (client px), of the standard deviation of luminance inside each box of one screenshot: how
 * much picture detail the covers there show against whatever is behind them. */
async function meanLumaStd(page: Page, boxes: Box[]): Promise<number> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, rects]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      let total = 0;
      for (const r of rects) {
        const d = ctx.getImageData(Math.round(r.x * k), Math.round(r.y * k), Math.round(r.w * k), Math.round(r.h * k)).data;
        let sum = 0;
        let sq = 0;
        const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          sum += l;
          sq += l * l;
        }
        total += Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
      }
      return total / rects.length;
    },
    [png, boxes] as const,
  );
}

/** 20 px boxes at the centres of up to 12 covers on the canvas, clear of the picked album's enlarged cover and
 * frame and of every overlay (the card, the slider, the zoom buttons). */
async function otherCoverBoxes(page: Page, picked: number): Promise<Box[]> {
  return page.evaluate(async (pickedId) => {
    const api = window.__rmr!.map!;
    const n: number = (await (await fetch('/data/albums.json')).json()).length;
    const c = api.screenPoint(pickedId)!;
    const out: { x: number; y: number; w: number; h: number }[] = [];
    for (let id = 0; id < n && out.length < 12; id++) {
      if (id === pickedId) continue;
      const p = api.screenPoint(id);
      if (!p || (Math.abs(p.x - c.x) < 70 && Math.abs(p.y - c.y) < 70)) continue;
      const onCanvas = [[-10, -10], [10, -10], [-10, 10], [10, 10]].every(([dx, dy]) => document.elementFromPoint(p.x + dx, p.y + dy)?.classList.contains('map-canvas'));
      if (onCanvas) out.push({ x: p.x - 10, y: p.y - 10, w: 20, h: 20 });
    }
    return out;
  }, picked);
}

/** The picked album's off-white frame (FRAME_RGB, rgb(241, 236, 228)). */
const isFrame = ([r, g, b]: number[]) => Math.abs(r - 241) < 16 && Math.abs(g - 236) < 16 && Math.abs(b - 228) < 18;
```

- [ ] **Step 2: Rewrite the test at `frontcreck/e2e/explore.spec.ts` L295-328**

Before: the test `'in cover mode the picked album is drawn large on top, framed in lamp, with the other covers dimmed'` (L295-328, ending with `expect(dimmed - PANE_LUMA).toBeLessThan((plain - PANE_LUMA) * 0.7);`).

After:

```ts
test('in cover mode the picked album is drawn large on top, framed in off-white, with the other covers dimmed', async ({ page, isMobile }, info) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await pickKnown(page, isMobile, IN_RAINBOWS);
  await shot(page, info, 'explore-selected-cover');
  const p = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), IN_RAINBOWS))!;
  // Covers are 32 px here, so the picked one is 64 px with a 2 px off-white frame 4 px outside it (centre 36 px out).
  const framePoints = [
    { x: p.x + 36, y: p.y },
    { x: p.x - 36, y: p.y },
    { x: p.x, y: p.y - 36 },
    { x: p.x + 20, y: p.y - 36 },
  ];
  expect((await pixels(page, framePoints)).map(isFrame)).toEqual([true, true, true, true]);
  await expect(page.locator('.map-sel')).toHaveCSS('opacity', '0');
  // The hit area matches the drawn size: a click well outside a plain cover, near its corner, still lands on it.
  if (isMobile) await page.touchscreen.tap(p.x + 24, p.y + 24);
  else await page.mouse.click(p.x + 24, p.y + 24);
  await waitForCameraIdle(page);
  expect(await page.evaluate(() => window.__rmr!.getState().selected)).toBe(IN_RAINBOWS);
  await expect(page.locator('.card')).toBeVisible();
  // The other covers are dimmed while the pick lasts. With gas behind them their brightness can go either way, so
  // compare the picture detail inside the same covers, with the pick and without it (the camera does not move):
  // a cover faded to half shows half the detail whatever is behind it.
  if (!isMobile) await page.mouse.move(2, 2); // off the map: no hover label or hover ring over the sampled covers
  await waitForCameraIdle(page);
  const boxes = await otherCoverBoxes(page, IN_RAINBOWS);
  expect(boxes.length, 'covers to compare').toBeGreaterThanOrEqual(4);
  const dimmed = await meanLumaStd(page, boxes);
  await page.keyboard.press('Escape');
  await expect(page.locator('.card')).toHaveCount(0);
  await waitForCameraIdle(page);
  const plain = await meanLumaStd(page, boxes);
  expect(plain, 'the undimmed covers show detail').toBeGreaterThan(6);
  expect(dimmed).toBeLessThan(plain * 0.7);
  // With the pick gone the frame is gone: the same four points are no longer all frame-coloured, so the frame
  // check above was not satisfied by pale gas.
  expect((await pixels(page, framePoints)).every(isFrame)).toBe(false);
});
```

What it still proves: the picked cover is drawn 64 px with a frame of the theme's frame colour at the exact offsets (and the last line shows those pixels are the frame, not the backdrop); the hit area matches the drawn size; the other covers lose at least 30 percent of their contrast while the pick lasts. The old version subtracted a constant pane luminance (`PANE_LUMA = 19`), which is false once gas is behind the covers. The new measure fails if the dimming is removed (ratio 1) and does not depend on the gas's brightness. It is the same 0.7 threshold.

- [ ] **Step 3: Update `frontcreck/e2e/search.spec.ts` L137-145**

L137, before: `  test('the focused field shows a lamp border with a softer halo, without moving', async ({ page }) => {` after: `  test('the focused field shows an off-white border with a softer halo, without moving', async ({ page }) => {`

L143, before: `    await expect(field).toHaveCSS('border-top-color', 'rgb(230, 168, 86)');` after: `    await expect(field).toHaveCSS('border-top-color', 'rgb(241, 236, 228)');`

L145, before: `    await expect(field).toHaveCSS('box-shadow', /^(color\(srgb 0\.90\d* 0\.65\d* 0\.33\d* \/ 0\.45\)|rgba\(230, 168, 86, 0\.45\)) 0px 0px 0px 1px$/);` after: `    await expect(field).toHaveCSS('box-shadow', /^(color\(srgb 0\.94\d* 0\.92\d* 0\.89\d* \/ 0\.45\)|rgba\(241, 236, 228, 0\.45\)) 0px 0px 0px 1px$/);`

It still proves the focus ring is the lamp token at full strength on the border and at 45 percent as a 1 px halo, and that the field does not move.

- [ ] **Step 4: `frontcreck/e2e/a11y.spec.ts` L82-98 needs no edit**

It opens Making Movies (the weakest accent), turns a marker hot and checks the badge's own two computed colours with `contrastRatio`. Part 2's plan makes the hot badge `--color-room` digits on `--color-lamp` (about 17:1); if it stayed on the accent it would be 4.84:1 with the new room (4.50 with the old). Either way the assertion holds, and it still proves the badge a user sees is readable. Leave the test and its comment as they are. The rest of the file passes unchanged, but axe now reports text on glass as "incomplete" rather than judging it; `contrastOverBackdrop` (Tasks 2 and 4) is what proves contrast there.

- [ ] **Step 5: Two comments**

`frontcreck/src/components/map/MusicMap.tsx` L11 (L12 after part 2), before: `/** Amber ring around the album selected in Explore; positioned by OverlayDriver. */` after: `/** Off-white ring (the lamp token) around the album selected in Explore; positioned by OverlayDriver. */` (If part 2 already rewrote this line, skip it.)

`frontcreck/src/lib/types.ts` L9, before: `/** [wash, wash, accent] as #rrggbb. The accent passes 4.5:1 on #15110d. */` after: `/** [wash, wash, accent] as #rrggbb. The pipeline checks the accent at 4.5:1 on #15110d; on the Trifid room #07060a it is 4.84:1 or better. */`

Then search for leftovers: `grep -rn -i "amber" frontcreck/src frontcreck/e2e` must print nothing. `lamp` stays where it names the token (`--color-lamp`, `.btn-lamp`); in `shaders/album.ts` the words belong to part 2.

- [ ] **Step 6: Run the changed specs, one at a time**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/explore.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/explore.spec.ts --project=phone --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/search.spec.ts --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test e2e/a11y.spec.ts --project=desktop --workers=1)
```

Expected: all pass. If the last line of the cover test fails (the four points are frame-coloured even without a pick), In Rainbows sits on pale gas: use another known album for this one test (add a constant beside `IN_RAINBOWS` with its index and a comment), do not delete the line. If `expect(dimmed).toBeLessThan(plain * 0.7)` fails, the dimming is broken or part 2 changed `SELECTION_DIM`: report it, do not raise 0.7.

- [ ] **Step 7: The whole suite once, per project**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run test)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test --project=desktop --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test --project=phone --workers=1)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npx playwright test --project=nowebgl --workers=1)
```

Expected: all pass. Run them at night if the laptop is busy; never two at once.

- [ ] **Step 8: Commit**

```bash
git add frontcreck/e2e/explore.spec.ts frontcreck/e2e/search.spec.ts frontcreck/src/components/map/MusicMap.tsx frontcreck/src/lib/types.ts
git commit -m "test(theme): frame colour and cover dimming checks that hold with gas behind the covers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 (optional, needs the owner's call first): Favicon without the amber dot

Do not start this task until the owner has said yes to the proposed colours. Show him the three SVGs rendered at 16, 32 and 180 px first.

**Files:**
- Modify: `frontcreck/src/app/icon.svg` L1-5
- Modify: `frontcreck/scripts/icons/icon-16.svg`
- Modify: `frontcreck/scripts/icons/apple-icon.svg`
- Create: `frontcreck/scripts/icons/build.mjs`
- Regenerate (binary): `frontcreck/src/app/favicon.ico` (three PNG entries: 16, 32, 48), `frontcreck/src/app/apple-icon.png` (180 px)

**Interfaces:**
- Consumes: Task 1's token values. Produces: nothing other parts use.

- [ ] **Step 1: Change the colours in the three SVGs (shapes unchanged)**

In all three files replace: `#15110d` with `#07060a`; `#322a21` with `#24222c`; `#b3a792` and `#cdc2ad` (the lines) with `#aaa49d`; `#c4886f` and `#97a077` (the two small dots) with `#c4beb6`; `#e6a856` (the large dot) with `#f1ece4`. The mark becomes three stars joined by lines on the sky colour.

- [ ] **Step 2: Create `frontcreck/scripts/icons/build.mjs`** (no script for the binaries exists in the repository)

```js
#!/usr/bin/env node
/** Renders the icon SVGs to src/app/favicon.ico (16, 32 and 48 px PNG entries) and src/app/apple-icon.png (180 px).
 * One headless Chromium, one page. Run: node scripts/icons/build.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '../..');
const svg = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

async function render(page, markup, px, opaque) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<style>html,body{margin:0;background:${opaque ? '#07060a' : 'transparent'}}svg{display:block;width:${px}px;height:${px}px}</style>${markup}`);
  return page.screenshot({ omitBackground: !opaque, clip: { x: 0, y: 0, width: px, height: px } });
}

/** An .ico whose entries are PNG files, the format of the icon this replaces. */
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ px, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(px, e);
    head.writeUInt8(px, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...entries.map((x) => x.data)]);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const entries = [
    { px: 16, data: await render(page, svg('scripts/icons/icon-16.svg'), 16, false) },
    { px: 32, data: await render(page, svg('src/app/icon.svg'), 32, false) },
    { px: 48, data: await render(page, svg('src/app/icon.svg'), 48, false) },
  ];
  fs.writeFileSync(path.join(ROOT, 'src/app/favicon.ico'), ico(entries));
  fs.writeFileSync(path.join(ROOT, 'src/app/apple-icon.png'), await render(page, svg('scripts/icons/apple-icon.svg'), 180, true));
  console.log('wrote src/app/favicon.ico and src/app/apple-icon.png');
} finally {
  await browser.close();
}
```

- [ ] **Step 3: Build the binaries and check them**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && node scripts/icons/build.mjs && file src/app/favicon.ico src/app/apple-icon.png)
```

Expected: `favicon.ico: MS Windows icon resource - 3 icons, 16x16 with PNG image data … 32 bits/pixel` and `apple-icon.png: PNG image data, 180 x 180`. Then `cd frontcreck && nice -n 10 npm run build` must succeed (an earlier `favicon.ico` was rejected by `next build` for not being RGBA; see `docs/superpowers/plans/2026-09-29-recmyrecord-redesign-pr-notes.md` L232).

- [ ] **Step 4: Commit**

```bash
git add frontcreck/src/app/icon.svg frontcreck/src/app/favicon.ico frontcreck/src/app/apple-icon.png frontcreck/scripts/icons
git commit -m "feat(theme): favicon in the Trifid colours, with the script that builds its binaries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Budgets and the cost of the blur

**Files:**
- Modify: `frontcreck/scripts/perf/lib.mjs` (append one function)
- Modify: `frontcreck/scripts/perf/lib.test.mjs` (import at L2, one `describe` appended)
- Modify: `frontcreck/scripts/perf/perf.mjs` L10, after L28, after L178, after L241
- Unchanged: `frontcreck/scripts/perf/budgets.json`

**Interfaces:**
- Consumes: the four custom properties of Task 1 (`--glass-blur`, `--color-float`, `--panel-bg`, `--top-bg`), whose first value in `globals.css` is the glass one and whose last is the solid one.
- Produces: `glassVars(css: string, want: 'on' | 'off'): Record<string, string>` in `lib.mjs`; `npm run perf -- --glass on|off`, which forces glass or solid panels at any width by setting the four properties inline on `<html>`.

- [ ] **Step 1: Write the failing test in `frontcreck/scripts/perf/lib.test.mjs`**

L2, before: `import { checkBudgets, checkPages, formatTable } from './lib.mjs';` after: `import { checkBudgets, checkPages, formatTable, glassVars } from './lib.mjs';`

Append at the end of the file:

```js

describe('glassVars', () => {
  const css = `:root { --panel-bg: rgba(8, 7, 11, 0.7); --top-bg: rgba(7, 6, 10, 0.58); --glass-blur: blur(22px) saturate(1.2) brightness(0.58); }
@theme { --color-float: rgba(10, 9, 14, 0.66); }
@media (max-width: 899px) { :root { --glass-blur: none; --color-float: rgba(10, 9, 14, 0.92); --panel-bg: rgba(10, 9, 14, 0.92); --top-bg: rgba(10, 9, 14, 0.92); } }`;

  it('gives the first value of each property for glass and the last for solid', () => {
    expect(glassVars(css, 'on')).toEqual({
      '--glass-blur': 'blur(22px) saturate(1.2) brightness(0.58)',
      '--color-float': 'rgba(10, 9, 14, 0.66)',
      '--panel-bg': 'rgba(8, 7, 11, 0.7)',
      '--top-bg': 'rgba(7, 6, 10, 0.58)',
    });
    expect(glassVars(css, 'off')).toEqual({
      '--glass-blur': 'none',
      '--color-float': 'rgba(10, 9, 14, 0.92)',
      '--panel-bg': 'rgba(10, 9, 14, 0.92)',
      '--top-bg': 'rgba(10, 9, 14, 0.92)',
    });
  });

  it('rejects anything but on and off, and a stylesheet without both values', () => {
    expect(() => glassVars(css, 'maybe')).toThrow('--glass takes on or off');
    expect(() => glassVars(':root { --glass-blur: none; }', 'on')).toThrow('--glass-blur');
  });
});
```

Run: `cd frontcreck && npm run test -- scripts/perf/lib.test.mjs`
Expected: FAIL, `glassVars is not a function`.

- [ ] **Step 2: Add `glassVars` to `frontcreck/scripts/perf/lib.mjs`**

Append at the end of the file:

```js

const GLASS_PROPS = ['--glass-blur', '--color-float', '--panel-bg', '--top-bg'];

/** The four custom properties that make the panels glass ('on') or solid ('off'), read from globals.css: the first
 * value of each is the glass one, the last is the solid fallback. perf.mjs sets them inline to force either. */
export function glassVars(css, want) {
  if (want !== 'on' && want !== 'off') throw new Error(`--glass takes on or off, not ${want}`);
  return Object.fromEntries(
    GLASS_PROPS.map((name) => {
      const all = [...css.matchAll(new RegExp(`${name}:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim());
      if (all.length < 2) throw new Error(`${name}: expected a glass and a solid value in globals.css`);
      return [name, want === 'on' ? all[0] : all[all.length - 1]];
    }),
  );
}
```

Run: `cd frontcreck && npm run test -- scripts/perf/lib.test.mjs`
Expected: PASS.

- [ ] **Step 3: Wire `--glass` into `frontcreck/scripts/perf/perf.mjs`**

L10, before: `import { checkBudgets, checkPages, formatTable } from './lib.mjs';` after: `import { checkBudgets, checkPages, formatTable, glassVars } from './lib.mjs';`

After L28 (the end of `VIEWPORTS`) insert:

```js
/** `--glass on|off` forces glass or solid panels at any width (inline on <html>), for an A/B of the blur's cost. */
const GLASS = opt('--glass') ? glassVars(fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), opt('--glass')) : null;
const forceGlass = (page) =>
  GLASS
    ? page.evaluate((vars) => {
        for (const [name, value] of Object.entries(vars)) document.documentElement.style.setProperty(name, value);
      }, GLASS)
    : null;
```

In `exploreFlow`, after L178 (`await page.goto(`${BASE}/map`, { waitUntil: 'load' });`) insert: `  await forceGlass(page);`

In `measure`, after L241 (`await page.goto(`${BASE}/`, { waitUntil: 'load' });`) insert: `  await forceGlass(page);`

(The album flow reaches the album by an in-page navigation from `/`, so the inline properties set after the first `goto` stay; `AlbumPanel.tsx` sets `--acc` on the same element the same way.)

- [ ] **Step 4: Commit the tool**

```bash
git add frontcreck/scripts/perf/lib.mjs frontcreck/scripts/perf/lib.test.mjs frontcreck/scripts/perf/perf.mjs
git commit -m "chore(perf): --glass on|off forces glass or solid panels to measure the blur's cost

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Check the machine, then measure the budgets, one run at a time**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
node -p process.arch   # must print arm64; an x64 Node under Rosetta inflates every timing about 50x
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run perf -- --build --mode software --viewport desktop)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run perf -- --mode software --viewport phone)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run perf -- --mode gpu --viewport desktop)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run perf -- --mode gpu --viewport phone)
```

Each run prints one table and writes `frontcreck/scripts/perf/out/perf-<time>.json`. Every run must end with `All budgets met.` The numbers and their limits (`budgets.json`, unchanged):

| Printed row (JSON key) | Limit | Checked in |
|---|---|---|
| First-load JS of / (`js.kb`) | 200 KB | every run |
| Server HTML per page | 150 KB | every run |
| Search usable (`searchUsableMs`) | 1000 ms | every run |
| Startup worst long task (`startupLongTaskMs`) | 250 ms | every run |
| Typing to suggestions (`typeToSuggestionsMs`) | 100 ms | every run |
| Select to album (`selectToAlbumMs`) | 200 ms | every run |
| Slider to list (`sliderToListMs`) | 150 ms | every run |
| Long tasks while idle (`idleLongTasks`) | 0 | every run |
| Frames rendered while idle, 3 s (`idleFrames`) | 1 | every run |
| Transition, morph, drag, zoom worst frame gap (`transitionGapMs`, `morphGapMs`, `dragGapMs`, `zoomGapMs`) | 50 ms | GPU runs only; printed but not judged in software runs |

`idleFrames` over 1 means something animates at rest. First-load JS must not have grown by more than the theme loader. If a budget fails, stop and find the cause with the superpowers:systematic-debugging skill; do not change `budgets.json`.

- [ ] **Step 6: A/B the blur during pan and zoom**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run perf -- --mode gpu --viewport desktop --glass on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run perf -- --mode gpu --viewport desktop --glass off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run perf -- --mode gpu --viewport phone --glass on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run perf -- --mode gpu --viewport phone --glass off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run perf -- --mode software --viewport desktop --glass on)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run perf -- --mode software --viewport desktop --glass off)
```

Compare, on against off, in each pair: `dragGapMs` and `zoomGapMs` (the map moves under the slider panel and the zoom buttons), `transitionGapMs` (the album panel, the largest glass surface, slides in over the map), `morphGapMs`, and `idleFrames` (must be equal: glass must not cause a redraw). Write the six rows as a table in the PR body. Reading the result:

- GPU desktop, glass on, every gap at or under 50 ms: desktop glass ships.
- GPU desktop, glass on, a gap over 50 ms while glass off is under: the blur is the cause. Lower `blur(22px)` to `blur(14px)` in `--glass-blur` (and in the regex of `contrast.test.ts` and the constant in `glass.spec.ts`), rerun the pair, and report both results to the owner. The contrast numbers do not depend on the blur radius.
- GPU phone (emulated 390 x 844 at 2x), glass on: this is only a hint of what a phone will do. It never turns phone glass on by itself; the real phone trial in Task 8 decides.
- Software pairs are for information: software gaps are not budgeted, and SwiftShader exaggerates the blur.

---

### Task 8: Visual comparison, UI/UX review panel, and the real-phone trial

**Files:**
- Modify: `frontcreck/scripts/review-shots.mjs` L14-18 (`SIZES`), L22-94 (`STATES`)
- Create: `docs/design/trifid-theme/reviews/app-fidelity-part3.md`, `app-craft.md`, `app-first-visit.md`, `app-phone.md`, `app-accessibility.md`, `app-states.md` (the reviewers' notes)
- Output only (git-ignored): `frontcreck/test-results/review/*.png`

**Interfaces:**
- Consumes: the finished app (parts 1 to 3). Produces: the review notes under `docs/design/trifid-theme/reviews/app-*.md`, and five screenshots to set beside `docs/design/trifid-theme/options/final-overview.jpg`, `final-whole.jpg`, `final-album.jpg`, `final-home.jpg`, `final-phone-map.jpg`.

- [ ] **Step 1: Add the reference size and states to `frontcreck/scripts/review-shots.mjs`**

In `SIZES` (L14-18), after the `d1280` line insert (the approved pictures are 1600 x 1000):

```js
  d1600: { viewport: { width: 1600, height: 1000 } },
```

In `STATES`, after the `'c3-explore-zoomed'` entry (ends at L60) insert:

```js
  // The whole map, zoomed out to the floor (docs/design/trifid-theme/options/final-whole.jpg).
  'c4-explore-whole': async (p) => {
    await p.goto(`${BASE}/map`);
    await mapReady(p);
    await p.evaluate(() => window.__rmr.map.zoomBy(1 / 1.6));
  },
```

After the `'d5-album-longtitle'` entry (L69) insert (it waits for the map, so the gas is in the picture):

```js
  // The album of the approved pictures (final-album.jpg, final-phone-map.jpg).
  'd6-album-reference': async (p) => {
    await p.goto(`${BASE}/album/the-stone-roses-the-stone-roses`);
    await mapReady(p);
  },
```

The Home shot is compared with `final-home.jpg`, so it must wait for the gas too. Replace the first entry of `STATES` (L23):

```js
  'a1-home': async (p) => p.goto(`${BASE}/`),
```

with:

```js
  'a1-home': async (p) => {
    await p.goto(`${BASE}/`);
    await mapReady(p);
  },
```

After the new `'c4-explore-whole'` entry insert three states for the review panel of Step 4 (names off, the slider half way, keyboard focus on the names button):

```js
  'c5-explore-names-off': async (p) => {
    await p.addInitScript(() => window.localStorage.setItem('rmr-names', '0'));
    await p.goto(`${BASE}/map`);
    await mapReady(p);
  },
  // A still from the middle of the Balanced to Mood move (the morph takes 520 ms).
  'c6-explore-slider-mid': async (p) => {
    await p.goto(`${BASE}/map`);
    await mapReady(p);
    await p.evaluate(() => window.__rmr.getState().setStop('mood'));
    await p.waitForTimeout(220);
    return 'now';
  },
  'c7-explore-names-focus': async (p, size) => {
    if (size === 'm390') return false;
    await p.goto(`${BASE}/map`);
    await mapReady(p);
    await p.keyboard.press('Tab');
    await p.locator('.map-names').focus();
  },
```

After the `'h1-album-mapmode'` entry (ends at L93) insert:

```js
  'h2-reference-mapmode': async (p, size) => {
    if (size !== 'm390') return false;
    await p.goto(`${BASE}/album/the-stone-roses-the-stone-roses`);
    await mapReady(p);
    await p.locator('.fab-map').tap();
  },
```

Commit:

```bash
git add frontcreck/scripts/review-shots.mjs
git commit -m "chore(shots): the states of the approved Trifid pictures at their size, and three for the review panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Take the five screenshots, one command at a time**

The script starts one Chrome and shoots one state per command (the argument is a substring filter). It needs the build from Task 7.

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c1-explore)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c4-explore-whole)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-d6-album-reference)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-a1-home)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- m390-h2-reference-mapmode)
```

Expected: each prints `wrote test-results/review/<name>.png`. `docs/design/trifid-theme/prototype/tools/shot.sh` is only needed to re-render a prototype picture; do not run it at the same time as `npm run shots`.

- [ ] **Step 3: Fidelity check of this part (one reviewer subagent, no browser)**

Dispatch one fresh subagent (it must not have worked on parts 1 to 3) with only this brief and the ten file paths. It opens the images one at a time with the Read tool and starts no browser:

> Compare each app screenshot with the approved picture beside it. Pairs: `frontcreck/test-results/review/d1600-c1-explore.png` and `docs/design/trifid-theme/options/final-overview.jpg`; `d1600-c4-explore-whole.png` and `final-whole.jpg`; `d1600-d6-album-reference.png` and `final-album.jpg`; `d1600-a1-home.png` and `final-home.jpg`; `m390-h2-reference-mapmode.png` and `final-phone-map.jpg`. For each pair list every visible difference in: the gas (colours, swirl, brightness, where it is dim), the stars, the region names (face, size, spacing, which are shown), the lines and frames, each panel (how see-through, how dark, its border), the type and the layout. Mark each difference as "worse than approved", "equal" or "an intended difference" using this list of intended differences, and nothing else: (1) no PROTOTYPE tab; (2) on the phone the panels are near-solid, not see-through, and the slider keeps the site's track with three stops instead of the prototype's three buttons; (3) the header has no nebula behind it, because in the app the map starts below the header; (4) a fine static grain lies over everything; (5) the Home search field is slightly darker; (6) the map hint line sits on a soft dark band at the bottom left. Then check by eye that every label and line of text is readable where it sits, and say where it is not. Do not judge code. Report as a list per pair, worst first.

Fix every "worse than approved" item that belongs to this part (panels, header, hint, Home, About, strip) with a new commit and reshoot that one state; pass the gas, star and name items to parts 1 and 2. Save the reviewer's final list as `docs/design/trifid-theme/reviews/app-fidelity-part3.md`.

- [ ] **Step 4: UI/UX review panel (five reviewers, one lens each) before the owner sees anything**

This stage replaces a single independent reviewer. It runs once the whole theme is assembled (parts 1 to 3 on the branch, Step 3's fixes in).

First take the panel's screenshots, one command at a time, never two browsers at once (each command shoots one state; the argument is a substring filter):

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c2-explore-card)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c3-explore-zoomed)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c5-explore-names-off)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c6-explore-slider-mid)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-c7-explore-names-focus)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- d1600-f1-about)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- m390-a1-home)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- m390-c1-explore)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- m390-c2-explore-card)
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && nice -n 10 npm run shots -- m390-d6-album-reference)
```

Together with the five of Step 2 that is fifteen pictures in `frontcreck/test-results/review/`. The Playwright runs of Task 5 Step 7 also left `frontcreck/test-results/shots/desktop-focus.png` (an open album with a hot marker's lines), `desktop-explore-hover.png` (the hover mark and label), `desktop-explore-selected-cover.png` (a picked cover) and `phone-album-list.png` (the list with the strip).

Then dispatch five separate reviewer subagents, one lens each. Each is fresh (it has not worked on parts 1 to 3), gets its own lens brief, the list of screenshot paths, the approved pictures under `docs/design/trifid-theme/options/` (`final-overview.jpg`, `final-whole.jpg`, `final-album.jpg`, `final-home.jpg`, `final-phone-map.jpg`, `final-phone-list.jpg`, `toggle-b-on.jpg`, `toggle-b-off.jpg`), the section "Current state: decisions made on 2026-10-04" of `docs/design/trifid-theme/HANDOFF.md`, and read access to `frontcreck/src`. No reviewer sees another's findings or the fidelity notes. Each opens images one at a time with the Read tool, starts no browser, build or test run, and writes its findings, worst first, each with the picture or the file and line it rests on, to its own file:

1. **Visual craft** (`docs/design/trifid-theme/reviews/app-craft.md`): spacing, alignment, type, the edges and borders of the glass, how the region names sit on the gas (size, tracking, halo), how stars, lines, frames and badges are drawn, each against the `final-*.jpg` references.
2. **First visit** (`app-first-visit.md`): does the map read as "just a vibe" with nothing to decode? Is any explanatory UI creeping in: a legend, a hover or click on a name, a card, menu, pointer or search row for a region, anything about regions or colours on Home or About, any wording that explains the map beyond the site's existing hint line?
3. **Phone** (`app-phone.md`): tap targets of 44 px, the strip in the album list, the slider and the names button corner (nothing overlapping, nothing under the slider or the top row), the panels as glass or as their solid fallback, text sizes, what a thumb can reach.
4. **Accessibility** (`app-accessibility.md`): contrast of every text on glass over the brightest gas and of text straight on the map (the hint, the names), keyboard paths to every control including the names button, focus visibility on glass and on the map, reduced transparency and reduced motion (from the code and the tests: `globals.css`, `shell.css`, `e2e/glass.spec.ts`, `src/lib/contrast.test.ts`), the labels of the names button, what is hidden from assistive technology.
5. **Interaction states** (`app-states.md`): hover, keyboard focus, an open album, the slider half way, zoomed in, a picked album, names off. Is each state clear, is anything left over from another state, does anything read as broken?

Fix every finding that is a defect (a new commit per fix, in the part that owns the code), reshoot the states it touches one at a time, and send each fixed finding back to the reviewer who raised it for a second look; that reviewer appends "resolved" or what is still wrong to its file. A finding that is a design choice for the owner (for example anything in the list of intended differences of Step 3) is not fixed: it is written into the pull request's "Decisions waiting for the owner". Repeat until one round comes back clean: no open defect from any of the five. Only then does the owner see the work. Commit the six review files (`docs(design): Trifid app review notes`, with the trailer).

What this panel cannot do: the reviewers see stills and code. They cannot judge motion in flight (pan, zoom, the slider morph, the panel sliding in, the name fades) and they cannot judge a real phone (touch, heat, the blur's cost, Safari). That is why the owner's own preview checklist in Step 6 stays, whatever the panel says.

- [ ] **Step 5: Ask the owner for a preview deployment (needs his go-ahead)**

Deploying needs the owner's permission. After the pull request of Task 9 is open, check whether Vercel has already attached a preview to it: `gh pr checks` and `gh pr view --json comments -q '.comments[].body' | grep -i vercel`. Either way, ask him before using or creating one, with this message:

> The Trifid theme is ready to try on your phone. I would like a Vercel preview deployment of the branch (a preview URL, not production). Phones get the near-solid panels by default. If you want to try glass on your phone as well, I can make a second preview from a throwaway branch in which the one phone line in `globals.css` is removed. Go ahead with one, both or neither?

Only after a yes: if no preview exists, run `cd frontcreck && npx vercel deploy` (never `--prod`). For the glass trial: `git switch -c trial/trifid-phone-glass`, delete the line `@media (max-width: 899px) { :root { --glass-blur: none; … } }` from `frontcreck/src/app/globals.css`, commit, `git push -u origin trial/trifid-phone-glass`, take its preview URL, then `git switch feat/trifid-theme`. The trial branch is never merged.

- [ ] **Step 6: The owner's phone checklist**

Send him the preview URL or URLs with this list (he answers each with fine, or what he saw):

1. Open the map. Drag it around with one finger for ten seconds. Smooth, or does it stutter?
2. Pinch in until covers show, then pinch out to the whole map.
3. Drag the similarity slider from Sonic to Mood and back. Does the map follow without hanging?
4. Tap an album, then "See closest albums". Does the list open at once, and can you read every line of it?
5. In the album, tap Map, then List, then Map again.
6. Tap the names button in the zoom stack: names off, names on.
7. Read the slider panel, the Explore button and the List button over the brightest part of the map. Easy to read?
8. On the glass preview only: repeat 1 to 3. Is it as smooth as the solid one? Does the phone get warm?

Solid stays the default until he confirms glass on his phone. If he does, the change is deleting that one line on `feat/trifid-theme`, rerunning `e2e/glass.spec.ts --project=phone` with its phone expectations switched to the glass values, and `e2e/phone.spec.ts`. That is a separate commit with his approval named in the message.

---

### Task 9: Docs and the pull request

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-recmyrecord-redesign-design.md` after L128 and after L133
- Modify: `frontcreck/README.md` (new section after "How it works")
- No file: the pull request

**Interfaces:**
- Consumes: the results of Tasks 2, 4, 7 and 8 (final numbers, perf tables, open review items). Produces: a draft pull request based on `claude/wizardly-jennings-23d72e` (draft PR 32's branch), not on `main`.

- [ ] **Step 1: Record the override in the design spec**

`docs/superpowers/specs/2026-09-29-recmyrecord-redesign-design.md`: after the token table's last row (L128, `| \`--color-ochre\` | \`#c8a560\` | Map dots |`) insert a blank line and:

```markdown
Note, 2026-10-04: the table above is the original warm theme and is kept as the record of it. The Trifid theme keeps these token names and changes their values; the current values are in `frontcreck/src/app/globals.css`.
```

Directly after the line `- Never: pure black, blue-black, purple, neon, glassmorphism, starfields.` (L133) insert:

```markdown
- Exception, 2026-10-04: for the Trifid theme the owner knowingly set aside three items of the line above (blue-black, glassmorphism and starfields). The decisions and the reasons are in `docs/design/trifid-theme/HANDOFF.md`, section "Current state: decisions made on 2026-10-04".
```

Nothing else in the spec is rewritten.

- [ ] **Step 2: Add the theme section to `frontcreck/README.md`**

The README does not describe colours today (checked: no mention of amber, lamp or warm). After the "How it works" section's last paragraph (the one ending "is in `src/lib/copy.ts`.") and before "## Deployment" insert:

```markdown
## Theme

The look is the Trifid nebula theme; the decisions behind it are in [`../docs/design/trifid-theme/HANDOFF.md`](../docs/design/trifid-theme/HANDOFF.md). The colour tokens are in `src/app/globals.css`. Panels over the map are see-through glass on wide screens. On phones, in browsers without `backdrop-filter`, and when the system asks for reduced transparency, they are near-solid instead: three one-line rules next to the tokens do this, and removing the phone rule turns glass on for phones. `npm run perf -- --glass on` and `--glass off` force either state, to measure what the blur costs. `src/lib/contrast.test.ts` checks that every text colour keeps 4.5:1 on glass over a white backdrop and on the solid fallback.
```

- [ ] **Step 3: Commit the docs**

```bash
git add docs/superpowers/specs/2026-09-29-recmyrecord-redesign-design.md frontcreck/README.md
git commit -m "docs: record the Trifid override of three visual rules; README section on the theme and its glass switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Last checks before opening**

```bash
(export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; cd frontcreck && npm run typecheck && npm run lint && npm run test)
git status --short   # must be empty
git diff --stat claude/wizardly-jennings-23d72e...HEAD -- data-pipeline/rmr_pipeline/validate.py data-pipeline/rmr_pipeline/constants.py data-pipeline/rmr_pipeline/build.py frontcreck/public/data/albums.json frontcreck/scripts/perf/budgets.json   # must print nothing
```

- [ ] **Step 5: Push and open the draft pull request, stacked on PR 32's branch**

Pushing and opening need no permission; merging and deploying do. Fill the angle-bracket parts of the body from the task results before running.

```bash
git push -u origin feat/trifid-theme
gh pr create --draft --base claude/wizardly-jennings-23d72e --head feat/trifid-theme \
  --title "Trifid theme in the app: nebula map, glass panels, phone fallback" \
  --body "$(cat <<'EOF'
Brings the Trifid prototype (PR 32) into `frontcreck/`. Stacked on PR 32's branch; draft until the owner approves. Plans: `docs/superpowers/plans/2026-10-04-trifid-theme-1-*.md`, `-2-*.md`, `-3-chrome-tests.md`.

## What changed
- Map: baked gas behind the stars, star-white dots, off-white frames and cased lines, region names with a toggle (parts 1 and 2).
- Chrome: the token names are kept and their values moved to the cool near-black glass set. Panels over the map are glass on wide screens and near-solid on phones, without `backdrop-filter`, and under reduced transparency.
- Home, About and 404 sit over the dimmed nebula. Nothing about regions on Home.
- No site wording was added or changed by the chrome work.

## Contrast (worst case, computed and tested)
<paste the worst-case table of the part 3 plan, with any number that Task 2 or Task 4 had to raise>

## Performance
<paste the four budget tables of Task 7 Step 5 and the glass on/off table of Step 6>

## Decisions waiting for the owner
- Glass on phones: off by default. Preview and checklist are in the part 3 plan, Task 8.
- The header has no nebula behind it in the app (the map starts below the header); the approved picture shows it through the header.
- The phone slider keeps the site's track; the approved phone picture shows three buttons.
- Favicon colours (optional Task 6).
- <any open item from the fidelity checks and the five-lens review panel (`docs/design/trifid-theme/reviews/app-*.md`)>

## Not verified
- A real phone and Safari. The Safari prefix and the no-support fallback are checked in the built CSS only.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: the command prints the new pull request's URL; `gh pr view --json baseRefName,isDraft` shows `"baseRefName":"claude/wizardly-jennings-23d72e","isDraft":true`.

---

## Site strings added or changed by this part

None. No entry of `frontcreck/src/lib/copy.ts` is added, removed or reworded, and no component gains text. The names toggle's label belongs to part 2 and needs the owner's approval there. Changed wording that is not site copy: two test titles ("framed in off-white", "an off-white border"), code comments, one README section, two lines in the design spec, the pull request body.

## Self-review

**Spec coverage (the brief's sections):**

| Section | Where |
|---|---|
| A. Glass tokens, every theme-sensitive literal, `themeColor`, `TILE`, `AmbientWash`, grain, veils, scrims, `.btn-lamp` hover, slider halo, search focus, icons, literal table, `--acc` stays in the panel | Token table and literal table above; Task 1 (tokens, `themeColor`), Task 2 (surfaces, grain, halo, hover, scrims, wash kept inside the panel), Task 4 (veils), Task 6 (icons, optional) |
| B. Fallback on phone width, no support, reduced transparency; one-line phone switch; 4.5:1 worst case for paper, dust, ash, lamp and the weakest accent; `contrast.test.ts` | Task 1 (blocks, pure functions, tests), Task 2 (structure test, e2e), worst-case table above |
| C. Phone strip, `phone.css`, names toggle against the slider | Task 3; `phone.css` L11 in Task 2, L4-6 in Task 4 |
| D. Home, About, 404 | Task 4 (hero, shelf, veil), Task 2 Step 6 (About card and scrims) |
| E. Theme-coupled tests | Task 5 (`explore.spec.ts`, `search.spec.ts` L137-145, `a11y.spec.ts` read, comments), Task 1 Step 7 (`smoke.spec.ts` L14 and `search.spec.ts` L227, found by grep and not in the brief) |
| F. Budgets, measurement, blur A/B, preview and phone checklist, visual comparison, fidelity check and the five-lens review panel | Task 7, Task 8 |
| G. Spec line, token table note, README, pull request | Task 9 |
| H. Copy | "Site strings" section: none |

**Placeholder scan:** no "TBD", no "similar to task N", no "add error handling". The only angle-bracket fields are in the pull request body, to be filled with measured results that do not exist until Tasks 2, 4, 7 and 8 have run; Task 4 Step 5 and Task 2 Step 13 give the exact tuning rule (which number, which step, which ceiling) instead of a guess. Fixed during review: the hint band's stop was moved from 55% to 50% so the whole text line sits on the tested alpha; `.map-hint` got `z-index: -1` so its band does not paint over the zoom buttons; the test count of Task 1 Step 6 was corrected to 10; `.fab-map--on` and `.map-msg` were added to the glass rule and to the structure test's expected list together.

**Type consistency:** `Rgb`, `Tint`, `GlassFilter`, `rgbToHex`, `filterBackdrop`, `paintOver`, `surfaceOver` are defined in Task 1 Step 3 and used with the same names and shapes in Task 1 Step 1 and Task 2 Step 9. `contrastOverBackdrop(page, scope, selectors)` is defined in Task 2 Step 10 and called with three arguments in Task 2 Steps 11 and 12 and Task 4 Step 1. `drawStrip`'s eight parameters and `StripGas` match between Task 3 Step 1 and Step 3. `glassVars(css, want)` matches between Task 7 Steps 1, 2 and 3. The pinned hex values (`#323134`, `#39383c`, `#424244`, `#1e1d21`) and the strip rectangle (`-57, -362, 672, 672`) were computed with `node` and by hand from the same formulas the code uses.

**Assumptions about parts 1 and 2 (not read, because their code does not exist yet):** `loadTheme(): Promise<ThemeData>`; the gas image is north up and straight (not premultiplied) alpha; `SKY_RGB`, `STAR_WHITE`, `FRAME_RGB` are 0 to 255 triples; `src/components/map/theme.ts` does not import three.js; the picked frame keeps today's geometry; other covers still lose at least 30 percent of their detail while a pick lasts (part 2's plan darkens them towards `#07060a` instead of fading them, which the new measure handles the same way); region names are hidden in the dimmed mode; the names toggle is a 44 px button with class `.map-names` in the zoom corner, shown at the overview (read in part 2's draft plan, which was still being written). Each is stated in the task that depends on it, with what to change if it is wrong. Reconciled on 2026-10-04 against the finished plans of parts 1 and 2: all of the above hold; the names toggle is `button.map-names`, the first child of `.map-zoom`; `CLUSTER_RGB` is replaced in `MapPreviewStrip.tsx` by a stand-in, so that file keeps compiling until Task 3; the strip now passes `minLine: 10` as part 2 asks.
