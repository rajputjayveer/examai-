import os
import tempfile
import pandas as pd
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.core.config import settings
from app.models.user import User
from app.models.class_room import ClassRoom
from app.models.class_teacher import ClassTeacher
from app.models.enrollment import Enrollment
from app.models.pending_enrollment import PendingEnrollment
from app.models.exam import Exam
from app.models.attempt import Attempt
from app.models.violation import Violation
from app.schemas.class_room import ClassCreate, ClassResponse, EnrollmentResponse
from app.services.email_service import send_email

router = APIRouter()


class StudentEmailItem(BaseModel):
    email: Optional[str] = None
    emails: Optional[List[str]] = None


class CoTeacherItem(BaseModel):
    email: str


class StudentEnrollItem(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    emails: Optional[List[str]] = None
    students: Optional[List[dict]] = None


async def verify_teacher_class_access(
    class_id: int, teacher_id: int, db: AsyncSession
) -> ClassRoom:
    """Verify that a class exists and that the logged-in teacher is owner or co-teacher."""
    cr_result = await db.execute(select(ClassRoom).where(ClassRoom.id == class_id))
    class_room = cr_result.scalar_one_or_none()
    if not class_room:
        raise HTTPException(status_code=404, detail="Class not found")

    if class_room.teacher_id == teacher_id:
        return class_room

    co_result = await db.execute(
        select(ClassTeacher).where(
            ClassTeacher.class_id == class_id,
            ClassTeacher.teacher_id == teacher_id
        )
    )
    if not co_result.scalar_one_or_none():
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to access or manage this class."
        )
    return class_room


def _derive_name(raw_name: Optional[str], email: str) -> str:
    if raw_name and str(raw_name).strip() and str(raw_name).strip().lower() != 'nan':
        return str(raw_name).strip()
    local_part = email.split('@')[0]
    parts = [p.capitalize() for p in local_part.replace('.', ' ').replace('_', ' ').replace('-', ' ').split()]
    return ' '.join(parts) if parts else local_part.capitalize()


