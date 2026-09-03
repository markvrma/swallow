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
from app.security import get_current_user_optional  # noqa: E402

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
                "episodes, seasons, shows, users RESTART IDENTITY CASCADE"
            )
        )
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


class FakeAuth:
    """Stands in for Clerk during tests.

    Verifying a real Clerk token would mean either shipping a secret key into CI or
    mocking the JWKS fetch; overriding the dependency tests everything this codebase
    actually owns -- who the request belongs to -- and leaves token verification to
    the SDK that is responsible for it.
    """

    def __init__(self) -> None:
        self.user: User | None = None

    def sign_in(self, user: User | None) -> None:
        self.user = user


@pytest.fixture
def auth() -> FakeAuth:
    return FakeAuth()


@pytest.fixture
def client(db: Session, auth: FakeAuth) -> Iterator[TestClient]:
    """TestClient sharing the test's database session, with auth stubbed out."""

    def _override_db() -> Iterator[Session]:
        yield db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user_optional] = lambda: auth.user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# --- factories --------------------------------------------------------------


@pytest.fixture
def user(db: Session) -> User:
    return make_user(db, "viewer@example.com", clerk_user_id="user_viewer")


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


def make_user(db: Session, email: str, clerk_user_id: str | None = None) -> User:
    """A local row for a Clerk identity, as the first authenticated request creates."""
    u = User(email=email, clerk_user_id=clerk_user_id or f"user_{uuid.uuid4().hex[:12]}")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def login_as(client: TestClient, user: User) -> None:
    """Point the stubbed auth at a user. The real token check belongs to Clerk."""
    app.dependency_overrides[get_current_user_optional] = lambda: user


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()
