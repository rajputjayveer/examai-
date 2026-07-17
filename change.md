# ExamGuard AI — Implementation Plan (Bugs + Real Identity Check + Auth Upgrades)

This plan covers, in build order:

1. Three bugs already found
2. Real (non-mock) identity verification during the exam
3. Answer-key screen restructured into "Review / Correct"
4. Admin-created teacher accounts with emailed password
5. Forgot-password for every role
6. UI/UX upgrades
7. New feature suggestions

Do the phases in this order — each one is demoable on its own, so you always
have something working to show if a review lands mid-build.

---

## Phase 0 — Before touching anything: DB migration note

Your DB uses `Base.metadata.create_all()` on startup (`db/init_db.py`), which
only **creates missing tables** — it will not add new columns to a table that
already exists. Phases 2 and 4 below add new columns to `users`. After adding
them, either:

```bash
# quick option for a dev/college project — just wipe and recreate
mysql -u root -p -e "DROP DATABASE examguard; CREATE DATABASE examguard;"
```

or run one `ALTER TABLE` per new column if you have real data you want to keep:

```sql
ALTER TABLE users ADD COLUMN face_descriptor TEXT NULL;
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE;
```

---

## Phase 1 — Fix the 3 known bugs

### 1.1 `reports.py` — missing import crashes the Gemini check

**File:** `backend/app/routers/reports.py`

```python
# add near the top with the other imports
from app.core.config import settings
```

Without this, `if settings.GEMINI_API_KEY:` throws `NameError` the instant
anyone opens a report page.

### 1.2 `core/config.py` — remove hardcoded secrets

**File:** `backend/app/core/config.py`

```python
# BEFORE (don't keep real-looking defaults in code that ends up in a zip/repo)
class Settings(BaseSettings):
    DB_PASSWORD: str = "#rajputjayveer"
    JWT_SECRET: str = "change-me-to-a-very-secure-secret-key-32-chars-long"
    ADMIN_PASSWORD: str = "secure-admin-password"

# AFTER — no fallback values; force these to come only from .env
class Settings(BaseSettings):
    DB_PASSWORD: str
    JWT_SECRET: str
    ADMIN_PASSWORD: str
```

Then make sure `backend/.env` (already gitignored) actually has all three set.
**Also change the real DB password** you had hardcoded — treat it as
compromised since it was sitting in a file that got zipped and shared.

### 1.3 `create_teacher` has no role check — anyone can create a teacher account

**File:** `backend/app/routers/auth.py`

```python
# BEFORE — no protection at all
@router.post("/admin/create-teacher", response_model=UserResponse)
def create_teacher(user_in: UserCreate, db: Session = Depends(get_db)):
    ...
```

This is rebuilt properly in Phase 4 below (it needs `RoleChecker(["admin"])`
plus the emailed-password flow), so fix it there rather than twice.

---

## Phase 2 — Real identity verification (no mock, no heavy backend ML)

Your architecture already loads `face-api.js` in the browser for detection.
Reuse the **same library's recognition model** instead of adding DeepFace /
TensorFlow to the backend — this keeps your "browser detects, backend stores
facts" design intact.

### 2.1 DB — add a column to store the enrolled face's descriptor

**File:** `backend/app/models/user.py`

```python
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.db.base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)
    is_verified = Column(Boolean, default=False)
    face_enrolled = Column(Boolean, default=False)
    face_descriptor = Column(Text, nullable=True)       # JSON array of 128 floats
    must_change_password = Column(Boolean, default=False)  # used in Phase 4
    created_at = Column(DateTime, server_default=func.now())
```

### 2.2 Backend service — the real comparison logic

**New file:** `backend/app/services/face_service.py`

