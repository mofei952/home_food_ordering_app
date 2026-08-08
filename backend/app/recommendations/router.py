from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.households.service import AuthContext, require_member
from app.recommendations.schemas import (
    RandomRequest,
    RandomResponse,
    RecommendationFilters,
    SearchResponse,
)
from app.recommendations.service import random_recommendation, search_recommendations

router = APIRouter(prefix="/api/recommendations")
DbSession = Annotated[AsyncSession, Depends(get_session)]
CurrentMember = Annotated[AuthContext, Depends(require_member)]


@router.post("/search", response_model=SearchResponse)
async def post_search(
    payload: RecommendationFilters,
    auth: CurrentMember,
    db: DbSession,
) -> SearchResponse:
    return await search_recommendations(db, auth, payload)


@router.post("/random", response_model=RandomResponse)
async def post_random(
    payload: RandomRequest,
    auth: CurrentMember,
    db: DbSession,
) -> RandomResponse:
    return await random_recommendation(db, auth, payload)
