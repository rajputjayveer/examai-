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
from app.core.config import settings

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
    
    # ── Gemini AI Report Insight Generation with Database Caching ─────────────
    is_student = (current_user.role == "student")
    cached_insight = attempt.student_insight if is_student else attempt.teacher_insight

    if cached_insight:
        ai_insight = cached_insight
    elif settings.GEMINI_API_KEY:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        
        try:
            # Model resolution with fallback to gemini-2.5-flash
            req_model = getattr(settings, 'GEMINI_MODEL', 'gemini-2.5-flash')
            try:
                model = genai.GenerativeModel(req_model)
            except Exception:
                model = genai.GenerativeModel("gemini-2.5-flash")

            wrong_count = len(questions) - (attempt.score or 0)
            viol_list = [v.type for v in violations]
            
            # Read recorded audio evidence clips (.webm) as inline bytes (bypasses upload_file SSL gRPC issues)
            audio_files = []
            for v in violations:
                if v.evidence_path and v.evidence_path.endswith('.webm'):
                    full_audio_path = os.path.join(STORAGE_DIR, v.evidence_path)
                    if os.path.exists(full_audio_path):
                        try:
                            with open(full_audio_path, "rb") as af:
                                audio_bytes = af.read()
                            if len(audio_bytes) > 0:
                                audio_files.append({
                                    "mime_type": "audio/webm",
                                    "data": audio_bytes
                                })
                        except Exception as read_err:
                            print(f"[Gemini Audio Read Error] {read_err}")

            if is_student:
                prompt = (
                    f"You are an academic mentor. A student named {student.name if student else 'Student'} "
                    f"has completed the exam '{exam.title if exam else 'Exam'}' scoring {attempt.score or 0} "
                    f"out of {len(questions)} (meaning {wrong_count} incorrect answers). They also had "
                    f"{len(violations)} proctoring warnings logged (warnings: {', '.join(viol_list)}). "
                    f"Provide a friendly, motivating 3-sentence summary highlighting what they got wrong, "
                    f"advice on their study gaps, and a polite reminder to maintain focus to avoid warnings."
                )
            else:
                prompt = (
                    f"You are an AI proctoring auditor. A candidate named {student.name if student else 'Candidate'} "
                    f"attempted the exam '{exam.title if exam else 'Exam'}'. They logged {len(violations)} "
                    f"violations (types: {', '.join(viol_list)}). "
                    f"{'The attached audio clip(s) contain speech evidence detected during the exam. Listen to the audio, summarize what was spoken, and state if they were asking for help or reading answers.' if audio_files else ''} "
                    f"Provide a professional, objective 3-sentence evaluation for the instructor classifying "
                    f"the cheating risk level (Low, Medium, High) and detailing violations like detected speech/voice, "
                    f"tab switches, looking away, or face mismatch incidents."
                )
                
            contents = audio_files + [prompt] if audio_files else prompt
            response = model.generate_content(contents)
            ai_insight = response.text.strip()

            # Cache the generated insight in database
            if is_student:
                attempt.student_insight = ai_insight
            else:
                attempt.teacher_insight = ai_insight
            db.commit()

        except Exception as ai_err:
            ai_insight = f"Could not generate live AI insights: {str(ai_err)}"
    else:
        # Default mock advice if API key is not present
        if is_student:
            ai_insight = "AI Tip: Try reviewing the incorrect topics. Ensure you keep your eyes focused on the screen to avoid face-tracking warnings next time."
        else:
            ai_insight = f"Proctor Audit: Candidate logged {len(violations)} warnings. cheater risk assessment level is low. Monitor tab visibility logs."

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
        "answers": detailed_answers,
        "total_questions": len(questions),
        "ai_insight": ai_insight
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
    violations = db.query(Violation).filter(Violation.attempt_id == attempt_id).all()
    total_questions = db.query(Question).filter(Question.exam_id == attempt.exam_id).count()
    
    pdf_dir = os.path.join(STORAGE_DIR, "reports")
    os.makedirs(pdf_dir, exist_ok=True)
    pdf_path = os.path.join(pdf_dir, f"report_{attempt_id}.pdf")
    
    generate_pdf_report(
        pdf_path=pdf_path,
        candidate_name=student.name if student else "Unknown",
        exam_title=exam.title if exam else "Unknown",
        score=attempt.score if attempt.score is not None else 0.0,
        total_questions=total_questions,
        violations=violations,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at
    )
    
    return FileResponse(pdf_path, media_type="application/pdf", filename=f"SecureExam_Report_{attempt_id}.pdf")

