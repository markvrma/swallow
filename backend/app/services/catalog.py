"""Importing shows from the provider into our local catalogue."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Episode, Season, Show
from app.providers.tvmaze import ProviderShowBundle, TVmazeClient

# Episodes are inserted in chunks so a 15k-episode soap opera doesn't build one
# enormous statement.
_EPISODE_CHUNK = 500


async def fetch_bundle(tvmaze_id: int) -> ProviderShowBundle:
    async with TVmazeClient() as client:
        return await client.fetch_show_bundle(tvmaze_id)


def upsert_bundle(db: Session, bundle: ProviderShowBundle) -> Show:
    """Write a provider bundle into shows/seasons/episodes. Idempotent."""
    settings = get_settings()
    db.execute(text(f"SET LOCAL statement_timeout = {settings.import_statement_timeout_ms}"))

    p = bundle.show
    show_stmt = (
        insert(Show)
        .values(
            tvmaze_id=p.tvmaze_id,
            name=p.name,
            premiered=p.premiered,
            ended=p.ended,
            status=p.status,
            summary=p.summary,
            image_medium=p.image_medium,
            image_original=p.image_original,
            imdb_id=p.imdb_id,
            official_site=p.official_site,
            episodes_synced_at=datetime.now(UTC),
        )
        .on_conflict_do_update(
            index_elements=[Show.tvmaze_id],
            set_={
                "name": p.name,
                "premiered": p.premiered,
                "ended": p.ended,
                "status": p.status,
                "summary": p.summary,
                "image_medium": p.image_medium,
                "image_original": p.image_original,
                "imdb_id": p.imdb_id,
                "official_site": p.official_site,
                "episodes_synced_at": datetime.now(UTC),
            },
        )
        .returning(Show.id)
    )
    show_id = db.execute(show_stmt).scalar_one()

    if bundle.seasons:
        db.execute(
            insert(Season)
            .values(
                [
                    {
                        "show_id": show_id,
                        "number": s.number,
                        "episode_order": s.episode_order,
                        "premiere_date": s.premiere_date,
                        "end_date": s.end_date,
                    }
                    for s in bundle.seasons
                ]
            )
            .on_conflict_do_update(
                constraint="uq_seasons_show_number",
                set_={
                    "episode_order": text("excluded.episode_order"),
                    "premiere_date": text("excluded.premiere_date"),
                    "end_date": text("excluded.end_date"),
                },
            )
        )

    for start in range(0, len(bundle.episodes), _EPISODE_CHUNK):
        chunk = bundle.episodes[start : start + _EPISODE_CHUNK]
        db.execute(
            insert(Episode)
            .values(
                [
                    {
                        "show_id": show_id,
                        "tvmaze_id": e.tvmaze_id,
                        "season": e.season,
                        "number": e.number,
                        "name": e.name,
                        "airdate": e.airdate,
                        "runtime": e.runtime,
                        "summary": e.summary,
                        "image_medium": e.image_medium,
                        "image_original": e.image_original,
                        "tvmaze_url": e.url,
                    }
                    for e in chunk
                ]
            )
            .on_conflict_do_update(
                constraint="uq_episodes_show_season_number",
                set_={
                    "tvmaze_id": text("excluded.tvmaze_id"),
                    "name": text("excluded.name"),
                    "airdate": text("excluded.airdate"),
                    "runtime": text("excluded.runtime"),
                    "summary": text("excluded.summary"),
                    "image_medium": text("excluded.image_medium"),
                    "image_original": text("excluded.image_original"),
                    "tvmaze_url": text("excluded.tvmaze_url"),
                },
            )
        )

    db.commit()
    return db.execute(select(Show).where(Show.id == show_id)).scalar_one()


async def import_show(db: Session, tvmaze_id: int) -> Show:
    """Import a show and its full episode list. Safe to call repeatedly."""
    return upsert_bundle(db, await fetch_bundle(tvmaze_id))


async def ensure_show(db: Session, tvmaze_id: int) -> Show:
    """Return the local show, importing it only if we've never synced episodes."""
    show = db.execute(select(Show).where(Show.tvmaze_id == tvmaze_id)).scalar_one_or_none()
    if show is not None and show.episodes_synced_at is not None:
        return show
    return await import_show(db, tvmaze_id)
