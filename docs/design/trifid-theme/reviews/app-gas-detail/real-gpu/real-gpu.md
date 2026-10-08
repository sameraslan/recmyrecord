# The gas on a real GPU (written by capture-real-gpu.mjs)

Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version). No override of the sharper image. Bands: standard deviation of the luma between Gaussian blurs, albums masked, in device px; app over prototype.

| State | Viewport, dpr | Sharper image | px per world unit | Covers (px) | Framing residual (px) | under 0.7 | 0.7 to 1.4 | 1.4 to 2.8 | 2.8 to 5.6 | 5.6 to 11.2 |
|---|---|---|---|---|---|---|---|---|---|---|
| overview | 1440 x 900, 1 | balanced (1 fetched) | 1639 | 11.1 | 0 | 1.00 | 1.02 | 1.00 | 1.00 | 1.00 |
| overview | 1440 x 900, 2 | balanced (1 fetched) | 1639 | 11.1 | 0 | 2.10 | 1.43 | 1.19 | 1.06 | 1.02 |
| album | 1440 x 900, 1 | balanced (1 fetched) | 2373 | 16.1 | 0 | 0.95 | 0.99 | 1.00 | 1.00 | 1.00 |
| album | 1440 x 900, 2 | balanced (1 fetched) | 2373 | 16.1 | 0 | 2.06 | 1.19 | 1.06 | 1.03 | 1.01 |
| overview-sonic | 1440 x 900, 1 | sonic (1 fetched) | 1535 | 10.4 | 0 | 0.98 | 1.00 | 1.00 | 1.00 | 1.01 |
| phone-opening | 390 x 844, 3 | off (0 fetched) | 268 | 1.8 | 0 | 1.05 | 1.29 | 1.11 | 1.05 | 1.01 |
| phone-album | 390 x 844, 3 | off (0 fetched) | 1403 | 9.5 | 0 | 1.10 | 1.23 | 1.13 | 1.07 | 1.02 |
