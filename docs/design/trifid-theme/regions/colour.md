# One colour rule for the map

## Rule
Rose where the music is fierce, gold where it is warm, teal where it is quiet, blue where it is dark, violet where it is urban.

Each album carries six weights that sum to 1: five families plus neutral (`colour.json` -> `album_weights`, in `albums.json` order, columns as in `family_order`). Colour = the weighted blend of the family hues, with the neutral share drawn as grey-brown dust (`#8a8580`) or simply as less colour. Weights come from each album's own words and audio only, so they hold at every slider stop and do not manufacture region character. `album_weights_balanced_smoothed` is the same thing averaged half-and-half with the 15 nearest neighbours on the balanced layout, for gas that should not speckle; it is only valid on balanced.

## How the families were derived
Non-negative matrix factorisation on all 4,081 albums: descriptor presence (every word on at least 40 albums, rarer words weighted up) plus nine audio z-scores (energy, loudness, acousticness, valence, danceability, instrumentalness, speechiness, liveness, tempo). Regions were not used, so the region names act as an independent check. Relative reconstruction error falls smoothly with k (0.76, 0.74, 0.718, 0.701 for k = 3 to 6), so error alone does not pick a number. Five was chosen because it is the smallest k where dark/cold splits from fierce: at k = 3 and k = 4 "heavy" and "dark" are one family and Sombre Void comes out fierce. At k = 6 the warm family splits into upbeat and bittersweet, which is real but not needed. Families were named from their top words and audio loadings.

| Family | Suggested hue | Top words | Audio | Albums it clearly leads | Stability across random restarts (cosine) |
|---|---|---|---|---|---|
| fierce | emission rose `#d9627a` | energetic, heavy, aggressive, male vocals, raw, angry, passionate | energy+, acousticness-, loudness+, tempo+ | 990 | 0.78 |
| warm | gold `#e2b45c` | melodic, bittersweet, warm, playful, passionate, lush, sentimental | valence+, danceability+, instrumentalness-, tempo+ | 1037 | 0.98 |
| quiet | teal `#4fb3a5` | acoustic, instrumental, improvisation, calm, mellow, soothing, soft | acousticness+, energy-, loudness-, tempo- | 911 | 0.93 |
| dark | reflection blue `#6f9bd8` | atmospheric, dark, ominous, sombre, hypnotic, mysterious, dense | instrumentalness+, valence-, danceability-, tempo- | 630 | 0.74 |
| urban | violet-mauve `#a884d6` | urban, sampling, rhythmic, nocturnal, male vocals, dark, playful | speechiness+, danceability+, tempo-, valence+ | 389 | 0.99 |

Warm, quiet and urban come back nearly identical from random restarts; fierce and dark are less stable (they trade "heavy/dark/dense" between them), which is why Aggressive Rift is split between the two.

