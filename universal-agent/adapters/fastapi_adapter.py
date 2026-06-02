"""
FastAPI adapter — add the universal agent to any existing FastAPI app in 2 lines.

Usage:
    from universal_agent.adapters.fastapi_adapter import mount_agent
    mount_agent(app)

Your app now has:
    POST /agent/chat      → full response (JSON)
    GET  /agent/stream    → token-by-token SSE stream
    POST /agent/clear     → clear session history
    GET  /agent/health    → status check
"""
import json
import logging
import uuid
from pathlib import Path
from typing import Optional, Union

from fastapi import FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

try:
    from ..core import UniversalAgent, load_config
except ImportError:
    from core import UniversalAgent, load_config  # type: ignore[no-redef]

logger = logging.getLogger(__name__)

_agent_instance: Optional[UniversalAgent] = None


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    session_id: str
    message: str
    agent_name: str


class ClearRequest(BaseModel):
    session_id: str


def mount_agent(
    app: FastAPI,
    config_path: Optional[Union[str, Path]] = None,
    prefix: str = "/agent",
) -> UniversalAgent:
    """
    Mount universal agent routes onto any existing FastAPI application.
    Returns the UniversalAgent instance.
    """
    global _agent_instance

    cfg = load_config(config_path)
    _agent_instance = UniversalAgent(cfg)

    # CORS — allow Angular dev server + any configured origins
    origins = cfg.server.cors_origins or ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── POST /agent/chat — full blocking response ──────────────────────────────
    @app.post(f"{prefix}/chat", response_model=ChatResponse, tags=["Agent"])  # noqa: S8411
    async def chat(request: ChatRequest):
        session_id = request.session_id or str(uuid.uuid4())
        response = _agent_instance.chat(session_id, request.message)
        return ChatResponse(
            session_id=session_id,
            message=response,
            agent_name=cfg.agent.name,
        )

    # ── GET /agent/stream — SSE streaming response ─────────────────────────────
    @app.get(f"{prefix}/stream", tags=["Agent"])  # noqa: S8411
    async def stream_chat(
        message: str,
        session_id: Optional[str] = None,
    ):
        """
        Stream agent response as Server-Sent Events.
        Frontend subscribes with EventSource or fetch+ReadableStream.

        Event format:
            data: {"type": "session",  "session_id": "..."}
            data: {"type": "token",    "token": "Hello"}
            data: {"type": "token",    "token": " there"}
            data: {"type": "done"}
            data: [DONE]
        """
        sid = session_id or str(uuid.uuid4())

        async def event_generator():
            # Send session_id first so client can save it
            yield f"data: {json.dumps({'type': 'session', 'session_id': sid})}\n\n"
            try:
                async for event_type, data in _agent_instance.stream(sid, message):
                    if event_type == "token":
                        yield f"data: {json.dumps({'type': 'token', 'token': data})}\n\n"
                    elif event_type == "error":
                        yield f"data: {json.dumps({'type': 'error', 'message': data})}\n\n"
                        return
                    elif event_type == "done":
                        yield f"data: {json.dumps({'type': 'done'})}\n\n"
            except Exception:
                logger.exception("SSE stream error")
                yield f"data: {json.dumps({'type': 'error', 'message': 'Stream failed'})}\n\n"
            finally:
                yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",   # disable nginx buffering
            },
        )

    # ── POST /agent/clear ──────────────────────────────────────────────────────
    @app.post(f"{prefix}/clear", tags=["Agent"])  # noqa: S8411
    async def clear_session(request: ClearRequest):
        _agent_instance.clear_session(request.session_id)
        return {"status": "cleared", "session_id": request.session_id}

    # ── GET /agent/health ──────────────────────────────────────────────────────
    @app.get(f"{prefix}/health", tags=["Agent"])  # noqa: S8411
    async def health():
        return {
            "status": "ok",
            "agent": cfg.agent.name,
            "model": f"{cfg.llm.provider}/{cfg.llm.model}",
            "tools": [t.name for t in _agent_instance._tools],
            "rag": _agent_instance._retriever is not None,
            "active_sessions": _agent_instance.active_sessions,
        }

    logger.info(f"Universal Agent '{cfg.agent.name}' mounted at '{prefix}'")
    return _agent_instance
