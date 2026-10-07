# Colour weights for the 10k catalog

Date: 2026-10-07. Script: `run_weights10k.py`. Outputs: `out/album_weights_10k.json` (read by
`rmr_pipeline.theme`), `out/report_weights10k.json` (every number below). Run with the pipeline venv
(Python 3.12, numpy 2.5.3, scikit-learn 1.9.1), one job, about a minute.

## What was decided before this

The five families and their hues stay as fitted on the 4,081-album catalogue (`out/family_loadings.json`).
Nothing is refitted. The 4,081 albums keep the weights of `regions/colour.json`. The 6,386 later albums
have no Spotify sound traits, which the definitions need (SCALING.md section 6), so their weights are
predicted.

## What each album gets

| Albums | n | Weights |
|---|---|---|
| The feature table's | 4,081 | as in `regions/colour.json`, unchanged |
| Later, with a clip embedding | 6,200 | predicted (below), then calibrated |
| Later, no audio, with descriptors | 185 | the frozen definitions on the descriptors alone |
| Later, neither | 1 | neutral |

The prediction: a ridge regression from the album's 1,280-number EffNet clip embedding (standardised) and
the presence of each of the 99 family words among its first eight descriptors, straight to the six shares.
Fitted on the 4,042 older albums that have an embedding; alpha 1000, chosen by five-fold error.
Negative shares are cut to zero and the row is scaled to sum to 1.

## Hold-out

The two 70% / 30% splits of `run_families.py` (seeds 101 and 102), albums with an embedding only: 2,832
and 2,831 to fit, 1,210 and 1,211 held out. A held-out album is given what a new album has (its first
eight descriptors and its embedding) and compared with its true weights. "Clear" is SCALING.md's measure:
the true neutral share is under 0.5 (1,162 and 1,174 albums). "Decisive" also asks that the true leading
family is 0.15 or more ahead of the next (796 and 792).

| Method | Same leading family, clear | Same, decisive | True leader in the predicted first two | Mean abs. error of a share | Mean neutral (true 0.129, 0.126) |
|---|---|---|---|---|---|
| Frozen definitions, full word list and true traits (the bar) | 99.2%, 99.6% | 100%, 100% | 100%, 100% | 0.002, 0.002 | 0.129, 0.126 |
| Frozen definitions, first eight words and true traits | 92.2%, 91.1% | 97.9%, 97.2% | 98.4%, 98.9% | 0.032, 0.033 | 0.190, 0.190 |
| Frozen definitions, first eight words alone | 61.7%, 58.1% | 70.0%, 66.8% | 82.4%, 80.6% | 0.135, 0.138 | 0.342, 0.335 |
| a. Traits predicted from the embedding, then the frozen definitions | 75.7%, 75.0% | 85.8%, 84.8% | 93.0%, 92.4% | 0.093, 0.094 | 0.304, 0.301 |
| b. Mean of the 20 nearest albums in embedding space | 73.2%, 72.3% | 81.2%, 80.8% | 92.2%, 89.9% | 0.089, 0.088 | 0.126, 0.125 |
| b. The same, blended 0.3 with the words-alone score | 75.6%, 73.2% | 82.9%, 81.7% | 92.2%, 91.2% | 0.089, 0.089 | 0.191, 0.188 |
| **c. Ridge from embedding and words to the shares (chosen)** | **76.2%, 74.8%** | 85.8%, 85.6% | 94.2%, 92.6% | **0.080, 0.079** | 0.123, 0.125 |
| c, calibrated (what is written) | 76.2%, 74.8% | 85.8%, 85.6% | 94.2%, 92.6% | 0.078, 0.077 | 0.124, 0.125 |
| Mean of a and c | 76.8%, 75.8% | 86.4%, 86.4% | 93.9%, 92.9% | 0.079, 0.079 | 0.214, 0.213 |

**No method reaches 80% on clear albums.** The three are within two points of each other, which is about
the sampling error of a split (1.2 points), so the choice between them was made on the other columns: c
has the smallest share error and is the only one of a and c that does not grey the albums (a's mean
neutral share is 0.30 against a true 0.13, and it would colour 62% of stars against a true 87%).

