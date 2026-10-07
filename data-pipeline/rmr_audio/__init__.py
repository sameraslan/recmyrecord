"""The audio stage: match an album on Deezer or iTunes (or read local files), embed 30-second clips with
Discogs-EffNet and keep the album's mean embedding in the committed store (data-pipeline/audio/).

Runs in its own environment (.venv-audio, Python 3.11, requirements-audio.txt); see the README.
"""
