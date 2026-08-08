from __future__ import annotations

import secrets
from uuid import UUID

from fastapi import UploadFile

from app.errors import ApiError
from app.images.schemas import ImageUploadRead
from app.images.storage import Storage

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_UPLOAD_BYTES = 2 * 1024 * 1024
SIGNED_URL_EXPIRES_SECONDS = 15 * 60


async def read_upload_limited(file: UploadFile) -> tuple[bytes, str]:
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ApiError(400, "仅支持 JPEG、PNG 或 WebP", "unsupported_image_type")

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise ApiError(413, "图片不能超过 2 MB", "image_too_large")
    if not data:
        raise ApiError(400, "图片不能为空", "empty_image")
    return data, content_type


def build_image_key(household_id: UUID, content_type: str) -> str:
    extension = ALLOWED_CONTENT_TYPES[content_type]
    return f"{household_id}/{secrets.token_urlsafe(16)}.{extension}"


def signed_image_url(storage: Storage, image_key: str | None) -> str | None:
    if not image_key:
        return None
    return storage.signed_get_url(
        image_key, expires_seconds=SIGNED_URL_EXPIRES_SECONDS
    )


async def upload_image(
    *,
    storage: Storage,
    household_id: UUID,
    file: UploadFile,
) -> ImageUploadRead:
    data, content_type = await read_upload_limited(file)
    image_key = build_image_key(household_id, content_type)
    try:
        storage.put(image_key, data, content_type)
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(
            503, "图片上传失败，请稍后重试", "image_upload_failed"
        ) from error

    return ImageUploadRead(
        image_key=image_key,
        image_url=storage.signed_get_url(
            image_key, expires_seconds=SIGNED_URL_EXPIRES_SECONDS
        ),
    )
