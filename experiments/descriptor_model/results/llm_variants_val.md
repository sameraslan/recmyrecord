# Annotator variants on the same validation albums

```
paired on 300 albums; most_frequent cP@10 0.441
  sonnet             n_albums 601 unk  0 | cP@10 0.698 P@10 0.583 nDCG@10 0.726 mAP 0.417 perfect 0.103 | listed 11.3 set-prec 0.559 first3 0.814 first5 0.736
  sonnet_fewshot     n_albums 300 unk  0 | cP@10 0.745 P@10 0.621 nDCG@10 0.762 mAP 0.433 perfect 0.137 | listed 12.3 set-prec 0.565 first3 0.846 first5 0.771
  opus_zeroshot      n_albums 300 unk  0 | cP@10 0.740 P@10 0.615 nDCG@10 0.758 mAP 0.457 perfect 0.143 | listed 11.6 set-prec 0.584 first3 0.821 first5 0.759
  opus_fewshot200    n_albums 300 unk  0 | cP@10 0.773 P@10 0.645 nDCG@10 0.794 mAP 0.478 perfect 0.177 | listed 12.7 set-prec 0.586 first3 0.884 first5 0.797
  fable_fewshot200   n_albums 601 unk  0 | cP@10 0.794 P@10 0.661 nDCG@10 0.811 mAP 0.521 perfect 0.200 | listed 13.2 set-prec 0.586 first3 0.892 first5 0.813
  fable_fewshot200_mb n_albums 300 unk  0 | cP@10 0.792 P@10 0.659 nDCG@10 0.807 mAP 0.513 perfect 0.207 | listed 13.3 set-prec 0.584 first3 0.876 first5 0.807
  ENSEMBLE(mean)                  | cP@10 0.787 P@10 0.655 nDCG@10 0.801 mAP 0.585 perfect 0.173
```

## Added 2026-10-01, after the test run: per-descriptor notes in the prompt

Same 300 validation albums. "Notes" = for each descriptor, its share of training albums, the descriptors it
most often appears with, and five well-known training albums where it ranks near the top
(`annotations/prompt_variants/descriptor_notes_train.json`; built from training rows only).

| Prompt (Fable, 200 examples) | cP@10 | P@10 | nDCG@10 | mAP | perfect@10 | first 1 / 3 / 5 precise |
|---|---|---|---|---|---|---|
| Plain (chosen) | 0.794 | 0.661 | 0.811 | 0.521 | 0.200 | 0.950 / 0.892 / 0.813 |
| Plus per-descriptor notes | 0.791 | 0.658 | 0.809 | 0.517 | 0.187 | 0.943 / 0.884 / 0.816 |

Paired difference in cP@10 (notes minus plain): -0.003 +/- 0.004 (bootstrap over albums, not artist groups).
No gain. RYM's own written descriptor definitions were not tried (the site was never fetched).
