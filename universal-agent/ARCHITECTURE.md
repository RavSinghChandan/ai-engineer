# Universal AI Agent Platform — Architecture Document

**Author:** Principal AI Architect review  
**Codebase version reviewed:** current `main` branch  
**Date:** 2026-06-02

---

## 1. Executive Summary

The current codebase is a well-built **single-agent service**. It is clean, testable, and already configuration-driven. However it is **not yet a platform**. The gap between "well-built project" and "Universal AI Agent Platform" is not about rewriting code — it is about restructuring responsibility boundaries so that every layer can be replaced, extended, or multi-tenanted independently.

This document covers:
- What the current architecture does well and where it falls short
- The exact refactoring needed to reach platform status
- A concrete folder structure, plugin contracts, and migration strategy
- A phased roadmap with risk analysis

---

## 2. Current Architecture — Honest Assessment

### 2.1 What exists today

```
universal-agent/
├── core/
│   ├── agent.py          ← LangGraph loop (the agent brain)
│   ├── config_loader.py  ← Pydantic + YAML config
│   ├── llm.py            ← LLM factory (4 providers)
│   ├── memory.py         ← In-process session store
│   ├── knowledge.py      ← RAG builder (FAISS / Chroma)
│   └── tools.py          ← Tool registry (calculator, datetime, web, custom)
├── adapters/
│   ├── fastapi_adapter.py   ← mount_agent() for FastAPI
│   ├── react_adapter.tsx    ← useUniversalAgent() hook + widget
│   └── angular_adapter.ts   ← Angular service + signals
├── api/main.py              ← Standalone FastAPI server
├── sdk/universal-agent.js   ← Vanilla JS SDK + auto-init widget
└── config/agent.config.yaml ← Single config file
```

### 2.2 Data flow today

```
HTTP POST /agent/chat
    │
    ▼
fastapi_adapter.py  ──► UniversalAgent.chat()
                              │
                    ┌─────────┼────────────────┐
                    ▼         ▼                ▼
               MemoryStore   Retriever      LangGraph
               (in-process)  (FAISS/Chroma) (ReAct only)
                                                │
                                           LLM (one of 4)
                                                │
                                           ToolNode (if needed)
                                                │
                                           response
```

### 2.3 Strengths (keep these)

| Strength | Why it matters |
|----------|---------------|
| Single YAML config drives all behavior | Zero code changes for new deployments |
| `BaseChatModel` abstraction for LLM | Provider already swappable |
| `BaseRetriever` abstraction for RAG | Vector store already swappable |
| `BaseTool` abstraction for tools | Custom tools load via `importlib` |
| Factory functions (`build_llm`, `build_retriever`, `build_tools`) | Deferred instantiation — correct pattern |
| All tests mocked — no API keys in CI | Production-grade test design |
| Pydantic config models | Type-safe, validated, documented by default |

### 2.4 Architectural Gaps — what blocks platform status

#### Gap 1: Single-tenant memory
```python
# core/memory.py — line 38
class MemoryStore:
    """In-process session store. Replace with Redis adapter for multi-instance deployments."""
    def __init__(self, cfg: MemoryConfig):
        self._sessions: dict[str, SessionMemory] = {}  # ← dies on process restart
```
**Problem:** Every deployment shares one process-level dict. Two instances of the agent = split sessions. Redis/database required for any real multi-tenant or multi-instance scenario.

**Fix needed:** `MemoryBackend` protocol with `InProcessBackend` (current) and `RedisBackend` as implementations.

---

#### Gap 2: Embedding vendor lock-in in knowledge.py
```python
# core/knowledge.py — line 67
from langchain_anthropic import AnthropicEmbeddings
embeddings = AnthropicEmbeddings(model="voyage-3")  # ← hardcoded to Anthropic
```
**Problem:** RAG always uses Anthropic embeddings even if the LLM is OpenAI or Ollama. Breaks local-only deployments. Adds cost and latency.

**Fix needed:** `EmbeddingProvider` factory — same pattern as `build_llm()`.

---

