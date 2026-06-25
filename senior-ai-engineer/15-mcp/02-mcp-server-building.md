# Senior AI Engineer — Module 15
# Topic: Building MCP Servers — Tools, Resources, Prompts

---

## 1. Intuition

An MCP server is a process that exposes capabilities the LLM can use.
Think of it as the "backend of your AI" — the model is the frontend (the reasoning layer), the MCP server is the backend (the execution layer).

Senior engineers build MCP servers for three reasons:
1. Make existing internal systems AI-accessible without changing those systems
2. Create reusable tooling that any AI client can consume
3. Keep business logic out of the prompt — the server validates, authorises, executes

---

## 2. Server Anatomy

```
MCP Server
├── Metadata         (name, version, description)
├── Capabilities     (tools?, resources?, prompts?)
├── Tool Handlers    (list_tools, call_tool)
├── Resource Handlers (list_resources, read_resource)
└── Prompt Handlers  (list_prompts, get_prompt)
```

Every handler is async. Every response is a typed object. The SDK handles JSON-RPC serialisation.

---

## 3. Building Tools (Action Primitives)

Tools are the most-used primitive. The LLM decides when and how to call them.

### Tool Schema Design — Senior Rules
1. **One tool, one action** — do not build `manage_employee` that does CRUD. Build `get_employee`, `update_employee_status`, `list_bench_employees` separately.
2. **Descriptions are prompts** — the LLM reads your description to decide whether to call the tool. Write it as if explaining to a smart colleague who knows nothing about your system.
3. **Reject ambiguous inputs** — validate args inside the tool, return a structured error string, not an exception. The LLM will retry with corrected args.
4. **Idempotent by default** — tools that write should be safe to call twice. Use upsert, not insert.

### Full Tool Example — Bench Resource Optimizer Integration

```python
from mcp.server import Server
from mcp.types import Tool, TextContent, CallToolResult
import httpx

app = Server("bench-optimizer-mcp")

@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_bench_employees",
            description=(
                "List all employees currently on bench (not assigned to a project). "
                "Optionally filter by skill. Returns employee IDs, names, available skills, "
                "and how many days they have been on bench."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "skill_filter": {
                        "type": "string",
                        "description": "Optional skill to filter by (e.g. 'Python', 'React')"
                    },
                    "max_days_on_bench": {
                        "type": "integer",
                        "description": "Only return employees benched for fewer than this many days"
                    }
                },
                "required": []
            }
        ),
        Tool(
            name="assign_employee_to_project",
            description=(
                "Assign a bench employee to a project. "
                "Requires employee_id and project_id. "
                "Returns success status and the updated assignment."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "employee_id": {"type": "string"},
                    "project_id":  {"type": "string"},
                    "start_date":  {"type": "string", "description": "ISO 8601 date: YYYY-MM-DD"}
                },
                "required": ["employee_id", "project_id"]
            }
        ),
        Tool(
            name="generate_readiness_plan",
            description=(
                "Generate a personalised training plan for an employee to fill skill gaps "
                "for a target role. Returns a day-by-day training schedule."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "employee_id": {"type": "string"},
                    "target_role": {"type": "string", "description": "e.g. 'Senior Python Engineer'"},
                    "num_days":    {"type": "integer", "description": "Plan duration (default 7)"}
                },
                "required": ["employee_id", "target_role"]
            }
        ),
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    base = "http://localhost:8000"

    if name == "get_bench_employees":
        params = {}
        if arguments.get("skill_filter"):
            params["skill"] = arguments["skill_filter"]
        if arguments.get("max_days_on_bench"):
            params["max_days"] = arguments["max_days_on_bench"]
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{base}/employees/bench", params=params)
            return [TextContent(type="text", text=r.text)]

    if name == "assign_employee_to_project":
        async with httpx.AsyncClient() as client:
            r = await client.post(f"{base}/assignments", json=arguments)
            return [TextContent(type="text", text=r.text)]

    if name == "generate_readiness_plan":
        async with httpx.AsyncClient() as client:
            r = await client.post(f"{base}/generate-plan", json=arguments)
            return [TextContent(type="text", text=r.text)]

    return [TextContent(type="text", text=f"Unknown tool: {name}")]
```

---

## 4. Building Resources (Data Primitives)

