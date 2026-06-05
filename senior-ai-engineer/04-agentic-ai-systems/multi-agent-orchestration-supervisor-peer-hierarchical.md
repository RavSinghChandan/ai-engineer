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

**effective_count pattern** — critical edge case fix:
```python
# Problem: numerology-only mode has domain_count=1 but 3 sub-traditions
# Without this fix: numerology-only → LOW confidence (wrong)
# With this fix: numerology-only → HIGH confidence (correct)
effective_count = domain_count if domain_count > 1 else len(sub_traditions)
confidence = "HIGH" if effective_count >= 3 else "MEDIUM" if effective_count >= 2 else "LOW"
```
This is the difference between a system that degrades incorrectly on valid sub-domain queries vs one that handles them faithfully.

Key design decisions:
1. Agents are stateless — they receive inputs, produce outputs, share no state
2. Parallel execution + DeepSeek + 3-tier cache cut wall time from 78s → 4s
3. Each agent fails independently — if Tarot agent fails, the other 4 still contribute
4. Consensus uses effective_count majority-voting — one failed/hallucinating agent cannot poison the final answer
5. Every node wrapped in safe_node() — circuit breaker + ThreadPoolExecutor timeout hard kill

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

  **Answer:** The supervisor pattern uses an orchestrator LLM that dynamically routes each step to the appropriate specialist agent based on the current state. Use it when tasks are heterogeneous and the right specialist depends on what was discovered in previous steps — for example, a customer support agent that might call a billing specialist, a shipping specialist, or a technical support specialist depending on the issue type. Parallel agents are the right choice when tasks are independent and homogeneous — like AstroIntel's 5 domain agents all analyzing the same birth profile in parallel. Parallel is faster and cheaper; supervisor is more flexible but adds an LLM routing cost and a failure point.

- How do you handle partial failure in a multi-agent system where 2 of 5 agents fail?

  **Answer:** Design the consensus/merge layer to handle partial output gracefully: process whichever agents succeeded, mark failed agents as "unavailable" in the state, and reduce the confidence threshold accordingly. In AstroIntel, if a domain agent fails, the consensus agent has fewer inputs — the result is a lower-confidence output rather than a total system failure. The key design principle: never let one agent's failure block the entire pipeline. Each agent runs independently; the orchestrator handles absent outputs without panicking.

- How do you prevent agents from passing contradictory information to each other?

  **Answer:** Enforce structured contracts between agents — each agent writes to its own named output field in the shared state (e.g., `astrology_output`, `numerology_output`), never overwriting another agent's output. Contradiction detection happens in the consensus layer, which explicitly compares outputs and flags disagreements as lower confidence rather than silently picking one. In AstroIntel, the Meta Consensus Agent compares insights across all 5 agents and uses cross-domain agreement as the quality signal — contradictions lower the confidence from HIGH to LOW, which is the correct handling rather than hiding the disagreement.

- What is the cost implication of running 5 parallel LLM agents vs 1 sequential agent?

  **Answer:** Token cost is identical whether you run 5 agents in parallel or sequentially — you're making the same 5 LLM calls either way. The difference is wall time: 5 parallel agents on a 5-second task each = 5 seconds total with parallelism vs 25 seconds sequential. But parallel does increase peak API load — if each agent uses 1,000 tokens and you have 100 concurrent users, 5 parallel agents × 100 users = 500 simultaneous LLM calls hitting your rate limit. In AstroIntel, because the 5 domain agents are rule-based (zero LLM tokens), parallelism is nearly free — only the final LLM call adds cost. In Bench Resource Optimizer, `asyncio.gather` fires 30 simultaneous DeepSeek calls for day plan generation — total cost is 30 × $0.0003 = $0.009 per plan, and wall time drops from ~21 seconds sequential to ~4 seconds parallel. The TPM budget is the binding constraint, not latency.

- How does the consensus pattern reduce hallucination in multi-agent systems?

  **Answer:** *(Already covered in Advanced Follow-ups Q5 — skipped to avoid duplication.)*

---

## 8. Answer Framework

Step 1 — Choose the right coordination model:
"I choose multi-agent patterns based on the coordination need: parallel map-reduce for independent same-type tasks, supervisor for dynamic routing to specialists, hierarchical for complex multi-phase tasks."

Step 2 — From your project:
"In AstroIntel, I used parallel map-reduce — 5 independent domain agents running concurrently, results merged by a consensus agent. The latency journey: 78s (sequential) → 15s (parallel) → 4s (parallel + DeepSeek + 3-tier cache). Three optimization rounds, not one."

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

