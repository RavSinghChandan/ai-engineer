import { ExecutionStep } from '../models/execution-step.model';

export interface EndpointField {
  name: string;
  label: string;
  type: 'textarea' | 'toggle' | 'select' | 'file';
  placeholder?: string;
  default?: any;
  options?: string[];
}

export interface EndpointConfig {
  id: string;
  label: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;          // full path e.g. /api/v1/chat
  emoji: string;
  tagline: string;
  fields: EndpointField[];
  buildSteps(form: Record<string, any>): ExecutionStep[];
  buildBody(form: Record<string, any>): any;  // null for GET/DELETE
}

// ── Shared code snippets ────────────────────────────────────────────────────

const ROUTES_CODE = `@router.post("/chat", response_model=AIResponse)
def chat(request: ChatRequest):
    logger.info(f"POST /chat | question={request.question!r}")
    try:
        return run_ai_service(
            question=request.question,
            prompt_version=request.prompt_version,
            use_rag=request.use_rag,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))`;

const SERVICE_CODE = `def run_ai_service(
    question: str,
    prompt_version: str = "v1",
    use_rag: bool = False,
) -> AIResponse:
    steps: list = []
    sources: list = []
    context_text = ""
    if use_rag:
        steps.append("Step 1: Retrieving relevant context")
        context_docs, sources = retrieve_context(question)
    else:
        steps.append("Step 1: Skipping RAG (not requested)")`;

const RAG_CODE = `def retrieve_context(question: str) -> Tuple[List[str], List[str]]:
    retriever = get_retriever()
    if retriever is None:
        return [], []
    docs = retriever.invoke(question)
    context = [doc.page_content for doc in docs]
    sources = list({
        doc.metadata.get("source", "unknown")
        for doc in docs
    })
    return context, sources`;

const AGENT_CODE = `tools = [calculator, get_current_datetime]

def get_agent_executor(question: str = "") -> AgentExecutor:
    llm = get_llm(question)
    agent = create_tool_calling_agent(llm, tools, _prompt)
    return AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        return_intermediate_steps=True,
        handle_parsing_errors=True,
    )`;

const LLM_ROUTER_CODE = `_CHARS_PER_TOKEN = 4

def get_llm(text: str = "") -> ChatOpenAI:
    token_count = max(1, len(text) // _CHARS_PER_TOKEN)
    if token_count >= settings.llm_token_threshold:
        logger.info(f"Routing to DeepSeek — {token_count} tokens")
        return ChatOpenAI(
            model=settings.deepseek_model,
            openai_api_key=settings.deepseek_api_key,
            openai_api_base=settings.deepseek_base_url,
        )
    else:
        logger.info(f"Routing to OpenAI — {token_count} tokens")
        return ChatOpenAI(
            model=settings.model_name,
            openai_api_key=settings.openai_api_key,
        )`;

const TOOL_CODE = `@tool
def calculator(expression: str) -> str:
    """Evaluates a mathematical expression and returns the result."""
    allowed_chars = set("0123456789+-*/()., ")
    if not all(c in allowed_chars for c in expression):
        return "Error: expression contains invalid characters."
    try:
        result = eval(
            expression,
            {"__builtins__": {}, "abs": abs, "round": round}
        )
        return str(result)
    except Exception as e:
        return f"Error evaluating expression: {e}"`;

const MEMORY_ADD_CODE = `class ChatMemory:
    def __init__(self):
        self._history: list = []

    def add(self, question: str, answer: str) -> None:
        self._history.append(HumanMessage(content=question))
        self._history.append(AIMessage(content=answer))

    def get(self) -> list:
        return self._history

    def clear(self) -> None:
        self._history = []

memory = ChatMemory()`;

const RESPONSE_CODE = `class AIResponse(BaseModel):
    answer: str
    sources: List[str] = []
    steps: List[str] = []

# Built in ai_service.py:
return AIResponse(
    answer=answer,
    sources=sources,
    steps=steps
)`;

// ── Step builders ──────────────────────────────────────────────────────────

