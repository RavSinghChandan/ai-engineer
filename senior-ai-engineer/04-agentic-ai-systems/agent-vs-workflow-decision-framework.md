# Senior AI Engineer — Module 4
# Topic: Agent vs Workflow — Design Decision Framework

---

## 1. Intuition

The most common mistake in AI system design is using an agent when a workflow would do, or using a workflow when an agent is needed.

Senior engineers ask one question first: "Does this task require dynamic decision-making, or is it a fixed sequence of steps?" The answer determines the entire architecture.

---

## 2. Core Concept

### Workflow
A fixed, pre-defined sequence of steps. Each step is deterministic — step 2 always follows step 1.
- The path is known at design time
- LLM is used at specific steps to process or generate content
- Control flow is in your code, not in the LLM

Example: Document ingestion pipeline
```
Load PDF → Extract text → Chunk → Embed → Store
```
Each step is fixed. No decision-making. This is a workflow.

### Agent
A system where the LLM decides what to do next based on the current state.
- The path is NOT known at design time — it emerges from the LLM's reasoning
- LLM chooses which tools to call, in what order, and when to stop
- Control flow is inside the LLM's reasoning

Example: Customer support agent
```
User: "My order hasn't arrived and I need a refund"
Agent reasons: check_order_status → order is late → check_refund_policy → initiate_refund → notify_user
```
The sequence was not pre-programmed. The agent decided it based on what each tool returned.

### When workflows look like agents (and fail):
A deterministic sequence with conditional branches is STILL a workflow — just with if/else logic in code.
Do not use an LLM to decide the branch if a rule can decide it.

---

## 3. Why / When to Use

Use a Workflow when:
- Steps are always the same regardless of input
- Each step's output is well-defined and parseable
- Failure at any step should halt the pipeline predictably
- Auditability and reproducibility matter (compliance)

Use an Agent when:
- The right sequence of actions depends on what is discovered along the way
- The task requires reasoning across multiple unknown steps
- Users ask open-ended questions that require dynamic tool selection
- You cannot predict which combination of tools will be needed at design time

Red flag: if you are building an "agent" where the tool call sequence is always the same — you have a workflow dressed up as an agent. Remove the LLM orchestration overhead and use a workflow.

---

## 4. How It Works

```
Workflow:
  step_1_output = step_1(input)
  step_2_output = step_2(step_1_output)
  step_3_output = step_3(step_2_output)
  return step_3_output

  Control: your code
  LLM: called at specific steps for generation/extraction
  Predictable, testable, auditable

Agent (ReAct loop):
  while not done:
    thought = llm.reason(current_state, available_tools)
    action = llm.select_tool(thought)
    observation = execute_tool(action)
    current_state = update_state(current_state, observation)
    if llm.should_stop(current_state):
      done = True
  return llm.generate_final_answer(current_state)

  Control: LLM
  Predictable: No — path varies per input
  Auditable: Only if you log every thought/action step
```

---

## 5. Code Skeleton (Production-Grade)

```python
# Workflow — deterministic pipeline (LangChain LCEL style)
from langchain_core.runnables import RunnableLambda, RunnableSequence

def load_document(input: dict) -> dict:
    return {"text": extract_text(input["file_path"]), **input}

def chunk_document(input: dict) -> dict:
    return {"chunks": chunk_text(input["text"]), **input}

def embed_chunks(input: dict) -> dict:
    return {"vectors": [embed(c) for c in input["chunks"]], **input}

def store_to_db(input: dict) -> dict:
    for chunk, vector in zip(input["chunks"], input["vectors"]):
        vector_store.upsert(chunk, vector)
    return {"status": "success", "chunks_stored": len(input["chunks"])}

# Compose as a workflow — no LLM deciding the sequence
ingestion_pipeline = (
    RunnableLambda(load_document)
    | RunnableLambda(chunk_document)
    | RunnableLambda(embed_chunks)
    | RunnableLambda(store_to_db)
)

# Agent — LLM decides the sequence (LangGraph style)
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
import operator

class AgentState(TypedDict):
    messages: Annotated[list, operator.add]
    tools_used: list[str]
    final_answer: str | None

def reasoning_node(state: AgentState) -> AgentState:
    response = llm.invoke(state["messages"] + [build_tool_prompt(available_tools)])
    return {"messages": [response], "tools_used": state["tools_used"]}

def tool_execution_node(state: AgentState) -> AgentState:
    last_message = state["messages"][-1]
    tool_name, tool_input = parse_tool_call(last_message)
    result = execute_tool(tool_name, tool_input)
    return {
        "messages": [{"role": "tool", "content": result}],
        "tools_used": state["tools_used"] + [tool_name]
    }

def should_continue(state: AgentState) -> str:
    last_message = state["messages"][-1]
    if has_tool_call(last_message):
        return "tools"
    return END

graph = StateGraph(AgentState)
graph.add_node("agent", reasoning_node)
graph.add_node("tools", tool_execution_node)
graph.set_entry_point("agent")
graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
graph.add_edge("tools", "agent")
agent = graph.compile()
```

