import pandas as pd
import os

# Create sample roster data with 4 dummy student emails
data = {
    "student_name": ["Alice Smith", "Bob Johnson", "Charlie Brown", "Diana Prince"],
    "email": ["alice.smith@examguard.ai", "bob.johnson@examguard.ai", "charlie.brown@examguard.ai", "diana.prince@examguard.ai"]
}

df = pd.DataFrame(data)

excel_path = os.path.abspath("sample_student_roster.xlsx")
csv_path = os.path.abspath("sample_student_roster.csv")

df.to_excel(excel_path, index=False)
print("Created Excel roster at:", excel_path)

df.to_csv(csv_path, index=False)
print("Created CSV roster at:", csv_path)
