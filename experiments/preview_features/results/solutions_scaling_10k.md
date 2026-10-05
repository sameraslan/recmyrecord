# Growing the catalog to RYM's top 10,000: recommendations

3 October 2026. Design and local analysis only: no pipeline code changed, the sheet not touched, no network calls. Inputs: `rym10k_sheet_audit.md`, the cached sheet tabs, the feature table, `data-pipeline/audio/`, the `rym-album-harvest` skill. **M** measured here, **E** estimate, **A** assumption.

## Two facts that shape everything

- **The 10k tab came from chart pages; the rich fields need album pages.** The harvest skill reads the full descriptor list, track count, runtime, tracklist and cover only from an album page: one request per album, 8 to 12 s apart, about 100 pages per session. All 10,480 albums would be about 29 hours of paced requests over 105 or more sessions in the owner's logged-in Chrome (E). Chart pages give 100 albums per request, capped at 8 descriptors.
- **Old and new descriptor rows must not be mixed** (M, section 4). Whatever scheme is chosen has to apply to every album.

## 1. Album key: move to `rym_id`

**Recommend:** `rym_id` is the identity of an album everywhere (table, store, matches, overrides). Rekey the store once; keep the Spotify id as an optional attribute used only for the listen link.

- Why: 773 new rows have no Spotify link, 11 pairs of rows share one, the sheet's Spotify id differs from the catalog key for 1,157 matched albums, and the URI dedupe already lost 28 albums (audit, M). `rym_id` is full and unique.
- Migration: commit `keys.csv` (`rym_id`, legacy URI, Spotify id for the link, slug). A one-off rekey rewrites the `keys` array of the shard, the key column of `matches.csv`, the keys of `match_overrides.json` and of `transform.npz`, and the local clip caches. Embeddings are untouched; the test is that the 4,081 audio blocks are identical before and after.
- The catalog order stays append-only: the 4,081 in today's order, new albums after them. Slugs are made from title and artist in catalog order, so existing album URLs do not change as long as existing titles and artists are not replaced by the sheet's spellings.
- The 477 off-chart albums have no `rym_id` (the old scrape has none, M). Harvest their album pages: about 5 sessions.
- What breaks on the site when there is no Spotify album: nothing hard. `s` may be empty (the button is then hidden) and `c` may be empty (cluster-coloured tile); the validator accepts both. What breaks in the build: Spotify id is taken from the URI, and cover, cluster and "is on the map" are looked up by URI in the personal-site map (section 5).
- Rejected: keep the legacy URIs as store keys and give new albums `rym:` keys (the design doc allows any string). No migration, but two kinds of key forever and the colliding-URI cases stay confusing.

## 2. Membership: keep the 477, catalog only grows

**Recommend:** the catalog is every album ever admitted, about 10,480 (E). An album enters when it appears on the chart; it never leaves automatically. Store `rank`, `on_chart` and `last_seen` so a later decision to hide off-chart albums is a filter, not a rebuild.

- Why: album pages have public URLs, the store is append-only, and 247 of the 477 are EPs, mixtapes and live records the album-only chart excludes by construction, not albums that fell in esteem.
- Refresh rule: re-scrape the chart pages (100 requests), join on `rym_id`, append unseen ids, refresh descriptors and rank of the rest.
- Flag errors: do not use `in_recmyrecord`. Rebuild the mapping by rule: Spotify id equal (2,434, M), else folded artist + title + release year; a title-only match across artists is never accepted (removes the 11 wrong `likely`); a sequel or edition title is not the original (removes the 9 wrong loose matches); the 28 dedupe-lost albums enter as new; the 13 false `missing` are caught by the same rules. Left for the owner: same-name groups and unresolved collisions, about 30 to 60 rows (E).
- Guard: two catalog albums that resolve to the same store listing are reported.
- Rejected: rebuild from the sheet alone. It deletes 477 album pages and their audio for no gain.

## 3. Matching without Spotify numbers: use RYM's store links as ids

**Recommend:** where the row has a Deezer or Apple link, skip the search and fetch that listing; it is both the match and the edition reference. Search by text only for the rest.

| Step | New rows | Expected no preview | Expected ambiguous | |
|---|---|---|---|---|
| A. Deezer id from the sheet | 2,450 | ~7 (0.3%) | ~50 (2%) | M count, E/A rates |
| B. Apple id, in the link's storefront, then us | 3,122 | ~60 (2%) | ~60 to 90 | M count, E/A rates |
| C. Text search, no fingerprint | 796 (138 Spotify-only, 658 no link) | ~495 | ~145 | M count, E from catalog cells |
| New albums in all | 6,368 | ~565 | ~250 to 290 | E |
| Catalog at 10,480 | | ~670 (6.4%; today 2.5%) | ~420 (4.0%; today 3.7%) | E |

