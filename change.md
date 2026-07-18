# ExamGuard AI — Complete Master Change Plan

This is the single consolidated file covering **everything discussed** —
checked directly against your latest uploaded zip, so each item below is
marked with its real current status, not assumed.

**Legend:** ✅ Done (verified in your code) · ⚠️ Partially done / inconsistent
· ❌ Not done yet

---

## Status overview

| # | Item | Status |
|---|------|--------|
| 1 | Bug: `reports.py` missing `settings` import | ✅ Done |
| 2 | Bug: hardcoded secrets in `config.py` | ✅ Done |
| 3 | Bug: unprotected `create_teacher` endpoint | ✅ Done |
| 4 | Real identity verification (no mock) | ✅ Done — via DeepFace, see note below |
| 5 | Answer-key: creation-time vs post-hoc restructure | ⚠️ **Still inconsistent — see Part 0 below** |
| 6 | Admin creates teacher, password emailed | ✅ Done |
| 7 | Forgot password (all roles) | ✅ Done |
| 8 | UI/UX round 1 (status badge, progress, violation colors) | ✅ Mostly done, few items left |
| 9 | Question shuffling per student | ❌ Not done |
| 10 | Auto-submit on violation threshold | ❌ Not done |
| 11 | Flag-for-review threshold | ❌ Not done |
| 12 | Bulk CSV/Excel import | ❌ Not done |
| 13 | Camera/mic self-check screen | ❌ Not done |
| 14 | Class-level analytics | ❌ Not done |
| 15 | Rebrand name options | For your decision |
| 16 | Full redesign | Spec only, build on request |

Everything with a code block below is either **still needed** (marked ❌/⚠️)
or kept **for reference** (marked ✅, shown so you can verify your own code
matches, not to be reapplied).

---

## Part 0 — ⚠️ The one unresolved item from before: answer-key consistency

**This is the most important fix left.** Your code currently has both halves
of a contradiction still in place:

- `schemas/exam.py` → `QuestionCreate.correct_option` is **required** at
  question creation (confirmed in your code — correct, keep this).
- `schemas/exam.py` → `QuestionResponse` still **excludes** `correct_option`,
  so the teacher-facing "Answer Key" screen can't even display the key it's
  supposedly there to set.
- `routers/exams.py` → `upload_answer_key()` still re-saves `correct_option`
  and re-evaluates every attempt as if the key weren't already set at
  creation — this path is now redundant with what `attempts.py`'s
  `submit_attempt()` already does automatically at submission time.

If a teacher or examiner asks "so when is the answer key actually entered?"
during your viva, the current code doesn't have one consistent answer.
Fix it once, here:

**File:** `backend/app/schemas/exam.py`

```python
class QuestionResponse(QuestionBase):
    id: int
    exam_id: int
    order_index: int
    correct_option: Optional[str] = None   # now visible to the teacher view

    class Config:
        from_attributes = True
```

**File:** `backend/app/routers/exams.py` — replace `upload_answer_key`

```python
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
```

**Frontend:** rename `AnswerKey.jsx`'s heading/copy from "Set Answer Key" to
**"Review & Correct Answers"**, and have it pre-fill each question's current
`correct_option` (now available from `GET /{exam_id}/questions` after the
schema fix above) instead of assuming it starts blank.

---

## Part 1 — Already-implemented items (reference only, no action needed)

These are confirmed present in your latest zip. Included here only so the
plan is complete and you can sanity-check your own code against them —
**do not re-apply these.**

<details>
<summary>Bug fixes (3) — click to expand for reference</summary>

- `reports.py` imports `settings` correctly now.
- `config.py` no longer has hardcoded fallback values for `DB_PASSWORD`,
  `JWT_SECRET`, `ADMIN_PASSWORD` — they're required from `.env`.
- `create_teacher` is protected with `RoleChecker(["admin"])`.

</details>

<details>
<summary>Identity verification — click to expand for reference</summary>

