from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    database_url: str = (
        "postgresql+asyncpg://family_menu:family_menu@localhost:5432/family_menu"
    )
    # When set, overrides ENVIRONMENT-based Secure cookie behavior.
    # Use SECURE_COOKIES=false for local HTTP (e.g. Compose on :8080).
    secure_cookies: bool | None = None
    # When true, prefer X-Forwarded-For / X-Real-IP for client IP (behind reverse proxy).
    trusted_proxy_headers: bool = False
    # "s3" (default) requires S3_*; "memory" is for pytest / explicit local use.
    image_storage: str = "s3"
    s3_endpoint_url: str | None = None
    # Browser-reachable endpoint used when signing GET URLs (defaults to s3_endpoint_url).
    s3_public_endpoint_url: str | None = None
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "family-menu"
    s3_region: str = "us-east-1"
    image_upload_limit: int = Field(default=20, ge=1)

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def resolve_secure_cookies(self) -> bool:
        if self.secure_cookies is not None:
            return self.secure_cookies
        return self.environment != "development"
