# Descriptor predictor artefacts (frozen; see ../results/test/FROZEN.md)

- `descriptor_model.npz` (float32): audio probe (mean, scale, W, b), tag probe (feature names, gain, W, b, prevalence), train prevalence, rank weights, mean weight per descriptor, descriptor names.
- `fusion.json`: fusion parameters (LLM+audio+tags, LLM+tags, audio+tags), score maps, policies, thresholds, banned tag names.
- `llm_prompt/`: the annotator instructions, the 200 TRAIN-split example albums with their descriptor lists, the vocabulary. Each batch of albums (id, artist, title, year) was annotated by a language model following `instructions_fewshot200.md`.
- Used by `../predict.py`; rebuilt from `cache/` by `python predict.py --export` (copies only, nothing is fitted).
