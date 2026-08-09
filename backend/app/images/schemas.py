from pydantic import BaseModel


class ImageUploadRead(BaseModel):
    image_key: str
    image_url: str
