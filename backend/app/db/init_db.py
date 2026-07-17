from app.db.base import Base, engine

# Import all models so SQLAlchemy registers them before creating tables
from app.models.user import User
from app.models.otp import OTPVerification
from app.models.exam import Exam
from app.models.question import Question
from app.models.attempt import Attempt
from app.models.answer import Answer
from app.models.violation import Violation


import sqlalchemy
from app.core.config import settings

def init_db():
    """Create all MySQL tables on startup. Automatically creates database if missing."""
    # Parse database name out of connection string to verify/create it on server root
    base_url, db_name = settings.DATABASE_URL.rsplit('/', 1)
    if '?' in db_name:
        db_name = db_name.split('?')[0]
    
    # Connect without database context first
    temp_engine = sqlalchemy.create_engine(base_url)
    with temp_engine.connect() as conn:
        conn.execute(sqlalchemy.text(f"CREATE DATABASE IF NOT EXISTS `{db_name}`"))
        conn.commit()
    temp_engine.dispose()

    Base.metadata.create_all(bind=engine)




