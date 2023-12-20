-- Query 1: Albums with higher than average instrumentalness but lower than average speechiness
SELECT A.AlbumID, A.Title
FROM Album A
JOIN SpotifyAudioFeatures S ON A.AlbumID = S.AlbumID
WHERE S.Instrumentalness > (SELECT AVG(Instrumentalness) FROM SpotifyAudioFeatures)
AND S.Speechiness < (SELECT AVG(Speechiness) FROM SpotifyAudioFeatures);

-- Query 2: The 3 longest albums
SELECT A.AlbumID, A.Title
FROM Album A
JOIN SpotifyAudioFeatures S ON A.AlbumID = S.AlbumID
ORDER BY S.DurationMs DESC
LIMIT 3;

-- Query 3: Artist with the most albums in the top 500
SELECT Ar.Name, COUNT(*) AS NumberOfAlbums
FROM Artist Ar
JOIN Album A ON Ar.ArtistID = A.ArtistID
WHERE A.AlbumID < 500
GROUP BY Ar.Name
ORDER BY NumberOfAlbums DESC
LIMIT 1;

-- Query 4: Artists whose albums all have high liveness and acousticness scores (> .75)
SELECT DISTINCT Ar.Name
FROM Artist Ar
JOIN Album A ON Ar.ArtistID = A.ArtistID
JOIN SpotifyAudioFeatures S ON A.AlbumID = S.AlbumID
GROUP BY Ar.Name
HAVING MIN(S.Liveness) > 0.75 AND MIN(S.Acousticness) > 0.75;

-- Query 5: Find albums with the highest similarity score for a given album
-- Replace :AlbumID with the desired AlbumID
SELECT AR.RecommendedAlbumID, A.Title, AR.SimilarityScore
FROM AlbumRecommendation AR
JOIN Album A ON AR.RecommendedAlbumID = A.AlbumID
WHERE AR.AlbumID = :AlbumID
ORDER BY AR.SimilarityScore DESC;

-- Query 6: Albums with most diverse descriptors
SELECT A.AlbumID, A.Title, COUNT(DISTINCT AD.DescriptorID) AS DescriptorCount
FROM Album A
JOIN AlbumDescriptor AD ON A.AlbumID = AD.AlbumID
GROUP BY A.AlbumID
ORDER BY DescriptorCount DESC
LIMIT 10;

-- Query 7: List all albums released by a specific artist
-- Replace 'Radiohead' with the desired artist's name
SELECT A.AlbumID, A.Title
FROM Album A
JOIN Artist Ar ON A.ArtistID = Ar.ArtistID
WHERE Ar.Name = 'Radiohead';

-- Query 8: Find average loudness and tempo of albums by a specific artist
-- Replace 'Radiohead' with the desired artist's name
SELECT AVG(S.Loudness) AS AvgLoudness, AVG(S.Tempo) AS AvgTempo
FROM SpotifyAudioFeatures S
JOIN Album A ON S.AlbumID = A.AlbumID
JOIN Artist Ar ON A.ArtistID = Ar.ArtistID
WHERE Ar.Name = 'Radiohead';

-- Query 9: Albums with no Spotify URI
SELECT AlbumID, Title
FROM Album
WHERE SpotifyURI IS NULL;

-- Query 10: Count of albums per artist
SELECT Ar.Name, COUNT(*) AS AlbumCount
FROM Artist Ar
JOIN Album A ON Ar.ArtistID = A.ArtistID
GROUP BY Ar.Name;

-- Query 11: Albums with the most descriptors
SELECT A.AlbumID, A.Title, COUNT(AD.DescriptorID) AS DescriptorCount
FROM Album A
JOIN AlbumDescriptor AD ON A.AlbumID = AD.AlbumID
GROUP BY A.AlbumID
ORDER BY DescriptorCount DESC
LIMIT 5;

-- Query 12: List albums with specific key and mode (e.g., key = C major)
-- Replace 0.57575756 and 0.66666669 with desired values
SELECT A.AlbumID, A.Title
FROM Album A
JOIN SpotifyAudioFeatures S ON A.AlbumID = S.AlbumID
WHERE S.Key = 0.57575756 AND S.Mode = 0.66666669;

-- Query 13: Artists with only one album
SELECT Ar.Name
FROM Artist Ar
JOIN Album A ON Ar.ArtistID = A.ArtistID
GROUP BY Ar.Name
HAVING COUNT(A.AlbumID) = 1;

-- Query 14: Top 10 most featured descriptors in albums
SELECT R.Name, COUNT(AD.DescriptorID) AS UsageCount
FROM RYMDescriptor R
JOIN AlbumDescriptor AD ON R.DescriptorID = AD.DescriptorID
GROUP BY R.Name
ORDER BY UsageCount DESC
LIMIT 10;

-- Query 15: Albums with above average valence and below average danceability
SELECT A.AlbumID, A.Title
FROM Album A
JOIN SpotifyAudioFeatures S ON A.AlbumID = S.AlbumID
WHERE S.Valence > (SELECT AVG(Valence) FROM SpotifyAudioFeatures)
AND S.Danceability < (SELECT AVG(Danceability) FROM SpotifyAudioFeatures);

-- Query 16: Find artists whose albums have been recommended the most
SELECT Ar.Name, COUNT(AR.RecommendationID) AS RecommendationCount
FROM Artist Ar
JOIN Album A ON Ar.ArtistID = A.ArtistID
JOIN AlbumRecommendation AR ON A.AlbumID = AR.AlbumID
GROUP BY Ar.Name
ORDER BY RecommendationCount DESC;