"""Shared pytest configuration for backend tests."""

import asyncio
from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.config import Settings
from app.db import Base, get_session
from app.dishes import models as dish_models  # noqa: F401
from app.households import models as household_models  # noqa: F401
from app.meals import models as meal_models  # noqa: F401
from app.metrics import models as metric_models  # noqa: F401
from app.main import create_app


@pytest.fixture
def test_engine() -> Iterator[AsyncEngine]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async def create_schema() -> None:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    asyncio.run(create_schema())
    yield engine
    asyncio.run(engine.dispose())


class MutableClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture
def clock() -> MutableClock:
    return MutableClock()


@pytest.fixture
def app(test_engine: AsyncEngine, clock: MutableClock) -> FastAPI:
    session_factory = async_sessionmaker(test_engine, expire_on_commit=False)

    async def test_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    application = create_app(
        settings=Settings(
            environment="development",
            database_url="sqlite+aiosqlite://",
            image_storage="memory",
        ),
        clock=clock,
    )
    application.dependency_overrides[get_session] = test_session
    return application


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
