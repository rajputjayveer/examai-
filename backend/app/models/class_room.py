from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base

class ClassRoom(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    teacher_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    teacher = relationship("User")
    co_teachers = relationship("ClassTeacher", back_populates="class_room", cascade="all, delete-orphan")
    enrollments = relationship("Enrollment", back_populates="class_room", cascade="all, delete-orphan")
    pending_enrollments = relationship("PendingEnrollment", back_populates="class_room", cascade="all, delete-orphan")
    exams = relationship("Exam", back_populates="class_room")