- Evidence that RYM's link is a good edition (M): for catalog albums matched on Deezer that also have an RYM Deezer link, the two ids are equal in 1,707 of 2,118 (80.6%). Where they differ and the RYM listing is in the response cache (155), RYM's has fewer tracks in 94, the same in 27, more in 34; 10 have over 30 tracks. On the 83-album All-Time tab, the RYM track count equals the matched listing's in 56 of 80; in 17 the store listing is bigger because the Spotify album in the table was a deluxe edition. Today's fingerprint reproduces Spotify's edition; RYM's link is closer to the original album.
- Edition rule for A and B: accept the linked listing; if it has more than 30 tracks or a bigger-edition marker, look for the standard edition among the same artist's listings (existing `same_release` and `edition_key`, no duration term). Flag ambiguous if title or artist reads below the existing floors against both the native and the Latin name, or if the listing has no previews.
- Storefront (M): of the 3,122 Apple-only new rows, 58.5% link to us, gb or de; the rest to ca 308, se 196, ru 175, es 74, hu 58, jp 55 and others. Pass the link's storefront to the lookup.
- Step C: add `artist_latin`/`title_latin` as search spellings, split " & " credits into alternative artists, add `jp` for the 155 non-Latin rows among the 796 (M). To verify edition there, harvest the album pages of these 796 plus the flagged rows from A and B, about 950 pages or 10 sessions (E): track count and runtime feed the matcher's existing duration and count terms in place of Spotify's.
- Hand budget: sort ambiguous and missing albums by chart rank and fix the top 50. The rest stay as matched; the earlier audit found ambiguous matches gain as much from audio as clean ones, and about a third are wrong.
- Albums with no preview keep the imputed block (mean of mood neighbours), as today.
- Rejected: MusicBrainz for track counts (needs its own fuzzy match; the sheet has no MusicBrainz id). Rejected by default: Bandcamp or YouTube audio for the 796 (253 and 577 have such links, M); it is outside the stores' terms and is the owner's call.

## 4. Descriptors: one scheme for all albums, top 8 from the chart

**Recommend:** rebuild every row, old and new, as the first 8 non-vocal descriptors with weight 1.5 − (rank − 1)/42, restricted to the 120 columns. On-chart albums take the sheet's list; the 477 take their own first 8. Never mix schemes. The full-page harvest is an optional later upgrade, switched on for all albums at once.

Measured on the 4,081 catalog rows by truncating them (T8), site matrix with the real audio block:

| | Mood stop | Balanced stop |
|---|---|---|
| Top 10 shared with today's lists, all rows T8 | 0.36 | 0.54 |
| Primary-genre share, full → T8 | 0.165 → 0.145 | 0.278 → 0.268 |
| Genre-family share, full → T8 | 0.500 → 0.459 | 0.671 → 0.664 |
| Dropping only the three vocal columns: top 10 shared | 0.83 (genre shares unchanged) | 0.91 |
| **Mixed, 60% of rows T8:** share of T8 albums in the lists of T8 seeds / of full seeds (unbiased: 0.60) | 0.89 / 0.44 | 0.84 / 0.53 |
| Mixed: mean times recommended, T8 rows / full rows | 11.8 / 7.3 | 11.9 / 7.1 |

- T8 keeps 5.8 names in the 120 per row (full: 10.8) and 58% of the weight; mean descriptor-vector length falls to 0.79 of full (M). The simulated rows resemble the sheet's (6.3 names).
- A mix splits the catalog in two: new albums recommend new albums, old recommend old, and the shorter new vectors are recommended 60% more often. Scaling every row to one length evens the counts (10.1 / 9.9) but worsens the split (0.80 / 0.29), because ranks 9 and below and the vocal columns exist only in old rows (M).
- Uniform T8 costs about 0.02 primary-genre share and 0.04 family share at the mood stop, and almost nothing at balanced (M). Old lists change by about two thirds at mood, but they change anyway when 6,400 albums are added.
- The alternative, full lists for all: today's pages list 16 to 76 names (39 on average for the top 83, M), not the 13 the old scrape saw, so even a full harvest does not reproduce old rows; it needs a cut-off rule and all 10,480 pages before it can go live.
- Renames: map `male vocalist`, `LGBTQ`, `hedonism`, `antireligious`, `satanism` to the column names. Under T8 only lyric columns (dropped) and vocals (unused) are affected, so the map matters for the full-list scheme only.
- Names outside the 120 columns (2.1% of tokens): ignore and log. The 13 columns the sheet cannot fill become empty for everyone, which is consistent.
- Sparse rows are the real cost. With 3 or fewer names in the 120: 300 catalog rows today, 528 under T8 (M), plus 477 new: about 1,000 at 10k (E). None: 57 + 22. Under T8 at the mood stop a sparse row is recommended 26.7 times on average against 7.5 for the others (M). Do not write predicted descriptors into rows. Use query-side fill for rows under five names (the earlier experiment: +0.020 and +0.034 primary genre), and consider scaling descriptor rows to unit length: on all-T8 rows it cuts the largest hub from 99 to 55 lists and never-recommended albums from 6.9% to 2.1% at mood, with primary genre 0.151 against 0.145, but costs 0.012 at balanced (M). That is a recommender change and needs a listening check.

## 5. Other inputs per new album

