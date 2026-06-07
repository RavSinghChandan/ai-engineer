"""
FastAPI adapter — add the universal agent to any existing FastAPI app in 2 lines.

Usage:
    from universal_agent.adapters.fastapi_adapter import mount_agent
    mount_agent(app)

Your app now has:
    POST /agent/chat          → full response (JSON)
    GET  /agent/stream        → token-by-token SSE stream
    POST /agent/clear         → clear session history
    GET  /agent/health        → per-agent status + lock state
    POST /agent/lock          → lock THIS agent
    POST /agent/unlock        → unlock THIS agent
    GET  /agent/lock          → get THIS agent's lock state
    GET  /agents              → all registered agents + live status
    POST /agents/{id}/lock    → lock a specific agent by ID
    POST /agents/{id}/unlock  → unlock a specific agent by ID
    POST /agents/lock-all     → lock every registered agent
    POST /agents/unlock-all   → unlock every registered agent
"""
import asyncio
import json
import logging
import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Union

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

try:
    from ..core import UniversalAgent, load_config
except ImportError:
    from core import UniversalAgent, load_config  # type: ignore[no-redef]

logger = logging.getLogger(__name__)

# ── Shared state ───────────────────────────────────────────────────────────────
_lock_store: Dict[str, bool] = {}   # agent_id → locked
_agent_instance: Optional[UniversalAgent] = None
_registry_path = Path(__file__).parent.parent / "config" / "agents_registry.json"


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    system_prompt: Optional[str] = None


class ChatResponse(BaseModel):
    session_id: str
    message: str
    agent_name: str


class ClearRequest(BaseModel):
    session_id: str


# ── Registry helpers ───────────────────────────────────────────────────────────

def _load_registry() -> list[Dict[str, Any]]:
    if _registry_path.exists():
        with open(_registry_path) as f:
            return json.load(f)
    return []


def _resolve_agent_id(cfg) -> str:
    """Match this agent's config against the registry to find its canonical ID."""
    registry  = _load_registry()
    cfg_name  = cfg.agent.name.lower()
    cfg_app   = (cfg.context.app_name or "").lower()
    cfg_port  = getattr(cfg.server, "port", None)

    for entry in registry:
        entry_name = entry.get("name", "").lower()
        entry_id   = entry.get("id", "")
        entry_app  = entry.get("app", "").lower()
        entry_port = entry.get("port")

        # Port is the most reliable signal when running each agent on a fixed port
        if cfg_port and entry_port and cfg_port == entry_port:
            return entry_id
        name_match = entry_name == cfg_name or entry_id in cfg_name or cfg_name in entry_name
        app_match  = bool(cfg_app) and (cfg_app in entry_app or entry_id in cfg_app)
        if name_match or app_match:
            return entry_id
    return cfg_name.split()[0]  # fallback: first word of agent name


def _locked_response(agent_name: str, session_id: str) -> ChatResponse:
    return ChatResponse(
        session_id=session_id,
        message=(
            f"🔒 {agent_name} is currently locked. "
            "No LLM calls are being made to preserve API tokens. "
            "Unlock from the Agent Dashboard to resume."
        ),
        agent_name=agent_name,
    )


