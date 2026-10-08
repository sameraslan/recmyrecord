# Part 2 Task 6 (names toggle): independent review

Commits read by id: `177baab9`, `12c6d09f`, `fa83a341`; net change `git diff 3d8ee1f4 fa83a341`.
Read-only review: nothing was built or run (the worktree is being rebased). Every statement about runtime
behaviour below is from reading the code, the tests and the four captures, not from a run. The implementer's
numbers (191.21 KB, 11 scripts, 524 unit tests, e2e passes) are his claims; I did not re-measure them.

## Verdicts

- **Spec: PASS, with one approved-in-principle interface change.** Option B, the icon, the fixed label, `aria-pressed`,
  `rmr-names` `'0'`/`'1'`, first child of `.map-zoom`, 40 / 44 px, the hide and lift rules on phone are all there.
  The plan's `useAppStore.getState().setNamesOn`, the `Icon` entries and the JSX `NamesToggle()` inside
  `ZoomControls` are not: the handoff asked for a placement without the chunk split, and this is one. The moved
  setter breaks later plan text (list at the end).
- **Quality: APPROVE WITH FIXES.** No Critical. Two Important (both tests, cheap). The unowned node is sound for
  today's `MapStage`; its one real weakness is that its safety rests on a lifetime coincidence that only part of
  the test suite pins down.
- **Look: PASS.** Matches option B in geometry and glyph. Differences are the panel colour and ink (part 3) only.

## 1. The unowned DOM node

How it holds together (`frontcreck/src/components/map/overlays/NamesToggle.tsx:39-65`, `MapStage.tsx:363, 381-385`):

- `.map-zoom` exists iff `interactive && mapData`. The toggle exists iff `MusicMap` is mounted
  (`enabled && mapData`) and `input.interactive`. `input` is memoised in the same `MapStage` render that decides
  `ZoomControls`, so `shown` and the corner flip in one commit; layout effects run after the whole tree's DOM
  mutations, so `document.querySelector('.map-zoom')` finds the corner of that commit. Correct.
- Route `/map` to `/` or `/about` (not interactive): effect cleanup removes the button; React removes the corner.
  Either order is harmless (`b.remove()` on a detached node is a no-op). Back to `/map`: new corner, new button,
  state drawn from the store. One button. Phone album list mode is the same path.
- Album to Explore and back (interactive stays true): `ZoomControls` keeps its slot in the fragment
  (`MapStage.tsx:381-385`, no key, static children), so React never touches `.map-zoom`'s child list and the
  button survives as the same node. Correct, but **not tested by a client-side navigation** (finding I1).
- `.has-card` on phone: `display: none` on the parent; the button hides with it. Correct.
- Strict Mode (dev, `next.config.ts:46`): mount, simulated unmount, remount gives b1 created, b1 removed, b2
  created, and the second effect draws b2. One button. Not unit-tested (M3).
- A Suspense re-suspend above `MusicMap` destroys and recreates layout effects: same as Strict Mode, one button.
- Listener: one closure on the button, dropped with it. No leak. No listener on `document` or the store beyond the
  `useAppStore` hook subscription, which React removes.
- `aria-pressed` and icon: the second layout effect is keyed on `[shown, on]` and `on` is a store subscription, so
  a change from anywhere redraws it (unit-tested, "follows a choice made elsewhere"). `memo` on `shown` means a
  hover re-render of `MusicMap` does not reach it.
- Hydration: `ZoomControls` needs `mapData` (client fetch), the store starts `true` on both sides, the button is
  made in a layout effect of a `ssr: false` chunk. Nothing to mismatch.
- Before the map chunk: no button, three zoom buttons with `margin-top` reserve. Correct.
- WebGL unavailable or context lost (`enabled` false, `MusicMap` unmounted): no toggle; the three zoom buttons
  stay where they always are, with the invisible reserve above them. Margin paints nothing, so there is no odd
  gap to see, and on a phone the corner still ends 8 px above the slider panel. That is the right look: no map,
  no names, no names button. Two side notes: the zoom buttons themselves do nothing there (existing behaviour,
  not this task), and nothing tests this corner (M2).

Where it can break:

- The button is lost for good if `.map-zoom` is ever remounted while `shown` stays true (a key on
  `ZoomControls`, a new condition around it, a wrapper that part 3 adds for glass). Effect 1 depends on `shown`
  only and nothing re-checks. Today no code path does this. The docstring says so; only tests can hold it (I1).
