from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class QuestionBase(BaseModel):
    text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str

class QuestionCreate(QuestionBase):
    correct_option: str # "A", "B", "C", "D"

class QuestionResponse(QuestionBase):
    id: int
    exam_id: int
    order_index: int

    class Config:
        from_attributes = True

class ExamBase(BaseModel):
    title: str
    duration_minutes: int
    start_at: datetime
    end_at: datetime

class ExamCreate(ExamBase):
    pass

class ExamResponse(ExamBase):
    id: int
    teacher_id: int
    status: str
    created_at: datetime
    user_has_submitted: Optional[bool] = False
    user_attempt_id: Optional[int] = None
    user_score: Optional[int] = None
    total_marks: Optional[int] = None

    class Config:
        from_attributes = True

class ExamDetailResponse(ExamResponse):
    questions: List[QuestionResponse] = []

    class Config:
        from_attributes = True
