# Agentic AI Engineer — Interview Blueprint

> **Target:** Companies building autonomous AI workflows, multi-agent systems, AI copilots
> **Your job:** Show you understand how agents THINK, PLAN, and ACT — not just call APIs.

---

## The Core Mental Model

```
A regular chatbot:        User → Prompt → LLM → Answer

An agent:                 User → Goal
                               ↓
                          Agent thinks: "What steps do I need?"
                               ↓
                          Step 1: Use Tool A (search)
                               ↓
                          Step 2: Use Tool B (calculate)
                               ↓
                          Step 3: Use Tool C (write to DB)
                               ↓
                          Final answer grounded in real actions
```

**Key insight:** An agent is an LLM that has TOOLS and can LOOP until the goal is achieved.

---

## What Makes an Agentic AI Engineer Different

Regular AI engineers build **pipelines** (A → B → C).
Agentic AI engineers build **systems that can choose their own path** (A → ? → goal).

You must understand:
- How to give an LLM tools (function calling)
- How to design the agent's decision loop (ReAct, Plan-and-Execute)
- How to handle failures, loops, and dead ends in agent execution
- How to build multi-agent systems where agents collaborate

---

## Interview Rounds (Typical)

| Round | What They Test |
|-------|----------------|
| Technical 1 | Agents conceptually — ReAct, tool calling, memory types |
| Technical 2 | LangGraph — how to build a stateful agent graph |
| System Design | Multi-agent system design |
| Live Coding | Build an agent with tools + error recovery |
| Leadership | How you handle non-deterministic AI in production |

---

## Topics You MUST Know

### 🔴 MUST KNOW

| # | Topic | Study File |
|---|-------|------------|
| 1 | What is an agent? ReAct pattern deep dive | [Agentic AI](../../topics/03-agentic-ai/AGENTIC-AI.md) |
| 2 | Tool calling / Function calling | [Agentic AI](../../topics/03-agentic-ai/AGENTIC-AI.md) |
| 3 | LangGraph — nodes, edges, state, conditional routing | [Agentic AI](../../topics/03-agentic-ai/AGENTIC-AI.md) |
| 4 | Memory types in agents (short, long, episodic, semantic) | [Agentic AI](../../topics/03-agentic-ai/AGENTIC-AI.md) |
| 5 | Multi-agent architecture patterns | [Agentic AI](../../topics/03-agentic-ai/AGENTIC-AI.md) |
| 6 | Agent failures — loops, hallucinated tool calls, wrong plans | [Agentic AI](../../topics/03-agentic-ai/AGENTIC-AI.md) |
| 7 | LLM Core + Function calling spec | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |

### 🟡 SHOULD KNOW

| # | Topic | Study File |
|---|-------|------------|
| 8 | MCP (Model Context Protocol) | [Agentic AI](../../topics/03-agentic-ai/AGENTIC-AI.md) |
| 9 | Human-in-the-loop patterns | [Agentic AI](../../topics/03-agentic-ai/AGENTIC-AI.md) |
| 10 | RAG inside agents (retrieval as a tool) | [RAG Systems](../../topics/02-rag-systems/RAG-SYSTEMS.md) |
| 11 | Agent evaluation (task completion rate, tool accuracy) | [MLOps](../../topics/05-mlops/MLOPS.md) |
| 12 | Cost management for agentic loops | [MLOps](../../topics/05-mlops/MLOPS.md) |

---

## The Agent System Design Frame

When asked to design a multi-agent system:

```
1. GOAL DECOMPOSITION
   → How does the system break a user goal into sub-tasks?

2. AGENT ROSTER
   → What agents exist? What is each one's specialty?
   → Orchestrator agent? Specialist agents?

3. COMMUNICATION
   → How do agents talk to each other? (shared state vs messages)

4. TOOL REGISTRY
   → What tools does each agent have? (search, code exec, DB write)

5. MEMORY
   → Short-term (within task) vs long-term (across sessions)?

6. FAILURE HANDLING
   → What happens when an agent gets stuck?
   → Max iterations? Fallback to human?

7. OBSERVABILITY
   → How do you trace which agent did what, when, and why?
```

---

## The Questions That Define an Agentic AI Engineer

| Question | What You Need to Know |
|----------|-----------------------|
| "What is the difference between a chain and an agent?" | Chain = fixed sequence. Agent = dynamic loop with decisions. |
| "How does ReAct work?" | Think → Act → Observe → Repeat. Each loop is a reasoning step. |
| "How do you prevent an agent from looping forever?" | Max iterations, exit conditions, human escalation. |
| "How do you design agent memory?" | 4 types: buffer, summary, entity, vector (long-term). |
| "What is LangGraph and why not just LangChain?" | LangGraph = stateful graph for complex agent flows. LangChain is for linear chains. |
| "Multi-agent vs single agent — when to split?" | Split when tasks are independent and can run in parallel. |
| "How do you evaluate an agentic system?" | Task completion rate, step efficiency, tool accuracy, cost per task. |

---

*Role: Agentic AI Engineer | Level: 2–6 years | Updated: 2026-06-29*