#### Gap 3: Only one agent execution mode (ReAct)
```python
# core/agent.py — line 114
def _build_graph(self) -> StateGraph:
    # Only builds: agent → tools → agent → END
    # No: Plan & Execute, Supervisor, Multi-Agent, DAG, Human-in-loop
```
**Problem:** Every domain gets the same ReAct loop. A customer support agent, a multi-step workflow agent, and a supervisor-over-subagents all need different graph topologies.

**Fix needed:** `AgentMode` enum + pluggable graph builder per mode.

---

#### Gap 4: No multi-tenancy
```python
# adapters/fastapi_adapter.py — line 27
_agent_instance: Optional[UniversalAgent] = None  # ← module-level global singleton
```
**Problem:** One config = one agent. To run a banking agent AND an HR agent on the same server requires two separate deployments. A platform needs tenant isolation — different configs, different knowledge bases, different tools — all on one runtime.

**Fix needed:** `AgentRegistry` — keyed by tenant/domain ID.

---

#### Gap 5: No streaming
```python
# adapters/fastapi_adapter.py — line 76
async def chat(request: ChatRequest):
    response = _agent_instance.chat(session_id, request.message)  # ← blocks until done
    return ChatResponse(...)
```
**Problem:** Users see nothing until the LLM finishes the full response. For long answers this feels broken. All modern AI products stream tokens.

**Fix needed:** `UniversalAgent.stream()` generator + SSE endpoint.

---

#### Gap 6: No auth/security layer
The API has zero authentication. Any caller can:
- Read any session (if they guess the session_id)
- Hit the LLM without rate limiting (rate_limit config exists but is **not enforced**)
- Inject arbitrary prompts with no input sanitization

**Fix needed:** Auth middleware + enforced rate limiting + basic prompt injection guard.

---

#### Gap 7: No observability
No structured logging, no request tracing, no LLM cost tracking, no latency metrics. Cannot answer "how many tokens did tenant X use this month?" or "what is P95 response latency?".

**Fix needed:** `ObservabilityPort` — event hooks on every request/response/tool-call.

---

#### Gap 8: Knowledge base loads at startup only
```python
# core/knowledge.py — build_retriever() called once in __init__
# No hot reload, no incremental update, no admin API to add documents
```
**Problem:** Adding a new document requires a server restart. Unacceptable for a platform where tenants manage their own knowledge base.

**Fix needed:** `KnowledgeManager` with add/remove/reindex API separate from the agent runtime.

---

#### Gap 9: No connector system for enterprise knowledge sources
Currently only reads `.txt`, `.md`, `.pdf` from a local folder. An enterprise platform needs:
- SharePoint connector
- Confluence connector
- Jira connector
- Database connector
- API connector

**Fix needed:** `KnowledgeConnector` protocol with pluggable implementations.

---

#### Gap 10: Avatar/presentation layer mixed with agent brain
The `sdk/universal-agent.js` widget is a hardcoded text chat bubble. There is no way to swap it for a voice assistant, video avatar, or mobile SDK without touching core code.

**Fix needed:** Presentation layer is entirely separate from agent brain. Agent brain exposes an event stream. Presentation layer subscribes to it.

---

## 3. Gap Analysis Summary

| Gap | Severity | Effort | Blocks |
|-----|----------|--------|--------|
| Single-tenant in-process memory | Critical | Medium | Multi-instance, production |
| Embedding vendor lock-in | High | Low | Local deployments, cost |
| Only ReAct execution mode | High | Medium | Multi-step workflows, supervisor |
| No multi-tenancy | Critical | High | Platform business model |
| No streaming | High | Low | User experience |
| No auth/security layer | Critical | Medium | Any production deployment |
| No observability | High | Medium | Operations, billing |
| Static knowledge base | Medium | Medium | Self-serve tenants |
| No enterprise connectors | Medium | High | Enterprise customers |
| Presentation coupled to brain | Medium | Low | Voice/video avatars |

---