const trim = (s: string, n = 38) => s.length > n ? s.slice(0, n) + '…' : s;

function uiStep(id: number, endpointLabel: string, question: string): ExecutionStep {
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
    code: `// User clicks "Run AI Flow"\nrunFlow(): void {\n  if (!this.question.trim()) return;\n  this.state.startFlow(\n    this.selectedEndpointId,  // "${endpointLabel}"\n    this.formValues           // { question: "${question}" }\n  );\n}`,
    lineOutputs: {
      1: `// Comment — no output`,
      2: `▶ runFlow() invoked — button click event fired`,
      3: `if ("${trim(question)}".trim()) → true — proceeding`,
      4: `→ Calling state.startFlow(endpointId, form)`,
      5: `selectedEndpointId = "${endpointLabel}"`,
      6: `formValues = { question: "${trim(question)}" }`,
    },
  };
}

function routesStep(id: number, method: string, path: string, handler: string, code: string, form?: Record<string, any>): ExecutionStep {
  const q = form?.['question'] || '';
  const useRag = !!form?.['use_rag'];
  const pv = form?.['prompt_version'] || 'v1';
  return {
    id,
    name: 'FastAPI Route Handler',
    description: `FastAPI receives ${method} ${path}. Pydantic validates the request body before passing to the service layer.`,
    file: 'app/api/routes.py',
    functionName: handler,
    nodeId: 'routes',
    badge: 'FastAPI',
    highlightLine: 2,
    status: 'pending',
    code,
    lineOutputs: q ? {
      1: `${method} "${path}" endpoint mounted on FastAPI router`,
      2: `▶ request = ChatRequest(question="${trim(q)}", use_rag=${useRag}, prompt_version="${pv}")`,
      3: `INFO: ${method} ${path} | question="${trim(q, 28)}"`,
      4: `try: → entering protected block`,
      5: `→ run_ai_service(question, prompt_version, use_rag) called`,
      6: `question = "${trim(q)}"`,
      7: `prompt_version = "${pv}"`,
      8: `use_rag = ${useRag}`,
      10: `except Exception — not triggered (happy path)`,
      11: `raise HTTPException(500) — not reached`,
    } : {
      1: `${method} "${path}" endpoint registered`,
      2: `▶ Handler invoked`,
      3: `Request received and validated`,
      4: `try: → entering protected block`,
    },
  };
}

function serviceStep(id: number, form?: Record<string, any>): ExecutionStep {
  const q = form?.['question'] || '';
  const useRag = !!form?.['use_rag'];
  return {
    id,
    name: 'Orchestrator Invoked',
    description: 'ai_service.py is the brain — it decides whether to run RAG, Agent, or a plain Chain.',
    file: 'app/services/ai_service.py',
    functionName: 'run_ai_service()',
    nodeId: 'service',
    badge: 'Orchestrator',
    highlightLine: 2,
    status: 'pending',
    code: SERVICE_CODE,
    lineOutputs: {
      1: `def run_ai_service(question, prompt_version, use_rag)`,
      2: `▶ question = "${trim(q)}"`,
      3: `prompt_version = "${form?.['prompt_version'] || 'v1'}"`,
      4: `use_rag = ${useRag}`,
      5: `→ AIResponse return type declared`,
      6: `steps = []  →  []`,
      7: `sources = []  →  []`,
      8: `context_text = ""  →  ""`,
      9: `if ${useRag}: → ${useRag ? 'True — RAG block entered' : 'False — skipping RAG'}`,
      10: `steps = ["Step 1: Retrieving relevant context"]`,
      11: `→ retrieve_context("${trim(q, 25)}") called`,
      12: `else: → skipping RAG (use_rag is False)`,
      13: `steps = ["Step 1: Skipping RAG (not requested)"]`,
    },
  };
}