@router.post("", response_model=ClassResponse)
async def create_class(
    class_in: ClassCreate,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    """Create a new class owned by the logged-in teacher."""
    new_class = ClassRoom(name=class_in.name, teacher_id=current_user.id)
    db.add(new_class)
    await db.commit()
    await db.refresh(new_class)
    return {
        "id": new_class.id,
        "name": new_class.name,
        "teacher_id": new_class.teacher_id,
        "created_at": new_class.created_at,
        "student_count": 0
    }


@router.get("", response_model=List[ClassResponse])
async def list_classes(
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    """List all classes owned by or shared with the logged-in teacher."""
    owned_result = await db.execute(
        select(ClassRoom).where(ClassRoom.teacher_id == current_user.id)
    )
    owned_classes = owned_result.scalars().all()

    ct_result = await db.execute(
        select(ClassTeacher).where(ClassTeacher.teacher_id == current_user.id)
    )
    shared_class_ids = [ct.class_id for ct in ct_result.scalars().all()]

    shared_classes = []
    if shared_class_ids:
        shared_result = await db.execute(
            select(ClassRoom).where(ClassRoom.id.in_(shared_class_ids))
        )
        shared_classes = shared_result.scalars().all()

    all_classes_map = {c.id: c for c in list(owned_classes) + list(shared_classes)}
    sorted_classes = sorted(all_classes_map.values(), key=lambda c: c.created_at, reverse=True)

    response_list = []
    for c in sorted_classes:
        count_result = await db.execute(
            select(func.count(Enrollment.id)).where(
                Enrollment.class_id == c.id,
                Enrollment.status == "active"
            )
        )
        active_count = count_result.scalar()
        response_list.append({
            "id": c.id,
            "name": c.name,
            "teacher_id": c.teacher_id,
            "created_at": c.created_at,
            "student_count": active_count
        })
    return response_list


@router.get("/{class_id}", response_model=ClassResponse)
async def get_class(
    class_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    class_room = await verify_teacher_class_access(class_id, current_user.id, db)
    count_result = await db.execute(
        select(func.count(Enrollment.id)).where(
            Enrollment.class_id == class_room.id,
            Enrollment.status == "active"
        )
    )
    return {
        "id": class_room.id,
        "name": class_room.name,
        "teacher_id": class_room.teacher_id,
        "created_at": class_room.created_at,
        "student_count": count_result.scalar()
    }


@router.delete("/{class_id}")
async def delete_class(
    class_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    """Delete a class and associated enrollments/invitations."""
    class_room = await verify_teacher_class_access(class_id, current_user.id, db)
    await db.delete(class_room)
    await db.commit()
    return {"detail": "Class deleted successfully."}


@router.post("/{class_id}/co-teachers")
async def add_co_teacher(
    class_id: int,
    payload: CoTeacherItem,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    class_room = await verify_teacher_class_access(class_id, current_user.id, db)
    target_email = payload.email.strip().lower()

    co_result = await db.execute(
        select(User).where(User.email == target_email, User.role == "teacher")
    )
    co_teacher = co_result.scalar_one_or_none()
    if not co_teacher:
        raise HTTPException(status_code=404, detail="No registered instructor account found with that email.")
    if co_teacher.id == class_room.teacher_id:
        raise HTTPException(status_code=400, detail="This instructor is already the primary owner of the class.")

    existing_result = await db.execute(
        select(ClassTeacher).where(
            ClassTeacher.class_id == class_id,
            ClassTeacher.teacher_id == co_teacher.id
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="This instructor is already a co-teacher for this class.")

    db.add(ClassTeacher(class_id=class_id, teacher_id=co_teacher.id))
    await db.commit()

    send_email(
        co_teacher.email,
        f"Shared Class Access: {class_room.name}",
        f"Hello {co_teacher.name},\n\nProf. {current_user.name} has shared access to class '{class_room.name}' with you on SecureExam AI."
    )
    return {"detail": f"Class shared with {co_teacher.name} ({co_teacher.email}) successfully."}


@router.get("/{class_id}/co-teachers")
async def list_co_teachers(
    class_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    await verify_teacher_class_access(class_id, current_user.id, db)
    ct_result = await db.execute(
        select(ClassTeacher).where(ClassTeacher.class_id == class_id)
    )
    result = []
    for ct in ct_result.scalars().all():
        u_result = await db.execute(select(User).where(User.id == ct.teacher_id))
        teacher_user = u_result.scalar_one_or_none()
        if teacher_user:
            result.append({
                "id": ct.id,
                "teacher_id": teacher_user.id,
                "name": teacher_user.name,
                "email": teacher_user.email
            })
    return result


@router.delete("/{class_id}/co-teachers/{teacher_id}")
async def remove_co_teacher(
    class_id: int,
    teacher_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    await verify_teacher_class_access(class_id, current_user.id, db)
    assignment_result = await db.execute(
        select(ClassTeacher).where(
            ClassTeacher.class_id == class_id,
            ClassTeacher.teacher_id == teacher_id
        )
    )
    assignment = assignment_result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Co-teacher assignment not found.")
    await db.delete(assignment)
    await db.commit()
    return {"detail": "Co-teacher removed successfully."}


@router.get("/{class_id}/students")
async def list_class_students(
    class_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    """List all enrolled students and pending registration invitations for a class."""
    await verify_teacher_class_access(class_id, current_user.id, db)

    enr_result = await db.execute(
        select(Enrollment).where(
            Enrollment.class_id == class_id,
            Enrollment.status == "active"
        )
    )
    result = []
    for enr in enr_result.scalars().all():
        student_result = await db.execute(select(User).where(User.id == enr.student_id))
        student = student_result.scalar_one_or_none()
        result.append({
            "id": enr.id,
            "class_id": enr.class_id,
            "student_id": enr.student_id,
            "student_name": student.name if student else _derive_name(None, student.email if student else ""),
            "student_email": student.email if student else "Unknown",
            "enrolled_at": enr.enrolled_at,
            "status": enr.status
        })

    pending_result = await db.execute(
        select(PendingEnrollment).where(PendingEnrollment.class_id == class_id)
    )
    for p in pending_result.scalars().all():
        display_name = p.student_name if p.student_name else _derive_name(None, p.email)
        result.append({
            "id": -p.id,
            "class_id": p.class_id,
            "student_id": None,
            "student_name": display_name,
            "student_email": p.email,
            "enrolled_at": p.created_at,
            "status": "pending_registration"
        })
    return result


async def _enroll_item_list(
    class_room: ClassRoom, items: list, teacher: User, db: AsyncSession
):
    added = []
    errors = []

    for item in items:
        raw_email = item.get("email", "")
        if not raw_email:
            continue
        email = raw_email.strip().lower()
        if not email:
            continue

        raw_name = item.get("name")
        student_name = _derive_name(raw_name, email)

        student_result = await db.execute(
            select(User).where(User.email == email, User.role == "student")
        )
        student = student_result.scalar_one_or_none()

        if not student:
            existing_pending_result = await db.execute(
                select(PendingEnrollment).where(
                    PendingEnrollment.class_id == class_room.id,
                    PendingEnrollment.email == email
                )
            )
            existing_pending = existing_pending_result.scalar_one_or_none()

            if not existing_pending:
                db.add(PendingEnrollment(
                    class_id=class_room.id,
                    email=email,
                    student_name=student_name,
                    invited_by_id=teacher.id
                ))
                await db.commit()
            else:
                if student_name and existing_pending.student_name != student_name:
                    existing_pending.student_name = student_name
                    await db.commit()

            reg_link = f"{settings.FRONTEND_BASE_URL}/register"
            send_email(
                email,
                f"Class Invitation: {class_room.name}",
                f"Hello {student_name},\n\nYou have been invited to join class '{class_room.name}' on SecureExam AI by {teacher.name}.\n\n"
                f"To access your class exams, please register your student account at:\n{reg_link}\n\n"
                f"Once you complete registration and biometric face enrollment, you will be automatically enrolled in {class_room.name}."
            )
            added.append({"email": email, "name": student_name, "status": "invited (pending registration)"})
            continue

        # Student exists — clear pending invite
        pending_del_result = await db.execute(
            select(PendingEnrollment).where(
                PendingEnrollment.class_id == class_room.id,
                PendingEnrollment.email == email
            )
        )
        for p in pending_del_result.scalars().all():
            await db.delete(p)

        enrollment_result = await db.execute(
            select(Enrollment).where(
                Enrollment.class_id == class_room.id,
                Enrollment.student_id == student.id
            )
        )
        enrollment = enrollment_result.scalar_one_or_none()

        if enrollment:
            if enrollment.status == "removed":
                enrollment.status = "active"
                await db.commit()
                added.append({"email": email, "name": student.name, "status": "re-activated"})
                send_email(
                    student.email,
                    f"Added to Class: {class_room.name}",
                    f"Hello {student.name},\n\nYou have been added back to class '{class_room.name}' by {teacher.name}."
                )
            else:
                errors.append(f"{email}: Already actively enrolled in this class.")
        else:
            db.add(Enrollment(
                class_id=class_room.id,
                student_id=student.id,
                status="active"
            ))
            await db.commit()
            added.append({"email": email, "name": student.name, "status": "enrolled"})
            send_email(
                student.email,
                f"Added to Class: {class_room.name}",
                f"Hello {student.name},\n\nYou've been added to {class_room.name} by {teacher.name}."
            )

    return {"added": added, "errors": errors}


@router.post("/{class_id}/students")
async def enroll_students(
    class_id: int,
    payload: StudentEnrollItem,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    """Enroll student(s) into class by email or issue pending invitation with optional student name."""
    class_room = await verify_teacher_class_access(class_id, current_user.id, db)

    items = []
    if payload.students:
        items.extend(payload.students)
    if payload.emails:
        for em in payload.emails:
            items.append({"email": em, "name": None})
    if payload.email:
        items.append({"email": payload.email, "name": payload.name})

    if not items:
        raise HTTPException(status_code=400, detail="Please provide an email or list of student items.")

    return await _enroll_item_list(class_room, items, current_user, db)


@router.post("/{class_id}/students/upload")
async def bulk_upload_roster(
    class_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    """Bulk enroll students from a CSV or Excel file containing email and optional student_name columns."""
    class_room = await verify_teacher_class_access(class_id, current_user.id, db)

    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(await file.read())
        temp_path = temp_file.name

    try:
        if temp_path.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(temp_path)
        else:
            df = pd.read_csv(temp_path)

        df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

        email_col = next(
            (c for c in ["email", "student_email", "mail", "user_email"] if c in df.columns),
            None
        )
        if not email_col:
            raise HTTPException(status_code=400, detail="File must contain an 'email' or 'student_email' column.")

        name_col = next(
            (c for c in ["student_name", "name", "full_name", "student"] if c in df.columns),
            None
        )

        items = []
        for _, row in df.iterrows():
            em = str(row[email_col]).strip() if pd.notna(row[email_col]) else ""
            nm = str(row[name_col]).strip() if name_col and pd.notna(row[name_col]) else None
            if em:
                items.append({"email": em, "name": nm})

        return await _enroll_item_list(class_room, items, current_user, db)
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=f"Failed to process file: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.delete("/{class_id}/students/{student_id}")
async def remove_student_from_class(
    class_id: int,
    student_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    """Remove student from class (or cancel pending invitation if negative ID)."""
    await verify_teacher_class_access(class_id, current_user.id, db)

    if student_id < 0:
        pending_id = -student_id
        pending_result = await db.execute(
            select(PendingEnrollment).where(
                PendingEnrollment.id == pending_id,
                PendingEnrollment.class_id == class_id
            )
        )
        pending = pending_result.scalar_one_or_none()
        if pending:
            await db.delete(pending)
            await db.commit()
            return {"detail": "Pending invitation cancelled."}
        raise HTTPException(status_code=404, detail="Pending invitation not found.")

    enr_result = await db.execute(
        select(Enrollment).where(
            Enrollment.class_id == class_id,
            Enrollment.student_id == student_id,
            Enrollment.status == "active"
        )
    )
    enrollment = enr_result.scalar_one_or_none()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Active student enrollment not found in this class.")

    enrollment.status = "removed"
    await db.commit()
    return {"detail": "Student removed from class successfully."}


@router.get("/{class_id}/analytics")
async def get_class_analytics(
    class_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    """Return aggregate statistics for all exams in this class."""
    class_room = await verify_teacher_class_access(class_id, current_user.id, db)

    enr_count_result = await db.execute(
        select(func.count(Enrollment.id)).where(
            Enrollment.class_id == class_id,
            Enrollment.status == "active"
        )
    )
    enrolled_count = enr_count_result.scalar()

    exams_result = await db.execute(select(Exam).where(Exam.class_id == class_id))
    class_exams = exams_result.scalars().all()
    exam_ids = [e.id for e in class_exams]

    if not exam_ids:
        return {
            "class_name": class_room.name,
            "enrolled_count": enrolled_count,
            "total_exams": 0,
            "total_attempts": 0,
            "average_score": None,
            "completion_rate": 0.0,
            "violation_breakdown": {},
            "exams": []
        }

    att_result = await db.execute(
        select(Attempt).where(
            Attempt.exam_id.in_(exam_ids),
            Attempt.status.in_(["submitted", "graded"])
        )
    )
    attempts = att_result.scalars().all()

    scored = [a.score for a in attempts if a.score is not None]
    average_score = round(sum(scored) / len(scored), 2) if scored else None
    total_possible = enrolled_count * len(class_exams)
    completion_rate = round((len(attempts) / total_possible) * 100, 1) if total_possible > 0 else 0.0

    attempt_ids = [a.id for a in attempts]
    violation_breakdown = {}
    if attempt_ids:
        viol_result = await db.execute(
            select(Violation).where(Violation.attempt_id.in_(attempt_ids))
        )
        for v in viol_result.scalars().all():
            violation_breakdown[v.type] = violation_breakdown.get(v.type, 0) + 1

    exam_summaries = []
    for e in class_exams:
        e_attempts = [a for a in attempts if a.exam_id == e.id]
        e_scored = [a.score for a in e_attempts if a.score is not None]
        e_avg = round(sum(e_scored) / len(e_scored), 2) if e_scored else None
        exam_summaries.append({
            "id": e.id,
            "title": e.title,
            "status": e.status,
            "submissions_count": len(e_attempts),
            "average_score": e_avg
        })

    return {
        "class_name": class_room.name,
        "enrolled_count": enrolled_count,
        "total_exams": len(class_exams),
        "total_attempts": len(attempts),
        "average_score": average_score,
        "completion_rate": completion_rate,
        "violation_breakdown": violation_breakdown,
        "exams": exam_summaries
    }