---

## 6. Example (From Your Projects)

**AstroIntel — a hybrid of workflow + parallel agents:**

The pipeline is a workflow at the macro level — the sequence is always:
Question Normalization → [5 parallel domain agents] → Meta Consensus → Remedy → Admin Review

But within each domain agent, there is agent-like reasoning: the LLM decides how to interpret the birth profile for its domain, what aspects are most relevant, and how to structure the insight.

Key decision: we chose a workflow architecture (not a pure agent) because:
- The sequence is always the same — no dynamic step selection needed
- Each step's output is JSON-structured and the next step depends on it
- Auditability: we needed to explain why each insight was generated (required by the admin review step)

In interview: "AstroIntel is a workflow with agent-like nodes. The macro orchestration is a fixed pipeline — predictable and auditable. Each domain agent uses LLM reasoning internally. This gave us the control of a workflow with the intelligence of agents where it mattered."

---

## 7. Trade-offs

Workflow:
+ Predictable, testable, auditable, easier to debug
+ Each step is independently testable
- Not flexible: adding a new step requires code change
- Cannot handle dynamic discovery of what to do next

Agent:
+ Flexible: adapts to any input without code changes
+ Can solve tasks that were not anticipated at design time
- Unpredictable: path varies per input, hard to test exhaustively
- Can get into loops, hallucinate tool calls, fail unexpectedly
- Harder to audit: must log every reasoning step

---

## 8. Interview Questions (Senior Level)

- Describe a situation where you would use a workflow instead of an agent, even though an agent could technically do the same thing.
- How do you test an agent-based system when the execution path is non-deterministic?
- What are the failure modes of an LLM agent that a workflow does not have?
- How do you add guardrails to prevent an agent from taking unintended actions?
- How does the agent vs workflow decision change when the system must be auditable for compliance?

---

## 9. Answer Framework

Step 1 — Ask the key question:
"The first question is: does the task require dynamic decision-making, or is the sequence of steps fixed? If fixed, use a workflow. If the LLM must decide the path based on what it discovers, use an agent."

Step 2 — Explain the cost of getting it wrong:
"An over-engineered agent for a fixed workflow is unpredictable, harder to test, and more expensive. An under-engineered workflow for a dynamic task fails when it encounters a case its fixed logic did not anticipate."

Step 3 — From your project:
"In AstroIntel, I used a workflow — the 5-step pipeline is always the same. Each domain agent uses LLM reasoning internally but the macro sequence is fixed and auditable."

Step 4 — Hybrid pattern:
"Most production systems are hybrids: a workflow at the macro level with LLM-powered nodes that use reasoning internally. This gives you control where you need it and flexibility where the task demands it."

Step 5 — Compliance angle:
"If the system must be auditable (finance, healthcare, legal), lean toward workflows with logged LLM calls. A pure agent where 'the LLM decided' is not an acceptable audit trail."

---

## 10. Advanced Follow-ups (Senior-Level Answers)

Q1: How do you prevent an agent from getting into an infinite loop?

