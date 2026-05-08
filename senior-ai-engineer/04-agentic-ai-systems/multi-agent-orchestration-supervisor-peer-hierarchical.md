# Senior AI Engineer — Module 4
# Topic: Multi-Agent Orchestration — Supervisor, Peer, Hierarchical

---

## 1. Intuition

Single agents hit a ceiling: one context window, one reasoning thread, one failure point.
Multi-agent systems distribute work — each agent specializes, agents work in parallel, and one failure does not collapse the whole system.

Senior engineers choose multi-agent patterns based on the coordination model the task demands, not because multi-agent sounds impressive.

---

## 2. Core Concept

### Supervisor Pattern
One orchestrator agent assigns tasks to worker agents and synthesizes their outputs.
- Supervisor decides which worker to use and in what order
- Workers are specialists — each does one thing well
- Supervisor aggregates results into a final answer

```
User Request
    ↓
Supervisor Agent (decides routing + synthesis)
    ├── Web Search Agent
    ├── Code Execution Agent
    └── Document RAG Agent
    ↓
Supervisor synthesizes results → Final Answer
```

### Peer / Network Pattern
Multiple agents with equal authority collaborate without a central orchestrator.
- Each agent can invoke other agents
- No single point of control or failure
- Risk: circular invocations, diffusion of responsibility

Use only when tasks are truly lateral — no natural hierarchy.

### Hierarchical Pattern
Multiple levels of orchestration — supervisor of supervisors.
- Top-level planner breaks problem into sub-tasks
- Mid-level coordinators manage sub-task agents
- Leaf agents execute atomic operations

```
Planner Agent
    ├── Research Coordinator
    │   ├── Search Agent A
    │   └── Search Agent B
    └── Writing Coordinator
        ├── Draft Agent
        └── Edit Agent
```

Use for complex, long-horizon tasks requiring many parallel work streams.

### Parallel Agents (Map-Reduce)
Same task type, different inputs, run in parallel, outputs merged.
- No coordination needed between agents — they are independent
- Coordinator only needed at the merge step

```
[doc1] → Agent → summary1
[doc2] → Agent → summary2  →  Merge Agent → Final Summary
[doc3] → Agent → summary3
```

This is the pattern used in AstroIntel.

---

## 3. Why / When to Use

| Pattern | Use When | Avoid When |
|---|---|---|
| Supervisor | Tasks require routing to specialists; synthesis needed | All tasks are identical — use parallel instead |
| Peer | True lateral collaboration with no natural hierarchy | Risk of circular invocation is present |
| Hierarchical | Very complex, long-horizon tasks with many sub-tasks | Overhead exceeds benefit for simple tasks |
| Parallel (Map-Reduce) | Same task, multiple independent inputs | Tasks are interdependent and must share state |

---

## 4. How It Works (Production Multi-Agent with LangGraph)

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
import operator
from concurrent.futures import ThreadPoolExecutor

# Parallel agent pattern (AstroIntel model)
class MultiAgentState(TypedDict):
    user_query: str
    birth_profile: dict
    agent_outputs: Annotated[dict, lambda a, b: {**a, **b}]  # merge dicts
    consensus: dict | None
    final_answer: str | None

def run_astrology_agent(state: MultiAgentState) -> MultiAgentState:
    result = call_llm(
        system_prompt="You are a Vedic astrology expert...",
        user_message=f"Birth profile: {state['birth_profile']}\nQuestion: {state['user_query']}"
    )
    return {"agent_outputs": {"astrology": parse_insight(result)}}

def run_numerology_agent(state: MultiAgentState) -> MultiAgentState:
    result = call_llm(
        system_prompt="You are a numerology expert...",
        user_message=f"Birth profile: {state['birth_profile']}\nQuestion: {state['user_query']}"
    )
    return {"agent_outputs": {"numerology": parse_insight(result)}}

def run_consensus_agent(state: MultiAgentState) -> MultiAgentState:
    outputs = state["agent_outputs"]
    high_count = sum(1 for o in outputs.values() if o.get("confidence") == "HIGH")
    confidence = "HIGH" if high_count >= 3 else "MEDIUM" if high_count >= 2 else "LOW"
    return {"consensus": {"confidence": confidence, "agreeing_domains": high_count}}

# Build graph
graph = StateGraph(MultiAgentState)
graph.add_node("astrology", run_astrology_agent)
graph.add_node("numerology", run_numerology_agent)
graph.add_node("consensus", run_consensus_agent)

