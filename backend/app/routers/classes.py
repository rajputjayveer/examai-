import os
import tempfile
import pandas as pd
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

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
from app.schemas.class_room import (
    ClassCreate, ClassResponse, EnrollmentResponse
)
from app.services.email_service import send_email

router = APIRouter()

class StudentEmailItem(BaseModel):
    email: Optional[str] = None
    emails: Optional[List[str]] = None

class CoTeacherItem(BaseModel):
    email: str

def verify_teacher_class_access(class_id: int, teacher_id: int, db: Session) -> ClassRoom:
    """Verify that a class exists and that the logged-in teacher is either the owner or a co-teacher."""
    class_room = db.query(ClassRoom).filter(ClassRoom.id == class_id).first()
    if not class_room:
        raise HTTPException(status_code=404, detail="Class not found")

    if class_room.teacher_id == teacher_id:
        return class_room

    is_co_teacher = db.query(ClassTeacher).filter(
        ClassTeacher.class_id == class_id,
        ClassTeacher.teacher_id == teacher_id
    ).first()

    if not is_co_teacher:
        raise HTTPException(status_code=403, detail="You do not have permission to access or manage this class.")

    return class_room


@router.post("", response_model=ClassResponse)
def create_class(
    class_in: ClassCreate,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """Create a new class owned by the logged-in teacher."""
    new_class = ClassRoom(
        name=class_in.name,
        teacher_id=current_user.id
    )
    db.add(new_class)
    db.commit()
    db.refresh(new_class)
    return {
        "id": new_class.id,
        "name": new_class.name,
        "teacher_id": new_class.teacher_id,
        "created_at": new_class.created_at,
        "student_count": 0
    }


@router.get("", response_model=List[ClassResponse])
def list_classes(
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """List all classes owned by or shared with the logged-in teacher."""
    # Owned classes
    owned_classes = db.query(ClassRoom).filter(ClassRoom.teacher_id == current_user.id).all()
    
    # Shared / co-teacher classes
    co_teacher_assignments = db.query(ClassTeacher).filter(ClassTeacher.teacher_id == current_user.id).all()
    shared_class_ids = [ct.class_id for ct in co_teacher_assignments]
    shared_classes = db.query(ClassRoom).filter(ClassRoom.id.in_(shared_class_ids)).all() if shared_class_ids else []

    all_classes_map = {c.id: c for c in owned_classes + shared_classes}
    sorted_classes = sorted(all_classes_map.values(), key=lambda c: c.created_at, reverse=True)

    response_list = []
    for c in sorted_classes:
        active_count = db.query(Enrollment).filter(
            Enrollment.class_id == c.id,
            Enrollment.status == "active"
        ).count()
        response_list.append({
            "id": c.id,
            "name": c.name,
            "teacher_id": c.teacher_id,
            "created_at": c.created_at,
            "student_count": active_count
        })
    return response_list


@router.get("/{class_id}", response_model=ClassResponse)
def get_class(
    class_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    class_room = verify_teacher_class_access(class_id, current_user.id, db)
    active_count = db.query(Enrollment).filter(
        Enrollment.class_id == class_room.id,
        Enrollment.status == "active"
    ).count()
    return {
        "id": class_room.id,
        "name": class_room.name,
        "teacher_id": class_room.teacher_id,
        "created_at": class_room.created_at,
        "student_count": active_count
    }


@router.delete("/{class_id}")
def delete_class(
    class_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """Delete a class and associated enrollments/invitations."""
    class_room = verify_teacher_class_access(class_id, current_user.id, db)
    db.delete(class_room)
    db.commit()
    return {"detail": "Class deleted successfully."}


@router.post("/{class_id}/co-teachers")
def add_co_teacher(
    class_id: int,
    payload: CoTeacherItem,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """Share a class with another teacher (co-teacher)."""
    class_room = verify_teacher_class_access(class_id, current_user.id, db)
    
    target_email = payload.email.strip().lower()
    co_teacher = db.query(User).filter(User.email == target_email, User.role == "teacher").first()
    if not co_teacher:
        raise HTTPException(status_code=404, detail="No registered instructor account found with that email.")

    if co_teacher.id == class_room.teacher_id:
        raise HTTPException(status_code=400, detail="This instructor is already the primary owner of the class.")

    existing = db.query(ClassTeacher).filter(
        ClassTeacher.class_id == class_id,
        ClassTeacher.teacher_id == co_teacher.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="This instructor is already a co-teacher for this class.")

    new_co_teacher = ClassTeacher(
        class_id=class_id,
        teacher_id=co_teacher.id
    )
    db.add(new_co_teacher)
    db.commit()

    send_email(
        co_teacher.email,
        f"Shared Class Access: {class_room.name}",
        f"Hello {co_teacher.name},\n\nProf. {current_user.name} has shared access to class '{class_room.name}' with you on SecureExam AI."
    )

    return {"detail": f"Class shared with {co_teacher.name} ({co_teacher.email}) successfully."}


@router.get("/{class_id}/co-teachers")
def list_co_teachers(
    class_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """List all co-teachers for a class."""
    class_room = verify_teacher_class_access(class_id, current_user.id, db)
    assignments = db.query(ClassTeacher).filter(ClassTeacher.class_id == class_id).all()
    
    result = []
    for ct in assignments:
        teacher_user = db.query(User).filter(User.id == ct.teacher_id).first()
        if teacher_user:
            result.append({
                "id": ct.id,
                "teacher_id": teacher_user.id,
                "name": teacher_user.name,
                "email": teacher_user.email
            })
    return result


@router.delete("/{class_id}/co-teachers/{teacher_id}")
def remove_co_teacher(
    class_id: int,
    teacher_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """Remove a co-teacher from a class."""
    class_room = verify_teacher_class_access(class_id, current_user.id, db)
    assignment = db.query(ClassTeacher).filter(
        ClassTeacher.class_id == class_id,
        ClassTeacher.teacher_id == teacher_id
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Co-teacher assignment not found.")

    db.delete(assignment)
    db.commit()
    return {"detail": "Co-teacher removed successfully."}


class StudentEnrollItem(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    emails: Optional[List[str]] = None
    students: Optional[List[dict]] = None

def _derive_name(raw_name: Optional[str], email: str) -> str:
    if raw_name and str(raw_name).strip() and str(raw_name).strip().lower() != 'nan':
        return str(raw_name).strip()
    
    local_part = email.split('@')[0]
    parts = [p.capitalize() for p in local_part.replace('.', ' ').replace('_', ' ').replace('-', ' ').split()]
    return ' '.join(parts) if parts else local_part.capitalize()

@router.get("/{class_id}/students")
def list_class_students(
    class_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """List all enrolled students and pending registration invitations for a class."""
    class_room = verify_teacher_class_access(class_id, current_user.id, db)
        
    enrollments = db.query(Enrollment).filter(
        Enrollment.class_id == class_id,
        Enrollment.status == "active"
    ).all()

    result = []
    for enr in enrollments:
        student = db.query(User).filter(User.id == enr.student_id).first()
        result.append({
            "id": enr.id,
            "class_id": enr.class_id,
            "student_id": enr.student_id,
            "student_name": student.name if student else _derive_name(None, student.email if student else ""),
            "student_email": student.email if student else "Unknown",
            "enrolled_at": enr.enrolled_at,
            "status": enr.status
        })

    # Include pending invitations for unregistered students with their teacher-provided or derived name
    pending_list = db.query(PendingEnrollment).filter(PendingEnrollment.class_id == class_id).all()
    for p in pending_list:
        display_name = p.student_name if p.student_name else _derive_name(None, p.email)
        result.append({
            "id": -p.id, # negative ID for key distinction
            "class_id": p.class_id,
            "student_id": None,
            "student_name": display_name,
            "student_email": p.email,
            "enrolled_at": p.created_at,
            "status": "pending_registration"
        })

    return result


def _enroll_item_list(class_room: ClassRoom, items: List[dict], teacher: User, db: Session):
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
            
        student = db.query(User).filter(User.email == email, User.role == "student").first()
        if not student:
            # Student not registered yet: create/update PendingEnrollment with name and send invitation email
            existing_pending = db.query(PendingEnrollment).filter(
                PendingEnrollment.class_id == class_room.id,
                PendingEnrollment.email == email
            ).first()

            if not existing_pending:
                new_pending = PendingEnrollment(
                    class_id=class_room.id,
                    email=email,
                    student_name=student_name,
                    invited_by_id=teacher.id
                )
                db.add(new_pending)
                db.commit()
            else:
                if student_name and existing_pending.student_name != student_name:
                    existing_pending.student_name = student_name
                    db.commit()

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

        # Student user exists
        # Remove any leftover pending invitation
        db.query(PendingEnrollment).filter(
            PendingEnrollment.class_id == class_room.id,
            PendingEnrollment.email == email
        ).delete()

        enrollment = db.query(Enrollment).filter(
            Enrollment.class_id == class_room.id,
            Enrollment.student_id == student.id
        ).first()

        if enrollment:
            if enrollment.status == "removed":
                enrollment.status = "active"
                db.commit()
                added.append({"email": email, "name": student.name, "status": "re-activated"})
                send_email(
                    student.email,
                    f"Added to Class: {class_room.name}",
                    f"Hello {student.name},\n\nYou have been added back to class '{class_room.name}' by {teacher.name}."
                )
            else:
                errors.append(f"{email}: Already actively enrolled in this class.")
        else:
            new_enrollment = Enrollment(
                class_id=class_room.id,
                student_id=student.id,
                status="active"
            )
            db.add(new_enrollment)
            db.commit()
            added.append({"email": email, "name": student.name, "status": "enrolled"})
            send_email(
                student.email,
                f"Added to Class: {class_room.name}",
                f"Hello {student.name},\n\nYou've been added to {class_room.name} by {teacher.name}."
            )

    return {"added": added, "errors": errors}


@router.post("/{class_id}/students")
def enroll_students(
    class_id: int,
    payload: StudentEnrollItem,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """Enroll student(s) into class by email or issue pending invitation with optional student name."""
    class_room = verify_teacher_class_access(class_id, current_user.id, db)

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

    return _enroll_item_list(class_room, items, current_user, db)


@router.post("/{class_id}/students/upload")
def bulk_upload_roster(
    class_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """Bulk enroll students from a CSV or Excel file containing email and optional student_name columns."""
    class_room = verify_teacher_class_access(class_id, current_user.id, db)

    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(file.file.read())
        temp_path = temp_file.name

    try:
        if temp_path.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(temp_path)
        else:
            df = pd.read_csv(temp_path)
            
        df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
        
        email_col = None
        for candidate in ["email", "student_email", "mail", "user_email"]:
            if candidate in df.columns:
                email_col = candidate
                break

        if not email_col:
            raise HTTPException(status_code=400, detail="File must contain an 'email' or 'student_email' column.")

        name_col = None
        for candidate in ["student_name", "name", "full_name", "student"]:
            if candidate in df.columns:
                name_col = candidate
                break

        items = []
        for _, row in df.iterrows():
            em = str(row[email_col]).strip() if pd.notna(row[email_col]) else ""
            nm = str(row[name_col]).strip() if name_col and pd.notna(row[name_col]) else None
            if em:
                items.append({"email": em, "name": nm})

        return _enroll_item_list(class_room, items, current_user, db)
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=f"Failed to process file: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.delete("/{class_id}/students/{student_id}")
def remove_student_from_class(
    class_id: int,
    student_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """Remove student from class (or cancel pending invitation if negative ID)."""
    class_room = verify_teacher_class_access(class_id, current_user.id, db)

    if student_id < 0:
        # Cancel pending invitation
        pending_id = -student_id
        pending = db.query(PendingEnrollment).filter(
            PendingEnrollment.id == pending_id,
            PendingEnrollment.class_id == class_id
        ).first()
        if pending:
            db.delete(pending)
            db.commit()
            return {"detail": "Pending invitation cancelled."}
        raise HTTPException(status_code=404, detail="Pending invitation not found.")

    enrollment = db.query(Enrollment).filter(
        Enrollment.class_id == class_id,
        Enrollment.student_id == student_id,
        Enrollment.status == "active"
    ).first()

    if not enrollment:
        raise HTTPException(status_code=404, detail="Active student enrollment not found in this class.")

    enrollment.status = "removed"
    db.commit()
    return {"detail": "Student removed from class successfully."}


@router.get("/{class_id}/analytics")
def get_class_analytics(
    class_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """Return aggregate statistics for all exams in this class."""
    class_room = verify_teacher_class_access(class_id, current_user.id, db)

    enrolled_students = db.query(Enrollment).filter(
        Enrollment.class_id == class_id,
        Enrollment.status == "active"
    ).all()
    enrolled_count = len(enrolled_students)

    class_exams = db.query(Exam).filter(Exam.class_id == class_id).all()
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

    attempts = db.query(Attempt).filter(
        Attempt.exam_id.in_(exam_ids),
        Attempt.status.in_(["submitted", "graded"])
    ).all()

    scored = [a.score for a in attempts if a.score is not None]
    average_score = round(sum(scored) / len(scored), 2) if scored else None

    total_possible = enrolled_count * len(class_exams)
    completion_rate = round((len(attempts) / total_possible) * 100, 1) if total_possible > 0 else 0.0

    attempt_ids = [a.id for a in attempts]
    violation_breakdown = {}
    if attempt_ids:
        violation_rows = db.query(Violation).filter(Violation.attempt_id.in_(attempt_ids)).all()
        for v in violation_rows:
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
