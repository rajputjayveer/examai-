# ExamGuard AI: Master Project & Attendance Implementation Plan

**Project Title:** ExamGuard AI — Intelligent AI Proctoring & Zero-Proxy Biometric Attendance System  
**Current Milestone:** Review 2 Completed (26/09/2026) ➔ Sprint 3 / Final Review Implementation  
**Repository:** [https://github.com/rajputjayveer/examai-](https://github.com/rajputjayveer/examai-)  

---

## 1. Status Overview: Review 2 Completed Features ✅

The following features have been built, integrated, tested, and demonstrated:

| # | Module / Feature | Status | Implementation Details |
|---|---|:---:|---|
| 1 | **Role-Based Auth & Session Security** | ✅ Live | JWT-based auth, bcrypt password hashing, role hierarchy (`admin`, `teacher`, `student`), OTP password recovery. |
| 2 | **ArcFace Biometric Face Engine** | ✅ Live | DeepFace with ArcFace model ($d \le 0.48$ cosine distance). Reference photo stored securely in isolated student directories. |
| 3 | **Pre-Exam Hardware Self-Check** | ✅ Live | `CameraCheck.jsx`: Real-time face framing and Web Audio API microphone volume meter before exam entry. |
| 4 | **Multi-Guard AI Proctoring Engine** | ✅ Live | Tracks face absence, multiple faces, head yaw/pitch looking-away, tab switches, and noise bursts with jittered polling. |
| 5 | **Deterministic Question Shuffling** | ✅ Live | PRNG seeded with `attempt.id` so every student receives a unique question sequence for the same exam. |
| 6 | **Bulk Excel / CSV Question Importer** | ✅ Live | Teachers upload `.xlsx` or `.csv` sheets parsed via `pandas` and `openpyxl` with schema validation. |
| 7 | **Automated Answer Key & Regrading** | ✅ Live | Retroactively re-evaluates all student submissions upon answer key corrections. |
| 8 | **Violations Threshold & Flagging** | ✅ Live | Auto-pins attempts with $\ge 3$ violations to the top of the teacher's audit list. |
| 9 | **Class Analytics & Charts** | ✅ Live | Recharts visualizations: score distributions, question difficulty indexes, violation category breakdowns. |
| 10 | **Student Biometric Reset & Approval Workflow** | ✅ Live | Complete lifecycle: Student submits reset request with reason ➔ Teacher sees amber alert in `StudentProfileModal.jsx` ➔ One-click approval safely purges stale facial embeddings + notifies student to re-enroll. |

---

## 2. Review 3 Milestone: Zero-Proxy Smart Classroom Attendance System

Following faculty guidance, we are developing a **Zero-Proxy Classroom Attendance System** designed to eliminate proxy attendance in live lectures without requiring specialized biometric hardware.

### Core Architectural Pillars
1. **Cryptographic Rolling QR (HMAC-SHA256):** Rotates every 5 seconds with a strict 10-second Time-To-Live (TTL). Prevents WhatsApp screenshot sharing.
2. **GPS Geofencing (Haversine Formula):** Verifies the student is physically within $\le 50\text{ meters}$ of classroom coordinates. Prevents off-campus scanning.
3. **Hardware Device Fingerprinting:** Browser canvas, WebGL, and hardware profile hashed into a unique string. Enforces 1 check-in per physical device per lecture session.
4. **Decoupled Architecture:** Operates under isolated `/api/attendance` endpoints with dedicated tables (`attendance_sessions`, `attendance_records`), completely independent of exam proctoring code.

---

## 3. Pen & Paper Explanatory Flow (For Faculty & Review Panel)

```
┌────────────────────────────────┐     ┌────────────────────────────────┐     ┌────────────────────────────────┐
│         TEACHER SCREEN         │     │         STUDENT PHONE          │     │         BACKEND SERVER         │
│          (Projector)           │     │           (Web App)            │     │           (FastAPI)            │
└───────────────┬────────────────┘     └───────────────┬────────────────┘     └───────────────┬────────────────┘
                │                                      │                                      │
       [1. Starts Session]                             │                                      │
      Locks Classroom GPS &                            │                                      │
      radius (e.g. 50 meters)                          │                                      │
                │                                      │                                      │
       [2. Generates Rolling QR]                       │                                      │
      HMAC-SHA256 token regenerated                    │                                      │
      every 5s (Expires in 10s)                        │                                      │
                │                                      │                                      │
                │                              [3. Scans QR Code]                             │
                │                             Camera reads current                            │
                │                             active QR payload                               │
                │                                      │                                      │
                │                             [4. Gathers Device Data]                        │
                │                             • HTML5 GPS (Lat, Lon, Acc)                     │
                │                             • Hardware Canvas Hash                          │
                │                             • 1-frame face snapshot                         │
                │                                      │                                      │
                │                             [5. Client Random Jitter]                       │
                │                             Pauses 0.2s - 2.5s (Random)                     │
                │                             Smoothes concurrent load                        │
                │                                      │                                      │
                │                                      │── POST /api/attendance/check-in ────►│
                │                                      │   {token, lat, lon, dev_hash, face}  │
                │                                      │                                      │
                │                                      │                             [6. Validation Pipeline]
                │                                      │                             ① Check HMAC Token (<10s)
                │                                      │                             ② Haversine Dist (<=50m)
                │                                      │                             ③ Check Device Hash Unique
                │                                      │                             ④ Biometric Match Check
                │                                      │                                      │
                │                                      │◄──── 200 OK: "Attendance Recorded" ──┤
                │                                      │      (Green Success Screen)          │
                │                                      │                                      │
       [7. Live Projector Roster] ◄────────────────────┼──────────────────────────────────────┘
      Real-time counter updates:                       │
      "32 / 35 Present" (Pops up)                      │
```

---

## 4. 30–35 Student Concurrency & Load Smoothing Analysis

### A. The Potential Bottleneck
* ArcFace / DeepFace biometric verification on CPU takes **~1.2 to 2.0 seconds** per comparison.
* With `ThreadPoolExecutor(max_workers=4)`, running 35 simultaneous face verification checks would queue requests for up to $\frac{35}{4} \times 1.5\text{s} \approx 13.1\text{ seconds}$, risking network timeouts if all students submit at the exact same millisecond.

### B. The 3-Tier Load Smoothing Solution
1. **Client-Side Random Jitter (Delay):**
   ```javascript
   // Introduces randomized staggered delay between 200ms and 2500ms
   const jitterDelay = Math.floor(Math.random() * 2300) + 200;
   await new Promise((resolve) => setTimeout(resolve, jitterDelay));
   // Dispatch API check-in
   ```
   * **Result:** Even if all 35 students scan the projector at the same second, requests arrive at the server smoothly distributed over a 3 to 5 second window ($\approx 2.5\text{ to }3.5\text{ req/sec}$), perfectly matching worker capacity.
2. **Fail-Fast Mathematical Pre-Checks:**
   * Token signature check: $< 0.05\text{ ms}$
   * Haversine GPS distance check: $< 0.08\text{ ms}$
   * Device duplicate query: $< 0.4\text{ ms}$
   * *Invalid/fraudulent attempts are rejected in $< 1\text{ ms}$ without consuming any CPU for facial AI.*
3. **Dual Verification Modes:**
   * **Speed Mode (Standard Lectures):** Dynamic QR + GPS Geofence + Device Fingerprint. Total request execution takes **$< 10\text{ ms}$ per student**. All 35 students process in **under 2 seconds**.
   * **Biometric Strict Mode (Exams / Labs):** Includes live ArcFace selfie match alongside QR and Geofence, executed smoothly via the worker thread pool and client jitter.

---

## 5. Technical Implementation Blueprint

### 5.1 Database Schema (`backend/app/models/attendance.py`)

```python
class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    class_id = Column(Integer, ForeignKey("class_rooms.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    session_secret = Column(String(64), nullable=False)  # For HMAC token generation
    classroom_lat = Column(Float, nullable=False)
    classroom_lon = Column(Float, nullable=False)
    radius_meters = Column(Float, default=50.0)
    mode = Column(String(32), default="standard")        # "standard" (QR+GPS) or "biometric" (QR+GPS+Face)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    student_lat = Column(Float, nullable=True)
    student_lon = Column(Float, nullable=True)
    distance_meters = Column(Float, nullable=True)
    device_hash = Column(String(64), nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)
    status = Column(String(32), default="PRESENT")       # "PRESENT", "REJECTED_GPS", "REJECTED_DEVICE"
    verified_at = Column(DateTime, default=datetime.utcnow)
```

### 5.2 API Specifications (`backend/app/routers/attendance.py`)

| Method | Endpoint | Access | Purpose |
|---|---|:---:|---|
| `POST` | `/api/attendance/sessions/create` | Teacher | Creates session with classroom coordinates, radius, and secret key. |
| `GET` | `/api/attendance/sessions/{id}/active-token` | Teacher | Returns the currently valid HMAC-SHA256 token and remaining validity seconds. |
| `POST` | `/api/attendance/check-in` | Student | Validates token, geofence, device fingerprint, logs record. |
| `GET` | `/api/attendance/sessions/{id}/live-roster` | Teacher | Real-time check-in counts and list of marked students. |
| `POST` | `/api/attendance/sessions/{id}/close` | Teacher | Closes session, preventing subsequent check-ins. |
| `GET` | `/api/attendance/sessions/{id}/export-csv` | Teacher | Streams formatted CSV for department records. |

### 5.3 Frontend Component Architecture

1. **`TeacherProjectorView.jsx` (Classroom Projector Display):**
   * High-contrast dark projector UI.
   * Prominently centered dynamic QR code rendered with `qrcode.react`.
   * Radial 5-second countdown timer synced with token rotation.
   * Real-time metrics bar: `Class: CS-401` | `GPS Geofence: 50m Active` | `Enrolled: 35` | `Present: 28`.
   * Live animated attendee feed as students scan in.
   * One-click "Close & Export CSV" action.

2. **`StudentAttendanceScanner.jsx` (Mobile In-App Scanner):**
   * Responsive camera viewfinder with target reticle using `html5-qrcode`.
   * Automatic background acquisition of geolocation (`navigator.geolocation`).
   * Canvas hardware fingerprint generation (`device_hash`).
   * Automated random jitter delay (200ms–2500ms) to ensure smooth server concurrency.
   * Immediate visual feedback: Green verified tick card or red alert detailing failure reason (e.g., "Outside Classroom Geofence").

---

## 6. Execution Timeline & Sprints

- **Sprint 3.1: Data Models & Backend Core**
  - Create `backend/app/models/attendance.py` and register in database base.
  - Implement HMAC token generator and Haversine distance calculator.
  - Implement `/api/attendance` endpoints with comprehensive validations.

- **Sprint 3.2: Teacher Projector Interface**
  - Build `TeacherProjectorView.jsx` with rotating QR code and circular countdown animation.
  - Implement live roster polling / WebSocket updates and CSV export.

- **Sprint 3.3: Student Mobile Scanner & Concurrency Validation**
  - Build `StudentAttendanceScanner.jsx` with camera reader, geolocation hook, device hashing, and client jitter.
  - Execute concurrency simulation test with 35 simulated check-in requests.
