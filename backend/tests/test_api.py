"""End-to-end tests over the HTTP surface, with the provider never called."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Preset, PresetShow, User
from tests.conftest import add_to_library, login_as, make_show, register

# --- auth -------------------------------------------------------------------


def test_register_logs_the_user_in(client: TestClient) -> None:
    response = register(client)
    assert response.status_code == 201
    assert response.json()["email"] == "new@example.com"
    assert client.get("/api/auth/me").status_code == 200


def test_register_rejects_a_duplicate_email(client: TestClient) -> None:
    register(client)
    assert register(client).status_code == 409


def test_register_rejects_a_short_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register", json={"email": "a@example.com", "password": "short"}
    )
    assert response.status_code == 422


def test_login_rejects_a_wrong_password(client: TestClient, user: User) -> None:
    response = client.post(
        "/api/auth/login", json={"email": user.email, "password": "wrongwrongwrong"}
    )
    assert response.status_code == 401


def test_logout_clears_the_session(client: TestClient, user: User) -> None:
    login_as(client, user)
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_protected_routes_reject_anonymous_callers(client: TestClient) -> None:
    for method, path in [
        ("get", "/api/auth/me"),
        ("get", "/api/me/shows"),
        ("get", "/api/me/cards"),
        ("get", "/api/me/presets"),
        ("post", "/api/pick"),
        ("get", "/api/shows/search?q=test"),
    ]:
        kwargs = {"json": {"mode": "random"}} if method == "post" else {}
        response = getattr(client, method)(path, **kwargs)
        assert response.status_code == 401, f"{method.upper()} {path} was not protected"


# --- library ----------------------------------------------------------------


def test_library_lists_shows_with_counts(client: TestClient, db: Session, user: User) -> None:
    show = make_show(db, "Counted", seasons={1: 3, 2: 3})
    add_to_library(db, user, show, [1])
    login_as(client, user)

    body = client.get("/api/me/shows").json()
    assert len(body) == 1
    assert body[0]["show"]["name"] == "Counted"
    assert body[0]["seasons"] == [1]
    assert body[0]["episode_count"] == 3
    assert body[0]["remaining_count"] == 3


def test_adding_a_show_without_seasons_is_rejected(client: TestClient, user: User) -> None:
    login_as(client, user)
    response = client.post("/api/me/shows", json={"tvmaze_id": 1, "seasons": []})
    assert response.status_code == 422, "seasons are mandatory when adding a show"


def test_updating_seasons_rejects_a_season_the_show_lacks(
    client: TestClient, db: Session, user: User
) -> None:
    show = make_show(db, "Two Seasons", seasons={1: 2, 2: 2})
    add_to_library(db, user, show, [1])
    login_as(client, user)

    response = client.patch(f"/api/me/shows/{show.id}", json={"seasons": [1, 9]})
    assert response.status_code == 422
    assert "season" in response.json()["detail"].lower()


def test_updating_seasons_succeeds(client: TestClient, db: Session, user: User) -> None:
    show = make_show(db, "Two Seasons", seasons={1: 2, 2: 2})
    add_to_library(db, user, show, [1])
    login_as(client, user)

    body = client.patch(f"/api/me/shows/{show.id}", json={"seasons": [1, 2]}).json()
    assert body["seasons"] == [1, 2]
    assert body["episode_count"] == 4


def test_removing_a_show(client: TestClient, db: Session, user: User) -> None:
    show = make_show(db, "Temporary", seasons={1: 2})
    add_to_library(db, user, show, [1])
    login_as(client, user)

    assert client.delete(f"/api/me/shows/{show.id}").status_code == 204
    assert client.get("/api/me/shows").json() == []


def test_cards_are_capped_at_five(client: TestClient, db: Session, user: User) -> None:
    for i in range(9):
        add_to_library(db, user, make_show(db, f"Show {i}", seasons={1: 2}), [1])
    login_as(client, user)

    assert len(client.get("/api/me/cards").json()) == 5


def test_cards_return_everything_when_the_library_is_small(
    client: TestClient, db: Session, user: User
) -> None:
    for i in range(3):
        add_to_library(db, user, make_show(db, f"Show {i}", seasons={1: 2}), [1])
    login_as(client, user)

    assert len(client.get("/api/me/cards").json()) == 3


# --- picking ----------------------------------------------------------------


def test_pick_random_returns_an_episode_and_records_it(
    client: TestClient, db: Session, user: User
) -> None:
    show = make_show(db, "Pickable", seasons={1: 3})
    add_to_library(db, user, show, [1])
    login_as(client, user)

    body = client.post("/api/pick", json={"mode": "random"}).json()
    assert body["show"]["name"] == "Pickable"
    assert body["pool_reset"] is False
    assert body["episode"]["season"] == 1

    assert client.get("/api/me/shows").json()[0]["remaining_count"] == 2


def test_pick_with_an_empty_library_returns_409(client: TestClient, user: User) -> None:
    login_as(client, user)
    response = client.post("/api/pick", json={"mode": "random"})
    assert response.status_code == 409


def test_pick_by_show_stays_within_that_show(
    client: TestClient, db: Session, user: User
) -> None:
    wanted = make_show(db, "Wanted", seasons={1: 3})
    other = make_show(db, "Other", seasons={1: 3})
    add_to_library(db, user, wanted, [1])
    add_to_library(db, user, other, [1])
    login_as(client, user)

    for _ in range(3):
        body = client.post("/api/pick", json={"mode": "show", "show_id": str(wanted.id)}).json()
        assert body["show"]["name"] == "Wanted"


def test_pick_by_show_rejects_a_show_outside_the_library(
    client: TestClient, db: Session, user: User
) -> None:
    show = make_show(db, "Unowned", seasons={1: 2})
    login_as(client, user)

    response = client.post("/api/pick", json={"mode": "show", "show_id": str(show.id)})
    assert response.status_code == 404


def test_pick_requires_an_id_for_targeted_modes(client: TestClient, user: User) -> None:
    login_as(client, user)
    assert client.post("/api/pick", json={"mode": "show"}).status_code == 422
    assert client.post("/api/pick", json={"mode": "preset"}).status_code == 422


def test_exhausting_the_pool_over_http_flags_the_reset(
    client: TestClient, db: Session, user: User
) -> None:
    show = make_show(db, "Tiny", seasons={1: 2})
    add_to_library(db, user, show, [1])
    login_as(client, user)

    seen = set()
    for _ in range(2):
        body = client.post("/api/pick", json={"mode": "random"}).json()
        assert body["pool_reset"] is False
        seen.add(body["episode"]["id"])
    assert len(seen) == 2

    assert client.post("/api/pick", json={"mode": "random"}).json()["pool_reset"] is True


def test_unwatching_puts_an_episode_back(
    client: TestClient, db: Session, user: User
) -> None:
    show = make_show(db, "Rewatchable", seasons={1: 3})
    add_to_library(db, user, show, [1])
    login_as(client, user)

    episode_id = client.post("/api/pick", json={"mode": "random"}).json()["episode"]["id"]
    assert client.get("/api/me/shows").json()[0]["remaining_count"] == 2

    assert client.delete(f"/api/me/history/{episode_id}").status_code == 204
    assert client.get("/api/me/shows").json()[0]["remaining_count"] == 3


def test_resetting_one_show_restores_its_pool(
    client: TestClient, db: Session, user: User
) -> None:
    show = make_show(db, "Resettable", seasons={1: 3})
    add_to_library(db, user, show, [1])
    login_as(client, user)

    for _ in range(2):
        client.post("/api/pick", json={"mode": "random"})
    assert client.get("/api/me/shows").json()[0]["remaining_count"] == 1

    assert client.post(f"/api/me/shows/{show.id}/reset").status_code == 204
    assert client.get("/api/me/shows").json()[0]["remaining_count"] == 3


# --- presets ----------------------------------------------------------------


def test_creating_a_preset(client: TestClient, db: Session, user: User) -> None:
    show = make_show(db, "Preset Show", seasons={1: 4, 2: 4}, runtimes={1: 22, 2: 55})
    add_to_library(db, user, show, [1, 2])
    login_as(client, user)

    response = client.post(
        "/api/me/presets",
        json={
            "name": "Quick laughs",
            "max_runtime": 30,
            "shows": [{"show_id": str(show.id), "seasons": [1, 2]}],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["max_runtime"] == 30
    assert body["episode_count"] == 4, "only the 22-minute season qualifies"


def test_preset_rejects_an_unknown_runtime_bucket(
    client: TestClient, db: Session, user: User
) -> None:
    show = make_show(db, "Show", seasons={1: 2})
    add_to_library(db, user, show, [1])
    login_as(client, user)

    response = client.post(
        "/api/me/presets",
        json={
            "name": "Odd",
            "max_runtime": 37,
            "shows": [{"show_id": str(show.id), "seasons": [1]}],
        },
    )
    assert response.status_code == 422


def test_preset_rejects_a_show_outside_the_library(
    client: TestClient, db: Session, user: User
) -> None:
    show = make_show(db, "Unowned", seasons={1: 2})
    login_as(client, user)

    response = client.post(
        "/api/me/presets",
        json={"name": "Nope", "shows": [{"show_id": str(show.id), "seasons": [1]}]},
    )
    assert response.status_code == 422


def test_preset_rejects_an_empty_season_list(
    client: TestClient, db: Session, user: User
) -> None:
    show = make_show(db, "Show", seasons={1: 2})
    add_to_library(db, user, show, [1])
    login_as(client, user)

    response = client.post(
        "/api/me/presets",
        json={"name": "Empty", "shows": [{"show_id": str(show.id), "seasons": []}]},
    )
    assert response.status_code == 422


def test_preset_rejects_a_configuration_matching_nothing(
    client: TestClient, db: Session, user: User
) -> None:
    show = make_show(db, "All Long", seasons={1: 3}, runtime=60)
    add_to_library(db, user, show, [1])
    login_as(client, user)

    response = client.post(
        "/api/me/presets",
        json={
            "name": "Impossible",
            "max_runtime": 15,
            "shows": [{"show_id": str(show.id), "seasons": [1]}],
        },
    )
    assert response.status_code == 422
    assert client.get("/api/me/presets").json() == [], "the dead preset was not persisted"


def test_duplicate_preset_names_are_rejected(
    client: TestClient, db: Session, user: User
) -> None:
    show = make_show(db, "Show", seasons={1: 2})
    add_to_library(db, user, show, [1])
    login_as(client, user)
    payload = {"name": "Same", "shows": [{"show_id": str(show.id), "seasons": [1]}]}

    assert client.post("/api/me/presets", json=payload).status_code == 201
    assert client.post("/api/me/presets", json=payload).status_code == 409


def test_preset_preview_counts_matches(client: TestClient, db: Session, user: User) -> None:
    show = make_show(db, "Preview", seasons={1: 5, 2: 5}, runtimes={1: 20, 2: 50})
    add_to_library(db, user, show, [1, 2])
    login_as(client, user)

    body = client.post(
        "/api/me/presets/preview",
        json={"max_runtime": 45, "shows": [{"show_id": str(show.id), "seasons": [1, 2]}]},
    ).json()
    assert body["episode_count"] == 5
    assert body["remaining_count"] == 5


def test_picking_from_a_preset(client: TestClient, db: Session, user: User) -> None:
    show = make_show(db, "Preset Pick", seasons={1: 3, 2: 3})
    add_to_library(db, user, show, [1, 2])
    preset = Preset(user_id=user.id, name="Season 2", max_runtime=None)
    db.add(preset)
    db.flush()
    db.add(PresetShow(preset_id=preset.id, show_id=show.id, seasons=[2]))
    db.commit()
    login_as(client, user)

    body = client.post(
        "/api/pick", json={"mode": "preset", "preset_id": str(preset.id)}
    ).json()
    assert body["episode"]["season"] == 2
    assert client.get("/api/me/presets").json()[0]["last_used_at"] is not None


def test_updating_and_deleting_a_preset(client: TestClient, db: Session, user: User) -> None:
    show = make_show(db, "Editable", seasons={1: 3, 2: 3})
    add_to_library(db, user, show, [1, 2])
    login_as(client, user)

    created = client.post(
        "/api/me/presets",
        json={"name": "First", "shows": [{"show_id": str(show.id), "seasons": [1]}]},
    ).json()
    assert created["episode_count"] == 3

    updated = client.patch(
        f"/api/me/presets/{created['id']}",
        json={
            "name": "Renamed",
            "max_runtime": None,
            "shows": [{"show_id": str(show.id), "seasons": [1, 2]}],
        },
    ).json()
    assert updated["name"] == "Renamed"
    assert updated["episode_count"] == 6

    assert client.delete(f"/api/me/presets/{created['id']}").status_code == 204
    assert client.get("/api/me/presets").json() == []


def test_presets_are_scoped_per_user(client: TestClient, db: Session, user: User) -> None:
    show = make_show(db, "Shared", seasons={1: 2})
    add_to_library(db, user, show, [1])
    preset = Preset(user_id=user.id, name="Mine", max_runtime=None)
    db.add(preset)
    db.flush()
    db.add(PresetShow(preset_id=preset.id, show_id=show.id, seasons=[1]))
    db.commit()

    register(client, "intruder@example.com")
    assert client.get("/api/me/presets").json() == []
    assert (
        client.post("/api/pick", json={"mode": "preset", "preset_id": str(preset.id)}).status_code
        == 404
    )


# --- episode detail ---------------------------------------------------------


def test_episode_detail(client: TestClient, db: Session, user: User) -> None:
    show = make_show(db, "Detailed", seasons={1: 2})
    add_to_library(db, user, show, [1])
    login_as(client, user)

    episode_id = client.post("/api/pick", json={"mode": "random"}).json()["episode"]["id"]
    body = client.get(f"/api/episodes/{episode_id}").json()
    assert body["show"]["name"] == "Detailed"
    assert body["episode"]["id"] == episode_id