Resources are data the LLM reads as context — not actions it takes.
The host application controls when resources are read (not the LLM directly).

```python
from mcp.types import Resource

@app.list_resources()
async def list_resources() -> list[Resource]:
    return [
        Resource(
            uri="bench://roles/all",
            name="All Roles Catalogue",
            description="Full list of roles, required skills, and seniority levels",
            mimeType="application/json"
        ),
        Resource(
            uri="bench://policies/allocation",
            name="Resource Allocation Policy",
            description="HR policy document governing bench allocation and project assignment",
            mimeType="text/plain"
        ),
    ]

@app.read_resource()
async def read_resource(uri: str) -> str:
    if uri == "bench://roles/all":
        async with httpx.AsyncClient() as client:
            r = await client.get("http://localhost:8000/roles")
            return r.text
    if uri == "bench://policies/allocation":
        return open("data/allocation_policy.txt").read()
    raise ValueError(f"Unknown resource: {uri}")
```

**URI design convention:**
- Use a custom scheme: `bench://`, `runbook://`, `company://`
- Hierarchical paths: `bench://employees/{id}`, `bench://roles/{category}`
- Avoid exposing internal IDs in discoverable resource lists — use slugs

---

## 5. Building Prompts (Template Primitives)

Prompts are reusable prompt templates that users can select in the host UI.

```python
from mcp.types import Prompt, PromptArgument, GetPromptResult, PromptMessage

@app.list_prompts()
async def list_prompts() -> list[Prompt]:
    return [
        Prompt(
            name="bench_triage",
            description="Generate a bench utilisation summary and recommend immediate actions",
            arguments=[
                PromptArgument(name="team", description="Team name or 'all'", required=True),
                PromptArgument(name="urgency", description="high/medium/low", required=False),
            ]
        )
    ]

@app.get_prompt()
async def get_prompt(name: str, arguments: dict) -> GetPromptResult:
    if name == "bench_triage":
        team = arguments.get("team", "all")
        urgency = arguments.get("urgency", "medium")
        return GetPromptResult(
            description="Bench triage prompt",
            messages=[
                PromptMessage(
                    role="user",
                    content=TextContent(
                        type="text",
                        text=f"Analyse bench utilisation for team: {team}. "
                             f"Urgency: {urgency}. "
                             "List employees at risk of extended bench time, "
                             "recommend training plans, and identify projects they can join. "
                             "Use the get_bench_employees tool to get current data first."
                    )
                )
            ]
        )
    raise ValueError(f"Unknown prompt: {name}")
```

---

## 6. Error Handling — Senior Pattern

Never raise raw exceptions from tool handlers. Return structured error text — the LLM will read it and can retry.

```python
@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    try:
        result = await _dispatch(name, arguments)
        return [TextContent(type="text", text=result)]
    except ValueError as e:
        # Input validation failure — LLM can retry with corrected args
        return [TextContent(type="text", text=f"VALIDATION_ERROR: {e}")]
    except httpx.TimeoutException:
        return [TextContent(type="text", text="TOOL_TIMEOUT: Backend did not respond in 10s. Retry or try a smaller query.")]
    except Exception as e:
        # Log internally, return safe message to LLM
        logger.error("tool_error name=%s err=%s", name, e)
        return [TextContent(type="text", text=f"TOOL_ERROR: {type(e).__name__}. Use a different approach or report to admin.")]
```

---

## 7. Interview Lines

**"How do you design tool schemas for MCP?"**
"I treat the description field as a prompt — the LLM uses it to decide whether to call the tool. I write it as a one-sentence explanation of what the tool does, what it returns, and when to use it. I also make input schemas strict with `required` fields clearly marked — this dramatically reduces the LLM calling tools with missing args."

**"What's the difference between a Tool and a Resource?"**
"Tools are model-controlled — the LLM decides when to call them, like calling a function. Resources are application-controlled — the host decides what context to inject before the LLM even starts. I use Resources for static or slow-changing data (policy docs, role catalogues) and Tools for dynamic lookups or write operations."

**"How do you handle tool errors?"**
"I never raise exceptions from tool handlers. I return structured error strings — `VALIDATION_ERROR: employee_id must be 6 digits`. The LLM reads the error message and retries with corrected arguments. For system errors I log internally and return a safe non-leaking message to the LLM."
