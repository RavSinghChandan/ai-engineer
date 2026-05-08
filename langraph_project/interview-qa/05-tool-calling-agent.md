
---

# 🔷 Tool Calling in LangGraph — Complete Interview Answer

## ✅ Core Answer (Use this in interview)

**WHAT (What is tool calling?)**
Tool calling is the mechanism where the **LLM decides which function to invoke** and with what arguments — the framework then executes that function and feeds the result back to the LLM. The LLM never executes code directly; it outputs a structured JSON request.

---

**WHY (Why needed?)**
LLMs have no access to real-time data:
* Account balances change every second
* Transaction history is live
* LLM cannot know these without calling an API

Tool calling bridges **LLM reasoning with live backend systems**.

---

**HOW (How it works?)**

1. Bind tools to the LLM: `llm.bind_tools(ACCOUNT_TOOLS)`
2. LLM receives user query → decides which tool to call
3. LLM returns `AIMessage` with `tool_calls` field (JSON)
4. `tool_node` executes each tool → returns `ToolMessage` with result
5. Messages (including tool results) go back to LLM
6. LLM generates final answer using tool output

---

**WHERE (Where used?)**

* Account balance and transaction lookup
* Credit bureau API calls
* Payment gateway checks
* Any situation where LLM needs live data

---

**WHEN (When to use tool calling?)**

* When the LLM needs real, current data
* When the answer depends on a function call (not static knowledge)
* When multiple data sources may be needed dynamically

---

**IMPACT (Why it matters in production?)**

* Transforms LLM from a **static text generator** into a **system that interacts with real data**
* Enables natural language interfaces to backend APIs
* Reduces hallucination — LLM uses actual data, not guesses
* Critical for banking: account info must be accurate, not estimated

---

## 🔷 Key Concepts (Interview Deep Dive)

### 🔹 Tool Definition (CRITICAL)

```python
@tool
def get_account_details(account_id: str) -> dict:
    """Get full account details including balance, type, and status.
    Use when the user asks about their account information."""
    return MOCK_ACCOUNTS.get(account_id, {"error": "Account not found"})
```

**The docstring IS the tool description that the LLM reads.**
Poor description = LLM picks the wrong tool.
Write descriptions as if explaining to a human assistant.

---

### 🔹 `bind_tools()`

```python
llm_with_tools = ChatOpenAI(...).bind_tools([get_account_details, get_transactions])
```

This tells the LLM what tools are available and their schemas.
The LLM can now output `tool_calls` in its response.

---

### 🔹 ReAct Loop in LangGraph

```
inject_context
     │
agent_node (LLM call — may produce tool_calls)
     │
     ├── (has tool_calls?) → tool_node → agent_node (loop)
     │
     └── (no tool_calls?) → END
```

The loop continues until the LLM is satisfied with the data it has.
**Conditional edge** on `isinstance(last_message, AIMessage) and last_message.tool_calls`.

---

### 🔹 ToolMessage

After executing a tool, result is wrapped in `ToolMessage`:
```python
ToolMessage(
    content=json.dumps(result),
    tool_call_id=call["id"],  # must match the AIMessage tool_call id
    name=tool_name,
)
```
The LLM uses `tool_call_id` to correlate result with its request.

---

### 🔹 Tool Execution Map

```python
_TOOL_MAP = {t.name: t for t in ACCOUNT_TOOLS}

tool_fn = _TOOL_MAP.get(tool_name)
result = tool_fn.invoke(tool_args)
```

Map tool names to functions — execute by name from the LLM's request.

---

### 🔹 Message History

The full conversation (including tool calls and results) is stored in `messages` state:
```
SystemMessage → HumanMessage → AIMessage(tool_calls) → ToolMessage → AIMessage(final answer)
```
The LLM sees the complete history on every call — this is how it synthesizes the final answer.

---

## 🔥 Real-World (Banking Example)

### Account Intelligence Agent

User: *"What is my balance and show my last 3 transactions?"*

```
Turn 1:
LLM receives: "Account ACC-001. User question: balance and last 3 transactions"
LLM decides: call get_account_details(account_id="ACC-001")
                  AND get_transactions(account_id="ACC-001", limit=3)

Tool results:
  get_account_details → {"balance": 45230.50, "type": "checking", "status": "active"}
  get_transactions    → [{"date": "2024-01-15", "amount": -500, "desc": "Rent"}...]

Turn 2:
LLM synthesizes: "Your checking account balance is $45,230.50. Your last 3 transactions are:
                   1. Rent payment -$500 (Jan 15)..."
```

Two tool calls in one turn — LLM requests both simultaneously.

---

## 🔥 5 High-Impact Follow-Up Questions (with answers)

