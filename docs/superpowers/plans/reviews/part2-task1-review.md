# Part 2 Task 1 review: random star classes, tints and per-album attributes

Commit reviewed: `23d93e4a` on `feat/trifid-theme` ("feat(map): random star classes per page load, tints and star attributes"), local and unpushed.
Reviewer: a fresh session, 2026-10-05, in the cloud container (x86_64, Node 22.22.0, 4 CPU).
Spec: Task 1 and the header of `2026-10-04-trifid-theme-2-stars-lines-names.md`, the build handoff, the owner's decisions in `2026-10-04-trifid-theme.md` ("Stars are random"), and the prototype (`src/data.js` L67-77, `src/config.js` `STAR_MIX` / `RMR.rng`, `src/stars.js`, `src/gas.js` palettes).

**Verdict: APPROVED.** The code is the plan's code. `stars.ts` and `stars.test.ts` are byte-for-byte the plan's Step 4 and Step 2 blocks, and `starSeed` sits between `frames` and `gas` in `global.d.ts` as Step 1 says. It deals the same classes as the prototype, album for album: I checked five seeds against a verbatim copy of `data.js` L70-75. Album index, order and rank are never read. The seed is fresh on every real page load. The statistical tests are deterministic, so they cannot flake, and their bounds sit 5 to 7 standard deviations from a fair deal's mean. Nothing imports the module yet. The findings below are all Minor follow-ups. Most are gaps in the tests, not bugs.

## What I ran

| Check | Result |
|---|---|
| `npx vitest run src/components/map/state/stars.test.ts` x20 | 20/20 passed, 24 tests each |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` (full unit suite) | 430 passed, 1 failed: only the known `SearchBox.test.tsx` "32-character keystroke under 5 ms" wall-clock flake (234 ms here), not counted |
| Node probe (scratchpad `probe.mjs`): parity with the prototype's deal, other shuffles run through the test's assertions, spread over 50 other seed windows, timing | below |
| Node exact tails (scratchpad `tails.mjs`): hypergeometric convolution and normal bounds | below |

## Pass 1: spec

**Faithful to the prototype.**
- `STAR_MIX` [0.01, 0.09, 0.27], `STAR_RADIUS`, `STAR_GLOW` and `STAR_ALPHA` equal `config.js` L54-59.
- `STAR_WIDE` [6, 4.4, 2.6, 2.6] equals `stars.js` L29 (`wide = cls==0?6.:cls==1?4.4:2.6`).
- `STAR_UNDER_HOLD` / `STAR_UNDER_MAX` equal `STAR_UNDER` [0.5, 0.26]. `starUnder` is the shader's `clamp(1 - 0.5/max(bg, .001), 0, 0.26)`.
- The tint `round(white*0.75 + hue*0.25)` with white [255, 250, 244] matches `stars.js` L66-68.
- `EMBER_RGB` equals the prototype's default `ember` palette (`gas.js` L38).
- `seededRandom` is `RMR.rng` token for token.
- The cut-offs: `starCounts` gives cumulative bounds identical to `data.js` L74 for every n where the `Math.min` clamps do not bite (they only matter for n < 3). For 4,081 albums that is 41 / 367 / 1,102 / 2,571.
- The `Math.min(i, ...)` guard in the shuffle never changes a result for a generator that returns values below 1.
- Parity probe: `drawStarClasses(4081, seededRandom(s))` equals the prototype's deal for seeds 1, 7, 123456, 20261004 and 4294967295. So a prototype screenshot made with `#seed=N` and the app with `starSeed = N` show the same sky.

**The owner's rule (random per load, never from order, rank, id or position).** `drawStarClasses(n, random)` has no access to album data. `pageStarClasses(n)` reads only `n`, `window.__rmr.starSeed` and `Math.random`. `buildStarAttributes` reads class, `theme.stars.lead` and `theme.stars.bg` per index. Lead and bg are the non-random tint and gas luminance the spec allows. Nothing sizes a star by index.

