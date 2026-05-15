"""Central runtime configuration loaded from environment."""
from __future__ import annotations

import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_cloud_project: str = "exportiq-dev"
    google_cloud_location: str = "us-central1"
    google_application_credentials: str | None = None
    gemini_model: str = "gemini-1.5-pro"
    gemini_api_key: str | None = None

    firebase_project_id: str = "exportiq-dev"
    firebase_storage_bucket: str = "exportiq-dev.appspot.com"
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
        return bool(self.firebase_credentials and os.path.exists(self.firebase_credentials))


@lru_cache
def get_settings() -> Settings:
    return Settings()
