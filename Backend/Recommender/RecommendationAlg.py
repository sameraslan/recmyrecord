from sklearn.neighbors import NearestNeighbors
from skimage import io
from tabulate import tabulate
import matplotlib.pyplot as plt
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import pandas as pd
import numpy as np
from difflib import get_close_matches
from tqdm import tqdm
import time


cid = 'c480b13ef81c4e6aa0ab0119636eabe5'
secret = '50826f24c12044448b906de50ac74742'
client_credentials_manager = SpotifyClientCredentials(client_id=cid, client_secret=secret)
sp = spotipy.Spotify(client_credentials_manager=client_credentials_manager)

# Prints the 5 most similar albums
def printSimilar(titles, artists, uris, indices, userAlbumIndex, distances):
    similarAlbumsList = list(indices[userAlbumIndex])
    distancesList = list(distances[userAlbumIndex])
    albums = []


    for i in range(len(similarAlbumsList)):
        time.sleep(1)  # To avoid rate limit
        album = sp.album(uris[similarAlbumsList[i]])
        
        # Check if the 'images' list is not empty
        if album['images']:
            cover_url = album['images'][0]['url']
        else:
            cover_url = 'n/a'


        albums.append({
            'Artist': artists[similarAlbumsList[i]], 
            'Title': titles[similarAlbumsList[i]], 
            # 'URI': uris[similarAlbumsList[i]], 
            # 'CoverURL': cover_url, 
            # 'AlbumURL': album['external_urls']['spotify'], 
            'Distance': distancesList[i]
        })
    
    albums_json = {'results': albums}
    return albums_json
    # return tabulate(albums, headers=['Artist', 'Title', 'URI'])
    # visualizeAlbums(recommendedUris, recommendedTitles, recommendedArtists)


# Plot similar albums
def visualizeAlbums(uris, titles, artists):
    urls = []  # List of cover art URLS

    for uri in uris:
        result = sp.album(uri)
        urls.append(result['images'][0]['url'])  # Append cover art URL to list of image URLS

    plt.figure(figsize=(30, int(.8 * len(uris))), facecolor='#ffeba3')
    columns = len(urls)

    for i, url in enumerate(urls):
        plt.subplot(int(len(urls) / columns), columns, i + 1)

        image = io.imread(url)
        plt.imshow(image)
        plt.xticks([])
        plt.yticks([])
        s = ''
        plt.xlabel(s.join(titles[i] + '\n' + artists[i]), fontsize=8, fontweight='bold')
        plt.tight_layout(h_pad=15, w_pad=10)
        plt.subplots_adjust(wspace=None, hspace=None)

    plt.show()

