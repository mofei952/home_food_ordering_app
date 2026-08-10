"""Unit tests for shared security helpers."""

import pytest
from starlette.requests import Request

from app.security import (
    RATE_LIMIT_WINDOW_SECONDS,
    SlidingWindowRateLimiter,
    client_ip_from_request,
    hash_pin,
    hash_secret,
    new_session_token,
    normalize_client_ip,
    verify_pin,
)
from tests.conftest import MutableClock


def _request(
    headers: dict[str, str],
    *,
    client_host: str | None = "127.0.0.1",
) -> Request:
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [
            (key.lower().encode("latin-1"), value.encode("latin-1"))
            for key, value in headers.items()
        ],
        "client": (client_host, 12345) if client_host is not None else None,
        "server": ("testserver", 80),
    }
    return Request(scope)


def test_client_ip_uses_socket_peer_when_untrusted() -> None:
    request = _request(
        {
            "X-Forwarded-For": "203.0.113.10, 198.51.100.1",
            "X-Real-IP": "203.0.113.10",
        },
        client_host="192.0.2.1",
    )
    assert (
        client_ip_from_request(request, trusted_proxy_headers=False) == "192.0.2.1"
    )


def test_client_ip_prefers_x_real_ip_when_trusted() -> None:
    request = _request(
        {
            "X-Forwarded-For": "203.0.113.9, 198.51.100.1",
            "X-Real-IP": "203.0.113.10",
        }
    )
    assert (
        client_ip_from_request(request, trusted_proxy_headers=True) == "203.0.113.10"
    )


def test_client_ip_uses_rightmost_forwarded_for_when_trusted() -> None:
    # Client-spoofed leftmost hop must not win over the proxy-appended rightmost.
    request = _request({"X-Forwarded-For": "203.0.113.9, 198.51.100.1"})
    assert (
        client_ip_from_request(request, trusted_proxy_headers=True) == "198.51.100.1"
    )


def test_client_ip_single_forwarded_for_hop_when_trusted() -> None:
    request = _request({"X-Forwarded-For": "203.0.113.10"})
    assert (
        client_ip_from_request(request, trusted_proxy_headers=True) == "203.0.113.10"
    )


def test_client_ip_falls_back_to_socket_when_trusted_headers_empty() -> None:
    request = _request(
        {"X-Forwarded-For": "  ,  ", "X-Real-IP": "   "},
        client_host="192.0.2.9",
    )
    assert (
        client_ip_from_request(request, trusted_proxy_headers=True) == "192.0.2.9"
    )


def test_client_ip_unknown_when_no_client_and_empty_headers() -> None:
    request = _request({}, client_host=None)
    assert client_ip_from_request(request, trusted_proxy_headers=True) == "unknown"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, "unknown"),
        ("203.0.113.10", "203.0.113.10"),
        ("2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1"),
        ("  Not-An-IP  ", "not-an-ip"),
    ],
)
def test_normalize_client_ip(value: str | None, expected: str) -> None:
    assert normalize_client_ip(value) == expected


@pytest.mark.parametrize("pin", ["12", "123", "12ab", "1234567", ""])
def test_hash_pin_rejects_invalid_shapes(pin: str) -> None:
    with pytest.raises(ValueError, match="PIN must contain 4 to 6 digits"):
        hash_pin(pin)


def test_verify_pin_round_trip_and_mismatches() -> None:
    encoded = hash_pin("1234")
    assert verify_pin("1234", encoded) is True
    assert verify_pin("9999", encoded) is False
    assert verify_pin("1234", "not-a-valid-argon2-hash") is False


def test_session_token_hashes_are_stable() -> None:
    raw, hashed = new_session_token()
    assert hashed == hash_secret(raw)
    assert hashed != raw


def test_sliding_window_rate_limiter_expires_and_clears() -> None:
    clock = MutableClock()
    limiter = SlidingWindowRateLimiter(clock=clock)
    key = "member:1"

    for _ in range(3):
        limiter.record_failure(key)
    assert limiter.is_limited(key, limit=3) is True

    clock.advance(RATE_LIMIT_WINDOW_SECONDS + 1)
    assert limiter.is_limited(key, limit=3) is False

    limiter.record_failure(key)
    assert limiter.is_limited(key, limit=1) is True
    limiter.clear(key)
    assert limiter.is_limited(key, limit=1) is False

