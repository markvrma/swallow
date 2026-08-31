"""TVmaze API client.

Every piece of raw TVmaze JSON is parsed here and nowhere else; the rest of the
codebase only ever sees the dataclasses below. If TVmaze's field names differ
from what we coded against, this file is the only place that needs to change.

The public API needs no key. Docs: https://www.tvmaze.com/api
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import date

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_TAG_RE = re.compile(r"<[^>]+>")


class TVmazeError(RuntimeError):
    """TVmaze was unreachable, rate-limited, or returned something unusable."""


class ShowNotFound(TVmazeError):
    pass


def _text(value: object) -> str | None:
    """TVmaze summaries are HTML fragments; store them as plain text."""
    if not isinstance(value, str):
        return None
    stripped = _TAG_RE.sub("", value).strip()
    return stripped or None


def _parse_date(value: object) -> date | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _images(node: object) -> tuple[str | None, str | None]:
    if not isinstance(node, dict):
        return None, None
    medium = node.get("medium")
    original = node.get("original")
    return (medium if isinstance(medium, str) else None,
            original if isinstance(original, str) else None)


@dataclass(slots=True)
class ProviderShow:
    tvmaze_id: int
    name: str
    premiered: date | None = None
    ended: date | None = None
    status: str | None = None
    summary: str | None = None
    image_medium: str | None = None
    image_original: str | None = None
    imdb_id: str | None = None
    official_site: str | None = None


@dataclass(slots=True)
class ProviderSeason:
    number: int
    episode_order: int | None = None
    premiere_date: date | None = None
    end_date: date | None = None


@dataclass(slots=True)
class ProviderEpisode:
    tvmaze_id: int
    season: int
    number: int
    name: str | None = None
    airdate: date | None = None
    runtime: int | None = None
    summary: str | None = None
    image_medium: str | None = None
    image_original: str | None = None
    url: str | None = None


@dataclass(slots=True)
class ProviderShowBundle:
    show: ProviderShow
    seasons: list[ProviderSeason] = field(default_factory=list)
    episodes: list[ProviderEpisode] = field(default_factory=list)


def _parse_show(node: dict) -> ProviderShow:
    tvmaze_id = _int(node.get("id"))
    name = node.get("name")
    if tvmaze_id is None or not isinstance(name, str):
        raise TVmazeError("TVmaze show payload is missing 'id' or 'name'")

    medium, original = _images(node.get("image"))
    externals = node.get("externals") if isinstance(node.get("externals"), dict) else {}
    imdb_id = externals.get("imdb")

    return ProviderShow(
        tvmaze_id=tvmaze_id,
        name=name,
        premiered=_parse_date(node.get("premiered")),
        ended=_parse_date(node.get("ended")),
        status=node.get("status") if isinstance(node.get("status"), str) else None,
        summary=_text(node.get("summary")),
        image_medium=medium,
        image_original=original,
        imdb_id=imdb_id if isinstance(imdb_id, str) else None,
        official_site=(
            node.get("officialSite") if isinstance(node.get("officialSite"), str) else None
        ),
    )


def _parse_season(node: dict) -> ProviderSeason | None:
    number = _int(node.get("number"))
    if number is None:
        return None
    return ProviderSeason(
        number=number,
        episode_order=_int(node.get("episodeOrder")),
        premiere_date=_parse_date(node.get("premiereDate")),
        end_date=_parse_date(node.get("endDate")),
    )


def _parse_episode(node: dict) -> ProviderEpisode | None:
    tvmaze_id = _int(node.get("id"))
    season = _int(node.get("season"))
    number = _int(node.get("number"))
    # Episodes with a null `number` are unaired placeholders; they can't be picked.
    if tvmaze_id is None or season is None or number is None:
        return None

    medium, original = _images(node.get("image"))
    return ProviderEpisode(
        tvmaze_id=tvmaze_id,
        season=season,
        number=number,
        name=node.get("name") if isinstance(node.get("name"), str) else None,
        airdate=_parse_date(node.get("airdate")),
        runtime=_int(node.get("runtime")),
        summary=_text(node.get("summary")),
        image_medium=medium,
        image_original=original,
        url=node.get("url") if isinstance(node.get("url"), str) else None,
    )


class TVmazeClient:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        settings = get_settings()
        self._base_url = settings.tvmaze_base_url.rstrip("/")
        self._timeout = settings.tvmaze_timeout_seconds
        self._client = client
        self._owns_client = client is None

    async def __aenter__(self) -> TVmazeClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=self._timeout,
                headers={"User-Agent": "swallow/0.1 (+https://github.com/markvrma/swallow)"},
            )
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _get(self, path: str, params: dict | None = None) -> object:
        if self._client is None:
            raise TVmazeError("TVmazeClient must be used as an async context manager")

        # TVmaze answers 429 under load; back off and retry a couple of times.
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                response = await self._client.get(path, params=params)
            except httpx.HTTPError as exc:
                last_error = exc
            else:
                if response.status_code == 404:
                    raise ShowNotFound(f"TVmaze returned 404 for {path}")
                if response.status_code == 429:
                    last_error = TVmazeError("TVmaze rate limit (429)")
                elif response.is_success:
                    try:
                        return response.json()
                    except ValueError as exc:
                        raise TVmazeError(f"TVmaze returned non-JSON for {path}") from exc
                else:
                    last_error = TVmazeError(
                        f"TVmaze returned {response.status_code} for {path}"
                    )

            if attempt < 2:
                await asyncio.sleep(2**attempt)

        raise TVmazeError(f"TVmaze request failed for {path}: {last_error}")

    async def search_shows(self, query: str, limit: int = 12) -> list[ProviderShow]:
        """GET /search/shows -> [{score, show}, ...]"""
        payload = await self._get("/search/shows", params={"q": query})
        if not isinstance(payload, list):
            raise TVmazeError("TVmaze search returned an unexpected payload")

        results: list[ProviderShow] = []
        for entry in payload[:limit]:
            node = entry.get("show") if isinstance(entry, dict) else None
            if isinstance(node, dict):
                try:
                    results.append(_parse_show(node))
                except TVmazeError:
                    logger.warning("Skipping unparseable TVmaze search result")
        return results

    async def fetch_show_bundle(self, tvmaze_id: int) -> ProviderShowBundle:
        """Fetch show detail, seasons and every episode in one go."""
        show_payload, seasons_payload, episodes_payload = await asyncio.gather(
            self._get(f"/shows/{tvmaze_id}"),
            self._get(f"/shows/{tvmaze_id}/seasons"),
            self._get(f"/shows/{tvmaze_id}/episodes"),
        )

        if not isinstance(show_payload, dict):
            raise TVmazeError("TVmaze show detail returned an unexpected payload")
        show = _parse_show(show_payload)

        seasons: list[ProviderSeason] = []
        if isinstance(seasons_payload, list):
            for node in seasons_payload:
                if isinstance(node, dict) and (season := _parse_season(node)):
                    seasons.append(season)

        episodes: list[ProviderEpisode] = []
        if isinstance(episodes_payload, list):
            for node in episodes_payload:
                if isinstance(node, dict) and (episode := _parse_episode(node)):
                    episodes.append(episode)

        if not episodes:
            raise TVmazeError(f"TVmaze returned no usable episodes for show {tvmaze_id}")

        # Some shows list episodes for seasons the /seasons endpoint omits.
        known = {s.number for s in seasons}
        for number in sorted({e.season for e in episodes} - known):
            seasons.append(ProviderSeason(number=number))
        seasons.sort(key=lambda s: s.number)

        return ProviderShowBundle(show=show, seasons=seasons, episodes=episodes)
