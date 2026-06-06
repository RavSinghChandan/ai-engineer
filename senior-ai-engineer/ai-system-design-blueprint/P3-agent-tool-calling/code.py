"""
P3 — AGENT / TOOL CALLING
Golden Memory: Think → Tool → Result → Think → Answer
Stack: FastAPI + AsyncOpenAI (tool_calls) + Pydantic + asyncio
================================================================
HOW TO USE THIS FILE:
  - Each section is labelled. Read top to bottom once.
  - Copy any section directly into your project.
  - To ADD a new tool: Section 3 (schemas) + Section 4 (implementations)
  - To CHANGE max reasoning steps: Section 6 (run_agent max_steps)
  - To ADD safety guardrails: Section 5 (execute_tool_call)
================================================================
"""

import os, json, logging, asyncio
from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI, Depends, HTTPException, Request as Req
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


# ================================================================
# SECTION 1 — REQUEST / RESPONSE MODELS (Pydantic DTOs)
# ================================================================

class AgentRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)

class AgentResponse(BaseModel):
    answer:     str
    tools_used: list[str]
    steps:      int


# ================================================================
# SECTION 2 — TOOL SCHEMAS  (what the LLM reads)
# ================================================================
# This is the JSON Schema list passed to the LLM as tools=[].
# LLM reads name + description + parameters to decide when to call.
# ADD NEW TOOL: copy one block below and update name/description/parameters.

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name":        "get_weather",
            "description": "Get current weather for a city",
            "parameters": {
                "type":       "object",
                "properties": {
                    "city": {"type": "string", "description": "City name, e.g. Mumbai"},
                },
                "required": ["city"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name":        "run_sql_query",
            "description": "Run a read-only SELECT query on the analytics database",
            "parameters": {
                "type":       "object",
                "properties": {
                    "query": {"type": "string", "description": "Valid SELECT SQL statement only"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name":        "send_email",
            "description": "Send an email to a recipient",
            "parameters": {
                "type":       "object",
                "properties": {
                    "to":      {"type": "string", "description": "Recipient email address"},
                    "subject": {"type": "string", "description": "Email subject line"},
                    "body":    {"type": "string", "description": "Email body text"},
                },
                "required": ["to", "subject", "body"],
            },
        },
    },
]


# ================================================================
# SECTION 3 — TOOL IMPLEMENTATIONS  (what actually runs)
# ================================================================
# Each async function corresponds to one TOOL_SCHEMAS entry.
# ADD NEW TOOL: add async function here + entry to TOOL_REGISTRY below.

async def get_weather(city: str) -> str:
    # Real: call OpenWeather / WeatherAPI / etc.
    return json.dumps({"city": city, "temp_c": 32, "condition": "Sunny", "humidity": 70})

async def run_sql_query(query: str) -> str:
    # Safety: only allow SELECT
    if not query.strip().upper().startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries are allowed for security reasons"})
    # Real: run against your database (SQLAlchemy, asyncpg, etc.)
    return json.dumps({"rows": [{"total_users": 1024, "active_today": 87}], "row_count": 1})

async def send_email(to: str, subject: str, body: str) -> str:
    # Real: call SendGrid / SES / SMTP
    logger.info("email to=%s subject=%s", to, subject)
    return json.dumps({"status": "sent", "to": to, "message_id": "msg-abc123"})


# TOOL_REGISTRY maps name → async function
# This is the whitelist — unknown tool names return an error instead of crashing.
TOOL_REGISTRY: dict[str, Callable] = {
    "get_weather":   get_weather,
    "run_sql_query": run_sql_query,
    "send_email":    send_email,
}


# ================================================================
# SECTION 4 — TOOL EXECUTOR
# ================================================================
# Executes one tool call and returns the role="tool" message.
# Handles unknown tool names and execution errors gracefully.

async def execute_tool_call(tool_call) -> dict:
    """
    Execute one tool call and return the result as a role='tool' message.
    The tool_call_id MUST match the id from the LLM response.
    """
    name = tool_call.function.name
    try:
        args = json.loads(tool_call.function.arguments)
    except json.JSONDecodeError:
        args = {}

    if name not in TOOL_REGISTRY:
        result = json.dumps({"error": f"Unknown tool: {name}. Available: {list(TOOL_REGISTRY.keys())}"})
    else:
        try:
            result = await TOOL_REGISTRY[name](**args)
        except TypeError as e:
            result = json.dumps({"error": f"Invalid arguments for {name}: {e}"})
        except Exception as e:
            logger.error("tool %s error: %s", name, e)
            result = json.dumps({"error": str(e)})

    return {
        "role":         "tool",
        "tool_call_id": tool_call.id,   # MUST match request id
        "content":      result,
    }

async def execute_all_tools_parallel(tool_calls: list) -> list[dict]:
    """
    Execute ALL tool calls from one LLM response concurrently.
    asyncio.gather = Java CompletableFuture.allOf() = JS Promise.all()
    """
    return await asyncio.gather(*[execute_tool_call(tc) for tc in tool_calls])


# ================================================================
# SECTION 5 — REACT AGENT LOOP
# ================================================================
# The core loop: Think → Tool → Result → Think → Answer
# Exits when message.tool_calls is None (LLM has final answer).

async def run_agent(
    user_message: str,
    llm:          AsyncOpenAI,
    max_steps:    int = 10,
) -> tuple[str, list[str], int]:
    """
    ReAct loop.
    Returns (final_answer, tools_used_list, step_count)
    """
    messages = [
        {
            "role":    "system",
            "content": (
                "You are a helpful assistant with access to tools. "
                "Use tools to answer accurately. "
                "When you have enough information, give the final answer directly."
            ),
        },
        {"role": "user", "content": user_message},
    ]

    tools_used: list[str] = []

    for step in range(max_steps):

        # ── THINK ────────────────────────────────────────────────────
        response = await llm.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOL_SCHEMAS,
            tool_choice="auto",   # LLM decides: call tool or answer directly
        )
        message = response.choices[0].message
        messages.append(message)   # MUST append before tool results

        # ── EXIT CONDITION: LLM answered directly ────────────────────
        if not message.tool_calls:
            return (message.content or "").strip(), tools_used, step + 1

        # ── ACT: execute tools ────────────────────────────────────────
        for tc in message.tool_calls:
            tools_used.append(tc.function.name)

        tool_results = await execute_all_tools_parallel(message.tool_calls)
        messages.extend(tool_results)

        logger.info("agent step=%d tools=%s", step + 1,
                    [tc.function.name for tc in message.tool_calls])

    # Safety exit — max steps reached
    return "Agent reached maximum steps without completing the task.", tools_used, max_steps


# ================================================================
# SECTION 6 — APP STARTUP
# ================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3, timeout=60.0)
    yield

app = FastAPI(title="Agent App", lifespan=lifespan)


# ================================================================
# SECTION 7 — AUTH
# ================================================================

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2)) -> dict:
    from jose import jwt, JWTError
    try:
        return jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid token")


