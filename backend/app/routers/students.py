from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
import os
import base64
from pydantic import BaseModel

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User
from app.models.pending_enrollment import PendingEnrollment
from app.models.enrollment import Enrollment
from app.models.class_room import ClassRoom
from app.models.attempt import Attempt
from app.models.exam import Exam
from app.models.question import Question
from app.models.violation import Violation
from app.services.email_service import send_email

router = APIRouter()

STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage")

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

    # ── Automatic Post-Biometric Enrollment ─────────────────────────────
    # Convert matching PendingEnrollment entries into active Enrollment rows
    pending_list = db.query(PendingEnrollment).filter(
        PendingEnrollment.email == current_user.email.lower()
    ).all()

    for p in pending_list:
        class_room = db.query(ClassRoom).filter(ClassRoom.id == p.class_id).first()
        existing_enr = db.query(Enrollment).filter(
            Enrollment.class_id == p.class_id,
            Enrollment.student_id == current_user.id
        ).first()

        if existing_enr:
            existing_enr.status = "active"
        else:
            new_enr = Enrollment(
                class_id=p.class_id,
                student_id=current_user.id,
                status="active"
            )
            db.add(new_enr)

        db.delete(p)

        if class_room:
            send_email(
                current_user.email,
                f"Enrolled in Class: {class_room.name}",
                f"Hello {current_user.name},\n\nYour biometric face profile has been verified! You are now automatically enrolled in {class_room.name}."
            )

    db.commit()
    return {"detail": "Face reference enrolled successfully and class invitations activated"}


@router.get("/profile")
def get_profile(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    enrolled_classes = []
    if current_user.role == "student":
        enrs = db.query(Enrollment).filter(Enrollment.student_id == current_user.id, Enrollment.status == "active").all()
        for e in enrs:
            cr = db.query(ClassRoom).filter(ClassRoom.id == e.class_id).first()
            if cr:
                enrolled_classes.append({
                    "id": cr.id,
                    "name": cr.name
                })

    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "face_enrolled": current_user.face_enrolled,
        "enrolled_classes": enrolled_classes
    }


@router.get("/{student_id}/profile")
def get_student_profile_for_teacher(
    student_id: int,
    current_user: User = Depends(RoleChecker(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    """Return detailed performance profile for a student (exams taken, scores, violations)."""
    student = db.query(User).filter(User.id == student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student user not found.")

    attempts = db.query(Attempt).filter(Attempt.student_id == student_id).order_by(Attempt.started_at.desc()).all()
    
    attempts_data = []
    total_violations = 0

    for att in attempts:
        exam = db.query(Exam).filter(Exam.id == att.exam_id).first()
        q_count = db.query(Question).filter(Question.exam_id == att.exam_id).count() if exam else 0
        v_count = db.query(Violation).filter(Violation.attempt_id == att.id).count()
        total_violations += v_count

        attempts_data.append({
            "attempt_id": att.id,
            "exam_id": att.exam_id,
            "exam_title": exam.title if exam else "Unknown Exam",
            "score": att.score,
            "total_marks": q_count,
            "status": att.status,
            "started_at": att.started_at,
            "submitted_at": att.submitted_at,
            "violations_count": v_count
        })

    enrolled_classes = db.query(Enrollment).filter(
        Enrollment.student_id == student_id,
        Enrollment.status == "active"
    ).all()

    class_names = []
    for enr in enrolled_classes:
        cr = db.query(ClassRoom).filter(ClassRoom.id == enr.class_id).first()
        if cr:
            class_names.append(cr.name)

    return {
        "id": student.id,
        "name": student.name,
        "email": student.email,
        "face_enrolled": student.face_enrolled,
        "created_at": student.created_at,
        "enrolled_classes": class_names,
        "total_exams_attempted": len(attempts_data),
        "total_violations": total_violations,
        "attempts": attempts_data
    }
