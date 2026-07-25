from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base

class Enrollment(Base):
    __tablename__ = "enrollments"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    enrolled_at = Column(DateTime, server_default=func.now())
    status = Column(String(50), default="active", nullable=False) # "active" or "removed"

    __table_args__ = (
        UniqueConstraint("class_id", "student_id", name="uq_class_student"),
    )

    class_room = relationship("ClassRoom", back_populates="enrollments")
    student = relationship("User")
