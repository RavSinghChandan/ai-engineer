# Agentic AI — Complete Interview Guide

> Agents are the hottest topic in AI right now. Every company hiring AI engineers in 2025–2026 will ask about this.

---

## CONCEPT 1: What is an AI Agent?

### WHAT
An AI agent is an LLM that can:
1. **Think** — reason about a goal
2. **Act** — use tools (search, code, APIs)
3. **Observe** — read the result of its action
4. **Loop** — repeat until the goal is achieved

```
Regular LLM:
User → Question → LLM → Answer (one shot)

AI Agent:
User → Goal
        ↓
     [THINK] What step should I take?
        ↓
     [ACT]   Call a tool (e.g., search the web)
        ↓
     [OBSERVE] Read the result
        ↓
     [THINK] Is the goal achieved?
        ↓ No
     [ACT]   Take next step (e.g., write to database)
        ↓
     [OBSERVE] Result looks good
        ↓ Yes
     Final Answer
```

### WHY Agents Exist
A single LLM call cannot:
- Browse the web for fresh information
- Run code and fix errors
- Write to a database
- Book a calendar event
- Chain multiple steps with dependencies

Agents CAN do all of this because they have **tools** and a **reasoning loop**.

### 📌 KEY POINT
> **Agent = LLM + Tools + Loop**
> Remove the tools → it's just a chatbot
> Remove the loop → it's just a chain
> All three together = agent

### 🇮🇳 DESI HOOK
> An agent is like a **chartered accountant during tax season**.
> You tell them: "File my taxes."
> They THINK: "I need to collect documents, fill forms, verify numbers, submit."
> They ACT: Call you for documents, run calculations, access the tax portal.
> They OBSERVE: "The portal says there's an error in Section 80C."
> They LOOP: Fix it, resubmit.
> You didn't manage any step. They figured it out. That's an agent.

---

## CONCEPT 2: The ReAct Pattern

### WHAT
ReAct = **Re**asoning + **Act**ing.
It is the most widely used pattern for building AI agents.

### HOW ReAct Works

```
At each step, the agent produces:
  THOUGHT:  "I need to find the current weather in Mumbai."
  ACTION:   search_tool("weather Mumbai today")
  OBSERVATION: "Temperature: 32°C, Humidity: 78%, Partly cloudy"
  
  THOUGHT:  "Now I have the weather. I can answer the user."
  FINAL ANSWER: "The current weather in Mumbai is 32°C, partly cloudy."
```

