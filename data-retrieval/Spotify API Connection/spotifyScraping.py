import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import pandas as pd
import numpy as np
import requests
import time

cid = 'c480b13ef81c4e6aa0ab0119636eabe5'
secret = '50826f24c12044448b906de50ac74742'
client_credentials_manager = SpotifyClientCredentials(client_id=cid, client_secret=secret)
sp = spotipy.Spotify(client_credentials_manager=client_credentials_manager)

artist_uri = '5LhTec3c7dcqBvpLRWbMcf'
track_uri = 'spotify:track:36apwMphkcaS63LY3JJMPh'

all_album_features = []
all_album_names = []
all_album_artists = []
all_album_uri = []

df = pd.read_pickle("rymscraper-master/Scraped Data/top5000records.pkl")
df.reset_index(inplace=True)
print(df)



sp.trace = False
albumsNotFound = []

# find album by name
#i and j are ranges of rows in df to search for albums
def getAlbumsSpotifyData(df):

    i = 20
    j = 25


    # get the first album uri
    df = df.loc[i:j]
    df = df[['Artist', 'Album']]

    count = 0
    for index, row in df.iterrows():
        album_uri = ''
        #Specifies artist as well by concatinating in order to improve search accuracy of album
        albumName = str(row['Album']) + " " + str(row['Artist'])
        print(albumName) #(for testing)
        # Catch Error due to too specific artist or album name (spotify RYM mismatch)
        # Increases chance of finding album in spotify

        while True:
            try:
                results = sp.search(q="album:" + albumName, type="album")
                album_uri = results['albums']['items'][0]['uri']
            except IndexError:
                try:
                    albumName = str(row['Album']) + " " + str(row['Artist'])[:5]
                    results = sp.search(q="album:" + albumName, type="album")
                    album_uri = results['albums']['items'][0]['uri']
                except IndexError:
                    pass
                except requests.exceptions.ReadTimeout:
                    time.sleep(2)
                    continue
            except requests.exceptions.ReadTimeout:
                time.sleep(2)
                continue

            break

        if album_uri != '':  # This way we make sure that this keeps working even if the album is not in spotify
            album_title = sp.album(album_uri)
            print(str(i), str(album_title['name']))
            i += 1

            # get album tracks and testing to get accurate results
            # Retrieve audio_features for each track
            # album = 'Kid A Radiohead'
            # results = sp.search(q="album:" + album, type="album")
            # album_uri = results['albums']['items'][0]['uri']

            tracks = sp.album_tracks(album_uri)
            count = 0
            track_features = []  # Store features for each track
            for track in tracks['items']:
                #print(track['name'], track['uri'])
                track_uri = track['uri']
                results = sp.audio_features(track_uri)
                if results[0] != None:
                    track_features.append(list(results[0].values()))

            album_features = np.array(track_features)

            album_features = np.delete(album_features, list(range(11, 16)), 1).astype(np.float32)  # Remove non-numerical items and cast to float
            album_features = np.mean(album_features, axis=0)  # Take column wise mean for overall album audio features
            print(album_features)
            all_album_features.append(list(album_features))
            all_album_names.append(str(row['Album']))
            all_album_artists.append(str(row['Artist']))
            all_album_uri.append(album_uri)

            # Only get label names on first iteration of loop
            if count == 0:
                label_names = np.array(list(results[0].keys())[0:11] + list(results[0].keys())[16:])  # ['danceability', 'energy', 'key', 'loudness',...
                count += 1

        else:
            albumsNotFound.append([str(row['Album']), str(row['Artist'])])

    # Add Artist, Title, and URI and convert to Pandas Dataframe
    album_data_dataframe = pd.DataFrame(all_album_features, columns=label_names)
    album_data_dataframe.insert(0, "Artist", all_album_artists)
    album_data_dataframe.insert(0, "Title", all_album_names)
    album_data_dataframe["URI"] = all_album_uri
    print(album_data_dataframe)

    # Write to pkl
    #album_data_dataframe.to_pickle("Spotify API Connection/found.pkl")

    #print(albumsNotFound)


    #Finally, write to csv
    export_filename = "found"
    path = '/Users/saslan.19/Desktop/Programming/Music Recommendation/Spotify API Connection/'
    #album_data_dataframe.to_csv(path + export_filename + ".csv")

def createNotFoundDataframe(notFound):
    notFound = pd.DataFrame(np.array(notFound), columns=['Album', 'Artist'])
    notFound.to_pickle("Spotify API Connection/notFound_1000-.pkl")
    notFound.to_csv("Spotify API Connection/notFound_1000-.csv")

getAlbumsSpotifyData(df)
#createNotFoundDataframe(albumsNotFound)