```python
import json
import numpy as np

# face-api.js's faceRecognitionNet produces 128-length descriptors.
# 0.6 is the standard Euclidean-distance threshold used by face-api.js/
# dlib-based models — below it is treated as "same person".
MATCH_THRESHOLD = 0.6

def save_descriptor(descriptor: list[float]) -> str:
    """Serialize a 128-float descriptor for storage in the User row."""
    return json.dumps(descriptor)

def compare_descriptors(stored_json: str, incoming: list[float]) -> tuple[bool, float]:
    """Returns (is_match, distance). Lower distance = more similar."""
    stored = np.array(json.loads(stored_json), dtype=np.float32)
    live = np.array(incoming, dtype=np.float32)
    distance = float(np.linalg.norm(stored - live))
    return distance < MATCH_THRESHOLD, distance
```

### 2.3 Backend routes — enroll and verify against a real descriptor

**File:** `backend/app/routers/students.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User
from app.services.face_service import save_descriptor

router = APIRouter()

class FaceEnrollRequest(BaseModel):
    descriptor: list[float]   # 128 floats from faceapi.js on the client

@router.post("/enroll-face")
def enroll_face(
    payload: FaceEnrollRequest,
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    if len(payload.descriptor) != 128:
        raise HTTPException(status_code=400, detail="Invalid face descriptor")

    current_user.face_descriptor = save_descriptor(payload.descriptor)
    current_user.face_enrolled = True
    db.commit()
    return {"detail": "Face reference enrolled successfully"}

@router.get("/profile")
def get_profile(current_user: User = Depends(get_current_active_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "face_enrolled": current_user.face_enrolled
    }
```

**File:** `backend/app/routers/proctoring.py` — replace the stub

```python
from app.services.face_service import compare_descriptors
from app.models.user import User as UserModel

@router.post("/identity-check")
def identity_check(
    check_in: IdentityCheckCreate,   # add `descriptor: list[float]` to this schema
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    attempt = db.query(Attempt).filter(
        Attempt.id == check_in.attempt_id,
        Attempt.student_id == current_user.id
    ).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if not current_user.face_descriptor:
        return {"verified": False, "reason": "no_reference_enrolled"}

    is_match, distance = compare_descriptors(current_user.face_descriptor, check_in.descriptor)

    if not is_match:
        violation = Violation(
            attempt_id=attempt.id,
            type="identity_mismatch",
            evidence_path=None
        )
        db.add(violation)
        db.commit()

    return {"verified": is_match, "distance": round(distance, 3)}
```

Add the field to the schema:

**File:** `backend/app/schemas/proctoring.py`

```python
class IdentityCheckCreate(BaseModel):
    attempt_id: int
    descriptor: list[float]
```

### 2.4 Frontend — compute descriptors instead of sending raw photos

**File:** `frontend/src/pages/student/FaceEnroll.jsx` (key change)

```jsx
// on top, alongside your existing tinyFaceDetector + faceLandmark68Net loads:
await faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL);

const captureAndEnroll = async () => {
  const detection = await faceapi
    .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    setError('No face detected — face the camera directly and try again.');
    return;
  }

  await client.post('/students/enroll-face', {
    descriptor: Array.from(detection.descriptor)   // Float32Array -> plain array
  });
  navigate('/student/dashboard');
};
```

**File:** `frontend/src/pages/student/ExamRoom.jsx` — replace `sendIdentityCheck`

```jsx
const sendIdentityCheck = async () => {
  if (!faceApiReady || !videoRef.current) return;
  const detection = await window.faceapi
    .detectSingleFace(videoRef.current, new window.faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return; // no-face case is already handled by detectFaces()

  try {
    const res = await client.post('/proctoring/identity-check', {
      attempt_id: attemptId,
      descriptor: Array.from(detection.descriptor)
    });
    if (!res.data.verified) {
      triggerViolation('identity_mismatch', '⚠ Identity check failed — face does not match enrollment');
    }
  } catch (e) {
    console.warn('Identity check failed to reach server', e);
  }
};
```

Also load `faceRecognitionNet` in `ExamRoom.jsx`'s `loadFaceApi()` the same way
you already load the detector and landmark models — one extra line.

