# What makes CLAP tell the stores apart, and what removes it

Generated 2026-10-04 by `store_effect_fix.py`. 120 albums that both stores carry, 349 tracks fetched from both (698 preview clips), every clip embedded under 16 preprocessing variants; 220 of the pairs also cut to the stretch of the track both previews share. YouTube: 25 of these albums as full-album audio, 150 windows.

**Measurements on vectors and waveform statistics. Nobody listened to anything.** The music-information columns are proxies (agreement with the baseline's own neighbourhoods, album and genre agreement on a few hundred clips).

## Verdict

- **The cause is how the two stores encode, and it sits at the top of what CLAP hears.** The same track from the other store is at cosine 0.769, barely closer than another track of the album from the same store (0.728); a probe tells the stores apart with AUC 0.989 and scores the iTunes clip as more iTunes in 100.0% of the pairs; a clip's ten nearest clips from other albums are 13.3% from the other store where 50.0% would be even. This is the catalog's store split, on recordings that are the same.
- **Not the excerpt.** The two previews are usually the same stretch of the track shifted by a few seconds (median offset -2.98 s; 220 of 349 pairs share 15 s or more, 39 share nothing that was found). Cut to exactly the shared stretch, the same-track cosine is 0.803 against 0.794 uncut, and the probe still reads 0.974.
- **Not loudness.** iTunes previews are louder by a median 0.4 dB. Bringing every clip to one level leaves the cosine at 0.766 and the probe at 0.989.
- **Not the missing top octave as such.** Deezer's MP3 (128 kbit/s) has nothing above about 16.75 kHz, Apple's AAC (about 272 kbit/s) runs to 22 kHz. But CLAP's input stops at 14 kHz, and cutting both at 16, 15 or 14 kHz changes nothing (cosine 0.777, 0.769, 0.769). Cutting at 13 kHz starts to help (0.860), at 12 kHz most of it is gone (0.926). The long-term level between 12 and 14 kHz is the same in both stores to a quarter of a dB; what differs is the frame-by-frame pattern, and it differs most in CLAP's top bands (section 3). The likely reading: a 128 kbit/s stereo MP3 is short of bits up there and codes that band unevenly from frame to frame. So: the MP3 encoding of the 12 to 14 kHz band, seen by CLAP's top mel bands.
- **What removes it: giving the iTunes clip Deezer's encoding.** The decoded iTunes preview, stereo, through MP3 128 kbit/s and back (`mp3st`), then the recipe as it is, against Deezer clips left alone: same-track cosine 0.950, probe 0.685, neighbours from the other store 49.1% (50.5% for Deezer seeds, 47.6% for iTunes seeds). Only the iTunes clips change. A probe still finds something (EffNet's reads 0.560 on the same clips), but the neighbourhoods mix. The same round trip on a mono signal (`mp3`) does not work (0.819): it is the stereo encode at this bitrate that leaves the mark.
- **A low-pass on every clip also works, less cleanly.** At 12 kHz: cosine 0.926, probe 0.963, other-store neighbours 38.8%. Via 16 kHz (content to 8 kHz): 0.948, 0.892, 46.7%. It has to be applied to both stores (applied to one it makes things worse), so every clip is embedded again.
- **Cost in music information (proxies).** Low-pass 12 kHz keeps 7.5 of a clip's 10 same-store neighbours and same-album AUC 0.942 (baseline 0.947); via 16 kHz keeps 6.5 and 0.928. The MP3 round trip moves an iTunes clip to cosine 0.794 with its own baseline vector and a Deezer clip (encoded a second time) to 0.977; same-album AUC 0.940. A small cost on these proxies for all three; the one-store fix leaves the Deezer clips (about two thirds of the catalog's) exactly as they are.
- **Without fetching anything: a linear map on the stored iTunes vectors.** A ridge map from the iTunes vector to its Deezer version, fitted on the pairs of other albums, gives same-track cosine 0.924 and 50.1% other-store neighbours on held-out pairs. That is close to the round trip and costs no download. It was not applied to the catalog; the corrections that failed there (`source_effect.md`, section 6) were fitted on the two populations, not on pairs, so this one is worth trying first: the vectors are already stored.
- **YouTube audio (opus, 25 albums).** As it is, a probe separates YouTube windows from Deezer clips of the same albums with AUC 0.904 and from iTunes clips with 0.867 (windows from other parts of the album, so part of that is the music: two random halves of the YouTube windows give 0.414). The album's YouTube mean finds its own album among the 120 Deezer means first in 72.0% and among the iTunes means in 64.0%. YouTube windows' ten nearest clips of other albums are 29.5% YouTube where 17.2% would be even. So YouTube audio is a third accent, milder than the Deezer/iTunes split (iTunes vs Deezer on the same albums: 0.996), and it finds the right album about as often as a store clip finds its album's other tracks. Low-passing every source brings it closer (via 16 kHz: 0.691 / 0.662, 19.7% YouTube neighbours). The stereo MP3 round trip was not run on YouTube audio (the windows reach the model process as mono), so whether it does for YouTube what it does for iTunes is open. 25 albums: rough numbers.

