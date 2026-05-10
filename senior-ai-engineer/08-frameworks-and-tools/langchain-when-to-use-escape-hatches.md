# Senior AI Engineer — Module 8
# Topic: LangChain — When to Use, When NOT to Use, Escape Hatches

---

## 1. Intuition

LangChain is a great tool for rapid prototyping and demos. It becomes a liability when you need production reliability, debugging, and fine-grained control.

Senior engineers know what LangChain abstracts away, when those abstractions help, and when to bypass them.

---

## 2. Core Concept

LangChain provides:
- Document loaders (PDF, HTML, CSV → text)
- Text splitters (recursive, character, sentence)
- Embedding wrappers (OpenAI, HuggingFace, Cohere)
- Vector store integrations (FAISS, Pinecone, Chroma)
- LLM wrappers (OpenAI, Anthropic, local models)
- Chain primitives (LCEL: pipe operators for composing pipelines)
- Agent executors (ReAct, structured chat)
- Memory integrations
- Callback system (for logging, monitoring, custom hooks)

What LangChain does NOT provide:
- Production-grade error handling (you add this)
- Token cost tracking (you add this)
- Circuit breakers (you add this)
- Multi-tenancy (you design this)
- Semantic caching (you build this or use GPTCache)

---

## 3. When to Use LangChain

USE for:
- Rapid prototyping and demos (fastest path from idea to working demo)
- Standard RAG pipeline (PDF → FAISS → QA chain in 20 lines)
- Connecting document loaders to vector stores (excellent ecosystem)
- Teams new to LLM development (great abstractions to start with)
- When the abstraction matches your task exactly

