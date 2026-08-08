from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.images.storage import (
    InMemoryStorage,
    S3Storage,
    StorageConfigError,
    build_storage,
)


def _create_household(
    client: TestClient,
    *,
    household_name: str = "我家",
    owner_name: str = "小林",
    pin: str = "1234",
) -> object:
    return client.post(
        "/api/households",
        json={
            "household_name": household_name,
            "owner_name": owner_name,
            "pin": pin,
            "timezone": "Asia/Shanghai",
        },
    )


@pytest.fixture(autouse=True)
def authenticated_household(client: TestClient) -> SimpleNamespace:
    created = _create_household(client)
    assert created.status_code == 201
    return SimpleNamespace(
        household_id=UUID(created.json()["household"]["id"]),
        member_id=UUID(created.json()["member"]["id"]),
    )


@pytest.fixture
def failing_storage(app: FastAPI) -> None:
    class FailingStorage:
        def put(self, key: str, data: bytes, content_type: str) -> None:
            raise RuntimeError("storage unavailable")

        def signed_get_url(self, key: str, expires_seconds: int = 900) -> str:
            return f"https://example.test/{key}"

        def delete(self, key: str) -> None:
            return None

    app.state.storage = FailingStorage()


def test_rejects_oversized_image(client: TestClient) -> None:
    response = client.post(
        "/api/images",
        files={"file": ("dish.jpg", b"x" * (2 * 1024 * 1024 + 1), "image/jpeg")},
    )
    assert response.status_code == 413


def test_storage_failure_does_not_create_dish_image(
    client: TestClient, failing_storage: None
) -> None:
    response = client.post(
        "/api/images",
        files={"file": ("dish.webp", b"valid-image", "image/webp")},
    )
    assert response.status_code == 503
    assert response.json()["code"] == "image_upload_failed"


def test_rejects_unsupported_content_type(client: TestClient) -> None:
    response = client.post(
        "/api/images",
        files={"file": ("dish.gif", b"GIF89a", "image/gif")},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "unsupported_image_type"


def test_upload_returns_household_prefixed_key_and_signed_url(
    client: TestClient, authenticated_household: SimpleNamespace, app: FastAPI
) -> None:
    response = client.post(
        "/api/images",
        files={"file": ("dish.webp", b"valid-image-bytes", "image/webp")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["image_key"].startswith(f"{authenticated_household.household_id}/")
    assert body["image_url"]
    assert body["image_key"] in body["image_url"]


def test_dish_read_includes_signed_image_url(
    client: TestClient, authenticated_household: SimpleNamespace
) -> None:
    upload = client.post(
        "/api/images",
        files={"file": ("dish.jpg", b"jpeg-bytes", "image/jpeg")},
    )
    assert upload.status_code == 201
    image_key = upload.json()["image_key"]

    created = client.post(
        "/api/dishes",
        json={
            "name": "番茄炒蛋",
            "category": "荤菜",
            "cook_ids": [str(authenticated_household.member_id)],
            "ingredients": ["番茄", "鸡蛋"],
            "image_key": image_key,
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["image_key"] == image_key
    assert body["image_url"]
    assert image_key in body["image_url"]


def test_upload_requires_authentication(app: FastAPI) -> None:
    with TestClient(app) as anon:
        response = anon.post(
            "/api/images",
            files={"file": ("dish.webp", b"valid-image", "image/webp")},
        )
    assert response.status_code == 401


def test_build_storage_uses_memory_when_explicitly_configured() -> None:
    storage = build_storage(
        Settings(environment="production", image_storage="memory")
    )
    assert isinstance(storage, InMemoryStorage)


def test_build_storage_requires_s3_in_production_without_endpoint() -> None:
    with pytest.raises(StorageConfigError, match="S3_ENDPOINT_URL is required"):
        build_storage(
            Settings(
                environment="production",
                image_storage="s3",
                s3_endpoint_url=None,
            )
        )


def test_build_storage_uses_s3_when_endpoint_configured() -> None:
    storage = build_storage(
        Settings(
            environment="production",
            image_storage="s3",
            s3_endpoint_url="http://localhost:9000",
        )
    )
    assert isinstance(storage, S3Storage)


def test_build_storage_falls_back_in_development_without_endpoint() -> None:
    storage = build_storage(
        Settings(
            environment="development",
            image_storage="s3",
            s3_endpoint_url=None,
        )
    )
    assert isinstance(storage, InMemoryStorage)
