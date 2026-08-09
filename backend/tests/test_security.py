"""Unit tests for shared security helpers."""

from starlette.requests import Request

from app.security import client_ip_from_request


def _request(
    headers: dict[str, str],
    *,
    client_host: str = "127.0.0.1",
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
        "client": (client_host, 12345),
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
