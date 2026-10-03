# Audio gaps at 10,000 albums: recommended policy

3 October 2026. Design only; nothing built, no audio fetched. Inputs: `audio_sources_research.md`, `rym10k_sheet_audit.md`, `edge_cases_audit.md` (read in full, 242 lines, 14:25 version), `imputation.md`, `clip_length.md`, the design spec, `rmr_audio/`, and the cached sheet rows. Checks made for this note: counts on `scratch/rym10k.csv`, five store metadata lookups, ten YouTube title lookups, five Internet Archive searches.

**M** = measured, **E** = estimated from measured rates, **A** = assumed.

## The two problems in numbers

| | Today | At 10,000 | |
|---|---|---|---|
| No preview on any store | 101 (2.5%) | 600–750 (6–7%) | M / E |
| 1–3 windows for the whole album | 145 (27 / 50 / 68 with 1 / 2 / 3) | about 360 | M / E |

New rows by the store links RYM lists (M), with the full-length links the same rows carry:

| RYM links | New rows | Expected no preview (E) | Bandcamp | YouTube, no Bandcamp | No full-length link |
|---|---|---|---|---|---|
| Deezer | 2,450 | ~7 | – | – | – |
| Apple, no Deezer | 3,122 | ~63 | 1,073 | 519 | 1,339 |
| Spotify only | 138 | ~51 | 32 | 41 | 63 |
| None of the three | 658 | ~444 | 221 | 347 | 81 |

So of the ~500 gap albums in the last two rows, about a third have a Bandcamp album link and about half a YouTube link only.

## A. Albums with no preview: tiered policy

1. **Stores, used better (free, inside normal API use). Resolves ~50–80 (A).**
   - Read the album id and storefront from the sheet's Deezer and Apple links and look the album up directly (the `forced()` path that `match_overrides.json` already uses), before any text search. Checked (M): an Apple id resolves only in the storefront of its link. `720457097` returns 11 tracks with previews in `jp` and nothing in `us`; `208038050` works in `ru`, not `us`. About 1,300 of the 3,122 Apple-only new rows link to a storefront other than us, gb or de, which the matcher does not search. The audit's 2% rate for this group was measured on the current catalog and cannot see this, so without the direct lookup the gap is likely larger than 600–750.
   - For rows with no store link: add `jp` (146 of the 658 are non-Latin, mostly Japanese), then `br`, `fr`, searched with `artist_latin` / `title_latin` as well as the native name.
   - Direct lookup also removes most ambiguity for 5,572 rows, which matters because new albums have no Spotify duration fingerprint.
2. **Bandcamp, through the sheet's own link. Resolves ~170–230 (E).** All 221 links in the no-store group are `/album/` pages (M). The page carries a 128 kbps stream URL per track; windows can be read with HTTP range requests, so the whole file is never fetched. No matching step: RYM's link is the match. Robust except when the page format changes (a few times a year) or a track is not streamable.
   Exposure: Bandcamp's terms prohibit automated access and scraping. The audio is what the artist or label chose to stream free in the page. The breach is contractual; the practical consequence is an IP block. About 200 albums, at most 8 windows each, once.
3. **Internet Archive by search, then YouTube through the sheet's link. Resolves ~250–350 of what is left (A).**
   - Internet Archive: keyless API, no terms barrier to scripted access. No link in the sheet, so it needs a search and the same title/track-count scoring as a store match. 4 of the 5 highest-ranked leftover albums have an item (M, tiny sample: Rock Dream, Midtown 120 Blues, Tatsuro Yamashita For You, Mach-Hommy; not clearly Cowboy Bebop). Exposure: these are unauthorised user uploads of commercial records; fetching from one is copying from an infringing source, and "private, transient, non-commercial" is not a defence everywhere. Items vanish on takedown.
   - YouTube: 520 of the 658 no-store rows have a link (M). Of 10 sampled, 8 resolved and all 8 were the full album as one video, 7 from third-party uploaders; 2 were dead (M, small sample). `yt-dlp --download-sections` fetches only the chosen time ranges. Exposure: YouTube's terms forbid downloading, the API policies forbid separating audio, and there is an anti-circumvention argument (DMCA 1201) on top; most linked uploads are themselves unauthorised. Practical risks: bot checks, IP throttling, yt-dlp breaking every few months. Never pass account cookies. Realistic rate is a few hundred albums over several evenings.
   - If only one of the two is accepted: YouTube alone covers more (links exist); the Archive alone leaves roughly 150–250 imputed.
4. **Owner files, 20–30 albums.** Rule in A.4 below.
5. **What is left: ~40–100 albums, about 1% (A).** Keep the imputed block (k=3, rescaled), as today. That is a smaller share than today's 2.5%.

**The project's stance so far** (fetch, embed, discard; non-commercial) lowers the exposure of every tier and removes none of it. The baseline is not zero either: Apple's terms say previews are "streamed only, not downloaded or cached". One thing changes with tiers 2–3: `matches.csv` and the shard `source` field are committed, so the repository would say publicly which albums came from Bandcamp, the Archive or YouTube. Decide whether to record that in the committed store or only in the local cache.

