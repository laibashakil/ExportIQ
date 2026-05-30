"""Central runtime configuration loaded from environment."""
from __future__ import annotations

import json
import logging
import os
import tempfile
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Cloud Run secret handling
# ---------------------------------------------------------------------------
# When deployed on Cloud Run the service-account JSON is injected via
# Secret Manager into GOOGLE_APPLICATION_CREDENTIALS_JSON as a raw string.
# We materialise it to a temp file so the Firebase Admin SDK (and any
# other Google client library) can discover it via the standard
# GOOGLE_APPLICATION_CREDENTIALS env-var.
# ---------------------------------------------------------------------------
def _materialise_sa_credentials() -> None:
    """Write SA JSON from env to a temp file if not already on disk."""
    creds_json = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if not creds_json:
        return

    # Already written in a previous import / worker
    existing = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if existing and os.path.exists(existing):
        return

    try:
        # Validate it's real JSON before writing
        json.loads(creds_json)
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", prefix="gcp_sa_", delete=False
        )
        tmp.write(creds_json)
        tmp.close()
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp.name
        log.info("Materialised SA credentials → %s", tmp.name)
    except (json.JSONDecodeError, OSError) as exc:
        log.error("Failed to materialise SA credentials: %s", exc)


_materialise_sa_credentials()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_cloud_project: str = "gen-lang-client-0067611351"
    google_cloud_location: str = "us-central1"
    google_application_credentials: str | None = None
    gemini_model: str = "gemini-1.5-pro"
    gemini_api_key: str | None = None

    firebase_project_id: str = "gen-lang-client-0067611351"
    firebase_storage_bucket: str = "gen-lang-client-0067611351.firebasestorage.app"
    firebase_credentials: str | None = None

    environment: str = "development"
    max_pdf_size_mb: int = 20
    agent_timeout_seconds: int = 120
    use_mock_data: bool = True
    log_level: str = "INFO"

    cors_origins: str = "http://localhost:8081,http://localhost:19006,exp://"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def has_real_gemini(self) -> bool:
        return bool(self.gemini_api_key) or bool(self.google_application_credentials)

    @property
    def has_real_firebase(self) -> bool:
        creds = self.firebase_credentials or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        return bool(creds and os.path.exists(creds))


@lru_cache
def get_settings() -> Settings:
    return Settings()
