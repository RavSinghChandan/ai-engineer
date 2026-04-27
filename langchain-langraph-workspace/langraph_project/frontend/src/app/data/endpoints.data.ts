import { ExecutionStep } from '../models/execution-step.model';

// ── Generic endpoint interface (project-agnostic) ──────────────────────────

export interface EndpointField {
  name: string;
  label: string;
  type: 'textarea' | 'toggle' | 'select' | 'text' | 'number' | 'file';
  placeholder?: string;
  default?: any;
  options?: string[];
}

export interface EndpointConfig {
  id: string;
  label: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  emoji: string;
  tagline: string;
  color: string;
  fields: EndpointField[];
  buildSteps(form: Record<string, any>): ExecutionStep[];
  buildBody(form: Record<string, any>): any;
}

// ── Shared code snippets ────────────────────────────────────────────────────

const STATE_CODE = `class TransactionGraphState(TypedDict, total=False):
    transaction_id: str
    transaction_type: TransactionType
    amount: Optional[float]
    account_id: Optional[str]
    priority: Optional[TransactionPriority]
    routing_decision: Optional[RoutingDecision]
    requires_human_review: bool`;

const GRAPH_COMPILE_CODE = `builder = StateGraph(TransactionGraphState)
builder.add_node("classify_transaction", classify_transaction)
builder.add_node("route_to_payment",    route_to_payment)
builder.add_node("route_to_fraud",      route_to_fraud)
builder.add_node("route_to_loan",       route_to_loan)
builder.add_node("assign_priority",     assign_priority)
builder.add_conditional_edges(
    "classify_transaction", route_transaction,
    {"payment": "route_to_payment", "fraud_check": "route_to_fraud",
     "loan": "route_to_loan", ...}
)
graph = builder.compile()`;

const LOAN_STATE_CODE = `class LoanGraphState(TypedDict, total=False):
    applicant_id: str
    loan_type: str
    requested_amount: float
    annual_income: float
    credit_score: int
    employment_years: float
    existing_debt: float
    debt_to_income_ratio: Optional[float]
    risk_score: Optional[float]
    decision: Optional[str]
    rejection_reason: Optional[str]`;

const COMPLIANCE_RAG_CODE = `def retrieve_documents(state: ComplianceState):
    query = state["query"]
    category = state.get("category")
    # FAISS retrieval scoped to policy category
    filter_fn = (lambda m: m["category"] == category) if category else None
    docs = vectorstore.similarity_search(query, k=state["top_k"], filter=filter_fn)
    return {"retrieved_docs": docs}

def grade_documents(state: ComplianceState):
    graded, sources = [], []
    for doc in state["retrieved_docs"]:
        score = grader_chain.invoke({"document": doc, "query": state["query"]})
        if score.binary_score == "yes":
            graded.append(doc)
            sources.append(doc.metadata.get("source", "unknown"))
    return {"graded_docs": graded, "sources": sources}`;

const CONVERSATION_CODE = `def detect_intent(state: ConversationState):
    history = state.get("messages", [])
    message = state["message"]
    response = llm.invoke([
        SystemMessage(INTENT_SYSTEM_PROMPT),
        *history,
        HumanMessage(message),
    ])
    intent = response.content.strip().lower()
    return {"intent": intent}

def respond(state: ConversationState):
    history = state.get("messages", [])
    reply = llm.invoke([SystemMessage(...), *history, HumanMessage(state["message"])])
    return {"reply": reply.content, "turn_count": state.get("turn_count", 0) + 1}`;

const COMMITTEE_CODE = `def planner_agent(state: CommitteeState):
    # Agent 1: Risk Identification
    risks = llm.invoke([SystemMessage(PLANNER_PROMPT), HumanMessage(...)])
    return {"planner_output": risks.content}

def executor_agent(state: CommitteeState):
    # Agent 2: Eligibility Checks
    checks = run_eligibility_checks(state)
    return {"executor_output": checks, "risk_score": checks["risk_score"]}

def validator_agent(state: CommitteeState):
    # Agent 3: Binding Verdict
    verdict = llm.invoke([SystemMessage(VALIDATOR_PROMPT), ...])
    return {"verdict": verdict.content}`;

const RESILIENCE_CODE = `@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=4))
def call_with_retry(query: str) -> str:
    if openai_breaker.state == "open":
        raise CircuitOpenError("Circuit breaker is OPEN")
    try:
        response = llm.invoke(query)
        openai_breaker.record_success()
        return response.content
    except Exception as e:
        openai_breaker.record_failure()
        raise

def model_fallback_chain(query: str) -> str:
    for model in ["gpt-4o-mini", "gpt-3.5-turbo", "rule_based"]:
        try:
            return call_model(model, query)
        except Exception:
            continue
    return rule_based_fallback(query)`;

const AUTONOMOUS_CODE = `# Master orchestrator — ties all Steps together
builder = StateGraph(AutonomousAgentState)
builder.add_node("classify_intent",  classify_intent)
builder.add_node("plan_workflow",    plan_workflow)
builder.add_node("execute_workflow", execute_workflow)
builder.add_node("enrich_with_rag", enrich_with_rag)
builder.add_node("synthesize_response", synthesize_response)
builder.add_node("handle_failure",  handle_failure)
builder.add_conditional_edges("execute_workflow", route_after_execute,
    {"rag": "enrich_with_rag", "done": "synthesize_response", "error": "handle_failure"})
graph = builder.compile(checkpointer=MemorySaver())`;

const AUTH_CODE = `@router.post("/token", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": user["username"], "role": user["role"]})
    return TokenResponse(access_token=token, role=user["role"])

# Demo accounts:
# admin    / admin123    → full admin access
# officer  / officer123  → officer-level access
# customer / customer123 → read-only access`;

const HEALTH_CODE = `@router.get("/", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        service="Banking AI Platform",
        version="1.0.0",
    )`;

// ── Shared step builder helpers ────────────────────────────────────────────

const trim = (s: string, n = 38) => s.length > n ? s.slice(0, n) + '…' : s;

