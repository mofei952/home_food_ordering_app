import hashlib
import ipaddress
import re
import secrets
import time
from collections import defaultdict, deque
from collections.abc import Callable, Hashable

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

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
