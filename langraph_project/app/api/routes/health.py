from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/health", tags=["Health"])


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str

    model_config = {
        "json_schema_extra": {
            "example": {"status": "healthy", "service": "Banking AI Platform", "version": "1.0.0"}
        }
    }


@router.get(
    "/",
    response_model=HealthResponse,
    summary="Health check",
    description="Returns service liveness status. Use this to confirm the API is up before sending requests.",
)
async def health_check() -> HealthResponse:
    return HealthResponse(status="healthy", service="Banking AI Platform", version="1.0.0")
