import psycopg2
import pandas as pd

# Database connection parameters
db_params = {
    'dbname': 'recmyrecord-postgres',
    'user': 'sameraslan',
    'password': 'RecMyRecord69',
    'host': 'recmyrecord-postgres.cumpbsaqdzfn.us-east-2.rds.amazonaws.com',
    'port': '5432'
}

def create_connection():
    conn = None
    try:
        conn = psycopg2.connect(**db_params)
        print("Database connection successfully established.")
    except Exception as e:
        print(f"Error creating database connection: {e}")
    return conn

if __name__ == "__main__":
    csv_file_path = '../Backend/Recommender/all_data.csv'
    df = pd.read_csv(csv_file_path)
    
    conn = create_connection()
    for index, row in df.iterrows():
        pass #do something
    conn.close()

'''
    for index, row in df.iterrows():
        artist_id = insert_artist(conn, row['Artist'])
        album_data = {
            'title': row['Title'],
            'artist_id': artist_id,
            'spotify_uri': row['URI']
        }

        spotify_features = {
            # Fill in the extraction logic
        }

        rym_descriptors = [
            # Fill in the extraction logic
        ]

        insert_album(conn, album_data, spotify_features, rym_descriptors)
    '''

'''
# Function to insert an artist
def insert_artist(conn, artist_name):
    with conn.cursor() as cur:
        cur.execute("INSERT INTO Artist (Name) VALUES (%s) RETURNING ArtistID;",
                    (artist_name,))
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
    '''
