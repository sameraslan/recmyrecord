# Album status: counts

Written by `python -m rmr_audio.album_status` with `album_status.csv`, the row per album. The columns and the rules are in that module's docstring.

| state | existing | new | all |
|---|---:|---:|---:|
| done | 3829 | 5511 | 9340 |
| partial | 151 | 168 | 319 |
| no_audio | 101 | 707 | 808 |
| all | 4081 | 6386 | 10467 |

| next_step | existing | new | all |
|---|---:|---:|---:|
| none | 3822 | 5511 | 9333 |
| embed | 6 | 5 | 11 |
| reembed | 7 | 0 | 7 |
| youtube_link | 31 | 472 | 503 |
| youtube_search | 70 | 230 | 300 |
| youtube_full_length | 145 | 168 | 313 |
| none_available | 0 | 0 | 0 |
| all | 4081 | 6386 | 10467 |

| audio_source | existing | new | all |
|---|---:|---:|---:|
| deezer | 3754 | 2869 | 6623 |
| itunes | 226 | 2730 | 2956 |
| youtube | 0 | 80 | 80 |
| none | 101 | 707 | 808 |
| all | 4081 | 6386 | 10467 |

| fulllength (the sheet's YouTube link) | existing | new | all |
|---|---:|---:|---:|
| embedded | 0 | 79 | 79 |
| unavailable | 0 | 9 | 9 |
| single_track | 0 | 2 | 2 |
| mismatch | 0 | 4 | 4 |
| failed | 0 | 1 | 1 |
| not_tried | 4081 | 6291 | 10372 |
| all | 4081 | 6386 | 10467 |

| albums | existing | new | all |
|---|---:|---:|---:|
| effnet: an ok clip | 3980 | 5679 | 9659 |
| clap: an ok clip | 3978 | 5679 | 9657 |
| effnet: 4 clips or full-length windows | 3835 | 5511 | 9346 |
| clap: 4 clips or full-length windows | 3829 | 5511 | 9340 |
| ambiguous | 149 | 669 | 818 |
| under_covered | 145 | 169 | 314 |
| few_long_tracks | 0 | 148 | 148 |
| short_preview | 0 | 9 | 9 |
| wrong_listing_pending | 7 | 0 | 7 |
| duplicate_listing | 10 | 26 | 36 |
| has_youtube_url | 952 | 2262 | 3214 |
