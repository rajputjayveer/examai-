import asyncio
import base64
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User
from app.models.attempt import Attempt
from app.models.violation import Violation
from app.schemas.proctoring import ViolationCreate, ViolationResponse, IdentityCheckCreate, AudioViolationCreate
from app.services.face_service import verify_faces

router = APIRouter()

STORAGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "storage"
)

MAX_VIOLATIONS_BEFORE_AUTO_SUBMIT = 5

# ── Dedicated thread pool for CPU-heavy DeepFace AI inference ─────────────────
# max_workers=4 means up to 4 face checks run in parallel on CPU.
# Other students are not blocked while face AI runs in these background threads.
_face_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="face_ai")


def _save_base64_to_file(b64_string: str, file_path: str):
    """Decode a base64 data-URL or raw base64 string and write to disk."""
    header, encoded = b64_string.split(",", 1) if "," in b64_string else ("", b64_string)
    with open(file_path, "wb") as f:
        f.write(base64.b64decode(encoded))


@router.post("/violation")
async def log_violation(
    violation_in: ViolationCreate,
    current_user: User = Depends(RoleChecker(["student"])),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Attempt).where(
            Attempt.id == violation_in.attempt_id,
            Attempt.student_id == current_user.id
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    evidence_path = None

    # Fix #7: Reject oversized uploads before decoding
    # Base64 encodes ~4/3 bytes, so 2MB raw ≈ 2.7MB base64
    MAX_SNAPSHOT_B64 = 2_700_000   # ~2MB decoded image
    MAX_AUDIO_B64    = 6_700_000   # ~5MB decoded audio

    if violation_in.snapshot:
        if len(violation_in.snapshot) > MAX_SNAPSHOT_B64:
            print(f"[proctoring] Rejected oversized snapshot from student {current_user.id} ({len(violation_in.snapshot)} bytes)")
        else:
            attempt_dir = os.path.join(STORAGE_DIR, "evidence", str(attempt.id))
            os.makedirs(attempt_dir, exist_ok=True)
            filename = f"{int(datetime.utcnow().timestamp())}_{violation_in.type}.jpg"
            file_path = os.path.join(attempt_dir, filename)
            try:
                _save_base64_to_file(violation_in.snapshot, file_path)
                evidence_path = f"evidence/{attempt.id}/{filename}"
            except Exception as e:
                print("Failed to decode and save violation snapshot:", e)

    elif violation_in.audio_data:
        if len(violation_in.audio_data) > MAX_AUDIO_B64:
            print(f"[proctoring] Rejected oversized audio from student {current_user.id} ({len(violation_in.audio_data)} bytes)")
        else:
            attempt_dir = os.path.join(STORAGE_DIR, "evidence", str(attempt.id))
            os.makedirs(attempt_dir, exist_ok=True)
            filename = f"{int(datetime.utcnow().timestamp())}_{violation_in.type}.webm"
            file_path = os.path.join(attempt_dir, filename)
            try:
                _save_base64_to_file(violation_in.audio_data, file_path)
                evidence_path = f"evidence/{attempt.id}/{filename}"
            except Exception as e:
                print("Failed to decode and save audio evidence clip:", e)

    violation = Violation(
        attempt_id=violation_in.attempt_id,
        type=violation_in.type,
        evidence_path=evidence_path
    )
    db.add(violation)
    await db.commit()
    await db.refresh(violation)

    # Auto-submit lockout disabled — only flag and log violations
    return {
        "id": violation.id,
        "attempt_id": violation.attempt_id,
        "type": violation.type,
        "evidence_path": violation.evidence_path,
        "created_at": violation.created_at,
        "auto_submitted": False
    }


@router.post("/identity-check")
async def identity_check(
    check_in: IdentityCheckCreate,
    current_user: User = Depends(RoleChecker(["student"])),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Attempt).where(
            Attempt.id == check_in.attempt_id,
            Attempt.student_id == current_user.id
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if not current_user.face_descriptor:
        return {"verified": False, "reason": "no_reference_enrolled"}

    ref_path = os.path.join(STORAGE_DIR, "faces", str(current_user.id), "reference.jpg")

    # ── Run DeepFace AI in background thread — does NOT block other students ──
    # verify_faces() can take 1-4s on CPU. run_in_executor offloads it to the
    # _face_executor thread pool so the async event loop stays free.
    loop = asyncio.get_event_loop()
    try:
        is_match, distance = await asyncio.wait_for(
            loop.run_in_executor(_face_executor, verify_faces, ref_path, check_in.snapshot),
            timeout=15.0  # max 15s for face AI; returns unverified on timeout
        )
    except asyncio.TimeoutError:
        print(f"[identity_check] Face verification timed out for attempt {attempt.id}")
        return {"verified": False, "distance": 1.0, "reason": "timeout"}

    if not is_match:
        evidence_path = None
        if check_in.snapshot:
            attempt_dir = os.path.join(STORAGE_DIR, "evidence", str(attempt.id))
            os.makedirs(attempt_dir, exist_ok=True)
            filename = f"{int(datetime.utcnow().timestamp())}_identity_mismatch.jpg"
            file_path = os.path.join(attempt_dir, filename)
            try:
                _save_base64_to_file(check_in.snapshot, file_path)
                evidence_path = f"evidence/{attempt.id}/{filename}"
            except Exception as e:
                print("Failed to save identity check snapshot:", e)

        violation = Violation(
            attempt_id=attempt.id,
            type="identity_mismatch",
            evidence_path=evidence_path
        )
        db.add(violation)
        await db.commit()

    return {"verified": is_match, "distance": round(distance, 3)}


@router.post("/audio-violation")
async def save_audio_violation(
    check_in: AudioViolationCreate,
    current_user: User = Depends(RoleChecker(["student"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Browser has already detected speech via Silero VAD ONNX (real-time, ~100ms latency).
    This endpoint stores the 4-second audio evidence clip and logs the violation.
    No server-side ML inference needed — detection runs in the browser.
    """
    result = await db.execute(
        select(Attempt).where(
            Attempt.id == check_in.attempt_id,
            Attempt.student_id == current_user.id
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    evidence_path = None
    if check_in.audio_data:
        attempt_dir = os.path.join(STORAGE_DIR, "evidence", str(attempt.id))
        os.makedirs(attempt_dir, exist_ok=True)
        filename = f"{int(datetime.utcnow().timestamp())}_speech_detected.webm"
        file_path = os.path.join(attempt_dir, filename)
        try:
            _save_base64_to_file(check_in.audio_data, file_path)
            evidence_path = f"evidence/{attempt.id}/{filename}"
        except Exception as e:
            print(f"[AudioViolation] Failed to save audio clip: {e}")

    violation = Violation(
        attempt_id=attempt.id,
        type="speech_detected",
        evidence_path=evidence_path
    )
    db.add(violation)
    await db.commit()
    await db.refresh(violation)

    return {
        "logged": True,
        "id": violation.id,
        "evidence_path": evidence_path
    }
