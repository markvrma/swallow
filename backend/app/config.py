from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres@127.0.0.1:5433/swallow"

    # Comma-separated list of origins allowed to send credentialed requests.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Clerk ---
    # The secret key is what lets the API verify a session token. Without it every
    # request is treated as anonymous, on purpose.
    clerk_secret_key: str = ""
    # Origins allowed to mint tokens for this API (the `azp` claim). Empty disables
    # the check, which is only acceptable in local development.
    clerk_authorized_parties: str = "http://localhost:5173,http://127.0.0.1:5173"

    tvmaze_base_url: str = "https://api.tvmaze.com"
    tvmaze_timeout_seconds: float = 15.0

    # Guard against a pathological show (a soap opera with 15k episodes) hanging a request.
    import_statement_timeout_ms: int = 30_000

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def authorized_party_list(self) -> list[str]:
        return [p.strip() for p in self.clerk_authorized_parties.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
