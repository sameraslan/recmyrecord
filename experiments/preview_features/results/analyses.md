# The proposed block (D64): analyses for the report

3944 albums, 4 tracks per album.

## What changes for the user

Cells: mean over seeds; `(…)` = paired difference against A, * = 95% CI (over artists) excludes 0. `_xa` = the seed artist's other albums removed. feel_mad = mean |z| difference to the neighbours on Spotify's feel axes (lower = closer). N10 = number of top-10 lists an album appears in.

### sonic

|  | overlap@10 with A | genre_primary | genre_any | genre_family | genre_primary_xa | genre_family_xa | feel_mad | N10 skew | N10 max | never recommended |
|---|---|---|---|---|---|---|---|---|---|---|
| A | – | 0.093 | 0.179 | 0.406 | 0.080 | 0.396 | 0.361 | 0.78 | 40 | 1.9% |
| D64 | 0.049 | 0.239 (+0.147*) | 0.416 (+0.238*) | 0.652 (+0.246*) | 0.203 (+0.123*) | 0.634 (+0.238*) | 0.637 (+0.277*) | 0.80 | 36 | 0.7% |
| D64~mp | 0.048 | 0.240 (+0.148*) | 0.421 (+0.243*) | 0.653 (+0.246*) | 0.205 (+0.125*) | 0.634 (+0.238*) | 0.644 (+0.283*) | 0.55 | 29 | 0.5% |

### balanced

|  | overlap@10 with A | genre_primary | genre_any | genre_family | genre_primary_xa | genre_family_xa | feel_mad | N10 skew | N10 max | never recommended |
|---|---|---|---|---|---|---|---|---|---|---|
| A | – | 0.191 | 0.330 | 0.552 | 0.154 | 0.529 | 0.504 | 2.87 | 128 | 6.9% |
| D64 | 0.340 | 0.270 (+0.080*) | 0.456 (+0.126*) | 0.669 (+0.116*) | 0.224 (+0.070*) | 0.645 (+0.115*) | 0.650 (+0.146*) | 2.53 | 91 | 4.6% |
| D64~mp | 0.305 | 0.282 (+0.091*) | 0.478 (+0.148*) | 0.676 (+0.123*) | 0.233 (+0.079*) | 0.650 (+0.121*) | 0.649 (+0.146*) | 0.72 | 36 | 0.8% |

### mood

|  | overlap@10 with A | genre_primary | genre_any | genre_family | genre_primary_xa | genre_family_xa | feel_mad | N10 skew | N10 max | never recommended |
|---|---|---|---|---|---|---|---|---|---|---|
| A | – | 0.165 | 0.288 | 0.498 | 0.132 | 0.476 | 0.768 | 2.21 | 101 | 7.2% |
| D64 | 0.970 | 0.167 (+0.002*) | 0.290 (+0.003*) | 0.501 (+0.003*) | 0.133 (+0.001*) | 0.479 (+0.003*) | 0.773 (+0.005*) | 2.17 | 100 | 7.1% |
| D64~mp | 0.578 | 0.178 (+0.013*) | 0.314 (+0.026*) | 0.516 (+0.019*) | 0.141 (+0.009*) | 0.492 (+0.016*) | 0.764 (-0.004*) | 0.75 | 37 | 0.8% |

### audio

|  | overlap@10 with A | genre_primary | genre_any | genre_family | genre_primary_xa | genre_family_xa | feel_mad | N10 skew | N10 max | never recommended |
|---|---|---|---|---|---|---|---|---|---|---|
| A | – | 0.092 | 0.177 | 0.404 | 0.080 | 0.395 | 0.361 | 0.77 | 40 | 1.9% |
| D64 | 0.048 | 0.239 (+0.147*) | 0.416 (+0.239*) | 0.652 (+0.248*) | 0.202 (+0.123*) | 0.633 (+0.239*) | 0.638 (+0.277*) | 0.79 | 36 | 0.7% |
| D64~mp | 0.047 | 0.240 (+0.148*) | 0.420 (+0.244*) | 0.652 (+0.248*) | 0.204 (+0.125*) | 0.634 (+0.240*) | 0.644 (+0.283*) | 0.56 | 29 | 0.5% |

