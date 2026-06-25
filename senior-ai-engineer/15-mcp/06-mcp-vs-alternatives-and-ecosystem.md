# Senior AI Engineer — Module 15
# Topic: MCP vs Alternatives — When to Use What, Ecosystem, Future

---

## 1. Intuition

MCP is not the only way to give an LLM access to tools. There is function calling, there is LangChain tools, there is OpenAI plugins (deprecated), there is custom REST + system prompts.
Senior engineers understand the trade-off space and can articulate exactly when MCP is the right choice and when it is overkill.

The wrong answer in an interview is "I always use MCP" or "I never use MCP".
The right answer is "I use MCP when I need portability and dynamic discovery. I use raw function calling when I need something simple and self-contained."

---

## 2. MCP vs Raw Function Calling

| Dimension | MCP | Raw Function Calling |
|-----------|-----|---------------------|
| **Portability** | Works with any MCP-compatible client | Tied to one model/SDK |
| **Discovery** | Dynamic — client discovers at runtime | Static — hardcoded in code |
| **Reusability** | Write once, use from Claude Desktop + Cursor + your app | One integration per client |
| **Complexity** | Higher setup — server process, transport, protocol | Lower — just a Python function + schema |
| **Debugging** | Need to trace stdio/SSE messages + server process | Trace in-process with print/debugger |
| **Latency** | Adds subprocess / network hop | Direct function call, near-zero overhead |
| **Best for** | Reusable tools across apps/models/teams | Single-app, single-model, simple tool |

**Decision rule:**
- Tool used by one agent in one codebase → raw function calling
- Tool used by multiple clients (IDE + app + Claude Desktop) → MCP
- Tool team-wide or company-wide → MCP
- Tool that other teams will consume → MCP + versioning

---

## 3. MCP vs LangChain Tools

| Dimension | MCP | LangChain Tool |
|-----------|-----|----------------|
| **Protocol** | Standard (open spec) | LangChain-specific |
| **Client** | Any MCP host | LangChain/LangGraph only |
| **Discoverability** | Via `tools/list` at runtime | Hardcoded in agent constructor |
| **Language** | Any language (Python, TS, Go, Rust) | Python only |
| **IDE integration** | Native (Cursor, VS Code) | None |
| **Best for** | Cross-app, cross-model tooling | LangChain agent internals |

You can bridge them — wrap an MCP tool as a LangChain tool (shown in file 03).
In production: use LangChain Tools for agent-internal logic, use MCP for tools that need to be accessible from outside the agent.

---

## 4. MCP vs OpenAI Plugins (Deprecated)

OpenAI Plugins (2023) were an early attempt at standardised tool integration. They were deprecated.
MCP is the successor — designed by Anthropic, adopted cross-industry, not tied to one model.

| OpenAI Plugins | MCP |
|---|---|
| OpenAI-only | Model-agnostic |
| OAuth manifest-based | JSON-RPC, typed schema |
| Deprecated 2024 | Active, growing ecosystem |
| No local tool support | stdio for local, SSE for remote |

---

## 5. The MCP Ecosystem (2024–2025)

### Official Anthropic Servers
Anthropic publishes reference servers at `github.com/modelcontextprotocol/servers`:
- `@modelcontextprotocol/server-filesystem` — file read/write with root scoping
- `@modelcontextprotocol/server-github` — GitHub repos, issues, PRs
- `@modelcontextprotocol/server-postgres` — PostgreSQL query tool
- `@modelcontextprotocol/server-slack` — Slack messages, channels
- `@modelcontextprotocol/server-brave-search` — web search
- `@modelcontextprotocol/server-puppeteer` — browser automation
- `@modelcontextprotocol/server-memory` — persistent key-value memory

### Clients That Support MCP
| Client | Notes |
|--------|-------|
| **Claude Desktop** | Reference implementation, full support |
| **Cursor** | IDE integration — code-aware MCP tools |
| **VS Code + GitHub Copilot** | MCP support added 2025 |
| **Zed** | Editor with MCP support |
| **Continue.dev** | Open-source Copilot alternative |
| **Custom apps** | Python SDK: `mcp`, TypeScript SDK: `@modelcontextprotocol/sdk` |

