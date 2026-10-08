# Gas detail by spatial band (written by capture-detail.mjs)

Energy is the standard deviation of the luma in the band, albums masked, over the map canvas. Bands are in px of the image: CSS px at dpr 1, device px at dpr 2. "Ratio" is app over prototype; "floor off" removes what empty sky reads in the same band (grain and dither) from both sides first.

## dpr 1

| State | Row | under 0.7 | 0.7 to 1.4 | 1.4 to 2.8 | 2.8 to 5.6 | 5.6 to 11.2 |
|---|---|---|---|---|---|---|
| empty sky (app computed, prototype captured) | app / prototype | 0.67 / 0.68 | 0.26 / 0.26 | 0.12 / 0.13 | 0.06 / 0.06 | 0.03 / 0.03 |
| overview | app / prototype | 0.89 / 1.08 | 1.03 / 1.23 | 1.82 / 1.94 | 2.60 / 2.65 | 3.48 / 3.47 |
| overview | ratio | 0.82 | 0.84 | 0.94 | 0.98 | 1.00 |
| overview | ratio, floor off | 0.70 | 0.83 | 0.94 | 0.98 | 1.00 |
| overview-mood | app / prototype | 0.83 / 0.97 | 0.88 / 1.03 | 1.55 / 1.65 | 2.19 / 2.24 | 2.84 / 2.86 |
| overview-mood | ratio | 0.86 | 0.86 | 0.94 | 0.98 | 0.99 |
| overview-mood | ratio, floor off | 0.71 | 0.85 | 0.94 | 0.98 | 0.99 |
| album | app / prototype | 0.69 / 0.77 | 0.50 / 0.59 | 0.86 / 0.96 | 1.43 / 1.48 | 2.13 / 2.13 |
| album | ratio | 0.90 | 0.85 | 0.90 | 0.96 | 1.00 |
| album | ratio, floor off | 0.51 | 0.81 | 0.90 | 0.96 | 1.00 |
| album-bright | app / prototype | 0.70 / 0.77 | 0.51 / 0.57 | 0.87 / 0.92 | 1.42 / 1.44 | 2.14 / 2.14 |
| album-bright | ratio | 0.91 | 0.90 | 0.94 | 0.98 | 1.00 |
| album-bright | ratio, floor off | 0.55 | 0.87 | 0.94 | 0.98 | 1.00 |

## dpr 2

| State | Row | under 0.7 | 0.7 to 1.4 | 1.4 to 2.8 | 2.8 to 5.6 | 5.6 to 11.2 |
|---|---|---|---|---|---|---|
| empty sky (app computed, prototype captured) | app / prototype | 0.67 / 0.31 | 0.26 / 0.23 | 0.12 / 0.20 | 0.06 / 0.12 | 0.03 / 0.06 |
| overview | app / prototype | 0.69 / 0.37 | 0.51 / 0.53 | 1.04 / 1.14 | 1.88 / 1.94 | 2.69 / 2.72 |
| overview | ratio | 1.88 | 0.97 | 0.91 | 0.97 | 0.99 |
| overview | ratio, floor off | 0.90 | 0.92 | 0.92 | 0.97 | 0.99 |
| overview-mood | app / prototype | 0.68 / 0.34 | 0.45 / 0.45 | 0.87 / 0.95 | 1.60 / 1.65 | 2.27 / 2.30 |
| overview-mood | ratio | 1.98 | 1.00 | 0.92 | 0.97 | 0.99 |
| overview-mood | ratio, floor off | 0.89 | 0.94 | 0.93 | 0.97 | 0.99 |
| album | app / prototype | 0.66 / 0.31 | 0.30 / 0.29 | 0.44 / 0.52 | 0.86 / 0.94 | 1.44 / 1.49 |
| album | ratio | 2.14 | 1.04 | 0.86 | 0.92 | 0.97 |
| album | ratio, floor off | 0.00 | 0.85 | 0.89 | 0.92 | 0.97 |
| album-bright | app / prototype | 0.66 / 0.31 | 0.30 / 0.29 | 0.46 / 0.50 | 0.87 / 0.90 | 1.44 / 1.45 |
| album-bright | ratio | 2.14 | 1.07 | 0.91 | 0.96 | 0.99 |
| album-bright | ratio, floor off | 0.00 | 0.92 | 0.96 | 0.97 | 0.99 |
