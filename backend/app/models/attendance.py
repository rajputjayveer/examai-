from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base

class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    subject_name = Column(String(128), nullable=True)   # e.g. "DBMS", "Computer Networks"
    session_secret = Column(String(64), nullable=False)
    classroom_lat = Column(Float, nullable=False)
    classroom_lon = Column(Float, nullable=False)
    radius_meters = Column(Float, default=50.0)
    mode = Column(String(32), default="standard")  # "standard" (QR+GPS) or "biometric" (QR+GPS+Face)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)

    teacher = relationship("User", foreign_keys=[teacher_id])
    class_room = relationship("ClassRoom", foreign_keys=[class_id])
    records = relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")


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
    status = Column(String(32), default="PRESENT")  # "PRESENT", "FLAGGED_GPS", "FLAGGED_DEVICE"
    verified_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("AttendanceSession", back_populates="records")
    student = relationship("User", foreign_keys=[student_id])