# Using unsupervised KNN to get similar albums (euclidean distance)
def recommend(albumsDataframe, album_number, similarCount, sliderVal):
    # Get user album index
    userAlbumIndex = None
    emptyIndex = True
    lowerCaseTitles = albumsDataframe['Title'].str.lower()
    lowerCaseArtists = albumsDataframe['Artist'].str.lower()

    
    # Shift slider value by .5 to prevent division by 0
    sliderVal = float(sliderVal) ** 3
    if sliderVal <= .00001:
        sliderVal = .00001

    # only calculate similarity when changing mood slider
    # save rest of data as pkl and when change add to pkl

    while emptyIndex:
        # Checks for both album title and artist and pulls corresponding row
        # searchResult = albumsDataframe[lowerCaseTitles.str.contains(albumTitle, na=False) & lowerCaseArtists.str.contains(albumArtist, na=False)]
        searchResult = albumsDataframe.iloc[[int(album_number) - 1]]
        emptyIndex = searchResult.empty

        if not emptyIndex:
            userAlbumIndex = searchResult.index.tolist()[0]

    # # Normalize columns with un-normalized values
    # Did this in preprocessing
    # albumsDataframe[['key', 'loudness', 'tempo', 'duration_ms', 'time_signature']] = (albumsDataframe[
    #                                                                                       ['key', 'loudness', 'tempo',
    #                                                                                        'duration_ms',
    #                                                                                        'time_signature']] -
    #                                                                                   albumsDataframe[
    #                                                                                       ['key', 'loudness', 'tempo',
    #                                                                                        'duration_ms',
    #                                                                                        'time_signature']].min()) / (
    #                                                                                              albumsDataframe[
    #                                                                                                  ['key', 'loudness',
    #                                                                                                   'tempo',
    #                                                                                                   'duration_ms',
    #                                                                                                   'time_signature']].max() -
    #                                                                                              albumsDataframe[
    #                                                                                                  ['key', 'loudness',
    #                                                                                                   'tempo',
    #                                                                                                   'duration_ms',
    #                                                                                                   'time_signature']].min())

    # Selecting audio features for KNN
    #albumValues = albumsDataframe[
        # ['danceability', 'energy', 'key', 'loudness', 'mode', 'speechiness', 'acousticness', 'instrumentalness',
        #  'liveness', 'valence', 'tempo', 'duration_ms', 'time_signature']]

    # Removed lyrics from being factored in as of now since this is sonic mood/emotion based for now but can reintroduce with a lyrics slider
    albumsDataframe = albumsDataframe.drop(['abstract', 'alienation', 'conscious', 'crime', 'suicide', 'alcohol', 
                                            'educational', 'fantasy', 'folklore', 'hedonistic', 'history', 'Halloween', 'anti-religious', 
                                            'pagan', 'anarchism', 'protest', 'death', 'drugs', 'ideology', 'political', 'religious', 'Christian', 
                                            'Islamic', 'satanic', 'introspective', 'LGBT', 'love', 'breakup', 'misanthropic', 'mythology', 'nature', 
                                            'occult', 'paranormal', 'philosophical', 'existential', 'nihilistic', 'science fiction', 'self-hatred', 
                                            'sexual', 'sports', 'violence', 'war', 'apathetic', 'boastful', 'cryptic', 'deadpan', 'hateful', 'humorous', 
                                            'optimistic', 'pessimistic', 'poetic', 'rebellious', 'sarcastic', 'satirical', 'serious', 'vulgar'], axis = 1)
    albumValues = albumsDataframe.drop(['Title', 'Artist', 'URI', 'Descriptor Count', 'danceability', 'energy', 'key', 'loudness', 'mode', 'speechiness', 'acousticness', 'instrumentalness', 'liveness', 'valence', 'tempo', 'duration_ms', 'time_signature'], axis = 1)
    albumValuesCols = albumValues.columns.tolist() # Simply gets names of the descriptor columns
    

    # Found 5.5 to be good balance for audio features vs descriptor weighting below (which is now default from frontend ** 3)
    albumsDataframe[albumValuesCols] = albumValues[albumValuesCols].apply(lambda x: x / sliderVal)  # Weighting of descriptors (higher we divide by, less weight)

    #print("Max Descriptor Count", albumsDataframe['Descriptor Count'].max())

    albumValues = albumsDataframe.drop(['Title', 'Artist', 'URI', 'Descriptor Count'], axis=1)

    # energy, key, mode, speechiness, liveness, tempo, duration_ms, time_signature important
    # acousticness, instrumentalness, valence, loudness maybe important
    # acousticness, instrumentalness,  might work

    # Try removing lyrics description

    albumTitles = list(albumsDataframe['Title'])  # List of album titles
    albumArtists = list(albumsDataframe['Artist'])  # List of album artists
    albumURIs = list(albumsDataframe['URI'])  # List of album artists

    albumValues = albumValues.to_numpy(dtype=np.float32)  # np array of all features for albums
    similarAlbums = NearestNeighbors(n_neighbors=(similarCount + 1), algorithm='auto').fit(albumValues)
    distances, indices = similarAlbums.kneighbors(albumValues)

    return printSimilar(albumTitles, albumArtists, albumURIs, indices, userAlbumIndex, distances)  # Print out similar albums


def combineSpotifyWithDescriptors(spotifyPath, descriptorPath):
    descriptorPath.reset_index(drop=True, inplace=True)  # Reset indices

    newAlbumDataframe = pd.concat([spotifyPath, descriptorPath], axis=1, join="inner")  # Join spotify and descriptor data

    newAlbumDataframe = removeBadRows(newAlbumDataframe)

    return newAlbumDataframe

