# Audio 10k: handoff, 5 October 2026

For whoever picks this up next. Current state is in `docs/audio-10k-status.md` and, per album, in `data-pipeline/audio/album_status.csv` (regenerate with `python -m rmr_audio.album_status`). Tracking issue: #37. Draft PR: #31 (branch `feat/audio-10k`, stacked on #26). Never merge or deploy without Samer's sign-off.

## Decided by Samer

- RYM id is the album key. Off-chart albums stay.
- CLAP is the similarity model. Four clips per album is the standard; no top-up to 8.
- YouTube (yt-dlp, no account) is approved for albums with no store previews, for searching when the sheet link is missing or dead, and for edge-case albums with too few previews. Audio is never stored.
- The CLAP recipe for every source that is not Deezer passes the stereo signal through an MP3 128k round trip first. In the cache this is model `clap_mp3`; for Deezer clips it equals `clap`. See `experiments/audio_10k/REPORT.md` and `results/mp3_variant_check.md`. **`clap_mp3` is the vector to build the store from, not `clap`.**

## Running when this was written

Nothing. The chained YouTube job that was running when this file was first written has finished. Check `pgrep -fl "onepass|fulllength"` before starting any audio job; only one at a time.

## Done (5 October)

1. YouTube runs: all finished. Search: 250 found, 302 none, 2 failed (HTTP 403 on every retry). `audio/fulllength.csv` and the status table are committed.
2. Embedding: nothing is marked `reembed`. The 7 wrong-listing albums are embedded from their right listings. The search was tried for Barry Lyndon (nothing found) and A Clockwork Orange (a wrong record taken).
3. CLAP store: written from `clap_mp3` with 10,235 of 10,467 albums (Deezer 6,473, Apple 2,893, YouTube 869), transform refitted, committed.
4. Measurements: `measure.py` and `source_effect.py` rerun with `--model clap_mp3`. Deezer and Apple albums mix at about the genre make-up rate; YouTube albums are not left out of lists, and YouTube seeds still lean towards YouTube albums. Numbers in `experiments/audio_10k/REPORT.md`, section 3.5. Every number is an RYM-based proxy.
5. Listening page: built on the `clap_mp3` store (`experiments/audio_10k/results/listening.html`, local, not committed).

## Left to do, in order

1. Samer listens to the page. He judges CLAP by ear.
2. Step 6, only after his explicit go-ahead: switch `SITE_MODEL` to CLAP, rebuild site data (needs descriptors, covers, thumbnails and listen links for new albums: issue #39), site copy, deploy.
3. Add the experiment's row to the index in `CLAUDE.md` through a documents-only PR to `main` (that file is not on this branch).
4. Keep the board current: #37, #41, #49, #50, #42, #44.

Every store write needs the exclusion, or the two albums below come back:

```bash
python -m rmr_audio.modelstore write --model clap_mp3 --audio-dir audio/clap --exclude Album999417,Album739618
```

## Open items for Samer

- 12 yes/no pairing questions with defaults applied: `docs/audio-10k-pair-questions.md`.
- Two doubtful YouTube picks already embedded: Tatsuro Yamashita "Ride on Time" (edition unknown) and Magma "1001° centigrades" (video 10% shorter than the listing).
- Whether albums already on the site should also get YouTube audio when they had none (currently yes).
- A Clockwork Orange (`Album999417`): the search took "Rollins Band - A Clockwork Orange Stage (2000) [Full Album]". Its 8 windows are still in the local cache and its `fulllength.csv` row says `embedded`. Deleting them from the cache needs his OK; until then `--exclude` keeps the album out of the store.
- Barry Lyndon (`Album739618`): on an unrelated store listing, the search found nothing. Left out of the CLAP store with `--exclude`.
- Okkervil River "Black Sheep Boy" (`Album229104`) and Slum Village "Fantastic, Vol. 2" (`Album30723`): EffNet clips but no CLAP clip (no preview when CLAP was embedded). Not in the CLAP store; `album_status` marks them `embed`.
- Nektar "Remember the Future" (`Album19113`) and Skepticism "Aes" (`sp:2rf4I3JAnmvTqtkZVKcxkv`): the YouTube download failed with HTTP 403. They stay on their preview clips.
- The EffNet store still has the old listings for the 7 corrected albums until a `sync`. `matches.csv` is unchanged on purpose: it records what the EffNet store was embedded from.

## Local-only things that matter

- `data-pipeline/.cache/audio/onepass.sqlite` holds every embedding and is the only copy. Never delete or write it without Samer's OK. The backups beside it (`onepass.before-*.sqlite`) are still there; `onepass.before-rekey.sqlite` holds the 16 same-album doubles of `experiments/audio_10k/results/source_effect.md` and cannot be rebuilt.
- Python environments are in the old worktree `.claude/worktrees/laughing-sinoussi-95fc12` (read-only use; never clean it). yt-dlp is in `data-pipeline/.venv-fetch` in this worktree.
- Laptop rules: one heavy job, `nice -n 19`, mains power for long runs, Deezer about 3 requests/s, iTunes at most 18 calls/min.
