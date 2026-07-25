from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ClassCreate(BaseModel):
    name: str

class ClassResponse(BaseModel):
    id: int
    name: str
    teacher_id: int
    created_at: datetime
    student_count: Optional[int] = 0

    class Config:
        from_attributes = True

class EnrollmentCreate(BaseModel):
    student_email: Optional[str] = None
    student_id: Optional[int] = None

class BulkEnrollmentRequest(BaseModel):
    emails: List[str]

class EnrollmentResponse(BaseModel):
    id: int
    class_id: int
    student_id: int
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    enrolled_at: datetime
    status: str

    class Config:
        from_attributes = True
