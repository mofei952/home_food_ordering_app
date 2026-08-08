from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator

Pin = Annotated[str, Field(pattern=r"^\d{4,6}$")]
InviteCode = Annotated[str, Field(pattern=r"^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$")]


class CreateHouseholdRequest(BaseModel):
    household_name: str = Field(min_length=1, max_length=100)
    owner_name: str = Field(min_length=1, max_length=100)
    pin: Pin
    timezone: str = Field(min_length=1, max_length=64)

    @field_validator("household_name", "owner_name")
    @classmethod
    def non_blank_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be blank")
        return value

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as error:
            raise ValueError("Unknown timezone") from error
        return value


class JoinHouseholdRequest(BaseModel):
    invite_code: InviteCode
    nickname: str = Field(min_length=1, max_length=100)
    pin: Pin

    @field_validator("invite_code", mode="before")
    @classmethod
    def normalize_invite_code(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("nickname")
    @classmethod
    def non_blank_nickname(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Nickname cannot be blank")
        return value


class ResetPinRequest(BaseModel):
    pin: Pin


class HouseholdSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    timezone: str


class MemberSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nickname: str
    role: Literal["owner", "member"]
    status: Literal["active", "disabled"]


class AuthResponse(BaseModel):
    household: HouseholdSummary
    member: MemberSummary


class CreateHouseholdResponse(AuthResponse):
    invite_code: str


class SessionResponse(AuthResponse):
    members: list[MemberSummary]


class RotateInviteResponse(BaseModel):
    invite_code: str
