import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from conftest import MutableClock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx2 import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.households.models import Household, Member, Session
from app.security import ALPHABET, hash_secret


def create_household(
    client: TestClient,
    *,
    household_name: str = "我家",
    owner_name: str = "小林",
    pin: str = "1234",
) -> Response:
    return client.post(
        "/api/households",
        json={
            "household_name": household_name,
            "owner_name": owner_name,
            "pin": pin,
            "timezone": "Asia/Shanghai",
        },
    )


def test_create_and_join_household(client: TestClient) -> None:
    created = create_household(client)
    assert created.status_code == 201
    invite_code = created.json()["invite_code"]
    assert len(invite_code) == 8

    joined = client.post(
        "/api/households/join",
        json={"invite_code": invite_code, "nickname": "小周", "pin": "5678"},
    )
    assert joined.status_code == 201
    assert joined.json()["member"]["nickname"] == "小周"


@pytest.mark.parametrize("pin", ["123", "1234567", "12ab"])
def test_rejects_invalid_pin(client: TestClient, pin: str) -> None:
    response = create_household(client, pin=pin)
    assert response.status_code == 422


def test_session_cookie_is_secure_for_thirty_days(client: TestClient) -> None:
    response = create_household(client)
    cookie = response.headers["set-cookie"]
    assert "family_session=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Max-Age=2592000" in cookie
    assert "secure" not in cookie.lower()


def test_session_and_logout(client: TestClient) -> None:
    assert create_household(client).status_code == 201

    session = client.get("/api/session")
    assert session.status_code == 200
    assert session.json()["member"]["role"] == "owner"
    assert session.json()["household"]["name"] == "我家"

    logged_out = client.delete("/api/session")
    assert logged_out.status_code == 204
    assert client.get("/api/session").status_code == 401


def test_existing_nickname_with_correct_pin_signs_in(
    client: TestClient,
) -> None:
    created = create_household(client)
    owner_id = created.json()["member"]["id"]
    response = client.post(
        "/api/households/join",
        json={
            "invite_code": created.json()["invite_code"],
            "nickname": "小林",
            "pin": "1234",
        },
    )
    assert response.status_code == 200
    assert response.json()["member"]["id"] == owner_id


def test_existing_nickname_match_is_case_insensitive(
    client: TestClient,
) -> None:
    created = create_household(client, owner_name="Alice")
    owner_id = created.json()["member"]["id"]
    response = client.post(
        "/api/households/join",
        json={
            "invite_code": created.json()["invite_code"].lower(),
            "nickname": "ALICE",
            "pin": "1234",
        },
    )
    assert response.status_code == 200
    assert response.json()["member"]["id"] == owner_id


def test_existing_nickname_uses_database_lower_semantics(
    client: TestClient,
) -> None:
    created = create_household(client, owner_name="Straße")
    owner_id = created.json()["member"]["id"]
    response = client.post(
        "/api/households/join",
        json={
            "invite_code": created.json()["invite_code"],
            "nickname": "STRAẞE",
            "pin": "1234",
        },
    )
    assert response.status_code == 200
    assert response.json()["member"]["id"] == owner_id


def test_wrong_pin_returns_401(client: TestClient) -> None:
    created = create_household(client)
    response = client.post(
        "/api/households/join",
        json={
            "invite_code": created.json()["invite_code"],
            "nickname": "小林",
            "pin": "9999",
        },
    )
    assert response.status_code == 401


def test_expired_session_returns_401(
    client: TestClient, test_engine: AsyncEngine
) -> None:
    assert create_household(client).status_code == 201
    raw_token = client.cookies["family_session"]

    async def expire_session() -> None:
        async with AsyncSession(test_engine) as db:
            stored = await db.scalar(
                select(Session).where(Session.token_hash == hash_secret(raw_token))
            )
            assert stored is not None
            stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            await db.commit()

    asyncio.run(expire_session())
    assert client.get("/api/session").status_code == 401


def test_disabled_member_returns_403(app: FastAPI, client: TestClient) -> None:
    created = create_household(client)
    with TestClient(app) as joined_client:
        joined = joined_client.post(
            "/api/households/join",
            json={
                "invite_code": created.json()["invite_code"],
                "nickname": "小周",
                "pin": "5678",
            },
        )
        member_id = joined.json()["member"]["id"]
        disabled = client.post(f"/api/households/members/{member_id}/disable")
        assert disabled.status_code == 200
        assert joined_client.get("/api/session").status_code == 403


def test_cross_household_member_returns_404(app: FastAPI, client: TestClient) -> None:
    assert create_household(client, household_name="甲家").status_code == 201
    with TestClient(app) as other_owner:
        other = create_household(other_owner, household_name="乙家", owner_name="乙")
        other_member_id = other.json()["member"]["id"]
        response = client.post(f"/api/households/members/{other_member_id}/disable")
    assert response.status_code == 404


def test_non_owner_cannot_rotate_invite(app: FastAPI, client: TestClient) -> None:
    created = create_household(client)
    with TestClient(app) as joined_client:
        assert (
            joined_client.post(
                "/api/households/join",
                json={
                    "invite_code": created.json()["invite_code"],
                    "nickname": "小周",
                    "pin": "5678",
                },
            ).status_code
            == 201
        )
        response = joined_client.post("/api/households/invite/rotate")
    assert response.status_code == 403


