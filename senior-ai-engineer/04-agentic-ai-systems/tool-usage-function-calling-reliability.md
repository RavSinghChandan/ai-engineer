# Senior AI Engineer — Module 4
# Topic: Tool Usage / Function Calling — Reliability Patterns

---

## 1. Intuition

Tool calling is how LLM agents interact with the real world — databases, APIs, file systems, code execution.
The LLM is smart but not infallible. It will call tools with wrong arguments, call the wrong tool, or get stuck when a tool fails.

Senior engineers design tool interfaces that are hard to call wrong, and build the retry/fallback logic that catches the cases when the LLM still gets it wrong.

---

## 2. Core Concept

### How Function Calling Works
The LLM is given a list of tool schemas (name, description, parameter schema).
Instead of generating text, it generates a structured tool call: `{"name": "search_documents", "arguments": {"query": "refund policy", "top_k": 5}}`.
Your code executes the tool and returns the result to the LLM as the next message.
The LLM then decides: call another tool, or generate the final answer.

### OpenAI Function Calling Format
```json
{
  "name": "get_order_status",
  "description": "Get the current status of a customer order",
  "parameters": {
    "type": "object",
    "properties": {
      "order_id": {
        "type": "string",
        "description": "The order ID (format: ORD-XXXXXXXX)"
      }
    },
    "required": ["order_id"]
  }
}
```

### What Can Go Wrong
1. Wrong argument type: LLM passes a string where integer is expected
2. Missing required parameter: LLM omits a required argument
3. Hallucinated argument: LLM invents a value that does not exist (e.g., a fake order ID)
4. Wrong tool selected: LLM calls `update_order` instead of `get_order`
5. Tool failure not handled: tool returns an error, LLM does not know how to recover
6. Infinite tool loop: LLM keeps calling the same tool without making progress

---

## 3. Why / When It Matters

Tool reliability is critical when:
- Tools have side effects (write operations, sends, payments)
- Tools are rate-limited or expensive
- Tools return complex schemas that the LLM must correctly interpret
- Multiple tools have similar names or overlapping purposes

For read-only tools: failures are recoverable — retry, return "no result", continue.
For write tools: failures can cause data inconsistency — require confirmation, idempotency, rollback.

---

## 4. How It Works (Reliability Architecture)

```
Tool Call from LLM
    ↓
Argument Validation (schema check, type coercion)
    ↓ (if invalid)
Return structured error: "order_id must be in format ORD-XXXXXXXX" → LLM retries with corrected args
    ↓ (if valid)
Authorization check (is this user allowed to call this tool with these args?)
    ↓
Rate limit check
    ↓
Tool execution with timeout
    ↓ (if success)
Return structured result to LLM
    ↓ (if failure)
Return structured error with reason → LLM decides: retry / try different approach / report failure
```

---

## 5. Code Skeleton (Production-Grade)

```python
from pydantic import BaseModel, validator
from typing import Any
import functools
import time

# Tool definition with Pydantic validation
class SearchDocumentsInput(BaseModel):
    query: str
    top_k: int = 5
    
    @validator("query")
    def query_not_empty(cls, v):
        if not v.strip():
            raise ValueError("query cannot be empty")
        return v.strip()
    
    @validator("top_k")
    def top_k_range(cls, v):
        return max(1, min(v, 20))  # clamp to valid range instead of failing

class GetOrderStatusInput(BaseModel):
    order_id: str
    
    @validator("order_id")
    def validate_order_id_format(cls, v):
        import re
        if not re.match(r'^ORD-[A-Z0-9]{8}$', v):
            raise ValueError(f"order_id must match format ORD-XXXXXXXX, got: {v}")
        return v

# Tool wrapper with reliability patterns
def reliable_tool(max_retries: int = 2, timeout: int = 10):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(raw_args: dict) -> dict:
            # Step 1: validate arguments
            input_class = func.__annotations__.get("validated_input")
            if input_class:
                try:
                    validated = input_class(**raw_args)
                    args = validated.dict()
                except Exception as e:
                    return {"error": f"Invalid arguments: {str(e)}", "success": False}
            else:
                args = raw_args
            
            # Step 2: execute with retry
            last_error = None
            for attempt in range(max_retries + 1):
                try:
                    import signal
                    def timeout_handler(signum, frame):
                        raise TimeoutError(f"Tool {func.__name__} timed out after {timeout}s")
                    signal.signal(signal.SIGALRM, timeout_handler)
                    signal.alarm(timeout)
                    
                    result = func(**args)
                    signal.alarm(0)  # cancel timeout
                    
                    return {"result": result, "success": True}
                except TimeoutError as e:
                    signal.alarm(0)
                    last_error = str(e)
                    break  # don't retry timeout
                except Exception as e:
                    last_error = str(e)
                    if attempt < max_retries:
                        time.sleep(2 ** attempt)  # exponential backoff
            
            return {"error": last_error, "success": False}
        return wrapper
    return decorator

# Tool registry — LLM sees this as available tools
class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, callable] = {}
        self._schemas: list[dict] = []
    
    def register(self, name: str, func: callable, schema: dict):
        self._tools[name] = func
        self._schemas.append({"name": name, **schema})
    
    def execute(self, tool_name: str, arguments: dict) -> dict:
        if tool_name not in self._tools:
            return {"error": f"Tool '{tool_name}' not found. Available: {list(self._tools.keys())}", "success": False}
        return self._tools[tool_name](arguments)
    
    @property
    def schemas(self) -> list[dict]:
        return self._schemas

# Confirm-before-execute for write operations
class SafeToolExecutor:
    HIGH_RISK_TOOLS = {"delete_order", "process_refund", "send_email", "update_customer_data"}
    
    def execute(self, tool_name: str, arguments: dict, require_confirmation: bool = False) -> dict:
        if tool_name in self.HIGH_RISK_TOOLS:
            if not require_confirmation:
                # Surface to user for approval first
                return {
                    "pending_confirmation": True,
                    "action": tool_name,
                    "arguments": arguments,
                    "message": f"About to execute {tool_name} with {arguments}. Confirm?"
                }
        return tool_registry.execute(tool_name, arguments)
```

