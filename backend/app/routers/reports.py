import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from typing import List

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.core.config import settings
from app.models.user import User
from app.models.attempt import Attempt
from app.models.exam import Exam
from app.models.violation import Violation
from app.models.question import Question
from app.models.answer import Answer
from app.services.pdf_service import generate_pdf_report

router = APIRouter()

STORAGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "storage"
)
FLAG_FOR_REVIEW_THRESHOLD = 3

# ── Dedicated thread pool for Gemini API calls ────────────────────────────────
# max_workers=4: up to 4 AI insights can generate in parallel for 35 students.
# Students are never blocked — they get their report instantly from DB and poll
# for the AI insight separately.
_gemini_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="gemini_ai")


def _generate_gemini_insight_sync(
    student_name: str,
    exam_title: str,
    score,
    total_questions: int,
    violations: list,
    is_student: bool,
    storage_dir: str
) -> str:
    """
    Runs synchronously in a thread pool — never blocks the async event loop.
    Returns the AI-generated insight text.
    """
    import google.generativeai as genai
    genai.configure(api_key=settings.GEMINI_API_KEY)

    try:
        req_model = getattr(settings, 'GEMINI_MODEL', 'gemini-2.5-flash')
        try:
            model = genai.GenerativeModel(req_model)
        except Exception:
            model = genai.GenerativeModel("gemini-2.5-flash")

        wrong_count = total_questions - (score or 0)
        viol_list = [v.type for v in violations]

        audio_files = []
        for v in violations:
            if v.evidence_path and v.evidence_path.endswith('.webm'):
                full_audio_path = os.path.join(storage_dir, v.evidence_path)
                if os.path.exists(full_audio_path):
                    try:
                        with open(full_audio_path, "rb") as af:
                            audio_bytes = af.read()
                        if len(audio_bytes) > 0:
                            audio_files.append({"mime_type": "audio/webm", "data": audio_bytes})
                    except Exception:
                        pass

        if is_student:
            prompt = (
                f"You are an academic mentor. A student named {student_name} "
                f"has completed the exam '{exam_title}' scoring {score or 0} "
                f"out of {total_questions} (meaning {wrong_count} incorrect answers). They also had "
                f"{len(violations)} proctoring warnings (types: {', '.join(viol_list) or 'none'}). "
                f"Provide a friendly, motivating 3-sentence summary highlighting what they got wrong, "
                f"advice on their study gaps, and a polite reminder to maintain focus to avoid warnings."
            )
        else:
            prompt = (
                f"You are an AI proctoring auditor. A candidate named {student_name} "
                f"attempted the exam '{exam_title}'. They logged {len(violations)} "
                f"violations (types: {', '.join(viol_list) or 'none'}). "
                f"{'The attached audio clip(s) contain speech evidence. Listen and summarize.' if audio_files else ''} "
                f"Provide a professional, objective 3-sentence evaluation classifying "
                f"the cheating risk level (Low, Medium, High) with specific violation details."
            )

        contents = audio_files + [prompt] if audio_files else prompt
        response = model.generate_content(contents)
        return response.text.strip()

    except Exception as e:
        if is_student:
            return "AI Tip: Review your incorrect answers and focus on staying visible on camera during exams."
        else:
            return f"Proctor Summary: Candidate logged {len(violations)} violations. Review evidence for detailed assessment."


async def _trigger_insight_generation(
    attempt_id: int,
    student_name: str,
    exam_title: str,
    score,
    total_questions: int,
    violations: list,
    is_student: bool,
    db_url: str
):
    """
    Background coroutine: generates Gemini insight in thread pool and saves to DB.
    Called via asyncio.create_task() — runs fully in background, never blocks students.
    """
    try:
        loop = asyncio.get_running_loop()
        insight = await asyncio.wait_for(
            loop.run_in_executor(
                _gemini_executor,
                _generate_gemini_insight_sync,
                student_name, exam_title, score,
                total_questions, violations, is_student, STORAGE_DIR
            ),
            timeout=30.0
        )

        # Save insight to DB using a fresh session (can't reuse the request session)
        from app.db.base import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Attempt).where(Attempt.id == attempt_id))
            attempt = result.scalar_one_or_none()
            if attempt:
                if is_student:
                    attempt.student_insight = insight
                else:
                    attempt.teacher_insight = insight
                await session.commit()
    except Exception as e:
        print(f"[Background Gemini] Failed for attempt {attempt_id}: {e}")


