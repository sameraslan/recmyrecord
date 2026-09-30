# recmyrecord

recmyrecord recommends albums by how close they are to one you pick, comparing their sound (Spotify's audio values) and their mood (handpicked RateYourMusic descriptors). It also shows 4,000+ albums on a map where albums that sound or feel alike sit close together.

## Repository layout

| Folder | Contents |
|---|---|
| `frontcreck/` | The website: a static Next.js app. |
| `data-pipeline/` | Builds every data file the website serves, from the recommender's feature table and the map's cover sprites. |
| `data-retrieval/` | The original scraping and recommender code, kept for reference. The pipeline reads its feature table and never changes it. |
| `docs/superpowers/` | The design spec and the implementation plan of the current site. |
| `recVenv/` | A legacy Python virtualenv committed with the original code. Not used by the site or the pipeline. |

## Running the site

See [`frontcreck/README.md`](frontcreck/README.md). In short, with Node 20.20.2 on arm64:

```bash
cd frontcreck
npm install
npm run dev
```

The site needs no environment variables.

## Rebuilding the data

See [`data-pipeline/README.md`](data-pipeline/README.md). The outputs are committed, so this is only needed to change the data. With Python 3.11:

```bash
python3.11 -m venv data-pipeline/.venv
data-pipeline/.venv/bin/pip install -r data-pipeline/requirements.txt
cd data-pipeline
.venv/bin/python -m rmr_pipeline.build --map-root <path>
.venv/bin/python -m rmr_pipeline.validate
```

`<path>` is a checkout of the music map that supplies the cover sprites and cover links.
