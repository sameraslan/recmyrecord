# Preview-features evaluation

Pool: 4081 of 4081 albums (100.0%); 4075 with descriptors; genres joined for 4079 (99.95%); 19 albums with another record's Spotify features (kept as neighbours, not used as agreement seeds or in the Ridge fit).

Cells: `mean ±half-width of the 95% CI`; for coherence metrics `mean (difference vs A)`, `*` = the paired 95% CI excludes 0. `audio` = audio block alone.

## Audio blocks

| variant | columns | total variance / A's |
|---|---|---|
| A | 13 | 1.00 |
| Z0 | 0 | 0.00 |
| Zs | 13 | 1.00 |

## overlap10

| variant | sonic | balanced | mood | audio |
|---|---|---|---|---|
| Z0 | 0.024 ±0.002 | 0.350 ±0.006 | 0.965 ±0.004 | – |
| Zs | 0.003 ±0.000 | 0.129 ±0.004 | 0.959 ±0.004 | 0.002 ±0.000 |

## spearman_full

| variant | sonic | balanced | mood | audio |
|---|---|---|---|---|
| Z0 | 0.171 ±0.005 | 0.624 ±0.003 | 1.000 ±0.000 | – |
| Zs | 0.003 ±0.000 | 0.338 ±0.003 | 1.000 ±0.000 | 0.003 ±0.001 |

## spearman_top100

| variant | sonic | balanced | mood | audio |
|---|---|---|---|---|
| Z0 | 0.063 ±0.004 | 0.533 ±0.004 | 0.987 ±0.001 | – |
| Zs | -0.000 ±0.003 | 0.148 ±0.003 | 0.980 ±0.001 | 0.000 ±0.003 |

## genre_primary

| variant | sonic | balanced | mood | audio |
|---|---|---|---|---|
| A | 0.092 ±0.004 | 0.190 ±0.007 | 0.168 ±0.007 | 0.091 ±0.004 |
| Z0 | 0.166 (+0.074*) | 0.166 (-0.024*) | 0.166 (-0.002*) | – |
| Zs | 0.011 (-0.081*) | 0.094 (-0.096*) | 0.166 (-0.002*) | 0.010 (-0.081*) |
| random neighbours | 0.010 | 0.010 | 0.010 | 0.010 |

## genre_any

| variant | sonic | balanced | mood | audio |
|---|---|---|---|---|
| A | 0.176 ±0.006 | 0.328 ±0.008 | 0.290 ±0.008 | 0.175 ±0.006 |
| Z0 | 0.287 (+0.111*) | 0.287 (-0.041*) | 0.287 (-0.002*) | – |
| Zs | 0.028 (-0.148*) | 0.177 (-0.151*) | 0.287 (-0.002*) | 0.027 (-0.147*) |
| random neighbours | 0.027 | 0.027 | 0.027 | 0.027 |

## genre_family

| variant | sonic | balanced | mood | audio |
|---|---|---|---|---|
| A | 0.402 ±0.009 | 0.548 ±0.009 | 0.498 ±0.009 | 0.400 ±0.009 |
| Z0 | 0.494 (+0.092*) | 0.494 (-0.054*) | 0.494 (-0.004*) | – |
| Zs | 0.133 (-0.269*) | 0.379 (-0.170*) | 0.494 (-0.004*) | 0.132 (-0.268*) |
| random neighbours | 0.128 | 0.128 | 0.128 | 0.128 |

## desc_cos

| variant | audio |
|---|---|
| A | 0.342 ±0.003 |
| Z0 | – |
| Zs | 0.217 (-0.125*) |
| random neighbours | 0.218 |

## In Rainbows at slider 0.5 (live check)

Expected: Tindersticks, Avalon, So, You Will Never Know Why, Imperial Bedroom. The original 4,000-row table reproduces it: True. 5 of the 5 expected albums are in the pool.
Restricting to the pool changes A's answer: False.

| variant | in order | as a set | same as A on the pool | titles |
|---|---|---|---|---|
| A | 5/5 | 5/5 | yes | Tindersticks, Avalon, So, You Will Never Know Why, Imperial Bedroom |
| Z0 | 5/5 | 5/5 | yes | Tindersticks, Avalon, So, You Will Never Know Why, Imperial Bedroom |
| Zs | 5/5 | 5/5 | yes | Tindersticks, Avalon, So, You Will Never Know Why, Imperial Bedroom |

