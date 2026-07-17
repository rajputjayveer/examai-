from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base

class Violation(Base):
    __tablename__ = "violations"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(50), nullable=False) # "no_face", "multi_face", "tab_switch", "identity_mismatch"
    evidence_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    attempt = relationship("Attempt", back_populates="violations")
