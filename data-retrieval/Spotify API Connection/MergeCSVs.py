import pandas as pd

path = "/RYMScraper/Exports"
#all_files = sorted(glob.glob(os.path.join(path, "*.csv")))
all_files = ["albums_audio_feature_data.csv", "found.csv"]

df_from_each_file = (pd.read_csv(f, sep=None) for f in all_files)
df_merged = pd.concat(df_from_each_file, ignore_index=True)
#df_merged.drop(["Unnamed: 0"])
df_merged.to_csv("albums_audio_feature_data.csv")