import asyncio
import csv
import io
import os
import secrets
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.base import get_db
from app.core.deps import get_current_active_user, RoleChecker
from app.models.user import User
from app.models.class_room import ClassRoom
from app.models.class_teacher import ClassTeacher
from app.models.enrollment import Enrollment
from app.models.attendance import AttendanceSession, AttendanceRecord
from app.schemas.attendance import (
    SessionCreateRequest,
    SessionResponse,
    ActiveTokenResponse,
    CheckInRequest,
    CheckInResponse,
    LiveRosterResponse,
    AttendanceStudentItem,
)
from app.services.attendance_service import (
    generate_qr_token,
    verify_qr_token,
    calculate_haversine_distance,
)
from app.services.face_service import verify_faces

router = APIRouter()

STORAGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "storage"
)

async def _verify_teacher_class_access(class_id: int, user: User, db: AsyncSession) -> ClassRoom:
    """Check if current teacher/admin has rights to manage this class."""
    if user.role == "admin":
        stmt = select(ClassRoom).where(ClassRoom.id == class_id)
        result = await db.execute(stmt)
        classroom = result.scalar_one_or_none()
        if not classroom:
            raise HTTPException(status_code=404, detail="Classroom not found")
        return classroom

    # Check primary teacher or co-teacher
    stmt = (
        select(ClassRoom)
        .outerjoin(ClassTeacher, ClassTeacher.class_id == ClassRoom.id)
        .where(
            and_(
                ClassRoom.id == class_id,
                (ClassRoom.teacher_id == user.id) | (ClassTeacher.teacher_id == user.id)
            )
        )
    )
    result = await db.execute(stmt)
    classroom = result.scalar_one_or_none()
    if not classroom:
        raise HTTPException(status_code=403, detail="You do not have permission to manage attendance for this class.")
    return classroom


@router.post("/sessions/create", response_model=SessionResponse)
async def create_attendance_session(
    payload: SessionCreateRequest,
    current_user: User = Depends(RoleChecker(["teacher", "admin"])),
    db: AsyncSession = Depends(get_db)
):
    """Teacher creates an active classroom attendance session with geofence."""
    await _verify_teacher_class_access(payload.class_id, current_user, db)

    # Deactivate any previous lingering active sessions for this class
    lingering_stmt = select(AttendanceSession).where(
        and_(
            AttendanceSession.class_id == payload.class_id,
            AttendanceSession.is_active == True
        )
    )
    lingering = (await db.execute(lingering_stmt)).scalars().all()
    for s in lingering:
        s.is_active = False
        s.closed_at = datetime.utcnow()

    # Generate 32-character secret key for HMAC token signing
    session_secret = secrets.token_hex(16)

    new_session = AttendanceSession(
        teacher_id=current_user.id,
        class_id=payload.class_id,
        title=payload.title.strip(),
        subject_name=payload.subject_name.strip() if payload.subject_name else None,
        session_secret=session_secret,
        classroom_lat=payload.classroom_lat,
        classroom_lon=payload.classroom_lon,
        radius_meters=payload.radius_meters if payload.radius_meters > 0 else 50.0,
        mode=payload.mode if payload.mode in ["standard", "biometric"] else "standard",
        is_active=True,
        created_at=datetime.utcnow()
    )
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    return new_session


