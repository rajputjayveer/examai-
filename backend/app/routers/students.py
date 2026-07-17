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


import base64

class FaceEnrollRequest(BaseModel):
    image: str # Base64 image snapshot

@router.post("/enroll-face")
def enroll_face(
    payload: FaceEnrollRequest,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    if not payload.image:
        raise HTTPException(status_code=400, detail="Image data is required")

    user_dir = os.path.join(STORAGE_DIR, "faces", str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)
    file_path = os.path.join(user_dir, "reference.jpg")

    try:
        header, encoded = payload.image.split(",", 1) if "," in payload.image else ("", payload.image)
        img_data = base64.b64decode(encoded)
        with open(file_path, "wb") as f:
            f.write(img_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process image: {str(e)}")

    current_user.face_descriptor = f"faces/{current_user.id}/reference.jpg" # store image path
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

