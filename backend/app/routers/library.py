import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession
from app.models import Season, Show, UserShow, WatchHistory
from app.providers.tvmaze import ShowNotFound, TVmazeError
from app.schemas import (
    AddLibraryShowRequest,
    LibraryShowOut,
    ShowOut,
    UpdateLibraryShowRequest,
)
from app.services.catalog import ensure_show
from app.services.picker import (
    Pool,
    PoolNotFoundError,
    build_show_pool,
    count_pool,
    count_remaining,
    reset_pool_history,
)

router = APIRouter(prefix="/api/me", tags=["library"])


def _validate_seasons(db: Session, show: Show, seasons: list[int]) -> list[int]:
    """Reject seasons the show doesn't have, so a pool can never be silently empty."""
    known = set(
        db.execute(select(Season.number).where(Season.show_id == show.id)).scalars()
    )
    wanted = sorted(set(seasons))
    unknown = [s for s in wanted if s not in known]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{show.name} has no season(s) {unknown}",
        )
    return wanted


def _library_row(db: Session, user_id: uuid.UUID, user_show: UserShow) -> LibraryShowOut:
    pool = Pool(pairs=[(user_show.show_id, s) for s in user_show.seasons])
    return LibraryShowOut(
        show=ShowOut.model_validate(user_show.show),
        seasons=user_show.seasons,
        episode_count=count_pool(db, pool),
        remaining_count=count_remaining(db, pool, user_id),
    )


@router.get("/shows", response_model=list[LibraryShowOut])
def list_library(user: CurrentUser, db: DbSession):
    rows = (
        db.execute(
            select(UserShow)
            .where(UserShow.user_id == user.id)
            .order_by(UserShow.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [_library_row(db, user.id, row) for row in rows]


@router.post("/shows", response_model=LibraryShowOut, status_code=status.HTTP_201_CREATED)
async def add_library_show(
    payload: AddLibraryShowRequest, user: CurrentUser, db: DbSession
):
    """Add a show to the library. Seasons are mandatory -- see AddLibraryShowRequest."""
    try:
        show = await ensure_show(db, payload.tvmaze_id)
    except ShowNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Show not found on TVmaze"
        ) from exc
    except TVmazeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"TVmaze unavailable: {exc}"
        ) from exc

    seasons = _validate_seasons(db, show, payload.seasons)
    db.execute(
        insert(UserShow)
        .values(user_id=user.id, show_id=show.id, seasons=seasons)
        .on_conflict_do_update(
            constraint="uq_user_shows_user_show", set_={"seasons": seasons}
        )
    )
    db.commit()

    user_show = db.execute(
        select(UserShow).where(UserShow.user_id == user.id, UserShow.show_id == show.id)
    ).scalar_one()
    return _library_row(db, user.id, user_show)


@router.patch("/shows/{show_id}", response_model=LibraryShowOut)
def update_library_show(
    show_id: uuid.UUID,
    payload: UpdateLibraryShowRequest,
    user: CurrentUser,
    db: DbSession,
):
    user_show = db.execute(
        select(UserShow).where(UserShow.user_id == user.id, UserShow.show_id == show_id)
    ).scalar_one_or_none()
    if user_show is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Show is not in your library"
        )

    user_show.seasons = _validate_seasons(db, user_show.show, payload.seasons)
    db.commit()
    db.refresh(user_show)
    return _library_row(db, user.id, user_show)


@router.delete("/shows/{show_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_library_show(show_id: uuid.UUID, user: CurrentUser, db: DbSession):
    result = db.execute(
        delete(UserShow).where(UserShow.user_id == user.id, UserShow.show_id == show_id)
    )
    if not result.rowcount:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Show is not in your library"
        )
    db.commit()


@router.get("/cards", response_model=list[LibraryShowOut])
def library_cards(
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
):
    """A random handful of library shows. Capped at 5 by default, on purpose."""
    rows = (
        db.execute(
            select(UserShow)
            .where(UserShow.user_id == user.id)
            .order_by(func.random())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return [_library_row(db, user.id, row) for row in rows]


@router.delete("/history/{episode_id}", status_code=status.HTTP_204_NO_CONTENT)
def unwatch_episode(episode_id: uuid.UUID, user: CurrentUser, db: DbSession):
    """Put an episode back into the pool."""
    result = db.execute(
        delete(WatchHistory).where(
            WatchHistory.user_id == user.id, WatchHistory.episode_id == episode_id
        )
    )
    if not result.rowcount:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Episode is not in your history"
        )
    db.commit()


@router.post("/shows/{show_id}/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_show_history(show_id: uuid.UUID, user: CurrentUser, db: DbSession):
    """Clear history for one show, so all of its episodes become available again."""
    try:
        pool = build_show_pool(db, user.id, show_id)
    except PoolNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    reset_pool_history(db, pool, user.id)
    db.commit()
