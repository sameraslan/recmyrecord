const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');

const prisma = new PrismaClient();
const app = express();

app.use(express.json());
app.use(cors()); // Enable CORS for frontend access

// Artist Routes
app.get('/artists', async (req, res) => {
  const artists = await prisma.artist.findMany();
  res.json(artists);
});

app.get('/artists/:id', async (req, res) => {
  const { id } = req.params;
  const artist = await prisma.artist.findUnique({
    where: { ArtistID: parseInt(id) },
  });
  res.json(artist);
});

// Album Routes
app.get('/albums', async (req, res) => {
  const albums = await prisma.album.findMany();
  res.json(albums);
});

app.get('/albums/:id', async (req, res) => {
  const { id } = req.params;
  const album = await prisma.album.findUnique({
    where: { AlbumID: parseInt(id) },
  });
  res.json(album);
});

// Spotify Audio Features Routes
app.get('/audio-features/:albumId', async (req, res) => {
  const { albumId } = req.params;
  const audioFeatures = await prisma.spotifyAudioFeatures.findUnique({
    where: { AlbumID: parseInt(albumId) },
  });
  res.json(audioFeatures);
});

// Album Recommendations Routes
app.get('/recommendations/:albumId', async (req, res) => {
  const { albumId } = req.params;
  const recommendations = await prisma.albumRecommendation.findMany({
    where: { AlbumID: parseInt(albumId) },
  });
  res.json(recommendations);
});

// Search Routes
app.get('/search/albums', async (req, res) => {
  const { query } = req.query;
  const albums = await prisma.album.findMany({
    where: {
      Title: {
        contains: query,
        mode: 'insensitive', // Case-insensitive
      },
    },
  });
  res.json(albums);
});

app.get('/artist/:id/albums', async (req, res) => {
  const { id } = req.params;
  const albums = await prisma.album.findMany({
    where: { ArtistID: parseInt(id) },
  });
  res.json(albums);
});

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
