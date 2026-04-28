import { ExecutionStep, FlowNode } from '../models/execution-step.model';

// ── Complete LangGraph Architecture Flow Nodes ──────────────────────────────
// Full representation: State → Classifier → LLM → Edge → Specialist → Tool/RAG → Memory → Response
export const FLOW_NODES: FlowNode[] = [
  { id: 'user',       label: 'User',      icon: 'U',  status: 'pending', color: '#0071e3' },
  { id: 'routes',     label: 'Routes',    icon: 'R',  status: 'pending', color: '#5e5ce6' },
  { id: 'graph',      label: 'State',     icon: 'G',  status: 'pending', color: '#bf5af2' },
  { id: 'classifier', label: 'Classify',  icon: 'C',  status: 'pending', color: '#ff375f' },
  { id: 'llm',        label: 'LLM',       icon: 'L',  status: 'pending', color: '#ff9f0a' },
  { id: 'edge',       label: 'Edge',      icon: '→',  status: 'pending', color: '#ff453a' },
  { id: 'specialist', label: 'Agent',     icon: 'N',  status: 'pending', color: '#0a84ff' },
  { id: 'tool',       label: 'Tool',      icon: 'T',  status: 'pending', color: '#64d2ff' },
  { id: 'memory',     label: 'Memory',    icon: 'M',  status: 'pending', color: '#30d158' },
  { id: 'response',   label: 'Done',      icon: '✓',  status: 'pending', color: '#34c759' },
];

