# ExamGuard AI — Project Restructure Plan

Target: a clean two-service monorepo (`backend/` FastAPI, `frontend/` React)
that looks and organizes like a real **exam portal product** — with proper
registration, a teacher panel, an exam engine, and automated grading — not
just a proctoring script with a login screen glued on top.

---

## 1. Full Portal Flow (this is what the restructure below is built to serve)

This is the end-to-end journey the new structure must support. Every folder
in Section 2 exists because of a step here — nothing is structural for its
own sake.

### 1.1 Public / Landing
- Portal home → **Register** or **Login**, role chosen at registration
  (Student / Teacher). No manual scripts, no admin typing names into a
  terminal — everything below happens through the UI.

### 1.2 Student Onboarding
1. **Register** (name, email, password, role=student) → account created as
   `unverified`.
2. **Email OTP** sent automatically → student enters the 6-digit code on a
   `Verify OTP` screen → account becomes `active`.
3. **Face Enrollment** (first login only): browser asks for camera
   permission, captures several reference frames, uploads them → stored
   against that student's account. This is a one-time portal step, replacing
   the old "run `dataset_capture.py` and type a name" flow entirely.
4. Lands on **Student Dashboard** → list of exams assigned/available to them,
   each showing status: Upcoming / Live / Completed / Result Declared.

### 1.3 Teacher Onboarding
1. **Register** (role=teacher) → OTP-verified the same way as students.
2. Lands on **Teacher Dashboard** → "Create Exam" button + list of exams
   they've created, each showing: Draft / Published / Ongoing / Closed /
   Evaluated.

### 1.4 Teacher — Building an Exam (portal flow, not a script)
1. **Create Exam** page: title, duration, start time, end time.
2. **Upload PDF** (question paper) → backend extracts text → teacher is
   shown a **question builder screen** pre-filled from the PDF where they
   confirm/edit each question and its 4 options (this keeps a human in the
   loop so a messy PDF never silently breaks the exam).
3. **Publish** → exam becomes visible on enrolled students' dashboards at
   the scheduled time automatically (no manual "turn it on" step needed).

### 1.5 Student — Taking the Exam (portal flow)
1. From the dashboard, student clicks a **Live** exam → **Instructions
   screen**: camera/mic permission check, live face-match against their
   enrolled photo before they're allowed in.
2. **Exam Room**: question list + timer + persistent proctoring overlay
   (webcam preview, face-count status, tab-switch guard) running the whole
   time — this is the same UI, no separate "monitor app."
3. Answers auto-save per click; **Submit** (manual or automatic on timer
   expiry) locks the attempt and stops the camera.
4. Student sees "Submitted — result will be available once your teacher
   publishes the answer key," then later a **Result** page with score once
   released.

### 1.6 Teacher — Grading (portal flow — the part your original description
emphasized, and the old project had none of)
1. After the exam closes, teacher opens the exam from their dashboard →
   **Upload/Enter Answer Key** screen (mark correct option per question).
2. On save, the portal **automatically evaluates every submitted attempt**
   for that exam — no per-student manual action.
3. Teacher is redirected to a **Results Dashboard**: a table of every
   student who attempted the exam, with score, violation count, and
   submission time, sortable/searchable — a real gradebook, not a single
   hardcoded report row.
4. Clicking a student opens their **Report page**: question-by-question
   breakdown (their answer vs. correct answer), a violation timeline with
   evidence thumbnails, and a **Download PDF Report** button.

### 1.7 Why this matters for the restructure
Because the flow is a full portal (register → verify → enroll → dashboard →
exam → grade → report) rather than a single proctoring session, the folder
structure below deliberately has a distinct router/page/service for **every
stage of this journey** — auth, exams, attempts, proctoring, and reports are
five separate concerns, not one `app.py`.

---

## 2. New Folder Structure

