# Universal AI Agent Platform — Implementation Roadmap

---

## Phases Overview

| Phase | Name | Duration | What ships |
|-------|------|----------|-----------|
| 1 | Foundation Fixes | 1 week | Memory backends, embedding factory, streaming, basic auth |
| 2 | Multi-Tenancy | 1 week | AgentRegistry, tenant routing, tenant configs, session isolation |
| 3 | Enterprise Knowledge | 1 week | Connector system, Confluence/SharePoint/DB connectors, hot reload |
| 4 | Agent Modes | 1 week | Plan+Execute, Supervisor, Human-in-loop graph topologies |
| 5 | Observability & Security | 1 week | Structured events, cost tracking, full security layer, admin API |
| 6 | Platform Polish | 1 week | Vue adapter, more LLM providers, domain config examples, docs |

---

## Phase 1 — Foundation Fixes (Week 1)

**Goal:** Fix the 3 critical gaps that block any production deployment.

### 1.1 MemoryBackend protocol

**File:** `core/memory.py`

Replace the hardcoded dict with a protocol + factory:

```python
# NEW: protocol
class MemoryBackend(Protocol):
    def get_history(self, session_id: str) -> list[BaseMessage]: ...
    def append_turn(self, session_id: str, human: str, ai: str) -> None: ...
    def clear(self, session_id: str) -> None: ...
    def active_sessions(self) -> int: ...

# KEPT: current behavior becomes InProcessMemoryBackend
class InProcessMemoryBackend:
    # exact same code as current MemoryStore — zero behavior change
    ...

# NEW: Redis backend
class RedisMemoryBackend:
    def __init__(self, cfg: MemoryConfig):
        import redis
        self._r = redis.from_url(os.environ.get(cfg.redis_url_env, "redis://localhost:6379"))
        self._cfg = cfg

    def get_history(self, session_id: str) -> list[BaseMessage]:
        raw = self._r.lrange(f"session:{session_id}:messages", 0, -1)
        return [deserialize_message(m) for m in raw]

    def append_turn(self, session_id: str, human: str, ai: str) -> None:
        key = f"session:{session_id}:messages"
        self._r.rpush(key, serialize(HumanMessage(human)), serialize(AIMessage(ai)))
        self._r.ltrim(key, -self._cfg.max_history * 2, -1)
        self._r.expire(key, self._cfg.session_ttl_seconds)

# NEW: factory
def build_memory(cfg: MemoryConfig) -> MemoryBackend:
    if cfg.backend == "redis":   return RedisMemoryBackend(cfg)
    if cfg.backend == "postgres": return PostgresMemoryBackend(cfg)
    return InProcessMemoryBackend(cfg)  # default — zero breaking change
```

Config change (backwards-compatible — `backend` defaults to `in_process`):
```yaml
memory:
  backend: "in_process"   # or "redis" or "postgres"
  max_history: 20
  session_ttl_seconds: 3600
  # only needed if backend: "redis"
  redis_url_env: "REDIS_URL"
```

**Tests:** All existing 20 tests pass unchanged. Add `test_memory_backends.py` with Redis mocked.

---

### 1.2 Embedding provider factory

**File:** `core/knowledge.py`

```python
# BEFORE (line 67 — hardcoded)
embeddings = AnthropicEmbeddings(model="voyage-3")

# AFTER — factory
def build_embeddings(cfg: KnowledgeBaseConfig):
    provider = getattr(cfg, 'embedding_provider', 'anthropic')
    model    = getattr(cfg, 'embedding_model', 'voyage-3')

    if provider == "anthropic":
        from langchain_anthropic import AnthropicEmbeddings
        return AnthropicEmbeddings(model=model)
    if provider == "openai":
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(model=model)
    if provider == "huggingface":
        from langchain_huggingface import HuggingFaceEmbeddings
        return HuggingFaceEmbeddings(model_name=model)
    if provider == "ollama":
        from langchain_ollama import OllamaEmbeddings
        return OllamaEmbeddings(model=model)
    # default: anthropic (backwards compatible)
    from langchain_anthropic import AnthropicEmbeddings
    return AnthropicEmbeddings(model="voyage-3")
```

