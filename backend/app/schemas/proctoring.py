from pydantic import BaseModel
from datetime import datetime

class ViolationCreate(BaseModel):
    attempt_id: int
    type: str # "no_face", "multi_face", "tab_switch", "identity_mismatch"
    snapshot: str # Base64 encoded JPEG image

class ViolationResponse(BaseModel):
    id: int
    attempt_id: int
    type: str
    evidence_path: str
    created_at: datetime

    class Config:
        from_attributes = True

class IdentityCheckCreate(BaseModel):
    attempt_id: int
    descriptor: list[float]

