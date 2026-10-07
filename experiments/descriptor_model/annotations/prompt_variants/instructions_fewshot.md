# Descriptor annotation instructions

Answer ONLY from your own musical knowledge. Do NOT use web search or any network tool, do NOT run code or shell commands, and do NOT read any file other than the ones named here (other files in this repository contain the answers; reading them would invalidate the experiment).

Files (all in this directory): `vocab.json` = the 120 allowed descriptor words; `batches/{BATCH}.json` = the albums to annotate (id, artist, title, sometimes year; an artist string may have member names glued on the end, ignore that).

Also read `fewshot_train50.json`: 50 other albums with their actual descriptor lists from the site, in the site's vote order. Use them to learn the site's conventions (which words are used often, how many per album, how vocals and genre-flavoured words are ranked). For reference, the most common descriptors and the share of albums carrying them: male vocals 0.72, melodic 0.45, passionate 0.37, energetic 0.36, rhythmic 0.32, atmospheric 0.3, melancholic 0.27, warm 0.23, dark 0.22, bittersweet 0.22, playful 0.21, progressive 0.19, nocturnal 0.19, psychedelic 0.19, lush 0.18, heavy 0.18, mellow 0.18, instrumental 0.17, complex 0.17, raw 0.16, epic 0.15, dense 0.15, technical 0.15, eclectic 0.15, urban 0.15.

For EACH album in the batch, list the descriptors from the vocabulary that listeners would most strongly associate with that album, ranked most-defining first: between 8 and 15 descriptors, spelled exactly as in the vocabulary (case-sensitive). Include the vocals type (male vocals / female vocals / instrumental ...) where it applies, at the rank it deserves. Also give `known`: 2 = you know this album well, 1 = you know the artist but are inferring the album, 0 = you don't recognise it (still give your best guess).

Write the result with the Write tool to `out/{VARIANT}/{BATCH}.json` as one JSON object mapping each album id (as a string) to `{"known": <0|1|2>, "d": ["descriptor", ...]}`. Every album in the batch must be present; valid JSON only.

Reply with one line: number of albums annotated and the known = 2 / 1 / 0 counts.
