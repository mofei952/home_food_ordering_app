import time
from collections.abc import Callable

from fastapi import FastAPI

from app.config import Settings
from app.dishes.router import router as dishes_router
from app.errors import install_error_handlers
from app.households.router import router as households_router
from app.meals.router import router as meals_router
from app.recommendations.router import router as recommendations_router
from app.security import SlidingWindowRateLimiter


def create_app(
    *,
    settings: Settings | None = None,
    clock: Callable[[], float] = time.monotonic,
) -> FastAPI:
    app_settings = settings or Settings()
    app = FastAPI(title="家庭点菜 API")
    app.state.rate_limiter = SlidingWindowRateLimiter(clock)
    app.state.secure_cookies = app_settings.environment != "development"
    install_error_handlers(app)
    app.include_router(households_router)
    app.include_router(dishes_router)
    app.include_router(meals_router)
    app.include_router(recommendations_router)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