The key: **Thought** is visible to the LLM (it's in the prompt). **Action** triggers a real tool. **Observation** is the tool's response injected back into the prompt.

### The Prompt Structure (Simplified)

```
System: You are an agent. For each step, output THOUGHT, then ACTION, then wait for OBSERVATION.

User: What is the population of India and how has it changed in the last 5 years?

Agent: THOUGHT: I need to search for India's population and historical data.
       ACTION: search("India population 2024 2020 comparison")
       OBSERVATION: [search results injected here]
       
       THOUGHT: I have the data. Let me also get the 2019 number.
       ACTION: search("India population 2019")
       OBSERVATION: [search results injected here]
       
       THOUGHT: I now have all the data to answer.
       FINAL ANSWER: India's population in 2024 is 1.44B, up from 1.38B in 2019...
```

### ❓ FOLLOW-UP: How do you stop an agent from looping forever?

```python
# In LangChain:
agent = initialize_agent(
    tools=tools,
    llm=llm,
    max_iterations=10,      # hard stop after 10 loops
    early_stopping_method="generate"  # generate final answer even if not done
)

# In LangGraph:
# Use a conditional edge that checks iteration count
# or a timeout node
```

---

## CONCEPT 3: Tool Calling (Function Calling)

### WHAT
Tool calling = a formal way to let an LLM call external functions in a structured, reliable way.

### HOW

```python
# Define a tool as a function with a clear description:
def get_weather(city: str) -> str:
    """Get the current weather for a city. Input: city name. Output: weather string."""
    return weather_api.fetch(city)

# Register it with the LLM:
from langchain.agents import tool

@tool
def get_weather(city: str) -> str:
    """Get current weather for a given city."""
    return f"Weather in {city}: 32°C, sunny"

# The LLM now knows: I have a tool called get_weather that takes a city name.
# When it decides to use it, it outputs structured JSON:
# {"tool": "get_weather", "input": {"city": "Mumbai"}}
# Your code parses this and calls the function.
```

### WHY Function Calling is Better Than ReAct-style Text Parsing

| Text Parsing (old) | Function Calling (new) |
|-------------------|----------------------|
| LLM outputs: "Action: search" (text) | LLM outputs: `{"tool": "search", "input": {...}}` (JSON) |
| You parse with regex | You parse with JSON |
| Fragile, breaks easily | Reliable, structured |
| Hard to type-check | Can validate against schema |

### 📌 KEY POINT
> Modern agent frameworks (LangChain, LangGraph) use function calling.
> The LLM doesn't "talk about" using a tool — it outputs STRUCTURED JSON for the tool.

---

## CONCEPT 4: LangGraph — Building Stateful Agents

### WHAT
LangGraph is a framework for building agents as **directed graphs** where:
- **Nodes** = steps (LLM calls, tool calls, human input)
- **Edges** = transitions between steps
- **State** = shared memory that flows through the graph

### WHY LangGraph vs LangChain

```
LangChain Chains:   A → B → C  (fixed sequence, no branching)
LangGraph:          A → B → (C or D based on condition) → loop back to B if needed
```

LangGraph handles:
- Conditional routing (if X then go to node C, else go to node D)
- Loops (go back to the reasoning node if the answer is not good enough)
- Parallel execution (run Node A and Node B at the same time)
- State management (remember what happened in previous nodes)

### HOW — LangGraph Building Blocks

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
import operator

# 1. Define state
class AgentState(TypedDict):
    messages: Annotated[list, operator.add]
    tool_calls: list
    final_answer: str

# 2. Define nodes
def reasoning_node(state: AgentState):
    # LLM decides what to do next
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def tool_node(state: AgentState):
    # Execute the tool the LLM decided to call
    tool_result = execute_tool(state["tool_calls"][-1])
    return {"messages": [tool_result]}

def should_continue(state: AgentState):
    # Conditional: keep going or stop?
    last_message = state["messages"][-1]
    if last_message.has_tool_calls:
        return "tool_node"
    return END

# 3. Build the graph
graph = StateGraph(AgentState)
graph.add_node("reason", reasoning_node)
graph.add_node("tool", tool_node)
graph.add_edge("tool", "reason")  # always go back to reason after tool
graph.add_conditional_edges("reason", should_continue)
graph.set_entry_point("reason")

agent = graph.compile()
```

### The LangGraph Mental Model

```
┌──────────────────────────────────────────────────────────┐
│                  LANGGRAPH FLOW                          │
│                                                          │
│    START                                                 │
│      ↓                                                   │
│   [REASON] ──── has tool call? ──── YES ──→ [TOOL]      │
│      ↑                                          │        │
│      │                NO                        │        │
│      │                ↓                         │        │
│      └─────────────────────────────────────────┘        │
│                    [END]                                 │
└──────────────────────────────────────────────────────────┘
```

### 📌 KEY POINT
> LangGraph = state machine for AI. You draw the graph. The agent runs through it.
> This gives you CONTROL over the agent's behavior — something simple agents lack.

### 🇮🇳 DESI HOOK
> LangGraph is like a **government department process flow**.
> Application → Verification → (Pass → Approval) OR (Fail → Rejection)
> At each step, the STATE (your application file) carries all the info forward.
> Conditional routing decides where the file goes next.
> Human-in-the-loop = the section officer who needs to sign manually.

---

## CONCEPT 5: Multi-Agent Architecture

### WHAT
A multi-agent system is when multiple AI agents work together to complete a complex task.

### WHY Use Multiple Agents?

```
SINGLE AGENT problem:
Task: "Research competitors, write a report, create slides, and email it."
→ One agent doing everything → context overflow, poor specialization

MULTI-AGENT solution:
Agent 1 (Researcher) → Agent 2 (Writer) → Agent 3 (Designer) → Agent 4 (Emailer)
Each is specialized. Each has its own tools. Orchestrator coordinates.
```

### The 3 Multi-Agent Patterns

```
1. SUPERVISOR PATTERN:
   ┌──────────────┐
   │ ORCHESTRATOR │  ← decides which agent to call next
   └──────┬───────┘
   ┌──────┼──────┐
   ↓      ↓      ↓
[AgentA] [AgentB] [AgentC]

2. PIPELINE PATTERN:
   A → B → C → D  (each agent feeds into the next)
   Like an assembly line

3. DEBATE PATTERN:
   Agent A proposes answer
   Agent B critiques it
   Agent A revises
   → Better quality through adversarial review
```

### ❓ FOLLOW-UP: When to use multi-agent?

Use when:
- Tasks are clearly separable (research vs write vs review)
- Tasks can run in PARALLEL (save time)
- A single agent would overflow its context window
- Different tasks need different tools/permissions

Do NOT use when:
- Task is simple (over-engineering adds latency + cost)
- Agents need tight coupling (communication overhead kills you)

---

## CONCEPT 6: Agent Memory Types

### WHAT
Agents need to remember things. There are 4 types of memory:

```
┌─────────────────────────────────────────────────────────┐
│                  AGENT MEMORY TYPES                     │
│                                                         │
│  1. SHORT-TERM (Buffer Memory)                         │
│     → Last N messages in context window                │
│     → Fast, but forgotten when context ends            │
│                                                         │
│  2. SUMMARY MEMORY                                     │
│     → Summarize old conversation → keeps essence       │
│     → Compresses long conversations to fit context     │
│                                                         │
│  3. ENTITY MEMORY                                      │
│     → Remember KEY FACTS about entities                │
│     → "User: Chandan. Role: AI Engineer. City: Pune"   │
│                                                         │
│  4. VECTOR MEMORY (Long-term)                         │
│     → Store past conversations in vector DB            │
│     → Retrieve relevant past info at query time        │
│     → Works like RAG but for conversation history      │
└─────────────────────────────────────────────────────────┘
```

### 📌 KEY POINT
> Memory type choice depends on: How long is the conversation? What needs to persist across sessions?
> Short tasks → buffer. Long tasks → summary + entity. Persistent assistants → vector memory.

---

## CONCEPT 7: MCP (Model Context Protocol)

### WHAT
MCP is an open standard (by Anthropic, 2024) for connecting AI agents to external tools and data sources.

Think of it as: **USB for AI** — a universal connector.

### WHY MCP Exists
Before MCP: Every AI app had to build its own custom integration for every tool (Google Drive, Slack, GitHub, databases).
After MCP: Build ONE MCP server → any MCP-compatible agent can connect to it.

### HOW

```
┌──────────────────────────────────────────────────────┐
│                 MCP ARCHITECTURE                     │
│                                                      │
│  [MCP Client]          [MCP Server]                  │
│  (Claude, GPT,    ←──→  (Your tool: DB, API,        │
│   your agent)           file system, Slack)          │
│                                                      │
│  Client says: "list tools"                          │
│  Server says: "I have: read_file, write_file,       │
│                query_database, send_slack"           │
│  Client picks tool, sends structured call           │
│  Server executes, returns result                    │
└──────────────────────────────────────────────────────┘
```

### 📌 KEY POINT
> MCP = standardized way for agents to discover and use tools.
> As an AI engineer in 2025–2026, knowing MCP architecture is a differentiator.

---

*Topic: Agentic AI | Updated: 2026-06-29*
