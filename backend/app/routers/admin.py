from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User
from app.models.attempt import Attempt
from app.models.exam import Exam
from app.models.violation import Violation

router = APIRouter()


@router.get("/users")
async def list_users(
    current_user: User = Depends(RoleChecker(["admin"])),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User))
    users = result.scalars().all()
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
async def delete_user(
    user_id: int,
    current_user: User = Depends(RoleChecker(["admin"])),
    db: AsyncSession = Depends(get_db)
):
    if user_id == 0:
        raise HTTPException(status_code=400, detail="Cannot delete virtual administrator account")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(user)
    await db.commit()
    return {"detail": "User deleted successfully"}


@router.get("/attempts")
async def list_all_attempts(
    current_user: User = Depends(RoleChecker(["admin"])),
    db: AsyncSession = Depends(get_db)
):
    att_result = await db.execute(select(Attempt))
    attempts = att_result.scalars().all()

    results = []
    for att in attempts:
        student_result = await db.execute(select(User).where(User.id == att.student_id))
        student = student_result.scalar_one_or_none()

        exam_result = await db.execute(select(Exam).where(Exam.id == att.exam_id))
        exam = exam_result.scalar_one_or_none()

        v_count_result = await db.execute(
            select(func.count(Violation.id)).where(Violation.attempt_id == att.id)
        )
        v_count = v_count_result.scalar()

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
