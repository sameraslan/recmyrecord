# Imputing the audio block of albums without preview audio

3944 albums with audio, 137 without; 5 seeds, 137 albums hidden per seed. Columns as in imputation.py's docstring. Albums with audio have 10.8 descriptors on average; the albums without have 10.3 (0 of them none).

The build uses k=3, rescaled (rmr_pipeline.audio). A plain mean of several blocks is shorter than a real block, sits near the middle of the audio space and lands in two to four times as many lists as an average album; rescaling it to its neighbours' norm removes most of that. k=1 copies one album's block, so that album is always the first sonic recommendation; from k=3 to k=10 the rescaled settings are within 0.02 of each other on overlap and genre share, while hubness and the share of imputed albums recommending each other grow with k.

## Hidden albums, sonic stop

| setting | overlap | genre | N10 mean | N10 max | never | moved |
|---|---|---|---|---|---|---|
| true | – | 0.246 | 10.1 | 32 | 0.006 | – |
| centre | 0.012 | 0.054 | 11.2 | 107 | 0.039 | 0.0389 |
| k=1 | 0.082 | 0.149 | 10.8 | 34 | 0.000 | 0.0587 |
| k=1, rescaled | 0.082 | 0.149 | 10.8 | 34 | 0.000 | 0.0587 |
| k=3 | 0.073 | 0.143 | 28.2 | 74 | 0.003 | 0.0994 |
| k=3, rescaled | 0.083 | 0.151 | 13.9 | 49 | 0.067 | 0.0647 |
| k=5 | 0.064 | 0.131 | 35.0 | 86 | 0.002 | 0.1143 |
| k=5, rescaled | 0.078 | 0.147 | 15.6 | 53 | 0.060 | 0.0689 |
| k=10 | 0.041 | 0.108 | 40.9 | 104 | 0.000 | 0.1283 |
| k=10, rescaled | 0.072 | 0.150 | 18.5 | 59 | 0.035 | 0.0745 |
| k=20 | 0.025 | 0.089 | 41.5 | 92 | 0.000 | 0.1299 |
| k=20, rescaled | 0.060 | 0.130 | 20.3 | 60 | 0.020 | 0.0769 |
| k=50 | 0.020 | 0.078 | 37.7 | 91 | 0.000 | 0.1191 |
| k=50, rescaled | 0.040 | 0.107 | 20.7 | 69 | 0.020 | 0.0751 |

## Hidden albums, balanced stop

| setting | overlap | genre | N10 mean | N10 max | never | moved |
|---|---|---|---|---|---|---|
| true | – | 0.275 | 10.2 | 77 | 0.039 | – |
| centre | 0.105 | 0.077 | 23.5 | 273 | 0.020 | 0.0675 |
| k=1 | 0.370 | 0.184 | 9.3 | 90 | 0.018 | 0.0392 |
| k=1, rescaled | 0.370 | 0.184 | 9.3 | 90 | 0.018 | 0.0392 |
| k=3 | 0.424 | 0.181 | 19.2 | 172 | 0.029 | 0.0562 |
| k=3, rescaled | 0.416 | 0.182 | 12.2 | 103 | 0.050 | 0.0420 |
| k=5 | 0.426 | 0.175 | 22.6 | 227 | 0.025 | 0.0638 |
| k=5, rescaled | 0.424 | 0.176 | 13.0 | 114 | 0.045 | 0.0431 |
| k=10 | 0.419 | 0.176 | 25.6 | 234 | 0.023 | 0.0704 |
| k=10, rescaled | 0.433 | 0.180 | 13.7 | 113 | 0.071 | 0.0435 |
| k=20 | 0.398 | 0.167 | 27.5 | 263 | 0.020 | 0.0756 |
| k=20, rescaled | 0.413 | 0.176 | 14.2 | 115 | 0.066 | 0.0449 |
| k=50 | 0.359 | 0.158 | 28.2 | 256 | 0.015 | 0.0767 |
| k=50, rescaled | 0.374 | 0.164 | 13.7 | 109 | 0.063 | 0.0439 |

## The albums that really have no audio (whole catalog)

`own kind`: share of their recommendations that are other imputed albums (0.034 if they were spread evenly).

| setting | sonic genre | sonic N10 mean | sonic N10 max | sonic never | sonic own kind | balanced genre | balanced N10 mean | balanced N10 max | balanced never | balanced own kind |
|---|---|---|---|---|---|---|---|---|---|---|
| centre | 0.081 | 11.1 | 104 | 0.0657 | 1 | 0.102 | 21.5 | 264 | 0.0438 | 0.881 |
| k=1 | 0.156 | 10.4 | 26 | 0 | 0.0628 | 0.187 | 8.37 | 42 | 0.0365 | 0.0562 |
| k=1, rescaled | 0.156 | 10.4 | 26 | 0 | 0.0628 | 0.187 | 8.37 | 42 | 0.0365 | 0.0562 |
| k=3 | 0.141 | 24 | 62 | 0.0073 | 0.308 | 0.196 | 16.7 | 170 | 0.0438 | 0.109 |
| k=3, rescaled | 0.146 | 12.2 | 45 | 0.0803 | 0.0971 | 0.193 | 10.9 | 75 | 0.11 | 0.0693 |
| k=5 | 0.151 | 30.8 | 91 | 0 | 0.55 | 0.205 | 19.9 | 217 | 0.0438 | 0.147 |
| k=5, rescaled | 0.16 | 13.8 | 42 | 0.0949 | 0.153 | 0.201 | 11.7 | 72 | 0.102 | 0.0825 |
| k=10 | 0.113 | 36.2 | 102 | 0 | 0.792 | 0.193 | 22.9 | 229 | 0.0438 | 0.186 |
| k=10, rescaled | 0.144 | 17.2 | 50 | 0.0657 | 0.271 | 0.189 | 12.7 | 76 | 0.0803 | 0.0898 |
| k=20 | 0.11 | 35.4 | 90 | 0 | 0.891 | 0.193 | 24 | 255 | 0.0292 | 0.253 |
| k=20, rescaled | 0.119 | 17.1 | 58 | 0.0219 | 0.395 | 0.183 | 12.6 | 78 | 0.0949 | 0.123 |
| k=50 | 0.0927 | 32.3 | 78 | 0 | 0.948 | 0.18 | 24.2 | 262 | 0.0438 | 0.353 |
| k=50, rescaled | 0.101 | 17.2 | 58 | 0.0365 | 0.57 | 0.182 | 12.1 | 82 | 0.0949 | 0.188 |

