# Audio store audit: where preview clips represent an album badly

3 October 2026. Findings only; no fixes proposed. Read-only analysis of the clip cache (`clips.sqlite`, 30,060 ok clips), the production store (`data-pipeline/audio/`, 3,980 albums with a vector, 101 without), the store track lists in the HTTP cache, and the experiment's per-clip scalars.

**How to read this.** *Measured* = computed from the caches. *Inferred* = a reading of titles or of Spotify means, not checked against audio. Neighbour quality is the top 10 on the production EffNet block (64 dims, same artist removed): descriptor cosine (`desc`, albums with 5+ descriptors; catalog mean 0.444, random 0.230, SD across albums 0.109) and share of the top 10 in the seed's genre family (`fam`, catalog 0.659, random 0.128). `adj` = the album's value minus its genre family's mean, because families differ a lot in both track count and neighbour quality. N10 = how many other albums' top 10 an album appears in (mean 10; 41 albums, 1.0%, appear in none). Coverage = clips × 30 s / listing runtime.

## Summary

| # | Issue | Albums today | Measured harm | At 10,000 (rough) |
|---|---|---|---|---|
| 1 | Clip from a track under 90 s among the 8 | 748 (18.8%) | none at 8 clips | ~1,900 |
| 2 | Within-album clips disagree (mean pairwise cosine < 0.25) | 395 (10.0%) | desc −0.03 to −0.05 adj, fam 0.51–0.62 vs 0.91; association, cause not shown | ~1,000 |
| 3 | Live album | 348 (8.7%) | none | ~850 |
| 4 | Multi-disc listing | 334 (8.4%) | none found: clips reach every disc in 327 | ~500–800 |
| 5 | Track 1 under 90 s | 307 (7.7%) | none at 8 clips (289 of them) | ~770 |
| 6 | Bigger edition matched (deluxe, expanded, box, sessions) | 281 by title; 87 over 30 tracks | over 30 tracks: desc −0.023 ±0.011 adj | ~500–700; ~150–215 |
| 7 | 4 tracks or fewer (so 4 clips or fewer) | 275 (6.9%) | 1–3 clips: clear harm; 4: none | ~690 |
| 8 | One clip clearly unlike the rest | 233 strict, 660 loose | −0.004 to −0.009 adj; dropping it changes nothing | ~600 / ~1,650 |
| 9 | Match off: score < 0.88, or durations > 25% off Spotify | 208; 108 | desc −0.018 adj; fam −0.048 adj | ~520; ~270 |
| 10 | Ambiguous match | 149 (3.7%) | desc −0.022 ±0.011 adj; 5.4% in no list | ~370 |
| 11 | 1–3 clips for the whole album | 145 (3.6%) | desc −0.04 to −0.05 adj; fam −0.23 adj at 1 clip; 30% of 1-clip albums in no list | ~360 |
| 12 | No audio at all | 101 (2.5%) | not in the audio space | ~250, likely more |
| 13 | Coverage under 2% | 49 (11 under 1%) | harm only where clips are few | ~120 (~27) |
| 14 | Half or more of the clips from tracks under 90 s | 44 | not separable (small) | ~110 |
| 15 | Previews cut to ~10 s for full-length tracks | 36 albums, 71 clips | not tested | ~90 |
| 16 | Some tracks have no preview | 35 (5 fall below 8 clips) | not tested | ~85 |
| 17 | Wrong record: a single or stray track stands for the album | ~24 flagged, ~12 clear | not measurable (too few) | ~60 |
| 18 | One store listing under two catalog keys | 1 pair | identical vectors | a handful |

Ranked by measured harm: (a) **1–3 clips per album**, the only issue with a confirmed causal effect; (b) **doubtful matches** (ambiguous, low score, duration mismatch, over-30-track editions), small but consistent; (c) **heterogeneous albums**, the largest association but not shown to be caused by clip choice. Short intros, single outlier clips, live albums, multi-disc listings and low coverage at 8 clips show **no measurable harm**.

## 1. Coverage (measured)

| | min | 5% | 25% | median | 75% | 95% | max |
|---|---|---|---|---|---|---|---|
| Tracks in the matched listing | 1 | 4 | 8 | 11 | 14 | 25 | 142 |
| Runtime, minutes | 2.1 | 28.9 | 39.7 | 48.7 | 65.6 | 118.3 | 472.0 |
| Clips used | 1 | 4 | 8 | 8 | 8 | 8 | 8 |
| Coverage | 0.8% | 2.9% | 5.6% | 7.5% | 9.6% | 12.4% | 49.6% |
| Minutes of music per clip | 1.0 | 4.0 | 5.2 | 6.7 | 9.0 | 17.0 | 64.6 |

