# Top 8 descriptors: what the cut does to existing albums, and equal against rank weights

6 October 2026. Branch `feat/audio-10k`. For issue #40 and the open detail in `docs/10k-site-handoff.md`. A measurement only: nothing in the pipeline or the site data was changed. Full tables: `results/top8.md`.

## 1. Verdict

- **Today's weights are rank weights.** A cell of the feature table is `1.5 - r/42`, with `r` the descriptor's 0-based place on the album's RYM page in the 2022 scrape (`data-retrieval/Recommender/getDescriptors.py` lines 104 and 118 to 126). First descriptor 1.5, each next one 1/42 less, 0 when absent. There is no further normalisation and `Descriptor Count` is not used in the value. The page order of every existing album can be read back from the table exactly.
- **The cut itself moves the mood lists far more than the weighting does.** Keeping today's weights and only cutting to the first 8, an album keeps 3.6 of its 10 mood recommendations, 5.2 at balanced and 9.9 at sonic. 5.5% of mood lists are unchanged.
- **Equal or by rank changes less than the cut.** With the same 8 descriptors, equal weights keep 3.4 of 10 at mood, a gentle slope (1 down to 0.5) 3.3, a steep one (8 down to 1) 2.3.
- **The steep slope is the worst on every proxy.** It is not a candidate.
- **Equal and a gentle slope split the proxies.** Equal is ahead at the mood stop (`genre_primary` 0.196 against 0.172 on the sheet's lists, today 0.173). The gentle slope is ahead at balanced (0.298 against 0.288), has fewer hubs, and agrees more with itself when the same album is read twice (2022 page against 2026 sheet: 3.8 of 10 kept against 3.5).
- **Why equal wins at mood: ties.** With equal weights, 93% of albums have their 10th and 11th nearest album equally far in the descriptor columns (12% today). The audio block then picks among them. So the equal-weight mood stop is "most shared words, then closest in sound".
- **A second difference, larger than the weights.** The sheet the new albums come from never lists vocals descriptors and uses four newer names. 2,772 existing albums have a vocals descriptor in their first 8 in the table. If existing albums are cut from the table and new ones come from the sheet, the two groups are not described the same way. Using the sheet's list for the 3,613 existing albums that have one keeps 2.0 of 10 at mood.
- **Main caveat.** Every quality number is an RYM-based proxy on the whole set. No held-out split, nobody listened. "Kept of 10" measures change, not quality.

## 2. Data, split, metrics

- **Split: none.** All 4,081 existing albums (n = 4,081), as seeds and as candidates. The 6,386 new albums are not in any list here.
- **Held fixed.** The audio block: `data-pipeline/audio/` (3,980 albums with audio, 101 imputed), computed once from today's rows through `rmr_pipeline.audio.audio_block`, the same array in every variant. The slider stops (5, 1.765, 0.5), the 120 kept columns and the neighbour code (`rmr_pipeline.recs.top_k_neighbours` on `rmr_pipeline.audio.site_matrix`) are the build's own.
- **Baseline check.** Today's rows reproduce `frontcreck/public/data/recs.json` exactly: 100% of lists at all three stops.
- **Change metrics**, against today's lists: mean number of the 10 kept, share with the same 10, share with 5 or fewer kept.
- **Proxies**, defined as in `experiments/audio_10k/measure.py`: `genre_primary` (sheet's first primary genre, n = 3,614 seeds), `desc_jaccard` against each album's full descriptor set in the table (176 columns, n = 3,705) and against the sheet's list (n = 3,540), share never recommended, largest N10.
- **Sources of the 8.** `T`: the table's first 8 by page place. `Tnv`: the same without the three vocals columns. `S`: the sheet's `top_descriptors`, falling back to `Tnv` for the 468 existing albums with none.
- **Scale.** `raw`: a full row of 8 has the same length whatever the weights. `matched`: the block is multiplied by one number (1.13 to 1.20) so its total variance equals today's. The two differ little; mood is unaffected.

Data problems found:

- 57 albums have gaps in their page places and 65 have `Descriptor Count` above the number of filled cells: descriptors the scrape read but the table had no column for.
- The sheet and the table are two readings four years apart. Over the same albums, the sheet's list and the table's first 8 without vocals share the same set for 23% and the same order for 1%.
- 468 existing albums (467 off the chart) have no sheet list.

## 3. Results

Mood stop, raw scale. Sonic and balanced are in `results/top8.md`.

| variant | kept of 10 | same 10 | 5 or fewer kept | genre_primary | desc_jaccard (full) | never recommended | max N10 |
|---|---|---|---|---|---|---|---|
| today | | | | 0.173 | 0.427 | 7.1% | 100 |
| table first 8, today's weights | 3.61 | 5.5% | 76.8% | 0.147 | 0.335 | 6.8% | 93 |
| table first 8, equal | 3.44 | 2.2% | 79.9% | 0.174 | 0.343 | 6.5% | 110 |
| table first 8, 1 to 0.5 | 3.30 | 2.5% | 80.8% | 0.152 | 0.330 | 6.4% | 91 |
| table first 8, 8 to 1 | 2.27 | 1.3% | 90.9% | 0.140 | 0.303 | 5.6% | 88 |
| sheet list, equal | 2.04 | 0.0% | 97.7% | 0.196 | 0.330 | 6.2% | 120 |
| sheet list, 1 to 0.5 | 1.98 | 0.0% | 97.9% | 0.172 | 0.324 | 5.5% | 110 |
| sheet list, 8 to 1 | 1.53 | 0.0% | 99.0% | 0.163 | 0.304 | 4.9% | 98 |

Balanced stop, raw: kept of 10 is 5.2 (today's weights and equal), 4.8 (1 to 0.5), 3.8 (8 to 1) from the table, and 4.0, 3.8, 3.3 from the sheet. Sonic: 9.9 everywhere.

- 983 albums have 8 or fewer descriptors in the table (1,469 counting only the 120 kept columns). Their own rows do not change under the table cut, but their neighbours' do: they keep 7.0 of 10 at mood, the others 2.5.
- Words shown on an album (`d`): today a mean of 7.75, with 1,912 albums showing 10. After the cut at most 8, mean 5.2 from the table and 6.0 from the sheet, because lyric and vocals descriptors use up places among the 8. The vocabulary goes from 114 words to 112 (table) or 109 (sheet).
- With equal weights `build_vocab` would order an album's words by how common they are, not by page place. The order would have to come from somewhere else.

## 4. Limitations and ideas not run

1. No listening. The proxies disagree between stops, so the choice between equal and a gentle slope is not settled by them.
2. New albums are not in the lists. Ties and hubs will be more common with 10,467 candidates.
3. Only three slopes were tried, none tuned.
4. The slider stops were tuned against today's block. A sparser block may want other stops; not looked at.
5. Albums with no audio are meant to be mood-only. With equal weights their ties cannot be broken by audio; not measured.

## 5. Reproducing

    cd data-pipeline
    PYTHONDONTWRITEBYTECODE=1 nice -n 19 <build venv python> ../experiments/top8_descriptors/measure.py

About 75 seconds, no network, no cache, nothing large. Files: `measure.py` (its docstring defines every variant), `results/top8.md`, `results/top8.json`.

## 6. Added later on 6 October: the choice, on the 10k catalog

The owner ruled out equal weights and dropped the vocals descriptors: only the old albums carry them, so with them kept the new albums (61% of the catalog) took 31.8% of the mood places of existing albums, and 14.4% for the 2,315 albums with "male vocals"; 49.2% with them left out.

Rank weights (1.5 to 1.33) against the gentle slope (1 to 0.5), catalog build of 10,467 albums, vocals left out:

- The two share 7.8 of 10 albums at mood, 7.6 at balanced, 10.0 at sonic.
- Proxies, slope minus rank per seed: `genre_primary` +0.004 at mood and +0.006 at balanced (several standard errors), `desc_jaccard` -0.026 and -0.020. Slope has fewer albums never recommended (6.6% against 7.0% at mood) and more ties at the edge of a list (16% against 12%).
- Two blind readings of 40 seeds' lists by language models, the weighting hidden and shuffled per seed (not listening, not people): at mood the slope's list was preferred for 20 and 20 seeds, the rank list for 11 and 13; at balanced 14 and 21 against 12 and 13. Of the verdicts given with high confidence, 26 were for the slope and 7 for rank. The rank lists lost mostly by letting in a record of an unrelated genre.

The catalog build defaults to the slope. Seeds with three or fewer usable descriptors (To Pimp a Butterfly: concept album, urban, eclectic) get poor mood lists under either weighting.
