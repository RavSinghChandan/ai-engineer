# Architecture 3 — Agent / Tool Calling
## Golden Memory: `Think → Tool → Result → Think → Answer`

**Use for:** booking assistant · SQL agent · API agent · automation assistant · tool-using copilots

---

## Architecture Flow

```
User Request
   ↓
Frontend
   ↓
FastAPI Endpoint (/agent)
   ↓
DTO Validation
   ↓
Authentication
   ↓
Load Available Tools Metadata
   ├── weather API
   ├── SQL executor
   ├── calculator
   ├── email sender
   └── internal services
   ↓
Prompt Builder
   ├── system instructions
   ├── tool schemas
   └── user request
   ↓
LLM Reasoning Phase
   ↓
Decision: Need Tool?
   ↓
YES
   ↓
Tool Selection
   ↓
Argument Generation (JSON schema)
   ↓
Tool Executor Layer
   ↓
External/Internal Tool Call
   ↓
Tool Result
   ↓
Return Tool Result to LLM
   ↓
Second Reasoning Phase
   ↓
Need Another Tool?
   ↓
YES → loop again
NO
   ↓
Final Response Generation
   ↓
Response JSON
```

---

## Production Code

```python
# ============================================================
# AGENT / TOOL CALLING — COMPLETE PRODUCTION CODE
# Stack: FastAPI + OpenAI SDK (tool_calls) + Pydantic
# Pattern: Think → Tool → Result → Think → Answer
# ============================================================

import os, json, logging, asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Request as Req
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
from typing import Callable

logger = logging.getLogger(__name__)

# ── 1. MODELS ─────────────────────────────────────────────────

class AgentRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)

class AgentResponse(BaseModel):
    answer: str
    tools_used: list[str]
    steps: int

# ── 2. TOOL DEFINITIONS ──────────────────────────────────────
# Each tool has:
#   a) a JSON Schema (tells the LLM what it does + what args it takes)
#   b) a Python function (the actual implementation)

# ---- Tool Schemas (what LLM sees) ----

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current weather for a city",
            "parameters": {
                "type": "object",
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
            "name": "run_sql_query",
            "description": "Run a read-only SQL query on the analytics database",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Valid SELECT SQL statement"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_email",
            "description": "Send an email to a user",
            "parameters": {
                "type": "object",
                "properties": {
                    "to":      {"type": "string"},
                    "subject": {"type": "string"},
                    "body":    {"type": "string"},
                },
                "required": ["to", "subject", "body"],
            },
        },
    },
]

# ---- Tool Implementations (what actually runs) ----

async def get_weather(city: str) -> str:
    # Real: call weather API
    return json.dumps({"city": city, "temp_c": 32, "condition": "Sunny"})

async def run_sql_query(query: str) -> str:
    # Real: validate query is SELECT only, then run against DB
    if not query.strip().upper().startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries allowed"})
    return json.dumps({"rows": [{"count": 42}]})   # mock result

async def send_email(to: str, subject: str, body: str) -> str:
    # Real: call email service (SendGrid, SES, etc.)
    logger.info("Sending email to %s: %s", to, subject)
    return json.dumps({"status": "sent", "to": to})

# Tool registry — maps name → async function
TOOL_REGISTRY: dict[str, Callable] = {
    "get_weather":   get_weather,
    "run_sql_query": run_sql_query,
    "send_email":    send_email,
}

# ── 3. TOOL EXECUTOR ─────────────────────────────────────────

async def execute_tool_call(tool_call) -> dict:
    """Execute one tool call and return the result message."""
    name = tool_call.function.name
    args = json.loads(tool_call.function.arguments)

    if name not in TOOL_REGISTRY:
        result = json.dumps({"error": f"Unknown tool: {name}"})
    else:
        try:
            result = await TOOL_REGISTRY[name](**args)
        except Exception as e:
            result = json.dumps({"error": str(e)})

    return {
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": result,
    }

async def execute_all_tools_parallel(tool_calls: list) -> list[dict]:
    """Execute multiple tool calls concurrently — Java: CompletableFuture.allOf()"""
    return await asyncio.gather(*[execute_tool_call(tc) for tc in tool_calls])

# ── 4. REACT AGENT LOOP ───────────────────────────────────────

async def run_agent(
    user_message: str,
    llm: AsyncOpenAI,
    max_steps: int = 10,
) -> tuple[str, list[str], int]:
    """
    ReAct loop: Think → Tool → Result → Think → Answer
    Returns (final_answer, tools_used, step_count)
    """
    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant with access to tools. "
                "Use tools to answer accurately. "
                "When you have enough information, give the final answer directly."
            ),
        },
        {"role": "user", "content": user_message},
    ]

    tools_used = []

    for step in range(max_steps):

        # ── THINK ─────────────────────────────────────────────
        response = await llm.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOL_SCHEMAS,
            tool_choice="auto",   # LLM decides: call tool or answer directly
        )
        message = response.choices[0].message
        messages.append(message)

        # ── DONE — LLM answered directly ──────────────────────
        if not message.tool_calls:
            return message.content.strip(), tools_used, step + 1

        # ── ACT — execute tools ───────────────────────────────
        for tc in message.tool_calls:
            tools_used.append(tc.function.name)

        tool_results = await execute_all_tools_parallel(message.tool_calls)
        messages.extend(tool_results)

        logger.info("agent step=%d tools=%s", step + 1,
                    [tc.function.name for tc in message.tool_calls])

    return "Agent reached maximum steps without completing.", tools_used, max_steps

# ── 5. STARTUP ────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3)
    yield

app = FastAPI(title="Agent App", lifespan=lifespan)

# ── 6. AUTH ───────────────────────────────────────────────────

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2)) -> dict:
    from jose import jwt, JWTError
    try:
        return jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid token")

# ── 7. ENDPOINT ───────────────────────────────────────────────

@app.post("/agent", response_model=AgentResponse)
async def agent_endpoint(
    req: AgentRequest,
    request: Req,
    user: dict = Depends(get_current_user),
) -> AgentResponse:

    answer, tools_used, steps = await run_agent(
        user_message=req.message,
        llm=request.app.state.llm,
    )

    logger.info("agent user=%s steps=%d tools=%s", user.get("sub"), steps, tools_used)

    return AgentResponse(answer=answer, tools_used=tools_used, steps=steps)


# ── INTERVIEW CHEAT SHEET ─────────────────────────────────────
# Q: "Walk me through an agent / tool calling system."
#
# A: "Every tool has two parts: a JSON Schema (the LLM reads this to
#    know the tool's name, description, and argument types) and a Python
#    function (what actually runs). Both live in a TOOL_REGISTRY dict.
#
#    The ReAct loop: build the messages list with system prompt + user query,
#    call the LLM with tools=[...] and tool_choice='auto'.
#    If the response has tool_calls, extract name + arguments,
#    execute the function, append the result as role='tool' message,
#    and call the LLM again — it now reasons with the tool result.
#    Loop until message.tool_calls is None — that means the LLM is done.
#
#    Two safety rails: max_steps to prevent infinite loops,
#    and TOOL_REGISTRY guard so unknown tool names return an error
#    instead of crashing.
#
#    For multiple tools in one response: asyncio.gather() runs them
#    all concurrently — same as Java CompletableFuture.allOf()."
```