### SDKs
```bash
# Python
pip install mcp

# TypeScript
npm install @modelcontextprotocol/sdk

# Rust, Go, Kotlin — community SDKs exist
```

---

## 6. MCP Versioning and Compatibility

MCP uses semantic versioning. The current spec (2025-03-26) adds:
- OAuth 2.0 authorisation server metadata
- Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`)
- Structured tool outputs (not just text)
- Audio content type (alongside text and image)

### Tool Annotations — Senior Feature

```python
from mcp.types import Tool, ToolAnnotations

Tool(
    name="delete_employee_record",
    description="Permanently delete an employee record from the system.",
    inputSchema={...},
    annotations=ToolAnnotations(
        readOnlyHint=False,
        destructiveHint=True,       # Client can warn user before calling
        idempotentHint=False,       # Calling twice causes double-deletion
        openWorldHint=False,        # Does not access external internet
    )
)
```

Clients use annotations to show warnings, require confirmations, or disable destructive tools in safe-mode contexts.

---

## 7. MCP in Your Project Portfolio

### How to add MCP to Bench Resource Optimizer
```
bench-resource-optimizer/
└── mcp/
    ├── bench_mcp_server.py     # FastMCP server wrapping the /employees and /plan endpoints
    ├── README.md               # How to register in Claude Desktop + Cursor
    └── claude_desktop_config_snippet.json
```

The MCP server becomes a thin client over your existing FastAPI backend:
- `get_bench_employees` → calls `GET /employees/bench`
- `generate_readiness_plan` → calls `POST /generate-plan`
- `query_incident_runbook` → calls `POST /query` on the RunbookAI backend

This is the correct layering: MCP as the AI-facing interface, FastAPI as the internal service interface.

### How to add MCP to RunbookAI
```
runbook-ai/
└── mcp/
    ├── runbook_mcp_server.py
    │   # Tools: query_incident, list_runbooks, get_runbook_steps
    │   # Resources: runbook://categories, runbook://runbooks/{id}
    │   # Prompts: incident_triage (takes incident description, calls query tool)
    └── README.md
```

### How to add MCP to Universal Agent
Universal Agent is already an agent platform. MCP makes it AI-tool-accessible:
```
# Tool: get_agent_status(agent_id) → is it locked/unlocked, active sessions?
# Tool: lock_agent(agent_id)       → lock an agent
# Tool: unlock_agent(agent_id)     → unlock an agent
# Tool: query_agent(agent_id, message) → send a message to a specific agent
```
Now Claude Desktop can manage Universal Agent sessions directly.

---

## 8. MCP vs A2A (Agent-to-Agent Protocol)

Google released **A2A** (Agent-to-Agent) protocol in 2025 — a complementary standard to MCP.

| MCP | A2A |
|-----|-----|
| Model ↔ Tool/Data | Agent ↔ Agent |
| LLM consumes external capabilities | Agents collaborate and delegate tasks |
| Tool is stateless (one call = one result) | Agent is stateful (multi-turn task delegation) |
| Best for: single-agent tool use | Best for: multi-agent orchestration across teams |

**They work together:** MCP for tool access, A2A for agent delegation.

---

## 9. Interview Lines

**"When would you not use MCP?"**
"If I'm building a single internal tool used by one agent in one codebase, I use raw function calling — it's simpler, lower latency, no subprocess management. MCP is the right choice when the tool needs to be portable across models, IDEs, or teams. The setup cost of MCP pays off at scale, not for one-off integrations."

**"How does MCP fit in your portfolio?"**
"I'd add MCP servers to Bench Resource Optimizer and RunbookAI as a thin protocol layer over the existing FastAPI backends. The FastAPI stays unchanged — it's the internal service interface. The MCP server is the AI-facing interface. This way Claude Desktop, Cursor, and any custom agent can use those tools without touching the backend service code."

**"What's the difference between MCP and A2A?"**
"MCP is the protocol between a model and tools or data sources. A2A is the protocol between agents — for task delegation and multi-agent collaboration. They're complementary: I use MCP so my agent can call external tools, and A2A so my agent can delegate sub-tasks to specialised agents on other teams. Google's A2A and Anthropic's MCP are designed to work together."