### Feel axes at the sonic stop (mean |z| difference to the neighbours)

|  | energy | acousticness | valence | danceability | instrumentalness | tempo |
|---|---|---|---|---|---|---|
| A | 0.285 | 0.231 | 0.355 | 0.423 | 0.236 | 0.636 |
| D64 | 0.571 | 0.512 | 0.619 | 0.583 | 0.644 | 0.896 |
| D64~mp | 0.575 | 0.515 | 0.627 | 0.586 | 0.648 | 0.912 |

### In plain words (computed from the tables above)

- **sonic**: 0.5 of an album's 10 recommendations stay the same. 2.4 of 10 share the seed's primary genre (now 0.9), 6.5 its genre family (now 4.1); without the seed artist's own albums 2.0 against 0.8. Feel distance 0.64 against 0.36 (+77%). Most recommended album: in 36 lists (now 40); never recommended: 0.7% (now 1.9%). With mutual proximity: max 29, never 0.5%, primary genre +0.001 against plain D64.
- **balanced**: 3.4 of an album's 10 recommendations stay the same. 2.7 of 10 share the seed's primary genre (now 1.9), 6.7 its genre family (now 5.5); without the seed artist's own albums 2.2 against 1.5. Feel distance 0.65 against 0.50 (+29%). Most recommended album: in 91 lists (now 128); never recommended: 4.6% (now 6.9%). With mutual proximity: max 36, never 0.8%, primary genre +0.012* against plain D64.
- **mood**: 9.7 of an album's 10 recommendations stay the same. 1.7 of 10 share the seed's primary genre (now 1.7), 5.0 its genre family (now 5.0); without the seed artist's own albums 1.3 against 1.3. Feel distance 0.77 against 0.77 (+1%). Most recommended album: in 100 lists (now 101); never recommended: 7.1% (now 7.2%). With mutual proximity: max 37, never 0.8%, primary genre +0.012* against plain D64.
- At the sonic stop the neighbours move away from the seed most on instrumentalness (0.64 against 0.24), energy and acousticness; least on danceability (0.58 against 0.42).

## Matching noise: flagged against clean matches

Cells: `D64 / A (gain over A; that gain minus the clean albums' gain)`, * = 95% CI (over artists) of the last difference excludes 0. A's features do not depend on the Deezer / iTunes match, so a flag that hurts the new block shows as a negative starred last number. `dur_off`: mean track duration more than 10% from Spotify's (or unknown).

| match (albums) | genre_primary | genre_family | desc_cos | genre_primary_xa | desc_cos_xa | bal_genre_primary |
|---|---|---|---|---|---|---|
| clean (3305) | 0.240 / 0.093 (+0.146) | 0.657 / 0.412 (+0.245) | 0.447 / 0.362 (+0.085) | 0.203 / 0.081 (+0.122) | 0.433 / 0.357 (+0.077) | 0.271 / 0.194 (+0.077) |
| any_flag (639) | 0.236 / 0.085 (+0.151; +0.005) | 0.624 / 0.363 (+0.261; +0.016) | 0.437 / 0.336 (+0.102; +0.016*) | 0.202 / 0.072 (+0.129; +0.008) | 0.424 / 0.329 (+0.095; +0.018*) | 0.267 / 0.175 (+0.092; +0.015*) |
| ambiguous (148) | 0.207 / 0.044 (+0.164; +0.017) | 0.606 / 0.307 (+0.299; +0.054) | 0.391 / 0.290 (+0.101; +0.015) | 0.182 / 0.042 (+0.141; +0.019) | 0.382 / 0.288 (+0.093; +0.017) | 0.197 / 0.116 (+0.081; +0.004) |
| oversized (347) | 0.250 / 0.098 (+0.153; +0.006) | 0.648 / 0.393 (+0.255; +0.010) | 0.441 / 0.353 (+0.088; +0.003) | 0.210 / 0.082 (+0.129; +0.007) | 0.427 / 0.345 (+0.081; +0.004) | 0.289 / 0.196 (+0.093; +0.015) |
| dur_off (175) | 0.222 / 0.056 (+0.166; +0.020) | 0.598 / 0.269 (+0.329; +0.084*) | 0.429 / 0.285 (+0.144; +0.058*) | 0.190 / 0.049 (+0.142; +0.020) | 0.418 / 0.281 (+0.137; +0.060*) | 0.260 / 0.140 (+0.120; +0.042*) |
| spotify_twin (94) | 0.282 / 0.149 (+0.133; -0.013) | 0.619 / 0.436 (+0.183; -0.062) | 0.485 / 0.395 (+0.090; +0.005) | 0.247 / 0.126 (+0.121; -0.000) | 0.471 / 0.380 (+0.091; +0.015) | 0.331 / 0.246 (+0.086; +0.008) |
| itunes (191) | 0.228 / 0.088 (+0.140; -0.007) | 0.597 / 0.371 (+0.226; -0.019) | 0.421 / 0.312 (+0.109; +0.024*) | 0.204 / 0.078 (+0.126; +0.004) | 0.411 / 0.306 (+0.105; +0.028*) | 0.263 / 0.192 (+0.072; -0.006) |

