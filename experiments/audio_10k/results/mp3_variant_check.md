# The MP3 round trip as a stored variant (`clap_mp3`), checked on the catalog

Generated 2026-10-04 by `mp3_variant_check.py`. **Stored vectors and RYM-catalog proxies. Nobody listened to anything.** Target shares are computed for the pool of each table.

## Verdict

The MP3 round trip brings the 250 Apple-sourced albums to the make-up target and is adopted as the CLAP recipe for every source that is not Deezer.

- **Apple-sourced albums:** 5.7% of their neighbours are Apple-sourced, equal to the 5.7% make-up target (stored vectors: 46.1%; pair map: 7.8%; EffNet: 6.0%). Deezer seeds get 2.91% Apple-sourced neighbours against a 3.68% target (stored: 0.44%; pair map: 2.78%; EffNet: 3.01%).
- **Probe:** a matched probe reads 0.602 (stored 0.985, pair map 0.557, EffNet 0.491), so a little store signal may remain; the intervals of the two fixes overlap.
- **The two fixes agree:** album vectors from the round trip and from the pair map have cosine 0.973.
- **YouTube (19 albums, direction only):** with the round trip a YouTube album appears in 5.7 lists on average instead of 2.1 (10 is even), and the window probe falls from 0.930 to 0.732. The pair map cannot be applied to YouTube audio, which is the main reason to prefer the round trip.
- **Cost:** every Apple clip (about 11,600) is downloaded again, at 1.64 s per clip, about 5.3 hours. All 984 re-fetched clips reproduced their stored baseline vector exactly, so the stores still serve the same audio.

These are stored vectors and RYM-catalog proxies. Nobody listened.

## 1. The catalog: the picked iTunes albums in the pool of every Deezer album

Pool: 6,871 albums = 6,621 Deezer-sourced (their `clap_mp3` vector is their `clap` vector; 2,869 new, 3,752 existing) + 250 iTunes-sourced new albums (3.6% of the pool). Picked 250, 250 have a `clap_mp3` vector, 250 of them over exactly the clips the `clap` mean is over. `Make-up`: the share of the picked albums among the pool's other albums with the seed's first genre (and genre x decade): what a list that ignored the store would hold. Interval: 95%, resampling the 250 seeds.

| Vectors of the picked albums | iTunes neighbours of the picked albums (n seeds) | 95% interval | make-up: genre / genre x decade | iTunes neighbours of Deezer seeds (n) | make-up | new Deezer seeds | existing Deezer seeds | Lists a picked album is in (mean; in none) |
|---|---|---|---|---|---|---|---|---|
| `baseline (clap as stored)` | 46.1% (250) | 42.8% to 49.3% | 5.7% / 6.2% | 0.44% (6,621) | 3.68% / 3.62% | 0.45% | 0.44% | 5.78; 10 |
| `pair map (residual, lambda 1)` | 7.8% (250) | 6.6% to 9.0% | 5.7% / 6.2% | 2.78% (6,621) | 3.68% / 3.62% | 3.09% | 2.54% | 8.14; 9 |
| `clap_mp3 (round trip)` | 5.7% (250) | 4.6% to 6.9% | 5.7% / 6.2% | 2.91% (6,621) | 3.68% / 3.62% | 3.10% | 2.77% | 8.29; 8 |
| `EffNet (four-clip means)` (6,871 albums, 250 picked) | 6.0% (250) | 5.0% to 7.2% | 5.7% / 6.2% | 3.01% (6,621) | 3.68% / 3.62% | 3.27% | 2.81% | 8.58; 2 |
| `clap_mp3 on these albums` (6,871 albums, 250 picked) | 5.7% (250) | 4.6% to 6.8% | 5.7% / 6.2% | 2.91% (6,621) | 3.68% / 3.62% | 3.10% | 2.77% | 8.29; 8 |

