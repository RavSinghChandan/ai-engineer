# Project: AI LangChain Service (Enterprise Ready)

## Objective

Build a production-ready AI service using LangChain that demonstrates real-world enterprise patterns like prompt chaining, memory, RAG, and tool usage — targeting AI Engineer roles at financial domain companies like Bank of America, JPMorgan, Goldman Sachs, and similar MNCs.

---

## Tech Stack

* Python 3.x
* LangChain
* OpenAI API
* FastAPI
* Python-dotenv

---

## Project Structure

```
project-name/
│
├── app/
│   ├── main.py              # FastAPI entry point
│   ├── services/
│   │   └── llm_service.py  # LangChain logic
│   ├── routes/
│   │   └── api.py          # API endpoints
│
├── data/                   # PDFs / input data (for RAG)
├── .env
├── requirements.txt
├── README.md
```

---

## Features to Implement

---

### 1. Basic Chat

**What to Build:**
* Use ChatOpenAI
* Create prompt template
* Maintain conversation memory

---

**Theory You Must Read**

- **Transformer Architecture** — Understand self-attention, multi-head attention, positional encoding, encoder-decoder structure. This is the foundation of every LLM used in banking AI systems.
- **Tokens** — What a token is, how BPE (Byte Pair Encoding) tokenization works, why token count directly impacts cost and latency (critical in financial systems where every API call is metered and audited).
- **Context Window** — Hard limit on how much text a model processes in one call. In banking, documents like loan agreements and contracts can be very long — knowing this limit and working around it is essential.
- **Temperature & Top-p Sampling** — Temperature controls randomness. In financial applications, you almost always want low temperature (0.0–0.2) to get deterministic, reliable answers rather than creative ones.
- **Chat Model Message Roles** — `SystemMessage` (defines persona and compliance guardrails), `HumanMessage` (user query), `AIMessage` (model response). Understanding this is required to build safe, policy-compliant bots.
- **ChatOpenAI vs OpenAI class** — `ChatOpenAI` uses the chat completion API (message-based); `OpenAI` uses the older text completion API. All modern production systems use `ChatOpenAI`.
- **ChatPromptTemplate** — How to inject dynamic variables, user context, and domain-specific instructions into prompts reliably.

**Domain Relevance (Banking):** Banks deploy internal chat assistants for employees to query policies, regulations, and internal documentation. Temperature control and strict system prompts ensure the model does not hallucinate compliance information.

