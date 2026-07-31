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
from app.models.question import Question
from app.models.answer import Answer
from app.schemas.proctoring import ViolationCreate, ViolationResponse, IdentityCheckCreate, AudioViolationCreate

router = APIRouter()

STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage")

MAX_VIOLATIONS_BEFORE_AUTO_SUBMIT = 5

@router.post("/violation")
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
        # Decode and save picture snapshot (.jpg)
        attempt_dir = os.path.join(STORAGE_DIR, "evidence", str(attempt.id))
        os.makedirs(attempt_dir, exist_ok=True)
        filename = f"{int(datetime.utcnow().timestamp())}_{violation_in.type}.jpg"
        file_path = os.path.join(attempt_dir, filename)
        try:
            header, encoded = violation_in.snapshot.split(",", 1) if "," in violation_in.snapshot else ("", violation_in.snapshot)
            with open(file_path, "wb") as f:
                f.write(base64.b64decode(encoded))
            evidence_path = f"evidence/{attempt.id}/{filename}"
        except Exception as e:
            print("Failed to decode and save violation snapshot:", e)
    elif violation_in.audio_data:
        # Decode and save audio evidence clip (.webm)
        attempt_dir = os.path.join(STORAGE_DIR, "evidence", str(attempt.id))
        os.makedirs(attempt_dir, exist_ok=True)
        filename = f"{int(datetime.utcnow().timestamp())}_{violation_in.type}.webm"
        file_path = os.path.join(attempt_dir, filename)
        try:
            header, encoded = violation_in.audio_data.split(",", 1) if "," in violation_in.audio_data else ("", violation_in.audio_data)
            with open(file_path, "wb") as f:
                f.write(base64.b64decode(encoded))
            evidence_path = f"evidence/{attempt.id}/{filename}"
        except Exception as e:
            print("Failed to decode and save audio evidence clip:", e)
            
    violation = Violation(
        attempt_id=violation_in.attempt_id,
        type=violation_in.type,
        evidence_path=evidence_path
    )
    db.add(violation)
    db.commit()
    db.refresh(violation)

    # ── Auto-submit lockout ──────────────────────────────────────────────
    # Lockout logic disabled - only flag and log violations
    auto_submitted = False

    return {
        "id": violation.id,
        "attempt_id": violation.attempt_id,
        "type": violation.type,
        "evidence_path": violation.evidence_path,
        "created_at": violation.created_at,
        "auto_submitted": auto_submitted
    }

from app.services.face_service import verify_faces

@router.post("/identity-check")
def identity_check(
    check_in: IdentityCheckCreate,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    attempt = db.query(Attempt).filter(
        Attempt.id == check_in.attempt_id,
        Attempt.student_id == current_user.id
    ).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if not current_user.face_descriptor:
        return {"verified": False, "reason": "no_reference_enrolled"}

    # Resolve full path to reference.jpg
    ref_path = os.path.join(STORAGE_DIR, "faces", str(current_user.id), "reference.jpg")

    is_match, distance = verify_faces(ref_path, check_in.snapshot)

    if not is_match:
        evidence_path = None
        if check_in.snapshot:
            attempt_dir = os.path.join(STORAGE_DIR, "evidence", str(attempt.id))
            os.makedirs(attempt_dir, exist_ok=True)
            filename = f"{int(datetime.utcnow().timestamp())}_identity_mismatch.jpg"
            file_path = os.path.join(attempt_dir, filename)
            try:
                header, encoded = check_in.snapshot.split(",", 1) if "," in check_in.snapshot else ("", check_in.snapshot)
                img_data = base64.b64decode(encoded)
                with open(file_path, "wb") as f:
                    f.write(img_data)
                evidence_path = f"evidence/{attempt.id}/{filename}"
            except Exception as e:
                print("Failed to save identity check snapshot:", e)

        violation = Violation(
            attempt_id=attempt.id,
            type="identity_mismatch",
            evidence_path=evidence_path
        )
        db.add(violation)
        db.commit()

    return {"verified": is_match, "distance": round(distance, 3)}


@router.post("/audio-violation")
def save_audio_violation(
    check_in: AudioViolationCreate,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    """
    Browser has already detected speech via Silero VAD ONNX (real-time, ~100ms latency).
    This endpoint stores the 4-second audio evidence clip and logs the violation.
    No server-side ML inference needed — detection runs in the browser.
    """
    attempt = db.query(Attempt).filter(
        Attempt.id == check_in.attempt_id,
        Attempt.student_id == current_user.id
    ).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    evidence_path = None
    if check_in.audio_data:
        attempt_dir = os.path.join(STORAGE_DIR, "evidence", str(attempt.id))
        os.makedirs(attempt_dir, exist_ok=True)
        filename = f"{int(datetime.utcnow().timestamp())}_speech_detected.webm"
        file_path = os.path.join(attempt_dir, filename)
        try:
            header, encoded = check_in.audio_data.split(",", 1) if "," in check_in.audio_data else ("", check_in.audio_data)
            with open(file_path, "wb") as f:
                f.write(base64.b64decode(encoded))
            evidence_path = f"evidence/{attempt.id}/{filename}"
        except Exception as e:
            print(f"[AudioViolation] Failed to save audio clip: {e}")

    violation = Violation(
        attempt_id=attempt.id,
        type="speech_detected",
        evidence_path=evidence_path
    )
    db.add(violation)
    db.commit()
    db.refresh(violation)

    return {
        "logged": True,
        "id": violation.id,
        "evidence_path": evidence_path
    }
