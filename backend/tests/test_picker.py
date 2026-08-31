"""The picker is the heart of the app; these tests pin its contract."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Preset, PresetShow, User, UserShow, WatchHistory
from app.services.picker import (
    EmptyPoolError,
    PoolNotFoundError,
    build_library_pool,
    build_preset_pool,
    build_show_pool,
    count_pool,
    count_remaining,
    pick,
)
from tests.conftest import add_to_library, make_show


def test_pick_never_repeats_until_pool_is_exhausted(db: Session, user: User) -> None:
    show = make_show(db, "Exhaustible", seasons={1: 5})
    add_to_library(db, user, show, [1])
    pool = build_library_pool(db, user.id)

    seen = [pick(db, pool, user.id) for _ in range(5)]

    assert all(not r.pool_reset for r in seen)
    assert len({r.episode.id for r in seen}) == 5, "every roll returned a distinct episode"


def test_exhausting_a_pool_resets_it_and_flags_the_reset(db: Session, user: User) -> None:
    show = make_show(db, "Short Run", seasons={1: 3})
    add_to_library(db, user, show, [1])
    pool = build_library_pool(db, user.id)

    for _ in range(3):
        assert pick(db, pool, user.id).pool_reset is False

    fourth = pick(db, pool, user.id)
    assert fourth.pool_reset is True
    # History was cleared and then this one pick re-recorded.
    remaining_history = db.execute(
        select(WatchHistory).where(WatchHistory.user_id == user.id)
    ).scalars().all()
    assert len(remaining_history) == 1


def test_reset_only_clears_the_exhausted_pool(db: Session, user: User) -> None:
    """Finishing one show must not un-watch episodes of another."""
    small = make_show(db, "Small", seasons={1: 2})
    large = make_show(db, "Large", seasons={1: 20})
    add_to_library(db, user, small, [1])
    add_to_library(db, user, large, [1])

    large_pool = build_show_pool(db, user.id, large.id)
    large_seen = {pick(db, large_pool, user.id).episode.id for _ in range(4)}

    small_pool = build_show_pool(db, user.id, small.id)
    for _ in range(2):
        pick(db, small_pool, user.id)
    assert pick(db, small_pool, user.id).pool_reset is True, "small pool exhausted"

    still_excluded = set(
        db.execute(
            select(WatchHistory.episode_id).where(WatchHistory.user_id == user.id)
        ).scalars()
    )
    assert large_seen <= still_excluded, "the large show's history survived the reset"


def test_runtime_cap_excludes_longer_episodes(db: Session, user: User) -> None:
    show = make_show(db, "Mixed Lengths", seasons={1: 4, 2: 4}, runtimes={1: 22, 2: 60})
    add_to_library(db, user, show, [1, 2])

    pool = build_show_pool(db, user.id, show.id)
    pool.max_runtime = 30

    assert count_pool(db, pool) == 4
    for _ in range(4):
        assert pick(db, pool, user.id).episode.runtime == 22


def test_runtime_cap_is_inclusive(db: Session, user: User) -> None:
    """A 30-minute sitcom must qualify under the 'under 30 min' bucket."""
    show = make_show(db, "Half Hour", seasons={1: 3}, runtime=30)
    add_to_library(db, user, show, [1])

    pool = build_show_pool(db, user.id, show.id)
    pool.max_runtime = 30
    assert count_pool(db, pool) == 3


def test_unknown_runtime_is_excluded_only_when_a_cap_is_active(
    db: Session, user: User
) -> None:
    show = make_show(db, "Unknown Runtime", seasons={1: 3}, runtime=None)
    add_to_library(db, user, show, [1])
    pool = build_show_pool(db, user.id, show.id)

    assert count_pool(db, pool) == 3, "no cap: null runtimes are eligible"

    pool.max_runtime = 60
    assert count_pool(db, pool) == 0, "cap active: an unknown runtime cannot be shown to fit"


def test_only_selected_seasons_are_drawn(db: Session, user: User) -> None:
    show = make_show(db, "Three Seasons", seasons={1: 4, 2: 4, 3: 4})
    add_to_library(db, user, show, [2])

    pool = build_show_pool(db, user.id, show.id)
    assert count_pool(db, pool) == 4
    for _ in range(4):
        assert pick(db, pool, user.id).episode.season == 2


def test_specials_are_excluded_unless_season_zero_is_selected(
    db: Session, user: User
) -> None:
    show = make_show(db, "With Specials", seasons={0: 3, 1: 4})

    add_to_library(db, user, show, [1])
    assert count_pool(db, build_show_pool(db, user.id, show.id)) == 4

    row = db.execute(select(UserShow).where(UserShow.show_id == show.id)).scalar_one()
    row.seasons = [0, 1]
    db.commit()
    assert count_pool(db, build_show_pool(db, user.id, show.id)) == 7


def test_library_pool_spans_every_show(db: Session, user: User) -> None:
    a = make_show(db, "Alpha", seasons={1: 3})
    b = make_show(db, "Beta", seasons={1: 2})
    add_to_library(db, user, a, [1])
    add_to_library(db, user, b, [1])

    pool = build_library_pool(db, user.id)
    assert count_pool(db, pool) == 5

    drawn_shows = {pick(db, pool, user.id).episode.show_id for _ in range(5)}
    assert drawn_shows == {a.id, b.id}


def test_preset_seasons_override_the_library_selection(db: Session, user: User) -> None:
    show = make_show(db, "Override Me", seasons={1: 4, 2: 4, 3: 4})
    add_to_library(db, user, show, [1, 2, 3])

    preset = Preset(user_id=user.id, name="Season three only", max_runtime=None)
    db.add(preset)
    db.flush()
    db.add(PresetShow(preset_id=preset.id, show_id=show.id, seasons=[3]))
    db.commit()

    pool = build_preset_pool(db, user.id, preset.id)
    assert count_pool(db, pool) == 4
    assert pick(db, pool, user.id).episode.season == 3


def test_preset_runtime_cap_applies(db: Session, user: User) -> None:
    show = make_show(db, "Capped", seasons={1: 5, 2: 5}, runtimes={1: 20, 2: 45})
    add_to_library(db, user, show, [1, 2])

    preset = Preset(user_id=user.id, name="Quick ones", max_runtime=20)
    db.add(preset)
    db.flush()
    db.add(PresetShow(preset_id=preset.id, show_id=show.id, seasons=[1, 2]))
    db.commit()

    pool = build_preset_pool(db, user.id, preset.id)
    assert count_pool(db, pool) == 5
    assert pick(db, pool, user.id).episode.runtime == 20


def test_count_remaining_tracks_history(db: Session, user: User) -> None:
    show = make_show(db, "Countdown", seasons={1: 4})
    add_to_library(db, user, show, [1])
    pool = build_show_pool(db, user.id, show.id)

    assert count_remaining(db, pool, user.id) == 4
    pick(db, pool, user.id)
    assert count_remaining(db, pool, user.id) == 3


def test_empty_library_raises(db: Session, user: User) -> None:
    with pytest.raises(EmptyPoolError):
        pick(db, build_library_pool(db, user.id), user.id)


def test_pool_with_no_matching_episodes_raises(db: Session, user: User) -> None:
    """A cap nothing satisfies is a config problem, not exhaustion."""
    show = make_show(db, "All Long", seasons={1: 3}, runtime=60)
    add_to_library(db, user, show, [1])

    pool = build_show_pool(db, user.id, show.id)
    pool.max_runtime = 15
    with pytest.raises(EmptyPoolError):
        pick(db, pool, user.id)


def test_show_not_in_library_raises(db: Session, user: User) -> None:
    show = make_show(db, "Unowned", seasons={1: 2})
    with pytest.raises(PoolNotFoundError):
        build_show_pool(db, user.id, show.id)


def test_history_is_scoped_per_user(db: Session, user: User) -> None:
    other = User(email="other@example.com", password_hash="x")
    db.add(other)
    db.commit()

    show = make_show(db, "Shared", seasons={1: 2})
    add_to_library(db, user, show, [1])
    add_to_library(db, other, show, [1])

    for _ in range(2):
        pick(db, build_show_pool(db, user.id, show.id), user.id)

    other_pool = build_show_pool(db, other.id, show.id)
    assert count_remaining(db, other_pool, other.id) == 2