- Tracks: 1 → 27 albums, 2 → 49, 3 → 69, 4 → 130; **4 or fewer → 275**; 7 or fewer → 794; over 30 → 87.
- Clips used: 1 → 27, 2 → 50, 3 → 68, 4 → 133, 5 → 137, 6 → 201, 7 → 182, 8 → 3,182. In 1,103 albums every track has a clip. Fewer than 8 clips is almost always a short track list (794 of 797).
- Coverage under 1%: **11**; under 2%: **49**; under 3%: 213; under 5%: 670.
- A clip stands for 10+ minutes in 670 albums, 15+ in 290, 20+ in 90, 30+ in 34.
- Long tracks carrying a clip: over 10 min, 1,694 of 2,234 tracks (894 albums); over 15 min, 590 of 755; **over 20 min, 252 of 313 (176 albums)**; over 30 min, 48 of 72.
- Lowest median coverage by family: ambient 4.4%, classical 5.3%, experimental 6.1%, jazz 6.3%. Jazz holds 87 of the 275 albums with 4 or fewer tracks.

**Fishmans, "Long Season"**: Deezer listing 69856482 (score 0.9992, not ambiguous), 1 track of 2,115 s, **1 clip of 29.99 s, coverage 1.42%**. Its vector appears in no other album's top 10; its own top 10 is mostly post-rock (Sigur Rós, Bark Psychosis, Yndi Halda), 1 of 10 in its genre family. On the live album "98.12.28 Otokotachi no Wakare" the 41-minute "Long Season" (track 14) has no clip.

The 40 worst by coverage (two populations: one or two very long tracks, and box sets):

| Artist | Title | Tracks | Min | Clips | Cov. |
|---|---|---|---|---|---|
| Estas Tonne | Internal Flight | 1 | 65 | 1 | 0.77% |
| Klangforum Wien / Cambreling | in vain | 1 | 63 | 1 | 0.79% |
| The Necks | Hanging Gardens | 1 | 61 | 1 | 0.83% |
| The Necks | Drive By | 1 | 60 | 1 | 0.83% |
| Green Carnation | Light of Day, Day of Darkness | 1 | 60 | 1 | 0.83% |
| The Stooges | 1970: The Complete Fun House Sessions | 142 | 472 | 8 | 0.85% |
| Ground-Zero | Consume Red | 1 | 57 | 1 | 0.88% |
| Eliane Radigue | Trilogie de la mort | 3 | 169 | 3 | 0.89% |
| Natural Snow Buildings | Daughter of Darkness | 18 | 440 | 8 | 0.91% |
| Bob Dylan | The Bootleg Series Vol. 12: The Cutting Edge | 111 | 426 | 8 | 0.94% |
| Terry Riley | In C | 2 | 104 | 2 | 0.97% |
| The Beach Boys | The Smile Sessions | 139 | 393 | 8 | 1.02% |
| Miles Davis | Pangaea | 2 | 89 | 2 | 1.13% |
| Henry Flynt | You Are My Everlovin / Celestial Power | 2 | 88 | 2 | 1.14% |
| Miles Davis | The Cellar Door Sessions 1970 | 28 | 350 | 8 | 1.14% |
| Africa Express | Terry Riley's In C Mali | 1 | 41 | 1 | 1.23% |
| Jimi Hendrix | The Jimi Hendrix Concerts | 43 | 315 | 8 | 1.27% |
| Big Star | Keep an Eye on the Sky | 98 | 301 | 8 | 1.33% |
| Pharoah Sanders | Black Unity | 1 | 37 | 1 | 1.34% |
| Steve Roach | Mystic Chords & Sacred Spaces | 29 | 295 | 8 | 1.35% |
| Anthony Braxton | Quartet (Santa Cruz) 1993 | 4 | 145 | 4 | 1.38% |
| Fishmans | Long Season | 1 | 35 | 1 | 1.42% |
| The Velvet Underground | The Complete Matrix Tapes | 42 | 275 | 8 | 1.45% |
| Yes | Close to the Edge (28-track edition matched) | 28 | 275 | 8 | 1.46% |
| Uematsu / Hamauzu / Suzuki | Final Fantasy VII Remake | 85 | 274 | 8 | 1.46% |
| Keith Jarrett | Vienna Concert | 2 | 68 | 2 | 1.47% |
| Bruce Springsteen | Tracks | 69 | 267 | 8 | 1.50% |
| KISS | Alive! (50th Anniversary Super Deluxe matched) | 56 | 266 | 8 | 1.50% |
| Laurie Anderson | United States Live | 78 | 264 | 8 | 1.52% |
| Gorguts | Pleiades' Dust | 1 | 33 | 1 | 1.52% |
| Lil B | 05 Fuck Em | 72 | 251 | 8 | 1.60% |
| Fela Kuti & His Africa '70 | Unknown Soldier | 1 | 31 | 1 | 1.61% |
| Humble Pie | Performance: Rockin' the Fillmore | 22 | 245 | 8 | 1.64% |
| Johnny Cash | Unearthed | 79 | 241 | 8 | 1.66% |
| Machine Girl | MRK90 MIX VOL 1 | 2 | 60 | 2 | 1.68% |
| Klaus Schulze | Timewind | 2 | 59 | 2 | 1.70% |
| Kashiwa Daisuke | Program Music III | 2 | 58 | 2 | 1.71% |
| Fela Kuti & Egypt 80 | Beasts of No Nation | 1 | 28 | 1 | 1.77% |
| Moonsorrow | V: Hävitetty | 2 | 56 | 2 | 1.77% |
| Skepticism | Aes | 1 | 28 | 1 | 1.80% |