function ragRetrieveStep(id: number, form?: Record<string, any>): ExecutionStep {
  const q = form?.['question'] || '';
  return {
    id,
    name: 'RAG Context Retrieved',
    description: 'FAISS vector store searched. Top-3 most similar document chunks returned as context for the LLM.',
    file: 'app/rag/retrieve.py',
    functionName: 'retrieve_context()',
    nodeId: 'rag',
    badge: 'FAISS',
    highlightLine: 4,
    status: 'pending',
    code: RAG_CODE,
    lineOutputs: {
      1: `retrieve_context(question="${trim(q, 28)}")`,
      2: `retriever = FAISS vector store retriever object`,
      3: `if retriever is None: → False (store loaded)`,
      4: `▶ docs = retriever.invoke("${trim(q, 28)}") — querying FAISS`,
      5: `context = [doc.page_content …]  →  top-3 chunk strings`,
      6: `sources = {doc.metadata["source"] …}`,
      7: `sources = list({...})  →  ["doc1.pdf", "doc2.txt"]`,
      11: `return (context_list, sources_list)`,
    },
  };
}

function ragIngestStep(id: number, form?: Record<string, any>): ExecutionStep {
  const fname = (form?.['file'] as File | null)?.name || 'document.pdf';
  return {
    id,
    name: 'Document Ingested into FAISS',
    description: 'Document is split into chunks, embedded via HuggingFace, and stored in the FAISS vector store.',
    file: 'app/rag/ingest.py',
    functionName: 'ingest_documents()',
    nodeId: 'rag',
    badge: 'FAISS Ingest',
    highlightLine: 3,
    status: 'pending',
    code: `def ingest_documents(doc_path: str) -> FAISS:
    loader = PyPDFLoader(doc_path) if doc_path.endswith(".pdf") else TextLoader(doc_path)
    docs = loader.load()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500, chunk_overlap=50
    )
    chunks = splitter.split_documents(docs)
    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    )
    vectorstore = FAISS.from_documents(chunks, embeddings)
    vectorstore.save_local(VECTOR_STORE_PATH)
    return vectorstore`,
    lineOutputs: {
      1: `ingest_documents("/tmp/${fname}")`,
      2: `▶ loader = ${fname.endsWith('.pdf') ? 'PyPDFLoader' : 'TextLoader'}("/tmp/${fname}")`,
      3: `docs = loader.load()  →  [Document(…), …]`,
      4: `splitter = RecursiveCharacterTextSplitter(chunk_size=500, overlap=50)`,
      7: `chunks = splitter.split_documents(docs)  →  e.g. 12 chunks`,
      8: `embeddings = HuggingFaceEmbeddings(all-MiniLM-L6-v2)`,
      11: `vectorstore = FAISS.from_documents(12 chunks, embeddings)`,
      12: `vectorstore.save_local("./faiss_index")`,
      13: `return vectorstore  →  FAISS index with 12 vectors`,
    },
  };
}

function agentStep(id: number, form?: Record<string, any>): ExecutionStep {
  const q = form?.['question'] || '';
  return {
    id,
    name: 'Agent Executor Built',
    description: 'AgentExecutor wraps the LLM with 2 tools: calculator and get_current_datetime. It loops: think → call tool → observe → answer.',
    file: 'app/agents/agent.py',
    functionName: 'get_agent_executor()',
    nodeId: 'agent',
    badge: 'LangChain Agent',
    highlightLine: 3,
    status: 'pending',
    code: AGENT_CODE,
    lineOutputs: {
      1: `tools = [calculator, get_current_datetime]  →  2 tools loaded`,
      3: `▶ get_agent_executor(question="${trim(q, 28)}")`,
      4: `llm = get_llm("${trim(q, 28)}")  →  ChatOpenAI instance`,
      5: `agent = create_tool_calling_agent(llm, tools, prompt)`,
      6: `return AgentExecutor(`,
      7: `  agent = structured tool-calling agent`,
      8: `  tools = [calculator, get_current_datetime]`,
      9: `  verbose = True  →  logs each think/act step`,
      10: `  return_intermediate_steps = True  →  tool trace captured`,
      11: `  handle_parsing_errors = True  →  safe recovery`,
    },
  };
}

