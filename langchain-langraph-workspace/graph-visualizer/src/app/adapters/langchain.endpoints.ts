import { ExecutionStep, EndpointDef as EndpointConfig, FormField as EndpointField } from '../models/visualizer.models';

// ── Shared step helpers ──────────────────────────────────────────────────────

function userStep(id: number, desc: string, code: string, outputs: Record<number, string>): ExecutionStep {
  return {
    id, name: 'User Request', description: desc,
    file: 'frontend/app.component.ts', functionName: 'submit()',
    nodeId: 'user', badge: 'Angular', highlightLine: 1, status: 'pending', code, lineOutputs: outputs,
  };
}

function routeStep(id: number, method: string, path: string, fn: string, desc: string, code: string, outputs: Record<number, string>): ExecutionStep {
  return {
    id, name: `${method} ${path}`, description: desc,
    file: 'app/api/routes.py', functionName: fn,
    nodeId: 'routes', badge: 'FastAPI', highlightLine: 1, status: 'pending', code, lineOutputs: outputs,
  };
}

function llmRouterStep(id: number, desc: string, code: string, outputs: Record<number, string>): ExecutionStep {
  return {
    id, name: 'LLM Router Decision', description: desc,
    file: 'app/core/llm_router.py', functionName: 'get_llm()',
    nodeId: 'llm-router', badge: 'LLM Router', highlightLine: 1, status: 'pending', code, lineOutputs: outputs,
  };
}

function chainStep(id: number, name: string, desc: string, fn: string, code: string, outputs: Record<number, string>): ExecutionStep {
  return {
    id, name, description: desc,
    file: 'app/services/ai_service.py', functionName: fn,
    nodeId: 'chain', badge: 'LangChain', highlightLine: 1, status: 'pending', code, lineOutputs: outputs,
  };
}

function toolStep(id: number, toolName: string, desc: string, code: string, outputs: Record<number, string>): ExecutionStep {
  return {
    id, name: `Tool: ${toolName}`, description: desc,
    file: 'app/tools/tool_1.py', functionName: toolName,
    nodeId: 'tool', badge: 'LangChain Tool', highlightLine: 1, status: 'pending', code, lineOutputs: outputs,
  };
}

function ragStep(id: number, desc: string, code: string, outputs: Record<number, string>): ExecutionStep {
  return {
    id, name: 'RAG Retrieval', description: desc,
    file: 'app/rag/retrieve.py', functionName: 'retrieve_context()',
    nodeId: 'rag', badge: 'FAISS', highlightLine: 1, status: 'pending', code, lineOutputs: outputs,
  };
}

function memoryStep(id: number, op: string, desc: string, code: string, outputs: Record<number, string>): ExecutionStep {
  return {
    id, name: `Memory: ${op}`, description: desc,
    file: 'app/memory/memory.py', functionName: op,
    nodeId: 'memory', badge: 'ChatMemory', highlightLine: 1, status: 'pending', code, lineOutputs: outputs,
  };
}

function responseStep(id: number, model: string, desc: string, fields: string, code?: string): ExecutionStep {
  const body = code ?? `class ${model}(BaseModel):
${fields}

# In the route handler:
return ${model}(...)`;
  return {
    id, name: 'Response Serialised', description: desc,
    file: 'app/models/response_model.py', functionName: model,
    nodeId: 'response', badge: 'Pydantic', highlightLine: 1, status: 'pending',
    code: body,
    lineOutputs: {
      1: `class ${model}(BaseModel) — Pydantic schema`,
      2: 'Fields serialised — JSON response built',
      5: 'return model instance → FastAPI serialises to JSON',
    },
  };
}

// ── LLM Router shared code ───────────────────────────────────────────────────

const LLM_ROUTER_CODE = `_CHARS_PER_TOKEN = 4

def estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN)

def get_llm(text: str = "") -> ChatOpenAI:
    token_count = estimate_tokens(text)
    if token_count >= settings.llm_token_threshold:
        # Long input → DeepSeek (handles large context)
        return ChatOpenAI(
            model=settings.deepseek_model,
            openai_api_key=settings.deepseek_api_key,
            openai_api_base=settings.deepseek_base_url,
            temperature=settings.temperature,
        )
    else:
        # Short input → OpenAI (fast, cost-effective)
        return ChatOpenAI(
            model=settings.model_name,
            openai_api_key=settings.openai_api_key,
            temperature=settings.temperature,
        )`;

const LLM_ROUTER_OUTPUTS: Record<number, string> = {
  1: '_CHARS_PER_TOKEN = 4 — rough tokeniser',
  3: 'estimate_tokens(text) → token_count',
  7: 'token_count evaluated vs threshold (50)',
  8: 'token_count < 50 → routing to OpenAI',
  17: 'ChatOpenAI(model="gpt-3.5-turbo") — selected',
};

// ── HEALTH endpoint ──────────────────────────────────────────────────────────

function buildHealthSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User opens the app or health dashboard — GET /api/v1/health is called to confirm the AI service is up and running.',
      `// Angular service checks backend health
fetch('http://localhost:8000/api/v1/health')
  .then(r => r.json())
  .then(data => {
    console.log('status:', data.status);   // "ok"
    console.log('model:', data.model);     // "gpt-3.5-turbo"
  });`,
      { 1: 'Health check initiated', 2: 'GET /api/v1/health → FastAPI', 5: 'status: "ok"', 6: 'model: "gpt-3.5-turbo"' }),

    routeStep(1, 'GET', '/api/v1/health', 'health()',
      'FastAPI health route returns service status and active model name — no LLM or DB call needed.',
      `@router.get("/health", summary="Health check")
def health():
    """Returns service status and model in use."""
    return {"status": "ok", "model": settings.model_name}`,
      { 1: 'GET /health mounted on APIRouter', 2: '▶ health() invoked', 4: 'return {status: "ok", model: "gpt-3.5-turbo"}' }),

    llmRouterStep(2, 'Health check does not call the LLM — the router is bypassed. The model name is read from config only.',
      `# Health endpoint reads config — no LLM call
def get_config_model() -> str:
    # No token estimation needed for health check
    return settings.model_name   # "gpt-3.5-turbo"

# LLM Router is bypassed — this is a static config read
# get_llm() is NOT called for health checks`,
      { 1: '# Health does not call LLM', 3: '# No token estimation', 4: 'settings.model_name = "gpt-3.5-turbo"', 6: '# get_llm() bypassed' }),

    chainStep(3, 'Config Read', 'Settings object reads MODEL_NAME from environment variables. No chain execution for health check.', 'settings.model_name',
      `# app/core/config.py
class Settings(BaseSettings):
    model_name: str = "gpt-3.5-turbo"
    temperature: float = 0.7
    openai_api_key: str = ""
    deepseek_api_key: str = ""
    llm_token_threshold: int = 50

settings = Settings()
# Loaded once at startup — no per-request cost`,
      { 1: '# Settings loaded from .env at startup', 2: 'class Settings(BaseSettings)', 3: 'model_name = "gpt-3.5-turbo"', 8: 'settings singleton created' }),

    memoryStep(4, 'status check', 'Memory is not read or written for health checks — it remains untouched.',
      `# Memory is untouched for health checks
class ConversationMemory:
    def __init__(self):
        self._messages: list = []

    def get(self) -> list:
        return self._messages   # health check never calls this

    def add(self, human: str, ai: str): ...
    def clear(self): ...

memory = ConversationMemory()
# Memory state preserved — health is read-only`,
      { 1: '# Memory not involved in health check', 11: 'memory singleton — unchanged', 12: 'Memory state preserved' }),

    responseStep(5, 'HealthResponse',
      'Simple JSON dict returned directly — no Pydantic model needed. FastAPI auto-serialises.',
      `    status: str    # "ok"
    model: str     # "gpt-3.5-turbo"`,
      `# Health response — plain dict (no Pydantic needed)
return {"status": "ok", "model": settings.model_name}

# FastAPI serialises automatically:
# {"status": "ok", "model": "gpt-3.5-turbo"}`),
  ];
}

// ── CHAT endpoint ────────────────────────────────────────────────────────────

function buildChatSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User types a question and submits the chat form. Angular POSTs the question, prompt_version, and use_rag flag to /api/v1/chat.',
      `interface ChatRequest {
  question: string;
  prompt_version: string;   // "v1" | "v2"
  use_rag: boolean;
}

// User submits the form
const payload: ChatRequest = {
  question: "What is compound interest?",
  prompt_version: "v1",
  use_rag: false,
};
fetch('/api/v1/chat', { method: 'POST', body: JSON.stringify(payload) });`,
      { 1: 'ChatRequest interface — question + options', 8: 'question = "What is compound interest?"', 9: 'prompt_version = "v1"', 10: 'use_rag = false', 12: 'POST /api/v1/chat dispatched' }),

    routeStep(1, 'POST', '/api/v1/chat', 'chat()',
      'FastAPI receives the chat request, validates with Pydantic, and delegates to run_ai_service().',
      `@router.post("/chat", response_model=AIResponse)
def chat(request: ChatRequest):
    logger.info(f"POST /chat | question={request.question!r}")
    try:
        return run_ai_service(
            question=request.question,
            prompt_version=request.prompt_version,
            use_rag=request.use_rag,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))`,
      { 1: 'POST /chat mounted with AIResponse model', 2: '▶ chat(request) — Pydantic-validated', 4: 'run_ai_service() called with validated inputs', 5: 'question, prompt_version, use_rag forwarded' }),

    llmRouterStep(2, 'get_llm() called with the user question. Token count estimated: short question → OpenAI, long question → DeepSeek.',
      LLM_ROUTER_CODE, LLM_ROUTER_OUTPUTS),

    chainStep(3, 'Agent + Chain Execution', 'AgentExecutor runs with calculator and datetime tools. If agent fails, fallback reasoning chain is used.',
      'run_ai_service()',
      `def run_ai_service(question, prompt_version="v1", use_rag=False):
    steps = []
    # Step 1: RAG (optional)
    if use_rag:
        context_docs, sources = retrieve_context(question)
        context_text = "\\n\\n".join(context_docs)
    # Step 2: Agent with tools
    executor = get_agent_executor(question=question)
    result = executor.invoke({
        "input": question,
        "chat_history": memory.get(),
    })
    answer = result.get("output", "")
    for step in result.get("intermediate_steps", []):
        action, observation = step
        steps.append(f"{action.tool}({action.tool_input}) → {observation}")
    memory.add(question, answer)
    return AIResponse(answer=answer, sources=sources, steps=steps)`,
      { 1: '▶ run_ai_service() — main orchestrator', 3: 'use_rag = false → RAG skipped', 6: 'get_agent_executor(question) — LLM router selects model', 7: 'executor.invoke() — agent reasoning starts', 9: 'answer = result["output"]', 14: 'memory.add(question, answer) — saved to history' }),

    toolStep(4, 'calculator / get_current_datetime',
      'Agent autonomously decides to use the calculator or datetime tool based on question type. Tool outputs are injected back into the reasoning loop.',
      `from langchain.tools import tool

@tool
def calculator(expression: str) -> str:
    """Evaluate a mathematical expression."""
    result = eval(expression, {"__builtins__": {}})
    return str(result)

@tool
def get_current_datetime(format: str = "%Y-%m-%d %H:%M:%S") -> str:
    """Get the current date and time."""
    from datetime import datetime
    return datetime.now().strftime(format)

tools = [calculator, get_current_datetime]`,
      { 1: 'from langchain.tools import tool', 3: '@tool decorator — wraps function for agent', 4: '▶ calculator(expression) called by agent', 6: 'eval(expression) → numerical result', 9: 'get_current_datetime() — if date/time asked', 13: 'tools list registered with AgentExecutor' }),

    ragStep(5, 'RAG is skipped when use_rag=false. When enabled, FAISS similarity search retrieves top-k document chunks.',
      `def retrieve_context(question: str, k: int = 4):
    vectorstore_path = "data/vectorstore"
    if not Path(vectorstore_path).exists():
        return [], []
    embeddings = OpenAIEmbeddings(openai_api_key=settings.openai_api_key)
    vectorstore = FAISS.load_local(vectorstore_path, embeddings,
                                   allow_dangerous_deserialization=True)
    docs = vectorstore.similarity_search(question, k=k)
    sources = list({d.metadata.get("source", "unknown") for d in docs})
    context_texts = [d.page_content for d in docs]
    return context_texts, sources`,
      { 1: '▶ retrieve_context(question, k=4)', 3: 'vectorstore_path checked — exists?', 5: 'OpenAIEmbeddings — query embedded', 6: 'FAISS.load_local() — vector store loaded', 8: 'similarity_search(question, k=4) → top 4 chunks', 10: 'context_texts extracted from documents' }),

    memoryStep(6, 'memory.get() + memory.add()',
      'Conversation history is loaded before agent call and saved after. ChatMemory stores human/AI message pairs.',
      `class ConversationMemory:
    def __init__(self):
        self._messages: list = []

    def get(self) -> list:
        return self._messages   # injected as chat_history

    def add(self, human: str, ai: str):
        self._messages.append(HumanMessage(content=human))
        self._messages.append(AIMessage(content=ai))

    def clear(self):
        self._messages.clear()

memory = ConversationMemory()
# memory.get() called before agent → injects context
# memory.add(q, a) called after → saves exchange`,
      { 1: 'class ConversationMemory — in-memory store', 5: '▶ memory.get() → injects chat_history', 8: 'memory.add(question, answer) — saves exchange', 9: 'HumanMessage appended', 10: 'AIMessage appended', 15: 'memory.get() injected as chat_history to agent' }),

    responseStep(7, 'AIResponse',
      'Final Pydantic model with answer, sources, and execution steps. Serialised to JSON by FastAPI.',
      `    answer: str                   # LLM-generated answer
    sources: list[str] = []       # RAG document sources
    steps: list[str] = []         # execution audit trail`),
  ];
}

