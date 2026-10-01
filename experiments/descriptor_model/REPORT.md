# Predicting RYM descriptors for new albums: report

Experiment run on 2026-10-01 in `experiments/descriptor_model/`. All paths below are relative to that directory.
Numbers are quoted with their split and n. "cP@10" is capped precision@10 (defined in section 3). "±" is a bootstrap standard error over artist groups.
Facts marked **[log]** come from the experiment log and have no result file here; everything else names its file.

## 1. Verdict

- **What works.** A language model that lists descriptors from its own knowledge of the album (artist, title, year only) is the best predictor by a wide margin. Test, n=360: cP@10 0.785 ±0.011, nDCG@10 0.801. Re-ranked with MusicBrainz/Deezer tags: 0.794 ±0.011 / 0.808 (`results/test/final_test.md` §1).
- **Audio adds little on top.** Full fusion (LLM + audio + tags), test n=138: 0.788 ±0.016, against 0.787 for LLM + tags on the same albums.
- **Without the LLM.** Audio + tags: 0.687 ±0.012 (test, n=227). Scraped-genre reference: 0.655. Most-frequent floor: 0.443.
- **What "90%" means.** No system reaches 0.90 cP@10. Plain precision@10 cannot exceed 0.83 on this data. 90% does hold for the first two words (0.91–0.93 on test), and about three descriptors per album can be emitted at ≈0.9 precision (3.06 per album at 0.89 on test; 1.76 at 0.88 for mood words only).
- **Recommendations.** At the balanced slider stop, predicted lists recover RSQ 0.85 (0 = random, 1 = real descriptors; 0.76 with no descriptors at all); 74% of recommended albums sit in the real top-50; exact top-10 overlap is 0.34. At the mood stop: RSQ 0.67 (floor 0.51), overlap 0.18. New albums do not become hubs (inbound ratio 0.94–1.24).
- **Ship.** LLM list, plus tags when MusicBrainz has the album, through `predict.py` with the top-10 rank-weight policy. Audio + tags as the fallback for albums the LLM does not know or that postdate its training.
- **Caveat 1: contamination.** The LLM has probably read RYM's descriptor pages. These numbers measure recall of known albums, not tagging of unseen music. Nothing here tests releases after the model's cutoff.
- **Caveat 2: partial data.** Only 360 of 600 test albums have LLM lists, and 138 have all three inputs. Audio models saw 1,049 training albums because extraction stopped at 1,517 of 3,761.
- **Caveat 3: labels.** Crowd lists have missing positives and some outright errors. The true ceiling of every metric here is unknown.

## 2. What was asked, and how "90%" translates

Asked for: (1) a model that predicts an album's RYM descriptors, to replace scraping for future albums; (2) a held-out test; (3) an honest reading of "90% precision"; (4) above all, good album-to-album recommendations.

Candidate readings of 90%, with test values for the best systems. Val is the same pipeline on validation. Source: `results/test/final_test.md` §1, §3, §5.