Config change (backwards-compatible):
```yaml
knowledge_base:
  embedding_provider: "anthropic"   # new field — defaults to anthropic
  embedding_model: "voyage-3"       # new field — defaults to voyage-3
```

---

### 1.3 SSE Streaming

**File:** `core/agent.py` — add `stream()` method  
**File:** `adapters/fastapi_adapter.py` — add `/agent/stream` endpoint

```python
# core/agent.py — new method
async def stream(self, session_id: str, user_message: str):
    """Yield (event_type, data) tuples as the agent processes."""
    history = self._memory.get_history(session_id)
    context = self._retrieve_context(user_message) if self._retriever else ""

    input_messages = self._build_input_messages(history, context, user_message)
    full_response = []

    async for chunk in self._llm.astream(input_messages):
        token = chunk.content
        if token:
            full_response.append(token)
            yield ("token", token)

    ai_response = "".join(full_response)
    self._memory.append_turn(session_id, user_message, ai_response)
    yield ("done", {"total_tokens": len(ai_response.split())})
```

```python
# adapters/fastapi_adapter.py — new endpoint
from fastapi.responses import StreamingResponse

@app.get(f"{prefix}/stream", tags=["Agent"])
async def stream_chat(message: str, session_id: Optional[str] = None):
    """Stream agent response as Server-Sent Events."""
    sid = session_id or str(uuid.uuid4())

    async def event_generator():
        yield f"data: {json.dumps({'session_id': sid})}\n\n"
        async for event_type, data in _agent_instance.stream(sid, message):
            if event_type == "token":
                yield f"data: {json.dumps({'token': data})}\n\n"
            elif event_type == "done":
                yield f"data: {json.dumps({'event': 'done', **data})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

---

### 1.4 Basic auth + enforced rate limiting

**File:** `core/security.py` (new)

```python
class SecurityLayer:
    def __init__(self, cfg: SecurityConfig):
        self._cfg = cfg
        self._buckets: dict[str, TokenBucket] = {}  # per-tenant rate limit

    def verify_api_key(self, key: str) -> Optional[str]:
        """Returns tenant_id if key is valid, None if invalid."""
        for tenant_id, hashed in self._key_store.items():
            if hmac.compare_digest(sha256(key), hashed):
                return tenant_id
        return None

    def check_rate_limit(self, tenant_id: str) -> bool:
        """Returns True if request is allowed."""
        bucket = self._buckets.setdefault(tenant_id, TokenBucket(self._cfg.requests_per_minute))
        return bucket.consume()

    def sanitize_input(self, message: str, blocked_patterns: list[str]) -> str:
        for pattern in blocked_patterns:
            if pattern.lower() in message.lower():
                raise ValueError(f"Input blocked: matched restricted pattern")
        if len(message) > self._cfg.input_max_length:
            raise ValueError(f"Input too long: max {self._cfg.input_max_length} chars")
        return message.strip()
```

Middleware in `adapters/fastapi_adapter.py`:
```python
@app.middleware("http")
async def security_middleware(request: Request, call_next):
    if request.url.path.startswith(prefix) and request.url.path != f"{prefix}/health":
        api_key = request.headers.get("X-API-Key")
        if cfg.security.require_api_key:
            if not api_key or not _security.verify_api_key(api_key):
                return JSONResponse({"error": "Unauthorized"}, status_code=401)
        # rate limit check
        tenant_id = request.headers.get("X-Tenant-ID", "default")
        if not _security.check_rate_limit(tenant_id):
            return JSONResponse({"error": "Rate limit exceeded"}, status_code=429)
    return await call_next(request)
