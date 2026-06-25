# MCP — Complete Revision Guide
### Read in 20 Minutes · Clear Any MCP Interview Question

---

> **How to use this:** Read top to bottom once. Every section ends with the exact line to say in an interview.
> The architecture diagrams are for whiteboard questions. The code blocks are for "show me" questions.
> The decision tables are for "when would you use X vs Y" questions.

---

## PART 1 — THE 60-SECOND PITCH

**What MCP is:**
MCP (Model Context Protocol) is an open standard published by Anthropic in 2024.
It defines how AI models connect to external tools, data sources, and prompt templates.
Think USB-C: one standard connector, any device. Write a tool server once; every MCP-compatible client — Claude Desktop, Cursor, your own app — uses it without rewriting.

**Three things MCP exposes:**
| Primitive | What | Who controls it |
|-----------|------|----------------|
| **Tools** | Functions the LLM can call | Model (LLM decides when) |
| **Resources** | Data the LLM reads as context | Application (host decides when) |
| **Prompts** | Reusable prompt templates | User (user selects) |

**Say this in any MCP intro question:**
> "MCP decouples model capability from tool implementation. Before MCP, every AI-tool integration was a custom one-off. With MCP, I write the tool server once and any model or client that speaks MCP gets it — Claude, GPT-4o, Cursor, VS Code. It's the protocol that makes AI tooling portable."

---

## PART 2 — ARCHITECTURE (WHITEBOARD THIS)

```
┌────────────────────────────────────────────────────┐
│                  MCP HOST                           │
│  (Claude Desktop / Cursor / your app)               │
│                                                     │
│  ┌───────────┐   JSON-RPC 2.0   ┌───────────────┐  │
│  │ LLM Model │ ─────────────── ►│  MCP Client   │  │
│  └───────────┘                  └───────┬───────┘  │
└──────────────────────────────────────── │ ─────────┘
                                          │
              stdio (local) / SSE (remote)│
                                          │
┌─────────────────────────────────────────▼──────────┐
│                  MCP SERVER                         │
│  (your Python / TypeScript process)                 │
│                                                     │
│  tools/list    →  list available tools              │
│  tools/call    →  execute a tool                    │
│  resources/list → list data sources                 │
│  resources/read → read a data source                │
│  prompts/list  → list prompt templates              │
│  prompts/get   → get a filled prompt                │
└────────────────────────────────────────────────────┘
```

**Transport choices:**
- **stdio** — host spawns server as subprocess. Messages via stdin/stdout. Best for local tools. Zero network overhead.
- **HTTP + SSE** — server runs as HTTP service. Best for shared remote tools, multi-user.
- **WebSocket** — bidirectional, for real-time / push updates.

---

## PART 3 — THE LIFECYCLE (MEMORISE THIS)

```
1. Host spawns server process (stdio) or connects to URL (SSE)
2. initialize  → capability handshake (what can you do?)
3. list_tools  → discover all available tools
4. [LLM reasons, decides to call a tool]
5. call_tool   → server executes, returns TextContent
6. Result injected as context for next LLM step
7. Loop until LLM reaches final answer (stop_reason = end_turn)
```

---

## PART 4 — MINIMAL CODE (KNOW THIS COLD)

### Server (FastMCP style — production recommended)
```python
from mcp.server.fastmcp import FastMCP
import json

mcp = FastMCP("bench-optimizer")

@mcp.tool()
async def get_bench_employees(skill_filter: str = "") -> str:
    """List all bench employees. Optionally filter by skill."""
    data = await _fetch_from_api(skill_filter)
    return json.dumps(data)

@mcp.resource("bench://roles/all")
async def get_all_roles() -> str:
    """Full role catalogue with required skills."""
    return open("data/roles.json").read()

@mcp.prompt()
def bench_triage(team: str) -> str:
    """Generate a bench triage prompt."""
    return f"Analyse bench for team {team}. Call get_bench_employees first."

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

### Client (custom app)
```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from anthropic import Anthropic

async def agent(query: str):
    params = StdioServerParameters(command="python", args=["bench_server.py"])
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as session:
            await session.initialize()

            # Dynamic discovery — never hardcode tools
            tools = await session.list_tools()
            anthropic_tools = [{"name": t.name, "description": t.description,
                                 "input_schema": t.inputSchema} for t in tools.tools]

            messages = [{"role": "user", "content": query}]
            client = Anthropic()

            while True:
                resp = client.messages.create(model="claude-sonnet-4-6",
                    max_tokens=4096, tools=anthropic_tools, messages=messages)
                if resp.stop_reason == "end_turn":
                    break
                for block in resp.content:
                    if block.type == "tool_use":
                        result = await session.call_tool(block.name, block.input)
                        messages.append({"role": "assistant", "content": resp.content})
                        messages.append({"role": "user", "content": [{
                            "type": "tool_result", "tool_use_id": block.id,
                            "content": result.content[0].text}]})
                        break
