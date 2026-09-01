from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres@127.0.0.1:5433/swallow"

    # Comma-separated list of origins allowed to send credentialed requests.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    session_cookie_name: str = "swallow_session"
    session_ttl_days: int = 30
    # Set to True when serving over HTTPS.
    cookie_secure: bool = False

    # --- signup email verification ---
    otp_ttl_minutes: int = 10
    otp_max_attempts: int = 5
    otp_resend_interval_seconds: int = 60

    # SMTP. With no host configured the code is logged instead of sent, which is
    # what you want in development and never what you want in production.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    smtp_from: str = "Swallow <no-reply@swallow.local>"
    smtp_timeout_seconds: float = 15.0

    tvmaze_base_url: str = "https://api.tvmaze.com"
    tvmaze_timeout_seconds: float = 15.0

    # Guard against a pathological show (a soap opera with 15k episodes) hanging a request.
    import_statement_timeout_ms: int = 30_000

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
