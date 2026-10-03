# Frozen systems for the single test evaluation

Written 2026-10-01 18:21:11 by `final_eval.py freeze`, BEFORE any test row was read. Nothing below may be re-fitted, re-selected or re-tuned after the test numbers exist.

Snapshot: `DESCRIPTOR_SHARD_LIMIT=63` (63 shards). All fitting on TRAIN (cross-fit / out-of-fold); selection by cross-fitted train nDCG@10; validation only reported.

## Files (sha256, first 16 hex)

- `cache/models/llm_fusion63.pkl`: `c288305406b3f5b0`
- `cache/llm_fusion/audio_heads+clap+maest-1-12.npz`: `5f1247ab5aa2dc2d`
- `cache/llm_fusion/meta.npz`: `de9dfc25dbe19a51`
- `cache/llm_fusion/frozen_train_scores.npz`: `8004b61b7560165c`
- `exp_llm_fusion.py`: `d071a657a077d813`
- `final_eval.py`: `45249f0d1707d104`

## Systems

| system | definition | fitted parameters | evaluated on |
|---|---|---|---|
| most_frequent | train prevalence (all 2,869 train rows, label-suspects dropped) | - | L, A |
| genre_mean | `baselines.genre_mean_scores`, all listed RYM genres, shrinkage m=5, full train (REFERENCE ONLY: scraped genres) | - | L, A |
| tags | `meta63__mb+dz_nodesc`: logistic probe on MusicBrainz + Deezer tags, descriptor-literal tags dropped | C=0.003, transform `s`, 1134 features, 2805 train rows | L, A |
| audio | `audio63__heads+clap+maest-1-12`: logistic probe on z-scored `heads+clap+maest:1-12` (mean pooling) | C=0.001, 1049 train rows | A, LA |
| audio+tags | fallback `stack` (global logistic stacker on z(audio logit), z(tag logit), prior logit, 1) | W = [1.7415, 0.9958, -0.5196, -3.7962], 1049 train rows | A, LA |
| llm | `fable_fewshot200` annotations, score 2 - 0.05 x list position, unlisted words by train prevalence | none | L, LA |
| llm+tags_F3 | `F3`: LLM words first, re-ordered by rs + c x z(tag logit); rest filled by z(tag logit) | c=0.15, 900 train rows | L (, LA) |
| fusion_F3 | `fusion63__best` = `F3`: LLM words first, re-ordered by rs + b x z(audio logit) + c x z(tag logit); rest filled by z(audio) + cf x z(tags) | b=0.08, c=0.08, cf=0.5, 634 train rows | LA |

Normalisation constants (train OOF): audio logit mean -3.6956 sd 2.1976; tag logit mean -3.7839 sd 2.2383.

Row sets: L = rows with an LLM annotation (test: the 360 annotated rows, 6 of 10 random batches); A = rows with audio features at this snapshot; LA = both.

## Thresholds and policies (all from TRAIN)

- Precision-coverage thresholds: `exp_llm_fusion.honest_pc` on the train scores stored in `frozen_train_scores.npz` (count-matched for ~1, 2, 3, 5, 8, 10 per album; lowest threshold with train precision >= 0.9 / 0.8, min 25 % of albums x 1 emitted). genre_mean has no out-of-fold train scores: no threshold tables for it.
- Calibrated-count set: global threshold giving the train mean count (10.727) on the same train scores: most_frequent 0.2091, tags 0.2717, audio 0.2930, audio+tags 0.3074, llm 1.5000, llm+tags_F3 1000.4512, fusion_F3 1000.4716.
- Recommender vector policies (hub-ok choice on train, `exp_llm_fusion.py recs`): llm -> top-10 (default); fusion_F3 -> dense top-10 -> train median L2; audio -> dense top-10 -> train median L2; audio+tags -> top-10 (default); every system is also reported with plain top-10 rank weights. Dense top-10 = top 10 of p x mean train weight, scaled to the train median L2 norm 4.3509; p = the audio probe's probability, or the fusion's stored Platt map {"split": 500.0, "hi": {"prob": false, "mu": 1000.8075136334018, "sd": 0.3403990064448551, "a": 1.008685652366658, "b": 0.5317486535619683}, "lo": {"prob": false, "mu": -0.26578302312781354, "sd": 1.2720324582521245, "a": 1.8213363638498572, "b": -4.7757297441047575}}.

