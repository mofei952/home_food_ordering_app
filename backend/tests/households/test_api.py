import pytest
from fastapi.testclient import TestClient


def create_household(
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
