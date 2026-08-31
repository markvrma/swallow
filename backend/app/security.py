import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Session_, User

_hasher = PasswordHasher()
_settings = get_settings()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return True


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User, response: Response) -> str:
    """Mint an opaque session token, store only its hash, and set the cookie."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(days=_settings.session_ttl_days)
    db.add(Session_(token_hash=_hash_token(token), user_id=user.id, expires_at=expires_at))
    db.commit()

    response.set_cookie(
        key=_settings.session_cookie_name,
        value=token,
        max_age=_settings.session_ttl_days * 24 * 3600,
        httponly=True,
        secure=_settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return token


def destroy_session(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(_settings.session_cookie_name)
    if token:
        db.execute(delete(Session_).where(Session_.token_hash == _hash_token(token)))
        db.commit()
    response.delete_cookie(_settings.session_cookie_name, path="/")


def get_current_user_optional(
    request: Request, db: Annotated[Session, Depends(get_db)]
) -> User | None:
    token = request.cookies.get(_settings.session_cookie_name)
    if not token:
        return None

    row = db.execute(
        select(Session_, User)
        .join(User, User.id == Session_.user_id)
        .where(Session_.token_hash == _hash_token(token))
    ).first()
    if row is None:
        return None

    session_row, user = row
    if session_row.expires_at <= datetime.now(UTC):
        db.execute(delete(Session_).where(Session_.token_hash == session_row.token_hash))
        db.commit()
        return None
    return user


def get_current_user(
    user: Annotated[User | None, Depends(get_current_user_optional)],
) -> User:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    return user