function llmRouterStep(id: number, form?: Record<string, any>): ExecutionStep {
  const q = form?.['question'] || '';
  const charCount = q.length;
  const tokenCount = Math.max(1, Math.floor(charCount / 4));
  const threshold = 1000;
  const usesDeepSeek = tokenCount >= threshold;
  return {
    id,
    name: 'LLM Routing Decision',
    description: 'Token count estimated from question length. Short queries → OpenAI GPT-3.5. Long queries → DeepSeek (cheaper for long context).',
    file: 'app/core/llm_router.py',
    functionName: 'get_llm()',
    nodeId: 'llmrouter',
    badge: 'Router',
    highlightLine: 4,
    status: 'pending',
    code: LLM_ROUTER_CODE,
    lineOutputs: {
      1: `_CHARS_PER_TOKEN = 4  →  1 token ≈ 4 chars`,
      3: `get_llm(text="${trim(q, 28)}")`,
      4: `▶ token_count = max(1, ${charCount} // 4) = ${tokenCount}`,
      5: `if ${tokenCount} >= ${threshold}: → ${usesDeepSeek ? 'True — routing to DeepSeek' : 'False — routing to OpenAI'}`,
      6: `INFO: Routing to ${usesDeepSeek ? 'DeepSeek' : 'OpenAI'} — ${tokenCount} tokens`,
      7: `return ChatOpenAI(model="${usesDeepSeek ? 'deepseek-chat' : 'gpt-3.5-turbo'}")`,
      13: `INFO: Routing to OpenAI — ${tokenCount} tokens`,
      14: `return ChatOpenAI(model="gpt-3.5-turbo", api_key=openai_key)`,
    },
  };
}

function toolStep(id: number, form?: Record<string, any>): ExecutionStep {
  const q = form?.['question'] || '';
  const mathMatch = q.match(/[\d\s]+[×x\*\/\+\-][0-9\s]+/);
  const expr = mathMatch ? mathMatch[0].replace(/×|x/gi, '*').trim() : '144 / 12';
  let result = '';
  try {
    const safe = expr.replace(/[^0-9+\-*/().\s]/g, '');
    // eslint-disable-next-line no-new-func
    result = String(new Function(`"use strict"; return (${safe})`)());
  } catch { result = '?'; }
  return {
    id,
    name: 'Tool Executed',
    description: 'LLM chose a tool. calculator() evaluates math expressions safely. get_current_datetime() returns current date/time.',
    file: 'app/tools/tool_1.py',
    functionName: 'calculator()',
    nodeId: 'tool',
    badge: 'Tool Call',
    highlightLine: 5,
    status: 'pending',
    toolUsed: 'calculator',
    code: TOOL_CODE,
    lineOutputs: {
      1: `@tool — registers calculator as a LangChain tool`,
      2: `▶ calculator(expression="${expr}")`,
      3: `"""Evaluates a mathematical expression"""  →  tool description shown to LLM`,
      4: `allowed_chars = set("0123456789+-*/()., ")`,
      5: `if not all(c in allowed_chars …): → False — all chars valid`,
      8: `result = eval("${expr}", {"__builtins__": {}})`,
      9: `expression = "${expr}"`,
      10: `safe builtins: abs, round only`,
      12: `return str(${result})  →  "${result}"`,
    },
  };
}

