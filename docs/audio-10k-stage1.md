# Audio for the 10k catalog: stage 1 report

4 October 2026. Branch `feat/audio-10k`. Nothing here is on the site yet.

## Outcome

The catalog went from 4,081 to 10,510 albums. Of the 6,429 new albums, 5,642 (88%) now have preview-clip embeddings from both models, EffNet and CLAP, and 5,471 (85%) have the full four clips. 787 new albums (12%) have no audio at all. Across the whole catalog 9,620 albums have both models and 888 have neither.

Every quality number in this report is store metadata or an RYM-based proxy. Nothing here measures how good the recommendations are for the new albums. The `ambiguous` flag is text similarity between names. Nobody listened to anything.

All numbers come from `data-pipeline/scripts/stage1_report.py` (see Reproduce).

## What ran

| Step | Albums | Time | Result |
|---|---|---|---|
| `match-new --links-only` | 5,625 | 5 h 22 min | 5,084 by link, 451 by text search, 90 unmatched |
| `match-new` (no store link) | 804 | 5 h 33 min | 109 by text search, 695 unmatched |
| Embed, Deezer listings | 2,455 | 2 h 45 min | 9,722 clips ok, 2 too short |
| Embed, Apple listings | 3,073 | 2 h 57 min | 12,131 clips ok, 5 too short |
| Embed, no-link albums | 109 | 7 min | 385 clips ok |

Matching read store metadata only. Embedding ran both models on each clip from one download: 54 to 69 clips a minute, 0.87 to 1.11 s per clip, peak memory 2.7 GB in total (EffNet 0.8 GB, CLAP 0.6 GB plus 1.2 GB on the GPU). The clip cache `onepass.sqlite` is 384 MB and holds 52,402 clips (30,137 imported for the existing albums, 22,265 new). It is gitignored. `matches.csv` now has a row for all 10,510 albums and is committed.

## How the new albums were matched

| Path | Albums | Flagged ambiguous |
|---|---|---|
| Apple link from RYM | 2,675 | 402 |
| Deezer link from RYM | 2,409 | 202 |
| Text search | 560 | 80 |
| Unmatched | 785 | |
| Total | 6,429 | 684 |

2 more albums have a listing with no preview, so 787 have no clip. The edition rule replaced 28 linked listings with the standard edition and 1 with a split edition. By store: Deezer 2,892, Apple 2,752 (US 1,396, the rest in 53 other storefronts).

## Clips per new album

Both models have the same count for every new album.

| Ok clips | Albums |
|---|---|
| 4 | 5,471 |
| 3 | 74 |
| 2 | 55 |
| 1 | 42 |
| 0 | 787 |

All 171 albums with one to three clips have them because the listing has only that many previews. Every preview they have was embedded. No album is short because of a failure: the 7 clips that were too short were each replaced by the next track. One download failed in the last run and succeeded on a retry.

## New albums with no audio

787 albums: 785 with no listing found, 2 with a listing and no preview. 153 of them have a Spotify link.

| Rank band | New albums | No audio | Bandcamp | YouTube | SoundCloud | Any of the three | None |
|---|---|---|---|---|---|---|---|
| 1-1000 | 251 | 23 | 6 | 16 | 5 | 19 | 4 |
| 1001-2500 | 677 | 110 | 30 | 74 | 16 | 84 | 26 |
| 2501-5000 | 1,387 | 232 | 78 | 161 | 27 | 185 | 47 |
| 5001-10000 | 4,114 | 422 | 138 | 317 | 40 | 356 | 66 |
| All | 6,429 | 787 | 252 | 568 | 88 | 644 | 143 |

The link columns count albums whose catalog row has that link from RYM. Nobody checked that the links still work or hold the full album.

The 40 highest-ranked (B = Bandcamp, Y = YouTube, S = SoundCloud):

