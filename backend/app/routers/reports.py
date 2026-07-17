from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import os

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User
from app.models.attempt import Attempt
from app.models.exam import Exam
from app.models.violation import Violation
from app.models.question import Question
from app.models.answer import Answer
from app.services.pdf_service import generate_pdf_report

router = APIRouter()

STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage")

@router.get("/{attempt_id}")
def get_attempt_report(
    attempt_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    # Security check: only student who took it, or teacher can view
    if current_user.role == "student" and attempt.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    violations = db.query(Violation).filter(Violation.attempt_id == attempt_id).all()
    
    # Detailed answers
    answers = db.query(Answer).filter(Answer.attempt_id == attempt_id).all()
    questions = db.query(Question).filter(Question.exam_id == attempt.exam_id).all()
    
    q_map = {q.id: q for q in questions}
    
    detailed_answers = []
    for ans in answers:
        q = q_map.get(ans.question_id)
        detailed_answers.append({
            "question_id": ans.question_id,
            "question_text": q.text if q else "",
            "option_a": q.option_a if q else "",
            "option_b": q.option_b if q else "",
            "option_c": q.option_c if q else "",
            "option_d": q.option_d if q else "",
            "selected_option": ans.selected_option,
            "correct_option": q.correct_option if q else None
        })
        
    student = db.query(User).filter(User.id == attempt.student_id).first()
    exam = db.query(Exam).filter(Exam.id == attempt.exam_id).first()
    
    return {
        "attempt": {
            "id": attempt.id,
            "score": attempt.score,
            "status": attempt.status,
            "started_at": attempt.started_at,
            "submitted_at": attempt.submitted_at
        },
        "student_name": student.name if student else "Unknown",
        "exam_title": exam.title if exam else "Unknown",
        "violations": [
            {
                "id": v.id,
                "type": v.type,
                "evidence_path": v.evidence_path,
                "created_at": v.created_at
            } for v in violations
        ],
        "answers": detailed_answers
    }

@router.get("/{attempt_id}/pdf")
def download_pdf_report(
    attempt_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    if current_user.role == "student" and attempt.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    student = db.query(User).filter(User.id == attempt.student_id).first()
    exam = db.query(Exam).filter(Exam.id == attempt.exam_id).first()
    violations_count = db.query(Violation).filter(Violation.attempt_id == attempt_id).count()
    
    pdf_dir = os.path.join(STORAGE_DIR, "reports")
    os.makedirs(pdf_dir, exist_ok=True)
    pdf_path = os.path.join(pdf_dir, f"report_{attempt_id}.pdf")
    
    generate_pdf_report(
        pdf_path=pdf_path,
        candidate_name=student.name if student else "Unknown",
        exam_title=exam.title if exam else "Unknown",
        score=attempt.score or 0.0,
        violations_count=violations_count,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at
    )
    
    return FileResponse(pdf_path, media_type="application/pdf", filename=f"ExamGuard_Report_{attempt_id}.pdf")

@router.get("/teacher/exams/{exam_id}/results")
def get_exam_results(
    exam_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    exam = db.query(Exam).filter(Exam.id == exam_id, Exam.teacher_id == current_user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    attempts = db.query(Attempt).filter(Attempt.exam_id == exam_id).all()
    
    results = []
    for att in attempts:
        student = db.query(User).filter(User.id == att.student_id).first()
        v_count = db.query(Violation).filter(Violation.attempt_id == att.id).count()
        results.append({
            "attempt_id": att.id,
            "student_name": student.name if student else "Unknown",
            "score": att.score,
            "status": att.status,
            "violations_count": v_count,
            "submitted_at": att.submitted_at
        })
        
    return results
