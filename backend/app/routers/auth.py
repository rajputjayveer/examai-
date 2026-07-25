from datetime import datetime, timedelta
import random
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.deps import get_current_active_user, RoleChecker
from app.db.base import get_db
from app.models.user import User
from app.models.otp import OTPVerification
from app.models.pending_enrollment import PendingEnrollment
from app.schemas.user import UserCreate, UserResponse, UserLogin, Token
from app.core.config import settings

router = APIRouter()

def send_otp_email(email: str, otp_code: str):
    send_email(
        email,
        "Verify your SecureExam AI account",
        f"Your verification code is: {otp_code}\nExpires in 5 minutes."
    )

@router.post("/register", response_model=UserResponse)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    if user_in.role != "student":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Self-registration is only allowed for students.",
        )
    # Ensure student can ONLY register if an instructor has added/invited their email into a class roster
    user_email_clean = user_in.email.strip().lower()
    pending_invite = db.query(PendingEnrollment).filter(
        PendingEnrollment.email == user_email_clean
    ).first()

    if not pending_invite:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is restricted. You must be added to a class roster by an instructor before you can register an account."
        )

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_email_clean).first()
    if existing_user:
        if not existing_user.is_verified:
            # Generate OTP
            otp_code = f"{random.randint(100000, 999999)}"
            expires_at = datetime.utcnow() + timedelta(minutes=5)
            otp_hash = get_password_hash(otp_code)
            db_otp = OTPVerification(
                user_id=existing_user.id,
                otp_hash=otp_hash,
                expires_at=expires_at
            )
            db.add(db_otp)
            db.commit()
            send_otp_email(existing_user.email, otp_code)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email is unverified. OTP has been resent. Please verify.",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The user with this email already exists in the system.",
            )
    
    # Create user
    hashed_password = get_password_hash(user_in.password)
    db_user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=hashed_password,
        role="student",
        is_verified=True if settings.DEV_MODE else False, # Auto-verify in DEV_MODE
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # Generate OTP (if not DEV_MODE or if we want to support verify flow)
    otp_code = f"{random.randint(100000, 999999)}"
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    
    otp_hash = get_password_hash(otp_code)
    db_otp = OTPVerification(
        user_id=db_user.id,
        otp_hash=otp_hash,
        expires_at=expires_at
    )
    db.add(db_otp)
    db.commit()
    
    send_otp_email(db_user.email, otp_code)

    return db_user

@router.post("/verify-otp")
def verify_otp(email: str, otp_code: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    otp_record = db.query(OTPVerification).filter(
        OTPVerification.user_id == user.id
    ).order_by(OTPVerification.created_at.desc()).first()
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="No OTP code issued for this user")
        
    if datetime.utcnow() > otp_record.expires_at:
        raise HTTPException(status_code=400, detail="OTP expired")
        
    if not verify_password(otp_code, otp_record.otp_hash):
        raise HTTPException(status_code=400, detail="Invalid OTP code")
        
    user.is_verified = True
    db.commit()
    
    return {"detail": "Email verified successfully"}

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Admin login is restricted and handled separately or using virtual comparison in admin endpoint
    if form_data.username == settings.ADMIN_USERNAME and form_data.password == settings.ADMIN_PASSWORD:
        access_token = create_access_token(subject="admin_user")
        return {"access_token": access_token, "token_type": "bearer"}

    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or user.role == "admin" or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
    if not user.is_verified and not settings.DEV_MODE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address not verified yet"
        )
        
    access_token = create_access_token(subject=user.email)
    return {"access_token": access_token, "token_type": "bearer"}


import secrets
import string
from app.services.email_service import send_email

def generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

@router.post("/admin/create-teacher", response_model=UserResponse)
def create_teacher(
    user_in: UserCreate,
    current_user: User = Depends(RoleChecker(["admin"])),
    db: Session = Depends(get_db)
):
    target_email = user_in.email.strip().lower()
    existing_user = db.query(User).filter(func.lower(User.email) == target_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user account with this email address already exists."
        )
        
    temp_password = user_in.password if user_in.password else generate_temp_password()
    hashed_password = get_password_hash(temp_password)
    db_user = User(
        name=user_in.name,
        email=target_email,
        password_hash=hashed_password,
        role="teacher",
        is_verified=True,
        face_enrolled=True,
        must_change_password=True
    )
    db.add(db_user)
    try:
        db.commit()
        db.refresh(db_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user account with this email address already exists."
        )
    
    send_email(
        db_user.email,
        "Your SecureExam AI Teacher Account Details",
        f"Hello {db_user.name},\n\nAn instructor account has been created for you.\n"
        f"Login Email: {db_user.email}\nTemporary Password: {temp_password}\n\n"
        f"You will be prompted to change this password on your first login."
    )
    return db_user

@router.post("/change-password")
def change_password(
    old_password: str,
    new_password: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if not verify_password(old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = get_password_hash(new_password)
    current_user.must_change_password = False
    db.commit()
    return {"detail": "Password updated successfully"}



@router.get("/me")
def get_current_user_profile(current_user: User = Depends(get_current_active_user)):
    """Return the logged-in user's profile — works for student, teacher, and admin roles."""
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "face_enrolled": getattr(current_user, "face_enrolled", True),
        "must_change_password": getattr(current_user, "must_change_password", False),
    }

@router.post("/forgot-password")
def forgot_password(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    # Always return success message to avoid email enumeration
    if user:
        otp_code = f"{random.randint(100000, 999999)}"
        db_otp = OTPVerification(
            user_id=user.id,
            otp_hash=get_password_hash(otp_code),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        db.add(db_otp)
        db.commit()
        send_email(
            user.email,
            "Reset your SecureExam AI Password",
            f"Your password reset verification code is: {otp_code}\nExpires in 10 minutes."
        )
    return {"detail": "If that email is registered, a reset code has been sent."}

@router.post("/reset-password")
def reset_password(email: str, code: str, new_password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid code or email")

    otp_record = db.query(OTPVerification).filter(
        OTPVerification.user_id == user.id
    ).order_by(OTPVerification.created_at.desc()).first()

    if not otp_record or datetime.utcnow() > otp_record.expires_at:
        raise HTTPException(status_code=400, detail="Code expired or invalid")
    if not verify_password(code, otp_record.otp_hash):
        raise HTTPException(status_code=400, detail="Invalid code")

    user.password_hash = get_password_hash(new_password)
    user.must_change_password = False
    db.commit()
    return {"detail": "Password reset successfully"}

