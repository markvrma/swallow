# Swallow 🎲

Stop choosing. Start watching.

Swallow hands you a random episode from the shows you love, never repeats one
until you've seen everything in the pool, and lets you narrow the roll with
saved "controlled random" presets — specific shows, specific seasons, and a
maximum episode length.

## How it works

- **Random** — one click opens a new tab with a random unseen episode drawn
  from your whole library (each show limited to the seasons you selected).
- **Show cards** — the home page shows at most **5** of your shows at a time
  (shuffle to resample); tapping a card rolls within that one show. The cap is
  deliberate: fewer options, faster decisions.
- **Controlled random** — build a preset from any subset of your shows, pick
  seasons per show, and optionally cap the episode length (≤15/20/30/45/60
  min). Presets are saved and appear as one-click chips on the home page.
- **No repeats** — every episode served is recorded. When a pool runs dry,
  only that pool's history clears and rolling starts fresh (the episode page
  tells you when that happens). "Put it back" un-records an episode you didn't
  actually watch.

Show, season and per-episode runtime data comes from the free
[TVmaze API](https://www.tvmaze.com/api) (no API key needed). A show's entire
episode list is imported once when you add it.

## Stack

- **Backend** — FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL · argon2 session
  auth (httpOnly cookie)
- **Frontend** — React 19 · Vite · TypeScript · Tailwind 4 · TanStack Query ·
  React Router

## Running it

Requirements: Python 3.11+, [uv](https://docs.astral.sh/uv/), Node 20+, Docker
(or any Postgres 16).

```bash
# 1. Database
docker compose up -d postgres

# 2. Backend  (http://127.0.0.1:8000, docs at /docs)
cd backend
cp .env.example .env
uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# 3. Frontend  (http://localhost:5173, proxies /api to the backend)
cd frontend
npm install
npm run dev
```

Create an account, hit the **+** button, add a show (season selection is
mandatory — that's the point), and press **Random**.

## Tests

```bash
# backend: 48 tests over the picker contract and the HTTP surface.
# They use a separate swallow_test database — create it once:
#   docker compose exec postgres createdb -U postgres swallow_test
cd backend
DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:5433/swallow_test uv run pytest

# frontend: typecheck + lint + build
cd frontend
npx tsc -b && npm run lint && npm run build
```

## Design notes

- **Runtime filter is inclusive** (`runtime <= cap`) because TVmaze reports
  sitcoms as exactly 22/30 min — a strict `<30` would exclude every half-hour
  comedy. Episodes with unknown runtime are excluded while a cap is active.
- **Specials (season 0)** stay out of every pool unless you explicitly select
  them for a show.
- **The new tab rolls itself**: clicking Random opens `/roll` synchronously and
  that page performs the pick — `window.open` after an `await` would be eaten
  by popup blockers.
- **Watch history is global per user**; presets and cards draw from the same
  history, and an exhausted pool resets only its own slice of it.
- All raw TVmaze JSON is parsed in `backend/app/providers/tvmaze.py` and
  nowhere else, so provider changes stay contained to one file.
