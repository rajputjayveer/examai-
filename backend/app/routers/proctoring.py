from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import base64
import os
from datetime import datetime

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User
from app.models.attempt import Attempt
from app.models.violation import Violation
from app.schemas.proctoring import ViolationCreate, ViolationResponse, IdentityCheckCreate

router = APIRouter()

STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage")

@router.post("/violation", response_model=ViolationResponse)
def log_violation(
    violation_in: ViolationCreate,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    attempt = db.query(Attempt).filter(Attempt.id == violation_in.attempt_id, Attempt.student_id == current_user.id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    evidence_path = None
    if violation_in.snapshot:
        # Decode and save to files
        attempt_dir = os.path.join(STORAGE_DIR, "evidence", str(attempt.id))
        os.makedirs(attempt_dir, exist_ok=True)
        
        filename = f"{int(datetime.utcnow().timestamp())}_{violation_in.type}.jpg"
        file_path = os.path.join(attempt_dir, filename)
        
        try:
            header, encoded = violation_in.snapshot.split(",", 1) if "," in violation_in.snapshot else ("", violation_in.snapshot)
            img_data = base64.b64decode(encoded)
            with open(file_path, "wb") as f:
                f.write(img_data)
            evidence_path = f"evidence/{attempt.id}/{filename}"
        except Exception as e:
            print("Failed to decode and save violation snapshot:", e)
            
    violation = Violation(
        attempt_id=violation_in.attempt_id,
        type=violation_in.type,
        evidence_path=evidence_path
    )
    db.add(violation)
    db.commit()
    db.refresh(violation)
    return violation

@router.post("/identity-check")
def identity_check(
    check_in: IdentityCheckCreate,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    attempt = db.query(Attempt).filter(Attempt.id == check_in.attempt_id, Attempt.student_id == current_user.id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    # We will save this temporary check snapshot or process it via face verification service
    # For now, return verified status
    return {"verified": True}
