# Album status: counts

Written by `python -m rmr_audio.album_status` with `album_status.csv`, the row per album. The columns and the rules are in that module's docstring.

| state | existing | new | all |
|---|---:|---:|---:|
| done | 3829 | 5903 | 9732 |
| partial | 151 | 168 | 319 |
| no_audio | 101 | 315 | 416 |
| all | 4081 | 6386 | 10467 |

| next_step | existing | new | all |
|---|---:|---:|---:|
| none | 3822 | 5903 | 9725 |
| embed | 6 | 5 | 11 |
| reembed | 7 | 0 | 7 |
| youtube_link | 31 | 24 | 55 |
| youtube_search | 70 | 286 | 356 |
| youtube_full_length | 145 | 168 | 313 |
| none_available | 0 | 0 | 0 |
| all | 4081 | 6386 | 10467 |

| audio_source | existing | new | all |
|---|---:|---:|---:|
| deezer | 3754 | 2869 | 6623 |
| itunes | 226 | 2730 | 2956 |
| youtube | 0 | 472 | 472 |
| none | 101 | 315 | 416 |
| all | 4081 | 6386 | 10467 |

| fulllength (the sheet's YouTube link) | existing | new | all |
|---|---:|---:|---:|
| embedded | 0 | 472 | 472 |
| unavailable | 0 | 44 | 44 |
| single_track | 0 | 15 | 15 |
| mismatch | 0 | 12 | 12 |
| failed | 0 | 24 | 24 |
| not_tried | 4081 | 5819 | 9900 |
| all | 4081 | 6386 | 10467 |

| albums | existing | new | all |
|---|---:|---:|---:|
| effnet: an ok clip | 3980 | 6071 | 10051 |
| clap: an ok clip | 3978 | 6071 | 10049 |
| clap_mp3: an ok clip | 3978 | 6067 | 10045 |
| effnet: 4 clips or full-length windows | 3835 | 5903 | 9738 |
| clap: 4 clips or full-length windows | 3829 | 5903 | 9732 |
| clap_mp3: 4 clips or full-length windows | 3829 | 5899 | 9728 |
| ambiguous | 149 | 669 | 818 |
| under_covered | 145 | 169 | 314 |
| few_long_tracks | 13 | 148 | 161 |
| short_preview | 0 | 9 | 9 |
| wrong_listing_pending | 7 | 0 | 7 |
| duplicate_listing | 10 | 26 | 36 |
| has_youtube_url | 952 | 2262 | 3214 |
