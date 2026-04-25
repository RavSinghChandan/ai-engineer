# LangGraph Banking Platform — Dynamic Code Flow
> `langchain-langraph-workspace/langraph_project/`

---

## What This Project Does

A **complete AI-powered banking backend** built with LangGraph.
Every banking operation is its own stateful graph — loan checks, fraud detection, account queries, compliance questions, multi-agent loan committees, and a master orchestrator that routes everything automatically.

**Type:** Multi-graph LangGraph Platform  
**Framework:** FastAPI + LangGraph + LangChain  
**9 Graphs, each independently callable AND orchestrated by 1 master graph**

---

## Mind Map — The Full System

```
                         ┌──────────┐
                         │   USER   │
                         └────┬─────┘
                              │ HTTP
                              ▼
                    ┌──────────────────┐
                    │    main.py       │
                    │  11 routers      │
                    │  FastAPI app     │
                    └──────────────────┘
                              │
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                       ▼
  /autonomous          /loan /account        /transaction
  (master)             /compliance           /loan_committee
        │              /conversation         /resilience
        │              /security
        ▼
  autonomous_agent.py  ◄── routes to all others
  ┌─────────────────────────────────────────┐
  │  classify_intent                        │
  │       ↓                                 │
  │  plan_workflow                          │
  │       ↓                                 │
  │  execute_workflow ──► calls sub-graph   │
  │       ↓                                 │
  │  enrich_with_rag (compliance only)      │
  │       ↓                                 │
  │  synthesize_response                    │
  └─────────────────────────────────────────┘
        │
        ├──► loan_eligibility.py     (Step 3)
        ├──► account_agent.py        (Step 4)
        ├──► compliance_rag.py       (Step 5)
        ├──► conversation_agent.py   (Step 6)
        ├──► loan_committee.py       (Step 7)
        ├──► resilient_agent.py      (Step 8)
        └──► transaction_router.py  (Step 2)
```

---

## The LangGraph Core Idea (before diving in)

```
┌──────────────────────────────────────────────────────────┐
│  A LangGraph graph has 3 things:                         │
│                                                          │
│  STATE  →  A shared dictionary all nodes read/write      │
│  NODES  →  Python functions: receive state, return update│
│  EDGES  →  Arrows between nodes (fixed OR conditional)   │
│                                                          │
│  Every node reads the FULL accumulated state.            │
│  Every node returns ONLY the fields it changed.          │
│  LangGraph MERGES those changes automatically.           │
└──────────────────────────────────────────────────────────┘
```

---

## Graph 1 — Loan Eligibility (Step 3)

**What it does:** Multi-gate loan decision pipeline.

```
FLOW:

validate_input
      │
      ▼ (conditional)
   pass? ──NO──► reject_application ──► END
      │
      ▼ YES
check_credit_score
      │
      ▼ (conditional)
  score ok? ──NO──► reject_application ──► END
      │
      ▼ YES
check_income (DTI ratio + amount multiples)
      │
      ▼ (conditional)
  income ok? ──NO──► reject_application ──► END
      │
      ▼ YES
calculate_risk_score (credit + DTI + employment → 0-100)
      │
      ▼
calculate_loan_terms (interest rate + term months)
      │
      ▼
make_final_decision
  risk < 30  → PENDING_REVIEW
  risk >= 30 → APPROVED
      │
      ▼
     END

STATE accumulates across every node:
  applicant_id, credit_score, annual_income
  → + validation_passed
  → + debt_to_income_ratio
  → + risk_score
  → + interest_rate, loan_term_months
  → + decision (APPROVED / REJECTED / PENDING_REVIEW)
```

---

## Graph 2 — Account Agent (Step 4) — ReAct Loop

**What it does:** LLM loops with tools until it can fully answer your account question.

```
FLOW:

inject_context (build initial messages)
      │
      ▼
  agent_node  ◄────────────────┐
  LLM with tools bound         │
      │                        │
      ▼ (conditional)          │
  has tool_calls?              │
      │                        │
   YES ──► tool_node ──────────┘  (loop back to agent)
      │     runs get_account_details()
      │     or  get_transactions()
   NO  ──► END
   (LLM has full answer)

KEY: The loop continues until the LLM says "I have everything I need."
     Each loop the LLM sees ALL previous messages + tool results.
```

