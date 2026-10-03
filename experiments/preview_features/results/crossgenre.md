# Cross-genre benchmark for the sonic stop

Does an audio block's neighbour list reach outside the seed's genre while still agreeing on how the
music feels? Every number is on the audio block alone, euclidean top 10, the seed artist's other
albums removed from the candidates (except `desc_cos`, which keeps them, as simbench does).

**Measures.** `xg cos`: rank only the albums outside the seed's genre family, take the top 10, mean RYM
descriptor cosine with the seed. `xg lift`: that minus the seed's floor, the mean cosine over every
out-of-family album (what a random out-of-family pick scores). `lift primary / strict / disjoint`: the
same with "outside" meaning another primary genre / another family and no RYM genre in common / no
family in common among any of the two albums' genres. `out primary`, `out family`, `families /list`:
how far the plain top 10 reaches. `cross out cos (n)` / `cross in cos (n)`: descriptor cosine of the
out-of-family / in-family members of the plain top 10 (n = members per list); `cross out lift`: the
out-of-family members' cosine minus their seed's out-of-family floor. `probe`: out-of-fold accuracy of
a linear classifier predicting the genre family from the block. `hub skew`, `never`: hubness.
Cells `a ±b`: mean and half-width of the 95% CI (bootstrap over artists); `*` in difference tables: the
paired CI excludes 0.

**How to read it.** `xg lift` and `out family` trade off. `xg lift` asks "if forced out of the genre, are
the picks good?" and does not reward leaving; `out family` says how often the plain list leaves and
does not ask whether the leavers are good; `cross out lift` joins the two for the plain list (the
quality of the crossings that actually happen). The controls show the failure the pair guards against:
`random` and `shuffled` leave the family almost always and sit at lift 0.

**Caveats.** Every measure is an RYM proxy. RYM descriptors correlate with genre, so a representation
that leaves the genre loses descriptor agreement partly by construction, and the out-of-family floor
is lower than the overall one. Families are a regex over RYM genre names (genres.py): "Jazz-Rock" is in
the jazz family, so Bitches Brew -> Embryo's Rocksession is not a family crossing, only a primary-genre
one. Lists are the real test.

**Fitting.** Anything fitted with RYM genres or Spotify columns is out of fold by artist; the PCA is
fitted on the pool. `famoracle` needs the album's RYM genre at run time and is shown as an upper bound
only. Names are explained in crossgenre.py's docstring.

## What the numbers show

Written by hand from the tables below (3 October 2026); every figure is in a table.

**The measurement behaves.**

- `random` and `shuffled/64` sit at the floors on both pools: xg lift -0.001 to -0.003, out family 0.87 (a random list: 0.866 / 0.87), descriptor cosine at the floor.
- Plain EffNet reproduces the earlier tables: on the 1,000 albums `effnet/24` has primary genre 0.180 and desc_cos 0.420 (bakeoff_eval.md: 0.180, 0.420); on the full pool `effnet/64` has primary_xa 0.202 and desc_cos_xa 0.432 (holdout.md: 0.202, 0.432).
- Plain EffNet already leaves the family for 0.44 of its top 10 on the 1,000 albums and 0.37 on the full pool, and for 0.84 / 0.80 by primary genre. Its out-of-family members agree less with the seed than its in-family members (descriptor cosine 0.365 vs 0.456 on the 1,000; 0.379 vs 0.463 on the full pool) and far more than a random out-of-family album (floor 0.231 / 0.217).

**Models (1,000 albums, same clips).**

- No model picks better out-of-family neighbours than EffNet when forced out of the family: xg lift EffNet +0.120, CLAP music-and-speech +0.120 (difference +0.001, not significant), MusiCNN +0.115, CLAP htsat-unfused +0.112, MERT middle +0.085.
- CLAP music-and-speech reaches further at almost no cost: out family 0.485 vs 0.440 (+0.044*), desc_cos_xa 0.407 vs 0.414 (-0.007*), primary_xa 0.123 vs 0.165. MusiCNN reaches as far (+0.043*) but loses more agreement (-0.018*). CLAP htsat-unfused: +0.090* reach, -0.018* agreement.
- MERT reaches furthest (out family 0.60 to 0.69) with the lowest agreement (desc_cos_xa 0.33 to 0.37) and strong hubness (skew 2 to 2.6; 7 to 10% of albums in no list). By layer: layers 5 and 6 are best on every agreement measure (xg lift +0.088 / +0.090); early layers 1 to 3 are worse (+0.072 to +0.078) and reach slightly further; late layers are worst. Every layer is the same distance above the noise curve (+0.026 to +0.030): layers move along the trade-off, not off it. Early layers are not better than the middle ones.
- PCA 24 and PCA 64 give the same picture for every model.

**Removing genre from EffNet.**

- Projecting out the Discogs-400 layer's directions does nothing, at any rank. On the full pool, r = 400: out family 0.371 vs 0.366, probe 0.718 vs 0.721, desc_cos_xa 0.430 vs 0.432. Those 400 directions hold 64% of the album vectors' variance, and the remaining 36% orders albums the same way; keeping only the 400 directions also gives the same lists. The genre information is spread over the whole embedding, not confined to what the last layer reads.
- Removal fitted with RYM families works on the probe and moves reach, but lowers the quality of out-of-family picks. Full pool: LEACE probe 0.24 (from 0.72), out family 0.487 (+0.120*), xg lift +0.096 (-0.052*), desc_cos_xa 0.400 (-0.032*). INLP after 1 / 2 / 4 / 6 rounds: out family 0.380 / 0.404 / 0.471 / 0.567, xg lift +0.144 / +0.136 / +0.111 / +0.072. Family-mean directions (bcs 4 / 8 / 16): out family 0.393 / 0.428 / 0.484, xg lift +0.118 / +0.110 / +0.096.
- Against EffNet diluted with noise to the same reach, these are roughly level on xg lift (-0.03 to +0.015 across both pools) and somewhat better on the list's overall agreement (desc_cos_xa +0.00 to +0.03).
- They raise hubness: skew 2.4 to 7.4 against 0.8 on the full pool (INLP 4+, bcs 8+, LEACE, the mean subtractions).
- Subtracting the predicted family mean (`fampred`, qualifies): out family 0.461, xg lift +0.117, desc_cos_xa 0.414 on the full pool. Subtracting the true family mean (`famoracle`, does not qualify) is worse than that on every count and does not even increase reach on the full pool (0.353).

**Blends with feel scalars.**

- Up to half the variance on the feel block changes little (full pool, `ball@0.5`: out family +0.013*, xg lift +0.004*, desc_cos_xa -0.002). At 0.75 to 0.9 reach rises by +0.03 to +0.08 and desc_cos_xa falls by 0.011 to 0.030.
- The scalar blocks alone reach as far as LEACE with better out-of-family picks: full pool `ball` out family 0.473, xg lift +0.128, desc_cos_xa 0.398; `feel` 0.488 / +0.121 / 0.389; `ridge` 0.521 / +0.112 / 0.379. Their probe stays high (0.64 to 0.70): family is still linearly readable from them.
- The three scalar blocks (16 chosen "feel" scalars, all 33, the Ridge block) behave alike; none is clearly better at the same share.

**Combinations.**

- Best reach-for-agreement on the 1,000 albums: `clap_music-inlp2/64` (out family 0.588, xg lift +0.098, desc_cos_xa 0.383; +0.034 / +0.037 above the noise curve), `clap_music-inlp1/64` (0.538, +0.110, 0.397), `clap/64`, and genre-removed EffNet joined to the scalars (`effnet-leace/64+ball@0.5`: 0.534, +0.106, 0.401). Their distances above the noise curve (+0.03 to +0.04) are not separable from one another: the CI half-width of xg lift is about 0.006 and the curve is interpolated.
- On the full pool, without CLAP: `effnet-leace/64+ball@0.5` (out family 0.428, xg lift +0.139, desc_cos_xa 0.424) and `effnet-fampred/64+ball@0.5` (0.417, +0.142, 0.426) give +0.05 to +0.06 reach for -0.006 to -0.007 desc_cos_xa.
- EffNet and CLAP side by side is EffNet: out family 0.440.

**Descriptor-supervised projection (not in the brief; trained towards the yardstick).**

- It is the only thing that raises xg lift: full pool `effnet-ndesc/64` +0.170 vs +0.148 (+0.022*), with out family 0.384 (+0.018*) and desc_cos_xa 0.440 (+0.008*). With two INLP rounds on top (`effnet-ndesc-inlp2/64`): out family 0.427 (+0.061*), xg lift +0.162 (+0.014*), desc_cos_xa 0.428 (-0.004*).
- On the 1,000 albums the gain is +0.010* for EffNet and +0.001 for CLAP (800 training albums per fold).

**MMR.** Lambda 0.5 on EffNet: out family 0.407 on the full pool (+0.041*), desc_cos_xa 0.417 (-0.015*), and hubness falls (skew 0.25, no album left out of every list). Close to the trade noise dilution gives (desc_cos_xa +0.009 above the curve).

**Summary of the trade-off.** Nothing tested is more than about 0.04 above the noise curve on either measure. No audio-only candidate both reaches clearly further and keeps EffNet's agreement; the candidates differ mainly in where they sit on one frontier.

**New albums.** Unsupervised blocks are unchanged when the transform is fitted without the album (`clap_music/64`: every difference 0.000, 0.99 of the list the same). With a fitted genre removal the held-out albums score like the in-fit ones (`clap_music-inlp2/64`: xg lift -0.001, out family -0.005, neither significant; `effnet-leace/64+ball@0.5`: all within 0.001) but 13 to 28% of each list changes. `effnet-fampred/64+ball@0.5`: held-out albums reach further than in-fit ones (out family +0.017*). For the two RYM-fitted removals the in-fit catalog is less genre-free than the out-of-fold tables suggest (`clap_music-inlp2/64` out family: in fit 0.564, out of fold 0.588). For `ndesc` the held-out albums lose 0.007* on the agreement measures against in-fit, and still sit above the out-of-fold figure because 80% of the catalog they query was fitted on its own descriptors.

