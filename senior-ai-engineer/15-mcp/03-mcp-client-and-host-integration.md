# Senior AI Engineer — Module 15
# Topic: MCP Client & Host Integration — Connecting Models to Servers

---

## 1. Intuition

The MCP server exposes capabilities. The MCP client is what your AI application runs to consume them.
Most engineers starting with MCP focus on the server side. Senior engineers understand both sides — because the client is where you control security, discovery, tool injection, and error recovery.

There are two kinds of MCP clients:
1. **Built-in clients** — Claude Desktop, Cursor, VS Code Copilot. You configure them; you do not write them.
2. **Custom clients** — your own Python/TypeScript app that embeds an MCP client and calls a server programmatically.

In interviews you will be asked about both.

---

## 2. Configuring Built-in Clients

### Claude Desktop

Claude Desktop reads `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).

```json
{
  "mcpServers": {
    "bench-optimizer": {
      "command": "python",
      "args": ["/path/to/bench_mcp_server.py"],
      "env": {
        "BENCH_API_URL": "http://localhost:8000",
        "BENCH_API_KEY": "your-key-here"
      }
    },
    "runbook-ai": {
      "command": "python",
      "args": ["/path/to/runbook_mcp_server.py"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Documents"]
    }
  }
}
```

Claude Desktop spawns each server as a subprocess on startup. `command` + `args` = the subprocess. `env` = environment variables injected at spawn time (good place for API keys — never hardcode them in the server).

### Cursor IDE

Cursor reads `.cursor/mcp.json` at project root:

```json
{
  "mcpServers": {
    "bench-optimizer": {
      "command": "python",
      "args": ["./mcp/bench_server.py"]
    }
  }
}
```

Or globally: `~/.cursor/mcp.json` for servers available in all projects.

---

## 3. Building a Custom MCP Client

When you build your own agent or application you create an MCP client programmatically.

### Full Custom Client Pattern

```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from anthropic import Anthropic

async def run_agent_with_mcp(user_query: str):
    anthropic = Anthropic()

    # ── Connect to MCP server ──────────────────────────────────────────────
    server_params = StdioServerParameters(
        command="python",
        args=["bench_mcp_server.py"],
        env={"BENCH_API_URL": "http://localhost:8000"}
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:

            # ── Initialise + discover ──────────────────────────────────────
            await session.initialize()
            tools_result = await session.list_tools()

            # ── Convert MCP tool schemas to Anthropic tool format ──────────
            anthropic_tools = [
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.inputSchema,
                }
                for t in tools_result.tools
            ]

            # ── Agent loop ─────────────────────────────────────────────────
            messages = [{"role": "user", "content": user_query}]

            while True:
                response = anthropic.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=4096,
                    tools=anthropic_tools,
                    messages=messages,
                )

                # No tool call → we have the final answer
                if response.stop_reason == "end_turn":
                    final = next(b.text for b in response.content if hasattr(b, "text"))
                    print("Agent answer:", final)
                    break

                # Process tool calls
                tool_results = []
                for block in response.content:
                    if block.type != "tool_use":
                        continue

                    print(f"[MCP] Calling tool: {block.name} args={block.input}")
                    result = await session.call_tool(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result.content[0].text if result.content else "no result",
                    })

                # Append assistant turn + tool results, continue loop
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})

asyncio.run(run_agent_with_mcp("Who is longest on bench and what training plan do they need?"))
```

### What This Pattern Does
1. Spawns the MCP server as a subprocess
2. Initialises the session (capability handshake)
3. Discovers all tools dynamically (no hardcoding)
4. Converts MCP tool schemas to the model's native format (here: Anthropic)
5. Runs an agent loop: LLM → tool call → MCP server executes → result back to LLM → repeat until done

---

## 4. Dynamic Tool Discovery — Senior Insight

The most powerful thing about MCP is that tools are discovered at runtime, not hardcoded.

```python
# ── BAD: hardcoded tool knowledge ──────────────────────────────────────────
tools = [
    {"name": "get_employee", "description": "...", "input_schema": {...}}
]
# This breaks the moment the server adds or removes a tool.

