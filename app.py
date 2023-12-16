import os
from flask import Flask, send_from_directory
from flask_restful import Api
from flask_cors import CORS
from api.AlbumApiHandler import AlbumApiHandler

app = Flask(__name__, static_url_path='', static_folder='Frontend/build')
CORS(app, origins=['https://mucreck-frontend.vercel.app'])
api = Api(app)

@app.route("/")
def serve():
    return send_from_directory(app.static_folder,'index.html')

api.add_resource(AlbumApiHandler, '/flask/getSimilar/<title>/<artist>/<slider>/<numAlbums>',
                 '/flask/getSimilarByNumber/<album_number>/<slider>/<numAlbums>')
