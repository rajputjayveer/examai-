from app.db.base import Base, engine
# Import all models to ensure they are registered on Base
from app.models.user import User
from app.models.otp import OTPVerification
from app.models.exam import Exam
from app.models.question import Question
from app.models.attempt import Attempt
from app.models.answer import Answer
from app.models.violation import Violation

def init_db():
    Base.metadata.create_all(bind=engine)
