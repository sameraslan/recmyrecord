# Review: part 3 Task 1 (tokens, glass switch, contrast function) and Task 8 (favicon)

Diff reviewed: `git diff 3d8ee1f4..21ae4d10` (`67113c3e`, `64f8489c`, `21ae4d10`). Method: scripted comparison of every plan code block with the committed files, hand maths, the old test read line by line, the icons and screenshots opened. I did not build or run a browser. `contrast.test.ts` could not be run at `21ae4d10` (the worktree has moved on, and the current file already carries later tests, so a run here is not a run of the reviewed state); the icons test passed. I rely on the report's 10/10 for the reviewed state.

## Verdicts

- **Spec compliance: PASS.** Every block is character for character the plan's: `contrast.test.ts` (identical), the `contrast.ts` additions (substring match), the `globals.css` replacement (substring match, width blocks untouched), `build.mjs` (identical), `shell.css` `.top`, `layout.tsx`, `smoke.spec.ts`, `search.spec.ts`. The three SVGs use exactly the plan's colour mapping, shapes unchanged. Nothing extra except the two declared deviations (test file location, Task 7 Step 3 pulled forward). `grep` for clay, moss and ochre in `src` is empty. No package or lockfile change.
- **Quality: PASS WITH FINDINGS.** The code and tests are sound. Findings are the 16 px icon, the weak binary check, and the 16 MB of PNGs.

## 1. Spec compliance detail

- Token table: all 21 rows present with the plan's values; `--color-lamp-hover`, `--color-rule-3`, `--panel-bg`, `--top-bg`, `--glass-blur` added; three fallback blocks each set the same four values (`--glass-blur: none`, three solid `rgba(10, 9, 14, 1)`). `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` is valid syntax.
- Task 7 Step 3 pull-forward: `search.spec.ts` L137, L143, L145 are exactly the plan's three after-lines (title "off-white border", `rgb(241, 236, 228)`, regex `0\.94\d* 0\.92\d* 0\.89\d* / 0.45` or `rgba(241, 236, 228, 0.45)`). Exact. The commit message says so. Justified: the token change would otherwise leave this test red for six tasks. Task 7's brief must be told Step 3 is done.
- Task 8 test deviates only in location (`scripts/icons/icons.test.mjs` instead of an appended `describe` in `glass.test.ts`) and the dropped `: string`. The location is reasonable (glass.test.ts did not exist), and vitest's include already covers `scripts/**/*.test.mjs`. Note `glass.test.ts` exists in the worktree now; see Minor 3.

## 2. Tests: old assertion to new proof