## Descriptor imputation: below how many descriptors?

### (a) Rich seeds (2201 with 10+ descriptors) keeping their m strongest

`kept m`: the seed queries with only its m strongest descriptors; `filled m`: those, plus the audio prediction where it is larger; `imputed`: the prediction alone; `audio`: no descriptors on either side; `true`: all of them (desc_cos is then circular). The catalog keeps its true descriptors. Judged against the seed's true descriptors and genres. Plain euclidean ranking.

**balanced stop**

| seed descriptors | desc_cos | genre_primary | genre_family |
|---|---|---|---|
| audio | 0.445 ±0.006 | 0.213 ±0.012 | 0.621 ±0.017 |
| imputed | 0.474 ±0.007 | 0.174 ±0.012 | 0.592 ±0.019 |
| kept 0 | 0.380 ±0.012 | 0.082 ±0.008 | 0.490 ±0.020 |
| filled 0 | 0.474 ±0.007 | 0.174 ±0.012 | 0.592 ±0.019 |
| kept 1 | 0.428 ±0.009 | 0.097 ±0.009 | 0.505 ±0.020 |
| filled 1 | 0.497 ±0.006 | 0.191 ±0.013 | 0.604 ±0.018 |
| kept 2 | 0.466 ±0.008 | 0.115 ±0.010 | 0.523 ±0.020 |
| filled 2 | 0.517 ±0.006 | 0.206 ±0.013 | 0.616 ±0.018 |
| kept 3 | 0.497 ±0.007 | 0.132 ±0.010 | 0.539 ±0.021 |
| filled 3 | 0.535 ±0.006 | 0.218 ±0.013 | 0.624 ±0.018 |
| kept 4 | 0.519 ±0.006 | 0.148 ±0.011 | 0.555 ±0.020 |
| filled 4 | 0.551 ±0.006 | 0.228 ±0.014 | 0.633 ±0.018 |
| kept 5 | 0.539 ±0.006 | 0.170 ±0.012 | 0.573 ±0.020 |
| filled 5 | 0.566 ±0.005 | 0.236 ±0.014 | 0.638 ±0.018 |
| kept 6 | 0.557 ±0.006 | 0.190 ±0.012 | 0.590 ±0.019 |
| filled 6 | 0.578 ±0.005 | 0.246 ±0.014 | 0.646 ±0.017 |
| kept 8 | 0.588 ±0.005 | 0.217 ±0.013 | 0.617 ±0.018 |
| filled 8 | 0.599 ±0.005 | 0.254 ±0.014 | 0.654 ±0.017 |
| kept 10 | 0.613 ±0.005 | 0.235 ±0.014 | 0.635 ±0.018 |
| filled 10 | 0.615 ±0.005 | 0.258 ±0.015 | 0.658 ±0.017 |
| true | 0.649 ±0.005 | 0.257 ±0.015 | 0.653 ±0.017 |

**mood stop**