# ── GOOD: dynamic discovery ────────────────────────────────────────────────
tools_result = await session.list_tools()
tools = [{"name": t.name, "description": t.description, "input_schema": t.inputSchema}
         for t in tools_result.tools]
# The client always reflects the server's current capability set.
```

**Senior interview point:** "I always discover tools at session initialisation, never hardcode them. This means when the server adds a new tool, the client gets it without a deployment. It also means I can build a single generic agent wrapper that works with any MCP server."

---

## 5. Connecting Multiple Servers

A real production agent may connect to multiple MCP servers simultaneously.

```python
async def multi_server_agent():
    # Connect to all servers concurrently
    bench_params   = StdioServerParameters(command="python", args=["bench_server.py"])
    runbook_params = StdioServerParameters(command="python", args=["runbook_server.py"])
    calendar_params = StdioServerParameters(command="python", args=["calendar_server.py"])

    async with (
        stdio_client(bench_params)   as (r1, w1),
        stdio_client(runbook_params) as (r2, w2),
        stdio_client(calendar_params) as (r3, w3),
    ):
        async with (
            ClientSession(r1, w1) as bench_session,
            ClientSession(r2, w2) as runbook_session,
            ClientSession(r3, w3) as calendar_session,
        ):
            await asyncio.gather(
                bench_session.initialize(),
                runbook_session.initialize(),
                calendar_session.initialize(),
            )

            # Merge all tools into one list with source tagging
            all_tools = []
            for session, label in [(bench_session, "bench"), (runbook_session, "runbook"), (calendar_session, "cal")]:
                result = await session.list_tools()
                for t in result.tools:
                    all_tools.append({
                        "name": f"{label}__{t.name}",  # namespace to avoid collisions
                        "description": t.description,
                        "input_schema": t.inputSchema,
                        "_session": session,            # keep reference for dispatch
                    })

            # Route tool calls back to correct session
            # ... agent loop here
```

**Namespacing tools** (`bench__get_employee`, `runbook__query_incident`) prevents name collisions when aggregating tools from multiple servers.

---

## 6. LangChain / LangGraph Integration

MCP tools can be wrapped as LangChain tools for use in LangGraph agents.

```python
from langchain_core.tools import tool
from mcp import ClientSession

def mcp_tool_to_langchain(session: ClientSession, mcp_tool):
    """Wrap an MCP tool as a LangChain @tool function."""
    tool_name = mcp_tool.name
    tool_desc = mcp_tool.description

    @tool(tool_name, description=tool_desc)
    async def _wrapper(**kwargs) -> str:
        result = await session.call_tool(tool_name, kwargs)
        return result.content[0].text if result.content else ""

    return _wrapper

# In your LangGraph node:
async def agent_node(state, session: ClientSession):
    tools_result = await session.list_tools()
    langchain_tools = [mcp_tool_to_langchain(session, t) for t in tools_result.tools]
    agent = create_react_agent(llm, langchain_tools)
    return await agent.ainvoke(state)
```

---

## 7. Interview Lines

**"How does an MCP client work?"**
"An MCP client opens a session to an MCP server — either via stdio for local servers or HTTP+SSE for remote ones. It calls `initialize` to do the capability handshake, then `list_tools` to discover what the server exposes. From that point, when the LLM outputs a tool call, the client dispatches it to the server via `call_tool` and returns the result. The whole agent loop — LLM reasoning, tool dispatch, result injection — runs inside the client."

**"How do you connect to multiple MCP servers?"**
"I open a session to each server concurrently with asyncio. I merge all tools into a single list, namespacing by server to avoid collisions (e.g. `bench__get_employee`, `runbook__query_incident`). During the agent loop I route each tool call back to the correct session based on the namespace prefix."

**"Can you integrate MCP with LangGraph?"**
"Yes — I wrap each MCP tool as a LangChain tool using a closure that captures the session reference. Then the LangGraph node creates a ReAct agent with those wrapped tools. The LangGraph state machine handles the orchestration; MCP handles the tool execution. You get the best of both: LangGraph's graph-based control flow and MCP's standardised tool protocol."
