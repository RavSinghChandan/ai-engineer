"""
Bench Resource Optimizer — MCP Server
======================================
Exposes bench platform operations as MCP tools so any MCP-compatible client
(Claude Desktop, Cursor, Windsurf, etc.) can query the bench directly.

Tools exposed:
  1. parse_cv            — Extract structured profile from raw CV/resume text
  2. map_role            — Find skill gaps between a candidate and a target role
  3. generate_plan       — Build a personalised upskilling roadmap
  4. get_readiness       — Return current readiness score for a user + role
  5. search_candidates   — List bench candidates filtered by skill or role

Transport: stdio  (standard MCP transport — works with Claude Desktop out of the box)

Usage:
  python mcp_server.py                        # standalone stdio server
  python mcp_server.py --backend http://localhost:8000   # custom backend URL

Claude Desktop config  (~/.config/claude/claude_desktop_config.json):
  {
    "mcpServers": {
      "bench-resource-optimizer": {
        "command": "python",
        "args": ["/path/to/bench-resource-optimizer/backend/mcp_server.py"],
        "env": {
          "BENCH_BACKEND_URL": "http://localhost:8000",
          "BENCH_API_TOKEN": "<jwt-token>"
        }
      }
    }
  }
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from typing import Any

import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

logging.basicConfig(level=logging.WARNING, stream=sys.stderr)
logger = logging.getLogger("bench.mcp")

# ── Config ────────────────────────────────────────────────────────────────────
BACKEND_URL = os.getenv("BENCH_BACKEND_URL", "http://localhost:8000")
API_TOKEN = os.getenv("BENCH_API_TOKEN", "")

server = Server("bench-resource-optimizer")


def _headers() -> dict[str, str]:
    h = {"Content-Type": "application/json"}
    if API_TOKEN:
        h["Authorization"] = f"Bearer {API_TOKEN}"
    return h


async def _post(path: str, payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(f"{BACKEND_URL}{path}", json=payload, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def _get(path: str, params: dict | None = None) -> Any:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{BACKEND_URL}{path}", params=params, headers=_headers())
        resp.raise_for_status()
        return resp.json()


# ── Tool definitions ──────────────────────────────────────────────────────────
TOOLS: list[Tool] = [
    Tool(
        name="parse_cv",
        description=(
            "Parse raw CV or resume text and return a structured JSON profile with "
            "name, skills, years of experience, education, and certifications. "
            "Use this before map_role or generate_plan."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "resume_text": {
                    "type": "string",
                    "description": "Full plain-text content of the candidate's CV or resume.",
                }
            },
            "required": ["resume_text"],
        },
    ),
    Tool(
        name="map_role",
        description=(
            "Compare a candidate's skill profile against a target role and return "
            "matched skills, skill gaps, and a readiness percentage. "
            "Requires the parsed profile from parse_cv."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "profile": {
                    "type": "object",
                    "description": "Structured candidate profile returned by parse_cv.",
                },
                "role": {
                    "type": "string",
                    "description": "Target role name, e.g. 'Python Backend Engineer', 'ML Engineer'.",
                },
            },
            "required": ["profile", "role"],
        },
    ),
    Tool(
        name="generate_plan",
        description=(
            "Generate a personalised day-by-day upskilling roadmap to close the "
            "skill gaps for a given role. Returns tasks with internal resource links."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "role": {
                    "type": "string",
                    "description": "Target role, e.g. 'ML Engineer'.",
                },
                "skill_gaps": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of missing skills returned by map_role.",
                },
                "num_days": {
                    "type": "integer",
                    "description": "Plan length in days (default: 7).",
                    "default": 7,
                },
            },
            "required": ["role", "skill_gaps"],
        },
    ),
    Tool(
        name="get_readiness",
        description=(
            "Return the current readiness score (0–100) for a specific user and role, "
            "along with completed tasks and remaining tasks from their plan."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "user_id": {
                    "type": "string",
                    "description": "User ID of the bench candidate.",
                },
                "role": {
                    "type": "string",
                    "description": "Role to check readiness for.",
                },
            },
            "required": ["user_id", "role"],
        },
    ),
    Tool(
        name="search_candidates",
        description=(
            "Search bench candidates by skill keyword or target role. "
            "Returns a list of matching candidates with their profiles and readiness scores."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "skill": {
                    "type": "string",
                    "description": "Skill keyword to filter by, e.g. 'Python', 'LangChain'.",
                },
                "role": {
                    "type": "string",
                    "description": "Target role to filter by.",
                },
                "min_readiness": {
                    "type": "integer",
                    "description": "Minimum readiness score (0–100). Default: 0.",
                    "default": 0,
                },
            },
        },
    ),
]


# ── Tool handlers ─────────────────────────────────────────────────────────────
@server.list_tools()
async def list_tools() -> list[Tool]:
    return TOOLS


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    try:
        result = await _dispatch(name, arguments)
        return [TextContent(type="text", text=json.dumps(result, indent=2))]
    except httpx.HTTPStatusError as e:
        error = {"error": f"Backend returned {e.response.status_code}", "detail": e.response.text}
        return [TextContent(type="text", text=json.dumps(error, indent=2))]
    except httpx.ConnectError:
        error = {"error": f"Cannot reach bench backend at {BACKEND_URL}. Is it running?"}
        return [TextContent(type="text", text=json.dumps(error, indent=2))]
    except Exception as e:
        error = {"error": type(e).__name__, "detail": str(e)}
        return [TextContent(type="text", text=json.dumps(error, indent=2))]


async def _dispatch(name: str, args: dict) -> Any:
    if name == "parse_cv":
        return await _post("/parse-cv", {"resume_text": args["resume_text"]})

    if name == "map_role":
        return await _post(
            "/map-role",
            {"profile": args["profile"], "role": args["role"]},
        )

    if name == "generate_plan":
        return await _post(
            "/generate-plan",
            {
                "role": args["role"],
                "skill_gaps": args["skill_gaps"],
                "num_days": args.get("num_days", 7),
            },
        )

    if name == "get_readiness":
        return await _get(
            f"/readiness/{args['user_id']}",
            params={"role": args["role"]},
        )

    if name == "search_candidates":
        params: dict[str, Any] = {}
        if args.get("skill"):
            params["skill"] = args["skill"]
        if args.get("role"):
            params["role"] = args["role"]
        if args.get("min_readiness", 0) > 0:
            params["min_readiness"] = args["min_readiness"]
        return await _get("/candidates", params=params)

    raise ValueError(f"Unknown tool: {name}")


# ── Entry point ───────────────────────────────────────────────────────────────
async def main() -> None:
    async with stdio_server() as streams:
        await server.run(streams[0], streams[1], server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
