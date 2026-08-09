"""Drop and recreate SQLite schema for local Playwright e2e runs."""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy.ext.asyncio import create_async_engine

from app.db import Base
from app.dishes import models as dish_models  # noqa: F401
from app.households import models as household_models  # noqa: F401
from app.meals import models as meal_models  # noqa: F401
from app.metrics import models as metric_models  # noqa: F401


async def reset(database_url: str) -> None:
    engine = create_async_engine(database_url)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    await engine.dispose()


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is required", file=sys.stderr)
        raise SystemExit(1)
    if not database_url.startswith("sqlite"):
        print("refusing to reset non-sqlite DATABASE_URL", file=sys.stderr)
        raise SystemExit(2)
    asyncio.run(reset(database_url))
    print(f"reset schema for {database_url}")


if __name__ == "__main__":
    main()
