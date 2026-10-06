# Album status: counts

Written by `python -m rmr_audio.album_status` with `album_status.csv`, the row per album. The columns and the rules are in that module's docstring.

| state | existing | new | all |
|---|---:|---:|---:|
| done | 3997 | 6145 | 10142 |
| partial | 47 | 55 | 102 |
| no_audio | 37 | 186 | 223 |
| all | 4081 | 6386 | 10467 |

| next_step | existing | new | all |
|---|---:|---:|---:|
| none | 4000 | 6166 | 10166 |
| embed | 2 | 0 | 2 |
| reembed | 0 | 0 | 0 |
| manual_link | 0 | 0 | 0 |
| youtube_link | 0 | 0 | 0 |
| youtube_search | 0 | 0 | 0 |
| youtube_full_length | 2 | 0 | 2 |
| none_available | 77 | 220 | 297 |
| all | 4081 | 6386 | 10467 |

| audio_source | existing | new | all |
|---|---:|---:|---:|
| deezer | 3661 | 2815 | 6476 |
| itunes | 218 | 2675 | 2893 |
| youtube | 165 | 710 | 875 |
| none | 37 | 186 | 223 |
| all | 4081 | 6386 | 10467 |

| fulllength (the sheet's YouTube link) | existing | new | all |
|---|---:|---:|---:|
| embedded | 70 | 550 | 620 |
| unavailable | 9 | 52 | 61 |
| single_track | 3 | 20 | 23 |
| mismatch | 0 | 14 | 14 |
| failed | 0 | 0 | 0 |
| not_tried | 3999 | 5750 | 9749 |
| all | 4081 | 6386 | 10467 |

| youtube_search | existing | new | all |
|---|---:|---:|---:|
| found | 92 | 158 | 250 |
| none | 80 | 222 | 302 |
| failed | 2 | 0 | 2 |
| not_tried | 3907 | 6006 | 9913 |
| all | 4081 | 6386 | 10467 |

| manual_link (a link given by hand) | existing | new | all |
|---|---:|---:|---:|
| embedded | 3 | 2 | 5 |
| unavailable | 0 | 0 | 0 |
| mismatch | 0 | 0 | 0 |
| failed | 0 | 0 | 0 |
| not_tried | 0 | 0 | 0 |
| none | 4078 | 6384 | 10462 |
| all | 4081 | 6386 | 10467 |

| albums | existing | new | all |
|---|---:|---:|---:|
| effnet: an ok clip | 4044 | 6200 | 10244 |
| clap: an ok clip | 4042 | 6200 | 10242 |
| clap_mp3: an ok clip | 4042 | 6200 | 10242 |
| effnet: 4 clips or full-length windows | 3999 | 6145 | 10144 |
| clap: 4 clips or full-length windows | 3997 | 6145 | 10142 |
| clap_mp3: 4 clips or full-length windows | 3997 | 6145 | 10142 |
| ambiguous | 149 | 669 | 818 |
| under_covered | 145 | 169 | 314 |
| few_long_tracks | 13 | 148 | 161 |
| short_preview | 0 | 9 | 9 |
| wrong_listing_pending | 0 | 0 | 0 |
| duplicate_listing | 10 | 26 | 36 |
| edge_case | 142 | 148 | 290 |
| has_youtube_url | 952 | 2262 | 3214 |