```

---

### Phase 1 Deliverables checklist

- [ ] `core/memory.py` — MemoryBackend protocol + InProcess + Redis backends
- [ ] `core/knowledge.py` — EmbeddingFactory (anthropic/openai/huggingface/ollama)
- [ ] `core/agent.py` — `stream()` async generator
- [ ] `core/security.py` — SecurityLayer (auth + rate limit + input guard)
- [ ] `adapters/fastapi_adapter.py` — `/agent/stream` SSE endpoint + security middleware
- [ ] `config/agent.config.yaml` — add `memory.backend`, `knowledge_base.embedding_provider`
- [ ] `tests/test_memory_backends.py` — Redis backend tests (mocked)
- [ ] `tests/test_streaming.py` — SSE stream tests
- [ ] `tests/test_security.py` — auth + rate limit tests
- [ ] All existing 20 tests still pass (zero regression)

---

## Phase 2 — Multi-Tenancy (Week 2)

**Goal:** One runtime serves multiple domains with full isolation.

### 2.1 AgentRegistry

**File:** `core/registry.py` (new)

```python
class AgentRegistry:
    """Thread-safe registry of per-tenant agent instances."""

    def __init__(self, config_dir: str):
        self._config_dir = Path(config_dir)
        self._instances: dict[str, UniversalAgent] = {}
        self._lock = threading.Lock()

    def get(self, tenant_id: str) -> Optional[UniversalAgent]:
        return self._instances.get(tenant_id)

    def get_or_create(self, tenant_id: str) -> UniversalAgent:
        if tenant_id not in self._instances:
            with self._lock:
                if tenant_id not in self._instances:   # double-checked locking
                    config_path = self._config_dir / f"{tenant_id}.yaml"
                    if not config_path.exists():
                        config_path = self._config_dir / "default.yaml"
                    cfg = load_config(config_path)
                    self._instances[tenant_id] = UniversalAgent(cfg)
        return self._instances[tenant_id]

    def load_all(self) -> None:
        """Pre-load all tenant configs at startup."""
        for yaml_file in self._config_dir.glob("*.yaml"):
            tenant_id = yaml_file.stem
            self.get_or_create(tenant_id)

    def list_tenants(self) -> list[str]:
        return list(self._instances.keys())
```

### 2.2 Tenant routing in FastAPI adapter

```python
# Request: POST /agent/chat  Header: X-Tenant-ID: banking
# OR:      POST /banking/agent/chat

@app.post(f"{prefix}/chat")
async def chat(request: ChatRequest, x_tenant_id: str = Header(default="default")):
    agent = _registry.get_or_create(x_tenant_id)
    session_id = f"{x_tenant_id}-{request.session_id or uuid4()}"
    response = agent.chat(session_id, request.message)
    return ChatResponse(session_id=session_id, message=response, agent_name=agent.name)
