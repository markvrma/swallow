import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import EmailCode, User

CODE_LENGTH = 6


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


def issue_code(db: Session, user: User) -> str:
    """Replace any outstanding code with a fresh one and return the plaintext.

    Only the hash is stored, so a database dump does not hand out logins. Codes are
    short, which is fine only because they expire and attempts are capped.
    """
    settings = get_settings()
    code = f"{secrets.randbelow(10**CODE_LENGTH):0{CODE_LENGTH}d}"

    db.execute(delete(EmailCode).where(EmailCode.user_id == user.id))
    db.add(
        EmailCode(
            user_id=user.id,
            code_hash=_hash_code(code),
            expires_at=_now() + timedelta(minutes=settings.otp_ttl_minutes),
        )
    )
    db.commit()
    return code


def seconds_until_resend_allowed(db: Session, user: User) -> int:
    """0 when a new code may be sent, else the wait left. Stops mailbox flooding."""
    settings = get_settings()
    latest = db.execute(
        select(EmailCode)
        .where(EmailCode.user_id == user.id)
        .order_by(EmailCode.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if latest is None:
        return 0
    elapsed = (_now() - latest.created_at).total_seconds()
    return max(0, int(settings.otp_resend_interval_seconds - elapsed))


class CodeError(Exception):
    """A code was rejected. The message is safe to show the user."""


def verify_code(db: Session, user: User, code: str) -> None:
    """Consume the user's outstanding code, or raise CodeError.

    Every failure burns an attempt, and the row is deleted once the cap is hit, so
    guessing a 6-digit code needs a fresh email each five tries.
    """
    settings = get_settings()
    row = db.execute(
        select(EmailCode).where(EmailCode.user_id == user.id)
    ).scalar_one_or_none()
    if row is None:
        raise CodeError("Request a new code")
    if row.expires_at <= _now():
        db.execute(delete(EmailCode).where(EmailCode.id == row.id))
        db.commit()
        raise CodeError("That code has expired -- request a new one")

    if not secrets.compare_digest(row.code_hash, _hash_code(code)):
        row.attempts += 1
        if row.attempts >= settings.otp_max_attempts:
            db.execute(delete(EmailCode).where(EmailCode.id == row.id))
            db.commit()
            raise CodeError("Too many attempts -- request a new code")
        db.commit()
        raise CodeError("That code is not right")

    db.execute(delete(EmailCode).where(EmailCode.user_id == user.id))
    user.email_verified_at = _now()
    db.commit()
