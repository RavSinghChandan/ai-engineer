# P3 — Mental Model
### Understand this in 2 minutes. Never forget it.

← [Back to README](./README.md)

---

## The Story: You're a Detective with Assistants

Imagine you're a detective. A client walks in with a complex case.

A **basic assistant** (P1 Plain LLM) would guess an answer from memory.

A **detective with tools** (P3 Agent) does this:

```
Client: "Who owns the building at 42 Elm St and what's the weather there?"
       ↓
Detective thinks: "I need two things: ownership data + weather data."
       ↓
Calls assistant 1: "Look up property records for 42 Elm St."
Calls assistant 2: "Check weather for that city." (at the same time)
       ↓
Both assistants return results
       ↓
Detective thinks: "Now I have everything I need."
       ↓
Gives the client a complete answer
```

**That's the ReAct loop. The LLM is the detective. Your functions are the assistants. TOOL_SCHEMAS is the list of assistants available.**

---

## The Two Parts of Every Tool

This is the most important concept in P3:

```
TOOL_SCHEMAS  ←  what the LLM reads
┌──────────────────────────────────┐
│  name: "get_weather"            │
│  description: "Get weather..."  │
│  parameters: {city: string}     │
└──────────────────────────────────┘
          ↓  LLM says "call this with {city: 'Mumbai'}"

TOOL_REGISTRY  ←  what actually runs
┌──────────────────────────────────┐
│  "get_weather": get_weather      │
│                    ↓            │
│  async def get_weather(city):   │
│      return requests.get(...)   │
└──────────────────────────────────┘
```

The LLM only sees the schema. It never sees the code. It tells you **what to call** — you call it.

---

## The ReAct Loop Mental Model

```
THINK:   LLM reads messages + tool schemas
         Decides: "I need get_weather"
         Returns: tool_calls = [{name: "get_weather", args: {city: "Mumbai"}}]

ACT:     Your code calls get_weather("Mumbai")
         Gets back: {"temp_c": 32, "condition": "Sunny"}

OBSERVE: Append result as role="tool" message
         LLM now sees the weather data

THINK:   LLM re-reads everything
         "I have enough. Final answer: Mumbai is 32°C and Sunny."
         Returns: tool_calls = None  ← EXIT CONDITION
```

The loop exits when `message.tool_calls` is `None`. That's the signal: the LLM is done acting.

---

## The 3 Safety Rules

| Rule | Why | How |
|---|---|---|
| `max_steps` limit | Prevent infinite loops | `for step in range(max_steps)` |
| `TOOL_REGISTRY` guard | Prevent unknown tool calls crashing | `if name not in TOOL_REGISTRY: return error` |
| Only SELECT in SQL tools | Prevent destructive queries | `if not query.upper().startswith("SELECT"): return error` |

---

## Parallel vs Sequential Tool Calls

The LLM can request multiple tools in ONE response:

```python
# One response, multiple tool_calls:
[
    {"name": "get_weather", "args": {"city": "Mumbai"}},
    {"name": "send_email",  "args": {"to": "alice@...", ...}},
]
```

**Run them in parallel:**
```python
await asyncio.gather(*[execute_tool_call(tc) for tc in tool_calls])
```

This is `asyncio.gather` in Python = `CompletableFuture.allOf()` in Java = `Promise.all()` in JavaScript. Same concept, different syntax.

---

## In One Sentence (interview answer)

> "Every tool has two parts: a JSON Schema (what the LLM reads — name, description, argument types) and a Python function in TOOL_REGISTRY (what actually runs). The ReAct loop sends messages + TOOL_SCHEMAS to the LLM; if the response has tool_calls, execute them with asyncio.gather for parallelism, append the results as role='tool' messages, and call the LLM again. Loop exits when tool_calls is None — the model has the final answer."

---

← [Back to README](./README.md) | [→ Flow](./flow.md) | [→ Cheatsheet](./cheatsheet.md)
