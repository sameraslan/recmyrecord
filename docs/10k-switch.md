# Switching the site build to the 10k catalog: runbook

6 October 2026. Branch `feat/audio-10k`, issue #37. Item 7 of `docs/10k-site-handoff.md`. Nothing here is done. Do none of it before Samer says yes: `SITE_MODEL`, `frontcreck/public/data/`, the site copy and the pinned tests stay as they are until then. Merging and deploying need a second yes.

Line numbers are of the working tree of 6 October. `frontcreck/` was being edited that day, so check its numbers again. "Scratch build" below is `data-pipeline/.cache/site10k`, a catalog build of 6 October 11:01 (flags not recorded, cover fetch unfinished). Its numbers were read for this runbook and are not in any report: measure again on the final build.

## 1. What changes for a visitor

- **Albums: 4,081 to 10,467** (`data-pipeline/README.md`, Catalog mode). Existing albums keep their number and slug. 6,386 new album pages.
- **Every existing album's lists move**, for three reasons at once.
  - The store: four clips, not up to eight, and a transform fitted on the whole catalog. The cosine between the two stores' vectors has a median of 0.979 over the 3,978 albums in both (README, The 10k EffNet store).
  - The descriptors: first 8 only. With today's weights the cut alone keeps 3.6 of 10 at mood, 5.2 at balanced, 9.9 at sonic (`experiments/top8_descriptors/REPORT.md`, section 1). Words shown per album: mean 7.75 down to 5.2 (table) or 6.0 (sheet); vocabulary 114 down to 112 or 109 (section 3; no new albums in it).
  - 6,386 more candidates, in neither report. Scratch build against today's data, existing albums: 2.9 of 10 kept at sonic, 3.0 at balanced, 2.1 at mood; 98% of lists hold a new album; vocabulary 113.
- **In Rainbows at mood no longer matches the old live site.** Scratch build: Glitter, Takk..., Have You in My Wilderness, Carrie & Lowell Live, 0. Today: Tindersticks, Avalon, So, You Will Never Know Why, Imperial Bedroom.
- **Every map position moves**, at all three stops (new store, new descriptors, a UMAP of 10,467 points).
- **Albums without audio become mood-only.** Today 101 existing albums have an imputed block (README, Albums without audio). After: no imputation; an album without audio has `n`, no sonic or balanced list, is in nobody's, and shows the note. Store: 10,242 of 10,467. The catalog build marks 225 albums as without audio (the 223 with none, plus the 2 left out of the store with `--exclude`), 39 of them existing.
- **Covers from other hosts.** Deezer, Apple, Bandcamp and YouTube image hosts beside Spotify's (README, Covers of the new albums). Scratch build: 5,191 Spotify, 2,326 Apple, 2,217 Deezer, 5 Bandcamp, 5 YouTube, 723 none (fetch unfinished). A YouTube cover is a video frame.
- **Other listen links.** 774 new albums have no Spotify link (`tests/test_catalog.py:253`). They link to Apple Music, Bandcamp, Deezer, YouTube or SoundCloud. Scratch build: 696 albums with `l`, 81 with no link at all. Chill Out gets a YouTube link.

## 2. Preconditions

Owner decisions of 6 October 2026:

- **Descriptor weights are not equal.** The gentle slope (`--descriptor-weights slope`, 1 down to 0.5) is expected and is the build's default; he confirms after comparing it with `rank` in `docs/review/weights-compare.html`.
- **The vocals descriptors are dropped for every album**: `--existing-descriptors table-novocals`, the default. The sheet does not list them, so only the old albums would carry them (2,772 existing albums have one among their 8, no new album does). To be revisited if the sheet gains vocals for all albums.
- **Artist form of a new album**: `native [Latin]`, as 33 existing albums have (`catalog.display_artist`). Titles stay as the catalog has them.
- **The no-audio note**: "Sound matches aren't available for this album yet." with the link "Show mood matches".
- **The link labels are approved.**
- **Wrong Spotify links are fixed through `overrides.json`** (the ids two albums share, which the build lists).

Owner decisions still open:

