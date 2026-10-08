# Trifid prototype: accessibility review

Reviewed 2026-10-03 against WCAG 2.2 AA. Scope: `prototype/index.html`, `src/*.js`, `src/css/*.css`, `COPY.md`, and the screenshots in `prototype/shots/`. Nothing in the prototype was edited.

Verdict: not ready to ship. Text at rest on the map is in better shape than it looks, because the scrim logic works. The failures are elsewhere: keyboard focus never reaches the album panel, the region card is cut off at 200% zoom, the colour sentence and the edge pointers fail contrast over gas, stars vanish on the gold core, and the five families collapse to two or three for colour-blind readers with no path that works on touch.

## How the numbers were made

- One headless run per state dumped the page's text rectangles (a `Range` box per text node), computed colour, size, weight and effective opacity. The same states are the ones in `shots/`. Runs take about 3 s each and went one at a time behind the shared lock.
- For each rectangle the script samples the screenshot. Text is the median of the brightest tenth of pixels inside the box (darkest tenth for dark on light). Ground is the median of the box grown by 3 px. "Brighter quarter" is the 75th percentile of the non-text pixels, to show what happens over the lighter gas behind the same label.
- **Pixel** is text sample against ground sample. **CSS ink on sampled ground** is the declared colour at its effective opacity, composited over the sampled ground. This is the number WCAG defines, with the ground taken from pixels so the scrim, gas and vignette are all included.
- Result: FAIL when the CSS number is under the requirement. "marginal" when it passes on the median ground and fails on the brighter quarter. Requirement is 4.5:1, or 3:1 at 24 px and up. Cormorant 600 is not bold, so 18.7 px labels do not get the large-text allowance.
- Six extra screenshots were taken: five focus states at `#/map` and one 640 x 360 viewport. They and the scripts are in the session scratch folder (`measure.py`, `tables.py`, `cvd.py`, `nontext.py`, `probe.js`).

Limits of pixel sampling:

- It under-reads thin and small text. A 15 px Cormorant 500 stroke is under one pixel wide, so no pixel ever reaches the ink colour. Fair labels read 2.4 to 3.8 from pixels while the ink on the same ground computes to 4.9 to 5.3. Both numbers are real: the second is the WCAG figure, the first is closer to what a low-vision reader gets.
- Stars under a label are white and land in the brightest tenth, so a label with stars behind it can over-read.
- JPG at quality 85 adds noise of a few levels. Text shadows are not modelled in the CSS number (they help slightly).
- Phone probes include elements hidden behind the album list. Those rows were dropped.

Cross-check against `src/labels.js`: `scrimFor` solves for 4.6:1 using the brightest gas luminance in the label box (`Gas.lumIn` returns the maximum, which is the safe choice) times 1.1. Measured labels at rest land between 4.9 and 9.9, so the solver does what it says. Its gaps are listed in finding 6. Declared label ink is the family colour lightened 86% (`data.js`), not the 70% in `UX.md`, and fair labels are drawn at full opacity, not 75%. Both deviations help contrast and should be kept.

## 1. Contrast tables
### 1.1 Region labels and sub-lines at rest