Where the ceiling is: the predicted traits. The ridge predicts energy, acousticness, valence and
danceability at R² 0.68 to 0.77, loudness, speechiness and instrumentalness at 0.57 to 0.67, liveness
and tempo at 0.19 to 0.28. With true traits and the same eight words the frozen definitions reach 91 to
92%. When the prediction misses, the true family is its second choice in about three of four misses,
and among decisive albums it is right 86% of the time: the misses are mostly albums that sit between
two families.

Also tried, in scratch and not in the script: adding the lyric descriptors and the RYM genres as
inputs (76.9% and 75.8% for c; within the noise, not adopted), and other neighbour counts for b.

## The seam check

A predicted row is pulled to the average: before any correction the held-out predictions of c have the
right mean neutral share but a narrower spread (no album over 0.5 neutral against a true 3 to 4%), and
a mean leading share of 0.456 against a true 0.527. Left alone, the new albums would be paler than the
old ones.

Fix chosen: calibrate the predictions to the true distribution, measured on out-of-fold predictions
of the albums that have true weights (five folds). Neutral share: a monotone quantile-to-quantile map.
Family shares: a power on the shares inside the album's family total (1.38), set so that the mean
leading share equals the true one. Neither changes which family leads. The older albums keep their
true weights. On the two hold-outs the calibrated predictions have mean leading share 0.527 and 0.524
(true 0.527, 0.528), leading-share quartiles 0.40 / 0.52 / 0.65 (true 0.42 / 0.53 / 0.64), 2.6% and
3.4% of albums over 0.5 neutral (true 4.0%, 3.1%) and 85.1% and 85.8% of stars coloured (true 86.9%,
87.0%).

On the catalog (n: 4,081 old with true weights, 6,200 new predicted):

| | Old, true | New, before calibration | New, as written |
|---|---|---|---|
| Mean neutral share | 0.120 | 0.095 | 0.077 |
| Neutral, 75th and 90th percentile | 0.22, 0.37 | 0.15, 0.22 | 0.13, 0.29 |
| Mean leading share | 0.531 | 0.470 | 0.551 |
| Leading share, quartiles | 0.42, 0.53, 0.64 | 0.37, 0.46, 0.56 | 0.43, 0.55, 0.67 |
| Stars coloured | 87.2% | 90.7% | 91.2% |
| Coloured stars: fierce, warm, quiet, dark, urban | 25, 25, 24, 16, 10% | 25, 24, 24, 21, 7% | 24, 23, 23, 22, 7% |

The new albums come out slightly more coloured than the old ones, not greyer (leading share +0.02,
neutral -0.04). The calibration is exact on the hold-outs, so this is the new albums themselves: they
have more of the family words among their eight (6.3 against 5.8). More of them are dark and fewer
urban, which matches what the 10k study expected of the additions. The 185 albums scored on words alone
are greyer (mean neutral 0.25, 72% coloured); they are spread over the map.

## Limits

- 75 to 76% agreement on the leading family, not the 89 to 99% of the frozen definitions with true
  traits. About one new album in four is led by its second family. On the map this is softened twice:
  the gas is a blur over many albums, and a miss is usually the neighbouring family.
- Judged on older albums only. The new albums are a different mix (more classical, Japanese, punk and
  game music), and nothing measures the prediction on them. Nobody has looked at single albums' colours.
- The hold-out splits are the two that `run_families.py` used, and the method was chosen on them, so
  the figures for c are a little optimistic. No third split was kept back.
- The older albums' true weights come from full descriptor lists (10.7 words an album); new albums have
  eight descriptors, of which 6.3 are family words. The prediction learns from first-eight words on both
  sides, so this does not make a seam, but it is why words alone do so poorly.
- The word scale (3) and the alpha grid were the first values tried, not tuned.
- When the catalog or the audio store changes, rerun the script: it refits the ridge. Old albums'
  weights do not move; new albums' can, slightly.
