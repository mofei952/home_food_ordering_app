from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.households.service import AuthContext, require_member
from app.metrics.schemas import (
    EventCreate,
    EventRead,
    HistoryEntry,
    MetricsSummary,
    ValidationCheckinRead,
    ValidationCheckinWrite,
)
from app.metrics.service import (
    checkin_to_read,
    event_to_read,
    list_history,
    record_event,
    summarize_metrics,
    upsert_validation_checkin,
)

router = APIRouter(prefix="/api")
DbSession = Annotated[AsyncSession, Depends(get_session)]
CurrentMember = Annotated[AuthContext, Depends(require_member)]


@router.post(
    "/events",
    response_model=EventRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_event(
    payload: EventCreate,
    auth: CurrentMember,
    db: DbSession,
) -> EventRead:
    event = await record_event(db, auth, payload)
    return event_to_read(event)


@router.put(
    "/validation-checkins/{week_start}",
    response_model=ValidationCheckinRead,
)
async def put_validation_checkin(
    week_start: date,
    payload: ValidationCheckinWrite,
    auth: CurrentMember,
    db: DbSession,
) -> ValidationCheckinRead:
    checkin = await upsert_validation_checkin(db, auth, week_start, payload)
    return checkin_to_read(checkin)


@router.get("/history", response_model=list[HistoryEntry])
async def get_history(
    auth: CurrentMember,
    db: DbSession,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
) -> list[HistoryEntry]:
    return await list_history(db, auth, from_date, to_date)


@router.get("/metrics/summary", response_model=MetricsSummary)
async def get_metrics_summary(
    auth: CurrentMember,
    db: DbSession,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
) -> MetricsSummary:
    return await summarize_metrics(db, auth, from_date, to_date)
