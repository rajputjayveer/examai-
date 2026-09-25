from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.db.base import Base

class FaceResetRequest(Base):
    __tablename__ = "face_reset_requests"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    status = Column(String(50), default="pending")  # "pending" or "approved"
    reason = Column(String(500), nullable=True)
    requested_at = Column(DateTime, server_default=func.now())
    approved_at = Column(DateTime, nullable=True)