| seed descriptors | desc_cos | genre_primary | genre_family |
|---|---|---|---|
| audio | 0.445 ±0.006 | 0.213 ±0.012 | 0.621 ±0.017 |
| imputed | 0.496 ±0.007 | 0.064 ±0.008 | 0.391 ±0.021 |
| kept 0 | – | 0.001 ±0.001 | 0.008 ±0.002 |
| filled 0 | 0.496 ±0.007 | 0.064 ±0.008 | 0.391 ±0.021 |
| kept 1 | – | 0.018 ±0.003 | 0.110 ±0.011 |
| filled 1 | 0.514 ±0.006 | 0.081 ±0.008 | 0.418 ±0.020 |
| kept 2 | 0.444 ±0.018 | 0.031 ±0.004 | 0.172 ±0.016 |
| filled 2 | 0.535 ±0.005 | 0.100 ±0.009 | 0.442 ±0.020 |
| kept 3 | 0.534 ±0.008 | 0.040 ±0.005 | 0.217 ±0.017 |
| filled 3 | 0.557 ±0.005 | 0.117 ±0.010 | 0.462 ±0.019 |
| kept 4 | 0.554 ±0.006 | 0.052 ±0.006 | 0.262 ±0.018 |
| filled 4 | 0.576 ±0.005 | 0.130 ±0.010 | 0.482 ±0.020 |
| kept 5 | 0.564 ±0.006 | 0.065 ±0.007 | 0.300 ±0.018 |
| filled 5 | 0.593 ±0.005 | 0.141 ±0.010 | 0.499 ±0.020 |
| kept 6 | 0.580 ±0.005 | 0.079 ±0.008 | 0.337 ±0.019 |
| filled 6 | 0.610 ±0.005 | 0.154 ±0.011 | 0.515 ±0.019 |
| kept 8 | 0.613 ±0.005 | 0.104 ±0.010 | 0.399 ±0.020 |
| filled 8 | 0.638 ±0.005 | 0.168 ±0.012 | 0.533 ±0.018 |
| kept 10 | 0.642 ±0.005 | 0.130 ±0.010 | 0.448 ±0.019 |
| filled 10 | 0.659 ±0.004 | 0.175 ±0.012 | 0.540 ±0.018 |
| true | 0.691 ±0.004 | 0.164 ±0.012 | 0.498 ±0.018 |

### (b) Real albums by descriptor count

Cells: genre_primary / genre_family of the top 10. `as_is` is the site's recipe; `imputed` / `filled` change the seed's query only; `~mp`: ranked by mutual proximity.

**balanced stop**

| descriptors (albums) | audio | as_is | imputed | filled | as_is~mp | imputed~mp | filled~mp |
|---|---|---|---|---|---|---|---|
| 0-2 (167) | 0.323 / 0.681 | 0.300 / 0.655 | 0.346 / 0.673 | 0.345 / 0.679 | 0.309 / 0.670 | 0.340 / 0.684 | 0.336 / 0.689 |
| 3-4 (272) | 0.287 / 0.680 | 0.279 / 0.668 | 0.287 / 0.668 | 0.305 / 0.693 | 0.291 / 0.683 | 0.318 / 0.699 | 0.317 / 0.710 |
| 5-6 (394) | 0.267 / 0.701 | 0.285 / 0.697 | 0.269 / 0.688 | 0.315 / 0.717 | 0.297 / 0.699 | 0.287 / 0.712 | 0.314 / 0.720 |
| 7-9 (910) | 0.262 / 0.693 | 0.289 / 0.696 | 0.251 / 0.666 | 0.312 / 0.717 | 0.312 / 0.716 | 0.287 / 0.700 | 0.319 / 0.723 |
| 10+ (2201) | 0.213 / 0.621 | 0.257 / 0.653 | 0.174 / 0.592 | 0.264 / 0.661 | 0.264 / 0.654 | 0.223 / 0.632 | 0.272 / 0.660 |

**mood stop**