function uiStep(id: number, endpointLabel: string, note = ''): ExecutionStep {
  return {
    id,
    name: 'User Input Received',
    description: `User selects "${endpointLabel}" from the dropdown, fills in the form, and clicks Run AI Flow.`,
    file: 'frontend/input-panel.component.ts',
    functionName: 'runFlow()',
    nodeId: 'user',
    badge: 'Angular UI',
    highlightLine: 2,
    status: 'pending',
    code: `// User clicks "Run AI Flow"\nrunFlow(): void {\n  if (!this.canRun()) return;\n  const form = this.formValues[this.selectedId];\n  this.state.startFlow(\n    this.selectedEndpointId,  // "${trim(endpointLabel, 30)}"\n    form,\n  );\n}`,
    lineOutputs: {
      1: '// Comment — no output',
      2: '▶ runFlow() invoked — button click event fired',
      3: `canRun() → true${note ? ' | ' + note : ''}`,
      4: 'formValues retrieved from signal',
      5: '→ state.startFlow called',
    },
  };
}

function routesStep(id: number, method: string, path: string, fn: string, code: string): ExecutionStep {
  return {
    id,
    name: 'FastAPI Route Handler',
    description: `FastAPI receives ${method} ${path}. Pydantic validates the request body before passing to the LangGraph runner.`,
    file: `app/api/routes/${path.split('/')[3]}.py`,
    functionName: fn,
    nodeId: 'routes',
    badge: 'FastAPI',
    highlightLine: 2,
    status: 'pending',
    code,
    lineOutputs: {
      1: `${method} "${path}" endpoint mounted`,
      2: `▶ ${fn} invoked — request body validated by Pydantic`,
      3: `→ LangGraph runner called`,
    },
  };
}

function graphStateStep(id: number, stateClass: string, code: string, description: string): ExecutionStep {
  return {
    id,
    name: 'Graph State Initialised',
    description,
    file: 'app/schemas/state.py',
    functionName: stateClass,
    nodeId: 'graph',
    badge: 'StateGraph',
    highlightLine: 2,
    status: 'pending',
    code,
    lineOutputs: {
      1: `class ${stateClass}(TypedDict) — LangGraph state schema`,
      2: `▶ State dict created with input fields`,
      3: 'Remaining fields → None (merged by LangGraph per-node)',
    },
  };
}

function classifierStep(id: number, name: string, file: string, fn: string, code: string, description: string): ExecutionStep {
  return {
    id,
    name: `Classifier: ${name}`,
    description,
    file,
    functionName: fn,
    nodeId: 'classifier',
    badge: 'Classifier Node',
    highlightLine: 3,
    status: 'pending',
    code,
    lineOutputs: {
      1: `${fn}(state) — receives full accumulated state`,
      2: 'Input extracted and normalised',
      3: `▶ ${name} classification logic executing`,
      4: 'Returns intent / classification → state merged',
    },
  };
}

function llmCallStep(id: number, model: string, fn: string, code: string, description: string): ExecutionStep {
  return {
    id,
    name: `LLM Call (${model})`,
    description,
    file: 'app/core/llm.py',
    functionName: fn,
    nodeId: 'llm',
    badge: 'LLM Call',
    highlightLine: 3,
    status: 'pending',
    code,
    lineOutputs: {
      1: `llm = ChatOpenAI(model="${model}", temperature=0)`,
      2: 'messages = [SystemMessage(prompt), HumanMessage(query)]',
      3: `▶ llm.invoke(messages) → calling ${model} API`,
      4: 'response = ChatCompletion object',
      5: 'response.content → extracted text answer',
    },
  };
}

function conditionalEdgeStep(id: number, fromNode: string, routingKey: string, code: string, description: string): ExecutionStep {
  return {
    id,
    name: 'Conditional Edge Fires',
    description,
    file: 'app/graphs/graph.py',
    functionName: 'add_conditional_edges()',
    nodeId: 'edge',
    badge: 'Conditional Edge',
    highlightLine: 3,
    status: 'pending',
    code,
    lineOutputs: {
      1: `routing function receives state from "${fromNode}" node`,
      2: `▶ routing key = "${routingKey}" — decision made`,
      3: `"${routingKey}" → mapped to destination node`,
      4: 'LangGraph transitions execution to destination',
    },
  };
}

function toolStep(id: number, name: string, file: string, fn: string, code: string, description: string): ExecutionStep {
  return {
    id,
    name: `Tool: ${name}`,
    description,
    file,
    functionName: fn,
    nodeId: 'tool',
    badge: 'Tool / RAG',
    highlightLine: 3,
    status: 'pending',
    code,
    lineOutputs: {
      1: `${fn}() — tool invoked from LangGraph ToolNode`,
      2: 'Input extracted from agent state',
      3: `▶ ${name} executing`,
      4: 'Result returned and merged into agent state',
    },
  };
}

function specialistStep(id: number, name: string, file: string, fn: string, code: string, description: string): ExecutionStep {
  return {
    id,
    name: `Specialist: ${name}`,
    description,
    file,
    functionName: fn,
    nodeId: 'specialist',
    badge: 'Specialist Node',
    highlightLine: 3,
    status: 'pending',
    code,
    lineOutputs: {
      1: `${fn}() — specialist sub-graph invoked`,
      2: 'Domain-specific logic runs',
      3: `▶ ${name} result computed`,
    },
  };
}

function memorySaverStep(id: number, sessionId = 'sess-001'): ExecutionStep {
  return {
    id,
    name: 'MemorySaver Checkpoint',
    description: 'LangGraph MemorySaver persists full graph state keyed by thread_id (session_id). Same session_id on the next call → full history replayed automatically.',
    file: 'app/memory/store.py',
    functionName: 'MemorySaver.put()',
    nodeId: 'memory',
    badge: 'MemorySaver',
    highlightLine: 3,
    status: 'pending',
    code: `checkpointer = MemorySaver()
graph = builder.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "${sessionId}"}}
result = graph.invoke(initial_state, config=config)

# Next call with same thread_id → history replayed
result2 = graph.invoke(next_msg, config=config)`,
    lineOutputs: {
      1: 'MemorySaver() — in-memory checkpoint store',
      2: 'graph.compile(checkpointer=...) — checkpointing wired in',
      3: `▶ config["thread_id"] = "${sessionId}"`,
      4: 'graph.invoke → checkpoint stored after each node',
      7: 'Next call: full prior state replayed automatically',
    },
  };
}