## 4. Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    TODAY: Single-Tenant Service                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Browser/App  ──HTTP──►  FastAPI (one app, one agent)            │
│                               │                                   │
│                    ┌──────────▼──────────┐                       │
│                    │   UniversalAgent    │  ← singleton          │
│                    │   (one instance)    │                       │
│                    └──┬──────┬──────┬───┘                       │
│                       │      │      │                            │
│                  Memory   LLM    Tools                           │
│                  (dict)  (one   (list)                           │
│                          provider)                               │
│                                │                                 │
│                         Knowledge                                │
│                         (files only)                             │
│                                                                   │
│  Config: ONE yaml file → ONE behavior                            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Future Architecture Diagram — The Platform

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                     FUTURE: Universal AI Agent Platform                        │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  PRESENTATION LAYER (pluggable — never touches agent brain)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Text     │  │ Voice    │  │ Video    │  │ Mobile   │  │ Custom   │       │
│  │ Widget   │  │ Assistant│  │ Avatar   │  │ SDK      │  │ UI       │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       └─────────────┴──────────────┴──────────────┴─────────────┘             │
│                                    │ SSE / WebSocket / REST                    │
├───────────────────────────────────▼───────────────────────────────────────────┤
│                                                                                 │
│  API GATEWAY LAYER                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │  Auth (JWT/API key)  │  Rate Limiter  │  Tenant Router  │  Observability │  │
│  └──────────────────────┴───────────────┴─────────────────┴────────────────┘  │
│                                    │                                            │
│                          tenant_id extracted here                               │
├───────────────────────────────────▼───────────────────────────────────────────┤
│                                                                                 │
│  AGENT REGISTRY                                                                 │
│  ┌────────────────────────────────────────────────────────┐                   │
│  │  tenant: "banking"    →  AgentInstance(banking.yaml)   │                   │
│  │  tenant: "hr"         →  AgentInstance(hr.yaml)        │                   │
│  │  tenant: "healthcare" →  AgentInstance(health.yaml)    │                   │
│  │  tenant: "default"    →  AgentInstance(default.yaml)   │                   │
│  └────────────────────────────────────────────────────────┘                   │
│                                    │                                            │
├───────────────────────────────────▼───────────────────────────────────────────┤
│                                                                                 │
│  AGENT BRAIN (core — never changes across domains)                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                            │  │
│  │  AgentMode: ReAct | PlanExecute | Supervisor | MultiAgent | Workflow      │  │
│  │                         │                                                  │  │
│  │              ┌──────────▼──────────┐                                      │  │
│  │              │   LangGraph Engine  │                                       │  │
│  │              │  (graph topology    │                                       │  │
│  │              │   from config)      │                                       │  │
│  │              └──────────┬──────────┘                                      │  │
│  │                         │                                                  │  │
│  └──────┬──────────────────┼──────────────────────────────┬───────────────── ┘  │
│         │                  │                               │                    │
├─────────▼──────┬───────────▼─────────┬────────────────────▼──────────────────┤ │
│                │                     │                                         │ │
│  LLM PORT      │  MEMORY PORT        │  TOOL PORT                              │ │
│  ┌──────────┐  │  ┌───────────────┐  │  ┌──────────────────────────────────┐  │ │
│  │ Anthropic│  │  │ InProcess     │  │  │ calculator  │ datetime           │  │ │
│  │ OpenAI   │  │  │ Redis         │  │  │ web_search  │ custom_module      │  │ │
│  │ Gemini   │  │  │ Postgres      │  │  │ database    │ api_call           │  │ │
│  │ Ollama   │  │  │ DynamoDB      │  │  │ code_exec   │ file_ops           │  │ │
│  │ DeepSeek │  │  └───────────────┘  │  └──────────────────────────────────┘  │ │
│  │ Grok     │  │                     │                                         │ │
│  │ Llama    │  │  KNOWLEDGE PORT     │  EMBEDDING PORT                         │ │
│  └──────────┘  │  ┌───────────────┐  │  ┌──────────────────────────────────┐  │ │
│                │  │ FAISS         │  │  │ Anthropic  │ OpenAI              │  │ │
│                │  │ Chroma        │  │  │ HuggingFace│ Ollama (local)      │  │ │
│                │  │ Pinecone      │  │  └──────────────────────────────────┘  │ │
│                │  │ Weaviate      │  │                                         │ │
│                │  └───────────────┘  │  OBSERVABILITY PORT                     │ │
│                │                     │  ┌──────────────────────────────────┐  │ │
│                │  CONNECTOR PORT     │  │ structured_log │ prometheus      │  │ │
│                │  ┌───────────────┐  │  │ datadog        │ opentelemetry   │  │ │
│                │  │ FileSystem    │  │  └──────────────────────────────────┘  │ │
│                │  │ SharePoint    │  │                                         │ │
│                │  │ Confluence    │  └─────────────────────────────────────────┘ │
│                │  │ Jira          │                                               │
│                │  │ Database      │                                               │
│                │  │ REST API      │                                               │
│                │  └───────────────┘                                               │
│                └─────────────────────────────────────────────────────────────────┘
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Refactoring Plan

