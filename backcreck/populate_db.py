import psycopg2
import pandas as pd

csv_file_path = '../Backend/Recommender/all_data.csv'
# Load your DataFrame
df = pd.read_csv('../Backend/Recommender/all_data.csv')

# Database connection parameters - replace these with your database information
db_params = {
    'dbname': 'recmyrecord-postgres',
    'user': 'sameraslan',
    'password': 'RecMyRecord69',
    'host': 'recmyrecord-postgres.cumpbsaqdzfn.us-east-2.rds.amazonaws.com',
    'port': '5432'
}

# Function to create a database connection
def create_connection():
    conn = None
    try:
        conn = psycopg2.connect(**db_params)
    except Exception as e:
        print(f"Error creating connection: {e}")
    return conn

# Function to insert an artist
def insert_artist(conn, artist_name):
    with conn.cursor() as cur:
        cur.execute("INSERT INTO Artist (Name) VALUES (%s) RETURNING ArtistID;",
                    (artist_name))
        artist_id = cur.fetchone()[0]
        conn.commit()
        return artist_id

# Function to insert an album and its related data
def insert_album(conn, album_data, spotify_features, rym_descriptors):
    # Insert the album
    with conn.cursor() as cur:
        cur.execute("INSERT INTO Album (Title, ArtistID, SpotifyURI) VALUES (%s, %s, %s) RETURNING AlbumID;",
                    (album_data['title'], album_data['artist_id'], album_data['spotify_uri']))
        album_id = cur.fetchone()[0]

        # # Insert Spotify audio features
        # cur.execute("INSERT INTO SpotifyAudioFeatures (AlbumID, Danceability, Energy, ...) VALUES (%s, %s, %s, ...);",
        #             (album_id, spotify_features['danceability'], spotify_features['energy'], ...))

        # # Insert RYM descriptors
        # for descriptor in rym_descriptors:
        #     cur.execute("INSERT INTO AlbumDescriptor (AlbumID, DescriptorID, Weighting) VALUES (%s, %s, %s);",
        #                 (album_id, descriptor['descriptor_id'], descriptor['weighting']))

        conn.commit()

# Example of using the above functions
conn = create_connection()

for index, row in df.iterrows():
    # Extract and transform artist data
    artist_id = insert_artist(conn, row['Artist'])

    # Extract and transform album data
    album_data = {
        'title': row['Title'],
        'artist_id': artist_id,
        'spotify_uri': row['URI']
    }

    # Extract and transform Spotify audio features
    spotify_features = {
        # Fill in the extraction logic
    }

    # Extract and transform RYM descriptors
    rym_descriptors = [
        # Fill in the extraction logic
    ]

    insert_album(conn, album_data, spotify_features, rym_descriptors)

# Close the connection
conn.close()