Your implementation took a different (also valid) path than originally
proposed: instead of browser-computed face descriptors, you're running
**DeepFace (VGG-Face, cosine distance)** server-side in
`backend/app/services/face_service.py`, comparing the enrolled reference
photo against each live snapshot. This is real, not mocked — `identity-check`
actually decodes images and runs a model, and a mismatch logs a genuine
`identity_mismatch` violation.

One thing worth knowing for your viva: this is heavier than the
face-api.js-in-browser approach (needs `deepface` + `opencv-python-headless`
on the server, and each check re-runs a full model inference), but it's
architecturally simpler to reason about and totally fine for a minor
project's scale. If check latency ever becomes noticeable in your demo,
that's the tradeoff to mention.

</details>

<details>
<summary>Admin-created teachers + emailed password — click to expand for reference</summary>

`create_teacher` generates a random password, hashes it, sets
`must_change_password=True`, and emails the plaintext temp password via
`email_service.py`. `change-password` clears the flag. Confirmed working.

</details>

<details>
<summary>Forgot password — click to expand for reference</summary>

`/auth/forgot-password` and `/auth/reset-password` exist and reuse the OTP
table pattern; `ForgotPassword.jsx` and `ResetPassword.jsx` exist on the
frontend. Confirmed present.

</details>

<details>
<summary>UI/UX round 1 — click to expand for reference</summary>

Confirmed already in `ExamRoom.jsx`/`ResultsDashboard.jsx`: persistent
face-status badge, answered-count progress, color-coded violation counts
(green/amber/red), and loading skeletons on the results table. Nicely done —
no changes needed here.

</details>

---

## Part 2 — ❌ 6 new features (not yet implemented)

### 2.1 Question shuffling per student

**File:** `backend/app/routers/attempts.py`

```python
import random  # add to imports at top

@router.get("/{attempt_id}/questions")
def get_attempt_questions(
    attempt_id: int,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id, Attempt.student_id == current_user.id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    exam = db.query(Exam).filter(Exam.id == attempt.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    questions = db.query(Question).filter(Question.exam_id == exam.id).order_by(Question.order_index).all()

    # Shuffle presentation order per student — storage order (order_index) never changes.
    # Seeding with attempt.id keeps it stable across refreshes for the same student.
    rng = random.Random(attempt.id)
    rng.shuffle(questions)

    return {
        "attempt": {
            "id": attempt.id,
            "exam_id": attempt.exam_id,
            "student_id": attempt.student_id,
            "started_at": attempt.started_at,
            "end_at": exam.end_at,
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
```

No frontend change needed — `ExamRoom.jsx` just iterates whatever array it
receives.

---

### 2.2 Auto-submit after N violations (server-authoritative)

The backend decides when to auto-submit, not the browser — a tampered client
can't escape the lockout since the violation count lives in the database.

**File:** `backend/app/routers/proctoring.py`

