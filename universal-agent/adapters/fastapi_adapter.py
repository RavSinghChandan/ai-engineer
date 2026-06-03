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
    POST /agent/lock      → lock all agents (block all LLM calls, save tokens)
    POST /agent/unlock    → unlock agents
    GET  /agent/lock      → get current lock state
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
_agent_locked: bool = False  # global lock state — blocks all LLM calls when True


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
        global _agent_locked
        if _agent_locked:
            return ChatResponse(
                session_id=request.session_id or str(uuid.uuid4()),
                message="🔒 Agent is currently locked. No LLM calls are being made to preserve API tokens. Unlock from the control panel to resume.",
                agent_name=cfg.agent.name,
            )
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
        global _agent_locked
        sid = session_id or str(uuid.uuid4())

        async def event_generator():
            yield f"data: {json.dumps({'type': 'session', 'session_id': sid})}\n\n"
            if _agent_locked:
                yield f"data: {json.dumps({'type': 'token', 'token': '🔒 Agent is locked. Unlock from the control panel to resume.'})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                yield "data: [DONE]\n\n"
                return
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
                "X-Accel-Buffering": "no",
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
            "locked": _agent_locked,
        }

    # ── POST /agent/lock ───────────────────────────────────────────────────────
    @app.post(f"{prefix}/lock", tags=["Agent"])  # noqa: S8411
    async def lock_agent():
        """Lock all agents — blocks every LLM call to preserve API tokens."""
        global _agent_locked
        _agent_locked = True
        logger.warning("Universal Agent LOCKED — all LLM calls blocked.")
        return {"locked": True, "message": "Agent locked. No LLM calls will be made."}

    # ── POST /agent/unlock ─────────────────────────────────────────────────────
    @app.post(f"{prefix}/unlock", tags=["Agent"])  # noqa: S8411
    async def unlock_agent():
        """Unlock agents — resumes normal LLM operation."""
        global _agent_locked
        _agent_locked = False
        logger.info("Universal Agent UNLOCKED — LLM calls resumed.")
        return {"locked": False, "message": "Agent unlocked. LLM calls resumed."}

    # ── GET /agent/lock ────────────────────────────────────────────────────────
    @app.get(f"{prefix}/lock", tags=["Agent"])  # noqa: S8411
    async def lock_status():
        """Get current lock state."""
        return {"locked": _agent_locked}

    logger.info(f"Universal Agent '{cfg.agent.name}' mounted at '{prefix}'")
    return _agent_instance