| Rank | Album | Links |
|---|---|---|
| 14 | Godspeed You Black Emperor!, Lift Yr. Skinny Fists Like Antennas to Heaven! | B |
| 138 | Boris, Flood | Y |
| 307 | Boris with Merzbow, Rock Dream | none |
| 406 | Boredoms, Vision Creation Newsun | Y S |
| 427 | Gris, Il était une forêt... | B Y |
| 459 | Weakling, Dead as Dreams | Y |
| 493 | Mach-Hommy, The Gospel According To... | none |
| 571 | Natural Snow Buildings, Shadow Kingdom | Y |
| 595 | Autechre, AE_LYON_070524 | B Y |
| 598 | Tatsuro Yamashita, Ride on Time | S |
| 657 | Tatsuro Yamashita, For You | none |
| 664 | Odun (1999, Japanese title) | Y |
| 668 | John Fahey, Fare Forward Voyagers | B Y |
| 684 | Godspeed You! Black Emperor, "No Title as of 13 February 2024 28,340 Dead" | B |
| 693 | Tatsuro Yamashita, Joy | Y |
| 713 | Cindy Lee, Diamond Jubilee | B Y |
| 837 | Koji Kondo, The Legend of Zelda: Majora's Mask | Y |
| 863 | Porter Robinson, Secret Sky 2021 | Y |
| 889 | David Wise, Donkey Kong Country 2 | Y S |
| 891 | black midi, Boiler Room London | Y S |
| 932 | Steve Hiett, Down on the Road by the Beach | Y S |
| 936 | Coil, ...And the Ambulance Died in His Arms | Y |
| 956 | Genesis, Archive 1967-75 | none |
| 1002 | Chopin / Martha Argerich, 24 Préludes | none |
| 1011 | Café Tacvba, Revés / Yosoy | none |
| 1024 | Morton Feldman / FLUX Quartet, String Quartet No. 2 | B |
| 1025 | The Rolling Stones, The Brussels Affair | none |
| 1027 | Björk, Livebox | none |
| 1031 | Bach / Tatiana Nikolayeva, Die Kunst der Fuge | none |
| 1056 | DJ Sprinkles, Midtown 120 Blues | none |
| 1096 | Mt. Eerie, Live in Copenhagen | Y |
| 1131 | Hailu Mergia & Walias Band (1985, Amharic title) | Y |
| 1144 | Forward Kwenda, Tadzungaira yepasi | Y |
| 1161 | Yoko Shimomura, Kingdom Hearts II | Y |
| 1196 | Jimi Hendrix, Live at the Fillmore East | none |
| 1199 | György Ligeti, Requiem; Lontano; Continuum | Y |
| 1201 | Beethoven / Wendy Carlos, Clockwork Orange | S |
| 1254 | Beethoven / Emil Gilels, Pathétique; Mondschein | none |
| 1261 | Shostakovich / Borodin Trio, Piano Quintet; Piano Trio No. 2 | none |
| 1270 | Magma, Theusz Hamtaahk Trilogie | B |

## Whole catalog

| | Existing (4,081) | New (6,429) | All (10,510) |
|---|---|---|---|
| EffNet | 3,980 | 5,642 | 9,622 |
| CLAP | 3,978 | 5,642 | 9,620 |
| Both | 3,978 | 5,642 | 9,620 |
| Neither | 101 | 787 | 888 |

- The existing albums' EffNet numbers are the committed store, unchanged: up to 8 clips each (3,182 have 8). Their CLAP embeddings are up to 4 clips each, imported from the genre-crossing run.
- 2 existing albums have EffNet and no CLAP: Okkervil River, *Black Sheep Boy* and Slum Village, *Fantastic, Vol. 2*. Their Deezer listings had no preview when the CLAP run asked (4 `no_preview` rows each). The EffNet clips are from an earlier date.
- No existing album uses local files, so that is not a cause.
- The 101 existing albums with neither are the known ones: no listing with previews, or kept out by hand.

## Short previews

A clip is flagged `short_preview` when it is under 25 s and its track is over 60 s.

- 24 clips of 9 albums are flagged. All are Deezer, all are new albums. 5 albums have all four clips at 10 s: Cerounno & Vinyltracker *De camino al palacio*, Iglooghost *Neō Wax Bloom*, Dead Can Dance *Aion*, Black Devil *Disco Club*, Yann Tiersen *Rue des cascades*. 4 albums have one short clip: Prodigy *The Fat of the Land*, Ave Sangria, Erkin Koray *Elektronik Türküler*, The Field *Looping State of Mind*.
- The flag is only known for the 22,265 stage 1 clips. The 30,137 imported clips of the existing albums have no track length, so they cannot be flagged. 157 of them (108 albums) are under 25 s.
- The `short_preview` column of `matches.csv` is still empty for every row. The flag lives in the cache only.