## 2. Unrepresentative clips

**Track 1 (measured).** Track 1 carries a clip in 99.8% of albums. It is under 30 s in 36 albums, under 60 s in 165, **under 90 s in 307 (7.7%)**, under 120 s in 469. Its title says intro, prelude, overture, skit or similar in 212 albums; short or so titled: 419. Rate of a sub-90-s track 1 by family: hip hop 25.7%, spoken & comedy 19%, soundtrack 14.2%, electronic 11.1%, metal 10.1%; jazz 2.9%. Examples: Gravediggaz "6 Feet Deep" (10 s intro), Pete Rock & InI "Center of Attention" (10 s), Kanye West "The College Dropout" (18 s), Coroner "Punishment for Decadence" (13 s), David Bowie "Santa Monica '72" (13 s "Introduction").

**Short tracks among the clips (measured).** Of 29,484 clips used: 133 from tracks under 30 s (109 albums), 542 under 60 s (391 albums), **1,179 under 90 s (748 albums)**. Selection does not over-sample them (4.0% of clips against 5.5% of all tracks). In 44 albums half or more of the clips are from sub-90-s tracks: grindcore and hardcore (Insect Warfare "World Extermination" 8 of 8, Death Toll 80k 7 of 8, Napalm Death "The Peel Sessions" 7 of 8, Wire "Pink Flag" 6 of 8), cue-based scores (DELTARUNE Chapter 2 7 of 8, "Moonlight" 6 of 8), beat tapes (J Dilla "Donuts" 6 of 8). There the short tracks are the album. 292 clips (231 albums) come from tracks titled skit, interlude, intro or outro.

**Are these clips outliers? (measured)** Each clip's cosine to the mean of its album's other clips, minus the album's median: tracks under 30 s −0.26, 30–60 s −0.21, 60–90 s −0.12, over 120 s about −0.03. Track 1 under 60 s: −0.35; track 1 over 120 s: −0.03. Intro/skit-titled: −0.23. Last track: −0.05 (no sign of a hidden-track problem). So short and intro clips do sit away from their album.

**Short clips (measured).** 204 used clips are under 29 s (143 albums); 133 because the track itself is under 31 s. 71 clips in 36 albums are cut short although the track is long: 42 are 10-second previews, including every clip of four Dead Can Dance albums ("Within the Realm of a Dying Sun", "The Serpent's Egg", "Spleen and Ideal", "Toward the Within") and 6 of 8 on M.I.A. "Kala". Short clips deviate too (−0.14 to −0.27). 4 clips were rejected as too short (4–5 s).

**Speech, silence (measured, partial).** The scalars have no speech head; loudness is the only usable signal, and only 16,618 clips (4 per album) have scalars. 73 are quieter than −35 LUFS (27 below −40); 154 are 12+ LU below their album's median (65 are track 1). Clips from sub-90-s tracks are quiet outliers 4.8% of the time against 0.7%. The quietest are mostly classical and prog passages (Mahler 5 Adagietto under Bernstein, Boulez's "Le Sacre", King Crimson "Larks' Tongues in Aspic", Camel "The Snow Goose"), plus Bad Brains and Modest Mouse "Interstate 8". Skit-titled clips (49 with scalars) are 4 LU quieter with a much lower tempo confidence (0.9 against 2.2), consistent with speech.

