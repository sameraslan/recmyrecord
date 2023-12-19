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

#csv_file_path = '../Backend/Recommender/all_data.csv'
csv_file_path = '../test.csv'

descriptor_names = [
    "melancholic", "anxious", "futuristic", "male vocals", "existential", "alienation", 
    "atmospheric", "lonely", "cold", "pessimistic", "introspective", "depressive", 
    "longing", "dense", "sarcastic", "serious", "urban", "progressive", "passionate", 
    "concept album", "bittersweet", "meditative", "epic", "complex", "sentimental", 
    "melodic", "political", "conscious", "poetic", "protest", "eclectic", "religious", 
    "spiritual", "rhythmic", "Christian", "uplifting", "fantasy", "philosophical", 
    "surreal", "abstract", "technical", "improvisation", "avant-garde", "psychedelic", 
    "medieval", "sombre", "cryptic", "winter", "hypnotic", "mysterious", "dark", 
    "nocturnal", "apocalyptic", "ethereal", "apathetic", "noisy", "romantic", "love", 
    "female vocals", "lush", "Wall of Sound", "warm", "sensual", "sexual", "androgynous vocals", 
    "soothing", "mellow", "space", "calm", "summer", "happy", "medley", "quirky", 
    "playful", "optimistic", "energetic", "suite", "sampling", "humorous", "boastful", 
    "drugs", "deadpan", "crime", "raw", "nihilistic", "rebellious", "hedonistic", 
    "dissonant", "lo-fi", "science fiction", "anthemic", "rock opera", "triumphant", 
    "LGBT", "death", "autumn", "polyphonic", "repetitive", "manic", "tribal", 
    "instrumental", "suspenseful", "acoustic", "violence", "alcohol", "aquatic", "heavy", 
    "war", "ominous", "funereal", "chamber music", "vocal group", "orchestral", 
    "history", "vulgar", "aggressive", "uncommon time signatures", "monologue", 
    "pastoral", "soft", "peaceful", "minimalistic", "sparse", "sad", "rain", "breakup", 
    "misanthropic", "satirical", "angry", "self-hatred", "chaotic", "folklore", "nature", 
    "seasonal", "spring", "forest", "choral", "scary", "lethargic", "ballad", "disturbing", 
    "mechanical", "suicide", "infernal", "occult", "pagan", "tropical", "party", 
    "anti-religious", "hateful", "mashup", "ritualistic", "desert", "martial", 
    "mythology", "natural", "satanic", "skit", "parody", "paranormal", "Halloween", 
    "anarchism", "atonal", "Islamic", "lyrics", "waltz", "jingle", "opera", "symphony", 
    "sports", "fairy tale", "oratorio", "ensemble", "string quartet", "ideology", 
    "educational"
]

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
    album_descriptors = extract_album_descriptors(row)
    insert_album_descriptors(conn, album_id, album_descriptors)

def insert_album_descriptors(conn, album_id, album_descriptors):
    try:
        cur = conn.cursor()
        for descriptor, weighting in album_descriptors.items():
            if weighting > 0:
                cur.execute('SELECT "DescriptorID" FROM "RYMDescriptor" WHERE "Name" = %s', (descriptor,))
                result = cur.fetchone()
                if result:
                    descriptor_id = result[0]
                    cur.execute('SELECT * FROM "AlbumDescriptor" WHERE "AlbumID" = %s AND "DescriptorID" = %s', (album_id, descriptor_id))
                    if cur.fetchone() is None:
                        insert_query = '''
                            INSERT INTO "AlbumDescriptor" ("AlbumID", "DescriptorID", "Weighting")
                            VALUES (%s, %s, %s);
                        '''
                        cur.execute(insert_query, (album_id, descriptor_id, weighting))
                        conn.commit()
        cur.close()
    except Exception as e:
        print(f"Error in insert_album_descriptors: {e}")

def extract_album_descriptors(row):
    album_descriptors = {}
    for descriptor in descriptor_names:
        if descriptor in row:
            album_descriptors[descriptor] = row[descriptor]
    return album_descriptors

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

def insert_descriptors(conn, descriptor_names):
    try:
        cur = conn.cursor()
        for descriptor in descriptor_names:
            cur.execute('SELECT "DescriptorID" FROM "RYMDescriptor" WHERE "Name" = %s', (descriptor,))
            if cur.fetchone() is None:
                insert_query = 'INSERT INTO "RYMDescriptor" ("Name") VALUES (%s);'
                cur.execute(insert_query, (descriptor,))
                conn.commit()
        cur.close()
        print("RYMDescriptor table populated successfully.")
    except Exception as e:
        print(f"Error in insert_descriptors: {e}")


if __name__ == "__main__":
    cur_tables = ['"Artist"', '"SpotifyAudioFeatures"', '"AlbumDescriptor"', '"Album"']
    conn = create_connection()
    if conn:
        insert_descriptors(conn, descriptor_names)
        df = pd.read_csv(csv_file_path)
        for index, row in df.iterrows():
            process_row(conn, row)
            break #comment out and runall
        #clear_tables(conn, cur_tables)
        conn.close()

        # Clear tables and reset sequences (uncomment for use)
        # clear_tables(conn, cur_tables)
        # for table in cur_tables:
        #     print_table_summary(conn, table)
