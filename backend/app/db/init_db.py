from app.db.base import Base, engine

# Import all models so SQLAlchemy registers them before creating tables
from app.models.user import User
from app.models.otp import OTPVerification
from app.models.class_room import ClassRoom
from app.models.class_teacher import ClassTeacher
from app.models.enrollment import Enrollment
from app.models.pending_enrollment import PendingEnrollment
from app.models.exam import Exam
from app.models.exam_access_token import ExamAccessToken
from app.models.question import Question
from app.models.attempt import Attempt
from app.models.answer import Answer
from app.models.violation import Violation
from app.db.cleanup import cleanup_past_student_data


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
    Base.metadata.create_all(bind=engine)

    # Student data cleanup was completed for reset. Disabled on reloads so registered students persist.
    # cleanup_past_student_data()

    # Automatically alter existing MySQL tables to add new columns if missing
    try:
        with engine.connect() as conn:
            result = conn.execute(sqlalchemy.text("SHOW COLUMNS FROM `exams`"))
            columns = [row[0] for row in result.fetchall()]

            if "class_id" not in columns:
                try:
                    conn.execute(sqlalchemy.text(
                        "ALTER TABLE `exams` ADD COLUMN `class_id` INT NULL, "
                        "ADD CONSTRAINT `fk_exams_class` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE SET NULL"
                    ))
                    conn.commit()
                except Exception as e:
                    print("Note adding class_id:", e)

            if "visibility" not in columns:
                try:
                    conn.execute(sqlalchemy.text(
                        "ALTER TABLE `exams` ADD COLUMN `visibility` VARCHAR(50) DEFAULT 'global'"
                    ))
                    conn.commit()
                except Exception as e:
                    print("Note adding visibility:", e)

            # Check pending_enrollments table for student_name column
            try:
                res_p = conn.execute(sqlalchemy.text("SHOW COLUMNS FROM `pending_enrollments`"))
                p_cols = [row[0] for row in res_p.fetchall()]
                if "student_name" not in p_cols:
                    conn.execute(sqlalchemy.text(
                        "ALTER TABLE `pending_enrollments` ADD COLUMN `student_name` VARCHAR(255) NULL"
                    ))
                    conn.commit()
            except Exception as e:
                print("Note adding student_name to pending_enrollments:", e)
    except Exception as err:
        print("Schema migration note:", err)




