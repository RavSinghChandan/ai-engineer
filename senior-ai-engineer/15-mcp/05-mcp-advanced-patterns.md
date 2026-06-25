# Senior AI Engineer — Module 15
# Topic: MCP Advanced Patterns — Sampling, Roots, Streaming, Multi-Server Orchestration

---

## 1. Intuition

Most engineers stop at tools. Senior engineers use the full MCP feature set:
- **Sampling** — the server asks the LLM to generate something (server-initiated LLM call)
- **Roots** — the server tells the client which file system paths it should be allowed to access
- **Progress notifications** — streaming updates for long-running tools
- **Multi-server composition** — building orchestrators that aggregate many MCP servers

These patterns separate a shallow MCP integration from a production-grade one.

---

## 2. Sampling — Server-Initiated LLM Calls

Most tools work one way: client → server. Sampling reverses this: the server asks the client to run an LLM call.

**When to use it:** Your MCP server needs to summarise, classify, or reason about data before returning it to the LLM. Instead of calling an LLM inside the server (coupling the server to a specific model), you ask the host to do it — the host already has the LLM configured.

```python
# Server-side: request a sampling from the host LLM
from mcp.types import CreateMessageRequestParams, TextContent

@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "analyse_bench_risk":
        # Fetch raw data
        employees = await _get_all_bench_data()
        raw_text = _format_employees(employees)

        # Ask the host LLM to summarise it — sampling
        response = await app.request_context.session.create_message(
            CreateMessageRequestParams(
                messages=[
                    {"role": "user", "content": {
                        "type": "text",
                        "text": f"Analyse this bench data and identify the top 3 risks:\n\n{raw_text}"
                    }}
                ],
                max_tokens=500,
                system="You are a resource planning expert. Be concise and specific.",
            )
        )

        summary = response.content.text if hasattr(response.content, "text") else str(response.content)
        return [TextContent(type="text", text=summary)]
```

**Senior interview point:** "Sampling lets the server leverage the host's LLM without knowing which model it is. The server stays model-agnostic. This is how you build MCP servers that work with any model — Claude, GPT-4o, Gemini — without changing the server code."

---

## 3. Roots — File System Scoping

Roots tell the MCP server which file paths the host has granted access to.
Without roots, a filesystem tool could read anywhere the process has OS access.
With roots, the server respects the host-declared boundaries.

```python
@app.list_roots()
async def list_roots():
    # Server declares which roots it wants access to
    return [
        {"uri": "file:///Users/me/projects/bench-optimizer", "name": "Bench Optimizer Project"},
        {"uri": "file:///Users/me/Documents/runbooks", "name": "Runbook PDFs"},
    ]

# Client-side: the host approves or restricts the declared roots
# The server should respect roots when building file access tools
@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "read_runbook_file":
        path = arguments["path"]
        # Validate path is within approved roots
        approved_roots = [r["uri"].removeprefix("file://") for r in await app.list_roots()]
        if not any(path.startswith(root) for root in approved_roots):
            return [TextContent(type="text", text="ACCESS_DENIED: Path is outside approved roots.")]
        content = open(path).read()
        return [TextContent(type="text", text=content)]
```

---

## 4. Progress Notifications — Long-Running Tools

Some tools take time (PDF ingestion, plan generation, data migration). Use progress notifications to keep the host informed.

```python
from mcp.types import ProgressNotification

@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "ingest_runbook_pdf":
        path = arguments["pdf_path"]

        # Notify: starting
        await app.request_context.session.send_progress_notification(
            ProgressNotification(progress=0, total=100, progressToken="ingest")
        )

        # Step 1: extract text (30%)
        text = extract_text_from_pdf(path)
        await app.request_context.session.send_progress_notification(
            ProgressNotification(progress=30, total=100, progressToken="ingest")
        )

        # Step 2: LLM extraction (70%)
        structured = await llm_extract_runbook(text)
        await app.request_context.session.send_progress_notification(
            ProgressNotification(progress=70, total=100, progressToken="ingest")
        )

        # Step 3: save to DB (100%)
        runbook_id = await save_to_db(structured)
        await app.request_context.session.send_progress_notification(
            ProgressNotification(progress=100, total=100, progressToken="ingest")
        )

        return [TextContent(type="text", text=f"Runbook ingested. ID: {runbook_id}")]
```

The host UI shows a progress bar (Claude Desktop, Cursor support this). For custom clients, you subscribe to progress events.

---

## 5. FastMCP — Higher-Level API

The raw MCP SDK is verbose. `FastMCP` (now the recommended approach) uses decorators, like FastAPI.

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    name="bench-optimizer",
    version="1.0.0",
    description="Resource optimisation tools for bench management",
)

@mcp.tool()
async def get_bench_employees(skill_filter: str = "", max_days: int = 90) -> str:
    """
    List employees on bench. Optionally filter by skill or days on bench.
    Returns a JSON list of {id, name, skills, days_on_bench}.
    """
    employees = await _fetch_bench(skill_filter, max_days)
    return json.dumps(employees)