```

### Claude Desktop config
```json
{
  "mcpServers": {
    "bench-optimizer": {
      "command": "python",
      "args": ["/path/to/bench_server.py"],
      "env": {"BENCH_API_URL": "http://localhost:8000"}
    }
  }
}
```

---

## PART 5 — DECISION TABLE (MCP vs ALTERNATIVES)

| Situation | Use | Why |
|-----------|-----|-----|
| Tool used by one agent in one codebase | Raw function calling | Simpler, no subprocess, no overhead |
| Tool shared across Claude Desktop + Cursor + your app | **MCP** | Portability — write once, use everywhere |
| Tool consumed by other teams | **MCP** | Standard protocol, versioned interface |
| Dynamic capability discovery needed at runtime | **MCP** | `list_tools` returns live capabilities |
| LangChain/LangGraph internal tool | LangChain Tool | Integrates natively, no extra process |
| Tool needs to work with any model (not just Anthropic) | **MCP** | Model-agnostic by design |
| Real-time push updates from tool | **MCP + WebSocket** | Bidirectional |
| Multiple agents delegating tasks to each other | A2A (not MCP) | A2A is agent↔agent; MCP is model↔tool |

---

## PART 6 — SECURITY CHECKLIST (NEVER SKIP)

```
Auth        ☐ HTTP servers need API key or OAuth 2.0 in Authorization header
AuthZ       ☐ Tool access scoped by caller role (not all tools for all callers)
Validation  ☐ Every argument validated before touching business logic
Injection   ☐ Tool outputs scanned for instruction-override patterns
Audit       ☐ Every call logged: tool name, arg keys (not values), duration
Rate limit  ☐ 20 calls/tool/60s — prevent agent runaway
PII         ☐ No passwords, full SSNs, tokens, or connection strings in results
Destructive ☐ Delete/write tools require explicit confirmation token
```

**Injection defence (one-liner for interviews):**
> "I scan all tool outputs for instruction-override patterns before returning them to the LLM, and I write strong system prompts that pin the LLM's behaviour. For destructive operations I require an explicit user confirmation token."

---

## PART 7 — ADVANCED FEATURES (SENIOR DIFFERENTIATORS)

### Sampling (server asks LLM to generate)
Server → asks host → LLM runs → result back to server.
Use when: your tool needs to summarise/classify data but you want to stay model-agnostic.

### Tool Annotations (MCP spec 2025)
```python
Tool(name="delete_record", annotations=ToolAnnotations(
    destructiveHint=True,    # client shows warning
    idempotentHint=False,    # calling twice causes double-delete
    readOnlyHint=False,
))
```

### Roots (file system scoping)
Server declares which paths it needs. Host approves. Tool validates all paths are within approved roots before reading.

### Progress Notifications
Long-running tools send `ProgressNotification(progress=30, total=100)` so the client can show a progress bar.

### Multi-server aggregation
```
Client → MCP Gateway → bench_server (bench__ prefix)
                     → runbook_server (runbook__ prefix)
                     → hr_server (hr__ prefix)
```
Namespace tools with prefix to avoid collisions. Route by splitting on `__`.

---

## PART 8 — YOUR PROJECT INTEGRATION MAP

| Project | MCP Server | Tools | Resources |
|---------|-----------|-------|-----------|
| **Bench Resource Optimizer** | `bench_mcp_server.py` | `get_bench_employees`, `assign_to_project`, `generate_readiness_plan` | `bench://roles/all`, `bench://policies/allocation` |
| **RunbookAI** | `runbook_mcp_server.py` | `query_incident`, `list_runbooks`, `get_runbook_steps` | `runbook://categories`, `runbook://runbooks/{id}` |
| **Universal Agent** | `universal_mcp_server.py` | `get_agent_status`, `lock_agent`, `unlock_agent`, `query_agent` | `agents://registry` |
| **AstroIntel** | `astro_mcp_server.py` | `run_astro_analysis`, `get_chart_data` | `astro://domains`, `astro://report/{id}` |

**Interview framing:**
> "I'd add MCP as a thin protocol layer over each project's existing FastAPI backend. The FastAPI stays unchanged — it's the internal service interface. The MCP server is the AI-facing interface. This separates concerns: internal teams use the REST API, AI models and IDEs use MCP."

---

## PART 9 — 15 HARD INTERVIEW QUESTIONS + ANSWERS

**Q1. What is the difference between a Tool, a Resource, and a Prompt in MCP?**
Tools are model-controlled actions — the LLM decides when to call them, like function calls. Resources are application-controlled data — the host decides what context to inject before the LLM runs. Prompts are user-controlled templates — the user selects them to prime the conversation. They map to: do, read, start.

**Q2. What transport would you use for a shared company-wide MCP server?**
HTTP + SSE. It runs as a persistent HTTP service, multiple clients can connect, and SSE handles streaming responses. I'd add OAuth 2.0 or API key auth at the HTTP layer and deploy it behind an internal load balancer.

**Q3. How does MCP handle tool errors?**
MCP tool handlers should never raise exceptions. Instead, return a `TextContent` with a structured error string — `VALIDATION_ERROR: employee_id must be 6 digits`. The LLM reads the error and retries with corrected arguments. For system errors, log internally, return a safe non-leaking message to the LLM.

