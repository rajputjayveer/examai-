# ExamGuard AI — Complete Rebuild Guide
### From: Flask + local OpenCV scripts  →  To: FastAPI + React proctored exam platform

This guide explains (1) how your current project actually works, (2) the full
architecture of the new version, (3) every feature — old and new — with the
logic behind it, and (4) a phase-by-phase build plan you can follow and show
progress on for your minor project evaluations.

---

## 1. How the CURRENT project works (in plain terms)

Your repo is `EXAMGUARDAI/` with `frontend/` (Flask) and `backend/` (scripts).

| File | What it actually does |
|---|---|
| `backend/dataset_capture.py` | You run this manually in a terminal, type a student's name, it opens your webcam and saves 100 cropped face images to `dataset/<name>/`. This is "registration." |
| `backend/face_recognition.py`, `verify_candidate.py` | Opens webcam, grabs one frame, uses `DeepFace.find`/`verify` against the `dataset/` folder to check identity. `verify_candidate.py` even has the student name **hardcoded** (`dataset/Srijan`). |
| `backend/exam_monitor.py` | The "real" monitor. Opens the webcam **on the server machine itself** (`cv2.VideoCapture(0)`), runs Haar-cascade face counting every frame, runs `DeepFace.find` every 10s for identity, calls `TabSwitchDetector` (Windows-only, checks OS window titles), writes violations to `monitor_data.json` and images to `backend/evidence/`. It draws everything into a **local OpenCV window** — this cannot work over the internet or with a student's own laptop camera unless the whole app runs on their machine. |
| `backend/database.py` | One SQLite table `exam_reports`: name, face_count, violations, evidence_count, timestamp. No exams, no questions, no scores. |
| `frontend/app.py` | Flask routes: `/` (login page, no real auth) → `/verify` (runs `verify_candidate.py` as a subprocess!) → `/instructions` → `/exam` → `/submit_exam` (reads `monitor_data.json`, saves a report) → `/result` → `/evidence` (lists last 3 images) → `/download_report` (PDF via reportlab) → `/admin` (lists all reports). |

**Core problem to fix:** the webcam and window logic run on the *server*, not
in the *browser*. In a real deployed app, the browser must capture the
student's webcam via `getUserMedia`, and the backend must only receive
frames/events over HTTP — it never touches a camera directly.

---

## 2. New Architecture

```
┌─────────────────────┐        REST + JWT        ┌──────────────────────┐
│   React Frontend     │ ───────────────────────► │   FastAPI Backend    │
│ (Vite + Tailwind)    │ ◄─────────────────────── │  (Python 3.11)       │
└─────────────────────┘                           └──────────────────────┘
        │  getUserMedia (webcam in browser)                 │
        │  face-api.js / MediaPipe (client-side detection)  │
        │  Page Visibility API (tab-switch)                 │
        ▼                                                    ▼
  Only violation EVENTS + snapshot images                SQLite/Postgres
  are POSTed to backend — not raw video                  + local/S3 file
                                                           storage for
                                                           evidence & PDFs
```

**Backend:** FastAPI, SQLAlchemy, Pydantic, JWT auth (`python-jose` +
`passlib`), SQLite for dev / Postgres for "production," `pypdf` or
`pdfplumber` for reading teacher-uploaded PDFs, `reportlab` (keep it) for
report PDFs, `fastapi-mail` or SMTP for OTP emails.

**Frontend:** React (Vite), React Router, Tailwind, Axios, `face-api.js` (or
`@mediapipe/tasks-vision`) for **in-browser** face detection so the backend
never has to process raw video — it only gets violation events + a JPEG
snapshot when something goes wrong. This is dramatically lighter than the
old DeepFace-every-frame approach and works on any student's laptop.

**Why detect faces in the browser, not the server?** Sending continuous
video to a server is heavy, slow, and privacy-invasive. Client-side models
(face-api.js/MediaPipe) run fast enough in-browser to say "0 faces / 1 face /
2+ faces" and the identity match can be a periodic snapshot (e.g., every 20s)
POSTed to the backend, which runs a lighter check (DeepFace or `face_recognition`
library) against the student's stored enrollment photo. This mirrors what your
old `exam_monitor.py` did every 10 seconds — just moved to the right side.

