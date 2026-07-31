# ExamGuard AI — Complete Master Change Plan

This is the single consolidated file covering **everything discussed** — checked directly against the active codebase, with each item marked with its real verified status.

**Legend:** ✅ Done (verified in code) · ⚠️ Configured / optional toggle · ❌ Not done yet (Remaining Feature)

---

## Status Overview

| # | Item | Status |
|---|------|--------|
| 1 | Bug: `reports.py` missing `settings` import | ✅ Done |
| 2 | Bug: hardcoded secrets in `config.py` | ✅ Done |
| 3 | Bug: unprotected `create_teacher` endpoint | ✅ Done |
| 4 | Real identity verification (no mock) | ✅ Done — via DeepFace (VGG-Face, cosine) |
| 5 | Answer-key: creation-time vs post-hoc restructure | ✅ Done — `QuestionResponse.correct_option`, `/exams/{id}/answer-key` review tool |
| 6 | Admin creates teacher, password emailed | ✅ Done |
| 7 | Forgot password (all roles) | ✅ Done |
| 8 | Modern UI/UX System & API Button Feedback | ✅ Done — Modern theme, loading spinners & auto-refetch across all actions |
| 9 | Question shuffling per student | ✅ Done — `rng = random.Random(attempt.id)` in `attempts.py` |
| 10 | Auto-submit / Lockout on violation threshold | ⚠️ Configured in `proctoring.py` (`MAX_VIOLATIONS_BEFORE_AUTO_SUBMIT`) |
| 11 | Flag-for-review threshold | ✅ Done — `FLAG_FOR_REVIEW_THRESHOLD = 3` in `reports.py` |
| 12 | Bulk CSV/Excel import | ✅ Done — `csv_parser_service.py` & `/exams/upload-sheet` |
| 13 | Camera/mic self-check screen | ✅ Done — `CameraCheck.jsx` with mic level meter & face check |
| 14 | Class-level analytics | ✅ Done — `ClassAnalytics.jsx` with Recharts & backend analytics endpoints |
| 15 | Silero VAD Audio Monitoring (Anti-Cheat) | ❌ **Remaining Feature (Phase 1)** |
| 16 | Live Viva / Oral Examination Mode | ❌ **Remaining Feature (Phase 2)** |
| 17 | Rebrand name options | For your decision |

---

## Part 1 — ✅ Completed Items (Verified in Codebase)

### 1.1 Core Bug Fixes & Security
- `reports.py` imports `settings` correctly.
- `config.py` requires `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD` from `.env`.
- `create_teacher` endpoint protected with `RoleChecker(["admin"])`.

### 1.2 Identity Verification & Security
- Real DeepFace (VGG-Face, cosine distance) verification running server-side in `face_service.py`.
- Generates `identity_mismatch` proctoring violations on verification failure.

### 1.3 Teacher & Auth Features
- Admin creates teacher account with random temporary password sent via email (`email_service.py`). First login forces password change.
- Forgot password (`/auth/forgot-password`) & Reset password (`/auth/reset-password`) using OTP verification.

### 1.4 Answer-Key Architecture Restructure
- `QuestionResponse.correct_option` exposed in `schemas/exam.py`.
- Endpoint `POST /exams/{exam_id}/answer-key` acts as a correction tool (`review_and_correct_answers`) that updates keys and automatically re-evaluates past submissions.
- `AnswerKey.jsx` pre-fills existing answer choices for teacher review.

### 1.5 Question Shuffling Per Student
- Implemented in `attempts.py` via `rng = random.Random(attempt.id)` shuffling question order deterministically per student attempt.

### 1.6 Flag-For-Review Threshold
- Implemented in `reports.py` with `FLAG_FOR_REVIEW_THRESHOLD = 3`. Results return `flagged_for_review: true` pre-sorted at top of teacher reports dashboard.

### 1.7 Bulk Question CSV/Excel Import
- Implemented in `csv_parser_service.py` using `pandas`/`openpyxl` parsing `question`, `option_a`, `option_b`, `option_c`, `option_d`, `correct_option` columns via `POST /exams/upload-sheet`.

### 1.8 Camera & Mic Self-Check Screen
- Implemented in `CameraCheck.jsx` featuring real-time AudioContext microphone volume level meter and `face-api.js` camera face alignment check before starting exams.

### 1.9 Class-Level Analytics
- Implemented in `ClassAnalytics.jsx` using Recharts for question difficulty breakdown, violation pie chart distribution, average class scores, and total submission stats via `/reports/teacher/exams/{id}/analytics` and `/classes/{id}/analytics`.

### 1.10 Modern UI & Responsive Button Feedback
- Complete design system overhaul with modern color palette (`brand-950`), custom card shadows, glassmorphism, responsive status badges, font pairings (`Outfit` + `Inter`), button loading state spinners, and automatic UI refetching on all API responses.

---

## Part 2 — ❌ Remaining Features Specification

### 2.1 Silero VAD Audio Monitoring (Anti-Cheat Audio Detection)

Replace basic amplitude noise detection with **Silero VAD (Voice Activity Detection)** running ONNX Runtime Web directly inside the student browser (`ExamRoom.jsx`).

#### Requirements:
- **Browser VAD Engine:** Load Silero VAD ONNX model (`silero_vad.onnx`) in browser via `@onnxruntime/web`.
- **Speech Event Logging:** When student speaks during an MCQ exam, log a `speech_detected` violation.
- **Audio Evidence Recording:** Capture a 3-5 second audio snippet on speech detection and upload it to backend storage.
- **Teacher Playback:** Include an inline audio player in `StudentReport.jsx` to let teachers listen to flagged speech clips.

---

### 2.2 Live Viva / Oral Examination Mode

Allow teachers to create and conduct **Live Oral Viva Exams** in addition to standard online written exams.

#### Requirements & Workflow:
1. **Exam Mode Selector:**
   - When creating an exam, teacher can switch exam type between `Online Written (MCQ)` or `Live Viva (Oral)`.
2. **Oral Viva Interface for Students:**
   - Displays questions sequentially with a top **Countdown Timer** per question.
   - **Voice Prompt / Text-to-Speech:** Automatically reads out the question orally to the student using browser Web Speech API / TTS.
   - **Oral Response Recording:** Student answers questions orally via microphone. Audio response is recorded or streamed via WebMediaRecorder / Speech Recognition.
3. **Teacher Evaluation & Feedback Interface:**
   - Teacher can join live or review oral recordings, listen to student answers per question, assign marks, and provide direct feedback comments.

---

### 2.3 Strict Auto-Submit Lockout Toggle

Strict lockout option when a student reaches maximum allowed violations (e.g. 5 violations).

#### Requirements:
- Automatically freeze `ExamRoom.jsx` UI with warning lockout modal.
- Backend `proctoring.py` marks `attempt.status = "submitted"` and triggers auto-grading of answered questions immediately.

---

## Part 3 — Website Rebrand Name Options

Alternatives for project naming:

**Institutional & Professional**
- **Invigila** — Short, formal academic invigilation term.
- **ProctorIQ** — Smart AI-assisted proctoring.
- **Veritest** — Verification + testing platform.

**Modern & Approachable**
- **Honestly** — Focuses on academic integrity.
- **ClearRoom** — Transparent, monitored exam environment.
- **Vigilo** — Concise SaaS branding ("I watch" in Latin).

---

## Part 4 — Redesign Specification Reference

- Standardized color system: `brand-600` primary with emerald/amber status indicators.
- Standardized border radius (`rounded-2xl` cards, `rounded-xl` buttons).
- Compact fixed-corner video preview thumbnail during exam taking.