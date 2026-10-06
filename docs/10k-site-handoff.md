# The 10k catalog on the site: handoff, 6 October 2026

For the session that takes the 10k catalog from "audio is ready" to "on the real map". The audio work is finished and recorded in `docs/audio-10k-status.md`, `docs/audio-10k-handoff.md` and `experiments/audio_10k/REPORT.md`. Branch `feat/audio-10k`, draft PR #31 (stacked on #26, on #25). Tracking issue #37; site gaps #39; descriptors #40; no-audio albums #41. Never merge or deploy without Samer's go-ahead, and do not change `frontcreck/public/data/`, site copy or `SITE_MODEL` without it.

## Decided by Samer

- **EffNet is the sonic model for the 10k catalog** (5 October, after listening: its lists sounded closer than CLAP's). The store is `data-pipeline/audio/effnet10k/`: 10,242 of 10,467 albums, four clips per album, transform fitted on all of them. The CLAP store (`audio/clap/`) stays on the branch and is not used.
- **The RYM id stays the album key**, inside the pipeline (6 October).
- **Albums with no audio stay in the catalog, all of them** (223 today, 37 of them already on the site). They are limited to the mood side: no sonic position of their own, and a short note saying audio could not be found for now. This replaces filling their sonic block in from descriptors. The note's wording needs his approval before it ships.
- **Descriptors: the top 8 for every album.** Existing albums, which have more, are cut to their first 8 so that existing and new albums are described the same way (6 October, confirming the earlier "uniform top 8"). Open detail: whether the 8 are weighted equally or by rank. Check how the feature table's weights are made today, measure what the cut does to the existing albums' mood lists, and bring him the numbers before switching.
- The goal now: prepare everything so the 10k catalog can be used in the real map.

## What the site build still lacks for a new album

From reading the build (`data-pipeline/rmr_pipeline/`), in the order suggested:

1. **Descriptor rows.** The feature table has rows only for the 4,081 existing albums (120 numeric descriptor columns; `build.py`, `audio.py`, `vocab.py`, hash pin in `constants.py`). `catalog/albums.csv` has `top_descriptors` names for 6,374 new albums (5,599 with eight, 12 with none). Nothing turns names into rows. Issue #40.
2. **Album key in the build.** The build goes from Spotify URI to key through `audio/keys.csv`, which has only the existing albums. 774 new albums have no Spotify URL. The build has to key by RYM id from the catalog.
3. **Covers, cover ids and cluster ids.** They come from another site's map pipeline (`mapsource.py`, `--map-root`); `build.py` drops any album missing from that map's metadata. Nothing exists for new albums. Issue #39.
4. **Thumbnail sheet.** `images.py` stops at 64 x 64 = 4,096 albums; the frontend (`frontcreck/src/lib/data/sprites.ts`) assumes one sheet. Needs several sheets on both sides.
5. **Listen links.** `albums.json` carries only a Spotify id. The catalog has Apple, Deezer, Bandcamp, YouTube and SoundCloud links; 79 new albums have none. Needs new fields, validation and frontend work.
6. **The mood-only rule** for no-audio albums, in the build and the frontend, with the note.
7. **The switch.** Point the build at `audio/effnet10k` (a `STORES` key exists; `SITE_MODEL` still says `effnet`), rebuild the site data, record `tests/fixtures/audio_reference.npz` again, update the tests that pin the store and the recommendations (`test_rekey.py`, `test_outputs.py`, `test_audio_store.py`, `test_build.py`). Existing albums' sonic lists will move: four clips instead of eight, a transform fitted on 10k albums, 6,000 more candidates. Positions on the map move too.

## Things to know

- **Stores are written with two albums left out, every time:** `--exclude Album999417,Album739618` (A Clockwork Orange, Barry Lyndon: their only audio is of other records). Commands are in `data-pipeline/README.md`.
- **Hand-given YouTube links** go in `data-pipeline/audio/fulllength_links.csv` and are embedded with `rmr_audio.fulllength --links-only`; playlists work there. Three top-1,000 albums still have no audio: Mach-Hommy (The Gospel According To...), Karajan (Symphonie Nr. 5), Tatsuro Yamashita (Joy).
- **`data-pipeline/.cache/audio/onepass.sqlite` is the only copy of every embedding.** Open it read-only unless an audio job is meant to write.
- **`audio/` (the old EffNet store, 3,980 albums, eight clips) is what the current site data on this branch stack was built from.** Leave it until the switch. Its 7 corrected-listing albums are still on the old listings there.
- **The live site uses Spotify audio features.** Neither EffNet nor CLAP is deployed.
- **`git config push.default` is `upstream` in this repo.** A branch made from `origin/main` pushes to `main`. Create with `--no-track` and push with `git push origin HEAD:refs/heads/<branch>`.
- Python environments are in the old worktree `.claude/worktrees/laughing-sinoussi-95fc12` (read-only use, never clean it). Laptop rules: one heavy job, `nice -n 19`, `caffeinate -i`.
- Open with Samer: the 12 pairing questions (`docs/audio-10k-pair-questions.md`), each with its default applied.