---

## 6. Example (From Your Projects)

**LangChain Service — function calling agent:**

The agent had tools: `search_documents`, `answer_question`, `summarize`.
In production, the reliability issues we handled:

1. `search_documents` called with empty query — added Pydantic validator that rejects empty strings
2. `answer_question` called when `search_documents` should have been called first — improved tool descriptions to be more explicit about when each tool should be used
3. Agent loop when search returned no results — added explicit "no results found" return value so the LLM knew to stop, not retry indefinitely

Key insight: tool descriptions are as important as tool implementations. The LLM reads the description to decide when and how to use the tool. A vague description = wrong tool selection.

In interview: "In the LangChain agent, I learned that tool reliability is 50% implementation and 50% description quality. When the agent was calling the wrong tool, I first checked the descriptions before changing any code. Better descriptions fixed 60% of wrong tool selection issues."

---

## 7. Trade-offs

Strict argument validation:
+ Prevents tool corruption, gives LLM clear error messages to self-correct
- More code to maintain, may reject edge cases you didn't anticipate

Lenient validation (auto-coerce):
+ More tolerant, fewer failures on minor format differences
- Garbage-in can cause subtle bugs (wrong order ID accepted, finds wrong record)

Confirmation for write operations:
+ Prevents irreversible actions from running unchecked
- Adds latency and friction for legitimate operations

No confirmation:
+ Faster, simpler
- A hallucinated argument to `delete_record` causes real damage

---

## 8. Interview Questions (Senior Level)

- How do you prevent an LLM agent from calling a tool with hallucinated arguments?

  **Answer:** *(Already covered in Advanced Follow-ups Q1 — skipped to avoid duplication.)*

- What is the difference between tool validation and tool authorization?

  **Answer:** Validation checks whether the arguments are structurally correct — right types, required fields present, values within expected ranges (Pydantic does this). Authorization checks whether this user or agent is permitted to call this tool with these arguments — a user can only query their own employee records, not another tenant's. Both are necessary: validation happens at the tool interface before execution, authorization checks against the user context before even invoking the tool. In Bench Resource Optimizer, the CV search tool validates the query format and authorizes that the requesting user has access to the searched employee pool — both checks run before any database query executes.

- How do you handle a tool that fails intermittently in a production agent?

  **Answer:** Retry with exponential backoff for transient failures (network timeouts, database busy), return a structured error message to the LLM (not an exception) so the LLM can decide its next step, and track tool failure rate as a metric to detect when "intermittent" becomes "systemic." The structured error message is critical — if the tool raises an exception that the agent doesn't catch, the whole agent fails; if the tool returns `{"error": "temporarily unavailable, please try a different approach"}`, the LLM can pivot to an alternative tool or inform the user gracefully.

- An LLM agent has access to a database write tool. What safeguards do you put in place?

  **Answer:** Idempotency keys on every write (prevent duplicate execution from retries), Pydantic validation of all arguments before execution, a mandatory human confirmation step in the agent flow before the write tool is called (the LLM proposes, a human approves), rollback capability (soft delete or version history rather than hard delete), and rate limiting on writes per session. In Bench Resource Optimizer, resource allocation writes go through the human-in-the-loop approval gate — the LLM generates a plan, a manager reviews it, and only after explicit approval does the system write any allocation records.

- How do you design tool descriptions to minimize wrong tool selection?

  **Answer:** *(Already covered in Advanced Follow-ups Q3 — skipped to avoid duplication.)*

---

## 9. Answer Framework

Step 1 — Validate at the tool interface:
"Every tool has a Pydantic schema. If the LLM generates wrong argument types or formats, the validator catches it and returns a structured error. The LLM reads the error and corrects its call."