# ================================================================
# SECTION 8 — MAIN ENDPOINT
# ================================================================

@app.post("/agent", response_model=AgentResponse)
async def agent_endpoint(
    req:     AgentRequest,
    request: Req,
    user:    dict = Depends(get_current_user),
) -> AgentResponse:

    answer, tools_used, steps = await run_agent(
        user_message=req.message,
        llm=request.app.state.llm,
    )

    logger.info("agent user=%s steps=%d tools=%s", user.get("sub"), steps, tools_used)

    return AgentResponse(answer=answer, tools_used=tools_used, steps=steps)


# ================================================================
# SECTION 9 — VARIANTS
# ================================================================

# VARIANT A: ADD A NEW TOOL
# ──────────────────────────
# Step 1: Add to TOOL_SCHEMAS
# {
#     "type": "function",
#     "function": {
#         "name": "search_knowledge_base",
#         "description": "Search internal documents for relevant information",
#         "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
#     },
# }
#
# Step 2: Add implementation
# async def search_knowledge_base(query: str) -> str:
#     results = vector_store.search(await embed_query(query, llm), top_k=3)
#     return json.dumps([{"text": r["text"], "source": r["source"]} for r in results])
#
# Step 3: Register
# TOOL_REGISTRY["search_knowledge_base"] = search_knowledge_base


# VARIANT B: STRUCTURED AGENT RESPONSE
# ──────────────────────────────────────
# class DetailedAgentResponse(BaseModel):
#     answer:      str
#     tools_used:  list[str]
#     steps:       int
#     confidence:  float | None  = None
#     sources:     list[str]     = []