function memoryStep(id: number, action: 'add' | 'get' | 'clear' = 'add', form?: Record<string, any>): ExecutionStep {
  const q = form?.['question'] || 'user message';
  const desc = action === 'add'
    ? 'Q&A pair saved as HumanMessage + AIMessage so the AI remembers context in future turns.'
    : action === 'get'
    ? 'ChatMemory.get() returns the full list of HumanMessage and AIMessage objects.'
    : 'ChatMemory.clear() wipes the entire history list.';
  return {
    id,
    name: action === 'add' ? 'Memory Updated' : action === 'get' ? 'Memory Read' : 'Memory Cleared',
    description: desc,
    file: 'app/memory/memory.py',
    functionName: `memory.${action}()`,
    nodeId: 'memory',
    badge: 'ChatMemory',
    highlightLine: action === 'add' ? 5 : action === 'get' ? 9 : 12,
    status: 'pending',
    code: MEMORY_ADD_CODE,
    lineOutputs: {
      1: `class ChatMemory — in-memory conversation store`,
      2: `__init__: self._history = []`,
      3: `self._history: list = []  →  []`,
      5: `▶ memory.add(question="${trim(q, 25)}", answer="<ai response>")`,
      6: `self._history.append(HumanMessage("${trim(q, 25)}"))`,
      7: `self._history.append(AIMessage("<answer>"))`,
      9: `▶ memory.get()  →  returns ${action === 'get' ? 'history list' : '[]'}`,
      10: `return self._history  →  [HumanMessage, AIMessage, …]`,
      12: `▶ memory.clear()`,
      13: `self._history = []  →  history wiped`,
      15: `memory = ChatMemory()  →  singleton instance created`,
    },
  };
}

function responseStep(id: number, modelName = 'AIResponse', extra = '', form?: Record<string, any>): ExecutionStep {
  const q = form?.['question'] || '';
  return {
    id,
    name: 'Response Serialized',
    description: `${modelName} Pydantic model built and returned to the Angular UI. ${extra}`,
    file: 'app/models/response_model.py',
    functionName: modelName,
    nodeId: 'response',
    badge: 'Pydantic',
    highlightLine: 2,
    status: 'pending',
    code: RESPONSE_CODE,
    lineOutputs: {
      1: `class AIResponse(BaseModel) — Pydantic response schema`,
      2: `▶ answer: str  →  "<AI generated answer>"`,
      3: `sources: List[str] = []  →  [] (no RAG) or ["doc.pdf"]`,
      4: `steps: List[str] = []  →  execution trace list`,
      7: `return AIResponse(`,
      8: `  answer = "<AI response to: ${trim(q, 22)}>",`,
      9: `  sources = [],`,
      10: `  steps = ["Step 1: …", "Step 2: …"]`,
      11: `)  →  JSON serialized and sent to Angular`,
    },
  };
}

// ── Endpoint configurations ────────────────────────────────────────────────

