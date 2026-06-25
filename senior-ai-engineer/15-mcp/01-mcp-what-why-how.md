# Senior AI Engineer — Module 15
# Topic: MCP — What It Is, Why It Exists, How It Works

---

## 1. Intuition

Before MCP every AI assistant that needed to touch an external tool had to hard-code a custom integration.
Want your LLM to query a database? Write a plugin. Want it to read a file? Write a tool. Want it to call Slack? Write a connector.
Each integration was one-off, fragile, and completely non-portable.

MCP (Model Context Protocol) is the USB-C of AI tooling.
One standard connector — any model plugs into any tool, any data source, any IDE, any agent framework.
You write the server once; every client that speaks MCP gets it for free.

Senior engineers care about MCP because it decouples LLM capability from tool implementation.
The model stays the same. The tools evolve. The protocol is the contract between them.

---

## 2. Core Concept

### What MCP Is
MCP is an open protocol (published by Anthropic, 2024) that defines how AI models communicate with external tools and data sources.
It is language-agnostic, transport-agnostic, and model-agnostic.
An MCP server exposes capabilities. An MCP client (the AI host) discovers and calls them.

### The Three Primitives
MCP defines exactly three things a server can expose:

| Primitive | What it is | Analogy |
|-----------|-----------|---------|
| **Tools** | Functions the LLM can call | REST endpoints |
| **Resources** | Data the LLM can read | File system mounts |
| **Prompts** | Reusable prompt templates | Macros |

Tools are action-oriented — the LLM decides when to call them.
Resources are data-oriented — the LLM reads them as context.
Prompts are template-oriented — the user selects them to prime the LLM.

### The Architecture

```
┌─────────────────────────────────────┐
│           MCP HOST (Client)          │
│  (Claude Desktop, Cursor, your app) │
│                                      │
│  ┌──────────────┐                   │
│  │  MCP Client  │  speaks MCP JSON  │
│  └──────┬───────┘  ────────────────►│
└─────────┼───────────────────────────┘
          │
          │  stdio / SSE / HTTP
          │
┌─────────▼───────────────────────────┐
│           MCP SERVER                 │
│  (your Python/TypeScript server)    │
│                                      │
│  Exposes:                           │
│   • Tools   (functions to call)     │
│   • Resources (data to read)        │
│   • Prompts  (templates)            │
└──────────────────────────────────────┘
```

### JSON-RPC 2.0 Under the Hood
All MCP messages are JSON-RPC 2.0 over a transport layer.
The client sends `tools/call` or `resources/read`. The server returns structured JSON.
The LLM never sees the wire format — the host handles all of that.

### The Lifecycle
1. **Initialise** — Client connects to server, exchange capabilities
2. **Discover** — Client calls `tools/list`, `resources/list`, `prompts/list`
3. **Execute** — LLM decides to call a tool → client sends `tools/call` → server executes → returns result
4. **Context injection** — Server result is injected as context for next LLM step

---

## 3. Why / When It Matters

### Before MCP
- Every tool integration = custom code, custom schema, custom error handling
- Switching LLM providers meant rewriting every tool connector
- No standard for capability discovery — the client had to know the tools upfront

### After MCP
- Write a tool once as an MCP server → all MCP-compatible clients can use it
- Switch from Claude to GPT-4o → zero change to your tools
- Discovery is dynamic — the LLM asks "what can you do?" at runtime

### When to Use MCP vs Raw Function Calling
| Situation | Use MCP | Use raw function calling |
|-----------|---------|------------------------|
| Building a reusable tool others will consume | ✓ | |
| Tool needs to be IDE-agnostic (Cursor, Claude Desktop, VS Code) | ✓ | |
| Quick one-off internal integration, single model | | ✓ |
| Need dynamic capability discovery at runtime | ✓ | |
| Existing LangChain/LangGraph codebase, single LLM | | ✓ |

---

## 4. How It Works — Transport Layer

MCP supports three transports:

### stdio (Local, Most Common)
Host spawns the server as a subprocess. Communication via stdin/stdout.
```bash
# host spawns server
python my_mcp_server.py
# messages flow through stdin / stdout as newline-delimited JSON
```
Use for: local tools (filesystem, local DB, shell commands). Zero network overhead.

### HTTP + SSE (Remote)
Server runs as HTTP service. Client connects via Server-Sent Events for streaming.
```
GET /sse → opens SSE stream
POST /messages → sends JSON-RPC calls
```
Use for: shared remote tools, multi-user deployments, cloud-hosted servers.

### WebSocket (Experimental)
Bidirectional. Use for real-time tools that push updates (monitoring, live data feeds).

---

## 5. Minimal Python MCP Server

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
import mcp.types as types

app = Server("my-tool-server")

@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_employee_status",
            description="Get current bench/project status for an employee",
            inputSchema={
                "type": "object",
                "properties": {
                    "employee_id": {"type": "string", "description": "Employee ID"}
                },
                "required": ["employee_id"]
            }
        )
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "get_employee_status":
        emp_id = arguments["employee_id"]
        # real logic here
        return [TextContent(type="text", text=f"Employee {emp_id} is currently on bench.")]
    raise ValueError(f"Unknown tool: {name}")

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

---

## 6. Interview Lines

**"What is MCP?"**
"MCP is an open protocol from Anthropic that standardises how LLMs connect to tools and data sources. Think USB-C — one connector, any device. I write the tool server once; any MCP-compatible client — Claude Desktop, Cursor, my own agent — uses it without rewriting."

**"Why not just use function calling?"**
"Function calling is great for single-model, single-app tools. MCP is the right choice when the tool needs to be reusable across models, across IDEs, or across teams. The protocol handles discovery, authentication, and transport — I just write the business logic."

**"What are the three MCP primitives?"**
"Tools — functions the LLM can call, like a REST endpoint. Resources — data the LLM can read, like a file system. Prompts — reusable prompt templates the user can select. Tools are model-controlled; Resources are application-controlled; Prompts are user-controlled."