**Is the seed fresh on each load?**
- RNG: mulberry32, seeded by `Math.floor(Math.random() * 2^32)`, which is 32 bits from the engine's unseeded per-realm PRNG.
- The cache is the module variable `page` (stars.ts:67). A full page load gets a new JS realm, so a new `page` and a new seed.
- SSR cannot repeat it today. `MusicMap` is `dynamic(..., { ssr: false })` (`MapStage.tsx:25`), and Tasks 2 and 8 call `pageStarClasses` only from `AlbumField` / `TwinkleDriver` inside that tree, so the server never deals. See finding 1 for the one future path where the server could.
- Client-side navigation (`/map` to an album page and back, Home's dimmed map) does not deal again: same module, same deal. The spec asks for exactly this. Task 1 says "for the life of the page ... a remounted map and a reloaded catalogue", and the owner's wording is "each page load". A browser reload or a new tab deals again. I think this is right: stars that re-dealt on every in-app navigation would read as flicker.

**The `window.__rmr.starSeed` override.**
- Production cost: one property read and one write, once per page load.
- `window.__rmr` always exists in production (`lib/store.ts:91-93`, unconditional on the client). So a visitor could set the seed from the console before the map loads. That is harmless: they choose their own sky.
- Tests and `capture.mjs --still` set it with an init script. `store.ts` spreads the existing object (`{ ...window.__rmr, ... }`), so the field survives. The plan's e2e (L6017, L6286) relies on this.
- Nothing in production code sets it except `pageStarClasses` publishing the seed it drew.

## Pass 2: tests

**False-failure rate.** Every statistical test feeds `seededRandom(1..400)`, so the counts are fixed numbers. On this head they are top1 = 170, top10 = 16,187 and mean index = 2,049.8, matching the plan's figures. The rate of spurious failure is therefore zero, not small. To check that the bounds are not tuned to these particular seeds, I also computed how likely a fair deal with any fresh 400 seeds is to fail:

| Assertion | Fair mean, sd | Bounds | P(fail) |
|---|---|---|---|
| top1 (first 41 in class 0) | 164.8, 12.7 | 100 to 240 | P(<=100) = 2.8e-8, P(>=240) = 1.7e-8 (exact convolution of 400 hypergeometrics) |
| top10 (first 408 in class 0-1) | 16,316, 115 | 15,500 to 17,100 | z = -7.1 / +6.8, about 5e-12 |
| mean index of class 0 | 2,040, 9.15 | within 60 | z = 6.55, about 6e-11 |

All three together: about 4.5e-8. Over 50 other windows of 400 seeds (1 to 20,000), the extremes were top1 137 to 190, top10 16,048 to 16,539 and mean 2,015.9 to 2,056.9, all far inside the bounds.

**Would a broken deal pass?** I ran the test's three assertions on these deals:
- A naive swap shuffle (`j = rand * n`): fails (top10 18,716).
- `sort(() => r() - 0.5)`: fails (top1 366).
- A shuffle that only covers half the array: fails.
- A deal where rank raises the odds of being bright by 1.5x: fails (top10 18,999).
- Class 0 dealt at random among even indices only (correlated with index, not rank): passes. It is contrived.
- A deal that drew classes 0 and 1 fairly but gave class 2 by index: passes (finding 2). It is realistic.

`drawStarClasses.length === 2` and the "same source gives the same deal" check are weak proofs (finding 3). The real guard against creep is Task 2's source test on `AlbumField`.

## Pass 3: quality

- **Performance.** O(n): one `Uint32Array(n)`, one `Uint8Array(n)`, one Fisher-Yates pass. 0.043 ms per deal for 4,081 albums in Node. It is dealt once per load and cached.
  - `buildStarAttributes` allocates 4n floats + 6n bytes, plus one small array per album from `starTint`'s `map`. Task 2 calls it twice per load (geometry with `null`, then the theme effect). Under a millisecond, so acceptable.
- **Purity.** Everything but `pageStarClasses` / `resetPageStars` is pure. The side effects are named and documented.
- **Lazy chunk.** No file imports `state/stars` yet (grep). `MapStage.tsx` is untouched at 19,936 bytes. Task 2 imports it only from `canvas/AlbumField.tsx` and `shaders/album.ts`, and Task 8 only from `canvas/TwinkleDriver.tsx` and `state/twinkle.ts`. All are under the dynamic `MusicMap`, so the module lands in the lazy map chunk.
- **Interface for Task 2 and Task 8.** It matches:
  - Task 2 uses `pageStarClasses(n)`, `buildStarAttributes(classes, null | theme)`, `DOT_AT_OVERVIEW`, `STAR_UNDER_HOLD` and `STAR_UNDER_MAX`.
  - Task 8 uses `pageStarClasses`, `starCoreCssPx`, `starTint` (with `lead[i]` possibly undefined, which `starTint` turns into white), `seededRandom` and `drawStarClasses`.
  - `StarAttributes` sizes (4 floats, 3 bytes, 3 bytes) match `a_star` vec4, `a_tint` vec3 and `a_bg` vec3.
  - `theme.stars.bg` is validated as integers 0..255 by `isUsableTheme`, and the real file (v3, n 4,081) holds values 1..255. So the clamp-and-round at stars.ts:136 is a harmless belt and braces.
  - `STAR_TINT_MIX` is an extra export the plan did not list, which is fine.
- **Commit hygiene.** Three files, as planned. The message carries `Refs #45` and both trailers. Not pushed.

## Findings

1. **Minor. `pageStarClasses` would cache across server requests if it were ever called during SSR.** `stars.ts:73-81`. Today only the client-only map tree calls it, so this is latent. Part 3's phone strip is told to use `pageStarClasses` if it ever varies star sizes, and `MapPreviewStrip` sits on the album page, which renders on the server. If that happened, the server's module-level `page` would hold one deal for the life of the server process, and hydration could mismatch. Fix (cheap, later): when `typeof window === 'undefined'`, return a fresh `drawStarClasses` without caching (or throw). Alternatively, add one line to the docstring: "client only; never call during server render".

2. **Minor. The order test does not cover class 2 (the 27% medium class), or class 1 on its own.** `stars.test.ts:94-120`. top1 and the mean index look only at class 0, and top10 at classes 0 and 1 together. A regression that dealt class 2 by index (for example a second pass that fills "the rest" in album order) passes every test. Fix: in the same loop, also count the first 1,510 albums (the top 37%) landing in classes 0 to 2. A fair deal gives about 400 x 1,510 x 1,510 / 4,081 = 223,500, against 604,000 for an order-following one. Use bounds about 6 sd wide (sd is about 300, so roughly 221,700 to 225,300 after checking the value for seeds 1 to 400). Or check the mean index of each class 0 to 2 against 2,040.

3. **Minor. Two "by construction" assertions prove less than their wording says.** `stars.test.ts:124-127`.
   - `drawStarClasses.length === 2` would still pass with a default third parameter (`length` ignores parameters that have defaults) or a closure over album data.
   - `drawStarClasses(50, () => 0)` equal to itself passes for any deterministic function, so it does not show that "every number it uses comes from the source".

   Fix: change the comment to say what is actually checked. Or replace the second check with one that has teeth, for example two different constant sources (`() => 0` and `() => 0.5`) give different deals, while a function that ignored `random` would give the same one.

4. **Minor. No golden test pins album-for-album parity with the prototype's deal.** The plan says the deal matches the prototype's for the same seed (Task 1 text above Step 1). I confirmed it by hand, but no test holds it. Changing the shuffle direction (`for i = 0 up`), or the class bounds' cumulative form, keeps every current test green and silently breaks `#seed=N` comparisons with prototype screenshots. Fix: add one assertion pinning, for seed 20261004 (the `--still` seed), the sorted indices of the 41 class-0 albums, or a checksum of the full 4,081-entry deal, computed from the prototype's `data.js` code.

5. **Minor. `starCoreCssPx` returns NaN for a class outside 0..3.** `stars.ts:100-102`. `buildStarAttributes` clamps with `Math.min(3, ...)`, but `starCoreCssPx` indexes `STAR_RADIUS[cls]` directly. Task 8 passes `classes[pick.index]`, which is always 0..3 when it comes from a deal, so this is defensive only. Fix: type `cls` as `0 | 1 | 2 | 3`, or clamp as `buildStarAttributes` does.

6. **Minor (readability). The seed line is a three-way nested ternary of about 150 characters.** `stars.ts:77`. Fix: split it into `if (page) seed = page.seed; else if (valid(given)) seed = given >>> 0; else seed = fresh;`. The behaviour stays the same.

7. **Note, no change asked. A change of album count keeps the seed but deals again, so every album's class changes.** `stars.ts:74-78`. That differs from "keeps its class through ... a reloaded catalogue" only if the catalogue size changes mid-session, which does not happen within one deploy. Both callers (Task 2, Task 8) pass `data.n`, so they stay consistent with each other. Fine as is. If ever wanted, the docstring could say "for the same number of albums".

None of findings 1 to 6 blocks pushing this commit. Findings 2 to 4 are worth folding in before Task 2 lands, since Task 2's review leans on Task 1's tests for Review Focus item 6.