- `document.querySelector('.map-zoom')` is global. A second `.map-zoom` anywhere (a preview strip, a story)
  would take the button. None exists.

A cleaner design at the same byte cost? I do not see one.

- React-owned button rendered by the lazy chunk inside `.map-host` and placed by CSS: owned, but it leaves
  `.map-zoom`, so it loses the Tab position (it would come before the slider), the phone `.has-card` hide and the
  `--slider-cover` lift, each of which would need new CSS and new tests. Worse.
- `createPortal` / `createRoot` from the lazy chunk: measured +0.31 KB by the implementer (react-dom import
  reshuffles first-load chunks).
- Any slot in `ZoomControls`: measured, splits the chunk.
- Moving all of `ZoomControls` into the lazy chunk (four React-owned buttons, less first-load code): only
  possible with a portal into `.map-ui`, or by giving up the DOM order. Not worth it now; worth one measurement
  if the unowned node ever causes a bug.

So: keep the design, close the test gaps.

## 2. Accessibility

- Real `<button type="button">`, `aria-label` fixed from `COPY.map.names`, `aria-pressed` `"true"`/`"false"`,
  icon `aria-hidden` and `focusable="false"`. Keyboard activation is native. Good.
- Focus ring: the global `:focus-visible` rule (`styles/shell.css:15`) applies; e2e checks `outline-style: solid`
  after a keyboard move.
- Tab order is DOM order: toggle, Zoom in, Zoom out, Reset. Unit test checks `tabIndex === 0` and order; e2e
  checks Tab and Shift+Tab between toggle and Zoom in on three views.
- Size: takes `.map-zoom button` (40 px; 44 px from `phone.css:46`). e2e asserts both.
- Late arrival: it is inserted before the paint of the commit that mounts the map, never moves focus, and lands
  before Zoom in. A user already on Zoom in keeps focus; the only change is that Shift+Tab now stops on the
  toggle first. A user who tabbed past the corner before the chunk loaded simply was not offered it. Acceptable.
- The same node is kept across presses (focus stays; unit and e2e tested). The `innerHTML` swap happens inside
  the focused button, which is fine for screen readers: the state change is announced through `aria-pressed`.
- If the toggle holds focus when the WebGL context is lost, the button is removed and focus falls to `<body>`.
  Edge case, not worth code.

## 3. State

- `readNamesOn`: only exact `'0'` is off; `try/catch` on read and write. `setNamesOn` returns early on no change
  (no notification, no write). Good.
- "Starts from the saved choice" now holds from the map chunk's module evaluation. Readers of `namesOn` at
  `fa83a341`: `NamesToggle` and `namesPref` only, both in that chunk. Nothing in first-load code reads it, so
  nothing can act on the early `true`. This must stay true: any first-load reader (part 3 chrome, a header
  control) would see `true` with `'0'` saved until the chunk loads.
- `window.__rmr` exposes `getState` and `subscribe` only (`store.ts:95`), not `setState`. With the setter off the
  store there is **no page-context hook that can change `namesOn`** except clicking the button. This matters for
  part 3's perf flag (downstream list).
- The module-level apply only ever sets `false`. So a test that puts `namesOn` in the store before the chunk
  loads is overridden only by a saved `'0'`. Fine.