| Old assertion | Now proved by | Strictness |
|---|---|---|
| ratio 21 and 1 | same test | equal |
| `room` is `#15110d`, `lamp-ink` `#1a130b` | "reads the tokens..." pins new values, plus the glass tints, filter and the `[solid x3]` for each surface | stricter |
| paper, dust, ash, lamp on room, room-2, room-3, room-4, **float**, pane | same loop minus float on opaque; float checked as glass over white and cream, and as solid | stricter (float's worst case instead of one flat colour) |
| `.btn-lamp`, `.skip` ratios | same loop, unchanged | equal |
| lamp-ink on paper | same, plus lamp-ink on lamp-hover | stricter |
| accent on room at 4.5 for every album and default | same, plus 3:1 on glass and solid panel | stricter |
| hot badge for every accent | unchanged | equal |
| lit mood tag, tag text on `color-mix(acc N%)` over **the `.album` rule's background** | same computation over the glass panel and the solid panel | see below |

Lit tag: not proved less strictly in value (both modelled panels are brighter than the real current opaque `#07060a`, and the tag text is paper), but one link is **lost**: the old test read the panel colour from the `.album` rule, so a change to `.album`'s background was caught. The new one reads `--panel-bg` and never checks `.album` uses it. Until Task 2's `glass.test.ts` pins `.album { background: var(--panel-bg) }` this is a hole (the report says the same; I agree it is honest and not a loosening, but it is a real gap in the interim). New unpinned assumption: the lit-tag test also drops the old `.album` `resolve()` throw that would fail if `.album` stopped using a token. Minor 1.

Not covered by anything, old or new (not a regression): `.top`'s children other than `.wordmark` and `.navbtn, .icon-btn` (the header test pins only those two rules); ash text on the header glass fails 4.06, so a future header child using ash would pass the suite. Minor 2.

`smoke.spec.ts` L14 and `search.spec.ts` L227: both pin the new token's computed value (`rgb(7, 6, 10)` = `#07060a`, `rgb(23, 22, 29)` = `#17161d` = room-3). Same proof as before, correct values. The focus-ring test: equal strictness (colour, 1 px, 45 percent halo, no move).

**Favicon test.** It is meaningful for the SVG sources: palette whitelist per file (catches any old warm hex), the lamp star present, three circles and one path. Weaknesses: (a) it checks only `#rrggbb` literals, so `rgb()`, 3-digit hex or named colours would pass; (b) it never touches `favicon.ico` or `apple-icon.png`, which are what browsers and iOS actually use, so stale or mis-built binaries pass (Minor 4); (c) it cannot catch the 16 px legibility problem (Important 1).

## 3. The contrast function

Maths is right.
- `filterBackdrop`: the saturate matrix is the CSS Filter Effects matrix (0.213/0.715/0.072 rows, correct signs); applied in sRGB, clamp, then brightness multiply, clamp. Matches how the shorthand filter functions work (sRGB, not linearRGB).
- `paintOver`: straight source-over in sRGB, `c*a + b*(1-a)`. Correct for an opaque backdrop.
- `rgbToHex`: clamp and round at the end only; the old `over()` rounded per channel the same way.
- sRGB linearisation in `relativeLuminance` unchanged and correct (0.04045, 12.92, 1.055, 2.4, 0.2126/0.7152/0.0722).

Hand checks (node, arm64):
1. White, s 1.2: R = 255 x (1.1574 - 0.143 - 0.0144) = 255.0, so 255 x 0.58 = 147.9; panel: 8 x 0.7 + 147.9 x 0.3 = 49.97 gives 50 = 0x32; G 49.27 gives 0x31; B 52.07 gives 0x34. `#323134` matches the test. Paper `#f3eee7` on it: 11.20, matching the plan table (11.20).
2. Cream gas `(244, 238, 222)`: saturated (245.17, 237.97, 218.77); x 0.58 x 0.3 + tint x 0.7 gives (48.3, 46.2, ~46.4), matching the plan's `rgb(48, 46, 46)` within rounding.
3. Float over white `#39383c`: ash `#aaa49d` on it 4.71, matching the plan table. Favicon: lines 8.18, small stars 10.96, large star 17.18 on `#07060a`, all as the plan states.

Model caveat (Minor 5, not a defect): the model clamps after saturate then brightens. A saturated backdrop (pure red) clamps the R channel at 255 in the model; if a browser composes the two filters into one matrix without the intermediate clamp, the real result is brighter than the model for such pixels. It is irrelevant to the worst case the test targets (white and cream are neutral, and in sum-to-1 rows saturate leaves the white at exactly 255 either way), and Task 2's browser measurement is the real arbiter.

## 4. Code quality, first-load JS, hard rules

- `contrast.ts` is imported only by tests, not by app code: nothing reaches the first-load graph. Everything else is CSS, a meta colour, tests and binaries. Report's 191.17 KB, 11 scripts is credible (the favicon binaries are not in JS). No `MapStage.tsx` or perf budget change.
- No dead code. The fallback block repeats the same declaration three times by plan design (a CSS limitation); a comment says so.
- Rules: no new wording; no budgets changed; positions/data untouched; commits have `Refs #45` and the co-author line. The `Claude-Session:` trailer is absent (RULES: "the same trailer lines recent commits carry"). The implementer disclosed this. Minor 6.
- Mid-state: after Task 1 alone, desktop float surfaces are see-through with no blur and dust/ash fail below 4.5 over bright gas (report computed dust 3.57, ash 2.67 over white). RULES-adjacent: the plan's contrast rule is hard. Correct to flag; Task 1 must not be pushed or previewed without Task 2. Important 2 (process).

## 5. What I see

Icons (opened `apple-icon.png` and the 16 and 32 entries extracted from `favicon.ico`, enlarged):
- 180 px: clean. Large off-white star, two dust stars, grey lines on near black; nothing warm. Matches the intended mark.
- 32 px: reads (three discs and the triangle), large star clearly brighter.
- **16 px: it does not read.** One pale Y-shaped blob (a molar or a bent tuning fork) on a dark tile; the two small stars fuse with the 2 px butt-capped lines. The implementer's finding is right. Before, the three hues separated the parts at 16 px; now lines (`#aaa49d`) and small stars (`#c4beb6`) are three steps apart. Note also that the favicon shown in a modern Chrome tab is usually `icon.svg` (32 viewBox) scaled to 16, not `icon-16.svg`, so fixing only `icon-16.svg` may not change what the owner sees; check what Next emits in `<head>` and in which order.

Screenshots (desktop map, desktop album, against `final-album.jpg`): cool near-black page and header, off-white "Open in Spotify" button and off-white slider thumb present, as `final-album.jpg`. As the report says, the Similarity panel is a flat dark rectangle with sharp gas behind (no blur yet), the album panel is opaque with the old full-strength wash, and the album page's "Map" tab has no underline where `final-album.jpg` has one (not Task 1). The honest list in the report is accurate; I found nothing it missed except the missing "Map" underline on the album page (Minor 7).

## 6. Repo size

The 12 PNGs are 1.1 to 1.7 MB each (16 MB). The repo convention is JPEG: `git ls-files docs/design` has 475 JPEG and 113 PNG, and every `reviews/app-*` folder besides this one is JPEG. These are interim, Task-1-only states that Task 2 supersedes, and the "before" set is reproducible from `3d8ee1f4`, which the baseline already documents (`reviews/baseline/shots`). Once pushed, 16 MB is permanent in a public repo's history; commit `21ae4d10` is not pushed, so it can be rewritten for free. Not all are needed: `task1-{before,after}-phone-home` and `desktop-home` differ by a barely visible header seam (1,534,049 versus 1,535,401 bytes) and are covered by the map pair. Fix: re-encode as JPEG q82 (about 250 KB each, 3 MB total), and keep six (desktop map, desktop album, phone map, phone album, one home pair, or just the "after" set against the baseline's "before") — or do not commit them and cite `_notes` instead. Do it by replacing commit `21ae4d10` before any push.