| Input | Source | Note |
|---|---|---|
| Cover (sprite, ambient colours, page image) | The matched Deezer or iTunes listing's artwork URL (A: both APIs return one); Spotify oEmbed thumbnail when unmatched but linked (A); RYM `cover_url` from the targeted harvest; else the tile | `c` must accept a non-Spotify image; existing albums keep theirs |
| Thumbnail sheet | Several sheets of 4,096 instead of one | Frontend and validator change. Map atlases: 11 sheets, about 24 MB (E, from 9 MB for 4 today) |
| Map position | Already computed in the build (UMAP on the site matrix) | All positions move; version the data URLs |
| Cluster (`k`: dot and tile colour) | Vote of the 15 nearest existing albums in the balanced matrix | Existing albums keep their cluster. Rejected: rerun the personal-site map, which is keyed by Spotify URI and Spotify features |
| Genres | Sheet `primary_genres`, `secondary_genres` into the table | The site shows none today; used for evaluation. 357 new genre names need a family |
| Listen link | Spotify from the sheet (5,595 of the new rows, M); else Apple (114 of the 773, M), Deezer, Bandcamp, YouTube; 81 have nothing | Existing albums keep their Spotify id. Button text is site copy |

## 6. Scale

Mean clips per album at the 8-clip policy is 7.41, at 4 clips 3.94 (M, current store). Both models in one pass: 1.0 to 1.25 s per clip (E: 0.8 s measured for CLAP with download, plus 0.43 CPU-s for EffNet, partly overlapping).

| Job | Clips | Hours | |
|---|---|---|---|
| Matching the new rows (A 16 min, B 2.8 h, C up to 7 h; bound by the iTunes limit, little CPU) | | ~10 | E |
| Stage 1: new albums, 4 clips, both models | ~22,900 | 6.5 to 8 | E |
| Stage 2: new albums, top up to 8 | ~20,100 | 5.5 to 7 | E |
| CLAP for the existing catalog at 8 clips (the job now running) | ~29,500 | ~6.5 | E |
| Everything from nothing, for reference | ~72,600 | 20 to 25 | E |

- Staging: stage 1, build and inspect the 10k site data, then stage 2. Three to four nights with one worker.
- Committed: EffNet album means, float16, about 25 MB (9.6 MB today); a second store of the same format for CLAP, about 10 MB; `matches.csv`; `keys.csv`. Add shards per batch and compact rarely, since each compaction adds the full size to git history.
- Local, gitignored: per-clip embeddings (about 0.5 GB for both models, E), API response cache (about 0.1 GB), harvested page data, cover image cache. No audio.
- Build: mutual proximity needs a 400 MB matrix at 10k (noted in the code); plain ranking and UMAP are minutes.

## 7. Order of work

1. **Owner decides** D1 to D5 below.
2. Catalog builder: sheet export + `keys.csv` → a new, documented table (existing albums first, in order). **Owner reviews** the 30 to 60 doubtful pairs.
3. Harvest the 477 off-chart albums' pages (5 sessions, **owner's Chrome**).
4. Rekey the store; test that the 4,081 blocks are unchanged.
5. Matcher: direct ids, storefront, Latin names, edition rule. Dry run on 300 new rows and compare with the table in section 3 before the full run.
6. Full match; targeted harvest of the ~950 problem albums (10 sessions, **owner's Chrome**); **owner fixes** the top 50 by rank.
7. Audio stage 1 (4 clips), then build changes: covers, cluster vote, thumbnail sheets, listen link.
8. Refit the transform on the 10k store (**owner sign-off**: a refit moves lists and the map); evaluation and a listening page (**owner listens**).
9. Audio stage 2 (8 clips), rebuild.
10. Site copy: "4,000+", the About panel, button text (**owner approves wording**). Deploy (**owner**).

## Owner's decisions

| | Decision | Recommendation |
|---|---|---|
| D1 | Key | `rym_id`, one-off rekey |
| D2 | The 477 off-chart albums | Keep; catalog only grows |
| D3 | Descriptor scheme | Uniform top 8 now. Full-page harvest of all 10,480 (about 29 h, 105 sessions) only if the mood stop sounds worse on the listening page |
| D4 | Sparse rows | Query-side fill; unit-length descriptor rows as a tested option |
| D5 | Audio for the ~670 albums without previews | Imputed block; local files for favourites; no Bandcamp or YouTube |

## Open risks

- The 2 to 3% trouble rate for direct ids is assumed; RYM links are user-added and can point to a wrong or deluxe listing. The dry run in step 5 measures it.
- 6.4% of albums with an imputed audio block, imputed from sparser descriptors than today.
- Every quality figure is an RYM-genre proxy on the old 4,081; the new albums (more classical, Japanese, punk, game music) are untested, and the frozen transform was fitted without them.
- RYM may block the harvest; the plan needs about 15 sessions, the full-list option 105.
- The map at 10k points with 11 atlas sheets is untested on phones.
- Apple's and Deezer's preview terms (see `audio_sources_research.md`) apply to 2.5 times the volume.
- Whether RYM chart pages go past rank 10,000 or list other release types with ids is not checked; step 3 assumes album pages instead.