---

## ★ Built in AstroIntel 360° — Live Proof You Can Reference in Interviews

### Pattern Used: Parallel Fan-Out + Supervisor Synthesis (LangGraph StateGraph)

**What was actually built:**

```
security_check          ← Layer 1 input gate (blocks prompt injection before any LLM call)
    ↓
question_agent          ← Intent classification, normalises questions into structured format
    ↓
domain_agents_parallel  ← Single LangGraph node that runs 5 specialist agents sequentially
    │                     within one node (LangGraph-safe parallel pattern):
    │   numerology_agent   (Indian · Chaldean · Pythagorean — 3 traditions)
    │   astrology_agent    (Vedic · KP · Western — 3 traditions)
    │   palmistry_agent    (Indian · Chinese · Western — 3 traditions)
    │   tarot_agent        (Major + Minor Arcana)
    │   vastu_agent        (Directions + 5 elements)
    ↓
meta_agent              ← Cross-domain consensus: HIGH (≥3 domains agree), MEDIUM (2), LOW (1)
    ↓
hallucination_check     ← Output validation: prompt leak detection, off-topic, jailbreak compliance
    ↓
remedy_agent            ← 8-category remedies: mantras, gemstones, fasting, yoga, colours, charity
    ↓
admin_review_agent      ← Packages insights with id, confidence, domains[], editable flag
    ↓
[Human-in-the-loop approval] → admin approves/rejects individual insights
    ↓
plain_english_agent     ← Runs ONLY post-approval (not in pipeline): jargon→plain English
    ↓
report_agent            ← Builds 20-page branded PDF payload
    ↓
translation_agent       ← 30+ language translation on demand
```

**Graceful Degradation (G5):**
```python
for domain, agent_fn in agent_map.items():
    try:
        state = agent_fn(state)
    except Exception as exc:
        # Failed domain → LOW confidence placeholder — pipeline never crashes
        state["memory"][domain] = {
            "_degraded": True, "confidence": "low",
            "question_wise_analysis": []
        }
```
→ If Vastu agent fails, other 4 domains still produce insights. Report still generates.

**Consensus scoring in meta_agent:**
- 3+ domains agree on an insight → `confidence: "HIGH"` — strong signal, featured prominently
- 2 domains agree → `confidence: "MEDIUM"` — shown with caveat
- 1 domain only → `confidence: "LOW"` — shown but clearly qualified

**Interview answer when asked "which orchestration pattern did you use?":**
> "AstroIntel uses a parallel fan-out pattern inside a LangGraph StateGraph. Five domain specialist agents run independently — no agent sees another's output during execution, which avoids cross-contamination bias. After the fan-out, a meta-agent acts as the supervisor: it reads all five outputs and produces a consensus score based on cross-domain agreement. Insights where 3 or more traditions agree are marked HIGH confidence. This is the architectural answer to the trade-off I made by going parallel — I gain 5x latency improvement but lose inter-agent context, so the consensus layer compensates by measuring the strength of the multi-source signal."


---

## ★ YOUR 5 PROJECTS — Multi-Agent Orchestration

| Project | Pattern | Detail |
|---------|---------|--------|
| **AstroIntel 360°** | Supervisor + Parallel Peers | 18+ nodes. 5 domain agents run in parallel (ThreadPoolExecutor). Supervisor (meta_agent) synthesises multi-domain outputs. Conditional edges — skip nodes whose modules user didn't select. |
| **Bench Resource Optimizer** | Sequential pipeline (not multi-agent) | cv_parser → role_mapper → planner → tracker. FastAPI orchestrates directly — no LangGraph needed for linear flow. Each agent receives clean output from previous. |
| **RunbookAI** | No multi-agent | Single LLM at ingest only. All query-time logic is SQL + NetworkX. Conflict detection is a post-processing tool, not an agent. |
| **Agentic Growth OS** | 5-node LangGraph pipeline | Audience → AdCopy → BudgetOptimizer → Campaign → PerformanceAnalyzer. Pure functions per node. Each agent writes to its own output field in CampaignState — immutable side effects. |
| **Universal Agent** | Single ReAct per instance | One ReAct agent per config. Registry allows 5 independent agents monitored via one dashboard. Each agent is fully isolated — lock one, others unaffected. |

**Interview line:** "In AstroIntel, running 5 domain agents in parallel isn't just faster — it's architecturally correct. If I ran them sequentially, each later agent could be influenced by earlier agents' outputs. Running them independently and synthesising at the end is the ensemble approach: independent analysis, central consensus."
