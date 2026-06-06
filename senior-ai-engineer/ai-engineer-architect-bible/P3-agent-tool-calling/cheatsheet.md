# P3 — Interview Cheatsheet
### What to say, what to never say, what catches people out.

← [Back to README](./README.md)

---

## TOP 5 INTERVIEW QUESTIONS — Exact answers

---

### Q1: "Walk me through an agent / tool calling system."

**Say this:**
> "Every tool has two parts: a JSON Schema that the LLM reads (name, description, argument types) and a Python function that actually runs. Both live in a TOOL_REGISTRY dict. The ReAct loop works like this: build a messages list with system instructions and the user query, call the LLM with tools=TOOL_SCHEMAS and tool_choice='auto'. If the response has tool_calls, extract the name and arguments, execute the function — using asyncio.gather for parallel calls — and append the result as a role='tool' message. Call the LLM again with the updated messages. It reasons with the tool result. Loop until tool_calls is None — that means the LLM has the final answer. Two safety rails: max_steps prevents infinite loops, and TOOL_REGISTRY guard returns error JSON for unknown tool names."

**What they're listening for:** two parts of a tool, ReAct loop, asyncio.gather, exit condition (tool_calls is None), safety rails

---

### Q2: "What's the exit condition for the agent loop?"

**Say this:**
> "When `message.tool_calls` is None or empty. The LLM returns a response with either tool_calls (it wants to act) or plain content (it has the final answer). When content is set and tool_calls is not — the loop exits and we return the content. The secondary exit is max_steps — a safety limit to prevent infinite loops in case the LLM gets confused."

---

### Q3: "How do you handle multiple tool calls in one response?"

**Say this:**
> "The LLM can return multiple tool_calls in a single response when the tasks are independent. For example: 'get weather for Mumbai' AND 'send email to alice' can happen at the same time. I use asyncio.gather to run them concurrently — same as Java's CompletableFuture.allOf(). Each result comes back as a separate role='tool' message with the matching tool_call_id. The LLM uses those IDs to correlate which result belongs to which call."

---

### Q4: "How do you prevent an agent from doing something dangerous?"

**Say this:**
> "Three layers. First, TOOL_REGISTRY as a whitelist — if a tool name isn't in the registry, it returns an error JSON instead of crashing. Second, input validation inside each tool function — for example, the SQL tool checks that the query starts with SELECT before executing. Third, principle of least privilege — tools only have the permissions they need. A 'read weather' tool has no credentials for anything else. I also log every tool call with its arguments so I can audit what the agent did."

---

### Q5: "What's the difference between tool calling and function calling?"

**Say this:**
> "They're the same thing — different names for the same OpenAI feature. 'Function calling' was the original term (GPT-4 era). 'Tool calling' is the newer term after OpenAI expanded it to include non-function tools. The code pattern is identical: define the schema in TOOL_SCHEMAS, pass it as tools= to the completion call, check for tool_calls in the response. I use 'tool calling' as the current term."

---

## QUICK-FIRE Q&A

| Question | Answer |
|---|---|
| What's `tool_choice="auto"`? | LLM decides: use a tool or answer directly. `"required"` forces a tool call. `"none"` disables tools. |
| What's `tool_call_id`? | Unique ID linking a tool call request to its result. Must match in the role="tool" message. |
| What's `max_steps` for? | Safety limit to prevent infinite loops. Usually 5–10. |
| What's TOOL_REGISTRY? | Dict mapping tool name → async function. Guards against unknown tool names. |
| How many tools can you define? | No hard limit. In practice: 10–20. More tools = LLM takes longer to reason. |
| Sync vs async tools? | Tools should be async if they call external APIs (network I/O). Sync for CPU-only work. |
| What's ReAct? | Reason + Act. A pattern for interleaving reasoning (LLM thinks) with acting (tool calls). |

---

## GOTCHAS — Things that catch people out

**Gotcha 1: Forgetting to append the assistant message before tool results**
```python
messages.append(message)         # ← must append BEFORE tool results
tool_results = await execute_all_tools_parallel(message.tool_calls)
messages.extend(tool_results)
```
If you skip appending the assistant message, the tool result has no corresponding request — the LLM gets confused.

**Gotcha 2: Using json.loads without error handling**
```python
# WRONG
args = json.loads(tool_call.function.arguments)
# RIGHT
try:
    args = json.loads(tool_call.function.arguments)
except json.JSONDecodeError:
    return {"error": "Invalid JSON arguments from LLM"}
```

**Gotcha 3: tool_call_id mismatch**
The `tool_call_id` in the role="tool" result MUST match the `id` in the tool_call request. OpenAI will reject the message if they don't match.

**Gotcha 4: Blocking tools in async code**
```python
# WRONG — blocks the event loop
async def get_data(id: str) -> str:
    return requests.get(f"/api/{id}").text   # sync HTTP in async function

# RIGHT
async def get_data(id: str) -> str:
    async with httpx.AsyncClient() as client:
        r = await client.get(f"/api/{id}")
        return r.text
```

**Gotcha 5: Infinite loop with no max_steps**
If the LLM gets into a reasoning loop, it will keep calling tools forever. Always set `max_steps`.

---

## WHAT TO SAY IF STUCK

> "Each tool = JSON Schema (LLM reads it) + Python function in TOOL_REGISTRY (runs it). ReAct loop: call LLM with tools=TOOL_SCHEMAS, check tool_calls, execute with asyncio.gather, append role='tool' results, call LLM again. Exit when tool_calls is None. Safety: max_steps limit + TOOL_REGISTRY whitelist."

---

← [Back to README](./README.md) | [→ Flow](./flow.md) | [→ Code](./code.py) | [→ Extensions](./extensions.md)