// ── CHAT STREAM endpoint ─────────────────────────────────────────────────────

function buildChatStreamSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User requests streaming response — tokens arrive one by one. Ideal for long answers.',
      `// EventSource / fetch streaming
const res = await fetch('/api/v1/chat/stream', {
  method: 'POST',
  body: JSON.stringify({ question: "Explain compound interest", prompt_version: "v1" }),
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(decoder.decode(value));  // token by token
}`,
      { 1: 'Streaming fetch initiated', 2: 'POST /api/v1/chat/stream', 7: 'reader.read() — waits for next chunk', 10: 'token printed as it arrives from LLM' }),

    routeStep(1, 'POST', '/api/v1/chat/stream', 'chat_stream()',
      'FastAPI returns a StreamingResponse. A generator yields each token as it arrives from OpenAI.',
      `@router.post("/chat/stream")
def chat_stream(request: ChatRequest):
    def token_generator():
        llm = ChatOpenAI(
            model=settings.model_name,
            streaming=True,
        )
        system_prompt = load_prompt(request.prompt_version)
        messages = [
            SystemMessage(content=system_prompt),
            *memory.get(),
            HumanMessage(content=request.question),
        ]
        for chunk in llm.stream(messages):
            yield chunk.content   # ← each token streamed
    return StreamingResponse(token_generator(), media_type="text/plain")`,
      { 1: 'POST /chat/stream — streaming endpoint', 3: 'token_generator() — Python generator', 4: 'ChatOpenAI(streaming=True) — enables streaming', 8: 'load_prompt(version) — system prompt loaded', 13: '▶ llm.stream(messages) — token loop begins', 14: 'yield chunk.content — one token per iteration' }),

    llmRouterStep(2, 'Streaming uses ChatOpenAI directly with streaming=True. LLM router logic still applies — short questions use OpenAI.',
      `# Streaming bypasses get_llm() — uses ChatOpenAI directly
# But same routing logic applies implicitly:
def chat_stream(request: ChatRequest):
    llm = ChatOpenAI(
        model=settings.model_name,  # always OpenAI for streaming
        openai_api_key=settings.openai_api_key,
        temperature=settings.temperature,
        streaming=True,   # ← key flag
    )
    # DeepSeek streaming not configured — OpenAI only
    # For long prompts, OpenAI handles streaming natively`,
      { 1: '# Streaming uses ChatOpenAI directly', 4: 'ChatOpenAI(model="gpt-3.5-turbo")', 8: 'streaming=True — enables token-by-token output', 9: '# DeepSeek not used for stream endpoint' }),

    chainStep(3, 'Streaming Chain', 'No AgentExecutor — direct LLM stream with system prompt + memory history.',
      'token_generator()',
      `def token_generator():
    system_prompt = load_prompt(request.prompt_version)
    messages = [
        SystemMessage(content=system_prompt),
        *memory.get(),               # inject history
        HumanMessage(content=request.question),
    ]
    for chunk in llm.stream(messages):
        yield chunk.content   # token arrives → yielded immediately`,
      { 1: '▶ token_generator() — Python generator fn', 2: 'load_prompt("v1") — system prompt loaded', 4: 'SystemMessage injected at top', 5: '*memory.get() — history injected', 6: 'HumanMessage with user question appended', 8: 'llm.stream() — LLM token loop starts', 9: 'yield chunk.content → sent to client immediately' }),

    toolStep(4, 'No tools in stream', 'Streaming endpoint does not use tools or AgentExecutor — tools are only available in /chat and /agent.',
      `# Streaming is a direct LLM call — no tool use
# Tools require AgentExecutor with return_intermediate_steps
# Streaming + tools would require LangGraph / LangChain streaming agents

# Use POST /chat for tool-enabled responses
# Use POST /chat/stream for token-by-token streaming (no tools)

# This is a known trade-off in LangChain:
# Streaming works best with pure LLM chains`,
      { 1: '# No tool use in streaming', 3: '# AgentExecutor needed for tools', 7: '# Use /chat for tools, /chat/stream for tokens' }),

    ragStep(5, 'RAG not used in streaming endpoint — only prompt + memory history is injected into the stream.',
      `# RAG not implemented in /chat/stream
# To add RAG to streaming:
# 1. retrieve_context(question) before generator
# 2. Inject context_text into system_prompt
# 3. Pass enriched prompt to llm.stream()

# Current implementation: prompt + memory only
# RAG available in POST /chat (non-streaming)`,
      { 1: '# RAG not in streaming endpoint', 6: '# RAG available in POST /chat', 7: '# Current: prompt + memory only' }),

    memoryStep(6, 'memory.get()',
      'Conversation history is injected into the message list before streaming. memory.add() is NOT called (stream response not captured).',
      `# Memory injected but not saved in stream endpoint
messages = [
    SystemMessage(content=system_prompt),
    *memory.get(),   # ← history injected into context
    HumanMessage(content=request.question),
]
# Note: memory.add() is NOT called after streaming
# Stream response is not captured for storage
# Consider using /chat for memory-persistent conversations`,
      { 1: '# Memory inject-only in streaming', 4: '*memory.get() → injects history into messages', 7: '# memory.add() not called — stream not captured', 9: '# Use /chat for full memory persistence' }),

    responseStep(7, 'StreamingResponse',
      'FastAPI StreamingResponse with text/plain media type. Each token arrives as a chunk in the HTTP body.',
      `    media_type: str = "text/plain"
    generator: Iterator[str]   # token generator`,
      `return StreamingResponse(token_generator(), media_type="text/plain")
# Each chunk.content is one or more tokens
# Client reads via response.body.getReader()`),
  ];
}

