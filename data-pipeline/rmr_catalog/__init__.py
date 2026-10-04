"""The catalog builder: the RYM chart sheet and the albums the site already has, as one table keyed by RYM id
(data-pipeline/catalog/albums.csv), the key of every existing album (data-pipeline/audio/keys.csv) and the
pairs it would not decide (data-pipeline/catalog/doubtful_pairs.csv).

Runs with the audio venv (the text normalisation is rmr_audio.textnorm, which needs rapidfuzz); no network.
See the README, Catalog and keys.
"""