export const MOCK_STEPS: ExecutionStep[] = [
  {
    id: 0,
    name: 'Query Submitted',
    description: 'User sends a natural-language query from the frontend. Angular serialises the form payload and POSTs it to FastAPI via the dev-server proxy.',
    file: 'frontend/src/app/services/execution-state.service.ts',
    functionName: 'startFlow()',
    nodeId: 'user',
    badge: 'Angular',
    highlightLine: 3,
    status: 'pending',
    code: `startFlow(endpointId: string, form: Record<string, any>): void {
  this.resetState();
  const config = ENDPOINT_CONFIGS.find(e => e.id === endpointId);
  this._isRunning.set(true);
  // Fire the real HTTP call in background
  this.callHttp(config, form);
  // Kick off the step-by-step animation
  setTimeout(() => this.nextStep(), 400);
}`,
    lineOutputs: {
      1: '▶ startFlow() — user clicked "Run"',
      2: 'resetState() — clearing previous execution',
      3: 'config found: POST /api/v1/autonomous/query',
      5: 'HTTP call dispatched in background',
      7: 'Animation begins — stepping through nodes',
    },
  },
  {
    id: 1,
    name: 'HTTP Request Received',
    description: 'FastAPI receives POST /api/v1/autonomous/query. Pydantic validates the request body before entering the LangGraph pipeline.',
    file: 'app/api/routes/autonomous.py',
    functionName: 'query()',
    nodeId: 'routes',
    badge: 'FastAPI',
    highlightLine: 3,
    status: 'pending',
    code: `@router.post("/query", response_model=AutonomousResponse)
async def query(request: AutonomousRequest):
    result = run_autonomous_agent(
        query=request.query,
        session_id=request.session_id,
        account_id=request.account_id,
        context=request.context,
    )
    return AutonomousResponse(**result)`,
    lineOutputs: {
      1: 'POST "/query" endpoint mounted on FastAPI router',
      2: '▶ query() invoked — request body Pydantic-validated',
      3: '→ run_autonomous_agent() called with validated inputs',
    },
  },
  {
    id: 2,
    name: 'Graph State Initialised',
    description: 'AutonomousAgentState TypedDict created. LangGraph merges partial dicts returned by each node into this single shared state — no global variables needed.',
    file: 'app/schemas/autonomous.py',
    functionName: 'AutonomousAgentState',
    nodeId: 'graph',
    badge: 'StateGraph',
    highlightLine: 2,
    status: 'pending',
    code: `class AutonomousAgentState(TypedDict, total=False):
    query: str            # ← user's natural-language query
    session_id: str       # ← MemorySaver thread key
    account_id: Optional[str]
    context: Optional[dict]
    intent: Optional[str]     # ← filled by classifier node
    workflow: Optional[str]   # ← filled by classifier node
    result: Optional[dict]    # ← filled by specialist node
    rag_context: Optional[str]# ← filled by RAG node
    execution_steps: list[str]
    error: Optional[str]`,
    lineOutputs: {
      1: 'class AutonomousAgentState(TypedDict) — shared state schema',
      2: '▶ query = "Am I eligible for a home loan?" ← from request',
      3: 'session_id = "sess-001" ← thread key for MemorySaver',
      6: 'intent = None ← will be set by classify_intent node',
      7: 'workflow = None ← will be set by classify_intent node',
      8: 'result = None ← will be set by execute_workflow node',
    },
  },
  {
    id: 3,
    name: 'Intent Classifier Node',
    description: 'classify_intent: keyword map checked first (zero LLM cost). Falls back to GPT-4o-mini only for truly ambiguous queries — saves tokens on 90% of requests.',
    file: 'app/graphs/autonomous_agent.py',
    functionName: 'classify_intent()',
    nodeId: 'classifier',
    badge: 'Classifier Node',
    highlightLine: 4,
    status: 'pending',
    code: `INTENT_WORKFLOW_MAP = {
    "loan": "loan", "mortgage": "loan", "borrow": "loan",
    "account": "account", "balance": "account",
    "kyc": "compliance", "aml": "compliance", "gdpr": "compliance",
    "fraud": "transaction", "suspicious": "transaction",
}

def classify_intent(state: AutonomousAgentState):
    query = state["query"].lower()
    for keyword, workflow in INTENT_WORKFLOW_MAP.items():
        if keyword in query:           # zero LLM cost — keyword hit
            return {"intent": keyword, "workflow": workflow}
    # LLM fallback for ambiguous queries
    resp = llm.invoke([SystemMessage(INTENT_PROMPT), HumanMessage(query)])
    return {"intent": resp.content.strip(), "workflow": resp.content.strip()}`,
    lineOutputs: {
      1: 'INTENT_WORKFLOW_MAP: 20+ keyword → workflow mappings',
      8: '▶ classify_intent(state) — receives full graph state',
      9: 'query.lower() = "am i eligible for a home loan?"',
      10: 'keyword loop: "loan" found in query → keyword hit',
      11: 'return {"intent": "loan", "workflow": "loan"}',
      13: 'LLM fallback — not needed (keyword matched)',
    },
  },
  {
    id: 4,
    name: 'LLM Called (GPT-4o-mini)',
    description: 'plan_workflow node calls GPT-4o-mini to select the optimal sub-graph and build execution context. The LLM reasons over the intent and available workflows.',
    file: 'app/graphs/autonomous_agent.py',
    functionName: 'plan_workflow()',
    nodeId: 'llm',
    badge: 'LLM Call',
    highlightLine: 5,
    status: 'pending',
    code: `llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

def plan_workflow(state: AutonomousAgentState):
    intent  = state.get("intent", "general")
    workflow = state.get("workflow", "conversation")
    # LLM selects the best sub-graph for this intent
    plan_msg = llm.invoke([
        SystemMessage(PLANNER_PROMPT),
        HumanMessage(
            f"Intent: {intent}\\n"
            f"Query:  {state['query']}\\n"
            f"Context: {state.get('context', {})}"
        ),
    ])
    return {
        "workflow": workflow,
        "execution_steps": [f"Plan: {plan_msg.content[:80]}"],
    }`,
    lineOutputs: {
      1: 'llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)',
      3: '▶ plan_workflow(state) — LLM planning node',
      4: 'intent = "loan" ← from classify_intent output',
      5: 'workflow = "loan" ← confirmed',
      7: 'llm.invoke([SystemMessage, HumanMessage]) → API call',
      8: 'PLANNER_PROMPT: "Select the optimal workflow for this banking query"',
      14: 'return {workflow: "loan", execution_steps: ["Plan: ..."]}',
    },
  },
  {
    id: 5,
    name: 'Conditional Edge Fires',
    description: 'LangGraph evaluates the conditional edge function. Based on workflow="loan", the edge routes execution to execute_workflow which delegates to run_loan_eligibility.',
    file: 'app/graphs/autonomous_agent.py',
    functionName: 'add_conditional_edges()',
    nodeId: 'edge',
    badge: 'Conditional Edge',
    highlightLine: 3,
    status: 'pending',
    code: `def route_after_plan(state: AutonomousAgentState) -> str:
    return state.get("workflow", "conversation")

graph.add_conditional_edges(
    "plan_workflow",                          # source node
    route_after_plan,                         # routing function
    {                                         # destination map
        "loan":        "execute_workflow",
        "account":     "execute_workflow",
        "compliance":  "execute_workflow",
        "transaction": "execute_workflow",
        "committee":   "execute_workflow",
        "conversation":"execute_workflow",
    }
)`,
    lineOutputs: {
      1: 'route_after_plan(state) → reads state["workflow"]',
      2: '▶ return "loan" — routing decision made',
      4: 'add_conditional_edges: "plan_workflow" → routing fn',
      5: 'source = "plan_workflow" node',
      6: 'routing fn returns "loan"',
      8: '"loan" → "execute_workflow" ← this branch fires',
    },
  },
  {
    id: 6,
    name: 'Specialist Sub-Graph Runs',
    description: 'execute_workflow delegates to run_loan_eligibility — a separate 6-node LangGraph pipeline that validates credit, income, risk, and issues APPROVED / REJECTED.',
    file: 'app/graphs/autonomous_agent.py',
    functionName: 'execute_workflow()',
    nodeId: 'specialist',
    badge: 'Specialist Node',
    highlightLine: 3,
    status: 'pending',
    code: `def execute_workflow(state: AutonomousAgentState):
    workflow = state.get("workflow", "conversation")
    if workflow == "loan":
        result = run_loan_eligibility(state.get("context", {}))
    elif workflow == "account":
        result = run_account_agent(state["account_id"], state["query"])
    elif workflow == "compliance":
        result = run_compliance_rag(state["query"])
    elif workflow == "committee":
        result = run_loan_committee(state.get("context", {}))
    elif workflow == "transaction":
        result = run_transaction_router(state.get("context", {}))
    else:
        result = run_conversation(state["session_id"], state["query"])
    return {"result": result, "execution_steps": [f"Ran {workflow} workflow"]}`,
    lineOutputs: {
      1: '▶ execute_workflow(state) — specialist dispatcher',
      2: 'workflow = "loan" ← from state',
      3: 'if "loan": → True — entering loan branch',
      4: 'run_loan_eligibility(context) → 6-node sub-graph',
      15: 'return {result: {...}, execution_steps: [...]}',
    },
  },
  {
    id: 7,
    name: 'Tool / RAG Invoked',
    description: 'For loan: credit_check, income_check, DTI calculation tools run. For account: get_account_details + get_transactions tools. For compliance: FAISS vector store retrieval.',
    file: 'app/graphs/loan_eligibility.py',
    functionName: 'check_credit_score() / retrieve_docs()',
    nodeId: 'tool',
    badge: 'Tool / RAG',
    highlightLine: 4,
    status: 'pending',
    code: `# ── Loan tools (Steps 3 & 7) ──────────────────────────────
def check_credit_score(state: LoanGraphState):
    score = state["credit_score"]
    minimums = {"home": 680, "business": 660, "auto": 620, "personal": 600}
    minimum = minimums[state["loan_type"]]
    if score < minimum:
        return {"decision": "rejected", "rejection_reason": f"Score {score} < {minimum}"}
    return {}   # pass — state unchanged

# ── Account tools (Step 4) ─────────────────────────────────
@tool
def get_account_details(account_id: str) -> dict:
    return MOCK_ACCOUNTS[account_id]

# ── Compliance RAG (Step 5) ────────────────────────────────
def retrieve_documents(state):
    docs = vectorstore.similarity_search(state["query"], k=state["top_k"])
    graded = [d for d in docs if grader.invoke(d).binary_score == "yes"]
    return {"graded_docs": graded, "sources": [d.metadata["source"] for d in graded]}`,
    lineOutputs: {
      2: '▶ check_credit_score(state) — loan tool node',
      3: 'credit_score = 740 ← from state',
      4: 'minimums["home"] = 680',
      5: 'minimum = 680',
      6: '740 >= 680 → PASS — returning {}',
      11: 'get_account_details("ACC-1001") → balance, status, type',
      15: 'vectorstore.similarity_search(query, k=5) → top chunks',
      16: 'grader filters: 3 of 5 chunks pass relevance check',
    },
  },
  {
    id: 8,
    name: 'MemorySaver Checkpoint',
    description: 'LangGraph MemorySaver persists the full graph state (including node outputs and message history) keyed by thread_id. Same session_id on the next call → full history replayed.',
    file: 'app/memory/store.py',
    functionName: 'MemorySaver.put()',
    nodeId: 'memory',
    badge: 'MemorySaver',
    highlightLine: 4,
    status: 'pending',
    code: `from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
graph = builder.compile(checkpointer=checkpointer)

# ── Every invocation uses a thread config ──────────────────
config = {"configurable": {"thread_id": "sess-001"}}
result = graph.invoke(initial_state, config=config)
# ↑ MemorySaver saves state after EVERY node execution

# ── Next call — full history replayed automatically ────────
result2 = graph.invoke({"query": "And the interest rate?"}, config=config)
# ↑ LangGraph reloads prior state → no need to resend history`,
    lineOutputs: {
      1: 'from langgraph.checkpoint.memory import MemorySaver',
      3: 'checkpointer = MemorySaver() — in-memory store',
      4: '▶ graph.compile(checkpointer=checkpointer) — wired in',
      7: 'config["thread_id"] = "sess-001" — unique session key',
      8: 'graph.invoke → checkpoint saved after each node',
      11: 'Next call: same thread_id → prior state reloaded',
      12: 'No need to resend query history — MemorySaver handles it',
    },
  },
  {
    id: 9,
    name: 'Response Serialised',
    description: 'AutonomousResponse Pydantic model built from the final graph state. Returns answer, workflow_used, intent_detected, full execution_steps audit trail, and any RAG sources.',
    file: 'app/schemas/autonomous.py',
    functionName: 'AutonomousResponse',
    nodeId: 'response',
    badge: 'Pydantic',
    highlightLine: 2,
    status: 'pending',
    code: `class AutonomousResponse(BaseModel):
    answer: str               # ← final LLM-generated answer
    workflow_used: str        # ← "loan" | "account" | "compliance" …
    intent_detected: str      # ← "loan" | "account" | "compliance" …
    execution_steps: list[str] = []   # ← full audit trail
    session_id: Optional[str] = None  # ← for MemorySaver continuity
    sources: list[str] = []           # ← RAG document sources

# In the route handler:
return AutonomousResponse(
    answer        = final_state["result"]["answer"],
    workflow_used = final_state["workflow"],
    intent_detected = final_state["intent"],
    execution_steps = final_state["execution_steps"],
)`,
    lineOutputs: {
      1: 'class AutonomousResponse(BaseModel) — Pydantic schema',
      2: '▶ answer: str ← "Based on your credit score of 740..."',
      3: 'workflow_used = "loan"',
      4: 'intent_detected = "loan"',
      5: 'execution_steps = ["Plan: loan workflow", "Ran loan workflow"]',
      9: 'return AutonomousResponse(**result) → JSON to Angular',
    },
  },
];