### 6.1 What NOT to rewrite

The following are already correct and should be preserved as-is:

- `config_loader.py` — Pydantic models are well-designed, extend don't replace
- `core/llm.py` — Factory pattern is correct, just add more providers
- `core/tools.py` — `BaseTool` abstraction is correct, add more built-ins
- `core/agent.py` — The LangGraph loop is right, add modes around it
- All test structure — mocked tests are the right approach

### 6.2 What to extend

**`core/memory.py`** — Add `MemoryBackend` protocol:
```python
# BEFORE (today)
class MemoryStore:
    def __init__(self, cfg: MemoryConfig):
        self._sessions: dict = {}  # in-process only

# AFTER (platform)
class MemoryBackend(Protocol):
    def get_history(self, session_id: str) -> list[BaseMessage]: ...
    def append_turn(self, session_id: str, human: str, ai: str) -> None: ...
    def clear(self, session_id: str) -> None: ...

class InProcessMemoryBackend:     # current behavior — kept
    ...
class RedisMemoryBackend:         # new — for multi-instance
    ...
class PostgresMemoryBackend:      # new — for persistent history
    ...

def build_memory(cfg: MemoryConfig) -> MemoryBackend:
    # factory — same pattern as build_llm()
    ...
```

**`core/knowledge.py`** — Decouple embedding from Anthropic:
```python
# BEFORE
embeddings = AnthropicEmbeddings(model="voyage-3")  # hardcoded

# AFTER
def build_embeddings(cfg: EmbeddingConfig) -> Embeddings:
    if cfg.provider == "anthropic":  return AnthropicEmbeddings(...)
    if cfg.provider == "openai":     return OpenAIEmbeddings(...)
    if cfg.provider == "huggingface": return HuggingFaceEmbeddings(...)
    if cfg.provider == "ollama":     return OllamaEmbeddings(...)
```

**`core/agent.py`** — Add agent modes:
```python
# BEFORE
def _build_graph(self) -> StateGraph:
    # only builds ReAct

# AFTER
def _build_graph(self) -> StateGraph:
    mode = self._cfg.agent.mode  # new config field
    if mode == "react":          return self._build_react_graph()
    if mode == "plan_execute":   return self._build_plan_execute_graph()
    if mode == "supervisor":     return self._build_supervisor_graph()
    if mode == "workflow":       return self._build_workflow_graph()
```

### 6.3 What to add (new files)

**`core/registry.py`** — Multi-tenant agent registry:
```python
class AgentRegistry:
    """Holds one AgentInstance per tenant. Thread-safe."""
    _instances: dict[str, UniversalAgent] = {}

    def get_or_create(self, tenant_id: str, config_path: str) -> UniversalAgent:
        if tenant_id not in self._instances:
            cfg = load_config(config_path)
            self._instances[tenant_id] = UniversalAgent(cfg)
        return self._instances[tenant_id]
```

**`core/streaming.py`** — SSE streaming:
```python
async def stream_chat(agent: UniversalAgent, session_id: str, message: str):
    """Yield tokens as they arrive from the LLM."""
    async for chunk in agent.stream(session_id, message):
        yield f"data: {json.dumps({'token': chunk})}\n\n"
    yield "data: [DONE]\n\n"
```