Answer:
Three controls.
First, maximum step limit: set a hard cap on the number of tool calls per agent run (e.g., 15 steps). If the agent has not completed in 15 steps, return a graceful error and log the trace for investigation.
Second, loop detection: track which tools have been called with which inputs. If the same tool is called with the same input twice, the agent is looping — break out.
Third, progress assertion: after every N steps, check whether the agent made progress toward the goal. If the same state appears twice, terminate.
In LangGraph: implement a step counter in the state. The conditional edge checks the counter and routes to an error node if the limit is exceeded.
This is not optional in production — without a loop prevention mechanism, a confused agent will consume your entire token budget and return nothing.

---

Q2: How do you test an agent whose execution path is non-deterministic?

Answer:
Test at three levels.
First, unit test each tool independently — tool behavior is deterministic even if the agent's choice of tool is not. Test every tool with valid and invalid inputs.
Second, golden path integration tests — define a small set of representative inputs where you know what the ideal tool call sequence is. Run the agent, assert that the correct tools were called (order may vary) and the final answer is correct.
Third, adversarial testing — inputs designed to cause loops, hallucinated tool calls, or tool call argument errors. Verify that guardrails catch them.
For non-determinism: run each test 3 times. If results diverge significantly across runs, your agent has high variance. Reduce temperature or add explicit step constraints to stabilize.
Accept that you cannot exhaustively test an agent the way you test a function. The goal is coverage of representative paths and failure modes, not mathematical completeness.

---

Q3: When does a workflow become too rigid and need to be replaced with an agent?

Answer:
When the number of conditional branches in your workflow code starts to approximate "the LLM just deciding," your workflow has become an agent written badly.
Concrete signal: if your workflow has more than 5-6 conditional branches to handle different input types, and each branch does roughly similar things with different parameters — you have a decision problem that an agent handles more elegantly.
Second signal: user requests are arriving that your fixed workflow cannot handle, and you are adding new branches to handle them one by one. This is indefinitely scalable work. An agent handles novel requests without code changes.
Third signal: the right action depends on what was discovered in a previous step, and you cannot know at design time what that will be. For example, a customer support workflow that needs to check order status, then based on that status either check shipping, or check warehouse, or escalate — the branching depends on live data, not pre-defined cases.
Migration path: extract the dynamic-decision parts into an agent, keep the fixed pre/post processing as workflows. This hybrid is almost always the right answer.

---

Q4: How do you make an agent's decisions auditable for compliance?

Answer:
The key is logging every reasoning step, not just the final output.
Log structure per agent run:
  - run_id, user_id, timestamp
  - initial input
  - each step: thought, tool_selected, tool_input, tool_output
  - final answer
  - total steps, total tokens, total cost

Store these logs in an append-only audit log (e.g., S3, CloudWatch, BigQuery). Never delete them.
For compliance review: given a run_id, a compliance officer can reconstruct exactly what the agent saw, what it decided, and why.
The LangGraph approach: every node's input and output is recorded in graph state. Export the full state trace per run.
Important framing for interviews: "The LLM decided" is not an audit trail. "The LLM received input X, selected tool Y with parameters Z, received output W, and then decided..." is an audit trail. The difference is instrumentation discipline.

---

Q5: How does your Spring Boot / microservices experience map to agent vs workflow design?

Answer:
Very directly.
A workflow is a synchronous Spring service call chain: Controller → ServiceA → ServiceB → ServiceC → return. Each step is deterministic, the sequence is coded, errors are caught at each step.
An agent is closer to an event-driven system with dynamic routing: a message arrives, a router decides which handler processes it based on content, the handler may trigger further messages, and the sequence emerges from the message flow.
The toolbox mapping: LangGraph StateGraph is the agent equivalent of a Spring State Machine (which I have used for order processing workflows). States, transitions, conditional edges — identical concepts.
The reliability patterns are identical: retry on tool failure = retry on service call failure. Circuit breaker for a failing tool = circuit breaker for a failing downstream service. Dead letter handling for agent loops = DLQ for unprocessable messages.
This means I can apply 8 years of distributed system reliability thinking directly to agent architecture — it is not a new problem domain, it is a familiar problem domain with a new execution engine.
