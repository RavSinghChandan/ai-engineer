# Python for AI Engineering — Phase 4
# Lesson 5: AI Agent Patterns — Tools, Callable Agents, Orchestration Loops, State Passing

---

## 1. Intuition (Java Anchor)

Java: a service layer calls other services in a defined sequence — `CVService.analyze()` calls `EmbeddingService.embed()` then `MatchingService.match()`. The call graph is hardcoded by the developer.

An AI agent inverts this: the LLM decides which service to call next, in what order, with what arguments. The developer defines the available tools; the LLM reasons about which ones to use.

| Java Pattern | AI Agent Equivalent |
|---|---|
| `switch (action) { case "search": ... }` | Tool dispatch based on LLM response |
| `interface Tool { execute(args); }` | Tool definition with schema |
| `List<Tool> registry = new ArrayList<>()` | Tool list passed to LLM |
| `while (!done) { step(); }` | Agent loop: observe → think → act |
| `Map<String, Object> context` | Agent state / memory dict |
| `CompletableFuture.thenCompose()` | Sequential agent steps |
| `@FunctionalInterface` | Python `Callable[[dict], str]` |
| `Optional<String> result` | Tool return: success or error string |

---

## 2. Tool Definition — Schema + Implementation

```python
# An AI agent tool has two parts:
# 1. Schema — tells the LLM what the tool does and what arguments it takes
# 2. Implementation — the actual Python function that runs

from typing import Callable, Any
from dataclasses import dataclass
import json

@dataclass
class Tool:
    name: str
    description: str
    parameters: dict        # JSON Schema — LLM uses this to build the call
    func: Callable          # actual implementation

# Tool definitions — passed to LLM in the API call:
search_cv_tool = {
    "type": "function",
    "function": {
        "name": "search_cv_database",
        "description": "Search the CV database for candidates matching a query",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language search query, e.g. 'Python developer 5 years FastAPI'",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 5)",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
}

match_role_tool = {
    "type": "function",
    "function": {
        "name": "match_candidate_to_role",
        "description": "Calculate how well a candidate matches a job role based on their CV",
        "parameters": {
            "type": "object",
            "properties": {
                "candidate_id": {"type": "string", "description": "Candidate user_id"},
                "role_id":      {"type": "string", "description": "Target role identifier"},
            },
            "required": ["candidate_id", "role_id"],
        },
    },
}

# Tool implementations:
def search_cv_database(query: str, limit: int = 5) -> str:
    """Actual search implementation — returns JSON string."""
    results = vector_store.search(embed_query(query), k=limit)
    return json.dumps([r["metadata"] for r in results])

def match_candidate_to_role(candidate_id: str, role_id: str) -> str:
    profile = load_profile(candidate_id)
    role    = load_role(role_id)
    score   = calculate_match(profile, role)
    return json.dumps({"candidate_id": candidate_id, "role_id": role_id, "score": score})

# Tool registry (Java: Map<String, Tool>):
TOOL_REGISTRY: dict[str, Callable] = {
    "search_cv_database":     search_cv_database,
    "match_candidate_to_role": match_candidate_to_role,
}
```

---

## 3. ReAct Agent Loop — Observe → Think → Act

```python
# ReAct pattern: Reasoning + Acting
# The LLM thinks about what to do, calls a tool, gets the result, thinks again
# Java analogy: while loop where each iteration is: read state, compute next action, execute

from openai import AsyncOpenAI
import json

async_client = AsyncOpenAI()

async def run_agent(user_query: str, max_steps: int = 10) -> str:
    """
    ReAct loop — LLM reasons and calls tools until it has an answer.
    Java: while (!done && steps < max) { step = agent.think(); execute(step); }
    """
    messages = [
        {
            "role": "system",
            "content": (
                "You are an AI assistant for a bench resource optimizer. "
                "Use the available tools to answer the user's question. "
                "Call tools as needed, then provide a final answer."
            ),
        },
        {"role": "user", "content": user_query},
    ]
    tools = [search_cv_tool, match_role_tool]

    for step in range(max_steps):
        # Think — LLM decides what to do:
        response = await async_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=tools,
            tool_choice="auto",   # LLM decides: call a tool or answer directly
        )
        message = response.choices[0].message
        messages.append(message)   # add LLM message to history

        # Done — LLM answered directly without calling a tool:
        if message.tool_calls is None:
            return message.content

        # Act — execute each tool call:
        for tool_call in message.tool_calls:
            tool_name = tool_call.function.name
            tool_args = json.loads(tool_call.function.arguments)

            # Dispatch to implementation (Java: switch/map dispatch):
            if tool_name not in TOOL_REGISTRY:
                tool_result = json.dumps({"error": f"Unknown tool: {tool_name}"})
            else:
                try:
                    tool_result = TOOL_REGISTRY[tool_name](**tool_args)
                except Exception as e:
                    tool_result = json.dumps({"error": str(e)})

            # Feed result back to LLM:
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": tool_result,
            })

    return "Agent reached maximum steps without completing the task."
```