1. The weights, after the comparison page: `slope` (default) or `rank`.
2. The copy strings of section 5 that are not listed above.
3. YouTube-frame covers: yes or no (`docs/review/youtube-covers.png`). If no, drop the `youtube` rows from `catalog/covers.csv` before the build.
4. What happens to `audio/` and `audio/clap/` (section 8). The steps below assume both stay.

State:

- Cover fetch finished: `python -m rmr_pipeline.covers status` shows no sprite missing other than the failed ones. `catalog/covers.csv` is committed (untracked today).
- The sprites are recorded: once no `sprites` run is going, `python -m rmr_pipeline.covers adopt --dry-run`, then `adopt`. Delete the sprites it leaves alone as older than `covers.csv` and run `sprites` once more. `--require-sprites` refuses a sprite with no manifest entry. An album whose image is gone for good (recorded in `.cache/covers/state.json`) is built with an empty `c` and does not stop the flag.
- A rehearsal passes: `build --catalog --require-sprites --map-root <map> --out .cache/site10k-final` with the chosen flags, then `validate --data .cache/site10k-final`.
- The frontend work for the catalog data is merged into the branch (several thumbnail sheets, cover hosts, `l`, `n`, the note) and passes against the rehearsal folder with `RMR_DATA_DIR`. `frontcreck/public/data-10k` is a symlink into a scratch folder: remove it, never commit it.
- The map worktree is at hand for `--map-root` (on this laptop `/Users/saslan.19/Desktop/Tengs/codingMiscellaneous/website/.claude/worktrees/music_map`).
- Free disk: 3 GB on 6 October. `public/data` grows from 12 MB to an estimated 36 MB (11 atlas sheets, 3 thumbnail sheets), and `tests/test_validate.py:10-14` copies that folder once per test, about 30 times a run. Free at least 5 GB first. Node 20 arm64 for anything timed in the browser.

## 3. The code change (smallest honest one)

`SITE_MODEL` means "the store the site build reads" and the default build means "the site". Both have to stay true.

```
rmr_pipeline/audio_store.py:50      SITE_MODEL = "effnet"  ->  SITE_MODEL = "effnet10k"    (comment :45-48, docstring :7-10)
rmr_pipeline/build.py:49            "--catalog", action="store_true"  ->  action=argparse.BooleanOptionalAction, default=True
rmr_pipeline/build.py:70-74         delete: the --out requirement and the refusal of frontcreck/public/data
rmr_pipeline/build.py:75            delete: line 82 (site_store()) now gives the same store
rmr_pipeline/build.py:76-77         the owner's choices become the defaults (also catalog.py:144-145)
rmr_pipeline/build.py:78-81         the --no-catalog branch: keep the "need --catalog" errors and move the refusal here:
                                    --no-catalog needs --out, and not under frontcreck/public/data
rmr_pipeline/build.py:1-10,38,42-51 docstring and help texts
rmr_pipeline/audio.py:324           `fit` and `status` without --audio-dir now read effnet10k: make `fit` need an explicit --audio-dir
```

- The flag flips, instead of the guard only being deleted, because a plain `build --map-root X` would otherwise write a 4,081-album build with imputed blocks from `effnet10k` into `public/data`. Today's data stays reachable: `build --no-catalog --audio-dir audio --map-root <map> --out <folder>`.
- `audio.py:324`: `python -m rmr_pipeline.audio fit` refits on the feature table's albums. After the switch it would overwrite `audio/effnet10k/transform.npz` with a fit on 4,081 albums. The right command is `fit-catalog --audio-dir audio/effnet10k`.

## 4. Steps, in order

All from `data-pipeline/`, one heavy job at a time.

