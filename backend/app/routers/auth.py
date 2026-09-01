import logging

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import CurrentUser, DbSession
from app.models import User
from app.schemas import (
    LoginRequest,
    PendingVerificationOut,
    RegisterRequest,
    ResendCodeRequest,
    UserOut,
    VerifyEmailRequest,
)
from app.security import (
    create_session,
    destroy_session,
    hash_password,
    verify_password,
)
from app.services.mailer import MailError, send_verification_code
from app.services.verification import (
    CodeError,
    issue_code,
    seconds_until_resend_allowed,
    verify_code,
)

logger = logging.getLogger("swallow.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])

UNVERIFIED_DETAIL = "Email not verified"


def _send_code(db: DbSession, user: User) -> None:
    """Issue and mail a code. A dead mail server must not leave a half-made signup."""
    code = issue_code(db, user)
    try:
        send_verification_code(user.email, code)
    except MailError as exc:
        logger.exception("Could not send verification code to %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not send the verification email -- try again shortly",
        ) from exc


@router.post(
    "/register",
    response_model=PendingVerificationOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def register(payload: RegisterRequest, db: DbSession):
    """Create the account and mail a code. No session until the code is entered."""
    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.execute(
            select(User).where(User.email == payload.email)
        ).scalar_one_or_none()
        # An unverified signup can be restarted; a verified one is a real conflict.
        if existing is None or existing.email_verified_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
            ) from None
        existing.password_hash = hash_password(payload.password)
        db.commit()
        user = existing
    else:
        db.refresh(user)

    _send_code(db, user)
    return PendingVerificationOut(email=user.email)


@router.post("/verify", response_model=UserOut)
def verify_email(payload: VerifyEmailRequest, response: Response, db: DbSession):
    """Exchange a valid code for a session. This is the only way to finish signup."""
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    # An already-verified account must never take this path: it would hand out a
    # session without checking anything. Those users sign in with their password.
    if user is None or user.email_verified_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Request a new code"
        )
    try:
        verify_code(db, user, payload.code)
    except CodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    create_session(db, user, response)
    return user


@router.post("/resend", status_code=status.HTTP_202_ACCEPTED)
def resend_code(payload: ResendCodeRequest, db: DbSession):
    """Mail a fresh code. Silent about unknown or already-verified addresses."""
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if user is None or user.email_verified_at is not None:
        return {"sent": True}

    wait = seconds_until_resend_allowed(db, user)
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Wait {wait}s before asking for another code",
        )
    _send_code(db, user)
    return {"sent": True}


@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response, db: DbSession):
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if user is None or not verify_password(user.password_hash, payload.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    if user.email_verified_at is None:
        # 403, not 401: the credentials were right, the account just isn't verified.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=UNVERIFIED_DETAIL)
    create_session(db, user, response)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: DbSession):
    destroy_session(db, request, response)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