DO NOT USE (or use with escape hatches) for:
- Custom reliability requirements (retry logic, circuit breaker)
- Complex multi-tenant systems (LangChain does not handle tenant isolation)
- Fine-grained token and cost tracking
- Systems where you need to understand exactly what is being sent to the LLM
- Production agents where debugging is critical (LangChain's agent executor is a black box)

---

## 4. Code Skeleton — Standard LangChain vs Direct Control

```python
# LangChain RAG — fast but less control
from langchain.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import FAISS
from langchain.chains import RetrievalQA
from langchain.chat_models import ChatOpenAI

def build_langchain_rag(pdf_path: str) -> RetrievalQA:
    loader = PyPDFLoader(pdf_path)
    docs = loader.load()
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_documents(docs)
    embeddings = OpenAIEmbeddings()
    vector_store = FAISS.from_documents(chunks, embeddings)
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    return RetrievalQA.from_chain_type(llm=llm, retriever=vector_store.as_retriever(search_kwargs={"k": 4}))

# 5 minutes to build, works great for demos
# Problems in production:
# - No cost tracking (how many tokens did this call use?)
# - No faithfulness scoring
# - No fallback model
# - Error messages are abstracted and hard to debug
# - No tenant isolation

# Direct control — more code but production-ready
def build_production_rag(pdf_path: str, tenant_id: str) -> ProductionRAGPipeline:
    text = extract_text_from_pdf(pdf_path)
    chunks = chunk_document_standard(text, chunk_size=512, overlap=64)
    embeddings = embed_batch(chunks)
    
    store = FAISSVectorStore(dimension=1536)
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        store.add(chunk, embedding, {"tenant_id": tenant_id, "chunk_idx": i})
    
    return ProductionRAGPipeline(
        vector_store=store,
        embedding_model=EmbeddingModel(),
        llm_client=LLMClient(model="gpt-4o-mini"),
        reranker=CrossEncoderReranker()
    )

# Every call is tracked, every failure is handled, every component is replaceable

# Escape hatch: use LangChain for what it's good at, bypass for the rest
from langchain.document_loaders import PyPDFLoader  # keep this
from langchain.text_splitter import RecursiveCharacterTextSplitter  # keep this

# But bypass LangChain's LLM wrapper and chain for direct OpenAI control
def hybrid_pipeline(pdf_path: str, query: str, tenant_id: str) -> dict:
    # LangChain for document loading (great)
    loader = PyPDFLoader(pdf_path)
    docs = loader.load()
    splitter = RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=64)
    chunks = splitter.split_documents(docs)
    
    # Direct control for everything else
    chunk_texts = [doc.page_content for doc in chunks]
    embeddings = embed_batch(chunk_texts)
    
    query_vector = embed_text(query)
    # ... direct FAISS, direct OpenAI call, direct cost tracking
```

---

## 5. Example (From Your Projects)

**LangChain Service — honest assessment:**

The LangChain service is an excellent demo. For production:
- The RetrievalQA chain hides how many tokens were used — I added callbacks to extract usage.
- The LCEL chain does not have built-in fallback — I wrapped it with a try/except and fallback model.
- FAISS index is in-memory — for persistence, I save/load explicitly.

In interview: "The LangChain service is a solid demo that shows RAG, agents, and LCEL patterns. For production, I would keep the document loading and splitting utilities, but replace the chain execution with direct OpenAI calls for full control over token tracking, retry logic, and fallback."

---

## 6. Trade-offs

LangChain:
+ Fastest time to demo, excellent document ecosystem, vibrant community
- Abstractions hide costs and errors, rapid version changes break production code, debugging is harder

Raw OpenAI SDK:
+ Full control, transparent, stable API
- More boilerplate, write your own retry logic

LangChain LCEL:
+ Composable, observable via callbacks
- New API (not stable), different mental model from traditional Python

---

## 7. Interview Questions (Senior Level)

- When would you NOT use LangChain in a production system?

  **Answer:** When you need fine-grained reliability — circuit breakers, per-request token cost tracking, multi-tenant isolation, or precise control over what goes into the LLM context. LangChain's chain abstractions hide these details, making production debugging painful. In Bench Resource Optimizer I use LangChain's `PyPDFLoader` and `RecursiveCharacterTextSplitter` for document ingestion, but all LLM calls go through a direct DeepSeek SDK wrapper so I can track tokens, apply retries with exponential backoff, and enforce circuit breakers — none of which LangChain's `RetrievalQA` exposes cleanly.

- How do you add cost tracking to a LangChain pipeline?

  **Answer:** *(Already covered in Advanced Follow-ups Q1 — see `get_openai_callback()` and `CostTrackingCallback` pattern below.)*

- What is LCEL and what problem does it solve?

  **Answer:** *(Already covered in Advanced Follow-ups Q2 — see LCEL pipe `|` operator and `RunnableParallel` pattern below.)*

- How do you use LangChain callbacks for custom monitoring?

  **Answer:** Implement `BaseCallbackHandler` and override `on_llm_start`, `on_llm_end`, and `on_chain_error`. In `on_llm_end` you get the raw `LLMResult` including `token_usage` — push those to your metrics store. Attach it via `chain.invoke(input, config={"callbacks": [MyCallback()]})`. In AstroIntel I used a `CostTrackingCallback` that fired on every DeepSeek call, accumulated `prompt_tokens` and `completion_tokens` into a thread-local accumulator, and exposed them at `/api/v1/metrics` as real token economics — `avg_cost_per_run_usd: $0.000137`.

- What is the escape hatch if LangChain's abstraction is too limiting?

  **Answer:** Keep LangChain only for the parts where it adds value — document loaders (`PyPDFLoader`, `UnstructuredLoader`) and text splitters (`RecursiveCharacterTextSplitter`) — and bypass it entirely for LLM calls, retrieval, and chain execution. Replace `RetrievalQA` with your own function: embed the query directly, call FAISS `similarity_search` directly, construct the prompt manually, and call the LLM SDK directly. This gives you full observability and control while keeping the 100+ document loader ecosystem. I call this the "LangChain at the edges, direct SDK at the core" pattern — it is what I use in both AstroIntel and Bench Resource Optimizer.

---

## 8. Answer Framework

Step 1 — Show you know it well:
"I built the LangChain RAG service using RetrievalQA, FAISS, and LCEL chains. LangChain is excellent for rapid development."

Step 2 — Show critical thinking:
"For production, LangChain's abstractions hide important details: token usage, retry behavior, and exact API calls. I add callbacks for cost tracking and wrap chains with explicit error handling."

Step 3 — Know when to bypass:
"For complex multi-tenant systems or when I need fine-grained reliability patterns, I use LangChain for document utilities (loaders, splitters) and direct OpenAI SDK for LLM calls."

Step 4 — LCEL:
"LCEL (LangChain Expression Language) uses pipe operators to compose pipelines declaratively. It adds parallel execution and streaming support to chains with minimal code."

Step 5 — Callback for monitoring:
"LangChain callbacks fire on every LLM call, chain start/end, and retrieval. I use StdOutCallbackHandler in development and a custom callback in production to log tokens, latency, and cost per call."

---

## 10. Advanced Follow-ups

Q1: How do you add token cost tracking to a LangChain pipeline?

Answer:
LangChain has a built-in callback handler for token tracking: `get_openai_callback()`.
```python
from langchain.callbacks import get_openai_callback

with get_openai_callback() as cb:
    result = qa_chain({"query": question})
    print(f"Tokens: {cb.total_tokens}, Cost: ${cb.total_cost:.6f}")
```
For production, replace with a custom callback:
```python
from langchain.callbacks.base import BaseCallbackHandler

class CostTrackingCallback(BaseCallbackHandler):
    def on_llm_end(self, response, **kwargs):
        usage = response.llm_output.get("token_usage", {})
        cost = calculate_cost(
            usage.get("prompt_tokens", 0),
            usage.get("completion_tokens", 0)
        )
        metrics.increment("llm.cost_usd", cost)
        metrics.increment("llm.tokens", usage.get("total_tokens", 0))
```
Attach to any chain: `chain.run(query, callbacks=[CostTrackingCallback()])`.

Q2: What is LCEL and when does it help?

Answer:
LCEL (LangChain Expression Language) is LangChain's declarative pipeline composition syntax using the pipe `|` operator.
```python
from langchain_core.runnables import RunnableLambda

chain = (
    RunnableLambda(retrieve_context)
    | RunnableLambda(format_prompt)
    | llm
    | output_parser
)
result = chain.invoke({"query": "How do I reset my password?"})
```
Benefits: automatic streaming (chain.stream()), parallel branches (RunnableParallel), easy composition.
When it helps: when your pipeline is a linear sequence of transformations with well-defined input/output schemas. LCEL handles the plumbing automatically.
When it does not help: when you need complex error handling, conditional routing, or the chain needs to interact with external state. At that point, explicit Python code is clearer and more debuggable than a pipe chain.

Q3: LangChain version upgrades keep breaking your production code. How do you handle it?

Answer:
This is a real problem — LangChain moved major APIs multiple times (from `langchain` to `langchain-core`, `langchain-openai`, etc.).
Pin your LangChain version in requirements.txt: `langchain==0.2.15`. Never use `langchain>=0.2`.
Add a dedicated test suite that runs against your pinned version in CI. Before upgrading, run the test suite against the new version on a branch. Only upgrade when tests pass.
Abstraction layer: wrap all LangChain calls in your own functions. If LangChain changes, you update one wrapper, not every place in the codebase.
Long-term: for critical production code, consider replacing LangChain dependencies with direct SDK calls. LangChain is most valuable for rapid development. The more critical the system, the more you want to control the dependencies.