**Overview, Balanced** (`map-overview.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| URBAN CLUSTER | 22.7 px, 600 | 5.47 | 7.98 | 5.68 | 4.5 | pass |
| urban · sampling (sub-line) | 12.5 px, 400 | 3.75 | 7.84 | 7.26 | 4.5 | pass |
| PLAYFUL WAY | 22.3 px, 600 | 4.67 | 5.61 | 5.10 | 4.5 | pass |
| playful · energetic (sub-line) | 12.5 px, 400 | 3.97 | 5.42 | 4.95 | 4.5 | pass |
| PROGRESSIVE SPIRAL | 21.5 px, 600 | 4.25 | 5.98 | 5.29 | 4.5 | pass |
| progressive · complex (sub-line) | 12.5 px, 400 | 3.58 | 5.88 | 5.51 | 4.5 | pass |
| ETHEREAL VEIL | 21.1 px, 600 | 5.00 | 5.79 | 5.32 | 4.5 | pass |
| ethereal · atmospheric (sub-line) | 12.5 px, 400 | 4.30 | 5.84 | 5.48 | 4.5 | pass |
| WARM HALO | 20.9 px, 600 | 6.30 | 7.52 | 6.57 | 4.5 | pass |
| warm · rhythmic (sub-line) | 12.5 px, 400 | 3.91 | 6.15 | 5.79 | 4.5 | pass |
| SOMBRE VOID | 20.9 px, 600 | 6.42 | 6.75 | 6.02 | 4.5 | pass |
| sombre · cold (sub-line) | 12.5 px, 400 | 6.21 | 7.38 | 6.48 | 4.5 | pass |
| EPIC EXPANSE (fair) | 16.0 px, 500 | 3.60 | 5.34 | 4.90 | 4.5 | pass |
| THE BITTERSWEET REACH (fair) | 15.9 px, 500 | 2.84 | 5.22 | 4.33 | 4.5 | marginal |
| ECLECTIC CLOUD (fair) | 15.3 px, 500 | 2.38 | 4.89 | 4.60 | 4.5 | pass |

**Whole map** (`map-whole.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| IMPROV ARM | 19.9 px, 600 | 5.74 | 8.06 | 7.03 | 4.5 | pass |
| improvisation · acoustic (sub-line) | 12.5 px, 400 | 4.84 | 6.95 | 5.80 | 4.5 | pass |
| THE QUIET DEEP | 19.4 px, 600 | 5.73 | 8.84 | 7.84 | 4.5 | pass |
| quiet · instrumental (sub-line) | 12.5 px, 400 | 3.78 | 6.97 | 6.01 | 4.5 | pass |
| URBAN CLUSTER | 19.3 px, 600 | 6.20 | 9.94 | 7.65 | 4.5 | pass |
| urban · sampling (sub-line) | 12.5 px, 400 | 3.52 | 6.98 | 5.98 | 4.5 | pass |
| PLAYFUL WAY | 18.9 px, 600 | 4.45 | 6.68 | 5.93 | 4.5 | pass |
| playful · energetic (sub-line) | 12.5 px, 400 | 3.16 | 5.75 | 5.12 | 4.5 | pass |
| AGGRESSIVE RIFT | 18.8 px, 600 | 4.89 | 7.60 | 6.50 | 4.5 | pass |
| aggressive · heavy (sub-line) | 12.5 px, 400 | 3.96 | 6.64 | 5.48 | 4.5 | pass |
| THE LIVE BELT | 18.7 px, 600 | 7.19 | 8.58 | 7.09 | 4.5 | pass |
| live recordings (sub-line) | 12.5 px, 400 | 4.98 | 6.85 | 5.91 | 4.5 | pass |
| PROGRESSIVE SPIRAL | 18.2 px, 600 | 5.77 | 6.80 | 5.82 | 4.5 | pass |
| progressive · complex (sub-line) | 12.5 px, 400 | 5.17 | 7.69 | 6.96 | 4.5 | pass |
| ETHEREAL VEIL | 18.0 px, 600 | 5.02 | 7.85 | 6.47 | 4.5 | pass |
| ethereal · atmospheric (sub-line) | 12.5 px, 400 | 3.99 | 7.18 | 6.35 | 4.5 | pass |

**Mood stop** (`slider-mood.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| LONGING | 23.6 px, 600 | 4.75 | 6.77 | 5.84 | 4.5 | pass |
| longing · melancholic (sub-line) | 12.5 px, 400 | 3.08 | 5.57 | 4.85 | 4.5 | pass |
| URBAN CLUSTER | 22.4 px, 600 | 4.89 | 6.82 | 6.19 | 4.5 | pass |
| urban · sampling (sub-line) | 12.5 px, 400 | 3.31 | 5.77 | 5.26 | 4.5 | pass |
| QUIRKY | 21.8 px, 600 | 4.19 | 5.86 | 5.38 | 4.5 | pass |
| quirky · playful (sub-line) | 12.5 px, 400 | 2.59 | 5.04 | 4.74 | 4.5 | pass |
| PROGRESSIVE SPIRAL | 21.6 px, 600 | 4.53 | 6.45 | 5.66 | 4.5 | pass |
| progressive · complex (sub-line) | 12.5 px, 400 | 3.53 | 6.84 | 6.34 | 4.5 | pass |
| MELLOW | 21.5 px, 600 | 6.00 | 6.34 | 5.74 | 4.5 | pass |
| mellow · romantic (sub-line) | 12.5 px, 400 | 4.40 | 5.71 | 5.29 | 4.5 | pass |
| SOMBRE VOID | 21.3 px, 600 | 5.93 | 7.21 | 6.31 | 4.5 | pass |
| sombre · dark (sub-line) | 12.5 px, 400 | 4.30 | 6.30 | 5.68 | 4.5 | pass |
| PSYCHEDELIC | 19.9 px, 600 | 5.10 | 6.52 | 5.95 | 4.5 | pass |
| psychedelic · summer (sub-line) | 12.5 px, 400 | 3.80 | 5.36 | 5.00 | 4.5 | pass |
| ANTHEMIC (fair) | 15.4 px, 500 | 2.63 | 5.23 | 4.89 | 4.5 | pass |
| ENERGETIC (fair) | 15.0 px, 500 | 2.55 | 4.88 | 4.50 | 4.5 | pass |
| EPIC EXPANSE (fair) | 15.0 px, 500 | 3.15 | 5.21 | 4.86 | 4.5 | pass |
| MELODIC (fair) | 15.0 px, 500 | 2.75 | 4.92 | 4.61 | 4.5 | pass |
| WARM HALO (fair) | 14.9 px, 500 | 4.28 | 5.95 | 5.40 | 4.5 | pass |

**Sonic stop** (`slider-sonic.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| HEAVY | 24.0 px, 600 | 5.32 | 5.74 | 5.41 | 3.0 | pass |
| heavy · aggressive (sub-line) | 12.5 px, 400 | 4.28 | 5.38 | 4.97 | 4.5 | pass |
| ATMOSPHERIC | 24.0 px, 600 | 5.25 | 6.77 | 6.37 | 3.0 | pass |
| atmospheric · hypnotic (sub-line) | 12.5 px, 400 | 3.04 | 5.86 | 5.35 | 4.5 | pass |
| URBAN CLUSTER | 22.5 px, 600 | 4.89 | 6.70 | 5.86 | 4.5 | pass |
| urban · sampling (sub-line) | 12.5 px, 400 | 3.88 | 6.64 | 5.77 | 4.5 | pass |
| DANCEABLE | 19.9 px, 600 | 7.53 | 8.20 | 7.56 | 4.5 | pass |
| high danceability · rhythmic (sub-line) | 12.5 px, 400 | 4.95 | 6.46 | 5.91 | 4.5 | pass |
| LUSH | 19.8 px, 600 | 5.43 | 7.14 | 6.74 | 4.5 | pass |
| lush · warm (sub-line) | 12.5 px, 400 | 4.05 | 5.96 | 5.57 | 4.5 | pass |
| PLAYFUL WAY (fair) | 15.9 px, 500 | 3.14 | 5.00 | 4.61 | 4.5 | pass |
| PROGRESSIVE SPIRAL (fair) | 15.4 px, 500 | 2.72 | 5.23 | 4.80 | 4.5 | pass |

**10,000-point stress** (`stress-overview.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| PASTORAL NEBULA | 20.9 px, 600 | 5.40 | 6.75 | 6.00 | 4.5 | pass |
| pastoral · mellow (sub-line) | 12.5 px, 400 | 4.93 | 6.13 | 5.47 | 4.5 | pass |
| ROMANTIC | 20.9 px, 600 | 6.95 | 9.07 | 8.19 | 4.5 | pass |
| romantic · soothing (sub-line) | 12.5 px, 400 | 4.67 | 7.43 | 6.77 | 4.5 | pass |
| QUIRKY | 20.6 px, 600 | 6.00 | 7.11 | 6.39 | 4.5 | pass |
| quirky · playful (sub-line) | 12.5 px, 400 | 3.86 | 5.82 | 5.38 | 4.5 | pass |
| ANTHEMIC | 20.5 px, 600 | 3.78 | 5.68 | 5.27 | 4.5 | pass |
| anthemic · heavy (sub-line) | 12.5 px, 400 | 2.85 | 5.47 | 5.18 | 4.5 | pass |
| PARTY | 20.4 px, 600 | 4.55 | 6.29 | 5.80 | 4.5 | pass |
| party · urban (sub-line) | 12.5 px, 400 | 3.29 | 5.60 | 5.21 | 4.5 | pass |
| FUTURISTIC | 19.7 px, 600 | 4.50 | 6.97 | 6.53 | 4.5 | pass |
| futuristic · mechanical (sub-line) | 12.5 px, 400 | 3.71 | 6.30 | 5.77 | 4.5 | pass |
| PROGRESSIVE SPIRAL | 19.5 px, 600 | 5.15 | 6.02 | 5.36 | 4.5 | pass |
| progressive · uncommon time signatures (sub-line) | 12.5 px, 400 | 4.24 | 5.92 | 5.31 | 4.5 | pass |
| HYPNOTIC ORBIT | 19.5 px, 600 | 5.56 | 7.61 | 6.13 | 4.5 | pass |
| hypnotic · surreal (sub-line) | 12.5 px, 400 | 4.31 | 7.04 | 6.11 | 4.5 | pass |
| TRIUMPHANT | 20.1 px, 600 | 5.49 | 6.88 | 6.05 | 4.5 | pass |
| triumphant · aggressive (sub-line) | 12.5 px, 400 | 4.44 | 6.05 | 5.58 | 4.5 | pass |
| AUTUMN | 19.6 px, 600 | 5.86 | 6.57 | 5.42 | 4.5 | pass |
| autumn · melancholic (sub-line) | 12.5 px, 400 | 4.57 | 5.87 | 5.02 | 4.5 | pass |
| FUNEREAL | 19.5 px, 600 | 5.74 | 6.65 | 5.77 | 4.5 | pass |
| funereal · ominous (sub-line) | 12.5 px, 400 | 5.18 | 6.80 | 6.24 | 4.5 | pass |
| COLD (fair) | 15.4 px, 500 | 3.67 | 8.55 | 8.10 | 4.5 | pass |
| MELLOW (fair) | 15.2 px, 500 | 3.79 | 5.33 | 4.91 | 4.5 | pass |
| TROPICAL (fair) | 15.2 px, 500 | 3.25 | 5.26 | 4.72 | 4.5 | pass |

**Overview with the live gas shader (label boxes from the baked run)** (`gas-live-overview.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| URBAN CLUSTER | 22.7 px, 600 | 5.48 | 7.98 | 5.66 | 4.5 | pass |
| urban · sampling (sub-line) | 12.5 px, 400 | 3.75 | 7.86 | 7.21 | 4.5 | pass |
| PLAYFUL WAY | 22.3 px, 600 | 4.62 | 5.60 | 5.11 | 4.5 | pass |
| playful · energetic (sub-line) | 12.5 px, 400 | 3.95 | 5.44 | 4.96 | 4.5 | pass |
| PROGRESSIVE SPIRAL | 21.5 px, 600 | 4.25 | 5.98 | 5.28 | 4.5 | pass |
| progressive · complex (sub-line) | 12.5 px, 400 | 3.54 | 5.90 | 5.50 | 4.5 | pass |
| ETHEREAL VEIL | 21.1 px, 600 | 4.96 | 5.78 | 5.31 | 4.5 | pass |
| ethereal · atmospheric (sub-line) | 12.5 px, 400 | 4.36 | 5.86 | 5.46 | 4.5 | pass |
| WARM HALO | 20.9 px, 600 | 6.30 | 7.53 | 6.58 | 4.5 | pass |
| warm · rhythmic (sub-line) | 12.5 px, 400 | 3.91 | 6.16 | 5.80 | 4.5 | pass |
| SOMBRE VOID | 20.9 px, 600 | 6.45 | 6.79 | 6.02 | 4.5 | pass |
| sombre · cold (sub-line) | 12.5 px, 400 | 6.21 | 7.38 | 6.49 | 4.5 | pass |
| EPIC EXPANSE (fair) | 16.0 px, 500 | 3.63 | 5.31 | 4.88 | 4.5 | pass |
| THE BITTERSWEET REACH (fair) | 15.9 px, 500 | 2.86 | 5.25 | 4.32 | 4.5 | marginal |
| ECLECTIC CLOUD (fair) | 15.3 px, 500 | 2.39 | 4.89 | 4.61 | 4.5 | pass |

**Overview, site chrome** (`chrome-site-overview.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| URBAN CLUSTER | 22.7 px, 600 | 5.47 | 7.98 | 5.68 | 4.5 | pass |
| urban · sampling (sub-line) | 12.5 px, 400 | 3.75 | 7.84 | 7.26 | 4.5 | pass |
| PLAYFUL WAY | 22.3 px, 600 | 4.67 | 5.61 | 5.10 | 4.5 | pass |
| playful · energetic (sub-line) | 12.5 px, 400 | 3.97 | 5.42 | 4.95 | 4.5 | pass |
| PROGRESSIVE SPIRAL | 21.5 px, 600 | 4.25 | 5.98 | 5.29 | 4.5 | pass |
| progressive · complex (sub-line) | 12.5 px, 400 | 3.58 | 5.88 | 5.51 | 4.5 | pass |
| ETHEREAL VEIL | 21.1 px, 600 | 5.00 | 5.79 | 5.32 | 4.5 | pass |
| ethereal · atmospheric (sub-line) | 12.5 px, 400 | 4.30 | 5.84 | 5.48 | 4.5 | pass |
| WARM HALO | 20.9 px, 600 | 6.30 | 7.52 | 6.57 | 4.5 | pass |
| warm · rhythmic (sub-line) | 12.5 px, 400 | 3.91 | 6.15 | 5.79 | 4.5 | pass |
| SOMBRE VOID | 20.9 px, 600 | 6.42 | 6.75 | 6.02 | 4.5 | pass |
| sombre · cold (sub-line) | 12.5 px, 400 | 6.21 | 7.38 | 6.48 | 4.5 | pass |
| EPIC EXPANSE (fair) | 16.0 px, 500 | 3.60 | 5.34 | 4.90 | 4.5 | pass |
| THE BITTERSWEET REACH (fair) | 15.9 px, 500 | 2.84 | 5.22 | 4.33 | 4.5 | marginal |
| ECLECTIC CLOUD (fair) | 15.3 px, 500 | 2.38 | 4.89 | 4.60 | 4.5 | pass |

### 1.2 Edge pointers

**Overview** (`map-overview.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| AGGRESSIVE RIFT | 12.5 px, 600 | 3.81 | 5.93 | 5.18 | 4.5 | pass |
| LONELY DRIFT | 12.5 px, 600 | 4.60 | 5.90 | 5.35 | 4.5 | pass |
| RAW FLARE | 12.5 px, 600 | 2.35 | 3.69 | 3.06 | 4.5 | FAIL |
| THE LIVE BELT | 12.5 px, 600 | 3.23 | 5.24 | 4.76 | 4.5 | pass |

**Mood stop** (`slider-mood.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| OMINOUS | 12.5 px, 600 | 4.53 | 6.45 | 5.68 | 4.5 | pass |
| MYSTERIOUS | 12.5 px, 600 | 5.20 | 7.83 | 7.29 | 4.5 | pass |
| SOOTHING | 12.5 px, 600 | 6.31 | 8.85 | 7.95 | 4.5 | pass |
| AGGRESSIVE RIFT | 12.5 px, 600 | 3.23 | 4.89 | 4.26 | 4.5 | marginal |

**Sonic stop** (`slider-sonic.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| IMPROV ARM | 12.5 px, 600 | 3.26 | 4.68 | 2.86 | 4.5 | marginal |
| THE BITTERSWEET REACH | 12.5 px, 600 | 2.91 | 4.45 | 3.97 | 4.5 | FAIL |
| THE LIVE BELT | 12.5 px, 600 | 5.16 | 8.92 | 8.20 | 4.5 | pass |
| THE QUIET DEEP | 12.5 px, 600 | 5.07 | 7.47 | 5.83 | 4.5 | pass |

**Stress** (`stress-overview.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| INFERNAL | 12.5 px, 600 | 3.57 | 4.93 | 4.46 | 4.5 | marginal |
| MANIC | 12.5 px, 600 | 3.83 | 5.45 | 4.92 | 4.5 | pass |
| ACOUSTIC | 12.5 px, 600 | 3.74 | 5.56 | 5.05 | 4.5 | pass |
| DISTURBING | 12.5 px, 600 | 4.56 | 6.27 | 5.35 | 4.5 | pass |

**Phone, region sheet** (`phone-region-sheet.jpg`, boxes placed by hand)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| URBAN CLUSTER | 12.5 px, 600 | 4.19 | 6.28 | 5.52 | 4.5 | pass |
| PLAYFUL WAY | 12.5 px, 600 | 3.56 | 5.71 | 4.99 | 4.5 | pass |

### 1.3 Hint and colour sentence, bottom left

**Overview** (`map-overview.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| Albums that sit close together sound or  | 13.5 px, 400 | 11.22 | 13.31 | 11.98 | 4.5 | pass |
| **Rose** (colour word) | 13.5 px, 600 | 8.72 | 8.61 | 8.36 | 4.5 | pass |
| where the music is fierce, | 13.5 px, 400 | 10.33 | 12.83 | 12.44 | 4.5 | pass |
| **gold** (colour word) | 13.5 px, 600 | 12.03 | 12.41 | 11.99 | 4.5 | pass |
| where it is warm, | 13.5 px, 400 | 9.31 | 11.40 | 10.38 | 4.5 | pass |
| **teal** (colour word) | 13.5 px, 600 | 7.04 | 7.83 | 7.44 | 4.5 | pass |
| where it is quiet, | 13.5 px, 400 | 7.17 | 8.19 | 7.29 | 4.5 | pass |
| **blue** (colour word) | 13.5 px, 600 | 3.68 | 3.56 | 3.35 | 4.5 | FAIL |
| where it is dark, | 13.5 px, 400 | 5.38 | 6.20 | 5.61 | 4.5 | pass |
| **violet** (colour word) | 13.5 px, 600 | 4.15 | 4.06 | 3.82 | 4.5 | FAIL |
| where it is urban. | 13.5 px, 400 | 4.58 | 5.26 | 4.79 | 4.5 | pass |

**Whole map** (`map-whole.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| Albums that sit close together sound or  | 13.5 px, 400 | 12.89 | 15.43 | 14.99 | 4.5 | pass |
| **Rose** (colour word) | 13.5 px, 600 | 9.10 | 8.89 | 8.63 | 4.5 | pass |
| where the music is fierce, | 13.5 px, 400 | 10.87 | 13.52 | 13.24 | 4.5 | pass |
| **gold** (colour word) | 13.5 px, 600 | 13.25 | 13.52 | 13.07 | 4.5 | pass |
| where it is warm, | 13.5 px, 400 | 10.93 | 13.44 | 13.20 | 4.5 | pass |
| **teal** (colour word) | 13.5 px, 600 | 10.54 | 11.61 | 11.19 | 4.5 | pass |
| where it is quiet, | 13.5 px, 400 | 11.38 | 13.23 | 12.90 | 4.5 | pass |
| **blue** (colour word) | 13.5 px, 600 | 8.48 | 8.59 | 8.40 | 4.5 | pass |
| where it is dark, | 13.5 px, 400 | 10.77 | 13.05 | 12.87 | 4.5 | pass |
| **violet** (colour word) | 13.5 px, 600 | 9.42 | 9.35 | 9.10 | 4.5 | pass |
| where it is urban. | 13.5 px, 400 | 11.08 | 13.05 | 12.83 | 4.5 | pass |

**Mood stop** (`slider-mood.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| Albums that sit close together sound or  | 13.5 px, 400 | 11.53 | 13.67 | 12.58 | 4.5 | pass |
| **Rose** (colour word) | 13.5 px, 600 | 8.77 | 8.60 | 8.34 | 4.5 | pass |
| where the music is fierce, | 13.5 px, 400 | 10.41 | 12.90 | 12.69 | 4.5 | pass |
| **gold** (colour word) | 13.5 px, 600 | 12.46 | 12.70 | 12.22 | 4.5 | pass |
| where it is warm, | 13.5 px, 400 | 9.78 | 11.95 | 11.15 | 4.5 | pass |
| **teal** (colour word) | 13.5 px, 600 | 7.60 | 8.42 | 7.92 | 4.5 | pass |
| where it is quiet, | 13.5 px, 400 | 6.93 | 7.98 | 6.69 | 4.5 | pass |
| **blue** (colour word) | 13.5 px, 600 | 3.91 | 3.92 | 3.71 | 4.5 | FAIL |
| where it is dark, | 13.5 px, 400 | 5.33 | 6.34 | 5.78 | 4.5 | pass |
| **violet** (colour word) | 13.5 px, 600 | 4.01 | 3.90 | 3.75 | 4.5 | FAIL |
| where it is urban. | 13.5 px, 400 | 5.22 | 5.89 | 5.47 | 4.5 | pass |

**Sonic stop** (`slider-sonic.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| Albums that sit close together sound or  | 13.5 px, 400 | 10.40 | 12.20 | 9.91 | 4.5 | pass |
| **Rose** (colour word) | 13.5 px, 600 | 8.76 | 8.62 | 8.38 | 4.5 | pass |
| where the music is fierce, | 13.5 px, 400 | 10.03 | 12.44 | 11.86 | 4.5 | pass |
| **gold** (colour word) | 13.5 px, 600 | 11.14 | 11.56 | 10.86 | 4.5 | pass |
| where it is warm, | 13.5 px, 400 | 8.19 | 9.87 | 7.96 | 4.5 | pass |
| **teal** (colour word) | 13.5 px, 600 | 4.87 | 5.24 | 4.91 | 4.5 | pass |
| where it is quiet, | 13.5 px, 400 | 5.35 | 5.98 | 5.27 | 4.5 | pass |
| **blue** (colour word) | 13.5 px, 600 | 3.21 | 3.16 | 2.98 | 4.5 | FAIL |
| where it is dark, | 13.5 px, 400 | 4.17 | 4.74 | 4.28 | 4.5 | marginal |
| **violet** (colour word) | 13.5 px, 600 | 3.56 | 3.39 | 3.26 | 4.5 | FAIL |
| where it is urban. | 13.5 px, 400 | 4.26 | 4.73 | 4.35 | 4.5 | marginal |

**Stress** (`stress-overview.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| Albums that sit close together sound or  | 13.5 px, 400 | 11.22 | 13.29 | 11.84 | 4.5 | pass |
| **Rose** (colour word) | 13.5 px, 600 | 8.75 | 8.60 | 8.34 | 4.5 | pass |
| where the music is fierce, | 13.5 px, 400 | 10.36 | 12.83 | 12.40 | 4.5 | pass |
| **gold** (colour word) | 13.5 px, 600 | 12.03 | 12.37 | 11.93 | 4.5 | pass |
| where it is warm, | 13.5 px, 400 | 9.27 | 11.23 | 10.14 | 4.5 | pass |
| **teal** (colour word) | 13.5 px, 600 | 6.99 | 7.76 | 7.31 | 4.5 | pass |
| where it is quiet, | 13.5 px, 400 | 6.86 | 7.90 | 6.95 | 4.5 | pass |
| **blue** (colour word) | 13.5 px, 600 | 3.42 | 3.44 | 3.23 | 4.5 | FAIL |
| where it is dark, | 13.5 px, 400 | 5.29 | 6.26 | 5.74 | 4.5 | pass |
| **violet** (colour word) | 13.5 px, 600 | 4.25 | 4.11 | 3.87 | 4.5 | FAIL |
| where it is urban. | 13.5 px, 400 | 4.70 | 5.33 | 4.85 | 4.5 | pass |

**Phone, map mode** (`phone-map-mode.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| **Rose** (colour word) | 12.5 px, 600 | 5.91 | 5.86 | 5.59 | 4.5 | pass |
| where the music is fierce, | 12.5 px, 400 | 7.59 | 9.59 | 8.89 | 4.5 | pass |
| **gold** (colour word) | 12.5 px, 600 | 8.14 | 8.80 | 8.36 | 4.5 | pass |
| where it is warm, | 12.5 px, 400 | 7.44 | 10.11 | 8.96 | 4.5 | pass |
| **teal** (colour word) | 12.5 px, 600 | 7.92 | 9.08 | 8.44 | 4.5 | pass |
| where it is quiet, | 12.5 px, 400 | 8.78 | 10.64 | 10.02 | 4.5 | pass |
| **blue** (colour word) | 12.5 px, 600 | 6.60 | 6.67 | 6.25 | 4.5 | pass |
| where it is dark, | 12.5 px, 400 | 8.54 | 10.53 | 9.86 | 4.5 | pass |
| **violet** (colour word) | 12.5 px, 600 | 7.81 | 7.80 | 6.62 | 4.5 | pass |
| where it is urban. | 12.5 px, 400 | 8.88 | 10.91 | 10.41 | 4.5 | pass |

### 1.4 Evidence sentence under a hovered name

**Hovered label** (`map-label-hover.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| PLAYFUL WAY | 22.3 px, 600 | 6.10 | 6.73 | 6.29 | 4.5 | pass |
| 61% of albums here are tagged playful | 13.5 px, 400 | 4.94 | 5.93 | 5.31 | 4.5 | pass |
| , against 21% across the map. | 13.5 px, 400 | 4.45 | 5.20 | 4.50 | 4.5 | pass |

### 1.5 Region labels when they are not at rest

**Album view, 5 closest (labels at 60%)** (`album-5.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| PLAYFUL WAY | 23.6 px, 600, 60% opacity | 3.73 | 4.72 | 4.48 | 4.5 | marginal |
| ECLECTIC CLOUD (fair) | 16.2 px, 500, 60% opacity | 2.74 | 4.64 | 4.41 | 4.5 | marginal |

**Album view, 10 closest (labels at 60%)** (`album-10-hot.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| PLAYFUL WAY | 22.3 px, 600, 60% opacity | 3.96 | 4.67 | 4.39 | 4.5 | marginal |
| THE BITTERSWEET REACH (fair) | 15.9 px, 500, 60% opacity | 2.77 | 4.64 | 3.97 | 4.5 | marginal |
| ECLECTIC CLOUD (fair) | 15.3 px, 500, 60% opacity | 2.44 | 4.62 | 4.42 | 4.5 | marginal |

**Region card open (camera between Overview and covers)** (`map-region-card.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| PLAYFUL WAY | 23.8 px, 600, 82% opacity | 3.02 | 3.54 | 3.31 | 4.5 | FAIL |
| URBAN CLUSTER | 24.3 px, 600, 82% opacity | 3.33 | 4.22 | 3.58 | 3.0 | pass |
| RAW FLARE | 22.3 px, 600, 82% opacity | 3.46 | 4.16 | 3.89 | 4.5 | FAIL |
| WARM HALO | 22.3 px, 600, 82% opacity | 3.61 | 4.51 | 3.98 | 4.5 | marginal |
| EPIC EXPANSE (fair) | 17.1 px, 500, 82% opacity | 2.35 | 3.86 | 3.52 | 4.5 | FAIL |
| ECLECTIC CLOUD (fair) | 16.4 px, 500, 82% opacity | 2.50 | 3.53 | 3.31 | 4.5 | FAIL |

**Zoom band C** (`zoom-c.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| PLAYFUL WAY | 24.8 px, 600, 66% opacity | 2.34 | 2.67 | 2.51 | 3.0 | FAIL |
| PROGRESSIVE SPIRAL | 23.9 px, 600, 66% opacity | 2.93 | 3.20 | 3.04 | 4.5 | FAIL |
| WARM HALO | 23.2 px, 600, 66% opacity | 3.54 | 3.61 | 3.19 | 4.5 | FAIL |
| SOMBRE VOID | 23.2 px, 600, 66% opacity | 3.94 | 4.13 | 3.82 | 4.5 | FAIL |
| EPIC EXPANSE (fair) | 17.8 px, 500, 66% opacity | 1.93 | 2.89 | 2.70 | 4.5 | FAIL |
| ECLECTIC CLOUD (fair) | 17.0 px, 500, 66% opacity | 2.01 | 2.73 | 2.58 | 4.5 | FAIL |

**Zoom band C, closer** (`gas-baked-band-c.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| PLAYFUL WAY | 25.8 px, 600, 47% opacity | 2.01 | 2.08 | 1.97 | 3.0 | FAIL |
| PROGRESSIVE SPIRAL | 24.9 px, 600, 47% opacity | 2.55 | 2.54 | 2.41 | 3.0 | FAIL |
| EPIC EXPANSE (fair) | 18.6 px, 500, 47% opacity | 1.84 | 2.31 | 2.17 | 4.5 | FAIL |
| ECLECTIC CLOUD (fair) | 17.8 px, 500, 47% opacity | 1.60 | 2.12 | 1.99 | 4.5 | FAIL |

### 1.6 "You are here" chip

**Chip at cover zoom** (`zoom-d.jpg`)

| Text | Size, weight | Pixel | CSS ink on sampled ground | CSS ink, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|
| ECLECTIC CLOUD | 13.0 px, 600 | 9.64 | 16.53 | 16.15 | 4.5 | pass |

### 1.7 Album panel and chrome, both chrome variants

**Trifid chrome** (`album-5.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `a.wordmark` | 1 | 27.0 px, 600 | rgb(241, 236, 228) | 15.90 | 16.57 | 16.16 | 3.0 | pass |
| `span.kbd` | 1 | 12.0 px, 400 | rgb(160, 154, 147) | 4.94 | 6.94 | 6.85 | 4.5 | pass |
| `a.navbtn` | 2 | 15.0 px, 400 | rgb(241, 236, 228) | 8.56 | 9.69 | 9.41 | 4.5 | pass |
| `label.cap` | 1 | 11.5 px, 500 | rgb(160, 154, 147) | 6.61 | 6.86 | 6.61 | 4.5 | pass |
| `button in div.mode-stops` | 3 | 13.5 px, 400 | rgb(160, 154, 147) | 5.86 | 6.90 | 6.63 | 4.5 | pass |
| `p#mode-note.mode-note` | 1 | 13.0 px, 400 | rgb(186, 180, 172) | 7.79 | 9.41 | 9.04 | 4.5 | pass |
| `span in button#explore-here.map-explore.panel` | 1 | 14.0 px, 400 | rgb(241, 236, 228) | 13.78 | 16.62 | 15.95 | 4.5 | pass |
| `p.seed-artist` | 1 | 15.0 px, 400 | rgb(186, 180, 172) | 6.71 | 7.39 | 6.92 | 4.5 | pass |
| `span.in-region.in-region--between` | 2 | 13.0 px, 400 | rgb(160, 154, 147) | 4.69 | 5.20 | 4.97 | 4.5 | pass |
| `a in span.in-region.in-region--between` | 2 | 13.0 px, 400 | rgb(186, 180, 172) | 6.84 | 7.99 | 7.48 | 4.5 | pass |
| `h1#seed-title.seed-title.len-m` | 1 | 40.0 px, 500 | rgb(241, 236, 228) | 14.40 | 14.59 | 13.23 | 3.0 | pass |
| `a.btn.btn-lamp` | 1 | 14.5 px, 500 | rgb(18, 16, 22) | 15.72 | 15.97 | 15.60 | 4.5 | pass |
| `li in ul.tags` | 6 | 12.5 px, 400 | rgb(186, 180, 172) | 6.68 | 8.17 | 7.72 | 4.5 | pass |
| `h2.recs-h` | 1 | 21.0 px, 500 | rgb(241, 236, 228) | 12.54 | 15.71 | 15.29 | 4.5 | pass |
| `span.rec-n` | 5 | 20.0 px, 400 | rgb(160, 154, 147) | 3.59 | 7.07 | 7.07 | 4.5 | pass |
| `span.rec-title` | 5 | 23.0 px, 600 | rgb(241, 236, 228) | 15.83 | 16.68 | 16.23 | 4.5 | pass |
| `span.rec-artist` | 5 | 14.0 px, 400 | rgb(186, 180, 172) | 8.04 | 9.51 | 9.19 | 4.5 | pass |
| `span.rec-shared` | 5 | 13.0 px, 400 | rgb(160, 154, 147) | 6.06 | 7.00 | 6.75 | 4.5 | pass |
| `span in span.rec-shared` | 5 | 13.0 px, 400 | rgb(186, 180, 172) | 7.85 | 9.47 | 9.14 | 4.5 | pass |
| `span in button.textbtn.u.show-more` | 1 | 15.0 px, 400 | rgb(186, 180, 172) | 8.70 | 9.59 | 9.38 | 4.5 | pass |

**Site chrome** (`chrome-site-album.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `a.wordmark` | 1 | 27.0 px, 600 | rgb(237, 229, 213) | 14.07 | 14.68 | 14.28 | 3.0 | pass |
| `span.kbd` | 1 | 12.0 px, 400 | rgb(163, 152, 135) | 4.78 | 6.23 | 6.08 | 4.5 | pass |
| `a.navbtn` | 2 | 15.0 px, 400 | rgb(237, 229, 213) | 6.89 | 7.88 | 7.61 | 4.5 | pass |
| `label.cap` | 1 | 11.5 px, 500 | rgb(163, 152, 135) | 6.00 | 6.27 | 5.96 | 4.5 | pass |
| `button in div.mode-stops` | 3 | 13.5 px, 400 | rgb(163, 152, 135) | 5.33 | 6.30 | 6.04 | 4.5 | pass |
| `p#mode-note.mode-note` | 1 | 13.0 px, 400 | rgb(179, 167, 146) | 6.56 | 7.64 | 7.25 | 4.5 | pass |
| `span in button#explore-here.map-explore.panel` | 1 | 14.0 px, 400 | rgb(237, 229, 213) | 12.24 | 14.40 | 13.63 | 4.5 | pass |
| `p.seed-artist` | 1 | 15.0 px, 400 | rgb(179, 167, 146) | 5.55 | 6.04 | 5.69 | 4.5 | pass |
| `span.in-region.in-region--between` | 2 | 13.0 px, 400 | rgb(163, 152, 135) | 4.38 | 4.81 | 4.60 | 4.5 | pass |
| `a in span.in-region.in-region--between` | 2 | 13.0 px, 400 | rgb(179, 167, 146) | 5.79 | 6.52 | 6.05 | 4.5 | pass |
| `h1#seed-title.seed-title.len-m` | 1 | 40.0 px, 500 | rgb(237, 229, 213) | 12.74 | 12.86 | 11.73 | 3.0 | pass |
| `a.btn.btn-lamp` | 1 | 14.5 px, 500 | rgb(26, 19, 11) | 7.96 | 8.68 | 8.43 | 4.5 | pass |
| `li in ul.tags` | 6 | 12.5 px, 400 | rgb(179, 167, 146) | 5.48 | 6.67 | 6.35 | 4.5 | pass |
| `h2.recs-h` | 1 | 21.0 px, 500 | rgb(237, 229, 213) | 11.14 | 13.86 | 13.50 | 4.5 | pass |
| `span.rec-n` | 5 | 20.0 px, 400 | rgb(163, 152, 135) | 3.65 | 6.58 | 6.50 | 4.5 | pass |
| `span.rec-title` | 5 | 23.0 px, 600 | rgb(237, 229, 213) | 14.08 | 14.92 | 14.35 | 4.5 | pass |
| `span.rec-artist` | 5 | 14.0 px, 400 | rgb(179, 167, 146) | 6.73 | 7.82 | 7.48 | 4.5 | pass |
| `span.rec-shared` | 5 | 13.0 px, 400 | rgb(163, 152, 135) | 5.60 | 6.53 | 6.27 | 4.5 | pass |
| `span in span.rec-shared` | 5 | 13.0 px, 400 | rgb(179, 167, 146) | 6.51 | 7.79 | 7.44 | 4.5 | pass |
| `span in button.textbtn.u.show-more` | 1 | 15.0 px, 400 | rgb(179, 167, 146) | 7.11 | 7.88 | 7.60 | 4.5 | pass |

**Lit tags and hover plate (Trifid chrome)** (`album-10-hot.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `div.t` | 1 | 18.0 px, 600 | rgb(241, 236, 228) | 14.15 | 16.72 | 16.17 | 4.5 | pass |
| `div.a` | 1 | 13.0 px, 400 | rgb(186, 180, 172) | 8.08 | 9.56 | 9.31 | 4.5 | pass |
| `p.seed-artist` | 1 | 15.0 px, 400 | rgb(186, 180, 172) | 6.69 | 7.39 | 6.91 | 4.5 | pass |
| `span.in-region.in-region--between` | 2 | 13.0 px, 400 | rgb(160, 154, 147) | 4.67 | 5.19 | 4.97 | 4.5 | pass |
| `h1#seed-title.seed-title.len-m` | 1 | 40.0 px, 500 | rgb(241, 236, 228) | 14.40 | 14.59 | 13.16 | 3.0 | pass |
| `li.lit` | 3 | 12.5 px, 400 | rgb(241, 236, 228) | 9.16 | 12.11 | 11.28 | 4.5 | pass |
| `h2.recs-h` | 1 | 21.0 px, 500 | rgb(241, 236, 228) | 12.47 | 15.57 | 15.17 | 4.5 | pass |

**Region card (Trifid chrome)** (`map-region-card.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `p.rc-name` | 1 | 25.0 px, 600 | rgb(251, 238, 231) | 16.00 | 16.72 | 16.40 | 3.0 | pass |
| `p.rc-plain` | 1 | 13.0 px, 400 | rgb(186, 180, 172) | 7.18 | 9.21 | 8.93 | 4.5 | pass |
| `p.rc-ev` | 1 | 14.5 px, 400 | rgb(241, 236, 228) | 13.87 | 16.18 | 15.55 | 4.5 | pass |
| `i in p.rc-ev` | 1 | 14.5 px, 400 | rgb(186, 180, 172) | 8.66 | 9.28 | 9.14 | 4.5 | pass |
| `p.cap.rc-h` | 1 | 11.5 px, 500 | rgb(160, 154, 147) | 6.10 | 6.74 | 6.48 | 4.5 | pass |
| `span.cap` | 1 | 11.5 px, 500 | rgb(160, 154, 147) | 6.20 | 6.87 | 6.62 | 4.5 | pass |
| `a in p.rc-next` | 3 | 14.0 px, 400 | rgb(241, 236, 228) | 13.01 | 16.09 | 15.00 | 4.5 | pass |
| `span.sep` | 2 | 14.0 px, 400 | rgb(160, 154, 147) | 3.39 | 6.85 | 6.73 | 4.5 | pass |

**Search list** (`search-regions.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `p.cap.opt-h` | 2 | 11.5 px, 500 | rgb(160, 154, 147) | 6.50 | 6.85 | 6.57 | 4.5 | pass |
| `span.opt-r` | 2 | 15.0 px, 600 | rgb(241, 236, 228) | 9.66 | 13.25 | 12.60 | 4.5 | pass |
| `span.opt-a` | 8 | 13.5 px, 400 | rgb(186, 180, 172) | 6.60 | 7.56 | 7.23 | 4.5 | pass |
| `mark in span.opt-t` | 5 | 19.0 px, 600 | rgb(241, 236, 228) | 15.75 | 16.32 | 15.45 | 4.5 | pass |
| `span.opt-t` | 4 | 19.0 px, 600 | rgb(241, 236, 228) | 14.34 | 16.44 | 15.69 | 4.5 | pass |

### 1.8 Home, About, 404

**Home A, content** (`home-a.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `a.wordmark` | 1 | 27.0 px, 600 | rgb(241, 236, 228) | 16.60 | 17.22 | 16.84 | 3.0 | pass |
| `a.navbtn` | 2 | 15.0 px, 400 | rgb(186, 180, 172) | 8.51 | 9.84 | 9.54 | 4.5 | pass |
| `h1#home-h` | 1 | 80.0 px, 500 | rgb(241, 236, 228) | 12.05 | 12.12 | 10.76 | 3.0 | pass |
| `p.lede` | 1 | 16.5 px, 400 | rgb(186, 180, 172) | 5.76 | 6.33 | 5.63 | 4.5 | pass |
| `span.kbd` | 1 | 12.0 px, 400 | rgb(160, 154, 147) | 4.58 | 6.94 | 6.85 | 4.5 | pass |
| `span in a.textbtn.u` | 1 | 15.0 px, 400 | rgb(186, 180, 172) | 6.43 | 7.15 | 6.51 | 4.5 | pass |
| `span in button#surprise.textbtn` | 1 | 15.0 px, 400 | rgb(186, 180, 172) | 5.62 | 6.22 | 5.58 | 4.5 | pass |
| `span.cap` | 2 | 11.5 px, 500 | rgb(160, 154, 147) | 4.52 | 4.78 | 4.40 | 4.5 | marginal |
| `a.start-r` | 5 | 13.5 px, 600 | rgb(230, 244, 241) | 6.61 | 8.90 | 8.00 | 4.5 | pass |

**Home A, ghosted region names behind the hero (32% opacity, not interactive)** (`home-a.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `b in button.rl.sub` | 7 | 19.9 px, 600 | rgb(230, 244, 241) | 1.25 | 2.42 | 1.97 | 4.5 | FAIL |
| `span.rl-sub` | 8 | 12.5 px, 400 | rgb(236, 231, 222) | 1.27 | 2.11 | 1.92 | 4.5 | FAIL |

**Home B, content** (`home-b.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `a.wordmark` | 1 | 27.0 px, 600 | rgb(241, 236, 228) | 16.60 | 17.22 | 16.84 | 3.0 | pass |
| `a.navbtn` | 2 | 15.0 px, 400 | rgb(186, 180, 172) | 8.51 | 9.84 | 9.54 | 4.5 | pass |
| `h1#home-h` | 1 | 80.0 px, 500 | rgb(241, 236, 228) | 12.05 | 12.12 | 10.76 | 3.0 | pass |
| `p.lede` | 1 | 16.5 px, 400 | rgb(186, 180, 172) | 5.76 | 6.33 | 5.63 | 4.5 | pass |
| `span.kbd` | 1 | 12.0 px, 400 | rgb(160, 154, 147) | 4.58 | 6.94 | 6.85 | 4.5 | pass |
| `span in a.textbtn.u` | 1 | 15.0 px, 400 | rgb(186, 180, 172) | 6.43 | 7.15 | 6.51 | 4.5 | pass |
| `span in button#surprise.textbtn` | 1 | 15.0 px, 400 | rgb(186, 180, 172) | 5.62 | 6.22 | 5.58 | 4.5 | pass |
| `span.cap` | 1 | 11.5 px, 500 | rgb(160, 154, 147) | 5.23 | 5.42 | 4.30 | 4.5 | marginal |
| `span.pl-n` | 8 | 17.0 px, 600 | rgb(230, 244, 241) | 12.42 | 13.90 | 12.48 | 4.5 | pass |
| `span.pl-p` | 8 | 13.0 px, 400 | rgb(186, 180, 172) | 7.61 | 8.83 | 8.53 | 4.5 | pass |

**About** (`about.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `a.wordmark` | 1 | 27.0 px, 600 | rgb(241, 236, 228) | 16.57 | 17.12 | 16.79 | 3.0 | pass |
| `span.kbd` | 1 | 12.0 px, 400 | rgb(160, 154, 147) | 4.94 | 6.94 | 6.85 | 4.5 | pass |
| `a.navbtn` | 2 | 15.0 px, 400 | rgb(186, 180, 172) | 9.03 | 9.82 | 9.48 | 4.5 | pass |
| `h1#about-h` | 1 | 48.0 px, 500 | rgb(241, 236, 228) | 17.08 | 17.17 | 17.12 | 3.0 | pass |
| `p in article.about` | 1 | 16.5 px, 400 | rgb(219, 214, 206) | 8.98 | 13.96 | 13.88 | 4.5 | pass |
| `h2.cap.about-h2` | 2 | 11.5 px, 500 | rgb(160, 154, 147) | 6.79 | 7.16 | 6.95 | 4.5 | pass |
| `p in section` | 5 | 16.5 px, 400 | rgb(219, 214, 206) | 9.18 | 13.96 | 13.65 | 4.5 | pass |

**404, content** (`notfound.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `a.wordmark` | 1 | 27.0 px, 600 | rgb(241, 236, 228) | 16.57 | 17.12 | 16.79 | 3.0 | pass |
| `span.kbd` | 2 | 12.0 px, 400 | rgb(160, 154, 147) | 4.06 | 6.94 | 6.85 | 4.5 | pass |
| `a.navbtn` | 2 | 15.0 px, 400 | rgb(186, 180, 172) | 8.60 | 9.82 | 9.48 | 4.5 | pass |
| `h1#nf-h` | 1 | 40.0 px, 500 | rgb(241, 236, 228) | 8.86 | 9.08 | 7.59 | 3.0 | pass |
| `p.notfound-sub` | 1 | 16.5 px, 400 | rgb(186, 180, 172) | 5.57 | 5.99 | 4.59 | 4.5 | pass |
| `span in a.textbtn.u` | 1 | 15.0 px, 400 | rgb(186, 180, 172) | 4.69 | 4.98 | 4.28 | 4.5 | marginal |

**404, ghosted names** (`notfound.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `b in button.rl.sub` | 8 | 19.9 px, 600 | rgb(230, 244, 241) | 1.41 | 2.40 | 2.06 | 4.5 | FAIL |
| `span.rl-sub` | 6 | 12.5 px, 400 | rgb(236, 231, 222) | 1.42 | 2.28 | 2.15 | 4.5 | FAIL |

### 1.9 Phone frames (390 x 844)

**Phone home** (`phone-home.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `a.wordmark` | 1 | 24.0 px, 600 | rgb(241, 236, 228) | 16.20 | 17.22 | 16.92 | 3.0 | pass |
| `a.navbtn` | 2 | 14.5 px, 400 | rgb(186, 180, 172) | 8.27 | 9.82 | 9.49 | 4.5 | pass |
| `h1#home-h` | 1 | 42.9 px, 500 | rgb(241, 236, 228) | 16.65 | 17.22 | 17.12 | 3.0 | pass |
| `p.lede` | 1 | 15.5 px, 400 | rgb(186, 180, 172) | 8.25 | 9.76 | 9.48 | 4.5 | pass |
| `span in a.textbtn.u` | 1 | 15.0 px, 400 | rgb(186, 180, 172) | 4.90 | 5.44 | 4.54 | 4.5 | pass |
| `span in button#surprise.textbtn` | 1 | 15.0 px, 400 | rgb(186, 180, 172) | 6.93 | 7.83 | 5.21 | 4.5 | pass |
| `span.cap` | 2 | 11.5 px, 500 | rgb(160, 154, 147) | 4.69 | 4.96 | 4.22 | 4.5 | marginal |
| `a.start-r` | 5 | 13.0 px, 600 | rgb(230, 244, 241) | 8.43 | 10.77 | 8.21 | 4.5 | pass |

**Phone home, ghosted names** (`phone-home.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `span.rl-sub` | 4 | 12.5 px, 400 | rgb(236, 231, 222) | 1.17 | 2.43 | 2.19 | 4.5 | FAIL |
| `b in button.rl.sub` | 4 | 20.1 px, 600 | rgb(247, 232, 251) | 1.29 | 2.48 | 2.32 | 4.5 | FAIL |

**Phone album list** (`phone-list-strip.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `a.wordmark` | 1 | 24.0 px, 600 | rgb(241, 236, 228) | 15.75 | 16.73 | 16.30 | 3.0 | pass |
| `a.navbtn` | 2 | 14.5 px, 400 | rgb(241, 236, 228) | 7.98 | 9.60 | 9.34 | 4.5 | pass |
| `span.rec-n` | 3 | 20.0 px, 400 | rgb(160, 154, 147) | 3.74 | 4.94 | 4.79 | 4.5 | pass |
| `span.rec-title` | 3 | 22.0 px, 600 | rgb(241, 236, 228) | 13.94 | 15.60 | 14.26 | 4.5 | pass |
| `span.rec-artist` | 3 | 14.0 px, 400 | rgb(186, 180, 172) | 7.77 | 8.52 | 7.72 | 4.5 | pass |
| `span.rec-shared` | 3 | 13.0 px, 400 | rgb(160, 154, 147) | 5.13 | 5.69 | 5.39 | 4.5 | pass |
| `span in span.rec-shared` | 3 | 13.0 px, 400 | rgb(186, 180, 172) | 6.16 | 8.92 | 8.07 | 4.5 | pass |
| `span in button.textbtn.u.show-more` | 1 | 15.0 px, 400 | rgb(186, 180, 172) | 8.94 | 9.82 | 9.53 | 4.5 | pass |
| `span in button.strip-open` | 1 | 15.0 px, 500 | rgb(241, 236, 228) | 16.59 | 16.87 | 16.24 | 4.5 | pass |

**Phone map mode** (`phone-map-mode.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `a.wordmark` | 1 | 24.0 px, 600 | rgb(241, 236, 228) | 15.75 | 16.73 | 16.30 | 3.0 | pass |
| `a.navbtn` | 2 | 14.5 px, 400 | rgb(241, 236, 228) | 7.98 | 9.60 | 9.34 | 4.5 | pass |
| `label.cap` | 1 | 11.5 px, 500 | rgb(160, 154, 147) | 6.58 | 6.85 | 6.61 | 4.5 | pass |
| `button in div.mode-stops` | 3 | 13.5 px, 400 | rgb(160, 154, 147) | 5.77 | 6.79 | 6.46 | 4.5 | pass |
| `p#mode-note.mode-note` | 1 | 13.0 px, 400 | rgb(186, 180, 172) | 7.69 | 9.26 | 9.06 | 4.5 | pass |
| `span in button#explore-here.map-explore.panel` | 1 | 15.0 px, 500 | rgb(241, 236, 228) | 15.26 | 16.36 | 15.74 | 4.5 | pass |
| `span in button#fab.fab-map.fab-map--on` | 1 | 15.0 px, 600 | rgb(241, 236, 228) | 16.39 | 16.55 | 15.97 | 4.5 | pass |

**Phone region sheet, map label** (`phone-region-sheet.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `b in button.rl.sub` | 1 | 28.2 px, 600 | rgb(252, 241, 232) | 9.38 | 10.03 | 7.84 | 3.0 | pass |
| `span.rl-sub` | 1 | 12.5 px, 400 | rgb(236, 231, 222) | 5.63 | 8.55 | 7.99 | 4.5 | pass |

**Phone search sheet** (`phone-search-sheet.jpg`)

| Element | n | Size, weight | CSS colour | Lowest pixel | Lowest CSS-on-ground | Lowest, brighter quarter | Need | Result |
|---|---|---|---|---|---|---|---|---|
| `p.cap.opt-h` | 1 | 11.5 px, 500 | rgb(160, 154, 147) | 6.78 | 7.18 | 6.99 | 4.5 | pass |
| `span.opt-r` | 14 | 15.0 px, 600 | rgb(241, 236, 228) | 12.09 | 17.07 | 16.65 | 4.5 | pass |
| `span.opt-a` | 14 | 13.5 px, 400 | rgb(186, 180, 172) | 8.12 | 9.70 | 9.38 | 4.5 | pass |

### 1.10 Non-text marks

| Mark | Where measured | Ratio | Need | Result |
|---|---|---|---|---|
| Brightest ground (gas plus star halos, stars and text filtered out with a 25 px median), relative luminance | Gold core, `map-overview.jpg` | L = 0.50 (99.5th percentile 0.44) | UX.md says cap near 0.30. `LUM_CAP` is 0.42 | over the cap |
| Same | `map-whole` 0.47, `slider-mood` 0.45, `slider-sonic` 0.48, `stress-overview` 0.51 | | | over the cap |
| Share of the Overview map brighter than L 0.30 | `map-overview.jpg` | 11.6% of the area | | |
| Pure white on the brightest gas | computed from the sampled gas | 1.9:1 to 2.1:1 | 3:1 | FAIL |
| Typical star on the brightest gas (ground L over 0.25) | 663 star peaks, `map-overview.jpg` | median 2.48:1, 88% under 3:1 | 3:1 | FAIL |
| Same | `map-whole` median 2.42 (93% under), `slider-mood` 2.72 (75%), `slider-sonic` 2.52 (85%), `stress-overview` 2.54 (91%) | | 3:1 | FAIL |
| Star on bright gas (ground L 0.15 to 0.25) | 1,082 peaks, `map-overview.jpg` | median 3.59:1, 26% under 3:1 | 3:1 | marginal |
| Star on mid gas (ground L 0.05 to 0.15) | 1,542 peaks | median 4.62:1, 16% under 3:1 | 3:1 | pass |
| Star on dark ground | 56 peaks | median 9.52:1 | 3:1 | pass |
| Smallest star class in theory (alpha 0.72, additive) on gas `rgb(236,170,90)` | computed | 1.98:1 | 3:1 | FAIL |
| Focus ring on a region label (2 px white) | `focus-label.png`, over mid gas | 5.7:1 and 7.3:1 | 3:1 | pass here |
| Focus ring on an edge pointer (2 px white) | `focus-ptr.png`, over rose gas | 5.3:1 and 5.7:1 | 3:1 | pass here |
| The same white ring over the gold core | computed for gas L 0.42 and 0.50 | 2.2:1 and 1.9:1 | 3:1 | FAIL |
| Focus ring on a colour word | `focus-legend.png`, on the hint scrim | about 15:1 | 3:1 | pass |
| Focus ring on the map canvas (2 px, inset 4 px) | `focus-ov.png`, left edge | 11:1 | 3:1 | pass |
| Slider focus halo (`--lamp-soft`, 30% alpha) | `focus-slider.png`, above the thumb | 2.4:1 measured, 2.38 computed | 3:1 | FAIL |
| Slider track and stop dots (`--rule-2`) | computed and sampled | 1.9:1 | 3:1 | FAIL |
| Search field border (`--rule-2` on `--room-2`) | computed | 1.96:1 | 3:1 | FAIL |
| "You are here" chip border (22% white) | computed | 1.9:1 | 3:1 | FAIL, but the chip fill itself carries the shape |
| Focus lines in album view (white on dark casing) | `album-10-hot.jpg` | white on casing over 15:1 | 3:1 | pass |
| Badges (white digits on `#0b0a0f`) | `album-10-hot.jpg` | about 19:1 | 4.5:1 | pass |
| Cover keyline (1 px dark) on gold gas | `album-gold-covers.jpg`, by eye plus computed | about 6:1 | 3:1 | pass |
| Selected search row (2 px lamp bar) | computed | over 15:1 | 3:1 | pass |

### 1.11 Touch targets (measured from the DOM at 390 x 844, and from CSS)

| Target | Size | 44 x 44 (UX.md, section 11) | 24 x 24 (WCAG 2.5.8) |
|---|---|---|---|
| Header links, search button, zoom buttons, card close, Spotify buttons, Map / List pill, strip button, search rows, "Next to" links, trail links, Home region links, slider and its three stop buttons | 44 px or more in the short dimension | pass | pass |
| Edge pointer | 22 px tall, `::before` extends it to 44 | pass | pass |
| Region label, strong, with sub-line | about 60 px tall | pass | pass |
| Region label, fair | 156 x 37 measured (`.rl` padding 10 px on a 14 px line) | FAIL | pass |
| "You are here" chip | 32 px tall | FAIL | pass |
| Colour words in the sentence | 32 x 25, 28 x 25, 24 x 25, 35 x 25 | FAIL | pass, "teal" exactly at the limit |
| "In {region}" line in the panel | 28 px min-height | FAIL | pass |
| "Best known here" covers | 44 x 44, 6 px apart | pass | pass |
| Desktop slider | 210 x 22 | not applicable | under 24, saved only by the spacing exception |
| Stars on the map | 24 px radius for touch | pass | pass |

Edge pointers stack in rows 30 px apart while their hit areas are 44 px tall, so two rows overlap by 14 px.

Viewport meta is `width=device-width, initial-scale=1`. Zoom is not blocked.

## 2. Colour-only meaning

Machado 2009 matrices at full severity, applied in linear RGB to `map-overview.jpg`. Images saved as `cvd-protanopia.png`, `cvd-deuteranopia.png`, `cvd-tritanopia.png` in the scratch folder, and looked at.

Colour difference (CIE76) between the family hues in `config.js`. Under about 25 two colours read as the same family of colour; under 10 they are the same colour.

| Pair | Normal | Protanopia | Deuteranopia | Tritanopia |
|---|---|---|---|---|
| rose (fierce) and gold (warm) | 65 | 62 | 39 | 48 |
| rose (fierce) and teal (quiet) | 108 | **25** | 34 | 127 |
| rose (fierce) and blue (dark) | 100 | 77 | 104 | 116 |
| rose (fierce) and violet (urban) | 77 | 71 | 81 | 58 |
| gold (warm) and teal (quiet) | 88 | 60 | 69 | 83 |
| gold (warm) and blue (dark) | 137 | 134 | 141 | 76 |
| gold (warm) and violet (urban) | 128 | 128 | 117 | **30** |
| teal (quiet) and blue (dark) | 98 | 75 | 73 | **26** |
| teal (quiet) and violet (urban) | 118 | 69 | 48 | 78 |
| blue (dark) and violet (urban) | 41 | **6** | **25** | 62 |

What the simulated maps show:

- **Protanopia**: blue and violet are one blue. Rose turns grey-olive and teal turns pale grey, so fierce and quiet differ only in brightness. The map reads as three things: blue, yellow, grey.
- **Deuteranopia**: blue and violet nearly merge. Rose becomes a dull olive that sits between gold and grey. Teal is neutral grey and looks like the unnamed far field. The map reads as blue, yellow and a grey-olive middle.
- **Tritanopia**: teal and blue are one cyan. Gold and violet are both pink. Rose stays red. Three families.

The family luminances make this worse: rose 0.25, blue 0.21, violet 0.25 are the same brightness, so nothing separates them once hue goes.

Is anything available only through colour?

- **Gas colour on the map**: yes at the family level. The region names and their plain words ("raw · angry") carry the meaning in text, but only where a label is placed, and the reader has to infer the family from the words.
- **The colour sentence**: the mapping is in words, so it survives. The coloured words themselves are the only key between a word and a patch of gas. Under protanopia "blue" and "violet" are the same ink (colour difference 3).
- **Family dot on region rows** (search list, Home B, panel line, chip): colour only. The row never says which family. In `search-regions.jpg` the dots for Playful Way and Eclectic Cloud are the same orange even with full colour vision, so the dot adds little.
- **Label ink tint**: differences of 4 to 19 between families even with normal vision. It is decoration, and that is fine.
- **Isolating a family** (hover or focus on a colour word) is the one path that does not depend on hue, because everything else dims. It is unavailable on touch, it is gone once covers show or a card opens, and on phones the sentence disappears for good after the first pan.

Fixes that do not add a legend box:

1. Make each colour word a real toggle (`aria-pressed`, click and tap, stays on until pressed again or Escape). This gives touch and colour-blind readers the luminance path.
2. Put the family in words wherever the dot is: "Fierce · raw, angry" in search rows, the region card and the panel line. Keep the dot as decoration with `aria-hidden`.
3. Separate the families in brightness as well as hue. Suggested ladder: gold lightest, teal, rose, violet, blue darkest, with at least 0.08 luminance between neighbours. Move violet toward magenta and lighten it so it leaves blue under protan and deutan vision.
4. Under the colour sentence on About, say that names and their plain words carry the same meaning as the colour.
5. Make sure every family that is on screen at Overview has one placed name. Today that holds for Balanced; check it per stop in the placement pass.

## 3. Findings, ranked

Severity: blocker stops a group of users from completing a core task. Major is a WCAG AA failure or a serious barrier with a workaround. Minor is polish or a marginal failure.

### Blockers

**1. The album panel never gets focus and sits last in the tab order.** WCAG 2.4.3 Focus Order, 2.4.1 Bypass Blocks, 4.1.3 Status Messages.
Evidence: in `index.html` the `#album` section comes after the whole map pane. Nothing focuses `#seed-title` (it has `tabindex="-1"` but no caller; the only `focus()` calls are in `pages.js:67`, `pages.js:79`, `panel.js:74`, `panel.js:144`, `search.js`). `search.js:108` blurs the input on choose. So after picking an album from search, a keyboard user tabs through Map, About, the canvas, up to 14 region labels, the slider, "Explore this area", five colour words and three zoom buttons before reaching the album. A screen reader user hears nothing but a title change. Closing the panel (button or Escape) makes it `inert` and drops focus to `<body>`.
Fix: move `#album` before `#map` in the DOM. On every album route change call `seed-title.focus({preventScroll: true})`. On close, send focus to the element that opened it, or to the search field. Point the skip link at the panel when an album is open.

**2. The region card is cut off at 200% zoom and on a landscape phone.** WCAG 1.4.4 Resize Text, 1.4.10 Reflow, 1.3.4 Orientation.
Evidence: `zoom200-region.png` (640 x 360, which is a 1280 x 720 window at 200%). The card's name, plain words, evidence sentence and Close button are under the header. Only "Best known here" and "Next to" show. The card is absolutely positioned above the slider with no `max-height` and no scroll, and `body` is `overflow: hidden`. The map is fully covered as well.
Fix: `.card { max-height: calc(100vh - var(--hdr) - var(--slider-cover) - 16px); overflow-y: auto; }`. Under about 520 px of height collapse the slider card to one row (label and range) and drop its note, or let the card cover the slider with its own close button on top.

### Major

**3. A blind or keyboard-only user cannot browse a region's albums or pick an album on the map.** WCAG 2.1.1 Keyboard, 1.1.1 Non-text Content.
Evidence: the canvas (`#ov`) pans and zooms from the keyboard but stars cannot be reached. The region card lists six covers ("Best known here") and nothing more. The screen-reader region list gives names and evidence only. What does work without the map: search (albums and regions), opening an album, reading its region line, the closest-albums list, moving the slider (a real range input with `aria-valuetext`), moving between neighbouring regions.
Fix: add "All albums here" to the region card, opening a plain list in the panel slot (title, artist, link), paged. Add a keyboard path on the map: with the canvas focused, Tab or `.` steps through the 12 albums nearest the view centre, Enter picks. Mirror it as a visually hidden list "Albums in view" updated when the camera settles.

**4. The colour sentence fails contrast where it runs past its scrim.** WCAG 1.4.3.
Evidence: "blue" 3.56 (Overview), 3.92 (Mood), 3.16 (Sonic), 3.44 (stress). "violet" 4.06, 3.90, 3.39, 4.11. At Sonic the plain words beside them are 4.74 and 4.73, failing on the brighter quarter (4.28, 4.35). All pass at Whole map (8.6 and up) and on the phone (5.9 and up), where the ground is dark. Cause: `.map-hint` uses a radial scrim that is spent by 72% of its width, and the sentence is about 760 px long.
Fix: make the scrim a left-to-right band as wide as the text (`linear-gradient` to transparent at the top, full width of the paragraph). Lighten the word ink from 38% to 55% toward white. Either alone fixes blue; do both.

**5. Edge pointers have no scrim and fail over bright gas.** WCAG 1.4.3.
Evidence: RAW FLARE 3.69 (Overview, over the rose core, pixel 2.35). THE BITTERSWEET REACH 4.45 (Sonic). Marginal: IMPROV ARM 4.68 and 2.86 on the brighter quarter, AGGRESSIVE RIFT 4.89 and 4.26 (Mood), INFERNAL 4.93 and 4.46 (stress). The text shadow is the only protection and 12.5 px is the smallest lettering on the map.
Fix: give pointers the same treatment as the "you are here" chip (`rgba(8,7,12,.86)` fill), which measures 16.5:1. Or run `scrimFor` for each pointer box. Raise them to 13.5 px.

**6. Region labels fail contrast whenever they are not at rest, and they stay focusable.** WCAG 1.4.3.
Evidence: with the region card open the camera stops between Overview and covers and the other labels sit at 82% opacity: PLAYFUL WAY 3.54, ECLECTIC CLOUD 3.53, EPIC EXPANSE 3.86, RAW FLARE 4.16, WARM HALO 4.51. In zoom band C: 2.67 to 4.13 at 66% opacity, then 2.08 to 2.54 at 47%. Cause in `labels.js`: the scrim is multiplied by `bandAlpha`, so text and scrim fade together ("a label that is fading out with zoom takes its scrim with it"). Also `Regions.camera` caps zoom at 15.5 px covers, which is past `BAND_B` (13), so every fly-to-region lands in the fading band.
Fix: keep text at full opacity and fade only by removing the label: show at full strength up to a threshold, then cross-fade out in 200 ms and take it out of the tab order. Cap `Regions.camera` at 12.5 px covers so a region view is a resting view. If a gradual fade is wanted, keep the scrim at full strength until the label is gone.

**7. Album-view labels at 60% pass by a hair on paper and fail in practice.** WCAG 1.4.3.
Evidence: 4.62 to 4.72 computed (solver target 4.6), 3.97 to 4.48 on the brighter quarter, 2.44 to 3.96 from pixels. Fair labels are the worst (ECLECTIC CLOUD 2.44, THE BITTERSWEET REACH 2.77 from pixels).
Fix: raise the album-view opacity to 80% and solve for 5.5:1. Do not place fair labels in album view.

**8. Stars vanish on the gold core, and the gas is brighter than the spec allows.** WCAG 1.4.11 Non-text Contrast (the stars are the data).
Evidence: gas luminance peaks at 0.45 to 0.51 in every map shot. `UX.md` section 3 says about 0.30 and that a white star must hold 3:1. On ground brighter than 0.25 (11.6% of the Overview map) the median star is 2.4 to 2.7:1 and 75% to 93% of stars are under 3:1. Pure white on the brightest gas is 1.9:1. The stars are additive, so on bright gas they have nowhere to go.
Cause: `LUM_CAP` in `config.js` is 0.42, not 0.30, and the measured ground also includes the summed halos of the two brightest star classes, which are dense in the cores. Fix: set `LUM_CAP` to 0.30 and measure the result with stars drawn, not the gas alone. Draw each star with a 1 px dark ring using normal blending under the additive core. Give the faintest class a minimum 1.4 px radius where the gas under it is brighter than 0.2.

**9. The five families are told apart by hue alone.** WCAG 1.4.1 Use of Color.
Evidence and fixes: section 2. Blue and violet are 6 apart under protanopia. Teal and blue are 26 apart under tritanopia. The family dot is colour only. Isolating a family is hover and focus only.

**10. On a phone, and at 200% zoom on desktop, every map control stays focusable behind the album list.** WCAG 2.4.11 Focus Not Obscured, 2.4.3.
Evidence: in the 390 px album-list probe the colour words report boxes at y 610 to 647 with `tabIndex` 0 while the opaque list covers them. Same for the canvas, labels, slider, "Explore this area" and zoom buttons. `Pages.show` sets `inert` only for Home, About and 404.
Fix: when `S.narrow && route is album && !S.mapMode`, set `inert` on `#labels`, `#pointers`, `#ui` and `#ov`.

**11. Focus is lost when cards close or swap.** WCAG 2.4.3.
Evidence: `UI.card` replaces `#card-slot` contents. Closing the region card removes the focused element. Choosing a "Best known here" cover replaces the region card with the Explore card and does not focus it (`panel.js:74` focuses only the region card). Escape from anywhere closes the album (`app.js:295`), including from the slider.
Fix: on close, return focus to the region's label button if it is placed, else to the canvas. Focus the Explore card when it opens from a keyboard action. Limit Escape to "close the nearest thing that contains focus", then the card, then the panel.

**12. The search list is not a valid listbox and says nothing when results change.** WCAG 4.1.2, 1.3.1, 4.1.3.
Evidence: `role="listbox"` contains `<p>` headings and `<ul>` wrappers around the options, so options are not owned by the listbox. "No album matches" is a plain `<p>` inside it and is never announced. No result count is announced. Combobox wiring is otherwise correct (`aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete`).
Fix: wrap each group in `role="group"` with `aria-labelledby` pointing at its heading, give the `<ul>` `role="none"`. Add a polite live region next to the field: "2 regions, 6 albums" and the no-match sentence.

**13. The map canvas claims to be an image while it takes keyboard input.** WCAG 4.1.2.
Evidence: `<canvas id="ov" tabindex="0" role="img" aria-label="Map of albums. Drag or use arrow keys...">`. Screen readers treat it as a graphic and may not pass arrow keys through. The section around it has the same label, so it is announced twice.
Fix: `role="application"` with `aria-roledescription="map"` and the instructions in `aria-describedby`. Keep the section label, shorten the canvas label to "Map".

**14. Colour words: wrong name, no action, and they vanish.** WCAG 2.5.3 Label in Name, 4.1.2, 3.2.
Evidence: visible text "Rose", accessible name "Show only where the music is fierce" (`panel.js:102`). The visible word is not in the name, and a screen reader loses the colour words from the sentence. The button does nothing on click, Enter or tap. Isolation happens on hover and focus only. On phones the sentence is removed for good after the first pan (`localStorage`), and the only other copy is on About.
Fix: name "Rose: show only where the music is fierce", `aria-pressed`, toggle on click. Bring the sentence back on the phone whenever the map is at Overview, or put it behind a small "Colours" text button on the slider card.

**15. Small targets on the phone.** UX.md section 11 (44 px); WCAG 2.5.8 passes.
Evidence: section 1.11. Fair labels 37 px, chip 32 px, colour words 25 px, panel region line 28 px.
Fix: `.rl { padding: 15px 8px }` for fair labels on phone, chip `min-height: 44px`, `.lg { padding: 10px 6px; margin: -10px -6px }`, `.in-region { min-height: 44px }`.

### Minor

**16. The skip link does nothing on Home, About and 404.** It always focuses `#ov`, which is `inert` on those routes. Fix: focus the route's `h1` there (`#home-h`, `#about-h`, `#nf-h`).

**17. Slider focus indicator is 2.4:1** and the track and stop dots are 1.9:1 (1.4.11). Fix: halo at 70% alpha or a 2 px solid lamp ring with a 2 px dark gap. Track at `--rule-3`.

**18. White focus rings have no dark casing.** They measure 5.3 to 7.3 where tested, but over the gold core they would be 1.9 to 2.2. Fix: `outline: 2px solid #fff; box-shadow: 0 0 0 4px rgba(4,4,8,.85)` on `.rl`, `.ptr`, `.here`. Moot once finding 8 lands the 0.30 cap (3.0:1), still worth doing.

**19. Hovered or focused labels overlap their neighbours and cannot be dismissed.** WCAG 1.4.13. The hovered label skips collision checks and grows to 400 px (`focus-label.png` shows it covering SOMBRE VOID). Escape does not hide the evidence. Fix: hide colliding neighbours while one label is on. Escape clears `hoverRegion`.

**20. No live announcements for slider and map state.** The slider note changes without `aria-live`. When the stop changes and the open region does not exist at the new stop the card just closes. The "you are here" chip changes silently. Fix: `aria-live="polite"` on `#mode-note`. Announce "Region names changed" once per stop change through the existing `#toast` status region.

**21. "The names change with the slider" is explained only on About and only half on the slider.** Sonic and Mood notes say "Regions are named by sound / mood". Balanced says only "Sound and mood together." Nothing says the names will change before the user moves the slider. Fix: Balanced note "Sound and mood together. Regions are named by both." Add one line on first slider use, in the note area: "Names change with this setting."

**22. Copy.** "Hover a name to see why it is there" (About) leaves out touch and keyboard: use "Select a name". "Named from the sound: far higher speechiness than the rest of the map" uses a raw data word: use the plain word from `audioWords` ("far more spoken word"). "Violet where it is urban" is the weakest of the five meanings: the plain words under it are "urban · sampling", which does not help. "Show only where the music is fierce" describes a filter, but nothing is filtered on click: fix with finding 14. Evidence sentences are clear and short. "Between A and B", "Best known here", "Next to" and "Go to" are fine.

**23. Structure.** The map route has no `h1`. The region card name is a `<p>`: make it an `h2`. The page title does not include the region ("Map · recmyrecord" for every region): use "{Region} · Map · recmyrecord". Region label buttons are in creation order in the DOM, so Tab jumps around the map: sort the nodes by screen position when the camera settles.

**24. Ghosted region names behind Home, About and 404 are real words at 2.1 to 2.6:1.** They are `inert` and `aria-hidden`, so this is not a formal failure if treated as decoration. On the phone home screen RAW FLARE and its sub-line sit directly behind the lede and cut its legibility. Fix: drop the sub-lines on these pages, lower to 20%, and keep names out of the hero's box.

**25. Marginal text on gas-backed pages.** "Or start from a place on the map" 4.78 (4.40 on the brighter quarter; phone 4.96 and 4.22). 404 "Explore the map" 4.98 (4.28). 404 sub-line 5.99 (4.59). Fix: `--ash` to `--dust` for `.cap` on Home, and deepen the veil centre from 0.78 to 0.85.

**26. Hover isolation can strobe.** Sweeping the pointer across the five colour words changes most of the map's luminance on each word (non-family gas drops to 40%). With reduced motion on, the 220 ms ramp is removed and each change is an instant step. Not measured with a flash analyser. Fix: 150 ms hover intent before isolating, keep a 200 ms ramp even under reduced motion (a fade is not motion), and prefer the click toggle from finding 14.

**27. Desktop slider is 22 px tall** and passes 2.5.8 only by the spacing exception with 1 px to spare. Make the track 24 px.

## 4. What already passes

- Region labels and sub-lines at rest, every stop and the 10k stress set: 4.88 to 9.94 computed, no failures. One marginal (THE BITTERSWEET REACH, 5.22, 4.33 on the brighter quarter). The scrim logic is sound and uses the brightest gas under the label.
- The evidence sentence under a hovered name: 5.93 and 5.20.
- "You are here" chip: 16.5:1.
- All panel text in both chrome variants. Lowest: "Between" 5.20 (Trifid) and 4.81 (site). Artist 7.39 and 6.04, "Shares" 7.0 and 6.5, tags 8.2 and 6.7, rank numerals 7.1 and 6.6, slider labels 6.9 and 6.3.
- Region card, search list, hover plate, About text, Home hero, region links on Home (8.9 to 12.9), Home B tiles.
- Focus lines, badges, cover keylines, selected-row bar.
- Slider is a real `<input type="range">` with a `<label>`, three steps and `aria-valuetext`. The three stop buttons are out of the tab order and duplicate it for the pointer.
- Region labels, pointers and the chip are real buttons with full names (name, plain words, evidence). Hidden ones use `visibility: hidden` and leave the tab order.
- A visually hidden list of every region at the current stop sits in the map landmark, so regions dropped for space are still reachable.
- Search: correct combobox attributes, arrows, Enter, Escape, `/` shortcut that ignores text fields, empty field lists every region.
- Phone search sheet: `role="dialog"`, `aria-modal`, the rest of the page `inert`, focus into the field and back to the button.
- Decorative layers are hidden from assistive tech: `#gl`, scrims, the ambient wash, the hover plate, the hint when hidden. Covers are background sprites inside links and buttons that carry `aria-label`.
- Page title changes per route. About and 404 move focus to their `h1`. `lang="en"` is set. Toast is a polite status region.
- Reduced motion: every tween path checks it. `Cam.tween`, wheel zoom, fling, the slider morph, the `animate()` amounts and all CSS transitions and keyframes become instant. No path was found that still animates.
- Nothing moves at idle: `#/map?idle=1` reports 2 frames at 3 s and still 2 at 8 s. No twinkle, no timers, no autoplay, no flashing content at rest.
- Zoom is not blocked by the viewport meta. Hover on rec rows and labels has a focus equivalent.

## 5. Not verified

- No real screen reader run (VoiceOver, NVDA, TalkBack). Roles and names are from the code.
- Safari, real touch devices, pinch zoom over the canvas (`touch-action: none` means browser pinch zoom cannot start on the map).
- `prefers-reduced-motion` was checked in code, not run.
- Forced colours and Windows high contrast. Text spacing overrides (1.4.12): labels are `nowrap` with widths computed in JS and may collide.
- Reflow at 320 px wide.
- The region name in the phone map strip: the screenshot's album is between two regions, so no name is drawn.
- Phone region sheet text was not probed on the phone (the probe missed the card); it uses the same opaque panel as desktop, which passes.
- Flash risk of hover isolation was reasoned, not measured.
- Sonic and Mood with 10k data, and labels with the live gas other than the one Overview table.
