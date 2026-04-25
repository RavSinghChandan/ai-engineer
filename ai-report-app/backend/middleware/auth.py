from fastapi import Header, HTTPException, status
from config import settings


async def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    """Dependency: reject requests that don't carry the correct API key."""
    if x_api_key != settings.API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key. Pass X-API-Key header.",
        )