```

### 2.3 Domain config examples

Create `config/tenants/` with:
- `banking.yaml` — banking assistant
- `hr.yaml` — HR platform
- `healthcare.yaml` — patient support
- `devops.yaml` — incident response
- `default.yaml` — fallback

### Phase 2 Deliverables checklist

- [ ] `core/registry.py` — AgentRegistry with thread-safe lazy loading
- [ ] `adapters/fastapi_adapter.py` — tenant routing via header/path
- [ ] `config/tenants/*.yaml` — 5 domain example configs
- [ ] `tests/test_registry.py` — multi-tenant isolation tests
- [ ] Memory isolation verified: tenant A cannot read tenant B sessions

---

## Phase 3 — Enterprise Knowledge Connectors (Week 3)

**Goal:** Any knowledge source pluggable without core code changes.

### 3.1 Connector protocol

**File:** `connectors/base.py` (new)

```python
class KnowledgeConnector(Protocol):
    def fetch_documents(self) -> list[Document]: ...
    def supports_incremental(self) -> bool: ...
    def health_check(self) -> bool: ...

def build_connectors(cfg: KnowledgeBaseConfig) -> list[KnowledgeConnector]:
    connectors = []
    for conn_cfg in cfg.connectors:
        t = conn_cfg["type"]
        if t == "filesystem":  connectors.append(FileSystemConnector(conn_cfg))
        if t == "confluence":  connectors.append(ConfluenceConnector(conn_cfg))
        if t == "sharepoint":  connectors.append(SharePointConnector(conn_cfg))
        if t == "jira":        connectors.append(JiraConnector(conn_cfg))
        if t == "database":    connectors.append(DatabaseConnector(conn_cfg))
        if t == "rest_api":    connectors.append(RestApiConnector(conn_cfg))
    return connectors
```

### 3.2 Individual connectors

- `connectors/filesystem.py` — extracted from current `knowledge.py` (no behavior change)
- `connectors/confluence.py` — Confluence Cloud REST API
- `connectors/sharepoint.py` — Microsoft Graph API
- `connectors/jira.py` — Jira REST API (issues as documents)
- `connectors/database.py` — SQL query → documents
- `connectors/rest_api.py` — generic JSON endpoint → documents

### 3.3 Hot reload admin API

```python
# POST /admin/tenants/{tenant_id}/knowledge/reload
# Fetches documents from all connectors, rebuilds vector index, no restart needed

@app.post("/admin/tenants/{tenant_id}/knowledge/reload")
async def reload_knowledge(tenant_id: str, api_key: str = Header(...)):
    agent = _registry.get(tenant_id)
    await agent.reload_knowledge()  # re-fetches, re-indexes, hot-swaps retriever
    return {"status": "reloaded", "tenant": tenant_id}
```

### Phase 3 Deliverables checklist

- [ ] `connectors/base.py` — KnowledgeConnector protocol + factory
- [ ] `connectors/filesystem.py` — extracted from knowledge.py
- [ ] `connectors/confluence.py` — Confluence connector
- [ ] `connectors/sharepoint.py` — SharePoint connector
- [ ] `connectors/database.py` — SQL connector
- [ ] `connectors/rest_api.py` — REST API connector
- [ ] `core/knowledge.py` — updated to use connector list
- [ ] `api/routes/admin.py` — knowledge hot-reload endpoint
- [ ] `tests/test_connectors.py` — connector tests (all mocked)

---

## Phase 4 — Agent Execution Modes (Week 4)

**Goal:** Different graph topologies per config. No agent mode hardcoded.

### 4.1 Mode config field

```yaml
agent:
  mode: "react"   # react | plan_execute | supervisor | workflow | human_in_loop
```

### 4.2 Graph builders per mode

```python
# core/agent.py
def _build_graph(self) -> CompiledGraph:
    mode = self._cfg.agent.mode
    builders = {
        "react":         self._build_react_graph,
        "plan_execute":  self._build_plan_execute_graph,
        "supervisor":    self._build_supervisor_graph,
        "workflow":      self._build_workflow_graph,
        "human_in_loop": self._build_human_in_loop_graph,
    }
    builder_fn = builders.get(mode, self._build_react_graph)
    return builder_fn()
```

### Phase 4 Deliverables checklist

- [ ] `agent.mode` config field with default `react` (backwards compatible)
- [ ] `_build_react_graph()` — extracted from current `_build_graph()`
- [ ] `_build_plan_execute_graph()` — planner → executor[] → synthesizer
- [ ] `_build_supervisor_graph()` — supervisor + configurable sub-agents
- [ ] `_build_human_in_loop_graph()` — with `interrupt_before` support
- [ ] `tests/test_agent_modes.py` — one test per mode (mocked)

---

## Phase 5 — Observability & Security (Week 5)

**Goal:** Full production-grade operations visibility and security hardening.

### 5.1 Observability events

```python
# core/observability.py

@dataclass
class AgentEvent:
    event: str
    tenant_id: str
    session_id: str
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

@dataclass
class RequestEvent(AgentEvent):
    event: str = "request"
    message_length: int = 0

@dataclass
class ResponseEvent(AgentEvent):
    event: str = "response"
    latency_ms: float = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0

@dataclass
class ToolCallEvent(AgentEvent):
    event: str = "tool_call"
    tool_name: str = ""
    latency_ms: float = 0
    success: bool = True
```

### 5.2 Admin API

```
GET  /admin/tenants                           → list all tenants
GET  /admin/tenants/{id}/usage?from=&to=      → usage stats
GET  /admin/tenants/{id}/health               → agent health
POST /admin/tenants/{id}/knowledge/reload     → hot reload knowledge
POST /admin/tenants                           → register new tenant
DELETE /admin/tenants/{id}                    → remove tenant
```

### Phase 5 Deliverables checklist

- [ ] `core/observability.py` — event types + StructuredLogBackend
- [ ] Agent emits events at request/response/tool_call/rag_retrieve
- [ ] `api/routes/admin.py` — full admin API
- [ ] `api/middleware/auth.py` — JWT + API key support
- [ ] `api/middleware/rate_limit.py` — Redis-backed rate limiter
- [ ] Cost tracking: token usage × model price table → cost_usd per request
- [ ] `tests/test_observability.py`
- [ ] `tests/test_security.py` — full security layer

---

## Phase 6 — Platform Polish (Week 6)

**Goal:** Production-ready for real enterprise deployments.

### Deliverables checklist

- [ ] `adapters/vue_adapter.ts` — Vue 3 composable
- [ ] `adapters/widget/voice_widget.js` — voice presentation layer (Web Speech API)
- [ ] `sdk/universal-agent.min.js` — minified JS for production
- [ ] `sdk/types.d.ts` — TypeScript definitions
- [ ] `core/llm.py` — add DeepSeek, Grok, AWS Bedrock providers
- [ ] `docker-compose.yml` — updated with Redis sidecar
- [ ] `config/tenants/` — 5 complete domain example configs
- [ ] README updated with multi-tenant quickstart
- [ ] ARCHITECTURE.md and PLATFORM_DESIGN.md finalized
- [ ] End-to-end integration test: banking tenant + HR tenant on same runtime

---

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Redis backend breaks existing in-process tests | Low | Medium | Factory defaults to in_process — zero behavior change |
| LangGraph API changes between versions | Medium | High | Pin langgraph version, wrap in adapter |
| Embedding provider API key needed for tests | Medium | Medium | Mock embeddings in tests — same pattern as LLM mocks |
| Multi-tenant registry memory leak | Low | High | WeakRef or TTL-based eviction on inactive tenants |
| Streaming SSE disconnects mid-response | Medium | Low | Client-side reconnection + partial response cache |
| Connector credentials in config files | Medium | High | All credentials via env vars — never in YAML |
| Plan+Execute mode loops infinitely | Low | High | Max iterations cap in config + timeout |
| Hot reload rebuilds vector index under load | Low | Medium | Blue/green swap — build new index, then atomically swap |

---

## Migration Strategy — Zero Breaking Changes

Every phase is designed so existing integrations keep working:

1. **Phase 1 memory change**: `MemoryConfig.backend` defaults to `in_process` — current behavior unchanged unless you add `backend: redis`

2. **Phase 1 embedding change**: `embedding_provider` defaults to `anthropic/voyage-3` — same as today

3. **Phase 1 auth**: `security.require_api_key` defaults to `false` — no auth required unless enabled

4. **Phase 2 multi-tenancy**: Single-tenant mode still works. Registry just holds one tenant (`default`). Header `X-Tenant-ID` optional, defaults to `default`.

5. **Phase 3 connectors**: `knowledge_base.connectors` list is new. Falls back to `source_dir` if list absent — current behavior preserved.

6. **Phase 4 agent modes**: `agent.mode` defaults to `react` — current graph topology unchanged.

**Every change is additive, opt-in, and backwards-compatible.**  
The 20 existing tests must pass green after every phase. No exceptions.

---

## Definition of "Platform Ready"

The platform is ready when a new domain can be deployed by:

1. Creating one YAML file in `config/tenants/`
2. Setting environment variables for API keys
3. Restarting (or calling the hot-reload API)

Zero Python code written. Zero core files modified. Zero tests broken.

That is the "WordPress for AI Agents" benchmark.
