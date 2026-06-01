"""
FastAPI adapter — add the universal agent to any existing FastAPI app in 3 lines.

Usage in your existing FastAPI app:
    from universal_agent.adapters.fastapi_adapter import mount_agent
    mount_agent(app, config_path="./config/agent.config.yaml")

That's it. Your app now has /agent/chat, /agent/clear, /agent/health endpoints.
"""
import logging
import uuid
from pathlib import Path
from typing import Optional, Union

from fastapi import FastAPI, Request
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
    session_id: Optional[str] = None  # Auto-generated if not provided


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

    Args:
        app: Your existing FastAPI instance
        config_path: Path to agent.config.yaml. Defaults to auto-discovery.
        prefix: URL prefix for agent endpoints (default: /agent)

    Returns:
        The UniversalAgent instance (in case you need direct access)
    """
    global _agent_instance

    cfg = load_config(config_path)
    _agent_instance = UniversalAgent(cfg)

    # Add CORS if not already configured
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.server.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post(f"{prefix}/chat", response_model=ChatResponse, tags=["Agent"])
    async def chat(request: ChatRequest):
        """Send a message to the AI agent and receive a response."""
        session_id = request.session_id or str(uuid.uuid4())
        response = _agent_instance.chat(session_id, request.message)
        return ChatResponse(
            session_id=session_id,
            message=response,
            agent_name=cfg.agent.name,
        )

    @app.post(f"{prefix}/clear", tags=["Agent"])
    async def clear_session(request: ClearRequest):
        """Clear conversation history for a session."""
        _agent_instance.clear_session(request.session_id)
        return {"status": "cleared", "session_id": request.session_id}

    @app.get(f"{prefix}/health", tags=["Agent"])
    async def health():
        """Health check — returns agent status and config summary."""
        return {
            "status": "ok",
            "agent": cfg.agent.name,
            "model": f"{cfg.llm.provider}/{cfg.llm.model}",
            "tools": [t.name for t in _agent_instance._tools],
            "rag": _agent_instance._retriever is not None,
            "active_sessions": _agent_instance.active_sessions,
        }

    logger.info(f"Universal Agent mounted at '{prefix}' on FastAPI app")
    return _agent_instance
