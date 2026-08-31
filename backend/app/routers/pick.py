from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import Preset, Show
from app.schemas import EpisodeOut, PickRequest, PickResponse, ShowOut
from app.services.picker import (
    EmptyPoolError,
    PoolNotFoundError,
    build_library_pool,
    build_preset_pool,
    build_show_pool,
    pick,
)

router = APIRouter(prefix="/api", tags=["pick"])


@router.post("/pick", response_model=PickResponse)
def pick_episode(payload: PickRequest, user: CurrentUser, db: DbSession):
    """Draw a random episode the user has not been served yet."""
    try:
        if payload.mode == "random":
            pool = build_library_pool(db, user.id)
        elif payload.mode == "show":
            if payload.show_id is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="show_id is required for mode 'show'",
                )
            pool = build_show_pool(db, user.id, payload.show_id)
        else:
            if payload.preset_id is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="preset_id is required for mode 'preset'",
                )
            pool = build_preset_pool(db, user.id, payload.preset_id)
    except PoolNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    try:
        result = pick(db, pool, user.id)
    except EmptyPoolError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    if pool.preset_id is not None:
        preset = db.get(Preset, pool.preset_id)
        if preset is not None:
            preset.last_used_at = datetime.now(UTC)
            db.commit()

    show = db.execute(select(Show).where(Show.id == result.episode.show_id)).scalar_one()
    return PickResponse(
        episode=EpisodeOut.model_validate(result.episode),
        show=ShowOut.model_validate(show),
        pool_reset=result.pool_reset,
    )
