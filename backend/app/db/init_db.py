import sqlalchemy
from sqlalchemy import text
from app.db.base import Base, engine, ASYNC_DATABASE_URL
import asyncio

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


def init_db():
    """
    Create all MySQL tables on startup using a sync engine (for one-time setup).
    We use a temporary sync pymysql connection only for schema setup because
    SQLAlchemy's create_all / DDL does not support async natively.
    The app then switches to the async engine for all runtime queries.
    """
    # Build sync URL from the async URL for schema bootstrap only
    sync_url = ASYNC_DATABASE_URL.replace("mysql+aiomysql://", "mysql+pymysql://", 1)

    # ── Step 1: Create the database if it does not exist ─────────────────────
    base_url, db_name = sync_url.rsplit("/", 1)
    if "?" in db_name:
        db_name = db_name.split("?")[0]

    try:
        temp_engine = sqlalchemy.create_engine(base_url)
        with temp_engine.connect() as conn:
            conn.execute(sqlalchemy.text(f"CREATE DATABASE IF NOT EXISTS `{db_name}`"))
            conn.commit()
        temp_engine.dispose()
    except Exception as e:
        print(f"[init_db] Could not ensure database exists: {e}")

    # ── Step 2: Create all tables ─────────────────────────────────────────────
    sync_engine = sqlalchemy.create_engine(sync_url)
    Base.metadata.create_all(bind=sync_engine)

    # ── Step 3: Auto-migrate missing columns ─────────────────────────────────
    try:
        with sync_engine.connect() as conn:
            # exams table: class_id, visibility
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

            # pending_enrollments: student_name
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
    finally:
        sync_engine.dispose()

    print("[init_db] Database schema ready [OK]")
