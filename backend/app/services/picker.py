"""Choosing a random episode a user hasn't been served yet.

A "pool" is a set of (show, season) pairs plus an optional runtime cap. All three
modes -- plain random, a single show card, and a saved preset -- build a pool and
run it through the same query.

History is global per user: an episode served once is excluded from every future
roll. When a pool runs dry, only that pool's slice of history is cleared, so
exhausting one show does not un-watch another.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import Select, and_, delete, func, or_, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Episode, Preset, PresetShow, Show, UserShow, WatchHistory

# Season 0 is TVmaze's bucket for specials. They stay out of pools unless a user
# explicitly asks for season 0.
SPECIALS_SEASON = 0


class EmptyPoolError(Exception):
    """The pool contains no episodes at all -- a configuration problem, not exhaustion."""


class PoolNotFoundError(Exception):
    """The requested show or preset does not belong to this user."""


@dataclass(slots=True)
class Pool:
    """(show_id, season) pairs to draw from, plus an optional runtime cap."""

    pairs: list[tuple[uuid.UUID, int]]
    max_runtime: int | None = None
    preset_id: uuid.UUID | None = None
    source: str = "random"

    @property
    def is_empty(self) -> bool:
        return not self.pairs


@dataclass(slots=True)
class PickResult:
    episode: Episode
    pool_reset: bool


def _pairs_from_rows(rows: list[tuple[uuid.UUID, list[int]]]) -> list[tuple[uuid.UUID, int]]:
    pairs: list[tuple[uuid.UUID, int]] = []
    for show_id, seasons in rows:
        for season in sorted(set(seasons or [])):
            pairs.append((show_id, season))
    return pairs


def build_library_pool(db: Session, user_id: uuid.UUID) -> Pool:
    """Every show in the user's library, each limited to its selected seasons."""
    rows = db.execute(
        select(UserShow.show_id, UserShow.seasons).where(UserShow.user_id == user_id)
    ).all()
    return Pool(pairs=_pairs_from_rows([(r[0], r[1]) for r in rows]), source="random")


def build_show_pool(db: Session, user_id: uuid.UUID, show_id: uuid.UUID) -> Pool:
    """One show from the user's library -- a home-page card click."""
    row = db.execute(
        select(UserShow.show_id, UserShow.seasons).where(
            UserShow.user_id == user_id, UserShow.show_id == show_id
        )
    ).first()
    if row is None:
        raise PoolNotFoundError("Show is not in your library")
    return Pool(pairs=_pairs_from_rows([(row[0], row[1])]), source="show")


def build_preset_pool(db: Session, user_id: uuid.UUID, preset_id: uuid.UUID) -> Pool:
    """A saved controlled-random configuration."""
    preset = db.execute(
        select(Preset).where(Preset.id == preset_id, Preset.user_id == user_id)
    ).scalar_one_or_none()
    if preset is None:
        raise PoolNotFoundError("Preset not found")

    rows = db.execute(
        select(PresetShow.show_id, PresetShow.seasons).where(PresetShow.preset_id == preset.id)
    ).all()
    return Pool(
        pairs=_pairs_from_rows([(r[0], r[1]) for r in rows]),
        max_runtime=preset.max_runtime,
        preset_id=preset.id,
        source="preset",
    )


def _pool_filter(pool: Pool):
    """SQL predicate matching every episode in the pool, before history exclusion."""
    conditions = [tuple_(Episode.show_id, Episode.season).in_(pool.pairs)]

    if pool.max_runtime is not None:
        # An unknown runtime cannot be shown to fit the cap, so it is excluded
        # whenever a cap is active.
        conditions.append(
            and_(Episode.runtime.is_not(None), Episode.runtime <= pool.max_runtime)
        )

    # Specials are excluded unless season 0 was explicitly selected for that show.
    shows_wanting_specials = [s for s, season in pool.pairs if season == SPECIALS_SEASON]
    if not shows_wanting_specials:
        conditions.append(Episode.season != SPECIALS_SEASON)
    else:
        conditions.append(
            or_(
                Episode.season != SPECIALS_SEASON,
                Episode.show_id.in_(shows_wanting_specials),
            )
        )

    return and_(*conditions)


