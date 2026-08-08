import hashlib
import ipaddress
import re
import secrets
import time
from collections import defaultdict, deque
from collections.abc import Callable, Hashable

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from starlette.requests import Request

ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
PIN_PATTERN = re.compile(r"^\d{4,6}$")
RATE_LIMIT_WINDOW_SECONDS = 15 * 60
password_hasher = PasswordHasher()


def hash_pin(pin: str) -> str:
    if PIN_PATTERN.fullmatch(pin) is None:
        raise ValueError("PIN must contain 4 to 6 digits")
    return password_hasher.hash(pin)


def verify_pin(pin: str, encoded: str) -> bool:
    try:
        return password_hasher.verify(encoded, pin)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def generate_invite_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(8))


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_session_token() -> tuple[str, str]:
    raw_token = secrets.token_urlsafe(32)
    return raw_token, hash_secret(raw_token)


def normalize_client_ip(value: str | None) -> str:
    if value is None:
        return "unknown"
    try:
        return ipaddress.ip_address(value).compressed
    except ValueError:
        return value.strip().lower()


def client_ip_from_request(request: Request, *, trusted_proxy_headers: bool) -> str:
    """Resolve client IP, optionally trusting reverse-proxy headers.

    When ``trusted_proxy_headers`` is true (Compose/Caddy), prefer the leftmost
    ``X-Forwarded-For`` hop or ``X-Real-IP``. Otherwise use the direct socket peer
    so untrusted clients cannot spoof rate-limit keys.
    """
    if trusted_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            first_hop = forwarded.split(",")[0].strip()
            if first_hop:
                return normalize_client_ip(first_hop)
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return normalize_client_ip(real_ip.strip())
    host = request.client.host if request.client is not None else None
    return normalize_client_ip(host)


class SlidingWindowRateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._failures: dict[Hashable, deque[float]] = defaultdict(deque)

    def is_limited(self, key: Hashable, limit: int) -> bool:
        failures = self._failures[key]
        cutoff = self._clock() - RATE_LIMIT_WINDOW_SECONDS
        while failures and failures[0] <= cutoff:
            failures.popleft()
        return len(failures) >= limit

    def record_failure(self, key: Hashable) -> None:
        self._failures[key].append(self._clock())

    def clear(self, key: Hashable) -> None:
        self._failures.pop(key, None)