**`core/observability.py`** — Event hooks:
```python
class ObservabilityEvent(TypedDict):
    event: str        # "request", "response", "tool_call", "rag_retrieve"
    tenant_id: str
    session_id: str
    latency_ms: float
    tokens_used: int
    timestamp: str

class ObservabilityBackend(Protocol):
    def emit(self, event: ObservabilityEvent) -> None: ...

class LoggingObservabilityBackend:   # default — structured JSON logs
    ...
class PrometheusObservabilityBackend:  # metrics
    ...
```

**`core/security.py`** — Auth + guardrails:
```python
class SecurityLayer:
    def verify_api_key(self, key: str) -> str: ...         # returns tenant_id
    def enforce_rate_limit(self, tenant_id: str) -> bool: ...
    def sanitize_input(self, message: str) -> str: ...     # basic injection guard
```

**`connectors/`** — Knowledge source connectors:
```python
class KnowledgeConnector(Protocol):
    def fetch_documents(self) -> list[Document]: ...

class FileSystemConnector:    # current behavior
class SharePointConnector:    # new
class ConfluenceConnector:    # new
class JiraConnector:          # new
class DatabaseConnector:      # new
class RestApiConnector:       # new
```

---

## 7. Package Structure — Target State

```
universal-agent/
│
├── config/
│   ├── agent.config.yaml          ← default config (what exists today)
│   ├── examples/
│   │   ├── banking.yaml           ← example: banking domain
│   │   ├── hr.yaml                ← example: HR domain
│   │   ├── healthcare.yaml        ← example: healthcare domain
│   │   └── devops.yaml            ← example: DevOps / RunbookAI style
│
├── core/                          ← Engine — pure Python, no HTTP, no UI
│   ├── __init__.py
│   ├── agent.py                   ← LangGraph brain (extend with modes)
│   ├── config_loader.py           ← Pydantic models (extend fields)
│   ├── registry.py                ← AgentRegistry — multi-tenant [NEW]
│   ├── llm.py                     ← LLM factory (add DeepSeek, Grok, Llama)
│   ├── memory.py                  ← MemoryBackend protocol + implementations
│   ├── knowledge.py               ← KnowledgePort + EmbeddingFactory
│   ├── tools.py                   ← Tool registry (keep + add more)
│   ├── streaming.py               ← SSE/WebSocket streaming [NEW]
│   ├── observability.py           ← ObservabilityBackend protocol [NEW]
│   └── security.py                ← Auth + rate limit + input guard [NEW]
│
├── connectors/                    ← Knowledge source plugins [NEW]
│   ├── __init__.py
│   ├── base.py                    ← KnowledgeConnector Protocol
│   ├── filesystem.py              ← current behavior extracted here
│   ├── sharepoint.py
│   ├── confluence.py
│   ├── jira.py
│   ├── database.py
│   └── rest_api.py
│
├── adapters/                      ← Framework integration (keep + extend)
│   ├── fastapi_adapter.py         ← extend: tenant routing, streaming, auth
│   ├── django_adapter.py          ← [NEW]
│   ├── flask_adapter.py           ← [NEW]
│   ├── grpc_adapter.py            ← [NEW]
│   ├── react_adapter.tsx          ← keep
│   ├── angular_adapter.ts         ← keep
│   ├── vue_adapter.ts             ← [NEW]
│   └── widget/
│       ├── demo.html              ← keep
│       ├── voice_widget.js        ← [NEW] voice presentation layer
│       └── mobile_sdk.js          ← [NEW] mobile presentation layer
│
├── api/
│   ├── main.py                    ← standalone server
│   ├── routes/
│   │   ├── chat.py                ← chat + streaming endpoints
│   │   ├── admin.py               ← knowledge base management [NEW]
│   │   ├── tenants.py             ← tenant management [NEW]
│   │   └── health.py              ← health + metrics
│   └── middleware/
│       ├── auth.py                ← JWT / API key verification [NEW]
│       ├── rate_limit.py          ← enforce rate limits [NEW]
│       └── observability.py       ← request tracing [NEW]
│
├── sdk/
│   ├── universal-agent.js         ← keep — vanilla JS
│   ├── universal-agent.min.js     ← [NEW] minified for production
│   └── types.d.ts                 ← [NEW] TypeScript definitions
│
├── tests/
│   ├── test_agent.py              ← keep all 20 tests
│   ├── test_registry.py           ← multi-tenant tests [NEW]
│   ├── test_memory_backends.py    ← Redis, Postgres backends [NEW]
│   ├── test_streaming.py          ← SSE stream tests [NEW]
│   ├── test_security.py           ← auth + rate limit tests [NEW]
│   ├── test_connectors.py         ← connector tests [NEW]
│   └── fixtures/
│       └── configs/               ← test yaml configs
│
├── knowledge/                     ← keep
├── tools/                         ← keep
├── requirements.txt               ← extend with new optional groups
├── Dockerfile                     ← keep
├── docker-compose.yml             ← extend for Redis sidecar
├── ARCHITECTURE.md                ← this file
├── PLATFORM_DESIGN.md             ← detailed platform design
└── ROADMAP.md                     ← phased implementation plan
```