| Reading | LLM + tags, test n=360 | Full fusion, test n=138 | Val (LLM + tags, n=601) | 0.9 reached? |
|---|---|---|---|---|
| cP@10 (owner's headline) | 0.794 ±0.011 | 0.788 ±0.016 | 0.802 | No |
| Plain P@10 (ceiling ≈0.83) | 0.661 | 0.700 | 0.665 | Impossible |
| Albums with a perfect top-10 | 0.244 | 0.210 | 0.228 | No |
| Precision of the first 1 / 2 / 3 / 5 / 10 emitted | 0.950 / 0.928 / 0.888 / 0.819 / 0.666 | 0.963 / 0.923 / 0.892 / 0.843 / 0.702 | not tabulated | First 2 only |
| Descriptors per album at ≥0.9 precision, all 120 | 3.06 (realised 0.89) | 3.31 (0.88) | 3.18 (0.91) | Just under |
| Same, 114 mood words only | 1.76 (0.88) | 2.00 (0.87) | 1.83 (0.91) | Just under |
| Descriptors per album at ≥0.8 precision, all / mood | 5.72 (0.79) / 3.76 (0.79) | 5.83 (0.82) / 3.84 (0.82) | 5.84 (0.81) / 3.94 (0.81) | n/a |
| Balanced stop: overlap@10 with the real list (ceiling 0.967, no-descriptor floor 0.090) | 0.341 | 0.352 | 0.347 | No |
| Balanced stop: RSQ (floor 0.758) / R@10→50 (floor 0.484) | 0.854 / 0.738 | 0.865 / 0.765 | 0.866 / n/a | No |
| Mood stop: overlap@10 (ceiling 0.945, floor 0.020) | 0.180 | 0.193 | 0.179 | No |
| Mood stop: RSQ (floor 0.506) / R@10→50 (floor 0.095) | 0.669 / 0.447 | 0.697 / 0.484 | 0.692 / n/a | No |

Thresholds for the precision rows were fixed on train before test was read. "Realised" is the precision actually obtained on test. Fusion rows use the plain top-10 vector policy. Ceilings and floors are for the 360-album set.

**Proposed "good enough" bar.** These thresholds were written after seeing the results. They are a proposal for the owner to accept or change, not a pre-registered target.

| # | Threshold | Test value (LLM + tags, n=360) | Met? |
|---|---|---|---|
| 1 | cP@10 ≥ 0.75 | 0.794 | Yes |
| 2 | First three words ≥ 0.85 precise | 0.888 | Yes |
| 3 | ≥ 3 descriptors per album at realised precision ≥ 0.90, threshold fixed in advance | 3.06 at 0.89 | No, by 0.01 (met on val: 3.18 at 0.91) |
| 4 | Balanced stop: RSQ ≥ 0.85 and R@10→50 ≥ 0.70 | 0.854 and 0.738 | Yes, RSQ narrowly |
| 5 | Mood stop: RSQ ≥ 0.85 and R@10→50 ≥ 0.70 | 0.669 and 0.447 | No |
| 6 | Inbound ratio between 0.8 and 1.25 at both stops | 1.05 and 1.24 (LLM alone: 0.94 and 1.08) | Yes |
| 7 | Literal reading: cP@10 ≥ 0.90 | 0.794 | No |

Bar 4 is roughly the level of a real descriptor list with 3 of ~10 words swapped for common ones (RSQ 0.852, R@10→50 0.709; val, n=136, `results/recs_summary.json`).

## 3. Data, split, metrics

**Labels** (`common.py`, `weights.py`).
- `all_data_norm.pkl`: 4,116 rows. 120 descriptor columns are used by the recommender (of 176 in the table).
- Weight = (63 − position) / 42. Position is counted over the album's whole RYM list, so dropped lyric descriptors leave gaps.
- 4,110 rows have at least one of the 120 descriptors; 6 have none. The brief's "73" is albums with no mood words **[log]**.
- Mean 10.77 descriptors per labelled album (10.76 over all 4,116 rows). 44.4% of albums have fewer than 10.
- So plain P@10 has an arithmetic ceiling of 0.830. Hence capped precision.

**Label problems.**
- 34 Spotify URIs are shared by 69 rows that are different albums (search collisions). The repo therefore holds no same-album label-agreement ceiling (`ceiling.py`).
- 43 rows carry an exact copy of another album's descriptor vector (name-lookup scraping). 40 are in train and are dropped from fitting, leaving 2,869 train rows.
- 88 rows may point at the wrong Spotify album (`common.audio_suspect_rows()`).
- Removing suspect rows changes no test headline by more than 0.005 (`final_test.md` §6).

**Split** (`split.py`, `splits.json`).
- 2,909 / 601 / 600 train / val / test over the 4,110 labelled rows.
- Artist-disjoint by credited name, with aliases and collaborations linked. Stratified by genre family.
- An independent audit found no leakage and reproduced the metrics. About 40 band-member pairs straddle splits (e.g. Pink Floyd in train, David Gilmour in val). Mildly optimistic. **[log]**

**Audio** (`match_previews.py`, `extract_embeddings.py`).
- 30 s previews matched for 91.4% of rows: Deezer 86.8%, iTunes 4.6%, none 8.6% (`cache/matches.parquet`). That is 3,761 distinct albums. Worst for classical multi-artist credits and non-Latin titles **[log]**.
- Encoders: MAEST-30s (all layers), CLAP `laion/clap-htsat-unfused`, MERT-v1-95M (all layers), Discogs-EffNet + Essentia classifier heads (738 columns). The CLAP music checkpoint was degenerate **[log]**. MERT-v2-30s was extracted for the first 192 albums only, then dropped for memory **[log]**.
- **Extraction was stopped at 1,517 of 3,761 albums** because the laptop was overloaded (`cache/extract.log`). It is resumable.
- Two data snapshots result. They are not comparable with each other.

| Snapshot | Albums extracted | Train with audio | Val with audio | Used for |
|---|---|---|---|---|
| 38 shards | 892 | 616 | 138 | Interim audio experiments (4b–4e, 4i) |
| 63 shards | 1,517 | 1,049 | 230 | Fusion, frozen systems, test |

**Metrics** (`metrics.py`, `harness.py`, `downstream.py`, `recq.py`).
- **cP@10**: hits in the top 10 / min(10, number of true descriptors), averaged over albums. Ceiling 1.0. The headline.
- Also P@10, R@10, nDCG@10, mAP, macro AUC, perfect@10 (share of albums with cP@10 = 1).
- **Precision–coverage**: one global threshold over all album × descriptor scores. Reported as precision at ~1…10 descriptors per album, and descriptors per album at a target precision.
- **overlap@10**: share of an album's new top-10 recommendations that are in its real-descriptor top-10. Three slider stops: sonic, balanced, mood.
- **R@10→50**: share of the new top-10 that are in the real top-50.
- **RSQ**: relative similarity quality. 0 = random albums, 1 = the real top-10.
- **Inbound ratio**: how often other albums recommend the album with predicted descriptors, relative to real ones. Above 1 means it has become a hub.
- **Genre agreement**: share of recommended albums in the album's genre family.

**Rules** (`EXPERIMENTS.md`). Everything is fitted and selected on train (cross-validation over artist-disjoint folds). Validation is only scored. Test is reachable only through `final_eval.py`, which logs each access.

## 4. Experiments

### (a) Baselines

`most_frequent` gives every album the train prevalence of each descriptor. `genre_mean` averages the labels of train albums sharing the album's scraped RYM genres, shrunk towards prevalence. It is a reference only: RYM genres will not exist for new albums.

| Baseline | Fitted on | Val n | cP@10 | nDCG@10 | Source |
|---|---|---|---|---|---|
| most_frequent | 2,869 train | 601 | 0.439 | 0.469 | `results/test/FROZEN.md` |
| most_frequent | 2,869 train | 230 | 0.441 | 0.474 | `results/val_leaderboard.csv` |
| genre_mean | 2,869 train | 601 | 0.653 | 0.679 | `FROZEN.md` |
| genre_mean | 2,869 train | 230 | 0.662 | 0.681 | leaderboard |
| genre_mean | 1,049 train (audio rows only) | 230 | 0.636 | 0.651 | leaderboard |

Takeaway: scraped genres alone give 0.65–0.66. Any replacement must beat that without using RYM.

### (b) Audio encoders and linear probes

Each track's preview is embedded by a frozen pretrained encoder; track vectors are averaged per album. A linear probe (one L2 logistic regression per descriptor) maps the album vector to 120 scores. Regularisation, layer and pooling are chosen by 5-fold cross-validation on train.

38-shard snapshot, 616 train / 138 val. Sources: `results/linear_summary.json`, `results/val_leaderboard.csv`.

| Features (mean pooling, logistic probe) | Train-CV nDCG@10 | Val cP@10 | Val nDCG@10 | Val mAP |
|---|---|---|---|---|
| Discogs-EffNet | 0.668 | 0.639 | 0.669 | 0.388 |
| Essentia heads | 0.675 | 0.643 | 0.671 | 0.381 |
| CLAP | 0.664 | 0.638 | 0.672 | 0.361 |
| **MAEST, average of layers 1–12** | **0.694** | **0.664** | **0.695** | **0.419** |
| MERT-v1, layer 6 | 0.666 | 0.633 | 0.663 | 0.373 |
| Concatenation: MAEST + CLAP | 0.695 | 0.656 | 0.697 | 0.412 |
| Concatenation: MAEST + CLAP + heads | 0.697 | 0.670 | 0.698 | 0.416 |
| Concatenation: + MERT-6 | 0.698 | 0.660 | 0.692 | 0.420 |
| Concatenation: all five | n/a | 0.666 | 0.695 | 0.420 |
| Late fusion of the five probes (greedy weights) | 0.699 | 0.669 | 0.698 | 0.425 |
| k-NN label transfer, MAEST (best of 48 settings) | 0.666 | 0.640 | 0.670 | 0.356 |
| k-NN label transfer, concatenation | 0.668 | 0.638 | 0.665 | 0.357 |

What else was tried:
- **Layers** (train-CV nDCG@10). MAEST rises from 0.513 (layer 0) to 0.693 (layer 12); the layer average gives 0.694. MERT-v1 peaks at layer 6 (0.666) and falls to 0.612 at layer 12.
- **Pooling.** Mean vs mean + std: 0.694 vs 0.685 (MAEST), 0.675 vs 0.670 (heads), 0.664 vs 0.659 (CLAP), 0.666 vs 0.656 (MERT), 0.668 vs 0.668 (EffNet).
- **Targets.** Mean over encoders: logistic 0.673, ridge on rank weights 0.675, ridge on binary 0.672. On val for MAEST: 0.695 / 0.691 / 0.687 nDCG@10.
- **MERT-v2.** Only an 8-shard pilot exists (112 train / 21 val). Too small to read.

63-shard snapshot, 1,049 train / 230 val (`results/llm_fusion_summary.json`):

| Features | Train-CV nDCG@10 | Val cP@10 | Val nDCG@10 | Val mAP |
|---|---|---|---|---|
| MAEST 1–12 | 0.6973 | 0.669 | 0.702 | 0.431 |
| Heads + CLAP + MAEST 1–12 (frozen audio system) | 0.6980 | 0.677 | 0.704 | 0.427 |

Takeaway: the MAEST layer average is the best single encoder. Differences between audio variants are within noise (SE ≈ 0.017 on 138 val albums **[log]**; test SEs at n=138 are 0.015–0.017). Mean pooling is at least as good as mean + std. Concatenation, late fusion and k-NN give no reliable gain. Audio alone lands at the scraped-genre level, not above it.

### (c) MLP heads, losses, attention pooling

Small neural heads on the concatenated album vector, and track-level models that learn how to weight an album's tracks instead of averaging them. 22 MLP configurations and 8 pooling configurations were scored by train cross-validation (3 folds; not comparable with the 5-fold numbers in 4b). The best were registered on val. 38-shard snapshot. Source: `results/mlp_summary.json`.

| Model | Train-CV nDCG@10 | Val cP@10 | Val nDCG@10 |
|---|---|---|---|
| MLP, 1 hidden layer (512), projection 256, BCE | 0.672 | 0.661 | 0.689 |
| MLP, 2 hidden layers, BCE | 0.670 | 0.657 | 0.691 |
| MLP, 2 layers, asymmetric loss, mean + std | 0.670 | 0.642 | 0.676 |
| Track-level, mean pooling (control) | 0.675 | 0.651 | 0.687 |
| Track-level, average of per-track logits | 0.677 | 0.665 | 0.696 |
| Track-level, attention | 0.673 | 0.654 | 0.687 |
| Track-level, gated attention | 0.675 | 0.657 | 0.690 |
| Reference: linear probe, MAEST 1–12 | n/a | 0.664 | 0.695 |
| Reference: linear probe, heads + CLAP + MAEST | n/a | 0.670 | 0.698 |

Loss variants, same architecture, train-CV nDCG@10: BCE 0.664, weighted BCE 0.665, label-smoothed BCE 0.664, asymmetric 0.660, BCE + ListNet 0.654, Hill 0.645, ListNet 0.630. Mixup + noise: 0.668.

Takeaway: nothing beats the linear probe. With ~600 albums the bottleneck is data, not model capacity.

### (d) Learning curve

Models are trained on nested subsets of train (new artists added as the subset grows) and scored on the same 138 val albums. 38-shard snapshot. Source: `results/learning_curve.json`.

| Train albums | Audio probe (MAEST) cP@10 | genre_mean cP@10 | MusicBrainz tag probe cP@10 | most_frequent cP@10 |
|---|---|---|---|---|
| 100 | 0.574 | 0.503 | 0.496 | 0.426 |
| 200 | 0.618 | 0.565 | 0.549 | 0.441 |
| 400 | 0.645 | 0.600 | 0.589 | 0.461 |
| 616 (all audio rows) | 0.664 | 0.625 | 0.599 | 0.461 |
| 800 | n/a | 0.643 | 0.609 | 0.460 |
| 1,600 | n/a | 0.657 | 0.621 | 0.462 |
| 2,869 (all train) | n/a | 0.670 | 0.629 | 0.461 |

Takeaway: audio was still rising at 616 (+0.02 to +0.03 per doubling) and beats genres at equal size. On the 63-shard snapshot, 1,049 albums gave 0.669–0.677 on a different val set. Finishing extraction (~2,700 train albums) should help audio, by an amount this curve cannot pin down.

### (e) MusicBrainz and Deezer tags

Crowd tags fetched from official APIs: MusicBrainz album and artist tags (CC BY-NC-SA **[log]**), Deezer genres. A logistic probe on tag features, fitted on all train rows with metadata (no audio needed). Some MusicBrainz users type RYM descriptors in as tags, so each run is repeated with those tags removed ("no descriptor tags"). Source: `results/fusion_summary.json`.

| Tag set | Features | Train rows | Val n=601 P@10 | Val n=601 nDCG@10 | Val n=138 cP@10 |
|---|---|---|---|---|---|
| MusicBrainz, all tags | 1,265 | 2,733 | 0.530 | 0.667 | 0.634 |
| MusicBrainz, no descriptor tags | 1,104 | 2,733 | 0.523 | 0.660 | 0.629 |
| Deezer genres only | 32 | 2,454 | 0.419 | 0.552 | 0.537 |
| MusicBrainz + Deezer, all tags | 1,295 | 2,805 | 0.533 | 0.668 | 0.643 |
| MusicBrainz + Deezer, no descriptor tags (frozen tag system) | 1,134 | 2,805 | 0.525 | 0.662 | 0.632 |

- Coverage: 578 of 601 val albums (96.2%) have MusicBrainz tags; 584 (97.2%) with Deezer added. Test: 593 of 600.
- 121 of 601 val albums (20.1%) carry a tag literally equal to a descriptor. Removing those tags costs about 0.007 P@10.
- Frozen tag system on all 601 val albums: cP@10 0.638, nDCG@10 0.662. genre_mean on the same rows: 0.653 / 0.679.
- Last.fm and Discogs fetchers are written (`fetch_metadata.py`) but were never run: no API keys.

Takeaway: free crowd tags are about as good as scraped RYM genres, and they exist for almost every album. Deezer genres add almost nothing.

### (f) LLM annotator

A language model is given artist, title and year, and lists 8–15 descriptors from the 120-word vocabulary, ranked, from its own knowledge. No audio, no web access. It also reports how well it knows the album (`known`: 2 = knows it, 1 = knows the artist, 0 = neither). The listed words are scored by rank; unlisted words by train prevalence (`exp_llm.py`). Prompt and examples: `model/llm_prompt/`.

Variants on the same 300 val albums (`results/llm_variants_val.md`, produced by `annotations/compare_variants.py`). The chosen variant's lists for val, 900 train albums and 360 test albums are in `annotations/fable_fewshot200/`; the other variants' lists are only in the git-ignored `cache/llm/out/`.

| Variant | cP@10 | nDCG@10 | mAP | First-3 precision |
|---|---|---|---|---|
| most_frequent | 0.441 | n/a | n/a | n/a |
| Sonnet, zero-shot | 0.698 | 0.726 | 0.417 | 0.814 |
| Opus, zero-shot | 0.740 | 0.758 | 0.457 | 0.821 |
| Sonnet + 50 train examples | 0.745 | 0.762 | 0.433 | 0.846 |
| Opus + 200 train examples | 0.773 | 0.794 | 0.478 | 0.884 |
| **Fable + 200 train examples (chosen)** | **0.794** | **0.811** | **0.521** | **0.892** |
| Fable + 200 examples + MusicBrainz tags in the prompt | 0.792 | 0.807 | 0.513 | 0.876 |

Chosen variant on more data (`results/llm_fable_fewshot200_val.json`, `results/llm_fusion_summary.json`):

| Rows | n | cP@10 | nDCG@10 | mAP | perfect@10 |
|---|---|---|---|---|---|
| All val | 601 | 0.798 | 0.817 | 0.513 | 0.215 |
| Val, known = 2 | 531 | 0.799 | 0.821 | 0.527 | 0.205 |
| Val, known = 1 | 68 | 0.792 | 0.788 | 0.502 | 0.294 |
| Train albums not among the 200 examples | 900 | 0.804 | 0.817 | n/a | n/a |
| Sonnet zero-shot, all val, for contrast | 601 | 0.709 | 0.738 | 0.401 | 0.120 |
| Sonnet zero-shot, known = 0 | 13 | 0.538 | 0.577 | n/a | n/a |

The Fable lists average 13.2 words; the whole list is 0.59 precise, the first three 0.89 (val, n=601).

Takeaway: a stronger model and 200 examples of the site's conventions each add several points. Tags in the prompt add nothing. The LLM beats audio + tags by about 0.11 cP@10 on the same val albums.

Caveats that belong next to every LLM number:
- **Contamination.** The model may have seen RYM's descriptor pages for these albums in training. This is recall of known albums, not a clean held-out test of tagging unseen music. The artist-disjoint split does not protect against it.
- **It cannot work for releases after the model's training cutoff.** Not tested here.
- One annotator batch ran a validation script against its own output despite instructions. It read only the vocabulary and its own output. **[log]**
- Annotation ran through agent sessions, not a production API pipeline. **[log]**

### (g) Fusion

Combines the LLM list with the audio probe and the tag probe. All weights are fitted on train rows using out-of-fold audio and tag scores, and cross-fitted over artist folds. Forms tried (`exp_llm_fusion.py`):
- **F1** weighted blend of the three signals; **F1cp** the same, tuned for cP@10.
- **F2** per-descriptor logistic stacker; **F2r** one global linear regression.
- **F3** the LLM's words always come first, re-ordered by audio and tags; remaining slots filled by audio + tags.
- **F4 / F4s** blend or stacker gated by the `known` flag.

Val, 63-shard snapshot (`results/llm_fusion_summary.json`). Differences are paired, against LLM alone.

| System | Val n | cP@10 | nDCG@10 | mAP | Δ cP@10 vs LLM |
|---|---|---|---|---|---|
| LLM alone | 230 | 0.815 | 0.828 | 0.556 | n/a |
| Audio alone | 230 | 0.677 | 0.704 | 0.427 | −0.138 ±0.012 |
| Tags alone | 230 | 0.635 | 0.653 | 0.381 | −0.180 ±0.014 |
| Audio + tags, stacker (frozen fallback) | 230 | 0.708 | 0.729 | 0.464 | −0.107 ±0.011 |
| LLM + audio, F1 | 230 | 0.817 | 0.830 | 0.642 | +0.002 ±0.002 |
| LLM + tags, F1 | 230 | 0.816 | 0.829 | 0.638 | +0.001 ±0.003 |
| All three, F1 | 230 | 0.818 | 0.830 | 0.638 | +0.002 ±0.002 |
| All three, F2 | 230 | 0.811 | 0.820 | 0.639 | −0.004 ±0.006 |
| All three, F2r | 230 | 0.815 | 0.829 | 0.647 | 0.000 ±0.002 |
| **All three, F3 (frozen full fusion)** | 230 | 0.818 | 0.830 | 0.649 | +0.002 ±0.002 |
| All three, F4 | 230 | 0.818 | 0.830 | 0.638 | +0.002 ±0.002 |
| All three, F4s | 230 | 0.813 | 0.820 | 0.641 | −0.002 ±0.006 |
| LLM alone | 601 | 0.798 | 0.817 | 0.513 | n/a |
| **LLM + tags, F3 (frozen)** | 601 | 0.802 | 0.819 | 0.586 | +0.004 ±0.002 |

- Audio + tags beats audio alone by +0.031 ±0.009 cP@10 (val, n=230).
- Selection rule: best cross-fitted train nDCG@10. F3 won for both LLM routes; the stacker won for audio + tags.

Takeaway: fusion barely moves the top-10 (≤ +0.004 on val). Its real effect is to order the words the LLM did not list: mAP rises from 0.556 to 0.649 and macro AUC from 0.814 to 0.912 (val, n=230). That ordering is what makes precision thresholds possible.

### (h) Calibration and precision–coverage

One global score threshold decides which descriptors to emit. Thresholds are chosen on cross-fitted train scores, either to emit a fixed average count or as the lowest threshold with train precision ≥ 0.9 or ≥ 0.8. Per-descriptor Platt scaling was also tried. Val numbers below; test is in section 5. Sources: `results/llm_fusion_summary.json`, `final_test.md` §3.

| System | Val n | Per album at ≥0.9, all 120 (val precision) | At ≥0.8, all 120 | Per album at ≥0.9, mood 114 | At ≥0.8, mood 114 |
|---|---|---|---|---|---|
| Tags | 601 | 0.82 (0.91) | 2.56 (0.81) | 0.32 (0.88) | 1.19 (0.81) |
| Audio | 230 | 1.45 (0.90) | 3.42 (0.80) | 0.27 (0.93) | 1.46 (0.84) |
| Audio + tags | 230 | 2.01 (0.89) | 4.17 (0.79) | 0.87 (0.92) | 2.50 (0.79) |
| LLM alone | 601 | 2.00 (0.92) | 5.00 (0.82) | 0.63 (0.95) | 2.22 (0.86) |
| LLM + tags, F3 | 601 | 3.18 (0.91) | 5.84 (0.81) | 1.83 (0.91) | 3.94 (0.81) |
| LLM + tags, F1 + per-label Platt | 601 | 3.39 (0.91) | 6.00 (0.81) | not read | not read |
| Full fusion, F3 | 230 | 3.41 (0.91) | 5.97 (0.82) | 2.07 (0.90) | 4.08 (0.82) |
| Full fusion, F1 + per-label Platt | 230 | 4.00 (0.90) | 6.50 (0.81) | 2.46 (0.90) | 4.52 (0.82) |

"Mood 114" drops male vocals, female vocals, androgynous vocals, instrumental, vocal group and concept album.

Takeaway: on val, train-chosen thresholds held their target precision for every system. The LLM's raw list supports 2 words at 0.9; adding tags and audio raises that to 3. Platt scaling gave slightly more words on val but is not in the frozen systems.

### (i) Recommendation quality, noise ceilings, vector construction, hubs

The site recommends the 10 nearest albums by Euclidean distance over 13 audio features and 120 descriptor weights. Here one held-out album at a time gets a predicted descriptor vector; everything else stays real. Its new recommendation list is compared with the list its real descriptors give (`recq.py`).

**How harsh is exact overlap?** Reference points on val, n=136, 38-shard snapshot (`results/recs_summary.json`). First value balanced stop, second mood stop.

| Descriptor vector given to the album | overlap@10 | R@10→50 | RSQ | Inbound ratio |
|---|---|---|---|---|
| Real set and order, train rank weights | 0.97 / 0.95 | 1.00 / 1.00 | 1.00 / 1.00 | 0.98 / 0.98 |
| Real set, order shuffled | 0.91 / 0.81 | 1.00 / 1.00 | 1.00 / 0.99 | 0.92 / 0.94 |
| Real top-10 only | 0.78 / 0.70 | 0.97 / 0.91 | 0.97 / 0.93 | 1.10 / 1.12 |
| Real, 1 word swapped at random | 0.71 / 0.56 | 0.98 / 0.87 | 0.97 / 0.92 | 0.56 / 0.50 |
| Real, 2 swapped at random | 0.56 / 0.35 | 0.93 / 0.69 | 0.94 / 0.83 | 0.32 / 0.27 |
| Real, 3 swapped at random | 0.44 / 0.22 | 0.85 / 0.50 | 0.90 / 0.74 | 0.20 / 0.17 |
| Real, 5 swapped at random | 0.30 / 0.09 | 0.71 / 0.26 | 0.84 / 0.60 | 0.11 / 0.10 |
| Real, 2 swapped for common words | 0.45 / 0.23 | 0.84 / 0.49 | 0.90 / 0.74 | 0.71 / 0.71 |
| Real, 3 swapped for common words | 0.35 / 0.14 | 0.71 / 0.32 | 0.85 / 0.63 | 0.57 / 0.61 |
| All zeros (audio features only) | 0.14 / 0.01 | 0.48 / 0.08 | 0.75 / 0.52 | 3.31 / 5.82 |
| Most-frequent top-10 | 0.10 / 0.01 | 0.31 / 0.04 | 0.65 / 0.26 | 0.70 / 1.62 |
| Random lists | 0.00 / 0.00 | 0.01 / 0.01 | 0.00 / 0.00 | n/a |

- Exact overlap@10 is harsh: one wrong word in ten already costs 29% (balanced) or 44% (mood) of the list.
- The sonic stop is uninformative: an album with no descriptors at all keeps 0.99 of its list (`final_test.md` §5).
- "All zeros" is the real floor. Generic wrong descriptors (most-frequent) are worse than none.

**How to turn scores into a vector.** Audio probe on val, n=136, 38-shard snapshot (`results/recs_summary.json`). 54 policies were tried; the informative ones:

| Policy | RSQ balanced / mood | Inbound ratio balanced / mood |
|---|---|---|
| Top-10, train rank weights (default) | 0.770 / 0.516 | 1.57 / 1.88 |
| Dense (all 120 expected weights) | 0.847 / 0.668 | 12.90 / 19.22 |
| Dense, rescaled to the train median norm | 0.808 / 0.570 | 4.67 / 6.21 |
| Soft top-15 | 0.841 / 0.660 | 8.25 / 10.38 |
| Dense top-10, rescaled to the median norm | 0.806 / 0.596 | 1.70 / 1.66 |
| Snap to similar train albums | 0.743 / 0.468 | 1.01 / 1.16 |
| Asymmetric: dense for the album's own list, snapped vector for what others see | 0.847 / 0.668 | 1.01 / 1.16 |

All systems on val, n=227, 63-shard snapshot (`results/llm_fusion_summary.json`):

| System, policy | RSQ balanced / mood | R@10→50 balanced / mood | Inbound ratio balanced / mood |
|---|---|---|---|
| All zeros | 0.750 / 0.512 | 0.478 / 0.079 | 3.46 / 6.07 |
| most_frequent, top-10 | 0.647 / 0.247 | 0.308 / 0.034 | 0.71 / 1.71 |
| Audio, top-10 | 0.789 / 0.537 | 0.589 / 0.266 | 1.61 / 1.86 |
| Audio, dense top-10 | 0.823 / 0.613 | 0.687 / 0.330 | 1.79 / 1.70 |
| Audio + tags, top-10 | 0.808 / 0.563 | 0.635 / 0.291 | 1.57 / 1.89 |
| LLM, top-10 | 0.870 / 0.701 | 0.781 / 0.495 | 0.95 / 1.04 |
| LLM, its own whole list | 0.862 / 0.685 | 0.745 / 0.496 | 0.67 / 0.68 |
| LLM, soft top-15 | 0.883 / 0.717 | 0.802 / 0.535 | 1.56 / 1.81 |
| Full fusion, top-10 | 0.868 / 0.697 | 0.779 / 0.494 | 1.10 / 1.23 |
| Full fusion, dense top-10 | 0.874 / 0.711 | 0.795 / 0.506 | 1.30 / 1.42 |
| Full fusion, soft top-15 | 0.898 / 0.745 | 0.850 / 0.553 | 3.39 / 4.21 |

Takeaway:
- Dense or smoothed vectors improve the album's own list but make it a hub: other albums recommend it 13–19 times more often than they should. This is the known hubness effect of shrunk predictions (Shigeto et al. 2015 **[log]**).
- The clean fix is asymmetric vectors: one for the album's own list, one for what other albums see. It needs a build change (two vectors per new album).
- With a single vector, the LLM's top-10 with rank weights is hub-neutral and loses little.
- Fusion does not improve recommendations over the LLM alone on val (paired RSQ difference −0.003 ±0.002 balanced).

**Research conclusions used [log].** Audio-LLMs are far below probes on mood tagging (CMI-Bench). Listening and crowd signals beat audio for album moods (Korzeniowski et al. 2020: 0.47 vs 0.32 AP). No source files for these are in this directory.

## 5. Final test results

One run, 2026-10-01 22:21 UTC, of systems frozen beforehand (`results/test/FROZEN.md`, `results/test_invocations.log`). **The test split is now spent.**

Row sets:
- **T360**: the 360 test albums with an LLM list (6 of 10 batches of 60). 4 batches could not be launched; the batches were a random partition, so the 360 are a random sample **[log]**.
- **Taudio**: the 227 test albums with audio at the 63-shard snapshot.
- **T360a**: the 138 with both.

### Ranking metrics (`final_test.md` §1)

| System | Set | n | cP@10 ±SE | P@10 | nDCG@10 ±SE | mAP | Macro AUC | perfect@10 | Val cP@10 (n) | Test − val |
|---|---|---|---|---|---|---|---|---|---|---|
| most_frequent | T360 | 360 | 0.423 ±0.013 | 0.346 | 0.449 ±0.015 | 0.100 | 0.500 | 0.025 | 0.439 (601) | −0.015 |
| most_frequent | Taudio | 227 | 0.443 ±0.013 | 0.372 | 0.479 ±0.014 | 0.106 | 0.500 | 0.018 | 0.441 (230) | +0.002 |
| genre_mean (reference) | T360 | 360 | 0.651 ±0.015 | 0.530 | 0.669 ±0.013 | 0.357 | 0.799 | 0.111 | 0.653 (601) | −0.002 |
| genre_mean (reference) | Taudio | 227 | 0.655 ±0.012 | 0.555 | 0.681 ±0.012 | 0.385 | 0.814 | 0.079 | 0.662 (230) | −0.007 |
| tags | T360 | 360 | 0.641 ±0.014 | 0.522 | 0.657 ±0.013 | 0.345 | 0.783 | 0.108 | 0.638 (601) | +0.003 |
| tags | Taudio | 227 | 0.638 ±0.013 | 0.542 | 0.663 ±0.012 | 0.373 | 0.793 | 0.084 | 0.635 (230) | +0.002 |
| audio | Taudio | 227 | 0.663 ±0.012 | 0.569 | 0.694 ±0.011 | 0.392 | 0.825 | 0.070 | 0.677 (230) | −0.014 |
| audio | T360a | 138 | 0.659 ±0.017 | 0.581 | 0.687 ±0.015 | 0.432 | 0.823 | 0.072 | 0.677 (230) | −0.018 |
| audio + tags | Taudio | 227 | 0.687 ±0.012 | 0.591 | 0.716 ±0.011 | 0.428 | 0.841 | 0.101 | 0.708 (230) | −0.020 |
| audio + tags | T360a | 138 | 0.679 ±0.016 | 0.599 | 0.706 ±0.015 | 0.455 | 0.838 | 0.065 | 0.708 (230) | −0.029 |
| LLM | T360 | 360 | 0.785 ±0.011 | 0.654 | 0.801 ±0.009 | 0.492 | 0.788 | 0.222 | 0.798 (601) | −0.013 |
| LLM | T360a | 138 | 0.768 ±0.016 | 0.682 | 0.793 ±0.014 | 0.519 | 0.782 | 0.188 | 0.815 (230) | −0.047 |
| **LLM + tags, F3** | T360 | 360 | **0.794 ±0.011** | 0.661 | 0.808 ±0.010 | 0.570 | 0.860 | 0.244 | 0.802 (601) | −0.007 |
| LLM + tags, F3 | T360a | 138 | 0.787 ±0.015 | 0.697 | 0.803 ±0.014 | 0.607 | 0.856 | 0.210 | 0.815 (230) | −0.028 |
| **Full fusion, F3** | T360a | 138 | **0.788 ±0.016** | 0.700 | 0.803 ±0.014 | 0.628 | 0.884 | 0.210 | 0.817 (230) | −0.029 |

- Test is 0.01–0.03 below val for most systems, within about two standard errors. The largest drop is the LLM on the 138-album subset (−0.047).
- Removing label-suspect and audio-suspect rows changes nothing by more than 0.005 (`final_test.md` §6).
- The harness's own six `final_test` calls agree (e.g. audio 0.6633, fusion 0.7881).

### Paired differences against LLM alone, same rows (`final_test.md` §1)

| System | Set | Δ cP@10 | Δ nDCG@10 | Δ perfect@10 | Val Δ cP@10 |
|---|---|---|---|---|---|
| most_frequent | T360 | −0.361 ±0.016 | −0.351 ±0.017 | −0.197 ±0.024 | −0.359 ±0.013 |
| genre_mean | T360 | −0.134 ±0.011 | −0.132 ±0.011 | −0.111 ±0.022 | −0.145 ±0.010 |
| tags | T360 | −0.144 ±0.011 | −0.143 ±0.010 | −0.114 ±0.024 | −0.160 ±0.009 |
| audio | T360a | −0.109 ±0.016 | −0.106 ±0.013 | −0.116 ±0.029 | −0.138 ±0.012 |
| audio + tags | T360a | −0.089 ±0.015 | −0.088 ±0.012 | −0.123 ±0.028 | −0.107 ±0.011 |
| LLM + tags, F3 | T360 | +0.010 ±0.003 | +0.008 ±0.002 | +0.022 ±0.011 | +0.004 ±0.002 |
| LLM + tags, F3 | T360a | +0.019 ±0.005 | +0.010 ±0.004 | +0.022 ±0.019 | +0.000 ±0.002 |
| Full fusion, F3 | T360a | +0.020 ±0.004 | +0.010 ±0.004 | +0.022 ±0.016 | +0.002 ±0.002 |

Tags add a small, consistent gain to the LLM (+0.010 on 360 albums). Audio adds nothing measurable beyond tags (+0.020 vs +0.019 on the same 138).

### Precision–coverage, thresholds chosen on train (`final_test.md` §3)

Cells: test precision (descriptors actually emitted per album). Last two columns: descriptors per album at the train threshold for ≥0.9 and ≥0.8, with the precision realised on test, then the val figure.

All 120 descriptors:

| System | Set | ~1 per album | ~3 | ~5 | ~10 | At ≥0.9: test, val | At ≥0.8: test, val |
|---|---|---|---|---|---|---|---|
| tags | T360 | 0.907 (0.9) | 0.780 (3.0) | 0.693 (5.0) | 0.548 (10.0) | 0.73 (0.91), 0.82 (0.91) | 2.47 (0.80), 2.56 (0.81) |
| audio | Taudio | 0.801 (1.4) | 0.774 (3.4) | 0.710 (5.3) | 0.565 (10.4) | 1.82 (0.81), 1.45 (0.90) | 3.66 (0.76), 3.42 (0.80) |
| audio + tags | Taudio | 0.836 (1.3) | 0.811 (3.4) | 0.742 (5.5) | 0.605 (10.4) | 2.17 (0.83), 2.01 (0.89) | 4.30 (0.78), 4.17 (0.79) |
| LLM | T360 | 0.953 (1.0) | 0.856 (3.0) | 0.789 (5.0) | 0.638 (10.9) | 2.00 (0.91), 2.00 (0.92) | 5.00 (0.79), 5.00 (0.82) |
| LLM + tags, F3 | T360 | 0.950 (0.9) | 0.888 (3.0) | 0.819 (4.9) | 0.666 (10.0) | 3.06 (0.89), 3.18 (0.91) | 5.72 (0.79), 5.84 (0.81) |
| Full fusion, F3 | T360a | 0.963 (1.0) | 0.892 (3.1) | 0.843 (4.9) | 0.702 (10.1) | 3.31 (0.88), 3.41 (0.91) | 5.83 (0.82), 5.97 (0.82) |

114 mood descriptors:

| System | Set | ~1 per album | ~3 | ~5 | ~10 | At ≥0.9: test, val | At ≥0.8: test, val |
|---|---|---|---|---|---|---|---|
| tags | T360 | 0.801 (1.0) | 0.707 (3.0) | 0.625 (5.0) | 0.492 (10.1) | 0.25 (0.85), 0.32 (0.88) | 1.11 (0.80), 1.19 (0.81) |
| audio | Taudio | 0.719 (1.3) | 0.693 (3.3) | 0.636 (5.4) | 0.522 (10.3) | 0.61 (0.64), 0.27 (0.93) | 1.67 (0.71), 1.46 (0.84) |
| audio + tags | Taudio | 0.768 (1.3) | 0.748 (3.4) | 0.668 (5.6) | 0.554 (10.3) | 1.08 (0.76), 0.87 (0.92) | 2.55 (0.77), 2.50 (0.79) |
| LLM | T360 | 0.887 (1.4) | 0.787 (3.1) | 0.690 (6.0) | 0.593 (10.6) | 0.58 (0.95), 0.63 (0.95) | 2.26 (0.82), 2.22 (0.86) |
| LLM + tags, F3 | T360 | 0.926 (1.0) | 0.831 (3.0) | 0.749 (4.9) | 0.613 (10.0) | 1.76 (0.88), 1.83 (0.91) | 3.76 (0.79), 3.94 (0.81) |
| Full fusion, F3 | T360a | 0.931 (1.0) | 0.842 (3.0) | 0.787 (4.9) | 0.660 (9.9) | 2.00 (0.87), 2.07 (0.90) | 3.84 (0.82), 4.08 (0.82) |

Precision of the LLM's own first k words, no threshold:

| Set | Labels | k=1 | k=2 | k=3 | k=5 | k=8 | k=10 | Whole list (words) |
|---|---|---|---|---|---|---|---|---|
| T360 | all 120 | 0.953 | 0.907 | 0.856 | 0.789 | 0.700 | 0.655 | 0.597 (13.3) |
| T360 | mood 114 | 0.869 | 0.821 | 0.783 | 0.720 | 0.642 | 0.605 | 0.568 (12.2) |
| Val, n=601 | all 120 | 0.955 | 0.919 | 0.888 | 0.816 | 0.720 | 0.663 | 0.592 (13.2) |
| Val, n=601 | mood 114 | 0.892 | 0.854 | 0.820 | 0.751 | 0.654 | 0.603 | 0.563 (12.0) |

- LLM-based thresholds transferred to test within 0.01–0.03 of target.
- **Audio thresholds did not transfer.** The audio "≥0.9" threshold realised 0.81 on test (0.64 for mood words). Do not attach a precision claim to audio-only output.
- Emitting the train-mean count (~10.7 per album) gives precision 0.648 / recall 0.682 for LLM + tags (T360) and 0.605 / 0.589 for audio + tags (Taudio) (`final_test.md` §4).

### Downstream recommendations (`final_test.md` §5)

Test albums' descriptors are replaced by predictions; the rest of the catalogue stays real. overlap@10 and inbound totals are with all evaluated albums replaced at once. RSQ, R@10→50, the inbound ratio and genre agreement are per album, one at a time. `*` marks the policy chosen on train for that system.

**Sonic stop.** Every system scores 0.985–0.992 overlap@10. So does an album with no descriptors (0.987). Inbound totals barely move (3,396 → 3,397 to 3,464 on T360). This stop says nothing about descriptors.

**Balanced stop.**

| System, policy | Set | n | overlap@10 | Inbound total, before → after | Per album | RSQ | R@10→50 | Inbound ratio | Genre |
|---|---|---|---|---|---|---|---|---|---|
| Real descriptors, train rank weights (ceiling) | T360 | 358 | 0.967 | 3,412 → 3,402 | 9.53 → 9.50 | 1.000 | 1.000 | 1.00 | 0.501 |
| All zeros (floor) | T360 | 358 | 0.090 | 3,412 → 7,834 | 9.53 → 21.88 | 0.758 | 0.484 | 3.66 | 0.235 |
| most_frequent, top-10* | T360 | 358 | 0.067 | 3,412 → 4,397 | 9.53 → 12.28 | 0.634 | 0.280 | 0.74 | 0.202 |
| genre_mean, top-10* | T360 | 358 | 0.172 | 3,412 → 6,106 | 9.53 → 17.06 | 0.767 | 0.546 | 1.58 | 0.534 |
| tags, top-10* | T360 | 358 | 0.197 | 3,412 → 4,958 | 9.53 → 13.85 | 0.769 | 0.546 | 1.28 | 0.471 |
| audio, top-10 | Taudio | 227 | 0.222 | 2,065 → 3,756 | 9.10 → 16.55 | 0.788 | 0.582 | 1.78 | 0.461 |
| audio, dense top-10* | Taudio | 227 | 0.219 | 2,065 → 4,434 | 9.10 → 19.53 | 0.823 | 0.669 | 1.94 | 0.446 |
| audio + tags, top-10* | Taudio | 227 | 0.248 | 2,065 → 3,687 | 9.10 → 16.24 | 0.803 | 0.611 | 1.76 | 0.501 |
| LLM, top-10* | T360 | 358 | 0.343 | 3,412 → 3,373 | 9.53 → 9.42 | 0.853 | 0.733 | 0.94 | 0.496 |
| LLM + tags F3, top-10* | T360 | 358 | 0.341 | 3,412 → 3,713 | 9.53 → 10.37 | 0.854 | 0.738 | 1.05 | 0.510 |
| Full fusion F3, top-10 | T360a | 138 | 0.352 | 1,187 → 1,470 | 8.60 → 10.65 | 0.865 | 0.765 | 1.23 | 0.501 |
| Full fusion F3, dense top-10* | T360a | 138 | 0.338 | 1,187 → 1,718 | 8.60 → 12.45 | 0.865 | 0.764 | 1.41 | 0.493 |

**Mood stop.**

| System, policy | Set | n | overlap@10 | Inbound total, before → after | Per album | RSQ | R@10→50 | Inbound ratio | Genre |
|---|---|---|---|---|---|---|---|---|---|
| Real descriptors, train rank weights (ceiling) | T360 | 358 | 0.945 | 3,341 → 3,291 | 9.33 → 9.19 | 0.999 | 1.000 | 0.98 | 0.459 |
| All zeros (floor) | T360 | 358 | 0.020 | 3,341 → 4,015 | 9.33 → 11.22 | 0.506 | 0.095 | 6.88 | 0.023 |
| most_frequent, top-10* | T360 | 358 | 0.020 | 3,341 → 3,689 | 9.33 → 10.30 | 0.229 | 0.025 | 1.93 | 0.092 |
| genre_mean, top-10* | T360 | 358 | 0.073 | 3,341 → 7,013 | 9.33 → 19.59 | 0.505 | 0.223 | 2.46 | 0.550 |
| tags, top-10* | T360 | 358 | 0.072 | 3,341 → 6,192 | 9.33 → 17.30 | 0.495 | 0.203 | 1.85 | 0.456 |
| audio, top-10 | Taudio | 227 | 0.078 | 1,990 → 4,185 | 8.77 → 18.44 | 0.552 | 0.281 | 2.09 | 0.450 |
| audio, dense top-10* | Taudio | 227 | 0.068 | 1,990 → 4,577 | 8.77 → 20.16 | 0.601 | 0.322 | 1.96 | 0.437 |
| audio + tags, top-10* | Taudio | 227 | 0.098 | 1,990 → 4,320 | 8.77 → 19.03 | 0.579 | 0.311 | 2.16 | 0.512 |
| LLM, top-10* | T360 | 358 | 0.177 | 3,341 → 3,742 | 9.33 → 10.45 | 0.665 | 0.441 | 1.08 | 0.470 |
| LLM + tags F3, top-10* | T360 | 358 | 0.180 | 3,341 → 4,226 | 9.33 → 11.80 | 0.669 | 0.447 | 1.24 | 0.483 |
| Full fusion F3, top-10 | T360a | 138 | 0.193 | 1,067 → 1,525 | 7.73 → 11.05 | 0.697 | 0.484 | 1.40 | 0.478 |
| Full fusion F3, dense top-10* | T360a | 138 | 0.186 | 1,067 → 1,764 | 7.73 → 12.78 | 0.705 | 0.499 | 1.62 | 0.472 |

- LLM-based lists are the only ones clearly above the no-descriptor floor at both stops, and the only ones that do not create hubs.
- Audio and tag systems roughly double the inbound count of the albums they describe.
- The dense top-10 policy chosen on train for the full fusion was not hub-safe on test (1.41 / 1.62). Plain top-10 gives the same RSQ with less inflation (1.23 / 1.40).
- n is 358, not 360: two rows are not the first of their Spotify URI and are not in the site catalogue.

### Best and worst descriptors by AUC (`final_test.md` §2)

Positives in the set are in brackets. Many extreme values rest on 1–5 albums.

| System (set) | Best | Worst |
|---|---|---|
| audio (Taudio, macro 0.825) | chamber music 1.000 (2), sparse 0.988 (6), mechanical 0.986 (7), instrumental 0.980 (24), sampling 0.963 (24), acoustic 0.955 (23) | desert 0.398 (2), androgynous vocals 0.545 (3), spiritual 0.608 (24), passionate 0.664 (86), summer 0.667 (15), concept album 0.700 (25) |
| LLM + tags F3 (T360, macro 0.860) | instrumental 0.995 (60), infernal 0.981 (11), medieval 0.976 (17), futuristic 0.971 (27), dissonant 0.966 (27) | medley 0.047 (1), fairy tale 0.370 (1), nocturnal 0.729 (67), passionate 0.744 (119), autumn 0.750 (27), soothing 0.757 (26) |
| Full fusion F3 (T360a, macro 0.884) | sparse 0.996 (4), sampling 0.994 (16), futuristic 0.994 (8), instrumental 0.991 (16) | medley 0.044 (1), skit 0.212 (1), passionate 0.736 (54), nocturnal 0.746 (24), longing 0.746 (19), sombre 0.758 (23), melodic 0.763 (72) |

Concrete, audible traits are easy. Vague, very common mood words (passionate, nocturnal, melodic) are the weak spot for every system. The LLM alone has macro AUC 0.788 only because all its unlisted words tie.

### Breakdowns on the 360 LLM-annotated test rows (`final_test.md` §7)

| Group | n | LLM cP@10 ±SE | LLM + tags cP@10 | Tags cP@10 | Val: n / LLM cP@10 |
|---|---|---|---|---|---|
| known = 2 | 321 | 0.789 ±0.011 | 0.799 | 0.643 | 531 / 0.799 |
| known < 2 | 39 | 0.754 ±0.042 | 0.754 | 0.622 | 70 / 0.789 |
| Chart quartile 1 (lowest row index) | 90 | 0.807 ±0.016 | 0.822 | 0.632 | 151 / 0.845 |
| Chart quartile 2 | 90 | 0.802 ±0.019 | 0.807 | 0.676 | 150 / 0.780 |
| Chart quartile 3 | 90 | 0.789 ±0.019 | 0.797 | 0.621 | 150 / 0.785 |
| Chart quartile 4 (highest row index) | 90 | 0.741 ±0.024 | 0.752 | 0.633 | 150 / 0.782 |
| Year ≤ 1979 | 115 | 0.770 ±0.016 | 0.781 | 0.664 | 198 / 0.777 |
| Year 1980–1999 | 129 | 0.789 ±0.016 | 0.795 | 0.634 | 224 / 0.806 |
| Year 2000–2014 | 78 | 0.803 ±0.027 | 0.816 | 0.660 | 129 / 0.809 |
| Year 2015+ | 22 | 0.820 ±0.031 | 0.838 | 0.617 | 31 / 0.860 |
| Year unknown | 16 | 0.719 ±0.039 | 0.719 | 0.465 | 19 / 0.750 |

- The LLM is weaker on albums further down the table (0.741 in the last quartile) and where it reports less familiarity, but still well above tags.
- Recent albums in the data are not worse. None of them postdates the model's cutoff, so this says nothing about truly new releases.
- Only 1 test album and 2 val albums have known = 0.

## 6. Recommended pipeline for new albums

**Routing.**

1. Ask the LLM for a ranked list of 8–15 descriptors, using `model/llm_prompt/instructions_fewshot200.md`, its 200 examples and `vocab.json`. One call per album (or one per batch; batches of 60 were used here).
2. Fetch MusicBrainz and Deezer tags (`fetch_metadata.py`).
3. If a preview exists and embeddings are extracted, pass them too. This is optional: audio added nothing measurable on test once the LLM list and tags were present.
4. Call `predict.py`:
   - `predict_weights(llm_descriptors=[...], tags=tags, policy="top10")`: LLM + tags, the main route.
   - `predict_weights(llm_descriptors=[...], embedding_row=row, tags=tags, policy="top10")`: full fusion.
   - `predict_weights(embedding_row=row, tags=tags)`: fallback, audio + tags.
5. **Fall back to audio + tags** when the album was released after the LLM's training cutoff, or the LLM reports known = 0. Expect cP@10 ≈ 0.69 instead of ≈ 0.79, and a mild hub effect (inbound ×1.8–2.2). The known = 0 rule rests on thin evidence: 13 Sonnet val albums at 0.538.

**Vector policy.** Use the top 10 scores with train rank weights (`policy="top10"`). It is hub-neutral for the LLM routes on test. Note that `predict.py`'s `"default"` picks dense top-10 for the full fusion and for audio alone. On test that inflated inbound counts for the fusion (1.41 / 1.62) with no RSQ gain, so pass `"top10"` explicitly for LLM routes. For audio alone, dense top-10 did raise RSQ (0.788 → 0.823 balanced) at similar hub cost.

**If only high-confidence words are wanted.** LLM + tags at the frozen ≥0.9 threshold emits about 3 descriptors per album at 0.89 precision. Thresholds are in `model/fusion.json`.

**What needs a build change.**
- Asymmetric vectors (one for the album's own list, one for inbound). The only policy that gave dense-level list quality without hubs. Val only; not in the frozen test.
- Wiring `predict.py` into the data pipeline. Not done here. It returns a 120-vector in the table's column order.

**Costs.**
- LLM: one call per album. The prompt carries 200 example albums (~40 KB).
- MusicBrainz: hard limit of 1 request per second, about 3 requests per album. The full 4,116-row fetch took 103 minutes (`cache/musicbrainz.log`).
- Preview extraction: about 13 s per album in the gentle configuration (`cache/extract.log`).

**Not covered.** The 13 audio-feature columns of a new album are a separate problem (sibling experiment `experiments/preview_features/`, on branch `experiment/preview-features`; not present in this worktree).

## 7. Limitations and open questions

1. **Contamination of the LLM result.** The headline numbers may be memory of RYM pages. Proper tests:
   - Annotate albums released after the model's training cutoff and score them against RYM lists scraped later.
   - A blind human audit of the "wrong" predictions. Crowd lists have missing positives, so some misses are probably correct.
2. **Partial extraction.** Audio models trained on 1,049 albums, not ~2,700. The learning curve was still rising. The audio and fusion numbers understate what audio can do, by an unknown amount.
3. **Partial test.** 360 of 600 test albums have LLM lists; 138 have all three inputs. The test split is spent, so the remaining 240 cannot serve as a clean test for these systems.
4. **Fusion gain is small and unevenly measured.** +0.002 on val, +0.020 on test (n=138). Treat it as "no harm, maybe a little help".
5. **Band-membership leaks.** About 40 member/band pairs straddle splits **[log]**. Mildly optimistic for audio and tag systems.
6. **Label errors.** 43 copied label vectors, 34 colliding URIs, 88 doubtful Spotify matches. No same-album agreement ceiling exists, so "how good is perfect" is unknown.
7. **Audio thresholds did not transfer to test** (target 0.9, realised 0.81; mood 0.64). The train-chosen dense policy for the fusion was not hub-safe on test either.
8. **Mood stop is far from good.** RSQ 0.67–0.70 against a floor of 0.51. The mood slider end depends on exactly the vague words every system gets wrong.
9. **Not evaluated.** MERT-v2 (192 albums extracted, then dropped) **[log]**. AllMusicCaps **[log]**. Last.fm and Discogs tags (fetchers written, no API keys). Asymmetric vectors and Platt-scaled thresholds on test.
10. **Process.** One annotator batch broke its instructions (harmlessly). Annotation ran through agent sessions; a production API pipeline may behave differently. **[log]**
11. **Bar set post hoc.** The "good enough" thresholds in section 2 were written after the results.

## 8. Reproducing

Run everything from `experiments/descriptor_model/`.

**Environments** (arm64; never the system `python3`):

```bash
uv venv --python 3.13 .venv       && uv pip install --python .venv/bin/python       -r requirements.txt
uv venv --python 3.12 .venv-audio && uv pip install --python .venv-audio/bin/python -r requirements-audio.txt
uv venv --python 3.13 .venv-meta  && uv pip install --python .venv-meta/bin/python  -r requirements-meta.txt
```

**Commands, in order:**

```bash
# 0. Checks
.venv/bin/python split.py --check        # verifies splits.json
.venv/bin/python weights.py              # verifies the rank-weight formula
.venv/bin/python ceiling.py              # label-agreement evidence, arithmetic ceilings
.venv/bin/python -m pytest -q

# 1. Match albums to Deezer / iTunes previews -> cache/matches.parquet
.venv-audio/bin/python match_previews.py

# 2. Extract embeddings (resumable; ~8 h remain for the 2,244 albums not yet done)
./run_extraction_gentle.sh
.venv-audio/bin/python extract_embeddings.py --finalize

# 3. Metadata
.venv-meta/bin/python fetch_metadata.py musicbrainz --shuffle
.venv-meta/bin/python fetch_metadata.py deezer-genres

# 4. Interim audio experiments (38-shard snapshot)
P="DESCRIPTOR_SHARD_LIMIT=38 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 nice -n 10 .venv/bin/python"
$P run_reference.py
$P exp_linear.py all                     # layers, pooling, targets, concat, knn, late
$P exp_mlp.py search && $P exp_mlp.py final && $P exp_mlp.py attn
$P exp_fusion.py meta                    # tag probes
$P exp_curve.py                          # learning curve
$P exp_recs.py                           # reference points, vector policies

# 5. LLM annotation: agent sessions follow model/llm_prompt/instructions_fewshot200.md
#    on cache/llm/batches/*.json and write cache/llm/out/<variant>/*.json
.venv/bin/python exp_llm.py --model fable_fewshot200 --register

# 6. Fusion (63-shard snapshot)
P="DESCRIPTOR_SHARD_LIMIT=63 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 nice -n 19 .venv/bin/python"
$P exp_llm_fusion.py audio && $P exp_llm_fusion.py meta && $P exp_llm_fusion.py fuse && $P exp_llm_fusion.py recs

# 7. Final evaluation
$P final_eval.py freeze                        # no test access; writes FROZEN.md
DESCRIPTOR_FINAL_TEST=1 $P final_eval.py test  # ALREADY RUN ONCE. Do not rerun.
$P final_eval.py report                        # rebuilds final_test.md from the JSON files

# 8. Prediction
.venv/bin/python predict.py --export     # copies the frozen fits from cache/ to model/
.venv/bin/python predict.py --row 123    # predicted next to true for one table row
```

**Environment notes.**
- Network hosts: `api.deezer.com`, `itunes.apple.com` and the preview URLs they return; `musicbrainz.org`; `huggingface.co` (MAEST, MERT, CLAP weights); `essentia.upf.edu` (EffNet and head models). `ws.audioscrobbler.com` and `api.discogs.com` only if the unused fetchers are run (need `LASTFM_API_KEY`, `DISCOGS_TOKEN`).
- Do not run the extraction alongside other heavy jobs. It needs about 7.5 GB of the laptop's 16 GB. The gentle script pauses on low memory, thermal throttling or low battery.
- Audio is never written to disk. Previews are decoded in memory and dropped.
- `cache/` is git-ignored. The LLM annotations, embeddings, fetched tags and fitted model live there; `model/` holds the exported copy that `predict.py` needs.
- Re-running on a different shard count changes the audio numbers. Pin `DESCRIPTOR_SHARD_LIMIT` to compare.

**File map.**

| Path | What it is |
|---|---|
| `common.py`, `weights.py`, `split.py`, `splits.json` | Data access, rank weights, the split |
| `metrics.py`, `harness.py`, `EXPERIMENTS.md` | Metrics, the shared evaluation harness and its rules |
| `downstream.py`, `recq.py` | Recommendation overlap and recommendation-quality metrics |
| `match_previews.py`, `extract_embeddings.py`, `run_extraction_gentle.sh`, `features.py` | Preview matching, embedding extraction, feature matrices |
| `fetch_metadata.py`, `meta_features.py` | Tag fetchers and tag features |
| `baselines.py`, `probes.py`, `run_reference.py`, `ceiling.py` | Baselines, the linear probe, reference runs, label ceilings |
| `exp_linear.py`, `exp_mlp.py`, `exp_curve.py`, `exp_fusion.py`, `exp_recs.py` | Interim experiment arms |
| `exp_llm.py`, `exp_llm_fusion.py` | LLM scoring and the three-way fusion |
| `final_eval.py`, `predict.py`, `model/` | Frozen test evaluation, the predictor, its artefacts and the LLM prompt |
| `results/val/*.json`, `results/val_leaderboard.csv` | One file and one row per validation run |
| `results/linear_summary.json`, `mlp_summary.json`, `learning_curve.json`, `fusion_summary.json`, `recs_summary.json` | Interim summaries (38-shard snapshot) |
| `results/llm_*_val.json`, `results/llm_fusion_summary.json` | LLM annotator and fusion on validation (63-shard snapshot) |
| `annotations/fable_fewshot200/`, `results/llm_variants_val.md` | The chosen annotator's descriptor lists (val, train, test) and the variant comparison |
| `results/test/FROZEN.md`, `final_test.md`, `final_test.json`, `val_reference.json`, `results/test_invocations.log` | The frozen systems and the single test run |
