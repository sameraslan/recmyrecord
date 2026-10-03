# RYM top-10,000 sheet: audit against the catalog

Read on 3 October 2026 through the Google Sheets connector (read-only; the sheet was not changed).
Spreadsheet "RYM Top Albums of 2026", tab "🔟 Top 10K Chart" (gid 1463770381). The rows are in
`experiments/preview_features/scratch/rym10k.csv` (gitignored, not committed).

Findings only. **M** = measured on the data, **E** = estimate, **J** = judged by reading names.

## Headline numbers

| | | |
|---|---|---|
| Sheet rows | 10,000, ranks 1 to 10,000 with no gaps | M |
| Catalog albums the sheet's own flag finds | 3,604 of 4,081 | M |
| Sheet rows that are new to the catalog | 6,368 flagged `missing`; about 6,400 after flag errors | M / J |
| Catalog albums with no row in the sheet | 477 by the flag; about 465 to 485 after flag errors | M / J |
| New rows with a Spotify link | 5,595 of 6,368 (87.9%); 773 have none | M |
| Descriptor names per row | 8 at most, ordered, no votes or weights, vocal tags removed | M |
| Of those names, in the 120 recommender columns | 6.3 per new row on average (catalog rows carry 10.8) | M |
| New rows with a non-Latin artist or title | 683 (10.7%); catalog: 37 (0.9%) | M |
| New albums likely to get no preview | about 565 (range 430 to 690); catalog today: 101 | E |
| New albums likely to match ambiguously | about 300 to 400; catalog today: 149 | E |
| New albums with three tracks or fewer | about 220; catalog today: 145 | E |

## 1. What is in the sheet

Four tabs:

| Tab | Rows | What it is |
|---|---|---|
| 🎧 Top 2026 | 40 | This year's chart, a display table: genre family, mood and other descriptors split, "Open on RYM" link text. |
| 🔟 Top 10K Chart | 10,000 | The audited tab. 26 columns. |
| 🕳️ Missing from RecMyRecord | 6,407 | Exactly the main tab's rows whose flag is not `yes` (6,368 `missing` + 39 `likely`), same columns. |
| 🏆 All-Time Top | 83 | A richer scrape of the top 83 only: full descriptor list (16 to 76 names), scenes, languages, tags, track count, runtime, tracklist with durations, cover URL. |

Columns of the main tab (fill = non-empty cells of 10,000):

| Column | Fill | Holds |
|---|---|---|
| rank | 10,000 | 1 to 10,000 |
| artist, title | 10,000 | 5,372 artists. Native script where RYM has it. Credits joined with " & " |
| in_recmyrecord | 10,000 | `yes` 3,593, `likely` 39, `missing` 6,368 |
| recmyrecord_match | 3,632 | "Artist - Title" of the matched feature-table row (raw artist string, glued member names included) |
| released_2022_plus | 10,000 | `yes` 627 |
| type | 10,000 | `Album` 9,998, `Compilation` 1, `Additional releases` 1. No live, archival, EP or mixtape marker |
| release_date, release_date_iso | 9,999 | Full date 6,623, year and month 2,066, year only 1,310 |
| rym_rating | 10,000 | 3.50 to 4.40, median 3.74 |
| rating_count | 10,000 | Exact below 1,000; rounded to thousands above ("109,000") for 6,531 rows |
| review_count | 9,934 | |
| primary_genres | 9,992 | 1 to 3 names, comma-separated, 911 distinct |
| secondary_genres | 8,888 | 2.4 names on average |
| top_descriptors | 9,987 | Up to 8 names, comma-separated (below) |
| spotify_url | 9,169 | Always an `/album/` link |
| apple_music_url | 9,122 | Always an album link; storefront varies (us 5,143, ru 608, ca 598, gb 558, pl 266, ...) |
| deezer_url | 4,682 | Album link |
| bandcamp_url, youtube_url, soundcloud_url | 3,561 / 3,214 / 3,562 | |
| rym_url, rym_id | 10,000 | Unique. `AlbumNNN` ids |
| artist_latin, title_latin | 548 / 487 | Romanised name where the original is not Latin script |
| retrieved_at | 10,000 | 1 to 3 October 2026 |

No MusicBrainz id, no track count, no runtime, no tracklist, no cover URL, no language or country
column on the main tab.

