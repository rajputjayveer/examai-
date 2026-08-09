import asyncio
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User
from app.models.attempt import Attempt
from app.models.exam import Exam
from app.models.question import Question
from app.models.answer import Answer
from app.models.enrollment import Enrollment
from app.schemas.attempt import AttemptResponse, AnswerCreate, AnswerResponse

router = APIRouter()


@router.post("/start", response_model=AttemptResponse)
async def start_attempt(
    exam_id: int,
    current_user: User = Depends(RoleChecker(["student"])),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Fix #3: Block access to unpublished / draft exams
    if exam.status != "published":
        raise HTTPException(status_code=403, detail="This exam is not available yet.")

    if exam.class_id is not None:
        enr_result = await db.execute(
            select(Enrollment).where(
                Enrollment.class_id == exam.class_id,
                Enrollment.student_id == current_user.id,
                Enrollment.status == "active"
            )
        )
        enrollment = enr_result.scalar_one_or_none()
        if not enrollment:
            raise HTTPException(status_code=403, detail="You are not actively enrolled in the class for this exam.")

    # Check if an attempt already exists
    existing_result = await db.execute(
        select(Attempt).where(
            Attempt.exam_id == exam_id,
            Attempt.student_id == current_user.id
        )
    )
    existing_attempt = existing_result.scalar_one_or_none()

    if existing_attempt:
        if existing_attempt.status in ["submitted", "graded"]:
            raise HTTPException(status_code=400, detail="You have already submitted this exam.")
        return existing_attempt

    attempt = Attempt(
        exam_id=exam_id,
        student_id=current_user.id,
        status="ongoing"
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return attempt


@router.post("/{attempt_id}/answer", response_model=AnswerResponse)
async def submit_answer(
    attempt_id: int,
    answer_in: AnswerCreate,
    current_user: User = Depends(RoleChecker(["student"])),
    db: AsyncSession = Depends(get_db)
):
    att_result = await db.execute(
        select(Attempt).where(
            Attempt.id == attempt_id,
            Attempt.student_id == current_user.id
        )
    )
    attempt = att_result.scalar_one_or_none()
    if not attempt or attempt.status != "ongoing":
        raise HTTPException(status_code=400, detail="Invalid attempt or attempt not open")

    # Fix #4 (part 1): Block answer saves after time expiry
    if attempt.started_at:
        exam_result = await db.execute(select(Exam).where(Exam.id == attempt.exam_id))
        exam = exam_result.scalar_one_or_none()
        if exam and exam.duration_minutes:
            deadline = attempt.started_at + timedelta(minutes=exam.duration_minutes)
            if datetime.utcnow() > deadline:
                # Auto-submit with whatever answers exist — server enforces the deadline
                await _auto_submit_timed_out(attempt, db)
                raise HTTPException(
                    status_code=400,
                    detail="Exam time has expired. Your answers have been automatically submitted."
                )

    # Upsert answer
    ans_result = await db.execute(
        select(Answer).where(
            Answer.attempt_id == attempt_id,
            Answer.question_id == answer_in.question_id
        )
    )
    db_answer = ans_result.scalar_one_or_none()

    if db_answer:
        db_answer.selected_option = answer_in.selected_option
    else:
        db_answer = Answer(
            attempt_id=attempt_id,
            question_id=answer_in.question_id,
            selected_option=answer_in.selected_option
        )
        db.add(db_answer)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        # Re-fetch on race condition
        ans_result2 = await db.execute(
            select(Answer).where(
                Answer.attempt_id == attempt_id,
                Answer.question_id == answer_in.question_id
            )
        )
        db_answer = ans_result2.scalar_one_or_none()
        if db_answer:
            db_answer.selected_option = answer_in.selected_option
            await db.commit()

    await db.refresh(db_answer)
    return db_answer


async def _auto_submit_timed_out(attempt: Attempt, db: AsyncSession):
    """Auto-grade and submit an attempt whose time has expired on the server side."""
    if attempt.status != "ongoing":
        return  # Already submitted

    attempt.submitted_at = datetime.utcnow()
    attempt.status = "submitted"

    q_result = await db.execute(select(Question).where(Question.exam_id == attempt.exam_id))
    questions = q_result.scalars().all()
    correct_answers = {q.id: q.correct_option for q in questions if q.correct_option is not None}

    if len(correct_answers) == len(questions) and len(questions) > 0:
        ans_result = await db.execute(select(Answer).where(Answer.attempt_id == attempt.id))
        student_answers = ans_result.scalars().all()
        score = sum(
            1.0 for ans in student_answers
            if correct_answers.get(ans.question_id) == ans.selected_option
        )
        attempt.score = score
        attempt.status = "graded"

    await db.commit()


@router.post("/{attempt_id}/submit", response_model=AttemptResponse)
async def submit_attempt(
    attempt_id: int,
    current_user: User = Depends(RoleChecker(["student"])),
    db: AsyncSession = Depends(get_db)
):
    att_result = await db.execute(
        select(Attempt).where(
            Attempt.id == attempt_id,
            Attempt.student_id == current_user.id
        )
    )
    attempt = att_result.scalar_one_or_none()
    if not attempt or attempt.status != "ongoing":
        raise HTTPException(status_code=400, detail="Invalid attempt or already submitted")

    attempt.submitted_at = datetime.utcnow()
    attempt.status = "submitted"

    # Auto-grade if all correct answers are set
    q_result = await db.execute(select(Question).where(Question.exam_id == attempt.exam_id))
    questions = q_result.scalars().all()
    correct_answers = {q.id: q.correct_option for q in questions if q.correct_option is not None}

    if len(correct_answers) == len(questions) and len(questions) > 0:
        ans_result = await db.execute(select(Answer).where(Answer.attempt_id == attempt_id))
        student_answers = ans_result.scalars().all()
        score = sum(
            1.0 for ans in student_answers
            if correct_answers.get(ans.question_id) == ans.selected_option
        )
        attempt.score = score
        attempt.status = "graded"

    await db.commit()
    await db.refresh(attempt)
    return attempt


@router.get("/{attempt_id}/questions")
async def get_attempt_questions(
    attempt_id: int,
    current_user: User = Depends(RoleChecker(["student"])),
    db: AsyncSession = Depends(get_db)
):
    """Fetch the exam attempt and related questions to render inside the Exam Room."""
    att_result, = await asyncio.gather(
        db.execute(select(Attempt).where(
            Attempt.id == attempt_id,
            Attempt.student_id == current_user.id
        ))
    )
    attempt = att_result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    exam_result, q_result = await asyncio.gather(
        db.execute(select(Exam).where(Exam.id == attempt.exam_id)),
        db.execute(
            select(Question)
            .where(Question.exam_id == attempt.exam_id)
            .order_by(Question.order_index)
        )
    )
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    questions = list(q_result.scalars().all())

    # Shuffle presentation order per student (stable across refreshes via attempt.id seed)
    rng = random.Random(attempt.id)
    rng.shuffle(questions)

    # Fix #12: Explicit whitelist — correct_option is NEVER sent to the student
    return {
        "attempt": {
            "id":           attempt.id,
            "exam_id":      attempt.exam_id,
            "student_id":   attempt.student_id,
            "started_at":   attempt.started_at,
            "end_at":       exam.end_at,
            "duration_minutes": exam.duration_minutes,  # let frontend know the limit too
            "status":       attempt.status,
        },
        "questions": [
            {
                "id":          q.id,
                "exam_id":     q.exam_id,
                "text":        q.text,
                "option_a":    q.option_a,
                "option_b":    q.option_b,
                "option_c":    q.option_c,
                "option_d":    q.option_d,
                "order_index": q.order_index,
                # correct_option is intentionally EXCLUDED — never sent to students
            } for q in questions
        ]
    }
