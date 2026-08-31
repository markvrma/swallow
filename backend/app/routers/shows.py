import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession
from app.models import Episode, Season, Show, UserShow
from app.providers.tvmaze import ShowNotFound, TVmazeClient, TVmazeError
from app.schemas import (
    ImportShowRequest,
    SeasonOut,
    ShowDetailOut,
    ShowSearchResult,
)
from app.services.catalog import ensure_show

router = APIRouter(prefix="/api/shows", tags=["shows"])


def show_detail(db: Session, show: Show) -> ShowDetailOut:
    """Season list annotated with the episode count we actually hold."""
    counts = dict(
        db.execute(
            select(Episode.season, func.count())
            .where(Episode.show_id == show.id)
            .group_by(Episode.season)
        ).all()
    )
    seasons = db.execute(
        select(Season).where(Season.show_id == show.id).order_by(Season.number)
    ).scalars().all()

    detail = ShowDetailOut.model_validate(show)
    detail.seasons = [
        SeasonOut(
            number=s.number,
            episode_order=s.episode_order,
            premiere_date=s.premiere_date,
            episode_count=counts.get(s.number, 0),
        )
        for s in seasons
        if counts.get(s.number, 0) > 0
    ]
    return detail


@router.get("/search", response_model=list[ShowSearchResult])
async def search_shows(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str, Query(min_length=1, max_length=100)],
):
    try:
        async with TVmazeClient() as client:
            results = await client.search_shows(q)
    except TVmazeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"TVmaze unavailable: {exc}"
        ) from exc

    owned = set(
        db.execute(
            select(Show.tvmaze_id)
            .join(UserShow, UserShow.show_id == Show.id)
            .where(UserShow.user_id == user.id)
        ).scalars()
    )
    return [
        ShowSearchResult(
            tvmaze_id=r.tvmaze_id,
            name=r.name,
            premiered=r.premiered,
            ended=r.ended,
            status=r.status,
            summary=r.summary,
            image_medium=r.image_medium,
            in_library=r.tvmaze_id in owned,
        )
        for r in results
    ]


@router.post("/import", response_model=ShowDetailOut)
async def import_show_endpoint(
    payload: ImportShowRequest,
    user: CurrentUser,
    db: DbSession,
):
    """Import a show so its seasons can be presented for selection. Idempotent."""
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
    return show_detail(db, show)


@router.get("/{show_id}", response_model=ShowDetailOut)
def get_show(
    show_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
):
    show = db.get(Show, show_id)
    if show is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Show not found")
    return show_detail(db, show)