# Parallel execution: both domain agents run independently
graph.set_entry_point("astrology")
graph.add_edge("astrology", "consensus")
graph.add_edge("numerology", "consensus")
graph.add_edge("consensus", END)

# For true parallelism, run outside graph with ThreadPoolExecutor
def run_parallel_agents(state: MultiAgentState) -> MultiAgentState:
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            "astrology": executor.submit(run_astrology_agent, state),
            "numerology": executor.submit(run_numerology_agent, state),
            "palmistry": executor.submit(run_palmistry_agent, state),
            "tarot": executor.submit(run_tarot_agent, state),
            "vastu": executor.submit(run_vastu_agent, state),
        }
        agent_outputs = {}
        for name, future in futures.items():
            try:
                result = future.result(timeout=30)
                agent_outputs[name] = result["agent_outputs"][name]
            except Exception as e:
                logger.error(f"Agent {name} failed: {e}")
                agent_outputs[name] = {"confidence": "LOW", "insight": "Analysis unavailable"}
    return {"agent_outputs": agent_outputs}

# Supervisor pattern
def supervisor_agent(state: dict) -> dict:
    available_agents = ["web_search", "document_rag", "code_executor", "calculator"]
    decision = call_llm(
        system_prompt=f"You are an orchestrator. Available agents: {available_agents}. Decide which agent to call next. Return JSON: {{\"agent\": \"name\", \"input\": \"...\", \"done\": false}}",
        user_message=f"Task: {state['task']}\nPrevious results: {state['results']}"
    )
    return {"next_action": parse_json(decision)}
