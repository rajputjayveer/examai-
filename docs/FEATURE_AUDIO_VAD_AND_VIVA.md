# ExamGuardAI — Audio Monitoring & Viva Feature Plan

> **Document Status:** Draft — Not yet implemented
> **Created:** 2026-07-28
> **Scope:** Two-phase plan — Phase 1 is anti-cheat audio monitoring for live exams; Phase 2 is a full Live Viva / oral examination mode.

---

## Table of Contents

1. [Phase 1 — Silero VAD Audio Monitoring (Anti-Cheat)](#phase-1)
   - [Goal](#phase-1-goal)
   - [Architecture](#phase-1-architecture)
   - [Backend Changes](#phase-1-backend)
   - [Frontend Changes](#phase-1-frontend)
   - [Database Migration](#phase-1-db)
   - [Dependencies](#phase-1-deps)
   - [Verification Plan](#phase-1-verify)

2. [Phase 2 — Live Viva / Oral Examination Mode](#phase-2)
   - [Goal](#phase-2-goal)
   - [Architecture](#phase-2-architecture)
   - [Backend Changes](#phase-2-backend)
   - [Frontend Changes](#phase-2-frontend)
   - [Database Changes](#phase-2-db)
   - [Dependencies](#phase-2-deps)
   - [Verification Plan](#phase-2-verify)

---

<a name="phase-1"></a>
## Phase 1 — Silero VAD Audio Monitoring (Anti-Cheat)

<a name="phase-1-goal"></a>
### Goal

Replace the existing crude amplitude-threshold noise detector in `ExamRoom.jsx` with **Silero VAD** — a real neural speech detector that runs entirely in the browser via ONNX Runtime Web. When a student actually **speaks** during an MCQ exam:

- A `speech_detected` violation is logged (same pipeline as `no_face`, `multi_face` etc.)
- A short audio clip is recorded and uploaded as evidence
- The teacher can **play back** the audio clip in the Student Report

**What does NOT change in Phase 1:**
- Exam format stays MCQ / written
- No oral questioning, no viva
- No server-side audio processing — VAD runs 100% in the browser

---

<a name="phase-1-architecture"></a>
### Architecture

```
Browser — Student ExamRoom
  └─ MediaStream (video + audio)
       ├─ [EXISTING] Video → face-api.js → face count / identity checks
       │
       ├─ [REPLACE] Old: AudioContext analyser → amplitude > 35 → "high_noise"
       │
       └─ [NEW] Audio track (16kHz resampled)
                └─ ScriptProcessorNode / AudioWorklet (512-sample frames)
                     └─ Silero VAD ONNX model (onnxruntime-web, ~2MB)
                          ├─ speech_prob < 0.5  →  "Listening" (grey pill)
                          └─ speech_prob ≥ 0.5 for ≥ 2s
                               ├─ triggerViolation("speech_detected")
                               └─ MediaRecorder → 10s .webm clip
                                    └─ POST /proctoring/audio-evidence

Backend — FastAPI
  ├─ [EXISTING] /proctoring/violation   ← speech_detected type added
  ├─ [NEW]      /proctoring/audio-evidence  ← receives .webm clip
  └─ [NEW]      /static/silero_vad.onnx    ← served as static file

Teacher UI
  └─ StudentReport.jsx
       └─ [MODIFY] Violations list → audio <audio> player for speech_detected
```

---

<a name="phase-1-backend"></a>
### Backend Changes

#### 1. `backend/app/models/violation.py` — Add `audio_path` column

```python
# Add this column to the Violation model
audio_path = Column(String(500), nullable=True)
# Stores: "audio/<attempt_id>/<timestamp>_speech.webm"
# Existing type comment: add "speech_detected" to the list
# type = Column(String(50)) # "no_face","multi_face","tab_switch","identity_mismatch","speech_detected"
```

#### 2. `backend/app/schemas/proctoring.py` — Add audio_path to response

```python
from typing import Optional

class ViolationResponse(BaseModel):
    id: int
    attempt_id: int
    type: str
    evidence_path: Optional[str] = None
    audio_path: Optional[str] = None   # ← NEW
    created_at: datetime

    class Config:
        from_attributes = True
```

#### 3. `backend/app/routers/proctoring.py` — New audio-evidence endpoint

```python
from fastapi import UploadFile, File, Form

@router.post("/audio-evidence")
async def upload_audio_evidence(
    attempt_id: int = Form(...),
    current_user: User = Depends(RoleChecker(["student"])),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    attempt = db.query(Attempt).filter(
        Attempt.id == attempt_id,
        Attempt.student_id == current_user.id
    ).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    audio_dir = os.path.join(STORAGE_DIR, "audio", str(attempt_id))
    os.makedirs(audio_dir, exist_ok=True)

    timestamp = int(datetime.utcnow().timestamp())
    filename = f"{timestamp}_speech.webm"
    file_path = os.path.join(audio_dir, filename)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    audio_path = f"audio/{attempt_id}/{filename}"

    # Create a violation record for this speech event
    violation = Violation(
        attempt_id=attempt_id,
        type="speech_detected",
        audio_path=audio_path
    )
    db.add(violation)
    db.commit()
    db.refresh(violation)

    return {
        "id": violation.id,
        "audio_path": audio_path
    }
```

#### 4. `backend/app/main.py` — Serve static files

```python
from fastapi.staticfiles import StaticFiles

# Mount static files (for silero_vad.onnx model)
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Mount storage/audio for teacher playback
AUDIO_STORAGE = os.path.join(os.path.dirname(__file__), "..", "storage", "audio")
os.makedirs(AUDIO_STORAGE, exist_ok=True)
app.mount("/storage/audio", StaticFiles(directory=AUDIO_STORAGE), name="audio_storage")
```

#### 5. Download & place the ONNX model

```bash
# Run from project root — downloads silero_vad.onnx to backend/static/
curl -L "https://github.com/snakers4/silero-vad/raw/master/files/silero_vad.onnx" \
     -o backend/static/silero_vad.onnx
```

> **Note:** The model is ~2 MB. Check it once into git or add to `.gitignore` and document the download step.

---

<a name="phase-1-frontend"></a>
### Frontend Changes

#### 1. Install `onnxruntime-web`

```bash
cd frontend
npm install onnxruntime-web@^1.18.0
```

#### 2. New file: `frontend/src/hooks/useVAD.js`

```js
/**
 * useVAD — Silero VAD hook
 * Accepts a MediaStream, returns { isSpeaking, speechProb, vadReady }
 *
 * Model requirements: silero_vad.onnx served at /static/silero_vad.onnx
 * Input: float32[1, 1, 512] at 16kHz
 * Output: float32 speech probability (0..1)
 */

import { useEffect, useRef, useState } from 'react';
import * as ort from 'onnxruntime-web';

const MODEL_URL = '/static/silero_vad.onnx';
const SAMPLE_RATE = 16000;
const FRAME_SIZE = 512;

export function useVAD(stream) {
  const [vadReady, setVadReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechProb, setSpeechProb] = useState(0);

  const sessionRef = useRef(null);
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  // Silero VAD stateful tensors (h, c)
  const hRef = useRef(null);
  const cRef = useRef(null);

  useEffect(() => {
    if (!stream) return;
    let cancelled = false;

    async function init() {
      try {
        // Load ONNX model
        const session = await ort.InferenceSession.create(MODEL_URL, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        sessionRef.current = session;

        // Reset stateful h/c tensors
        hRef.current = new ort.Tensor('float32', new Float32Array(2 * 1 * 64), [2, 1, 64]);
        cRef.current = new ort.Tensor('float32', new Float32Array(2 * 1 * 64), [2, 1, 64]);

        if (cancelled) return;
        setVadReady(true);

        // Create AudioContext at 16kHz (resampled from browser default ~48kHz)
        const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
        audioCtxRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(FRAME_SIZE, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = async (event) => {
          if (!sessionRef.current || cancelled) return;
          const inputData = event.inputBuffer.getChannelData(0);
          const frame = new Float32Array(FRAME_SIZE);
          frame.set(inputData.slice(0, FRAME_SIZE));

          const inputTensor = new ort.Tensor('float32', frame, [1, 1, FRAME_SIZE]);
          const srTensor = new ort.Tensor('int64', [BigInt(SAMPLE_RATE)], [1]);

          const feeds = {
            input: inputTensor,
            sr: srTensor,
            h: hRef.current,
            c: cRef.current,
          };

          const results = await sessionRef.current.run(feeds);
          const prob = results.output.data[0];

          // Update stateful h/c for next frame
          hRef.current = results.hn;
          cRef.current = results.cn;

          setSpeechProb(prob);
          setIsSpeaking(prob >= 0.5);
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);

      } catch (e) {
        console.warn('[Silero VAD] Failed to initialize:', e);
      }
    }

    init();

    return () => {
      cancelled = true;
      processorRef.current?.disconnect();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [stream]);

  return { isSpeaking, speechProb, vadReady };
}
```

#### 3. Modify `ExamRoom.jsx` — Replace amplitude check with VAD

**Remove** (lines ~107–131 in current ExamRoom.jsx):
```js
// REMOVE THIS ENTIRE BLOCK:
try {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioCtxRef.current = audioCtx;
  const source = audioCtx.createMediaStreamSource(ms);
  const analyser = audioCtx.createAnalyser();
  // ... amplitude interval ...
  audioIntervalRef.current = setInterval(() => { /* high_noise logic */ }, 1000);
} catch (ae) { ... }
```

**Add** in `ExamRoom.jsx`:
```js
import { useVAD } from '../../hooks/useVAD';

// Inside component:
const [audioStream, setAudioStream] = useState(null);
const { isSpeaking, speechProb, vadReady } = useVAD(audioStream);

// After getUserMedia succeeds, expose the stream to the VAD hook:
setAudioStream(ms);

// Speech violation logic — with cooldown and MediaRecorder
const speechCooldownRef = useRef(false);
const speechStartRef = useRef(null);
const recorderRef = useRef(null);
const recordedChunksRef = useRef([]);

useEffect(() => {
  if (!isSpeaking) {
    speechStartRef.current = null;
    return;
  }
  if (!speechStartRef.current) {
    speechStartRef.current = Date.now();
  }
  const elapsed = (Date.now() - speechStartRef.current) / 1000;
  if (elapsed >= 2 && !speechCooldownRef.current) {
    speechCooldownRef.current = true;
    triggerViolation('speech_detected', '⚠ Speaking detected! Remain silent during the exam.');

    // Start recording a 10-second clip
    if (audioStream) {
      const audioOnlyStream = new MediaStream(audioStream.getAudioTracks());
      const recorder = new MediaRecorder(audioOnlyStream, { mimeType: 'audio/webm' });
      recorderRef.current = recorder;
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('attempt_id', attemptId);
        formData.append('file', blob, 'speech_clip.webm');
        try {
          await client.post('/proctoring/audio-evidence', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        } catch (e) { console.warn('Audio evidence upload failed:', e); }
      };
      recorder.start();
      setTimeout(() => recorder.stop(), 10000);
    }

    // 30-second cooldown before re-triggering
    setTimeout(() => { speechCooldownRef.current = false; }, 30000);
  }
}, [isSpeaking]);
```

**Add HUD mic status pill** (alongside the existing face count badge):
```jsx
{/* Mic / VAD status pill */}
<div style={{
  display: 'flex', alignItems: 'center', gap: '6px',
  background: isSpeaking ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.07)',
  border: `1px solid ${isSpeaking ? '#dc2626' : '#4b5563'}`,
  borderRadius: '20px', padding: '4px 12px', fontSize: '13px',
  color: isSpeaking ? '#fca5a5' : '#9ca3af',
  animation: isSpeaking ? 'pulse 1s infinite' : 'none',
}}>
  🎙 {vadReady ? (isSpeaking ? 'Speech Detected!' : 'Listening') : 'VAD Loading...'}
</div>
```

#### 4. Modify `StudentReport.jsx` — Teacher audio playback

In the violation cards loop, add audio player for `speech_detected` violations:

```jsx
{violation.type === 'speech_detected' && violation.audio_path && (
  <div style={{ marginTop: '8px' }}>
    <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
      🎙 Audio Evidence
    </p>
    <audio
      controls
      src={`http://localhost:8000/storage/${violation.audio_path}`}
      style={{ width: '100%', height: '36px' }}
    />
  </div>
)}
```

---

<a name="phase-1-db"></a>
### Database Migration

Run this SQL against `examguard.db` before starting the backend:

```sql
-- database/migrations/001_add_audio_path_to_violations.sql
ALTER TABLE violations ADD COLUMN audio_path VARCHAR(500);
```

Or run in Python (one-off):
```python
import sqlite3
conn = sqlite3.connect("examguard.db")
conn.execute("ALTER TABLE violations ADD COLUMN audio_path VARCHAR(500)")
conn.commit()
conn.close()
```

---

<a name="phase-1-deps"></a>
### Dependencies

| Package | Location | Version | Purpose |
|---|---|---|---|
| `onnxruntime-web` | `frontend/` (npm) | `^1.18.0` | Run Silero VAD ONNX model in browser |
| `silero_vad.onnx` | `backend/static/` | Latest | Model weights (~2 MB) |

No new Python pip packages required.

---

<a name="phase-1-verify"></a>
### Verification Checklist

- [ ] `GET /static/silero_vad.onnx` returns HTTP 200
- [ ] `POST /proctoring/audio-evidence` with a `.webm` file saves correctly
- [ ] Start exam → VAD pill shows "VAD Loading..." → transitions to "Listening" (grey)
- [ ] Speak for 3+ seconds → pill turns red "Speech Detected!" → violation logged
- [ ] Background noise (typing, AC) does NOT trigger a violation
- [ ] Teacher opens Student Report → `speech_detected` violation has audio player
- [ ] Clicking play on audio player works; audio is audible

---
---

<a name="phase-2"></a>
## Phase 2 — Live Viva / Oral Examination Mode

> **Status:** Planned — implement after Phase 1 is stable
> **Prerequisite:** Phase 1 (audio monitoring infrastructure) must be deployed

<a name="phase-2-goal"></a>
### Goal

Add a brand-new **Viva exam mode** alongside the existing MCQ exam. In Viva mode:

- The teacher **types or pre-loads questions** for the viva session
- During the exam, questions are **displayed one by one** to the student with a **countdown timer** per question
- A **voice prompt** reads each question aloud (browser TTS or recorded audio)
- The student **answers orally** — their audio is recorded per question
- The teacher can **listen to each answer** from the proctoring/report panel and **type feedback/marks**
- Silero VAD confirms the student is actually speaking (and flags silence as a potential issue)

---

<a name="phase-2-architecture"></a>
### Architecture

```
Teacher Flow:
  CreateExam.jsx
    └─ Toggle: [MCQ Exam] / [Viva Exam]
         └─ Viva: add questions (text only, no options, no correct_option)
              └─ Each question has: duration_seconds (default 120)

Student Flow:
  VivaRoom.jsx  (new page, separate from ExamRoom.jsx)
    ├─ Question displayed (one at a time, full screen)
    ├─ Countdown bar per question (e.g. 2 min/question)
    ├─ Voice prompt: browser speechSynthesis.speak(question.text)
    ├─ MediaRecorder: records audio for entire question duration
    ├─ Silero VAD: shows "You are speaking" / "Not speaking" indicator
    ├─ Auto-advances to next question when timer hits 0
    └─ On completion: all clips uploaded, attempt marked submitted

Teacher Review Flow:
  VivaReview.jsx  (new page)
    ├─ Lists all students and their viva attempts
    ├─ For each student → each question → <audio> player
    ├─ Score input field per question
    └─ Submit marks → updates attempt.score

Backend:
  ├─ exams.exam_type column: "mcq" | "viva"
  ├─ questions.duration_seconds column (viva only)
  ├─ viva_answers table: attempt_id, question_id, audio_path, teacher_score, teacher_feedback
  └─ /viva/answer endpoint: upload audio clip per question
```

---

<a name="phase-2-backend"></a>
### Backend Changes

#### 1. `backend/app/models/exam.py` — Add `exam_type`

```python
exam_type = Column(String(20), default="mcq")  # "mcq" | "viva"
```

#### 2. `backend/app/models/question.py` — Add `duration_seconds`

```python
duration_seconds = Column(Integer, nullable=True)  # Per-question time limit (viva only)
# option_a/b/c/d and correct_option can be NULL for viva questions
```

#### 3. New model: `backend/app/models/viva_answer.py`

```python
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base

class VivaAnswer(Base):
    __tablename__ = "viva_answers"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    audio_path = Column(String(500), nullable=True)      # Recorded answer clip
    teacher_score = Column(Float, nullable=True)          # Marks given by teacher
    teacher_feedback = Column(Text, nullable=True)        # Written feedback
    recorded_at = Column(DateTime, server_default=func.now())

    attempt = relationship("Attempt", back_populates="viva_answers")
    question = relationship("Question")
```

#### 4. New router: `backend/app/routers/viva.py`

**Endpoints:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/viva/answer` | Student uploads audio clip for one question |
| `GET` | `/viva/{attempt_id}/answers` | Teacher fetches all audio answers for a student |
| `PUT` | `/viva/answer/{answer_id}/grade` | Teacher submits score + feedback per question |
| `POST` | `/viva/{attempt_id}/submit` | Mark viva attempt as submitted |

```python
# POST /viva/answer  — student uploads one audio clip
@router.post("/answer")
async def submit_viva_answer(
    attempt_id: int = Form(...),
    question_id: int = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(RoleChecker(["student"])),
    db: Session = Depends(get_db)
):
    # Save audio to storage/viva/<attempt_id>/<question_id>_<timestamp>.webm
    # Upsert VivaAnswer record
    ...

# PUT /viva/answer/{answer_id}/grade  — teacher grades one answer
@router.put("/answer/{answer_id}/grade")
def grade_viva_answer(
    answer_id: int,
    score: float = Body(...),
    feedback: str = Body(""),
    current_user: User = Depends(RoleChecker(["teacher"])),
    db: Session = Depends(get_db)
):
    # Update viva_answer.teacher_score and .teacher_feedback
    ...
```

---

<a name="phase-2-frontend"></a>
### Frontend Changes

#### New page: `frontend/src/pages/student/VivaRoom.jsx`

Key UI sections:
1. **Header bar** — Exam title | Student name | Overall viva progress (`Question 2 of 5`)
2. **Countdown ring** — Large circular countdown per question (e.g. `1:45` remaining), animate red when < 30s
3. **Question card** — Full-width card showing question text. Voice prompt plays automatically on load.
4. **Speaking indicator** — Silero VAD pill: `🎙 Keep Speaking` (green) / `⚠ No Audio Detected` (orange)
5. **Recording badge** — `🔴 Recording` while MediaRecorder is active
6. **Auto-advance** — When timer hits 0 OR student clicks "Next Question", clip is uploaded, next question loads
7. **Completion screen** — After last question, show "Viva Complete — Awaiting Teacher Review"

```jsx
// Rough component structure:
export default function VivaRoom() {
  const { attemptId } = useParams();
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const [recording, setRecording] = useState(false);
  const [completed, setCompleted] = useState(false);

  const { isSpeaking, vadReady } = useVAD(audioStream);

  // Auto-play question voice prompt
  useEffect(() => {
    if (!questions[currentIndex]) return;
    const utterance = new SpeechSynthesisUtterance(questions[currentIndex].text);
    utterance.rate = 0.9;
    utterance.lang = 'en-IN';  // or configurable
    window.speechSynthesis.speak(utterance);
    startRecording();
  }, [currentIndex]);

  // Auto-advance when time runs out
  useEffect(() => {
    if (timeLeft === 0) advanceToNext();
  }, [timeLeft]);

  // ... rest of component
}
```

#### New page: `frontend/src/pages/teacher/VivaReview.jsx`

```
Layout:
  ┌─────────────────────────────────────────────┐
  │  Viva Review — [Exam Name]                  │
  ├─────────────────────────────────────────────┤
  │  Student: [Name]  [< Prev Student]  [Next >]│
  ├─────────────────────────────────────────────┤
  │  Q1: [Question text...]                     │
  │  ───────────────────────────────────────    │
  │  [▶ Audio Player ──────────────────]        │
  │  Score: [___] / 10   Feedback: [_______]    │
  │                              [Save ✓]       │
  ├─────────────────────────────────────────────┤
  │  Q2: ...  (collapsed, expand on click)      │
  └─────────────────────────────────────────────┘
```

#### Modify `CreateExam.jsx` — Add exam_type toggle

```jsx
// At the top of the exam creation form:
<div className="exam-type-toggle">
  <label>Exam Type</label>
  <div className="toggle-group">
    <button
      className={examType === 'mcq' ? 'active' : ''}
      onClick={() => setExamType('mcq')}
    >
      📝 Written (MCQ)
    </button>
    <button
      className={examType === 'viva' ? 'active' : ''}
      onClick={() => setExamType('viva')}
    >
      🎙 Live Viva (Oral)
    </button>
  </div>
</div>

{/* Viva: show duration per question instead of options */}
{examType === 'viva' && (
  <input
    type="number"
    placeholder="Seconds per question (e.g. 120)"
    value={question.duration_seconds}
    onChange={...}
  />
)}
```

#### Modify `App.jsx` — Add new routes

```jsx
// Student routes
<Route path="/exam/viva/:attemptId" element={<VivaRoom />} />

// Teacher routes
<Route path="/teacher/viva-review/:examId" element={<VivaReview />} />
```

#### Modify `ExamList.jsx` (teacher) — Viva exam indicator

```jsx
// In the exam card, show a badge for viva exams
{exam.exam_type === 'viva' && (
  <span className="badge viva-badge">🎙 Viva</span>
)}
// Add "Review Viva Answers" button for viva exams
{exam.exam_type === 'viva' && (
  <button onClick={() => navigate(`/teacher/viva-review/${exam.id}`)}>
    Review Answers
  </button>
)}
```

#### Modify `JoinExam.jsx` (student) — Route to correct room

```jsx
// After starting attempt, check exam_type:
if (exam.exam_type === 'viva') {
  navigate(`/exam/viva/${attempt.id}`);
} else {
  navigate(`/exam/${attempt.id}`);
}
```

---

<a name="phase-2-db"></a>
### Database Changes

```sql
-- database/migrations/002_viva_support.sql

-- 1. Add exam_type to exams
ALTER TABLE exams ADD COLUMN exam_type VARCHAR(20) DEFAULT 'mcq';

-- 2. Add duration_seconds to questions
ALTER TABLE questions ADD COLUMN duration_seconds INTEGER;

-- 3. New table for viva answers
CREATE TABLE IF NOT EXISTS viva_answers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id      INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    audio_path      VARCHAR(500),
    teacher_score   REAL,
    teacher_feedback TEXT,
    recorded_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_viva_answers_attempt ON viva_answers(attempt_id);
```

---

<a name="phase-2-deps"></a>
### Dependencies

| Dependency | Notes |
|---|---|
| `onnxruntime-web` | Already added in Phase 1 — reuse `useVAD` hook |
| Browser `SpeechSynthesis` API | Native browser API — no package needed |
| `MediaRecorder` API | Native browser API — no package needed |

No new Python packages required.

---

<a name="phase-2-verify"></a>
### Verification Checklist

**Teacher / Setup:**
- [ ] Teacher can toggle exam type to "Viva" in CreateExam
- [ ] Teacher can set per-question duration (seconds)
- [ ] Viva exams show 🎙 badge in ExamList
- [ ] "Review Answers" button navigates to VivaReview

**Student / Exam:**
- [ ] Student joins viva exam → routed to VivaRoom (not ExamRoom)
- [ ] First question loads → voice prompt plays automatically
- [ ] Countdown timer counts down correctly, turns red at < 30s
- [ ] VAD shows green "Keep Speaking" while student talks
- [ ] `🔴 Recording` badge shows while MediaRecorder is active
- [ ] After timer hits 0 → clip uploads → next question loads automatically
- [ ] After last question → "Viva Complete" screen shown
- [ ] All attempts are submitted correctly

**Teacher / Review:**
- [ ] VivaReview shows all students who attempted the viva
- [ ] For each student: each question with audio player
- [ ] Audio clips are playable
- [ ] Teacher can enter score + feedback and save per question
- [ ] Saving updates the viva_answers record correctly
- [ ] Final score is computed as sum/average of per-question scores

---

## Implementation Order (Recommended)

```
Phase 1  ─────────────────────────────────────────────────────────
  Step 1.1  Download silero_vad.onnx → backend/static/
  Step 1.2  DB migration: add audio_path to violations
  Step 1.3  Backend: add audio-evidence endpoint + static mounts
  Step 1.4  Frontend: create useVAD.js hook
  Step 1.5  Frontend: replace ExamRoom amplitude check with useVAD
  Step 1.6  Frontend: add HUD mic pill
  Step 1.7  Frontend: teacher StudentReport audio player
  Step 1.8  Test full flow (speak → violation → teacher plays clip)

Phase 2  ─────────────────────────────────────────────────────────
  Step 2.1  DB migration: exam_type, duration_seconds, viva_answers
  Step 2.2  Backend: update Exam model + Question model
  Step 2.3  Backend: create viva_answer.py model
  Step 2.4  Backend: create viva.py router with all endpoints
  Step 2.5  Frontend: CreateExam.jsx exam_type toggle
  Step 2.6  Frontend: build VivaRoom.jsx (student)
  Step 2.7  Frontend: build VivaReview.jsx (teacher)
  Step 2.8  Frontend: update JoinExam routing logic
  Step 2.9  Frontend: update ExamList with viva badge
  Step 2.10 Test full viva flow end-to-end
```

---

*End of document — `FEATURE_AUDIO_VAD_AND_VIVA.md`*