- Moved store tests (`namesPref.test.ts:53-87` against `177baab9`'s `store.test.ts`):
  - "saves the choice when it changes": same three calls, same `calls === 1`, same `false`, same `'0'`; adds
    "an unchanged choice writes nothing". Not loosened.
  - "storage blocked": identical assertion.
  - "starts from the saved choice": same `'0'` then fresh modules then `namesOn === false`; the load under test
    is now `./namesPref` followed by `./store`. Same assertion, later moment, as the report says.
  - New `store.test.ts` test pins the other half (the store alone stays `true` and never reads `rmr-names`).
  Nothing is asserted more weakly.

## 4. Tests

`e2e/focus.spec.ts` is untouched (`git diff --stat 3d8ee1f4 fa83a341 -- frontcreck/e2e` lists `toggle.spec.ts`
only). `focus.spec.ts:322` still asserts the corner's bottom edge against the panel top, unchanged.

`e2e/toggle.spec.ts`, test by test:

1. Look: proves its name. Child list equality catches a doubled button or a wrong position; sizes on both
   projects; gap exactly 8; borders; 16 px icon, stroke 1.6.
2. Press: proves its name, including `localStorage` `null` then `'0'` then `'1'`, mask, 0.42, 1.2 px slash, size.
3. Reload off: three routes, junk values, error watch. Proves its name. It waits for `waitForMap` before reading
   `namesOn`, which is required now.
4. Keyboard: proves "one stop before Zoom in" in both directions on three views, focus ring, Enter, Space. It
   starts from `toggle.focus()`, so it does not prove the toggle is reached by Tab from the control before it
   (M4). A doubled button fails the strict `getByRole` locator.
5. Comes and goes: Home and back by history, exactly one, still off. Only one of the client-side transitions
   (I1).
6. No jump: real. The chunk holding `rmr-names-cut` is held at the network, `held` must be exactly 1, the corner
   is asserted at `4 * side + 8` before release and every rectangle is compared for equality after. Runs on
   both projects, so the phone literal (52) is covered too.
7. Phone: 184 px, 8 px above the panel, hidden with the card, back at the same y. Proves its name.
8. Rest and pointer: `<= 2` frames for two presses then 0; hover over markers changes `hot` and causes 0
   mutations in `.map-zoom`. The pointer half is real. The frame half is looser than the code (I2).

Unit tests (`NamesToggle.test.tsx`, 11) are specific: glyph paths number for number, mask id, reserve selector
before and after, zero `querySelector` calls and zero mutations across five re-renders.

## 5. Look (four captures against option B)

Looked at `toggle-b-on.jpg`, `toggle-b-off.jpg` and all four `toggle-{desktop,phone}-{on,off}.png`.

Same as B: detached square box, 8 px above the stack, same width and x as the zoom buttons; Zoom in has its own
top border, Zoom out and Reset share theirs; "Aa" in the same proportions, visibly lighter in weight than the
plus and minus (1.6 against 1.7); off is the dimmed letters with a thin bright slash and a clear band cut on
each side of it.

Different:
- Panel: opaque warm brown (`--color-float`) against B's near-black see-through glass. Expected, part 3.
- Ink: warm `--color-dust` against B's cooler grey-white. Expected, part 3.
- Off state reads a little more legible than in B because the dimmed letters sit on a lighter, warmer panel;
  the slash to letters contrast is correspondingly lower. Recheck on glass in part 3 on a real GPU.
- Phone was never drawn for B: 44 px boxes, 12 px from the right edge, corner 8 px above the slider panel. It
  looks like the desktop corner scaled, nothing odd. The owner has not seen it.
- The gas behind is the lighter software-renderer shader, not a real-GPU capture.

## 6. Speed and rules

- Pointer-move path: none. `NamesToggle` is `memo` on a boolean; a hover re-render of `MusicMap` stops there
  (unit: zero lookups, zero mutations; e2e: zero mutations in the corner while `hot` changes).
- Toggling: one store `setState`, one `localStorage.setItem`, one `innerHTML` and one attribute write. It calls
  no `requestRender`; with no names layer yet a press draws 0 canvas frames. The test allows 2 (I2).
- First load: `store.ts` gains one field, `copy.ts` one string; `Icon.tsx` and `ZoomControls.tsx` are byte for
  byte `3d8ee1f4`; `MapStage.tsx` untouched. `namesPref` is imported only by `NamesToggle`, which only
  `MusicMap` imports. No new first-load module, by reading. The 191.21 KB / 11 scripts figure is the
  implementer's and should be re-measured after the rebase.
- No data file, budget file or pipeline file touched.

## Findings

### Critical

None.

### Important

**I1. The design's one failure mode (button lost or doubled when React remounts the corner) is tested for one
transition out of four.** `frontcreck/e2e/toggle.spec.ts:163-178` covers `/map` to Home and back by history
only. Not covered by a client-side navigation: `/map` pick to album and back with "Explore this area"
(interactive stays true, the node must survive), album to album, phone list to map to list to map. Test 4 uses
`page.goto` between views, which is a full load and proves nothing about remounts.
Fix: extend test 5. After `goBack`, on desktop click an album on the map (`visibleAlbumPoint`), follow the card
link to the album page, press `COPY.map.exploreHere`, and after each step assert
`page.locator('.map-names')` has count 1, is `.map-zoom`'s first child and still has `aria-pressed="false"`;
on phone toggle Map / List twice with the same assertions. Add a unit test rendering `<Corner />` inside
`<StrictMode>` expecting exactly one `.map-names` (also closes M3).

**I2. The frame assertion is looser than the rule it guards.** `frontcreck/e2e/toggle.spec.ts:245-251` allows
`f1 - f0 <= 2` for two presses, written ahead for Task 7. Today a press draws nothing, and the rule is that
toggling does not draw a canvas frame by itself. As written, a regression that draws a frame per press in Task
6's own code passes, and Task 7 gets its allowance without having to justify it.
Fix: assert `expect(f1 - f0).toBe(0)` now. Task 7 then changes the number to what it measures, with the reason
in its report (that is tightening to a measured value, argued in the open, not a silent loosening). If the
orchestrator prefers no later edit, keep `<= 2` but split it: one press at a time, `<= 1` each.

### Minor

**M1. Reserve sizes are bare literals tied to button sizes in two other places.**
`frontcreck/src/styles/map.css:104` (48 px), `frontcreck/src/styles/phone.css:48` (52 px), and
`namesLayout.ts:273-274`. Fix (CSS only, no JS bytes): `.map-zoom { --zb: 40px; }`, phone `--zb: 44px`,
`.map-zoom button { width: var(--zb); height: var(--zb); }`, reserve `margin-top: calc(var(--zb) + 8px)`. Then
part 3 changes one number. e2e test 6 already guards it.

**M2. Nothing tests the corner without WebGL.** `frontcreck/e2e/nowebgl.spec.ts:4`. Fix: add to the first test
`await expect(page.locator('.map-names')).toHaveCount(0)` and that `.map-zoom` holds exactly the three zoom
buttons.

**M3. No Strict Mode unit test** for the create, remove, create sequence
(`NamesToggle.test.tsx`). Folded into I1's fix.

**M4. Test 4 does not show the toggle is reached by Tab.** `frontcreck/e2e/toggle.spec.ts:124-129` starts from
`toggle.focus()`. Fix: once per view, focus the similarity slider's last stop (or the canvas) and Tab until
`.map-zoom` is entered; the first stop inside it must be the toggle. Plan Task 9's `names.spec` has a `tabTo`
version; either is enough.

**M5. The effect silently gives up when `shown` is true and the corner is missing.**
`NamesToggle.tsx:44-45`. Impossible today. Fix: none in code (a retry would cost bytes and hide a real bug);
the I1 tests are the guard. Keep the docstring warning, and add one line to `ZoomControls.tsx`'s docstring
only if a build shows the comment is free (the implementer measured that comments there do not change output).

**M6. `.map-zoom` takes pointer events over its transparent parts.** `styles/map.css:20, 26`
(`.map-ui > * { pointer-events: auto; }`). The 8 px strip between the toggle and Zoom in swallows map clicks
and hovers (the prototype does the same; the reserve itself is harmless because there is no map before the
chunk). Fix if wanted: `.map-zoom { pointer-events: none; } .map-zoom button { pointer-events: auto; }`. Check
`explore.spec.ts:140` and the hover tests after.

**M7. `177baab9` carries a `Claude-Session:` trailer** of the cloud session that wrote the patch. RULES.md says
not to copy that line. It came in through `git am`, so it is the original author's own; the orchestrator
decides whether the rebase drops it.

**M8. Wording.** `COPY.map.names` = "Place names" is still pending the owner (`copy.ts:80-82`). The prototype's
button says "Region names". Nothing else new.

**M9. Two tabs do not sync** (no `storage` listener). Not asked for; leave.

## 7. Downstream: what later tasks must change

`setNamesOn` is now `import { setNamesOn } from '@/lib/namesPref'` (lazy chunk only). `useAppStore` has
`namesOn` only. `window.__rmr` has no `setState`.

Part 2 plan (`docs/superpowers/plans/2026-10-04-trifid-theme-2-stars-lines-names.md`):
- L131 (interfaces summary) and L6505 (type consistency): "`useAppStore` gains `namesOn` and `setNamesOn`" is
  wrong; `setNamesOn` is exported by `lib/namesPref.ts`; `Icon` gains nothing; `NamesToggle` takes
  `{ shown: boolean }`, renders `null` and is mounted in `MusicMap.tsx`.
- **Task 7** (L3376 on):
  - `MusicMap.tsx` anchors moved: it now imports and renders `<NamesToggle shown={input.interactive} />`; keep
    it, add `RegionNames` beside it.
  - Reading `useAppStore((s) => s.namesOn)` (L3664) and `useAppStore.getState().namesOn` (L3870) is fine, and
    unit tests may keep `useAppStore.setState({ namesOn })` (L3482, L3495).
  - The names layer must stay in the lazy chunk. It gets the saved choice because `MusicMap` imports
    `NamesToggle`, which imports `namesPref`, whose module body runs before any render. Do not import
    `namesPref` from first-load code, and do not remove that import chain.
  - CSS: "after the names toggle rules from Task 6" is now after three rules (`map.css:100-104`).
  - `toggle.spec.ts` test 8 is the frame gate for a press. If I2 is fixed to 0, Task 7 sets it to its measured
    value (at most one frame per press) and says so.
  - `chromeBlockers` already assumes the four-button corner (`namesLayout.ts:272-291`); no change.
- **Task 8** (L4094 on):
  - L4100, L4234-4258: the anchors "after `setNamesOn: (namesOn: boolean) => void;`" and "after the
    `setNamesOn` implementation" do not exist. `namesOn: boolean;` (`store.ts:30`) and `namesOn: true,`
    (`store.ts:70`) do.
  - `twinkleOn` plus `setTwinkleOn` in the store is first-load code. Unlike names, its setter is needed from
    page context (`window.__rmr.getState().setTwinkleOn(false)` in L4155, `twinkleOff`, `twinkle-cost.mjs`,
    part 3 perf). Decide before the task: either accept the store setter and measure first-load JS and the
    script count (the chunk has no room; any growth can split it), or keep only the flag in the store and have
    the lazy twinkle driver publish the switch on `window.__rmr.twinkle` (it already publishes the counters,
    L5137-5147). The second matches Task 6; then every `getState().setTwinkleOn` in the plan, the helper and
    the scripts changes with it.
- **Task 9** (L5828 on):
  - `names.spec` reads `namesOn` and the toggle only after `waitForMap` (the flag is `true` before the chunk
    whatever is saved).
  - Its toggle and keyboard tests overlap `toggle.spec.ts`; keep the names-visible assertions, drop duplicates
    or leave them.
  - Step 5 phone screenshots for the owner are still owed (the four captures here are crops, software
    renderer).
  - Step 7's expected first-load growth for Task 6 is now about +0.04 KB, not the plan's estimate.
  - The hydration check "reload with the preference off" already exists as `toggle.spec.ts` test 3.

Part 3 plan (`docs/superpowers/plans/2026-10-04-trifid-theme-3-chrome-tests.md`):
- **L3528 and L3703-3706 (`--names on|off`)**: `window.__rmr.getState().setNamesOn(on)` throws. `forceEffects`
  runs right after `goto('/')` and `goto('/map')`, and on Home there is no button to click. Replace with the
  saved choice, set before any page script:
  `await context.addInitScript((v) => { try { localStorage.setItem('rmr-names', v); } catch {} }, NAMES === 'on' ? '1' : '0')`
  when `NAMES` is given. `namesPref` applies it when the map chunk loads, on every load, at any route, with no
  extra work inside the timed run. Remove the `NAMES` branch from `forceEffects`. (Alternative: publish
  `window.__rmr.setNamesOn` from `namesPref.ts`; it exists only after the map chunk, so the script must wait
  for it.)
- L3722 and L4301 (README text) stay true once the flag works.
- L518, L541, L619 (glass list with `.map-names`): still right; the button is a `button` inside `.map-zoom`.
- L877, L896 (`.map-zoom button` `.first()`): this is the toggle once the chunk is in and Zoom in before; same
  styles either way. Wait for `waitForMap` if the test means the toggle.
- L2980-3021 (four buttons on a 360 x 640 phone): the count is four only after the map chunk; wait for
  `.map-names` before counting. The 184 px arithmetic holds.
- Any change to the zoom button size in part 3 must move `map.css:104`, `phone.css:48` and
  `namesLayout.ts:273-274` together (or do M1 first).
- L4508 (summary of part 2): add "the toggle is mounted by the lazy map chunk, `setNamesOn` is in
  `lib/namesPref.ts`".
- Real-GPU check of the masked off state on the glass panel is part 3's.