export const ENDPOINT_CONFIGS: EndpointConfig[] = [

  // 1. CHAT
  {
    id: 'chat',
    label: 'Chat — Ask AI a Question',
    method: 'POST',
    path: '/api/v1/chat',
    emoji: '💬',
    tagline: 'Full pipeline: Agent + optional RAG + Memory',
    fields: [
      { name: 'question', label: 'Your question', type: 'textarea', placeholder: 'e.g. What is 144 / 12?  or  Explain agents', default: 'What is 144 divided by 12?' },
      { name: 'use_rag', label: 'Search uploaded documents (RAG)', type: 'toggle', default: false },
      { name: 'prompt_version', label: 'AI style', type: 'select', options: ['v1', 'v2'], default: 'v1' },
    ],
    buildSteps(form) {
      const withRag = !!form['use_rag'];
      const q = form['question'] || 'What is 144 / 12?';
      const steps: ExecutionStep[] = [
        uiStep(1, this.label, q),
        routesStep(2, 'POST', this.path, 'chat()', ROUTES_CODE, form),
        serviceStep(3, form),
      ];
      if (withRag) steps.push(ragRetrieveStep(4, form));
      const n = steps.length + 1;
      steps.push(
        agentStep(n, form),
        llmRouterStep(n + 1, form),
        toolStep(n + 2, form),
        memoryStep(n + 3, 'add', form),
        responseStep(n + 4, 'AIResponse', 'Contains answer, sources, and step trace.', form),
      );
      return steps;
    },
    buildBody: (form) => ({
      question: form['question'] || '',
      prompt_version: form['prompt_version'] || 'v1',
      use_rag: !!form['use_rag'],
    }),
  },

  // 2. CHAT STREAM
  {
    id: 'chat_stream',
    label: 'Chat Stream — Live token-by-token',
    method: 'POST',
    path: '/api/v1/chat/stream',
    emoji: '⚡',
    tagline: 'Same pipeline as Chat but response streams in real time',
    fields: [
      { name: 'question', label: 'Your question', type: 'textarea', placeholder: 'e.g. Tell me about LangChain agents', default: 'Explain LangChain agents in simple terms' },
      { name: 'use_rag', label: 'Search uploaded documents (RAG)', type: 'toggle', default: false },
      { name: 'prompt_version', label: 'AI style', type: 'select', options: ['v1', 'v2'], default: 'v1' },
    ],
    buildSteps(form) {
      const withRag = !!form['use_rag'];
      const q = form['question'] || 'Explain LangChain agents';
      const steps: ExecutionStep[] = [
        uiStep(1, this.label, q),
        routesStep(2, 'POST', this.path, 'chat_stream()', `@router.post("/chat/stream")\ndef chat_stream(request: ChatRequest):\n    def token_generator():\n        executor = get_agent_executor(request.question)\n        result = executor.invoke({"input": request.question})\n        for token in result["output"].split(" "):\n            yield token + " "\n    return StreamingResponse(\n        token_generator(), media_type="text/plain"\n    )`, form),
        serviceStep(3, form),
      ];
      if (withRag) steps.push(ragRetrieveStep(4, form));
      const n = steps.length + 1;
      steps.push(
        agentStep(n, form),
        llmRouterStep(n + 1, form),
        toolStep(n + 2, form),
        memoryStep(n + 3, 'add', form),
        responseStep(n + 4, 'StreamingResponse', 'Tokens stream to the browser via chunked transfer encoding.', form),
      );
      return steps;
    },
    buildBody: (form) => ({
      question: form['question'] || '',
      prompt_version: form['prompt_version'] || 'v1',
      use_rag: !!form['use_rag'],
    }),
  },

  // 3. AGENT
  {
    id: 'agent',
    label: 'Agent — Direct tool-calling',
    method: 'POST',
    path: '/api/v1/agent',
    emoji: '🤖',
    tagline: 'Agent + LLM Router + Tools, no RAG or Memory',
    fields: [
      { name: 'question', label: 'Your question', type: 'textarea', placeholder: 'e.g. What is 123 × 456 and what time is it?', default: 'What is 123 × 456 and what time is it now?' },
    ],
    buildSteps(form) {
      const q = form['question'] || 'What is 7 * 8?';
      return [
        uiStep(1, this.label, q),
        routesStep(2, 'POST', this.path, 'run_agent()', `@router.post("/agent", response_model=AgentResponse)\ndef run_agent(request: AgentRequest):\n    executor = get_agent_executor(request.question)\n    result = executor.invoke({"input": request.question})\n    steps = [\n        f"{step[0].tool}({step[0].tool_input}) → {step[1]}"\n        for step in result.get("intermediate_steps", [])\n    ]\n    return AgentResponse(\n        answer=result["output"],\n        tools_used=list({s[0].tool for s in result.get("intermediate_steps", [])}),\n        steps=steps,\n    )`, form),
        agentStep(3, form),
        llmRouterStep(4, form),
        toolStep(5, form),
        responseStep(6, 'AgentResponse', 'Contains answer, tools_used list, and step trace.', form),
      ];
    },
    buildBody: (form) => ({ question: form['question'] || '' }),
  },

  // 4. HEALTH
  {
    id: 'health',
    label: 'Health Check — Is the service up?',
    method: 'GET',
    path: '/api/v1/health',
    emoji: '💚',
    tagline: 'Simple liveness check — no processing',
    fields: [],
    buildSteps(form) {
      return [
        uiStep(1, this.label, ''),
        routesStep(2, 'GET', this.path, 'health()', `@router.get("/health", tags=["Health"])\ndef health():\n    return {\n        "status": "ok",\n        "model": settings.model_name\n    }`),
        responseStep(3, 'dict', 'Returns {status: "ok", model: "gpt-3.5-turbo"} immediately with no AI call.'),
      ];
    },
    buildBody: () => null,
  },

  // 5. PROMPTS
  {
    id: 'prompts',
    label: 'Prompts — List AI personalities',
    method: 'GET',
    path: '/api/v1/prompts',
    emoji: '📝',
    tagline: 'View the hidden instructions that shape the AI',
    fields: [],
    buildSteps(form) {
      return [
        uiStep(1, this.label, ''),
        routesStep(2, 'GET', this.path, 'list_prompts()', `@router.get("/prompts", response_model=PromptsResponse)\ndef list_prompts():\n    prompts = []\n    for version in ["v1", "v2"]:\n        content = load_prompt(version)\n        prompts.append(PromptInfo(version=version, content=content))\n    return PromptsResponse(prompts=prompts)`),
        responseStep(3, 'PromptsResponse', 'Returns all prompt versions with their full instruction text.'),
      ];
    },
    buildBody: () => null,
  },

  // 6. MEMORY GET
  {
    id: 'memory_get',
    label: 'Memory — View conversation history',
    method: 'GET',
    path: '/api/v1/memory',
    emoji: '🧠',
    tagline: 'Read all messages stored in ChatMemory',
    fields: [],
    buildSteps(form) {
      return [
        uiStep(1, this.label, ''),
        routesStep(2, 'GET', this.path, 'get_memory()', `@router.get("/memory", response_model=MemoryResponse)\ndef get_memory():\n    msgs = memory.get()\n    messages = [\n        MemoryMessage(\n            role="human" if isinstance(m, HumanMessage) else "ai",\n            content=m.content\n        )\n        for m in msgs\n    ]\n    return MemoryResponse(messages=messages, total=len(msgs))`),
        memoryStep(3, 'get'),
        responseStep(4, 'MemoryResponse', 'Returns all HumanMessage + AIMessage pairs stored this session.'),
      ];
    },
    buildBody: () => null,
  },

  // 7. MEMORY DELETE
  {
    id: 'memory_delete',
    label: 'Memory — Clear conversation history',
    method: 'DELETE',
    path: '/api/v1/memory',
    emoji: '🗑️',
    tagline: 'Wipe ChatMemory and start fresh',
    fields: [],
    buildSteps(form) {
      return [
        uiStep(1, this.label, ''),
        routesStep(2, 'DELETE', this.path, 'clear_memory()', `@router.delete("/memory")\ndef clear_memory():\n    memory.clear()\n    return {"message": "Memory cleared"}`),
        memoryStep(3, 'clear'),
        responseStep(4, 'dict', 'Returns {message: "Memory cleared"}.'),
      ];
    },
    buildBody: () => null,
  },

  // 8. INGEST
  {
    id: 'ingest',
    label: 'Ingest — Upload document to RAG',
    method: 'POST',
    path: '/api/v1/ingest',
    emoji: '📂',
    tagline: 'Upload .txt or .pdf → stored in FAISS vector store',
    fields: [
      { name: 'file', label: 'Choose .txt or .pdf file', type: 'file', default: null },
    ],
    buildSteps(form) {
      return [
        uiStep(1, this.label, ''),
        routesStep(2, 'POST', this.path, 'ingest()', `@router.post("/ingest", response_model=IngestResponse)\ndef ingest(file: UploadFile = File(...)):\n    tmp_path = f"/tmp/{file.filename}"\n    with open(tmp_path, "wb") as f:\n        f.write(file.file.read())\n    vectorstore = ingest_documents(tmp_path)\n    chunks = vectorstore.index.ntotal\n    return IngestResponse(\n        message="Ingested successfully",\n        chunks=chunks,\n        source=file.filename,\n    )`, form),
        ragIngestStep(3, form),
        responseStep(4, 'IngestResponse', 'Returns chunk count + source filename after FAISS index is updated.', form),
      ];
    },
    buildBody: () => null,
  },
];
