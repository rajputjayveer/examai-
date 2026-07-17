from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class AnswerCreate(BaseModel):
    question_id: int
    selected_option: str # "A", "B", "C", "D"

class AnswerResponse(BaseModel):
    id: int
    question_id: int
    selected_option: str

    class Config:
        from_attributes = True

class AttemptResponse(BaseModel):
    id: int
    exam_id: int
    student_id: int
    started_at: datetime
    submitted_at: Optional[datetime] = None
    score: Optional[float] = None
    status: str

    class Config:
        from_attributes = True
