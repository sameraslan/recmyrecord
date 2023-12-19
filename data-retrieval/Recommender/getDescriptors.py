from sklearn.neighbors import NearestNeighbors
from skimage import io
from tabulate import tabulate
import matplotlib.pyplot as plt
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import pandas as pd
import numpy as np
import sys
import rymscraper
from rymscraper import RymUrl
from rymscraper import rymscraper, RymUrl

network = rymscraper.RymNetwork()

# Dictionary that holds all descriptors and how many albums have each
oldDescriptors = {'melancholic': 170, 'anxious': 116, 'futuristic': 32, 'male vocals': 393, 'existential': 90, 'alienation': 80, 'atmospheric': 183, 'lonely': 93, 'cold': 57, 'pessimistic': 50, 'introspective': 146, 'depressive': 56, 'longing': 93, 'dense': 105, 'sarcastic': 54, 'serious': 44, 'urban': 96, 'progressive': 134, 'passionate': 251, 'concept album': 63, 'bittersweet': 158, 'meditative': 33, 'epic': 105, 'complex': 128, 'sentimental': 90, 'melodic': 260, 'fantasy': 33, 'philosophical': 78, 'surreal': 103, 'poetic': 149, 'abstract': 60, 'technical': 97, 'improvisation': 61, 'avant-garde': 76, 'psychedelic': 134, 'medieval': 6, 'political': 47, 'sombre': 86, 'cryptic': 81, 'winter': 22, 'hypnotic': 97, 'mysterious': 93, 'dark': 125, 'nocturnal': 135, 'rhythmic': 210, 'apocalyptic': 39, 'ethereal': 49, 'apathetic': 14, 'eclectic': 111, 'conscious': 66, 'protest': 27, 'religious': 19, 'spiritual': 60, 'Christian': 16, 'uplifting': 96, 'noisy': 55, 'romantic': 70, 'love': 102, 'female vocals': 61, 'lush': 108, 'warm': 159, 'Wall of Sound': 8, 'sensual': 24, 'sexual': 51, 'androgynous vocals': 10, 'soothing': 57, 'mellow': 102, 'space': 17, 'calm': 34, 'summer': 47, 'happy': 25, 'medley': 1, 'quirky': 75, 'playful': 131, 'optimistic': 32, 'energetic': 199, 'suite': 22, 'drugs': 61, 'raw': 102, 'nihilistic': 33, 'rebellious': 67, 'hedonistic': 33, 'deadpan': 12, 'dissonant': 29, 'lo-fi': 26, 'science fiction': 25, 'anthemic': 52, 'rock opera': 5, 'triumphant': 32, 'LGBT': 15, 'sampling': 54, 'humorous': 49, 'boastful': 34, 'crime': 22, 'repetitive': 45, 'manic': 49, 'tribal': 12, 'instrumental': 72, 'suspenseful': 51, 'acoustic': 65, 'death': 59, 'autumn': 45, 'polyphonic': 17, 'violence': 31, 'alcohol': 15, 'aquatic': 12, 'heavy': 97, 'war': 17, 'ominous': 75, 'funereal': 11, 'vocal group': 4, 'orchestral': 17, 'chamber music': 3, 'history': 8, 'aggressive': 64, 'vulgar': 18, 'uncommon time signatures': 59, 'pastoral': 30, 'soft': 34, 'peaceful': 29, 'minimalistic': 15, 'sparse': 14, 'monologue': 2, 'sad': 43, 'rain': 7, 'breakup': 29, 'self-hatred': 21, 'satirical': 20, 'angry': 51, 'misanthropic': 35, 'chaotic': 42, 'folklore': 4, 'nature': 17, 'seasonal': 4, 'spring': 20, 'forest': 11, 'scary': 17, 'ballad': 7, 'suicide': 12, 'disturbing': 28, 'lethargic': 16, 'choral': 6, 'infernal': 17, 'mechanical': 18, 'occult': 17, 'pagan': 8, 'tropical': 16, '': 10, 'anti-religious': 10, 'hateful': 8, 'party': 12, 'mashup': 1, 'desert': 9, 'martial': 2, 'ritualistic': 14, 'mythology': 5, 'satanic': 9, 'parody': 1, 'paranormal': 4, 'Halloween': 3, 'anarchism': 1, 'natural': 2, 'lyrics': 1, 'waltz': 1, 'Islamic': 1, 'atonal': 1, 'sports': 2, 'oratorio': 1}
# From first 962 albums
descriptors = {'melancholic': 271, 'anxious': 167, 'futuristic': 55, 'male vocals': 650, 'existential': 120, 'alienation': 110, 'atmospheric': 311, 'lonely': 144, 'cold': 84, 'pessimistic': 70, 'introspective': 216, 'depressive': 84, 'longing': 147, 'dense': 169, 'sarcastic': 76, 'serious': 60, 'urban': 148, 'progressive': 204, 'passionate': 408, 'concept album': 104, 'bittersweet': 253, 'meditative': 52, 'epic': 181, 'complex': 203, 'sentimental': 149, 'melodic': 423, 'political': 72, 'conscious': 106, 'poetic': 214, 'protest': 37, 'eclectic': 177, 'religious': 28, 'spiritual': 95, 'rhythmic': 318, 'Christian': 21, 'uplifting': 145, 'fantasy': 61, 'philosophical': 94, 'surreal': 161, 'abstract': 91, 'technical': 156, 'improvisation': 125, 'avant-garde': 125, 'psychedelic': 201, 'medieval': 12, 'sombre': 141, 'cryptic': 112, 'winter': 36, 'hypnotic': 149, 'mysterious': 127, 'dark': 203, 'nocturnal': 208, 'apocalyptic': 74, 'ethereal': 90, 'apathetic': 21, 'noisy': 100, 'romantic': 111, 'love': 150, 'female vocals': 104, 'lush': 184, 'Wall of Sound': 17, 'warm': 249, 'sensual': 40, 'sexual': 78, 'androgynous vocals': 14, 'soothing': 89, 'mellow': 161, 'space': 29, 'calm': 61, 'summer': 75, 'happy': 40, 'medley': 4, 'quirky': 121, 'playful': 213, 'optimistic': 40, 'energetic': 353, 'suite': 35, 'sampling': 94, 'humorous': 84, 'boastful': 54, 'drugs': 89, 'deadpan': 22, 'crime': 36, 'raw': 176, 'nihilistic': 46, 'rebellious': 105, 'hedonistic': 49, 'dissonant': 59, 'lo-fi': 40, 'science fiction': 43, 'anthemic': 88, 'rock opera': 6, 'triumphant': 59, 'LGBT': 22, 'death': 91, 'autumn': 65, 'polyphonic': 27, 'repetitive': 78, 'manic': 92, 'tribal': 21, 'instrumental': 163, 'suspenseful': 80, 'acoustic': 133, 'violence': 51, 'alcohol': 27, 'aquatic': 22, 'heavy': 163, 'war': 30, 'ominous': 125, 'funereal': 19, 'chamber music': 11, 'vocal group': 4, 'orchestral': 44, 'history': 13, 'vulgar': 37, 'aggressive': 119, 'uncommon time signatures': 86, 'monologue': 4, 'pastoral': 56, 'soft': 59, 'peaceful': 49, 'minimalistic': 30, 'sparse': 29, 'sad': 64, 'rain': 16, 'breakup': 45, 'misanthropic': 58, 'satirical': 26, 'angry': 76, 'self-hatred': 27, 'chaotic': 79, 'folklore': 8, 'nature': 35, 'seasonal': 6, 'spring': 27, 'forest': 20, 'choral': 14, 'scary': 25, 'lethargic': 30, 'ballad': 8, 'disturbing': 43, 'mechanical': 30, 'suicide': 16, 'infernal': 30, 'occult': 28, 'pagan': 8, 'tropical': 23, 'party': 22, 'anti-religious': 15, 'hateful': 13, 'mashup': 1, 'ritualistic': 23, 'desert': 15, 'martial': 12, 'mythology': 9, 'natural': 6, 'satanic': 11, 'skit': 2, 'parody': 1, 'paranormal': 7, 'Halloween': 6, 'anarchism': 3, 'atonal': 6, 'Islamic': 3, 'lyrics': 1, 'waltz': 1, 'jingle': 1, 'opera': 1, 'symphony': 7, 'sports': 2, 'fairy tale': 1, 'oratorio': 1, 'ensemble': 5, 'string quartet': 2, 'ideology': 2, 'educational': 1}

