# Senior AI Engineer — Module 4
# Topic: Planning vs Execution Agents — ReAct, Plan-and-Execute, Tree-of-Thought

---

## 1. Intuition

A standard agent thinks one step at a time — it acts, sees the result, acts again. This works for short tasks.
For complex tasks, this is like a surgeon who decides each cut only after seeing the result of the previous one — no overall plan, no anticipation of downstream effects.

Planning agents think ahead. Execution agents act. Senior engineers know when each is needed.

---

## 2. Core Concept

### ReAct (Reason + Act) — Most Common
The LLM alternates between: Thought → Action → Observation → repeat until done.
- No upfront plan: decides next action based on current state
- Simple, effective for tasks with fewer than 10 steps
- Can get lost on complex, multi-step tasks without intermediate checkpoints

```
Thought: The user wants to know the order status. I should call get_order_status.
Action: get_order_status(order_id="ORD-12345678")
Observation: {"status": "delayed", "reason": "carrier issue", "new_eta": "2026-05-15"}
Thought: The order is delayed. I should also check if a refund has been initiated.
Action: check_refund_status(order_id="ORD-12345678")
...
```

### Plan-and-Execute — For Complex Tasks
Two-phase approach:
1. Planner LLM creates a full multi-step plan upfront
2. Executor LLM executes each step independently

```
Phase 1 — Planner:
  Input: "Research and write a report on AI market trends"
  Plan:
    Step 1: Search for AI market data 2025
    Step 2: Search for top AI companies by revenue
    Step 3: Search for AI investment trends
    Step 4: Write executive summary
    Step 5: Write detailed sections
    Step 6: Format as report

Phase 2 — Executor:
  Step 1 → web_search("AI market data 2025") → results
  Step 2 → web_search("top AI companies revenue 2025") → results
  ...
  Step 6 → format_report(all_sections) → final output
```

Benefits: planner sees the full task scope and creates a coherent strategy. Executor focuses on one step at a time without losing track of the overall goal.

### Tree-of-Thought (ToT) — For Multi-Path Problems
The LLM explores multiple reasoning paths in parallel, evaluates them, and pursues the most promising.
- Generates 2-3 candidate next thoughts
- Evaluates each candidate
- Expands the best one
- Backtracks from dead ends

```
Problem: "Design the optimal database schema for a multi-tenant SaaS"

Tree:
  Root: "Design options"
  ├── Option A: "Shared schema with tenant_id column" → evaluate → score: 8/10
  │   ├── A1: "Add row-level security"
  │   └── A2: "Add index per tenant"
  ├── Option B: "Separate schema per tenant" → evaluate → score: 6/10
  └── Option C: "Separate database per tenant" → evaluate → score: 7/10
  
  Pursue Option A (highest score) → expand A1 and A2
```

Best for: problems with multiple valid solution paths where the best path is not obvious upfront.

---

## 3. Why / When to Use

| Pattern | Use When | Avoid When |
|---|---|---|
| ReAct | Tasks < 10 steps, exploratory, dynamic path | Complex multi-step with global coherence needed |
| Plan-and-Execute | Long tasks with many steps; need coherent overall structure | Tasks where the plan must adapt heavily to intermediate results |
| Tree-of-Thought | Design problems; multiple valid approaches; optimization | Simple fact retrieval or linear tasks |

---

## 4. How It Works (Code)

```python
# ReAct Agent (LangGraph)
def react_agent_node(state: dict) -> dict:
    system = """You are a helpful assistant. Use the following format:
Thought: reason about what to do next
Action: tool_name
Action Input: tool arguments as JSON
Observation: [tool result will be inserted here]
... (repeat as needed)
Final Answer: your response to the user"""
    
    response = call_llm(system, format_messages(state["messages"]))
    
    if "Final Answer:" in response:
        return {"final_answer": extract_final_answer(response), "done": True}
    elif "Action:" in response:
        tool_name, tool_input = parse_react_action(response)
        result = execute_tool(tool_name, tool_input)
        return {"messages": state["messages"] + [
            {"role": "assistant", "content": response},
            {"role": "user", "content": f"Observation: {result}"}
        ]}

# Plan-and-Execute
class PlanAndExecuteAgent:
    def create_plan(self, task: str) -> list[str]:
        plan_response = call_llm(
            system_prompt="Create a numbered step-by-step plan to complete the task. Return as JSON array of strings.",
            user_message=f"Task: {task}"
        )
        import json
        return json.loads(plan_response)
    
    def execute_step(self, step: str, previous_results: list[dict]) -> str:
        context = "\n".join([f"Step {i+1} result: {r['result']}" for i, r in enumerate(previous_results)])
        return call_llm(
            system_prompt="Execute this step using available tools. Context from previous steps is provided.",
            user_message=f"Previous results:\n{context}\n\nCurrent step: {step}"
        )
    
    def run(self, task: str) -> str:
        plan = self.create_plan(task)
        results = []
        
        for i, step in enumerate(plan):
            logger.info(f"Executing step {i+1}/{len(plan)}: {step}")
            result = self.execute_step(step, results)
            results.append({"step": step, "result": result})
        
        # Final synthesis
        all_results = "\n".join([f"Step {i+1}: {r['result']}" for i, r in enumerate(results)])
        return call_llm(
            "Synthesize the step results into a final coherent answer.",
            f"Task: {task}\n\nStep results:\n{all_results}"
        )

# Tree-of-Thought (simplified)
def tree_of_thought(problem: str, branches: int = 3, depth: int = 2) -> str:
    def generate_thoughts(current_path: list[str]) -> list[str]:
        context = " → ".join(current_path) if current_path else problem
        response = call_llm(
            f"Generate {branches} different next steps or approaches. Return as JSON array.",
            f"Problem: {problem}\nCurrent path: {context}"
        )
        import json
        return json.loads(response)
    
    def evaluate_thought(thought: str, path: list[str]) -> float:
        response = call_llm(
            "Score this reasoning step from 0.0 to 1.0 for correctness and progress toward solution. Return only a number.",
            f"Problem: {problem}\nPath so far: {path}\nProposed next step: {thought}"
        )
        try:
            return float(response.strip())
        except ValueError:
            return 0.5
    
    # BFS with scoring
    beam = [{"path": [], "score": 1.0}]
    
    for _ in range(depth):
        candidates = []
        for node in beam:
            thoughts = generate_thoughts(node["path"])
            for thought in thoughts:
                score = evaluate_thought(thought, node["path"])
                candidates.append({"path": node["path"] + [thought], "score": score})
        
        # Keep top-2 paths (beam search)
        beam = sorted(candidates, key=lambda x: x["score"], reverse=True)[:2]
    
    best_path = beam[0]["path"]
    return call_llm(
        "Based on this reasoning path, provide the final solution.",
        f"Problem: {problem}\nReasoning path: {best_path}"
    )
```

