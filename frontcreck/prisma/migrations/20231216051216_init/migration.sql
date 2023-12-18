-- CreateTable
CREATE TABLE "Artist" (
    "ArtistID" SERIAL NOT NULL,
    "Name" TEXT NOT NULL,
    "SpotifyURI" TEXT,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("ArtistID")
);

-- CreateTable
CREATE TABLE "Album" (
    "AlbumID" SERIAL NOT NULL,
    "Title" TEXT NOT NULL,
    "ArtistID" INTEGER,
    "ReleaseYear" INTEGER,
    "SpotifyURI" TEXT,

    CONSTRAINT "Album_pkey" PRIMARY KEY ("AlbumID")
);

-- CreateTable
CREATE TABLE "SpotifyAudioFeatures" (
    "AlbumID" INTEGER NOT NULL,
    "Danceability" DOUBLE PRECISION,
    "Energy" DOUBLE PRECISION,
    "Key" INTEGER,
    "Loudness" DOUBLE PRECISION,
    "Mode" INTEGER,
    "Speechiness" DOUBLE PRECISION,
    "Acousticness" DOUBLE PRECISION,
    "Instrumentalness" DOUBLE PRECISION,
    "Liveness" DOUBLE PRECISION,
    "Valence" DOUBLE PRECISION,
    "Tempo" DOUBLE PRECISION,
    "DurationMs" INTEGER,
    "TimeSignature" INTEGER
);

-- CreateTable
CREATE TABLE "RYMDescriptor" (
    "DescriptorID" SERIAL NOT NULL,
    "Name" TEXT NOT NULL,
    "Description" TEXT,

    CONSTRAINT "RYMDescriptor_pkey" PRIMARY KEY ("DescriptorID")
);

-- CreateTable
CREATE TABLE "AlbumDescriptor" (
    "AlbumID" INTEGER NOT NULL,
    "DescriptorID" INTEGER NOT NULL,
    "Weighting" DOUBLE PRECISION,

    CONSTRAINT "AlbumDescriptor_pkey" PRIMARY KEY ("AlbumID","DescriptorID")
);

-- CreateTable
CREATE TABLE "AlbumRecommendation" (
    "RecommendationID" SERIAL NOT NULL,
    "AlbumID" INTEGER NOT NULL,
    "RecommendedAlbumID" INTEGER NOT NULL,
    "SimilarityScore" DOUBLE PRECISION,

    CONSTRAINT "AlbumRecommendation_pkey" PRIMARY KEY ("RecommendationID")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpotifyAudioFeatures_AlbumID_key" ON "SpotifyAudioFeatures"("AlbumID");

-- AddForeignKey
ALTER TABLE "Album" ADD CONSTRAINT "Album_ArtistID_fkey" FOREIGN KEY ("ArtistID") REFERENCES "Artist"("ArtistID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotifyAudioFeatures" ADD CONSTRAINT "SpotifyAudioFeatures_AlbumID_fkey" FOREIGN KEY ("AlbumID") REFERENCES "Album"("AlbumID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumDescriptor" ADD CONSTRAINT "AlbumDescriptor_AlbumID_fkey" FOREIGN KEY ("AlbumID") REFERENCES "Album"("AlbumID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumDescriptor" ADD CONSTRAINT "AlbumDescriptor_DescriptorID_fkey" FOREIGN KEY ("DescriptorID") REFERENCES "RYMDescriptor"("DescriptorID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumRecommendation" ADD CONSTRAINT "AlbumRecommendation_AlbumID_fkey" FOREIGN KEY ("AlbumID") REFERENCES "Album"("AlbumID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumRecommendation" ADD CONSTRAINT "AlbumRecommendation_RecommendedAlbumID_fkey" FOREIGN KEY ("RecommendedAlbumID") REFERENCES "Album"("AlbumID") ON DELETE RESTRICT ON UPDATE CASCADE;