**Bigger editions (inferred from titles; the tables hold no Spotify track count).** The matched title has deluxe, expanded, anniversary, bonus, complete, box or sessions where the catalog title does not in **281** albums; another 333 say only "remaster". 87 listings have over 30 tracks. Using the matcher's own consistency test (Spotify means of key/mode/time signature), the track count is inconsistent with the Spotify album in 366 albums (9.2%), 55 of them at 1.3× or more the smallest consistent count. In 292 listings a fifth or more of the track titles repeat an earlier one (the same song twice); 755 used clips (2.6%, 380 albums) are from tracks titled demo, remix, alternate, take, bonus, mono, session or edit, and in 44 albums that is half or more of the clips. Examples: Yes "Close to the Edge" (28 tracks, 275 min), KISS "Alive!" (56 tracks), The Avalanches "Since I Left You" (20th Anniversary, 33 tracks), Peter Gabriel "So" (25th Anniversary, 25 tracks), MF DOOM "Operation: Doomsday (Complete)" (42), Tori Amos "Boys for Pele" (Deluxe, 39), Bob Marley "Exodus" (Deluxe, 30). Multi-disc listings: 334; clips come from one disc only in 1, and leave some disc untouched in 7, so "all clips from disc 1" does not occur. The spread reaches bonus discs as readily as the album proper.

## 3. Heterogeneous albums (measured)

Cosines are on clip embeddings centred on the catalog mean, so two clips from different albums score 0.00 on average (5th–95th percentile −0.23 to 0.35) and two clips from different albums by one artist 0.385.

| Per album | 5% | 25% | median | 75% | 95% |
|---|---|---|---|---|---|
| Mean pairwise cosine between its clips | 0.20 | 0.35 | 0.49 | 0.65 | 0.85 |
| Lowest pairwise cosine | −0.15 | 0.01 | 0.17 | 0.40 | 0.74 |
| Mean clip-to-album-mean cosine | 0.53 | 0.65 | 0.74 | 0.83 | 0.94 |
| Worst clip against the mean of the others | −0.01 | 0.20 | 0.38 | 0.59 | 0.84 |

- **The typical album is only a little more coherent than an artist's catalogue** (0.49 against 0.385). 395 albums (10%) are below 0.25, 69 below 0.15: their clips are barely more alike than random pairs.
- **By family** (mean pairwise): pop 0.37, rock 0.37, folk & country 0.44, electronic 0.45, soundtrack 0.49, hip hop 0.56, metal 0.62, classical 0.68, jazz 0.69, reggae 0.73. **By track count**: 0.57 at 4 or fewer, 0.50 at 9–12, 0.43 at 25–40, 0.41 above 40 (Spearman −0.16). Various Artists (12 albums): 0.40. Listings with 5+ distinct track artists (30): 0.45. Live albums: 0.48 against 0.51.
- **One clear outlier clip**: with at least 4 clips (3,835 albums), the worst clip is 0.30+ below the next worst and under 0.10 against the rest in **233 albums (6.1%)**; with a looser rule (0.20 gap, under 0.30) in 660 (17.2%). The outlier is track 1 in 24% of cases and from a sub-90-s track in 23%; most are full-length songs. Examples: Sepultura "Under a Pale Grey Sky" ("Itsári (Live; Intro)"), Sonny Rollins "A Night at the Village Vanguard" (38 s "Introduction"), Grant Green "Alive!" (32 s band introduction), John Williams "Return of the Jedi" ("Lapti Nek"), The Jam "All Mod Cons" ("English Rose"), Dio "Holy Diver" (title track), David Bowie "Station to Station" (title track), Rainbow "Rising" ("Tarot Woman"). The last three are long songs with long instrumental openings; that the preview window falls in the opening is inferred.
- **Does the mean land near none of its clips?** Rarely. The best own clip is under 0.6 to the album mean in 42 albums and under 0.7 in 274 (of 3,835). The nearest clip in the whole catalog to an album's mean is one of its own for 91% of 8-clip albums; in 25 albums ten or more foreign clips are closer than any own clip (King Crimson "Larks' Tongues in Aspic" 31, Akira Yamaoka "Silent Hill 3" 30, Fleet Foxes "Helplessness Blues" 27, Phideaux "Doomsday Afternoon" 25, Panda Bear "Person Pitch" 18).
- **The mean of a mixed album drifts to the middle of the space.** Distance of the album vector from the catalog centre: 0.44 for albums with pairwise cosine under 0.15, rising steadily to 0.73 above 0.8.