// ── AGENT endpoint ───────────────────────────────────────────────────────────

function buildAgentSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User invokes the agent directly — best for tool-heavy questions like math calculations or current time.',
      `interface AgentRequest {
  question: string;
}

const payload = { question: "What is 15% of 847 + today's date?" };
fetch('/api/v1/agent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});`,
      { 1: 'AgentRequest — just a question', 4: 'question requires both calculator and datetime tools', 5: 'POST /api/v1/agent dispatched' }),

    routeStep(1, 'POST', '/api/v1/agent', 'run_agent()',
      'FastAPI agent route builds AgentExecutor and runs it. Returns answer, tools_used list, and full step trace.',
      `@router.post("/agent", response_model=AgentResponse)
def run_agent(request: AgentRequest):
    executor = get_agent_executor()
    result = executor.invoke({
        "input": request.question,
        "chat_history": memory.get(),
    })
    answer = result.get("output", "")
    tools_used, steps = [], []
    for step in result.get("intermediate_steps", []):
        action, observation = step
        tools_used.append(action.tool)
        steps.append(f"{action.tool}({action.tool_input}) → {observation}")
    memory.add(request.question, answer)
    return AgentResponse(answer=answer, tools_used=tools_used, steps=steps)`,
      { 1: 'POST /agent — direct agent invocation', 3: '▶ get_agent_executor() — LLM router selects model', 4: 'executor.invoke() — agent starts reasoning', 9: 'intermediate_steps loop — tool trace collected', 11: 'tools_used: ["calculator", "get_current_datetime"]', 14: 'memory.add() — saves exchange' }),

    llmRouterStep(2, 'get_agent_executor() calls get_llm(question) internally. Question token count determines OpenAI vs DeepSeek.',
      `def get_agent_executor(question: str = "") -> AgentExecutor:
    llm = get_llm(question)   # ← LLM Router called here
    agent = create_tool_calling_agent(llm, tools, _prompt)
    return AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        return_intermediate_steps=True,
        handle_parsing_errors=True,
    )

# get_llm("What is 15% of 847 + today's date?")
# token_count = len(question) // 4 = 10 → OpenAI selected`,
      { 1: '▶ get_agent_executor(question)', 2: 'get_llm(question) → LLM Router called', 3: 'create_tool_calling_agent(llm, tools, prompt)', 4: 'AgentExecutor assembled', 11: 'token_count = 10 → OpenAI selected' }),

    chainStep(3, 'AgentExecutor Run', 'create_tool_calling_agent builds a ReAct-style agent. AgentExecutor manages the tool call loop until a final answer is produced.',
      'executor.invoke()',
      `_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful AI assistant. Use tools when needed."),
    ("placeholder", "{chat_history}"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, tools, _prompt)
executor = AgentExecutor(agent=agent, tools=tools,
                         return_intermediate_steps=True)

result = executor.invoke({
    "input": "What is 15% of 847 + today's date?",
    "chat_history": memory.get(),
})`,
      { 1: '_prompt — ChatPromptTemplate with placeholders', 7: 'agent_scratchpad — tool call scratch space', 8: 'create_tool_calling_agent — wires LLM + tools', 9: 'AgentExecutor — manages reasoning loop', 12: '▶ executor.invoke() — agent starts', 13: 'question injected', 14: 'chat_history from memory injected' }),

    toolStep(4, 'calculator + get_current_datetime',
      'Agent identifies it needs two tools. Calls calculator first, then datetime. Both results injected back into reasoning.',
      `@tool
def calculator(expression: str) -> str:
    """Evaluate a mathematical expression."""
    result = eval(expression, {"__builtins__": {}})
    return str(result)

@tool
def get_current_datetime(format: str = "%Y-%m-%d %H:%M:%S") -> str:
    """Get the current date and time."""
    from datetime import datetime
    return datetime.now().strftime(format)

# Agent calls:
# 1. calculator("0.15 * 847") → "127.05"
# 2. get_current_datetime() → "2024-01-15 14:30:22"
# Final answer synthesised from both results`,
      { 1: '@tool — LangChain tool decorator', 2: '▶ calculator("0.15 * 847") called by agent', 4: 'eval(expression) → 127.05', 7: '▶ get_current_datetime() called by agent', 10: 'datetime.now().strftime() → "2024-01-15 14:30:22"', 13: 'Tool results injected into agent_scratchpad', 14: 'Agent synthesises final answer' }),

    ragStep(5, 'RAG not used in /agent endpoint. Agent uses tools only — document retrieval requires /chat with use_rag=true.',
      `# RAG not used in /agent endpoint
# Agent has access to: calculator, get_current_datetime
# For document-based RAG: use POST /chat with use_rag=true

# To add RAG tool to agent:
# 1. Create a @tool that calls retrieve_context()
# 2. Add to tools list in agent.py
# This is a planned enhancement`,
      { 1: '# RAG not in agent endpoint', 3: '# Use /chat with use_rag=true for RAG', 5: '# RAG-as-tool is a planned enhancement' }),

    memoryStep(6, 'memory.get() + memory.add()',
      'History injected before agent run. Exchange saved after — enables multi-turn tool conversations.',
      `# Before: history injected as chat_history
result = executor.invoke({
    "input": request.question,
    "chat_history": memory.get(),   # ← prior turns injected
})

# After: exchange saved
memory.add(request.question, answer)
# HumanMessage + AIMessage appended to _messages list`,
      { 1: '# chat_history injected before invoke', 4: 'memory.get() → prior conversation turns', 7: '▶ memory.add(question, answer) — saves exchange', 8: 'HumanMessage + AIMessage stored' }),

    responseStep(7, 'AgentResponse',
      'Agent response includes answer, list of tools used, and full input→output step trace.',
      `    answer: str                   # final synthesised answer
    tools_used: list[str] = []    # ["calculator", "get_current_datetime"]
    steps: list[str] = []         # ["calculator(0.15*847) → 127.05", ...]`),
  ];
}

