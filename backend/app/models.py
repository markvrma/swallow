import uuid
from datetime import date, datetime

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import CITEXT, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    # Null until the emailed code is entered. Unverified users cannot sign in.
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class EmailCode(Base):
    """A one-time signup code. Only the hash is stored, and it is single-use."""

    __tablename__ = "email_codes"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_email_codes_user_id", "user_id"),)


class Session_(Base):
    """Opaque server-side session. We store only a hash of the token."""

    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_sessions_user_id", "user_id"),)


class Show(Base):
    __tablename__ = "shows"

    id: Mapped[uuid.UUID] = _uuid_pk()
    tvmaze_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    premiered: Mapped[date | None] = mapped_column(Date)
    ended: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    image_medium: Mapped[str | None] = mapped_column(Text)
    image_original: Mapped[str | None] = mapped_column(Text)
    imdb_id: Mapped[str | None] = mapped_column(Text)
    official_site: Mapped[str | None] = mapped_column(Text)
    episodes_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    seasons: Mapped[list["Season"]] = relationship(
        back_populates="show", cascade="all, delete-orphan"
    )
    episodes: Mapped[list["Episode"]] = relationship(
        back_populates="show", cascade="all, delete-orphan"
    )


class Season(Base):
    __tablename__ = "seasons"

    id: Mapped[uuid.UUID] = _uuid_pk()
    show_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shows.id", ondelete="CASCADE"), nullable=False
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    episode_order: Mapped[int | None] = mapped_column(Integer)
    premiere_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)

    show: Mapped[Show] = relationship(back_populates="seasons")

    __table_args__ = (UniqueConstraint("show_id", "number", name="uq_seasons_show_number"),)


class Episode(Base):
    __tablename__ = "episodes"

    id: Mapped[uuid.UUID] = _uuid_pk()
    show_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shows.id", ondelete="CASCADE"), nullable=False
    )
    tvmaze_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    season: Mapped[int] = mapped_column(Integer, nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str | None] = mapped_column(Text)
    airdate: Mapped[date | None] = mapped_column(Date)
    runtime: Mapped[int | None] = mapped_column(Integer)
    summary: Mapped[str | None] = mapped_column(Text)
    image_medium: Mapped[str | None] = mapped_column(Text)
    image_original: Mapped[str | None] = mapped_column(Text)
    tvmaze_url: Mapped[str | None] = mapped_column(Text)

    show: Mapped[Show] = relationship(back_populates="episodes")

    __table_args__ = (
        UniqueConstraint("show_id", "season", "number", name="uq_episodes_show_season_number"),
        Index("ix_episodes_show_season", "show_id", "season"),
        Index("ix_episodes_show_runtime", "show_id", "runtime"),
    )


class UserShow(Base):
    """A show in a user's library, with the seasons they chose when adding it."""

    __tablename__ = "user_shows"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    show_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shows.id", ondelete="CASCADE"), nullable=False
    )
    seasons: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    show: Mapped[Show] = relationship()

    __table_args__ = (UniqueConstraint("user_id", "show_id", name="uq_user_shows_user_show"),)


class Preset(Base):
    """A saved 'controlled random' configuration."""

    __tablename__ = "presets"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    max_runtime: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    shows: Mapped[list["PresetShow"]] = relationship(
        back_populates="preset", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_presets_user_name"),
        Index("ix_presets_user_id", "user_id"),
    )


class PresetShow(Base):
    """Per-preset season narrowing, independent of the user's global selection."""

    __tablename__ = "preset_shows"

    id: Mapped[uuid.UUID] = _uuid_pk()
    preset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("presets.id", ondelete="CASCADE"), nullable=False
    )
    show_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shows.id", ondelete="CASCADE"), nullable=False
    )
    seasons: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)

    preset: Mapped[Preset] = relationship(back_populates="shows")
    show: Mapped[Show] = relationship(lazy="joined")

    __table_args__ = (
        UniqueConstraint("preset_id", "show_id", name="uq_preset_shows_preset_show"),
    )


class WatchHistory(Base):
    """An episode already served to a user. Excluded from future rolls."""

    __tablename__ = "watch_history"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    episode_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False
    )
    served_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    preset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("presets.id", ondelete="SET NULL")
    )

    episode: Mapped[Episode] = relationship(lazy="joined")

    __table_args__ = (
        UniqueConstraint("user_id", "episode_id", name="uq_watch_history_user_episode"),
        Index("ix_watch_history_user_id", "user_id"),
    )
