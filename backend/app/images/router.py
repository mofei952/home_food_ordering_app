from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile, status

from app.errors import ApiError
from app.households.service import AuthContext, rate_limiter, require_member
from app.images.schemas import ImageUploadRead
from app.images.service import upload_image
from app.images.storage import Storage
from app.security import client_ip_from_request

router = APIRouter(prefix="/api")
CurrentMember = Annotated[AuthContext, Depends(require_member)]


def get_storage(request: Request) -> Storage:
    return request.app.state.storage


StorageDep = Annotated[Storage, Depends(get_storage)]
ImageFile = Annotated[UploadFile, File()]


@router.post(
    "/images",
    response_model=ImageUploadRead,
    status_code=status.HTTP_201_CREATED,
)
async def post_image(
    request: Request,
    auth: CurrentMember,
    storage: StorageDep,
    file: ImageFile,
) -> ImageUploadRead:
    limiter = rate_limiter(request)
    settings = getattr(request.app.state, "settings", None)
    limit = int(getattr(settings, "image_upload_limit", 20))
    trusted = bool(getattr(request.app.state, "trusted_proxy_headers", False))
    client_ip = client_ip_from_request(request, trusted_proxy_headers=trusted)
    member_key = ("image_upload", "member", str(auth.member.id))
    ip_key = ("image_upload", "ip", client_ip)
    if limiter.is_limited(member_key, limit) or limiter.is_limited(ip_key, limit):
        raise ApiError(429, "图片上传过于频繁，请稍后再试", "image_rate_limited")
    result = await upload_image(
        storage=storage,
        household_id=auth.household.id,
        file=file,
    )
    limiter.record_failure(member_key)
    limiter.record_failure(ip_key)
    return result