## Regions
| Region | Dominant | fierce | warm | quiet | dark | urban | neutral | Fit | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| The Live Belt | **fierce** | 0.63 | 0.09 | 0.09 | 0.08 | 0.10 | 0.15 | clear | energetic 56%; liveness +3.2, energy +0.7 |
| Urban Cluster | **urban** | 0.10 | 0.09 | 0.02 | 0.03 | 0.75 | 0.01 | clear | sampling 82%, urban 89%, rhythmic 82%; speechiness +2.1, danceability +1.6 |
| Improv Arm | **quiet** | 0.06 | 0.19 | 0.57 | 0.08 | 0.11 | 0.16 | clear | improvisation 82%, instrumental 93%, acoustic 63%; acousticness +1.1, duration_ms +0.8 |
| The Quiet Deep | **quiet** | 0.01 | 0.03 | 0.59 | 0.37 | 0.01 | 0.00 | clear | instrumental 71%, suspenseful 26%, acoustic 33%; loudness -2.1, acousticness +1.8 |
| Pastoral Nebula | **quiet** | 0.01 | 0.33 | 0.59 | 0.03 | 0.04 | 0.04 | clear | pastoral 39%, acoustic 48%, bittersweet 57%; acousticness +1.5, energy -1.3 |
| Lonely Drift | **quiet** | 0.01 | 0.21 | 0.54 | 0.18 | 0.07 | 0.07 | clear | lonely 51%, sombre 54%, sad 37%; acousticness +1.2, energy -1.2 |
| The Bittersweet Reach | **warm** | 0.08 | 0.60 | 0.18 | 0.05 | 0.09 | 0.21 | clear | bittersweet 56%, melodic 75%, sentimental 36%; instrumentalness -0.7, mode +0.6 |
| Warm Halo | **warm** | 0.07 | 0.56 | 0.06 | 0.02 | 0.29 | 0.07 | clear | warm 74%, rhythmic 86%, tropical 27%; valence +1.6, danceability +1.5 |
| Playful Way | **warm** | 0.39 | 0.49 | 0.00 | 0.01 | 0.10 | 0.11 | mixed | energetic 95%, playful 61%, quirky 38%; valence +1.1, tempo +0.9 |
| Eclectic Cloud | **fierce** | 0.37 | 0.36 | 0.04 | 0.11 | 0.12 | 0.25 | weak | psychedelic 45%, eclectic 38%, quirky 31%; acousticness -0.5, loudness +0.4 |
| Progressive Spiral | **warm** | 0.22 | 0.27 | 0.23 | 0.24 | 0.03 | 0.31 | weak | progressive 78%, complex 59%, uncommon time signatures 41%; mode -0.5, speechiness -0.4 |
| Ethereal Veil | **dark** | 0.05 | 0.35 | 0.17 | 0.36 | 0.06 | 0.18 | weak | ethereal 47%, atmospheric 70%, psychedelic 53%; speechiness -0.4, instrumentalness +0.3 |
| Aggressive Rift | **fierce** | 0.53 | 0.00 | 0.01 | 0.41 | 0.05 | 0.01 | clear | aggressive 97%, heavy 98%, angry 47%; energy +1.4, danceability -1.3 |
| Raw Flare | **fierce** | 0.69 | 0.07 | 0.02 | 0.13 | 0.09 | 0.08 | clear | raw 89%, angry 71%, aggressive 76%; energy +1.1, acousticness -0.9 |
| Epic Expanse | **fierce** | 0.55 | 0.10 | 0.02 | 0.31 | 0.02 | 0.11 | clear | heavy 78%, epic 54%, progressive 38%; acousticness -0.9, energy +0.9 |
| Sombre Void | **dark** | 0.20 | 0.21 | 0.07 | 0.46 | 0.06 | 0.10 | mixed | sombre 76%, atmospheric 96%, dark 77%; valence -0.6, acousticness -0.5 |
| Hypnotic Orbit | **dark** | 0.08 | 0.16 | 0.18 | 0.50 | 0.09 | 0.10 | mixed | instrumental 81%, atmospheric 64%, hypnotic 39%; instrumentalness +1.6, mode -0.5 |

Weights are the region's mean album weights across the five families, renormalised to sum to 1; neutral is the mean neutral share. Fit: clear = dominant >= 0.50, mixed = 0.40 to 0.50, weak = below 0.40.