async def _probe_agent(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch live health data for one registry entry."""
    port = entry.get("port")
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            r = await client.get(f"http://localhost:{port}/agent/health")
            if r.status_code == 200:
                live = r.json()
                return {**entry,
                        "online": True,
                        "locked": live.get("locked", False),
                        "active_sessions": live.get("active_sessions", 0),
                        "tools": live.get("tools", []),
                        "model": live.get("model", "—"),
                        "rag": live.get("rag", False)}
    except Exception:
        pass
    return {**entry, "online": False, "locked": False,
            "active_sessions": 0, "tools": [], "model": "—", "rag": False}


async def _call_remote(port: int, action: str) -> Dict[str, Any]:
    """POST /agent/{lock|unlock} on a remote agent and return its JSON."""
    async with httpx.AsyncClient(timeout=3.0) as client:
        r = await client.post(f"http://localhost:{port}/agent/{action}")
        return r.json()


# ── Route factories (one function per route group) ─────────────────────────────

def _add_chat_routes(app: FastAPI, prefix: str, cfg, my_id: str) -> None:

    @app.post(f"{prefix}/chat", response_model=ChatResponse, tags=["Agent"])  # noqa: S8411
    async def chat(request: ChatRequest):
        sid = request.session_id or str(uuid.uuid4())
        if _lock_store.get(my_id, False):
            return _locked_response(cfg.agent.name, sid)
        response = _agent_instance.chat(sid, request.message, system_prompt=request.system_prompt)
        return ChatResponse(session_id=sid, message=response, agent_name=cfg.agent.name)

    @app.get(f"{prefix}/stream", tags=["Agent"])  # noqa: S8411
    async def stream_chat(message: str, session_id: Optional[str] = None):
        sid = session_id or str(uuid.uuid4())

        async def _gen():
            yield f"data: {json.dumps({'type': 'session', 'session_id': sid})}\n\n"
            if _lock_store.get(my_id, False):
                msg = f"🔒 {cfg.agent.name} is locked. Unlock from the Agent Dashboard to resume."
                yield f"data: {json.dumps({'type': 'token', 'token': msg})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                yield "data: [DONE]\n\n"
                return
            try:
                async for ev, data in _agent_instance.stream(sid, message):
                    if ev == "token":
                        yield f"data: {json.dumps({'type': 'token', 'token': data})}\n\n"
                    elif ev == "error":
                        yield f"data: {json.dumps({'type': 'error', 'message': data})}\n\n"
                        return
                    elif ev == "done":
                        yield f"data: {json.dumps({'type': 'done'})}\n\n"
            except Exception:
                logger.exception("SSE stream error")
                yield f"data: {json.dumps({'type': 'error', 'message': 'Stream failed'})}\n\n"
            finally:
                yield "data: [DONE]\n\n"

        return StreamingResponse(_gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _add_session_routes(app: FastAPI, prefix: str) -> None:

    @app.post(f"{prefix}/clear", tags=["Agent"])  # noqa: S8411
    async def clear_session(request: ClearRequest):
        _agent_instance.clear_session(request.session_id)
        return {"status": "cleared", "session_id": request.session_id}


def _add_health_routes(app: FastAPI, prefix: str, cfg, my_id: str) -> None:

    @app.get(f"{prefix}/health", tags=["Agent"])  # noqa: S8411
    async def health():
        return {
            "status": "ok",
            "id": my_id,
            "agent": cfg.agent.name,
            "app": cfg.context.app_name,
            "model": f"{cfg.llm.provider}/{cfg.llm.model}",
            "tools": [t.name for t in _agent_instance._tools],
            "rag": _agent_instance._retriever is not None,
            "active_sessions": _agent_instance.active_sessions,
            "locked": _lock_store.get(my_id, False),
        }


def _add_lock_routes(app: FastAPI, prefix: str, cfg, my_id: str) -> None:

    @app.post(f"{prefix}/lock", tags=["Agent"])  # noqa: S8411
    async def lock_agent():
        _lock_store[my_id] = True
        logger.warning("Agent '%s' LOCKED.", cfg.agent.name)
        return {"id": my_id, "agent": cfg.agent.name, "locked": True,
                "message": f"{cfg.agent.name} locked. No LLM calls will be made."}

    @app.post(f"{prefix}/unlock", tags=["Agent"])  # noqa: S8411
    async def unlock_agent():
        _lock_store[my_id] = False
        logger.info("Agent '%s' UNLOCKED.", cfg.agent.name)
        return {"id": my_id, "agent": cfg.agent.name, "locked": False,
                "message": f"{cfg.agent.name} unlocked. LLM calls resumed."}

    @app.get(f"{prefix}/lock", tags=["Agent"])  # noqa: S8411
    async def lock_status():
        return {"id": my_id, "agent": cfg.agent.name, "locked": _lock_store.get(my_id, False)}


def _add_registry_routes(app: FastAPI, my_id: str) -> None:

    @app.get("/agents", tags=["Registry"])  # noqa: S8411
    async def list_agents():
        entries = _load_registry()
        results = await asyncio.gather(*[_probe_agent(e) for e in entries])
        online = sum(1 for r in results if r["online"])
        locked = sum(1 for r in results if r["locked"])
        return {"total": len(results), "online": online, "locked": locked, "agents": list(results)}

    @app.post("/agents/lock-all", tags=["Registry"])  # noqa: S8411
    async def lock_all():
        entries = _load_registry()
        results = await asyncio.gather(*[_toggle_one(e, "lock", my_id) for e in entries])
        return {"action": "lock-all", "results": list(results)}

    @app.post("/agents/unlock-all", tags=["Registry"])  # noqa: S8411
    async def unlock_all():
        entries = _load_registry()
        results = await asyncio.gather(*[_toggle_one(e, "unlock", my_id) for e in entries])
        return {"action": "unlock-all", "results": list(results)}

    @app.post("/agents/{agent_id}/lock", tags=["Registry"])  # noqa: S8411
    async def lock_one(agent_id: str):
        return await _toggle_by_id(agent_id, "lock", my_id)

    @app.post("/agents/{agent_id}/unlock", tags=["Registry"])  # noqa: S8411
    async def unlock_one(agent_id: str):
        return await _toggle_by_id(agent_id, "unlock", my_id)


async def _toggle_one(entry: Dict[str, Any], action: str, my_id: str) -> Dict[str, Any]:
    """Lock or unlock one agent — locally if it's us, remotely otherwise."""
    aid   = entry["id"]
    name  = entry["name"]
    port  = entry["port"]
    want  = action == "lock"
    if aid == my_id:
        _lock_store[my_id] = want
        return {"id": aid, "agent": name, "locked": want}
    try:
        return await _call_remote(port, action)
    except Exception:
        return {"id": aid, "agent": name, "locked": not want, "error": "unreachable"}


async def _toggle_by_id(agent_id: str, action: str, my_id: str) -> Dict[str, Any]:
    """Find agent in registry and toggle it."""
    entries = _load_registry()
    entry = next((e for e in entries if e["id"] == agent_id), None)
    if not entry:
        return {"error": f"Agent '{agent_id}' not found in registry"}
    return await _toggle_one(entry, action, my_id)


# ── Public entry point ─────────────────────────────────────────────────────────

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
    my_id = _resolve_agent_id(cfg)
    _lock_store.setdefault(my_id, False)

    origins = cfg.server.cors_origins or ["*"]
    app.add_middleware(CORSMiddleware, allow_origins=origins,
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    _add_chat_routes(app, prefix, cfg, my_id)
    _add_session_routes(app, prefix)
    _add_health_routes(app, prefix, cfg, my_id)
    _add_lock_routes(app, prefix, cfg, my_id)
    _add_registry_routes(app, my_id)

    logger.info("Universal Agent '%s' (id=%s) mounted at '%s'", cfg.agent.name, my_id, prefix)
    return _agent_instance
