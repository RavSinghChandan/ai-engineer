import { ExecutionStep, FlowNode } from '../models/execution-step.model';

export const FLOW_NODES: FlowNode[] = [
  { id: 'user',     label: 'User Input',   icon: 'U',  status: 'pending', color: '#6366f1' },
  { id: 'routes',   label: 'API Routes',   icon: 'R',  status: 'pending', color: '#8b5cf6' },
  { id: 'service',  label: 'AI Service',   icon: 'S',  status: 'pending', color: '#a855f7' },
  { id: 'rag',      label: 'RAG',          icon: 'D',  status: 'pending', color: '#ec4899' },
  { id: 'agent',    label: 'Agent',        icon: 'A',  status: 'pending', color: '#f59e0b' },
  { id: 'llmrouter',label: 'LLM Router',   icon: 'L',  status: 'pending', color: '#10b981' },
  { id: 'tool',     label: 'Tool',         icon: 'T',  status: 'pending', color: '#3b82f6' },
  { id: 'memory',   label: 'Memory',       icon: 'M',  status: 'pending', color: '#14b8a6' },
  { id: 'response', label: 'Response',     icon: '✓',  status: 'pending', color: '#22c55e' },
];

export const MOCK_STEPS: ExecutionStep[] = [
  {
    id: 1,
    name: 'HTTP Request Received',
    description: 'FastAPI receives POST /api/v1/chat. Request body validated with Pydantic.',
    file: 'app/api/routes.py',
    functionName: 'chat()',
    nodeId: 'routes',
    badge: 'FastAPI',
    highlightLine: 3,
    status: 'pending',
    code: `@router.post("/chat", response_model=AIResponse,
           summary="Chat with AI (agent + optional RAG)")
def chat(request: ChatRequest):
    logger.info(f"POST /chat | question={request.question!r}")
    try:
        return run_ai_service(
            question=request.question,
            prompt_version=request.prompt_version,
            use_rag=request.use_rag,
        )
    except Exception as e:
        logger.error(f"Unhandled error: {e}")
        raise HTTPException(status_code=500, detail=str(e))`,
  },
  {
    id: 2,
    name: 'Orchestrator Invoked',
    description: 'ai_service.py is the brain — decides RAG, Agent, or fallback Chain to run.',
    file: 'app/services/ai_service.py',
    functionName: 'run_ai_service()',
    nodeId: 'service',
    badge: 'Orchestrator',
    highlightLine: 2,
    status: 'pending',
    code: `def run_ai_service(
    question: str,
    prompt_version: str = "v1",
    use_rag: bool = False,
) -> AIResponse:
    logger.info(f"Processing | question={question!r}")
    steps: list = []
    sources: list = []
    context_text = ""

    if use_rag:
        steps.append("Step 1: Retrieving relevant context")
        context_docs, sources = retrieve_context(question)
    else:
        steps.append("Step 1: Skipping RAG (not requested)")`,
  },
  {
    id: 3,
    name: 'RAG Context Retrieved',
    description: 'FAISS vector store searched. Top-3 similar document chunks returned as context.',
    file: 'app/rag/retrieve.py',
    functionName: 'retrieve_context()',
    nodeId: 'rag',
    badge: 'FAISS',
    highlightLine: 4,
    status: 'pending',
    code: `def retrieve_context(question: str) -> Tuple[List[str], List[str]]:
    retriever = get_retriever()
    if retriever is None:
        return [], []
    docs = retriever.invoke(question)
    context = [doc.page_content for doc in docs]
    sources = list({
        doc.metadata.get("source", "unknown")
        for doc in docs
    })
    return context, sources`,
  },
  {
    id: 4,
    name: 'Agent Executor Built',
    description: 'AgentExecutor created with 2 tools: calculator + get_current_datetime.',
    file: 'app/agents/agent.py',
    functionName: 'get_agent_executor()',
    nodeId: 'agent',
    badge: 'LangChain Agent',
    highlightLine: 3,
    status: 'pending',
    code: `tools = [calculator, get_current_datetime]

def get_agent_executor(question: str = "") -> AgentExecutor:
    llm = get_llm(question)
    agent = create_tool_calling_agent(llm, tools, _prompt)
    return AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        return_intermediate_steps=True,
        handle_parsing_errors=True,
    )`,
  },
  {
    id: 5,
    name: 'LLM Routing Decision',
    description: 'Token count estimated. Short query → OpenAI GPT-3.5. Long query → DeepSeek.',
    file: 'app/core/llm_router.py',
    functionName: 'get_llm()',
    nodeId: 'llmrouter',
    badge: 'Router',
    highlightLine: 4,
    status: 'pending',
    code: `_CHARS_PER_TOKEN = 4  # 1 token ≈ 4 characters

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
        )`,
  },
  {
    id: 6,
    name: 'Tool Executed',
    description: 'LLM decided to use the calculator tool. Expression evaluated safely.',
    file: 'app/tools/tool_1.py',
    functionName: 'calculator()',
    nodeId: 'tool',
    badge: 'Tool Call',
    highlightLine: 5,
    status: 'pending',
    toolUsed: 'calculator',
    code: `@tool
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
        return f"Error evaluating expression: {e}"`,
  },
  {
    id: 7,
    name: 'Memory Updated',
    description: 'Q&A pair saved as HumanMessage + AIMessage for future conversation context.',
    file: 'app/memory/memory.py',
    functionName: 'memory.add()',
    nodeId: 'memory',
    badge: 'ChatMemory',
    highlightLine: 3,
    status: 'pending',
    code: `class ChatMemory:
    def __init__(self):
        self._history: list = []

    def add(self, question: str, answer: str) -> None:
        self._history.append(HumanMessage(content=question))
        self._history.append(AIMessage(content=answer))

    def get(self) -> list:
        return self._history

    def clear(self) -> None:
        self._history = []

memory = ChatMemory()`,
  },
  {
    id: 8,
    name: 'Response Serialized',
    description: 'AIResponse Pydantic model built with answer, sources, and execution steps.',
    file: 'app/models/response_model.py',
    functionName: 'AIResponse',
    nodeId: 'response',
    badge: 'Pydantic',
    highlightLine: 2,
    status: 'pending',
    code: `class AIResponse(BaseModel):
    answer: str
    sources: List[str] = []
    steps: List[str] = []

# Built in ai_service.py:
return AIResponse(
    answer=answer,
    sources=sources,
    steps=steps
)`,
  },
];