The 30 least coherent (4+ clips; mean pairwise cosine): Various Artists "A Clockwork Orange" 0.03; "Blue" Gene Tyranny "Out of the Blue" 0.05; Zappa "You Can't Do That on Stage Anymore, Vol. 5" 0.07; Ween "Quebec" 0.07; Dean Blunt "Black Metal" 0.07; Banco del Mutuo Soccorso (s/t) 0.07; Cheer-Accident "Introducing Lemon" 0.08; Seatbelts "Cowboy Bebop Blue" 0.08; The Alan Parsons Project "Tales of Mystery and Imagination" 0.08; Nektar "A Tab in the Ocean" 0.09; Rush "A Farewell to Kings" 0.09; Van der Graaf Generator "Godbluff" 0.09; Little Simz "Sometimes I Might Be Introvert" 0.09; The Microphones "It Was Hot, We Stayed in the Water" 0.10; Zappa "You Can't Do That on Stage Anymore, Vol. 1" 0.10; black midi "Cavalcade" 0.10; Julian Cope "Jehovahkill" 0.10; Vox Dei "La Biblia" 0.11; The Mothers of Invention "Uncle Meat" 0.11; Fabrizio De André "Crêuza de mä" (23-track listing) 0.11; Suede "Dog Man Star" 0.11; The Protomen "Act II" 0.11; The Smashing Pumpkins "Mellon Collie and the Infinite Sadness" 0.11; Pink Floyd "Meddle" 0.11; Museo Rosenbach "Zarathustra" 0.11; PJ Harvey "To Bring You My Love" 0.11; Jethro Tull "Thick as a Brick" 0.12; King Crimson "USA" 0.12; Broken Social Scene "You Forgot It in People" 0.12; Funkadelic "Free Your Mind... and Your Ass Will Follow" 0.12.

## 4. Does it hurt? (measured)

| Bucket | Albums | desc | desc adj (±SE) | fam adj | N10 mean | In no list |
|---|---|---|---|---|---|---|
| **Clips** 1 | 27 | 0.383 | −0.049 ±0.028 | −0.229 | 2.6 | 29.6% |
| 2 | 50 | 0.394 | −0.040 ±0.019 | −0.125 | 6.0 | 2.0% |
| 3 | 68 | 0.404 | −0.043 ±0.014 | −0.033 | 7.3 | 1.5% |
| 4 | 133 | 0.440 | −0.002 ±0.009 | +0.046 | 8.3 | 3.0% |
| 5–6 | 338 | 0.435 | −0.010 ±0.007 | +0.022 | 8.9 | 0.9% |
| 7 | 182 | 0.454 | 0.000 ±0.009 | +0.047 | 10.6 | 1.1% |
| 8 | 3,182 | 0.446 | +0.003 ±0.002 | −0.002 | 10.3 | 0.7% |
| **Coverage** < 1% | 11 | 0.382 | −0.046 ±0.041 | −0.260 | 6.5 | 0% |
| 1–2% | 38 | 0.383 | −0.042 ±0.017 | −0.097 | 8.8 | 7.9% |
| 2–3% | 164 | 0.431 | +0.001 ±0.009 | −0.042 | 9.7 | 1.2% |
| 3–10% | 2,964 | 0.441–0.451 | −0.004 to +0.004 | ~0 | 10.3 | 0.9% |
| > 10% | 803 | 0.444 | +0.004 | 0.000 | 9.2 | 1.1% |
| **Tracks** 25–40 | 179 | 0.411 | −0.012 ±0.007 | −0.008 | 10.8 | 1.1% |
| > 40 | 40 | 0.391 | −0.015 ±0.016 | 0.000 | 10.5 | 5.0% |
| **Pairwise cosine** < 0.15 | 69 | 0.368 | −0.045 ±0.011 | +0.021 | 11.3 | 0% |
| 0.15–0.25 | 326 | 0.387 | −0.034 ±0.006 | −0.040 | 11.1 | 0.6% |
| 0.25–0.35 | 580 | 0.398 | −0.026 ±0.004 | −0.080 | 10.5 | 0.5% |
| 0.35–0.5 | 1,059 | 0.430 | −0.007 ±0.003 | −0.051 | 10.2 | 0.8% |
| 0.5–0.65 | 960 | 0.465 | +0.011 ±0.003 | +0.021 | 9.7 | 0.9% |
| 0.65–0.8 | 597 | 0.480 | +0.017 ±0.004 | +0.089 | 9.6 | 0.8% |
| > 0.8 | 362 | 0.520 | +0.052 ±0.006 | +0.123 | 9.7 | 1.4% |

