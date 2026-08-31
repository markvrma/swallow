import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, episodes, library, pick, presets, shows

logging.basicConfig(level=logging.INFO)

settings = get_settings()

app = FastAPI(
    title="Swallow",
    description="Hands you an episode so you don't have to pick one.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(shows.router)
app.include_router(library.router)
app.include_router(presets.router)
app.include_router(pick.router)
app.include_router(episodes.router)


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