def removeBadRows(df):
    # Remove rows with no descriptors
    indices = df.loc[df['Descriptor Count'] == 0].index
    df.drop(indices, inplace=True)
    df.reset_index(drop=True, inplace=True)

    # Remove rows with no spotify audio features (sum of 0)
    # This should not happen but just in case
    indexNames = df[((df['danceability'] + df['energy'] + df['key'] + df['loudness'] + df['mode'] + df['speechiness'] + df['acousticness'] + df['instrumentalness'] + df['liveness'] + df['valence'] + df['tempo'] + df['duration_ms'] + df['time_signature']) == 0)].index
    df.drop(indexNames, inplace=True)
    df.reset_index(drop=True, inplace=True)

    return df

def get_similar_by_number(album_number, slider, numAlbums):
    all_data = pd.read_pickle('Backend/Recommender/all_data_norm.pkl')
    all_data = all_data.head(int(numAlbums))
    album = all_data.iloc[int(album_number) - 1]
    albumTitle = album['Title']
    albumArtist = album['Artist']

    recommended = recommend(all_data, album_number, slider)
    return recommended

def populate_csv_with_similar(dataframe, similarCount=5, sliderVal=1, startRow=0, save_path='test.csv'):
    if startRow == 0:
        dataframe_to_return = dataframe.copy()
    else:
        dataframe_to_return = pd.read_csv(save_path, index_col=0)


    for index in tqdm(range(startRow, len(dataframe)), desc="Processing Albums"):
        try:
            album_number = index + 1  # Album number is index + 1
            album_name = dataframe.iloc[index]['Title']
            album_artist = dataframe.iloc[index]['Artist']
            recommended_albums = recommend(dataframe, album_number, similarCount, sliderVal)

            # Add CoverURL and AlbumURL of the current album
            current_album = recommended_albums['results'][0]
            dataframe_to_return.at[index, 'CoverURL'] = current_album['CoverURL']
            dataframe_to_return.at[index, 'AlbumURL'] = current_album['AlbumURL']
            
            # Add the most similar albums to the dataframe
            for i, album in enumerate(recommended_albums['results'][1:]):
                dataframe_to_return.at[index, f'mostSimilar{i+1}'] = album['Title']
                dataframe_to_return.at[index, f'mostSimilar{i+1}_Artist'] = album['Artist']
                dataframe_to_return.at[index, f'mostSimilar{i+1}_Distance'] = round(album['Distance'], 4)
                dataframe_to_return.at[index, f'mostSimilar{i+1}_URI'] = album['URI']
                dataframe_to_return.at[index, f'mostSimilar{i+1}_CoverURL'] = album['CoverURL']
                dataframe_to_return.at[index, f'mostSimilar{i+1}_AlbumURL'] = album['AlbumURL']



        except Exception as e:
            print(f"An error occurred processing '{album_name}' by '{album_artist}' at index {index}: {e}")

        if index % 100 == 0:
            dataframe_to_return.to_csv(save_path, float_format='%.8f')

    return dataframe_to_return


def main(albumTitle=None, albumArtist=None, sliderVal=None, numAlbums=None, album_number=None):
    all_data = pd.read_pickle('Backend/Recommender/all_data_norm.pkl')
    updated_data = populate_csv_with_similar(all_data, sliderVal=1)
    updated_data.to_csv('test.csv', float_format='%.8f')

    # **Usually running this**
    # if album_number is not None:
    #     print(get_similar_by_number(album_number, sliderVal, numAlbums))
    
    
    # spotifyData = pd.read_pickle('Spotify API Connection/albums_audio_features.pkl')
    # descriptorData = pd.read_pickle("Recommender/descriptors_data_priori_-4415.pkl")
    #
    # all_data = combineSpotifyWithDescriptors(spotifyData, descriptorData)
    # all_data.to_csv('Recommender/all_data.csv')

    # all_data.drop_duplicates(subset=['Title', 'Artist'], keep='first', inplace=True) # Used this to remove duplicates and set to pkl
    # all_data.reset_index(drop=True, inplace=True) # Reset the indices since less albums now


    # all_data = pd.read_pickle('Backend/Recommender/all_data_norm.pkl')
    # all_data = all_data.head(int(numAlbums))

    # recommended = recommend(all_data, albumTitle, albumArtist, sliderVal)
    # return recommended

    # all_data[['Title', 'Artist']].to_json('album_data.json', orient='records') # to create the album_data.json file

if __name__ == "__main__":
    main()