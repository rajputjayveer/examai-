
import pandas as pd

REQUIRED_COLUMNS = {"question", "option_a", "option_b", "option_c", "option_d", "correct_option"}


def parse_csv_questions(file_path: str) -> list:
    """Parse a CSV or Excel file into a list of question dicts.

    The file must contain the following columns (case-insensitive, spaces
    normalised to underscores):
        question, option_a, option_b, option_c, option_d, correct_option

    Returns a list of dicts ready to be POSTed to /exams/{id}/questions.
    """
    if file_path.lower().endswith((".xlsx", ".xls")):
        df = pd.read_excel(file_path)
    else:
        df = pd.read_csv(file_path)

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Missing required column(s): {', '.join(sorted(missing))}")

    questions = []
    for _, row in df.iterrows():
        questions.append({
            "text": str(row["question"]).strip(),
            "option_a": str(row["option_a"]).strip(),
            "option_b": str(row["option_b"]).strip(),
            "option_c": str(row["option_c"]).strip(),
            "option_d": str(row["option_d"]).strip(),
            "correct_option": str(row["correct_option"]).strip().upper()
        })
    return questions
