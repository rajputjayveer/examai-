from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base

class PendingEnrollment(Base):
    __tablename__ = "pending_enrollments"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), index=True, nullable=False)
    student_name = Column(String(255), nullable=True)
    invited_by_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("class_id", "email", name="uq_class_pending_email"),
    )

    class_room = relationship("ClassRoom", back_populates="pending_enrollments")
    invited_by = relationship("User")