---

## Graph 3 — Human-in-the-Loop (Step 10)

**What it does:** Graph PAUSES and waits for a real officer to approve/reject.

```
FLOW — Two separate API calls:

CALL 1 (submit):
  analyze_request
  (sets risk level: LOW/MEDIUM/HIGH by loan amount)
        │
        ▼
  ⏸ PAUSE — graph stops here (interrupt_before=["human_review"])
        │    state saved to MemorySaver checkpoint
        ▼
  Returns: { status: "PENDING_HUMAN_REVIEW", risk_level: "HIGH" }

  ↑ Human officer reviews the application...

CALL 2 (resume with decision):
  hitl_graph.update_state() → injects { human_decision: "approved", approver: "alice" }
  hitl_graph.invoke(None)   → resumes from saved checkpoint
        │
        ▼
  human_review (reads decision from state)
        │
        ▼ (conditional)
  approved? ──► finalize_approval ──► END
  rejected? ──► reject_by_human  ──► END
```

---

## Graph 4 — Autonomous Agent (Step 11) — The Master

**What it does:** One endpoint accepts ANY banking question → picks the right graph automatically.

```
FLOW:

classify_intent
  → keyword scan (no LLM, instant):
    "loan" → intent="loan"
    "balance" → intent="account"
    "kyc" → intent="compliance"
    unknown → intent="unknown"
      │
      ▼
plan_workflow
  → if intent known → confirm selected_workflow
  → if unknown → ask LLM to pick workflow (fallback)
      │
      ▼
execute_workflow
  → if "loan"       → run loan_eligibility_graph
  → if "account"    → run account_agent_graph
  → if "compliance" → run compliance_rag_graph
  → if "transaction"→ run transaction_router_graph
  → if "committee"  → run loan_committee_graph
  → if "resilience" → run resilient_agent_graph
  → else            → run conversation_graph
      │
      ▼ (conditional)
  error?  ──► handle_failure ──► synthesize_response ──► END
  success ──► enrich_with_rag ──► synthesize_response ──► END
```

---

## One Complete Example — Loan Application

**Input:**
```json
POST /api/v1/loan/check
{
  "applicant_id": "APP-001",
  "loan_type": "home",
  "requested_amount": 500000,
  "annual_income": 120000,
  "credit_score": 720,
  "employment_years": 5,
  "existing_debt": 10000
}
```

**Trace through graph:**

```
Graph starts with this initial state:
  { applicant_id: "APP-001", loan_type: "home",
    requested_amount: 500000, annual_income: 120000,
    credit_score: 720, employment_years: 5, existing_debt: 10000 }

NODE 1: validate_input(state)
  amount 500000 > 0 ✓
  income 120000 > 0 ✓
  credit 720 is between 300-850 ✓
  employment 5 >= 0 ✓
  → returns: { validation_passed: True }
  STATE NOW: { ...all original... + validation_passed: True }

CONDITIONAL EDGE after validate_input:
  validation_passed=True → route to "check_credit_score"

NODE 2: check_credit_score(state)
  HOME loan threshold = 680
  credit_score = 720 >= 680 ✓
  → returns: {}  (no rejection)
  STATE NOW: { ...unchanged... }

CONDITIONAL EDGE: no rejection → route to "check_income"

NODE 3: check_income(state)
  monthly_income = 120000 / 12 = 10000
  estimated_monthly_payment = 500000 * 0.01 = 5000
  dti = (10000/12 + 5000) / 10000 = 0.583
  max_dti = 0.43

  0.583 > 0.43 ← DTI too high!
  → returns: {
      debt_to_income_ratio: 0.583,
      decision: "rejected",
      rejection_reason: "Debt-to-income ratio 58.3% exceeds maximum 43%"
    }
  STATE NOW: { ...+ decision: "rejected", rejection_reason: "..." }

CONDITIONAL EDGE: decision=rejected → route to "reject_application"

NODE 7: reject_application(state)
  logs: "Application rejected | reason: DTI too high"
  → returns: { decision: "rejected" }  (already set)
  → routes to END

FINAL STATE:
  { decision: "rejected",
    rejection_reason: "Debt-to-income ratio 58.3% exceeds maximum 43%",
    debt_to_income_ratio: 0.583,
    validation_passed: True }
```

