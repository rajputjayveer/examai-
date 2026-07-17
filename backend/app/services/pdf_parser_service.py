import os
import json
import google.generativeai as genai
from app.core.config import settings

def parse_pdf_questions(pdf_file_path: str) -> list:
    """
    Uploads the raw PDF file directly to Gemini API for native AI multimodal processing
    to extract MCQ questions and generate the correct answer key.
    """
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        if settings.DEV_MODE:
            print("[DEV MODE] GEMINI_API_KEY is missing. Returning mock questions.")
            return [
                {
                    "text": "What is the primary capital of France?",
                    "option_a": "London",
                    "option_b": "Berlin",
                    "option_c": "Paris",
                    "option_d": "Rome",
                    "correct_option": "C"
                },
                {
                    "text": "Which programming language is predominantly used for iOS development?",
                    "option_a": "Java",
                    "option_b": "Swift",
                    "option_c": "Python",
                    "option_d": "C++",
                    "correct_option": "B"
                }
            ]
        else:
            raise ValueError("GEMINI_API_KEY is not configured.")

    # Configure API
    genai.configure(api_key=api_key)

    # 1. Upload the PDF file directly to Gemini
    print(f"Uploading PDF file to Gemini: {pdf_file_path}")
    uploaded_file = genai.upload_file(path=pdf_file_path, mime_type="application/pdf")

    # 2. Instruct the model
    prompt = """
    Extract all Multiple Choice Questions (MCQs) from this question paper PDF.
    For each question, extract the question text, options (A, B, C, D), and identify the correct option (A, B, C, or D) to serve as the answer key.
    
    Return a valid JSON array of objects. Each object MUST have the following structure:
    {
      "text": "Question text...",
      "option_a": "Option A value...",
      "option_b": "Option B value...",
      "option_c": "Option C value...",
      "option_d": "Option D value...",
      "correct_option": "A" // Must be 'A', 'B', 'C', or 'D'
    }
    """

    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(
            [uploaded_file, prompt],
            generation_config={
                "response_mime_type": "application/json"
            }
        )
        
        parsed_questions = json.loads(response.text)
        
        # Clean up the file on Gemini
        try:
            genai.delete_file(uploaded_file.name)
        except Exception as delete_err:
            print("Failed to delete Gemini file:", delete_err)

        if isinstance(parsed_questions, list):
            return parsed_questions
        elif isinstance(parsed_questions, dict) and "questions" in parsed_questions:
            return parsed_questions["questions"]
        else:
            raise ValueError("Unexpected JSON format from Gemini API.")
            
    except Exception as e:
        # Clean up in case of failure
        try:
            genai.delete_file(uploaded_file.name)
        except:
            pass
        raise ValueError(f"Failed to extract questions natively with Gemini API: {str(e)}")
