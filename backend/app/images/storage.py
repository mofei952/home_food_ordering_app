from __future__ import annotations

import logging
import secrets
from typing import Protocol
from urllib.parse import quote

import boto3
from botocore.client import BaseClient
from botocore.exceptions import BotoCoreError, ClientError

from app.config import Settings
from app.errors import ApiError

logger = logging.getLogger(__name__)


class Storage(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> None: ...

    def signed_get_url(self, key: str, expires_seconds: int = 900) -> str: ...

    def delete(self, key: str) -> None: ...


class InMemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = (data, content_type)

    def signed_get_url(self, key: str, expires_seconds: int = 900) -> str:
        token = secrets.token_urlsafe(8)
        return (
            f"https://memory.local/{quote(key, safe='/')}"
            f"?X-Amz-Expires={expires_seconds}&X-Amz-Signature={token}"
        )

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)


class S3Storage:
    def __init__(
        self,
        *,
        client: BaseClient,
        bucket: str,
    ) -> None:
        self._client = client
        self._bucket = bucket

    def put(self, key: str, data: bytes, content_type: str) -> None:
        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
        except (BotoCoreError, ClientError) as error:
            raise ApiError(
                503, "图片上传失败，请稍后重试", "image_upload_failed"
            ) from error

    def signed_get_url(self, key: str, expires_seconds: int = 900) -> str:
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=expires_seconds,
            )
        except (BotoCoreError, ClientError) as error:
            raise ApiError(
                503, "图片地址生成失败，请稍后重试", "image_url_failed"
            ) from error

    def delete(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except (BotoCoreError, ClientError) as error:
            raise ApiError(
                503, "图片删除失败，请稍后重试", "image_delete_failed"
            ) from error


class StorageConfigError(RuntimeError):
    """Raised when image storage settings are incomplete or invalid."""


def _allow_memory_without_s3(settings: Settings) -> bool:
    # Explicit IMAGE_STORAGE=memory is preferred; this path is only a
    # development/test convenience with a warning. Production must configure S3.
    return settings.environment in {"development", "test"}


def build_storage(settings: Settings) -> Storage:
    backend = settings.image_storage.strip().lower()
    if backend == "memory":
        logger.warning(
            "Using InMemoryStorage (IMAGE_STORAGE=memory); "
            "images are not persisted across processes"
        )
        return InMemoryStorage()

    if backend != "s3":
        raise StorageConfigError(
            f"Unknown IMAGE_STORAGE={settings.image_storage!r}; "
            "expected 's3' or 'memory'"
        )

    if not settings.s3_endpoint_url:
        if _allow_memory_without_s3(settings):
            logger.warning(
                "S3_ENDPOINT_URL is unset; falling back to InMemoryStorage "
                "(allowed only for development/test). "
                "Set IMAGE_STORAGE=memory explicitly, or configure S3_*."
            )
            return InMemoryStorage()
        raise StorageConfigError(
            "S3_ENDPOINT_URL is required when IMAGE_STORAGE=s3 in "
            f"environment={settings.environment!r}. "
            "Configure S3_* settings, or set IMAGE_STORAGE=memory "
            "only for non-production local use."
        )

    client = boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
    )
    return S3Storage(client=client, bucket=settings.s3_bucket)
