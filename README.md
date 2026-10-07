<h1 align="center">recmyrecord</h1>

<p align="center">
  Start with an album you like. Get the most similar albums, by sound and by mood. Time for exploration!
  <br><br>
  <a href="https://www.recmyrecord.com"><b>recmyrecord.com</b></a>
</p>

<p align="center">
  <img src="docs/readme/search.gif" alt="Searching for In Rainbows and opening its closest albums" width="900">
</p>

Every album is placed by how it sounds, measured from short audio previews, and how it feels, using mood descriptors handpicked from RateYourMusic. Pick one and you get the albums nearest to it.

<p align="center">
  <img src="docs/readme/slider.gif" alt="Sliding from sound to mood reorders the list and moves the map" width="900">
</p>

Slide between sound and mood to change what "close" means.

<p align="center">
  <img src="docs/readme/map.gif" alt="Exploring the map of albums" width="900">
</p>

Or skip the search and wander the map: 10,000+ albums, with the ones that sound or feel alike sitting together.

<p align="center">
  <img src="docs/readme/phone.gif" alt="The album page on a phone, switching between list and map" width="300">
</p>

<p align="center"><a href="https://www.recmyrecord.com"><b>Try it at recmyrecord.com</b></a></p>

## How sound is measured

Sound comes from [Discogs-EffNet](https://github.com/MTG/essentia/blob/master/doc/sphinxdoc/models.rst#discogs-effnet), a model from the Music Technology Group in Barcelona, released with their [Essentia](https://github.com/MTG/essentia) library. It was trained to tell 400 Discogs music styles apart.

Four 30-second preview clips of each album go through the model and the results are averaged. Albums with similar averages sound alike. No audio is kept.

We compared it with [CLAP](https://huggingface.co/laion/larger_clap_music_and_speech) by listening to both models' lists for 38 albums, side by side. Discogs-EffNet's lists were more similar to the starting album. Its neighbours also shared the album's first RateYourMusic genre more often (24% against 20%). That is one listening session and a rough proxy. It was never run as a benchmark.

About 2% of albums have no audio and are matched by mood only.

More: [the paper](https://zenodo.org/records/7316790), [the comparison](experiments/audio_10k/REPORT.md), [the move away from Spotify's audio features](experiments/preview_features/REPORT.md), [how the data is built](data-pipeline/README.md#audio).

<br>

<details>
<summary>Running it locally</summary>

<br>

The site is a static Next.js app in `frontcreck/` and needs no environment variables. With Node 22 on arm64:

```bash
cd frontcreck
npm install
npm run dev
```

The data it serves is committed. To rebuild it, see [`data-pipeline/README.md`](data-pipeline/README.md). More detail in [`frontcreck/README.md`](frontcreck/README.md).

| Folder | Contents |
|---|---|
| `frontcreck/` | The website |
| `data-pipeline/` | Builds the data files the site serves |
| `data-retrieval/` | The original scraping and recommender code, kept for reference |

</details>