**Output:**
```json
{
  "decision": "rejected",
  "rejection_reason": "Debt-to-income ratio 58.3% exceeds maximum 43%",
  "debt_to_income_ratio": 0.583
}
```

**Now via Autonomous Agent:**
```json
POST /api/v1/autonomous/query
{ "query": "Am I eligible for a home loan?",
  "context": { "credit_score": 720, "annual_income": 120000, ... } }

Trace:
  classify_intent: "loan" keyword found → intent="loan"
  plan_workflow: confirmed workflow="loan"
  execute_workflow: calls run_loan_eligibility(context)
  route_after_execution: no error → enrich_with_rag
  enrich_with_rag: not compliance → skipped
  synthesize_response: composes "Loan eligibility result: REJECTED. Reason: DTI..."

Response:
  {
    "answer": "Loan eligibility result: REJECTED. Reason: Debt-to-income...",
    "workflow_used": "loan",
    "execution_steps": [
      "classify_intent → loan (keyword: loan)",
      "plan_workflow → confirmed loan",
      "execute_workflow → loan ✓",
      "enrich_with_rag → skipped",
      "synthesize_response → done"
    ]
  }
```

---

## File Map

```
langraph_project/app/
├── main.py                    → FastAPI + 11 routers registered
├── config.py                  → Settings from .env
├── graphs/
│   ├── loan_eligibility.py    → 7-node multi-gate loan workflow
│   ├── account_agent.py       → ReAct loop: agent ↔ tools
│   ├── compliance_rag.py      → FAISS graded RAG pipeline
│   ├── conversation_agent.py  → Multi-turn chat + MemorySaver
│   ├── loan_committee.py      → 3-agent (Planner→Executor→Validator)
│   ├── resilient_agent.py     → Circuit breaker + retry + fallback
│   ├── transaction_router.py  → Conditional routing to 6 engines
│   ├── human_in_loop.py       → Pause/resume with officer approval
│   └── autonomous_agent.py    → Master orchestrator of all graphs
├── agents/
│   ├── planner.py             → Committee: identifies risks
│   ├── executor.py            → Committee: runs eligibility checks
│   └── validator.py          → Committee: final binding verdict
├── memory/
│   └── store.py               → MemorySaver + per-account profile
├── resilience/
│   ├── circuit_breaker.py     → Tracks LLM failure counts
│   ├── llm_factory.py         → gpt-4o-mini → gpt-3.5-turbo → rule-based chain
│   ├── retry.py               → tenacity exponential backoff
│   └── timeout.py             → 30s hard ceiling on LLM calls
└── security/
    ├── jwt_handler.py         → JWT create/verify
    └── rbac.py               → admin > officer > customer roles
```

---

## Key LangGraph Concepts in This Project

```
1. CONDITIONAL EDGES — branching:
   def after_credit_check(state) → str:
       return "reject_application" if state["decision"] == "rejected" else "check_income"

   graph.add_conditional_edges("check_credit_score", after_credit_check, {
       "check_income": "check_income",
       "reject_application": "reject_application",
   })

2. STATE ACCUMULATION — nodes only return what they change:
   Node A returns { validation_passed: True }
   Node B returns { debt_to_income_ratio: 0.58 }
   Node C returns { risk_score: 72.5 }
   LangGraph merges: all fields exist in final state

3. INTERRUPT + RESUME — Human-in-the-Loop:
   graph.compile(checkpointer=MemorySaver(), interrupt_before=["human_review"])
   Call 1: graph runs, PAUSES, state saved
   Call 2: inject decision → invoke(None) → resumes

4. REACT LOOP — Account Agent:
   agent_node → tool_node → agent_node → tool_node → ... → END
   Loop exits when LLM returns a message with NO tool_calls

5. MULTI-AGENT SHARED STATE — Loan Committee:
   planner → executor → validator
   Each agent reads the FULL accumulated state
   Each adds only their own expert fields
   Validator has final authority (binding verdict)
```