function responseStep(id: number, modelName: string, description: string): ExecutionStep {
  return {
    id,
    name: 'Response Serialised',
    description,
    file: 'app/schemas/response.py',
    functionName: modelName,
    nodeId: 'response',
    badge: 'Pydantic',
    highlightLine: 2,
    status: 'pending',
    code: `class ${modelName}(BaseModel):
    # Fields populated from LangGraph final state
    ...

# In route handler:
return ${modelName}(**final_state)`,
    lineOutputs: {
      1: `class ${modelName}(BaseModel) — Pydantic response schema`,
      2: `▶ Fields populated from LangGraph final state`,
      4: `return ${modelName}(**result) → JSON serialised`,
    },
  };
}

// ── Endpoint Configurations ────────────────────────────────────────────────

export const ENDPOINT_CONFIGS: EndpointConfig[] = [

  // 1. HEALTH
  {
    id: 'health',
    label: 'Health — Is the platform up?',
    method: 'GET',
    path: '/api/v1/health/',
    emoji: '💚',
    tagline: 'Simple liveness check — no LangGraph execution',
    color: '#22c55e',
    fields: [],
    buildSteps(_form) {
      return [
        uiStep(1, this.label),
        routesStep(2, 'GET', this.path, 'health_check()', HEALTH_CODE),
        responseStep(3, 'HealthResponse', 'Returns { status: "healthy", service: "Banking AI Platform", version: "1.0.0" } — no LangGraph involved.'),
      ];
    },
    buildBody: () => null,
  },

  // 2. TRANSACTION ROUTING
  // Flow: user → routes → graph → classifier → edge → specialist → response
  {
    id: 'transaction_route',
    label: 'Transaction — Route via LangGraph',
    method: 'POST',
    path: '/api/v1/transactions/route',
    emoji: '💳',
    tagline: 'Step 2 — Conditional-edge graph routes payment / fraud / loan',
    color: '#3b82f6',
    fields: [
      { name: 'transaction_id', label: 'Transaction ID', type: 'text', placeholder: 'e.g. txn-001', default: 'txn-001' },
      { name: 'transaction_type', label: 'Transaction Type', type: 'select', options: ['payment','loan','fraud_check','compliance','account_lookup'], default: 'payment' },
      { name: 'amount', label: 'Amount ($)', type: 'number', placeholder: '1200', default: 1200 },
      { name: 'account_id', label: 'Account ID', type: 'text', placeholder: 'ACC-1001', default: 'ACC-1001' },
    ],
    buildSteps(form) {
      const txType = form['transaction_type'] || 'payment';
      const amount = form['amount'] || 1200;
      const destNode = txType === 'fraud_check' ? 'route_to_fraud' : txType === 'account_lookup' ? 'route_to_account' : `route_to_${txType}`;
      return [
        uiStep(1, this.label, `type=${txType}`),
        routesStep(2, 'POST', this.path, 'route_transaction()', `@router.post("/route", response_model=RouteTransactionResponse)\nasync def route_transaction(request: RouteTransactionRequest):\n    result = run_transaction_router(request.model_dump())\n    return RouteTransactionResponse(**result)`),
        graphStateStep(3, 'TransactionGraphState', STATE_CODE, 'TransactionGraphState TypedDict initialised. LangGraph will merge partial returns from each node into this shared state.'),
        classifierStep(4, 'classify_transaction', 'app/graphs/transaction_router.py', 'classify_transaction()', `def classify_transaction(state: TransactionGraphState):\n    tx_type = state.get("transaction_type")\n    logger.info("Classifying %s | type=%s", state["transaction_id"], tx_type)\n    if tx_type not in TransactionType.__members__.values():\n        return {"transaction_type": TransactionType.UNKNOWN, "error": f"Unknown: {tx_type}"}\n    return {"transaction_type": TransactionType(tx_type)}`, `Validates and classifies transaction type. "${txType}" confirmed valid — state["transaction_type"] updated.`),
        conditionalEdgeStep(5, 'classify_transaction', txType, GRAPH_COMPILE_CODE, `Conditional edge evaluates state["transaction_type"] = "${txType}". Routes to ${destNode} — the correct processor sub-node.`),
        specialistStep(6, destNode, 'app/graphs/transaction_router.py', `${destNode}()`, `def ${destNode}(state: TransactionGraphState):\n    logger.info("Routing %s → ${txType.toUpperCase()}", state["transaction_id"])\n    return {\n        "routing_decision": RoutingDecision.${txType.toUpperCase()}_PROCESSOR,\n        "requires_human_review": ${txType === 'fraud_check' || Number(amount) > 50000},\n    }`, `Transaction routed to ${txType.replace('_', ' ')} engine. Amount $${amount} → ${Number(amount) > 50000 ? 'HIGH' : 'MEDIUM'} priority.`),
        responseStep(7, 'RouteTransactionResponse', 'Returns transaction_id, routing_decision, priority, requires_human_review, and metadata.'),
      ];
    },
    buildBody: (form) => ({
      transaction_id:   form['transaction_id'] || 'txn-001',
      transaction_type: form['transaction_type'] || 'payment',
      amount:           Number(form['amount']) || 1200,
      account_id:       form['account_id'] || 'ACC-1001',
    }),
  },

  // 3. LOAN ELIGIBILITY
  // Flow: user → routes → graph → classifier(credit) → edge(rejection gate) → specialist(income) → specialist(decision) → response
  {
    id: 'loan_eligibility',
    label: 'Loan — Eligibility Workflow',
    method: 'POST',
    path: '/api/v1/loans/eligibility',
    emoji: '🏦',
    tagline: 'Step 3 — 6-node stateful pipeline: validate → credit → income → risk → terms → decision',
    color: '#f59e0b',
    fields: [
      { name: 'applicant_id', label: 'Applicant ID', type: 'text', placeholder: 'app-001', default: 'app-001' },
      { name: 'loan_type', label: 'Loan Type', type: 'select', options: ['personal','home','business','auto'], default: 'personal' },
      { name: 'requested_amount', label: 'Requested Amount ($)', type: 'number', placeholder: '20000', default: 20000 },
      { name: 'annual_income', label: 'Annual Income ($)', type: 'number', placeholder: '80000', default: 80000 },
      { name: 'credit_score', label: 'Credit Score', type: 'number', placeholder: '750', default: 750 },
      { name: 'employment_years', label: 'Employment Years', type: 'number', placeholder: '6', default: 6 },
      { name: 'existing_debt', label: 'Existing Monthly Debt ($)', type: 'number', placeholder: '500', default: 500 },
    ],
    buildSteps(form) {
      const score = Number(form['credit_score']) || 750;
      const income = Number(form['annual_income']) || 80000;
      const debt = Number(form['existing_debt']) || 500;
      const dti = Math.round(((debt * 12) / income) * 100);
      const loanType = form['loan_type'] || 'personal';
      const minScores: Record<string, number> = { home: 680, business: 660, auto: 620, personal: 600 };
      const minScore = minScores[loanType] || 600;
      const creditOk = score >= minScore;
      const dtiOk = dti <= 43;
      const decision = creditOk && dtiOk ? 'APPROVED' : 'REJECTED';
      return [
        uiStep(1, this.label, `score=${score}, DTI=${dti}%`),
        routesStep(2, 'POST', this.path, 'check_loan_eligibility()', `@router.post("/eligibility", response_model=LoanEligibilityResponse)\nasync def check_loan_eligibility(request: LoanEligibilityRequest):\n    result = run_loan_eligibility(request.model_dump())\n    return LoanEligibilityResponse(**result)`),
        graphStateStep(3, 'LoanGraphState', LOAN_STATE_CODE, '6-node LangGraph pipeline initialised. Each node performs one eligibility gate — failure short-circuits directly to reject_application.'),
        classifierStep(4, 'check_credit_score', 'app/graphs/loan_eligibility.py', 'check_credit_score()', `def check_credit_score(state: LoanGraphState):\n    score = state["credit_score"]\n    loan_type = state["loan_type"]\n    minimums = {"home": 680, "business": 660, "auto": 620, "personal": 600}\n    minimum = minimums.get(loan_type, 600)\n    if score < minimum:\n        return {"decision": "rejected", "rejection_reason": f"Credit score {score} < {minimum}"}\n    return {}`, `Credit score ${score} vs minimum ${minScore} for ${loanType} → ${creditOk ? '✓ PASS' : '✗ FAIL'}`),
        conditionalEdgeStep(5, 'check_credit_score', creditOk ? 'check_income' : 'reject_application', `def route_after_credit(state: LoanGraphState) -> str:\n    if state.get("decision") == "rejected":\n        return "reject_application"   # short-circuit\n    return "check_income"             # continue pipeline\n\ngraph.add_conditional_edges(\n    "check_credit_score", route_after_credit,\n    {"check_income": "check_income", "reject_application": "reject_application"}\n)`, `Credit gate: ${creditOk ? `score ${score} ≥ ${minScore} → continuing to check_income` : `score ${score} < ${minScore} → short-circuit to reject_application`}`),
        specialistStep(6, `check_income → DTI=${dti}%`, 'app/graphs/loan_eligibility.py', 'check_income()', `def check_income(state: LoanGraphState):\n    monthly_debt = state["existing_debt"] / 12\n    monthly_income = state["annual_income"] / 12\n    dti = monthly_debt / monthly_income if monthly_income > 0 else 1.0\n    if dti > 0.43:\n        return {"decision": "rejected", "rejection_reason": f"DTI {dti:.0%} > 43%"}\n    return {"debt_to_income_ratio": round(dti, 3)}`, `DTI = ${dti}% vs max 43% → ${dtiOk ? '✓ PASS' : '✗ FAIL'}`),
        specialistStep(7, `make_final_decision → ${decision}`, 'app/graphs/loan_eligibility.py', 'make_final_decision()', `def make_final_decision(state: LoanGraphState):\n    risk_score = state.get("risk_score", 50)\n    if risk_score < 30:\n        return {"decision": "pending_review"}\n    if state.get("decision") == "rejected":\n        return {}\n    return {\n        "decision": "approved",\n        "eligible_amount": state["requested_amount"],\n        "interest_rate": max(5.0, 15.0 - risk_score / 10),\n    }`, `Final verdict: ${decision} — credit ${creditOk ? 'OK' : 'FAILED'}, DTI ${dtiOk ? 'OK' : 'FAILED'}.`),
        responseStep(8, 'LoanEligibilityResponse', `Returns decision (${decision}), eligible_amount, interest_rate, loan_term_months, DTI ratio, risk_score.`),
      ];
    },
    buildBody: (form) => ({
      applicant_id:     form['applicant_id'] || 'app-001',
      loan_type:        form['loan_type'] || 'personal',
      requested_amount: Number(form['requested_amount']) || 20000,
      annual_income:    Number(form['annual_income']) || 80000,
      credit_score:     Number(form['credit_score']) || 750,
      employment_years: Number(form['employment_years']) || 6,
      existing_debt:    Number(form['existing_debt']) || 500,
    }),
  },

  // 4. ACCOUNT QUERY (ReAct)
  // Flow: user → routes → graph → llm(react) → edge(should_continue) → tool(executor) → memory → response
  {
    id: 'account_query',
    label: 'Account — ReAct Agent Query',
    method: 'POST',
    path: '/api/v1/accounts/query',
    emoji: '👤',
    tagline: 'Step 4 — ReAct loop: think → call tool → observe → answer',
    color: '#8b5cf6',
    fields: [
      { name: 'account_id', label: 'Account ID', type: 'select', options: ['ACC-1001','ACC-1002','ACC-1003'], default: 'ACC-1001' },
      { name: 'query', label: 'Natural-language question', type: 'textarea', placeholder: 'What is my current balance?', default: 'What is my current balance and last 3 transactions?' },
    ],
    buildSteps(form) {
      const acctId = form['account_id'] || 'ACC-1001';
      const q = form['query'] || 'What is my balance?';
      return [
        uiStep(1, this.label, `account=${acctId}`),
        routesStep(2, 'POST', this.path, 'query_account()', `@router.post("/query", response_model=AccountQueryResponse)\nasync def query_account(request: AccountQueryRequest):\n    result = run_account_agent(\n        account_id=request.account_id,\n        query=request.query,\n    )\n    return AccountQueryResponse(**result)`),
        graphStateStep(3, 'AccountAgentState', `class AccountAgentState(TypedDict, total=False):\n    account_id: str\n    query: str\n    messages: list\n    tools_used: list[str]\n    answer: Optional[str]`, `ReAct LangGraph agent initialised for account ${acctId}. Tools: get_account_details, get_transactions.`),
        llmCallStep(4, 'gpt-4o-mini', 'react_agent()', `tools = [get_account_details, get_transactions]
llm_with_tools = llm.bind_tools(tools)

def react_agent(state: AccountAgentState):
    messages = state.get("messages", [])
    response = llm_with_tools.invoke([
        SystemMessage(ACCOUNT_AGENT_PROMPT),
        *messages,
        HumanMessage(state["query"]),
    ])
    return {"messages": [*messages, response]}`, `LLM (gpt-4o-mini) with tool bindings reasons over: "${trim(q, 40)}". Decides which tools to call.`),
        conditionalEdgeStep(5, 'agent', 'tools', `def should_continue(state: AccountAgentState) -> str:\n    last_msg = state["messages"][-1]\n    if last_msg.tool_calls:       # agent requested tools\n        return "tools"\n    return END                     # agent is done\n\ngraph.add_conditional_edges("agent", should_continue,\n    {"tools": "tool_node", END: END})`, `LLM returned tool_calls → routing to "tools" branch. get_account_details("${acctId}") will be called.`),
        toolStep(6, 'Tool Executor', 'app/graphs/account_agent.py', 'tool_executor()', `# LangGraph ToolNode executes all tool_calls from last message
tool_node = ToolNode(tools)

@tool
def get_account_details(account_id: str) -> dict:
    return MOCK_ACCOUNTS[account_id]

@tool
def get_transactions(account_id: str, limit: int = 5) -> list:
    return MOCK_TRANSACTIONS.get(account_id, [])[:limit]`, `Tool called: get_account_details("${acctId}") → balance, status, type. Result injected back into messages.`),
        memorySaverStep(7),
        responseStep(8, 'AccountQueryResponse', `Returns account_id, query, answer, and tools_used list (e.g. ["get_account_details", "get_transactions"]).`),
      ];
    },
    buildBody: (form) => ({
      account_id: form['account_id'] || 'ACC-1001',
      query:      form['query'] || 'What is my current balance?',
    }),
  },

  // 5. COMPLIANCE RAG
  // Flow: user → routes → graph → tool(FAISS retrieve) → llm(generate_answer) → memory → response
  {
    id: 'compliance_query',
    label: 'Compliance — RAG Assistant',
    method: 'POST',
    path: '/api/v1/compliance/query',
    emoji: '⚖️',
    tagline: 'Step 5 — FAISS retrieval → document grading → cited answer',
    color: '#6366f1',
    fields: [
      { name: 'query', label: 'Compliance question', type: 'textarea', placeholder: 'When must a SAR be filed?', default: 'What are the AML reporting thresholds for Suspicious Activity Reports?' },
      { name: 'category', label: 'Policy category', type: 'select', options: ['aml','kyc','pci_dss','gdpr'], default: 'aml' },
      { name: 'top_k', label: 'Documents to retrieve', type: 'select', options: ['3','5','8'], default: '5' },
    ],
    buildSteps(form) {
      const cat = form['category'] || 'aml';
      const q = form['query'] || 'AML thresholds?';
      const k = Number(form['top_k']) || 5;
      return [
        uiStep(1, this.label, `category=${cat}`),
        routesStep(2, 'POST', this.path, 'query_compliance()', `@router.post("/query", response_model=ComplianceQueryResponse)\nasync def query_compliance(request: ComplianceQueryRequest):\n    result = run_compliance_rag(\n        query=request.query,\n        category=request.category.value if request.category else None,\n        top_k=request.top_k,\n    )\n    return ComplianceQueryResponse(**result)`),
        graphStateStep(3, 'ComplianceState', `class ComplianceState(TypedDict, total=False):\n    query: str\n    category: Optional[str]   # "aml" | "kyc" | "pci_dss" | "gdpr"\n    top_k: int\n    retrieved_docs: list\n    graded_docs: list\n    sources: list[str]\n    answer: Optional[str]`, `Compliance RAG pipeline initialised. Category filter: "${cat}", top_k=${k}.`),
        toolStep(4, 'FAISS Retrieval + Grader', 'app/graphs/compliance_rag.py', 'retrieve_documents()', COMPLIANCE_RAG_CODE, `FAISS vector store searched for "${trim(q, 35)}" with category="${cat}". Top-${k} chunks retrieved → relevance-graded by LLM grader.`),
        llmCallStep(5, 'gpt-4o-mini', 'generate_answer()', `def generate_answer(state: ComplianceState):
    context = "\\n\\n".join([
        d.page_content for d in state["graded_docs"]
    ])
    answer = llm.invoke([
        SystemMessage(RAG_SYSTEM_PROMPT + "\\n\\nContext:\\n" + context),
        HumanMessage(state["query"]),
    ])
    return {"answer": answer.content}`, `LLM generates cited answer from ${Math.min(k, 3)} relevant ${cat.toUpperCase()} policy chunks. Sources: ${cat}/policy_doc_*.pdf`),
        memorySaverStep(6),
        responseStep(7, 'ComplianceQueryResponse', 'Returns query, answer (cited), sources, category, documents_retrieved, and documents_used count.'),
      ];
    },
    buildBody: (form) => ({
      query:    form['query'] || 'What are AML reporting thresholds?',
      category: form['category'] || 'aml',
      top_k:    Number(form['top_k']) || 5,
    }),
  },

  // 6. CONVERSATION CHAT
  // Flow: user → routes → graph → classifier(detect_intent) → llm(respond) → memory → response
  {
    id: 'conversation_chat',
    label: 'Conversation — Multi-turn Chat',
    method: 'POST',
    path: '/api/v1/conversation/chat',
    emoji: '💬',
    tagline: 'Step 6 — MemorySaver checkpoints: same session_id = conversation continues',
    color: '#14b8a6',
    fields: [
      { name: 'session_id', label: 'Session ID', type: 'text', placeholder: 'sess-001', default: 'sess-001' },
      { name: 'message', label: 'Your message', type: 'textarea', placeholder: 'What are KYC requirements?', default: 'What are the KYC requirements for opening a bank account?' },
      { name: 'account_id', label: 'Account ID (optional)', type: 'text', placeholder: 'ACC-1001', default: 'ACC-1001' },
    ],
    buildSteps(form) {
      const sessId = form['session_id'] || 'sess-001';
      const msg = form['message'] || 'What are KYC requirements?';
      return [
        uiStep(1, this.label, `session=${sessId}`),
        routesStep(2, 'POST', this.path, 'chat()', `@router.post("/chat", response_model=ConversationResponse)\nasync def chat(request: ConversationRequest):\n    result = run_conversation(\n        session_id=request.session_id,\n        message=request.message,\n        account_id=request.account_id,\n    )\n    return ConversationResponse(\n        session_id=request.session_id,\n        reply=result["reply"],\n        intent=result.get("intent"),\n        turn_count=result["turn_count"],\n        history=[ChatMessage(**m) for m in result["history"]],\n    )`),
        graphStateStep(3, 'ConversationState', `class ConversationState(TypedDict, total=False):\n    session_id: str\n    message: str\n    account_id: Optional[str]\n    messages: list          # ← full history replayed by MemorySaver\n    intent: Optional[str]\n    reply: Optional[str]\n    turn_count: int`, `Conversation state for session "${sessId}". MemorySaver replays full prior history automatically.`),
        classifierStep(4, 'detect_intent', 'app/graphs/conversation_agent.py', 'detect_intent()', CONVERSATION_CODE, `Intent detection for: "${trim(msg, 40)}" — classifies as KYC/AML/balance/loan/etc.`),
        llmCallStep(5, 'gpt-4o-mini', 'respond()', `def respond(state: ConversationState):
    history = state.get("messages", [])
    reply = llm.invoke([
        SystemMessage(BANKING_SYSTEM_PROMPT),
        *history,
        HumanMessage(state["message"]),
    ])
    updated_history = [
        *history,
        HumanMessage(state["message"]),
        AIMessage(reply.content),
    ]
    return {
        "reply": reply.content,
        "messages": updated_history,
        "turn_count": state.get("turn_count", 0) + 1,
    }`, `LLM generates reply with full history context. turn_count incremented. History appended for next turn.`),
        memorySaverStep(6, sessId),
        responseStep(7, 'ConversationResponse', 'Returns session_id, reply, intent, turn_count, and full conversation history.'),
      ];
    },
    buildBody: (form) => ({
      session_id: form['session_id'] || 'sess-001',
      message:    form['message'] || 'What are KYC requirements?',
      account_id: form['account_id'] || undefined,
    }),
  },

  // 7. LOAN COMMITTEE
  // Flow: user → routes → graph → llm(planner) → specialist(executor) → edge(verdict gate) → specialist(validator) → memory → response
  {
    id: 'loan_committee',
    label: 'Committee — Multi-Agent Approval',
    method: 'POST',
    path: '/api/v1/committee/evaluate',
    emoji: '🏛️',
    tagline: 'Step 7 — Planner → Executor → Validator: 3 agents share a typed state',
    color: '#d97706',
    fields: [
      { name: 'application_id', label: 'Application ID', type: 'text', placeholder: 'APP-001', default: 'APP-001' },
      { name: 'applicant_name', label: 'Applicant Name', type: 'text', placeholder: 'Alice Johnson', default: 'Alice Johnson' },
      { name: 'loan_type', label: 'Loan Type', type: 'select', options: ['personal','home','business','auto'], default: 'personal' },
      { name: 'requested_amount', label: 'Requested Amount ($)', type: 'number', placeholder: '20000', default: 20000 },
      { name: 'annual_income', label: 'Annual Income ($)', type: 'number', placeholder: '80000', default: 80000 },
      { name: 'credit_score', label: 'Credit Score', type: 'number', placeholder: '750', default: 750 },
      { name: 'employment_years', label: 'Employment Years', type: 'number', placeholder: '6', default: 6 },
      { name: 'existing_debt', label: 'Existing Monthly Debt ($)', type: 'number', placeholder: '500', default: 500 },
    ],
    buildSteps(form) {
      const score = Number(form['credit_score']) || 750;
      const name = form['applicant_name'] || 'Alice Johnson';
      const verdict = score >= 700 ? 'APPROVED' : score >= 640 ? 'ESCALATED' : 'REJECTED';
      return [
        uiStep(1, this.label, `applicant=${name}`),
        routesStep(2, 'POST', this.path, 'evaluate_loan()', `@router.post("/evaluate", response_model=LoanCommitteeResponse)\nasync def evaluate_loan(request: LoanCommitteeRequest):\n    result = run_loan_committee(request.model_dump())\n    return LoanCommitteeResponse(**result)`),
        graphStateStep(3, 'CommitteeState', `class CommitteeState(TypedDict, total=False):\n    application_id: str\n    applicant_name: str\n    loan_type: str\n    requested_amount: float\n    planner_output: Optional[str]     # ← Agent 1\n    executor_output: Optional[dict]   # ← Agent 2\n    validator_output: Optional[str]   # ← Agent 3\n    risk_score: Optional[float]\n    verdict: Optional[str]`, `3-agent committee state. All 3 agents write into the same shared typed state.`),
        llmCallStep(4, 'gpt-4o-mini', 'planner_agent()', COMMITTEE_CODE, `Agent 1 — Planner LLM analyses ${name}'s application, identifies risk factors, drafts evaluation plan.`),
        specialistStep(5, 'executor_agent (Agent 2)', 'app/graphs/loan_committee.py', 'executor_agent()', `def executor_agent(state: CommitteeState):
    # Reads planner's output from shared state
    plan = state.get("planner_output", "")
    checks = {
        "credit_check": run_credit_check(state["credit_score"]),
        "income_check":  run_income_check(state),
        "dti_check":     compute_dti(state),
        "risk_score":    compute_risk_score(state),
    }
    return {"executor_output": checks, "risk_score": checks["risk_score"]}`, `Agent 2 — Executor runs mechanical checks. Credit score ${score}: ${score >= 680 ? 'PASS' : 'BORDERLINE'}.`),
        conditionalEdgeStep(6, 'executor', verdict.toLowerCase(), `def route_after_executor(state: CommitteeState) -> str:\n    risk = state.get("risk_score", 50)\n    if risk < 25:  return "approve"       # low risk\n    if risk < 60:  return "escalate"      # borderline\n    return "reject"                        # high risk\n\ngraph.add_conditional_edges("executor_agent", route_after_executor,\n    {"approve": "validator_agent", "escalate": "validator_agent", "reject": "reject_node"})`, `Risk score evaluated → verdict path: ${verdict}. Routing to ${verdict === 'REJECTED' ? 'reject_node' : 'validator_agent'}.`),
        specialistStep(7, `validator_agent → ${verdict}`, 'app/graphs/loan_committee.py', 'validator_agent()', `def validator_agent(state: CommitteeState):
    # Reads both agents' outputs from shared state
    verdict = llm.invoke([
        SystemMessage(VALIDATOR_PROMPT),
        HumanMessage(
            f"Planner: {state['planner_output']}\\n"
            f"Executor: {state['executor_output']}\\n"
            f"Risk score: {state['risk_score']}"
        )
    ])
    return {"verdict": verdict.content, "validator_output": verdict.content}`, `Agent 3 — Validator cross-checks both agents and issues binding verdict: ${verdict}.`),
        memorySaverStep(8),
        responseStep(9, 'LoanCommitteeResponse', 'Returns verdict (approved/rejected/escalated), risk_score, interest_rate, and agent_messages audit trail.'),
      ];
    },
    buildBody: (form) => ({
      application_id:   form['application_id'] || 'APP-001',
      applicant_name:   form['applicant_name'] || 'Alice Johnson',
      loan_type:        form['loan_type'] || 'personal',
      requested_amount: Number(form['requested_amount']) || 20000,
      annual_income:    Number(form['annual_income']) || 80000,
      credit_score:     Number(form['credit_score']) || 750,
      employment_years: Number(form['employment_years']) || 6,
      existing_debt:    Number(form['existing_debt']) || 500,
    }),
  },

  // 8. RESILIENCE
  // Flow: user → routes → graph → edge(circuit_breaker) → llm(primary_call) → specialist(fallback_chain) → memory → response
  {
    id: 'resilience_query',
    label: 'Resilience — Circuit Breaker + Retry',
    method: 'POST',
    path: '/api/v1/resilience/query',
    emoji: '🛡️',
    tagline: 'Step 8 — Circuit breaker → retry (tenacity) → model fallback → timeout',
    color: '#ef4444',
    fields: [
      { name: 'query', label: 'Query', type: 'textarea', placeholder: 'Can I get a loan?', default: 'What loan options are available for a credit score of 720?' },
    ],
    buildSteps(form) {
      const q = form['query'] || 'Can I get a loan?';
      const circuitState = Math.random() > 0.7 ? 'OPEN' : 'CLOSED';
      return [
        uiStep(1, this.label),
        routesStep(2, 'POST', this.path, 'resilient_query()', `@router.post("/query", response_model=ResilientQueryResponse)\nasync def resilient_query(request: ResilientQueryRequest):\n    result = run_resilient_agent(\n        query=request.query,\n        intent=request.intent,\n    )\n    return ResilientQueryResponse(**result)`),
        graphStateStep(3, 'ResilientState', `class ResilientState(TypedDict, total=False):\n    query: str\n    response: Optional[str]\n    circuit_state: str      # "closed" | "open" | "half-open"\n    used_fallback: bool\n    attempt_count: int\n    breaker_statuses: list`, `4-layer resilience stack initialised. Circuit breaker: ${circuitState}.`),
        conditionalEdgeStep(4, 'circuit_breaker_gate', circuitState === 'OPEN' ? 'fallback' : 'primary_llm', `# Circuit breaker gate — checked before every LLM call
class CircuitBreaker:
    def check(self) -> str:
        if self.state == "open":
            if self._should_attempt_reset():
                self.state = "half-open"
                return "primary_llm"
            return "fallback"
        return "primary_llm"

graph.add_conditional_edges("circuit_breaker_gate", breaker.check,
    {"primary_llm": "call_with_retry", "fallback": "model_fallback_chain"})`, `Circuit breaker state: ${circuitState}. Routing to ${circuitState === 'OPEN' ? 'model_fallback_chain (fallback path)' : 'call_with_retry (primary path)'}.`),
        llmCallStep(5, 'gpt-4o-mini', 'call_with_retry()', RESILIENCE_CODE, `Primary LLM call through retry wrapper. Query: "${trim(q, 35)}" — up to 3 attempts with exponential back-off.`),
        specialistStep(6, 'model_fallback_chain', 'app/graphs/resilient_agent.py', 'run_resilient_agent()', `# Full 4-layer resilience pipeline
result = run_resilient_agent(query="${trim(q, 30)}")
# Layer 1: Circuit breaker gate
# Layer 2: Retry with exponential back-off (tenacity)
# Layer 3: Model fallback (gpt-4o-mini → gpt-3.5-turbo → rule-based)
# Layer 4: 30s timeout ceiling`, `Query answered through full resilience pipeline. Primary model used (circuit ${circuitState}).`),
        memorySaverStep(7),
        responseStep(8, 'ResilientQueryResponse', 'Returns response, circuit_state, used_fallback, attempt_count, and breaker_statuses for all circuit breakers.'),
      ];
    },
    buildBody: (form) => ({
      query:  form['query'] || 'What loan options are available?',
      intent: null,
    }),
  },

  // 9. AUTH TOKEN
  // Flow: user → routes → graph → classifier(authenticate) → specialist(create_token) → memory → response
  {
    id: 'auth_token',
    label: 'Auth — Get JWT Token',
    method: 'POST',
    path: '/api/v1/auth/token',
    emoji: '🔐',
    tagline: 'Step 10 — OAuth2 password flow: exchange credentials for a Bearer token',
    color: '#64748b',
    fields: [
      { name: 'username', label: 'Username', type: 'select', options: ['admin','officer','customer'], default: 'admin' },
      { name: 'password', label: 'Password', type: 'select', options: ['admin123','officer123','customer123'], default: 'admin123' },
    ],
    buildSteps(form) {
      const user = form['username'] || 'admin';
      const roleMap: Record<string, string> = { admin: 'admin', officer: 'officer', customer: 'customer' };
      const role = roleMap[user] || 'customer';
      return [
        uiStep(1, this.label, `user=${user}`),
        routesStep(2, 'POST', this.path, 'login()', AUTH_CODE),
        graphStateStep(3, 'TokenState', `class TokenState(TypedDict, total=False):\n    username: str\n    password: str\n    role: Optional[str]\n    access_token: Optional[str]\n    authenticated: bool`, `JWT auth flow for user "${user}". RBAC roles: admin > officer > customer.`),
        classifierStep(4, 'authenticate_user', 'app/security/rbac.py', 'authenticate_user()', `DEMO_USERS = {
    "admin":    {"role": "admin",    "name": "Admin User"},
    "officer":  {"role": "officer",  "name": "Loan Officer"},
    "customer": {"role": "customer", "name": "John Customer"},
}

def authenticate_user(username: str, password: str):
    user = DEMO_USERS.get(username)
    if not user:
        return None
    expected = f"{username}123"
    return user if password == expected else None`, `User "${user}" classified and authenticated → role="${role}"`),
        specialistStep(5, 'create_access_token', 'app/security/jwt_handler.py', 'create_access_token()', `def create_access_token(data: dict) -> str:
    payload = {
        **data,
        "exp": datetime.utcnow() + timedelta(minutes=60),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")`, `JWT token created for user="${user}", role="${role}". Expires in 60 minutes.`),
        memorySaverStep(6),
        responseStep(7, 'TokenResponse', `Returns access_token (JWT Bearer), role="${role}", and username="${user}".`),
      ];
    },
    buildBody: (form) => {
      const fd = new FormData();
      fd.append('username', form['username'] || 'admin');
      fd.append('password', form['password'] || 'admin123');
      return fd;
    },
  },

  // 10. AUTONOMOUS AGENT
  // Flow: user → routes → graph → classifier(classify_intent) → llm(plan_workflow) → edge(conditional) → specialist → memory → response
  {
    id: 'autonomous_query',
    label: 'Autonomous — Master Orchestrator',
    method: 'POST',
    path: '/api/v1/autonomous/query',
    emoji: '🤖',
    tagline: 'Step 11 — Classify intent → select workflow → execute sub-graph → RAG enrich → respond',
    color: '#a855f7',
    fields: [
      { name: 'query', label: 'Natural-language banking query', type: 'textarea', placeholder: 'Am I eligible for a home loan?', default: 'Am I eligible for a home loan with a credit score of 740?' },
      { name: 'session_id', label: 'Session ID', type: 'text', placeholder: 'sess-001', default: 'sess-001' },
    ],
    buildSteps(form) {
      const q = form['query'] || 'Am I eligible for a home loan?';
      const sessId = form['session_id'] || 'sess-001';
      const lower = q.toLowerCase();
      const intent = lower.includes('loan') || lower.includes('credit') ? 'loan'
                   : lower.includes('balance') || lower.includes('account') ? 'account'
                   : lower.includes('kyc') || lower.includes('aml') || lower.includes('compliance') ? 'compliance'
                   : 'conversation';
      const subFile = intent === 'loan' ? 'loan_eligibility' : intent === 'account' ? 'account_agent' : intent === 'compliance' ? 'compliance_rag' : 'conversation_agent';
      return [
        uiStep(1, this.label, `session=${sessId}`),
        routesStep(2, 'POST', this.path, 'query()', `@router.post("/query", response_model=AutonomousResponse)\nasync def query(request: AutonomousRequest):\n    result = run_autonomous_agent(\n        query=request.query,\n        session_id=request.session_id,\n        account_id=request.account_id,\n        context=request.context,\n    )\n    return AutonomousResponse(**result)`),
        graphStateStep(3, 'AutonomousAgentState', AUTONOMOUS_CODE, `Master orchestrator graph compiled. classify_intent → plan_workflow → execute_workflow → [enrich_with_rag | handle_failure] → synthesize_response.`),
        classifierStep(4, 'classify_intent', 'app/graphs/autonomous_agent.py', 'classify_intent()', `INTENT_WORKFLOW_MAP = {
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
    return {"intent": resp.content.strip(), "workflow": resp.content.strip()}`, `"${trim(q, 42)}" → intent="${intent}" via keyword map (zero LLM cost — keyword matched).`),
        llmCallStep(5, 'gpt-4o-mini', 'plan_workflow()', `llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

def plan_workflow(state: AutonomousAgentState):
    intent  = state.get("intent", "general")
    workflow = state.get("workflow", "conversation")
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
    }`, `LLM (gpt-4o-mini) selects optimal sub-graph for intent="${intent}". Execution plan generated.`),
        conditionalEdgeStep(6, 'plan_workflow', intent, `def route_after_plan(state: AutonomousAgentState) -> str:\n    return state.get("workflow", "conversation")\n\ngraph.add_conditional_edges(\n    "plan_workflow",\n    route_after_plan,\n    {\n        "loan":        "execute_workflow",\n        "account":     "execute_workflow",\n        "compliance":  "execute_workflow",\n        "transaction": "execute_workflow",\n        "conversation":"execute_workflow",\n    }\n)`, `Conditional edge evaluates workflow="${intent}" → routes to execute_workflow which delegates to run_${intent} sub-graph.`),
        specialistStep(7, `${intent} sub-graph`, `app/graphs/${subFile}.py`, `run_${intent}_workflow()`, `# Specialist sub-graph for workflow="${intent}"
${intent === 'loan' ? 'result = run_loan_eligibility(state["context"])' : intent === 'account' ? 'result = run_account_agent(state["account_id"], state["query"])' : intent === 'compliance' ? 'result = run_compliance_rag(state["query"])' : 'result = run_conversation(state["session_id"], state["query"])'}

# Optional RAG enrichment (always for compliance)
if should_enrich_with_rag(state):
    rag_result = run_compliance_rag(state["query"])
    return {"rag_context": rag_result["answer"]}`, `${intent} workflow executed. Result merged back into master graph state.`),
        memorySaverStep(8, sessId),
        responseStep(9, 'AutonomousResponse', 'Returns answer, workflow_used, intent_detected, execution_steps audit trail, session_id, and any sources from RAG enrichment.'),
      ];
    },
    buildBody: (form) => ({
      query:      form['query'] || 'Am I eligible for a home loan?',
      session_id: form['session_id'] || 'sess-001',
    }),
  },
];