## Findings

### Critical
None.

### Important

1. **16 px favicon does not read.** `frontcreck/scripts/icons/icon-16.svg` L2-5 (and `src/app/icon.svg`, which Chrome may use at 16 px). Lines and small stars are within three greys at 2 px and 4 px radius and fuse into a blob. Fix (needs owner or reviewer sign-off because the plan pins shape and palette): in `icon-16.svg` only, thin the lines to `stroke-width="1"` or use a darker allowed grey such as `#24222c`-lit variant, and shrink the two small circles to `r="1.5"`; update `icons.test.mjs`'s allowed list or "one path" rule only if that needs it. Re-render with `build.mjs`, re-open the 16 px entry at 10x, and check `<head>` for which file Chrome takes.
2. **Task 1 must not be pushed or previewed without Task 2.** `globals.css` L36-41 and `shell.css` L30: dust and ash text on the float surfaces measure 3.57 and 2.67 over white until `backdrop-filter: var(--glass-blur)` lands, below the hard 4.5:1 rule. Fix: keep the two in one push (the reconciled notes already say this); put that sentence into Task 2's brief.

### Minor

1. **Lit-tag link to `.album` lost** (`contrast.test.ts`, "a lit mood tag" test): panel read from `--panel-bg` tints, not from the `.album` rule. Fix: Task 2's `glass.test.ts` must pin `.album { background: var(--panel-bg) }`; or add `expect(rule(album, '.album').background).toBe('var(--panel-bg)')` to this test then.
2. **Header coverage**: the header test pins only `.wordmark` and `.navbtn, .icon-btn`; ash on the header glass fails (4.06). Fix in Task 3: assert no `.top` descendant rule uses ash.
3. **Favicon test location**: `scripts/icons/icons.test.mjs` is separate from the planned `glass.test.ts` `describe`; `glass.test.ts` now exists, so Task 2's author may move it. Plan's "12 tests" count assumes it is in `glass.test.ts`. Fix: decide once (leave it, and fix the count).
4. **Favicon test ignores the binaries** (`icons.test.mjs`). Fix: add a test that `favicon.ico` has three entries (16, 32, 48), each a PNG with colour type 6, and `apple-icon.png` is 180 x 180; optionally sample the centre pixel of the large star (about `#f1ece4`) with `zlib` inflate, so a stale binary fails.
5. **Model caveat**: `filterBackdrop` clamps between saturate and brightness; real engines may not (`contrast.ts` L36-44). Irrelevant for white and cream. Fix: add a one-line comment, or rely on Task 2's browser measurement (already planned).
6. **Commit trailers lack `Claude-Session:`** that recent branch commits carry. Fix: add it if a session link exists; otherwise note it (already disclosed).
7. **Album page "Map" tab has no underline** in `task1-after-desktop-album.png` where `final-album.jpg` has one. Not Task 1; add to part 3's fidelity list.
8. **Screenshots**: 16 MB of PNG in `app-part3/` (see section 6). Fix: JPEG q82, six or fewer, rewrite unpushed commit `21ae4d10`.
