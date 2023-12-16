import json

# Load the JSON data from the file
with open("album_data.json", "r") as file:
    album_data = json.load(file)

# Iterate through the album data and add the AlbumNumber key
for index, album in enumerate(album_data, start=1):
    album["AlbumNumber"] = index

# Save the updated JSON data back to the file
with open("album_data_updated.json", "w") as file:
    json.dump(album_data, file, indent=2)
