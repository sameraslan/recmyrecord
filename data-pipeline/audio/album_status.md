# Album status: counts

Written by `python -m rmr_audio.album_status` with `album_status.csv`, the row per album. The columns and the rules are in that module's docstring.

| state | existing | new | all |
|---|---:|---:|---:|
| done | 3840 | 5937 | 9777 |
| partial | 145 | 162 | 307 |
| no_audio | 96 | 287 | 383 |
| all | 4081 | 6386 | 10467 |

| next_step | existing | new | all |
|---|---:|---:|---:|
| none | 3836 | 5958 | 9794 |
| embed | 6 | 5 | 11 |
| reembed | 7 | 0 | 7 |
| youtube_link | 31 | 1 | 32 |
| youtube_search | 63 | 263 | 326 |
| youtube_full_length | 134 | 135 | 269 |
| none_available | 4 | 24 | 28 |
| all | 4081 | 6386 | 10467 |

| audio_source | existing | new | all |
|---|---:|---:|---:|
| deezer | 3751 | 2865 | 6616 |
| itunes | 223 | 2728 | 2951 |
| youtube | 11 | 506 | 517 |
| none | 96 | 287 | 383 |
| all | 4081 | 6386 | 10467 |

| fulllength (the sheet's YouTube link) | existing | new | all |
|---|---:|---:|---:|
| embedded | 4 | 497 | 501 |
| unavailable | 0 | 44 | 44 |
| single_track | 0 | 15 | 15 |
| mismatch | 0 | 12 | 12 |
| failed | 0 | 1 | 1 |
| not_tried | 4077 | 5817 | 9894 |
| all | 4081 | 6386 | 10467 |

| youtube_search | existing | new | all |
|---|---:|---:|---:|
| found | 7 | 9 | 16 |
| none | 4 | 24 | 28 |
| failed | 0 | 0 | 0 |
| not_tried | 4070 | 6353 | 10423 |
| all | 4081 | 6386 | 10467 |

| albums | existing | new | all |
|---|---:|---:|---:|
| effnet: an ok clip | 3985 | 6099 | 10084 |
| clap: an ok clip | 3983 | 6099 | 10082 |
| clap_mp3: an ok clip | 3983 | 6095 | 10078 |
| effnet: 4 clips or full-length windows | 3846 | 5937 | 9783 |
| clap: 4 clips or full-length windows | 3840 | 5937 | 9777 |
| clap_mp3: 4 clips or full-length windows | 3840 | 5933 | 9773 |
| ambiguous | 149 | 669 | 818 |
| under_covered | 145 | 169 | 314 |
| few_long_tracks | 13 | 148 | 161 |
| short_preview | 0 | 9 | 9 |
| wrong_listing_pending | 7 | 0 | 7 |
| duplicate_listing | 10 | 26 | 36 |
| edge_case | 142 | 148 | 290 |
| has_youtube_url | 952 | 2262 | 3214 |
