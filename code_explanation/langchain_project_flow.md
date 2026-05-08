# LangChain Project — Dynamic Code Flow
> `langchain-langraph-workspace/langchain_project/`

---

## What This Project Does

A **FastAPI AI chatbot** that uses LangChain to intelligently answer questions.
It can use tools (calculator, datetime), search uploaded documents (RAG), and remember previous messages — all powered by OpenAI or DeepSeek depending on question size.

**Type:** LangChain Agent + Chain + RAG + Memory  
**Framework:** FastAPI + LangChain

---

## Mind Map

```
                        ┌─────────────┐
                        │    USER     │
                        └──────┬──────┘
                               │ POST /api/v1/chat
                               ▼
                    ┌──────────────────────┐
                    │      main.py         │
                    │  FastAPI App Starts  │
                    │  + Tracing Setup     │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    api/routes.py     │ ◄── URL handlers
                    │  chat() is called    │     /chat /agent
                    └──────────┬───────────┘     /ingest /memory
                               │
                               ▼
              ┌────────────────────────────────┐
              │    services/ai_service.py      │
              │    run_ai_service()            │  ◄── MAIN BRAIN
              │                                │
              │  1. use_rag? → retrieve docs   │
              │  2. run agent with tools       │
              │  3. agent fails? → use chain   │
              │  4. save to memory             │
              └──────┬─────────────┬───────────┘
                     │             │
          ┌──────────┘             └──────────┐
          ▼                                   ▼
┌──────────────────┐               ┌──────────────────┐
│  agents/agent.py │               │  rag/retrieve.py │
│                  │               │                  │
│  AgentExecutor   │               │  FAISS search    │
│  + tools:        │               │  → top-3 chunks  │
│   calculator     │               └──────────────────┘
│   get_datetime   │
└────────┬─────────┘
         │
         ▼
┌──────────────────────┐
│  core/llm_router.py  │  ◄── Smart routing
│                      │
│  tokens < 50         │
│    → OpenAI GPT-3.5  │
│  tokens >= 50        │
│    → DeepSeek Chat   │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│   LLM API Call       │
│  (OpenAI / DeepSeek) │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  memory/memory.py    │
│  saves Q + A         │
└──────────────────────┘
         │
         ▼
┌──────────────────────┐
│  JSON Response       │
│  { answer, sources,  │
│    steps }           │
└──────────────────────┘
```

---

## Step-by-Step Code Flow

```
Step 1   User sends: POST /api/v1/chat
         Body: { "question": "...", "use_rag": false, "prompt_version": "v1" }

Step 2   main.py receives it
         → Middleware logs the request
         → FastAPI routes it to routes.py

Step 3   routes.py: chat() function runs
         → Calls run_ai_service(question, prompt_version, use_rag)

Step 4   ai_service.py: run_ai_service() — THE ORCHESTRATOR
         ├── IF use_rag=True
         │     → retrieve_context(question) from rag/retrieve.py
         │     → FAISS searches saved embeddings
         │     → Returns top-3 text chunks + sources
         │     → Appends chunks to the question
         │
         └── ALWAYS
               → get_agent_executor(question) from agents/agent.py
                   → get_llm(question) from llm_router.py
                       → count tokens (len/4)
                       → < 50 → ChatOpenAI(gpt-3.5-turbo)
                       → ≥ 50 → ChatOpenAI(deepseek-chat)
                   → AgentExecutor created with [calculator, get_datetime] tools

Step 5   Agent runs: executor.invoke({ input, chat_history })
         → LLM receives the question
         → LLM thinks: "Do I need a tool?"
         → YES → emits tool call → tool runs → result back to LLM
         → NO  → LLM writes final answer directly

Step 6   If agent crashes:
         → Fallback: get_reasoning_chain() from chains/chain.py
         → Simple: Prompt | LLM | StrOutputParser
         → Retried up to 3 times with exponential backoff

Step 7   memory.add(question, answer)
         → Stored as [HumanMessage, AIMessage] in memory list

Step 8   Return AIResponse(answer, sources, steps)
```