```

---

## 5. Example (From Your Projects)

**AstroIntel — Parallel Map-Reduce Multi-Agent:**

5 domain agents run in parallel with ThreadPoolExecutor(max_workers=5).
This is the Map phase: each agent independently analyzes the same birth profile for its domain.

The Reduce phase: Meta Consensus Agent merges all 5 outputs.
- 3+ agents with HIGH confidence → overall HIGH
- 2 agents with HIGH → MEDIUM
- 1 or fewer → LOW

Key design decisions:
1. Agents are stateless — they receive inputs, produce outputs, share no state
2. Parallel execution cut wall time from ~6 minutes (sequential) to ~15 seconds (parallel)
3. Each agent fails independently — if Tarot agent fails, the other 4 still contribute
4. Consensus uses a majority-voting model — one failed/hallucinating agent cannot poison the final answer

In interview: "AstroIntel uses a parallel map-reduce multi-agent architecture. Five independent specialist agents run concurrently, each reasoning about the user's question from a different domain. The consensus agent synthesizes their outputs with a confidence voting model. This is not just elegant — it directly addressed our hallucination problem because one agent hallucinating cannot dominate the final answer."

---

## 6. Trade-offs

Single agent vs multi-agent:
+ Single agent: simpler, lower cost, no inter-agent coordination
- Single agent: one context window limit, one failure point, no parallelism

Parallel agents:
+ Massively reduces wall time, independent failures, domain specialization
- Higher token cost (N agents × tokens per agent), requires merge logic

Supervisor:
+ Dynamic routing, flexible to new agent types
- Supervisor itself can fail or make wrong routing decisions

Hierarchical:
+ Handles complex long-horizon tasks
- High overhead, harder to debug, many failure points

---

## 7. Interview Questions (Senior Level)

- Explain the supervisor pattern and when you would use it over parallel agents.
- How do you handle partial failure in a multi-agent system where 2 of 5 agents fail?
- How do you prevent agents from passing contradictory information to each other?
- What is the cost implication of running 5 parallel LLM agents vs 1 sequential agent?
- How does the consensus pattern reduce hallucination in multi-agent systems?

---

## 8. Answer Framework

Step 1 — Choose the right coordination model:
"I choose multi-agent patterns based on the coordination need: parallel map-reduce for independent same-type tasks, supervisor for dynamic routing to specialists, hierarchical for complex multi-phase tasks."

Step 2 — From your project:
"In AstroIntel, I used parallel map-reduce — 5 independent domain agents running concurrently, results merged by a consensus agent. This cut wall time from 6 minutes to 15 seconds."

Step 3 — Failure handling:
"Each agent fails independently. The consensus agent handles missing outputs gracefully — fewer inputs means lower confidence, but the system still returns a result."

Step 4 — Cost awareness:
"5 parallel agents cost 5× a single agent in tokens. The trade-off is justified: 5× cost for 24× speed improvement and hallucination reduction through consensus."

Step 5 — Design principle:
"Agents should be stateless and share nothing. All coordination happens through the state object that flows between them, not through direct agent-to-agent calls."

---

## 9. Advanced Follow-ups

Q1: How do you prevent agent communication from growing into a context explosion?

Answer:
Each agent should write minimal, structured outputs to shared state — not dump its entire reasoning.
In AstroIntel: each domain agent writes a JSON object with 4 fields (insight, confidence, timing, remedy). The consensus agent reads those 4 fields from 5 agents = 20 data points. Small, manageable.
If each agent instead wrote its full reasoning (500 tokens of thoughts) + output, the consensus agent would receive 2,500 tokens of agent outputs — growing the context significantly.
The rule: agents are black boxes to each other. They communicate through structured contracts (defined schema), not free-form text.
In LangGraph: define the state schema with specific typed fields. Each agent only reads and writes the fields it needs. This prevents context bleed between agents.

---

Q2: How do you coordinate agents that have dependencies — Agent B needs Agent A's output?

Answer:
In LangGraph, this is a directed edge: A → B. Agent B's node runs after Agent A's node, and reads A's output from the shared state.
For a chain: A → B → C, each reads the previous agent's output from state.
For a fan-out-fan-in (parallel then merge): A runs in parallel with B and C, then D runs after all three complete. In LangGraph, this requires a synchronization node — D waits until all upstream outputs are written to state.
The key is that dependencies are defined in the graph topology, not in the agent's code. Agent B should not know it is downstream of Agent A — it just reads its required inputs from state. The graph structure enforces the ordering.
This is the same principle as a build system (Maven, Gradle) — each task declares its inputs and outputs, the build system figures out the execution order.

---

Q3: A multi-agent system is producing inconsistent answers across runs. What do you investigate?

Answer:
Three primary causes.
First, temperature: if agents run with temperature > 0.1, their outputs vary run to run. Lower temperature or set temperature=0 for analytical agents.
Second, context window variation: if agents receive variable amounts of context (different conversation history lengths), their reasoning starting point differs. Standardize the context each agent receives.
Third, non-deterministic tool calls: if agents use tools that return different results (web search, current time, random sampling), results naturally vary. Isolate these agents and log their tool outputs per run.
Debugging approach: enable full trace logging for every agent run. Compare the inputs and outputs for two runs that produced different results. The divergence point is your root cause.

---

Q4: How do you scale a multi-agent system to handle 100 concurrent user requests?

Answer:
The key is statelessness and horizontal scaling.
If each agent is stateless (receives all needed context in its input, writes output to state, holds nothing in memory), you can run any agent on any instance without coordination.
Architecture: user requests go to a queue. A pool of workers picks up requests and runs the agent graph. Workers are horizontally scalable — add more instances under load.
For the AstroIntel pattern (5 parallel agents per request): at 100 concurrent requests, you have up to 500 simultaneous LLM calls. Most LLM APIs support this with proper rate limiting and connection pooling.
Rate limit handling: implement a token bucket or sliding window rate limiter per LLM API key. Queue excess requests with a short wait rather than failing them.
Stateless worker + queue + rate limiter is the same pattern as a Spring Boot application with @Async workers and a rate limiter bean — architecture you already know.

---

Q5: How does the consensus pattern in AstroIntel reduce hallucination compared to a single agent?

Answer:
A single agent hallucinating has no check. Its output reaches the user unchallenged.
With 5 parallel domain agents and a majority voting consensus, one agent hallucinating is diluted.
Scenario: Astrology agent hallucinates "marriage in 6 months — HIGH confidence". Numerology, Palmistry, Tarot, and Vastu agents all return "MEDIUM confidence" on marriage timing. Consensus: 1 HIGH out of 5 = LOW overall confidence.
The hallucinated HIGH confidence answer from one agent cannot override the consensus of the other four. The user sees LOW confidence, which is accurate — the signal is genuinely weak.
This is a fundamental principle from ensemble methods in ML: combining multiple weak learners reduces variance. The same principle applied to LLM agents: combining multiple independent domain analyses reduces the impact of any single agent's hallucination.
The architectural lesson: where hallucination risk is high, design for agreement across multiple independent sources rather than trusting a single source.