```
examguard-ai/
├── README.md
├── GUIDE.md
├── docker-compose.yml                 # optional, runs backend+frontend+db together
│
├── backend/
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── main.py                    # FastAPI app instance, includes routers, CORS
│   │   ├── core/
│   │   │   ├── config.py              # settings (env vars: DB url, JWT secret, SMTP)
│   │   │   ├── security.py            # password hashing, JWT create/verify
│   │   │   └── deps.py                # get_current_user, role-based guards
│   │   ├── db/
│   │   │   ├── base.py                # SQLAlchemy Base, session
│   │   │   └── init_db.py
│   │   ├── models/                    # SQLAlchemy models (one file per table)
│   │   │   ├── user.py
│   │   │   ├── otp.py
│   │   │   ├── exam.py
│   │   │   ├── question.py
│   │   │   ├── attempt.py
│   │   │   ├── answer.py
│   │   │   └── violation.py
│   │   ├── schemas/                   # Pydantic request/response models
│   │   │   ├── user.py
│   │   │   ├── exam.py
│   │   │   ├── attempt.py
│   │   │   └── proctoring.py
│   │   ├── routers/                   # one router per feature = one file per old "route group"
│   │   │   ├── auth.py                # register, verify-otp, login
│   │   │   ├── students.py            # enroll-face, profile
│   │   │   ├── exams.py               # teacher create/edit exam + questions
│   │   │   ├── attempts.py            # start/answer/submit
│   │   │   ├── proctoring.py          # violation + identity-check endpoints
│   │   │   └── reports.py             # results dashboard + PDF export
│   │   ├── services/                  # business logic, kept OUT of routers
│   │   │   ├── otp_service.py         # generate/send/verify OTP (replaces nothing old, new)
│   │   │   ├── face_service.py        # wraps DeepFace/face_recognition calls
│   │   │   │                          #   (from old face_recognition.py, verify_candidate.py,
│   │   │   │                          #    exam_monitor.py's identity block)
│   │   │   ├── evaluation_service.py  # auto-grading logic (new)
│   │   │   ├── pdf_service.py         # from old frontend/app.py's reportlab code
│   │   │   └── pdf_parser_service.py  # extracts text from teacher-uploaded PDFs (new)
│   │   └── utils/
│   │       └── file_storage.py        # save/read evidence images, enrollment photos
│   └── storage/                       # gitignored — runtime files
│       ├── faces/<user_id>/*.jpg      # replaces old dataset/<name>/
│       ├── evidence/<attempt_id>/*.jpg
│       └── reports/*.pdf
│
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                     # routes
        ├── api/
        │   └── client.js               # axios instance + JWT interceptor
        ├── context/
        │   └── AuthContext.jsx
        ├── pages/
        │   ├── auth/
        │   │   ├── Register.jsx        # replaces login.html's missing register step
        │   │   ├── VerifyOtp.jsx
        │   │   └── Login.jsx           # replaces login.html
        │   ├── student/
        │   │   ├── FaceEnroll.jsx      # replaces dataset_capture.py (now in-browser)
        │   │   ├── Dashboard.jsx       # list of exams
        │   │   ├── Instructions.jsx    # replaces instructions.html
        │   │   ├── ExamRoom.jsx        # replaces exam.html — question UI + proctoring widget
        │   │   └── Result.jsx          # replaces result.html
        │   └── teacher/
        │       ├── ExamList.jsx
        │       ├── CreateExam.jsx      # PDF upload + question builder form
        │       ├── AnswerKey.jsx       # upload/select correct options
        │       ├── ResultsDashboard.jsx  # replaces admin.html
        │       └── StudentReport.jsx     # replaces evidence.html, per-student detail
        ├── components/
        │   ├── proctoring/
        │   │   ├── WebcamMonitor.jsx   # getUserMedia + face-api.js, replaces face_detection.py
        │   │   ├── TabSwitchGuard.jsx  # visibilitychange/blur listener, replaces tab_switch_detector.py
        │   │   └── ViolationLogger.jsx # posts violation events to backend
        │   ├── exam/
        │   │   ├── QuestionCard.jsx
        │   │   ├── Timer.jsx
        │   │   └── QuestionNavigator.jsx
        │   └── ui/                     # buttons, cards, modals, table — shared design system
        └── styles/
            └── index.css               # Tailwind entry
```

---

## 3. File-by-File Migration Map (old → new)