### A.3 What breaks at 7% imputed that did not at 2.5%

Measured in `imputation.md` (k=3, rescaled, 137 albums = 3.4%):
- An imputed album's sonic list shares 8% with its true list (overlap 0.083); primary-genre share 0.151 against 0.246. At the balanced stop 42%. Its sonic recommendations are not from its sound at all.
- Imputed albums land in more lists than real ones (N10 mean 13.9 against 10.1, max 49) and recommend each other 2.9 times more than chance (own kind 0.097 against 0.034).

At 7% (E/A): about 700 seeds with a sonic list that is descriptor-derived; they would take roughly 9–10% of all sonic slots; own-kind share rises towards 20% if the 2.9× ratio holds, more where the gap albums bunch (video game music, black metal, Japanese pop, ambient). The new rows also carry at most 8 descriptors (6.3 in the 120 columns, 477 rows with three or fewer) against 10.8 in the experiment, so the imputation will be worse than measured. And it breaks the owner's rule that similarity comes from the sound.

Recommendation: with tiers 1–3 accepted the remainder is ~1% and imputation stays as is. If tiers 2–3 are declined, keep the 500–650 albums as seeds but drop them from the candidate set at the sonic and balanced stops (a mask in the build; they stay candidates at the mood stop, where audio barely counts). Leaving them out of the catalog is the cleaner alternative; it loses albums such as Loveless and Lift Your Skinny Fists.

### A.4 Which albums the owner supplies

One list, sorted by RYM rank, printed by `rmr_audio status`:
1. Albums no automated tier resolved (if tiers 2–3 run), or all no-preview albums (if they do not). Top of today's list with no store or full-length link: Boris with Merzbow "Rock Dream" (307), Mach-Hommy "The Gospel According To..." (493), Tatsuro Yamashita "Ride on Time" (598) and "For You" (657), Café Tacvba "Revés / Yosoy" (1011), DJ Sprinkles "Midtown 120 Blues" (1056), Cowboy Bebop (1069), Hendrix "Live at the Fillmore East" (1196).
2. Albums with one or two windows and 20+ minutes that no split edition or accepted full-length tier fixed.
Take the top ~20 of (1) and ~10 of (2). If tier 3 is accepted, (2) is empty and all 30 go to (1).

## B. Long albums with one to three tracks

**How wrong is it (B.4).** Measured in the audit, EffNet block: albums with 1–3 clips score −0.04 to −0.05 on descriptor agreement after genre adjustment (0.4 SD across albums); at 1 clip the genre-family share drops 0.23 and 30% appear in nobody's list (1% normally). Cutting 8-clip albums down to 1 clip reproduces it (31% of the top 10 kept, 21% in no list), so the cause is the clip count. At 4 clips the harm is gone. Low coverage with 8 clips (box sets, 15+ minutes per clip) shows no harm. Not measured anywhere: whether 8 windows inside one 35-minute track differ from 1; every test compares clips of different tracks. For drone or ambient the gain may be smaller than the table suggests.

So the problem is real but narrow: about 190 albums with 1–2 windows and about 360 with 1–3 at 10,000 (E), concentrated in free jazz, minimalism, drone, afrobeat and Indian classical.

1. **Split editions (stores only, do it). Resolves perhaps 20–40 of the 360 (A).** For an under-covered album, list the artist's albums (the matcher already does) and take the same-titled listing with the most tracks whose total runtime is within about 15% of the matched one. Thick as a Brick goes from 2 windows to 8. The sheet link can also point at a split listing: the linked "Music for 18 Musicians" has 14 tracks (M), so the audit's genre-based count of few-track albums may be high for classical and minimalism.
   Do not pool another performance (a live take, a single edit) by default. It adds a window of a different recording, room and mix; the vector then describes two things and nothing says which. Use it only by hand, through an override, when nothing else exists.
