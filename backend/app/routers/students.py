import os
import base64

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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

STORAGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "storage"
)


class FaceEnrollRequest(BaseModel):
    image: str  # Base64 image snapshot


@router.post("/enroll-face")
async def enroll_face(
    payload: FaceEnrollRequest,
    current_user: User = Depends(RoleChecker(["student"])),
    db: AsyncSession = Depends(get_db)
):
    if not payload.image:
        raise HTTPException(status_code=400, detail="Image data is required")

    user_dir = os.path.join(STORAGE_DIR, "faces", str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)
    file_path = os.path.join(user_dir, "reference.jpg")

    try:
        header, encoded = payload.image.split(",", 1) if "," in payload.image else ("", payload.image)
        with open(file_path, "wb") as f:
            f.write(base64.b64decode(encoded))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process image: {str(e)}")

    current_user.face_descriptor = f"faces/{current_user.id}/reference.jpg"
    current_user.face_enrolled = True
    await db.commit()

    # Auto-enroll from pending invitations
    pending_result = await db.execute(
        select(PendingEnrollment).where(
            PendingEnrollment.email == current_user.email.lower()
        )
    )
    pending_list = pending_result.scalars().all()

    for p in pending_list:
        cr_result = await db.execute(
            select(ClassRoom).where(ClassRoom.id == p.class_id)
        )
        class_room = cr_result.scalar_one_or_none()

        existing_enr_result = await db.execute(
            select(Enrollment).where(
                Enrollment.class_id == p.class_id,
                Enrollment.student_id == current_user.id
            )
        )
        existing_enr = existing_enr_result.scalar_one_or_none()

        if existing_enr:
            existing_enr.status = "active"
        else:
            db.add(Enrollment(
                class_id=p.class_id,
                student_id=current_user.id,
                status="active"
            ))

        await db.delete(p)

        if class_room:
            send_email(
                current_user.email,
                f"Enrolled in Class: {class_room.name}",
                f"Hello {current_user.name},\n\nYour biometric face profile has been verified! You are now automatically enrolled in {class_room.name}."
            )

    await db.commit()
    return {"detail": "Face reference enrolled successfully and class invitations activated"}


@router.get("/profile")
async def get_profile(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    enrolled_classes = []
    if current_user.role == "student":
        enr_result = await db.execute(
            select(Enrollment).where(
                Enrollment.student_id == current_user.id,
                Enrollment.status == "active"
            )
        )
        for e in enr_result.scalars().all():
            cr_result = await db.execute(
                select(ClassRoom).where(ClassRoom.id == e.class_id)
            )
            cr = cr_result.scalar_one_or_none()
            if cr:
                enrolled_classes.append({"id": cr.id, "name": cr.name})

    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "face_enrolled": current_user.face_enrolled,
        "enrolled_classes": enrolled_classes
    }


@router.get("/{student_id}/profile")
async def get_student_profile_for_teacher(
    student_id: int,
    current_user: User = Depends(RoleChecker(["teacher", "admin"])),
    db: AsyncSession = Depends(get_db)
):
    """Return detailed performance profile for a student (exams taken, scores, violations)."""
    student_result = await db.execute(
        select(User).where(User.id == student_id, User.role == "student")
    )
    student = student_result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student user not found.")

    att_result = await db.execute(
        select(Attempt)
        .where(Attempt.student_id == student_id)
        .order_by(Attempt.started_at.desc())
    )
    attempts = att_result.scalars().all()

    attempts_data = []
    total_violations = 0

    for att in attempts:
        exam_result = await db.execute(select(Exam).where(Exam.id == att.exam_id))
        exam = exam_result.scalar_one_or_none()

        from sqlalchemy import func
        q_count_result = await db.execute(
            select(func.count(Question.id)).where(Question.exam_id == att.exam_id)
        )
        q_count = q_count_result.scalar() if exam else 0

        v_count_result = await db.execute(
            select(func.count(Violation.id)).where(Violation.attempt_id == att.id)
        )
        v_count = v_count_result.scalar()
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

    enr_result = await db.execute(
        select(Enrollment).where(
            Enrollment.student_id == student_id,
            Enrollment.status == "active"
        )
    )
    class_names = []
    for enr in enr_result.scalars().all():
        cr_result = await db.execute(select(ClassRoom).where(ClassRoom.id == enr.class_id))
        cr = cr_result.scalar_one_or_none()
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
