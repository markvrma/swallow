"""What is left of auth once Clerk owns it: telling the client who it is.

Sign-up, sign-in, sign-out, email verification and OAuth all happen in Clerk, on the
frontend. The API's only job is to turn a verified token into the local user row.
"""

from fastapi import APIRouter

from app.deps import CurrentUser
from app.schemas import UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    """The local account for the bearer token. Creates it on first call."""
    return user