@mcp.resource("bench://roles/{role_id}")
async def get_role(role_id: str) -> str:
    """Return role requirements for the given role ID."""
    role = await _fetch_role(role_id)
    return json.dumps(role)

@mcp.prompt()
def bench_triage_prompt(team: str, urgency: str = "medium") -> str:
    """Generate a bench triage prompt for the given team."""
    return (
        f"Analyse bench utilisation for team: {team}. Urgency: {urgency}. "
        "Use get_bench_employees to get current data. "
        "Recommend training plans and identify assignable projects."
    )

# Run as stdio server
if __name__ == "__main__":
    mcp.run(transport="stdio")

# Or run as HTTP server
# mcp.run(transport="sse", host="0.0.0.0", port=8080)
```

FastMCP auto-generates tool schemas from Python type hints and docstrings. The function signature IS the schema.

---

## 6. MCP Gateway — Aggregating Multiple Servers

In enterprise deployments, you run a gateway server that proxies requests to specialised backends.

```
Client (Claude Desktop / your app)
    ↓
MCP Gateway Server
    ├── → Bench Optimizer Server    (employee tools)
    ├── → RunbookAI Server         (incident runbook tools)
    ├── → HR System Server         (org chart, policies)
    └── → Calendar Server         (project schedules)
```

```python
# Gateway pattern: one server that delegates to multiple backends
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.server.fastmcp import FastMCP

gateway = FastMCP("enterprise-gateway")

# Registry: tool prefix → server command
BACKENDS = {
    "bench":    ["python", "bench_server.py"],
    "runbook":  ["python", "runbook_server.py"],
    "hr":       ["python", "hr_server.py"],
}

_sessions: dict[str, ClientSession] = {}

async def _get_session(prefix: str) -> ClientSession:
    if prefix not in _sessions:
        params = StdioServerParameters(command=BACKENDS[prefix][0], args=BACKENDS[prefix][1:])
        # Note: in production, manage lifecycle properly with async context managers
        _sessions[prefix] = await _connect(params)
    return _sessions[prefix]

@gateway.tool()
async def proxy_tool(tool_name: str, arguments: dict) -> str:
    """Route tool_name (format: prefix__actual_name) to the correct backend."""
    if "__" not in tool_name:
        return "ERROR: tool_name must be in format prefix__tool"
    prefix, actual = tool_name.split("__", 1)
    session = await _get_session(prefix)
    result = await session.call_tool(actual, arguments)
    return result.content[0].text if result.content else ""
```

---

## 7. Composing MCP with LangGraph

```python
from langgraph.graph import StateGraph
from typing import TypedDict

class AgentState(TypedDict):
    query: str
    tool_results: list[dict]
    final_answer: str

async def bench_node(state: AgentState, session: ClientSession) -> AgentState:
    """LangGraph node that uses MCP tools for bench data."""
    result = await session.call_tool("get_bench_employees", {})
    return {**state, "tool_results": state["tool_results"] + [{"bench": result.content[0].text}]}

async def runbook_node(state: AgentState, session: ClientSession) -> AgentState:
    """LangGraph node that queries runbooks via MCP."""
    result = await session.call_tool("query_incident", {"incident": state["query"]})
    return {**state, "tool_results": state["tool_results"] + [{"runbook": result.content[0].text}]}

async def synthesis_node(state: AgentState) -> AgentState:
    """Final LangGraph node: synthesise all tool results into answer."""
    context = "\n".join(str(r) for r in state["tool_results"])
    response = await llm.ainvoke(f"Given this data:\n{context}\nAnswer: {state['query']}")
    return {**state, "final_answer": response.content}

# Build the graph
graph = StateGraph(AgentState)
graph.add_node("bench",    lambda s: bench_node(s, bench_session))
graph.add_node("runbook",  lambda s: runbook_node(s, runbook_session))
graph.add_node("synthesis", synthesis_node)
graph.add_edge("bench", "runbook")
graph.add_edge("runbook", "synthesis")
graph.set_entry_point("bench")
```

---

## 8. Interview Lines

**"What is MCP sampling?"**
"Sampling reverses the usual flow — instead of the client calling the server, the server asks the client to make an LLM call. I use it when my tool needs to summarise or classify data before returning it. The server stays model-agnostic because it uses the host's already-configured LLM. It's a clean separation: the server owns the data, the host owns the model."

**"How do you aggregate tools from multiple MCP servers?"**
"I build an MCP gateway — a single server that the client connects to, which internally connects to specialised backend servers. I namespace tools with a prefix (`bench__get_employee`, `runbook__query`) to avoid collisions. The gateway routes calls to the right backend by splitting on the prefix. The client sees one unified tool set."

**"How do you use MCP inside a LangGraph agent?"**
"I open MCP sessions in the LangGraph lifespan context, then pass the session as a closure into the node functions. Each node calls `session.call_tool()` and adds results to the LangGraph state. The MCP session handles execution; LangGraph handles the routing logic between nodes. The two complement each other perfectly."