| descriptors (albums) | audio | as_is | imputed | filled | as_is~mp | imputed~mp | filled~mp |
|---|---|---|---|---|---|---|---|
| 0-2 (167) | 0.323 / 0.681 | 0.139 / 0.396 | 0.175 / 0.444 | 0.177 / 0.457 | 0.133 / 0.387 | 0.162 / 0.454 | 0.145 / 0.415 |
| 3-4 (272) | 0.287 / 0.680 | 0.162 / 0.476 | 0.161 / 0.495 | 0.193 / 0.574 | 0.161 / 0.487 | 0.212 / 0.567 | 0.194 / 0.561 |
| 5-6 (394) | 0.267 / 0.701 | 0.166 / 0.516 | 0.148 / 0.506 | 0.218 / 0.617 | 0.185 / 0.543 | 0.222 / 0.605 | 0.227 / 0.611 |
| 7-9 (910) | 0.262 / 0.693 | 0.180 / 0.528 | 0.133 / 0.500 | 0.219 / 0.597 | 0.197 / 0.555 | 0.212 / 0.606 | 0.222 / 0.603 |
| 10+ (2201) | 0.213 / 0.621 | 0.164 / 0.498 | 0.064 / 0.391 | 0.183 / 0.542 | 0.175 / 0.509 | 0.147 / 0.534 | 0.195 / 0.543 |

### (c) Policies for albums with fewer than N descriptors

`filled` / `imputed`: the seed's query only (solution.py's `--impute-below N` is `filled`); `imputed_both_roles`: the album's row replaced, as seed and as candidate. Ranking as solution.py's default at that stop. Cells: paired change against no imputation (* = 95% CI excludes 0); N10 = mean number of lists the affected albums are in (10 = an average album).

**balanced stop** (mutual proximity ranking)

| N (albums affected) | policy | genre_primary affected | genre_primary others | genre_family affected | genre_family others | N10 before | N10 after |
|---|---|---|---|---|---|---|---|
| 3 (167) | filled | +0.033* | +0.001 | +0.019 | +0.001 | 15.3 | 10.7 |
| 3 (167) | imputed | +0.037* | +0.001 | +0.015 | +0.001 | 15.3 | 10.2 |
| 3 (167) | imputed_both_roles | +0.015 | +0.001 | +0.001 | -0.000 | 15.3 | 18.8 |
| 5 (439) | filled | +0.020* | +0.001* | +0.018* | +0.001 | 13.0 | 10.5 |
| 5 (439) | imputed | +0.022* | +0.001 | +0.017* | +0.001 | 13.0 | 10.4 |
| 5 (439) | imputed_both_roles | +0.005 | -0.000 | -0.003 | -0.000 | 13.0 | 16.6 |
| 7 (833) | filled | +0.021* | +0.003* | +0.020* | +0.001 | 11.9 | 10.6 |
| 7 (833) | imputed | +0.013* | +0.002 | +0.014* | +0.002 | 11.9 | 10.5 |
| 7 (833) | imputed_both_roles | -0.026* | -0.002 | -0.013* | +0.001 | 11.9 | 14.9 |

**mood stop** (plain ranking)

| N (albums affected) | policy | genre_primary affected | genre_primary others | genre_family affected | genre_family others | N10 before | N10 after |
|---|---|---|---|---|---|---|---|
| 3 (167) | filled | +0.038* | +0.000 | +0.062* | +0.000 | 30.3 | 24.5 |
| 3 (167) | imputed | +0.036* | +0.000 | +0.048 | +0.000 | 30.3 | 25.7 |
| 3 (167) | imputed_both_roles | +0.105* | +0.001 | +0.173* | +0.004* | 30.3 | 83.2 |
| 5 (439) | filled | +0.034* | +0.000 | +0.084* | +0.000 | 24.4 | 20.3 |
| 5 (439) | imputed | +0.013 | +0.000 | +0.030* | +0.000 | 24.4 | 23.4 |
| 5 (439) | imputed_both_roles | +0.115* | +0.000 | +0.190* | +0.011* | 24.4 | 53.3 |
| 7 (833) | filled | +0.042* | +0.000 | +0.092* | +0.000 | 20.2 | 17.0 |
| 7 (833) | imputed | -0.002 | +0.000 | +0.011 | +0.000 | 20.2 | 20.4 |
| 7 (833) | imputed_both_roles | +0.086* | +0.000 | +0.164* | +0.026* | 20.2 | 35.4 |

