import random
import secrets
import string
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.deps import get_current_active_user, RoleChecker
from app.db.base import get_db
from app.models.user import User
from app.models.otp import OTPVerification
from app.models.pending_enrollment import PendingEnrollment
from app.schemas.user import UserCreate, UserResponse, UserLogin, Token
from app.core.config import settings
from app.services.email_service import send_email

router = APIRouter()
_limiter = Limiter(key_func=get_remote_address)


def _send_otp_email(email: str, otp_code: str):
    send_email(
        email,
        "Verify your SecureExam AI account",
        f"Your verification code is: {otp_code}\nExpires in 5 minutes."
    )


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    if user_in.role != "student":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Self-registration is only allowed for students.",
        )
    user_email_clean = user_in.email.strip().lower()

    # Must be invited first
    invite_result = await db.execute(
        select(PendingEnrollment).where(PendingEnrollment.email == user_email_clean)
    )
    pending_invite = invite_result.scalar_one_or_none()
    if not pending_invite:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is restricted. You must be added to a class roster by an instructor before you can register an account."
        )

    existing_result = await db.execute(
        select(User).where(User.email == user_email_clean)
    )
    existing_user = existing_result.scalar_one_or_none()
    if existing_user:
        if not existing_user.is_verified:
            # Fix #5: Delete old OTPs for this user before issuing a new one
            await db.execute(
                select(OTPVerification).where(OTPVerification.user_id == existing_user.id)
            )
            from sqlalchemy import delete as sa_delete
            await db.execute(sa_delete(OTPVerification).where(OTPVerification.user_id == existing_user.id))
            otp_code = f"{random.randint(100000, 999999)}"
            expires_at = datetime.utcnow() + timedelta(minutes=5)
            db.add(OTPVerification(
                user_id=existing_user.id,
                otp_hash=get_password_hash(otp_code),
                expires_at=expires_at
            ))
            await db.commit()
            _send_otp_email(existing_user.email, otp_code)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email is unverified. OTP has been resent. Please verify.",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The user with this email already exists in the system.",
            )

    hashed_password = get_password_hash(user_in.password)
    db_user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=hashed_password,
        role="student",
        is_verified=True if settings.DEV_MODE else False,
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    # Fix #5: Clean up old OTPs before issuing a new one
    from sqlalchemy import delete as sa_delete
    await db.execute(sa_delete(OTPVerification).where(OTPVerification.user_id == db_user.id))
    otp_code = f"{random.randint(100000, 999999)}"
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    db.add(OTPVerification(
        user_id=db_user.id,
        otp_hash=get_password_hash(otp_code),
        expires_at=expires_at
    ))
    await db.commit()
    _send_otp_email(db_user.email, otp_code)
    return db_user


@router.post("/verify-otp")
async def verify_otp(email: str, otp_code: str, db: AsyncSession = Depends(get_db)):
    user_result = await db.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp_result = await db.execute(
        select(OTPVerification)
        .where(OTPVerification.user_id == user.id)
        .order_by(OTPVerification.created_at.desc())
    )
    otp_record = otp_result.scalars().first()

    if not otp_record:
        raise HTTPException(status_code=400, detail="No OTP code issued for this user")
    if datetime.utcnow() > otp_record.expires_at:
        raise HTTPException(status_code=400, detail="OTP expired")
    if not verify_password(otp_code, otp_record.otp_hash):
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    user.is_verified = True
    await db.commit()
    return {"detail": "Email verified successfully"}


@router.post("/login", response_model=Token)
@_limiter.limit("5/minute")   # Fix #11: brute-force protection — 5 login attempts per IP per minute
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    # Admin login
    if form_data.username == settings.ADMIN_USERNAME and form_data.password == settings.ADMIN_PASSWORD:
        access_token = create_access_token(subject="admin_user")
        return {"access_token": access_token, "token_type": "bearer"}

    user_result = await db.execute(select(User).where(User.email == form_data.username))
    user = user_result.scalar_one_or_none()
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
async def create_teacher(
    user_in: UserCreate,
    current_user: User = Depends(RoleChecker(["admin"])),
    db: AsyncSession = Depends(get_db)
):
    target_email = user_in.email.strip().lower()
    existing_result = await db.execute(
        select(User).where(func.lower(User.email) == target_email)
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user account with this email address already exists."
        )

    temp_password = user_in.password if user_in.password else _generate_temp_password()
    db_user = User(
        name=user_in.name,
        email=target_email,
        password_hash=get_password_hash(temp_password),
        role="teacher",
        is_verified=True,
        face_enrolled=True,
        must_change_password=True
    )
    db.add(db_user)
    try:
        await db.commit()
        await db.refresh(db_user)
    except IntegrityError:
        await db.rollback()
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
async def change_password(
    old_password: str,
    new_password: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    if not verify_password(old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = get_password_hash(new_password)
    current_user.must_change_password = False
    await db.commit()
    return {"detail": "Password updated successfully"}


@router.get("/me")
async def get_current_user_profile(current_user: User = Depends(get_current_active_user)):
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
@_limiter.limit("3/minute")   # Fix #11: prevent OTP spam — 3 requests per IP per minute
async def forgot_password(request: Request, email: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user:
        # Fix #5: Remove old OTPs before issuing a new one
        from sqlalchemy import delete as sa_delete
        await db.execute(sa_delete(OTPVerification).where(OTPVerification.user_id == user.id))
        otp_code = f"{random.randint(100000, 999999)}"
        db.add(OTPVerification(
            user_id=user.id,
            otp_hash=get_password_hash(otp_code),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        ))
        await db.commit()
        send_email(
            user.email,
            "Reset your SecureExam AI Password",
            f"Your password reset verification code is: {otp_code}\nExpires in 10 minutes."
        )
    return {"detail": "If that email is registered, a reset code has been sent."}


@router.post("/reset-password")
async def reset_password(
    email: str,
    code: str,
    new_password: str,
    db: AsyncSession = Depends(get_db)
):
    user_result = await db.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid code or email")

    otp_result = await db.execute(
        select(OTPVerification)
        .where(OTPVerification.user_id == user.id)
        .order_by(OTPVerification.created_at.desc())
    )
    otp_record = otp_result.scalars().first()
    if not otp_record or datetime.utcnow() > otp_record.expires_at:
        raise HTTPException(status_code=400, detail="Code expired or invalid")
    if not verify_password(code, otp_record.otp_hash):
        raise HTTPException(status_code=400, detail="Invalid code")

    user.password_hash = get_password_hash(new_password)
    user.must_change_password = False
    await db.commit()
    return {"detail": "Password reset successfully"}