@router.get("/sessions/{session_id}/active-token", response_model=ActiveTokenResponse)
async def get_active_qr_token(
    session_id: int,
    current_user: User = Depends(RoleChecker(["teacher", "admin"])),
    db: AsyncSession = Depends(get_db)
):
    """Returns the current rolling HMAC-SHA256 token and remaining seconds."""
    stmt = select(AttendanceSession).where(AttendanceSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Attendance session not found")

    await _verify_teacher_class_access(session.class_id, current_user, db)

    if not session.is_active:
        return ActiveTokenResponse(
            token="EXPIRED",
            remaining_seconds=0,
            session_id=session.id,
            is_active=False
        )

    token, remaining = generate_qr_token(session.id, session.session_secret)
    return ActiveTokenResponse(
        token=token,
        remaining_seconds=remaining,
        session_id=session.id,
        is_active=True
    )


@router.post("/check-in", response_model=CheckInResponse)
async def student_check_in(
    check_in: CheckInRequest,
    current_user: User = Depends(RoleChecker(["student"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Zero-Proxy Attendance Check-in pipeline:
    1. Check session is active
    2. Check student enrolled in class
    3. Check student hasn't already checked in
    4. Verify HMAC Rolling QR Token (10s TTL)
    5. Check Device Fingerprint (1 device per student)
    6. Verify GPS Geofence (Haversine <= radius)
    7. (Optional) Biometric Face verification
    """
    stmt = select(AttendanceSession).where(AttendanceSession.id == check_in.session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session or not session.is_active:
        raise HTTPException(status_code=400, detail="This attendance session is no longer active.")

    # 1. Enrolled in class?
    enrolled_stmt = select(Enrollment).where(
        and_(
            Enrollment.class_id == session.class_id,
            Enrollment.student_id == current_user.id
        )
    )
    enrolled = (await db.execute(enrolled_stmt)).scalar_one_or_none()
    if not enrolled:
        raise HTTPException(status_code=403, detail="You are not enrolled in this classroom.")

    # 2. Already checked in?
    existing_record_stmt = select(AttendanceRecord).where(
        and_(
            AttendanceRecord.session_id == session.id,
            AttendanceRecord.student_id == current_user.id
        )
    )
    existing_record = (await db.execute(existing_record_stmt)).scalar_one_or_none()
    if existing_record and existing_record.status == "PRESENT":
        return CheckInResponse(
            success=True,
            message="Your attendance has already been recorded for this session.",
            status="PRESENT",
            distance_meters=existing_record.distance_meters,
            verified_at=existing_record.verified_at
        )

    # 3. Cryptographic Token Check (Fail-fast: <0.05ms)
    token_valid = verify_qr_token(session.id, session.session_secret, check_in.token)
    if not token_valid:
        raise HTTPException(
            status_code=400,
            detail="QR code expired or invalid. Please scan the current code displayed on the screen."
        )

    # 4. Device Fingerprint Anti-Proxy Check
    if not check_in.device_hash or len(check_in.device_hash.strip()) < 8:
        raise HTTPException(status_code=400, detail="Missing valid device hardware fingerprint.")

    device_stmt = select(AttendanceRecord).where(
        and_(
            AttendanceRecord.session_id == session.id,
            AttendanceRecord.device_hash == check_in.device_hash.strip(),
            AttendanceRecord.student_id != current_user.id
        )
    )
    proxy_conflict = (await db.execute(device_stmt)).scalar_one_or_none()
    if proxy_conflict:
        raise HTTPException(
            status_code=400,
            detail="Proxy alert: This physical device has already been used to mark attendance for another student."
        )

    # 5. Geofence Distance Calculation
    distance: float = 0.0
    if check_in.student_lat is not None and check_in.student_lon is not None:
        distance = calculate_haversine_distance(
            session.classroom_lat, session.classroom_lon,
            check_in.student_lat, check_in.student_lon
        )
        if distance > session.radius_meters:
            raise HTTPException(
                status_code=400,
                detail=f"Geofence violation: You are {int(distance)}m from the classroom (Max radius: {int(session.radius_meters)}m). You must be present in the classroom."
            )
    else:
        # If coordinates are missing entirely
        raise HTTPException(
            status_code=400,
            detail="GPS coordinates required. Please enable location permissions on your browser."
        )

    # 6. Face verification — runs whenever student sends a snapshot (always in current flow)
    if check_in.snapshot:
        ref_path = os.path.join(STORAGE_DIR, "faces", str(current_user.id), "reference.jpg")
        if os.path.exists(ref_path):
            is_match, dist = await asyncio.to_thread(verify_faces, ref_path, check_in.snapshot)
            if not is_match:
                raise HTTPException(
                    status_code=400,
                    detail="Face verification failed. Your face does not match the registered photo. Please try again in proper lighting."
                )
        # If no reference photo enrolled yet, allow through (first-time scenario)

    # 7. Record Attendance
    if existing_record:
        existing_record.student_lat = check_in.student_lat
        existing_record.student_lon = check_in.student_lon
        existing_record.distance_meters = round(distance, 1)
        existing_record.device_hash = check_in.device_hash.strip()
        existing_record.status = "PRESENT"
        existing_record.verified_at = datetime.utcnow()
        record = existing_record
    else:
        record = AttendanceRecord(
            session_id=session.id,
            student_id=current_user.id,
            student_lat=check_in.student_lat,
            student_lon=check_in.student_lon,
            distance_meters=round(distance, 1),
            device_hash=check_in.device_hash.strip(),
            status="PRESENT",
            verified_at=datetime.utcnow()
        )
        db.add(record)

    await db.commit()
    await db.refresh(record)

    return CheckInResponse(
        success=True,
        message="Attendance recorded successfully!",
        status="PRESENT",
        distance_meters=round(distance, 1),
        verified_at=record.verified_at
    )


@router.get("/sessions/{session_id}/live-roster", response_model=LiveRosterResponse)
async def get_session_live_roster(
    session_id: int,
    current_user: User = Depends(RoleChecker(["teacher", "admin"])),
    db: AsyncSession = Depends(get_db)
):
    """Returns live check-in counts and list of present students."""
    stmt = select(AttendanceSession).where(AttendanceSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Attendance session not found")

    await _verify_teacher_class_access(session.class_id, current_user, db)

    # Total enrolled students in class
    enrolled_count_stmt = select(func.count(Enrollment.id)).where(Enrollment.class_id == session.class_id)
    total_enrolled = (await db.execute(enrolled_count_stmt)).scalar() or 0

    # Fetch records joined with users
    records_stmt = (
        select(AttendanceRecord, User)
        .join(User, User.id == AttendanceRecord.student_id)
        .where(AttendanceRecord.session_id == session.id)
        .order_by(AttendanceRecord.verified_at.desc())
    )
    records_res = (await db.execute(records_stmt)).all()

    items = []
    for rec, student in records_res:
        items.append(AttendanceStudentItem(
            record_id=rec.id,
            student_id=student.id,
            student_name=student.name,
            student_email=student.email,
            status=rec.status,
            distance_meters=rec.distance_meters,
            verified_at=rec.verified_at,
            device_hash=rec.device_hash[:8] + "..." if rec.device_hash else ""
        ))

    return LiveRosterResponse(
        session_id=session.id,
        title=session.title,
        subject_name=session.subject_name,
        is_active=session.is_active,
        total_enrolled=total_enrolled,
        total_present=len(items),
        records=items
    )


@router.post("/sessions/{session_id}/close", response_model=SessionResponse)
async def close_attendance_session(
    session_id: int,
    current_user: User = Depends(RoleChecker(["teacher", "admin"])),
    db: AsyncSession = Depends(get_db)
):
    """Closes an active attendance session."""
    stmt = select(AttendanceSession).where(AttendanceSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Attendance session not found")

    await _verify_teacher_class_access(session.class_id, current_user, db)
    session.is_active = False
    session.closed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/sessions/{session_id}/export-csv")
async def export_attendance_csv(
    session_id: int,
    current_user: User = Depends(RoleChecker(["teacher", "admin"])),
    db: AsyncSession = Depends(get_db)
):
    """Exports session attendance as a CSV file."""
    stmt = select(AttendanceSession).where(AttendanceSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Attendance session not found")

    await _verify_teacher_class_access(session.class_id, current_user, db)

    # Query all enrolled students in the class
    enrolled_stmt = (
        select(User)
        .join(Enrollment, Enrollment.student_id == User.id)
        .where(Enrollment.class_id == session.class_id)
        .order_by(User.name)
    )
    enrolled_students = (await db.execute(enrolled_stmt)).scalars().all()

    # Query attendance records
    rec_stmt = select(AttendanceRecord).where(AttendanceRecord.session_id == session.id)
    records = {r.student_id: r for r in (await db.execute(rec_stmt)).scalars().all()}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Student ID",
        "Student Name",
        "Email",
        "Attendance Status",
        "Check-In Time",
        "Distance (Meters)",
        "Device Hash"
    ])

    for st in enrolled_students:
        rec = records.get(st.id)
        if rec and rec.status == "PRESENT":
            writer.writerow([
                st.id,
                st.name,
                st.email,
                "PRESENT",
                rec.verified_at.strftime("%Y-%m-%d %H:%M:%S") if rec.verified_at else "",
                f"{rec.distance_meters:.1f}" if rec.distance_meters is not None else "0.0",
                rec.device_hash
            ])
        else:
            writer.writerow([
                st.id,
                st.name,
                st.email,
                "ABSENT",
                "-",
                "-",
                "-"
            ])

    output.seek(0)
    filename = f"attendance_session_{session.id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/classes/{class_id}/sessions", response_model=List[SessionResponse])
async def list_class_attendance_sessions(
    class_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List all attendance sessions for a class (both teacher and student can view list)."""
    stmt = (
        select(AttendanceSession)
        .where(AttendanceSession.class_id == class_id)
        .order_by(AttendanceSession.created_at.desc())
    )
    sessions = (await db.execute(stmt)).scalars().all()
    return sessions