## Checks
- PASS: Sombre Void is dark (0.46), fierce 0.20, warm 0.21. Must not be fierce or hot.
- PASS: Lonely Drift is quiet (0.54), fierce 0.01, warm 0.21. Must not be fierce or hot.
- PASS: The Quiet Deep is quiet (0.59), fierce 0.01, warm 0.03. Must not be fierce or hot.
- PASS: Ethereal Veil is dark (0.36), fierce 0.05, warm 0.35. Must not be fierce or hot.
- PASS: Aggressive Rift is fierce (0.53), fierce 0.53, warm 0.00. Must be fierce.
- PASS: Raw Flare is fierce (0.69), fierce 0.69, warm 0.07. Must be fierce.
- PASS: Warm Halo is warm (0.56), fierce 0.07, warm 0.56. Must be warm.
- PASS: Playful Way is warm (0.49), fierce 0.39, warm 0.49. Must be warm.
- PASS: Improv Arm is quiet (0.57), fierce 0.06, warm 0.19. Must not be fierce (round-two complaint).
- PASS: Urban Cluster is urban (0.75), fierce 0.10, warm 0.09. Must not share a cold colour with Ethereal Veil (round-two complaint).

## Shared families between neighbours
- Fierce: Aggressive Rift, Raw Flare and Epic Expanse are adjacent and all rose. Acceptable: they share heavy (98%, 50%, 78%) and aggressive (97%, 76%, 34%). Aggressive Rift and Epic Expanse carry 0.41 and 0.31 dark, so they should look duskier than Raw Flare (0.13), which keeps them from reading as one block.
- Fierce: The Live Belt is also rose (0.63). This is true of the sound (energy z +0.7, energetic 56%; the centre is Hendrix, Led Zeppelin, Iron Maiden live) but rests on audio more than words (5.9 descriptors per album) and "live" is not a mood. It is a separate island, so it will not merge visually with the heavy regions, but draw it paler than Raw Flare.
- Quiet: Pastoral Nebula and Lonely Drift are adjacent and both teal; The Quiet Deep and Improv Arm are adjacent and both teal. Acceptable: all four are acoustic and low-energy (acousticness z +1.5, +1.2, +1.8, +1.1). Differences show in the second weight: Pastoral leans warm (0.33), Quiet Deep leans dark (0.37), Improv slightly warm (0.19).
- Warm: The Bittersweet Reach, Warm Halo and Playful Way are adjacent and all gold. Acceptable with a caveat: they share melodic, sung, positive-valence music, but gold then covers both bittersweet and playful, so the caption word "warm" is doing broad work. Playful Way carries 0.39 fierce (energetic 95%) and Warm Halo 0.29 urban, so they should tint toward orange and toward violet respectively.
- Dark: Sombre Void and Hypnotic Orbit are both blue and near each other. Acceptable: atmospheric 96% and 64%, both low valence.
- Urban Cluster is the only violet region.

## Weak fits: draw mixed or neutral
- Progressive Spiral: no family (0.27 / 0.24 / 0.23 / 0.22, neutral 0.31). Draw neutral. "Progressive" is a style word with no feel of its own in this data.
- Eclectic Cloud: fierce 0.37 and warm 0.36 tie; draw as a mixed rose-gold or neutral, not as a fierce region.
- Ethereal Veil: dark 0.36 and warm 0.35 tie; passes the "not hot" check on dominant family only by a hair. Draw pale and mixed; do not make it gold.
- Sombre Void (dark 0.46), Hypnotic Orbit (dark 0.50) and Playful Way (warm 0.49) are correct but mixed: right hue, moderate saturation.

## Known risk
A free blend of rose and blue gives mauve, close to the urban violet. Aggressive Rift (fierce 0.53, dark 0.41) can therefore drift toward Urban Cluster's colour; it is visible in `colour.png`. Either keep urban a distinctly pinker, more saturated violet, or colour by the leading family and use the lead only for saturation instead of blending hues. If a theme can only afford four hues, there is no honest family to fold urban into (its next weights are fierce 0.10 and warm 0.09), so it should go neutral, not teal or gold.

## Neutral albums
130 of 4081 albums (3%) are at least half neutral, and the mean neutral share is 0.12. Neutral means thin evidence or no leading family; it is not the same as unnamed. The 918 albums outside the named regions are almost as characterful as the rest (mean neutral 0.14 against 0.11), so in-between territory should be coloured, not greyed. Six albums have no descriptors at all and are coloured from audio alone.
