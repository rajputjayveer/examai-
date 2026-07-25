import os
import sys
from datetime import datetime, timedelta

# Append backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.base import Base, engine, get_db
from app.db.init_db import init_db
from app.models.user import User
from app.models.class_room import ClassRoom
from app.models.enrollment import Enrollment
from app.models.exam import Exam
from app.models.exam_access_token import ExamAccessToken
from app.core.security import get_password_hash
from app.routers.classes import create_class, enroll_students, get_class_analytics, remove_student_from_class
from app.routers.exams import create_exam, publish_exam, list_exams, join_exam_via_token
from app.routers.attempts import start_attempt
from app.schemas.class_room import ClassCreate
from app.schemas.exam import ExamCreate
from app.routers.classes import StudentEmailItem
from fastapi import HTTPException

def run_tests():
    print("=== STARTING CLASS & ENROLLMENT VERIFICATION TEST ===")
    init_db()
    db = next(get_db())

    # 1. Setup Test Users
    teacher_email = "test_teacher@examguard.ai"
    student1_email = "student1@examguard.ai"
    student2_email = "student2@examguard.ai"

    # Cleanup previous test data
    db.query(ExamAccessToken).delete()
    db.query(Enrollment).delete()
    db.query(Exam).delete()
    db.query(ClassRoom).delete()
    db.query(User).filter(User.email.in_([teacher_email, student1_email, student2_email])).delete()
    db.commit()

    teacher = User(
        name="Prof. Test Teacher",
        email=teacher_email,
        password_hash=get_password_hash("password123"),
        role="teacher",
        is_verified=True,
        face_enrolled=True
    )
    student1 = User(
        name="Alice Student",
        email=student1_email,
        password_hash=get_password_hash("password123"),
        role="student",
        is_verified=True,
        face_enrolled=True
    )
    student2 = User(
        name="Bob Student",
        email=student2_email,
        password_hash=get_password_hash("password123"),
        role="student",
        is_verified=True,
        face_enrolled=True
    )
    db.add_all([teacher, student1, student2])
    db.commit()
    db.refresh(teacher)
    db.refresh(student1)
    db.refresh(student2)
    print(f"✓ Created test users: Teacher ({teacher.id}), Student1 ({student1.id}), Student2 ({student2.id})")

    # 2. Create Class
    class_res = create_class(ClassCreate(name="Physics 101"), current_user=teacher, db=db)
    class_id = class_res["id"]
    print(f"✓ Created Class: Physics 101 (ID: {class_id})")

    # 3. Enroll Student 1 & Non-registered email
    enroll_res = enroll_students(
        class_id=class_id,
        payload=StudentEmailItem(emails=[student1_email, "not_registered@examguard.ai"]),
        current_user=teacher,
        db=db
    )
    print(f"✓ Enrollment Result Added: {enroll_res['added']}")
    print(f"✓ Enrollment Result Errors (expected for un-registered): {enroll_res['errors']}")
    assert len(enroll_res['added']) == 1
    assert "not_registered@examguard.ai" in enroll_res['errors'][0]

    # 4. Create Exams (1 Class-wise, 1 Global)
    now = datetime.utcnow()
    class_exam = create_exam(
        ExamCreate(
            title="Physics Midterm (Class-wise)",
            duration_minutes=60,
            start_at=now - timedelta(minutes=10),
            end_at=now + timedelta(hours=2),
            class_id=class_id
        ),
        current_user=teacher,
        db=db
    )

    global_exam = create_exam(
        ExamCreate(
            title="General Knowledge (Global)",
            duration_minutes=30,
            start_at=now - timedelta(minutes=10),
            end_at=now + timedelta(hours=2),
            class_id=None
        ),
        current_user=teacher,
        db=db
    )
    print(f"✓ Created Class Exam (ID: {class_exam.id}) and Global Exam (ID: {global_exam.id})")

    # 5. Publish Exams
    published_class_exam = publish_exam(class_exam.id, current_user=teacher, db=db)
    published_global_exam = publish_exam(global_exam.id, current_user=teacher, db=db)
    print("✓ Published both exams. Notifications and tokens generated.")

    # Check generated access tokens
    tokens = db.query(ExamAccessToken).all()
    print(f"✓ Total Access Tokens generated: {len(tokens)}")
    assert len(tokens) >= 2

    # 6. Test Exam Scoping (list_exams)
    student1_exams = list_exams(current_user=student1, db=db)
    student2_exams = list_exams(current_user=student2, db=db)

    student1_exam_ids = [e["id"] for e in student1_exams]
    student2_exam_ids = [e["id"] for e in student2_exams]

    print(f"✓ Enrolled Student1 visible exam IDs: {student1_exam_ids}")
    print(f"✓ Non-enrolled Student2 visible exam IDs: {student2_exam_ids}")

    assert class_exam.id in student1_exam_ids
    assert global_exam.id in student1_exam_ids
    assert class_exam.id not in student2_exam_ids
    assert global_exam.id in student2_exam_ids

    # 7. Test Token Join Route
    valid_token_row = tokens[0]
    token_join_res = join_exam_via_token(valid_token_row.token, db=db)
    print(f"✓ Token Join Verification successful: {token_join_res}")
    assert token_join_res["valid"] is True
    assert token_join_res["exam_id"] == valid_token_row.exam_id

    try:
        join_exam_via_token("invalid_token_12345", db=db)
        assert False, "Should have failed for invalid token"
    except HTTPException as e:
        print(f"✓ Invalid token test passed: {e.detail}")

    # 8. Test Attempt Start & Re-check Enrollment Status
    attempt1 = start_attempt(exam_id=class_exam.id, current_user=student1, db=db)
    print(f"✓ Student1 started attempt successfully (Attempt ID: {attempt1.id})")

    # Now unenroll Student 1
    remove_student_from_class(class_id=class_id, student_id=student1.id, current_user=teacher, db=db)
    print(f"✓ Unenrolled Student1 from class {class_id}")

    # Reset ongoing attempt for testing start_attempt refusal after unenrollment
    db.delete(attempt1)
    db.commit()

    try:
        start_attempt(exam_id=class_exam.id, current_user=student1, db=db)
        assert False, "Should have blocked unenrolled student from starting attempt"
    except HTTPException as e:
        print(f"✓ Unenrolled student attempt start blocked successfully: {e.detail}")

    # 9. Test Class Analytics Endpoint
    analytics = get_class_analytics(class_id=class_id, current_user=teacher, db=db)
    print(f"✓ Class Analytics output verified: {analytics['class_name']} with {analytics['enrolled_count']} active students")

    print("\n===========================================")
    print(" ALL BACKEND VERIFICATION TESTS PASSED! 🎉 ")
    print("===========================================\n")

if __name__ == "__main__":
    run_tests()
