# P3 — Extensions
### When something new comes to agent/tool calling, add it here. This file is your living changelog.

← [Back to README](./README.md)

---

## How to use this file

When you learn something new that applies to agents:
1. Pick the right section below (or add a new one)
2. Add your entry with: what it is, when to use it, 3–5 lines of code
3. Update `flow.md` if it changes the architecture diagram
4. Update `cheatsheet.md` if it produces a new interview question

---

## SECTION A — New Tools (add to TOOL_SCHEMAS + TOOL_REGISTRY)

### ✅ Weather tool — example in code.py
```python
async def get_weather(city: str) -> str:
    return json.dumps({"city": city, "temp_c": 32, "condition": "Sunny"})
```

### ✅ SQL query tool — example in code.py
```python
async def run_sql_query(query: str) -> str:
    if not query.strip().upper().startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries allowed"})
    # run against real DB here
```

### ➕ Web search tool
```python
async def search_web(query: str) -> str:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": 5},
            headers={"Accept": "application/json", "X-Subscription-Token": os.environ["BRAVE_API_KEY"]},
        )
        results = r.json()["web"]["results"]
        return json.dumps([{"title": r["title"], "url": r["url"], "snippet": r["description"]} for r in results])
```

### ➕ RAG retrieval tool (P2 inside P3)
Turn your vector store into a tool the agent can call:
```python
TOOL_SCHEMAS.append({
    "type": "function",
    "function": {
        "name": "search_knowledge_base",
        "description": "Search the internal knowledge base for relevant information",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
})

async def search_knowledge_base(query: str) -> str:
    results = vector_store.search(await embed_query(query, llm), top_k=3)
    return json.dumps([{"text": r["text"], "source": r["source"]} for r in results])
```

### ➕ Code execution tool
```python
async def run_python(code: str) -> str:
    # SAFETY: only run in a sandbox (Docker, subprocess with timeout, E2B, etc.)
    import subprocess, textwrap
    result = subprocess.run(
        ["python3", "-c", textwrap.dedent(code)],
        capture_output=True, text=True, timeout=10
    )
    return json.dumps({"stdout": result.stdout, "stderr": result.stderr})
```

---

## SECTION B — Agent Orchestration Patterns

### ✅ Single ReAct loop — current default (in code.py)

### ➕ Multi-agent: Orchestrator + Sub-agents
```python
# Orchestrator decides which sub-agent to call
AGENT_TOOLS = [
    {"name": "weather_agent",  "description": "Handles all weather-related queries"},
    {"name": "database_agent", "description": "Handles all SQL queries"},
    {"name": "email_agent",    "description": "Handles sending emails"},
]
# Each sub-agent has its own TOOL_SCHEMAS and ReAct loop
```
**When to use:** complex requests that decompose into independent specialised tasks.

### ➕ LangGraph state machine
For more complex agents where the flow is not a simple loop:
```python
from langgraph.graph import StateGraph

workflow = StateGraph(AgentState)
workflow.add_node("llm", call_model)
workflow.add_node("tools", call_tools)
workflow.add_conditional_edges("llm", should_continue, {"continue": "tools", "end": END})
workflow.add_edge("tools", "llm")
```
**When to use:** agents with branching logic, human-in-the-loop, complex state management.

---

## SECTION C — Safety and Guardrails

### ➕ Tool input validation
```python
from pydantic import BaseModel, Field, validator

class WeatherArgs(BaseModel):
    city: str = Field(min_length=1, max_length=100)

    @validator("city")
    def no_injection(cls, v):
        if any(c in v for c in [";", "--", "DROP", "SELECT"]):
            raise ValueError("Invalid city name")
        return v
```

### ➕ Tool call rate limiting
```python
# Prevent agent from calling the same tool too many times
tool_call_counts: dict[str, int] = {}
MAX_CALLS_PER_TOOL = 3

if tool_call_counts.get(name, 0) >= MAX_CALLS_PER_TOOL:
    return json.dumps({"error": f"Tool {name} has been called too many times"})
tool_call_counts[name] = tool_call_counts.get(name, 0) + 1
```

---

## SECTION D — Future patterns that grow out of P3

| What you add to P3 | It becomes |
|---|---|
| + Remember past tool calls per user | → P4 (agent with memory) |
| + Stream agent's thinking step by step | → P5 (streaming agent) |
| + Tool that searches a vector DB | → P3 + P2 (RAG as a tool) |
| + Multiple agents collaborating | → Multi-agent system (LangGraph etc.) |

---

← [Back to README](./README.md) | [→ Cheatsheet](./cheatsheet.md)
