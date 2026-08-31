import os
import uuid
from collections.abc import Iterator

TEST_DB_URL = os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres@127.0.0.1:5433/swallow_test"
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Episode, Season, Show, User, UserShow  # noqa: E402
from app.security import hash_password  # noqa: E402

engine = create_engine(TEST_DB_URL, future=True)
TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


@pytest.fixture(scope="session", autouse=True)
def _schema() -> Iterator[None]:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def db() -> Iterator[Session]:
    """A clean database per test."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "TRUNCATE watch_history, preset_shows, presets, user_shows, "
                "episodes, seasons, shows, sessions, users RESTART IDENTITY CASCADE"
            )
        )
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    """TestClient sharing the test's database session."""

    def _override() -> Iterator[Session]:
        yield db

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# --- factories --------------------------------------------------------------


@pytest.fixture
def user(db: Session) -> User:
    u = User(email="viewer@example.com", password_hash=hash_password("hunter2hunter2"))
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


_tvmaze_counter = iter(range(1000, 100_000))


def make_show(
    db: Session,
    name: str = "Test Show",
    *,
    seasons: dict[int, int] | None = None,
    runtime: int | None = 30,
    runtimes: dict[int, int | None] | None = None,
) -> Show:
    """Create a show with `seasons` mapping season number -> episode count.

    `runtime` sets every episode's runtime; `runtimes` overrides it per season.
    """
    seasons = seasons or {1: 3}
    show = Show(tvmaze_id=next(_tvmaze_counter), name=name)
    db.add(show)
    db.flush()

    for season_number, episode_count in seasons.items():
        db.add(
            Season(
                show_id=show.id, number=season_number, episode_order=episode_count
            )
        )
        season_runtime = (runtimes or {}).get(season_number, runtime)
        for episode_number in range(1, episode_count + 1):
            db.add(
                Episode(
                    show_id=show.id,
                    tvmaze_id=next(_tvmaze_counter),
                    season=season_number,
                    number=episode_number,
                    name=f"{name} S{season_number}E{episode_number}",
                    runtime=season_runtime,
                )
            )
    db.commit()
    db.refresh(show)
    return show


def add_to_library(db: Session, user: User, show: Show, seasons: list[int]) -> UserShow:
    row = UserShow(user_id=user.id, show_id=show.id, seasons=seasons)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def register(client: TestClient, email: str = "new@example.com", password: str = "hunter2hunter2"):
    return client.post("/api/auth/register", json={"email": email, "password": password})


def login_as(client: TestClient, user: User, password: str = "hunter2hunter2"):
    response = client.post(
        "/api/auth/login", json={"email": user.email, "password": password}
    )
    assert response.status_code == 200, response.text
    return response


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()
