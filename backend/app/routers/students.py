from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
import os
import shutil

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User

router = APIRouter()

STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage")

@router.post("/enroll-face")
def enroll_face(
    file: UploadFile = File(...),
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    user_dir = os.path.join(STORAGE_DIR, "faces", str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)
    
    # Save target face reference
    file_path = os.path.join(user_dir, "reference.jpg")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
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
