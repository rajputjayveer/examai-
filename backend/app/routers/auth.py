from datetime import datetime, timedelta
import random
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.deps import get_current_active_user
from app.db.base import get_db
from app.models.user import User
from app.models.otp import OTPVerification
from app.schemas.user import UserCreate, UserResponse, UserLogin, Token
from app.core.config import settings

router = APIRouter()

def send_otp_email(email: str, otp_code: str):
    # If in DEV_MODE, print to console
    if settings.DEV_MODE:
        print(f"\n--- [DEV MODE] OTP Code for {email}: {otp_code} ---\n")
    else:
        # SMTP email logic could be integrated here, but for now we print it
        print(f"\n--- [SMTP MOCKED] OTP Code for {email}: {otp_code} ---\n")

@router.post("/register", response_model=UserResponse)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    if user_in.role != "student":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Self-registration is only allowed for students.",
        )
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
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


@router.post("/admin/create-teacher", response_model=UserResponse)
def create_teacher(
    user_in: UserCreate,
    db: Session = Depends(get_db)
):
    # Verify it is admin based on current flow
    # We can allow admin to create teacher directly
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already exists"
        )
        
    hashed_password = get_password_hash(user_in.password)
    db_user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=hashed_password,
        role="teacher",
        is_verified=True,
        face_enrolled=True # Teachers don't enroll faces
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.get("/me")
def get_current_user_profile(current_user: User = Depends(get_current_active_user)):
    """Return the logged-in user's profile — works for student, teacher, and admin roles."""
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "face_enrolled": getattr(current_user, "face_enrolled", True),
    }