**Bitches Brew.** Neither the seed nor *Live-Evil*, *Get Up With It* or *Rocksession* is among the 1,000 bake-off albums, so CLAP and MERT cannot be shown for it. On the full pool no candidate puts a prog-rock album in the top 10 and none brings the three targets into it. Ranks under plain `effnet/64`: Live-Evil 70, Get Up With It 286, Rocksession 430. Closest: `effnet-leace/64` (11, 80, 2434) and `effnet-ndesc-inlp2/64` (19, 152, 200). The few non-jazz entries that appear come from the mean-subtraction and LEACE variants (Augustus Pablo, Madlib's Blue Note record, the *Phantom Thread* score). The pool here has four clips per album; the site's store has up to eight, so the site's own list differs.

**Not done.** CLAP and MERT on the full catalog (weights deleted, no download). Listening.

## 1,000 bake-off albums, 2 clips per album, the same clips for every model

1000 albums, 711 artists. Mean out-of-genre floor of the descriptor cosine: family 0.231, primary 0.242, strict 0.230, disjoint 0.225. Largest family: 0.271 of the albums (the probe's majority-class accuracy). A random list has 0.866 of its members outside the seed's family.

### Models and controls

| candidate | dims | xg cos | xg lift | lift primary | lift strict | lift disjoint | out primary | out family | families /list | cross out cos (n) | cross in cos (n) | cross out lift | desc_cos | desc_cos_xa | primary_xa | probe | hub skew | never | feel_mad | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| random | 8 | 0.230 | -0.001 ±0.003 | -0.003 | -0.001 | -0.002 | 0.989 | 0.875 ±0.009 | 6.25 | 0.228 (7.3) | 0.331 (1.1) | -0.001 ±0.003 | 0.242 | 0.241 ±0.005 | 0.011 | 0.268 | 0.56 | 0.024 | 1.128 | +0.000 | +0.000 |
| shuffled/64 | 64 | 0.228 | -0.002 ±0.003 | -0.002 | -0.002 | -0.002 | 0.988 | 0.870 ±0.010 | 6.35 | 0.229 (7.2) | 0.334 (1.1) | -0.002 ±0.003 | 0.244 | 0.243 ±0.005 | 0.012 | 0.185 | 0.69 | 0.008 | 1.130 | -0.002 | -0.000 |
| effnet/64 | 64 | 0.350 | +0.120 ±0.007 | +0.157 | +0.115 | +0.110 | 0.835 | 0.440 ±0.027 | 2.96 | 0.365 (3.8) | 0.456 (4.7) | +0.124 ±0.008 | 0.422 | 0.414 ±0.008 | 0.165 | 0.632 | 0.69 | 0.008 | 0.701 | +0.000 | +0.000 |
| effnet/24 | 24 | 0.352 | +0.122 ±0.007 | +0.158 | +0.117 | +0.114 | 0.837 | 0.433 ±0.027 | 2.94 | 0.365 (3.7) | 0.453 (4.8) | +0.126 ±0.008 | 0.420 | 0.413 ±0.008 | 0.163 | 0.667 | 0.59 | 0.002 | 0.705 | +0.002 | -0.001 |
| musicnn/64 | 64 | 0.345 | +0.115 ±0.007 | +0.144 | +0.113 | +0.109 | 0.879 | 0.483 ±0.026 | 3.27 | 0.354 (4.1) | 0.438 (4.3) | +0.115 ±0.008 | 0.402 | 0.397 ±0.008 | 0.121 | 0.578 | 0.58 | 0.004 | 0.730 | +0.017 | +0.008 |
| musicnn/24 | 24 | 0.345 | +0.115 ±0.007 | +0.144 | +0.113 | +0.109 | 0.879 | 0.485 ±0.026 | 3.27 | 0.354 (4.1) | 0.438 (4.3) | +0.115 ±0.008 | 0.402 | 0.397 ±0.008 | 0.120 | 0.601 | 0.57 | 0.004 | 0.731 | +0.018 | +0.008 |
| clap_music/64 | 64 | 0.351 | +0.120 ±0.006 | +0.153 | +0.117 | +0.113 | 0.877 | 0.485 ±0.026 | 3.31 | 0.363 (4.1) | 0.451 (4.3) | +0.123 ±0.007 | 0.414 | 0.407 ±0.008 | 0.123 | 0.595 | 1.01 | 0.013 | 0.719 | +0.024 | +0.018 |
| clap_music/24 | 24 | 0.350 | +0.119 ±0.006 | +0.153 | +0.117 | +0.113 | 0.878 | 0.489 ±0.026 | 3.34 | 0.362 (4.1) | 0.450 (4.3) | +0.122 ±0.007 | 0.414 | 0.406 ±0.008 | 0.122 | 0.650 | 0.92 | 0.007 | 0.720 | +0.024 | +0.020 |
| clap/64 | 64 | 0.343 | +0.112 ±0.006 | +0.144 | +0.110 | +0.108 | 0.896 | 0.530 ±0.026 | 3.54 | 0.356 (4.5) | 0.445 (3.9) | +0.117 ±0.007 | 0.401 | 0.396 ±0.008 | 0.104 | 0.563 | 1.08 | 0.030 | 0.715 | +0.033 | +0.028 |
| mert_mid/64 | 64 | 0.316 | +0.085 ±0.006 | +0.110 | +0.083 | +0.079 | 0.917 | 0.619 ±0.024 | 4.30 | 0.324 (5.2) | 0.430 (3.1) | +0.086 ±0.006 | 0.368 | 0.363 ±0.008 | 0.083 | 0.521 | 2.59 | 0.088 | 0.765 | +0.030 | +0.027 |
| mert_mid/24 | 24 | 0.310 | +0.079 ±0.006 | +0.104 | +0.078 | +0.074 | 0.922 | 0.632 ±0.023 | 4.34 | 0.316 (5.3) | 0.427 (3.0) | +0.079 ±0.006 | 0.360 | 0.356 ±0.008 | 0.078 | 0.523 | 1.74 | 0.042 | 0.771 | +0.028 | +0.025 |
| mert_early/64 | 64 | 0.306 | +0.076 ±0.006 | +0.098 | +0.074 | +0.072 | 0.927 | 0.651 ±0.021 | 4.45 | 0.313 (5.4) | 0.423 (2.9) | +0.077 ±0.006 | 0.355 | 0.350 ±0.008 | 0.073 | 0.486 | 2.48 | 0.096 | 0.768 | +0.029 | +0.027 |
| mert_earlycat/64 | 64 | 0.308 | +0.077 ±0.006 | +0.099 | +0.075 | +0.072 | 0.925 | 0.644 ±0.022 | 4.40 | 0.313 (5.3) | 0.423 (2.9) | +0.077 ±0.006 | 0.357 | 0.351 ±0.008 | 0.075 | 0.485 | 2.44 | 0.089 | 0.764 | +0.029 | +0.025 |
| mert_late/64 | 64 | 0.301 | +0.070 ±0.005 | +0.087 | +0.069 | +0.067 | 0.934 | 0.669 ±0.020 | 4.67 | 0.305 (5.6) | 0.416 (2.7) | +0.069 ±0.006 | 0.344 | 0.340 ±0.008 | 0.066 | 0.461 | 2.18 | 0.090 | 0.807 | +0.028 | +0.023 |
| mert_mean/64 | 64 | 0.307 | +0.077 ±0.006 | +0.099 | +0.075 | +0.071 | 0.926 | 0.646 ±0.021 | 4.55 | 0.313 (5.3) | 0.426 (2.9) | +0.077 ±0.006 | 0.356 | 0.352 ±0.008 | 0.074 | 0.490 | 2.23 | 0.091 | 0.780 | +0.029 | +0.026 |

Paired difference against effnet/64:

| candidate | xg_family | xg_primary | out_family | out_primary | desc_cos_xa | genre_primary_xa |
|---|---|---|---|---|---|---|
| effnet/24 | +0.002 | +0.000 | -0.007* | +0.002 | -0.001 | -0.002 |
| musicnn/64 | -0.005* | -0.014* | +0.043* | +0.044* | -0.018* | -0.044* |
| musicnn/24 | -0.005* | -0.014* | +0.045* | +0.045* | -0.018* | -0.045* |
| clap_music/64 | +0.001 | -0.004 | +0.044* | +0.042* | -0.007* | -0.042* |
| clap_music/24 | -0.000 | -0.004 | +0.049* | +0.043* | -0.008* | -0.043* |
| clap/64 | -0.007* | -0.013* | +0.090* | +0.061* | -0.018* | -0.061* |
| mert_mid/64 | -0.035* | -0.047* | +0.179* | +0.082* | -0.051* | -0.082* |
| mert_mid/24 | -0.040* | -0.053* | +0.192* | +0.087* | -0.058* | -0.087* |
| mert_early/64 | -0.044* | -0.060* | +0.211* | +0.092* | -0.064* | -0.092* |
| mert_earlycat/64 | -0.043* | -0.058* | +0.204* | +0.090* | -0.063* | -0.090* |
| mert_late/64 | -0.050* | -0.070* | +0.229* | +0.099* | -0.074* | -0.099* |
| mert_mean/64 | -0.043* | -0.059* | +0.206* | +0.091* | -0.062* | -0.091* |
| effnet-famoracle/64 | -0.061* | -0.040* | +0.074* | +0.019* | -0.034* | -0.019* |
| effnet-fampred/64 | -0.045* | -0.030* | +0.126* | +0.036* | -0.029* | -0.036* |
| effnet-inlp1/64 | -0.005* | -0.006* | +0.037* | +0.019* | -0.008* | -0.019* |
| effnet-inlp2/64 | -0.016* | -0.019* | +0.061* | +0.031* | -0.020* | -0.031* |
| effnet-inlp4/64 | -0.061* | -0.053* | +0.158* | +0.065* | -0.052* | -0.065* |
| effnet-inlp6/64 | -0.107* | -0.111* | +0.280* | +0.092* | -0.109* | -0.092* |
| effnet-bcs4/64 | -0.046* | -0.019* | +0.054* | +0.014* | -0.016* | -0.014* |
| effnet-bcs8/64 | -0.067* | -0.044* | +0.125* | +0.032* | -0.038* | -0.032* |
| effnet-bcs16/64 | -0.075* | -0.061* | +0.174* | +0.048* | -0.055* | -0.048* |
| effnet-leace/64 | -0.065* | -0.053* | +0.172* | +0.047* | -0.049* | -0.047* |
| effnet-head8/64 | -0.002 | +0.000 | -0.000 | -0.001 | -0.000 | +0.001 |
| effnet-head16/64 | -0.002 | -0.001 | +0.001 | +0.003 | -0.001 | -0.003 |
| effnet-head32/64 | -0.002 | -0.001 | +0.005 | +0.004 | -0.000 | -0.004 |
| effnet-head64/64 | -0.002 | -0.003* | +0.006* | +0.005* | -0.003* | -0.005* |
| effnet-head128/64 | -0.003* | -0.002 | +0.007* | +0.005* | -0.001 | -0.005* |
| effnet-head256/64 | -0.004* | -0.002 | +0.003 | +0.005* | -0.002 | -0.005* |
| effnet-head400/64 | -0.006* | -0.004* | +0.004 | +0.004 | -0.004* | -0.004 |
| effnet-headonly400/64 | -0.000 | -0.000 | -0.000 | +0.005* | -0.001 | -0.005* |
| effnet-head64-noren/64 | -0.009* | -0.006* | +0.012* | +0.009* | -0.005* | -0.009* |

### MERT by layer (PCA 64)

| candidate | xg lift | lift primary | out primary | out family | cross out cos (n) | cross out lift | desc_cos_xa | primary_xa | probe | hub skew | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mert_l0/64 | +0.067 ±0.005 | +0.084 | 0.942 | 0.690 ±0.020 | 0.300 (5.7) | +0.066 ±0.006 | 0.335 ±0.008 | 0.059 | 0.440 | 2.62 | +0.029 | +0.025 |
| mert_l1/64 | +0.072 ±0.005 | +0.092 | 0.934 | 0.671 ±0.021 | 0.308 (5.5) | +0.073 ±0.006 | 0.344 ±0.008 | 0.066 | 0.472 | 2.37 | +0.030 | +0.027 |
| mert_l2/64 | +0.075 ±0.006 | +0.096 | 0.927 | 0.651 ±0.022 | 0.311 (5.4) | +0.075 ±0.006 | 0.349 ±0.008 | 0.073 | 0.475 | 2.35 | +0.029 | +0.025 |
| mert_l3/64 | +0.078 ±0.006 | +0.103 | 0.922 | 0.630 ±0.023 | 0.315 (5.2) | +0.079 ±0.006 | 0.355 ±0.008 | 0.078 | 0.486 | 2.45 | +0.026 | +0.024 |
| mert_l4/64 | +0.082 ±0.006 | +0.109 | 0.920 | 0.626 ±0.024 | 0.321 (5.2) | +0.084 ±0.006 | 0.361 ±0.008 | 0.080 | 0.484 | 2.45 | +0.029 | +0.028 |
| mert_l5/64 | +0.088 ±0.006 | +0.116 | 0.914 | 0.610 ±0.024 | 0.328 (5.1) | +0.091 ±0.006 | 0.369 ±0.008 | 0.086 | 0.523 | 2.57 | +0.030 | +0.030 |
| mert_l6/64 | +0.090 ±0.006 | +0.118 | 0.912 | 0.603 ±0.023 | 0.331 (5.1) | +0.094 ±0.006 | 0.370 ±0.008 | 0.088 | 0.521 | 2.31 | +0.030 | +0.029 |
| mert_l7/64 | +0.087 ±0.006 | +0.113 | 0.913 | 0.608 ±0.023 | 0.326 (5.1) | +0.088 ±0.006 | 0.365 ±0.008 | 0.087 | 0.539 | 2.01 | +0.029 | +0.025 |
| mert_l8/64 | +0.084 ±0.006 | +0.110 | 0.917 | 0.618 ±0.024 | 0.323 (5.2) | +0.086 ±0.006 | 0.362 ±0.008 | 0.083 | 0.522 | 2.41 | +0.028 | +0.027 |
| mert_l9/64 | +0.081 ±0.006 | +0.104 | 0.921 | 0.630 ±0.022 | 0.319 (5.3) | +0.081 ±0.006 | 0.357 ±0.008 | 0.079 | 0.502 | 2.21 | +0.029 | +0.026 |
| mert_l10/64 | +0.074 ±0.006 | +0.093 | 0.929 | 0.659 ±0.021 | 0.308 (5.5) | +0.072 ±0.006 | 0.345 ±0.008 | 0.071 | 0.490 | 2.08 | +0.030 | +0.024 |
| mert_l11/64 | +0.067 ±0.005 | +0.084 | 0.936 | 0.676 ±0.019 | 0.301 (5.7) | +0.066 ±0.006 | 0.336 ±0.008 | 0.064 | 0.460 | 2.26 | +0.026 | +0.021 |
| mert_l12/64 | +0.063 ±0.005 | +0.079 | 0.939 | 0.692 ±0.020 | 0.299 (5.8) | +0.064 ±0.005 | 0.331 ±0.008 | 0.061 | 0.467 | 2.12 | +0.026 | +0.021 |
| mert_early/64 | +0.076 ±0.006 | +0.098 | 0.927 | 0.651 ±0.021 | 0.313 (5.4) | +0.077 ±0.006 | 0.350 ±0.008 | 0.073 | 0.486 | 2.48 | +0.029 | +0.027 |
| mert_earlycat/64 | +0.077 ±0.006 | +0.099 | 0.925 | 0.644 ±0.022 | 0.313 (5.3) | +0.077 ±0.006 | 0.351 ±0.008 | 0.075 | 0.485 | 2.44 | +0.029 | +0.025 |
| mert_mid/64 | +0.085 ±0.006 | +0.110 | 0.917 | 0.619 ±0.024 | 0.324 (5.2) | +0.086 ±0.006 | 0.363 ±0.008 | 0.083 | 0.521 | 2.59 | +0.030 | +0.027 |
| mert_late/64 | +0.070 ±0.005 | +0.087 | 0.934 | 0.669 ±0.020 | 0.305 (5.6) | +0.069 ±0.006 | 0.340 ±0.008 | 0.066 | 0.461 | 2.18 | +0.028 | +0.023 |

### EffNet with the genre removed, fitted with RYM families (out of fold by artist)

| candidate | dims | xg cos | xg lift | lift primary | lift strict | lift disjoint | out primary | out family | families /list | cross out cos (n) | cross in cos (n) | cross out lift | desc_cos | desc_cos_xa | primary_xa | probe | hub skew | never | feel_mad | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | 64 | 0.350 | +0.120 ±0.007 | +0.157 | +0.115 | +0.110 | 0.835 | 0.440 ±0.027 | 2.96 | 0.365 (3.8) | 0.456 (4.7) | +0.124 ±0.008 | 0.422 | 0.414 ±0.008 | 0.165 | 0.632 | 0.69 | 0.008 | 0.701 | +0.000 | +0.000 |
| effnet-famoracle/64 | 64 | 0.289 | +0.059 ±0.005 | +0.117 | +0.057 | +0.055 | 0.854 | 0.514 ±0.025 | 3.86 | 0.307 (4.3) | 0.457 (4.2) | +0.070 ±0.006 | 0.389 | 0.380 ±0.009 | 0.146 | 0.146 | 4.11 | 0.011 | 0.779 | -0.026 | +0.006 |
| effnet-fampred/64 | 64 | 0.306 | +0.075 ±0.006 | +0.127 | +0.071 | +0.065 | 0.871 | 0.567 ±0.026 | 3.95 | 0.329 (4.8) | 0.461 (3.7) | +0.091 ±0.007 | 0.393 | 0.386 ±0.008 | 0.129 | 0.347 | 3.20 | 0.012 | 0.764 | +0.005 | +0.031 |
| effnet-inlp1/64 | 64 | 0.346 | +0.115 ±0.006 | +0.151 | +0.110 | +0.104 | 0.854 | 0.477 ±0.027 | 3.23 | 0.355 (4.1) | 0.454 (4.4) | +0.116 ±0.008 | 0.415 | 0.406 ±0.008 | 0.146 | 0.443 | 1.07 | 0.006 | 0.715 | +0.015 | +0.014 |
| effnet-inlp2/64 | 64 | 0.334 | +0.103 ±0.006 | +0.139 | +0.099 | +0.092 | 0.866 | 0.501 ±0.028 | 3.46 | 0.343 (4.3) | 0.445 (4.2) | +0.104 ±0.007 | 0.405 | 0.394 ±0.009 | 0.134 | 0.349 | 2.71 | 0.006 | 0.734 | +0.014 | +0.014 |
| effnet-inlp4/64 | 64 | 0.289 | +0.058 ±0.005 | +0.104 | +0.054 | +0.047 | 0.900 | 0.598 ±0.026 | 4.35 | 0.305 (5.1) | 0.446 (3.4) | +0.068 ±0.006 | 0.374 | 0.362 ±0.008 | 0.100 | 0.222 | 6.61 | 0.018 | 0.821 | -0.003 | +0.019 |
| effnet-inlp6/64 | 64 | 0.244 | +0.013 ±0.005 | +0.046 | +0.010 | +0.005 | 0.927 | 0.721 ±0.020 | 5.28 | 0.252 (6.0) | 0.439 (2.4) | +0.017 ±0.006 | 0.319 | 0.305 ±0.008 | 0.073 | 0.109 | 4.42 | 0.058 | 0.959 | -0.019 | +0.006 |
| effnet-bcs4/64 | 64 | 0.305 | +0.074 ±0.006 | +0.139 | +0.068 | +0.056 | 0.849 | 0.494 ±0.026 | 3.43 | 0.340 (4.2) | 0.458 (4.2) | +0.101 ±0.009 | 0.406 | 0.398 ±0.009 | 0.151 | 0.423 | 1.39 | 0.006 | 0.747 | -0.019 | +0.014 |
| effnet-bcs8/64 | 64 | 0.284 | +0.053 ±0.007 | +0.113 | +0.048 | +0.038 | 0.867 | 0.565 ±0.025 | 3.88 | 0.311 (4.8) | 0.462 (3.7) | +0.073 ±0.008 | 0.385 | 0.376 ±0.008 | 0.133 | 0.214 | 4.39 | 0.009 | 0.780 | -0.017 | +0.021 |
| effnet-bcs16/64 | 64 | 0.276 | +0.045 ±0.006 | +0.096 | +0.040 | +0.033 | 0.882 | 0.615 ±0.024 | 4.30 | 0.296 (5.1) | 0.462 (3.3) | +0.059 ±0.007 | 0.368 | 0.359 ±0.009 | 0.117 | 0.130 | 4.94 | 0.015 | 0.827 | -0.011 | +0.022 |
| effnet-leace/64 | 64 | 0.286 | +0.055 ±0.006 | +0.104 | +0.051 | +0.043 | 0.882 | 0.612 ±0.024 | 4.32 | 0.305 (5.1) | 0.460 (3.3) | +0.069 ±0.008 | 0.373 | 0.365 ±0.009 | 0.118 | 0.175 | 4.32 | 0.014 | 0.822 | -0.002 | +0.027 |

### EffNet with the Discogs-400 layer's directions projected out (no RYM labels)

The layer is linear on the embedding (activations = sigmoid(W e + b), checked against the graph's own outputs: graphdef.verify) and W has rank 400. Share of the album vectors' variance inside the top-r directions: r=8 0.263, r=16 0.303, r=32 0.339, r=64 0.391, r=128 0.458, r=256 0.544, r=400 0.618. After r = 400 the 400 Discogs logits no longer vary across albums (largest |W v| 1.2e-14; their mean standard deviation before: 0.679), yet the RYM-family probe is unchanged. `headonly400` keeps only those 400 directions.

| candidate | dims | xg cos | xg lift | lift primary | lift strict | lift disjoint | out primary | out family | families /list | cross out cos (n) | cross in cos (n) | cross out lift | desc_cos | desc_cos_xa | primary_xa | probe | hub skew | never | feel_mad | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | 64 | 0.350 | +0.120 ±0.007 | +0.157 | +0.115 | +0.110 | 0.835 | 0.440 ±0.027 | 2.96 | 0.365 (3.8) | 0.456 (4.7) | +0.124 ±0.008 | 0.422 | 0.414 ±0.008 | 0.165 | 0.632 | 0.69 | 0.008 | 0.701 | +0.000 | +0.000 |
| effnet-head8/64 | 64 | 0.349 | +0.118 ±0.006 | +0.158 | +0.113 | +0.108 | 0.834 | 0.440 ±0.027 | 3.00 | 0.364 (3.8) | 0.457 (4.7) | +0.123 ±0.008 | 0.422 | 0.414 ±0.009 | 0.166 | 0.630 | 0.56 | 0.007 | 0.711 | -0.002 | -0.000 |
| effnet-head16/64 | 64 | 0.349 | +0.118 ±0.006 | +0.157 | +0.113 | +0.109 | 0.838 | 0.442 ±0.027 | 3.01 | 0.363 (3.8) | 0.456 (4.7) | +0.122 ±0.008 | 0.421 | 0.413 ±0.009 | 0.162 | 0.623 | 0.47 | 0.004 | 0.710 | +0.001 | +0.001 |
| effnet-head32/64 | 64 | 0.348 | +0.118 ±0.006 | +0.157 | +0.113 | +0.109 | 0.839 | 0.445 ±0.027 | 3.02 | 0.363 (3.8) | 0.458 (4.6) | +0.123 ±0.008 | 0.422 | 0.414 ±0.009 | 0.162 | 0.621 | 0.54 | 0.007 | 0.711 | +0.003 | +0.004 |
| effnet-head64/64 | 64 | 0.348 | +0.118 ±0.006 | +0.155 | +0.113 | +0.109 | 0.840 | 0.447 ±0.027 | 3.03 | 0.359 (3.8) | 0.457 (4.6) | +0.119 ±0.008 | 0.419 | 0.412 ±0.009 | 0.160 | 0.622 | 0.50 | 0.006 | 0.711 | +0.004 | +0.003 |
| effnet-head128/64 | 64 | 0.348 | +0.117 ±0.006 | +0.155 | +0.113 | +0.109 | 0.840 | 0.447 ±0.026 | 3.04 | 0.362 (3.8) | 0.457 (4.6) | +0.123 ±0.008 | 0.421 | 0.413 ±0.009 | 0.160 | 0.615 | 0.50 | 0.007 | 0.710 | +0.004 | +0.005 |
| effnet-head256/64 | 64 | 0.346 | +0.115 ±0.006 | +0.155 | +0.111 | +0.107 | 0.840 | 0.443 ±0.028 | 3.01 | 0.361 (3.8) | 0.456 (4.6) | +0.121 ±0.008 | 0.419 | 0.412 ±0.009 | 0.160 | 0.620 | 0.56 | 0.006 | 0.710 | +0.000 | +0.001 |
| effnet-head400/64 | 64 | 0.345 | +0.114 ±0.006 | +0.153 | +0.110 | +0.106 | 0.839 | 0.444 ±0.027 | 3.01 | 0.357 (3.8) | 0.457 (4.7) | +0.117 ±0.008 | 0.418 | 0.411 ±0.009 | 0.161 | 0.635 | 0.55 | 0.008 | 0.711 | -0.001 | +0.000 |
| effnet-headonly400/64 | 64 | 0.350 | +0.120 ±0.007 | +0.157 | +0.115 | +0.112 | 0.840 | 0.440 ±0.027 | 2.93 | 0.364 (3.7) | 0.455 (4.7) | +0.124 ±0.008 | 0.421 | 0.414 ±0.008 | 0.160 | 0.624 | 1.00 | 0.011 | 0.701 | -0.000 | -0.001 |
| effnet-head64-noren/64 | 64 | 0.341 | +0.110 ±0.006 | +0.152 | +0.106 | +0.101 | 0.844 | 0.452 ±0.027 | 3.05 | 0.357 (3.9) | 0.455 (4.6) | +0.117 ±0.008 | 0.417 | 0.409 ±0.009 | 0.156 | 0.633 | 0.92 | 0.010 | 0.711 | -0.001 | +0.003 |

### Blends: share of the block's total variance on the feel part

| candidate | xg lift | lift primary | out primary | out family | cross out cos (n) | cross out lift | desc_cos_xa | primary_xa | probe | hub skew | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | +0.120 ±0.007 | +0.157 | 0.835 | 0.440 ±0.027 | 0.365 (3.8) | +0.124 ±0.008 | 0.414 ±0.008 | 0.165 | 0.632 | 0.69 | +0.000 | +0.000 |
| feel | +0.092 ±0.006 | +0.118 | 0.907 | 0.568 ±0.025 | 0.332 (4.8) | +0.095 ±0.006 | 0.372 ±0.008 | 0.093 | 0.608 | 0.72 | +0.023 | +0.018 |
| ridge | +0.090 ±0.006 | +0.115 | 0.906 | 0.574 ±0.024 | 0.325 (4.8) | +0.088 ±0.006 | 0.369 ±0.008 | 0.094 | 0.584 | 0.60 | +0.022 | +0.017 |
| ball | +0.099 ±0.007 | +0.124 | 0.906 | 0.560 ±0.025 | 0.334 (4.7) | +0.096 ±0.007 | 0.378 ±0.008 | 0.094 | 0.615 | 1.07 | +0.028 | +0.021 |
| effnet/64+feel@0.1 | +0.120 ±0.006 | +0.157 | 0.840 | 0.441 ±0.027 | 0.365 (3.8) | +0.125 ±0.008 | 0.414 ±0.008 | 0.160 | 0.625 | 0.79 | +0.002 | +0.000 |
| effnet/64+feel@0.25 | +0.120 ±0.006 | +0.154 | 0.844 | 0.443 ±0.027 | 0.364 (3.8) | +0.123 ±0.008 | 0.411 ±0.009 | 0.156 | 0.625 | 0.97 | +0.004 | +0.000 |
| effnet/64+feel@0.5 | +0.115 ±0.006 | +0.148 | 0.854 | 0.457 ±0.026 | 0.358 (3.9) | +0.118 ±0.007 | 0.404 ±0.008 | 0.146 | 0.625 | 1.06 | +0.007 | +0.002 |
| effnet/64+feel@0.75 | +0.107 ±0.006 | +0.139 | 0.872 | 0.489 ±0.027 | 0.349 (4.2) | +0.110 ±0.007 | 0.394 ±0.008 | 0.128 | 0.625 | 0.95 | +0.012 | +0.008 |
| effnet/64+feel@0.9 | +0.099 ±0.006 | +0.129 | 0.890 | 0.523 ±0.026 | 0.341 (4.4) | +0.102 ±0.006 | 0.385 ±0.008 | 0.110 | 0.625 | 0.89 | +0.018 | +0.015 |
| effnet/64+ridge@0.1 | +0.121 ±0.007 | +0.158 | 0.838 | 0.439 ±0.027 | 0.366 (3.8) | +0.126 ±0.008 | 0.415 ±0.009 | 0.162 | 0.640 | 0.78 | +0.001 | +0.001 |
| effnet/64+ridge@0.25 | +0.120 ±0.007 | +0.157 | 0.839 | 0.437 ±0.026 | 0.366 (3.7) | +0.126 ±0.008 | 0.414 ±0.009 | 0.161 | 0.640 | 0.81 | +0.000 | -0.000 |
| effnet/64+ridge@0.5 | +0.117 ±0.006 | +0.154 | 0.849 | 0.448 ±0.026 | 0.361 (3.8) | +0.122 ±0.008 | 0.410 ±0.009 | 0.151 | 0.640 | 0.90 | +0.005 | +0.002 |
| effnet/64+ridge@0.75 | +0.108 ±0.006 | +0.143 | 0.865 | 0.475 ±0.026 | 0.351 (4.0) | +0.113 ±0.007 | 0.398 ±0.009 | 0.135 | 0.640 | 0.81 | +0.007 | +0.005 |
| effnet/64+ridge@0.9 | +0.100 ±0.006 | +0.130 | 0.886 | 0.520 ±0.026 | 0.339 (4.4) | +0.102 ±0.007 | 0.385 ±0.009 | 0.114 | 0.640 | 0.73 | +0.018 | +0.013 |
| effnet/64+ball@0.1 | +0.120 ±0.006 | +0.157 | 0.838 | 0.441 ±0.027 | 0.365 (3.8) | +0.125 ±0.008 | 0.414 ±0.009 | 0.162 | 0.630 | 0.78 | +0.002 | +0.001 |
| effnet/64+ball@0.25 | +0.120 ±0.006 | +0.157 | 0.844 | 0.441 ±0.026 | 0.367 (3.8) | +0.126 ±0.008 | 0.413 ±0.009 | 0.156 | 0.630 | 0.96 | +0.002 | -0.000 |
| effnet/64+ball@0.5 | +0.119 ±0.007 | +0.153 | 0.850 | 0.455 ±0.026 | 0.363 (3.9) | +0.123 ±0.008 | 0.410 ±0.009 | 0.150 | 0.630 | 1.09 | +0.009 | +0.006 |
| effnet/64+ball@0.75 | +0.113 ±0.006 | +0.146 | 0.870 | 0.485 ±0.026 | 0.355 (4.1) | +0.116 ±0.007 | 0.401 ±0.008 | 0.130 | 0.630 | 1.15 | +0.017 | +0.013 |
| effnet/64+ball@0.9 | +0.107 ±0.006 | +0.136 | 0.890 | 0.524 ±0.026 | 0.346 (4.4) | +0.107 ±0.007 | 0.391 ±0.008 | 0.110 | 0.630 | 1.08 | +0.026 | +0.021 |
| clap_music/64+feel@0.1 | +0.121 ±0.006 | +0.154 | 0.875 | 0.483 ±0.025 | 0.363 (4.1) | +0.123 ±0.007 | 0.408 ±0.008 | 0.125 | 0.584 | 1.11 | +0.024 | +0.019 |
| clap_music/64+feel@0.25 | +0.120 ±0.006 | +0.152 | 0.876 | 0.484 ±0.026 | 0.360 (4.1) | +0.120 ±0.007 | 0.406 ±0.008 | 0.124 | 0.584 | 1.17 | +0.024 | +0.017 |
| clap_music/64+feel@0.5 | +0.117 ±0.006 | +0.148 | 0.877 | 0.495 ±0.026 | 0.360 (4.2) | +0.120 ±0.007 | 0.402 ±0.008 | 0.123 | 0.584 | 1.16 | +0.025 | +0.019 |
| clap_music/64+feel@0.75 | +0.108 ±0.006 | +0.139 | 0.884 | 0.514 ±0.026 | 0.351 (4.4) | +0.112 ±0.007 | 0.394 ±0.008 | 0.116 | 0.584 | 0.95 | +0.024 | +0.020 |
| clap_music/64+feel@0.9 | +0.101 ±0.006 | +0.129 | 0.895 | 0.539 ±0.026 | 0.343 (4.6) | +0.104 ±0.006 | 0.384 ±0.008 | 0.105 | 0.584 | 0.83 | +0.024 | +0.020 |

### Combinations

| candidate | xg lift | lift primary | out primary | out family | cross out cos (n) | cross out lift | desc_cos_xa | primary_xa | probe | hub skew | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | +0.120 ±0.007 | +0.157 | 0.835 | 0.440 ±0.027 | 0.365 (3.8) | +0.124 ±0.008 | 0.414 ±0.008 | 0.165 | 0.632 | 0.69 | +0.000 | +0.000 |
| effnet-head64/64+feel@0.25 | +0.118 ±0.006 | +0.154 | 0.846 | 0.453 ±0.027 | 0.360 (3.9) | +0.119 ±0.008 | 0.410 ±0.009 | 0.154 | 0.620 | 0.70 | +0.007 | +0.005 |
| effnet-head64/64+feel@0.5 | +0.115 ±0.006 | +0.149 | 0.853 | 0.463 ±0.027 | 0.358 (4.0) | +0.117 ±0.007 | 0.405 ±0.008 | 0.147 | 0.620 | 0.76 | +0.009 | +0.006 |
| effnet-head400/64+feel@0.25 | +0.116 ±0.006 | +0.153 | 0.845 | 0.451 ±0.028 | 0.358 (3.9) | +0.118 ±0.008 | 0.409 ±0.009 | 0.155 | 0.618 | 0.78 | +0.004 | +0.003 |
| effnet-head400/64+feel@0.5 | +0.113 ±0.006 | +0.147 | 0.855 | 0.463 ±0.026 | 0.356 (4.0) | +0.116 ±0.007 | 0.403 ±0.009 | 0.145 | 0.618 | 0.68 | +0.008 | +0.004 |
| effnet-inlp2/64+feel@0.25 | +0.110 ±0.006 | +0.141 | 0.862 | 0.494 ±0.027 | 0.348 (4.2) | +0.109 ±0.007 | 0.398 ±0.009 | 0.138 | 0.421 | 1.03 | +0.017 | +0.014 |
| effnet-inlp2/64+feel@0.5 | +0.108 ±0.006 | +0.139 | 0.870 | 0.503 ±0.028 | 0.349 (4.3) | +0.110 ±0.007 | 0.396 ±0.008 | 0.130 | 0.421 | 1.05 | +0.019 | +0.016 |
| effnet-leace/64+feel@0.25 | +0.091 ±0.006 | +0.134 | 0.868 | 0.555 ±0.025 | 0.337 (4.6) | +0.099 ±0.007 | 0.391 ±0.009 | 0.132 | 0.473 | 1.45 | +0.018 | +0.032 |
| effnet-head64-inlp2/64 | +0.098 ±0.006 | +0.141 | 0.864 | 0.508 ±0.028 | 0.343 (4.3) | +0.104 ±0.007 | 0.397 ±0.009 | 0.136 | 0.373 | 3.37 | +0.011 | +0.020 |
| effnet-head64-leace/64 | +0.073 ±0.005 | +0.123 | 0.876 | 0.578 ±0.024 | 0.325 (4.7) | +0.088 ±0.006 | 0.383 ±0.008 | 0.124 | 0.146 | 6.71 | +0.007 | +0.032 |
| effnet-head400-leace/64 | +0.068 ±0.006 | +0.116 | 0.881 | 0.584 ±0.024 | 0.318 (4.9) | +0.082 ±0.007 | 0.376 ±0.008 | 0.119 | 0.164 | 6.13 | +0.003 | +0.028 |
| effnet-head400-inlp2/64 | +0.095 ±0.006 | +0.139 | 0.871 | 0.514 ±0.027 | 0.338 (4.4) | +0.100 ±0.007 | 0.396 ±0.009 | 0.129 | 0.345 | 1.64 | +0.011 | +0.022 |
| musicnn-leace/64 | +0.025 ±0.005 | +0.043 | 0.953 | 0.776 ±0.015 | 0.259 (6.5) | +0.027 ±0.005 | 0.295 ±0.007 | 0.047 | 0.200 | 1.71 | +0.005 | +0.015 |
| musicnn-inlp2/64 | +0.086 ±0.006 | +0.114 | 0.918 | 0.564 ±0.025 | 0.321 (4.8) | +0.085 ±0.006 | 0.365 ±0.008 | 0.082 | 0.316 | 0.67 | +0.015 | +0.009 |
| musicnn/64+feel@0.25 | +0.114 ±0.006 | +0.143 | 0.876 | 0.486 ±0.026 | 0.356 (4.2) | +0.117 ±0.007 | 0.397 ±0.008 | 0.124 | 0.582 | 0.77 | +0.018 | +0.009 |
| effnet/64+musicnn/64 | +0.123 ±0.007 | +0.159 | 0.843 | 0.441 ±0.026 | 0.368 (3.8) | +0.128 ±0.008 | 0.415 ±0.008 | 0.158 | 0.599 | 0.81 | +0.006 | +0.002 |
| effnet-leace/64+musicnn-leace/64 | +0.044 ±0.006 | +0.082 | 0.907 | 0.669 ±0.022 | 0.286 (5.5) | +0.050 ±0.007 | 0.341 ±0.008 | 0.093 | 0.137 | 2.76 | +0.002 | +0.024 |
| effnet-leace/64+ball@0.5 | +0.106 ±0.006 | +0.143 | 0.873 | 0.534 ±0.025 | 0.351 (4.5) | +0.112 ±0.007 | 0.401 ±0.008 | 0.127 | 0.484 | 1.42 | +0.028 | +0.034 |
| effnet-fampred/64+ball@0.5 | +0.109 ±0.006 | +0.145 | 0.867 | 0.520 ±0.026 | 0.353 (4.4) | +0.114 ±0.007 | 0.402 ±0.008 | 0.134 | 0.535 | 1.16 | +0.027 | +0.031 |
| effnet-inlp4/64+ball@0.5 | +0.105 ±0.006 | +0.137 | 0.881 | 0.531 ±0.025 | 0.346 (4.5) | +0.107 ±0.007 | 0.393 ±0.008 | 0.118 | 0.480 | 1.54 | +0.026 | +0.026 |
| musicnn/64+ball@0.5 | +0.119 ±0.007 | +0.148 | 0.876 | 0.489 ±0.026 | 0.360 (4.2) | +0.121 ±0.007 | 0.402 ±0.008 | 0.124 | 0.572 | 1.05 | +0.024 | +0.016 |
| clap_music-leace/64 | +0.045 ±0.005 | +0.071 | 0.941 | 0.741 ±0.018 | 0.284 (6.1) | +0.050 ±0.006 | 0.325 ±0.007 | 0.059 | 0.170 | 2.77 | +0.017 | +0.033 |
| clap_music-inlp2/64 | +0.098 ±0.006 | +0.130 | 0.912 | 0.588 ±0.025 | 0.338 (4.9) | +0.099 ±0.007 | 0.383 ±0.008 | 0.088 | 0.424 | 1.71 | +0.034 | +0.036 |
| clap_music-inlp4/64 | +0.063 ±0.005 | +0.096 | 0.933 | 0.669 ±0.024 | 0.302 (5.6) | +0.066 ±0.005 | 0.349 ±0.008 | 0.067 | 0.286 | 3.07 | +0.020 | +0.032 |
| clap_music-bcs16/64 | +0.036 ±0.005 | +0.059 | 0.948 | 0.761 ±0.017 | 0.272 (6.3) | +0.039 ±0.005 | 0.312 ±0.007 | 0.052 | 0.105 | 3.50 | +0.012 | +0.027 |
| clap_music-fampred/64 | +0.078 ±0.005 | +0.110 | 0.922 | 0.669 ±0.022 | 0.321 (5.5) | +0.085 ±0.006 | 0.364 ±0.008 | 0.078 | 0.366 | 1.80 | +0.035 | +0.046 |
| clap_music-leace/64+feel@0.25 | +0.085 ±0.005 | +0.115 | 0.917 | 0.628 ±0.023 | 0.324 (5.3) | +0.087 ±0.006 | 0.369 ±0.008 | 0.083 | 0.507 | 1.97 | +0.033 | +0.038 |
| clap_music/64+effnet/64 | +0.124 ±0.006 | +0.162 | 0.842 | 0.440 ±0.026 | 0.371 (3.7) | +0.131 ±0.008 | 0.418 ±0.008 | 0.158 | 0.611 | 0.96 | +0.005 | +0.004 |
| clap_music/64+effnet-head64/64 | +0.123 ±0.006 | +0.162 | 0.844 | 0.442 ±0.026 | 0.370 (3.7) | +0.130 ±0.008 | 0.418 ±0.008 | 0.156 | 0.624 | 0.75 | +0.008 | +0.007 |
| clap_music/64+effnet-head400/64 | +0.122 ±0.006 | +0.161 | 0.844 | 0.441 ±0.027 | 0.369 (3.8) | +0.128 ±0.008 | 0.417 ±0.008 | 0.156 | 0.619 | 0.73 | +0.005 | +0.004 |
| clap_music/64+effnet-leace/64 | +0.114 ±0.006 | +0.154 | 0.858 | 0.499 ±0.026 | 0.360 (4.2) | +0.120 ±0.007 | 0.409 ±0.008 | 0.142 | 0.512 | 1.05 | +0.023 | +0.028 |
| clap_music-leace/64+effnet-leace/64 | +0.054 ±0.006 | +0.097 | 0.901 | 0.649 ±0.022 | 0.301 (5.3) | +0.066 ±0.007 | 0.357 ±0.008 | 0.099 | 0.101 | 4.62 | +0.008 | +0.033 |
| clap_music-leace/64+effnet-head400-leace/64 | +0.069 ±0.005 | +0.113 | 0.893 | 0.621 ±0.022 | 0.320 (5.2) | +0.083 ±0.006 | 0.373 ±0.008 | 0.106 | 0.077 | 7.78 | +0.015 | +0.039 |
| mert_mid/64+feel@0.25 | +0.095 ±0.006 | +0.121 | 0.903 | 0.578 ±0.025 | 0.334 (4.9) | +0.096 ±0.007 | 0.374 ±0.009 | 0.097 | 0.544 | 2.40 | +0.028 | +0.024 |
| mert_mid-leace/64 | +0.026 ±0.004 | +0.030 | 0.975 | 0.850 ±0.010 | 0.257 (6.8) | +0.027 ±0.004 | 0.278 ±0.006 | 0.025 | 0.127 | 3.19 | +0.022 | +0.027 |
| mert_l5/64+feel@0.5 | +0.102 ±0.006 | +0.127 | 0.901 | 0.568 ±0.026 | 0.342 (4.8) | +0.103 ±0.007 | 0.381 ±0.009 | 0.099 | 0.555 | 1.90 | +0.033 | +0.027 |
| clap_music/64+mert_mid/64 | +0.112 ±0.006 | +0.147 | 0.880 | 0.511 ±0.025 | 0.356 (4.3) | +0.116 ±0.007 | 0.400 ±0.008 | 0.120 | 0.566 | 1.59 | +0.027 | +0.025 |
| clap_music-inlp1/64 | +0.110 ±0.006 | +0.143 | 0.897 | 0.538 ±0.026 | 0.350 (4.5) | +0.111 ±0.007 | 0.397 ±0.008 | 0.103 | 0.478 | 1.35 | +0.033 | +0.032 |
| clap_music-inlp2/64+ball@0.5 | +0.112 ±0.006 | +0.142 | 0.893 | 0.538 ±0.025 | 0.354 (4.5) | +0.114 ±0.007 | 0.396 ±0.008 | 0.107 | 0.524 | 1.61 | +0.035 | +0.031 |
| clap_music-inlp2/64+feel@0.25 | +0.106 ±0.006 | +0.135 | 0.904 | 0.561 ±0.026 | 0.345 (4.7) | +0.107 ±0.006 | 0.389 ±0.008 | 0.096 | 0.511 | 1.69 | +0.035 | +0.033 |
| clap-inlp2/64 | +0.097 ±0.006 | +0.125 | 0.919 | 0.595 ±0.026 | 0.335 (5.0) | +0.098 ±0.007 | 0.376 ±0.008 | 0.081 | 0.395 | 1.74 | +0.035 | +0.032 |
| mert_l6-inlp1/64 | +0.076 ±0.006 | +0.097 | 0.931 | 0.669 ±0.022 | 0.310 (5.5) | +0.074 ±0.006 | 0.349 ±0.008 | 0.069 | 0.391 | 2.44 | +0.034 | +0.032 |
| mert_l6-inlp2/64 | +0.066 ±0.005 | +0.084 | 0.942 | 0.704 ±0.021 | 0.298 (5.8) | +0.064 ±0.006 | 0.335 ±0.008 | 0.059 | 0.359 | 3.53 | +0.030 | +0.030 |

Paired difference against effnet/64:

| candidate | xg_family | xg_primary | out_family | out_primary | desc_cos_xa | genre_primary_xa |
|---|---|---|---|---|---|---|
| effnet-head64/64+feel@0.25 | -0.002 | -0.004* | +0.013* | +0.011* | -0.004* | -0.011* |
| effnet-head64/64+feel@0.5 | -0.004* | -0.008* | +0.022* | +0.018* | -0.009* | -0.018* |
| effnet-head400/64+feel@0.25 | -0.004* | -0.004* | +0.011* | +0.010* | -0.005* | -0.010* |
| effnet-head400/64+feel@0.5 | -0.007* | -0.010* | +0.023* | +0.020* | -0.011* | -0.020* |
| effnet-inlp2/64+feel@0.25 | -0.009* | -0.017* | +0.053* | +0.027* | -0.017* | -0.027* |
| effnet-inlp2/64+feel@0.5 | -0.011* | -0.018* | +0.063* | +0.035* | -0.019* | -0.035* |
| effnet-leace/64+feel@0.25 | -0.028* | -0.024* | +0.114* | +0.033* | -0.023* | -0.033* |
| effnet-head64-inlp2/64 | -0.022* | -0.016* | +0.068* | +0.029* | -0.018* | -0.029* |
| effnet-head64-leace/64 | -0.047* | -0.034* | +0.138* | +0.041* | -0.032* | -0.041* |
| effnet-head400-leace/64 | -0.052* | -0.042* | +0.144* | +0.046* | -0.038* | -0.046* |
| effnet-head400-inlp2/64 | -0.025* | -0.018* | +0.074* | +0.036* | -0.018* | -0.036* |
| musicnn-leace/64 | -0.095* | -0.114* | +0.336* | +0.118* | -0.119* | -0.118* |
| musicnn-inlp2/64 | -0.034* | -0.044* | +0.124* | +0.083* | -0.050* | -0.083* |
| musicnn/64+feel@0.25 | -0.005* | -0.014* | +0.046* | +0.041* | -0.018* | -0.041* |
| effnet/64+musicnn/64 | +0.004* | +0.002 | +0.001 | +0.008* | +0.001 | -0.008* |
| effnet-leace/64+musicnn-leace/64 | -0.076* | -0.075* | +0.229* | +0.072* | -0.073* | -0.072* |
| effnet-leace/64+ball@0.5 | -0.013* | -0.014* | +0.094* | +0.038* | -0.014* | -0.038* |
| effnet-fampred/64+ball@0.5 | -0.011* | -0.012* | +0.080* | +0.032* | -0.012* | -0.032* |
| effnet-inlp4/64+ball@0.5 | -0.015* | -0.020* | +0.091* | +0.047* | -0.021* | -0.047* |
| musicnn/64+ball@0.5 | -0.001 | -0.009* | +0.049* | +0.041* | -0.012* | -0.041* |
| clap_music-leace/64 | -0.075* | -0.087* | +0.300* | +0.106* | -0.089* | -0.106* |
| clap_music-inlp2/64 | -0.022* | -0.028* | +0.148* | +0.077* | -0.032* | -0.077* |
| clap_music-inlp4/64 | -0.057* | -0.061* | +0.228* | +0.098* | -0.065* | -0.098* |
| clap_music-bcs16/64 | -0.084* | -0.098* | +0.320* | +0.113* | -0.102* | -0.113* |
| clap_music-fampred/64 | -0.042* | -0.047* | +0.229* | +0.087* | -0.051* | -0.087* |
| clap_music-leace/64+feel@0.25 | -0.035* | -0.042* | +0.188* | +0.083* | -0.045* | -0.083* |
| clap_music/64+effnet/64 | +0.005* | +0.005* | -0.000 | +0.007* | +0.004* | -0.007* |
| clap_music/64+effnet-head64/64 | +0.004* | +0.004* | +0.002 | +0.009* | +0.004* | -0.009* |
| clap_music/64+effnet-head400/64 | +0.003 | +0.004* | +0.001 | +0.009* | +0.003 | -0.009* |
| clap_music/64+effnet-leace/64 | -0.006* | -0.004* | +0.059* | +0.024* | -0.005* | -0.024* |
| clap_music-leace/64+effnet-leace/64 | -0.065* | -0.060* | +0.209* | +0.066* | -0.057* | -0.066* |
| clap_music-leace/64+effnet-head400-leace/64 | -0.050* | -0.044* | +0.181* | +0.059* | -0.041* | -0.059* |
| mert_mid/64+feel@0.25 | -0.025* | -0.036* | +0.138* | +0.068* | -0.040* | -0.068* |
| mert_mid-leace/64 | -0.094* | -0.127* | +0.409* | +0.140* | -0.136* | -0.140* |
| mert_l5/64+feel@0.5 | -0.018* | -0.030* | +0.127* | +0.066* | -0.033* | -0.066* |
| clap_music/64+mert_mid/64 | -0.007* | -0.010* | +0.071* | +0.045* | -0.014* | -0.045* |
| clap_music-inlp1/64 | -0.009* | -0.014* | +0.098* | +0.062* | -0.017* | -0.062* |
| clap_music-inlp2/64+ball@0.5 | -0.007* | -0.015* | +0.097* | +0.058* | -0.018* | -0.058* |
| clap_music-inlp2/64+feel@0.25 | -0.014* | -0.022* | +0.121* | +0.069* | -0.025* | -0.069* |
| clap-inlp2/64 | -0.023* | -0.033* | +0.155* | +0.084* | -0.038* | -0.084* |
| mert_l6-inlp1/64 | -0.043* | -0.060* | +0.229* | +0.096* | -0.065* | -0.096* |
| mert_l6-inlp2/64 | -0.054* | -0.073* | +0.264* | +0.107* | -0.079* | -0.107* |

### Descriptor-supervised projection (beyond the brief's list)

The album vector replaced by a Ridge prediction of its RYM descriptor weights, out of fold by artist. It needs no label at run time, but it is trained towards the labels `desc_cos` is measured with, so these rows are not on equal footing with the others.

| candidate | xg lift | lift primary | out primary | out family | cross out cos (n) | cross out lift | desc_cos_xa | primary_xa | probe | hub skew | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | +0.120 ±0.007 | +0.157 | 0.835 | 0.440 ±0.027 | 0.365 (3.8) | +0.124 ±0.008 | 0.414 ±0.008 | 0.165 | 0.632 | 0.69 | +0.000 | +0.000 |
| effnet-ndesc/64 | +0.130 ±0.006 | +0.156 | 0.864 | 0.471 ±0.027 | 0.366 (4.0) | +0.126 ±0.007 | 0.410 ±0.008 | 0.136 | 0.554 | 1.12 | +0.027 | +0.015 |
| effnet-ndesc/24 | +0.130 ±0.006 | +0.157 | 0.867 | 0.480 ±0.025 | 0.368 (4.1) | +0.128 ±0.007 | 0.410 ±0.008 | 0.133 | 0.600 | 1.08 | +0.031 | +0.019 |
| effnet-ndesc-leace/64 | +0.034 ±0.005 | +0.065 | 0.920 | 0.718 ±0.022 | 0.269 (5.8) | +0.033 ±0.005 | 0.322 ±0.008 | 0.080 | 0.117 | 3.79 | +0.002 | +0.021 |
| effnet-ndesc-inlp2/64 | +0.104 ±0.006 | +0.132 | 0.903 | 0.568 ±0.026 | 0.339 (4.7) | +0.101 ±0.007 | 0.386 ±0.008 | 0.097 | 0.341 | 2.05 | +0.035 | +0.032 |
| effnet/64+effnet-ndesc/64 | +0.129 ±0.006 | +0.162 | 0.842 | 0.437 ±0.027 | 0.370 (3.7) | +0.130 ±0.008 | 0.418 ±0.009 | 0.158 | 0.586 | 0.99 | +0.009 | +0.004 |
| musicnn-ndesc/64 | +0.108 ±0.006 | +0.141 | 0.903 | 0.539 ±0.026 | 0.345 (4.6) | +0.107 ±0.007 | 0.392 ±0.009 | 0.097 | 0.475 | 1.41 | +0.031 | +0.027 |
| effnet-ndesc/64+ball@0.5 | +0.129 ±0.006 | +0.158 | 0.865 | 0.473 ±0.025 | 0.368 (4.0) | +0.127 ±0.007 | 0.412 ±0.009 | 0.135 | 0.567 | 1.35 | +0.028 | +0.018 |
| clap_music-ndesc/64 | +0.121 ±0.006 | +0.152 | 0.893 | 0.519 ±0.026 | 0.361 (4.4) | +0.123 ±0.007 | 0.404 ±0.008 | 0.106 | 0.515 | 1.27 | +0.038 | +0.032 |
| clap_music-ndesc-leace/64 | +0.043 ±0.005 | +0.061 | 0.953 | 0.771 ±0.016 | 0.277 (6.3) | +0.045 ±0.005 | 0.313 ±0.007 | 0.047 | 0.138 | 2.18 | +0.022 | +0.031 |
| clap_music/64+clap_music-ndesc/64 | +0.129 ±0.006 | +0.161 | 0.877 | 0.479 ±0.026 | 0.371 (4.1) | +0.132 ±0.007 | 0.414 ±0.008 | 0.123 | 0.554 | 1.12 | +0.030 | +0.023 |
| mert_l6-ndesc/64 | +0.114 ±0.006 | +0.141 | 0.903 | 0.550 ±0.025 | 0.349 (4.6) | +0.112 ±0.007 | 0.392 ±0.009 | 0.097 | 0.477 | 1.36 | +0.040 | +0.031 |

Paired difference against effnet/64:

| candidate | xg_family | xg_primary | out_family | out_primary | desc_cos_xa | genre_primary_xa |
|---|---|---|---|---|---|---|
| effnet-ndesc/64 | +0.010* | -0.001 | +0.030* | +0.029* | -0.004* | -0.029* |
| effnet-ndesc/24 | +0.010* | -0.001 | +0.040* | +0.032* | -0.004* | -0.032* |
| effnet-ndesc-leace/64 | -0.086* | -0.093* | +0.278* | +0.085* | -0.093* | -0.085* |
| effnet-ndesc-inlp2/64 | -0.016* | -0.025* | +0.128* | +0.069* | -0.029* | -0.069* |
| effnet/64+effnet-ndesc/64 | +0.009* | +0.005* | -0.003 | +0.007* | +0.004* | -0.007* |
| musicnn-ndesc/64 | -0.011* | -0.016* | +0.099* | +0.068* | -0.022* | -0.068* |
| effnet-ndesc/64+ball@0.5 | +0.009* | +0.001 | +0.033* | +0.030* | -0.002 | -0.030* |
| clap_music-ndesc/64 | +0.001 | -0.005 | +0.079* | +0.059* | -0.010* | -0.059* |
| clap_music-ndesc-leace/64 | -0.077* | -0.096* | +0.331* | +0.118* | -0.101* | -0.118* |
| clap_music/64+clap_music-ndesc/64 | +0.009* | +0.004 | +0.039* | +0.042* | -0.001 | -0.042* |
| mert_l6-ndesc/64 | -0.005* | -0.016* | +0.110* | +0.068* | -0.023* | -0.068* |

### MMR re-ranking of effnet/64 (changes the ranking rule; list-based measures only)

Candidates: the seed's 50 nearest; lambda = 1 is the plain list.

| candidate | xg lift | lift primary | out primary | out family | cross out cos (n) | cross out lift | desc_cos_xa | primary_xa | probe | hub skew | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | +0.120 ±0.007 | +0.157 | 0.835 | 0.440 ±0.027 | 0.365 (3.8) | +0.124 ±0.008 | 0.414 ±0.008 | 0.165 | 0.632 | 0.69 | +0.000 | +0.000 |
| effnet/64~mmr0.9 | – | – | 0.837 | 0.444 ±0.027 | 0.365 (3.8) | +0.125 ±0.008 | 0.414 ±0.008 | 0.163 | 0.632 | 0.62 | – | +0.003 |
| effnet/64~mmr0.7 | – | – | 0.845 | 0.452 ±0.026 | 0.362 (3.9) | +0.123 ±0.007 | 0.411 ±0.008 | 0.155 | 0.632 | 0.35 | – | +0.005 |
| effnet/64~mmr0.5 | – | – | 0.875 | 0.487 ±0.024 | 0.346 (4.1) | +0.108 ±0.006 | 0.395 ±0.008 | 0.125 | 0.632 | 0.47 | – | +0.008 |
| effnet/64~mmr0.3 | – | – | 0.904 | 0.516 ±0.024 | 0.336 (4.4) | +0.099 ±0.006 | 0.380 ±0.007 | 0.096 | 0.632 | 1.22 | – | +0.007 |

### Noise control: effnet/64 with a share of its variance replaced by gaussian noise

The reference for the trade-off: reach bought by being partly random. `lift vs noise` and `desc_xa vs noise` in every table are the candidate's xg lift / desc_cos_xa minus this curve's value (linear interpolation) at the candidate's own `out family`. No CI; the curve's points carry about ±0.01.

| candidate | xg lift | lift primary | out primary | out family | cross out cos (n) | cross out lift | desc_cos_xa | primary_xa | probe | hub skew | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | +0.120 ±0.007 | +0.157 | 0.835 | 0.440 ±0.027 | 0.365 (3.8) | +0.124 ±0.008 | 0.414 ±0.008 | 0.165 | 0.632 | 0.69 | +0.000 | +0.000 |
| effnet/64+random@0.1 | +0.116 ±0.006 | +0.155 | 0.846 | 0.442 ±0.027 | 0.363 (3.8) | +0.123 ±0.008 | 0.412 ±0.008 | 0.154 | 0.626 | 1.21 | +0.000 | +0.000 |
| effnet/64+random@0.25 | +0.105 ±0.006 | +0.143 | 0.866 | 0.463 ±0.027 | 0.354 (4.0) | +0.114 ±0.008 | 0.399 ±0.008 | 0.134 | 0.626 | 1.49 | +0.000 | +0.000 |
| effnet/64+random@0.5 | +0.083 ±0.005 | +0.119 | 0.904 | 0.517 ±0.026 | 0.327 (4.4) | +0.088 ±0.006 | 0.372 ±0.008 | 0.096 | 0.626 | 1.42 | +0.000 | +0.000 |
| effnet/64+random@0.75 | +0.046 ±0.004 | +0.072 | 0.949 | 0.653 ±0.021 | 0.284 (5.5) | +0.050 ±0.005 | 0.323 ±0.007 | 0.051 | 0.626 | 1.09 | +0.000 | +0.000 |
| effnet/64+random@0.9 | +0.016 ±0.003 | +0.025 | 0.977 | 0.797 ±0.012 | 0.249 (6.6) | +0.018 ±0.003 | 0.272 ±0.006 | 0.023 | 0.626 | 0.78 | +0.000 | +0.000 |
| random | -0.001 ±0.003 | -0.003 | 0.989 | 0.875 ±0.009 | 0.228 (7.3) | -0.001 ±0.003 | 0.241 ±0.005 | 0.011 | 0.268 | 0.56 | +0.000 | +0.000 |

## Full pool: 3,944 albums, 4 clips per album (EffNet, MusiCNN, Essentia scalars)

3944 albums, 2085 artists. Mean out-of-genre floor of the descriptor cosine: family 0.216, primary 0.228, strict 0.215, disjoint 0.211. Largest family: 0.258 of the albums (the probe's majority-class accuracy). A random list has 0.871 of its members outside the seed's family.

### Models and controls

| candidate | dims | xg cos | xg lift | lift primary | lift strict | lift disjoint | out primary | out family | families /list | cross out cos (n) | cross in cos (n) | cross out lift | desc_cos | desc_cos_xa | primary_xa | probe | hub skew | never | feel_mad | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| random | 8 | 0.216 | -0.001 ±0.001 | -0.001 | -0.001 | -0.001 | 0.989 | 0.873 ±0.005 | 6.27 | 0.215 (6.9) | 0.324 (1.0) | -0.001 ±0.002 | 0.229 | 0.229 ±0.003 | 0.011 | 0.259 | 0.24 | 0.013 | 1.118 | +0.000 | +0.000 |
| shuffled/64 | 64 | 0.214 | -0.003 ±0.001 | -0.002 | -0.002 | -0.002 | 0.990 | 0.870 ±0.005 | 6.23 | 0.214 (6.9) | 0.328 (1.0) | -0.002 ±0.001 | 0.229 | 0.229 ±0.003 | 0.010 | 0.229 | 0.79 | 0.007 | 1.125 | -0.002 | -0.001 |
| effnet/64 | 64 | 0.365 | +0.148 ±0.004 | +0.187 | +0.141 | +0.132 | 0.798 | 0.366 ±0.015 | 2.54 | 0.379 (3.0) | 0.463 (5.0) | +0.156 ±0.005 | 0.446 | 0.432 ±0.005 | 0.202 | 0.721 | 0.79 | 0.007 | 0.638 | +0.000 | +0.000 |
| effnet/24 | 24 | 0.364 | +0.148 ±0.004 | +0.185 | +0.141 | +0.133 | 0.802 | 0.369 ±0.016 | 2.53 | 0.376 (3.0) | 0.460 (5.0) | +0.154 ±0.005 | 0.441 | 0.429 ±0.005 | 0.198 | 0.736 | 0.68 | 0.004 | 0.645 | +0.001 | -0.001 |
| musicnn/64 | 64 | 0.360 | +0.144 ±0.004 | +0.172 | +0.138 | +0.131 | 0.850 | 0.422 ±0.015 | 2.80 | 0.361 (3.4) | 0.448 (4.5) | +0.140 ±0.005 | 0.421 | 0.411 ±0.005 | 0.150 | 0.679 | 0.80 | 0.010 | 0.652 | +0.019 | +0.011 |
| musicnn/24 | 24 | 0.360 | +0.143 ±0.004 | +0.172 | +0.138 | +0.131 | 0.851 | 0.423 ±0.015 | 2.80 | 0.361 (3.4) | 0.447 (4.5) | +0.140 ±0.005 | 0.420 | 0.411 ±0.005 | 0.149 | 0.691 | 0.80 | 0.008 | 0.653 | +0.018 | +0.011 |

Paired difference against effnet/64:

| candidate | xg_family | xg_primary | out_family | out_primary | desc_cos_xa | genre_primary_xa |
|---|---|---|---|---|---|---|
| effnet/24 | -0.001 | -0.002* | +0.003 | +0.005* | -0.003* | -0.005* |
| musicnn/64 | -0.004* | -0.015* | +0.056* | +0.053* | -0.021* | -0.053* |
| musicnn/24 | -0.005* | -0.016* | +0.056* | +0.053* | -0.021* | -0.053* |
| effnet-famoracle/64 | -0.053* | -0.024* | -0.014* | -0.009* | -0.019* | +0.009* |
| effnet-fampred/64 | -0.031* | -0.018* | +0.094* | +0.029* | -0.018* | -0.029* |
| effnet-inlp1/64 | -0.004* | -0.005* | +0.013* | +0.011* | -0.005* | -0.011* |
| effnet-inlp2/64 | -0.013* | -0.013* | +0.038* | +0.029* | -0.014* | -0.029* |
| effnet-inlp4/64 | -0.037* | -0.033* | +0.105* | +0.060* | -0.035* | -0.060* |
| effnet-inlp6/64 | -0.076* | -0.067* | +0.201* | +0.093* | -0.068* | -0.093* |
| effnet-bcs4/64 | -0.030* | -0.006* | +0.026* | +0.008* | -0.005* | -0.008* |
| effnet-bcs8/64 | -0.038* | -0.015* | +0.061* | +0.020* | -0.014* | -0.020* |
| effnet-bcs16/64 | -0.052* | -0.033* | +0.117* | +0.040* | -0.031* | -0.040* |
| effnet-leace/64 | -0.052* | -0.034* | +0.120* | +0.041* | -0.032* | -0.041* |
| effnet-head8/64 | -0.001 | +0.002* | -0.001 | -0.000 | +0.002* | +0.000 |
| effnet-head16/64 | -0.001 | +0.001* | +0.001 | +0.001 | +0.002* | -0.001 |
| effnet-head32/64 | -0.001 | +0.001 | +0.002 | +0.002 | +0.001 | -0.002 |
| effnet-head64/64 | -0.003* | -0.000 | +0.003 | +0.002 | +0.000 | -0.002 |
| effnet-head128/64 | -0.002* | -0.001 | +0.005* | +0.004* | -0.000 | -0.004* |
| effnet-head256/64 | -0.003* | -0.002* | +0.003 | +0.004* | -0.002* | -0.004* |
| effnet-head400/64 | -0.004* | -0.002* | +0.004* | +0.005* | -0.002* | -0.005* |
| effnet-headonly400/64 | +0.000 | +0.000 | +0.003* | +0.003* | +0.001 | -0.003* |
| effnet-head64-noren/64 | -0.005* | -0.004* | +0.007* | +0.003* | -0.004* | -0.003* |

### EffNet with the genre removed, fitted with RYM families (out of fold by artist)

| candidate | dims | xg cos | xg lift | lift primary | lift strict | lift disjoint | out primary | out family | families /list | cross out cos (n) | cross in cos (n) | cross out lift | desc_cos | desc_cos_xa | primary_xa | probe | hub skew | never | feel_mad | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | 64 | 0.365 | +0.148 ±0.004 | +0.187 | +0.141 | +0.132 | 0.798 | 0.366 ±0.015 | 2.54 | 0.379 (3.0) | 0.463 (5.0) | +0.156 ±0.005 | 0.446 | 0.432 ±0.005 | 0.202 | 0.721 | 0.79 | 0.007 | 0.638 | +0.000 | +0.000 |
| effnet-famoracle/64 | 64 | 0.312 | +0.096 ±0.004 | +0.163 | +0.092 | +0.088 | 0.788 | 0.353 ±0.015 | 2.83 | 0.326 (2.8) | 0.460 (5.2) | +0.103 ±0.005 | 0.428 | 0.412 ±0.006 | 0.212 | 0.261 | 3.20 | 0.010 | 0.685 | -0.053 | -0.020 |
| effnet-fampred/64 | 64 | 0.333 | +0.117 ±0.004 | +0.169 | +0.110 | +0.102 | 0.826 | 0.461 ±0.016 | 3.18 | 0.354 (3.7) | 0.466 (4.3) | +0.132 ±0.005 | 0.427 | 0.414 ±0.005 | 0.174 | 0.436 | 3.01 | 0.013 | 0.680 | +0.009 | +0.033 |
| effnet-inlp1/64 | 64 | 0.360 | +0.144 ±0.004 | +0.183 | +0.136 | +0.127 | 0.808 | 0.380 ±0.016 | 2.62 | 0.374 (3.1) | 0.461 (4.9) | +0.151 ±0.005 | 0.444 | 0.427 ±0.005 | 0.192 | 0.652 | 0.90 | 0.007 | 0.641 | +0.000 | +0.004 |
| effnet-inlp2/64 | 64 | 0.352 | +0.136 ±0.004 | +0.174 | +0.128 | +0.122 | 0.826 | 0.404 ±0.015 | 2.76 | 0.365 (3.3) | 0.455 (4.7) | +0.143 ±0.005 | 0.437 | 0.418 ±0.005 | 0.174 | 0.572 | 1.02 | 0.007 | 0.650 | +0.002 | +0.008 |
| effnet-inlp4/64 | 64 | 0.327 | +0.111 ±0.004 | +0.154 | +0.105 | +0.099 | 0.858 | 0.471 ±0.016 | 3.20 | 0.341 (3.7) | 0.447 (4.2) | +0.120 ±0.005 | 0.419 | 0.397 ±0.005 | 0.142 | 0.456 | 2.36 | 0.009 | 0.676 | +0.007 | +0.020 |
| effnet-inlp6/64 | 64 | 0.288 | +0.072 ±0.004 | +0.121 | +0.067 | +0.061 | 0.890 | 0.567 ±0.016 | 3.89 | 0.304 (4.5) | 0.444 (3.4) | +0.082 ±0.004 | 0.388 | 0.364 ±0.005 | 0.110 | 0.218 | 3.49 | 0.015 | 0.749 | +0.003 | +0.025 |
| effnet-bcs4/64 | 64 | 0.334 | +0.118 ±0.005 | +0.181 | +0.109 | +0.097 | 0.805 | 0.393 ±0.016 | 2.74 | 0.369 (3.2) | 0.465 (4.8) | +0.146 ±0.005 | 0.441 | 0.427 ±0.005 | 0.195 | 0.577 | 1.19 | 0.007 | 0.657 | -0.021 | +0.010 |
| effnet-bcs8/64 | 64 | 0.327 | +0.110 ±0.004 | +0.172 | +0.101 | +0.091 | 0.818 | 0.428 ±0.016 | 3.02 | 0.356 (3.4) | 0.466 (4.5) | +0.133 ±0.005 | 0.432 | 0.418 ±0.005 | 0.182 | 0.365 | 2.40 | 0.009 | 0.672 | -0.013 | +0.020 |
| effnet-bcs16/64 | 64 | 0.312 | +0.096 ±0.004 | +0.154 | +0.088 | +0.077 | 0.838 | 0.484 ±0.016 | 3.49 | 0.333 (3.8) | 0.465 (4.1) | +0.111 ±0.005 | 0.415 | 0.401 ±0.006 | 0.162 | 0.212 | 7.42 | 0.011 | 0.712 | -0.003 | +0.029 |
| effnet-leace/64 | 64 | 0.313 | +0.096 ±0.004 | +0.154 | +0.089 | +0.080 | 0.838 | 0.487 ±0.016 | 3.50 | 0.332 (3.8) | 0.465 (4.1) | +0.110 ±0.005 | 0.414 | 0.400 ±0.006 | 0.162 | 0.242 | 4.18 | 0.012 | 0.710 | -0.002 | +0.029 |

### EffNet with the Discogs-400 layer's directions projected out (no RYM labels)

The layer is linear on the embedding (activations = sigmoid(W e + b), checked against the graph's own outputs: graphdef.verify) and W has rank 400. Share of the album vectors' variance inside the top-r directions: r=8 0.296, r=16 0.338, r=32 0.372, r=64 0.421, r=128 0.485, r=256 0.567, r=400 0.637. After r = 400 the 400 Discogs logits no longer vary across albums (largest |W v| 1.2e-14; their mean standard deviation before: 0.691), yet the RYM-family probe is unchanged. `headonly400` keeps only those 400 directions.

| candidate | dims | xg cos | xg lift | lift primary | lift strict | lift disjoint | out primary | out family | families /list | cross out cos (n) | cross in cos (n) | cross out lift | desc_cos | desc_cos_xa | primary_xa | probe | hub skew | never | feel_mad | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | 64 | 0.365 | +0.148 ±0.004 | +0.187 | +0.141 | +0.132 | 0.798 | 0.366 ±0.015 | 2.54 | 0.379 (3.0) | 0.463 (5.0) | +0.156 ±0.005 | 0.446 | 0.432 ±0.005 | 0.202 | 0.721 | 0.79 | 0.007 | 0.638 | +0.000 | +0.000 |
| effnet-head8/64 | 64 | 0.363 | +0.147 ±0.004 | +0.189 | +0.140 | +0.132 | 0.798 | 0.365 ±0.015 | 2.50 | 0.381 (2.9) | 0.466 (5.0) | +0.157 ±0.006 | 0.449 | 0.434 ±0.005 | 0.202 | 0.716 | 0.71 | 0.003 | 0.647 | -0.001 | +0.002 |
| effnet-head16/64 | 64 | 0.364 | +0.148 ±0.004 | +0.189 | +0.140 | +0.132 | 0.799 | 0.368 ±0.016 | 2.52 | 0.381 (3.0) | 0.465 (5.0) | +0.157 ±0.006 | 0.448 | 0.433 ±0.005 | 0.201 | 0.715 | 0.66 | 0.004 | 0.647 | -0.000 | +0.002 |
| effnet-head32/64 | 64 | 0.364 | +0.147 ±0.004 | +0.188 | +0.139 | +0.132 | 0.800 | 0.369 ±0.016 | 2.53 | 0.379 (3.0) | 0.465 (5.0) | +0.155 ±0.006 | 0.447 | 0.433 ±0.005 | 0.200 | 0.721 | 0.67 | 0.004 | 0.649 | -0.001 | +0.002 |
| effnet-head64/64 | 64 | 0.362 | +0.146 ±0.004 | +0.187 | +0.138 | +0.130 | 0.799 | 0.369 ±0.016 | 2.54 | 0.378 (3.0) | 0.464 (5.0) | +0.154 ±0.006 | 0.446 | 0.432 ±0.005 | 0.201 | 0.717 | 0.68 | 0.005 | 0.648 | -0.002 | +0.002 |
| effnet-head128/64 | 64 | 0.362 | +0.146 ±0.004 | +0.186 | +0.138 | +0.131 | 0.801 | 0.371 ±0.016 | 2.55 | 0.376 (3.0) | 0.464 (5.0) | +0.153 ±0.006 | 0.446 | 0.431 ±0.005 | 0.199 | 0.721 | 0.68 | 0.005 | 0.648 | -0.001 | +0.002 |
| effnet-head256/64 | 64 | 0.361 | +0.145 ±0.004 | +0.185 | +0.137 | +0.129 | 0.801 | 0.369 ±0.016 | 2.55 | 0.376 (3.0) | 0.461 (5.0) | +0.152 ±0.006 | 0.443 | 0.430 ±0.005 | 0.199 | 0.719 | 0.69 | 0.005 | 0.649 | -0.002 | -0.001 |
| effnet-head400/64 | 64 | 0.361 | +0.144 ±0.004 | +0.185 | +0.136 | +0.129 | 0.803 | 0.371 ±0.015 | 2.55 | 0.374 (3.0) | 0.463 (5.0) | +0.151 ±0.006 | 0.443 | 0.430 ±0.005 | 0.197 | 0.718 | 0.74 | 0.006 | 0.648 | -0.003 | +0.001 |
| effnet-headonly400/64 | 64 | 0.365 | +0.149 ±0.004 | +0.188 | +0.141 | +0.133 | 0.800 | 0.369 ±0.015 | 2.53 | 0.380 (3.0) | 0.464 (5.0) | +0.157 ±0.005 | 0.446 | 0.432 ±0.005 | 0.200 | 0.720 | 0.95 | 0.012 | 0.637 | +0.001 | +0.002 |
| effnet-head64-noren/64 | 64 | 0.360 | +0.143 ±0.004 | +0.183 | +0.135 | +0.127 | 0.800 | 0.373 ±0.016 | 2.58 | 0.375 (3.0) | 0.461 (5.0) | +0.151 ±0.005 | 0.443 | 0.428 ±0.005 | 0.200 | 0.720 | 1.01 | 0.009 | 0.643 | -0.003 | +0.001 |

### Blends: share of the block's total variance on the feel part

| candidate | xg lift | lift primary | out primary | out family | cross out cos (n) | cross out lift | desc_cos_xa | primary_xa | probe | hub skew | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | +0.148 ±0.004 | +0.187 | 0.798 | 0.366 ±0.015 | 0.379 (3.0) | +0.156 ±0.005 | 0.432 ±0.005 | 0.202 | 0.721 | 0.79 | +0.000 | +0.000 |
| feel | +0.121 ±0.004 | +0.150 | 0.885 | 0.488 ±0.016 | 0.341 (3.9) | +0.120 ±0.004 | 0.389 ±0.005 | 0.115 | 0.662 | 0.83 | +0.024 | +0.019 |
| ridge | +0.112 ±0.004 | +0.140 | 0.895 | 0.521 ±0.015 | 0.332 (4.2) | +0.111 ±0.004 | 0.379 ±0.005 | 0.105 | 0.637 | 0.57 | +0.027 | +0.022 |
| ball | +0.128 ±0.004 | +0.159 | 0.873 | 0.473 ±0.015 | 0.351 (3.8) | +0.129 ±0.005 | 0.398 ±0.005 | 0.127 | 0.701 | 0.99 | +0.025 | +0.022 |
| effnet/64+feel@0.1 | +0.149 ±0.004 | +0.188 | 0.798 | 0.368 ±0.015 | 0.379 (3.0) | +0.156 ±0.005 | 0.432 ±0.005 | 0.202 | 0.716 | 0.91 | +0.002 | +0.001 |
| effnet/64+feel@0.25 | +0.150 ±0.004 | +0.187 | 0.804 | 0.374 ±0.015 | 0.378 (3.0) | +0.155 ±0.005 | 0.431 ±0.005 | 0.196 | 0.716 | 0.95 | +0.004 | +0.004 |
| effnet/64+feel@0.5 | +0.148 ±0.004 | +0.183 | 0.815 | 0.384 ±0.015 | 0.374 (3.1) | +0.152 ±0.005 | 0.426 ±0.005 | 0.185 | 0.716 | 0.96 | +0.006 | +0.005 |
| effnet/64+feel@0.75 | +0.141 ±0.004 | +0.174 | 0.836 | 0.407 ±0.015 | 0.367 (3.3) | +0.144 ±0.005 | 0.416 ±0.005 | 0.164 | 0.716 | 0.88 | +0.008 | +0.008 |
| effnet/64+feel@0.9 | +0.133 ±0.004 | +0.164 | 0.858 | 0.438 ±0.015 | 0.355 (3.6) | +0.133 ±0.005 | 0.404 ±0.005 | 0.142 | 0.716 | 0.78 | +0.015 | +0.012 |
| effnet/64+ridge@0.1 | +0.150 ±0.004 | +0.189 | 0.798 | 0.366 ±0.015 | 0.381 (3.0) | +0.157 ±0.005 | 0.433 ±0.005 | 0.202 | 0.717 | 0.92 | +0.002 | +0.001 |
| effnet/64+ridge@0.25 | +0.151 ±0.004 | +0.189 | 0.801 | 0.370 ±0.015 | 0.382 (3.0) | +0.159 ±0.005 | 0.433 ±0.005 | 0.199 | 0.717 | 1.05 | +0.004 | +0.003 |
| effnet/64+ridge@0.5 | +0.148 ±0.004 | +0.184 | 0.811 | 0.382 ±0.015 | 0.377 (3.1) | +0.154 ±0.005 | 0.428 ±0.005 | 0.189 | 0.717 | 1.04 | +0.006 | +0.006 |
| effnet/64+ridge@0.75 | +0.139 ±0.004 | +0.175 | 0.834 | 0.411 ±0.016 | 0.367 (3.3) | +0.144 ±0.005 | 0.417 ±0.005 | 0.166 | 0.717 | 0.91 | +0.009 | +0.010 |
| effnet/64+ridge@0.9 | +0.126 ±0.004 | +0.161 | 0.861 | 0.450 ±0.016 | 0.353 (3.6) | +0.131 ±0.005 | 0.402 ±0.005 | 0.139 | 0.717 | 0.75 | +0.014 | +0.016 |
| effnet/64+ball@0.1 | +0.150 ±0.004 | +0.189 | 0.797 | 0.366 ±0.015 | 0.381 (3.0) | +0.158 ±0.005 | 0.434 ±0.005 | 0.203 | 0.719 | 0.92 | +0.002 | +0.002 |
| effnet/64+ball@0.25 | +0.152 ±0.004 | +0.189 | 0.800 | 0.370 ±0.015 | 0.381 (3.0) | +0.158 ±0.005 | 0.433 ±0.005 | 0.200 | 0.719 | 1.08 | +0.005 | +0.004 |
| effnet/64+ball@0.5 | +0.152 ±0.004 | +0.187 | 0.811 | 0.380 ±0.015 | 0.379 (3.1) | +0.157 ±0.005 | 0.430 ±0.005 | 0.189 | 0.719 | 1.22 | +0.009 | +0.006 |
| effnet/64+ball@0.75 | +0.146 ±0.004 | +0.179 | 0.829 | 0.401 ±0.015 | 0.371 (3.2) | +0.149 ±0.005 | 0.421 ±0.005 | 0.171 | 0.719 | 1.16 | +0.011 | +0.009 |
| effnet/64+ball@0.9 | +0.139 ±0.004 | +0.170 | 0.849 | 0.429 ±0.015 | 0.362 (3.5) | +0.141 ±0.005 | 0.410 ±0.005 | 0.151 | 0.719 | 1.10 | +0.017 | +0.014 |

### Combinations

| candidate | xg lift | lift primary | out primary | out family | cross out cos (n) | cross out lift | desc_cos_xa | primary_xa | probe | hub skew | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | +0.148 ±0.004 | +0.187 | 0.798 | 0.366 ±0.015 | 0.379 (3.0) | +0.156 ±0.005 | 0.432 ±0.005 | 0.202 | 0.721 | 0.79 | +0.000 | +0.000 |
| effnet-head64/64+feel@0.25 | +0.149 ±0.004 | +0.188 | 0.802 | 0.372 ±0.015 | 0.378 (3.0) | +0.155 ±0.005 | 0.432 ±0.005 | 0.198 | 0.715 | 0.80 | +0.003 | +0.003 |
| effnet-head64/64+feel@0.5 | +0.149 ±0.004 | +0.185 | 0.811 | 0.380 ±0.015 | 0.376 (3.1) | +0.153 ±0.005 | 0.428 ±0.005 | 0.189 | 0.715 | 0.84 | +0.005 | +0.005 |
| effnet-head400/64+feel@0.25 | +0.148 ±0.004 | +0.186 | 0.805 | 0.373 ±0.016 | 0.377 (3.0) | +0.154 ±0.006 | 0.431 ±0.005 | 0.195 | 0.713 | 0.85 | +0.003 | +0.003 |
| effnet-head400/64+feel@0.5 | +0.147 ±0.004 | +0.183 | 0.813 | 0.382 ±0.015 | 0.375 (3.1) | +0.152 ±0.005 | 0.427 ±0.005 | 0.187 | 0.713 | 0.87 | +0.004 | +0.004 |
| effnet-inlp2/64+feel@0.25 | +0.141 ±0.004 | +0.177 | 0.826 | 0.403 ±0.015 | 0.369 (3.3) | +0.147 ±0.005 | 0.421 ±0.005 | 0.174 | 0.614 | 1.08 | +0.007 | +0.010 |
| effnet-inlp2/64+feel@0.5 | +0.141 ±0.004 | +0.176 | 0.833 | 0.411 ±0.015 | 0.368 (3.3) | +0.146 ±0.005 | 0.419 ±0.005 | 0.167 | 0.614 | 1.07 | +0.010 | +0.013 |
| effnet-leace/64+feel@0.25 | +0.128 ±0.004 | +0.172 | 0.825 | 0.444 ±0.016 | 0.357 (3.5) | +0.134 ±0.005 | 0.416 ±0.005 | 0.175 | 0.631 | 1.50 | +0.013 | +0.028 |
| effnet-head64-inlp2/64 | +0.131 ±0.004 | +0.175 | 0.824 | 0.409 ±0.015 | 0.365 (3.3) | +0.142 ±0.006 | 0.419 ±0.005 | 0.176 | 0.582 | 1.01 | -0.001 | +0.012 |
| effnet-head64-leace/64 | +0.109 ±0.004 | +0.165 | 0.828 | 0.459 ±0.016 | 0.347 (3.6) | +0.125 ±0.005 | 0.411 ±0.006 | 0.172 | 0.239 | 5.05 | +0.001 | +0.030 |
| effnet-head400-leace/64 | +0.108 ±0.004 | +0.164 | 0.833 | 0.462 ±0.015 | 0.344 (3.7) | +0.122 ±0.005 | 0.408 ±0.006 | 0.167 | 0.229 | 3.92 | +0.001 | +0.028 |
| effnet-head400-inlp2/64 | +0.131 ±0.004 | +0.174 | 0.827 | 0.408 ±0.015 | 0.362 (3.3) | +0.140 ±0.005 | 0.417 ±0.005 | 0.173 | 0.596 | 0.87 | -0.001 | +0.010 |
| musicnn-leace/64 | +0.046 ±0.003 | +0.071 | 0.938 | 0.725 ±0.012 | 0.266 (5.7) | +0.046 ±0.003 | 0.310 ±0.004 | 0.062 | 0.258 | 1.82 | +0.015 | +0.027 |
| musicnn-inlp2/64 | +0.129 ±0.004 | +0.155 | 0.879 | 0.459 ±0.015 | 0.345 (3.7) | +0.123 ±0.005 | 0.395 ±0.005 | 0.121 | 0.405 | 0.78 | +0.021 | +0.013 |
| musicnn/64+feel@0.25 | +0.147 ±0.004 | +0.176 | 0.846 | 0.415 ±0.016 | 0.367 (3.4) | +0.145 ±0.005 | 0.416 ±0.005 | 0.154 | 0.686 | 1.02 | +0.019 | +0.012 |
| effnet/64+musicnn/64 | +0.154 ±0.004 | +0.189 | 0.803 | 0.370 ±0.015 | 0.382 (3.0) | +0.159 ±0.005 | 0.433 ±0.005 | 0.197 | 0.693 | 0.81 | +0.007 | +0.003 |
| effnet-leace/64+musicnn-leace/64 | +0.083 ±0.004 | +0.138 | 0.864 | 0.547 ±0.016 | 0.319 (4.3) | +0.096 ±0.004 | 0.382 ±0.006 | 0.136 | 0.235 | 2.84 | +0.008 | +0.036 |
| effnet-leace/64+ball@0.5 | +0.139 ±0.004 | +0.181 | 0.822 | 0.428 ±0.015 | 0.370 (3.4) | +0.147 ±0.005 | 0.424 ±0.005 | 0.178 | 0.665 | 1.47 | +0.016 | +0.027 |
| effnet-fampred/64+ball@0.5 | +0.142 ±0.004 | +0.182 | 0.817 | 0.417 ±0.015 | 0.372 (3.3) | +0.149 ±0.005 | 0.426 ±0.005 | 0.183 | 0.694 | 1.22 | +0.014 | +0.023 |
| effnet-inlp4/64+ball@0.5 | +0.136 ±0.004 | +0.172 | 0.842 | 0.435 ±0.015 | 0.363 (3.5) | +0.141 ±0.005 | 0.415 ±0.005 | 0.158 | 0.639 | 1.53 | +0.017 | +0.021 |
| musicnn/64+ball@0.5 | +0.150 ±0.004 | +0.178 | 0.839 | 0.408 ±0.015 | 0.371 (3.3) | +0.149 ±0.005 | 0.419 ±0.005 | 0.161 | 0.697 | 1.01 | +0.018 | +0.011 |

Paired difference against effnet/64:

| candidate | xg_family | xg_primary | out_family | out_primary | desc_cos_xa | genre_primary_xa |
|---|---|---|---|---|---|---|
| effnet-head64/64+feel@0.25 | +0.001 | +0.000 | +0.005* | +0.004* | +0.000 | -0.004* |
| effnet-head64/64+feel@0.5 | +0.000 | -0.003* | +0.014* | +0.014* | -0.004* | -0.014* |
| effnet-head400/64+feel@0.25 | +0.000 | -0.001 | +0.007* | +0.007* | -0.001 | -0.007* |
| effnet-head400/64+feel@0.5 | -0.002 | -0.004* | +0.015* | +0.016* | -0.005* | -0.016* |
| effnet-inlp2/64+feel@0.25 | -0.007* | -0.010* | +0.036* | +0.028* | -0.011* | -0.028* |
| effnet-inlp2/64+feel@0.5 | -0.007* | -0.011* | +0.044* | +0.035* | -0.013* | -0.035* |
| effnet-leace/64+feel@0.25 | -0.020* | -0.015* | +0.078* | +0.028* | -0.015* | -0.028* |
| effnet-head64-inlp2/64 | -0.017* | -0.012* | +0.043* | +0.026* | -0.013* | -0.026* |
| effnet-head64-leace/64 | -0.040* | -0.022* | +0.092* | +0.030* | -0.021* | -0.030* |
| effnet-head400-leace/64 | -0.040* | -0.024* | +0.096* | +0.035* | -0.023* | -0.035* |
| effnet-head400-inlp2/64 | -0.017* | -0.013* | +0.042* | +0.030* | -0.015* | -0.030* |
| musicnn-leace/64 | -0.102* | -0.117* | +0.358* | +0.141* | -0.122* | -0.141* |
| musicnn-inlp2/64 | -0.019* | -0.032* | +0.092* | +0.082* | -0.037* | -0.082* |
| musicnn/64+feel@0.25 | -0.001 | -0.012* | +0.049* | +0.048* | -0.016* | -0.048* |
| effnet/64+musicnn/64 | +0.006* | +0.002* | +0.003 | +0.005* | +0.001 | -0.005* |
| effnet-leace/64+musicnn-leace/64 | -0.065* | -0.050* | +0.180* | +0.066* | -0.050* | -0.066* |
| effnet-leace/64+ball@0.5 | -0.010* | -0.006* | +0.061* | +0.024* | -0.007* | -0.024* |
| effnet-fampred/64+ball@0.5 | -0.007* | -0.005* | +0.051* | +0.020* | -0.006* | -0.020* |
| effnet-inlp4/64+ball@0.5 | -0.013* | -0.015* | +0.069* | +0.044* | -0.017* | -0.044* |
| musicnn/64+ball@0.5 | +0.001 | -0.009* | +0.042* | +0.042* | -0.013* | -0.042* |

### Descriptor-supervised projection (beyond the brief's list)

The album vector replaced by a Ridge prediction of its RYM descriptor weights, out of fold by artist. It needs no label at run time, but it is trained towards the labels `desc_cos` is measured with, so these rows are not on equal footing with the others.

| candidate | xg lift | lift primary | out primary | out family | cross out cos (n) | cross out lift | desc_cos_xa | primary_xa | probe | hub skew | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | +0.148 ±0.004 | +0.187 | 0.798 | 0.366 ±0.015 | 0.379 (3.0) | +0.156 ±0.005 | 0.432 ±0.005 | 0.202 | 0.721 | 0.79 | +0.000 | +0.000 |
| effnet-ndesc/64 | +0.170 ±0.004 | +0.199 | 0.811 | 0.384 ±0.016 | 0.394 (3.1) | +0.169 ±0.005 | 0.440 ±0.005 | 0.189 | 0.695 | 0.94 | +0.028 | +0.018 |
| effnet-ndesc/24 | +0.170 ±0.004 | +0.198 | 0.816 | 0.392 ±0.016 | 0.394 (3.2) | +0.170 ±0.006 | 0.438 ±0.005 | 0.184 | 0.709 | 0.80 | +0.031 | +0.022 |
| effnet-ndesc-leace/64 | +0.089 ±0.004 | +0.134 | 0.865 | 0.566 ±0.016 | 0.312 (4.4) | +0.090 ±0.004 | 0.378 ±0.006 | 0.135 | 0.204 | 2.52 | +0.021 | +0.039 |
| effnet-ndesc-inlp2/64 | +0.162 ±0.004 | +0.188 | 0.841 | 0.427 ±0.016 | 0.382 (3.4) | +0.159 ±0.005 | 0.428 ±0.005 | 0.159 | 0.500 | 0.98 | +0.039 | +0.030 |
| effnet/64+effnet-ndesc/64 | +0.163 ±0.004 | +0.197 | 0.794 | 0.364 ±0.015 | 0.391 (2.9) | +0.168 ±0.006 | 0.441 ±0.005 | 0.206 | 0.684 | 0.84 | +0.015 | +0.009 |
| musicnn-ndesc/64 | +0.158 ±0.004 | +0.185 | 0.854 | 0.436 ±0.016 | 0.374 (3.5) | +0.153 ±0.005 | 0.423 ±0.005 | 0.146 | 0.653 | 1.26 | +0.040 | +0.030 |
| effnet-ndesc/64+ball@0.5 | +0.166 ±0.004 | +0.196 | 0.817 | 0.390 ±0.016 | 0.390 (3.1) | +0.167 ±0.005 | 0.436 ±0.005 | 0.183 | 0.692 | 1.25 | +0.027 | +0.019 |

Paired difference against effnet/64:

| candidate | xg_family | xg_primary | out_family | out_primary | desc_cos_xa | genre_primary_xa |
|---|---|---|---|---|---|---|
| effnet-ndesc/64 | +0.022* | +0.011* | +0.018* | +0.013* | +0.008* | -0.013* |
| effnet-ndesc/24 | +0.022* | +0.011* | +0.026* | +0.018* | +0.007* | -0.018* |
| effnet-ndesc-leace/64 | -0.059* | -0.054* | +0.200* | +0.067* | -0.054* | -0.067* |
| effnet-ndesc-inlp2/64 | +0.014* | +0.001 | +0.061* | +0.044* | -0.004* | -0.044* |
| effnet/64+effnet-ndesc/64 | +0.015* | +0.010* | -0.003 | -0.004* | +0.009* | +0.004* |
| musicnn-ndesc/64 | +0.010* | -0.002 | +0.070* | +0.056* | -0.009* | -0.056* |
| effnet-ndesc/64+ball@0.5 | +0.018* | +0.008* | +0.024* | +0.019* | +0.005* | -0.019* |

### MMR re-ranking of effnet/64 (changes the ranking rule; list-based measures only)

Candidates: the seed's 50 nearest; lambda = 1 is the plain list.

| candidate | xg lift | lift primary | out primary | out family | cross out cos (n) | cross out lift | desc_cos_xa | primary_xa | probe | hub skew | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | +0.148 ±0.004 | +0.187 | 0.798 | 0.366 ±0.015 | 0.379 (3.0) | +0.156 ±0.005 | 0.432 ±0.005 | 0.202 | 0.721 | 0.79 | +0.000 | +0.000 |
| effnet/64~mmr0.9 | – | – | 0.798 | 0.369 ±0.015 | 0.378 (3.0) | +0.155 ±0.005 | 0.431 ±0.005 | 0.202 | 0.721 | 0.77 | – | +0.001 |
| effnet/64~mmr0.7 | – | – | 0.808 | 0.381 ±0.015 | 0.375 (3.1) | +0.152 ±0.005 | 0.427 ±0.005 | 0.192 | 0.721 | 0.52 | – | +0.004 |
| effnet/64~mmr0.5 | – | – | 0.829 | 0.407 ±0.015 | 0.365 (3.3) | +0.143 ±0.005 | 0.417 ±0.005 | 0.171 | 0.721 | 0.25 | – | +0.009 |
| effnet/64~mmr0.3 | – | – | 0.851 | 0.432 ±0.015 | 0.357 (3.5) | +0.136 ±0.004 | 0.406 ±0.005 | 0.149 | 0.721 | 0.62 | – | +0.010 |

### Noise control: effnet/64 with a share of its variance replaced by gaussian noise

The reference for the trade-off: reach bought by being partly random. `lift vs noise` and `desc_xa vs noise` in every table are the candidate's xg lift / desc_cos_xa minus this curve's value (linear interpolation) at the candidate's own `out family`. No CI; the curve's points carry about ±0.01.

| candidate | xg lift | lift primary | out primary | out family | cross out cos (n) | cross out lift | desc_cos_xa | primary_xa | probe | hub skew | lift vs noise | desc_xa vs noise |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| effnet/64 | +0.148 ±0.004 | +0.187 | 0.798 | 0.366 ±0.015 | 0.379 (3.0) | +0.156 ±0.005 | 0.432 ±0.005 | 0.202 | 0.721 | 0.79 | +0.000 | +0.000 |
| effnet/64+random@0.1 | +0.144 ±0.004 | +0.182 | 0.809 | 0.377 ±0.015 | 0.373 (3.0) | +0.149 ±0.005 | 0.425 ±0.005 | 0.191 | 0.711 | 1.24 | +0.000 | +0.000 |
| effnet/64+random@0.25 | +0.135 ±0.004 | +0.169 | 0.840 | 0.403 ±0.015 | 0.359 (3.2) | +0.136 ±0.005 | 0.411 ±0.005 | 0.160 | 0.711 | 1.43 | +0.000 | +0.000 |
| effnet/64+random@0.5 | +0.110 ±0.003 | +0.144 | 0.885 | 0.455 ±0.015 | 0.336 (3.6) | +0.113 ±0.004 | 0.383 ±0.005 | 0.115 | 0.711 | 1.28 | +0.000 | +0.000 |
| effnet/64+random@0.75 | +0.071 ±0.003 | +0.105 | 0.932 | 0.559 ±0.014 | 0.297 (4.5) | +0.076 ±0.003 | 0.341 ±0.004 | 0.068 | 0.711 | 1.02 | +0.000 | +0.000 |
| effnet/64+random@0.9 | +0.030 ±0.002 | +0.047 | 0.969 | 0.730 ±0.009 | 0.249 (5.8) | +0.032 ±0.002 | 0.281 ±0.003 | 0.032 | 0.711 | 0.74 | +0.000 | +0.000 |
| random | -0.001 ±0.001 | -0.001 | 0.989 | 0.873 ±0.005 | 0.215 (6.9) | -0.001 ±0.002 | 0.229 ±0.003 | 0.011 | 0.259 | 0.24 | +0.000 | +0.000 |

## New-album test

Every step of the candidate (genre removal, scalers, PCA, block weights) fitted on 80% of the artists; the held-out 20% are mapped with that transform and query the whole pool mapped the same way; five folds, so every album is held out once. `in fit`: every step fitted on every album. `oof`: the tables above. `same lists`: share of the in-fit top 10 the held-out transform returns.

### clap_music/64 (bakeoff pool; same lists 0.989 ±0.002)

| metric | in fit | held out | oof (tables above) | held out − in fit |
|---|---|---|---|---|
| xg_family | 0.351 ±0.007 | 0.351 ±0.007 | 0.351 ±0.007 | +0.000 |
| xg_family_lift | 0.120 ±0.006 | 0.121 ±0.006 | 0.120 ±0.006 | +0.000 |
| xg_primary_lift | 0.153 ±0.008 | 0.153 ±0.008 | 0.153 ±0.008 | -0.000 |
| out_family | 0.485 ±0.026 | 0.485 ±0.026 | 0.485 ±0.026 | -0.000 |
| out_primary | 0.877 ±0.013 | 0.877 ±0.013 | 0.877 ±0.013 | +0.000 |
| desc_cos_xa | 0.407 ±0.008 | 0.407 ±0.008 | 0.407 ±0.008 | +0.000 |
| genre_primary_xa | 0.123 ±0.013 | 0.123 ±0.013 | 0.123 ±0.013 | -0.000 |
| desc_cos | 0.414 ±0.008 | 0.415 ±0.009 | 0.414 ±0.008 | +0.000 |

### clap_music-inlp2/64 (bakeoff pool; same lists 0.807 ±0.008)

| metric | in fit | held out | oof (tables above) | held out − in fit |
|---|---|---|---|---|
| xg_family | 0.335 ±0.007 | 0.334 ±0.007 | 0.329 ±0.007 | -0.001 |
| xg_family_lift | 0.104 ±0.006 | 0.103 ±0.006 | 0.098 ±0.006 | -0.001 |
| xg_primary_lift | 0.139 ±0.008 | 0.137 ±0.008 | 0.130 ±0.008 | -0.002 |
| out_family | 0.564 ±0.026 | 0.559 ±0.026 | 0.588 ±0.025 | -0.005 |
| out_primary | 0.898 ±0.012 | 0.899 ±0.012 | 0.912 ±0.011 | +0.001 |
| desc_cos_xa | 0.391 ±0.008 | 0.391 ±0.008 | 0.383 ±0.008 | -0.000 |
| genre_primary_xa | 0.102 ±0.012 | 0.101 ±0.012 | 0.088 ±0.011 | -0.001 |
| desc_cos | 0.399 ±0.009 | 0.398 ±0.008 | 0.392 ±0.009 | -0.001 |

### effnet/64 (full pool; same lists 0.949 ±0.002)

| metric | in fit | held out | oof (tables above) | held out − in fit |
|---|---|---|---|---|
| xg_family | 0.365 ±0.005 | 0.365 ±0.005 | 0.365 ±0.005 | -0.000 |
| xg_family_lift | 0.148 ±0.004 | 0.148 ±0.004 | 0.148 ±0.004 | -0.000 |
| xg_primary_lift | 0.187 ±0.005 | 0.187 ±0.005 | 0.187 ±0.005 | -0.001* |
| out_family | 0.366 ±0.015 | 0.367 ±0.015 | 0.366 ±0.015 | +0.000 |
| out_primary | 0.798 ±0.010 | 0.797 ±0.010 | 0.798 ±0.010 | -0.000 |
| desc_cos_xa | 0.432 ±0.005 | 0.432 ±0.005 | 0.432 ±0.005 | -0.000 |
| genre_primary_xa | 0.202 ±0.010 | 0.203 ±0.010 | 0.202 ±0.010 | +0.000 |
| desc_cos | 0.446 ±0.005 | 0.446 ±0.005 | 0.446 ±0.005 | +0.000 |

### effnet-leace/64+ball@0.5 (full pool; same lists 0.871 ±0.003)

| metric | in fit | held out | oof (tables above) | held out − in fit |
|---|---|---|---|---|
| xg_family | 0.356 ±0.005 | 0.356 ±0.005 | 0.355 ±0.005 | +0.000 |
| xg_family_lift | 0.139 ±0.004 | 0.139 ±0.004 | 0.139 ±0.004 | +0.000 |
| xg_primary_lift | 0.181 ±0.005 | 0.181 ±0.005 | 0.181 ±0.005 | +0.000 |
| out_family | 0.423 ±0.016 | 0.422 ±0.015 | 0.428 ±0.015 | -0.001 |
| out_primary | 0.819 ±0.009 | 0.820 ±0.010 | 0.822 ±0.009 | +0.001 |
| desc_cos_xa | 0.425 ±0.005 | 0.425 ±0.005 | 0.424 ±0.005 | +0.000 |
| genre_primary_xa | 0.181 ±0.009 | 0.180 ±0.010 | 0.178 ±0.009 | -0.001 |
| desc_cos | 0.438 ±0.005 | 0.438 ±0.005 | 0.438 ±0.005 | -0.000 |

### effnet-fampred/64+ball@0.5 (full pool; same lists 0.817 ±0.007)

| metric | in fit | held out | oof (tables above) | held out − in fit |
|---|---|---|---|---|
| xg_family | 0.356 ±0.005 | 0.358 ±0.005 | 0.358 ±0.005 | +0.002* |
| xg_family_lift | 0.140 ±0.004 | 0.141 ±0.004 | 0.142 ±0.004 | +0.002* |
| xg_primary_lift | 0.182 ±0.005 | 0.183 ±0.005 | 0.182 ±0.005 | +0.001 |
| out_family | 0.392 ±0.015 | 0.409 ±0.016 | 0.417 ±0.015 | +0.017* |
| out_primary | 0.809 ±0.009 | 0.815 ±0.010 | 0.817 ±0.010 | +0.006* |
| desc_cos_xa | 0.426 ±0.005 | 0.426 ±0.005 | 0.426 ±0.005 | -0.000 |
| genre_primary_xa | 0.191 ±0.009 | 0.185 ±0.010 | 0.183 ±0.009 | -0.006* |
| desc_cos | 0.439 ±0.005 | 0.439 ±0.005 | 0.439 ±0.005 | -0.001 |

### effnet-ndesc-inlp2/64 (full pool; same lists 0.724 ±0.005)

| metric | in fit | held out | oof (tables above) | held out − in fit |
|---|---|---|---|---|
| xg_family | 0.402 ±0.005 | 0.394 ±0.005 | 0.379 ±0.005 | -0.008* |
| xg_family_lift | 0.185 ±0.004 | 0.177 ±0.004 | 0.162 ±0.004 | -0.008* |
| xg_primary_lift | 0.212 ±0.005 | 0.204 ±0.005 | 0.188 ±0.005 | -0.007* |
| out_family | 0.402 ±0.016 | 0.400 ±0.016 | 0.427 ±0.016 | -0.002 |
| out_primary | 0.809 ±0.010 | 0.812 ±0.010 | 0.841 ±0.009 | +0.003* |
| desc_cos_xa | 0.452 ±0.005 | 0.445 ±0.005 | 0.428 ±0.005 | -0.007* |
| genre_primary_xa | 0.191 ±0.010 | 0.188 ±0.010 | 0.159 ±0.009 | -0.003* |
| desc_cos | 0.462 ±0.005 | 0.455 ±0.005 | 0.444 ±0.006 | -0.007* |

### effnet-ndesc/64 (full pool; same lists 0.775 ±0.004)

| metric | in fit | held out | oof (tables above) | held out − in fit |
|---|---|---|---|---|
| xg_family | 0.402 ±0.005 | 0.395 ±0.005 | 0.387 ±0.005 | -0.007* |
| xg_family_lift | 0.186 ±0.004 | 0.178 ±0.004 | 0.170 ±0.004 | -0.007* |
| xg_primary_lift | 0.214 ±0.005 | 0.206 ±0.005 | 0.199 ±0.005 | -0.008* |
| out_family | 0.376 ±0.015 | 0.377 ±0.016 | 0.384 ±0.016 | +0.001 |
| out_primary | 0.799 ±0.010 | 0.802 ±0.010 | 0.811 ±0.010 | +0.003* |
| desc_cos_xa | 0.455 ±0.005 | 0.448 ±0.005 | 0.440 ±0.005 | -0.007* |
| genre_primary_xa | 0.201 ±0.010 | 0.198 ±0.010 | 0.189 ±0.010 | -0.003* |
| desc_cos | 0.466 ±0.005 | 0.459 ±0.005 | 0.451 ±0.005 | -0.007* |

## Anchor: Miles Davis — Bitches Brew

In the bake-off pool: {'Miles Davis — Bitches Brew': False, 'Miles Davis — Live-Evil': False, 'Miles Davis — Get Up With It': False, 'Embryo — Rocksession': False}. So CLAP and MERT cannot be shown for this seed; the lists below are on the full pool. Seed genres: Jazz Fusion, Avant-Garde Jazz. Lists keep the seed's artist, as the site does. Rank = position among all 3,943 other albums.

**effnet/64** — ranks: Live-Evil 70; Get Up With It 286; Rocksession 430. Prog rock in the top 10: none.

1. McCoy Tyner — Asante [Post-Bop]
2. Bobby Hutcherson — Head On [Jazz Fusion]
3. John Coltrane — Concert in Japan [Free Jazz]
4. Sonny Sharrock — Ask the Ages [Avant-Garde Jazz]
5. John Coltrane — Stellar Regions [Free Jazz]
6. Gil Evans — The Individualism of Gil Evans [Post-Bop]
7. Cecil Taylor — Conquistador! [Free Jazz]
8. Don Cherry — Symphony for Improvisers [Free Jazz]
9. John Coltrane — Kulu Sé Mama [Free Jazz]
10. William Parker & In Order to Survive — The Peach Orchard [Free Jazz]

**effnet/24** — ranks: Live-Evil 110; Get Up With It 305; Rocksession 456. Prog rock in the top 10: none.

1. McCoy Tyner — Asante [Post-Bop]
2. Bobby Hutcherson — Head On [Jazz Fusion]
3. Sonny Sharrock — Ask the Ages [Avant-Garde Jazz]
4. John Coltrane — Concert in Japan [Free Jazz]
5. Gil Evans — The Individualism of Gil Evans [Post-Bop]
6. Don Cherry — Symphony for Improvisers [Free Jazz]
7. Pharoah Sanders — Elevation [Spiritual Jazz]
8. Cecil Taylor — Conquistador! [Free Jazz]
9. Charles Lloyd — Forest Flower [Post-Bop]
10. John Coltrane — Stellar Regions [Free Jazz]

**musicnn/64** — ranks: Live-Evil 55; Get Up With It 256; Rocksession 341. Prog rock in the top 10: none.

1. Bobby Hutcherson — Head On [Jazz Fusion]
2. McCoy Tyner — Asante [Post-Bop]
3. Wayne Shorter — The All Seeing Eye [Avant-Garde Jazz]
4. The Gil Evans Orchestra — Out of the Cool [Progressive Big Band]
5. McCoy Tyner — Sama Layuca [Post-Bop]
6. Herbie Hancock — Mwandishi [Jazz Fusion]
7. Alice Coltrane featuring Pharoah Sanders — Journey in Satchidananda [Spiritual Jazz]
8. Anthony Braxton — Willisau (Quartet) 1991 [Avant-Garde Jazz]
9. Chick Corea — Return to Forever [Jazz Fusion]
10. Les McCann — Invitation to Openness [Jazz Fusion]

**ball** — ranks: Live-Evil 579; Get Up With It 350; Rocksession 252. Prog rock in the top 10: none.

1. Anthony Braxton — Dortmund (Quartet) 1976 [Avant-Garde Jazz]
2. Wayne Shorter — The All Seeing Eye [Avant-Garde Jazz]
3. Bobby Hutcherson — Stick-Up! [Hard Bop]
4. The John Coltrane Quartet — The John Coltrane Quartet Plays [Avant-Garde Jazz]
5. Cecil Taylor — Conquistador! [Free Jazz]
6. Miles Davis — Filles de Kilimanjaro [Post-Bop]
7. Julian Priester Pepo Mtoto — Love, Love [Jazz Fusion]
8. Miles Davis — In a Silent Way [Jazz Fusion]
9. Jack DeJohnette — Special Edition [Avant-Garde Jazz]
10. Chick Corea — Now He Sings, Now He Sobs [Post-Bop]

**effnet/64+ball@0.5** — ranks: Live-Evil 203; Get Up With It 241; Rocksession 336. Prog rock in the top 10: none.

1. Anthony Braxton — Dortmund (Quartet) 1976 [Avant-Garde Jazz]
2. Cecil Taylor — Conquistador! [Free Jazz]
3. Bobby Hutcherson — Stick-Up! [Hard Bop]
4. Wayne Shorter — The All Seeing Eye [Avant-Garde Jazz]
5. The John Coltrane Quartet — The John Coltrane Quartet Plays [Avant-Garde Jazz]
6. Miles Davis — Filles de Kilimanjaro [Post-Bop]
7. John Coltrane — Expression [Free Jazz]
8. John Coltrane — Concert in Japan [Free Jazz]
9. McCoy Tyner — Asante [Post-Bop]
10. Sonny Sharrock — Ask the Ages [Avant-Garde Jazz]

**effnet/64+ball@0.9** — ranks: Live-Evil 447; Get Up With It 290; Rocksession 244. Prog rock in the top 10: none.

1. Anthony Braxton — Dortmund (Quartet) 1976 [Avant-Garde Jazz]
2. Bobby Hutcherson — Stick-Up! [Hard Bop]
3. Wayne Shorter — The All Seeing Eye [Avant-Garde Jazz]
4. Cecil Taylor — Conquistador! [Free Jazz]
5. The John Coltrane Quartet — The John Coltrane Quartet Plays [Avant-Garde Jazz]
6. Miles Davis — Filles de Kilimanjaro [Post-Bop]
7. Jack DeJohnette — Special Edition [Avant-Garde Jazz]
8. Chick Corea — Now He Sings, Now He Sobs [Post-Bop]
9. John Coltrane — Expression [Free Jazz]
10. Julian Priester Pepo Mtoto — Love, Love [Jazz Fusion]

**effnet/64+feel@0.75** — ranks: Live-Evil 80; Get Up With It 359; Rocksession 335. Prog rock in the top 10: none.

1. Bobby Hutcherson — Head On [Jazz Fusion]
2. McCoy Tyner — Asante [Post-Bop]
3. John Coltrane Quartet — Crescent [Post-Bop]
4. Charles Lloyd — Forest Flower [Post-Bop]
5. The Charlie Mingus Jazz Workshop — Pithecanthropus Erectus [Post-Bop]
6. Pharoah Sanders — Live in Paris (1975) [Spiritual Jazz]
7. Miles Davis — Porgy and Bess [Big Band]
8. Bill Evans Trio — Waltz for Debby [Cool Jazz]
9. Miles Davis — Big Fun [Jazz Fusion]
10. Bobby Hutcherson — Components [Post-Bop]

**effnet-head400/64** — ranks: Live-Evil 95; Get Up With It 327; Rocksession 470. Prog rock in the top 10: none.

1. John Coltrane — Stellar Regions [Free Jazz]
2. John Coltrane — Kulu Sé Mama [Free Jazz]
3. Sonny Sharrock — Ask the Ages [Avant-Garde Jazz]
4. Nucleus — Elastic Rock [Jazz Fusion]
5. McCoy Tyner — Asante [Post-Bop]
6. John Coltrane — Expression [Free Jazz]
7. John Coltrane — Concert in Japan [Free Jazz]
8. William Parker & In Order to Survive — The Peach Orchard [Free Jazz]
9. Archie Shepp — The Way Ahead [Avant-Garde Jazz]
10. Bobby Hutcherson — Head On [Jazz Fusion]

**effnet-inlp2/64** — ranks: Live-Evil 19; Get Up With It 227; Rocksession 430. Prog rock in the top 10: none.

1. Keith Jarrett — The Survivors' Suite [ECM Style Jazz]
2. John Coltrane Featuring Pharoah Sanders — Live in Seattle [Free Jazz]
3. Miles Davis — Miles in Berlin [Hard Bop]
4. Miles Davis — Live at the Fillmore East (March 7, 1970): It's About That Time [Jazz Fusion]
5. Miles Davis — The Cellar Door Sessions 1970 [Jazz Fusion]
6. John Coltrane / Archie Shepp — New Thing at Newport [Avant-Garde Jazz]
7. Miles Davis — Filles de Kilimanjaro [Post-Bop]
8. The Charlie Mingus Jazz Workshop — Pithecanthropus Erectus [Post-Bop]
9. Miles Davis — Black Beauty: Miles Davis at Fillmore West [Jazz Fusion]
10. David Murray Octet — Ming [Avant-Garde Jazz]

**effnet-fampred/64** — ranks: Live-Evil 82; Get Up With It 697; Rocksession 1717. Prog rock in the top 10: none.

1. Bobby Hutcherson — Head On [Jazz Fusion]
2. McCoy Tyner — Asante [Post-Bop]
3. John Coltrane — Concert in Japan [Free Jazz]
4. Sonny Sharrock — Ask the Ages [Avant-Garde Jazz]
5. Augustus Pablo — East of the River Nile [Reggae]
6. Don Cherry — Symphony for Improvisers [Free Jazz]
7. Nucleus — Elastic Rock [Jazz Fusion]
8. Gil Evans — The Individualism of Gil Evans [Post-Bop]
9. Madlib — Shades of Blue: Madlib Invades Blue Note [Instrumental Hip Hop]
10. Pharoah Sanders — Jewels of Thought [Spiritual Jazz]

**effnet-leace/64** — ranks: Live-Evil 11; Get Up With It 80; Rocksession 2434. Prog rock in the top 10: none.

1. Alice Coltrane With Strings — World Galaxy [Spiritual Jazz]
2. Nucleus — Elastic Rock [Jazz Fusion]
3. Bill Evans — Symbiosis [Third Stream]
4. Bobby Hutcherson — Head On [Jazz Fusion]
5. Anthony Braxton — Quartet (Santa Cruz) 1993 [Free Jazz]
6. Jonny Greenwood — Phantom Thread [Film Score]
7. Archie Shepp — The Way Ahead [Avant-Garde Jazz]
8. John Coltrane — Concert in Japan [Free Jazz]
9. Anthony Braxton — Dortmund (Quartet) 1976 [Avant-Garde Jazz]
10. Alice Coltrane — Universal Consciousness [Spiritual Jazz]

**effnet-leace/64+ball@0.5** — ranks: Live-Evil 131; Get Up With It 140; Rocksession 733. Prog rock in the top 10: none.

1. Alice Coltrane With Strings — World Galaxy [Spiritual Jazz]
2. Anthony Braxton — Dortmund (Quartet) 1976 [Avant-Garde Jazz]
3. Cecil Taylor — Conquistador! [Free Jazz]
4. John Coltrane — Concert in Japan [Free Jazz]
5. Anthony Braxton — Quartet (Santa Cruz) 1993 [Free Jazz]
6. Miles Davis — In a Silent Way [Jazz Fusion]
7. Bobby Hutcherson — Stick-Up! [Hard Bop]
8. Julian Priester Pepo Mtoto — Love, Love [Jazz Fusion]
9. Sonny Sharrock — Ask the Ages [Avant-Garde Jazz]
10. John Coltrane / Archie Shepp — New Thing at Newport [Avant-Garde Jazz]

**effnet-fampred/64+ball@0.5** — ranks: Live-Evil 199; Get Up With It 320; Rocksession 518. Prog rock in the top 10: none.

1. Anthony Braxton — Dortmund (Quartet) 1976 [Avant-Garde Jazz]
2. Cecil Taylor — Conquistador! [Free Jazz]
3. John Coltrane — Concert in Japan [Free Jazz]
4. Sonny Sharrock — Ask the Ages [Avant-Garde Jazz]
5. McCoy Tyner — Asante [Post-Bop]
6. Bobby Hutcherson — Stick-Up! [Hard Bop]
7. Bobby Hutcherson — Head On [Jazz Fusion]
8. Miles Davis — Filles de Kilimanjaro [Post-Bop]
9. Gil Evans — The Individualism of Gil Evans [Post-Bop]
10. Miles Davis — In a Silent Way [Jazz Fusion]

**effnet-ndesc/64** — ranks: Live-Evil 82; Get Up With It 339; Rocksession 376. Prog rock in the top 10: none.

1. Bobby Hutcherson — Head On [Jazz Fusion]
2. McCoy Tyner — Asante [Post-Bop]
3. Nucleus — Elastic Rock [Jazz Fusion]
4. Sonny Sharrock — Ask the Ages [Avant-Garde Jazz]
5. Stan Getz — Captain Marvel [Jazz Fusion]
6. Anthony Braxton — Dortmund (Quartet) 1976 [Avant-Garde Jazz]
7. Prince Lasha & Sonny Simmons — Firebirds [Avant-Garde Jazz]
8. John Coltrane — Kulu Sé Mama [Free Jazz]
9. McCoy Tyner — Sama Layuca [Post-Bop]
10. John Coltrane — Expression [Free Jazz]

**effnet-ndesc-inlp2/64** — ranks: Live-Evil 19; Get Up With It 152; Rocksession 200. Prog rock in the top 10: none.

1. Kenny Wheeler, Lee Konitz, Dave Holland & Bill Frisell — Angel Song [Post-Bop]
2. Miles Davis — Miles in Berlin [Hard Bop]
3. Rahsaan Roland Kirk — Prepare Thyself to Deal With a Miracle [Spiritual Jazz]
4. Miles Davis — Filles de Kilimanjaro [Post-Bop]
5. The Charlie Mingus Jazz Workshop — Pithecanthropus Erectus [Post-Bop]
6. John Coltrane Featuring Pharoah Sanders — Live in Seattle [Free Jazz]
7. Miles Davis — The Cellar Door Sessions 1970 [Jazz Fusion]
8. Miles Davis — Big Fun [Jazz Fusion]
9. Sonny Sharrock — Ask the Ages [Avant-Garde Jazz]
10. John Coltrane / Archie Shepp — New Thing at Newport [Avant-Garde Jazz]

**effnet-famoracle/64** — ranks: Live-Evil 70; Get Up With It 602; Rocksession 2359. Prog rock in the top 10: none.

1. Bobby Hutcherson — Head On [Jazz Fusion]
2. McCoy Tyner — Asante [Post-Bop]
3. John Coltrane — Concert in Japan [Free Jazz]
4. Sonny Sharrock — Ask the Ages [Avant-Garde Jazz]
5. Augustus Pablo — East of the River Nile [Reggae]
6. Don Cherry — Symphony for Improvisers [Free Jazz]
7. Nucleus — Elastic Rock [Jazz Fusion]
8. Pharoah Sanders — Jewels of Thought [Spiritual Jazz]
9. Cecil Taylor — Conquistador! [Free Jazz]
10. Gil Evans — The Individualism of Gil Evans [Post-Bop]

**effnet/64~mmr0.5** — ranks: Live-Evil 70; Get Up With It 286; Rocksession 430. Prog rock in the top 10: none.

1. McCoy Tyner — Asante [Post-Bop]
2. Nucleus — Elastic Rock [Jazz Fusion]
3. The Gil Evans Orchestra — Out of the Cool [Progressive Big Band]
4. Miles Davis — Live at the Fillmore East (March 7, 1970): It's About That Time [Jazz Fusion]
5. Anthony Braxton — Quartet (Santa Cruz) 1993 [Free Jazz]
6. Eric Dolphy — The Illinois Concert [Avant-Garde Jazz]
7. Pharoah Sanders — Jewels of Thought [Spiritual Jazz]
8. Pharoah Sanders — Elevation [Spiritual Jazz]
9. Bobby Hutcherson — Head On [Jazz Fusion]
10. Don Cherry — Symphony for Improvisers [Free Jazz]

