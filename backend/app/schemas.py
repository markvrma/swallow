from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# The duration buckets offered in the UI. `<=` rather than `<` on purpose:
# TVmaze reports sitcoms as exactly 22 or 30 minutes, so a strict `< 30` would
# exclude every standard half-hour comedy.
ALLOWED_MAX_RUNTIMES = (15, 20, 30, 45, 60)

SeasonList = Annotated[list[int], Field(min_length=1)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- auth -------------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


class UserOut(ORMModel):
    id: uuid.UUID
    email: str
    created_at: datetime


# --- catalogue --------------------------------------------------------------


class ShowSearchResult(BaseModel):
    tvmaze_id: int
    name: str
    premiered: date | None = None
    ended: date | None = None
    status: str | None = None
    summary: str | None = None
    image_medium: str | None = None
    in_library: bool = False


class SeasonOut(ORMModel):
    number: int
    episode_order: int | None = None
    premiere_date: date | None = None
    episode_count: int = 0


class ShowOut(ORMModel):
    id: uuid.UUID
    tvmaze_id: int
    name: str
    premiered: date | None = None
    ended: date | None = None
    status: str | None = None
    summary: str | None = None
    image_medium: str | None = None
    image_original: str | None = None
    imdb_id: str | None = None


class ShowDetailOut(ShowOut):
    seasons: list[SeasonOut] = []


class ImportShowRequest(BaseModel):
    tvmaze_id: int


# --- library ----------------------------------------------------------------


class AddLibraryShowRequest(BaseModel):
    """Adding a show is always coupled with choosing its seasons."""

    tvmaze_id: int
    seasons: SeasonList


class UpdateLibraryShowRequest(BaseModel):
    seasons: SeasonList


class LibraryShowOut(BaseModel):
    show: ShowOut
    seasons: list[int]
    episode_count: int
    remaining_count: int


# --- presets ----------------------------------------------------------------


class PresetShowInput(BaseModel):
    show_id: uuid.UUID
    seasons: SeasonList


class PresetWriteRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    max_runtime: int | None = None
    shows: list[PresetShowInput] = Field(min_length=1)

    @field_validator("max_runtime")
    @classmethod
    def _known_bucket(cls, value: int | None) -> int | None:
        if value is not None and value not in ALLOWED_MAX_RUNTIMES:
            raise ValueError(
                f"max_runtime must be one of {ALLOWED_MAX_RUNTIMES} or null"
            )
        return value

    @field_validator("shows")
    @classmethod
    def _no_duplicate_shows(cls, value: list[PresetShowInput]) -> list[PresetShowInput]:
        if len({s.show_id for s in value}) != len(value):
            raise ValueError("A show may only appear once in a preset")
        return value


class PresetShowOut(BaseModel):
    show: ShowOut
    seasons: list[int]


class PresetOut(BaseModel):
    id: uuid.UUID
    name: str
    max_runtime: int | None
    created_at: datetime
    last_used_at: datetime | None
    shows: list[PresetShowOut]
    episode_count: int
    remaining_count: int


class PresetPreviewRequest(BaseModel):
    """Live 'N episodes match' count while building a preset."""

    max_runtime: int | None = None
    shows: list[PresetShowInput] = []


class PoolCountOut(BaseModel):
    episode_count: int
    remaining_count: int


# --- picking ----------------------------------------------------------------


class PickRequest(BaseModel):
    mode: Literal["random", "show", "preset"]
    show_id: uuid.UUID | None = None
    preset_id: uuid.UUID | None = None


class EpisodeOut(ORMModel):
    id: uuid.UUID
    season: int
    number: int
    name: str | None = None
    airdate: date | None = None
    runtime: int | None = None
    summary: str | None = None
    image_medium: str | None = None
    image_original: str | None = None
    tvmaze_url: str | None = None


class EpisodeWithShowOut(BaseModel):
    episode: EpisodeOut
    show: ShowOut


class PickResponse(EpisodeWithShowOut):
    pool_reset: bool = False
