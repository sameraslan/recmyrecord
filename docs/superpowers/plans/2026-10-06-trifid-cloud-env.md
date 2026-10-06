# frontcreck checks in this cloud container (x86_64, Node 22.22.0, 4 CPU, 15 GB)

Ignore the repo's arm64/nvm notes; `assertNativeChrome` is a no-op off macOS. Run everything from `frontcreck/`.
No tracked file was changed. Environment-only setup (already in place, outside the repo):
- `/root/pw-browsers-1243/`: symlinks posing as Playwright 1.63's chromium-1243 / chromium_headless_shell-1243,
  pointing at `/opt/pw-browsers/*-1194` (Chromium 141.0.7390.37). Reason: `npx playwright install chromium`
  is refused by egress policy (403 on cdn.playwright.dev).
- `/opt/google/chrome/chrome` -> `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, so `channel: 'chrome'`
  (perf, shots) launches. It is Chromium 141, not Google Chrome (dl.google.com is also refused, no apt package).
- Rebuild either if missing: see "Recreate" below.

## Commands
```bash
cd /home/user/recmyrecord/frontcreck
export PLAYWRIGHT_BROWSERS_PATH=/root/pw-browsers-1243   # required for e2e and perf
npm run lint                     # ~20 s
npm run typecheck                # next typegen && tsc --noEmit
npm test                         # vitest, ~20 s
npm run build                    # ~40 s
npx playwright test --project=desktop --workers=1            # one project (desktop | phone | nowebgl)
npx playwright test --project=desktop --workers=1 e2e/explore.spec.ts:295   # one test
npx playwright test --workers=1                              # all three projects, ~17.5 min incl. build
node scripts/perf/perf.mjs --mode software                   # perf, software renderer only (see Perf)
```
e2e's webServer runs `npm run build && next start --port 3100` itself (reuseExistingServer false: port 3100 must be
free). Full run is >15 min: use run_in_background. Output goes to `test-results/` (gitignored).

## Status on feat/trifid-theme @ b363a0598290f1da57063c0da687a8854b00dff8 (2026-10-05)
| Check | Result |
|---|---|
| lint | pass |
| typecheck | pass |
| unit (vitest) | pass, 39 files / 380 tests |
| build | pass |
| e2e all projects, --workers=1 | 7 failed, 188 passed, 79 skipped (17.5 min) |

Failing e2e tests:
1. [desktop] + [phone] explore.spec.ts:295 "in cover mode the picked album is drawn large on top ... dimmed"
   (luma 57.4 vs < 45.3; 59.8 vs < 46.4). EXPECTED red on purpose.
2. [desktop] + [phone] pages.spec.ts:60 "Home > the first load requests no thumbnail sprite and no map atlas"
   (requests /data/thumbs.webp). ENVIRONMENT: remote covers on i.scdn.co are refused by egress policy (403),
   so covers fall back to the sprite. Red here on any head; not a regression signal.
3. [desktop] search.spec.ts:215 "covers > while the remote image loads the box is empty, with no letter"
   (img.ok never visible). ENVIRONMENT: same i.scdn.co block.
4. [desktop] gas.spec.ts:956 "a drag that begins between two strips of a sharper image ... no further strip"
   (gasSharp stays 'loading', expected 'balanced' within 30 s). Reproduced on a rerun; local asset, so not the
   proxy. Cause not established (slow software renderer here, or real). Compare against a base head before blaming a change.
5. [desktop] flows.spec.ts:118 "keyboard-only search, deeper and back to the map": FLAKY, passed on rerun.

Full log: scratchpad/e2e-head.txt; rerun of 2-5: scratchpad/e2e-rerun.txt.

## Perf (`npm run perf` = node scripts/perf/perf.mjs)
- Launches `channel: 'chrome'` headless; works only via the /opt/google/chrome shim above.
- Renderer here, both modes: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)".
  No GPU: `--mode gpu` (Metal flags) also gets SwiftShader and fails "GPU mode ran without a GPU" unless
  `--allow-software-gpu`; its numbers mean nothing. Use `--mode software` only, and treat timings as
  relative (compare two heads on this machine), not against the laptop budgets.
- No `--help` flag: any invocation is a full run. Needs `.next/BUILD_ID` (else builds; `--build` forces), port
  3200 free; options: --mode software|gpu, --viewport desktop|phone|desktop2x, --no-gas, --gas-lite off|force.
- Writes scripts/perf/out/perf-*.json (gitignored). Not run in this setup pass.

## Recreate the browser shims
```bash
P=/root/pw-browsers-1243; H=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux
mkdir -p $P/chromium-1243 $P/chromium_headless_shell-1243/chrome-headless-shell-linux64
ln -sfn /opt/pw-browsers/chromium-1194/chrome-linux $P/chromium-1243/chrome-linux64
for f in $H/*; do ln -sfn $f $P/chromium_headless_shell-1243/chrome-headless-shell-linux64/; done
ln -sfn $H/headless_shell $P/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
ln -sfn /opt/pw-browsers/ffmpeg-1011 $P/ffmpeg-1011
touch $P/chromium{,_headless_shell}-1243/{INSTALLATION_COMPLETE,DEPENDENCIES_VALIDATED}
mkdir -p /opt/google/chrome && ln -sfn /opt/pw-browsers/chromium-1194/chrome-linux/chrome /opt/google/chrome/chrome
```
