"""Authentication: Clerk issues the identity, this module maps it to a local user.

Clerk owns credentials, email verification and the OAuth handshake (GitHub and
anything else enabled in the Clerk dashboard). The API never sees a password. What
arrives is a short-lived session token in the `Authorization` header, which is
verified against Clerk's JWKS, and whose `sub` claim is the stable Clerk user id.

Every row in this schema still points at `users.id`, not at the Clerk id, so an
account can move between identity providers without rewriting foreign keys.
"""

import logging
from typing import Annotated

import httpx
from clerk_backend_api import Clerk
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User

logger = logging.getLogger("swallow.auth")

_settings = get_settings()
_clerk = Clerk(bearer_auth=_settings.clerk_secret_key) if _settings.clerk_secret_key else None


class ClerkIdentity:
    """The verified claims we care about: who they are, and how to reach them."""

    def __init__(self, clerk_user_id: str, email: str | None):
        self.clerk_user_id = clerk_user_id
        self.email = email


def _verify(request: Request) -> ClerkIdentity | None:
    """Verify the bearer token, or return None if there isn't a valid one.

    The Clerk SDK wants an httpx.Request, so the headers are repackaged into one --
    only the Authorization header is read, and no body is ever forwarded.
    """
    if _clerk is None:
        # Failing closed is the only safe default: without a secret key nothing can
        # be verified, and treating every caller as anonymous is the correct outcome.
        logger.error("CLERK_SECRET_KEY is not set; refusing to authenticate anyone")
        return None

    header = request.headers.get("authorization")
    if not header:
        return None

    probe = httpx.Request("GET", str(request.url), headers={"Authorization": header})
    state = _clerk.authenticate_request(
        probe,
        AuthenticateRequestOptions(authorized_parties=_settings.authorized_party_list or None),
    )
    if not state.is_signed_in or state.payload is None:
        return None

    clerk_user_id = state.payload.get("sub")
    if not clerk_user_id:
        return None
    # Clerk puts the primary email in a custom claim only if the JWT template says
    # so; `email` is the conventional name, and its absence is not fatal.
    email = state.payload.get("email") or state.payload.get("primary_email_address")
    return ClerkIdentity(clerk_user_id=clerk_user_id, email=email)


def local_user_for(db: Session, identity: ClerkIdentity) -> User:
    """Find or create the local row for a Clerk identity.

    First sign-in creates the row, so there is no separate registration endpoint --
    the account exists in Clerk the moment the user finishes signing up there.
    """
    user = db.execute(
        select(User).where(User.clerk_user_id == identity.clerk_user_id)
    ).scalar_one_or_none()

    if user is not None:
        # Keep the local copy of the email current; users change it in Clerk.
        if identity.email and user.email != identity.email:
            user.email = identity.email
            db.commit()
        return user

    user = User(
        clerk_user_id=identity.clerk_user_id,
        email=identity.email or f"{identity.clerk_user_id}@clerk.local",
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two requests from a fresh account can race here, and an email that already
        # belongs to another Clerk account collides on the unique index. Re-read
        # rather than fail: whichever insert won is the row we want.
        db.rollback()
        user = db.execute(
            select(User).where(User.clerk_user_id == identity.clerk_user_id)
        ).scalar_one_or_none()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That email already belongs to another account",
            ) from None
    else:
        db.refresh(user)
    return user


def get_current_user_optional(
    request: Request, db: Annotated[Session, Depends(get_db)]
) -> User | None:
    identity = _verify(request)
    return local_user_for(db, identity) if identity else None


def get_current_user(
    user: Annotated[User | None, Depends(get_current_user_optional)],
) -> User:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    return user
