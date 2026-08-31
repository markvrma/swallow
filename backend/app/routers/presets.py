import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession
from app.models import Preset, PresetShow, Season, UserShow
from app.schemas import (
    PoolCountOut,
    PresetOut,
    PresetPreviewRequest,
    PresetShowInput,
    PresetShowOut,
    PresetWriteRequest,
    ShowOut,
)
from app.services.picker import Pool, build_preset_pool, count_pool, count_remaining

router = APIRouter(prefix="/api/me/presets", tags=["presets"])


def _resolve_shows(
    db: Session, user_id: uuid.UUID, inputs: list[PresetShowInput]
) -> dict[uuid.UUID, list[int]]:
    """Check every show is in the user's library and every season really exists."""
    show_ids = [s.show_id for s in inputs]
    owned = set(
        db.execute(
            select(UserShow.show_id).where(
                UserShow.user_id == user_id, UserShow.show_id.in_(show_ids)
            )
        ).scalars()
    )
    missing = [str(s) for s in show_ids if s not in owned]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Shows not in your library: {missing}",
        )

    known: dict[uuid.UUID, set[int]] = {}
    for show_id, number in db.execute(
        select(Season.show_id, Season.number).where(Season.show_id.in_(show_ids))
    ).all():
        known.setdefault(show_id, set()).add(number)

    resolved: dict[uuid.UUID, list[int]] = {}
    for item in inputs:
        wanted = sorted(set(item.seasons))
        unknown = [s for s in wanted if s not in known.get(item.show_id, set())]
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Show {item.show_id} has no season(s) {unknown}",
            )
        resolved[item.show_id] = wanted
    return resolved


def _preset_out(db: Session, user_id: uuid.UUID, preset: Preset) -> PresetOut:
    pool = build_preset_pool(db, user_id, preset.id)
    return PresetOut(
        id=preset.id,
        name=preset.name,
        max_runtime=preset.max_runtime,
        created_at=preset.created_at,
        last_used_at=preset.last_used_at,
        shows=[
            PresetShowOut(show=ShowOut.model_validate(ps.show), seasons=ps.seasons)
            for ps in sorted(preset.shows, key=lambda p: p.show.name)
        ],
        episode_count=count_pool(db, pool),
        remaining_count=count_remaining(db, pool, user_id),
    )


def _write_preset_shows(
    db: Session, preset: Preset, resolved: dict[uuid.UUID, list[int]]
) -> None:
    db.execute(delete(PresetShow).where(PresetShow.preset_id == preset.id))
    db.add_all(
        PresetShow(preset_id=preset.id, show_id=show_id, seasons=seasons)
        for show_id, seasons in resolved.items()
    )


@router.get("", response_model=list[PresetOut])
def list_presets(user: CurrentUser, db: DbSession):
    presets = (
        db.execute(
            select(Preset)
            .where(Preset.user_id == user.id)
            .order_by(Preset.last_used_at.desc().nullslast(), Preset.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [_preset_out(db, user.id, p) for p in presets]


@router.post("", response_model=PresetOut, status_code=status.HTTP_201_CREATED)
def create_preset(payload: PresetWriteRequest, user: CurrentUser, db: DbSession):
    resolved = _resolve_shows(db, user.id, payload.shows)

    preset = Preset(user_id=user.id, name=payload.name, max_runtime=payload.max_runtime)
    db.add(preset)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a preset with that name",
        ) from None

    _write_preset_shows(db, preset, resolved)
    db.commit()
    db.refresh(preset)

    pool = build_preset_pool(db, user.id, preset.id)
    if count_pool(db, pool) == 0:
        db.execute(delete(Preset).where(Preset.id == preset.id))
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No episodes match this configuration",
        )
    return _preset_out(db, user.id, preset)


@router.patch("/{preset_id}", response_model=PresetOut)
def update_preset(
    preset_id: uuid.UUID, payload: PresetWriteRequest, user: CurrentUser, db: DbSession
):
    preset = db.execute(
        select(Preset).where(Preset.id == preset_id, Preset.user_id == user.id)
    ).scalar_one_or_none()
    if preset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preset not found")

    resolved = _resolve_shows(db, user.id, payload.shows)
    preset.name = payload.name
    preset.max_runtime = payload.max_runtime
    _write_preset_shows(db, preset, resolved)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a preset with that name",
        ) from None

    db.refresh(preset)
    if count_pool(db, build_preset_pool(db, user.id, preset.id)) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No episodes match this configuration",
        )
    return _preset_out(db, user.id, preset)


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_preset(preset_id: uuid.UUID, user: CurrentUser, db: DbSession):
    result = db.execute(
        delete(Preset).where(Preset.id == preset_id, Preset.user_id == user.id)
    )
    if not result.rowcount:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preset not found")
    db.commit()


@router.post("/preview", response_model=PoolCountOut)
def preview_preset(payload: PresetPreviewRequest, user: CurrentUser, db: DbSession):
    """Live 'N episodes match' count while the user builds a preset."""
    if not payload.shows:
        return PoolCountOut(episode_count=0, remaining_count=0)

    resolved = _resolve_shows(db, user.id, payload.shows)
    pool = Pool(
        pairs=[(sid, s) for sid, seasons in resolved.items() for s in seasons],
        max_runtime=payload.max_runtime,
    )
    return PoolCountOut(
        episode_count=count_pool(db, pool),
        remaining_count=count_remaining(db, pool, user.id),
    )