Step 2 — Write tools need extra guards:
"Read tools can fail safely. Write tools need confirmation, idempotency keys, and rollback capability. I treat LLM-triggered writes the same as external API calls — validate, authorize, execute, verify."

Step 3 — From your project:
"In the LangChain agent, tool description quality was the biggest factor in correct tool selection. I invested as much time in the tool schema and description as in the tool implementation."

Step 4 — Retry and fallback:
"Tools get a retry wrapper with exponential backoff for transient failures. After max retries, the tool returns a structured error that the LLM uses to decide its next step."

Step 5 — Audit:
"Every tool call is logged: tool name, arguments, result, latency. This is how I debug wrong tool behavior and detect when the LLM is hallucinating arguments."

---

## 10. Advanced Follow-ups

Q1: How do you prevent a tool from being called with a hallucinated entity ID?

Answer:
Three defenses.
First, format validation: reject arguments that don't match the expected ID format (regex). This catches obviously fabricated IDs.
Second, existence check before execution: before running the main tool logic, verify the entity exists. If `order_id = "ORD-FAKE1234"` doesn't exist in the database, return "order not found" immediately — the LLM understands this and stops.
Third, scope the tool to the user's context: the tool should only be able to access entities belonging to the current user. Even if the LLM generates a valid but wrong user's order ID, the authorization check rejects it.
None of these are AI-specific — they are the same defensive coding practices you apply to any REST API endpoint: validate input, check existence, enforce authorization.

---

Q2: How do you make a write tool idempotent when called by an LLM agent?

Answer:
The problem: LLM agents sometimes call the same tool multiple times (loop behavior, retry after perceived failure). A non-idempotent write executed twice causes duplicate records, double charges, or conflicting state.
Solution: idempotency key on every write operation.
The agent generates an idempotency key (typically based on the current task ID + tool name + input hash). The tool stores this key on first execution. If the same key arrives again, return the stored result without re-executing.
Implementation: a simple Redis key with TTL. On write tool call, check if `idempotency_key` exists in Redis. If yes, return cached result. If no, execute, store result under key, return result.
This is identical to the idempotency pattern in payment APIs (Stripe uses this) — same principle, applied to LLM tool calls.

---

Q3: How do you design tool descriptions that minimize wrong tool selection?

Answer:
Four principles.
First, be explicit about WHEN to use the tool: "Use this tool ONLY when you need real-time order status from the database. Do NOT use for historical orders older than 90 days."
Second, be explicit about what the tool does NOT do: "This tool searches documents. It does NOT answer questions — use answer_question for that."
Third, name tools clearly — verbs first: `get_order_status` not `order_status`; `search_knowledge_base` not `kb_search`. The LLM reasons with natural language — verb-first names communicate intent.
Fourth, describe the output format so the LLM knows what to expect: "Returns JSON: {order_id, status, estimated_delivery, tracking_url}."
Test: after writing tool descriptions, ask the LLM to describe when it would use each tool. If its description matches your intent, the description is correct. If not, revise before shipping.

---

Q4: An agent has 15 tools available. How does that affect LLM performance?

Answer:
Too many tools hurt performance — the LLM has to parse 15 tool schemas in its context and reason about which one to use. This increases context length, increases latency, and increases the chance of wrong tool selection.
Research suggests LLM tool selection accuracy peaks at around 5-7 tools and degrades with more.
Solutions:
First, tool pruning: dynamically select which tools to include in the context based on the task. A customer support task gets 5 customer tools, not all 15.
Second, tool grouping: group tools into categories and give the LLM a two-step choice: "Which category?" then "Which tool in that category?" (hierarchical tool selection).
Third, dedicated specialist agents: instead of one agent with 15 tools, route to specialist agents — a customer_service_agent with 5 tools, a billing_agent with 5 tools. The supervisor decides which specialist to invoke.
Rule of thumb: if your agent has more than 7 tools, factor them into specialist agents or implement dynamic tool selection.

---

Q5: How do you handle a tool that calls an external API that has rate limits?

Answer:
This is a standard distributed systems problem — I apply the same patterns I use for any rate-limited external API.
First, token bucket rate limiter: the tool implementation checks a token bucket before making the external call. If rate limit is reached, wait or return a "rate limited — retry in N seconds" response.
Second, response caching: for read tools calling external APIs, cache responses with an appropriate TTL. Identical calls within the TTL return the cached result without hitting the external API.
Third, circuit breaker: if the external API returns errors at high rate (>20% of calls in a rolling window), open the circuit — stop calling the API for 30 seconds, return a graceful degradation response. After 30 seconds, try again.
Fourth, queue-based approach for non-urgent operations: if the tool operation is not real-time, queue it and process asynchronously. Return a "request queued, result will be available shortly" response to the LLM.
In Spring Boot terms: this is @RateLimiter from Resilience4j + @Cacheable + @CircuitBreaker applied to a tool implementation instead of a service method.