## The sample

Albums of `catalog/albums.csv` with both a Deezer and an Apple Music link (4,659), drawn with seed 0 in turn from cells of (on the site / new) x decade x genre family, an album with a YouTube link first in every other visit. Listings by `rmr_audio.match.tracks` (Deezer id; Apple id in its link's storefront, then `us`). A track is paired when its normalised title is the same in both listings and the durations are within 2 s; up to 3 pairs an album, spread through it. Tried: {'no_pairs': 60, 'ok': 120}.

| Albums | Pairs | On the site / new | With a YouTube link | Decades | Genre families | iTunes storefronts |
|---|---|---|---|---|---|---|
| 120 | 349 | 55 / 65 | 97 | 2000s 26, 2010+ 25, 1990s 25, 1980s 19, 1970s 16, pre-1970 9 | rock 11, soul & funk 10, pop 10, jazz 9, punk 8, experimental 7, metal 7, folk & country 7, soundtrack 7, electronic 7, blues 7, ambient 6, hip hop 6, latin & world 6, classical 5, spoken & comedy 4, reggae 2, ? 1 | us 72, gb 12, ru 8, ca 8, pl 6, cl 2, it 2, ar 2, se 2, dk 1, de 1, no 1, es 1, mx 1, tw 1 |

## 1. The files

Median (10th to 90th percentile) over the clips; ffprobe for the format, the decoded 44.1 kHz signal for the rest.

| Store | Clips | Codec | kbit/s | Sample rate | Decoded length | Highest 250 Hz band above -100 dBFS (Hz) | Energy above 12 kHz (dB re total) | Loudness (LUFS, mono) | Peak (dBFS) | Side re mid (dB) | Level lost by (L+R)/2 (dB) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Deezer | 349 | mp3 349 | 128 (128 to 128) | 44100 Hz 349 | 29.99 s: 332, 30.02 s: 8, 9.98 s: 6, 18.99 s: 1 | 16750 (16250 to 17000) | -32.82 (-51.55 to -23.39) | -16.31 (-24.57 to -11.91) | -0.77 (-7.14 to 0.54) | -8.85 (-16.65 to -3.42) | -0.53 (-1.63 to -0.09) |
| iTunes | 349 | aac LC 349 | 271.85 (261.22 to 294.33) | 44100 Hz 349 | 29.98 s: 237, 29.93 s: 90, 29.95 s: 22 | 22000 (20450 to 22250) | -32.85 (-51.05 to -23.42) | -16.04 (-24.39 to -11.16) | -0.57 (-6.44 to 0.23) | -8.84 (-16.23 to -3.48) | -0.53 (-1.61 to -0.1) |

iTunes minus Deezer, the same track:

| Measure | n | Mean | sd | Median (10th to 90th) | Median absolute |
|---|---|---|---|---|---|
| lufs | 349 | 0.502 | 2.067 | 0.4 (-0.73 to 1.63) | 0.44 |
| rms_db | 349 | 0.546 | 2.053 | 0.43 (-0.48 to 1.67) | 0.45 |
| peak_db | 349 | 0.228 | 1.987 | 0.26 (-0.87 to 0.77) | 0.41 |
| side_db | 349 | 0.076 | 1.894 | -0.07 (-0.93 to 0.9) | 0.24 |
| mono_loss_db | 349 | 0.01 | 0.237 | 0 (-0.1 to 0.09) | 0.03 |
| lr_corr | 349 | 0.003 | 0.076 | 0 (-0.03 to 0.04) | 0.011 |
| seconds | 349 | 0.397 | 2.809 | -0.01 (-0.06 to -0.01) | 0.013 |

## 2. Are the two previews the same 30 seconds?

Offset of the iTunes excerpt against the Deezer one, by cross-correlating the two waveforms at 8 kHz (accepted from a correlation of 0.5 at the best lag, with at least 5 s shared) or, failing that, their loudness envelopes (from 0.6). Negative: iTunes starts earlier in the track.

| Pairs | Found by | Waveform correlation at the best lag | Offset (s): 5th, 25th, 50th, 75th, 95th | iTunes earlier / later | Within 5 s | Shared stretch (s) | Sharing 15 s or more | No common stretch | Albums whose pairs all have one offset |
|---|---|---|---|---|---|---|---|---|---|
| 349 | waveform 297, none 39, envelope 13 | 0.98 (0.16 to 1) | -17.98, -4.98, -2.98, 0.03, 15 | 67.7% / 11.6% | 68.4% | 26.94 (11.94 to 29.95) | 220 | 39 | 82 of 103 |

Offsets, pairs per range (s): -31..-20: 2, -20..-10: 71, -10..-5: 2, -5..-1: 133, -1..-0.1: 2, -0.1..0.1: 64, 0.1..1: 7, 1..5: 6, 5..10: 2, 10..20: 12, 20..31: 9.

A waveform correlation near 1 after the shift says the two stores were encoded from the same master. In 82 of the 103 albums with two or more aligned pairs the offset is the same for every track.

## 3. Where in frequency the two versions differ

The 220 pairs cut to their shared stretch. CLAP's input: 64 mel bands from 50 to 14000 Hz at 48000 Hz, in dB. First table: that input, frame by frame over the first 10 s (band centres computed from those settings). Second: the decoded waveforms' long-term spectrum.

| Band (Hz) | Mel bands | Mean absolute difference per frame (dB) | iTunes minus Deezer (dB) | Spread over time, iTunes minus Deezer (dB) |
|---|---|---|---|---|
| 50 to 1000 | 17 | 1.11 | 0.63 | -1.47 |
| 1000 to 4000 | 25 | 1.29 | 0.49 | -1.24 |
| 4000 to 8000 | 12 | 1.4 | 0.13 | -1.02 |
| 8000 to 10000 | 4 | 1.57 | -0.04 | -0.88 |
| 10000 to 11000 | 2 | 1.79 | 0.0 | -0.94 |
| 11000 to 12000 | 2 | 1.68 | -0.03 | -0.92 |
| 12000 to 13000 | 1 | 1.99 | 0.28 | -1.17 |
| 13000 to 14000 | 1 | 2.05 | 0.35 | -1.28 |

| Band (Hz) | Deezer level (dB, median) | iTunes level | iTunes minus Deezer (median) | Median absolute difference |
|---|---|---|---|---|
| 0 to 4000 | -13.9 | -13.5 | 0.44 | 0.44 |
| 4000 to 8000 | -33.5 | -33.4 | 0.19 | 0.21 |
| 8000 to 10000 | -41.0 | -41.2 | 0.0 | 0.16 |
| 10000 to 12000 | -44.3 | -44.5 | -0.12 | 0.23 |
| 12000 to 14000 | -48.7 | -48.4 | -0.14 | 0.23 |
| 14000 to 15000 | -55.5 | -55.7 | -0.15 | 0.28 |
| 15000 to 16000 | -58.1 | -57.9 | -0.0 | 0.32 |
| 16000 to 17000 | -68.3 | -60.2 | 6.56 | 6.58 |
| 17000 to 19000 | -122.6 | -60.2 | 63.45 | 63.45 |
| 19000 to 22000 | -120.5 | -65.5 | 56.9 | 56.9 |

## 4. CLAP under each variant: the store effect

Each variant is applied to the 44.1 kHz mono clip of both stores, then the catalog's recipe unchanged (44.1 kHz mono (ffmpeg, (L+R)/2) -> resample_poly(160,147) -> 3 x 10 s windows -> get_audio_features -> L2 per window -> mean; float32). n = 349 pairs, 120 albums. Cosines are between clip vectors. Probe: logistic regression on standardised vectors, C 0.01, five folds with an album's clips kept together; the paired column uses the same out-of-fold scores. Retrieval: a clip looks for its own track among the 349 clips of the other store. Last column: the share of a clip's ten nearest clips that come from the other store, among the clips of other albums only (50.0% if the store did not matter).

| Variant | Same track, other store: cosine mean (median) | Other track of the album, same store | Gap | Store probe AUC ± fold sd | Pairs where the iTunes clip scores more iTunes | Own track found in the other store, top 1 / top 5 | Neighbours from the other store (Deezer seeds / iTunes seeds) |
|---|---|---|---|---|---|---|---|
| `base` as it is (baseline) | 0.769 (0.776) | 0.728 | +0.041 | 0.989 ± 0.006 | 100.0% | 79.2% / 95.1% | 13.3% (10.8% / 15.9%) |
| `rs32` via 32 kHz (content to 16 kHz) | 0.777 (0.783) | 0.727 | +0.050 | 0.988 ± 0.006 | 100.0% | 81.4% / 95.3% | 13.8% (11.0% / 16.5%) |
| `rs22` via 22.05 kHz (to 11 kHz) | 0.927 (0.958) | 0.743 | +0.184 | 0.931 ± 0.030 | 99.7% | 91.1% / 96.9% | 40.3% (40.3% / 40.3%) |
| `rs16` via 16 kHz (to 8 kHz) | 0.948 (0.977) | 0.746 | +0.202 | 0.892 ± 0.017 | 99.1% | 92.3% / 96.6% | 46.7% (46.4% / 47.0%) |
| `lp15` low-pass 15 kHz | 0.769 (0.776) | 0.728 | +0.041 | 0.989 ± 0.006 | 100.0% | 79.2% / 95.1% | 13.4% (10.8% / 15.9%) |
| `lp14` low-pass 14 kHz | 0.769 (0.776) | 0.728 | +0.041 | 0.989 ± 0.006 | 100.0% | 79.2% / 95.3% | 13.4% (10.8% / 16.0%) |
| `lp13` low-pass 13 kHz | 0.860 (0.878) | 0.735 | +0.125 | 0.987 ± 0.007 | 100.0% | 90.1% / 96.4% | 23.0% (16.7% / 29.3%) |
| `lp12` low-pass 12 kHz | 0.926 (0.953) | 0.755 | +0.171 | 0.963 ± 0.019 | 100.0% | 92.0% / 97.1% | 38.8% (36.5% / 41.1%) |
| `lp10` low-pass 10 kHz | 0.940 (0.964) | 0.782 | +0.159 | 0.927 ± 0.030 | 99.7% | 91.3% / 96.9% | 40.3% (34.0% / 46.5%) |
| `loud` loudness (RMS -20 dBFS) | 0.766 (0.770) | 0.739 | +0.027 | 0.989 ± 0.006 | 100.0% | 75.4% / 93.1% | 13.1% (11.8% / 14.3%) |
| `loud_rs22` loudness + via 22.05 kHz | 0.932 (0.960) | 0.759 | +0.173 | 0.935 ± 0.029 | 99.7% | 91.3% / 97.0% | 39.8% (39.6% / 40.1%) |
| `loud_rs16` loudness + via 16 kHz | 0.952 (0.979) | 0.765 | +0.187 | 0.889 ± 0.028 | 99.1% | 92.8% / 96.9% | 46.7% (47.1% / 46.2%) |
| `loud_lp12` loudness + low-pass 12 kHz | 0.933 (0.959) | 0.770 | +0.163 | 0.964 ± 0.021 | 100.0% | 91.7% / 96.6% | 39.3% (38.4% / 40.1%) |
| `mp3` MP3 128k round trip (mono) | 0.819 (0.828) | 0.731 | +0.088 | 0.982 ± 0.006 | 99.4% | 83.2% / 95.9% | 18.9% (14.2% / 23.6%) |
| `loud_noise50` loudness + white noise 50 dB under the clip | 0.834 (0.850) | 0.731 | +0.103 | 0.969 ± 0.017 | 99.4% | 80.5% / 94.3% | 21.6% (21.0% / 22.2%) |
| `mp3st` MP3 128k round trip of the stereo file (as Deezer encodes) | 0.946 (0.972) | 0.764 | +0.182 | 0.804 ± 0.027 | 98.6% | 92.5% / 96.1% | 46.8% (42.0% / 51.5%) |

Baseline same-track cosine, 95% interval by resampling albums: 0.750 to 0.786. Other album, same store: 0.300; other album, other store: 0.170.

## 5. What each variant keeps of the music (proxies, inside one store)

Each store on its own, then the two averaged: no store effect can enter. Rank correlation of all pairwise clip cosines with the baseline's; how many of a clip's 10 nearest clips stay; same album against other album from the cosine alone (AUC); share of the 10 nearest clips of other albums with the seed's genre family and first primary genre.

| Variant | Spearman with the baseline's similarities | Of 10 neighbours, kept from the baseline | Cosine of a clip with its own baseline vector (Deezer / iTunes) | Same album vs other album AUC | Neighbours of the same genre family (chance) | Neighbours of the same first genre (chance) |
|---|---|---|---|---|---|---|
| `base` as it is (baseline) | 1.000 | 10.0 | 1.000 / 1.000 | 0.947 | 23.8% (5.5%) | 5.5% (0.5%) |
| `rs32` via 32 kHz (content to 16 kHz) | 0.997 | 9.7 | 0.998 / 0.999 | 0.947 | 23.9% (5.5%) | 5.5% (0.5%) |
| `rs22` via 22.05 kHz (to 11 kHz) | 0.879 | 7.1 | 0.772 / 0.844 | 0.937 | 23.2% (5.5%) | 5.2% (0.5%) |
| `rs16` via 16 kHz (to 8 kHz) | 0.845 | 6.5 | 0.707 / 0.800 | 0.928 | 24.0% (5.5%) | 5.5% (0.5%) |
| `lp15` low-pass 15 kHz | 1.000 | 10.0 | 1.000 / 1.000 | 0.947 | 23.8% (5.5%) | 5.5% (0.5%) |
| `lp14` low-pass 14 kHz | 1.000 | 10.0 | 1.000 / 1.000 | 0.947 | 23.8% (5.5%) | 5.5% (0.5%) |
| `lp13` low-pass 13 kHz | 0.953 | 8.1 | 0.953 / 0.942 | 0.943 | 23.4% (5.5%) | 5.1% (0.5%) |
| `lp12` low-pass 12 kHz | 0.898 | 7.5 | 0.851 / 0.846 | 0.942 | 23.3% (5.5%) | 5.4% (0.5%) |
| `lp10` low-pass 10 kHz | 0.863 | 7.0 | 0.813 / 0.760 | 0.930 | 24.2% (5.5%) | 5.5% (0.5%) |
| `loud` loudness (RMS -20 dBFS) | 0.936 | 8.0 | 0.947 / 0.921 | 0.934 | 23.6% (5.5%) | 5.9% (0.5%) |
| `loud_rs22` loudness + via 22.05 kHz | 0.824 | 6.5 | 0.726 / 0.773 | 0.923 | 23.1% (5.5%) | 5.8% (0.5%) |
| `loud_rs16` loudness + via 16 kHz | 0.788 | 6.1 | 0.664 / 0.725 | 0.914 | 23.2% (5.5%) | 5.7% (0.5%) |
| `loud_lp12` loudness + low-pass 12 kHz | 0.826 | 6.8 | 0.790 / 0.766 | 0.928 | 23.4% (5.5%) | 5.7% (0.5%) |
| `mp3` MP3 128k round trip (mono) | 0.981 | 8.7 | 0.992 / 0.977 | 0.947 | 23.6% (5.5%) | 5.6% (0.5%) |
| `loud_noise50` loudness + white noise 50 dB under the clip | 0.885 | 7.4 | 0.907 / 0.907 | 0.928 | 23.1% (5.5%) | 5.8% (0.5%) |
| `mp3st` MP3 128k round trip of the stereo file (as Deezer encodes) | 0.909 | 7.8 | 0.977 / 0.794 | 0.940 | 23.1% (5.5%) | 5.4% (0.5%) |

## 6. The two excerpts cut to the same stretch

220 pairs (81 albums) that share 15 s or more. Both clips are cut to the shared stretch, so position in the track is equal and only the encoding differs. `Uncut` is the same pairs as whole previews.

| Variant | Same track, other store: cosine mean (median) | Other track of the album, same store | Gap | Store probe AUC ± fold sd | Pairs where the iTunes clip scores more iTunes | Own track found in the other store, top 1 / top 5 | Neighbours from the other store (Deezer seeds / iTunes seeds) | Uncut: cosine / probe / other-store neighbours |
|---|---|---|---|---|---|---|---|---|
| `base` as it is (baseline) | 0.803 (0.810) | 0.711 | +0.093 | 0.974 ± 0.011 | 100.0% | 89.8% / 98.9% | 16.0% (12.2% / 19.7%) | 0.794 / 0.979 / 15.2% |
| `loud` loudness (RMS -20 dBFS) | 0.797 (0.805) | 0.724 | +0.074 | 0.975 ± 0.010 | 100.0% | 86.4% / 97.5% | 15.1% (12.7% / 17.5%) | 0.789 / 0.980 / 14.0% |
| `rs22` via 22.05 kHz (to 11 kHz) | 0.965 (0.977) | 0.722 | +0.242 | 0.885 ± 0.021 | 99.6% | 98.9% / 99.8% | 42.3% (43.3% / 41.4%) | 0.957 / 0.896 / 42.2% |
| `rs16` via 16 kHz (to 8 kHz) | 0.987 (0.993) | 0.726 | +0.261 | 0.816 ± 0.010 | 100.0% | 99.1% / 99.8% | 47.7% (47.1% / 48.2%) | 0.978 / 0.865 / 47.3% |
| `lp14` low-pass 14 kHz | 0.803 (0.810) | 0.711 | +0.092 | 0.974 ± 0.012 | 100.0% | 89.8% / 98.9% | 15.9% (12.2% / 19.6%) | 0.794 / 0.979 / 15.2% |
| `lp12` low-pass 12 kHz | 0.959 (0.973) | 0.739 | +0.220 | 0.932 ± 0.021 | 100.0% | 98.6% / 99.3% | 40.8% (38.3% / 43.4%) | 0.952 / 0.941 / 40.4% |
| `loud_rs16` loudness + via 16 kHz | 0.988 (0.994) | 0.746 | +0.242 | 0.821 ± 0.026 | 100.0% | 99.1% / 99.6% | 47.6% (48.4% / 46.8%) | 0.979 / 0.859 / 47.0% |
| `mp3` MP3 128k round trip (mono) | 0.848 (0.856) | 0.712 | +0.136 | 0.970 ± 0.011 | 99.6% | 94.1% / 99.1% | 21.0% (14.4% / 27.6%) | 0.843 / 0.968 / 21.0% |

## 7. The fix applied to one store's clips only

One store's clips through the variant, the other store's as they are in the catalog now.

| Variant | iTunes clips only: same-track cosine | Probe AUC | Other-store neighbours (Deezer / iTunes seeds) | Deezer clips only: same-track cosine | Probe AUC | Other-store neighbours |
|---|---|---|---|---|---|---|
| `rs32` via 32 kHz (content to 16 kHz) | 0.770 | 0.989 | 13.4% (11.0% / 15.8%) | 0.775 | 0.988 | 13.7% |
| `rs22` via 22.05 kHz (to 11 kHz) | 0.663 | 0.999 | 5.0% (6.7% / 3.2%) | 0.778 | 0.998 | 13.6% |
| `rs16` via 16 kHz (to 8 kHz) | 0.650 | 0.998 | 4.9% (7.2% / 2.7%) | 0.745 | 0.997 | 10.5% |
| `lp15` low-pass 15 kHz | 0.769 | 0.989 | 13.4% (10.8% / 15.9%) | 0.769 | 0.989 | 13.4% |
| `lp14` low-pass 14 kHz | 0.769 | 0.989 | 13.4% (10.8% / 16.0%) | 0.769 | 0.989 | 13.4% |
| `lp13` low-pass 13 kHz | 0.811 | 0.986 | 17.6% (16.2% / 19.0%) | 0.756 | 0.998 | 9.8% |
| `lp12` low-pass 12 kHz | 0.751 | 1.000 | 9.0% (11.4% / 6.7%) | 0.745 | 0.999 | 9.2% |
| `lp10` low-pass 10 kHz | 0.749 | 1.000 | 8.1% (12.0% / 4.2%) | 0.657 | 1.000 | 4.7% |
| `loud` loudness (RMS -20 dBFS) | 0.722 | 0.995 | 9.7% (10.0% / 9.5%) | 0.700 | 0.996 | 9.2% |
| `loud_rs22` loudness + via 22.05 kHz | 0.626 | 0.999 | 4.6% (6.6% / 2.6%) | 0.710 | 1.000 | 8.3% |
| `loud_rs16` loudness + via 16 kHz | 0.611 | 0.999 | 4.1% (6.5% / 1.8%) | 0.677 | 1.000 | 6.8% |
| `loud_lp12` loudness + low-pass 12 kHz | 0.694 | 1.000 | 6.7% (9.4% / 4.1%) | 0.684 | 1.000 | 6.3% |
| `mp3` MP3 128k round trip (mono) | 0.821 | 0.968 | 20.4% (16.0% / 24.8%) | 0.762 | 0.995 | 12.2% |
| `loud_noise50` loudness + white noise 50 dB under the clip | 0.715 | 0.998 | 8.2% (9.5% / 7.0%) | 0.752 | 0.981 | 16.7% |
| `mp3st` MP3 128k round trip of the stereo file (as Deezer encodes) | 0.950 | 0.685 | 49.1% (50.5% / 47.6%) | 0.703 | 0.998 | 7.3% |

## 8. Corrections on the vectors (no audio fetched again)

Fitted on these clips, so descriptive; the maps are fitted on the pairs of other albums (five folds). A probe AUC under 0.5 is what a cross-validated probe gives once the two means are made equal, not a signal.

| Correction | Same-track cosine | Probe AUC | Top 1 | Other-store neighbours (Deezer / iTunes seeds) |
|---|---|---|---|---|
| base: each store centred on its own mean | 0.857 | 0.297 | 92.4% | 41.7% (41.4% / 42.1%) |
| lp12: each store centred on its own mean | 0.914 | 0.316 | 92.4% | 48.1% (48.5% / 47.7%) |
| rs16: each store centred on its own mean | 0.924 | 0.365 | 92.7% | 49.3% (49.7% / 48.8%) |
| base: iTunes vectors shifted by the mean pair difference (fitted on other albums' pairs) | 0.905 | 0.556 | 92.1% | 41.8% (35.2% / 48.4%) |
| base: iTunes vectors ridge map, lambda 10 (fitted on other albums' pairs) | 0.919 | 0.289 | 92.4% | 47.3% (41.6% / 52.9%) |
| base: iTunes vectors ridge map, lambda 1 (fitted on other albums' pairs) | 0.924 | 0.454 | 92.3% | 50.1% (49.5% / 50.7%) |
| base: iTunes vectors ridge map, lambda 0.1 (fitted on other albums' pairs) | 0.915 | 0.527 | 90.4% | 51.5% (53.2% / 49.7%) |

Centring each store helps less than the audio fixes, as over the catalog (`source_effect.md`, section 6). The ridge map is the new one: it is fitted on pairs, which the catalog-level corrections could not be, and on held-out pairs it does about as well as the stereo round trip. Not tried on the catalog.

## 9. Discogs-EffNet on the same clips (baseline only)

349 pairs, embedded by the fetcher with the pipeline's own decode and model (`rmr_audio.embed`). EffNet listens at 16 kHz. The preprocessing variants were not run through EffNet (it lives in another environment, and low-passing above 8 kHz cannot change its input).

| Model | Same track, other store: cosine mean (median) | Other track of the album, same store | Gap | Store probe AUC ± fold sd | Pairs where the iTunes clip scores more iTunes | Own track found in the other store, top 1 / top 5 | Neighbours from the other store (Deezer seeds / iTunes seeds) |
|---|---|---|---|---|---|---|---|
| EffNet | 0.961 (0.990) | 0.694 | +0.267 | 0.560 ± 0.018 | 80.8% | 95.0% / 98.6% | 50.0% (49.6% / 50.4%) |
| CLAP, as it is | 0.769 (0.776) | 0.728 | +0.041 | 0.989 ± 0.006 | 100.0% | 79.2% / 95.1% | 13.3% (10.8% / 15.9%) |

## 10. YouTube as a third source

32 YouTube links of the paired albums checked by metadata (`rmr_audio.fulllength.classify`): full_album 25, unavailable 3, single_track 4. 25 full albums fetched (audio-only stream, deleted after its windows were cut), 150 windows of 30 s (up to 6 an album, laid out by `rmr_audio.windows`). Codec: {'opus': 25}, {'48000': 25} Hz, 131.12 (110.19 to 137.54) kbit/s; highest band above -100 dBFS 20000 (14750 to 20500) Hz; loudness -16.73 (-25.52 to -10.76) LUFS.

Probe: YouTube windows against one store's clips of the same albums (album-grouped folds). The windows are other parts of the album than the previews, so a probe can also learn what differs between an album's tracks; `floor` is the same probe on the YouTube windows split at random in two. Retrieval: the album's mean YouTube vector against the mean store vector of every album in the sample. Reference: one store clip against the means of the album's other clips (other tracks), same store and other store, for the same albums.

| Variant | YouTube vs Deezer AUC | YouTube vs iTunes AUC | iTunes vs Deezer, same albums | Floor | Own album among Deezer means, top 1 / top 5 | Among iTunes means | Reference top 1: Deezer clip vs Deezer rest / iTunes clip vs Deezer rest | YouTube windows' neighbours that are YouTube (expected) |
|---|---|---|---|---|---|---|---|---|
| `base` as it is (baseline) | 0.904 | 0.867 | 0.996 | 0.414 | 72.0% / 84.0% | 64.0% / 88.0% | 59.2% / 52.1% | 29.5% (17.2%) |
| `rs32` via 32 kHz (content to 16 kHz) | 0.899 | 0.873 | 0.994 | 0.501 | 72.0% / 84.0% | 68.0% / 92.0% | 60.6% / 53.5% | 28.1% (17.2%) |
| `rs22` via 22.05 kHz (to 11 kHz) | 0.723 | 0.759 | 0.926 | 0.517 | 72.0% / 92.0% | 76.0% / 92.0% | 49.3% / 56.3% | 20.7% (17.2%) |
| `rs16` via 16 kHz (to 8 kHz) | 0.691 | 0.662 | 0.802 | 0.453 | 72.0% / 92.0% | 68.0% / 92.0% | 46.5% / 53.5% | 19.7% (17.2%) |
| `lp15` low-pass 15 kHz | 0.904 | 0.867 | 0.996 | 0.459 | 72.0% / 84.0% | 64.0% / 88.0% | 59.2% / 52.1% | 29.4% (17.2%) |
| `lp14` low-pass 14 kHz | 0.903 | 0.867 | 0.996 | 0.562 | 72.0% / 84.0% | 64.0% / 88.0% | 59.2% / 52.1% | 29.4% (17.2%) |
| `lp13` low-pass 13 kHz | 0.882 | 0.848 | 0.968 | 0.425 | 76.0% / 92.0% | 72.0% / 92.0% | 56.3% / 53.5% | 27.1% (17.2%) |
| `lp12` low-pass 12 kHz | 0.824 | 0.835 | 0.905 | 0.622 | 72.0% / 88.0% | 68.0% / 92.0% | 50.7% / 53.5% | 24.7% (17.2%) |
| `lp10` low-pass 10 kHz | 0.713 | 0.771 | 0.871 | 0.530 | 72.0% / 92.0% | 76.0% / 92.0% | 47.9% / 54.9% | 23.5% (17.2%) |
| `loud` loudness (RMS -20 dBFS) | 0.913 | 0.891 | 0.997 | 0.423 | 80.0% / 84.0% | 68.0% / 92.0% | 59.2% / 49.3% | 33.3% (17.2%) |
| `loud_rs22` loudness + via 22.05 kHz | 0.740 | 0.792 | 0.932 | 0.407 | 76.0% / 88.0% | 80.0% / 92.0% | 47.9% / 50.7% | 20.8% (17.2%) |
| `loud_rs16` loudness + via 16 kHz | 0.702 | 0.628 | 0.771 | 0.436 | 76.0% / 88.0% | 72.0% / 84.0% | 42.2% / 52.1% | 20.3% (17.2%) |
| `loud_lp12` loudness + low-pass 12 kHz | 0.822 | 0.818 | 0.922 | 0.513 | 80.0% / 84.0% | 80.0% / 88.0% | 46.5% / 46.5% | 24.5% (17.2%) |
| `mp3` MP3 128k round trip (mono) | 0.886 | 0.834 | 0.992 | 0.466 | 72.0% / 84.0% | 72.0% / 88.0% | 54.9% / 54.9% | 31.0% (17.2%) |
| `loud_noise50` loudness + white noise 50 dB under the clip | 0.814 | 0.860 | 0.946 | 0.503 | 72.0% / 88.0% | 76.0% / 92.0% | 57.8% / 47.9% | 23.7% (17.2%) |

## What this means in practice

- A fix on the audio means embedding again, and since audio is never stored, downloading again. The stereo round trip touches only the iTunes-sourced clips: 11,636 of the 37,751 store-preview clips `source_effect.md` counts (31%), so about a third of the roughly 52,000 clips a full re-embed would fetch. The Deezer clips and their vectors stay. In the recipe (`experiments/preview_features/clap_catalog.py`, and the one-pass worker that calls it): when the clip's source is iTunes, after ffmpeg has decoded the preview and before the channels are averaged, pass the decoded stereo signal through `ffmpeg -c:a libmp3lame -b:a 128k` and decode it again (pipes, no file: `store_effect_dsp.mp3_stereo`), then (L+R)/2 and everything else as now. Deezer clips: no change.
- The low-pass alternative is one line for every clip (`store_effect_dsp.lowpass(x, 12000)` on the 44.1 kHz mono signal before `embed`), but it has to be applied to both stores, which means all 52,000 previews downloaded and embedded again, and it leaves more of the store in the vectors.
- Before either: the ridge map of section 8 can be tried on the stored vectors at no cost in downloads. If it holds on the catalog, no audio is needed.
- Full-length sources (YouTube, Bandcamp, local files) are a third encoding, milder. The round trip was not tested on them; the low-pass was, and helps.
- Whichever is chosen: the PCA block is refitted afterwards, and `source_effect.py`'s neighbour table (share of iTunes neighbours for Deezer seeds against the genre's make-up) is the check on the catalog itself.

## What could not be tested

- **How the lists sound.** Everything here is vectors and proxies. The music-information columns say the variants keep most of the baseline's structure; they do not say the baseline's structure was right.
- **The mechanism inside the encoder.** The band is located (12 to 14 kHz as CLAP sees it) and the stereo MP3 round trip reproduces the effect; which encoder decision does it (joint stereo, the bit reservoir, a psychoacoustic cut that moves from frame to frame) was not taken apart.
- **Deezer's encoder is not ours.** The round trip uses ffmpeg's libmp3lame at its defaults. It lands close to Deezer's files on these pairs; it is not known to be the same encoder or settings, and Deezer may change theirs.
- **The catalog itself.** These are pairs: the same track from both stores. In the catalog an album comes from one store, and iTunes-only albums are a different population (other storefronts, other eras). The fix has to be checked there after re-embedding.
- **EffNet under the variants**, and the aligned set under `mp3st` (that variant needs the stereo file; the aligned cut is made on the mono signal).
- **Sampling.** Albums with a YouTube link were preferred in half the draws; pairs need equal titles and durations, which leaves out albums whose listings differ (other editions, live albums with venue names in the titles). No listening confirmed that paired tracks are the same recording, but the waveform correlation does for the pairs it aligned.

## What would change this reading

- If, after re-embedding the iTunes clips through the round trip, Deezer seeds in the catalog still got far fewer iTunes neighbours than their genre's make-up, the pairs would not have carried over and something besides encoding separates the two populations.
- If a different MP3 encoder or bitrate on the iTunes side closed the gap equally well or better, the claim narrows from Deezer's encoding to any low-bitrate stereo MP3.
- If a listener found that the round-tripped or low-passed lists were worse, the proxies in section 5 missed what CLAP's top bands were good for.
- If a larger sample showed pairs with an offset of 20 s or more behaving differently, the excerpt would matter for those albums (here the cut pairs and the whole previews agree).

## Reproduce

```
cd experiments/audio_10k
PYTHONDONTWRITEBYTECODE=1 nice -n 19 <.venv-torch python> store_effect_fix.py run --fetch-python <.venv-audio python> --albums 120 --youtube 25
PYTHONDONTWRITEBYTECODE=1 <build .venv python (scikit-learn, scipy)> store_effect_fix.py report
```

The first resumes from `cache/store_effect_fix.sqlite` (gitignored: embeddings and measurements, no audio). Run it on mains power: the laptop sleeps on battery and the stores' connections do not survive it.
