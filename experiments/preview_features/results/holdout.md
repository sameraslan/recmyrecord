# New-album test: transform fitted without the album

3944 albums, PCA 64, 5 folds grouped by artist. `held out`: the album's block comes from a transform fitted on the other 80% (no album of its artist among them) and its neighbours are searched in the catalog mapped by that same transform. `in fit`: the transform fitted on every album. Metrics as in simbench (audio block alone; bal_* at the balanced stop); * = the paired 95% CI excludes 0.

## every album held out once

| metric | in fit | held out | difference |
|---|---|---|---|
| genre_primary | 0.239 ±0.011 | 0.239 ±0.011 | -0.000 |
| genre_family | 0.652 ±0.015 | 0.651 ±0.015 | -0.001 |
| desc_cos | 0.446 ±0.005 | 0.446 ±0.005 | +0.000 |
| genre_primary_xa | 0.202 ±0.010 | 0.203 ±0.010 | +0.000 |
| desc_cos_xa | 0.432 ±0.005 | 0.432 ±0.005 | -0.000 |
| fam_desc_cos | 0.440 ±0.005 | 0.440 ±0.005 | -0.000 |
| artist_mrr | 0.362 ±0.020 | 0.367 ±0.021 | +0.004* |
| feel_mad | 0.638 ±0.007 | 0.638 ±0.007 | +0.000 |
| bal_genre_primary | 0.270 ±0.012 | 0.269 ±0.012 | -0.001* |
| bal_genre_family | 0.669 ±0.015 | 0.668 ±0.015 | -0.000 |
| bal_overlap_A | 0.340 ±0.007 | 0.341 ±0.007 | +0.001* |

Share of the in-fit top 10 the held-out transform returns: audio block 0.950 ±0.002, balanced stop 0.974 ±0.001.

## fold 0 only (789 albums)

| metric | in fit | held out | difference |
|---|---|---|---|
| genre_primary | 0.226 ±0.025 | 0.227 ±0.026 | +0.001 |
| genre_family | 0.644 ±0.038 | 0.644 ±0.038 | +0.000 |
| desc_cos | 0.443 ±0.011 | 0.444 ±0.012 | +0.000 |
| genre_primary_xa | 0.191 ±0.021 | 0.193 ±0.022 | +0.001 |
| desc_cos_xa | 0.431 ±0.011 | 0.431 ±0.011 | -0.000 |
| fam_desc_cos | 0.437 ±0.011 | 0.438 ±0.011 | +0.001 |
| artist_mrr | 0.335 ±0.043 | 0.338 ±0.043 | +0.003 |
| feel_mad | 0.646 ±0.019 | 0.647 ±0.019 | +0.001 |
| bal_genre_primary | 0.266 ±0.027 | 0.266 ±0.027 | +0.000 |
| bal_genre_family | 0.655 ±0.036 | 0.656 ±0.036 | +0.001 |
| bal_overlap_A | 0.333 ±0.016 | 0.335 ±0.016 | +0.001 |

Share of the in-fit top 10 the held-out transform returns: audio block 0.947 ±0.004, balanced stop 0.975 ±0.003.

Total variance of the held-out albums' block relative to the Spotify block on the same albums, per fold (1 = the slider keeps its meaning): [1.0149, 1.0141, 0.9895, 0.9069, 0.9788].
