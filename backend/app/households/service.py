from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import ApiError
from app.households.models import Household, Member, Session
from app.security import (
    SlidingWindowRateLimiter,
    generate_invite_code,
    hash_pin,
    hash_secret,
    new_session_token,
    verify_pin,
)

SESSION_COOKIE_NAME = "family_session"
SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
PIN_FAILURE_LIMIT = 5
JOIN_FAILURE_LIMIT = 10


@dataclass(frozen=True)
class AuthContext:
    member: Member
    household: Household


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def rate_limiter(request: Request) -> SlidingWindowRateLimiter:
    limiter: SlidingWindowRateLimiter = request.app.state.rate_limiter
    return limiter


async def issue_session(
    db: AsyncSession, member: Member, response: Response, *, secure: bool
) -> None:
    raw_token, token_hash = new_session_token()
    db.add(
        Session(
            member_id=member.id,
            token_hash=token_hash,
            expires_at=utc_now() + timedelta(seconds=SESSION_TTL_SECONDS),
        )
    )
    await db.commit()
    response.set_cookie(
        SESSION_COOKIE_NAME,
        raw_token,
        max_age=SESSION_TTL_SECONDS,
        expires=SESSION_TTL_SECONDS,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, *, secure: bool) -> None:
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


async def create_household_and_owner(
    db: AsyncSession,
    *,
    name: str,
    timezone_name: str,
    owner_name: str,
    pin: str,
) -> tuple[Household, Member, str]:
    invite_code = generate_invite_code()
    household = Household(
        name=name,
        timezone=timezone_name,
        invite_code_hash=hash_secret(invite_code),
    )
    db.add(household)
    await db.flush()
    owner = Member(
        household_id=household.id,
        nickname=owner_name,
        pin_hash=hash_pin(pin),
        role="owner",
        status="active",
    )
    db.add(owner)
    await db.flush()
    return household, owner, invite_code


async def household_for_invite(
    db: AsyncSession, invite_code: str
) -> Household | None:
    return await db.scalar(
        select(Household).where(
            Household.invite_code_hash == hash_secret(invite_code)
        )
    )


async def member_for_nickname(
    db: AsyncSession, household_id: UUID, nickname: str
) -> Member | None:
    return await db.scalar(
        select(Member).where(
            Member.household_id == household_id,
            func.lower(Member.nickname) == nickname.casefold(),
        )
    )


async def require_member(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> AuthContext:
    raw_token = request.cookies.get(SESSION_COOKIE_NAME)
    if raw_token is None:
        raise ApiError(401, "请先登录", "not_authenticated")

    result = await db.execute(
        select(Session, Member, Household)
        .join(Member, Session.member_id == Member.id)
        .join(Household, Member.household_id == Household.id)
        .where(Session.token_hash == hash_secret(raw_token))
    )
    row = result.one_or_none()
    if row is None:
        raise ApiError(401, "会话无效", "invalid_session")
    stored_session, member, household = row
    expires_at = stored_session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= utc_now():
        await db.delete(stored_session)
        await db.commit()
        raise ApiError(401, "会话已过期", "expired_session")
    if member.status == "disabled":
        raise ApiError(403, "成员已停用", "member_disabled")
    return AuthContext(member=member, household=household)


def require_owner(auth: AuthContext) -> None:
    if auth.member.role != "owner":
        raise ApiError(403, "仅家庭创建者可执行此操作", "owner_required")


async def authenticate_existing_member(
    member: Member,
    pin: str,
    limiter: SlidingWindowRateLimiter,
) -> None:
    key = member.id
    if limiter.is_limited(key, PIN_FAILURE_LIMIT):
        raise ApiError(429, "PIN 尝试次数过多", "pin_rate_limited")
    if not verify_pin(pin, member.pin_hash):
        limiter.record_failure(key)
        raise ApiError(401, "PIN 错误", "invalid_pin")
    limiter.clear(key)