Clip length, all 52,329 decoded clips: median 30.0 s, 1st percentile 29.9 s, minimum 1.0 s, maximum 30.7 s. 286 clips are under 25 s (Deezer 224, Apple 62) and 100 are under 10 s. Most of these are short tracks, not cut previews.

## Under-covered albums

150 new albums have one to three previews for a listing of 15 minutes or more (1 preview: 28, 2: 51, 3: 71; Apple 80, Deezer 70). These are mostly albums with a few long tracks. The flag was never computed for the existing albums. The 20 highest-ranked:

| Rank | Album | Store | Previews | Minutes |
|---|---|---|---|---|
| 389 | Boris, Performing "Flood" | Apple | 1 | 36 |
| 405 | The Microphones, Microphones in 2020 | Apple | 1 | 45 |
| 593 | Pharoah Sanders, Deaf Dumb Blind | Deezer | 2 | 39 |
| 857 | Billy Harper Quintet, Love on the Sudan | Apple | 3 | 36 |
| 934 | Sleep, Dopesmoker | Deezer | 2 | 72 |
| 1067 | John Coltrane, "Live" at the Village Vanguard | Deezer | 3 | 36 |
| 1124 | Gershwin, Rhapsody in Blue; An American in Paris | Deezer | 2 | 35 |
| 1382 | Charles Mingus, Right Now | Apple | 2 | 47 |
| 1389 | Billy Harper, Knowledge of Self | Apple | 2 | 36 |
| 1390 | Billy Harper Quintet, In Europe | Apple | 3 | 42 |
| 1418 | Fela Kuti, Confusion | Apple | 2 | 32 |
| 1424 | Rachmaninov, Piano Concerto No. 2 (1946) | Deezer | 3 | 30 |
| 1463 | Pharoah Sanders, Izipho Zam | Deezer | 3 | 50 |
| 1684 | Billy Harper Quintet, The Awakening | Deezer | 3 | 41 |
| 1741 | Magma, K.A | Deezer | 3 | 49 |
| 1889 | T.P. Orchestre Poly-Rythmo, Zoundegnon Bernard 'Papillon' | Deezer | 2 | 33 |
| 1910 | Julius Eastman, Femenine (ensemble 0) | Apple | 1 | 71 |
| 1973 | Ustad Bary Fateh Ali Khan, The Music of Islām Vol. 13 | Apple | 3 | 75 |
| 1986 | Celer, Moonbeams Meant for Me | Apple | 3 | 57 |
| 2000 | Zakir Hussain & Shivkumar Sharma, Rāg Madhuvantī | Deezer | 2 | 71 |

## Ambiguous matches

684 new albums are flagged: the listing's title or artist reads unlike the catalog's. That is 15% of the Apple links, 8% of the Deezer links and 14% of the text searches. A linked listing is kept even when flagged, because RYM chose it. By rank band: 52, 156, 190, 286.

A random sample of 40 (seed 1) is printed by the script with both sides' names. My read of it, from the names only:

| Read | Count | Sample numbers |
|---|---|---|
| Looks right. The credit or spelling differs (composer vs performer, soundtrack credited to the studio, a translated title, a renamed band) | 30 | the rest |
| A different edition or a compilation that holds the album | 5 | 8 (Karajan *Eroica*, matched to a 44-track symphony set), 13 (*CSNY 1974*, a 16-track selection), 32 (Distel *La stazione*, matched to *Railnotes*), 33 (The Body Lovers, matched to the two-album set), 37 (Grave, album plus an EP) |
| Cannot tell from the names | 4 | 7 (The Rockwood Escape Plan, listed under Joechillworld), 15 (Martinho da Vila), 22 (Art Blakey, *A Night in Tunisia*, several albums share the title), 31 (Old and New Dreams, two self-titled albums) |
| Wrong | 1 | 30 (Motor City Drum Ensemble, *Raw Cuts Vol. 1*, matched to a one-track single) |

