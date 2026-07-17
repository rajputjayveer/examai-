from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User
from app.models.attempt import Attempt
from app.models.exam import Exam
from app.models.question import Question
from app.models.answer import Answer
from app.schemas.attempt import AttemptResponse, AnswerCreate, AnswerResponse

router = APIRouter()

@router.post("/start", response_model=AttemptResponse)
def start_attempt(
    exam_id: int,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    # Check if ongoing attempt exists
    existing_attempt = db.query(Attempt).filter(
        Attempt.exam_id == exam_id,
        Attempt.student_id == current_user.id
    ).first()
    
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
    db.commit()
    db.refresh(attempt)
    return attempt

@router.post("/{attempt_id}/answer", response_model=AnswerResponse)
def submit_answer(
    attempt_id: int,
    answer_in: AnswerCreate,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id, Attempt.student_id == current_user.id).first()
    if not attempt or attempt.status != "ongoing":
        raise HTTPException(status_code=400, detail="Invalid attempt or attempt not open")
        
    # Upsert answer
    db_answer = db.query(Answer).filter(
        Answer.attempt_id == attempt_id,
        Answer.question_id == answer_in.question_id
    ).first()
    
    if db_answer:
        db_answer.selected_option = answer_in.selected_option
    else:
        db_answer = Answer(
            attempt_id=attempt_id,
            question_id=answer_in.question_id,
            selected_option=answer_in.selected_option
        )
        db.add(db_answer)
        
    db.commit()
    db.refresh(db_answer)
    return db_answer

@router.post("/{attempt_id}/submit", response_model=AttemptResponse)
def submit_attempt(
    attempt_id: int,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id, Attempt.student_id == current_user.id).first()
    if not attempt or attempt.status != "ongoing":
        raise HTTPException(status_code=400, detail="Invalid attempt or already submitted")
        
    attempt.submitted_at = datetime.utcnow()
    attempt.status = "submitted"
    
    # We can run auto-evaluation here if correct options are already filled
    # Calculate score
    questions = db.query(Question).filter(Question.exam_id == attempt.exam_id).all()
    correct_answers = {q.id: q.correct_option for q in questions if q.correct_option is not None}
    
    if len(correct_answers) == len(questions) and len(questions) > 0:
        student_answers = db.query(Answer).filter(Answer.attempt_id == attempt_id).all()
        score = 0.0
        for ans in student_answers:
            if correct_answers.get(ans.question_id) == ans.selected_option:
                score += 1.0
        attempt.score = score
        attempt.status = "graded"
        
    db.commit()
    db.refresh(attempt)
    return attempt


from app.schemas.exam import QuestionResponse

@router.get("/{attempt_id}/questions")
def get_attempt_questions(
    attempt_id: int,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    """Fetch the exam attempt and related questions to render inside the Exam Room."""
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id, Attempt.student_id == current_user.id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    exam = db.query(Exam).filter(Exam.id == attempt.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    questions = db.query(Question).filter(Question.exam_id == exam.id).order_by(Question.order_index).all()
    
    return {
        "attempt": {
            "id": attempt.id,
            "exam_id": attempt.exam_id,
            "student_id": attempt.student_id,
            "started_at": attempt.started_at,
            "end_at": exam.end_at, # Ends when exam closes
            "status": attempt.status
        },
        "questions": [
            {
                "id": q.id,
                "exam_id": q.exam_id,
                "text": q.text,
                "option_a": q.option_a,
                "option_b": q.option_b,
                "option_c": q.option_c,
                "option_d": q.option_d,
                "order_index": q.order_index
            } for q in questions
        ]
    }