**Descriptors (M).** Names only, no votes or weights. The order is meaningful: on the 83 rows that
the All-Time tab also has, `top_descriptors` equals the first eight of RYM's full ordered list after
removing the vocalist tags in 77 of 83 cases. `male vocalist`, `female vocalist` and
`androgynous vocals` never appear. Rows with fewer than eight names: 1,038 (13 have none).
361 distinct names over 76,867 tokens.

## 2. Overlap with the catalog

How matched. The sheet carries its own match (`in_recmyrecord`, `recmyrecord_match`). I resolved
each match label back to a feature-table row and checked it two independent ways: Spotify album id
(sheet link against catalog `URI`) and folded artist + title (`genres.py` `norm`, artists through
`clean_artist`).

| | Rows | |
|---|---|---|
| Sheet rows flagged `yes` or `likely` | 3,632 | M |
| ...whose label is a row of the 4,081-album catalog | 3,604 (all distinct albums) | M |
| ...whose label is one of the 35 table rows the URI dedupe drops | 28 | M |
| Of the 3,604: confirmed by Spotify id or by artist + title | 3,522 | M |
| Of the 3,604: matched some looser way | 82 | M |
| Catalog albums no sheet row is matched to | 477 | M |
| Sheet rows flagged `missing` | 6,368 | M |

Reliability (J, from reading the lists):

- The 3,522 confirmed matches are sound, except where several albums share a name (Tim Maia has
  four self-titled albums on the chart, Caetano Veloso three, Elis Regina three): one is flagged,
  the others are `missing`, and nothing in the sheet says the flag chose the right one.
