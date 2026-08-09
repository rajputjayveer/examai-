import os
import secrets
import tempfile
from typing import List
from datetime import datetime, timedelta
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.core.config import settings
from app.models.user import User
from app.models.class_room import ClassRoom
from app.models.enrollment import Enrollment
from app.models.exam import Exam
from app.models.exam_access_token import ExamAccessToken
from app.models.question import Question
from app.models.attempt import Attempt
from app.models.answer import Answer
from app.schemas.exam import ExamCreate, ExamResponse, QuestionCreate, QuestionResponse, ExamDetailResponse
from app.services.email_service import send_email

router = APIRouter()


@router.get("/templates/questions")
def download_question_template():
    # File download — kept as sync def (no DB, just file I/O)
    template_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
        "ExamGuardAI_Question_Import_Template.xlsx"
    )
    if not os.path.exists(template_path):
        raise HTTPException(status_code=404, detail="Template file not found")
    return FileResponse(
        template_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="ExamGuardAI_Question_Import_Template.xlsx"
    )


@router.get("/join/{token}")
async def join_exam_via_token(token: str, db: AsyncSession = Depends(get_db)):
    """Validate exam access token and return target exam_id for frontend deep linking."""
    result = await db.execute(
        select(ExamAccessToken).where(ExamAccessToken.token == token)
    )
    token_entry = result.scalar_one_or_none()
    if not token_entry:
        raise HTTPException(status_code=404, detail="Invalid exam access token.")

    if datetime.utcnow() > token_entry.expires_at:
        raise HTTPException(status_code=400, detail="Exam access token has expired.")

    return {
        "exam_id": token_entry.exam_id,
        "student_id": token_entry.student_id,
        "valid": True
    }


