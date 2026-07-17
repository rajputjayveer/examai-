from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
import os
import shutil

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User

router = APIRouter()

STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage")

from pydantic import BaseModel
from app.services.face_service import save_descriptor

class FaceEnrollRequest(BaseModel):
    descriptor: list[float]

@router.post("/enroll-face")
def enroll_face(
    payload: FaceEnrollRequest,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    if len(payload.descriptor) != 128:
        raise HTTPException(status_code=400, detail="Invalid face descriptor")

    current_user.face_descriptor = save_descriptor(payload.descriptor)
    current_user.face_enrolled = True
    db.commit()
    return {"detail": "Face reference enrolled successfully"}

@router.get("/profile")
def get_profile(current_user: User = Depends(get_current_active_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "face_enrolled": current_user.face_enrolled
    }