That's the whole gap closed: real 128-dimension face descriptors, computed
client-side by a real pretrained model, compared server-side with plain math,
stored per-student. No new heavy dependency, no mock return value.

---

## Phase 3 — Answer key: keep creation-time entry, repurpose the review screen

No schema change needed — `correct_option` stays required at question
creation (already working correctly).

### 3.1 Expose `correct_option` to the teacher-facing questions endpoint

**File:** `backend/app/schemas/exam.py`

```python
class QuestionResponse(QuestionBase):
    id: int
    exam_id: int
    order_index: int
    correct_option: Optional[str] = None   # only populated for teacher calls

    class Config:
        from_attributes = True
```

### 3.2 Rename the intent of the endpoint (not the route, to avoid breaking anything)

**File:** `backend/app/routers/exams.py`

```python
@router.post("/{exam_id}/answer-key")
def review_and_correct_answers(
    exam_id: int,
    entries: List[AnswerKeyEntry],
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    """
    Post-exam correction tool. The key is already set at question creation,
    so this only OVERRIDES a disputed question's correct option (or voids it
    by passing correct_option=None) and re-evaluates existing attempts —
    it is not the primary place answers are entered.
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
        db.commit()

    return {"detail": "Corrections applied and affected attempts re-evaluated."}
```

### 3.3 Frontend — rename the page

Rename `frontend/src/pages/teacher/AnswerKey.jsx` to present itself as
**"Review & Correct Answers"** rather than "set the answer key" — update the
heading text and the sidebar/menu label in `ExamList.jsx` accordingly. This
keeps your viva story consistent: *the key is set when the exam is built;
this screen exists to correct or void a disputed question afterward.*

---

## Phase 4 — Admin creates teacher accounts, password sent by email

### 4.1 Real email sending (not just console print)

**New file:** `backend/app/services/email_service.py`

```python
import smtplib
from email.mime.text import MIMEText
from app.core.config import settings

def send_email(to_email: str, subject: str, body: str):
    if settings.DEV_MODE:
        print(f"\n--- [DEV MODE] Email to {to_email} ---\nSubject: {subject}\n{body}\n---\n")
        return

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_USER
    msg["To"] = to_email

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_USER, [to_email], msg.as_string())
```

Use this same function for OTP emails too (swap the `print()` in `auth.py`'s
`send_otp_email` to call it) — one email path for the whole app.

### 4.2 Admin-only, password auto-generated and emailed

**File:** `backend/app/routers/auth.py`

```python
import secrets
import string
from app.core.deps import RoleChecker
from app.services.email_service import send_email

def generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

@router.post("/admin/create-teacher", response_model=UserResponse)
def create_teacher(
    user_in: UserCreate,
    current_user: User = Depends(RoleChecker(["admin"])),   # <-- the missing protection
    db: Session = Depends(get_db)
):
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    temp_password = generate_temp_password()
    db_user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=get_password_hash(temp_password),
        role="teacher",
        is_verified=True,
        face_enrolled=True,
        must_change_password=True
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    send_email(
        db_user.email,
        "Your ExamGuard AI teacher account",
        f"Hello {db_user.name},\n\nAn account has been created for you.\n"
        f"Email: {db_user.email}\nTemporary password: {temp_password}\n\n"
        f"You'll be asked to set a new password on first login."
    )
    return db_user

@router.post("/change-password")
def change_password(
    old_password: str,
    new_password: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if not verify_password(old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = get_password_hash(new_password)
    current_user.must_change_password = False
    db.commit()
    return {"detail": "Password updated successfully"}
```

### 4.3 Frontend — force the password-change screen

**File:** `frontend/src/context/AuthContext.jsx` — `/auth/me` already returns
role and status; add `must_change_password` to the payload in `auth.py`'s
`/me` route, then in your router (`App.jsx`) redirect to a new
`ChangePassword.jsx` page whenever `user.must_change_password` is true, before
any other route renders — same pattern you already use for unauthenticated
redirects.