@router.get("", response_model=List[ExamResponse])
async def list_exams(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role == "teacher":
        result = await db.execute(
            select(Exam).where(Exam.teacher_id == current_user.id)
        )
        return result.scalars().all()

    # Student view: published global exams + enrolled class exams
    enr_result = await db.execute(
        select(Enrollment).where(
            Enrollment.student_id == current_user.id,
            Enrollment.status == "active"
        )
    )
    active_class_ids = [enr.class_id for enr in enr_result.scalars().all()]

    q = select(Exam).where(Exam.status == "published")
    if active_class_ids:
        from sqlalchemy import or_
        q = q.where(or_(Exam.class_id.is_(None), Exam.class_id.in_(active_class_ids)))
    else:
        q = q.where(Exam.class_id.is_(None))

    exams_result = await db.execute(q)
    exams = exams_result.scalars().all()

    att_result = await db.execute(
        select(Attempt).where(Attempt.student_id == current_user.id)
    )
    user_attempts = att_result.scalars().all()
    attempt_map = {att.exam_id: att.status for att in user_attempts}
    attempt_id_map = {att.exam_id: att.id for att in user_attempts}
    attempt_score_map = {att.exam_id: att.score for att in user_attempts}

    response_data = []
    for e in exams:
        status_val = attempt_map.get(e.id)
        has_submitted = status_val in ["submitted", "graded"]

        count_result = await db.execute(
            select(func.count(Question.id)).where(Question.exam_id == e.id)
        )
        total_questions = count_result.scalar()

        response_data.append({
            "id": e.id,
            "teacher_id": e.teacher_id,
            "class_id": e.class_id,
            "visibility": e.visibility or ("class" if e.class_id else "global"),
            "title": e.title,
            "duration_minutes": e.duration_minutes,
            "start_at": e.start_at,
            "end_at": e.end_at,
            "status": e.status,
            "created_at": e.created_at,
            "user_has_submitted": has_submitted,
            "user_attempt_id": attempt_id_map.get(e.id),
            "user_score": attempt_score_map.get(e.id),
            "total_marks": total_questions
        })
    return response_data


@router.post("", response_model=ExamResponse)
async def create_exam(
    exam_in: ExamCreate,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    if exam_in.class_id:
        cr_result = await db.execute(
            select(ClassRoom).where(
                ClassRoom.id == exam_in.class_id,
                ClassRoom.teacher_id == current_user.id
            )
        )
        if not cr_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Invalid class_id or you do not own this class.")

    visibility_val = "class" if exam_in.class_id else "global"
    exam = Exam(
        teacher_id=current_user.id,
        class_id=exam_in.class_id,
        visibility=visibility_val,
        title=exam_in.title,
        duration_minutes=exam_in.duration_minutes,
        start_at=exam_in.start_at,
        end_at=exam_in.end_at,
        status="draft"
    )
    db.add(exam)
    await db.commit()
    await db.refresh(exam)
    return exam


@router.get("/{exam_id}", response_model=ExamDetailResponse)
async def get_exam(
    exam_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


@router.put("/{exam_id}", response_model=ExamResponse)
async def update_exam(
    exam_id: int,
    exam_in: ExamCreate,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Exam).where(Exam.id == exam_id, Exam.teacher_id == current_user.id)
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.status == "published":
        raise HTTPException(status_code=400, detail="Cannot edit a published exam")

    if exam_in.class_id:
        cr_result = await db.execute(
            select(ClassRoom).where(
                ClassRoom.id == exam_in.class_id,
                ClassRoom.teacher_id == current_user.id
            )
        )
        if not cr_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Invalid class_id or you do not own this class.")

    exam.class_id = exam_in.class_id
    exam.visibility = "class" if exam_in.class_id else "global"
    exam.title = exam_in.title
    exam.duration_minutes = exam_in.duration_minutes
    exam.start_at = exam_in.start_at
    exam.end_at = exam_in.end_at
    await db.commit()
    await db.refresh(exam)
    return exam


@router.post("/{exam_id}/publish", response_model=ExamResponse)
async def publish_exam(
    exam_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Exam).where(Exam.id == exam_id, Exam.teacher_id == current_user.id)
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    exam.status = "published"
    await db.commit()
    await db.refresh(exam)

    # Determine recipients
    if exam.class_id:
        enr_result = await db.execute(
            select(Enrollment).where(
                Enrollment.class_id == exam.class_id,
                Enrollment.status == "active"
            )
        )
        student_ids = list({enr.student_id for enr in enr_result.scalars().all()})
    else:
        cr_result = await db.execute(
            select(ClassRoom).where(ClassRoom.teacher_id == current_user.id)
        )
        teacher_class_ids = [c.id for c in cr_result.scalars().all()]
        if teacher_class_ids:
            enr_result = await db.execute(
                select(Enrollment).where(
                    Enrollment.class_id.in_(teacher_class_ids),
                    Enrollment.status == "active"
                )
            )
            student_ids = list({enr.student_id for enr in enr_result.scalars().all()})
        else:
            student_ids = []

    if student_ids:
        rec_result = await db.execute(
            select(User).where(User.id.in_(student_ids))
        )
        recipients = rec_result.scalars().all()
    else:
        recipients = []

    now = datetime.utcnow()
    seven_days = now + timedelta(days=7)
    expires_at = exam.end_at if exam.end_at < seven_days else seven_days

    for student in recipients:
        raw_token = secrets.token_urlsafe(32)
        access_token = ExamAccessToken(
            exam_id=exam.id,
            student_id=student.id,
            token=raw_token,
            expires_at=expires_at
        )
        db.add(access_token)
        join_link = f"{settings.FRONTEND_BASE_URL}/join-exam?token={raw_token}"
        send_email(
            student.email,
            f"New exam: {exam.title}",
            f"Hello {student.name},\n\nA new exam '{exam.title}' has been published by your instructor {current_user.name}.\n\nAccess link: {join_link}\n\nNote: You will be required to log in and complete face verification to enter."
        )

    await db.commit()
    return exam


@router.post("/{exam_id}/questions", response_model=List[QuestionResponse])
async def add_questions(
    exam_id: int,
    questions_in: List[QuestionCreate],
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Exam).where(Exam.id == exam_id, Exam.teacher_id == current_user.id)
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Delete existing questions
    existing_q_result = await db.execute(
        select(Question).where(Question.exam_id == exam_id)
    )
    for q in existing_q_result.scalars().all():
        await db.delete(q)
    await db.commit()

    added_questions = []
    for idx, q_in in enumerate(questions_in):
        q = Question(
            exam_id=exam_id,
            text=q_in.text,
            option_a=q_in.option_a,
            option_b=q_in.option_b,
            option_c=q_in.option_c,
            option_d=q_in.option_d,
            correct_option=q_in.correct_option,
            order_index=idx
        )
        db.add(q)
        added_questions.append(q)

    await db.commit()
    for q in added_questions:
        await db.refresh(q)
    return added_questions


@router.get("/{exam_id}/questions", response_model=List[QuestionResponse])
async def get_questions(
    exam_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Exam not found")

    q_result = await db.execute(
        select(Question)
        .where(Question.exam_id == exam_id)
        .order_by(Question.order_index)
    )
    return q_result.scalars().all()


class AnswerKeyEntry(BaseModel):
    question_id: int
    correct_option: str


@router.post("/{exam_id}/answer-key")
async def review_and_correct_answers(
    exam_id: int,
    entries: List[AnswerKeyEntry],
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Exam).where(Exam.id == exam_id, Exam.teacher_id == current_user.id)
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    changed = False
    for entry in entries:
        q_result = await db.execute(
            select(Question).where(
                Question.id == entry.question_id,
                Question.exam_id == exam_id
            )
        )
        question = q_result.scalar_one_or_none()
        if question and question.correct_option != entry.correct_option:
            question.correct_option = entry.correct_option
            changed = True

    if changed:
        await db.commit()
        all_q_result = await db.execute(
            select(Question).where(Question.exam_id == exam_id)
        )
        questions = all_q_result.scalars().all()
        correct_map = {q.id: q.correct_option for q in questions if q.correct_option}

        att_result = await db.execute(
            select(Attempt).where(
                Attempt.exam_id == exam_id,
                Attempt.status.in_(["submitted", "graded"])
            )
        )
        attempts = att_result.scalars().all()
        for attempt in attempts:
            ans_result = await db.execute(
                select(Answer).where(Answer.attempt_id == attempt.id)
            )
            student_answers = ans_result.scalars().all()
            attempt.score = sum(
                1.0 for a in student_answers
                if correct_map.get(a.question_id) == a.selected_option
            )
            attempt.status = "graded"
        await db.commit()

    return {"detail": "Corrections applied and affected attempts re-evaluated."}


@router.post("/upload-pdf")
async def upload_pdf_exam(
    file: UploadFile = File(...),
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    from app.services.pdf_parser_service import parse_pdf_questions
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(await file.read())
        temp_path = temp_file.name
    try:
        questions = parse_pdf_questions(temp_path)
        return {"questions": questions}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.post("/upload-sheet")
async def upload_sheet_exam(
    file: UploadFile = File(...),
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    from app.services.csv_parser_service import parse_csv_questions
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(await file.read())
        temp_path = temp_file.name
    try:
        questions = parse_csv_questions(temp_path)
        return {"questions": questions}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
