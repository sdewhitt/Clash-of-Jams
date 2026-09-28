"""
Runtime configuration, read from the environment (and backend/.env).

Everything the app needs to talk to the outside world is named here exactly
once, so a missing value fails at startup with a readable error rather than at
the first request that happens to need it.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Clash of Jams API"
    # Bumped alongside breaking changes to the routes under /api/v1.
    api_prefix: str = "/api/v1"
    debug: bool = False

    # Origins allowed to call the API from a browser. The Vite dev server runs
    # on 5173; add the deployed frontend origin before shipping.
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Firebase project the ID tokens are issued for. Matches firebase/.firebaserc.
    firebase_project_id: str = "clash-of-jams"
    # Path to a service account JSON key. Leave unset to fall back to
    # Application Default Credentials (gcloud auth application-default login).
    google_application_credentials: str | None = None

    # When true, token verification is skipped and every request is attributed
    # to auth_dev_uid. Local development only — never enable in a deployment.
    auth_disabled: bool = False
    auth_dev_uid: str = "dev-user"


@lru_cache
def get_settings() -> Settings:
    """Cached so the env is read once per process."""
    return Settings()