Other splits: track 1 under 60 s +0.010 ±0.008, 60–90 s −0.001; one outlier clip (loose rule) −0.009 ±0.004, strict −0.004; ambiguous match −0.022 ±0.011 (5.4% in no list); over 30 tracks −0.023 ±0.011; score under 0.88 −0.018; durations over 25% off Spotify: desc −0.002, fam −0.048; edition word or inconsistent count +0.016; live 0.001; iTunes against Deezer +0.001 (3.1% in no list against 0.9%).

**Few clips: harm, and it is causal.** Taking the 2,836 albums that have 8 clips and recomputing each vector from its first 1, 2 or 4 clips against the unchanged catalog:

| Clips kept | desc | fam | primary genre | Same top 10 as with 8 | Lists it appears in | In no list |
|---|---|---|---|---|---|---|
| 1 (track 1) | 0.402 | 0.530 | 0.140 | 31% | 3.0 | 21.3% |
| 2 | 0.427 | 0.598 | 0.175 | 46% | 4.9 | 8.7% |
| 4 | 0.439 | 0.626 | 0.199 | 65% | 7.5 | 1.8% |
| 8 | 0.446 | 0.640 | 0.210 | 100% | 9.3 | 1.0% |

This reproduces what the real 1–3 clip albums show. Few-clip vectors sit further from the centre of the space (0.67 at 1 clip against 0.61 at 8), which is why they are rarely recommended. Note this measures 1 clip against 8 clips of the same album; it says nothing about 1 clip against 35 minutes.

**Low coverage with enough clips: no measurable harm.** Albums with 8 clips where each clip stands for 15+ minutes (190 albums): −0.005 ±0.008. With 3–4 clips and 15+ minutes per clip (44): −0.015 ±0.016. The coverage deficit below 2% is the 1–2 clip albums; box sets with 8 clips are within noise.

**Short intros and outlier clips: no measurable harm at 8 clips.** Dropping the track-1 clip from the 260 eight-clip albums whose track 1 is under 90 s: desc 0.4619 → 0.4623, fam 0.684 → 0.690, 85% of the top 10 unchanged. Dropping the outlier clip from 505 outlier albums: 0.4400 → 0.4392, fam 0.637 → 0.629. One clip in eight is 12.5% of the mean. Only 18 albums combine a sub-90-s track 1 with fewer than 8 clips, and 3 with 4 or fewer.

**Heterogeneity: the strongest association, cause not established.** With family, track count, clips, coverage and descriptor count in one regression, pairwise cosine is the only sizeable term (+0.037 desc per SD, a third of an SD). Removing the outlier clip does not recover it. Eclectic albums may simply have no close neighbours under any mean, so this is not shown to be a clip-selection problem. Hubness: mixed albums appear in slightly more lists (11.3 against 9.7); the top hub, Julian Cope "Jehovahkill" (45 lists), is a 30-track listing with pairwise cosine 0.10. Overall hubness is mild (max 45, skew 0.9).

## 5. Missing and doubtful audio (measured unless marked)

**Sources.** Deezer 3,754 albums (28,403 clips); iTunes US 204 (1,497); iTunes GB 20 (141); iTunes DE 2 (15); local files 0; none 101. Non-ok clips: 73 `no_preview` in 37 albums (all Deezer, no error text; one is "HTTP 200, 10 bytes") and 4 `too_short`. 35 listings lack a preview for some track; that leaves fewer than 8 clips in 5 (Spiritualized "Royal Albert Hall October 10 1997" 4 of 15 tracks; Anthony Braxton "Saxophone Improvisations Series F" 4 of 9). 9 albums have no clip for track 1.

**The 101 without audio.** Rate by family: spoken & comedy 8.7%, experimental 7.7%, soundtrack 6.6%, punk 6.3%, hip hop 5.4%, classical 4.3%; rock 2.2%, jazz 1.6%, pop 0.4%. Kinds (inferred from names): video game music (7: Zelda "Ocarina of Time", "Super Mario Galaxy" 1 and 2, "Super Mario 64", "Bloodborne", "Grim Fandango", "OFF"); artists absent from the stores (Godspeed You! Black Emperor, 4 albums; Psychotic Waltz, 3; Jacques Brel, 3; The Necks, 2; DJ Screw, 2); Bandcamp/mixtape rap (SpaceGhoztPurrp, Black Kray, Tommy Wright III, Lil Ugly Mane); live and archival releases (Hendrix "Live at the Fillmore East", Black Sabbath "Live at Hammersmith Odeon", Can "The Peel Sessions"); classical (Karajan symphonies 5 and 7, Sofronitsky); and roughly 30 releases at the tail of the table, many of them EPs and singles (Fugazi, Minor Threat, The Strokes "The Modern Age", My Bloody Valentine "Glider"). Non-Latin script is 4% of them (1% of the catalog), so language is not the main cause. No Various Artists album is missing. 3 are deliberate skips in `match_overrides.json` (only cover versions exist).

