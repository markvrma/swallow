# Single-stage: uv's image already has Python and the resolver, and the app is
# pure Python plus psycopg's binary wheel, so there is nothing to compile.
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Dependencies first: they change far less often than the code, so this layer
# survives most rebuilds. --frozen fails loudly if uv.lock is out of date.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

RUN useradd --system --uid 1001 swallow && chown -R swallow /app
USER swallow

EXPOSE 8080

# --proxy-headers so the app sees the real scheme behind Fly's edge; without it
# every request looks like plain HTTP.
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", "--port", "8080", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
