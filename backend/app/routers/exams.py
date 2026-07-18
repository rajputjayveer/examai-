from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import FileResponse
import os

from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User
from app.models.exam import Exam
from app.models.question import Question
from app.models.attempt import Attempt
from app.models.answer import Answer
from app.schemas.exam import ExamCreate, ExamResponse, QuestionCreate, QuestionResponse, ExamDetailResponse

router = APIRouter()

@router.get("/templates/questions")
def download_question_template():
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

@router.get("", response_model=List[ExamResponse])
def list_exams(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "teacher":
        return db.query(Exam).filter(Exam.teacher_id == current_user.id).all()
    else:
        # Load published exams
        exams = db.query(Exam).filter(Exam.status == "published").all()
        # Find attempts for this user
        user_attempts = db.query(Attempt).filter(Attempt.student_id == current_user.id).all()
        attempt_map = {att.exam_id: att.status for att in user_attempts}
        attempt_id_map = {att.exam_id: att.id for att in user_attempts}
        attempt_score_map = {att.exam_id: att.score for att in user_attempts}
        
        response_data = []
        for e in exams:
            status_val = attempt_map.get(e.id)
            has_submitted = status_val in ["submitted", "graded"]
            
            # Count questions to know total marks possible
            total_questions = db.query(Question).filter(Question.exam_id == e.id).count()

            response_data.append({
                "id": e.id,
                "teacher_id": e.teacher_id,
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
def create_exam(
    exam_in: ExamCreate,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    exam = Exam(
        teacher_id=current_user.id,
        title=exam_in.title,
        duration_minutes=exam_in.duration_minutes,
        start_at=exam_in.start_at,
        end_at=exam_in.end_at,
        status="draft"
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam

@router.get("/{exam_id}", response_model=ExamDetailResponse)
def get_exam(
    exam_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam

@router.put("/{exam_id}", response_model=ExamResponse)
def update_exam(
    exam_id: int,
    exam_in: ExamCreate,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    exam = db.query(Exam).filter(Exam.id == exam_id, Exam.teacher_id == current_user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.status == "published":
        raise HTTPException(status_code=400, detail="Cannot edit a published exam")
        
    exam.title = exam_in.title
    exam.duration_minutes = exam_in.duration_minutes
    exam.start_at = exam_in.start_at
    exam.end_at = exam_in.end_at
    db.commit()
    db.refresh(exam)
    return exam

@router.post("/{exam_id}/publish", response_model=ExamResponse)
def publish_exam(
    exam_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    exam = db.query(Exam).filter(Exam.id == exam_id, Exam.teacher_id == current_user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    exam.status = "published"
    db.commit()
    db.refresh(exam)
    return exam

@router.post("/{exam_id}/questions", response_model=List[QuestionResponse])
def add_questions(
    exam_id: int,
    questions_in: List[QuestionCreate],
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    exam = db.query(Exam).filter(Exam.id == exam_id, Exam.teacher_id == current_user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    # Delete existing questions first to overwrite
    db.query(Question).filter(Question.exam_id == exam_id).delete()
    db.commit()

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
        
    db.commit()
    for q in added_questions:
        db.refresh(q)
    return added_questions

@router.get("/{exam_id}/questions", response_model=List[QuestionResponse])
def get_questions(
    exam_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Return questions for an exam — used by the AnswerKey builder UI."""
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return db.query(Question).filter(Question.exam_id == exam_id).order_by(Question.order_index).all()


class AnswerKeyItem(BaseModel if False else object):
    pass

from pydantic import BaseModel

class AnswerKeyEntry(BaseModel):
    question_id: int
    correct_option: str  # 'A', 'B', 'C', or 'D'

@router.post("/{exam_id}/answer-key")
def review_and_correct_answers(
    exam_id: int,
    entries: List[AnswerKeyEntry],
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """
    The answer key is already set at question creation time, so this endpoint
    is now a CORRECTION tool only — use it to void a disputed question
    (correct_option=None) or fix a typo'd key, then it re-evaluates any
    attempts already scored so nothing goes stale.
    """
    exam = db.query(Exam).filter(Exam.id == exam_id, Exam.teacher_id == current_user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    changed = False
    for entry in entries:
        question = db.query(Question).filter(
            Question.id == entry.question_id, Question.exam_id == exam_id
        ).first()
        if question and question.correct_option != entry.correct_option:
            question.correct_option = entry.correct_option
            changed = True

    if changed:
        db.commit()
        questions = db.query(Question).filter(Question.exam_id == exam_id).all()
        correct_map = {q.id: q.correct_option for q in questions if q.correct_option}

        attempts = db.query(Attempt).filter(
            Attempt.exam_id == exam_id, Attempt.status.in_(["submitted", "graded"])
        ).all()
        for attempt in attempts:
            student_answers = db.query(Answer).filter(Answer.attempt_id == attempt.id).all()
            attempt.score = sum(
                1.0 for a in student_answers if correct_map.get(a.question_id) == a.selected_option
            )
            attempt.status = "graded"
        db.commit()

    return {"detail": "Corrections applied and affected attempts re-evaluated."}


@router.post("/upload-pdf")
def upload_pdf_exam(
    file: UploadFile = File(...),
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    import tempfile
    import os
    from app.services.pdf_parser_service import parse_pdf_questions

    # Save to a temporary file
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(file.file.read())
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
def upload_sheet_exam(
    file: UploadFile = File(...),
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """Parse questions from a CSV or Excel file.

    Required columns: question, option_a, option_b, option_c, option_d, correct_option
    Returns the same {questions: [...]} shape as /upload-pdf so the frontend
    can feed both into the same review-before-save step.
    """
    import tempfile
    import os
    from app.services.csv_parser_service import parse_csv_questions

    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(file.file.read())
        temp_path = temp_file.name

    try:
        questions = parse_csv_questions(temp_path)
        return {"questions": questions}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
