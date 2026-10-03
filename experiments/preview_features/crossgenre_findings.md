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

**Later the same day.** CLAP was run over the full catalog (4 clips); see the CLAP-on-full-pool, balanced-stop and fullclap anchor sections of this file and `REPORT-genre-crossing.md`. The Bitches Brew paragraph above predates that run. MERT on the full catalog was not done.