---

## 5. Example (From Your Projects — Senior Framing)

**AstroIntel — implicit planning:**

Each domain agent in AstroIntel implicitly uses a reasoning structure: it is given a birth profile and question, it reasons about which astrological principles apply, then generates an insight. This is single-step reasoning — closer to ReAct with one action.

**Where Plan-and-Execute would apply:**
A more complex AI engineer task: "Analyze this company's entire documentation and generate a comprehensive onboarding guide."
- Plan: identify sections needed, research each section, synthesize, format
- Execute: each step independently against the doc corpus
- This cannot be done in a single ReAct loop without losing coherence across sections

In interview: "For AstroIntel's domain agents, single-step ReAct-style reasoning was sufficient — each agent had a focused, bounded task. For a long-form research or report generation task, I would use Plan-and-Execute: the planner ensures global coherence, the executor focuses on one step at a time."

---

## 6. Trade-offs

ReAct:
+ Simple, widely supported, good for tasks under 10 steps
- Loses track of overall goal on long tasks; no global coherence

Plan-and-Execute:
+ Better coherence on long tasks; executor is focused
- Plan may be wrong or outdated as facts discovered during execution; requires replanning logic

Tree-of-Thought:
+ Explores alternatives, finds better solutions on hard problems
- Expensive: multiple LLM calls per node; slow; overkill for most tasks

---

## 7. Interview Questions (Senior Level)

- When would you choose Plan-and-Execute over a simple ReAct agent?

  **Answer:** When the task has more than ~5 steps and requires global coherence across those steps — document synthesis, research reports, multi-phase analysis. ReAct works one step at a time without maintaining an overall structure, so by step 8 it has often lost sight of what it set out to do. In Bench Resource Optimizer, plan generation is a Plan-and-Execute pattern: the planner structures the 30-day resource plan first, then the executor populates each day with specific assignments — without a plan, the executor would generate random allocations without coherence across the month.

- What are the failure modes of Plan-and-Execute that ReAct handles better?

  **Answer:** Plan-and-Execute fails when the plan is wrong from the start (the planner made incorrect assumptions about what would be found during execution) and the executor blindly follows a broken plan without adapting. ReAct handles this better because it re-evaluates after each action and can course-correct dynamically. The second failure mode: Plan-and-Execute can get "stuck" executing a plan step that produces nothing, with no mechanism to skip or replan — a ReAct agent would naturally try a different approach when a step yields no useful result.

- How do you handle a case where the plan needs to change halfway through execution?

  **Answer:** *(Already covered in Advanced Follow-ups Q1 — skipped to avoid duplication.)*

- Explain Tree-of-Thought and give a concrete use case where it outperforms ReAct.

  **Answer:** *(Already covered in Advanced Follow-ups Q2 — skipped to avoid duplication.)*

- What is the token cost difference between ReAct and Plan-and-Execute for a 10-step task?

  **Answer:** *(Already covered in Advanced Follow-ups Q3 — skipped to avoid duplication.)*

---

## 8. Answer Framework

Step 1 — Match the pattern to task complexity:
"For tasks under 10 steps with dynamic discovery: ReAct. For long structured tasks requiring global coherence: Plan-and-Execute. For design/optimization problems with multiple valid paths: Tree-of-Thought."

Step 2 — From your project:
"AstroIntel's domain agents use single-step reasoning — focused enough that full planning is unnecessary. For a report generation task, I would use Plan-and-Execute to ensure the output has coherent structure."