**The 149 ambiguous.** Reasons (`results/match_ambiguous.csv`, 148 rows): score in the grey zone 79, recognised by durations only 42, another release scores as close 25, reads nearly right with durations off 2. Rate: classical 27 of 88 (31%), Various Artists 6 of 14, soundtrack 16 of 113 (14%); iTunes 19% against Deezer 2.8%. Scores: 208 under 0.88, 78 under 0.80, 12 under 0.72. Mean track duration differs from Spotify's by over 10% in 188 albums, over 25% in 108, over 50% in 59; 40 of those 59 are not flagged ambiguous (William Basinski "The Disintegration Loops" 687 s against 2,233 s; Santana 245 s against 127 s). For many the table's Spotify URI is probably the wrong record, so the listing may be right; the caches cannot say which.

**Clearly or probably the wrong record (inferred from titles, runtimes).** 53 listings run under 15 minutes, 30 of them with 3 tracks or fewer. Most are real EPs and singles in the catalog. 24 short listings carry a mismatch signal; about 12 are clearly wrong:

| Catalog album | What the store holds |
|---|---|
| Various Artists, "Barry Lyndon" | 1 track, 4 min, by "Pecan" |
| Blasphemy, "Blood Upon the Altar" | "Burn The Altar", 1 track |
| Moacir Santos, "Coisas" | "Coisas - Single", 3.4 min |
| Yoko Shimomura, "Kingdom Hearts" | a cover single, "Night of Fate (feat. Øystein Wangen)" |
| John Williams / LSO, "Star Wars" | "Galaxy's Edge Symphonic Suite", 1 track, 5 min |
| Various Artists, "Golden Rain" | 1 track, 2 min, by "Tropilux" |
| Akira Yamaoka, "Silent Hill" | "SILENT HILL: The Short Message" soundtrack, 82 tracks |
| High Rise, "Live" | "High Risk", "One Night Stand...ing Room Only" |
| Neal Morse, "?" | The Neal Morse Band, "Innocence & Danger" (score 0.50) |
| Genesis, "Live" | "Seconds Out (Live)", also the listing of the catalog's "Seconds Out" |
| Max Richter, "Sleep" | "Sleep (Piano Edition)", 3 tracks, 26 min |
| Angelo Badalamenti, "Twin Peaks" | 2 tracks, 10 min |

Others worth a look: Andrew Lloyd Webber "The Phantom of the Opera" (2-track "2026 Mix"), Manfred Mann Chapter Three (matched to "Radio Days, Vol. 3"), Cargo (1 track), Dystopia (3 tracks, 9 min), OMORI ("I am Omori", 5 tracks), Various Artists "Woodstock" ("Woodstock - EP").

## 6. Anything else

