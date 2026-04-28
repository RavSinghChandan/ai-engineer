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
    highlightLine: 1,
    status: 'pending',
    code: `runFlow(): void {
  if (!this.canRun()) return;
  const form = this.formValues[this.selectedId];
  this.state.startFlow(
    this.selectedEndpointId,
    form,
  );
  // HTTP request fired in background
  // Step animation begins immediately
}`,
    lineOutputs: {
      1: `▶ runFlow() invoked — "${trim(endpointLabel, 28)}" selected`,
      2: `canRun() → true${note ? ' | ' + note : ''}`,
      3: 'form = signal snapshot of all field values',
      4: '→ state.startFlow() called',
      5: `selectedEndpointId = "${trim(endpointLabel, 22)}"`,
      6: 'form payload passed as second argument',
      8: 'HTTP call dispatched — Angular HttpClient',
      9: 'setTimeout(nextStep, 400) — animation starts',
    },
  };
}

function routesStep(id: number, method: string, path: string, fn: string, code: string): ExecutionStep {
  const lines = code.split('\n');
  const outputs: Record<number, string> = {};
  lines.forEach((l, i) => {
    const n = i + 1;
    if (l.includes('@router')) outputs[n] = `${method} "${path}" route registered on FastAPI router`;
    else if (l.includes('async def')) outputs[n] = `▶ ${fn} invoked — Pydantic body validation complete`;
    else if (l.includes('result =') || l.includes('run_')) outputs[n] = '→ LangGraph runner called — graph.invoke() dispatched';
    else if (l.includes('return')) outputs[n] = 'Pydantic serialises result dict → JSON response 200 OK';
    else if (l.trim()) outputs[n] = l.trim().replace(/"/g, '').slice(0, 60);
  });
  return {
    id,
    name: 'FastAPI Route Handler',
    description: `FastAPI receives ${method} ${path}. Pydantic validates the request body before passing to the LangGraph runner.`,
    file: `app/api/routes/${path.split('/')[3]}.py`,
    functionName: fn,
    nodeId: 'routes',
    badge: 'FastAPI',
    highlightLine: 1,
    status: 'pending',
    code,
    lineOutputs: outputs,
  };
}

function graphStateStep(id: number, stateClass: string, code: string, description: string): ExecutionStep {
  const lines = code.split('\n');
  const outputs: Record<number, string> = {};
  lines.forEach((l, i) => {
    const n = i + 1;
    if (l.includes('class ')) outputs[n] = `▶ ${stateClass} TypedDict created — LangGraph state container`;
    else if (l.includes(':') && !l.includes('#')) {
      const field = l.trim().split(':')[0].trim();
      outputs[n] = field ? `${field} field declared in state schema` : '';
    } else if (l.includes('#')) outputs[n] = l.trim().replace('#', '→').trim();
  });
  return {
    id,
    name: 'Graph State Initialised',
    description,
    file: 'app/schemas/state.py',
    functionName: stateClass,
    nodeId: 'graph',
    badge: 'StateGraph',
    highlightLine: 1,
    status: 'pending',
    code,
    lineOutputs: outputs,
  };
}

function classifierStep(id: number, name: string, file: string, fn: string, code: string, description: string): ExecutionStep {
  const lines = code.split('\n');
  const outputs: Record<number, string> = {};
  lines.forEach((l, i) => {
    const n = i + 1;
    if (l.includes('def ')) outputs[n] = `▶ ${fn} invoked — receives full graph state`;
    else if (l.includes('return')) outputs[n] = `classification result returned → state merged by LangGraph`;
    else if (l.includes('if ') || l.includes('elif ')) outputs[n] = `condition evaluated: ${l.trim().replace(/"/g, "'").slice(0, 55)}`;
    else if (l.includes('for ')) outputs[n] = `iterating keyword/rule map`;
    else if (l.includes('=') && !l.includes('==')) outputs[n] = `${l.trim().split('=')[0].trim()} assigned`;
    else if (l.trim() && !l.trim().startsWith('#')) outputs[n] = l.trim().slice(0, 60);
  });
  return {
    id,
    name: `Classifier: ${name}`,
    description,
    file,
    functionName: fn,
    nodeId: 'classifier',
    badge: 'Classifier Node',
    highlightLine: 1,
    status: 'pending',
    code,
    lineOutputs: outputs,
  };
}

function llmCallStep(id: number, model: string, fn: string, code: string, description: string): ExecutionStep {
  const lines = code.split('\n');
  const outputs: Record<number, string> = {};
  lines.forEach((l, i) => {
    const n = i + 1;
    if (l.includes('def ')) outputs[n] = `▶ ${fn} node executing — LangGraph called this node`;
    else if (l.includes('ChatOpenAI') || l.includes('llm =')) outputs[n] = `${model} client initialised — temperature=0 for determinism`;
    else if (l.includes('.invoke(') && l.includes('llm')) outputs[n] = `→ ${model} API called — awaiting response (~800ms avg)`;
    else if (l.includes('SystemMessage')) outputs[n] = 'System prompt injected — defines LLM persona and constraints';
    else if (l.includes('HumanMessage')) outputs[n] = 'User query added to message list';
    else if (l.includes('return')) outputs[n] = 'LLM response merged into graph state';
    else if (l.includes('response') && l.includes('.content')) outputs[n] = 'response.content extracted — raw string answer';
    else if (l.trim() && !l.trim().startsWith('#')) outputs[n] = l.trim().slice(0, 60);
  });
  return {
    id,
    name: `LLM Call (${model})`,
    description,
    file: 'app/core/llm.py',
    functionName: fn,
    nodeId: 'llm',
    badge: 'LLM Call',
    highlightLine: 1,
    status: 'pending',
    code,
    lineOutputs: outputs,
  };
}

function conditionalEdgeStep(id: number, fromNode: string, routingKey: string, code: string, description: string): ExecutionStep {
  const lines = code.split('\n');
  const outputs: Record<number, string> = {};
  lines.forEach((l, i) => {
    const n = i + 1;
    if (l.includes('def ')) outputs[n] = `▶ routing function called — reads state from "${fromNode}" node output`;
    else if (l.includes('return')) outputs[n] = `routing decision = "${routingKey}" → LangGraph selects next node`;
    else if (l.includes('add_conditional_edges')) outputs[n] = `conditional edges wired at graph compile time`;
    else if (l.includes('"') && l.includes(':')) outputs[n] = `destination mapping: ${l.trim().replace(/,\s*$/, '')}`;
    else if (l.includes('if ') || l.includes('elif ')) outputs[n] = `condition: ${l.trim().slice(0, 55)}`;
    else if (l.trim() && !l.trim().startsWith('#')) outputs[n] = l.trim().slice(0, 60);
  });
  return {
    id,
    name: 'Conditional Edge Fires',
    description,
    file: 'app/graphs/graph.py',
    functionName: 'add_conditional_edges()',
    nodeId: 'edge',
    badge: 'Conditional Edge',
    highlightLine: 1,
    status: 'pending',
    code,
    lineOutputs: outputs,
  };
}

function toolStep(id: number, name: string, file: string, fn: string, code: string, description: string): ExecutionStep {
  const lines = code.split('\n');
  const outputs: Record<number, string> = {};
  lines.forEach((l, i) => {
    const n = i + 1;
    if (l.includes('@tool')) outputs[n] = 'LangChain @tool decorator — registers function as callable tool';
    else if (l.includes('def ')) outputs[n] = `▶ ${fn} invoked by LangGraph ToolNode`;
    else if (l.includes('return')) outputs[n] = 'tool result returned → injected into agent messages as ToolMessage';
    else if (l.includes('ToolNode')) outputs[n] = 'ToolNode executes all pending tool_calls from last agent message';
    else if (l.includes('=') && !l.includes('==') && !l.includes('def ')) outputs[n] = `${l.trim().split('=')[0].trim()} computed`;
    else if (l.trim() && !l.trim().startsWith('#')) outputs[n] = l.trim().slice(0, 60);
  });
  return {
    id,
    name: `Tool: ${name}`,
    description,
    file,
    functionName: fn,
    nodeId: 'tool',
    badge: 'Tool / RAG',
    highlightLine: 1,
    status: 'pending',
    code,
    lineOutputs: outputs,
  };
}

function specialistStep(id: number, name: string, file: string, fn: string, code: string, description: string): ExecutionStep {
  const lines = code.split('\n');
  const outputs: Record<number, string> = {};
  lines.forEach((l, i) => {
    const n = i + 1;
    if (l.includes('def ')) outputs[n] = `▶ ${fn} invoked — specialist node executing`;
    else if (l.includes('return')) outputs[n] = 'result dict returned → LangGraph merges into shared state';
    else if (l.includes('if ') || l.includes('elif ')) outputs[n] = `branch condition: ${l.trim().slice(0, 50)}`;
    else if (l.includes('=') && !l.includes('==') && !l.includes('def ')) outputs[n] = `${l.trim().split('=')[0].trim()} computed`;
    else if (l.trim() && !l.trim().startsWith('#')) outputs[n] = l.trim().slice(0, 60);
  });
  return {
    id,
    name: `Specialist: ${name}`,
    description,
    file,
    functionName: fn,
    nodeId: 'specialist',
    badge: 'Specialist Node',
    highlightLine: 1,
    status: 'pending',
    code,
    lineOutputs: outputs,
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
    highlightLine: 1,
    status: 'pending',
    code: `from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
graph = builder.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "${sessionId}"}}
result = graph.invoke(initial_state, config=config)
# MemorySaver saves snapshot after EVERY node execution

# Next call — same thread_id reloads full prior state
result2 = graph.invoke({"query": "follow-up"}, config=config)`,
    lineOutputs: {
      1: '▶ MemorySaver imported from langgraph.checkpoint.memory',
      3: 'checkpointer = MemorySaver() — in-process dict store',
      4: 'graph.compile(checkpointer=...) — checkpointing wired in',
      6: `config["thread_id"] = "${sessionId}" — unique session key`,
      7: 'graph.invoke → state snapshot saved after each node',
      8: 'checkpoint: {query, intent, result, messages, ...} persisted',
      10: 'Next call: same thread_id → full prior state replayed',
      11: 'LangGraph merges prior state + new input automatically',
    },
  };
}

function responseStep(id: number, modelName: string, description: string, fields?: string): ExecutionStep {
  const fieldLines = fields || `    answer: str
    execution_steps: list[str]
    session_id: Optional[str] = None
    sources: list[str] = []`;
  const code = `class ${modelName}(BaseModel):
${fieldLines}

# Route handler assembles response from final graph state:
final_state = graph.invoke(initial_state, config=config)
return ${modelName}(
    **{k: final_state[k] for k in ${modelName}.model_fields}
)
# FastAPI serialises to JSON → HTTP 200 OK`;
  const lines = code.split('\n');
  const outputs: Record<number, string> = {};
  lines.forEach((l, i) => {
    const n = i + 1;
    if (l.includes('class ')) outputs[n] = `▶ ${modelName}(BaseModel) — Pydantic response schema`;
    else if (l.trim().includes(':') && !l.includes('class') && !l.includes('#') && !l.includes('=') && !l.includes('(')) {
      const field = l.trim().split(':')[0];
      outputs[n] = `${field} field → populated from LangGraph final state`;
    }
    else if (l.includes('final_state =')) outputs[n] = 'graph.invoke() returns final accumulated state dict';
    else if (l.includes('return')) outputs[n] = `${modelName}(**result) constructed — all fields validated by Pydantic`;
    else if (l.includes('**{k:')) outputs[n] = 'dict comprehension maps state keys → model fields';
    else if (l.includes('FastAPI')) outputs[n] = 'FastAPI auto-serialises Pydantic model → JSON 200 OK response';
    else if (l.trim() && !l.trim().startsWith('#')) outputs[n] = l.trim().slice(0, 60);
  });
  return {
    id,
    name: 'Response Serialised',
    description,
    file: 'app/schemas/response.py',
    functionName: modelName,
    nodeId: 'response',
    badge: 'Pydantic',
    highlightLine: 1,
    status: 'pending',
    code,
    lineOutputs: outputs,
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
        graphStateStep(3, 'HealthState', `# Health check has no graph state — direct FastAPI response
class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    # No LangGraph pipeline — returns immediately`, 'Health endpoint bypasses LangGraph entirely — no state graph needed. Direct Pydantic serialisation.'),
        classifierStep(4, 'status_check', 'app/api/routes/health.py', 'health_check()', `def health_check() -> HealthResponse:
    # No classifier — simple liveness probe
    return HealthResponse(
        status="healthy",
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
    )`, 'No intent classification needed — health check is always a direct liveness probe response.'),
        llmCallStep(5, 'N/A — no LLM', 'health_check()', `# Health endpoint does NOT call an LLM
# No token cost — pure in-process response
return HealthResponse(status="healthy", ...)
# LangGraph LLM nodes are skipped for liveness checks`, 'Health check skips all LLM nodes — designed for zero-latency, zero-cost liveness probing.'),
        conditionalEdgeStep(6, 'health_gate', 'healthy', `# No conditional edge — health always returns "healthy"
# In a real system you might add:
if not db.ping():
    return {"status": "degraded"}
if not redis.ping():
    return {"status": "degraded"}
# For now: always healthy`, 'Health gate: all downstream services reachable → routing directly to response.'),
        specialistStep(7, 'liveness_probe', 'app/api/routes/health.py', 'health_check()', `# No specialist sub-graph — single function
@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
    )`, 'Liveness probe returns immediately — no sub-graph delegation required.'),
        toolStep(8, 'N/A — no tools', 'app/api/routes/health.py', 'health_check()', `# No tool calls in health endpoint
# Tools used by ReAct agents (account, compliance, resilience)
# Health is a pure in-process response — no external I/O
return HealthResponse(status="healthy")`, 'No tool invocation — health check is purely in-process with no external dependencies.'),
        memorySaverStep(9),
        responseStep(10, 'HealthResponse', 'Returns { status: "healthy", service: "Banking AI Platform", version: "1.0.0" } — no LangGraph involved.',
          `    status: str          # "healthy" | "degraded" | "down"
    service: str         # "Banking AI Platform"
    version: str         # "1.0.0"`),
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
        llmCallStep(5, 'N/A — rule-based routing', `route_transaction()`, `# Transaction router uses RULE-BASED classification — no LLM cost
# The classifier node (step 4) already determined the route
# LLM is skipped: transaction_type is an enum, not ambiguous text
ROUTING_MAP = {
    "payment":        RoutingDecision.PAYMENT_PROCESSOR,
    "fraud_check":    RoutingDecision.FRAUD_ENGINE,
    "loan":           RoutingDecision.LOAN_PROCESSOR,
    "account_lookup": RoutingDecision.ACCOUNT_SERVICE,
}
# Deterministic — no LLM tokens consumed`, `Transaction routing is deterministic — "${txType}" maps directly to ${destNode} with no LLM call needed.`),
        conditionalEdgeStep(6, 'classify_transaction', txType, GRAPH_COMPILE_CODE, `Conditional edge evaluates state["transaction_type"] = "${txType}". Routes to ${destNode} — the correct processor sub-node.`),
        specialistStep(7, destNode, 'app/graphs/transaction_router.py', `${destNode}()`, `def ${destNode}(state: TransactionGraphState):\n    logger.info("Routing %s → ${txType.toUpperCase()}", state["transaction_id"])\n    return {\n        "routing_decision": RoutingDecision.${txType.toUpperCase()}_PROCESSOR,\n        "requires_human_review": ${txType === 'fraud_check' || Number(amount) > 50000},\n    }`, `Transaction routed to ${txType.replace('_', ' ')} engine. Amount $${amount} → ${Number(amount) > 50000 ? 'HIGH' : 'MEDIUM'} priority.`),
        toolStep(8, `${txType}_processor`, 'app/graphs/transaction_router.py', `${destNode}()`, `# No external tool call — routing metadata computed in-process
def assign_priority(state: TransactionGraphState):
    amount = state.get("amount", 0)
    priority = (
        TransactionPriority.HIGH   if amount > 50_000 else
        TransactionPriority.MEDIUM if amount > 5_000  else
        TransactionPriority.LOW
    )
    return {"priority": priority}`, `Priority assigned: amount $${amount} → ${Number(amount) > 50000 ? 'HIGH' : 'MEDIUM'} priority. No external tool I/O required.`),
        memorySaverStep(9),
        responseStep(10, 'RouteTransactionResponse', 'Returns transaction_id, routing_decision, priority, requires_human_review, and metadata.',
          `    transaction_id: str
    routing_decision: str      # "PAYMENT_PROCESSOR" | "FRAUD_ENGINE" | ...
    priority: str              # "HIGH" | "MEDIUM" | "LOW"
    requires_human_review: bool
    metadata: dict`),
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
        llmCallStep(5, 'N/A — rule-based gates', 'check_income()', `# Loan eligibility uses DETERMINISTIC gates — no LLM calls
# Each node applies a mathematical rule, not an LLM prompt
def check_income(state: LoanGraphState):
    monthly_income = state["annual_income"] / 12
    monthly_debt   = state["existing_debt"] / 12
    dti = monthly_debt / monthly_income
    # Rule: DTI must be < 43% (Fannie Mae threshold)
    if dti > 0.43:
        return {"decision": "rejected"}
    return {"debt_to_income_ratio": round(dti, 3)}`, `Loan eligibility is rule-based — DTI ${dti}% vs 43% threshold. No LLM token cost for structured financial decisions.`),
        specialistStep(6, `check_income → DTI=${dti}%`, 'app/graphs/loan_eligibility.py', 'check_income()', `def check_income(state: LoanGraphState):\n    monthly_debt = state["existing_debt"] / 12\n    monthly_income = state["annual_income"] / 12\n    dti = monthly_debt / monthly_income if monthly_income > 0 else 1.0\n    if dti > 0.43:\n        return {"decision": "rejected", "rejection_reason": f"DTI {dti:.0%} > 43%"}\n    return {"debt_to_income_ratio": round(dti, 3)}`, `DTI = ${dti}% vs max 43% → ${dtiOk ? '✓ PASS' : '✗ FAIL'}`),
        specialistStep(7, `make_final_decision → ${decision}`, 'app/graphs/loan_eligibility.py', 'make_final_decision()', `def make_final_decision(state: LoanGraphState):\n    risk_score = state.get("risk_score", 50)\n    if risk_score < 30:\n        return {"decision": "pending_review"}\n    if state.get("decision") == "rejected":\n        return {}\n    return {\n        "decision": "approved",\n        "eligible_amount": state["requested_amount"],\n        "interest_rate": max(5.0, 15.0 - risk_score / 10),\n    }`, `Final verdict: ${decision} — credit ${creditOk ? 'OK' : 'FAILED'}, DTI ${dtiOk ? 'OK' : 'FAILED'}.`),
        toolStep(8, 'risk_score_calculator', 'app/graphs/loan_eligibility.py', 'calculate_risk()', `def calculate_risk(state: LoanGraphState) -> dict:
    score  = state["credit_score"]
    dti    = state.get("debt_to_income_ratio", 0.5)
    years  = state.get("employment_years", 0)
    # Weighted risk formula (lower = safer)
    risk = max(0, 100 - (score - 300) / 5.5 - (1 - dti) * 20 + (3 - min(years, 3)) * 5)
    return {"risk_score": round(risk, 2)}`, `Risk score computed from credit (${score}), DTI (${dti}%), employment. No external API call — in-process calculation.`),
        memorySaverStep(9),
        responseStep(10, 'LoanEligibilityResponse', `Returns decision (${decision}), eligible_amount, interest_rate, loan_term_months, DTI ratio, risk_score.`,
          `    applicant_id: str
    decision: str              # "${decision}"
    eligible_amount: float     # ${decision === 'APPROVED' ? form['requested_amount'] || 20000 : 0}
    interest_rate: float       # calculated from risk score
    loan_term_months: int      # 36 | 60 | 120
    debt_to_income_ratio: float
    risk_score: float
    rejection_reason: Optional[str]`),
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
        classifierStep(4, 'detect_query_intent', 'app/graphs/account_agent.py', 'react_agent()', `# ReAct agent implicitly classifies intent via tool selection
# "balance" → selects get_account_details
# "transactions" → selects get_transactions
# "both" → chains both tools in sequence
def react_agent(state: AccountAgentState):
    messages = state.get("messages", [])
    response = llm_with_tools.invoke([SystemMessage(PROMPT), *messages, HumanMessage(state["query"])])
    return {"messages": [*messages, response]}`, `Query "${trim(q, 35)}" — LLM classifies intent and selects appropriate tools from [get_account_details, get_transactions].`),
        llmCallStep(5, 'gpt-4o-mini', 'react_agent()', `tools = [get_account_details, get_transactions]
llm_with_tools = llm.bind_tools(tools)

def react_agent(state: AccountAgentState):
    messages = state.get("messages", [])
    response = llm_with_tools.invoke([
        SystemMessage(ACCOUNT_AGENT_PROMPT),
        *messages,
        HumanMessage(state["query"]),
    ])
    return {"messages": [*messages, response]}`, `LLM (gpt-4o-mini) with tool bindings reasons over: "${trim(q, 40)}". Decides which tools to call.`),
        conditionalEdgeStep(6, 'agent', 'tools', `def should_continue(state: AccountAgentState) -> str:\n    last_msg = state["messages"][-1]\n    if last_msg.tool_calls:       # agent requested tools\n        return "tools"\n    return END                     # agent is done\n\ngraph.add_conditional_edges("agent", should_continue,\n    {"tools": "tool_node", END: END})`, `LLM returned tool_calls → routing to "tools" branch. get_account_details("${acctId}") will be called.`),
        specialistStep(7, 'react_loop (observe + re-reason)', 'app/graphs/account_agent.py', 'react_agent()', `# After tool results are injected, agent re-reasons
# ReAct loop: think → act → observe → think → ...
def react_agent(state: AccountAgentState):
    # Tool results are now in messages
    response = llm_with_tools.invoke(state["messages"])
    if not response.tool_calls:
        # Agent is satisfied — extract final answer
        return {"answer": response.content, "messages": [...]}
    # More tools needed — loop continues`, `ReAct agent observes tool results and synthesises final answer for account ${acctId}.`),
        toolStep(8, 'get_account_details / get_transactions', 'app/graphs/account_agent.py', 'tool_executor()', `# LangGraph ToolNode executes all tool_calls from last message
tool_node = ToolNode(tools)

@tool
def get_account_details(account_id: str) -> dict:
    return MOCK_ACCOUNTS[account_id]

@tool
def get_transactions(account_id: str, limit: int = 5) -> list:
    return MOCK_TRANSACTIONS.get(account_id, [])[:limit]`, `Tool called: get_account_details("${acctId}") → balance, status, type. Result injected back into messages.`),
        memorySaverStep(9),
        responseStep(10, 'AccountQueryResponse', `Returns account_id, query, answer, and tools_used list (e.g. ["get_account_details", "get_transactions"]).`,
          `    account_id: str        # "${acctId}"
    query: str             # "${trim(q, 35)}"
    answer: str            # LLM-generated natural language answer
    tools_used: list[str]  # ["get_account_details", "get_transactions"]`),
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
        classifierStep(4, 'classify_category', 'app/graphs/compliance_rag.py', 'classify_query()', `def classify_query(state: ComplianceState):
    category = state.get("category")
    if category:
        return {"category": category}   # explicit — no LLM needed
    # Auto-detect from query text
    query = state["query"].lower()
    if any(k in query for k in ["aml","suspicious","sar"]):
        return {"category": "aml"}
    if any(k in query for k in ["kyc","identity","onboard"]):
        return {"category": "kyc"}
    return {"category": "general"}`, `Query classified as category="${cat}" — ${cat === form['category'] ? 'user-specified, no LLM needed' : 'auto-detected from query text'}.`),
        toolStep(5, 'FAISS Retrieval + Grader', 'app/graphs/compliance_rag.py', 'retrieve_documents()', COMPLIANCE_RAG_CODE, `FAISS vector store searched for "${trim(q, 35)}" with category="${cat}". Top-${k} chunks retrieved → relevance-graded by LLM grader.`),
        llmCallStep(6, 'gpt-4o-mini', 'generate_answer()', `def generate_answer(state: ComplianceState):
    context = "\\n\\n".join([
        d.page_content for d in state["graded_docs"]
    ])
    answer = llm.invoke([
        SystemMessage(RAG_SYSTEM_PROMPT + "\\n\\nContext:\\n" + context),
        HumanMessage(state["query"]),
    ])
    return {"answer": answer.content}`, `LLM generates cited answer from ${Math.min(k, 3)} relevant ${cat.toUpperCase()} policy chunks. Sources: ${cat}/policy_doc_*.pdf`),
        conditionalEdgeStep(7, 'generate_answer', 'has_sources', `def route_after_answer(state: ComplianceState) -> str:
    if state.get("graded_docs"):
        return "has_sources"   # RAG answer with citations
    return "no_sources"        # fallback — no relevant docs found

graph.add_conditional_edges("generate_answer", route_after_answer,
    {"has_sources": END, "no_sources": "fallback_response"})`, `Answer generated with ${Math.min(k, 3)} cited sources → routing to END (citations available).`),
        specialistStep(8, `rag_synthesizer (${cat.toUpperCase()})`, 'app/graphs/compliance_rag.py', 'synthesize_response()', `def synthesize_response(state: ComplianceState):
    # Format the RAG answer with proper citations
    answer = state["answer"]
    sources = state["sources"]
    cited = answer + "\\n\\nSources:\\n" + "\\n".join(
        f"  [{i+1}] {s}" for i, s in enumerate(sources)
    )
    return {"answer": cited, "documents_used": len(sources)}`, `${cat.toUpperCase()} compliance answer synthesised with citations from ${Math.min(k, 3)} policy documents.`),
        memorySaverStep(9),
        responseStep(10, 'ComplianceQueryResponse', 'Returns query, answer (cited), sources, category, documents_retrieved, and documents_used count.',
          `    query: str
    answer: str                # cited RAG answer from ${cat.toUpperCase()} policy docs
    sources: list[str]         # ["${cat}/policy_doc_1.pdf", ...]
    category: str              # "${cat}"
    documents_retrieved: int   # ${k}
    documents_used: int        # after relevance grading`),
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
        conditionalEdgeStep(6, 'respond', 'continue', `def route_after_respond(state: ConversationState) -> str:
    # Check if agent needs to fetch account data
    intent = state.get("intent", "")
    if intent in ("balance", "transactions") and state.get("account_id"):
        return "fetch_account"   # → tool node
    return END                   # → save to memory

graph.add_conditional_edges("respond", route_after_respond,
    {"fetch_account": "account_tool", END: END})`, `Intent "${state['intent'] || 'general'}" — routing to END (no account lookup needed for this query).`),
        specialistStep(7, 'history_manager', 'app/graphs/conversation_agent.py', 'update_history()', `def update_history(state: ConversationState):
    # Trim history to last N turns to avoid token bloat
    MAX_TURNS = 10
    messages = state.get("messages", [])
    if len(messages) > MAX_TURNS * 2:
        # Keep system message + last N turns
        messages = messages[-(MAX_TURNS * 2):]
    return {"messages": messages, "turn_count": len(messages) // 2}`, `Conversation history managed for session "${sessId}". Sliding window keeps last 10 turns to control token usage.`),
        toolStep(8, 'history_loader', 'app/graphs/conversation_agent.py', 'load_history()', `def load_prior_history(state: ConversationState):
    # MemorySaver automatically replays state for same thread_id
    # This node formats it into LangChain message objects
    raw = state.get("messages", [])
    return {
        "messages": [
            HumanMessage(m["content"]) if m["role"] == "user"
            else AIMessage(m["content"])
            for m in raw
        ]
    }`, `Prior conversation history for session "${sessId}" loaded from MemorySaver. ${sessId === 'sess-001' ? 'First turn — empty history.' : 'Previous turns replayed into context.'}`),
        memorySaverStep(9, sessId),
        responseStep(10, 'ConversationResponse', 'Returns session_id, reply, intent, turn_count, and full conversation history.',
          `    session_id: str        # "${sessId}"
    reply: str             # LLM-generated banking assistant reply
    intent: Optional[str]  # "kyc" | "aml" | "balance" | "loan" | ...
    turn_count: int        # number of conversation turns so far
    history: list[ChatMessage]  # full prior conversation`),
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
        toolStep(8, 'credit_check / income_check / dti_check', 'app/graphs/loan_committee.py', 'executor_agent() tools', `def run_credit_check(credit_score: int) -> dict:
    return {"pass": credit_score >= 680, "score": credit_score, "min": 680}

def run_income_check(state: CommitteeState) -> dict:
    monthly = state["annual_income"] / 12
    return {"monthly_income": monthly, "sufficient": monthly > 2_500}

def compute_dti(state: CommitteeState) -> float:
    return (state["existing_debt"] / state["annual_income"]) * 100

def compute_risk_score(state: CommitteeState) -> float:
    return max(0, 100 - (state["credit_score"] - 300) / 5.5)`, `Executor Agent tools ran: credit score ${score} → ${score >= 680 ? '✓ PASS' : '✗ FAIL'}, DTI computed, risk score calculated.`),
        memorySaverStep(9),
        responseStep(10, 'LoanCommitteeResponse', 'Returns verdict (approved/rejected/escalated), risk_score, interest_rate, and agent_messages audit trail.',
          `    application_id: str
    verdict: str           # "${verdict}"
    risk_score: float      # 0–100 (lower = safer)
    interest_rate: Optional[float]
    agent_messages: list[str]  # planner + executor + validator outputs
    planner_summary: str
    executor_checks: dict
    validator_reasoning: str`),
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
        toolStep(7, 'circuit_breaker + retry_wrapper', 'app/graphs/resilient_agent.py', 'call_with_retry()', `@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(openai.RateLimitError),
    before_sleep=lambda r: logger.warning("Retry %d/3", r.attempt_number),
)
def call_with_retry(query: str) -> str:
    return llm.invoke([HumanMessage(query)]).content

# Fallback chain if all retries fail:
FALLBACK_MODELS = ["gpt-4o-mini", "gpt-3.5-turbo", "rule_based"]`, `Tenacity retry wrapper: up to 3 attempts with exponential back-off. Circuit ${circuitState} → ${circuitState === 'OPEN' ? 'fallback model used' : 'primary model succeeded'}.`),
        memorySaverStep(8),
        responseStep(9, 'ResilientQueryResponse', 'Returns response, circuit_state, used_fallback, attempt_count, and breaker_statuses for all circuit breakers.',
          `    response: str          # LLM answer (primary or fallback)
    circuit_state: str     # "${circuitState}" — CLOSED | OPEN | HALF_OPEN
    used_fallback: bool    # true if primary model failed
    attempt_count: int     # 1–3 (tenacity retry attempts)
    breaker_statuses: list[dict]  # per-breaker health snapshot`),
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
        llmCallStep(5, 'N/A — rule-based auth', 'authenticate_user()', `# JWT auth is DETERMINISTIC — no LLM involvement
# Password verified against static hash (bcrypt in production)
def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

# Role assignment is a lookup — not a language model task
role = DEMO_USERS["${user}"]["role"]  # → "${role}"
# No LLM tokens consumed for authentication flows`, `Authentication is deterministic — credential check + role lookup. No LLM call needed or appropriate for security-sensitive auth.`),
        conditionalEdgeStep(6, 'authenticate_user', 'authenticated', `def route_after_auth(state: TokenState) -> str:
    if state.get("authenticated"):
        return "create_token"     # → JWT minting
    return "reject_auth"          # → 401 Unauthorized

graph.add_conditional_edges("authenticate_user", route_after_auth,
    {"create_token": "create_token", "reject_auth": END})`, `Authentication succeeded for "${user}" → routing to create_token node.`),
        specialistStep(7, 'create_access_token', 'app/security/jwt_handler.py', 'create_access_token()', `def create_access_token(data: dict) -> str:
    payload = {
        **data,
        "exp": datetime.utcnow() + timedelta(minutes=60),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")`, `JWT token created for user="${user}", role="${role}". Expires in 60 minutes.`),
        toolStep(8, 'rbac_check', 'app/security/rbac.py', 'require_role()', `class Role(str, Enum):
    ADMIN    = "admin"
    OFFICER  = "officer"
    CUSTOMER = "customer"

ROLE_HIERARCHY = {
    Role.ADMIN:    3,
    Role.OFFICER:  2,
    Role.CUSTOMER: 1,
}

def require_role(minimum: Role):
    def checker(token_data: dict):
        user_level = ROLE_HIERARCHY[token_data["role"]]
        if user_level < ROLE_HIERARCHY[minimum]:
            raise HTTPException(403, "Insufficient role")
    return checker`, `RBAC check: user="${user}" role="${role}" → level ${role === 'admin' ? 3 : role === 'officer' ? 2 : 1}. Token includes role claim for downstream endpoint guards.`),
        memorySaverStep(9),
        responseStep(10, 'TokenResponse', `Returns access_token (JWT Bearer), role="${role}", and username="${user}".`,
          `    access_token: str      # JWT Bearer token (HS256, exp=60min)
    token_type: str        # "bearer"
    role: str              # "${role}"
    username: str          # "${user}"`),
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
        toolStep(8,
          intent === 'loan' ? 'credit_check / income_check' : intent === 'account' ? 'get_account_details / get_transactions' : intent === 'compliance' ? 'FAISS vector_search' : 'conversation_history',
          intent === 'loan' ? 'app/graphs/loan_eligibility.py' : intent === 'account' ? 'app/graphs/account_agent.py' : intent === 'compliance' ? 'app/graphs/compliance_rag.py' : 'app/graphs/conversation_agent.py',
          intent === 'loan' ? 'check_credit_score()' : intent === 'account' ? 'get_account_details()' : intent === 'compliance' ? 'retrieve_documents()' : 'load_history()',
          intent === 'loan'
            ? `def check_credit_score(state: LoanGraphState):\n    score = state["credit_score"]\n    minimum = {"home": 680, "auto": 620, "personal": 600}[state["loan_type"]]\n    if score < minimum:\n        return {"decision": "rejected", "rejection_reason": f"Score {score} < {minimum}"}\n    return {}   # pass — state unchanged\n\ndef check_income(state: LoanGraphState):\n    dti = state["monthly_debt"] / state["monthly_income"]\n    return {"dti_ratio": round(dti, 3), "income_ok": dti < 0.43}`
            : intent === 'account'
            ? `@tool\ndef get_account_details(account_id: str) -> dict:\n    return MOCK_ACCOUNTS[account_id]\n\n@tool\ndef get_transactions(account_id: str, limit: int = 5) -> list:\n    return MOCK_TRANSACTIONS[account_id][:limit]\n\n# LangGraph ToolNode executes whichever the ReAct agent selects\ntool_node = ToolNode([get_account_details, get_transactions])`
            : intent === 'compliance'
            ? `def retrieve_documents(state: ComplianceState):\n    docs = vectorstore.similarity_search(state["query"], k=state["top_k"])\n    graded = [d for d in docs if grader.invoke(d).binary_score == "yes"]\n    return {\n        "graded_docs": graded,\n        "sources": [d.metadata["source"] for d in graded],\n    }`
            : `def load_history(state: ConversationState):\n    history = memory_store.get(state["session_id"], [])\n    return {"history": history, "turn_count": len(history)}`,
          intent === 'loan'
            ? 'Credit score & income tools run inside the loan sub-graph. Each tool returns a partial state update; LangGraph merges them automatically.'
            : intent === 'account'
            ? 'ReAct agent invokes get_account_details and/or get_transactions via LangGraph ToolNode. Results merged into agent state.'
            : intent === 'compliance'
            ? 'FAISS vector store searched for top-k documents. Relevance grader filters results before passing to the LLM answer node.'
            : 'Conversation history loaded from MemorySaver. Prior turns injected into LLM context for multi-turn coherence.',
        ),
        memorySaverStep(9, sessId),
        responseStep(10, 'AutonomousResponse', 'Returns answer, workflow_used, intent_detected, execution_steps audit trail, session_id, and any sources from RAG enrichment.',
          `    answer: str              # final LLM-generated answer
    workflow_used: str       # "${intent}" sub-graph that ran
    intent_detected: str     # "${intent}" — classified from query
    execution_steps: list[str] # full audit trail from all nodes
    session_id: str          # "${sessId}" — for MemorySaver
    sources: list[str]       # RAG sources (if compliance query)
    used_fallback: bool`),
      ];
    },
    buildBody: (form) => ({
      query:      form['query'] || 'Am I eligible for a home loan?',
      session_id: form['session_id'] || 'sess-001',
    }),
  },
];
