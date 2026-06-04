"""
Standalone REST server — run this when you want the agent as an independent microservice.

Usage:
    python -m universal_agent.api.main
    # or
    uvicorn universal_agent.api.main:app --host 0.0.0.0 --port 8000

Then point any frontend at http://localhost:8000/agent/chat
"""
import logging
import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

# Allow running from repo root or as a standalone package
_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(_root))
sys.path.insert(0, str(_root / "universal-agent"))

try:
    from universal_agent.adapters.fastapi_adapter import mount_agent
    from universal_agent.core import load_config
except ImportError:
    from adapters.fastapi_adapter import mount_agent  # type: ignore[no-redef]
    from core import load_config  # type: ignore[no-redef]

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Universal Agent API",
    description="Plug-and-play AI agent. Configure via agent.config.yaml.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

cfg = load_config()
agent = mount_agent(app, prefix="/agent")

# Serve the JS SDK so any page can reference it as /sdk/universal-agent.js
_sdk_dir = Path(__file__).parent.parent / "sdk"
if _sdk_dir.exists():
    app.mount("/sdk", StaticFiles(directory=str(_sdk_dir)), name="sdk")


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root():
    """Serve the built-in demo chat UI."""
    html_file = Path(__file__).parent.parent / "adapters" / "widget" / "demo.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text())
    return HTMLResponse(
        content="<h2>Universal Agent is running.</h2>"
        "<p>POST to <code>/agent/chat</code> or visit <a href='/docs'>/docs</a></p>"
    )


@app.get("/agents-dashboard", response_class=HTMLResponse, include_in_schema=False)
async def agents_dashboard():
    """Serve the Agent Control Dashboard."""
    html_file = Path(__file__).parent.parent / "adapters" / "widget" / "agents.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text())
    return HTMLResponse(content="<h2>Dashboard not found.</h2>")


if __name__ == "__main__":
    dev_mode = os.environ.get("DEV", "").lower() in ("1", "true", "yes")
    uvicorn.run(
        "api.main:app",
        host=cfg.server.host,
        port=cfg.server.port,
        reload=dev_mode,
        reload_dirs=[str(Path(__file__).parent.parent)] if dev_mode else None,
        log_level=cfg.logging.level.lower(),
    )