**Best Resource:**
- [DeepLearning.AI — ChatGPT Prompt Engineering for Developers](https://www.deeplearning.ai/short-courses/chatgpt-prompt-engineering-for-developers/) — Free, taught by OpenAI + Andrew Ng, covers exactly these fundamentals end to end.

---

### 2. Prompt Engineering

**What to Build:**
* Create dynamic prompts
* Add role-based system messages

---

**Theory You Must Read**

- **Zero-shot Prompting** — Giving the model a task with no example. Works well for simple classification or extraction tasks in banking (e.g., extract account number from a message).
- **Few-shot Prompting** — Providing 2–5 examples inside the prompt to guide output format. Critical when you need structured outputs like JSON for downstream systems.
- **Chain-of-Thought (CoT) Prompting** — Adding "Think step by step" forces the model to reason before answering. Used in financial analysis tasks where reasoning transparency is needed.
- **Role Prompting via System Message** — Defining the model as "You are a compliance officer at a financial institution" dramatically shifts its behaviour and makes outputs domain-appropriate.
- **Output Parsers** — `PydanticOutputParser`, `JsonOutputParser` — ensure the LLM always returns machine-readable structured output, not free text. This is non-negotiable in financial workflows that feed downstream systems.
- **Prompt Injection Attacks** — Users can craft malicious inputs to override system instructions. In banking, this is a security risk. You must understand how it works and how to sanitize inputs and harden system prompts.
- **Instruction Tuning vs Prompting** — Understanding when to prompt vs when to fine-tune. For most enterprise banking use cases, prompting is preferred because fine-tuning requires sensitive training data.

**Domain Relevance (Banking):** Financial companies use prompts to extract entities from contracts, classify transaction intent, summarise regulatory filings (10-K, Basel III reports), and generate compliant customer communications.

**Best Resource:**
- [Prompt Engineering Guide — promptingguide.ai](https://www.promptingguide.ai/) — The most comprehensive open-source guide covering all prompting techniques with examples.

---

### 3. Chain System (LCEL)

**What to Build:**
* Implement prompt → LLM → output pipeline
* Modularize logic

---

**Theory You Must Read**

- **LangChain Expression Language (LCEL)** — The modern way to compose components using the pipe `|` operator. Every component (prompt, LLM, parser, retriever) is a `Runnable`. This replaces the old `LLMChain` and `SequentialChain` API.
- **Runnable Interface** — All LangChain components implement `invoke()`, `batch()`, `stream()`, and their async counterparts (`ainvoke`, `abatch`, `astream`). Knowing this interface is mandatory.
- **`RunnablePassthrough`** — Passes the original input alongside intermediate results. Essential when you need to carry original data through a chain (e.g., keep the original document alongside its summary).
- **`RunnableParallel`** — Runs multiple branches simultaneously and merges results. Used in financial systems to run multiple analysis chains on the same document concurrently.
- **Streaming** — `astream()` pushes tokens to the client as they are generated. Required for real-time internal tools and chatbots where users should not wait for the full response.
- **LangSmith Tracing** — Logs every chain step, input, output, token count, and latency. In banking, audit trails of AI decisions are a compliance requirement — LangSmith or equivalent is mandatory.

**Domain Relevance (Banking):** A pipeline in a financial AI system might look like: `document → summary chain | compliance check chain | flag extraction chain`. LCEL makes this composable, testable, and auditable.

**Best Resource:**
- [LangChain LCEL — Official Concepts + How-To](https://python.langchain.com/docs/concepts/lcel/) — The definitive guide. Read the concepts page and then all the how-to guides under LCEL.

---

### 4. c

**What to Build:**
* ConversationBufferMemory
* Maintain chat history

---

**Theory You Must Read**

- **Why LLMs Are Stateless** — Every API call is independent. The model has no memory of previous turns unless you explicitly pass the history. This is the core problem memory solves.
- **`ConversationBufferMemory`** — Stores every message verbatim and appends it to every subsequent prompt. Simple but the history grows unbounded — dangerous for long sessions.
- **`ConversationBufferWindowMemory`** — Keeps only the last `k` exchanges. Good for short-context interactions where only recent context matters.
- **`ConversationSummaryMemory`** — Uses an LLM to summarise older parts of the conversation. Keeps token usage bounded while preserving semantic context. Best for long financial advisory sessions.
- **`ConversationSummaryBufferMemory`** — Hybrid: keeps recent messages verbatim, summarises older ones when a token threshold is exceeded. The most production-practical choice.
- **`RunnableWithMessageHistory`** — The modern LCEL-compatible way to attach memory to any chain. Understand how `session_id` isolates memory per user.
- **Persistent Memory Backends** — `InMemoryChatMessageHistory` is only for development. In production, you store history in Redis, PostgreSQL, or a dedicated store — so it survives server restarts and scales across pods.

**Domain Relevance (Banking):** A loan advisory chatbot must remember that the user mentioned their income earlier in the conversation. A compliance assistant must track the full audit trail of a multi-turn investigation session. Each user session must be fully isolated.

**Best Resource:**
- [LangChain Memory — Official How-To: RunnableWithMessageHistory](https://python.langchain.com/docs/how_to/message_history/) — Covers both the concept and the production-grade LCEL implementation.

---

### 5. RAG (Retrieval Augmented Generation)

**What to Build:**
* Load documents (PDF)
* Create embeddings
* Retrieve relevant context
* Pass to LLM

---

**Theory You Must Read**

- **Why RAG Exists** — LLMs have a knowledge cutoff and hallucinate. Banks cannot use a model that invents regulations or policy details. RAG grounds the model in authoritative internal documents.
- **Document Loaders** — `PyPDFLoader`, `UnstructuredFileLoader`, `WebBaseLoader`. In banking, you load annual reports, loan agreements, Basel III/IV guidelines, internal policy PDFs.
- **Text Splitting** — `RecursiveCharacterTextSplitter` is the standard. `chunk_size` and `chunk_overlap` are critical: too small = incomplete context, too large = retrieval noise. This is a tuning problem you must understand deeply.
- **Embeddings** — A dense vector that captures the semantic meaning of text. `text-embedding-ada-002` (OpenAI) or `sentence-transformers` (open-source). Two semantically similar texts have embeddings with high cosine similarity.
- **Cosine Similarity** — The mathematical basis of semantic search in vector stores. You must be able to explain it.
- **Vector Stores** — FAISS for local/development, Chroma for lightweight production, Pinecone/Weaviate/pgvector for enterprise-scale. In a bank, pgvector (PostgreSQL extension) is often preferred because it fits inside the existing compliant database infrastructure.
- **Retrieval Strategies** — Similarity search (top-k most similar chunks), MMR (Maximal Marginal Relevance — avoids returning redundant chunks), Hybrid search (semantic + keyword BM25). For financial documents with specific terminology, hybrid search outperforms pure semantic search.
- **Advanced RAG — HyDE** — Hypothetical Document Embeddings: generate a hypothetical answer, embed it, then retrieve. Improves recall on difficult queries.
- **Advanced RAG — Re-ranking** — Use a cross-encoder model to re-score retrieved chunks for relevance before passing them to the LLM. Significantly improves precision.
- **RAGAS** — Framework to evaluate RAG: faithfulness (answer grounded in context?), answer relevancy, context recall. You must know how to measure RAG quality, not just build it.

**Domain Relevance (Banking):** RAG is the primary architecture for internal knowledge assistants at banks — querying compliance manuals, RBI/SEC/FCA regulations, product policy documents, and SWIFT/ISO 20022 documentation without sending sensitive data to be trained on.

**Best Resources:**
- [DeepLearning.AI — LangChain: Chat With Your Data](https://www.deeplearning.ai/short-courses/langchain-chat-with-your-data/) — Free. Best end-to-end RAG course covering loaders, splitters, embeddings, retrieval, and Q&A chains.
- [Pinecone — RAG Guide (Advanced)](https://www.pinecone.io/learn/retrieval-augmented-generation/) — Covers advanced retrieval techniques, re-ranking, and production RAG patterns used in enterprise systems.

---

### 6. Tool Usage & Agents

**What to Build:**
* Integrate external APIs
* Use tools inside LangChain

---

**Theory You Must Read**

- **What is an Agent** — Instead of a fixed chain, the LLM decides at runtime which tool to call and with what arguments. The LLM is the reasoning engine; tools are its hands.
- **ReAct Pattern (Reason + Act)** — The foundational loop: `Thought → Action (tool call) → Observation (tool result) → repeat until final answer`. This is what all LangChain agents implement.
- **OpenAI Function Calling / Tool Calling** — OpenAI models natively support structured tool invocation via JSON schema. The model returns a structured JSON object specifying which function to call with which arguments — no regex parsing needed.
- **Tool Definition** — A tool has a name, a description (the LLM reads this to decide when to use it), and an args schema (Pydantic model). The description quality directly determines whether the agent uses the right tool.
- **AgentExecutor** — Wraps the agent loop: calls the LLM, parses tool calls, executes tools, feeds results back. Manages max iterations and error handling.
- **Stopping Conditions** — `max_iterations`, `max_execution_time`, `handle_parsing_errors`. Without these, agents can loop indefinitely — catastrophic in production.
- **Tool Safety in Financial Systems** — In banking, tools that can execute transactions or modify data must be gated behind human-in-the-loop confirmation. An agent should never execute a wire transfer autonomously.

**Domain Relevance (Banking):** AI agents at financial companies call tools like: market data APIs (Bloomberg, Reuters), internal account lookup APIs, credit scoring services, regulatory reporting systems, and document generation services. The agent orchestrates these without hard-coded logic.

**Best Resource:**
- [DeepLearning.AI — Functions, Tools & Agents with LangChain](https://www.deeplearning.ai/short-courses/functions-tools-agents-langchain/) — Free. Best course covering function calling, tool creation, and agent architecture end to end.

---

### 7. Error Handling & Resilience

**What to Build:**
* Handle API failures
* Add fallback responses

---

**Theory You Must Read**

- **Rate Limiting (HTTP 429)** — OpenAI and other LLM providers throttle requests. You must handle `429 Too Many Requests` gracefully with retry logic, not let it crash the service.
- **Exponential Backoff with Jitter** — Wait 2s, then 4s, then 8s between retries. Jitter (randomness) prevents all retries from hammering the server simultaneously. This is the industry standard retry strategy.
- **`tenacity` Library** — Python library for retry logic: `@retry(wait=wait_exponential(...), stop=stop_after_attempt(...))`. Standard in production LLM services.
- **LangChain `.with_fallbacks()`** — Automatically switches to a backup model (e.g., GPT-3.5 when GPT-4 is down, or a local model when the cloud API is unavailable). Critical for high-availability financial systems.
- **Circuit Breaker Pattern** — After N consecutive failures, stop trying for a cooldown period. Prevents cascade failures across microservices. Use `pybreaker` or implement manually.
- **Timeout Handling** — Always set request timeouts (`request_timeout` on `ChatOpenAI`). An LLM API hanging for 5 minutes is as bad as it being down.
- **Structured Error Responses** — Never expose raw stack traces or model error messages to end users. Return a consistent error envelope: `{"status": "error", "code": "LLM_UNAVAILABLE", "message": "..."}`.
- **Audit Logging of Failures** — In banking, every failed AI call must be logged with timestamp, request ID, error type, and fallback action taken. This is a compliance requirement.

**Domain Relevance (Banking):** Financial systems have strict SLA requirements (99.9%+ uptime). An AI service that crashes when the LLM API is slow is not acceptable. Resilience patterns are not optional — they are part of the architecture from day one.

**Best Resource:**
- [LangChain Fallbacks — Official How-To](https://python.langchain.com/docs/how_to/fallbacks/) — Covers `.with_fallbacks()` with code examples. Pair this with the `tenacity` docs for retry logic.

---

### 8. FastAPI Integration

**What to Build:**
* Create endpoint `/chat`
* Accept user input
* Return AI response

---

**Theory You Must Read**

- **Async / Await & asyncio** — FastAPI is async-first. Understanding Python's event loop, coroutines, `async def`, and `await` is mandatory. Blocking code inside an async endpoint will freeze the entire server.
- **Streaming Responses (SSE)** — `StreamingResponse` with `astream()` sends tokens to the browser as they are generated using Server-Sent Events. This is the industry standard for chat UI in financial assistants.
- **Pydantic Models** — Define request and response schemas with `BaseModel`. FastAPI auto-validates, auto-documents, and auto-serializes. In banking, strict input validation prevents injection attacks and malformed data.
- **Dependency Injection (`Depends`)** — Inject shared resources (LLM client, vector store, DB session) into route handlers without creating them on every request. This is how you manage expensive connections efficiently.
- **Lifespan Events** — Use `@asynccontextmanager` lifespan to initialize the LLM client, vector store, and DB pool once at startup — not on each request.
- **Authentication Middleware** — In banking APIs, every endpoint must be protected. JWT Bearer token validation, OAuth2, or API key header checks are implemented as FastAPI middleware or dependencies.
- **CORS Middleware** — Configure `CORSMiddleware` to restrict which origins can call the API. In an internal bank system, this is typically locked to the internal frontend domain only.
- **API Versioning** — Use `/v1/chat` prefix from day one. When you update the AI model or change the request schema, you can release `/v2/chat` without breaking existing integrations.
- **Uvicorn + Gunicorn in Production** — Multiple Uvicorn worker processes managed by Gunicorn handle concurrent load. Worker count tuning is important for LLM services where each request can take several seconds.

**Domain Relevance (Banking):** AI services at banks are deployed as internal microservices behind an API gateway. They are called by front-office trading tools, customer service portals, and compliance dashboards. Async performance, strict validation, and authentication are baseline requirements.

**Best Resources:**
- [FastAPI Official Tutorial](https://fastapi.tiangolo.com/tutorial/) — The only resource you need. Read end to end including advanced topics (streaming, dependencies, middleware, security).
- [Real Python — Async IO in Python](https://realpython.com/async-io-python/) — The clearest explanation of Python asyncio fundamentals. Read before diving into FastAPI async patterns.

---

## How to Run

### Step 1: Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Step 2: Add API Key

```
OPENAI_API_KEY=your_key
```

### Step 3: Run

```bash
uvicorn app.main:app --reload
```

---

## Example API Request

POST /chat

```json
{
  "question": "Explain AI in simple terms"
}
```

---

## Master Resource List — 360 Degree Prep for Financial Domain AI Engineer

| Resource | What It Covers |
|---|---|
| [DeepLearning.AI Short Courses](https://www.deeplearning.ai/short-courses/) | All free. LangChain, RAG, agents, prompt engineering — taught by Andrew Ng and practitioners |
| [LangChain Official Docs](https://python.langchain.com/docs/) | Complete reference for every LangChain concept, class, and pattern |
| [Prompt Engineering Guide](https://www.promptingguide.ai/) | Zero-shot, few-shot, CoT, RAG prompting — the complete reference |
| [FastAPI Official Tutorial](https://fastapi.tiangolo.com/tutorial/) | Async APIs, streaming, validation, auth, deployment |
| [Pinecone Learning Center](https://www.pinecone.io/learn/) | Vector databases, embeddings, advanced RAG, semantic search — enterprise depth |

---

## Enterprise Relevance

This project simulates:

* AI microservice architecture used at financial institutions
* Compliant, auditable LLM pipelines with tracing
* Scalable, resilient LLM-based internal tools
* Document intelligence over financial documents (contracts, reports, regulations)