```python
from app.models.question import Question   # add to imports
from app.models.answer import Answer       # add to imports

MAX_VIOLATIONS_BEFORE_AUTO_SUBMIT = 5

@router.post("/violation")
def log_violation(
    violation_in: ViolationCreate,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    attempt = db.query(Attempt).filter(Attempt.id == violation_in.attempt_id, Attempt.student_id == current_user.id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    evidence_path = None
    if violation_in.snapshot:
        attempt_dir = os.path.join(STORAGE_DIR, "evidence", str(attempt.id))
        os.makedirs(attempt_dir, exist_ok=True)
        filename = f"{int(datetime.utcnow().timestamp())}_{violation_in.type}.jpg"
        file_path = os.path.join(attempt_dir, filename)
        try:
            header, encoded = violation_in.snapshot.split(",", 1) if "," in violation_in.snapshot else ("", violation_in.snapshot)
            img_data = base64.b64decode(encoded)
            with open(file_path, "wb") as f:
                f.write(img_data)
            evidence_path = f"evidence/{attempt.id}/{filename}"
        except Exception as e:
            print("Failed to decode and save violation snapshot:", e)

    violation = Violation(
        attempt_id=violation_in.attempt_id,
        type=violation_in.type,
        evidence_path=evidence_path
    )
    db.add(violation)
    db.commit()
    db.refresh(violation)

    # ── Auto-submit lockout ──────────────────────────────────────────────
    auto_submitted = False
    if attempt.status == "ongoing":
        violation_count = db.query(Violation).filter(Violation.attempt_id == attempt.id).count()
        if violation_count >= MAX_VIOLATIONS_BEFORE_AUTO_SUBMIT:
            attempt.submitted_at = datetime.utcnow()
            attempt.status = "submitted"

            questions = db.query(Question).filter(Question.exam_id == attempt.exam_id).all()
            correct_answers = {q.id: q.correct_option for q in questions if q.correct_option is not None}
            if questions and len(correct_answers) == len(questions):
                student_answers = db.query(Answer).filter(Answer.attempt_id == attempt.id).all()
                attempt.score = sum(
                    1.0 for a in student_answers if correct_answers.get(a.question_id) == a.selected_option
                )
                attempt.status = "graded"

            db.commit()
            auto_submitted = True

    return {
        "id": violation.id,
        "attempt_id": violation.attempt_id,
        "type": violation.type,
        "evidence_path": violation.evidence_path,
        "created_at": violation.created_at,
        "auto_submitted": auto_submitted
    }
```

**File:** `frontend/src/pages/student/ExamRoom.jsx` — update `triggerViolation`

```jsx
const triggerViolation = useCallback(async (type, msg) => {
  setViolationMsg(msg);
  setViolationFlash(true);
  setTotalViolations(v => v + 1);
  setTimeout(() => setViolationFlash(false), 2500);

  try {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    let snapshot = "";
    if (video && canvas) {
      canvas.getContext('2d').drawImage(video, 0, 0, 320, 240);
      snapshot = canvas.toDataURL('image/jpeg', 0.6);
    }

    const res = await client.post('/proctoring/violation', {
      attempt_id: parseInt(attemptId),
      type: type,
      snapshot: snapshot
    });

    if (res.data?.auto_submitted) {
      setViolationMsg('⚠ Maximum violations reached — your exam has been auto-submitted.');
      stopCamera();
      setTimeout(() => navigate(`/student/result/${attemptId}`), 2000);
    }
  } catch { /* silent */ }
}, [attemptId, navigate]);
```

Add one line to the exam rules/instructions screen: *"Exceeding 5 proctoring
warnings will auto-submit your exam."* — enforcement should never surprise
the student mid-exam.

---

### 2.3 Exam-level violation threshold → flag for review

**File:** `backend/app/routers/reports.py`

```python
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
```

**File:** `frontend/src/pages/teacher/ResultsDashboard.jsx` — add next to the
existing violations badge:

```jsx
{row.flagged_for_review && (
  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">
    🚩 Flagged
  </span>
)}
```

Results now arrive pre-sorted flagged-first — no frontend sort logic needed.

---

### 2.4 Bulk question import via CSV/Excel

**New file:** `backend/app/services/csv_parser_service.py`

```python
import pandas as pd

REQUIRED_COLUMNS = {"question", "option_a", "option_b", "option_c", "option_d", "correct_option"}

def parse_csv_questions(file_path: str) -> list:
    if file_path.lower().endswith((".xlsx", ".xls")):
        df = pd.read_excel(file_path)
    else:
        df = pd.read_csv(file_path)

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Missing required column(s): {', '.join(sorted(missing))}")

    questions = []
    for _, row in df.iterrows():
        questions.append({
            "text": str(row["question"]).strip(),
            "option_a": str(row["option_a"]).strip(),
            "option_b": str(row["option_b"]).strip(),
            "option_c": str(row["option_c"]).strip(),
            "option_d": str(row["option_d"]).strip(),
            "correct_option": str(row["correct_option"]).strip().upper()
        })
    return questions
```