So about 1 in 40 looks plainly wrong and about 1 in 4 is not a clean match. The sample is small: on 684 albums that is a rough guide, not a rate. The earlier hand audit of the existing albums found about a third of ambiguous matches wrong, by listening. This sample is easier on the matcher because most new matches come from RYM's own links.

## Duplicate listings

35 store listings are matched to two catalog albums each (70 albums). 34 involve a new album. The classes below are my reading of names and years.

**(a) The same album twice: an off-chart placeholder and a chart row left unpaired (10).** The existing album has an `sp:` key and the new chart row is very likely the same record. Pairing them in `keys.csv` removes the duplicate.

| Existing (`sp:`) | New chart row | Rank | In `doubtful_pairs.csv` |
|---|---|---|---|
| Ichiko Aoba, 0% (2014) | Ichiko Aoba, 0 (2013) | 297 | yes |
| Max Roach, We Insist! (1961) | same (1960) | 1175 | yes |
| Quilapayún, Cantata de Santa María de Iquique (1970) | Santa María de Iquique - Cantata popular (1970) | 2302 | no |
| Global Communication, 76:14 (1994) | 76:14:00 (1994) | 2351 | yes |
| Lucifer's Friend, Lucifer's Friend (1970) | same (1971) | 4045 | yes |
| No Trend, Too Many Humans (1984) | same (1983) | 4889 | yes |
| Scald, Will of Gods Is a Great Power (1996) | same (1997) | 5173 | yes |
| Fairport Convention, What We Did on Our Holidays (1969) | same (1968) | 6129 | yes |
| LCD Soundsystem, 45:33 (2006) | 45:33: Nike+ Original Run (2006) | 7583 | yes |
| Irish Coffee, Irish Coffee (1972) | same (1971) | 8517 | yes |

**(b) Two real RYM entries, one release in the store (12).** Both albums get the same clips, so they will be each other's nearest neighbour.

- One store listing combines two albums (7): Death Grips *Jenny Death* and *Niggas on the Moon* (as *The Powers That B*); Zappa *Joe's Garage Act I* and *Acts II & III*; Virgin Steele *Marriage of Heaven and Hell* parts one and two; Virgin Steele *House of Atreus* acts I and II; Blue Effect *Nová syntéza* and *Nová syntéza 2*; Art Ensemble of Chicago *Les stances à Sophie* and *People in Sorrow*; Misfits *Earth A.D.* and *Die Die My Darling*.
- Two editions of one album (5): Coltrane *Ascension* editions I and II; Meshuggah *Nothing* (2002 and the 2006 re-recording); Boris *Dronevil* (2005 and 2025); Hiroshi Yoshimura *Green* (two entries, 1986); Koopsta Knicca *Da Devil's Playground* (1994 tape and 1999 release).

**(c) Probably a wrong match for one side (13).**

| Listing | Right for | Probably wrong for |
|---|---|---|
| Keith Jarrett, The Köln Concert | The Köln Concert | Solo-Concerts: Bremen and Lausanne (new, search) |
| Seatbelts, Cowboy Bebop | Cowboy Bebop (1998) | Yoko Kanno & Seatbelts, Cowboy Bebop (2002) (new, search) |
| Mingus, Pithecanthropus Erectus | the 1956 album | Charlie Mingus, Pithycanthropus Erectus (1971) (new, search) |
| The Knife, Silent Shout | Silent Shout | Silent Shout: An Audio Visual Experience (new, search) |
| La La Land (soundtrack) | La La Land, rank 4744 | La La Land, rank 9023, a second RYM entry (new, search) |
| billy woods, Golliwog | Golliwog | billy woods & August Fanon, Gowillog (new, search) |
| Genesis, Seconds Out | Seconds Out | Genesis, Live (1973) (existing `sp:`, already flagged ambiguous) |
| Killing Joke (2003) | Killing Joke (2003) (new) | Killing Joke (1980) (existing `sp:`) |
| Tindersticks | unclear | first album (1993, existing) or second (1995, new, Deezer link) |
| Glass, Einstein on the Beach | unclear | 1979 recording (existing) or 1993 recording (new, Apple link) |
| Utopia (soundtrack) | unclear | Utopia (2013, existing) or Utopia² (2014, new) |
| Karajan, Beethoven Symphony No. 9 | unclear | the 1963 or the 1984 recording (both new, both Apple links) |
| Anaïs Mitchell, Hadestown | Hadestown (2010) | Original Broadway Cast (2019) (new, Apple link) |

