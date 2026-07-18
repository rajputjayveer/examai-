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
from app.schemas.proctoring import ViolationCreate, ViolationResponse, IdentityCheckCreate

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

    # ── Auto-submit lockout ──────────────────────────────────────────────
    auto_submitted = False
    if attempt.status == "ongoing":
        violation_count = db.query(Violation).filter(Violation.attempt_id == attempt.id).count()
        if violation_count >= MAX_VIOLATIONS_BEFORE_AUTO_SUBMIT:
            attempt.submitted_at = datetime.utcnow()
            attempt.status = "submitted"

            questions = db.query(Question).filter(Question.exam_id == attempt.exam_id).all()
            correct_answers = {q.id: q.correct_option for q in questions if q.correct_option is not None}
            if questions and len(correct_answers) == len(questions):
                student_answers = db.query(Answer).filter(Answer.attempt_id == attempt.id).all()
                attempt.score = sum(
                    1.0 for a in student_answers if correct_answers.get(a.question_id) == a.selected_option
                )
                attempt.status = "graded"

            db.commit()
            auto_submitted = True

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
        violation = Violation(
            attempt_id=attempt.id,
            type="identity_mismatch",
            evidence_path=None
        )
        db.add(violation)
        db.commit()

    return {"verified": is_match, "distance": round(distance, 3)}