An album is in ten lists on average when nothing sets it apart. The make-up for Deezer seeds is over the seeds with a genre; the picked albums are new, so existing Deezer seeds (the site's albums, other genres and ranks) have a lower make-up than new ones.

## 2. Can a probe still tell the picked albums from Deezer albums?

Logistic regression on the standardised unit album vectors (512 numbers), C 0.01, five folds with an artist kept together. `Matched`: the picked albums against new Deezer albums, one for one within first genre x decade. 0.5 = cannot tell.

| Vectors of the picked albums | flagged vs new Deezer albums matched 1:1 on first genre x decade | flagged vs every new Deezer album | matched, on the 64-number block |
|---|---|---|---|
| `baseline (clap as stored)` | 0.985 ± 0.009 (n 183 / 183) | 0.989 ± 0.007 (n 250 / 2869) | 0.986 ± 0.012 (n 183 / 183) |
| `pair map (residual, lambda 1)` | 0.557 ± 0.067 (n 183 / 183) | 0.689 ± 0.052 (n 250 / 2869) | 0.512 ± 0.075 (n 183 / 183) |
| `clap_mp3 (round trip)` | 0.602 ± 0.065 (n 183 / 183) | 0.776 ± 0.038 (n 250 / 2869) | 0.545 ± 0.047 (n 183 / 183) |
| `EffNet (four-clip means)` | 0.491 ± 0.069 (n 183 / 183) | 0.652 ± 0.036 (n 250 / 2869) | 0.462 ± 0.020 (n 183 / 183) |
| `clap_mp3 on these albums` | 0.602 ± 0.065 (n 183 / 183) | 0.776 ± 0.038 (n 250 / 2869) | 0.545 ± 0.047 (n 183 / 183) |

## 3. Do the two fixes agree?

250 picked albums, unit album vectors. `Moves`: the cosine between (clap_mp3 minus baseline) and (pair map minus baseline): 1 if both fixes push an album the same way.

| Pair | Cosine: mean (median; 10th to 90th percentile) |
|---|---|
| clap_mp3 and pair map | 0.973 (0.979; 0.950 to 0.989) |
| clap_mp3 and baseline | 0.796 (0.805; 0.673 to 0.913) |
| pair map and baseline | 0.809 (0.818; 0.729 to 0.887) |
| the two moves from the baseline | 0.935 (0.956; 0.892 to 0.977) |

clap_mp3 is nearer the pair-mapped vector than the baseline vector for 239 of 250 albums. Shared neighbours of ten, picked albums as seeds: clap_mp3 and pair map 6.7, clap_mp3 and baseline 1.8, pair map and baseline 1.81. Deezer seeds: clap_mp3 and pair map 9.79, clap_mp3 and baseline 9.66, pair map and baseline 9.67.

Mean cosine of a picked album to its ten nearest Deezer albums (512 numbers): baseline (clap as stored) 0.745, pair map (residual, lambda 1) 0.877, clap_mp3 (round trip) 0.877, Deezer albums among themselves (new Deezer seeds) 0.883.

## 4. RYM proxies for the picked albums as seeds

Share of the ten neighbours with the seed's first primary genre / genre family, and the mean Jaccard overlap of top descriptors. A proxy for sounding alike, not a measure of it; a list with more Deezer albums in it draws on a pool twenty-six times larger, so these can rise for that reason alone.

| Vectors | genre_primary | genre_family | desc_jaccard | Deezer seeds: genre_primary | desc_jaccard |
|---|---|---|---|---|---|
| `baseline (clap as stored)` | 0.124 | 0.519 | 0.174 | 0.185 | 0.193 |
| `pair map (residual, lambda 1)` | 0.177 | 0.560 | 0.189 | 0.187 | 0.194 |
| `clap_mp3 (round trip)` | 0.181 | 0.552 | 0.190 | 0.187 | 0.194 |

## 5. YouTube audio (small n: direction only)

19 of the 20 picked albums already embedded from a YouTube video were fetched again and their windows embedded for `clap_mp3` (the same windows: 19). Pool: 6,621 Deezer albums + 19 YouTube albums (0.29%).

| Vectors of the YouTube albums | Lists a YouTube album is in (mean; median; in none) | YouTube neighbours of Deezer seeds | make-up (genre) | YouTube neighbours of YouTube seeds | Mean cosine to the ten nearest Deezer albums | Window probe: YouTube windows vs Deezer clips, AUC | genre_primary of YouTube seeds |
|---|---|---|---|---|---|---|---|
| `baseline (clap as stored)` | 2.05; 1; 2 | 0.050% | 0.290% | 2.63% | 0.757 | 0.930 ± 0.033 (n 152 / 161) | 0.170 |
| `clap_mp3 (round trip)` | 5.74; 4; 1 | 0.160% | 0.290% | 1.58% | 0.830 | 0.732 ± 0.071 (n 152 / 161) | 0.112 |

A YouTube album's `clap_mp3` vector is at cosine 0.891 (median 0.902) with its `clap` vector; 18 of 19 albums are nearer their ten nearest Deezer albums with it. New Deezer albums sit at 0.883 from their ten nearest Deezer albums. Window probe: YouTube windows against clips of new Deezer albums of the same first genre x decade (up to five albums per YouTube album), grouped by album; 41 Deezer albums. An album is in ten lists on average.

## 6. Sanity with the real model

- **Deezer copy.** 12 clips of 3 albums copied by `rmr_audio.onepass copy`: 12 have the `clap` row's embedding to the byte, 12 its status, origin {'copy:clap': 12}.
- **iTunes clips against the experiment.** 10 paired tracks of 4 albums fetched again and embedded by the pipeline's CLAP child: cosine of the pipeline's `clap_mp3` with the experiment's `mp3st` vector of the same track: lowest 1.0, median 1.0; of its `clap` with the experiment's `base`: lowest 1.0, median 1.0.

| Album | Track | Store | clap_mp3 vs experiment mp3st | largest absolute difference | clap vs experiment base | clap_mp3 vs its own clap | experiment: mp3st vs base |
|---|---|---|---|---|---|---|---|
| Album35041 | 79023439 | itunes:us | 1.000000 | 0.000000 | 1.000000 | 0.9049 | 0.9049 |
| Album35041 | 79023495 | itunes:us | 1.000000 | 0.000000 | 1.000000 | 0.8637 | 0.8637 |
| Album35041 | 79023509 | itunes:us | 1.000000 | 0.000000 | 1.000000 | 0.8420 | 0.8420 |
| Album185430 | 1722339997 | itunes:ar | 1.000000 | 0.000000 | 1.000000 | 0.8917 | 0.8917 |
| Album185430 | 1722340000 | itunes:ar | 1.000000 | 0.000000 | 1.000000 | 0.9374 | 0.9374 |
| Album185430 | 1722340004 | itunes:ar | 1.000000 | 0.000000 | 1.000000 | 0.7562 | 0.7562 |
| Album188617 | 1358511393 | itunes:us | 1.000000 | 0.000000 | 1.000000 | 0.9753 | 0.9753 |
| Album188617 | 1358512311 | itunes:us | 1.000000 | 0.000000 | 1.000000 | 0.8768 | 0.8768 |
| Album188617 | 1358512326 | itunes:us | 1.000000 | 0.000000 | 1.000000 | 0.9418 | 0.9418 |
| Album28235 | 1079243377 | itunes:us | 1.000000 | 0.000000 | 1.000000 | 0.9026 | 0.9026 |

## 7. The runs

`--check-baseline`: each clip fetched for `clap_mp3` was also embedded for `clap` and compared with the stored `clap` vector (nothing of it stored). At 1.0 the store still serves the audio the baseline was made of.

| Source | Clips | Median cosine | 5th percentile | 1st percentile | Lowest | Under 0.999 | Under 0.99 | Under 0.9 |
|---|---|---|---|---|---|---|---|---|
| itunes | 984 | 1.00000 | 1.00000 | 1.00000 | 1.00000 | 0 | 0 | 0 |
| youtube | 152 | 1.00000 | 1.00000 | 1.00000 | 1.00000 | 0 | 0 | 0 |

The cache now holds, for `clap_mp3` (source / status / origin): deezer / ok / copy:clap: 12; itunes / ok / onepass: 984; youtube / ok / onepass: 152. Baseline clips whose preview was gone: 0 (of 0 albums); `clap_mp3` clips that have no `clap` row (stand-ins): 0. `clap` rows are unchanged: deezer / no_preview: 8; deezer / ok: 26,123; deezer / too_short: 2; itunes / ok: 11,644; itunes / too_short: 5; youtube / ok: 638.

From the logs:

```
4 clips per album for clap_mp3. 250 albums: 0 complete, 250 to fetch, 0 from local files
finished: 984 clips of 250 albums in 1615 s = 1.64 s per clip
peak memory: clap 663 MB + MPS 1219 MB, parent 119 MB; together at most 2000 MB
model seconds per clip: clap_mp3 1.09, clap 0.42
following clap: 984 of its clips asked for, 0 of them gone from the store's listing (recorded as no_preview); 0 other tracks tried in their place, 0 ok (those albums' clap_mp3 mean is not over the clap mean's clips)
baseline check: 984 clips embedded again for clap; cosine with the stored vector: median 1.00000, 5th percentile 1.00000, lowest 1.00000; 0 under 0.99
782 new albums without a preview: 567 with a YouTube link, 62 with Bandcamp only, 153 with neither. 20 to do now ({'youtube': 20}), 0 already done; 20 of those to do are embedded albums fetched again for clap_mp3 alone
[23:42:12] 1/20	Album13394	rank 406	youtube	topped_up	full_album	4193 s	35 s	ボアダムス [Boredoms] — ヴィジョン クリエイション ニューサン || Boredoms - Vision Creation Newsun | ErrorIsProgress || 1 file(s), 59.9 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:43:06] 2/20	Album2424365	rank 571	youtube	topped_up	full_album	9582 s	48 s	Natural Snow Buildings — Shadow Kingdom || Natural Snow Buildings - Shadow Kingdom (2009) [Full Album] | IDreamOfNaturalSnow || 1 file(s), 156.7 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:43:56] 3/20	Album15712476	rank 713	youtube	topped_up	full_album	7342 s	43 s	Cindy Lee — Diamond Jubilee || Cindy Lee - Diamond Jubilee (2024) Full Album HQ | REALISTIK || 1 file(s), 113.1 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:44:39] 4/20	Album286654	rank 1096	youtube	topped_up	full_album	6888 s	36 s	Mt. Eerie — Live in Copenhagen || Mount Eerie - Live in Copenhagen (Full Album) (2004) | Rare Music || 1 file(s), 108.4 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:44:49] 5/20	Album7576907	rank 1131	youtube	failed	-	- s	3 s	ኃይሉ መርጊያ & ዋሊያስ ባንድ — ዘራፌ ||  |  || ERROR: unable to download video data: HTTP Error 403: Forbidden
[23:45:22] 6/20	Album4319730	rank 1284	youtube	topped_up	full_album	3551 s	25 s	Maria & The Mirrors — Vision Quest || MARIA & THE MIRRORS 'Vision Quest' CD 2012 (Compilation - Japanese Release) | blackoperations || 1 file(s), 55.1 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:45:53] 7/20	Album15237	rank 1320	youtube	topped_up	full_album	3000 s	26 s	MALICE MIZER — Merveilles || Malice Mizer -merveilles  full album | malice mizer jrock music || 1 file(s), 46.4 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:46:49] 8/20	Album2365936	rank 1356	youtube	topped_up	full_album	10684 s	50 s	Roland Kayn — Infra || Roland Kayn - Infra [full album] | Exhaustive Lore || 1 file(s), 160.0 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:47:20] 9/20	Album215491	rank 1499	youtube	topped_up	full_album	3257 s	25 s	Myslovitz — Korova Milky Bar || Myslovitz - Korova Milky Bar (2002) FULL ALBUM | Polish music || 1 file(s), 51.9 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:48:33] 10/20	Album592521	rank 1519	youtube	topped_up	full_album	17185 s	67 s	Roland Kayn — Tektra || Roland Kayn - Tektra (Full Album) | io || 1 file(s), 266.0 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:49:07] 11/20	Album26421	rank 1625	youtube	topped_up	full_album	3375 s	27 s	Talk Talk — London 1986 || London 1986 (full live album) - Talk Talk | Blue Bamboo Music || 1 file(s), 52.5 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:49:40] 12/20	Album1530403	rank 1788	youtube	topped_up	full_album	3688 s	26 s	Tommy Wright III — Ashes 2 Ashes, Dust 2 Dust || Tommy Wright III - Ashes 2 Ashes, Dust 2 Dust (1994) | Watkins Brown || 1 file(s), 61.4 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:50:11] 13/20	Album238689	rank 1834	youtube	topped_up	full_album	4008 s	26 s	Chris Morris — Blue Jam || Chris Morris - Blue Jam (2000) [Sketch Comedy, Electronic] | wockstantinople || 1 file(s), 60.0 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:50:51] 14/20	Album4029336	rank 1890	youtube	topped_up	full_album	4943 s	33 s	Tommy Wright, III — Runnin - n - Gunnin || Tommy Wright III - Runnin-N-Gunnin [FULL ALBUM, 1995] | Underworld Library || 1 file(s), 79.9 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:51:17] 15/20	Album2855083	rank 1978	youtube	topped_up	full_album	1787 s	19 s	Murmuüre — Murmuüre || Murmuüre - Murmuüre [2010][Full Album] | Speaking the Truth || 1 file(s), 27.5 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:51:42] 16/20	Album5606317	rank 3106	youtube	topped_up	full_album	1717 s	19 s	Bucketheadland — Hold Me Forever (In Memory of My Mom Nancy York Carroll) || Buckethead Pike 65 - Hold Me Forever (In memory of my mom Nancy York Carroll) | Zoran Lozanoski || 1 file(s), 26.8 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:52:12] 17/20	Album577767	rank 3649	youtube	topped_up	full_album	2924 s	23 s	Susumu Hirasawa — Switched-On Lotus || [平沢進] Susumu Hirasawa - Switched-On Lotus [2004] | TwizzyBroke || 1 file(s), 44.2 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:52:40] 18/20	Album823914	rank 6264	youtube	topped_up	full_album	2851 s	22 s	Alfonia Tims and His Flying Tigers — Future Funk / Uncut! || Alfonia Tims and His Flying Tigers  - Future Funk/Uncut! (1982, Cassette) | jazzvocate || 1 file(s), 43.3 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:53:09] 19/20	Album7936335	rank 7083	youtube	topped_up	full_album	2101 s	23 s	Mobbyn — Mobbyn || Mobbyn - Mobbyn [cała płyta] [2017] | MrBoss2432 || 1 file(s), 32.8 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
[23:53:56] 20/20	Album15517924	rank 9355	youtube	topped_up	full_album	6769 s	40 s	Patricia Taxxon — Techdog 5 || TECHDOG 5 | Patricia Taxxon || 1 file(s), 115.1 MB, 8 windows ok for clap_mp3; baseline check: cosine with the stored clap vector median 1.0000, lowest 1.0000 over 8 windows
finished: 20 albums in 739 s: {'topped_up': 19, 'failed': 1}; 152 windows embedded for clap_mp3
peak memory: clap 567 MB + MPS 1219 MB, parent 106 MB; together at most 1891 MB
```

## 8. The sample

250 of the 2,730 new albums whose CLAP mean is from iTunes clips, seed 0: the catalog's new albums whose CLAP mean is from iTunes clips, one from each of 250 equal slices of their rank order. Rank quartiles: picked [4278.0, 6744.0, 8504.0], population [4263.0, 6744.0, 8509.0]. Storefronts: itunes:us 132, itunes:ca 26, itunes:ru 17, itunes:gb 15, itunes:br 9, itunes:se 9, itunes:es 6, itunes:au 4, itunes:jp 3, itunes:hu 3, itunes:ar 3, itunes:pl 3, itunes:sa 2, itunes:nz 2, itunes:de 2, itunes:mx 2, itunes:th 1, itunes:cl 1, itunes:it 1, itunes:my 1, itunes:ph 1, itunes:pa 1, itunes:dk 1, itunes:tr 1, itunes:fr 1, itunes:gr 1, itunes:ec 1, itunes:no 1. Clips behind the `clap` mean: 1: 1, 2: 4, 3: 5, 4: 240. YouTube: 20 of 80 embedded albums, the same way.

| Genre family | Picked | Share | Population share |
|---|---|---|---|
| rock | 46 | 18.4% | 20.0% |
| metal | 42 | 16.8% | 13.8% |
| jazz | 26 | 10.4% | 12.6% |
| folk & country | 27 | 10.8% | 9.8% |
| classical | 25 | 10.0% | 8.7% |
| pop | 13 | 5.2% | 6.2% |
| latin & world | 14 | 5.6% | 5.7% |
| punk | 13 | 5.2% | 4.7% |
| soundtrack | 15 | 6.0% | 4.4% |
| soul & funk | 6 | 2.4% | 3.1% |
| hip hop | 6 | 2.4% | 2.8% |
| electronic | 6 | 2.4% | 2.3% |
| ambient | 4 | 1.6% | 2.0% |
| reggae | 5 | 2.0% | 1.7% |
| blues | 1 | 0.4% | 1.5% |
| experimental | 1 | 0.4% | 0.8% |
| spoken & comedy | 0 | 0.0% | 0.1% |

Channels of the files (the experiment's 698 previews and 25 YouTube files, ffprobe): deezer: 2 channel(s): 349; itunes: 2 channel(s): 349; YouTube files by channel count: 2: 25.
