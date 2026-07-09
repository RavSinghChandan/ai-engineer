"""Structured logging via structlog.

Every log line carries bound context (request_id, job_id, agent) so a
single pipeline run can be traced end-to-end.
"""
import logging
import sys

import structlog

from app.core.config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    level = logging.DEBUG if settings.debug else logging.INFO

    logging.basicConfig(stream=sys.stdout, level=level, format="%(message)s")
    # Quiet noisy third-party loggers
    for noisy in ("httpx", "httpcore", "openai", "uvicorn.access", "aiosqlite", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    renderer = (
        structlog.dev.ConsoleRenderer()
        if settings.environment == "development"
        else structlog.processors.JSONRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