Step 3 — Address the failure modes:
"Plan-and-Execute fails when the plan is based on incorrect assumptions about what will be discovered. I add a replanning step: if an execution step returns unexpected results, re-invoke the planner with the new context."

Step 4 — Cost awareness:
"Tree-of-Thought is expensive — generating and evaluating multiple branches adds N× LLM calls. I apply it only for high-value decisions where exploring alternatives is worth the cost."

Step 5 — Production principle:
"Start simple: ReAct for most tasks. Add planning complexity only when single-step reasoning is demonstrably failing — measured by task completion rate, not intuition."

---

## 9. Advanced Follow-ups

Q1: How do you handle replanning when mid-execution facts contradict the original plan?

Answer:
The plan is an artifact, not a contract. If execution reveals that step 3 was based on a wrong assumption, the agent must replan.
Implementation: after each execution step, the executor evaluates whether the remaining plan steps are still valid given the new information. If a significant discovery invalidates future steps, trigger a replanning call with the updated context.
In practice: add a "plan validator" node in the LangGraph graph. After each step, the validator decides: continue with current plan, skip step, or replan. This adds one LLM call per step but prevents wasted execution of now-irrelevant plan steps.
The key is that replanning is not a failure state — it is a feature of a robust planning agent. The original plan was based on incomplete information; the replan incorporates new facts.

---

Q2: How does Tree-of-Thought differ from having an agent try multiple approaches sequentially?

Answer:
Sequential multi-approach: try approach A, evaluate result, try approach B, evaluate result, pick best. Cost: N approaches × steps per approach, but one approach at a time.
Tree-of-Thought: explore multiple branches in parallel at each reasoning step, evaluate each, prune bad branches, continue expanding good branches. More like a search algorithm than sequential exploration.
The key difference: ToT evaluates intermediate reasoning steps, not just final outputs. It can detect a dead end after 2 steps and backtrack, rather than running a full approach to completion and then discarding it.
For hard problems where the search space is large (e.g., optimization, multi-constraint design), ToT's branch-and-bound exploration finds better solutions than either ReAct (linear) or sequential approaches.
For most production tasks: neither is needed. ReAct is sufficient for 90% of production agent use cases. ToT is a research-grade technique for the remaining 10%.

---

Q3: What is the token cost comparison between these three patterns for a 10-step task?

Answer:
ReAct (10 steps): each step appends to conversation history. Step 1 sees 1 thought+action. Step 10 sees all 10 previous thoughts+actions accumulated. Total context grows quadratically with steps. Approximate: 500 tokens × step_number accumulated = ~5,000-10,000 total tokens for a 10-step task.
Plan-and-Execute (10 steps): planner call (~1,000 tokens). Each executor call has: task (100 tokens) + previous results (growing) + current step (100 tokens). More controlled because each executor call is bounded. Approximate: 2,000 tokens for planning + 8,000 tokens for execution = ~10,000 total, but more predictable.
Tree-of-Thought (2 branches, 3 depth): generates 2 thoughts at each node × 3 levels × evaluates each = 6 generate calls + 6 evaluate calls = 12 calls minimum. Each call is relatively small but the total quickly reaches 3-5× ReAct cost for the same depth.
Practical guidance: ReAct and Plan-and-Execute have similar total token cost for well-structured tasks. ToT is 3-5× more expensive. Budget accordingly.

---

Q4: How do you add checkpointing to a long-running Plan-and-Execute agent?

Answer:
For tasks that take minutes or hours (research agents, report generators), checkpointing is critical. If the process fails at step 8 of 15, you do not want to restart from step 1.
Implementation: after each execution step, save the full state (plan, completed steps, results) to a persistent store (Redis, database, S3).
On resume (after failure or restart): load the last checkpoint, determine which step failed, and resume from that step.
In LangGraph: use LangGraph's built-in persistence with SqliteSaver or a custom StateStore. The graph state is automatically checkpointed after each node execution.
For long-running tasks in production: assign a task_id to each run. Store checkpoints keyed by task_id. Add a status endpoint that returns the current step and all completed step results. Users can track progress without waiting for the full run to complete.
This is the same pattern as a Spring Batch job with step-level restart capability — same concept, different execution engine.

---

Q5: How do you monitor and debug a Plan-and-Execute agent in production?

Answer:
Two levels of observability.
First, plan-level: log the generated plan before execution starts. This is invaluable for debugging — when a run produces wrong output, you first check whether the plan was coherent. A bad plan produces bad output regardless of how well the executor runs.
Second, step-level: log each step's input, output, duration, and token count. Add step success/failure status. This lets you see exactly where a run diverged from expected behavior.
Metrics to track:
  - Plan quality: sample plans weekly and have a human review whether they are coherent (or use an LLM judge)
  - Step failure rate: what % of steps fail on first attempt?
  - Replanning frequency: how often is the plan changed mid-execution?
  - Total run time and token cost per task type
Dashboard view: a run that completed in 15 steps with 2 replannings and 1 step retry is richer information than just "run completed successfully." Build tooling that surfaces this trace level detail.
