# Performance baseline before the Trifid retheme

Measured on the current site so later work can be compared with it. Nothing in the app was changed.

- Commit: `1e9ef508c3a8a26470a70b85fa8c0a513e3050ac` (branch `trifid-build`; app code identical to the live site)
- Date: 2026-10-04, 22:50 to 23:00 EDT (2026-10-05 02:50 to 03:00 UTC)
- Machine: MacBook Pro, Apple M1 Pro, 16 GB, macOS (Darwin 23.5.0). Shared with other work during the runs (load average 5 to 13), so read the spread, not only the median.
- Node: v22.23.3, `process.arch` = `arm64`
- Browser: Google Chrome 154.0.8037.93, headless, arm64 (both modes use the Chrome channel, as `scripts/perf/perf.mjs` does)
- Build: production (`npm ci && npm run build`, then the script's own `next start` on port 3200)

**Not Rosetta inflated.** Three checks: `node -p process.arch` printed `arm64` in every shell; the perf script and both scripts here call `assertNativeChrome` (`frontcreck/scripts/check-native.mjs`), which reads `chrome://version` or the browser's reported CPU architecture and stops unless Chrome is native arm64; and the numbers themselves are native-sized (typing to suggestions 4 to 10 ms, select to album about 20 ms; a translated Chrome gives about 50 times that).

## How `npm run perf` works

`node scripts/perf/perf.mjs` starts `next start` on port 3200, measures first-load JS and server HTML with `fetch`, then runs one headless Chrome per combination, in this order: software desktop, software phone, gpu desktop, gpu phone.

- Modes: `software` = `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`; `gpu` = `--use-angle=metal --enable-gpu --ignore-gpu-blocklist --enable-features=Metal`.
- Viewports: `desktop` 1440 x 900; `phone` 390 x 844, dpr 2, mobile, touch.
- Flags: `--mode software|gpu`, `--viewport desktop|phone`, `--build`, `--allow-software-gpu`.
- Each combination: load `/`, wait 4 s (search usable, startup long tasks, map first frame); type "loveless" in the hero search, pick the first suggestion (typing to suggestions, select to album, transition frame gap); on phones open map mode; press Sonic (slider to list, morph frame gap); load `/map`, drag for 2 s, wheel-zoom for 2 s (drag and zoom frame gaps); sit idle 3 s (long tasks and frames while idle).
- Frame-gap budgets (50 ms) are checked in GPU mode only; software frame gaps are reported, not judged.
- It writes `scripts/perf/out/perf-<time>.json` and exits 1 when a budget is missed.

## Commands used

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch   # arm64
cd frontcreck
npm ci && npm run build
# three full runs, one after another (each about 90 s, all four combinations)
for i in 1 2 3; do npm run perf > ../docs/design/trifid-theme/reviews/baseline/perf/perf-run$i.txt 2>&1; \
  cp "$(ls -t scripts/perf/out/*.json | head -1)" ../docs/design/trifid-theme/reviews/baseline/perf/perf-run$i.json; sleep 20; done
# hover path (desktop, gpu then software, 5 fresh loads each)
node ../docs/design/trifid-theme/reviews/baseline/hover-measure.mjs \
     ../docs/design/trifid-theme/reviews/baseline/perf/hover.json http://127.0.0.1:3500 --start
```

Raw output: `perf/perf-run1.json` to `perf-run3.json` (the script's own JSON), `perf/perf-run1.txt` to `perf-run3.txt` (its console output), `perf/hover.json`, `perf/hover.txt`.

## Sizes (same in all three runs)

| Measure | Value | Budget |
|---|---|---|
| First-load JS of `/`, gzip, with nomodule scripts | 190.5 KB | 200 KB |
| First-load JS of `/`, gzip, without nomodule scripts | 151.9 KB | reported only |
| three.js chunk in the first-load scripts | 0 KB | must be 0 |
| Server HTML of `/` | 28.3 KB | 150 KB |
| Server HTML of `/album/in-rainbows-radiohead` | 34 KB | 150 KB |

First-load JS is 9.5 KB under its budget. The retheme has little room there.

## Medians (three runs)

| Median | software desktop | software phone | gpu desktop | gpu phone |
|---|---|---|---|---|
| Search usable (ms) | 121 | 127 | 84 | 74 |
| Startup worst long task (ms) | 57 | 0 | 0 | 0 |
| WebGL warm-up end (ms) | 3578 | 2455 | 132 | 116 |
| Map first frame (ms) | 4074 | 2903 | 575 | 554 |
| Typing to suggestions (ms) | 6 | 5 | 7 | 5 |
| Select to album (ms) | 24 | 18 | 22 | 19 |
| Transition worst frame gap (ms) | 1355 | 784 | 28 | 18 |
| Slider to list (ms) | 8 | 16 | 12 | 13 |
| Morph worst frame gap (ms) | 153 | 114 | 18 | 18 |
| Drag worst frame gap (ms) | 95 | 79 | 19 | 19 |
| Zoom worst frame gap (ms) | 202 | 53 | 38 | 44 |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 |

Budgets: search usable 1000 ms, startup long task 250 ms, typing to suggestions 100 ms, select to album 200 ms, slider to list 150 ms, frame gaps 50 ms (GPU only), long tasks while idle 0, frames while idle at most 1.

## Budget results per run

- Run 1: gpu desktop: startup long task 345 ms > 250 ms; gpu phone: zoom frame gap 53 ms > 50 ms
- Run 2: software phone: slider to list 181 ms > 150 ms
- Run 3: all budgets met

So the script does not pass every time on this commit on this machine. The three misses are each a single outlier in one run (see the tables): a 345 ms startup long task on gpu desktop (0 in the other two runs), a 53 ms zoom frame gap on gpu phone (budget 50; 42 and 44 in the others), and a 181 ms slider-to-list on software phone (7 and 16 in the others). Treat them as noise from the shared machine, but note that the GPU zoom frame gap sits close to its budget (median 38 desktop, 44 phone).

## Every run, per combination

### software desktop

Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)

| Metric | Run 1 | Run 2 | Run 3 | Median | Min to max | Budget |
|---|---|---|---|---|---|---|
| Search usable (ms) | 121 | 92 | 137 | 121 | 92 to 137 | 1000 |
| Startup worst long task (ms) | 0 | 57 | 122 | 57 | 0 to 122 | 250 |
| WebGL warm-up end (ms) | 3493 | 3578 | 3712 | 3578 | 3493 to 3712 | reported only |
| Map first frame (ms) | 3937 | 4074 | 4267 | 4074 | 3937 to 4267 | reported only |
| Typing to suggestions (ms) | 5 | 6 | 6 | 6 | 5 to 6 | 100 |
| Select to album (ms) | 17 | 24 | 35 | 24 | 17 to 35 | 200 |
| Transition worst frame gap (ms) | 1296 | 1355 | 1642 | 1355 | 1296 to 1642 | 50 (GPU only; not checked in software) |
| Slider to list (ms) | 7 | 8 | 13 | 8 | 7 to 13 | 150 |
| Morph worst frame gap (ms) | 153 | 141 | 219 | 153 | 141 to 219 | 50 (GPU only; not checked in software) |
| Drag worst frame gap (ms) | 85 | 105 | 95 | 95 | 85 to 105 | 50 (GPU only; not checked in software) |
| Zoom worst frame gap (ms) | 189 | 202 | 226 | 202 | 189 to 226 | 50 (GPU only; not checked in software) |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 to 0 | 0 |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 to 0 | 1 |

Map settled before each step: [true], [true], [true]. Console errors per run: 0, 0, 0. Warm-up ended by: cap, cap, cap. thumbs.webp on first load: false, false, false.

### software phone

Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)

| Metric | Run 1 | Run 2 | Run 3 | Median | Min to max | Budget |
|---|---|---|---|---|---|---|
| Search usable (ms) | 179 | 127 | 80 | 127 | 80 to 179 | 1000 |
| Startup worst long task (ms) | 0 | 0 | 0 | 0 | 0 to 0 | 250 |
| WebGL warm-up end (ms) | 2455 | 2578 | 2360 | 2455 | 2360 to 2578 | reported only |
| Map first frame (ms) | 2903 | 3028 | 2811 | 2903 | 2811 to 3028 | reported only |
| Typing to suggestions (ms) | 5 | 5 | 4 | 5 | 4 to 5 | 100 |
| Select to album (ms) | 18 | 77 | 17 | 18 | 17 to 77 | 200 |
| Transition worst frame gap (ms) | 738 | 892 | 784 | 784 | 738 to 892 | 50 (GPU only; not checked in software) |
| Slider to list (ms) | 7 | 181 | 16 | 16 | 7 to 181 | 150 |
| Morph worst frame gap (ms) | 114 | 112 | 119 | 114 | 112 to 119 | 50 (GPU only; not checked in software) |
| Drag worst frame gap (ms) | 74 | 79 | 117 | 79 | 74 to 117 | 50 (GPU only; not checked in software) |
| Zoom worst frame gap (ms) | 53 | 55 | 49 | 53 | 49 to 55 | 50 (GPU only; not checked in software) |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 to 0 | 0 |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 to 0 | 1 |

Map settled before each step: [true,true], [true,true], [true,true]. Console errors per run: 0, 0, 0. Warm-up ended by: done, done, done. thumbs.webp on first load: false, false, false.

### gpu desktop

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)

| Metric | Run 1 | Run 2 | Run 3 | Median | Min to max | Budget |
|---|---|---|---|---|---|---|
| Search usable (ms) | 97 | 84 | 83 | 84 | 83 to 97 | 1000 |
| Startup worst long task (ms) | 345 | 0 | 0 | 0 | 0 to 345 | 250 |
| WebGL warm-up end (ms) | 145 | 132 | 132 | 132 | 132 to 145 | reported only |
| Map first frame (ms) | 907 | 575 | 574 | 575 | 574 to 907 | reported only |
| Typing to suggestions (ms) | 7 | 10 | 6 | 7 | 6 to 10 | 100 |
| Select to album (ms) | 22 | 21 | 24 | 22 | 21 to 24 | 200 |
| Transition worst frame gap (ms) | 28 | 27 | 28 | 28 | 27 to 28 | 50 |
| Slider to list (ms) | 12 | 7 | 16 | 12 | 7 to 16 | 150 |
| Morph worst frame gap (ms) | 18 | 18 | 20 | 18 | 18 to 20 | 50 |
| Drag worst frame gap (ms) | 18 | 21 | 19 | 19 | 18 to 21 | 50 |
| Zoom worst frame gap (ms) | 34 | 43 | 38 | 38 | 34 to 43 | 50 |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 to 0 | 0 |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 to 0 | 1 |

Map settled before each step: [true], [true], [true]. Console errors per run: 0, 0, 0. Warm-up ended by: done, done, done. thumbs.webp on first load: false, false, false.

### gpu phone

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)

| Metric | Run 1 | Run 2 | Run 3 | Median | Min to max | Budget |
|---|---|---|---|---|---|---|
| Search usable (ms) | 72 | 78 | 74 | 74 | 72 to 78 | 1000 |
| Startup worst long task (ms) | 0 | 0 | 0 | 0 | 0 to 0 | 250 |
| WebGL warm-up end (ms) | 113 | 129 | 116 | 116 | 113 to 129 | reported only |
| Map first frame (ms) | 551 | 562 | 554 | 554 | 551 to 562 | reported only |
| Typing to suggestions (ms) | 5 | 4 | 6 | 5 | 4 to 6 | 100 |
| Select to album (ms) | 18 | 19 | 19 | 19 | 18 to 19 | 200 |
| Transition worst frame gap (ms) | 18 | 18 | 18 | 18 | 18 to 18 | 50 |
| Slider to list (ms) | 15 | 12 | 13 | 13 | 12 to 15 | 150 |
| Morph worst frame gap (ms) | 18 | 18 | 17 | 18 | 17 to 18 | 50 |
| Drag worst frame gap (ms) | 19 | 22 | 19 | 19 | 19 to 22 | 50 |
| Zoom worst frame gap (ms) | 53 | 42 | 44 | 44 | 42 to 53 | 50 |
| Long tasks while idle (3 s) | 0 | 0 | 0 | 0 | 0 to 0 | 0 |
| Frames while idle (3 s) | 0 | 0 | 0 | 0 | 0 to 0 | 1 |

Map settled before each step: [true,true], [true,true], [true,true]. Console errors per run: 0, 0, 0. Warm-up ended by: done, done, done. thumbs.webp on first load: false, false, false.

## Hover path (not covered by `npm run perf`)

Script: `hover-measure.mjs` (its header has the full method). On a fresh load of `/map` at Overview (a new browser context each time, 2 s of idle after the map has drawn), the pointer makes one move from off the map onto an album; then off, and onto a second album; then a third. Desktop 1440 x 900, 5 fresh loads per mode.

What to know when reading it:

- The site waits 80 ms before showing the tip (`DURATION.hoverLabel`, `src/lib/media.ts:7`), so 80 ms is the floor. The tip has no fade; it is filled by React, then placed and shown from the map's next drawn frame.
- "Tip visible" is the number to compare: from the pointermove event's own timestamp to the tip having its text and computed opacity 1.
- The first hover after a load costs about 50 ms more than later ones (first render of the tip, its cover image, first hit test), with one long task of 55 ms seen once in five GPU loads.
- "Longest long task" comes from the Long Tasks API, which only reports tasks of 50 ms or more; 0 means none. "Longest frame gap" catches shorter stalls (16.7 ms is one frame at 60 Hz). In software mode each map frame takes 50 to 80 ms to draw, which is what the frame gap shows there.
- "First frame after tip visible" uses the frame's start time, which can be earlier than the moment the tip was shown inside a late frame; do not read it as later-than-visible.

| Median, ms | gpu 1st | gpu 2nd | gpu 3rd | software 1st | software 2nd | software 3rd |
|---|---|---|---|---|---|---|
| Pointer move to tip visible | 150.3 (135.7 to 169.3) | 101.2 (90.6 to 106.8) | 90.3 (89.7 to 115.7) | 135.5 (133 to 149.4) | 91.6 (85.9 to 107.7) | 88.1 (84.9 to 93.1) |
| Longest long task | 0 (0 to 55) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) | 0 (0 to 0) |
| Longest frame gap | 33.3 (16.8 to 50) | 16.8 (16.7 to 16.8) | 16.8 (16.7 to 16.8) | 66.7 (49.9 to 66.7) | 66.7 (66.7 to 83.3) | 66.7 (50.1 to 83.4) |

### Hover, gpu desktop

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version). Chrome 154.0.8037.93, arm64.

| Hover | Metric | Load 1 | Load 2 | Load 3 | Load 4 | Load 5 | Median | Min to max |
|---|---|---|---|---|---|---|---|---|
| 1st (fresh load) | Pointer move to tip visible (ms) | 135.7 | 169.3 | 150.2 | 153.8 | 150.3 | 150.3 | 135.7 to 169.3 |
| 1st (fresh load) | Pointer move to tip text in DOM (ms) | 95.7 | 102 | 96.3 | 105.9 | 111.2 | 102 | 95.7 to 111.2 |
| 1st (fresh load) | Pointer move to first frame after tip visible (ms) | 123.3 | 163.7 | 139.3 | 146.1 | 134.5 | 139.3 | 123.3 to 163.7 |
| 1st (fresh load) | Longest long task (ms, 0 = none of 50 ms or more) | 0 | 55 | 0 | 0 | 0 | 0 | 0 to 55 |
| 1st (fresh load) | Longest frame gap (ms) | 33.3 | 50 | 33.3 | 33.4 | 16.8 | 33.3 | 16.8 to 50 |
| 1st (fresh load) | Longest pointer event (ms, Event Timing, 0 = none of 16 ms or more) | 16 | 24 | 16 | 24 | 32 | 24 | 16 to 32 |
| 1st (fresh load) | Map frames drawn | 3 | 3 | 3 | 3 | 3 | 3 | 3 to 3 |
| 2nd | Pointer move to tip visible (ms) | 101.2 | 106.8 | 106.7 | 92.4 | 90.6 | 101.2 | 90.6 to 106.8 |
| 2nd | Pointer move to tip text in DOM (ms) | 100 | 104.6 | 104.3 | 91 | 88.7 | 100 | 88.7 to 104.6 |
| 2nd | Pointer move to first frame after tip visible (ms) | 116.2 | 115.2 | 116.2 | 106.4 | 100.6 | 115.2 | 100.6 to 116.2 |
| 2nd | Longest long task (ms, 0 = none of 50 ms or more) | 0 | 0 | 0 | 0 | 0 | 0 | 0 to 0 |
| 2nd | Longest frame gap (ms) | 16.7 | 16.8 | 16.8 | 16.8 | 16.8 | 16.8 | 16.7 to 16.8 |
| 2nd | Longest pointer event (ms, Event Timing, 0 = none of 16 ms or more) | 16 | 24 | 24 | 0 | 0 | 16 | 0 to 24 |
| 2nd | Map frames drawn | 3 | 3 | 3 | 3 | 3 | 3 | 3 to 3 |
| 3rd | Pointer move to tip visible (ms) | 89.7 | 90.2 | 115.7 | 101.7 | 90.3 | 90.3 | 89.7 to 115.7 |
| 3rd | Pointer move to tip text in DOM (ms) | 88.4 | 88.6 | 99.2 | 100.2 | 89.6 | 89.6 | 88.4 to 100.2 |
| 3rd | Pointer move to first frame after tip visible (ms) | 101.2 | 99.9 | 130.3 | 114.7 | 105.3 | 105.3 | 99.9 to 130.3 |
| 3rd | Longest long task (ms, 0 = none of 50 ms or more) | 0 | 0 | 0 | 0 | 0 | 0 | 0 to 0 |
| 3rd | Longest frame gap (ms) | 16.8 | 16.8 | 16.8 | 16.7 | 16.8 | 16.8 | 16.7 to 16.8 |
| 3rd | Longest pointer event (ms, Event Timing, 0 = none of 16 ms or more) | 0 | 0 | 24 | 16 | 0 | 0 | 0 to 24 |
| 3rd | Map frames drawn | 3 | 3 | 3 | 3 | 3 | 3 | 3 to 3 |

Startup worst long task before the first hover, per load: 0, 0, 0, 0, 0 ms. Album hovered (tip title): 11 "In Rainbows", 42 "Vespertine", 300 "Construção".

### Hover, software desktop

Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver). Chrome 154.0.8037.93, arm64.

| Hover | Metric | Load 1 | Load 2 | Load 3 | Load 4 | Load 5 | Median | Min to max |
|---|---|---|---|---|---|---|---|---|
| 1st (fresh load) | Pointer move to tip visible (ms) | 133.7 | 149.4 | 135.5 | 133 | 146.5 | 135.5 | 133 to 149.4 |
| 1st (fresh load) | Pointer move to tip text in DOM (ms) | 86.7 | 101.3 | 93.5 | 91.9 | 103 | 93.5 | 86.7 to 103 |
| 1st (fresh load) | Pointer move to first frame after tip visible (ms) | 117.2 | 148.4 | 121.7 | 122.1 | 132.4 | 122.1 | 117.2 to 148.4 |
| 1st (fresh load) | Longest long task (ms, 0 = none of 50 ms or more) | 0 | 0 | 0 | 0 | 0 | 0 | 0 to 0 |
| 1st (fresh load) | Longest frame gap (ms) | 49.9 | 66.7 | 66.7 | 66.7 | 66.7 | 66.7 | 49.9 to 66.7 |
| 1st (fresh load) | Longest pointer event (ms, Event Timing, 0 = none of 16 ms or more) | 88 | 112 | 104 | 96 | 104 | 104 | 88 to 112 |
| 1st (fresh load) | Map frames drawn | 3 | 3 | 3 | 3 | 3 | 3 | 3 to 3 |
| 2nd | Pointer move to tip visible (ms) | 85.9 | 93.1 | 107.7 | 91.6 | 87 | 91.6 | 85.9 to 107.7 |
| 2nd | Pointer move to tip text in DOM (ms) | 85 | 92.5 | 90.7 | 91.1 | 86.3 | 90.7 | 85 to 92.5 |
| 2nd | Pointer move to first frame after tip visible (ms) | 100.7 | 108.2 | 122.4 | 106.3 | 102.5 | 106.3 | 100.7 to 122.4 |
| 2nd | Longest long task (ms, 0 = none of 50 ms or more) | 0 | 0 | 0 | 0 | 0 | 0 | 0 to 0 |
| 2nd | Longest frame gap (ms) | 66.7 | 66.7 | 66.7 | 83.3 | 83.3 | 66.7 | 66.7 to 83.3 |
| 2nd | Longest pointer event (ms, Event Timing, 0 = none of 16 ms or more) | 88 | 80 | 88 | 88 | 88 | 88 | 80 to 88 |
| 2nd | Map frames drawn | 3 | 3 | 3 | 3 | 3 | 3 | 3 to 3 |
| 3rd | Pointer move to tip visible (ms) | 88.1 | 93.1 | 92.8 | 85.3 | 84.9 | 88.1 | 84.9 to 93.1 |
| 3rd | Pointer move to tip text in DOM (ms) | 87.2 | 91.4 | 92.3 | 84 | 82.4 | 87.2 | 82.4 to 92.3 |
| 3rd | Pointer move to first frame after tip visible (ms) | 103.5 | 108.8 | 107.9 | 100.3 | 100.3 | 103.5 | 100.3 to 108.8 |
| 3rd | Longest long task (ms, 0 = none of 50 ms or more) | 0 | 0 | 0 | 0 | 0 | 0 | 0 to 0 |
| 3rd | Longest frame gap (ms) | 50.1 | 66.6 | 66.7 | 66.7 | 83.4 | 66.7 | 50.1 to 83.4 |
| 3rd | Longest pointer event (ms, Event Timing, 0 = none of 16 ms or more) | 88 | 80 | 96 | 88 | 80 | 88 | 80 to 96 |
| 3rd | Map frames drawn | 3 | 3 | 3 | 3 | 3 | 3 | 3 to 3 |

Startup worst long task before the first hover, per load: 0, 0, 0, 0, 0 ms. Album hovered (tip title): 11 "In Rainbows", 42 "Vespertine", 300 "Construção".
