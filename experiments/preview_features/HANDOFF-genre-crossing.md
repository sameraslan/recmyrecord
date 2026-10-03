# Handoff: make the sonic stop cross genres

Written 3 October 2026 for a fresh session. Read this, then `REPORT.md` in this folder, then `docs/superpowers/specs/2026-10-02-preview-audio-design.md`.

## Where things stand

recmyrecord's recommender used 13 Spotify audio features plus RYM mood descriptors. Spotify retired the features. Two pieces of work replaced them:

- **Experiment** (draft PR 24, branch `experiment/preview-features`): 30-second preview clips from Deezer and iTunes, embedded with Essentia's Discogs-EffNet, give more coherent neighbours than Spotify's features. Evidence in `REPORT.md`.
- **Implementation** (draft PR 25, branch `feat/preview-audio`, stacked on the experiment): the pipeline now builds `recs.json` and `positions.json` from a committed embedding store. 3,980 of 4,081 albums have audio at up to eight clips. Not merged, not deployed.

The audio block in use ("D64"): per-clip EffNet embedding (1,280 numbers) → album mean → L2 → PCA 64 → scaled to the old Spotify block's total variance.

## The problem the owner found

Looking at Miles Davis, *Bitches Brew* at the sonic stop: every recommendation is jazz. The old Spotify-based list included prog rock, which he thinks was right. At the balanced stop the list is what he expects (*Live-Evil*, *Get Up With It*, Embryo's *Rocksession*: jazz-rock, not pure jazz).

What he wants, in his words:

- Similarity "purely from the music itself", so the site finds connections that genre labels and human co-listening would not.
- Same-genre recommendations are fine, "but not always". People should be led beyond the seed's genre.
- No artist identity, origin or other metadata in the audio side. RYM mood descriptors are a separate, welcome input, but will not exist for every album.

## Why it happens

The model's only input at run time is audio. The lock-in comes from training: Discogs-EffNet learned by predicting about 400 Discogs genre and style labels, so its embedding space is organised around genre.

The experiment then made it worse by how it kept score. One of the main measures was "share of the top 10 with the seed's primary genre", and EffNet won partly on that. For the owner's goal that measure rewards the wrong thing. He agrees it was a reasonable measure, just not the whole target.

Numbers from the 1,000-album bake-off (two clips per album, `results/bakeoff_eval.md`):

| Model | Trained on | Same primary genre | RYM descriptor similarity |
|---|---|---|---|
| Discogs-EffNet (in use) | Genre and style labels | 0.180 | 0.420 |
| CLAP, music and speech | Audio paired with text | 0.141 | 0.414 |
| MusiCNN | Listener tags | 0.134 | 0.402 |
| MERT-v1-95M | Audio only, no labels | 0.088 | 0.360 |
| Spotify features (full catalog, for scale) | – | 0.092 | 0.345 |

CLAP keeps most of the descriptor agreement with less genre lock-in. MERT is the purest "music only" model but agrees least on mood. Nothing here measures cross-genre quality directly.

The "artist-contrastive" EffNet variant in the bake-off was trained to recognise same-artist clips. It is not in use and should stay out, given the owner's brief.

## The task

Find an audio representation whose sonic-stop neighbours reach outside the seed's genre while still agreeing on how the music feels. Proof of concept on cached data first. Do not change the site or the store until the owner picks.

### 1. Build the measurement first

The owner endorsed this as the core measure: **neighbours outside the seed's genre that still agree on RYM descriptors.** Suggested set, all computable with `simbench.py` and `genres.py`:

- **Out-of-genre descriptor agreement.** Rank only candidates outside the seed's genre family, take the top 10, and report their descriptor cosine against the out-of-family random floor. This removes genre from the comparison entirely.
- **How far the plain top 10 reaches.** Share outside the seed's primary genre and outside its family; number of distinct families per list.
- **Quality of the crossings.** Descriptor cosine of the out-of-genre members of the plain top 10, against the in-genre members.
- **Keep the existing checks** (overall descriptor cosine, same-artist-removed, hubness) so a candidate that crosses genres by being random is caught. A shuffled block crosses genres perfectly.
- **Anchor cases by ear.** *Bitches Brew* should surface *Live-Evil*, *Get Up With It*, *Rocksession* and some prog. Add a dozen more seeds.

Caveats to state in the write-up: RYM descriptors correlate with genre themselves; and every measure is still a proxy, so the listening page is the real test.

### 2. Candidates

1. **EffNet as it is** (baseline).
2. **Other models:** CLAP music-and-speech, MERT (try early and middle layers separately: early layers are more about timbre), MusiCNN.
3. **EffNet with genre removed.** Options: subtract each genre family's mean; project out the directions that predict genre (linear nullspace projection, fitted out-of-fold by artist); or project out the span of the Discogs-400 classifier head's weights (`genre_discogs400-discogs-effnet-1` on essentia.upf.edu), which needs no RYM labels and so works for new albums.
4. **Blends.** An embedding plus the Essentia "feel" scores (energy, danceability, arousal, acousticness) or the Ridge "Spotify-like" block. Variants `E` and `F` in `variants.py` already do this at one weight; sweep the weight.
5. **Ranking-side idea, lower priority:** diversify the top 10 using the embedding itself (for example maximal marginal relevance). It changes the rule "recommendations are the nearest on the map", so treat it as a separate option.

Whatever wins must work for a new album from audio alone. A method that needs the album's RYM genre at run time does not qualify; using RYM genres to *fit* a fixed projection is fine.

### 3. Deliverables

- A short report with the measurement table per candidate and a recommendation.
- A listening page (an Artifact, like the first results page) with *Bitches Brew* and the other seeds side by side per candidate, with Spotify links.
- Only then, on the owner's say-so: a new store or transform and a site rebuild.

## What is cached, and where

Everything below is in this worktree, gitignored, and must be opened read-only. **Do not delete this worktree**: it holds the only copies.

Worktree: `/Users/saslan.19/Desktop/Tengs/reCreck/recmyrecord/.claude/worktrees/laughing-sinoussi-95fc12`

| Path under the worktree | Contents |
|---|---|
| `experiments/preview_features/cache/features.sqlite` | 16,618 clips, 3,944 albums, four clips each (all tracks for a 150-album subset). Per clip: `effnet` (1,280), `musicnn` (200), and `scalars` JSON (tempo, key, loudness, mood heads, arousal/valence, danceability). Keyed by `row` = row index in `all_data_norm.pkl`. |
| `experiments/preview_features/cache/bakeoff.sqlite` | 1,000 albums × 2 clips: `clap_music`, `clap`, `mert` (9,984 = 13 layers × 768), and the contrastive EffNets. Load with `bakeoff.bakeoff_load(model, prio_below)`; it also serves `effnet` and `musicnn` on the same clips, and `mert_l0`…`mert_l12`, `mert_mid`. Rows in `results/bakeoff_rows.txt`. |
| `experiments/preview_features/cache/match.sqlite` | Album → Deezer/iTunes matches and track lists. |
| `data-pipeline/.cache/audio/clips.sqlite` | 30,137 clip rows for the production store: EffNet only, up to eight clips per album, keyed by Spotify URI. |
| `data-pipeline/audio/` (committed) | The production store and `transform.npz`. |

Model weights for CLAP and MERT were deleted to save disk; their embeddings are cached only for the 1,000 bake-off albums. Running CLAP over the whole catalog means re-downloading the 776 MB checkpoint (`laion/larger_clap_music_and_speech`; `laion/larger_clap_music` is untrained, do not use it) and about 30,000 clips at roughly 0.3 s each on the Apple GPU, plus downloads. Do the comparison on the 1,000 albums first.

Environments, usable by absolute path: `experiments/preview_features/.venv` (analysis, Essentia), `.venv-torch` (CLAP, MERT), `data-pipeline/.venv` (build), `data-pipeline/.venv-audio` (audio stage).

Code to reuse: `simbench.py` (`score`, `compare`, floors, hubness), `genres.py` (RYM genres, families), `variants.py` (blocks A–F, variance matching), `learned.py` (out-of-fold projections by artist), `bakeoff_eval.py`, and `evaluate.py` for `seeds.md`/`seeds.json`.

## Rules that applied here and still apply

- **The laptop is the owner's working machine.** It overheated and ran out of disk on day one. At most two worker processes, `nice -n 19`, one heavy job at a time; check free disk and memory first. Torch models on the Apple GPU kept the CPU cool. Other Claude sessions often run at the same time.
- **Use subagents for the legwork**; the main session plans and reviews.
- **Do not message a subagent that is waiting on its own background job.** Resuming it killed and restarted a two-hour run.
- **Site copy needs the owner's sign-off.** The About panel still says sound values come from Spotify; proposed wording is in PR 25.
- **No audio is ever stored or committed.**
- Open PRs freely; never merge or deploy without being asked.

## Open items from the implementation, unrelated to this task

- 101 albums have no previews and are imputed from mood neighbours; local files can fill them (`rmr_audio sync --local-dir`).
- 149 matches are flagged ambiguous in `data-pipeline/audio/matches.csv`.
- Lists still move as clips are added (four to eight clips changed about half of each sonic list).
- Catalog growth still needs new feature-table rows, the map pipeline for covers, and a bigger thumbnail sheet.
