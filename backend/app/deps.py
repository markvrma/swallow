"""Shared dependency aliases.

Annotated aliases keep `Depends(...)` out of argument defaults, which is both the
current FastAPI idiom and what keeps ruff's B008 quiet.
"""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.security import get_current_user, get_current_user_optional

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_current_user_optional)]