FLAG_FOR_REVIEW_THRESHOLD = 3

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
            "flagged_for_review": v_count >= FLAG_FOR_REVIEW_THRESHOLD,
            "submitted_at": att.submitted_at
        })

    results.sort(key=lambda r: (not r["flagged_for_review"], -r["violations_count"]))
    return results


@router.get("/teacher/exams/{exam_id}/analytics")
def get_exam_analytics(
    exam_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """Return class-level analytics for an exam: avg score, question difficulty,
    and violation type breakdown."""
    exam = db.query(Exam).filter(Exam.id == exam_id, Exam.teacher_id == current_user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    attempts = db.query(Attempt).filter(
        Attempt.exam_id == exam_id, Attempt.status.in_(["submitted", "graded"])
    ).all()
    questions = db.query(Question).filter(Question.exam_id == exam_id).order_by(Question.order_index).all()

    if not attempts:
        return {
            "average_score": None,
            "total_submissions": 0,
            "question_difficulty": [],
            "violation_breakdown": {}
        }

    attempt_ids = [a.id for a in attempts]
    scored = [a.score for a in attempts if a.score is not None]
    average_score = round(sum(scored) / len(scored), 2) if scored else None

    question_difficulty = []
    for q in questions:
        answers = db.query(Answer).filter(
            Answer.question_id == q.id, Answer.attempt_id.in_(attempt_ids)
        ).all()
        total = len(answers)
        wrong = sum(1 for a in answers if a.selected_option != q.correct_option) if q.correct_option else None
        question_difficulty.append({
            "question_id": q.id,
            "text": q.text,
            "percent_wrong": round((wrong / total) * 100, 1) if total and wrong is not None else None
        })

    violation_rows = db.query(Violation).filter(Violation.attempt_id.in_(attempt_ids)).all()
    violation_breakdown = {}
    for v in violation_rows:
        violation_breakdown[v.type] = violation_breakdown.get(v.type, 0) + 1

    return {
        "average_score": average_score,
        "total_submissions": len(attempts),
        "question_difficulty": question_difficulty,
        "violation_breakdown": violation_breakdown
    }


@router.get("/teacher/students")
def list_students_for_teacher(
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """Return all registered students and their biometric verification status."""
    students = db.query(User).filter(User.role == "student").all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "email": s.email,
            "face_enrolled": s.face_enrolled,
            "created_at": s.created_at
        } for s in students
    ]


@router.get("/teacher/alerts")
def list_recent_alerts_for_teacher(
    page: int = 1,
    size: int = 10,
    exam_id: int = None,
    student_id: int = None,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """Return recent proctoring warnings/violations across exams run by this instructor, with pagination and filters."""
    teacher_exams = db.query(Exam).filter(Exam.teacher_id == current_user.id).all()
    exam_ids = [e.id for e in teacher_exams]
    
    attempts_query = db.query(Attempt).filter(Attempt.exam_id.in_(exam_ids))
    if exam_id:
        attempts_query = attempts_query.filter(Attempt.exam_id == exam_id)
    if student_id:
        attempts_query = attempts_query.filter(Attempt.student_id == student_id)
        
    attempts = attempts_query.all()
    attempt_map = {a.id: a for a in attempts}
    attempt_ids = list(attempt_map.keys())

    if not attempt_ids:
        return {
            "items": [],
            "total": 0,
            "page": page,
            "size": size,
            "pages": 0
        }

    violations_query = db.query(Violation).filter(Violation.attempt_id.in_(attempt_ids))
    total = violations_query.count()
    
    violations = violations_query.order_by(Violation.created_at.desc()).offset((page - 1) * size).limit(size).all()

    alert_feed = []
    for v in violations:
        att = attempt_map.get(v.attempt_id)
        student = db.query(User).filter(User.id == att.student_id).first() if att else None
        exam = db.query(Exam).filter(Exam.id == att.exam_id).first() if att else None
        alert_feed.append({
            "id": v.id,
            "violation_type": v.type,
            "student_name": student.name if student else "Unknown Student",
            "exam_title": exam.title if exam else "Unknown Exam",
            "created_at": v.created_at
        })
        
    return {
        "items": alert_feed,
        "total": total,
        "page": page,
        "size": size,
        "pages": (total + size - 1) // size if total > 0 else 0
    }

