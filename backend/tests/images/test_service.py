"""Pure unit tests for image upload helpers (no HTTP)."""

import asyncio
from io import BytesIO
from uuid import UUID, uuid4

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.errors import ApiError
from app.images.service import (
    MAX_UPLOAD_BYTES,
    build_image_key,
    read_upload_limited,
    signed_image_url,
)


class _FakeStorage:
    def signed_get_url(self, key: str, *, expires_seconds: int) -> str:
        return f"https://example.test/{key}?e={expires_seconds}"


def _upload(data: bytes, content_type: str | None) -> UploadFile:
    headers = (
        Headers({"content-type": content_type}) if content_type is not None else Headers()
    )
    return UploadFile(file=BytesIO(data), filename="dish.jpg", headers=headers)


def test_read_upload_rejects_empty_body() -> None:
    with pytest.raises(ApiError) as exc:
        asyncio.run(read_upload_limited(_upload(b"", "image/jpeg")))
    assert exc.value.code == "empty_image"


def test_read_upload_strips_content_type_params() -> None:
    data, content_type = asyncio.run(
        read_upload_limited(_upload(b"abc", "image/jpeg; charset=binary"))
    )
    assert data == b"abc"
    assert content_type == "image/jpeg"


def test_read_upload_accepts_exact_max_bytes() -> None:
    payload = b"x" * MAX_UPLOAD_BYTES
    data, _ = asyncio.run(read_upload_limited(_upload(payload, "image/png")))
    assert len(data) == MAX_UPLOAD_BYTES


def test_read_upload_rejects_one_byte_over_limit() -> None:
    payload = b"x" * (MAX_UPLOAD_BYTES + 1)
    with pytest.raises(ApiError) as exc:
        asyncio.run(read_upload_limited(_upload(payload, "image/webp")))
    assert exc.value.code == "image_too_large"


def test_signed_image_url_none_or_empty() -> None:
    storage = _FakeStorage()
    assert signed_image_url(storage, None) is None
    assert signed_image_url(storage, "") is None


def test_build_image_key_uses_household_and_extension() -> None:
    household_id = UUID("11111111-1111-1111-1111-111111111111")
    key = build_image_key(household_id, "image/webp")
    assert key.startswith(f"{household_id}/")
    assert key.endswith(".webp")
    assert build_image_key(uuid4(), "image/jpeg").endswith(".jpg")
