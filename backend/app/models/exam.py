from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base

class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    start_at = Column(DateTime, nullable=False)
    end_at = Column(DateTime, nullable=False)
    status = Column(String(50), default="draft") # "draft", "published", "closed"
    visibility = Column(String(50), default="global") # "global" or "class"
    created_at = Column(DateTime, server_default=func.now())

    class_room = relationship("ClassRoom", back_populates="exams")
    questions = relationship("Question", back_populates="exam", cascade="all, delete-orphan")
    attempts = relationship("Attempt", back_populates="exam", cascade="all, delete-orphan")