- **The 28 are not in the site catalog.** They were lost when the table was deduped on URI because
  their URI was another album's: Led Zeppelin's debut (shares IV's URI), Led Zeppelin III, The
  Velvet Underground (third album), Band of Gypsys, Twin Peaks: Fire Walk With Me, Saturation III,
  Solo Monk, Escalator Over the Hill. The sheet calls them `yes`.
- Of the 82 looser matches, at least 9 are the wrong album: a sequel or another edition matched
  to the original (Hollow Knight: Silksong, Made in Abyss 3, Kingdom Hearts II, Musas Vol. 1,
  Program Music I, Utopia², Watching From a Distance: Live at Roadburn, Silent Shout: An Audio
  Visual Experience, Nelson Cavaquinho "Série documento").
- Of the 39 `likely`, at least 11 are wrong: title-only matches across artists (Neil Young's Live
  at the Fillmore East to Hendrix's; Sutcliffe Jugend's Relentless to Bill Hicks's; Galneryus to
  Halford; Dexter Gordon to Sinatra; Derek & The Dominos to Dead Can Dance) or another recording of
  a classical work (The Nutcracker under Rattle to Gergiev's; Die Kunst der Fuge by Nikolayeva to
  the Keller Quartett's; Shostakovich quartets by the Emerson to the Alban Berg Quartett's).
- 55 rows flagged `missing` collide with a catalog album by Spotify id (36) or by artist + title
  (19). 13 of them point at a catalog album no row is matched to, so the album is in the catalog
  and the flag missed it (Springsteen Live/1975-85, John Mayer Where the Light Is, Pärt Te Deum
  and Da pacem, Tim Maia Racional vol. 1, Hades, Woodstock, Cabaret). The other 42 point at a
  catalog album already matched to a different row: either the true match (Hollow Knight, Made in
  Abyss, Silent Shout, Koyaanisqatsi 1983) or a different album sharing a name or a Spotify link.

Net: about 6,400 sheet albums are new (6,368 + 28 + about 20 wrong matches, less about 25 false
`missing`), and about 465 to 485 catalog albums are not on the chart.

**Catalog albums missing from the sheet (M).** Of the 477, 247 come from rows 5,001 to 5,560 of
the original scrape, the supplementary charts whose ranks restart at 1 to 80; the sheet's chart is
type `Album` only, so those kinds are absent by construction. Examples: Jar of Flies, Hi Scores,
Street Halo, Fall Be Kind, The White EP, A Day in the Life, Almighty So, Back From the Dead 2,
LCD Soundsystem 45:33. The other 230 were in the old top 5,000 and are not in today's top 10,000
(Ryan Adams Heartbreaker, Minor Threat, Butthole Surfers, Wayne Shorter The Soothsayer, Magma Live,
801 Live). Whether they are dropped is not something the sheet decides: a catalog rebuilt from the
sheet alone loses them; one that appends the sheet's new rows keeps them and ends near 10,480.

## 3. What the pipeline needs that the sheet lacks

**Album key (M).**
- 773 new rows have no Spotify link; 658 have none of Spotify, Apple or Deezer; 81 have no link of
  any kind.
- The sheet's Spotify id is not the catalog's key. Of 3,574 matched rows with a Spotify link, the
  id equals the catalog `URI` for 2,391 and differs for 1,157 (another edition). A join on Spotify
  id finds 2,434 of the catalog; the same album would get a second key.
- 11 pairs of rows share one Spotify link (Ascension Edition I and II; Joe's Garage Act I and
  Acts II & III; Trilogie de la mort and Kyema; Karajan's Beethoven 5 and Pastorale; both House of
  Atreus acts). The build dedupes on the key, so one of each pair would vanish, as the 28 did.

**Descriptors (M).** The table has 176 descriptor columns, of which the recommender scales 120
(56 lyric and theme columns are dropped).
- The weights are not votes. In 4,024 of 4,081 rows the non-zero weights are exactly
  1.5 − (rank − 1)/42 down the album's RYM descriptor list. So an ordered list is the input the
  table was built from, but the rank counted every descriptor including the vocalist tags.
- Catalog rows carry 13.4 descriptors on average (10.8 within the 120); 64% have more than eight
  within the 120. Ranks nine and below hold 40% of all descriptor weight in the table. The sheet
  stops at eight.
- Vocabulary: 158 of the sheet's 361 names are table columns (97.9% of tokens); 107 are among the
  120 (82.4% of tokens). A new row has 6.3 names inside the 120 on average; 477 have three or
  fewer, 22 have none.
- 13 of the 120 columns can never be filled from the sheet: `male vocals` (non-zero for 2,900
  catalog albums, mean weight 1.40), `female vocals` (549), `androgynous vocals`, `chamber music`,
  `opera`, `symphony`, `string quartet`, `oratorio`, `rock opera`, `waltz`, `mashup`, `jingle`,
  `lyrics`. 79% of catalog albums have a vocals column set.
- Renamed on RYM since the scrape: `LGBT` → `LGBTQ`, `hedonistic` → `hedonism`,
  `anti-religious` → `antireligious`, `satanic` → `satanism`, `male vocals` → `male vocalist`.
- 203 sheet names have no column (2.1% of tokens): jamming 82, harsh vocals 61, unaccompanied
  solo 45, bright 41, theatrical 36, maximalist 32, smooth 29, microtonal 27, socialism 26.
- Drift: for matched albums, 89.5% of the sheet's in-vocabulary names are non-zero in the catalog
  row, the first descriptor is the same in 52%, and the order agrees in 8%. The lists have moved
  since the scrape, so a sheet-built row would not reproduce an existing row.
- The design doc's point stands: no code produces new rows of `all_data_norm.pkl`.

**Other inputs the build or the audio stage uses (M, from the code and the design doc).**
- The matcher recognises an edition by the Spotify album's mean track duration and by track-count
  consistency (`catalog.py` `mean_s`, `means`, `count_fits`, read from `all_data.pkl`). The sheet
  has no track count, runtime or durations, so every new album would run as `override=True`: text
  only, no duration fingerprint. Only 19 catalog albums run that way today (1 ambiguous, 4 with no
  match), too few to size the effect.
- The matcher takes one cleaned artist string. The sheet joins composer, performer and conductor,
  and also ordinary collaborators, with " & " (853 rows; 188 with three or more parts), the same
  character as in band names (Nick Cave & The Bad Seeds).
- Cover sprite and cluster id come from the personal-site map inputs; the sheet has no cover URL
  (the 83-row All-Time tab does). The thumbnail sheet holds 4,096 albums.
- The 13 Spotify audio columns do not exist for new albums (the build accepts NaN there).
- The sheet does hold direct store links for new rows: Deezer for 2,450, Apple Music for 5,553.
  The Apple links are spread over many storefronts; the matcher searches us, gb and de.

## 4. How the new albums differ

Genre family (first primary genre through `genres.py`; catalog side from the old scrape). 357 of
the sheet's 911 genre names did not exist in the old scrape and fall through the family rules
untested; 393 new rows lead with one.

| Family | Catalog | % | New | % |
|---|---|---|---|---|
| rock | 1,050 | 25.7 | 1,306 | 20.5 |
| metal | 615 | 15.1 | 1,001 | 15.7 |
| jazz | 487 | 11.9 | 649 | 10.2 |
| folk & country | 380 | 9.3 | 477 | 7.5 |
| pop | 280 | 6.9 | 434 | 6.8 |
| hip hop | 276 | 6.8 | 339 | 5.3 |
| punk | 144 | 3.5 | 397 | 6.2 |
| soul & funk | 144 | 3.5 | 182 | 2.9 |
| electronic | 129 | 3.2 | 283 | 4.4 |
| soundtrack | 121 | 3.0 | 268 | 4.2 |
| latin & world | 116 | 2.8 | 256 | 4.0 |
| blues | 105 | 2.6 | 87 | 1.4 |
| classical | 92 | 2.3 | 343 | 5.4 |
| ambient | 60 | 1.5 | 161 | 2.5 |
| reggae | 31 | 0.8 | 61 | 1.0 |
| experimental | 26 | 0.6 | 104 | 1.6 |
| spoken & comedy | 23 | 0.6 | 12 | 0.2 |

The largest single genres among the new rows: Progressive Rock 153, Video Game Music 142,
Singer-Songwriter 141, Black Metal 112, Post-Hardcore 100, Avant-Garde Jazz 85, MPB 81.

| Decade | Catalog % | New % | New rows |
|---|---|---|---|
| 1950s and earlier | 2.5 | 1.3 | 83 |
| 1960s | 10.6 | 5.9 | 375 |
| 1970s | 23.1 | 15.8 | 1,007 |
| 1980s | 13.1 | 10.2 | 647 |
| 1990s | 21.0 | 17.8 | 1,131 |
| 2000s | 18.0 | 21.7 | 1,379 |
| 2010s | 9.7 | 15.2 | 965 |
| 2020s | 1.9 | 12.3 | 780 |

- 619 new rows are from 2022 or later (53 from 2026); the catalog stops in 2022.
- Depth: 4,104 of the new rows rank below 5,000. Median rating count 1,000 against 4,000 for the
  rows already in the catalog; 1,298 new rows have under 500 ratings.
- Release type: the sheet does not say. The old scrape tagged 331 catalog albums Live and 117
  Archival. By title, 223 new rows read as live and 23 as bootleg or archive series.
- Script: 683 new rows have a non-Latin artist or title (CJK 448, of which kana 315; Cyrillic 102;
  Hangul 26; Greek 14; Arabic 11; Ethiopic 7; Hebrew 5) against 37 in the catalog. 22.8% of new
  rows have a non-ASCII character against 6.8%. `artist_latin` or `title_latin` covers all but 11
  of the 734 non-Latin rows.
- Region, by genre name anywhere in the row (new / already in catalog): Japanese 205 / 7,
  Brazilian 260 / 83, Hispanic 189 / 68, African, Middle Eastern and Asian 161 / 62.

## 5. Likely matching trouble

Current catalog, from `matches.csv` (M): 101 unmatched (no previews), 149 ambiguous, none both.
Sources: Deezer 3,754, iTunes us 204, gb 20, de 2.

| Kind | Catalog albums | No preview | % | Ambiguous | % | New rows of this kind |
|---|---|---|---|---|---|---|
| Non-Latin title or artist | 37 | 4 | 10.8 | 5 | 13.5 | 683 |
| Classical family | 92 | 4 | 4.3 | 27 | 29.3 | 343 |
| Soundtrack, film, game, TV | 154 | 9 | 5.8 | 20 | 13.0 | 324 |
| Various Artists | 14 | 0 | 0.0 | 6 | 42.9 | 44 |
| Multi-artist credit | 222 | 10 | 4.5 | 25 | 11.3 | 651 |
| Archival wording in title | 67 | 8 | 11.9 | 2 | 3.0 | 117 |
| Live wording in title | 190 | 8 | 4.2 | 9 | 4.7 | 222 |
| Self-titled | 206 | 7 | 3.4 | 15 | 7.3 | 299 |
| Title of three characters or fewer | 65 | 4 | 6.2 | 2 | 3.1 | 145 |
| Hip hop (mixtapes sit here) | 276 | 15 | 5.4 | 7 | 2.5 | 339 |
| Punk | 144 | 9 | 6.2 | 5 | 3.5 | 397 |
| Experimental | 26 | 2 | 7.7 | 2 | 7.7 | 104 |
| None of the kinds above the hip hop row | 2,477 | 41 | 1.7 | 55 | 2.2 | 3,371 |

Kinds overlap. Ambiguity concentrates in classical, Various Artists, soundtracks and multi-artist
credits; missing previews in non-Latin, archival, punk, hip hop and experimental. Every risky kind
is a larger share of the new rows than of the catalog; the non-Latin kind grows eighteenfold.

The strongest predictor of a missing preview is not a kind but whether RYM lists a store link
(matched rows, M):

| Links on the RYM page | Catalog albums | No preview | % | Ambiguous % | New rows |
|---|---|---|---|---|---|
| Deezer | 2,217 | 6 | 0.3 | 2.4 | 2,450 |
| Apple Music, no Deezer | 1,328 | 27 | 2.0 | 4.1 | 3,122 |
| Spotify only | 19 | 7 | 36.8 | 21.1 | 138 |
| None of the three | 40 | 27 | 67.5 | 17.5 | 658 |

**Estimates for the 6,368 new rows (E).**

| Method | No preview | Ambiguous |
|---|---|---|
| Catalog rate applied flat (2.5%, 3.7%) | 158 | 233 |
| By genre family | 172 | 295 |
| By rating count | 169 | 396 |
| By store links (× classical or soundtrack for ambiguity) | 565 | 383 |

- No preview: about 565, range 430 to 690. I take the link-based figure because the other methods
  cannot see that 796 new albums have no Apple or Deezer link, against 59 in the catalog. The
  range is the binomial uncertainty of the two small cells (27 of 40, 7 of 19). At 10,000 albums
  that is roughly 600 to 750 albums with an imputed audio block, six to seven times today's 101.
- Ambiguous: about 300 to 400 new, so 450 to 550 in all against 149. This is a floor: the new
  albums have no Spotify durations, so the duration fingerprint that settles editions today is
  unavailable, and that effect could not be measured (19 such albums in the catalog).
- Not determinable from the sheet: whether an album with no RYM store link is truly absent from
  Deezer and iTunes (RYM links are user-added), and how many albums are on Japanese or other
  storefronts the matcher does not search.

## 6. Likely clip trouble (estimate)

The clip policy takes up to eight 30-second previews per album, one per track. An album of one to
three tracks gives one to three clips, each a sliver of a 20 to 60 minute piece.

Calibration (M): in the catalog 27 matched albums have one track, 76 have two or fewer, 145 three
or fewer, 275 four or fewer (of 3,980). By genre group, share with three tracks or fewer:
afrobeat 69% (13 albums), minimalism, tape and electroacoustic 27%, free and spiritual jazz 25%,
drone and dark ambient 18%, ambient and Berlin school 12%, western classical 5%, everything else
1.4%.

Applied to the new rows (E): **about 115 albums with two tracks or fewer, about 220 with three or
fewer, about 400 with four or fewer.** The sheet has no track counts, so this rests on genre alone.

| Group (primary genres) | New rows | Est. ≤ 3 tracks | Named examples |
|---|---|---|---|
| Drone, dark ambient | 104 | 19 | Boris Flood and Feedbacker; Éliane Radigue L'île re-sonante and Kyema; Natural Snow Buildings; Roland Kayn Infra and Tektra; Bull of Heaven; The Caretaker Everywhere at the End of Time Stage 6 |
| Minimalism, tape, electroacoustic | 113 | 30 | Music for 18 Musicians (four recordings); Julius Eastman Femenine (two); Reich Drumming; Xenakis Persepolis; Pousseur Paysages planétaires |
| Free, spiritual jazz | 124 | 31 | Coltrane Ascension (both editions) and Interstellar Space; Alice Coltrane Carnegie Hall Concert; Albert Ayler Holy Ghost; Pharoah Sanders Izipho Zam |
| Ambient, Berlin school | 165 | 19 | Manuel Göttsching E2-E4 (one piece) |
| Indian classical | 17 | 6 | Zia Mohiuddin Dagar Raga Yaman; Nikhil Banerjee Afternoon Ragas; Ali Akbar Khan Morning & Evening Ragas |
| Afrobeat | 20 | 14 | Fela Kuti Confusion, Afrodisiac, He Miss Road, Alagbon Close, Kalakuta Show |
| Western classical | 334 | 18 | Single works in few movements; also the opposite case, long multi-disc sets |
| Noise | 26 | few | Merzbow, Incapacitants, Hijokaidan, C.C.C.C. |
| Everything else | 4,844 | 67 | |

Long live sets are the other shape: Grateful Dead (24 rows, mostly Dick's Picks), Phish LivePhish,
King Gizzard Live at Red Rocks '22, The Complete Live at the Plugged Nickel, The Complete Matrix
Tapes. They run past the matcher's 30-track "oversized" line (87 catalog albums do today) and
eight clips cover little of them. DJ mixes are rare: 12 new rows are mashup or plunderphonics
albums (Neil Cicierega, Eccojams); none is a club mix by title.

## 7. Data quality

| Finding | Count | |
|---|---|---|
| Duplicate `rym_id` or `rym_url` | 0 | M |
| Rows sharing artist + title with another row | 64 in 29 groups | M |
| Rows sharing a Spotify link / Apple link | 22 in 11 pairs / 20 in 10 pairs | M |
| Same artist, one title extending another (edition, live version, sequel) | 87 pairs | M |
| Type not `Album` | 2: Sonny Boy (Compilation), The Great Lost Kinks Album (Additional releases) | M |
| No genres | 8, all 2026 releases (Pugnello, Hotel Usona, Popstar, Decay, ...) | M |
| No descriptors / fewer than eight | 13 / 1,038 | M |
| No release date / not a full date | 1 (Kossoy Sisters) / 3,376 | M |
| Artist spelled two ways across rows | 25 artists | M |
| Artist under native script in some rows and Latin name in others | 10 artists, 16 rows | M |
| Romanisation in brackets inside the artist field | 12 rows | M |
| Classical rows crediting the composer alone | 179 of 427 | M |
| Broken encoding, stray whitespace | 0 | M |

- The 29 same-name groups are different albums, not duplicate rows: self-titled series (Tim Maia
  ×4, Caetano Veloso ×3, Elis ×3, Peter Gabriel, Killing Joke 1980 and 2003), re-recordings (Twin
  Fantasy 2011 and 2018, Goldberg Variations 1956 and 1982) and separate recordings of one work
  (Mozart Requiem ×4 credited "Mozart & Süssmayr" with no performer, Matthäus-Passion ×2,
  Koyaanisqatsi 1983 and 1998). Artist + title cannot tell them apart; only year or `rym_id` can.
- Same album twice under two editions: Boris Smile (2008, two rows), La La Land (2016, two rows),
  吉村弘 Green (1986, two rows), Ascension Edition I and II, Dronevil and Dronevil -Example-,
  Feedbacker and Bootleg -Feedbacker-.
- Live twins of studio albums: Björk Post, Homogenic, Vespertine and Vulnicura each with a "Live"
  row; If You're Feeling Sinister: Live at The Barbican; Colors_Live; Sung Tongs Live.
- Not albums in the strict sense, by title (no EPs or singles; the chart excludes them):
  bootleg and archive series 26 (Dick's Picks, LivePhish, Bob Dylan Bootleg Series), box or
  "complete" sets 14 (The Complete Matrix Tapes, Webern Complete Works), compilation wording 10,
  demos 4 (Life Demo Two to Five), one audio-visual release (Silent Shout: An Audio Visual
  Experience). No DVD row.
- Artist naming is inconsistent: 山下達郎 and Tatsuro Yamashita, 山岡晃 and Akira Yamaoka,
  ボアダムス [Boredoms], Belle and Sebastian and Belle & Sebastian, Zappa and Frank Zappa, DOOM and
  Doom. Soundtracks credit composers the catalog does not (Bach & 鷺巣詩郎 for The End of
  Evangelion, Chopin & Disasterpeace for FEZ).
- Title annotations in brackets that stores do not carry: The Beatles [White Album], Led Zeppelin
  [IV], ★ [Blackstar], Weezer [Blue Album] (78 rows with a bracket or edition word).

## Could not determine

- Track counts, runtimes and continuous-piece structure of the new albums (not in the main tab).
- Whether albums without RYM store links are on Deezer or iTunes at all.
- The release type of the 477 catalog albums the sheet lacks, beyond the scrape's Live and
  Archival tags.
- Which of several same-named albums each `yes` flag really refers to.
- How much ambiguity rises without the Spotify duration fingerprint.
- Language or country of an album, other than through script and genre names.
