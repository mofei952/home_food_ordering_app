from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile, status

from app.households.service import AuthContext, require_member
from app.images.schemas import ImageUploadRead
from app.images.service import upload_image
from app.images.storage import Storage

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
    auth: CurrentMember,
    storage: StorageDep,
    file: ImageFile,
) -> ImageUploadRead:
    return await upload_image(
        storage=storage,
        household_id=auth.household.id,
        file=file,
    )