```bash
git status --short                                   # clean, covers.csv tracked
.venv/bin/python -m rmr_pipeline.covers adopt --dry-run   # then `adopt`: every sprite recorded in the manifest
.venv/bin/python -m rmr_pipeline.covers status       # no sprite missing but the failed ones
# 1. apply section 3
# 2. build into frontcreck/public/data (1 to 2 minutes, README)
caffeinate -i nice -n 19 .venv/bin/python -m rmr_pipeline.build --require-sprites --map-root <map>
.venv/bin/python -m rmr_pipeline.validate            # albums 10467, links, no_audio in the summary
# 3. record the catalog's reference (3.0 MB; 3 seconds; reads audio/effnet10k and catalog/albums.csv only)
.venv/bin/python scripts/record_audio_reference.py --catalog --out tests/fixtures/catalog_audio_reference.npz
# 4. re-pin the tests (section 5), then
nice -n 19 .venv/bin/python -m pytest
nice -n 19 .venv-audio/bin/python -m pytest tests_audio
# 5. frontend: copy and pins (section 5), then section 6
```

- Step 3 writes a new file beside `tests/fixtures/audio_reference.npz`. The old one keeps proving the rekey of `audio/`, and `tests/test_rekey.py` needs no change. `tests/test_record_reference.py::test_the_committed_catalog_reference` stops skipping once the new file is there.
- Only if `audio/`'s embeddings are deleted (section 8): `--out tests/fixtures/audio_reference.npz --force`, and `tests/test_rekey.py:37-74` is rewritten for `keys` in place of `uris`.
- One commit for the code default, the data, the reference and the pipeline pins. A second for the frontend pins and the copy.

## 5. Pins that break

"Hand": the new value is a decision. "Data": read it from the built files or the code, never type it.

**Pipeline** (`data-pipeline/`):