---

## Phase 5 — Forgot password (student, teacher, admin)

### 5.1 Backend

**File:** `backend/app/routers/auth.py`

```python
from datetime import datetime, timedelta

@router.post("/forgot-password")
def forgot_password(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    # Always return the same message whether or not the email exists —
    # don't let this endpoint reveal which emails are registered.
    if user:
        otp_code = f"{random.randint(100000, 999999)}"
        db_otp = OTPVerification(
            user_id=user.id,
            otp_hash=get_password_hash(otp_code),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        db.add(db_otp)
        db.commit()
        send_email(user.email, "Reset your ExamGuard AI password",
                    f"Your password reset code is: {otp_code}\nExpires in 10 minutes.")
    return {"detail": "If that email is registered, a reset code has been sent."}

@router.post("/reset-password")
def reset_password(email: str, code: str, new_password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid code or email")

    otp_record = db.query(OTPVerification).filter(
        OTPVerification.user_id == user.id
    ).order_by(OTPVerification.created_at.desc()).first()

    if not otp_record or datetime.utcnow() > otp_record.expires_at:
        raise HTTPException(status_code=400, detail="Code expired or invalid")
    if not verify_password(code, otp_record.otp_hash):
        raise HTTPException(status_code=400, detail="Invalid code")

    user.password_hash = get_password_hash(new_password)
    user.must_change_password = False
    db.commit()
    return {"detail": "Password reset successfully"}
```

*(Reuses your existing `otp_verifications` table — no new table needed.)*

### 5.2 Frontend — two small pages

`frontend/src/pages/auth/ForgotPassword.jsx` — email input → calls
`/auth/forgot-password` → shows "check your email" state.

`frontend/src/pages/auth/ResetPassword.jsx` — email (prefilled from the
previous step) + code + new password → calls `/auth/reset-password` → redirect
to `Login.jsx` on success.

Add a `Forgot password?` link under the password field in `Login.jsx`, right
next to the existing "New student? Create an account" line.

---

## UI/UX upgrades

Your Tailwind design system (brand-600 palette, `rounded-2xl` cards,
`shadow-card`, the gradient-blob background on `Login.jsx`) is already
consistent and good — extend it rather than introducing new styles.

1. **Live proctoring status should always be visible, not just on violation.**
   Add a small persistent badge in `ExamRoom.jsx` — green dot "Face detected"
   / red dot "No face" / amber "Multiple faces" — using the same `faceCount`
   state you already track. Right now the student only sees feedback via the
   flash message, which disappears.
2. **Violation flash should not block the question text.** Currently a full
   violation banner likely overlays near the exam content; move it to a fixed
   top-right toast so it never interrupts reading a question mid-flash.
3. **Answer progress indicator.** A small `"7 of 20 answered"` counter next to
   the question navigator — cheap to add from state you already have
   (`answers` object), and reduces "did I answer everything?" anxiety before
   submit.
4. **Teacher results table needs a risk-level color, not just a violation
   count.** In `ResultsDashboard.jsx`, color-code the violations column:
   green (0), amber (1–2), red (3+) — turns a plain number column into
   something scannable at a glance.
5. **Face enrollment screen should show a live "quality" hint.** While
   capturing, show "✓ Face centered" / "Move closer" / "Too dark" based on
   whether `detectSingleFace` actually returns a result — right now it's easy
   to enroll a bad reference photo silently.
6. **Empty states.** `Dashboard.jsx` (student) and `ExamList.jsx` (teacher)
   should have a friendly empty state ("No exams yet — ask your teacher to
   add you" / "Create your first exam") instead of a blank table, since a
   fresh account will see nothing on day one of a demo.
7. **Loading skeletons over spinners** on the dashboard and results pages —
   small visual polish that reads as more "product-like" in a viva demo.

---

