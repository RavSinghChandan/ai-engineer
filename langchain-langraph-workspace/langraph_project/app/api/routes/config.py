from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/config", tags=["Health"])


class FrontendConfig(BaseModel):
    backendUrl: str


@router.get("/", response_model=FrontendConfig, summary="Frontend runtime config")
async def get_config(request: Request) -> FrontendConfig:
    """Returns the backend base URL so the frontend never needs a hardcoded port."""
    host = request.headers.get("host", "localhost:8001")
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    return FrontendConfig(backendUrl=f"{scheme}://{host}")