---

## 3. Roles & Full Feature List

### Roles
- **Student** — registers, verifies email via OTP, enrolls face, takes exams, sees own results.
- **Teacher** — creates exams from uploaded PDFs (or manual entry), uploads answer keys, views per-student results + evidence, downloads reports.
- **Admin** *(optional, can reuse teacher role for MVP)* — manages users.

### A. Auth & Registration (replaces manual `dataset_capture.py`)
1. Student enters name/email/password → backend generates a 6-digit OTP, emails it, stores it (hashed, 5-min expiry) in an `otp_verifications` table.
2. Student enters OTP → account activated → JWT issued.
3. **Face enrollment step (in-browser, replaces the old script):** after signup, student is prompted to look at the camera; the browser captures 5–10 frames via `getUserMedia`, uploads them to `POST /api/students/enroll-face`; backend saves them as the student's reference images (replacing the `dataset/<name>/` folder approach, now per-user in `storage/faces/<user_id>/`).
4. Login → JWT (access + refresh token), role embedded in token.

### B. Teacher — Create Test from PDF
1. Teacher uploads a PDF (`POST /api/exams/upload`) — backend extracts text with `pdfplumber`.
2. **Two realistic options, pick based on your PDF format:**
   - *Option A (recommended for a minor project — reliable):* Show extracted text in a React "review & build" screen where the teacher pastes/splits it into questions + 4 options each, using a structured form. This avoids fragile PDF-parsing regex logic failing in your viva demo.
   - *Option B (stretch feature, more "AI"):* Auto-parse the text with a regex/heuristic (`Q1.`, `a) b) c) d)` patterns) to pre-fill the question form, which the teacher then edits/confirms before publishing. This is the safe middle ground — automation with human confirmation.
3. Exam saved with: title, duration, start/end time, list of `Question{text, options[4], order}`.
4. Teacher publishes → exam becomes visible to enrolled students.

### C. Student — Take Exam (replaces `/instructions` → `/exam`)
1. Student sees available exams (`GET /api/exams`), clicks Start.
2. Instructions screen: camera + mic permission prompt, face verification check (compares live snapshot to enrolled face).
3. Exam screen: question navigator, MCQ options, timer, **and a persistent proctoring widget** running:
   - `getUserMedia` webcam feed (small preview shown to student for transparency).
   - Client-side face count every ~1s (no face / 1 face / 2+ faces) using face-api.js.
   - `document.addEventListener("visibilitychange")` + `window.onblur` → tab-switch/window-blur violation.
   - On any violation: capture a snapshot canvas → `POST /api/proctoring/violation` with exam_id, type, snapshot (base64) → backend stores the image + a row in `violations` table.
   - Periodic identity re-check snapshot → `POST /api/proctoring/identity-check`.
4. Answers auto-save as selected (`POST /api/attempts/{id}/answer`) so nothing is lost on refresh/crash.
5. Submit → `POST /api/attempts/{id}/submit`, locks the attempt, stops the webcam stream.

### D. Teacher — Answer Key & Auto-Evaluation (new)
1. After the exam window closes, teacher uploads/enters the answer key (`POST /api/exams/{id}/answer-key`) — simplest form: for each question, mark the correct option index.
2. Backend evaluation job: for every `StudentAttempt`, compare each `StudentAnswer.selected_option` to `Question.correct_option` → compute `score`, `total_questions`, `correct_count`.
3. This can run automatically the moment the answer key is saved (loop over all submitted attempts for that exam) — no manual per-student action needed, matching your "evaluation happen automatically" requirement.

### E. Teacher Dashboard — Score + Evidence per Student
- Table: student name, score, violations count, submission time → click a row to open a **detail page**:
  - Question-by-question breakdown (selected vs correct answer).
  - Violation timeline (type, timestamp, thumbnail evidence image).
  - "Download PDF report" button (reuses your `reportlab` code, now per-student and per-exam instead of one hardcoded report).

---