allAlbumDescriptorValues = []
notFound = []

# Fixes album or artist name to suit url
def fixStringForWebsite(string):
    string = string.replace(' /', '').lower()
    string = string.replace('&', 'and').lower()
    string = string.replace(' ', '-').lower()
    string = string.replace(',', '').lower()
    string = string.replace('\'', '').lower()
    string = string.replace('(', '').lower()
    string = string.replace(')', '').lower()
    string = string.replace('[', '').lower()
    string = string.replace(']', '').lower()
    string = string.replace('%', '').lower()
    string = string.replace(':', '').lower()
    string = string.replace('é', 'e').lower()
    string = string.replace('à', 'a').lower()
    string = string.replace('.', '').lower()
    string = string.replace('?', '').lower()

    return string

# Prints the 5 most similar albums
def getAlbumDescriptors(artist, albumTitle):
    album_infos = []

    try:
        album = str(artist) + " - " + str(albumTitle)
        album_infos = network.get_album_infos(name=album)['Descriptors']
    except IndexError:
        try:
            artist = fixStringForWebsite(str(artist))
            title = fixStringForWebsite(str(albumTitle))

            url = "https://rateyourmusic.com/release/album/" + artist + "/" + title + "/"
            print(url)
            album_infos = network.get_album_infos(url=url)['Descriptors']
        except IndexError:
            notFound.append([artist, albumTitle])
        except AttributeError:
            notFound.append([artist, albumTitle])
    except AttributeError:
        notFound.append([artist, albumTitle])
    except TypeError:
        notFound.append([artist, albumTitle])

    if not len(album_infos) == 0:
        albumDescriptorsList = [x.strip() for x in album_infos.split(',')]
        return albumDescriptorsList

    return album_infos
    #print(albumDescriptorsList)

