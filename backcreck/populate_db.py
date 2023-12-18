import psycopg2
import pandas as pd

def print_table_summary(conn, table_name):
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cur.fetchone()[0]
        print(f"Table: {table_name}, Total Rows: {count}")
        cur.execute(f"SELECT * FROM {table_name} LIMIT 5")
        rows = cur.fetchall()
        for row in rows:
            print(row)
        cur.close()
    except Exception as e:
        print(f"Error in print_table_summary: {e}")

def get_tables(conn):
    try:
        cur = conn.cursor()
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
        tables = cur.fetchall()
        cur.close()
        return tables
    except Exception as e:
        print(f"Error getting tables: {e}")

def clear_tables(conn, table_names):
    try:
        cur = conn.cursor()
        for table in table_names:
            cur.execute(f"DELETE FROM {table};")
            if table == '"Album"':
                # Replace 'Album_AlbumID_seq' with the actual sequence name for AlbumID
                cur.execute("ALTER SEQUENCE public.\"Album_AlbumID_seq\" RESTART WITH 1;")
            elif table == '"Artist"':
                cur.execute("ALTER SEQUENCE public.\"Artist_ArtistID_seq\" RESTART WITH 1;")
        conn.commit()
        print(f"All tables cleared and sequences reset: {', '.join(table_names)}")
        cur.close()
    except Exception as e:
        print(f"Error clearing tables: {e}")



db_params = {
    'dbname': 'recmyrecord-postgres',
    'user': 'sameraslan',
    'password': 'RecMyRecord69',
    'host': 'recmyrecord-postgres.cumpbsaqdzfn.us-east-2.rds.amazonaws.com',
    'port': '5432'
}

csv_file_path = '../Backend/Recommender/all_data.csv'

def create_connection():
    conn = None
    try:
        conn = psycopg2.connect(**db_params)
        print("Database connection successfully established.")
    except Exception as e:
        print(f"Error creating database connection: {e}")
    return conn

def process_row(conn, row):
    artist_name = row['Artist']
    album_title = row['Title']
    album_URI = row['URI']
    print("processing row:", artist_name, album_title, album_URI)
    audio_features = {
        'danceability': row['danceability'],
        'energy': row['energy'],
        'key': row['key'],
        'loudness': row['loudness'],
        'mode': row['mode'],
        'speechiness': row['speechiness'],
        'acousticness': row['acousticness'],
        'instrumentalness': row['instrumentalness'],
        'liveness': row['liveness'],
        'valence': row['valence'],
        'tempo': row['tempo'],
        'duration_ms': row['duration_ms'],
        'time_signature': row['time_signature']
    }
    artist_id = insert_artist(conn, artist_name)
    album_id = insert_album(conn, album_title, artist_id, album_URI)
    insert_audio_features(conn, album_id, audio_features)

def insert_artist(conn, artist_name):
    try:
        cur = conn.cursor()
        cur.execute('SELECT "ArtistID" FROM "Artist" WHERE "Name" = %s', (artist_name,))
        result = cur.fetchone()
        if result:
            artist_id = result[0]
        else:
            insert_query = 'INSERT INTO "Artist" ("Name") VALUES (%s) RETURNING "ArtistID";'
            cur.execute(insert_query, (artist_name,)) #TODO CHANGE THIS WHEN YOU REMOVE ARTIST URI
            artist_id = cur.fetchone()[0]
            conn.commit()
        cur.close()
        return artist_id
    except Exception as e:
        print(f"Error in insert_artist: {e}")
        return None

def insert_album(conn, album_title, artist_id, album_uri):
    try:
        cur = conn.cursor()
        cur.execute('SELECT "AlbumID" FROM "Album" WHERE "Title" = %s AND "ArtistID" = %s', (album_title, artist_id))
        result = cur.fetchone()
        if result:
            album_id = result[0]
        else:
            insert_query = 'INSERT INTO "Album" ("Title", "ArtistID", "SpotifyURI") VALUES (%s, %s, %s) RETURNING "AlbumID";'
            cur.execute(insert_query, (album_title, artist_id, album_uri))
            album_id = cur.fetchone()[0]
            conn.commit()
        cur.close()
        return album_id
    except Exception as e:
        print(f"Error in insert_album: {e}")
        return None

def insert_audio_features(conn, album_id, audio_features):
    try:
        cur = conn.cursor()
        cur.execute('SELECT "AlbumID" FROM "SpotifyAudioFeatures" WHERE "AlbumID" = %s', (album_id,))
        result = cur.fetchone()
        if result:
            print(f"Audio features for AlbumID {album_id} already exist.")
        else:
            insert_query = '''
                INSERT INTO "SpotifyAudioFeatures" 
                ("AlbumID", "Danceability", "Energy", "Key", "Loudness", "Mode", "Speechiness", 
                 "Acousticness", "Instrumentalness", "Liveness", "Valence", "Tempo", 
                 "DurationMs", "TimeSignature")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            '''
            values = (
                album_id,
                audio_features['danceability'],
                audio_features['energy'],
                audio_features['key'],
                audio_features['loudness'],
                audio_features['mode'],
                audio_features['speechiness'],
                audio_features['acousticness'],
                audio_features['instrumentalness'],
                audio_features['liveness'],
                audio_features['valence'],
                audio_features['tempo'],
                audio_features['duration_ms'],
                audio_features['time_signature']
            )
            cur.execute(insert_query, values)
            conn.commit()
        cur.close()
    except Exception as e:
        print(f"Error in insert_audio_features: {e}")

if __name__ == "__main__":
    cur_tables = ['"Artist"', '"SpotifyAudioFeatures"', '"Album"']
    conn = create_connection()
    if conn:
        df = pd.read_csv(csv_file_path)
        for index, row in df.iterrows():
            process_row(conn, row)
            # break  # uncomment to run all
        conn.close()

        # Clear tables and reset sequences (uncomment for use)
        # clear_tables(conn, cur_tables)
        # for table in cur_tables:
        #     print_table_summary(conn, table)
