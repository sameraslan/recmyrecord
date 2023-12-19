import pandas as pd

def mergePkls(files, outputFile):
    df_from_each_file = (pd.read_pickle(f) for f in files)
    df_merged = pd.concat(df_from_each_file, ignore_index=True)
    #df_merged.drop(["Unnamed: 0"])
    df_merged.to_pickle(outputFile)
    #print(df_merged)

files = ["albums_audio_features.pkl", "found.pkl"]
mergePkls(files, "albums_audio_features.pkl")