**File:** `backend/app/routers/exams.py` — new endpoint alongside `upload-pdf`

```python
@router.post("/upload-sheet")
def upload_sheet_exam(
    file: UploadFile = File(...),
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    import tempfile, os
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
```

**File:** `backend/requirements.txt` — add:
```
pandas
openpyxl
```

**Frontend:** in `CreateExam.jsx`, add "Import from Excel/CSV" next to the
existing PDF upload, pointing at `/exams/upload-sheet`. Both return the same
`{ questions: [...] }` shape, so they share your existing "review extracted
questions before saving" step. Show the hint: *"Columns required: question,
option_a, option_b, option_c, option_d, correct_option."*

---

### 2.5 Student-side camera & mic self-check before the exam

**New file:** `frontend/src/pages/student/CameraCheck.jsx`

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function CameraCheck() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [faceOk, setFaceOk] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream;
    let audioCtx;
    let rafId;
    let faceapiReady = false;

    const setup = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoRef.current) videoRef.current.srcObject = stream;

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const meterLoop = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
          rafId = requestAnimationFrame(meterLoop);
        };
        meterLoop();

        if (!window.faceapi) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
          document.body.appendChild(script);
          await new Promise(resolve => { script.onload = resolve; });
        }
        await window.faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        faceapiReady = true;

        const detectLoop = async () => {
          if (faceapiReady && videoRef.current && videoRef.current.readyState === 4) {
            const detection = await window.faceapi.detectSingleFace(
              videoRef.current, new window.faceapi.TinyFaceDetectorOptions()
            );
            setFaceOk(!!detection);
          }
          setTimeout(detectLoop, 800);
        };
        detectLoop();
      } catch (e) {
        setError('Could not access camera/microphone. Please allow permissions and reload.');
      }
    };

    setup();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (audioCtx) audioCtx.close();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const canContinue = faceOk;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8 max-w-lg w-full">
        <h1 className="text-xl font-bold text-slate-900 font-display mb-1">Test your camera & mic</h1>
        <p className="text-sm text-slate-500 mb-5">Fix any lighting or camera issues now — before your timer starts.</p>

        {error ? (
          <p className="text-sm text-red-600 mb-4">{error}</p>
        ) : (
          <>
            <video ref={videoRef} autoPlay muted className="w-full rounded-xl bg-slate-900 mb-4" />

            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2.5 h-2.5 rounded-full ${faceOk ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
              <span className="text-sm font-medium text-slate-700">
                {faceOk ? 'Face detected clearly' : 'No face detected — center yourself in frame'}
              </span>
            </div>

            <div className="mb-6">
              <span className="text-xs font-medium text-slate-500">Microphone level</span>
              <div className="w-full h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-brand-500 transition-all" style={{ width: `${micLevel}%` }} />
              </div>
            </div>
          </>
        )}

        <button
          disabled={!canContinue}
          onClick={() => navigate(`/student/instructions/${examId}`)}
          className={`w-full py-2.5 rounded-xl font-semibold text-sm transition ${
            canContinue ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {canContinue ? 'Continue to Instructions' : 'Waiting for a clear face…'}
        </button>
      </div>
    </div>
  );
}
```

**File:** `frontend/src/App.jsx` — add the route

```jsx
import CameraCheck from './pages/student/CameraCheck';
// ...
<Route path="/student/camera-check/:examId"
  element={<ProtectedRoute allowedRoles={['student']}><CameraCheck /></ProtectedRoute>} />
```

Then change wherever a student currently navigates straight to
`/student/instructions/:examId` (the "Start Exam" button in `Dashboard.jsx`)
to go to `/student/camera-check/:examId` first.

---

### 2.6 Class-level analytics

**File:** `backend/app/routers/reports.py`

```python
@router.get("/teacher/exams/{exam_id}/analytics")
def get_exam_analytics(
    exam_id: int,
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    exam = db.query(Exam).filter(Exam.id == exam_id, Exam.teacher_id == current_user.id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    attempts = db.query(Attempt).filter(
        Attempt.exam_id == exam_id, Attempt.status.in_(["submitted", "graded"])
    ).all()
    questions = db.query(Question).filter(Question.exam_id == exam_id).order_by(Question.order_index).all()

    if not attempts:
        return {"average_score": None, "total_submissions": 0, "question_difficulty": [], "violation_breakdown": {}}

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
```

**Frontend:** new page `frontend/src/pages/teacher/ClassAnalytics.jsx`, linked
from a "View Class Analytics" button on `ResultsDashboard.jsx`. Install
`recharts` (`npm install recharts`) and render a bar chart of
`question_difficulty` (percent wrong per question), a bar/pie of
`violation_breakdown`, and two stat cards for `average_score` and
`total_submissions`. Good closing feature for your presentation — reuses
data you already collect, no new architecture.

---

## Part 3 — Website rebrand name options

"ExamGuard AI" is fine and descriptive; here are alternatives if you want
something more distinct (check trademark/domain availability yourself):

**Serious / institutional**
- **Invigila** — from "invigilate," the formal exam-supervision term; reads as a real product name.
- **ProctorIQ** — signals "smart proctoring" without spelling it out.
- **Veritest** — "verify" + "test"; short, brandable, works spoken aloud.

**Modern / approachable**
- **Honestly** — plays on academic honesty; unusual for edtech, memorable.
- **ClearRoom** — evokes a monitored, transparent exam room without sounding surveillance-heavy.
- **Vigilo** — Latin-rooted ("I watch"), short, reads like a real SaaS product.

**Descriptive but distinct**
- **TrustPaper** — pairs the "paper exam" image with trust/integrity.
- **SentinelExam** — leans into the anti-cheating angle, good if your presentation emphasizes security.

If you want to keep "ExamGuard" but make it feel less generic: **ExamGuard
Vision**, or drop "AI" entirely and go with **Guardian** — nearly every
edtech tool claims "AI" now, so a clean name without it can stand out more.

---

## Part 4 — Redesign spec (design system + per-page layout)

Your current Tailwind system (brand-600 palette, `rounded-2xl` cards,
`shadow-card`) is solid — treat a full redesign as its own follow-up build
rather than folding it into feature work. Use this as the spec:

**Design tokens to formalize**
- Primary: brand-600 (keep). Add one accent color (amber or teal), reserved
  only for "live/in-progress" states (e.g., an ongoing exam) so it doesn't
  compete with brand-600.
- Type scale: `font-display` for headings (already used) + one body font —
  confirm both are actually loaded, not falling back to system fonts.
- Radius: standardize every card/button on `rounded-2xl`/`rounded-xl` only —
  audit for stray `rounded-md`/`rounded-lg` leftovers.

**Per-page layout direction**
- **Landing** — hero with a real product screenshot (not stock imagery), a
  3-step "how it works" strip (Register → Take Exam → Get Results), and a
  trust section naming your actual signals (face detection, tab-switch
  detection, identity verification).
- **Student Dashboard** — card grid grouped by status (Upcoming / Completed)
  instead of one flat table, each card with one primary action button.
- **Exam Room** — shrink the webcam preview to a small fixed corner
  thumbnail (standard in proctoring UIs), giving more width to the question.
- **Teacher Results Dashboard** — add a left filter rail (All / Flagged /
  Graded / Pending) once flagging (Part 2.3) exists — makes a 30–60 student
  class scannable instead of one long table.
- **Admin Panel** — add a stat strip (Total Teachers, Total Students, Total
  Exams Run) above the management table for a dashboard feel.

I can build the actual redesigned JSX for any of these next — tell me which
page to start with (Landing and the Exam Room webcam-corner change have the
highest visible impact for a demo).

---
```