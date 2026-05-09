"""
GET /api/v1/metrics — Live pipeline metrics dashboard
"""
from __future__ import annotations
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from metrics import get_collector

router = APIRouter(prefix="/api/v1/metrics", tags=["Metrics"])


@router.get("")
async def get_metrics() -> JSONResponse:
    """Return live production metrics dashboard for the AstroIntel pipeline."""
    return JSONResponse(content=get_collector().dashboard())
