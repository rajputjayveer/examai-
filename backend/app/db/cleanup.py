import sqlalchemy
from app.db.base import engine
from app.models.user import User
from app.models.attempt import Attempt
from app.models.answer import Answer
from app.models.violation import Violation
from app.models.enrollment import Enrollment
from app.models.exam_access_token import ExamAccessToken
from app.models.otp import OTPVerification

def cleanup_past_student_data():
    """Delete all past student accounts and student-related records, keeping teacher and admin data intact."""
    try:
        with engine.connect() as conn:
            # Find all student IDs
            result = conn.execute(sqlalchemy.text("SELECT id FROM users WHERE role = 'student'"))
            student_ids = [row[0] for row in result.fetchall()]

            if not student_ids:
                print("✓ No past student data to clean up.")
                return

            id_str = ", ".join(map(str, student_ids))

            # Delete dependent records
            conn.execute(sqlalchemy.text(f"DELETE FROM answers WHERE attempt_id IN (SELECT id FROM attempts WHERE student_id IN ({id_str}))"))
            conn.execute(sqlalchemy.text(f"DELETE FROM violations WHERE attempt_id IN (SELECT id FROM attempts WHERE student_id IN ({id_str}))"))
            conn.execute(sqlalchemy.text(f"DELETE FROM attempts WHERE student_id IN ({id_str})"))
            conn.execute(sqlalchemy.text(f"DELETE FROM enrollments WHERE student_id IN ({id_str})"))
            conn.execute(sqlalchemy.text(f"DELETE FROM exam_access_tokens WHERE student_id IN ({id_str})"))
            conn.execute(sqlalchemy.text(f"DELETE FROM otp_verifications WHERE user_id IN ({id_str})"))
            conn.execute(sqlalchemy.text(f"DELETE FROM users WHERE role = 'student'"))
            conn.commit()

            print(f"✓ Successfully cleaned up past student data ({len(student_ids)} student accounts removed).")
    except Exception as e:
        print("Note on cleanup:", e)