---

## One Complete Example — "What is 25 times 4?"

**Input:**
```json
POST /api/v1/chat
{ "question": "What is 25 times 4?", "use_rag": false }
```

**Trace through code:**

```
routes.py::chat()
  └─► ai_service.py::run_ai_service("What is 25 times 4?")

      Step 1: use_rag=False → skip retrieval
              steps = ["Step 1: Skipping RAG (not requested)"]

      Step 2: get_agent_executor("What is 25 times 4?")
                llm_router: len("What is 25 times 4?") = 20 chars
                            20 / 4 = 5 tokens → < 50 threshold
                            → ChatOpenAI(gpt-3.5-turbo) selected

              AgentExecutor built:
                agent = create_tool_calling_agent(llm, [calculator, get_datetime], prompt)

      Step 3: executor.invoke({
                "input": "What is 25 times 4?",
                "chat_history": []   ← empty first turn
              })

              LLM receives:
                system: "You are a helpful AI assistant. Use tools when needed."
                human:  "What is 25 times 4?"

              LLM responds with tool_call:
                { "tool": "calculator", "args": { "expression": "25 * 4" } }

      Step 4: tool_1.py::calculator("25 * 4")
                allowed chars check: ✓ only digits and *
                eval("25 * 4") → 100
                returns "100"

      Step 5: LLM sees tool result "100"
              LLM writes final answer: "25 times 4 is 100."
              intermediate_steps = [("calculator", "100")]

      Step 6: memory.add("What is 25 times 4?", "25 times 4 is 100.")
              history now: [HumanMessage, AIMessage]
```

**Output:**
```json
{
  "answer": "25 times 4 is 100.",
  "sources": [],
  "steps": [
    "Step 1: Skipping RAG (not requested)",
    "Step 3: Running agent with tools (calculator, datetime)",
    "Tool used: calculator → 100",
    "Step 4: Response saved to conversation memory"
  ]
}
```

**Second question in same session — "What was my last question?":**
```
memory.get() returns [HumanMessage("What is 25 times 4?"), AIMessage("25 times 4 is 100.")]

LLM receives full chat_history → can reference it naturally
Answer: "Your last question was 'What is 25 times 4?'"
```

---

## File Map

```
langchain_project/
├── app/
│   ├── main.py              → FastAPI app, tracing setup
│   ├── api/
│   │   └── routes.py        → All HTTP endpoints (/chat, /agent, /ingest, /memory)
│   ├── services/
│   │   └── ai_service.py    → MAIN ORCHESTRATOR — calls everything
│   ├── agents/
│   │   └── agent.py         → Builds AgentExecutor with 2 tools
│   ├── chains/
│   │   └── chain.py         → Fallback: simple Prompt | LLM | Parser
│   ├── core/
│   │   ├── llm_router.py    → Picks OpenAI vs DeepSeek by token count
│   │   └── config.py        → All settings from .env
│   ├── memory/
│   │   └── memory.py        → In-process chat history (HumanMsg + AIMsg)
│   ├── rag/
│   │   ├── ingest.py        → PDF/TXT → chunks → embeddings → FAISS
│   │   └── retrieve.py      → FAISS search → top-k chunks
│   └── tools/
│       ├── tool_1.py        → calculator (safe eval)
│       └── tool_2.py        → get_current_datetime
```

---

## Key LangChain Concept in This Project

```
AGENT LOOP (what makes it powerful):

  Prompt (with tools list)
        ↓
      LLM
        ↓
  Has tool_calls?
      YES → run tool → result back to LLM → loop again
      NO  → write final answer → EXIT

CHAIN (fallback, simpler):

  Prompt → LLM → StrOutputParser
  No tools. No loops. One shot.

LLM ROUTING (cost saving):

  Short question (< 50 tokens) → OpenAI (fast, cheap)
  Long question (≥ 50 tokens)  → DeepSeek (handles large context)
```