- **Duplicate listing (measured).** Genesis "Live" and "Seconds Out" both point at Deezer 1345209, so they share 8 clips and one vector. No artist + title pair occurs under two keys.
- **Near-identical vectors are a genre effect (measured).** 2,240 album pairs have block cosine over 0.97, nearly all hard bop or 1990s East Coast hip hop (Art Blakey "A Night at Birdland, Vol. 1" with 14 other albums; The Pharcyde "Labcabincalifornia" with 13). The audio block barely separates albums inside those styles.
- **Classical (measured).** 88 albums, 31% ambiguous. Listings range from one work in 3–4 movements (Kleiber's Beethoven 5) to 74 tracks (Tallis Scholars "Spem in alium", with bonus tracks) and couplings (Boulez "Pétrouchka; Le Sacre", 29 tracks); many movements sample evenly and coherence is high (0.68). The matched performance may differ from the catalog's (Terry Riley "In C" → a horn ensemble version; Arvo Pärt "Miserere" credits differ): inferred from artist credits.
- **Various Artists and soundtracks (measured).** 14 catalog VA albums: pairwise 0.40, desc adj −0.055, fam 0.16. 30 listings have 5+ track artists. "A Clockwork Orange" is the least coherent album in the store (0.03) and none of its top 10 is a soundtrack. Soundtracks: 12.4% over 30 tracks, 14.2% with a sub-90-s track 1.
- **DJ mixes (measured).** Only 2 albums have a DJ-mix or mashup primary genre; "The Kiwi Sound (DJ Mix)" also lacks previews for 3 tracks. Too few to assess.
- **Live albums (measured).** 348 (title, or half the track titles, say live): pairwise 0.48 against 0.51, desc adj +0.001, fam adj −0.019. Introductions and announcements do get clips (Coltrane "One Down, One Up" has two "Announcements" clips; Mahalia Jackson "Newport 1958" a 24 s intro).
- **Spoken word and comedy (measured).** 21 albums with audio, coherent (0.70), fam 0.76: no problem seen.
- **Stale rows in the clip cache (measured).** 4 clips, and one album with two listings, belong to a listing no longer named in `matches.csv`; 96 albums hold more than 8 ok clips. The store uses the first 8 by rank and its `n_clips` agrees with the cache for all 3,980 albums.

## 7. Projection to 10,000 albums

Method: today's rate × 10,000, adjusted by how the rate moves down the table (eight equal slices in table order, which follows the chart except for a tail of EPs and late additions).

| Rate by slice | 1 (top) | 2 | 3 | 4 | 5 | 6 | 7 | 8 (tail) |
|---|---|---|---|---|---|---|---|---|
| No audio | 2.0% | 2.2% | 1.6% | 1.8% | 1.6% | 1.6% | 2.2% | 7.1% |
| iTunes source | 5.9% | 7.6% | 5.5% | 5.7% | 5.5% | 5.1% | 4.5% | 4.5% |
| Ambiguous | 3.3% | 5.3% | 3.3% | 4.9% | 2.9% | 2.5% | 2.5% | 4.3% |
| 4 tracks or fewer | 5.5% | 5.5% | 4.5% | 4.7% | 5.5% | 5.5% | 4.9% | 17.8% |
| Over 30 tracks | 3.3% | 3.9% | 1.6% | 2.0% | 1.2% | 1.8% | 1.6% | 1.8% |
| Multi-disc | 16.2% | 12.7% | 8.2% | 7.8% | 7.3% | 5.9% | 3.9% | 3.3% |
| Coverage < 3% | 8.6% | 8.2% | 4.3% | 4.1% | 5.7% | 3.3% | 2.9% | 4.5% |
| Fewer than 8 clips | 14.7% | 17.1% | 17.3% | 16.1% | 17.1% | 18.8% | 18.4% | 37.1% |
| Track 1 < 90 s | 8.8% | 7.3% | 8.4% | 7.5% | 9.6% | 5.9% | 6.9% | 5.9% |
| Mean pairwise cosine | 0.47 | 0.50 | 0.52 | 0.51 | 0.51 | 0.51 | 0.49 | 0.52 |

- **Flat with chart depth, so they scale about ×2.5**: few tracks and few clips (~5% of albums outside the tail), short track 1, within-album spread, outlier clips, ambiguity, truncated previews.
- **Fall with depth**: box sets, deluxe editions and multi-disc listings are concentrated among the most famous albums. The summary's lower figures use the mid-table rates.
- **Probably rise with depth (inferred)**: no audio and doubtful matches. Within the current table the rate is flat at about 2%, but ranks 4,000–10,000 are more obscure than anything measured here, and the tail slice (EPs, recent rap, small-label releases) runs at 7%. 250 is a floor; 400–700 is plausible.
- **Depends on what is added**: if the expansion includes EPs and singles as the tail slice does, the share with 4 or fewer tracks is nearer 18% than 5%, and the 1–3 clip group grows towards 1,000.

## What the caches cannot tell

- **Whether one 30-second clip represents a long track.** There is no full audio. Every test here compares clips with clips. This is the Long Season question and it is open.
- **Where in the track a preview is cut from.** No offset is stored, so "the clip landed on the intro" is a guess from titles and from outlier embeddings.
- **Speech, applause, banter, silence.** No speech or applause head in the scalars; scalars exist for only 4 clips per album.
- **Which edition RYM means and how many tracks the Spotify album has.** The tables keep per-album means only, so bigger editions and bonus tracks are inferred.
- **Which side is wrong when listing and Spotify durations disagree.**
- **CLAP.** All embedding results are Discogs-EffNet; coherence, outlier and hubness figures may differ.
- **Harm at the balanced and mood stops, and listener-perceived harm.** Only the audio block alone was scored, with descriptor cosine and genre as proxies.