### 1. How does the LLM know which tool to call?

The LLM reads the tool name + description + input schema.
It uses its reasoning to match the user's intent to the best tool.
Better tool descriptions = better tool selection.

---

### 2. What if the LLM calls a tool with wrong arguments?

Tool validation catches it (Pydantic input schema).
Tool returns `{"error": "invalid account_id format"}`.
This error goes back to the LLM as a ToolMessage → LLM retries with corrected args.

---

### 3. What prevents the agent from looping forever?

The conditional edge only routes to `tool_node` if `last_message.tool_calls` is non-empty.
Once LLM generates a response without tool calls → edge routes to `END`.
Also: implement a max-turn counter in state as a safety net.

---

### 4. Can the LLM call multiple tools in one turn?

Yes — OpenAI function calling supports **parallel tool calls**.
LLM outputs multiple tool_calls in one AIMessage.
`tool_node` executes all of them and returns multiple ToolMessages.

---

### 5. How do you handle tool failures?

```python
try:
    output = tool_fn.invoke(tool_args)
except Exception as exc:
    output = {"error": str(exc)}
```
Wrap in try/except and return error dict.
LLM receives the error, can inform the user or try a different tool.

---

## 🔥 Advanced Follow-Up Questions (with answers)

### 1. What is the difference between `tool.invoke()` and `tool.run()`?

`invoke()` is the modern LangChain Runnable interface — handles input/output validation.
`run()` is the legacy method — avoid in new code.

---

### 2. How do you add input validation to a tool?

Define the input as a Pydantic model:
```python
class GetTransactionsInput(BaseModel):
    account_id: str = Field(..., description="Account identifier starting with ACC-")
    limit: int = Field(default=10, ge=1, le=100)
```
LangChain automatically validates inputs before execution.

---

### 3. What is the security risk of tool calling in banking?

An LLM could be manipulated (prompt injection) to call `transfer_funds` with attacker's account.
Mitigation: restrict which tools are available based on user role, validate account_id against session user.

---

### 4. How do you limit which tools an agent can use based on user role?

```python
def get_tools_for_role(role: str) -> list:
    if role == "customer":
        return [get_account_details, get_transactions]  # read-only
    if role == "officer":
        return [get_account_details, get_transactions, approve_loan]
```
Build the tool list at request time, not compile time.

---

### 5. What is idempotency and why does it matter in tool calling?

An idempotent tool called twice produces the same result with no side effects.
`get_balance()` = idempotent (safe to retry).
`transfer_funds()` = NOT idempotent (calling twice doubles the transfer).
Implement idempotency keys for non-idempotent tools in banking.

---

## 🔥 Design Practice

### ❌ Bad Tool Description

```python
@tool
def get_acct(id: str):
    """Get account."""
```
Vague description → LLM doesn't know when to use it.

---

### ✅ Good Tool Description

```python
@tool
def get_account_details(account_id: str) -> dict:
    """Retrieve complete account information including current balance, account type
    (checking/savings), status (active/frozen/closed), and account holder name.
    Use this when the user asks about their account balance, account type, or account status."""
```

---

### ❌ Bad Error Handling

```python
result = tool_fn.invoke(args)  # crashes on error
```

---

### ✅ Good Error Handling

```python
try:
    result = tool_fn.invoke(args)
except Exception as e:
    result = {"error": str(e), "tool": tool_name}
# LLM handles the error gracefully
```

---

## 🔥 Security (Banking Critical)

### 🔹 Risks

* Prompt injection: user manipulates LLM to call unauthorized tools
* Tool leakage: tool descriptions reveal internal API structure
* Unauthorized data access: LLM calls tool with another user's account_id

---

### 🔹 Prevention

* Validate `account_id` from session token — never trust LLM-provided account IDs
* Role-based tool sets — customers can't access admin tools
* Log every tool call with user ID, timestamp, arguments
* Tool input validation via Pydantic schemas
* Rate limit tool calls per user per minute

---

## 🔥 Summary (Interview Revision)

* Tool calling = LLM decides which function to call, framework executes it
* Bind tools with `llm.bind_tools([...])`
* LLM outputs structured `tool_calls` in AIMessage
* `tool_node` executes tools, returns ToolMessages
* ReAct loop: agent → tools → agent → tools → ... → END
* Conditional edge on `last_message.tool_calls` controls the loop
* Tool descriptions are critical — LLM reads them to choose tools
* Parallel tool calls — LLM can request multiple tools in one turn
* Validate tool inputs with Pydantic models
* Never trust LLM-provided identifiers — validate against session
* Idempotency required for non-read-only tools
* Core pattern: Account Intelligence Agent, Payment Systems

---
