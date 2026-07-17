from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File

from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User
from app.models.exam import Exam
from app.models.question import Question
from app.models.attempt import Attempt
from app.schemas.exam import ExamCreate, ExamResponse, QuestionCreate, QuestionResponse, ExamDetailResponse

router = APIRouter()

@router.get("", response_model=List[ExamResponse])
def list_exams(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "teacher":
        return db.query(Exam).filter(Exam.teacher_id == current_user.id).all()
    else:
        return db.query(Exam).filter(Exam.status == "published").all()

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

