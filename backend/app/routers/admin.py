from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User
from app.models.attempt import Attempt
from app.models.exam import Exam
from app.models.violation import Violation

router = APIRouter()

@router.get("/users")
def list_users(
    current_user: User = Depends(RoleChecker(["admin"])),
    db: Session = Depends(get_db)
):
    users = db.query(User).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "is_verified": u.is_verified,
            "face_enrolled": u.face_enrolled,
            "created_at": u.created_at
        } for u in users
    ]

@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: User = Depends(RoleChecker(["admin"])),
    db: Session = Depends(get_db)
):
    if user_id == 0:
        raise HTTPException(status_code=400, detail="Cannot delete virtual administrator account")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    db.delete(user)
    db.commit()
    return {"detail": "User deleted successfully"}

@router.get("/attempts")
def list_all_attempts(
    current_user: User = Depends(RoleChecker(["admin"])),
    db: Session = Depends(get_db)
):
    attempts = db.query(Attempt).all()
    results = []
    for att in attempts:
        student = db.query(User).filter(User.id == att.student_id).first()
        exam = db.query(Exam).filter(Exam.id == att.exam_id).first()
        v_count = db.query(Violation).filter(Violation.attempt_id == att.id).count()
        results.append({
            "attempt_id": att.id,
            "student_name": student.name if student else "Unknown",
            "student_email": student.email if student else "Unknown",
            "exam_title": exam.title if exam else "Unknown",
            "score": att.score,
            "status": att.status,
            "violations_count": v_count,
            "submitted_at": att.submitted_at
        })
    return results