| Old file | Fate |
|---|---|
| `backend/main.py` (bare webcam test) | **Delete.** Was a test script, not app logic. |
| `backend/face_detection.py` | Rewritten as `frontend/src/components/proctoring/WebcamMonitor.jsx` (client-side, face-api.js) |
| `backend/dataset_capture.py` | Rewritten as `frontend/src/pages/student/FaceEnroll.jsx` + `backend/app/routers/students.py` |
| `backend/face_recognition.py`, `verify_candidate.py` | Merged into `backend/app/services/face_service.py`, called from `/api/students/enroll-face` and `/api/proctoring/identity-check` |
| `backend/exam_monitor.py` | Split: face-count/tab-switch logic → browser components; identity-check timer logic → `face_service.py` + `proctoring.py` router |
| `backend/tab_switch.py`, `tab_switch_detector.py` | Rewritten as `frontend/src/components/proctoring/TabSwitchGuard.jsx` (Page Visibility API — OS-window checks don't apply to a web app) |
| `backend/monitor_state.py` | No longer needed — state now lives in DB rows (`violations` table) and React state, not a global Python module |
| `backend/database.py` | Rewritten as SQLAlchemy models in `backend/app/models/` + a proper `db/base.py` session, instead of raw `sqlite3` calls |
| `backend/live_recognition.py` | Delete — was an experiment duplicate of `exam_monitor.py`'s identity logic |
| `frontend/app.py` (Flask) | Fully replaced by FastAPI `backend/app/main.py` + routers. Its reportlab block → `backend/app/services/pdf_service.py` |
| `frontend/templates/*.html`, `static/*` | Replaced 1:1 by React pages listed in the map above (Jinja templates → JSX components, server-rendered → client-rendered + API-driven) |
| `database/examguard.db`, root `examguard.db` | Keep as dev SQLite file (now pointed to by `DATABASE_URL` in `.env`), or move to Postgres later — just delete the duplicate at repo root |
| `backend/requirements.txt` (huge, has PyAutoGUI/pygetwindow/tensorflow/keras/etc. from unrelated experiments) | Replace with a minimal, purpose-built list (see below) |

---

## 4. New `backend/requirements.txt` (trim the old bloat)

```
fastapi
uvicorn[standard]
sqlalchemy
pydantic
pydantic-settings
python-jose[cryptography]
passlib[bcrypt]
python-multipart
pdfplumber
reportlab
deepface            # or face_recognition, pick one — don't need both tensorflow AND dlib
opencv-python-headless
python-dotenv
fastapi-mail          # or smtplib if you want zero extra deps
```
`opencv-python-headless` (not the GUI version) is important now — the backend
never opens a window again, it only processes uploaded images.

---

## 5. `.env.example` for the backend

```
DATABASE_URL=sqlite:///./examguard.db
JWT_SECRET=change-me
JWT_EXPIRE_MINUTES=60
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=app_password_here
DEV_MODE=true    # when true, OTPs are printed to console instead of emailed
```

---

## 6. Root-level cleanup

- Delete `.git` history bloat if you want a clean start: `rm -rf .git && git init`
  (optional — only if you don't need old commit history for your college submission).
- Delete stray backup files: `exam_monitor_backup.py`, `tab_switch_detector_backup.py`
  under `backend/evidence/` (evidence folder should only ever contain images/logs,
  not source files — that was accidental).
- Add a proper root `.gitignore`:
  ```
  backend/storage/
  backend/.env
  backend/*.db
  frontend/node_modules/
  frontend/dist/
  __pycache__/
  *.pyc
  ```
- Rename the repo/folder from `EXAMGUARDAI` to something consistent like
  `examguard-ai` (lowercase-hyphen is conventional for a real product repo).

---

## 7. Running it locally (once restructured)

```bash
# backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# frontend
cd frontend
npm install
npm run dev
```

Frontend calls `http://localhost:8000/api/...` via the axios client in
`src/api/client.js` — set `VITE_API_URL` in a `frontend/.env` to point at it.

---

This structure scales cleanly if you later want to add Docker, a proper
Postgres deployment, or CI — every concern (auth, exams, proctoring,
reporting) already lives in its own router/service/component instead of
being tangled into one `app.py` file like before.