// ── INGEST endpoint ──────────────────────────────────────────────────────────

function buildIngestSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User uploads a .txt or .pdf document via file input. Angular POSTs as multipart/form-data to /api/v1/ingest.',
      `// File upload via Angular
const formData = new FormData();
formData.append('file', selectedFile);   // .txt or .pdf

fetch('/api/v1/ingest', {
  method: 'POST',
  body: formData,   // multipart/form-data
})
.then(r => r.json())
.then(data => {
  console.log(data.message);         // "Document ingested"
  console.log(data.chunks_created);  // 42
});`,
      { 1: 'File upload initiated', 2: 'FormData with file attachment', 4: 'POST /api/v1/ingest — multipart', 10: 'chunks_created: 42 — FAISS indexed' }),

    routeStep(1, 'POST', '/api/v1/ingest', 'ingest()',
      'FastAPI saves file to disk, calls ingest_documents(), and returns chunk count.',
      `@router.post("/ingest", response_model=IngestResponse)
def ingest(file: UploadFile = File(...)):
    if not (file.filename.endswith(".txt") or
            file.filename.endswith(".pdf")):
        raise HTTPException(400, "Only .txt and .pdf supported")
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    save_path = DOCS_DIR / file.filename
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    vectorstore = ingest_documents(str(save_path))
    chunk_count = vectorstore.index.ntotal
    return IngestResponse(message="Document ingested.", filename=file.filename, chunks_created=chunk_count)`,
      { 1: 'POST /ingest — multipart file upload', 2: '▶ ingest() — UploadFile received', 3: 'file.filename extension validated', 6: 'DOCS_DIR created if not exists', 8: 'File saved to disk', 10: '▶ ingest_documents() — chunking + embedding', 11: 'vectorstore.index.ntotal → chunk count' }),

    llmRouterStep(2, 'Ingest uses OpenAI Embeddings — not the LLM router. Embeddings are always OpenAI regardless of token count.',
      `# Ingest uses OpenAIEmbeddings — not ChatOpenAI
# LLM Router is NOT involved in document ingestion

from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(
    openai_api_key=settings.openai_api_key,
    model="text-embedding-3-small",
)
# Each text chunk is embedded via OpenAI's embedding API
# No token threshold routing — embeddings always use OpenAI`,
      { 1: '# LLM Router not involved in ingest', 5: 'OpenAIEmbeddings — always OpenAI', 7: 'model="text-embedding-3-small"', 9: '# Each chunk embedded separately' }),

    chainStep(3, 'Document Ingestion Chain', 'Documents are loaded, split into chunks, embedded, and stored in FAISS. This builds the RAG knowledge base.',
      'ingest_documents()',
      `def ingest_documents(file_path: str) -> FAISS:
    # Load document (txt or pdf)
    if file_path.endswith(".pdf"):
        loader = PyPDFLoader(file_path)
    else:
        loader = TextLoader(file_path)
    documents = loader.load()
    # Split into chunks
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000, chunk_overlap=200
    )
    chunks = splitter.split_documents(documents)
    # Embed and store in FAISS
    embeddings = OpenAIEmbeddings(openai_api_key=settings.openai_api_key)
    vectorstore = FAISS.from_documents(chunks, embeddings)
    vectorstore.save_local("data/vectorstore")
    return vectorstore`,
      { 1: '▶ ingest_documents(file_path)', 4: 'PyPDFLoader or TextLoader selected', 6: 'documents = loader.load()', 8: 'RecursiveCharacterTextSplitter(chunk_size=1000)', 10: 'chunks = splitter.split_documents(documents)', 12: 'OpenAIEmbeddings — embed each chunk', 13: 'FAISS.from_documents() — vector index built', 14: 'vectorstore.save_local() — persisted to disk' }),

    toolStep(4, 'FAISS indexing', 'FAISS (Facebook AI Similarity Search) creates a vector index from embedded chunks. Enables fast cosine similarity search.',
      `# FAISS vector store creation
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(openai_api_key=settings.openai_api_key)
vectorstore = FAISS.from_documents(chunks, embeddings)
# ↑ Each chunk → embedded → added to FAISS index

# Save to disk for persistence
vectorstore.save_local("data/vectorstore")
# allows_dangerous_deserialization=True needed to reload

# Later — similarity search:
# vectorstore.similarity_search(query, k=4)`,
      { 1: '# FAISS vector index creation', 5: 'OpenAIEmbeddings — chunk embedding', 6: '▶ FAISS.from_documents(chunks, embeddings)', 9: 'vectorstore.save_local() — persisted', 12: 'similarity_search available after ingest' }),

    ragStep(5, 'This endpoint IS the RAG ingest step — documents are chunked, embedded, and stored in FAISS for later retrieval.',
      `# This IS the RAG pipeline — ingest phase
# ─── Ingest phase (this endpoint) ───────────────
# 1. Load document (PDF / TXT)
# 2. Split into chunks (1000 chars, 200 overlap)
# 3. Embed each chunk with OpenAIEmbeddings
# 4. Store in FAISS vector store

# ─── Retrieve phase (POST /chat with use_rag=true) ───
# 1. Embed user question
# 2. similarity_search(question, k=4)
# 3. Top-k chunks injected into system prompt`,
      { 1: '# This IS the RAG ingest phase', 3: '# Step 1: Load document', 4: '# Step 2: Split into chunks', 5: '# Step 3: Embed chunks', 6: '# Step 4: Store in FAISS', 8: '# Retrieve phase runs in /chat' }),

    memoryStep(6, 'no op', 'Memory is not involved in document ingestion — only the vector store is updated.',
      `# Memory is not used in /ingest
# Ingestion builds the vector store, not conversation history

# Memory (ConversationMemory) stores human/AI exchanges
# Vector store (FAISS) stores document embeddings
# These are two separate persistence systems:

memory = ConversationMemory()   # ← conversation turns
vectorstore = FAISS(...)        # ← document chunks`,
      { 1: '# Memory not used in /ingest', 5: '# Two separate persistence systems', 7: 'memory — conversation turns', 8: 'vectorstore — document embeddings' }),

    responseStep(7, 'IngestResponse',
      'Returns confirmation with filename and number of vector chunks created.',
      `    message: str          # "Document ingested successfully."
    filename: str         # "report.pdf"
    chunks_created: int   # 42`),
  ];
}

