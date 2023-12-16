from flask_restful import Resource
from Backend.Recommender import RecommendationAlg
import json

class AlbumApiHandler(Resource):
    def get(self, title=None, artist=None, slider=None, numAlbums=None, album_number=None):
        if album_number is not None:
            # Handle the request using the album_number
            recommended = RecommendationAlg.get_similar_by_number(album_number, slider, numAlbums)
        else:
            # Handle the request using the title and artist
            recommended = RecommendationAlg.main(title.lower(), artist.lower(), slider, numAlbums)

        return {
            'resultStatus': 'SUCCESS',
            'albums': json.dumps(recommended),
        }