| Where | Pins | How | Becomes |
|---|---|---|---|
| `tests/test_build.py:31-39` (`:35`, `:36`) | `SITE_MODEL == "effnet"`, default store `audio/` | hand | `"effnet10k"`, `STORES["effnet10k"]`; rename the test |
| `tests/test_audio_store.py:338-342` (`:340`) | the same, and `site_store() == DEFAULT_AUDIO` | hand | the same; rename the test |
| `tests/test_build_catalog.py:29-36` (`:31`, `:32`) | `SITE_MODEL == "effnet"`; defaults `slope`, `table-novocals` (the owner's choices of 6 October) | hand | the new value |
| `tests/test_build_catalog.py:18-26` | `--catalog` needs `--out` and refuses `public/data` ("go-ahead") | hand | inverted: `--no-catalog` needs `--out` and refuses it |
| `tests/test_build_catalog.py:39-46`, `:49-54` | catalog off by default; the catalog flags and `--require-sprites` error without it | hand | on by default; they error with `--no-catalog` |
| `tests/conftest.py:16-28` | `audio`, `site_recs`: the feature table on `site_store()` | hand | pin both to `DEFAULT_AUDIO` (they test the old store's mechanics); the catalog's block and lists get fixtures of their own |
| `tests/test_audio.py:296-303` (`:298`), `tests/test_mood_only.py:40-50` (`:42`, `:50`), `tests/test_build_catalog.py:192-201` (`:197-201`) | `site_store()` (or `status` with no `--audio-dir`) is the `audio` fixture's store | hand | `DEFAULT_AUDIO` |
| `tests/test_outputs.py:45-53` (`:51`) | In Rainbows' mood top five is `IN_RAINBOWS_LIVE` | hand | drop it here (`test_recommender.py:29-31` keeps the live replica), or pin a list the owner has seen |
| `tests/test_outputs.py:39-42` | 4,081 albums, 114 words | data | `len(load_catalog())`; the built `vocab.json` (113 in the scratch build) |
| `tests/test_outputs.py:56-62` | `recs.json` equals `site_recs` | data | `rec_lists(build_recs(frame, block, has_audio=..., mood_only=True))` on the catalog frame with the build's flags; rows are ragged (`[]` for an `n` album), so no `np.array` |
| `tests/test_outputs.py:73-83`, helper `:33-36` | 4 atlas sheets, one `thumbs.webp` | data | `ceil(n / ATLAS_PER_SHEET)` sheets; `thumbs_name(i // THUMB_PER_SHEET)` |
| `tests/test_outputs.py:86-99` (`:92-93`; runs with `RMR_MAP_ROOT`) | the last album is on the map | data | the last existing album, `len(deduped[0]) - 1` |
| `tests/test_validate.py:23-26` | `atlas-4.webp` is one sheet too many | data | the first unused number (`atlas-11.webp`) |
| `tests/test_validate.py:86-99` (`:99`), `:102-103` | summary `(4081, 2, 2)`; the site summary has no `links`, `no_audio` | data | the data's counts plus what the test adds; it has them |
| `tests_audio/test_status_and_tools.py:57-70` (`:67`, `:68`) | site slugs and artists equal the existing albums' | data | compare `site[:len(catalog)]` |

If `conftest.py` keeps following `site_store()` instead, these fail (seen in a simulated run): `tests/test_rekey.py:58-63` and `tests/test_audio.py:82-91`, `:94-105`, `:116-126`, `:129`, `:221-232`, `:235-257`. They compare the fixture with `audio/` and the experiment's transform, so pinning the fixture is the smaller change. `tests/test_vocab.py` keeps passing: its 114 words are the feature table's, no longer the site's.

**Frontend** (`frontcreck/`; read against the scratch build, not run):

| Where | Pins | How | Becomes |
|---|---|---|---|
| `src/lib/data/server.test.ts:13`, `:54` | 4,081 slugs; 114 words | data | from `albums.json`, `vocab.json` |
| `src/lib/data/server.test.ts:22`; `e2e/album.spec.ts:27` | In Rainbows' six tags | data | seven in the scratch build ("ethereal" added) |
| `src/lib/data/server.test.ts:23-25`; `e2e/album.spec.ts:50`, `:187-195`, `:245`; `e2e/flows.spec.ts:62`; `e2e/nowebgl.spec.ts:25` | the mood five, Tindersticks first, a `tindersticks-` URL (`album.spec.ts:189`) | data | `recsOf(IR_SLUG, 'mood')` of `e2e/data.ts`, as sonic and balanced already are |
| `src/lib/copy.test.ts:43-61` (`:48`) | the How it works paragraphs, word for word | hand | the approved text |
| `e2e/album.spec.ts:297-303` | Chill Out has no link in `.seed-actions` | hand | it gets a YouTube link; use Dark & Long or Gimix (no `s`, no `l`), or expect the link |
| `e2e/album.spec.ts:304-312`, `e2e/data.ts:40-52` | a first row without Spotify has no `a.rec-sp` | data | the helper must also want no `l`; the scratch build's first hit (Illinois, then Eureka) has one |
| `e2e/flows.spec.ts:141-145` | with `i.scdn.co` blocked the first row falls back to its sprite | hand | block every cover host; a new album's cover is elsewhere |
| `src/lib/search.test.ts:151-160` (20 ms), `:199-207` (5 ms); `src/components/search/SearchBox.test.tsx:294-318` (5 ms median) | timed on the real catalog, now 2.6 times larger | at risk | measure; do not loosen without the owner |
| `e2e/pages.spec.ts:64`, `e2e/map.spec.ts:8`; `e2e/search.spec.ts:32`, `:243`, `:258`; `e2e/flows.spec.ts:146`; `src/lib/data/server-recs.test.ts:36` | `atlas-\d` misses `atlas-10`; `thumbs.webp` only; "the one album without a cover id"; "no album without audio" | stale, still pass | widen the patterns, fix the wording |

**Copy that goes stale** (each new string needs Samer's approval before it ships):

| Where | String |
|---|---|
| `frontcreck/src/lib/copy.ts:6`, the rule at `:3` (`copy.test.ts:84` follows the constant) | `'4,000+'` |
| `frontcreck/src/lib/copy.ts:116`, pinned at `copy.test.ts:48` | "measurements such as energy, tempo, danceability and acousticness, taken from the recording" |
| `frontcreck/src/lib/copy.ts:132` | "Sound values from Spotify. Cover art from Spotify." |
| `frontcreck/src/lib/copy.ts:56,58,61-65` | the no-audio note (wording decided 6 October, section 2) and the listen strings (labels approved); check the "Working wording" marks are gone |
| `README.md:25`, `frontcreck/README.md:3`, `:35`, `frontcreck/src/components/Cover.tsx:48` (a comment) | "4,000+"; "the only outside requests are cover images from Spotify's image server" |
| `data-pipeline/README.md:3-26`, `:59-80`, `:86`, `:159-173`, `:296-298`, `:336-351`, `:377` | the default build, "None of that is done", "It is not what the site is built with", 101 imputed albums |

## 6. Verification

- `python -m rmr_pipeline.validate` and both pytest runs. In `frontcreck/`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`, `npm run perf`.
- Budgets (`frontcreck/scripts/perf/budgets.json`): search usable 1,000 ms, startup long task 250 ms, type to suggestions 100 ms, select to album 200 ms, slider to list 150 ms, frame gap 50 ms, idle long tasks 0, idle frames 1, first-load JS 200 kB, page HTML 150 kB. A missed budget stops the switch.
- The static build prerenders 10,467 album pages: note its time, here and on the Vercel preview.
- By eye, on the preview: the map at all three stops, zoomed out and in (covers on sheets 4 to 10, no flat tiles); In Rainbows, Loveless and a new album at each stop; an `n` album (the note, the Mood button, its place on the sonic map); a cover from each of Deezer, Apple, Bandcamp and YouTube; an album with another link than Spotify; one with no link (Dark & Long); a search for a new album (its thumbnail is on `thumbs-1.webp` or `thumbs-2.webp`); About; a phone.
- For the PR: kept of 10 per stop for existing albums against the old data, `n` albums existing and new, covers per source, links per service.

## 7. Rollback

- Before deploy: revert the switch commit (code default, `public/data`, pipeline pins) and the frontend commit (pins, copy). Reverting only one leaves the tests red, or copy that says 10,000 over 4,081 albums.
- After deploy: promote the previous deployment, then revert both commits. The 6,386 new album URLs then return 404; existing URLs are unchanged.
- Nothing else needs reverting. The switch writes no store: `audio/`, `audio/effnet10k/`, `audio/clap/`, `catalog/` and the caches are as before. `tests/fixtures/catalog_audio_reference.npz` and `tests/test_record_reference.py` can stay; they do not depend on `SITE_MODEL`.
- A change to `audio/` (section 8) is a separate revert. Keep it out of the switch PR.

## 8. `data-pipeline/audio/` and `audio/clap/` afterwards (owner's decision)

`audio/` cannot simply go. `keys.csv`, `matches.csv`, `match_overrides.json`, `fulllength.csv`, `fulllength_links.csv` and `album_status.*` live there and are shared by the inner stores; `audio/effnet10k/` is a folder inside it; `audio/transform.npz` gives `fit-catalog` its target variance (`rmr_pipeline/audio.py:270`, `:305`; `tests/test_modelstore.py:426`, `:452`); `rmr_audio sync`, `status` and `compact` work on `audio/embeddings/`; the old reference, `tests/test_rekey.py`, most of `tests/test_audio.py`, `tests/test_audio_store.py:217-270` and `experiments/top8_descriptors/measure.py` read its embeddings.

Options for `audio/` (3,980 albums, eight clips, 9 MB of embeddings):

1. Keep it, frozen, as the record of the first EffNet data and the base of those tests. No work. `rmr_audio sync` still writes it and nothing on the site reads it.
2. Keep the shared files and `transform.npz`; delete `embeddings/` and `manifest.json`. The tests above go or move to `effnet10k`, the reference is recorded with `--force`, and `rmr_audio sync`, `compact` and `status` are pointed elsewhere or retired.
3. Move the 10k store up into `audio/`. The largest change: `modelstore write` refuses `audio/` today, and every path in the README and the tests moves.

Options for `audio/clap/` (10,240 albums, 10 MB, unused): keep it on the branch, as the README says; or delete it with `STORES["clap"]`, `tests/test_audio_store.py:341,353` and `tests/test_build.py:38-39` (`tests/test_modelstore.py:404-426` skips without it). It can be written again from the clip cache, on this laptop only.

Whatever is chosen: after the switch a new album's audio goes through the one-pass cache and `modelstore write`, and `tests/test_modelstore.py:451` wants the transform fitted on exactly the store's albums. Adding one album then means a refit, which moves every block. That needs its own decision before the first album is added.
