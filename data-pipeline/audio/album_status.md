# Album status: counts

Written by `python -m rmr_audio.album_status` with `album_status.csv`, the row per album. The columns and the rules are in that module's docstring.

| state | existing | new | all |
|---|---:|---:|---:|
| done | 3994 | 6143 | 10137 |
| partial | 47 | 55 | 102 |
| no_audio | 40 | 188 | 228 |
| all | 4081 | 6386 | 10467 |

| next_step | existing | new | all |
|---|---:|---:|---:|
| none | 3997 | 6164 | 10161 |
| embed | 2 | 0 | 2 |
| reembed | 0 | 0 | 0 |
| youtube_link | 0 | 0 | 0 |
| youtube_search | 0 | 0 | 0 |
| youtube_full_length | 2 | 0 | 2 |
| none_available | 80 | 222 | 302 |
| all | 4081 | 6386 | 10467 |

| audio_source | existing | new | all |
|---|---:|---:|---:|
| deezer | 3661 | 2815 | 6476 |
| itunes | 218 | 2675 | 2893 |
| youtube | 162 | 708 | 870 |
| none | 40 | 188 | 228 |
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

| albums | existing | new | all |
|---|---:|---:|---:|
| effnet: an ok clip | 4041 | 6198 | 10239 |
| clap: an ok clip | 4039 | 6198 | 10237 |
| clap_mp3: an ok clip | 4039 | 6198 | 10237 |
| effnet: 4 clips or full-length windows | 3996 | 6143 | 10139 |
| clap: 4 clips or full-length windows | 3994 | 6143 | 10137 |
| clap_mp3: 4 clips or full-length windows | 3994 | 6143 | 10137 |
| ambiguous | 149 | 669 | 818 |
| under_covered | 145 | 169 | 314 |
| few_long_tracks | 13 | 148 | 161 |
| short_preview | 0 | 9 | 9 |
| wrong_listing_pending | 0 | 0 | 0 |
| duplicate_listing | 10 | 26 | 36 |
| edge_case | 142 | 148 | 290 |
| has_youtube_url | 952 | 2262 | 3214 |