---

## 8. Configuration Architecture — Multi-Tenant

### 8.1 Tenant config structure

```yaml
# config/tenants/banking.yaml — tenant-specific, never touches core

agent:
  name: "BankBot"
  mode: "react"              # NEW field: react | plan_execute | supervisor | workflow
  persona: |
    You are a banking assistant for National Bank.
    You help customers with account queries, transfers, and loan information.
    Never provide specific financial advice. Always recommend speaking to an advisor.
  language: "en"
  fallback_message: "For account security, please contact 1800-BANK-HELP."

llm:
  provider: "openai"
  model: "gpt-4o"
  api_key_env: "OPENAI_API_KEY"

memory:
  backend: "redis"           # NEW field: in_process | redis | postgres
  redis_url_env: "REDIS_URL"
  max_history: 10
  session_ttl_seconds: 1800

knowledge_base:
  enabled: true
  vector_store: "faiss"
  embedding_provider: "openai"    # NEW field: decoupled from LLM provider
  embedding_model: "text-embedding-3-small"
  connectors:                     # NEW: list of connectors
    - type: "filesystem"
      source_dir: "./knowledge/banking"
    - type: "confluence"
      space_key: "BANK_INTERNAL"
      url_env: "CONFLUENCE_URL"
      token_env: "CONFLUENCE_TOKEN"

tools:
  calculator: { enabled: true }
  datetime:   { enabled: true }
  custom_tools:
    enabled: true
    module_path: "./tools/banking_tools.py"  # check_balance, transfer, etc.

security:
  require_api_key: true
  rate_limit:
    requests_per_minute: 30
    burst: 5
  input_max_length: 2000
  blocked_patterns:             # NEW: domain-specific injection guards
    - "ignore previous instructions"
    - "act as"

observability:
  backend: "prometheus"         # NEW: logging | prometheus | datadog
  track_token_usage: true
  track_latency: true
```

### 8.2 Platform-level config (one per deployment)

```yaml
# config/platform.yaml — controls the platform itself, not agents

platform:
  multi_tenant: true
  tenant_config_dir: "./config/tenants"  # one .yaml per tenant
  default_tenant: "default"

auth:
  mode: "api_key"            # api_key | jwt | oauth2
  api_keys_env: "PLATFORM_API_KEYS"  # comma-separated: tenant_id:key pairs

server:
  host: "0.0.0.0"
  port: 8000
  cors_origins: ["*"]
```

---

## 9. Plugin Architecture — Contracts

Every pluggable component follows the same pattern:
1. A `Protocol` class defines the contract
2. Concrete implementations satisfy the protocol
3. A `build_*()` factory reads config and returns the right implementation
4. The agent brain depends only on the protocol, never the implementation

### 9.1 Memory backend contract

```python
class MemoryBackend(Protocol):
    def get_history(self, session_id: str) -> list[BaseMessage]: ...
    def append_turn(self, session_id: str, human: str, ai: str) -> None: ...
    def clear(self, session_id: str) -> None: ...
    def active_sessions(self) -> int: ...
```