**Q4. What is sampling in MCP?**
Sampling reverses the usual flow — the server asks the client (host) to make an LLM call. I use it when my tool needs to summarise or classify data. The server sends a `create_message` request; the host runs the LLM call with the configured model and returns the result. The server stays model-agnostic because it uses the host's LLM.

**Q5. How do you prevent prompt injection through MCP tools?**
Three layers: sanitise tool outputs by scanning for instruction-override patterns, use strong system prompts that pin LLM behaviour, and require explicit confirmation tokens for destructive operations. I never trust data coming back from external systems — it gets treated as potentially hostile before being injected as LLM context.

**Q6. How do you namespace tools from multiple MCP servers?**
I prefix tool names with the server name: `bench__get_employee`, `runbook__query_incident`. The gateway or client splits on `__` to route calls to the correct backend session. This prevents collisions when two servers have tools with the same name.

**Q7. What are Tool Annotations in MCP 2025?**
Annotations are metadata on tool schemas: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. Clients use them to show warnings before calling destructive tools, disable tools in safe-mode contexts, or decide whether to allow the LLM to call a tool without user confirmation.

**Q8. How do you integrate MCP with LangGraph?**
I open MCP sessions in the LangGraph lifespan context, then pass the session as a closure into node functions. Each node calls `session.call_tool()` and writes results into LangGraph state. For LangChain-style tool use, I wrap MCP tools with a closure that captures the session, making them `@tool`-compatible. LangGraph handles routing; MCP handles execution.

**Q9. What is the difference between MCP and A2A?**
MCP is the protocol between a model and tools or data (model↔tool). A2A (Agent-to-Agent, Google 2025) is the protocol between agents for task delegation (agent↔agent). They're complementary: MCP gives my agent access to external tools; A2A lets my agent delegate sub-tasks to specialised agents on other systems.

**Q10. How do you version an MCP server?**
I include the version in the server name and maintain backwards-compatible schemas. For breaking changes, I run two servers simultaneously — `bench-optimizer-v1` and `bench-optimizer-v2` — and migrate clients progressively. Tool schemas follow the same principles as API versioning: additive changes are fine, removing required fields is a breaking change.

**Q11. How would you add MCP to your Bench Resource Optimizer?**
I'd write a FastMCP server in `bench-resource-optimizer/mcp/bench_mcp_server.py` that wraps the existing FastAPI endpoints. Tools: `get_bench_employees` → `GET /employees/bench`, `generate_readiness_plan` → `POST /generate-plan`. Resources: `bench://roles/all` → `GET /roles`. The FastAPI backend stays unchanged. Claude Desktop and Cursor get bench management tools by registering the MCP server in their config.

**Q12. How do you test an MCP server?**
Three levels: unit test the tool handler functions in isolation (pure Python, no MCP). Integration test by spawning the server as a subprocess and using the Python SDK client to call it end-to-end. E2E test by registering it in Claude Desktop and manually verifying tool calls. For CI, use `mcp.client.stdio.stdio_client` in pytest to spin up the server and assert tool results.

**Q13. What goes in your MCP audit log?**
Event type, caller identity, tool name, argument keys (never argument values — they may contain PII), result size in bytes, and duration in ms. I log keys not values: knowing the LLM called `get_employee(employee_id=...)` is enough for audit; logging the actual ID creates PII risk.

**Q14. What is dynamic tool discovery and why does it matter?**
Instead of hardcoding tool schemas in the client, I call `session.list_tools()` at initialisation and build the tool list at runtime. This means when the server adds a new tool, all clients get it automatically without redeployment. It also lets me build a single generic agent wrapper that works with any MCP server — I don't need to know what tools exist at build time.

**Q15. How is MCP different from OpenAI function calling?**
Function calling is model-specific — the schema format, the tool call format, the result format are all OpenAI-specific. MCP is model-agnostic — the same server works with Claude, GPT-4o, Gemini, or any LLM whose host speaks MCP. Function calling is also static — you hardcode tools at agent creation. MCP is dynamic — tools are discovered at session initialisation.

---

## PART 10 — NUMBERS AND FACTS

| Fact | Value |
|------|-------|
| MCP published by | Anthropic, November 2024 |
| Current spec version | 2025-03-26 |
| Protocol | JSON-RPC 2.0 |
| Official SDKs | Python (`mcp`), TypeScript (`@modelcontextprotocol/sdk`) |
| Three primitives | Tools, Resources, Prompts |
| Three transports | stdio, HTTP+SSE, WebSocket |
| Reference servers available | 15+ (filesystem, github, postgres, slack, brave search...) |
| Clients with native support | Claude Desktop, Cursor, VS Code Copilot, Zed, Continue.dev |
| Complementary protocol | A2A (Google, 2025) — agent-to-agent delegation |

---

## DONE. YOU CAN ANSWER ANY MCP QUESTION IN ANY SENIOR AI INTERVIEW.