Three of these show an existing album that may have had the wrong audio all along (Killing Joke 1980, and possibly Tindersticks 1993 and Einstein 1979). Eight of the 25 pairs in (b) and (c) are also in `doubtful_pairs.csv`.

## What did not add up

- The last embed log ends with 384 ok and 1 download failed. The cache has 385 ok for that run: the failed clip was fetched again one minute later. The totals match the run totals after that.
- The cache holds 22,258 stage 1 clips per model. The three logs add up to 22,238. The other 20 are from a short smoke run of 6 albums before the first logged run (the Deezer log starts with "6 complete").
- The no-link match log ends with 803 albums and one failure (Ligeti, *Requiem; Lontano; Continuum*). It was run again and is now recorded as unmatched, which gives 785 unmatched and 787 without a preview.
- `tests/test_rekey.py` had one check that required `matches.csv` to hold exactly the 4,081 old albums. It had been failing since the first 5,625 rows were committed. It now requires those albums to be present. Both test suites pass.

## What this does not tell us

- Whether a match is the right recording. Linked listings are not verified. Names were compared, nothing was played.
- Whether recommendations for the new albums are any good. No recommendation was built or scored with the new embeddings.
- Whether four clips are enough. For the existing albums, going from four to eight EffNet clips changed about half of each album's sonic list.
- Whether the frozen transform, fitted on 3,980 albums, suits a catalog two and a half times the size with a different genre mix.
- Whether the Bandcamp, YouTube and SoundCloud links work or hold full albums.
- How the 787 albums without audio would behave if imputed. The imputation settings were tested on the old catalog only.
- The new albums have no descriptor rows in the feature table, no covers and no map positions yet. Stage 1 covers audio only.

## Decisions waiting on the owner

1. **Stage 2 top-up to 8 clips.** 5,307 new albums have five or more previews (4,522 have eight or more). Topping them up needs about 19,800 more clips for both models, roughly 5 to 6 hours at the stage 1 rate. Bringing CLAP for the existing albums up to their EffNet clip count needs about 13,800 more CLAP clips (3,701 albums). Run both, one, or neither?
2. **Transform refit.** The transform is frozen and was fitted on the old catalog. Refit on all albums with audio, and after or before the top-up? A refit moves every map position.
3. **The 787 albums with no audio.** You have allowed free full-length sources. 644 have a Bandcamp, YouTube or SoundCloud link (Bandcamp 252, YouTube 568, SoundCloud 88); 143 have none. 23 are in the top 1,000. Options: fetch from those links and use the window sampler for full-length files, impute from descriptors as today, or leave them out of the sonic side. Which sources, and in what order of preference?
4. **Doubtful pairs and class (a) duplicates.** `doubtful_pairs.csv` lists 190 pairs: 101 left unpaired by default, 89 paired. The 10 class (a) duplicates are the clearest: pairing them removes 10 double albums. The 13 class (c) pairs need a look, three of them on existing albums.
5. **Class (b) duplicates.** Keep both RYM entries with identical audio, or keep one?
6. **Ambiguous matches.** 684 new and 149 existing. Review all, only the top ranks (52 are in the top 1,000), or accept them?
7. **CLAP as the similarity model.** CLAP now covers 9,620 of 10,510 albums, the same albums as EffNet but two. The case for CLAP is in the genre-crossing report, on the old catalog. Stage 1 adds coverage, not evidence. Confirm CLAP, or keep both until something is measured on the new albums?

## Reproduce

```bash
cd data-pipeline
.venv/bin/python scripts/stage1_report.py            # all numbers above; --seed and --sample for the ambiguous sample
```

It reads the committed files, the clip cache and the logs under `.cache/`. It needs the machine that ran stage 1, because the cache and logs are not committed. No network, no model, nothing written.
