import os, glob
import pandas as pd

path = "/RYMScraper/Exports"
all_files = sorted(glob.glob(os.path.join(path, "*.csv")))
print(all_files)

df_from_each_file = (pd.read_csv(f, sep=None) for f in all_files)
df_merged = pd.concat(df_from_each_file, ignore_index=True)
df_merged.to_csv( "merged.csv")