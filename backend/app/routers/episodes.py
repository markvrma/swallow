import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import Episode, Show
from app.schemas import EpisodeOut, EpisodeWithShowOut, ShowOut

router = APIRouter(prefix="/api/episodes", tags=["episodes"])


@router.get("/{episode_id}", response_model=EpisodeWithShowOut)
def get_episode(episode_id: uuid.UUID, user: CurrentUser, db: DbSession):
    episode = db.get(Episode, episode_id)
    if episode is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Episode not found")
    show = db.execute(select(Show).where(Show.id == episode.show_id)).scalar_one()
    return EpisodeWithShowOut(
        episode=EpisodeOut.model_validate(episode), show=ShowOut.model_validate(show)
    )