---

## 4. Agent State — Passing Context Between Steps

```python
# Agent needs to remember what it has done and what it learned
# Java: pass a Map<String, Object> context through the service chain

from dataclasses import dataclass, field
from typing import Any
import time

@dataclass
class AgentState:
    """Mutable context passed through agent steps."""
    session_id: str
    user_id: str
    query: str
    messages: list[dict] = field(default_factory=list)
    tool_calls_made: list[str] = field(default_factory=list)
    retrieved_chunks: list[dict] = field(default_factory=list)
    intermediate_results: dict[str, Any] = field(default_factory=dict)
    start_time: float = field(default_factory=time.perf_counter)
    step_count: int = 0

    def add_message(self, role: str, content: str) -> None:
        self.messages.append({"role": role, "content": content})

    def record_tool_call(self, tool_name: str, result: Any) -> None:
        self.tool_calls_made.append(tool_name)
        self.intermediate_results[tool_name] = result

    @property
    def elapsed_ms(self) -> float:
        return (time.perf_counter() - self.start_time) * 1000

# Stateful agent loop:
async def run_stateful_agent(user_id: str, query: str) -> dict:
    state = AgentState(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        query=query,
    )
    state.add_message("system", "You are a bench optimizer assistant.")
    state.add_message("user", query)

    final_answer = await execute_agent_loop(state)

    return {
        "answer": final_answer,
        "session_id": state.session_id,
        "steps": state.step_count,
        "tools_used": state.tool_calls_made,
        "elapsed_ms": round(state.elapsed_ms),
    }
```

---

## 5. Parallel Tool Calls

```python
# OpenAI can request multiple tool calls in a single response
# Execute them in parallel — Java: CompletableFuture.allOf()

import asyncio

async def execute_tool_calls_parallel(
    tool_calls: list,
    registry: dict[str, Callable],
) -> list[dict]:
    """Execute all tool calls concurrently."""

    async def run_one(tool_call) -> dict:
        tool_name = tool_call.function.name
        tool_args = json.loads(tool_call.function.arguments)
        try:
            # If the tool is async, await it; if sync, run in thread pool:
            func = registry.get(tool_name)
            if func is None:
                result = json.dumps({"error": f"Unknown tool: {tool_name}"})
            elif asyncio.iscoroutinefunction(func):
                result = await func(**tool_args)
            else:
                # Run sync function in thread pool to not block event loop:
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(None, lambda: func(**tool_args))
        except Exception as e:
            result = json.dumps({"error": str(e)})

        return {
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": result,
        }

    # Run all tool calls concurrently (Java: CompletableFuture.allOf(...).join()):
    return await asyncio.gather(*[run_one(tc) for tc in tool_calls])
```

---

## 6. Structured Agent Output

```python
# Force agent to return structured final answer — not free-form text
# Java: annotate return type and validate with Jackson

from pydantic import BaseModel
from openai import AsyncOpenAI

async_client = AsyncOpenAI()

class AgentAnswer(BaseModel):
    conclusion: str
    top_candidates: list[str]
    recommended_action: str
    confidence: float

async def run_structured_agent(query: str) -> AgentAnswer:
    """Agent that returns a validated, typed response."""
    # Step 1: run tool-calling loop until no more tool calls
    messages = [
        {"role": "system", "content": "Analyze bench resources. Return structured JSON."},
        {"role": "user", "content": query},
    ]

    for _ in range(10):
        response = await async_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=[search_cv_tool, match_role_tool],
        )
        message = response.choices[0].message
        messages.append(message)

        if message.tool_calls is None:
            break   # LLM is done with tool calls

        tool_results = await execute_tool_calls_parallel(message.tool_calls, TOOL_REGISTRY)
        messages.extend(tool_results)

    # Step 2: force structured output from the collected context
    structured_response = await async_client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=messages + [
            {"role": "user", "content": "Now summarize your findings as structured JSON."}
        ],
        response_format=AgentAnswer,
    )
    return structured_response.choices[0].message.parsed
```