2. **More windows from the stores: no.** Deezer is one 30 s file per track (M). Apple's default window is 0:45–1:15. "Two stores, two windows" gives at best a second window inside the first 75 seconds, and 2 windows are still in the harmed range (−0.040; 8.7% in no list). Confirming it needs both previews of ~50 tracks cross-correlated in memory. Not worth a test of its own. The offsets fall out for free once owner files exist (locate each preview in the full file).
3. **Full-length source, N windows, for the under-covered albums only (recommended if tier 2 or 3 is accepted in A).** Same sources and the same exposure as A, at about 360 albums. Sampling: `n = clamp(round(runtime / 5 min), 4, 8)` windows of 30 s, shared between tracks in proportion to duration, evenly spaced inside each track (centres at (i + 0.5) / n), none in the first or last 15 s, ordered so that fewer windows are a prefix of more. Always fetch 8 so a later policy change needs no second fetch. When the album also has store previews, replace them; do not mix sources in one mean until the source check under "Open risks" is done.
4. **If full-length sources are declined:** split editions, the flag below, and ~10 of the owner's files. The rest stay as they are; that is 3% of the catalog recommended less often and a little worse, not a broken site.
5. **Rule for "under-covered"** (all fields are in `matches.csv` and the track listing):
   - `under_covered`: fewer than 4 windows and listing runtime of 15 minutes or more (the runtime test keeps real EPs and singles out; 30 of today's few-track listings are under 15 minutes).
   - `severe`: 1–2 windows, or 3 windows with a track of 20+ minutes.
   - Separate flag `short_preview`: a window under 25 s from a track over 60 s (36 albums today, e.g. four Dead Can Dance albums with 10-second previews).
   - A coverage ratio (clip seconds / album seconds) is the wrong trigger: below 2% it marks box sets that measure fine.
   Today: about 115 under-covered (E from M counts); at 10,000 about 330.

**Required whatever is decided:** `rmr_audio sync --local-dir` takes one 30 s excerpt per file (`embed.excerpt_window`). A single-file "Long Season" supplied by the owner would still give one window. The sampler in B.3 has to apply to local files; it is the same code the full-length tiers need.

## C. One pass

Conflicts with "embed everything while the audio is in memory":
- **Today's pipeline is two passes.** `rmr_audio` embeds EffNet only; `clap_catalog.py` fetches the same previews again for CLAP, and skips `source = local` rows because a local file cannot be fetched again. For previews a second fetch is only API load. For owner files and tiers 2–3 it must not happen: one worker should decode once (44.1 kHz mono) and run EffNet and CLAP on the same buffer. The two models live in different environments (Essentia with numpy<2; torch), so this is either one environment that holds both or a parent process that pipes the decoded buffer to two children. On 16 GB, run these tiers with one worker.
- **Keep per-window embeddings for both models**, not only album means, so re-pooling or a new window count needs no fetch. The cache is local and gitignored; for albums from full-length sources and owner files, back it up or commit it (a few MB), since losing it means fetching again.
- **Split-edition pooling changes the listing id**, and the cache is keyed by listing. Run it before the big 10k sync, not after, or those albums are fetched twice.
- **Fetch the maximum (8 windows) once** even if the policy averages fewer.
- **The two-store test** would hold two previews per track in memory together; no conflict if nothing is written.
- CLAP takes three 10 s sub-windows of each 30 s clip; unchanged by any of this.

## Rejected

| Option | Why |
|---|---|
| SoundCloud links | 72 in the no-store group, user "full album" uploads; same exposure as YouTube, worse automation, nearly all also on YouTube |
| Qobuz, Tidal, Apple Music API | Key by request, unclear raw preview URL, or $99 a year; 30 s per track either way |
| Spotify previews | Field is null for new apps |
| AcousticBrainz | No waveform, frozen in 2022; cannot feed CLAP or EffNet |
| Pooling live or alternate takes automatically | Different recording; mixes two sounds in one vector |
| Two-store windows | At most one more window, in the intro |
| Coverage ratio as the trigger | Flags box sets with no measured harm |
| Whole-file downloads from full-length sources | Range requests fetch 4 minutes per album and less data leaves the source |
| YouTube Data API for audio | Metadata only; storing audio breaks its policies |

## Decisions for the owner

| Decision | Recommendation |
|---|---|
| Direct lookup from sheet links, plus `jp`/`br`/`fr` | Yes. No new exposure, and it protects ~1,300 rows the matcher would search in the wrong storefronts |
| Bandcamp tier | Yes: artist-published streams, RYM's own link, about 200 albums |
| Internet Archive tier | Yours to weigh: easiest to automate, unauthorised copies |
| YouTube tier | Yours to weigh: widest coverage, clearest terms breach, most fragile |
| Record the source of each album in the committed store | Keep `source` coarse (`full`) in committed files, exact source in the local cache |
| Remainder with no audio | Impute if about 1%; seed-only at sonic and balanced if 5% or more |
| Long albums | Split editions now; N windows from whichever full-length tiers you accept; otherwise flag and hand files |
| Hand files | Top ~20 unresolved by rank, ~10 severe long-track cases |
| One environment for EffNet and CLAP | Needed before any full-length or local-file run |

## Open risks

- **Source shift.** Windows spread through a file include quiet openings and endings that label-chosen previews avoid, and codecs differ (128 kbps MP3, Opus, AAC). Albums could group by source. Check on the first owner files: embed store previews and spread windows of the same album and compare the two means against the 8-clip spread measured in the audit.
- **Coverage estimates per tier are thin.** The 67.5% no-preview rate rests on 27 of 40 albums; the YouTube and Archive figures on samples of 10 and 5.
- **Link rot and wrong targets.** 2 of 10 YouTube links were dead; one linked a live set under a studio album's row. A runtime check against the store or MusicBrainz length is needed before sampling.
- **Archive matching.** No link, so the search can pick a different edition or a partial upload; score it like a store match and mark doubtful ones ambiguous.
- **Track counts are unknown for new rows** until the matcher runs, so the ~360 figure is by genre only.
- **CLAP not audited.** All harm figures are EffNet; the few-clip effect is assumed to carry over.
- **Deezer preview offset** is still unverified; it does not affect this policy.