// ── PROMPTS endpoint ─────────────────────────────────────────────────────────

function buildPromptsSteps(): ExecutionStep[] {
  return [
    userStep(0, 'UI requests the list of available prompt versions to populate a selector dropdown.',
      `// Fetch available prompt versions
fetch('/api/v1/prompts')
  .then(r => r.json())
  .then(data => {
    data.prompts.forEach(p => {
      console.log(p.version, p.content.substring(0, 50));
      // "v1" "You are a helpful AI assistant..."
      // "v2" "You are an expert AI system..."
    });
  });`,
      { 1: '# Prompts list requested', 2: 'GET /api/v1/prompts', 5: 'p.version: "v1", "v2"', 6: 'p.content: system prompt text' }),

    routeStep(1, 'GET', '/api/v1/prompts', 'list_prompts()',
      'Scans the prompts directory for .txt files and returns each as a PromptInfo object.',
      `@router.get("/prompts", response_model=PromptsResponse)
def list_prompts():
    PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
    prompts = []
    for txt_file in sorted(PROMPTS_DIR.glob("*.txt")):
        prompts.append(PromptInfo(
            version=txt_file.stem,       # "v1", "v2"
            content=txt_file.read_text().strip(),
        ))
    return PromptsResponse(prompts=prompts)`,
      { 1: 'GET /prompts mounted', 2: '▶ list_prompts() invoked', 3: 'PROMPTS_DIR resolved', 5: 'glob("*.txt") — all prompt files found', 6: 'PromptInfo built per file', 7: 'version = file stem ("v1")' }),

    llmRouterStep(2, 'No LLM call for /prompts — this is a file system read. LLM Router is bypassed entirely.',
      `# No LLM call for /prompts endpoint
# This is a pure file system operation

# Prompt versions are stored as .txt files:
# app/prompts/v1.txt → "You are a helpful AI assistant..."
# app/prompts/v2.txt → "You are an expert AI system..."

# The LLM uses these prompts when /chat is called:
# load_prompt(version) → reads the .txt file
# SystemMessage(content=system_prompt) → injected`,
      { 1: '# No LLM call', 3: '# Pure file system read', 5: 'v1.txt → default assistant prompt', 6: 'v2.txt → expert system prompt' }),

    chainStep(3, 'File Read', 'No chain — prompts are read directly from disk using Python pathlib.',
      'list_prompts()',
      `# Prompts loaded via pathlib — no LangChain chain
PROMPTS_DIR = Path("app/prompts")

# Each prompt file:
# v1.txt:
# "You are a helpful AI assistant.
#  Answer clearly and concisely.
#  Use tools when appropriate."

# v2.txt:
# "You are an expert AI system with deep knowledge.
#  Provide detailed, technical responses.
#  Always cite your reasoning step by step."

for txt_file in sorted(PROMPTS_DIR.glob("*.txt")):
    version = txt_file.stem
    content = txt_file.read_text().strip()`,
      { 1: '# Pathlib — no LangChain chain', 5: 'v1.txt — default system prompt', 10: 'v2.txt — expert system prompt', 14: 'glob("*.txt") iterates prompt files', 15: 'version = stem, content = text' }),

    toolStep(4, 'load_prompt(version)', 'load_prompt() reads the versioned prompt file — used by /chat to inject the system prompt.',
      `def load_prompt(version: str) -> str:
    prompt_file = PROMPTS_DIR / f"{version}.txt"
    if not prompt_file.exists():
        logger.warning(f"Prompt '{version}' not found, fallback to v1")
        prompt_file = PROMPTS_DIR / "v1.txt"
    return prompt_file.read_text().strip()

# Called in /chat:
# system_prompt = load_prompt(request.prompt_version)
# messages = [SystemMessage(content=system_prompt), ...]`,
      { 1: '▶ load_prompt(version)', 2: 'prompt_file path constructed', 3: 'file.exists() check', 4: 'fallback to v1 if not found', 6: 'read_text().strip() — content returned', 9: 'Used as SystemMessage in /chat' }),

    ragStep(5, 'RAG not used in /prompts — this is a config endpoint, not a retrieval endpoint.',
      `# RAG not used in /prompts endpoint
# /prompts reads system prompt templates from disk
# RAG retrieves user document chunks from FAISS

# These are separate concerns:
# System prompts → app/prompts/*.txt (versioned templates)
# RAG documents → data/vectorstore/ (user-uploaded content)

# Prompts instruct the LLM HOW to behave
# RAG provides the LLM WHAT to know`,
      { 1: '# RAG not used', 4: '# Two separate systems', 6: 'System prompts → app/prompts/*.txt', 7: 'RAG documents → data/vectorstore/' }),

    memoryStep(6, 'no op', 'Memory not involved in /prompts — this is a static config read.',
      `# Memory not involved in /prompts
# Prompts are static configuration files
# Memory stores dynamic conversation history

# /prompts → read-only, no memory interaction
# /chat → reads memory for context, writes after response`,
      { 1: '# Memory not used in /prompts', 2: 'Prompts are static config', 4: '# /chat reads + writes memory' }),

    responseStep(7, 'PromptsResponse',
      'Returns list of all prompt versions with their full content.',
      `    prompts: list[PromptInfo]

class PromptInfo(BaseModel):
    version: str    # "v1" | "v2"
    content: str    # full system prompt text`),
  ];
}

// ── MEMORY GET endpoint ──────────────────────────────────────────────────────

function buildMemoryGetSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User views conversation history — GET /api/v1/memory returns all stored message pairs.',
      `// Fetch conversation history
fetch('/api/v1/memory')
  .then(r => r.json())
  .then(data => {
    console.log('total messages:', data.total);
    data.messages.forEach(m => {
      console.log(m.role, m.content.substring(0, 50));
    });
  });`,
      { 1: '# Fetch conversation history', 2: 'GET /api/v1/memory', 5: 'total: number of messages', 6: 'each message: {role, content}' }),

    routeStep(1, 'GET', '/api/v1/memory', 'get_memory()',
      'Returns all stored messages with role (human/ai) and content. Enables conversation history inspection.',
      `@router.get("/memory", response_model=MemoryResponse)
def get_memory():
    messages = []
    for msg in memory.get():
        role = "human" if isinstance(msg, HumanMessage) else "ai"
        messages.append(MemoryMessage(role=role, content=msg.content))
    return MemoryResponse(messages=messages, total=len(messages))`,
      { 1: 'GET /memory mounted', 2: '▶ get_memory() invoked', 4: 'memory.get() — retrieve all messages', 5: 'isinstance check: HumanMessage or AIMessage', 6: 'MemoryMessage(role, content) constructed', 7: 'MemoryResponse with full list returned' }),

    llmRouterStep(2, 'No LLM call for /memory — this is a pure memory read operation.',
      `# No LLM call for GET /memory
# Memory read is a pure in-process operation

# ConversationMemory stores messages as:
# [HumanMessage("question 1"), AIMessage("answer 1"),
#  HumanMessage("question 2"), AIMessage("answer 2"), ...]

# No token counting or LLM routing needed
# LLM Router is bypassed for memory inspection`,
      { 1: '# No LLM call for /memory', 4: 'Messages stored as LangChain message objects', 8: 'LLM Router bypassed' }),

    chainStep(3, 'Memory Read', 'Pure Python — no LangChain chain. memory.get() returns the in-memory message list.',
      'memory.get()',
      `class ConversationMemory:
    def __init__(self):
        self._messages: list = []   # in-process storage

    def get(self) -> list:
        return self._messages   # returns all messages

    def add(self, human: str, ai: str):
        self._messages.append(HumanMessage(content=human))
        self._messages.append(AIMessage(content=ai))

    def clear(self):
        self._messages.clear()

memory = ConversationMemory()   # singleton`,
      { 1: 'class ConversationMemory', 2: '_messages: list — in-process store', 5: '▶ memory.get() → all messages returned', 8: 'memory.add() — how messages are stored', 12: 'memory.clear() — clears all', 13: 'memory — module-level singleton' }),

    toolStep(4, 'no tools', 'No tools used in memory read — pure data retrieval.',
      `# No tools used in /memory GET
# Memory is a simple in-process Python list

# Each exchange stored as 2 messages:
# HumanMessage(content="What is 2+2?")
# AIMessage(content="2+2 = 4")

# memory._messages = [
#   HumanMessage("What is 2+2?"),
#   AIMessage("2+2 = 4"),
#   HumanMessage("What about 3+3?"),
#   AIMessage("3+3 = 6"),
# ]`,
      { 1: '# No tools for memory read', 3: '# Two messages per exchange', 8: 'Example memory contents' }),

    ragStep(5, 'RAG not used for memory inspection.',
      `# RAG not used in GET /memory
# This endpoint reads conversation history only

# Memory (ConversationMemory) ≠ RAG (FAISS)
# Memory: human/AI message pairs per session
# RAG: document embeddings for similarity search

# To see RAG docs: check data/vectorstore/
# To see conversation: GET /memory`,
      { 1: '# RAG not used', 4: 'Memory ≠ RAG — separate systems', 5: 'Memory: conversation turns', 6: 'RAG: document embeddings' }),

    memoryStep(6, 'memory.get()',
      'This IS the memory read. ConversationMemory.get() returns all stored HumanMessage and AIMessage objects.',
      `# This endpoint IS the memory read operation
messages = memory.get()
# Returns: [HumanMessage("..."), AIMessage("..."), ...]

for msg in messages:
    role = "human" if isinstance(msg, HumanMessage) else "ai"
    # Serialise to {role, content} for JSON response

# Memory is in-process — resets on server restart
# For persistence: consider Redis or database backend`,
      { 1: '# This IS the memory read', 2: 'memory.get() → all messages', 5: 'isinstance check for role determination', 8: '# In-process — resets on restart', 9: '# Redis/DB for production persistence' }),

    responseStep(7, 'MemoryResponse',
      'Returns all conversation messages with roles and total count.',
      `    messages: list[MemoryMessage]  # all exchanges
    total: int                     # message count

class MemoryMessage(BaseModel):
    role: str       # "human" | "ai"
    content: str    # message text`),
  ];
}

// ── MEMORY DELETE endpoint ───────────────────────────────────────────────────

function buildMemoryDeleteSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User clicks "Clear History" — DELETE /api/v1/memory resets the conversation.',
      `// Clear conversation history
fetch('/api/v1/memory', { method: 'DELETE' })
  .then(r => r.json())
  .then(data => {
    console.log(data.message);   // "Conversation memory cleared"
    // UI resets conversation display
  });`,
      { 1: '# Clear history initiated', 2: 'DELETE /api/v1/memory', 5: 'message: "Conversation memory cleared"' }),

    routeStep(1, 'DELETE', '/api/v1/memory', 'clear_memory()',
      'Calls memory.clear() to reset the in-process message list. Returns confirmation.',
      `@router.delete("/memory")
def clear_memory():
    """Clears all conversation history from memory."""
    memory.clear()
    logger.info("Memory cleared")
    return {"message": "Conversation memory cleared"}`,
      { 1: 'DELETE /memory mounted', 2: '▶ clear_memory() invoked', 4: 'memory.clear() — list emptied', 5: 'logger.info — cleared logged', 6: 'confirmation dict returned' }),

    llmRouterStep(2, 'No LLM call for memory clear — purely in-process list reset.',
      `# No LLM call for DELETE /memory
# Memory clear is a pure Python list operation
# No token estimation or model routing needed

# memory._messages.clear()
# → O(1) operation — empties the list

# LLM Router is completely bypassed
# for all memory management endpoints`,
      { 1: '# No LLM call', 5: 'memory._messages.clear() — O(1)', 7: '# LLM Router bypassed' }),

    chainStep(3, 'Memory Clear', 'memory.clear() empties the _messages list. All conversation history lost (in-process storage).',
      'memory.clear()',
      `class ConversationMemory:
    def clear(self):
        self._messages.clear()   # empties the list

# Before clear:
# memory._messages = [HumanMsg, AIMsg, HumanMsg, AIMsg]
# memory.get() → 4 messages

# After clear:
# memory._messages = []
# memory.get() → []

memory = ConversationMemory()
memory.clear()   # ← this call`,
      { 1: 'class ConversationMemory', 2: '▶ clear() — empties _messages', 5: 'Before: 4 messages in memory', 9: 'After: list is empty', 12: 'memory.clear() called' }),

    toolStep(4, 'no tools', 'No tools involved in memory clear.',
      `# No tools for DELETE /memory
# Pure in-process state reset

# What gets cleared:
# - All HumanMessage objects
# - All AIMessage objects
# - Full conversation context

# What is NOT cleared:
# - FAISS vector store (RAG documents persist)
# - Prompt files (app/prompts/*.txt unchanged)
# - Server configuration`,
      { 1: '# No tools for memory clear', 4: '# What is cleared:', 5: 'HumanMessage objects removed', 6: 'AIMessage objects removed', 8: '# What persists:', 9: 'FAISS vector store unchanged', 10: 'Prompt files unchanged' }),

    ragStep(5, 'RAG vector store is NOT cleared by DELETE /memory — only conversation history is reset.',
      `# RAG vector store NOT cleared by DELETE /memory
# FAISS index persists at data/vectorstore/

# Memory clear only affects:
# ConversationMemory._messages = []

# To clear RAG:
# - Delete data/vectorstore/ directory manually
# - Re-ingest documents via POST /ingest

# Memory and RAG are independent systems`,
      { 1: '# FAISS not cleared by /memory DELETE', 3: '# Only conversation history cleared', 6: '# To clear RAG: delete vectorstore dir', 9: '# Memory and RAG are independent' }),

    memoryStep(6, 'memory.clear()',
      'This IS the memory operation. ConversationMemory._messages list is emptied.',
      `# This IS the memory clear operation
memory.clear()
# → self._messages.clear()
# → list is now []

# Session is fresh after this call
# Next /chat or /agent will start a new conversation

# Note: server restart also clears memory
# For persistent memory: Redis / PostgreSQL backend`,
      { 1: '# This IS the clear operation', 2: 'memory.clear() called', 3: '_messages.clear() — list emptied', 6: '# Fresh conversation starts', 8: '# In-process — also cleared on restart' }),

    responseStep(7, 'ClearResponse',
      'Simple confirmation dict — no Pydantic model needed.',
      `    message: str   # "Conversation memory cleared"`,
      `# Simple dict response
return {"message": "Conversation memory cleared"}
# FastAPI auto-serialises to JSON`),
  ];
}

// ── Endpoint configs ─────────────────────────────────────────────────────────

const CHAT_FIELDS: EndpointField[] = [
  { name: 'question',       label: 'Question',       type: 'text',     placeholder: 'Ask anything...', default: 'What is compound interest?' },
  { name: 'prompt_version', label: 'Prompt Version', type: 'select',   options: ['v1', 'v2'], default: 'v1' },
  { name: 'use_rag',        label: 'Use RAG',        type: 'toggle',   default: false },
];

const AGENT_FIELDS: EndpointField[] = [
  { name: 'question', label: 'Question', type: 'text', placeholder: 'e.g. What is 15% of 2500?', default: 'What is 15% of 2500 and what is today\'s date?' },
];

export const LANGCHAIN_ENDPOINT_CONFIGS: EndpointConfig[] = [
  {
    id: 'health',
    label: 'GET /health',
    method: 'GET',
    path: '/api/v1/health',
    emoji: '💚',
    tagline: 'Service status — no LLM call',
    color: '#22c55e',
    fields: [],
    buildSteps: buildHealthSteps,
    buildBody: () => null,
  },
  {
    id: 'chat',
    label: 'POST /chat',
    method: 'POST',
    path: '/api/v1/chat',
    emoji: '💬',
    tagline: 'Agent + optional RAG + versioned prompts',
    color: '#6366f1',
    fields: CHAT_FIELDS,
    buildSteps: buildChatSteps,
    buildBody: (form) => ({
      question: form['question'] || 'What is compound interest?',
      prompt_version: form['prompt_version'] || 'v1',
      use_rag: form['use_rag'] || false,
    }),
  },
  {
    id: 'chat-stream',
    label: 'POST /chat/stream',
    method: 'POST',
    path: '/api/v1/chat/stream',
    emoji: '⚡',
    tagline: 'Token-by-token streaming response',
    color: '#f59e0b',
    fields: CHAT_FIELDS,
    buildSteps: buildChatStreamSteps,
    buildBody: (form) => ({
      question: form['question'] || 'Explain compound interest in detail',
      prompt_version: form['prompt_version'] || 'v1',
      use_rag: false,
    }),
  },
  {
    id: 'agent',
    label: 'POST /agent',
    method: 'POST',
    path: '/api/v1/agent',
    emoji: '🤖',
    tagline: 'Direct agent — calculator & datetime tools',
    color: '#8b5cf6',
    fields: AGENT_FIELDS,
    buildSteps: buildAgentSteps,
    buildBody: (form) => ({ question: form['question'] || 'What is 15% of 2500?' }),
  },
  {
    id: 'ingest',
    label: 'POST /ingest',
    method: 'POST',
    path: '/api/v1/ingest',
    emoji: '📄',
    tagline: 'Upload doc → chunk → embed → FAISS',
    color: '#0ea5e9',
    fields: [{ name: 'document', label: 'Document File', type: 'file', placeholder: 'PDF, TXT, DOCX supported', accept: '.pdf,.txt,.docx' }],
    buildSteps: buildIngestSteps,
    buildBody: (form) => ({ filename: form['document']?.name ?? 'report.pdf' }),
  },
  {
    id: 'prompts',
    label: 'GET /prompts',
    method: 'GET',
    path: '/api/v1/prompts',
    emoji: '📝',
    tagline: 'List versioned system prompts',
    color: '#14b8a6',
    fields: [],
    buildSteps: buildPromptsSteps,
    buildBody: () => null,
  },
  {
    id: 'memory-get',
    label: 'GET /memory',
    method: 'GET',
    path: '/api/v1/memory',
    emoji: '🧠',
    tagline: 'View conversation history',
    color: '#30d158',
    fields: [],
    buildSteps: buildMemoryGetSteps,
    buildBody: () => null,
  },
  {
    id: 'memory-delete',
    label: 'DELETE /memory',
    method: 'DELETE',
    path: '/api/v1/memory',
    emoji: '🗑️',
    tagline: 'Clear conversation memory',
    color: '#ef4444',
    fields: [],
    buildSteps: buildMemoryDeleteSteps,
    buildBody: () => null,
  },
];
