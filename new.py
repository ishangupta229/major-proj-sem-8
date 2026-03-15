import pandas as pd

# load dataset
df = pd.read_csv("heart_disease_uci.csv")

# basic info
print("Shape:", df.shape)
print("\nColumns:")
print(df.columns)

print("\nFirst 5 rows:")
print(df.head())