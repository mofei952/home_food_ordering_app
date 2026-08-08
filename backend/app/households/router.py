from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import ApiError
from app.households.models import Member, Session
from app.households.schemas import (
    AuthResponse,
    CreateHouseholdRequest,
    CreateHouseholdResponse,
    HouseholdSummary,
    JoinHouseholdRequest,
    MemberSummary,
    ResetPinRequest,
    RotateInviteResponse,
    SessionResponse,
)
from app.households.service import (
    JOIN_FAILURE_LIMIT,
    SESSION_COOKIE_NAME,
    AuthContext,
    authenticate_existing_member,
    clear_session_cookie,
    create_household_and_owner,
    household_for_invite,
    issue_session,
    member_for_nickname,
    rate_limiter,
    require_member,
    require_owner,
)
from app.security import (
    generate_invite_code,
    hash_pin,
    hash_secret,
    normalize_client_ip,
)

router = APIRouter(prefix="/api")
DbSession = Annotated[AsyncSession, Depends(get_session)]
CurrentMember = Annotated[AuthContext, Depends(require_member)]


def cookie_is_secure(request: Request) -> bool:
    secure: bool = request.app.state.secure_cookies
    return secure


@router.post(
    "/households",
    response_model=CreateHouseholdResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_household(
    payload: CreateHouseholdRequest,
    request: Request,
    response: Response,
    db: DbSession,
) -> CreateHouseholdResponse:
    household, owner, invite_code = await create_household_and_owner(
        db,
        name=payload.household_name,
        timezone_name=payload.timezone,
        owner_name=payload.owner_name,
        pin=payload.pin,
    )
    await issue_session(db, owner, response, secure=cookie_is_secure(request))
    return CreateHouseholdResponse(
        household=HouseholdSummary.model_validate(household),
        member=MemberSummary.model_validate(owner),
        invite_code=invite_code,
    )


@router.post(
    "/households/join",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
async def join_household(
    payload: JoinHouseholdRequest,
    request: Request,
    response: Response,
    db: DbSession,
) -> AuthResponse:
    limiter = rate_limiter(request)
    client_ip = normalize_client_ip(
        request.client.host if request.client is not None else None
    )
    join_key = ("invite", client_ip)
    if limiter.is_limited(join_key, JOIN_FAILURE_LIMIT):
        raise ApiError(429, "邀请码尝试次数过多", "join_rate_limited")
    household = await household_for_invite(db, payload.invite_code)
    if household is None:
        limiter.record_failure(join_key)
        raise ApiError(404, "邀请码无效", "invalid_invite")
    limiter.clear(join_key)

    member = await member_for_nickname(db, household.id, payload.nickname)
    if member is not None:
        if member.status == "disabled":
            raise ApiError(403, "成员已停用", "member_disabled")
        await authenticate_existing_member(member, payload.pin, limiter)
        response.status_code = status.HTTP_200_OK
    else:
        member = Member(
            household_id=household.id,
            nickname=payload.nickname,
            pin_hash=hash_pin(payload.pin),
            role="member",
            status="active",
        )
        db.add(member)
        await db.flush()

    await issue_session(db, member, response, secure=cookie_is_secure(request))
    return AuthResponse(
        household=HouseholdSummary.model_validate(household),
        member=MemberSummary.model_validate(member),
    )


@router.get("/session", response_model=SessionResponse)
async def get_current_session(
    auth: CurrentMember,
    db: DbSession,
) -> SessionResponse:
    members = list(
        await db.scalars(
            select(Member)
            .where(Member.household_id == auth.household.id)
            .order_by(Member.created_at, Member.id)
        )
    )
    return SessionResponse(
        household=HouseholdSummary.model_validate(auth.household),
        member=MemberSummary.model_validate(auth.member),
        members=[MemberSummary.model_validate(member) for member in members],
    )


@router.delete("/session", status_code=status.HTTP_204_NO_CONTENT)
async def delete_current_session(
    request: Request,
    response: Response,
    db: DbSession,
) -> None:
    raw_token = request.cookies.get(SESSION_COOKIE_NAME)
    if raw_token is not None:
        stored_session = await db.scalar(
            select(Session).where(Session.token_hash == hash_secret(raw_token))
        )
        if stored_session is not None:
            await db.delete(stored_session)
            await db.commit()
    clear_session_cookie(response, secure=cookie_is_secure(request))


@router.post(
    "/households/invite/rotate",
    response_model=RotateInviteResponse,
)
async def rotate_invite(
    auth: CurrentMember,
    db: DbSession,
) -> RotateInviteResponse:
    require_owner(auth)
    invite_code = generate_invite_code()
    auth.household.invite_code_hash = hash_secret(invite_code)
    await db.commit()
    return RotateInviteResponse(invite_code=invite_code)


async def household_member(
    db: AsyncSession, auth: AuthContext, member_id: UUID
) -> Member:
    member = await db.scalar(
        select(Member).where(
            Member.id == member_id,
            Member.household_id == auth.household.id,
        )
    )
    if member is None:
        raise ApiError(404, "成员不存在", "member_not_found")
    return member


@router.post(
    "/households/members/{member_id}/disable",
    response_model=MemberSummary,
)
async def disable_member(
    member_id: UUID,
    auth: CurrentMember,
    db: DbSession,
) -> Member:
    require_owner(auth)
    member = await household_member(db, auth, member_id)
    if member.role == "owner":
        raise ApiError(400, "不能停用家庭创建者", "cannot_disable_owner")
    member.status = "disabled"
    await db.commit()
    return member


@router.post(
    "/households/members/{member_id}/pin/reset",
    response_model=MemberSummary,
)
async def reset_member_pin(
    member_id: UUID,
    payload: ResetPinRequest,
    auth: CurrentMember,
    db: DbSession,
) -> Member:
    require_owner(auth)
    member = await household_member(db, auth, member_id)
    member.pin_hash = hash_pin(payload.pin)
    await db.commit()
    return member