def _eligible_query(pool: Pool, user_id: uuid.UUID, *, exclude_seen: bool) -> Select:
    stmt = select(Episode).where(_pool_filter(pool))
    if exclude_seen:
        stmt = stmt.where(
            ~select(WatchHistory.id)
            .where(WatchHistory.user_id == user_id, WatchHistory.episode_id == Episode.id)
            .exists()
        )
    return stmt


def count_pool(db: Session, pool: Pool) -> int:
    """How many episodes a pool contains in total, ignoring history."""
    if pool.is_empty:
        return 0
    return db.execute(
        select(func.count()).select_from(Episode).where(_pool_filter(pool))
    ).scalar_one()


def count_remaining(db: Session, pool: Pool, user_id: uuid.UUID) -> int:
    """How many episodes a user has not yet been served from a pool."""
    if pool.is_empty:
        return 0
    return db.execute(
        select(func.count()).select_from(
            _eligible_query(pool, user_id, exclude_seen=True).subquery()
        )
    ).scalar_one()


def _draw(db: Session, pool: Pool, user_id: uuid.UUID, *, exclude_seen: bool) -> Episode | None:
    stmt = _eligible_query(pool, user_id, exclude_seen=exclude_seen).order_by(
        func.random()
    ).limit(1)
    return db.execute(stmt).scalars().first()


def reset_pool_history(db: Session, pool: Pool, user_id: uuid.UUID) -> int:
    """Clear this user's history for the pool's episodes only. Returns rows removed."""
    if pool.is_empty:
        return 0
    episode_ids = select(Episode.id).where(_pool_filter(pool))
    result = db.execute(
        delete(WatchHistory).where(
            WatchHistory.user_id == user_id, WatchHistory.episode_id.in_(episode_ids)
        )
    )
    return result.rowcount or 0


def pick(db: Session, pool: Pool, user_id: uuid.UUID) -> PickResult:
    """Draw an unseen episode from the pool, resetting the pool if it is exhausted.

    The draw, the reset and the history insert all happen in one transaction, so
    two concurrent rolls cannot be handed the same episode.
    """
    if pool.is_empty:
        raise EmptyPoolError("No shows or seasons selected")

    pool_reset = False
    episode = _draw(db, pool, user_id, exclude_seen=True)

    if episode is None:
        # Either the user has seen everything in this pool, or the pool is empty.
        if _draw(db, pool, user_id, exclude_seen=False) is None:
            db.rollback()
            raise EmptyPoolError("No episodes match this selection")

        reset_pool_history(db, pool, user_id)
        pool_reset = True
        episode = _draw(db, pool, user_id, exclude_seen=True)
        if episode is None:  # pragma: no cover -- reset guarantees a candidate
            db.rollback()
            raise EmptyPoolError("No episodes match this selection")

    inserted = db.execute(
        insert(WatchHistory)
        .values(
            user_id=user_id,
            episode_id=episode.id,
            source=pool.source,
            preset_id=pool.preset_id,
        )
        .on_conflict_do_nothing(constraint="uq_watch_history_user_episode")
        .returning(WatchHistory.id)
    ).scalar_one_or_none()

    if inserted is None:
        # A concurrent roll claimed this episode between our draw and our insert.
        # Retry once against the now-updated history.
        db.commit()
        retry = _draw(db, pool, user_id, exclude_seen=True)
        if retry is None:
            raise EmptyPoolError("No episodes match this selection")
        episode = retry
        db.execute(
            insert(WatchHistory)
            .values(
                user_id=user_id,
                episode_id=episode.id,
                source=pool.source,
                preset_id=pool.preset_id,
            )
            .on_conflict_do_nothing(constraint="uq_watch_history_user_episode")
        )

    db.commit()
    return PickResult(episode=episode, pool_reset=pool_reset)


def sample_library_shows(db: Session, user_id: uuid.UUID, limit: int = 5) -> list[Show]:
    """A random handful of the user's shows -- the home page caps this at 5 on purpose."""
    return list(
        db.execute(
            select(Show)
            .join(UserShow, UserShow.show_id == Show.id)
            .where(UserShow.user_id == user_id)
            .order_by(func.random())
            .limit(limit)
        )
        .scalars()
        .all()
    )
