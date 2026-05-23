"""
Structured JSON Logging (Phase 4)
===================================
Configures structlog for JSON-formatted, context-rich log output.
Replaces bare print() / Python stdlib logging with a structured logger
that Grafana Loki, Datadog, and CloudWatch can parse.

Usage:
  from utils.logging_config import get_logger
  log = get_logger(__name__)

  log.info("pipeline_started", session_id=sid, intent=intent)
  log.warning("cache_miss", key=cache_key)
  log.error("agent_failed", agent="meta_agent", exc_info=True)

Output (JSON, one line per event):
  {"event": "pipeline_started", "session_id": "abc123", "intent": "career",
   "logger": "agents.meta_agent", "level": "info", "timestamp": "2026-05-23T10:00:00Z"}

Environment:
  LOG_LEVEL  — debug / info / warning / error (default: info)
  LOG_FORMAT — json / console (default: json)
               Set LOG_FORMAT=console for coloured human-readable output in local dev.
"""
from __future__ import annotations
import logging
import os
import sys

try:
    import structlog
    _STRUCTLOG_AVAILABLE = True
except ImportError:
    _STRUCTLOG_AVAILABLE = False

_LOG_LEVEL  = os.getenv("LOG_LEVEL",  "info").upper()
_LOG_FORMAT = os.getenv("LOG_FORMAT", "json").lower()

_configured = False


def _configure() -> None:
    global _configured
    if _configured:
        return
    _configured = True

    # Configure stdlib root logger (captures uvicorn, fastapi, etc.)
    logging.basicConfig(
        stream=sys.stdout,
        level=getattr(logging, _LOG_LEVEL, logging.INFO),
        format="%(message)s",
    )
    # Silence noisy third-party loggers
    for noisy in ("uvicorn.access", "httpx", "httpcore", "faiss"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    if not _STRUCTLOG_AVAILABLE:
        return

    processors_shared = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if _LOG_FORMAT == "console":
        processors_shared.append(structlog.dev.ConsoleRenderer())
    else:
        processors_shared.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors_shared,
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, _LOG_LEVEL, logging.INFO)
        ),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = "astrointel"):
    """
    Return a structured logger. Falls back to stdlib logging when structlog
    is not installed (keeps the app functional without the dependency).
    """
    _configure()
    if _STRUCTLOG_AVAILABLE:
        return structlog.get_logger(name)
    return logging.getLogger(name)
