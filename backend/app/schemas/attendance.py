from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class SessionCreateRequest(BaseModel):
    class_id: int
    title: str
    subject_name: Optional[str] = None  # e.g. "DBMS", "Computer Networks"
    classroom_lat: float
    classroom_lon: float
    radius_meters: float = 50.0
    mode: str = "standard"  # "standard" | "biometric"

class SessionResponse(BaseModel):
    id: int
    teacher_id: int
    class_id: int
    title: str
    subject_name: Optional[str] = None
    classroom_lat: float
    classroom_lon: float
    radius_meters: float
    mode: str
    is_active: bool
    created_at: datetime
    closed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ActiveTokenResponse(BaseModel):
    token: str
    remaining_seconds: int
    session_id: int
    is_active: bool

class CheckInRequest(BaseModel):
    session_id: int
    token: str
    student_lat: Optional[float] = None
    student_lon: Optional[float] = None
    device_hash: str
    snapshot: Optional[str] = None  # Base64 image data-url

class CheckInResponse(BaseModel):
    success: bool
    message: str
    status: str
    distance_meters: Optional[float] = None
    verified_at: Optional[datetime] = None

class AttendanceStudentItem(BaseModel):
    record_id: int
    student_id: int
    student_name: str
    student_email: str
    status: str
    distance_meters: Optional[float] = None
    verified_at: datetime
    device_hash: str

class LiveRosterResponse(BaseModel):
    session_id: int
    title: str
    subject_name: Optional[str] = None
    is_active: bool
    total_enrolled: int
    total_present: int
    records: List[AttendanceStudentItem]