# Plot similar albums
def getAllDescriptors(listOfAlbums):
    listOfAlbums = listOfAlbums.reset_index()

    startFrom = 428

    for index, album in listOfAlbums.iterrows():
        print(index, album['Artist'], album['Album'])

        if index >= startFrom:
            artist = album['Artist']
            albumTitle = album['Album']
            thisAlbumDescriptors = getAlbumDescriptors(artist, albumTitle)

            print(index, albumTitle, artist, thisAlbumDescriptors)

            for descriptor in thisAlbumDescriptors:
                if descriptor not in descriptors:
                    descriptors[descriptor] = 1
                else:
                    descriptors[descriptor] += 1  # to get an idea of most popular descriptors

            print("\nAll Descriptors:", descriptors, "\n\n")

def getDescriptorVectors(listOfAlbums):
    listOfAlbums = listOfAlbums.reset_index()
    allAlbumDescriptorValues = []
    startFrom = 4401
    end = 4501
    descriptorVal = 63  # Initializes first descriptor with weight 1.5, and last descriptor minimum 0.5

    for index, album in listOfAlbums.iterrows():
        if index >= startFrom and index < end:
            artist = album['Artist']
            albumTitle = album['Title']
            thisAlbumDescriptors = getAlbumDescriptors(artist, albumTitle)

            # For debugging purposes
            if len(thisAlbumDescriptors) == 0:
                print("None")

            albumDescVector = descriptors  # make a copy of overall descriptors (will set 0 or 1 to each value of descriptor)

            thisAlbumDict = {k: v for v, k in enumerate(thisAlbumDescriptors)}  # Descriptor:Index pair dictionary for quick lookup

            for descriptor in albumDescVector.keys():
                if descriptor in thisAlbumDescriptors:
                    value = (descriptorVal - thisAlbumDict[descriptor]) / 42  # 42 is max number of descriptors for an album
                    if value > 0:
                        albumDescVector[descriptor] = value
                else:
                    albumDescVector[descriptor] = 0

            listValues = list(albumDescVector.values())
            listValues.append(len(thisAlbumDescriptors))  # Append number of descriptors in album for later use
            allAlbumDescriptorValues.append(listValues)

            print(index, albumTitle, artist)

            if index % 4412 == 0:
                columnNames = list(descriptors.keys())
                columnNames.append("Descriptor Count")
                finalDescriptorDataframe = pd.DataFrame(allAlbumDescriptorValues, columns=columnNames)
                dfOne = pd.read_pickle("Recommender/descriptors_data_priori_-4415.pkl")
    
                finalDescriptorDataframe = pd.concat([dfOne, finalDescriptorDataframe], axis=0)
    
    
                print(finalDescriptorDataframe)

                # Update dataframe every 100 albums
                finalDescriptorDataframe.to_pickle("Recommender/descriptors_data_priori_-4415.pkl")
                finalDescriptorDataframe.to_csv("Recommender/descriptors_data_priori_-4415.csv")
    
                allAlbumDescriptorValues = []  # Reset dataframe for next 100 albums


def combineDataframes():
    dfOne = pd.read_pickle("Recommender/descriptors_data_priori_0-1000.pkl")
    dfTwo = pd.read_pickle("Recommender/descriptors_data_priori_1001-.pkl")
    # dfThree = pd.read_pickle("Recommender/descriptors_data_priori_901-.pkl")
    # dfFour = pd.read_pickle("Recommender/descriptors_data_priori_250-399.pkl")
    # dfFive = pd.read_pickle("Recommender/descriptors_data_priori_400-503.pkl")

    allAlbumsDescriptorData = pd.concat([dfOne, dfTwo], axis=0)
    allAlbumsDescriptorData.reset_index()
    print(allAlbumsDescriptorData)

    allAlbumsDescriptorData.to_pickle("Recommender/descriptors_data_priori_-4415.pkl")
    allAlbumsDescriptorData.to_csv("Recommender/descriptors_data_priori_-4415.csv")


#combineDataframes()
listOfAlbums = pd.read_pickle("Spotify API Connection/albums_audio_features.pkl")
getDescriptorVectors(listOfAlbums)


# dfTwo = pd.read_pickle("Recommender/descriptors_data_priori_-4415.pkl")
# print(dfTwo)
# dfTwo = dfTwo[:3201]  # Up to album with index 3200 in albums_audio_feature_data (row 3202 in csv)
# dfTwo.to_pickle("Recommender/descriptors_data_priori_-4415.pkl")
# dfTwo.to_csv("Recommender/descriptors_data_priori_-4415.csv")


# dfOne = pd.read_pickle("Recommender/descriptors_data_priori_1001-.pkl")
# print(dfOne)
# dfOne = dfOne.drop(['level_0', 'index'], axis=1)
# dfOne = dfOne.reset_index(drop=True)
# print(dfOne)
# dfOne = dfOne.drop(dfOne.index[200:400])
# print(dfOne)
# dfOne.to_pickle("Recommender/descriptors_data_priori_1001-.pkl")
