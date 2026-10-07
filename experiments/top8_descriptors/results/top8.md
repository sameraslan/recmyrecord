# Top 8 descriptors: what the cut does to the existing albums' lists

All 4,081 albums of the site, audio block fixed (`data-pipeline/audio`, computed once from today's rows). Written by `measure.py`; its docstring defines the sources (T, Tnv, S), the weights and the two scales. Every quality column is an RYM-based proxy on the whole set: no held-out split, nobody listened.

Baseline reproduces `frontcreck/public/data/recs.json`: sonic 100.0% of lists identical, balanced 100.0% of lists identical, mood 100.0% of lists identical.

## Counts

- Descriptors per album in the table (176 columns): mean 13.35, percentiles 5/25/50/75/95 = 3/9/13/18/25. 983 albums have 8 or fewer.
- Of the 120 columns the recommender keeps: mean 10.77; 1,469 albums have 8 or fewer.
- 2,772 albums have a vocals descriptor among their first 8 in the table; the sheet lists none.
- 3,613 existing albums have a sheet list; 212 of the names in them have no table column.
- Sheet list against the table's first 8 without vocals, same albums: Jaccard 0.73, same set 23.4%, same order 1.3%.

## Against today's lists, scale `raw`

### sonic (slider 5.0)

| variant | kept of 10 | same 10 | same 10, same order | 5 or fewer kept | genre_primary | desc_jaccard (full table set) | desc_jaccard (sheet) | never recommended | max N10 |
|---|---|---|---|---|---|---|---|---|---|
| today |  |  |  |  | 0.272 | 0.26 | 0.2192 | 1.1% | 41 |
| T_today | 9.941 | 94.1% | 71.3% | 0.0% | 0.2715 | 0.2594 | 0.219 | 1.1% | 42 |
| T_equal | 9.94 | 94.1% | 71.2% | 0.0% | 0.2714 | 0.2594 | 0.219 | 1.1% | 42 |
| T_legacy | 9.941 | 94.1% | 71.3% | 0.0% | 0.2715 | 0.2594 | 0.219 | 1.1% | 42 |
| T_half | 9.934 | 93.4% | 68.6% | 0.0% | 0.2714 | 0.2595 | 0.2192 | 1.1% | 42 |
| T_linear | 9.921 | 92.1% | 63.8% | 0.0% | 0.2715 | 0.2594 | 0.2191 | 1.1% | 42 |
| Tnv_equal | 9.945 | 94.5% | 72.2% | 0.0% | 0.2714 | 0.2594 | 0.2191 | 1.1% | 43 |
| Tnv_legacy | 9.946 | 94.6% | 72.0% | 0.0% | 0.2715 | 0.2594 | 0.2191 | 1.1% | 43 |
| Tnv_half | 9.938 | 93.8% | 69.9% | 0.0% | 0.2715 | 0.2595 | 0.2192 | 1.1% | 43 |
| Tnv_linear | 9.924 | 92.4% | 64.4% | 0.0% | 0.2714 | 0.2595 | 0.2193 | 1.1% | 42 |
| S_equal | 9.929 | 93.0% | 66.9% | 0.0% | 0.2719 | 0.2593 | 0.2195 | 1.1% | 42 |
| S_legacy | 9.929 | 93.0% | 66.9% | 0.0% | 0.2718 | 0.2594 | 0.2195 | 1.1% | 42 |
| S_half | 9.926 | 92.6% | 66.1% | 0.0% | 0.2718 | 0.2595 | 0.2196 | 1.1% | 43 |
| S_linear | 9.917 | 91.8% | 62.4% | 0.0% | 0.2718 | 0.2594 | 0.2195 | 1.1% | 43 |

### balanced (slider 1.765)

| variant | kept of 10 | same 10 | same 10, same order | 5 or fewer kept | genre_primary | desc_jaccard (full table set) | desc_jaccard (sheet) | never recommended | max N10 |
|---|---|---|---|---|---|---|---|---|---|
| today |  |  |  |  | 0.2896 | 0.3993 | 0.3034 | 4.6% | 95 |
| T_today | 5.213 | 5.9% | 5.4% | 58.6% | 0.2783 | 0.3418 | 0.3099 | 4.4% | 117 |
| T_equal | 5.207 | 4.4% | 1.1% | 58.1% | 0.2757 | 0.3413 | 0.3084 | 4.6% | 115 |
| T_legacy | 5.213 | 5.9% | 5.4% | 58.6% | 0.2783 | 0.3418 | 0.3099 | 4.4% | 117 |
| T_half | 4.77 | 0.9% | 0.3% | 64.9% | 0.2829 | 0.3373 | 0.3106 | 3.8% | 98 |
| T_linear | 3.773 | 0.4% | 0.1% | 82.2% | 0.2729 | 0.3194 | 0.296 | 3.6% | 85 |
| Tnv_equal | 5.378 | 3.5% | 0.9% | 54.1% | 0.2752 | 0.3451 | 0.3136 | 4.9% | 123 |
| Tnv_legacy | 5.381 | 4.5% | 3.3% | 54.2% | 0.2772 | 0.3458 | 0.316 | 4.7% | 117 |
| Tnv_half | 4.93 | 0.9% | 0.3% | 61.4% | 0.2814 | 0.3424 | 0.3188 | 4.2% | 118 |
| Tnv_linear | 3.896 | 0.5% | 0.1% | 81.5% | 0.2708 | 0.3241 | 0.3054 | 4.0% | 99 |
| S_equal | 3.958 | 0.1% | 0.0% | 79.7% | 0.2882 | 0.3321 | 0.3874 | 3.6% | 115 |
| S_legacy | 3.976 | 0.2% | 0.0% | 79.4% | 0.2914 | 0.3326 | 0.3875 | 3.2% | 109 |
| S_half | 3.841 | 0.1% | 0.0% | 82.2% | 0.298 | 0.332 | 0.3779 | 3.3% | 85 |
| S_linear | 3.28 | 0.1% | 0.0% | 89.8% | 0.2877 | 0.3196 | 0.3428 | 3.0% | 81 |

### mood (slider 0.5)

| variant | kept of 10 | same 10 | same 10, same order | 5 or fewer kept | genre_primary | desc_jaccard (full table set) | desc_jaccard (sheet) | never recommended | max N10 |
|---|---|---|---|---|---|---|---|---|---|
| today |  |  |  |  | 0.1734 | 0.4266 | 0.3048 | 7.1% | 100 |
| T_today | 3.612 | 5.5% | 5.4% | 76.8% | 0.1466 | 0.3353 | 0.312 | 6.8% | 93 |
| T_equal | 3.443 | 2.2% | 0.6% | 79.9% | 0.1737 | 0.3429 | 0.3153 | 6.5% | 110 |
| T_legacy | 3.611 | 5.5% | 5.4% | 76.8% | 0.1466 | 0.3353 | 0.312 | 6.8% | 94 |
| T_half | 3.297 | 2.5% | 1.3% | 80.8% | 0.1519 | 0.3295 | 0.3103 | 6.4% | 91 |
| T_linear | 2.267 | 1.3% | 0.9% | 90.9% | 0.1397 | 0.3025 | 0.2852 | 5.6% | 88 |
| Tnv_equal | 3.475 | 1.2% | 0.4% | 80.0% | 0.175 | 0.3493 | 0.3269 | 7.0% | 111 |
| Tnv_legacy | 3.559 | 2.7% | 2.3% | 78.3% | 0.1477 | 0.3412 | 0.325 | 6.9% | 99 |
| Tnv_half | 3.29 | 1.6% | 0.7% | 82.2% | 0.1531 | 0.3356 | 0.3252 | 6.2% | 94 |
| Tnv_linear | 2.297 | 0.9% | 0.5% | 91.8% | 0.1437 | 0.3091 | 0.3012 | 5.7% | 80 |
| S_equal | 2.044 | 0.0% | 0.0% | 97.7% | 0.1955 | 0.3301 | 0.4307 | 6.2% | 120 |
| S_legacy | 2.03 | 0.0% | 0.0% | 97.8% | 0.1676 | 0.3249 | 0.4268 | 5.9% | 114 |
| S_half | 1.983 | 0.0% | 0.0% | 97.9% | 0.1724 | 0.3239 | 0.4135 | 5.5% | 110 |
| S_linear | 1.525 | 0.0% | 0.0% | 99.0% | 0.1625 | 0.3043 | 0.3547 | 4.9% | 98 |

## Against today's lists, scale `matched`

### sonic (slider 5.0)

| variant | kept of 10 | same 10 | same 10, same order | 5 or fewer kept | genre_primary | desc_jaccard (full table set) | desc_jaccard (sheet) | never recommended | max N10 |
|---|---|---|---|---|---|---|---|---|---|
| today |  |  |  |  | 0.272 | 0.26 | 0.2192 | 1.1% | 41 |
| T_today | 9.935 | 93.6% | 67.4% | 0.0% | 0.2716 | 0.2596 | 0.2194 | 1.1% | 41 |
| T_equal | 9.933 | 93.4% | 67.2% | 0.0% | 0.2715 | 0.2596 | 0.2194 | 1.1% | 41 |
| T_legacy | 9.935 | 93.6% | 67.4% | 0.0% | 0.2716 | 0.2596 | 0.2194 | 1.1% | 41 |
| T_half | 9.926 | 92.7% | 65.3% | 0.0% | 0.2717 | 0.2597 | 0.2195 | 1.1% | 42 |
| T_linear | 9.912 | 91.2% | 59.9% | 0.0% | 0.2717 | 0.2596 | 0.2195 | 1.1% | 42 |
| Tnv_equal | 9.938 | 93.8% | 68.1% | 0.0% | 0.2719 | 0.2597 | 0.2195 | 1.2% | 41 |
| Tnv_legacy | 9.938 | 93.8% | 68.0% | 0.0% | 0.2719 | 0.2598 | 0.2195 | 1.1% | 41 |
| Tnv_half | 9.928 | 92.8% | 66.1% | 0.0% | 0.2718 | 0.2598 | 0.2196 | 1.1% | 41 |
| Tnv_linear | 9.907 | 90.8% | 59.7% | 0.0% | 0.2717 | 0.2597 | 0.2195 | 1.1% | 42 |
| S_equal | 9.922 | 92.3% | 63.7% | 0.0% | 0.2723 | 0.2596 | 0.22 | 1.1% | 41 |
| S_legacy | 9.921 | 92.1% | 63.6% | 0.0% | 0.2723 | 0.2596 | 0.22 | 1.1% | 42 |
| S_half | 9.917 | 91.8% | 62.8% | 0.0% | 0.2721 | 0.2596 | 0.2199 | 1.1% | 42 |
| S_linear | 9.908 | 90.9% | 59.2% | 0.0% | 0.2721 | 0.2596 | 0.2198 | 1.1% | 42 |

### balanced (slider 1.765)

| variant | kept of 10 | same 10 | same 10, same order | 5 or fewer kept | genre_primary | desc_jaccard (full table set) | desc_jaccard (sheet) | never recommended | max N10 |
|---|---|---|---|---|---|---|---|---|---|
| today |  |  |  |  | 0.2896 | 0.3993 | 0.3034 | 4.6% | 95 |
| T_today | 4.899 | 2.4% | 0.6% | 62.6% | 0.2629 | 0.3457 | 0.3156 | 5.1% | 118 |
| T_equal | 4.914 | 2.5% | 0.5% | 62.3% | 0.2608 | 0.3453 | 0.3143 | 5.1% | 118 |
| T_legacy | 4.899 | 2.4% | 0.6% | 62.6% | 0.263 | 0.3457 | 0.3156 | 5.1% | 118 |
| T_half | 4.514 | 0.7% | 0.2% | 68.9% | 0.271 | 0.3408 | 0.3159 | 4.2% | 96 |
| T_linear | 3.535 | 0.4% | 0.1% | 85.6% | 0.2613 | 0.3206 | 0.2986 | 3.7% | 85 |
| Tnv_equal | 5.08 | 2.0% | 0.5% | 58.0% | 0.2602 | 0.3498 | 0.3201 | 5.3% | 121 |
| Tnv_legacy | 5.061 | 2.0% | 0.5% | 58.6% | 0.2627 | 0.3504 | 0.3224 | 5.0% | 120 |
| Tnv_half | 4.644 | 0.7% | 0.2% | 66.1% | 0.2686 | 0.3461 | 0.325 | 4.6% | 109 |
| Tnv_linear | 3.659 | 0.4% | 0.1% | 84.7% | 0.2606 | 0.3256 | 0.3088 | 4.0% | 99 |
| S_equal | 3.705 | 0.1% | 0.0% | 84.2% | 0.277 | 0.3343 | 0.3996 | 3.8% | 113 |
| S_legacy | 3.738 | 0.1% | 0.0% | 83.4% | 0.28 | 0.3352 | 0.3995 | 3.6% | 108 |
| S_half | 3.637 | 0.1% | 0.0% | 85.0% | 0.2883 | 0.3346 | 0.388 | 3.5% | 89 |
| S_linear | 3.091 | 0.1% | 0.0% | 91.7% | 0.2784 | 0.321 | 0.3478 | 3.5% | 88 |

### mood (slider 0.5)

| variant | kept of 10 | same 10 | same 10, same order | 5 or fewer kept | genre_primary | desc_jaccard (full table set) | desc_jaccard (sheet) | never recommended | max N10 |
|---|---|---|---|---|---|---|---|---|---|
| today |  |  |  |  | 0.1734 | 0.4266 | 0.3048 | 7.1% | 100 |
| T_today | 3.602 | 5.0% | 3.2% | 76.9% | 0.1465 | 0.3351 | 0.3118 | 6.8% | 93 |
| T_equal | 3.443 | 2.2% | 0.6% | 79.9% | 0.1737 | 0.3429 | 0.3153 | 6.5% | 110 |
| T_legacy | 3.602 | 5.0% | 3.2% | 76.8% | 0.1465 | 0.3352 | 0.3118 | 6.8% | 94 |
| T_half | 3.297 | 2.5% | 1.3% | 80.8% | 0.1519 | 0.3295 | 0.3103 | 6.4% | 91 |
| T_linear | 2.267 | 1.3% | 0.9% | 90.9% | 0.1397 | 0.3025 | 0.2852 | 5.6% | 88 |
| Tnv_equal | 3.475 | 1.2% | 0.4% | 80.0% | 0.175 | 0.3493 | 0.3269 | 7.0% | 111 |
| Tnv_legacy | 3.556 | 2.5% | 1.5% | 78.3% | 0.1474 | 0.341 | 0.3249 | 6.9% | 99 |
| Tnv_half | 3.29 | 1.6% | 0.7% | 82.2% | 0.1531 | 0.3356 | 0.3252 | 6.2% | 94 |
| Tnv_linear | 2.297 | 0.9% | 0.5% | 91.8% | 0.1437 | 0.3091 | 0.3012 | 5.7% | 80 |
| S_equal | 2.044 | 0.0% | 0.0% | 97.7% | 0.1955 | 0.3301 | 0.4307 | 6.2% | 120 |
| S_legacy | 2.029 | 0.0% | 0.0% | 97.8% | 0.1671 | 0.3249 | 0.4267 | 5.9% | 115 |
| S_half | 1.983 | 0.0% | 0.0% | 97.9% | 0.1724 | 0.3239 | 0.4135 | 5.5% | 110 |
| S_linear | 1.525 | 0.0% | 0.0% | 99.0% | 0.1625 | 0.3043 | 0.3547 | 4.9% | 98 |

genre_primary n = 3,614 seeds (those with a sheet genre); desc_jaccard n = 3,705 (full) and 3,540 (sheet).

## The descriptor block itself

| variant | kept columns per album | total variance, raw | factor for `matched` | 10th and 11th tie |
|---|---|---|---|---|
| today | 10.77 | 14.8998 | 1 | 12.2% |
| T_today | 6.1 | 10.3611 | 1.1992 | 15.3% |
| T_equal | 6.1 | 10.3016 | 1.2026 | 92.7% |
| T_legacy | 6.1 | 10.3623 | 1.1991 | 15.3% |
| T_half | 6.1 | 10.694 | 1.1804 | 17.2% |
| T_linear | 6.1 | 11.2641 | 1.1501 | 32.4% |
| Tnv_equal | 5.81 | 10.2644 | 1.2048 | 94.5% |
| Tnv_legacy | 5.81 | 10.3351 | 1.2007 | 17.6% |
| Tnv_half | 5.81 | 10.6917 | 1.1805 | 20.7% |
| Tnv_linear | 5.81 | 11.2339 | 1.1517 | 33.6% |
| S_equal | 6.2 | 10.8319 | 1.1728 | 93.1% |
| S_legacy | 6.2 | 10.8789 | 1.1703 | 8.1% |
| S_half | 6.2 | 11.14 | 1.1565 | 13.0% |
| S_linear | 6.2 | 11.598 | 1.1334 | 26.8% |

## Mood stop, raw: albums with 8 or fewer descriptors against the others

| variant | kept of 10, 8 or fewer | same 10 | kept of 10, more than 8 | same 10 |
|---|---|---|---|---|
| T_today | 6.984 | 22.4% | 2.542 | 0.2% |
| T_equal | 6.259 | 9.0% | 2.549 | 0.0% |
| T_legacy | 6.98 | 22.4% | 2.542 | 0.2% |
| T_half | 6.274 | 10.1% | 2.353 | 0.0% |
| T_linear | 4.439 | 5.4% | 1.578 | 0.0% |
| Tnv_equal | 5.707 | 4.9% | 2.767 | 0.0% |
| Tnv_legacy | 6.038 | 11.4% | 2.772 | 0.0% |
| Tnv_half | 5.56 | 6.8% | 2.569 | 0.0% |
| Tnv_linear | 4.14 | 3.8% | 1.713 | 0.0% |
| S_equal | 1.881 | 0.0% | 2.096 | 0.0% |
| S_legacy | 1.898 | 0.0% | 2.072 | 0.0% |
| S_half | 1.909 | 0.0% | 2.006 | 0.0% |
| S_linear | 1.663 | 0.0% | 1.481 | 0.0% |

## Equal against rank weights, same 8 descriptors (raw)

Lists of the rank variant against the equal variant of the same source.

| variant | sonic: kept of 10 | balanced: kept of 10 | mood: kept of 10 | mood: same 10 |
|---|---|---|---|---|
| T_legacy | 9.996 | 9.471 | 7.504 | 10.7% |
| T_half | 9.975 | 7.452 | 6.019 | 1.5% |
| T_linear | 9.949 | 5.075 | 3.229 | 0.9% |
| S_legacy | 9.995 | 9.452 | 7.667 | 10.7% |
| S_half | 9.976 | 7.414 | 6.101 | 1.3% |
| S_linear | 9.954 | 5.0 | 3.155 | 0.9% |

## Rank minus equal on the proxies, paired by seed (raw)

Mean difference per seed, plus or minus one standard error. `desc_jaccard (sheet)` is not shown for S: the S lists are built from that same sheet list.

| comparison | stop | genre_primary | desc_jaccard (full table set) |
|---|---|---|---|
| S_half minus S_equal | balanced | +0.0098 ± 0.0016 | -0.0001 ± 0.0004 |
| S_half minus S_equal | mood | -0.0231 ± 0.0019 | -0.0060 ± 0.0006 |
| S_legacy minus S_equal | balanced | +0.0032 ± 0.0007 | +0.0005 ± 0.0002 |
| S_legacy minus S_equal | mood | -0.0279 ± 0.0014 | -0.0051 ± 0.0005 |
| S_linear minus S_equal | balanced | -0.0005 ± 0.0024 | -0.0125 ± 0.0006 |
| S_linear minus S_equal | mood | -0.0330 ± 0.0027 | -0.0256 ± 0.0009 |
| T_half minus T_equal | balanced | +0.0072 ± 0.0016 | -0.0039 ± 0.0005 |
| T_half minus T_equal | mood | -0.0218 ± 0.0018 | -0.0128 ± 0.0007 |
| T_legacy minus T_equal | balanced | +0.0026 ± 0.0007 | +0.0005 ± 0.0002 |
| T_legacy minus T_equal | mood | -0.0271 ± 0.0014 | -0.0074 ± 0.0005 |
| T_linear minus T_equal | balanced | -0.0028 ± 0.0023 | -0.0217 ± 0.0007 |
| T_linear minus T_equal | mood | -0.0340 ± 0.0024 | -0.0400 ± 0.0009 |

## Two readings of one album: 2022 page (Tnv) against 2026 sheet (S), raw

The same weighting on both. A weighting that leans on the order also leans on how the order moved in four years. Seeds: the 3,613 albums with a sheet list.

| weights | sonic: kept of 10 | balanced: kept of 10 | mood: kept of 10 | mood: same 10 |
|---|---|---|---|---|
| equal | 9.948 | 5.022 | 3.452 | 0.1% |
| legacy | 9.951 | 5.133 | 3.528 | 0.0% |
| half | 9.952 | 5.501 | 3.834 | 0.0% |
| linear | 9.952 | 5.359 | 3.707 | 0.0% |

## Mood words shown on an album (`d` in albums.json)

| variant | vocabulary | mean words shown | albums showing none | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| today | 114 | 7.75 | 73 | 73 | 92 | 127 | 162 | 187 | 234 | 293 | 337 | 353 | 311 | 1912 |
| T_today | 112 | 5.19 | 73 | 73 | 111 | 174 | 320 | 545 | 833 | 928 | 925 | 172 | 0 | 0 |
| T_equal | 112 | 5.19 | 73 | 73 | 111 | 174 | 320 | 545 | 833 | 928 | 925 | 172 | 0 | 0 |
| Tnv_equal | 112 | 5.59 | 73 | 73 | 101 | 156 | 255 | 385 | 636 | 881 | 1107 | 487 | 0 | 0 |
| S_equal | 109 | 5.98 | 22 | 22 | 54 | 79 | 192 | 335 | 590 | 917 | 1321 | 571 | 0 | 0 |

The columns 0 to 10 count albums by number of words shown.

## Examples, mood stop (raw)

### OK Computer (Radiohead)

Table, first 8 of 19: melancholic, anxious, futuristic, male vocals, existential, alienation, atmospheric, lonely.
Sheet: melancholic, anxious, alienation, futuristic, existential, atmospheric, lonely, cold.

- **today**: Low (David Bowie); Night on the Sun (Modest Mouse); Judgement (Anathema); Me Against the World (2Pac); Station to Station (David Bowie); Young Liars (TV on the Radio); Fear of a Blank Planet (Porcupine Tree); The Moon & Antarctica (Modest Mouse); Blues From Laurel Canyon (John Mayall); The Ideal Crash (dEUS)
- **T_equal** (4 of 10 kept): Low (David Bowie); Without You I'm Nothing (Placebo); The Moon & Antarctica (Modest Mouse); Blues From Laurel Canyon (John Mayall); Behaviour (Pet Shop Boys); The Bends (Radiohead); Field Songs (Mark Lanegan); Nervous Young Man (Car Seat Headrest); How to Leave Town (Car Seat Headrest); Night on the Sun (Modest Mouse)
- **T_half** (2 of 10 kept): White Pony (Deftones); Low (David Bowie); Fear of a Blank Planet (Porcupine Tree); Actos inexplicables (Nacho Vegas); Bubblegum (Mark Lanegan Band); Transcendental Blues (Steve Earle); El Corazón (Steve Earle); Behaviour (Pet Shop Boys); Without You I'm Nothing (Placebo); Time Out of Mind (Bob Dylan)
- **T_linear** (0 of 10 kept): Actos inexplicables (Nacho Vegas); Bubblegum (Mark Lanegan Band); Transcendental Blues (Steve Earle); El Corazón (Steve Earle); City of Caterpillar (City of Caterpillar); White Pony (Deftones); The Silent Corner and the Empty Stage (Peter Hammill); Time of the Last Persecution (Bill Fay); Brilliant Trees (David Sylvian); Kid A (Radiohead)
- **S_equal** (3 of 10 kept): The Moon & Antarctica (Modest Mouse); Kid A (Radiohead); Night on the Sun (Modest Mouse); Without You I'm Nothing (Placebo); Is This Desire? (PJ Harvey); Amnesiac (Radiohead); The Sophtware Slump (Grandaddy); Low (David Bowie); Meat Is Murder (The Smiths); The Pleasure Principle (Gary Numan)
- **S_linear** (2 of 10 kept): Kid A (Radiohead); Fear of a Blank Planet (Porcupine Tree); Actos inexplicables (Nacho Vegas); Without You I'm Nothing (Placebo); The Moon & Antarctica (Modest Mouse); Puberty 2 (Mitski); This Is a Long Drive for Someone With Nothing to Think About (Modest Mouse); Meat Is Murder (The Smiths); Amnesiac (Radiohead); Whatever and Ever Amen (Ben Folds Five)

### To Pimp a Butterfly (Kendrick Lamar)

Table, first 8 of 21: political, conscious, poetic, concept album, protest, introspective, urban, male vocals.
Sheet: political, conscious, concept album, poetic, introspective, urban, protest, eclectic.

- **today**: Damn. (Kendrick Lamar); Section.80 (Kendrick Lamar); Black on Both Sides (Mos Def); Curtis / Live! (Curtis Mayfield); Lupe Fiasco's Food & Liquor (Lupe Fiasco); In Camera (Peter Hammill); good kid, m.A.A.d city (Kendrick Lamar); Animals (Pink Floyd); All the World's a Stage (Rush); Epica Etica Etnica Pathos (CCCP Fedeli alla Linea)
- **T_equal** (1 of 10 kept): good kid, m.A.A.d city (Kendrick Lamar); Rap é compromisso (Sabotage); Sobrevivendo no inferno (Racionais MC's); Manger on McNichols (Boldy James & Sterling Toles); On Top of the World (Eightball & MJG); The Album of the Soundtrack of the Trailer of the Film of Monty Python and the Holy Grail (Monty Python); New York (Lou Reed); The Minstrel Show (Little Brother); Temps mort (Booba); Hell Hath No Fury (Clipse)
- **T_half** (2 of 10 kept): The Album of the Soundtrack of the Trailer of the Film of Monty Python and the Holy Grail (Monty Python); good kid, m.A.A.d city (Kendrick Lamar); Good Old Boys (Randy Newman); On Top of the World (Eightball & MJG); Animals (Pink Floyd); Manger on McNichols (Boldy James & Sterling Toles); Sobrevivendo no inferno (Racionais MC's); New York (Lou Reed); Doggystyle (Snoop Doggy Dogg); Sos, ciuchy i borciuchy (Kaz Bałagane x Bel MondoKaz BałaganeBelmondawg)
- **T_linear** (1 of 10 kept): Animals (Pink Floyd); Good Old Boys (Randy Newman); Joe's Garage Act I (Frank Zappa); Life After Death (The Notorious B.I.G.); Doggystyle (Snoop Doggy Dogg); Cold Fact (Rodriguez); Jammin' in New York (George Carlin); Shut Up, You Fucking Baby! (David Cross); The Distant Future (Flight of the Conchords); Relentless (Bill Hicks)
- **S_equal** (2 of 10 kept): good kid, m.A.A.d city (Kendrick Lamar); Section.80 (Kendrick Lamar); Sos, ciuchy i borciuchy (Kaz Bałagane x Bel MondoKaz BałaganeBelmondawg); Ready to Die (The Notorious B.I.G.); Doggystyle (Snoop Doggy Dogg); Demon Days (Gorillaz); The Album of the Soundtrack of the Trailer of the Film of Monty Python and the Holy Grail (Monty Python); Joe's Garage Act I (Frank Zappa); New York (Lou Reed); The Minstrel Show (Little Brother)
- **S_linear** (3 of 10 kept): The Album of the Soundtrack of the Trailer of the Film of Monty Python and the Holy Grail (Monty Python); Good Old Boys (Randy Newman); Animals (Pink Floyd); Joe's Garage Act I (Frank Zappa); good kid, m.A.A.d city (Kendrick Lamar); 69 Love Songs (The Magnetic Fields); Section.80 (Kendrick Lamar); The Dirty South (Drive-By Truckers); Doggystyle (Snoop Doggy Dogg); 2001 (Dr. Dre)

### Kind of Blue (Miles Davis)

Table, first 8 of 8: instrumental, mellow, improvisation, nocturnal, soothing, calm, acoustic, meditative.
Sheet: instrumental, mellow, nocturnal, soothing, improvisation, calm, acoustic, progressive.

- **today**: Night Train (The Oscar Peterson Trio); Concierto (Jim Hall); Duke Ellington & John Coltrane (Duke Ellington & John Coltrane); Sunday at the Village Vanguard (Bill Evans Trio); Portrait in Jazz (Bill Evans Trio); Idle Moments (Grant Green); Ballads (John Coltrane Quartet); Judgment! (Andrew Hill); Coltrane's Sound (John Coltrane); A Night at the Village Vanguard (Sonny Rollins)
- **T_equal** (7 of 10 kept): Portrait in Jazz (Bill Evans Trio); Night Train (The Oscar Peterson Trio); Sunday at the Village Vanguard (Bill Evans Trio); Idle Moments (Grant Green); Duke Ellington & John Coltrane (Duke Ellington & John Coltrane); Concierto (Jim Hall); Ballads (John Coltrane Quartet); Somethin' Else (Cannonball Adderley); Speak No Evil (Wayne Shorter); In a Silent Way (Miles Davis)
- **T_half** (6 of 10 kept): Sunday at the Village Vanguard (Bill Evans Trio); Night Train (The Oscar Peterson Trio); Portrait in Jazz (Bill Evans Trio); Idle Moments (Grant Green); Speak No Evil (Wayne Shorter); Somethin' Else (Cannonball Adderley); Ballads (John Coltrane Quartet); In a Silent Way (Miles Davis); Nocturnes (Maurizio Pollini); Duke Ellington & John Coltrane (Duke Ellington & John Coltrane)
- **T_linear** (6 of 10 kept): Sunday at the Village Vanguard (Bill Evans Trio); Night Train (The Oscar Peterson Trio); Idle Moments (Grant Green); Portrait in Jazz (Bill Evans Trio); Judgment! (Andrew Hill); Speak No Evil (Wayne Shorter); In a Silent Way (Miles Davis); Somethin' Else (Cannonball Adderley); Ballads (John Coltrane Quartet); Relaxin' With the Miles Davis Quintet (Miles Davis Quintet)
- **S_equal** (4 of 10 kept): Night Dreamer (Wayne Shorter); Suspended Night (Tomasz Stanko Quartet); Portrait in Jazz (Bill Evans Trio); Waltz for Debby (Bill Evans Trio); Work Song (Nat Adderley); Explorations (Bill Evans Trio); 'Round About Midnight (Miles Davis); Sunday at the Village Vanguard (Bill Evans Trio); Idle Moments (Grant Green); Duke Ellington & John Coltrane (Duke Ellington & John Coltrane)
- **S_linear** (5 of 10 kept): Idle Moments (Grant Green); Waltz for Debby (Bill Evans Trio); Moon Beams (The Bill Evans Trio); Sunday at the Village Vanguard (Bill Evans Trio); Portrait in Jazz (Bill Evans Trio); Ballads (John Coltrane Quartet); Everybody Digs Bill Evans (Bill Evans Trio); Explorations (Bill Evans Trio); Somethin' Else (Cannonball Adderley); Night Train (The Oscar Peterson Trio)

### Loveless (My Bloody Valentine)

Table, first 8 of 21: noisy, ethereal, atmospheric, romantic, love, dense, hypnotic, psychedelic.
Sheet: noisy, ethereal, atmospheric, dense, romantic, psychedelic, hypnotic, love.

- **today**: Winks & Kisses: Melted (Airiel); Slowdive (Slowdive); Glider (My Bloody Valentine); Once Twice Melody (Beach House); Souvlaki (Slowdive); m b v (My Bloody Valentine); Just for a Day (Slowdive); Fall (Ride); Nowhere (Ride); Pushing Daisies (Julie)
- **T_equal** (4 of 10 kept): Glider (My Bloody Valentine); m b v (My Bloody Valentine); Flash Desire (Yabujin); Dynamo (Soda Stereo); Dopethrone (Electric Wizard); Winks & Kisses: Melted (Airiel); Once Twice Melody (Beach House); Thousands on a Raft (Pete Brown & Piblokto!); Bullitt (Lalo Schifrin); Halfbreed (Keef Hartley Band)
- **T_half** (4 of 10 kept): Glider (My Bloody Valentine); m b v (My Bloody Valentine); Flash Desire (Yabujin); Going Places (Yellow Swans); Once Twice Melody (Beach House); Dynamo (Soda Stereo); Absence (Dälek); Winks & Kisses: Melted (Airiel); Bullitt (Lalo Schifrin); Split Personalities (12 Rods)
- **T_linear** (3 of 10 kept): Glider (My Bloody Valentine); Absence (Dälek); Going Places (Yellow Swans); m b v (My Bloody Valentine); Koi no yokan (Deftones); Once Twice Melody (Beach House); Bullitt (Lalo Schifrin); Split Personalities (12 Rods); Hole in the Heart (Ramleh); OM (Negură Bunget)
- **S_equal** (3 of 10 kept): m b v (My Bloody Valentine); Glider (My Bloody Valentine); Once Twice Melody (Beach House); Flash Desire (Yabujin); Today Is the Day! (Yo La Tengo); Eureka (きのこ帝国 [Kinoko Teikoku]); 7 (Beach House); Amplifier Worship (Boris); Dopethrone (Electric Wizard); Royal Albert Hall October 10 1997 Live (Spiritualized®)
- **S_linear** (4 of 10 kept): Glider (My Bloody Valentine); m b v (My Bloody Valentine); Going Places (Yellow Swans); Absence (Dälek); Once Twice Melody (Beach House); Koi no yokan (Deftones); 7 (Beach House); Royal Albert Hall October 10 1997 Live (Spiritualized®); HEY WHAT (Low); Nowhere (Ride)

### Abbey Road (The Beatles)

Table, first 8 of 20: melodic, warm, male vocals, summer, bittersweet, uplifting, love, romantic.
Sheet: melodic, warm, medley, uplifting, bittersweet, love, summer, lush.

- **today**: Songs From Northern Britain (Teenage Fanclub); Something / Anything? (Todd Rundgren); White Pepper (Ween); Spilt Milk (Jellyfish); Re (Café Tacvba); La voce del padrone (Franco Battiato); The Kinks Are the Village Green Preservation Society (The Kinks); #1 Record (Big Star); Previsão do tempo (Marcos Valle); Magical Mystery Tour (The Beatles)
- **T_equal** (2 of 10 kept): The Boy With the Arab Strap (Belle & Sebastian); #1 Record (Big Star); Tigermilk (Belle and Sebastian); Radio City (Big Star); Songs in the Key of Life (Stevie Wonder); Songs From Northern Britain (Teenage Fanclub); Chutes Too Narrow (The Shins); Lavender Country (Lavender Country); Keep It Like a Secret (Built to Spill); In the Dark (Toots & The Maytals)
- **T_half** (1 of 10 kept): Radio City (Big Star); Keep It Like a Secret (Built to Spill); Lavender Country (Lavender Country); The Boy With the Arab Strap (Belle & Sebastian); Chutes Too Narrow (The Shins); In the Dark (Toots & The Maytals); Loaded (The Velvet Underground); The Kinks Are the Village Green Preservation Society (The Kinks); Tigermilk (Belle and Sebastian); I, Jonathan (Jonathan Richman)
- **T_linear** (1 of 10 kept): Radio City (Big Star); Let It Be... Naked (The Beatles); Keep It Like a Secret (Built to Spill); The Kinks Are the Village Green Preservation Society (The Kinks); Lavender Country (Lavender Country); Loaded (The Velvet Underground); Chutes Too Narrow (The Shins); Di Melo (Di Melo); Malibu (Anderson .Paak); The Gilded Palace of Sin (The Flying Burrito Bros)
- **S_equal** (0 of 10 kept): Loaded (The Velvet Underground); Willy and the Poor Boys (Creedence Clearwater Revival); Just as I Am (Bill Withers); Forever Changes (Love); Clube da Esquina (Milton Nascimento & Lô Borges); This Is the Sea (The Waterboys); Roots (Curtis Mayfield); Meus caros amigos (Chico Buarque); Fleet Foxes (Fleet Foxes); Yoshimi Battles the Pink Robots (The Flaming Lips)
- **S_linear** (2 of 10 kept): Willy and the Poor Boys (Creedence Clearwater Revival); Garra (Marcos Valle); Keep It Like a Secret (Built to Spill); There's Nothing Wrong With Love (Built to Spill); #1 Record (Big Star); Uprising (Bob Marley & The WailersBob MarleyThe Wailers); Rough Trade Session (Weyes Blood); The Kinks Are the Village Green Preservation Society (The Kinks); Samba esquema novo (Jorge Ben); Going Blank Again (Ride)

