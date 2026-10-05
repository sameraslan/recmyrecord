# Audio 10k: handoff, 5 October 2026

For whoever picks this up next. Current state is in `docs/audio-10k-status.md` and, per album, in `data-pipeline/audio/album_status.csv` (regenerate with `python -m rmr_audio.album_status`). Tracking issue: #37. Draft PR: #31 (branch `feat/audio-10k`, stacked on #26). Never merge or deploy without Samer's sign-off.

## Decided by Samer

- RYM id is the album key. Off-chart albums stay.
- CLAP is the similarity model. Four clips per album is the standard; no top-up to 8.
- YouTube (yt-dlp, no account) is approved for albums with no store previews, for searching when the sheet link is missing or dead, and for edge-case albums with too few previews. Audio is never stored.
- The CLAP recipe for every source that is not Deezer passes the stereo signal through an MP3 128k round trip first. In the cache this is model `clap_mp3`; for Deezer clips it equals `clap`. See `experiments/audio_10k/REPORT.md` and `results/mp3_variant_check.md`. **`clap_mp3` is the vector to build the store from, not `clap`.**

## Running when this was written

One chained job in the session that wrote this file: `fulllength --search`, then `--edge-cases --search`, then the two `--retry-failed` passes, then `album_status`. Logs: `data-pipeline/.cache/fulllength-search.log`, `fulllength-edge.log`, `fulllength-retry.log`. Every step resumes if rerun; commands are in `data-pipeline/README.md`. Check `pgrep -fl "onepass|fulllength"` before starting any audio job; only one at a time.

## Left to do, in order

1. Confirm the YouTube runs finished; rerun any that stopped. Commit `audio/fulllength.csv` and the status table.
2. Embed the albums `album_status.csv` marks `embed` (11) and `reembed` (7 existing albums whose stored audio came from the wrong listing; right listings are in `audio/match_overrides.json`, list in `.cache/audio/pending_reembed.csv`). Barry Lyndon and A Clockwork Orange sit on unrelated listings and have no right one in the stores: try the YouTube search for them.
3. Write the CLAP store from `clap_mp3` (`python -m rmr_audio.modelstore write --model clap_mp3 --audio-dir audio/clap`), refit (`python -m rmr_pipeline.audio fit-catalog --audio-dir audio/clap`), commit `data-pipeline/audio/clap/`.
4. Rerun `experiments/audio_10k/measure.py` and `source_effect.py` with `--model clap_mp3` on the whole catalog. The check that matters: Deezer-sourced and Apple-sourced albums mix at about the genre make-up rate, and YouTube-sourced albums are not left out of lists. Every number is an RYM-based proxy.
5. Build the listening page (`experiments/audio_10k/listening_page.py`) on the `clap_mp3` store and give it to Samer. He judges CLAP by ear.
6. Only after his explicit go-ahead: switch `SITE_MODEL` to CLAP, rebuild site data (needs descriptors, covers, thumbnails and listen links for new albums: issue #39), site copy, deploy.
7. Keep the board current: #37, #41, #49, #50, #42, #44. Add the experiment's row to the index in `CLAUDE.md` through a documents-only PR to `main`.

## Open items for Samer

- 12 yes/no pairing questions with defaults applied: `docs/audio-10k-pair-questions.md`.
- Two doubtful YouTube picks already embedded: Tatsuro Yamashita "Ride on Time" (edition unknown) and Magma "1001° centigrades" (video 10% shorter than the listing).
- Whether albums already on the site should also get YouTube audio when they had none (currently yes).

## Local-only things that matter

- `data-pipeline/.cache/audio/onepass.sqlite` holds every embedding and is the only copy. Backups beside it (`onepass.before-*.sqlite`) can go once the store is committed.
- Python environments are in the old worktree `.claude/worktrees/laughing-sinoussi-95fc12` (read-only use; never clean it). yt-dlp is in `data-pipeline/.venv-fetch` in this worktree.
- Laptop rules: one heavy job, `nice -n 19`, mains power for long runs, Deezer about 3 requests/s, iTunes at most 18 calls/min.
