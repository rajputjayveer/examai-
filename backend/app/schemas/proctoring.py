from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ViolationCreate(BaseModel):
    attempt_id: int
    type: str # "no_face", "multi_face", "tab_switch", "identity_mismatch", "speech_detected"
    snapshot: Optional[str] = None    # Base64 encoded JPEG image
    audio_data: Optional[str] = None  # Base64 encoded WebM audio clip

class ViolationResponse(BaseModel):
    id: int
    attempt_id: int
    type: str
    evidence_path: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class IdentityCheckCreate(BaseModel):
    attempt_id: int
    snapshot: str # Base64 encoded JPEG image

class AudioViolationCreate(BaseModel):
    attempt_id: int
    audio_data: str  # Base64-encoded WebM audio clip