---

## 7. Simple Sequential Agent (Chain)

```python
# Not every AI workflow needs a full ReAct loop
# A linear pipeline — step 1 → step 2 → step 3 — is simpler and more predictable
# Java analogy: a service method that calls other services in sequence

async def run_cv_analysis_chain(cv_text: str, target_role: str) -> dict:
    """
    Sequential chain — each step builds on the previous.
    Java: service method calling sub-services in order.
    """
    llm = AsyncOpenAI()

    # Step 1: extract structured profile from CV
    profile_response = await llm.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "Extract structured CV data."},
            {"role": "user",   "content": cv_text},
        ],
        response_format=CVProfile,
    )
    profile: CVProfile = profile_response.choices[0].message.parsed

    # Step 2: match against target role
    match_prompt = (
        f"Skills: {profile.skills}\n"
        f"Experience: {profile.experience_years} years\n"
        f"Target role: {target_role}\n"
        "Calculate match percentage and list matched/missing skills."
    )
    match_response = await llm.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[{"role": "user", "content": match_prompt}],
        response_format=RoleMappingOutput,
    )
    mapping: RoleMappingOutput = match_response.choices[0].message.parsed

    # Step 3: generate recommendation
    rec_prompt = (
        f"Candidate: {profile.name}, match: {mapping.match_percentage}%\n"
        f"Missing: {mapping.missing_skills}\n"
        "Write a 2-sentence hiring recommendation."
    )
    recommendation = (await llm.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": rec_prompt}],
        temperature=0.3,
    )).choices[0].message.content

    return {
        "profile": profile.model_dump(),
        "mapping": mapping.model_dump(),
        "recommendation": recommendation,
    }
```

---

## 8. Interview Anchor

**"How do you design an AI agent in Python for a production system?"**

Say:
> "Two patterns depending on complexity. For predictable workflows — extract CV, match role, generate recommendation — I use a sequential chain: three LLM calls in order, each with a Pydantic response model for type safety. For open-ended tasks where the LLM needs to decide what to do — find the right candidate for a vague request like 'who can we staff on the new Angular project next week?' — I use a ReAct loop: the LLM sees a system prompt, the user query, and a list of tool schemas in JSON Schema format; it calls tools by returning a `tool_calls` object, I execute them and feed results back as `role: tool` messages, then it reasons again. Key safety rails: `max_steps` to prevent infinite loops, structured final output with `beta.chat.completions.parse`, and never call a tool whose name isn't in my `TOOL_REGISTRY` — unknown tool names return an error message instead of raising. The mental model from Java is: the tool registry is your Spring service layer; the agent loop is your controller that decides which services to call."

---

## 9. Quick Reference

```python
# Tool definition (schema for LLM)
tool = {
    "type": "function",
    "function": {
        "name": "tool_name",
        "description": "what it does",
        "parameters": {
            "type": "object",
            "properties": {"arg": {"type": "string", "description": "..."}},
            "required": ["arg"],
        },
    },
}

# LLM call with tools
response = await client.chat.completions.create(
    model="gpt-4o",
    messages=messages,
    tools=[tool1, tool2],
    tool_choice="auto",   # "none" = no tools, "required" = must call one
)
message = response.choices[0].message
if message.tool_calls:               # LLM wants to call tools
    for tc in message.tool_calls:
        name = tc.function.name
        args = json.loads(tc.function.arguments)
        result = REGISTRY[name](**args)
        messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
else:                                # LLM has a final answer
    answer = message.content

# Parallel tool execution
results = await asyncio.gather(*[run_tool(tc) for tc in tool_calls])

# Agent state
@dataclass
class AgentState:
    messages: list[dict] = field(default_factory=list)
    tool_calls_made: list[str] = field(default_factory=list)
    intermediate_results: dict = field(default_factory=dict)

# Java comparison
# Tool schema                → interface Tool { String execute(Map<String,Object> args); }
# TOOL_REGISTRY dict         → Map<String, Tool> services
# ReAct while loop           → while (!done) { step = agent.decide(); execute(step); }
# tool_choice="auto"         → LLM decides vs @Autowired hardcoded call
# AgentState dataclass       → Map<String, Object> context passed through chain
# max_steps guard            → circuit breaker / max-retry limit
# asyncio.gather(tool_calls) → CompletableFuture.allOf(...)
```