def test_only_owner_can_disable_or_reset_members(
    app: FastAPI, client: TestClient
) -> None:
    created = create_household(client)
    owner_id = created.json()["member"]["id"]
    with TestClient(app) as joined_client:
        joined = joined_client.post(
            "/api/households/join",
            json={
                "invite_code": created.json()["invite_code"],
                "nickname": "小周",
                "pin": "5678",
            },
        )
        member_id = joined.json()["member"]["id"]
        assert (
            joined_client.post(
                f"/api/households/members/{owner_id}/disable"
            ).status_code
            == 403
        )
        assert (
            joined_client.post(
                f"/api/households/members/{member_id}/pin/reset",
                json={"pin": "1357"},
            ).status_code
            == 403
        )

        reset = client.post(
            f"/api/households/members/{member_id}/pin/reset",
            json={"pin": "1357"},
        )
        assert reset.status_code == 200
        old_pin = joined_client.post(
            "/api/households/join",
            json={
                "invite_code": created.json()["invite_code"],
                "nickname": "小周",
                "pin": "5678",
            },
        )
        assert old_pin.status_code == 401
        new_pin = joined_client.post(
            "/api/households/join",
            json={
                "invite_code": created.json()["invite_code"],
                "nickname": "小周",
                "pin": "1357",
            },
        )
        assert new_pin.status_code == 200


def test_rotate_invite_invalidates_previous_code(
    client: TestClient,
) -> None:
    old_code = create_household(client).json()["invite_code"]
    rotated = client.post("/api/households/invite/rotate")
    assert rotated.status_code == 200
    new_code = rotated.json()["invite_code"]
    assert len(new_code) == 8
    assert new_code != old_code
    assert (
        client.post(
            "/api/households/join",
            json={
                "invite_code": old_code,
                "nickname": "小周",
                "pin": "5678",
            },
        ).status_code
        == 404
    )


def test_session_members_are_isolated_by_household(
    app: FastAPI, client: TestClient
) -> None:
    first = create_household(client, household_name="甲家")
    client.post(
        "/api/households/join",
        json={
            "invite_code": first.json()["invite_code"],
            "nickname": "甲成员",
            "pin": "5678",
        },
    )
    with TestClient(app) as other:
        create_household(other, household_name="乙家", owner_name="乙成员")
        other_names = {
            member["nickname"] for member in other.get("/api/session").json()["members"]
        }
    first_names = {
        member["nickname"] for member in client.get("/api/session").json()["members"]
    }
    assert first_names == {"小林", "甲成员"}
    assert other_names == {"乙成员"}


def test_pin_rate_limit_returns_429_after_five_failures(
    client: TestClient, clock: MutableClock
) -> None:
    created = create_household(client)
    payload = {
        "invite_code": created.json()["invite_code"],
        "nickname": "小林",
        "pin": "9999",
    }
    for _ in range(5):
        assert client.post("/api/households/join", json=payload).status_code == 401
    assert client.post("/api/households/join", json=payload).status_code == 429

    clock.advance(15 * 60 + 1)
    assert client.post("/api/households/join", json=payload).status_code == 401


def test_join_rate_limit_returns_429_after_ten_failures(
    client: TestClient, clock: MutableClock
) -> None:
    payload = {
        "invite_code": ALPHABET[0] * 8,
        "nickname": "小周",
        "pin": "5678",
    }
    for _ in range(10):
        assert client.post("/api/households/join", json=payload).status_code == 404
    assert client.post("/api/households/join", json=payload).status_code == 429

    clock.advance(15 * 60 + 1)
    assert client.post("/api/households/join", json=payload).status_code == 404


@pytest.mark.parametrize(
    "invite_code", ["12345678", "ABCDEFGI", "TOO-SHORT", "ＡＢＣＤＥＦＧＨ"]
)
def test_rejects_invalid_invite_format(client: TestClient, invite_code: str) -> None:
    response = client.post(
        "/api/households/join",
        json={
            "invite_code": invite_code,
            "nickname": "小周",
            "pin": "5678",
        },
    )
    assert response.status_code == 422


def test_only_session_hash_is_stored(
    client: TestClient, test_engine: AsyncEngine
) -> None:
    assert create_household(client).status_code == 201
    raw_token = client.cookies["family_session"]

    async def stored_token() -> str:
        async with AsyncSession(test_engine) as db:
            token = await db.scalar(select(Session.token_hash))
            assert token is not None
            return token

    token_hash = asyncio.run(stored_token())
    assert token_hash == hash_secret(raw_token)
    assert token_hash != raw_token


def test_pin_and_invite_code_are_only_stored_as_hashes(
    client: TestClient, test_engine: AsyncEngine
) -> None:
    created = create_household(client)
    invite_code = created.json()["invite_code"]

    async def stored_secrets() -> tuple[str, str]:
        async with AsyncSession(test_engine) as db:
            invite_hash = await db.scalar(select(Household.invite_code_hash))
            pin_hash = await db.scalar(select(Member.pin_hash))
            assert invite_hash is not None
            assert pin_hash is not None
            return invite_hash, pin_hash

    invite_hash, pin_hash = asyncio.run(stored_secrets())
    assert invite_hash == hash_secret(invite_code)
    assert invite_code not in invite_hash
    assert pin_hash != "1234"
    assert "1234" not in pin_hash


def test_session_cookie_is_secure_outside_development(
    app: FastAPI, client: TestClient
) -> None:
    app.state.secure_cookies = True
    response = create_household(client)
    assert "Secure" in response.headers["set-cookie"]