## 4. Data Model (tables you'll need)

- `users` (id, name, email, password_hash, role, is_verified, face_enrolled)
- `otp_verifications` (id, user_id, otp_hash, expires_at)
- `exams` (id, teacher_id, title, duration_minutes, start_at, end_at, status)
- `questions` (id, exam_id, text, option_a, option_b, option_c, option_d, correct_option [nullable until key uploaded], order_index)
- `attempts` (id, exam_id, student_id, started_at, submitted_at, score, status)
- `answers` (id, attempt_id, question_id, selected_option)
- `violations` (id, attempt_id, type [no_face/multi_face/tab_switch/identity_mismatch], evidence_path, created_at)

---

## 5. Suggested API Surface (FastAPI routers)

```
/api/auth/register           POST
/api/auth/verify-otp         POST
/api/auth/login              POST
/api/students/enroll-face    POST  (multipart images)
/api/exams                   GET, POST     (teacher creates / lists all as student)
/api/exams/{id}              GET
/api/exams/{id}/questions    POST (bulk add), PUT (edit)
/api/exams/{id}/answer-key   POST   -> triggers auto-evaluation
/api/attempts/start           POST  ({exam_id})
/api/attempts/{id}/answer     POST  ({question_id, selected_option})
/api/attempts/{id}/submit     POST
/api/proctoring/violation     POST  ({attempt_id, type, snapshot})
/api/proctoring/identity-check POST ({attempt_id, snapshot})
/api/reports/{attempt_id}     GET   (JSON) / /pdf (download)
/api/teacher/exams/{id}/results GET (all students' scores + violation counts)
```

---

## 6. Build Order (phased — good for a minor project timeline)

| Phase | Deliverable | Old code reused? |
|---|---|---|
| 1 | FastAPI skeleton + SQLAlchemy models + JWT auth (register/login, no OTP yet) | none |
| 2 | React skeleton, routing, login/register pages hitting the API | none |
| 3 | Email OTP flow wired in (can stub email in dev by printing OTP to console/logs) | none |
| 4 | Face enrollment (browser capture → upload) + student profile | replaces `dataset_capture.py` |
| 5 | Teacher: create exam + questions (manual form first) | none |
| 6 | Student: take exam UI + answer autosave + submit | replaces `exam.html`/`exam.js` |
| 7 | Client-side proctoring (face-api.js face count + tab visibility) → violation POSTs | replaces `face_detection.py`, `tab_switch_detector.py` |
| 8 | Periodic identity check against enrolled face (server-side DeepFace/face_recognition call) | replaces `exam_monitor.py`'s identity logic |
| 9 | Teacher answer key upload + auto-evaluation | new |
| 10 | Teacher results dashboard with per-student evidence viewer | replaces `admin.html`/`evidence.html` |
| 11 | PDF report generation (per student/exam) | reuses your `reportlab` code, parameterized |
| 12 | PDF-upload-to-question-draft (Option B automation) | new, do this last — it's the riskiest part to demo live |

Doing proctoring (7–8) *after* the exam flow works end-to-end (1–6) means you
always have a demoable product at every stage, which matters a lot for
progress reviews.

---

## 7. Practical notes for your viva/demo

- Keep a **"DEV_MODE"** flag that prints OTPs to the server console/log instead
  of requiring real SMTP setup during development — wire real email (e.g.
  Gmail SMTP or a free tier like Resend/SendGrid) only once the flow works.
- `winsound` beeps and OpenCV windows won't work when deployed — don't try to
  port them; browser-side toast/alert + red border on the video preview is the
  web equivalent.
- Store violation snapshots as JPEG files on disk (`storage/evidence/<attempt_id>/...`)
  and keep only the file path in the DB — same pattern as before, just written
  by the API instead of a local script.
- For DeepFace in FastAPI: don't run it on every single request — it's slow.
  Run identity checks on a timer (e.g., every 20–30s) exactly like your old
  `exam_monitor.py` did, and always in the browser using face-api.js for
  cheap face-count checks in between.

See `RESTRUCTURE.md` for the exact folder layout and file-by-file migration
mapping.