### 9.2 Knowledge connector contract

```python
class KnowledgeConnector(Protocol):
    def fetch_documents(self) -> list[Document]: ...
    def supports_incremental(self) -> bool: ...     # can add docs without full rebuild
    def health_check(self) -> bool: ...             # is the source reachable?
```

### 9.3 Embedding provider contract

```python
class EmbeddingProvider(Protocol):
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    def embed_query(self, text: str) -> list[float]: ...
```

### 9.4 Observability backend contract

```python
class ObservabilityBackend(Protocol):
    def on_request(self, tenant_id: str, session_id: str, message: str) -> None: ...
    def on_response(self, tenant_id: str, latency_ms: float, tokens: int) -> None: ...
    def on_tool_call(self, tool_name: str, input: str, output: str) -> None: ...
    def on_rag_retrieve(self, query: str, chunks_found: int) -> None: ...
    def on_error(self, error: Exception, context: dict) -> None: ...
```

### 9.5 Security contract

```python
class SecurityBackend(Protocol):
    def authenticate(self, request: Request) -> str: ...  # returns tenant_id
    def check_rate_limit(self, tenant_id: str) -> bool: ...
    def sanitize_input(self, message: str) -> str: ...
```

---

## 10. Multi-Tenant Architecture

### 10.1 Request flow with multi-tenancy

```
HTTP POST /agent/chat
    Header: X-Tenant-ID: banking
    Header: X-API-Key: key_abc123
    Body: { "message": "...", "session_id": "..." }
    │
    ▼
Auth Middleware
    ├── Verify API key → resolve tenant_id = "banking"
    └── If invalid → 401
    │
    ▼
Rate Limit Middleware
    ├── Check tenant "banking" request rate
    └── If exceeded → 429
    │
    ▼
AgentRegistry.get_or_create("banking", "config/tenants/banking.yaml")
    ├── If not loaded → load config, build agent, cache it
    └── Returns UniversalAgent for "banking" tenant
    │
    ▼
UniversalAgent("banking").chat(session_id, message)
    ├── Uses banking's LLM (OpenAI GPT-4o)
    ├── Uses banking's memory (Redis, namespaced by tenant)
    ├── Uses banking's knowledge (banking FAQs + Confluence)
    └── Uses banking's tools (check_balance, transfer)
    │
    ▼
Observability.on_response(tenant_id="banking", latency_ms=820, tokens=312)
    │
    ▼
Response
```

### 10.2 Memory isolation between tenants

```python
# Redis key pattern: {tenant_id}:{session_id}
# banking:session_abc → banking customer's history
# hr:session_xyz      → HR platform user's history
# Never overlap. Tenant cannot read another tenant's session.
```

---

## 11. Security Architecture

### Layer 1 — Transport
- HTTPS enforced (TLS termination at load balancer or nginx)
- CORS configured per tenant, not wildcard in production

### Layer 2 — Authentication
- API key per tenant (header `X-API-Key`)
- Optional JWT for user-level sessions
- Keys stored hashed, never in plaintext

### Layer 3 — Rate limiting
- Per-tenant, per-minute limits from config
- In-memory (token bucket) for single instance
- Redis-backed for multi-instance

### Layer 4 — Input sanitization
- Max message length enforced before LLM call
- Configurable blocked patterns per tenant
- System prompt injection patterns rejected

### Layer 5 — Output validation
- Configurable content filters on LLM output
- PII detection before returning to client (optional per tenant)

---

## 12. What This Is NOT

To stay focused:

- **Not a model training platform** — inference only
- **Not a data pipeline** — document ingestion only at startup or via admin API
- **Not a workflow orchestration engine** (like Airflow) — agent workflows only
- **Not a chatbot builder with drag-and-drop UI** — developer-first, config-driven
- **Not a managed cloud service** — self-hosted, bring your own cloud

The goal is: **drop this into any stack, configure once, get a production AI agent.**
That requires zero platform-specific dependencies in the core engine.
