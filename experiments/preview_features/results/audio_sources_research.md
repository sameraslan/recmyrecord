# Audio excerpt sources for a 10k-album catalog: research notes

Date: 2026-10-03. Scope: free, automated, one laptop, clips embedded then discarded.
Legend: **[V]** verified today (API response or the cited page), **[I]** inferred, **[U]** could not confirm.
No audio was downloaded; preview files were only probed with HTTP HEAD (size, content type).

## 1. Comparison table

| Source | Free | Key / account | Automatable | Coverage for RYM top 10k | Excerpt | Terms / legal exposure | Stability |
|---|---|---|---|---|---|---|---|
| **Deezer API** (current primary) | yes | none for public endpoints | yes, ~50 req / 5 s | ~97% with iTunes combined (owner's figure) | 30 s MP3 128 kbps, one per track, position not documented | API ToU: non-commercial only; nothing on bulk/analysis found; previews are Deezer's licensed promo clips | good; dev portal closed to new apps (2025) but keyless endpoints work |
| **iTunes Search API** (current fallback) | yes | none | yes, ~20 calls/min | similar to Deezer, different gaps per storefront | ~30 s AAC; default start 45 s into track unless label sets another | Terms say previews are for promoting store content, "streamed only, not downloaded or cached": the pipeline's fetch-and-discard is outside the letter of this | very stable for 15+ years |
| Apple Music API | no ($99/yr developer programme) | developer token | yes | same catalog as iTunes | same preview assets (`previews[].url`) | Apple Developer agreement | stable |
| Spotify `preview_url` | n/a | app | no | n/a | 30 s | field returns null for apps created after 2024-11-27; scraping embed pages breaks ToS | dead for new apps |
| **YouTube / YT Music via yt-dlp** | yes | none (cookies/PO token increasingly needed) | yes but fragile; ~300 videos/h guest | near 100%, incl. the 2.5% gap and full-length long tracks | full track, any window | **ToS forbids downloading; API policy forbids separating/storing audio; DMCA 1201 argument exists.** Practical risk for a laptop-scale, non-redistributing user: IP throttling/bot checks, account flag if cookies are used; legal action against individual non-distributing users is not something I found precedent for, but it is not zero | breaks every few months, needs yt-dlp updates |
| YouTube Data API | yes (quota 10k units/day) | API key | search/metadata only | high | no audio | fine for finding video IDs; storing audio violates Developer Policies | stable |
| **Internet Archive** | yes | none | yes (advancedsearch + metadata API) | patchy but covers many gap albums as user uploads; all 6 probed albums present | full tracks | uploads of commercial albums are unauthorised user uploads; IA hosts until takedown. Downloading = copying an infringing copy; no ToS barrier to automated access | items disappear on takedown |
| Bandcamp | yes | none (no public API) | scraping only | good for post-2008 indie, ambient, drone, game OSTs, some labels (Constellation = Godspeed) | full-length 128 kbps stream per track | ToS prohibits scraping/automated access; artists chose to stream free, so lower moral exposure, same contractual one | page JSON changes occasionally |
| SoundCloud | yes | API registration restricted; client_id scraping otherwise | partly | mixtapes, DJ mixes, some rap; poor for canon albums | full or 30 s snippet for major-label tracks | ToS prohibits ripping/scraping and third-party AI use of content | medium |
| Qobuz | samples free | app_id by request (api@qobuz.com) or scraped | yes if app_id | strong classical/jazz/Japanese | 30 s sample per track | unofficial use of scraped app_id breaks ToS | medium |
| Tidal API | yes | developer app (client credentials) | yes | large catalog | 30 s preview playback via SDK; raw file URL not clearly exposed [U] | official developer terms | new, changing |
| Amazon Music API | – | closed beta | no | – | – | – | not available |
| Napster API | – | – | no | – | – | service shut down Jan 2026 | dead |
| 7digital API | no | commercial partner key | no | – | 30 s `/clip/{id}` | paid B2B | n/a |
| Last.fm | yes | key | yes | high | **no audio** (metadata, tags, similar) | – | stable |
| Discogs API | yes | token (60 req/min; 25 unauth) | yes | very high | no audio; `videos[]` lists YouTube links per release (curated pointer to YouTube) | data fine; audio inherits YouTube terms | stable |
| MusicBrainz | yes | none (1 req/s) | yes | high | no audio; URL relationships to Bandcamp/IA/streaming pages; track splits per release | CC0/CC-BY-NC-SA data | stable |
| AcousticBrainz | yes | none | dumps | frozen 2022; coverage of canon albums decent, but only where a user submitted | no audio; low/high-level descriptors per recording (no waveform, cannot feed CLAP) | CC0 | frozen; MetaBrainz itself called the data low quality |
| ListenBrainz | yes | none | yes | – | no audio (listening data) | – | stable |
| Jamendo / FMA | yes | key (Jamendo) | yes | ~0% of RYM canon (CC-licensed independents) | full tracks | clean (CC) | stable |

## 2. Deezer previews

- **Length [V]**: HEAD on previews for Long Season (2115 s), Dopesmoker (3809 s), Hot Lava Man, Thick as a Brick Pt. I/II, Pharaoh's Dance, Bitches Brew all returned `Content-Length: 479827`, `audio/mpeg`. 479,827 bytes at 128 kbps = 30.0 s regardless of track length. No longer excerpt for long tracks.
- **Position [U]**: not stated in the API docs, ToU or developer FAQ, and I found no paper stating it. Folk knowledge says the clip starts about 30 s into the track; treat as unverified. Cheap to settle: align Deezer previews against the 20–30 owner-supplied files.
- **Every track has one? [V, small sample]**: all ~80 tracks listed for the four albums had a non-empty `preview`. In general the field can be empty (rights-restricted tracks); the pipeline already sees this.
- **URL expiry [V]**: URLs are signed, e.g. `...mp3?hdnea=exp=1791052305~acl=...~hmac=...`; fetched at 1791051400, so the token lives ~15 minutes. Preview URLs must be fetched fresh, never stored.
- **Rate limit**: 50 requests / 5 s per IP (widely reported; the FAQ only says "there is a query quota") [I]. No rate-limit headers in responses [V].
- **Terms [V]** (developers.deezer.com/termsofuse): use is "strictly limited for a non-commercial purpose"; content otherwise "accessible only up to 30 seconds". The fetched text has no clause on bulk access, caching or audio analysis. FAQ: "Because of legal reasons, we can't provide you with the audio file directly from our API."
- **Different or longer excerpt officially?** No. Full tracks only through SDK playback for logged-in Premium users. Developer portal closed to new apps in 2025 [I, one secondary source].
- Gap check [V]: Deezer album search for MBV "Loveless" returned 0; Godspeed returned no real album.

## 3. iTunes / Apple previews

- **Length [I]**: HEAD on `previewUrl` (`*.plus.aac.p.m4a`): 988 KB–1.39 MB, e.g. Dopesmoker 988,413; Hot Lava Man 997,125; Long Season 1,369,210; Thick as a Brick Pt. 1 1,390,757. At 256 kbps AAC, 30 s is ~960 KB plus container, so these are ~30 s (the larger ones may be VBR or slightly longer; not resolved without reading the file). No sign of 90 s files (~2.9 MB) through the Search API, in us, jp, gb or de.
- **90-second previews**: introduced in the iTunes Store client in 2010 for tracks longer than 2:30 (US first, then other countries); MacRumors reported in 2014 that some were cut back to 30 s. This applies to the store client, not to what `previewUrl` returns [I]. The pipeline can confirm by reading the duration of files it already fetches.
- **Position [V]**: Apple's music package spec, `<preview_start_index>`: "If not specified, the default is 45 seconds for content over 75 seconds in length and 0 seconds for shorter content." Labels may set another start (seconds from track start). So default window is about 0:45–1:15.
- **Rate limit / terms [V]** (performance-partners.apple.com/search-api): "approximately 20 calls per minute (subject to change)". Previews may be used only to promote the store content, with attribution, and "streamed only, not downloaded or cached". Heavier use: Enterprise Partner Feed.
- **Apple Music API**: needs the paid developer programme; `previews[].url` points at the same preview assets [I]; no extra or longer excerpts documented [U, the doc page did not render].
- **Storefronts [V]**: preview asset URLs were identical across us/gb/de/jp for the same collection ID. Different storefronts only help when they carry a different *edition* (e.g. jp has Sleep "Dopesmoker" 2012 edition, collection 516745707, alongside the 2022 remaster 1854884359).

### Do Deezer and Apple previews cover different parts of the same track?
**Not confirmed; probably mostly not usefully.** Apple's default is 0:45–1:15 (documented). Deezer's is undocumented; if the 0:30–1:00 folk figure holds, the two overlap by half and both sit in the first 75 seconds. Where the label set a custom Apple start, the windows differ. Either way, for a 35–60 minute track both stores sample the opening ~1–2% of the piece. The two-store trick gives at most two near-adjacent windows from the intro; it does not fix long-track coverage. Verification needs audio (cross-correlate both previews for ~50 tracks, or locate them in the owner's files), which this task excluded.

## 4. Long single-track albums: what each route yields [V unless marked]

| Album | Deezer | iTunes | Split / alternate editions | Full-length sources |
|---|---|---|---|---|
| **Fishmans, Long Season** | album 69856482, 1 track 2115 s: 1 window | coll. 1416925635 in jp/gb/de, 1 track: 1 window; US search returned nothing | no split edition on either store. Related: live album "Long Season (Live at Akasaka Blitz 1996)" has a 2404 s live take (1 more window, different performance); single "Season" (341 s) is the song the piece grew from | Internet Archive item `fishmans-longseason` carries the piece as 5 parts (523, 324, 394, 287, 589 s), a user upload; YouTube full album |
| **Sleep, Dopesmoker** | album 861597032: Dopesmoker 3809 s + Hot Lava Man: 2 windows, 1 of the title piece | 2022 remaster everywhere; jp also 2012 edition (3814 s + Holy Mountain live) with a different preview asset: possibly a 2nd window, likely same offset [I] | "Jerusalem" (the 6-part 1999 version) is on neither store | IA: 4 user uploads incl. FLAC and a 1994 live take; YouTube full album |
| **Jethro Tull, Thick as a Brick** | 1997 remaster 300263: Pt. I 1360 s, Pt. II 1270 s (+ live, interview) | same (693269577) | **2012 Steven Wilson remix splits the piece into 8 named sections (176–409 s)**: Deezer 6078237, iTunes 1006839794 / 693274351 in us/gb/de. 8 windows spread across the album; solved with stores alone. Also "Edit No. 1" (182 s) on a best-of | IA `jethrotull_thickasabrick_1997remaster`; YouTube |
| **Miles Davis, Bitches Brew** | 645702: 7 tracks (262–1618 s): 7 windows | 168376392: same 7 | not a single-track album; each long track gets 1 window. Legacy Edition (387785709) adds alternate takes and single edits (Spanish Key single 169 s, Miles Runs the Voodoo Down edit 169 s, Great Expectations single 161 s); Deezer has a "Bitches Brew" single edit 160 s (377813347); "Bitches Brew Live" albums | IA `1970-miles-davis-bitches-brew`; YouTube |

General picture:
- **Alternate editions that split the piece** work when they exist (prog remixes, classical movements, deluxe reissues) and cost nothing new: search both stores for all editions of an album and pick the one with the most tracks, or pool windows across editions. Automatable via Deezer `artist/{id}/albums` and iTunes lookup; MusicBrainz release groups list editions and their track splits.
- **Single edits / live versions** add windows but of a different recording; acceptable for timbre, weaker for structure.
- **Multiple storefronts** add nothing unless the edition differs (assets are shared).
- **Two-store trick**: at most +1 window, near the first.
- **Only a full-length source** (owner files, IA, YouTube, Bandcamp) gives windows spread across a 35–60 minute track. For drone, ambient, DJ mixes and one-track albums there is no store-only fix.

## 5. The 2.5% gap

MBV "Loveless" [V: absent from Deezer search and from iTunes US search; "m b v" and the EP compilation are present], Godspeed (not on Deezer/iTunes; streams free and in full on Bandcamp via Constellation [I]), game soundtracks and mixtapes. Candidates in order of exposure: Bandcamp (artist-published stream, ToS forbids scraping), Internet Archive (keyless API, unauthorised uploads; Loveless has 4 items, Lift Your Skinny Fists 2 [V]), YouTube (near-total coverage, ToS forbids downloading). At ~250 albums the volume is small enough that any of these runs in an evening at polite rates.

## 6. Precedent

Using 30-second store previews as research audio is the norm: the Million Song Dataset shipped no audio and researchers fetched 7digital 30 s previews (e.g. Oramas et al. 2017, arXiv:1706.09739; TU Wien MSD benchmarks); Deezer's own research datasets point users to "the 30 seconds track previews ... accessed through the Deezer API" (zenodo.org/records/3648287); Music4All distributes 30 s clips. Larger audio corpora come from YouTube: MTG's Discogs-VI queried YouTube per Discogs version, kept official uploads and downloaded 98% of matches, releasing only URLs and features, features "under request for non-commercial scientific research purposes" (arXiv:2410.17400); AudioSet/DISCO-10M-style sets likewise publish IDs or embeddings, not audio. The Discogs-EffNet and MAEST models were trained on an unreleased "in-house" Discogs-matched set of 3.3–4M tracks (essentia.upf.edu/models.html); MTG does not state its audio source in the pages I read, so "Discogs-linked YouTube audio" for those models is unconfirmed [U]. AcousticBrainz went the other way (users computed features locally from their own files, CC0, stopped in 2022). The shared pattern: fetch from previews or YouTube, keep derived features only, never redistribute audio, which is what recmyrecord already does.

## 7. Sources

- Deezer ToU: https://developers.deezer.com/termsofuse ; FAQ: https://support.deezer.com/hc/en-gb/articles/360011538897-Deezer-FAQs-For-Developers
- Deezer/iTunes API responses: `api.deezer.com/search/album`, `/album/{id}/tracks`; `itunes.apple.com/search`, `/lookup?entity=song&country=..` (queried 2026-10-03)
- Apple preview start: https://help.apple.com/itc/musicspec/en.lproj/static.html
- iTunes Search API terms: https://performance-partners.apple.com/search-api
- 90 s previews: https://appleinsider.com/articles/10/11/02/apple_increasing_us_itunes_music_previews_to_90_seconds ; https://macrumors.com/2014/07/10/apple-cuts-song-previews
- Spotify: https://community.spotify.com/t5/Spotify-for-Developers/Clarification-Needed-Education-Project-Blocked-by-Removal-of/td-p/7203640
- YouTube API policies: https://developers.google.com/youtube/terms/developer-policies ; yt-dlp extractor notes (PO tokens, rate limits): https://github.com/yt-dlp/yt-dlp/wiki/Extractors
- Internet Archive: `archive.org/advancedsearch.php`, `archive.org/metadata/{id}` (queried 2026-10-03)
- Napster shutdown: https://www.digitalmusicnews.com/2026/01/02/napster-music-streaming-shut-down-ai-pivot/
- Amazon Music API beta: https://developer.amazon.com/docs/music/API_web_overview.html
- Tidal previews: https://github.com/orgs/tidal-music/discussions/214
- 7digital clip endpoint: https://github.com/7digital/7digital-API-walkthroughs
- SoundCloud terms/AI: https://techcrunch.com/2025/05/14/soundcloud-backtracks-on-ai-related-terms-of-use-updates/
- AcousticBrainz: https://acousticbrainz.org/
- Discogs-VI: https://arxiv.org/abs/2410.17400 ; Essentia models: https://essentia.upf.edu/models.html ; Discogs metadata paper: https://ismir2022program.ismir.net/poster_243.html
- MSD/7digital: https://arxiv.org/pdf/1706.09739 ; https://www.ifs.tuwien.ac.at/mir/msd/collectionCharacteristics.html
