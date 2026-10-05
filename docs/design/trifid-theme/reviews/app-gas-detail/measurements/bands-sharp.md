# Gas detail by spatial band (written by capture-detail.mjs)

Energy is the standard deviation of the luma in the band, albums masked, over the map canvas. Bands are in px of the image: CSS px at dpr 1, device px at dpr 2. "Ratio" is app over prototype; "floor off" removes what empty sky reads in the same band (grain and dither) from both sides first.

## dpr 2

| State | Row | under 0.7 | 0.7 to 1.4 | 1.4 to 2.8 | 2.8 to 5.6 | 5.6 to 11.2 |
|---|---|---|---|---|---|---|
| empty sky (app computed, prototype captured) | app / prototype | 0.67 / 0.31 | 0.26 / 0.23 | 0.12 / 0.20 | 0.06 / 0.12 | 0.03 / 0.06 |
| overview | app / prototype | 0.76 / 0.37 | 0.71 / 0.53 | 1.31 / 1.14 | 2.04 / 1.94 | 2.76 / 2.72 |
| overview | ratio | 2.07 | 1.35 | 1.16 | 1.05 | 1.01 |
| overview | ratio, floor off | 1.80 | 1.40 | 1.17 | 1.06 | 1.01 |
| overview-mood | app / prototype | 0.72 / 0.34 | 0.60 / 0.45 | 1.09 / 0.95 | 1.74 / 1.65 | 2.34 / 2.30 |
| overview-mood | ratio | 2.10 | 1.33 | 1.15 | 1.05 | 1.02 |
| overview-mood | ratio, floor off | 1.79 | 1.39 | 1.17 | 1.06 | 1.02 |
| album | app / prototype | 0.67 / 0.31 | 0.34 / 0.29 | 0.53 / 0.52 | 0.95 / 0.94 | 1.50 / 1.49 |
| album | ratio | 2.16 | 1.17 | 1.02 | 1.02 | 1.01 |
| album | ratio, floor off | 0.00 | 1.20 | 1.07 | 1.02 | 1.01 |
| album-bright | app / prototype | 0.67 / 0.31 | 0.33 / 0.29 | 0.51 / 0.50 | 0.92 / 0.90 | 1.46 / 1.45 |
| album-bright | ratio | 2.16 | 1.16 | 1.02 | 1.02 | 1.01 |
| album-bright | ratio, floor off | 0.00 | 1.20 | 1.08 | 1.02 | 1.01 |