@router.get("/{attempt_id}")
async def get_attempt_report(
    attempt_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns report data INSTANTLY from DB — no waiting for AI.
    If AI insight is already cached it's included.
    If not cached, triggers background generation and returns ai_insight=null.
    Frontend polls /reports/{id}/insight separately to get AI when ready.
    """
    att_result = await db.execute(select(Attempt).where(Attempt.id == attempt_id))
    attempt = att_result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if current_user.role == "student" and attempt.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # ── All DB queries run in parallel via gather ─────────────────────────────
    viol_result, ans_result, q_result, student_result, exam_result = await asyncio.gather(
        db.execute(select(Violation).where(Violation.attempt_id == attempt_id)),
        db.execute(select(Answer).where(Answer.attempt_id == attempt_id)),
        db.execute(select(Question).where(Question.exam_id == attempt.exam_id)),
        db.execute(select(User).where(User.id == attempt.student_id)),
        db.execute(select(Exam).where(Exam.id == attempt.exam_id)),
    )

    violations = viol_result.scalars().all()
    answers    = ans_result.scalars().all()
    questions  = q_result.scalars().all()
    student    = student_result.scalar_one_or_none()
    exam       = exam_result.scalar_one_or_none()

    q_map = {q.id: q for q in questions}
    detailed_answers = [
        {
            "question_id":    ans.question_id,
            "question_text":  q_map[ans.question_id].text       if ans.question_id in q_map else "",
            "option_a":       q_map[ans.question_id].option_a   if ans.question_id in q_map else "",
            "option_b":       q_map[ans.question_id].option_b   if ans.question_id in q_map else "",
            "option_c":       q_map[ans.question_id].option_c   if ans.question_id in q_map else "",
            "option_d":       q_map[ans.question_id].option_d   if ans.question_id in q_map else "",
            "selected_option": ans.selected_option,
            "correct_option": q_map[ans.question_id].correct_option if ans.question_id in q_map else None,
        }
        for ans in answers
    ]

    is_student    = (current_user.role == "student")
    cached_insight = attempt.student_insight if is_student else attempt.teacher_insight

    # ── Trigger background AI generation if not yet cached ────────────────────
    if not cached_insight and settings.GEMINI_API_KEY:
        from app.db.base import ASYNC_DATABASE_URL
        asyncio.create_task(
            _trigger_insight_generation(
                attempt_id=attempt.id,
                student_name=student.name if student else "Student",
                exam_title=exam.title if exam else "Exam",
                score=attempt.score,
                total_questions=len(questions),
                violations=list(violations),
                is_student=is_student,
                db_url=ASYNC_DATABASE_URL
            )
        )

    return {
        "attempt": {
            "id":           attempt.id,
            "score":        attempt.score,
            "status":       attempt.status,
            "started_at":   attempt.started_at,
            "submitted_at": attempt.submitted_at,
        },
        "student_name":   student.name if student else "Unknown",
        "exam_title":     exam.title   if exam    else "Unknown",
        "violations": [
            {
                "id":            v.id,
                "type":          v.type,
                "evidence_path": v.evidence_path,
                "created_at":    v.created_at,
            } for v in violations
        ],
        "answers":          detailed_answers,
        "total_questions":  len(questions),
        "ai_insight":       cached_insight,   # null if still generating
        "ai_insight_ready": cached_insight is not None,
    }


@router.get("/{attempt_id}/insight")
async def poll_insight(
    attempt_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Lightweight polling endpoint — called every 3s by frontend until AI insight is ready.
    Returns { ready: true, text: "..." } when cached, { ready: false } while still generating.
    """
    att_result = await db.execute(select(Attempt).where(Attempt.id == attempt_id))
    attempt = att_result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if current_user.role == "student" and attempt.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    is_student = (current_user.role == "student")
    insight = attempt.student_insight if is_student else attempt.teacher_insight

    if insight:
        return {"ready": True, "text": insight}
    return {"ready": False, "text": None}


@router.get("/{attempt_id}/pdf")
async def download_pdf_report(
    attempt_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    att_result = await db.execute(select(Attempt).where(Attempt.id == attempt_id))
    attempt = att_result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if current_user.role == "student" and attempt.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    student_result, exam_result, viol_result, q_count_result = await asyncio.gather(
        db.execute(select(User).where(User.id == attempt.student_id)),
        db.execute(select(Exam).where(Exam.id == attempt.exam_id)),
        db.execute(select(Violation).where(Violation.attempt_id == attempt_id)),
        db.execute(select(func.count(Question.id)).where(Question.exam_id == attempt.exam_id)),
    )

    student         = student_result.scalar_one_or_none()
    exam            = exam_result.scalar_one_or_none()
    violations      = viol_result.scalars().all()
    total_questions = q_count_result.scalar()

    # Pick the cached AI insight for whoever is downloading (student or teacher view)
    is_student  = (current_user.role == "student")
    ai_insight  = attempt.student_insight if is_student else attempt.teacher_insight

    pdf_dir  = os.path.join(STORAGE_DIR, "reports")
    os.makedirs(pdf_dir, exist_ok=True)
    # Cache key includes 'ai'/'noai' so that a re-download after Gemini finishes
    # generates a fresh PDF with the AI insight section (not a stale cached file).
    ai_suffix = "ai" if ai_insight else "noai"
    pdf_path = os.path.join(pdf_dir, f"report_{attempt_id}_{ai_suffix}.pdf")

    # Run PDF generation in thread pool — it's CPU/IO work, must not block the event loop
    # (multiple students can download simultaneously without queuing each other)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        _gemini_executor,   # reuse the same thread pool — max 4 concurrent PDF builds
        lambda: generate_pdf_report(
            pdf_path=pdf_path,
            candidate_name=student.name if student else "Unknown",
            exam_title=exam.title if exam else "Unknown",
            score=attempt.score if attempt.score is not None else 0.0,
            total_questions=total_questions,
            violations=list(violations),
            started_at=attempt.started_at,
            submitted_at=attempt.submitted_at,
            ai_insight=ai_insight,
        )
    )

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"SecureExam_Report_{attempt_id}.pdf"
    )


