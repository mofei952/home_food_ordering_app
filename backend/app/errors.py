from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        detail: str,
        code: str,
        *,
        current_version: int | None = None,
    ) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code
        self.current_version = current_version


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(_request: Request, error: ApiError) -> JSONResponse:
        body: dict[str, Any] = {"detail": error.detail, "code": error.code}
        if error.current_version is not None:
            body["current_version"] = error.current_version
        return JSONResponse(status_code=error.status_code, content=body)