## Validation numbers these systems were selected / reported with (this script's val pass; full detail in `val_reference.json`)

| system | set | n | cP@10 | P@10 | R@10 | nDCG@10 | mAP | macro AUC | perfect@10 |
|---|---|---|---|---|---|---|---|---|---|
| most_frequent | L | 601 | 0.4385 | 0.3557 | 0.3789 | 0.4694 | 0.0959 | 0.5000 | 0.0283 |
| most_frequent | A | 230 | 0.4409 | 0.3522 | 0.3792 | 0.4736 | 0.1013 | 0.5000 | 0.0304 |
| genre_mean | L | 601 | 0.6529 | 0.5339 | 0.5613 | 0.6789 | 0.3723 | 0.8047 | 0.0849 |
| genre_mean | A | 230 | 0.6620 | 0.5365 | 0.5634 | 0.6807 | 0.4270 | 0.8208 | 0.0826 |
| tags | L | 601 | 0.6376 | 0.5256 | 0.5464 | 0.6621 | 0.3450 | 0.8064 | 0.0865 |
| tags | A | 230 | 0.6353 | 0.5165 | 0.5400 | 0.6533 | 0.3809 | 0.7999 | 0.0826 |
| audio | A | 230 | 0.6770 | 0.5483 | 0.5766 | 0.7041 | 0.4268 | 0.8483 | 0.0957 |
| audio | LA | 230 | 0.6770 | 0.5483 | 0.5766 | 0.7041 | 0.4268 | 0.8483 | 0.0957 |
| audio+tags | A | 230 | 0.7078 | 0.5735 | 0.6021 | 0.7291 | 0.4635 | 0.8601 | 0.1087 |
| audio+tags | LA | 230 | 0.7078 | 0.5735 | 0.6021 | 0.7291 | 0.4635 | 0.8601 | 0.1087 |
| llm | L | 601 | 0.7980 | 0.6626 | 0.6805 | 0.8166 | 0.5128 | 0.7974 | 0.2146 |
| llm | LA | 230 | 0.8152 | 0.6704 | 0.6877 | 0.8278 | 0.5561 | 0.8144 | 0.2783 |
| llm+tags_F3 | L | 601 | 0.8016 | 0.6651 | 0.6843 | 0.8190 | 0.5859 | 0.8840 | 0.2280 |
| llm+tags_F3 | LA | 230 | 0.8153 | 0.6709 | 0.6884 | 0.8295 | 0.6379 | 0.8853 | 0.2783 |
| fusion_F3 | LA | 230 | 0.8175 | 0.6730 | 0.6898 | 0.8305 | 0.6487 | 0.9116 | 0.2783 |

Val sets: {'n_labelled': 601, 'n_L': 601, 'n_A': 230, 'n_LA': 230, 'n_canonical_with_audio': 230, 'n_canonical_without_probe_features': 0, 'n_with_tags': 584, 'n_without_genre': 1, 'known_L': {'0': 2, '1': 68, '2': 531}}

Selection record (`results/llm_fusion_summary.json`): `{"lam": "F3", "lm": "F3", "am": "stack", "audio_key": "heads+clap+maest-1-12", "lams": {"lam": null, "lm": 10.0, "am": null}, "rule": "best cross-fitted TRAIN nDCG@10 (ties: cP@10) among F1, F1cp, F2, F2r, F3, F4, F4s (audio+tags: blend, stack)"}`

Reproduction checks of this pipeline against the stored val scores (max abs difference): `{"audio vs saved val scores": 3.5597659708841434e-08, "tags vs saved val scores": 2.979869151431558e-08, "fusion_F3 vs registered fusion63__best": 3.0503997209052613e-05, "llm vs registered run": 4.768371586472142e-08}`

## Test protocol

One run of `DESCRIPTOR_FINAL_TEST=1 final_eval.py test`: one `harness.TestAccess`, a line for the script in `results/test_invocations.log`, then one `harness.final_test` call for each registered run (`baseline__most_frequent_fulltrain`, `baseline__genre_mean_all_fulltrain`, `meta63__mb+dz_nodesc`, `audio63__heads+clap+maest-1-12`, `llm__fable_fewshot200_knowledge`, `fusion63__best`). If anything fails, stop and report; no fix-and-rerun.