@router.get("/teacher/exams/{exam_id}/results")
async def get_exam_results(
    exam_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    exam_result = await db.execute(
        select(Exam).where(Exam.id == exam_id, Exam.teacher_id == current_user.id)
    )
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    att_result = await db.execute(select(Attempt).where(Attempt.exam_id == exam_id))
    attempts   = att_result.scalars().all()

    results = []
    if attempts:
        # Fix #10: Query ALL students and violation counts in parallel (2 queries total)
        # instead of N sequential round trips for N students.
        student_ids  = [att.student_id for att in attempts]
        attempt_ids  = [att.id for att in attempts]

        students_result, vcounts_result = await asyncio.gather(
            db.execute(select(User).where(User.id.in_(student_ids))),
            db.execute(
                select(Violation.attempt_id, func.count(Violation.id).label("cnt"))
                .where(Violation.attempt_id.in_(attempt_ids))
                .group_by(Violation.attempt_id)
            ),
        )
        student_map = {s.id: s for s in students_result.scalars().all()}
        vcount_map  = {row.attempt_id: row.cnt for row in vcounts_result.all()}

        for att in attempts:
            student = student_map.get(att.student_id)
            v_count = vcount_map.get(att.id, 0)
            results.append({
                "attempt_id":         att.id,
                "student_name":       student.name if student else "Unknown",
                "score":              att.score,
                "status":             att.status,
                "violations_count":   v_count,
                "flagged_for_review": v_count >= FLAG_FOR_REVIEW_THRESHOLD,

            "submitted_at":       att.submitted_at,
        })

    results.sort(key=lambda r: (not r["flagged_for_review"], -r["violations_count"]))
    return results


@router.get("/teacher/exams/{exam_id}/analytics")
async def get_exam_analytics(
    exam_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    exam_result = await db.execute(
        select(Exam).where(Exam.id == exam_id, Exam.teacher_id == current_user.id)
    )
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    att_result, q_result = await asyncio.gather(
        db.execute(select(Attempt).where(
            Attempt.exam_id == exam_id,
            Attempt.status.in_(["submitted", "graded"])
        )),
        db.execute(select(Question).where(Question.exam_id == exam_id).order_by(Question.order_index)),
    )
    attempts  = att_result.scalars().all()
    questions = q_result.scalars().all()

    if not attempts:
        return {"average_score": None, "total_submissions": 0, "question_difficulty": [], "violation_breakdown": {}}

    attempt_ids = [a.id for a in attempts]
    scored      = [a.score for a in attempts if a.score is not None]
    avg_score   = round(sum(scored) / len(scored), 2) if scored else None

    question_difficulty = []
    for q in questions:
        ans_result = await db.execute(
            select(Answer).where(Answer.question_id == q.id, Answer.attempt_id.in_(attempt_ids))
        )
        answers_for_q = ans_result.scalars().all()
        total = len(answers_for_q)
        wrong = sum(1 for a in answers_for_q if a.selected_option != q.correct_option) if q.correct_option else None
        question_difficulty.append({
            "question_id":  q.id,
            "text":         q.text,
            "percent_wrong": round((wrong / total) * 100, 1) if total and wrong is not None else None,
        })

    viol_result = await db.execute(
        select(Violation).where(Violation.attempt_id.in_(attempt_ids))
    )
    violation_breakdown = {}
    for v in viol_result.scalars().all():
        violation_breakdown[v.type] = violation_breakdown.get(v.type, 0) + 1

    return {
        "average_score":        avg_score,
        "total_submissions":    len(attempts),
        "question_difficulty":  question_difficulty,
        "violation_breakdown":  violation_breakdown,
    }


@router.get("/teacher/students")
async def list_students_for_teacher(
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    result   = await db.execute(select(User).where(User.role == "student"))
    students = result.scalars().all()
    return [{"id": s.id, "name": s.name, "email": s.email, "face_enrolled": s.face_enrolled, "created_at": s.created_at} for s in students]


@router.get("/teacher/alerts")
async def list_recent_alerts_for_teacher(
    page: int = 1,
    size: int = 10,
    exam_id: int = None,
    student_id: int = None,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: AsyncSession = Depends(get_db)
):
    teacher_exams_result = await db.execute(select(Exam).where(Exam.teacher_id == current_user.id))
    exam_ids = [e.id for e in teacher_exams_result.scalars().all()]

    attempts_q = select(Attempt).where(Attempt.exam_id.in_(exam_ids))
    if exam_id:    attempts_q = attempts_q.where(Attempt.exam_id == exam_id)
    if student_id: attempts_q = attempts_q.where(Attempt.student_id == student_id)

    att_result   = await db.execute(attempts_q)
    attempts     = att_result.scalars().all()
    attempt_map  = {a.id: a for a in attempts}
    attempt_ids  = list(attempt_map.keys())

    if not attempt_ids:
        return {"items": [], "total": 0, "page": page, "size": size, "pages": 0}

    total_result, viol_result = await asyncio.gather(
        db.execute(select(func.count(Violation.id)).where(Violation.attempt_id.in_(attempt_ids))),
        db.execute(
            select(Violation)
            .where(Violation.attempt_id.in_(attempt_ids))
            .order_by(Violation.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        ),
    )
    total      = total_result.scalar()
    violations = viol_result.scalars().all()

    alert_feed = []
    for v in violations:
        att = attempt_map.get(v.attempt_id)
        if att:
            student_result, exam_result = await asyncio.gather(
                db.execute(select(User).where(User.id == att.student_id)),
                db.execute(select(Exam).where(Exam.id == att.exam_id)),
            )
            student = student_result.scalar_one_or_none()
            exam    = exam_result.scalar_one_or_none()
        else:
            student = exam = None

        alert_feed.append({
            "id":             v.id,
            "violation_type": v.type,
            "student_name":   student.name if student else "Unknown Student",
            "exam_title":     exam.title   if exam    else "Unknown Exam",
            "created_at":     v.created_at,
        })

    return {
        "items": alert_feed,
        "total": total,
        "page":  page,
        "size":  size,
        "pages": (total + size - 1) // size if total > 0 else 0,
    }
