"""What is left of auth once Clerk owns it: telling the client who it is.

Sign-up, sign-in, sign-out, email verification and OAuth all happen in Clerk, on the
frontend. The API's only job is to turn a verified token into the local user row.
"""

import logging

from fastapi import APIRouter, Response, status

from app.deps import CurrentUser, DbSession
from app.schemas import UserOut
from app.security import clerk_client

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("swallow.auth")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    """The local account for the bearer token. Creates it on first call."""
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(user: CurrentUser, db: DbSession):
    """Delete the account: the local row (cascades to library/presets/history)
    and the Clerk identity, so the same login can't come back to an empty row."""
    if clerk_client is not None:
        try:
            clerk_client.users.delete(user_id=user.clerk_user_id)
        except Exception:
            logger.exception("Clerk user delete failed for %s", user.clerk_user_id)
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
