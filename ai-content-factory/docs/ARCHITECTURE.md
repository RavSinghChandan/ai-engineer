# AI Content Factory — System Architecture

> **Status:** Milestone 1 — approved architecture baseline.
> **Scope:** Local-first, production-quality, SaaS-ready. No deployment concerns yet.

---

## 1. Architectural Style

**Modular Monolith with Hexagonal (Ports & Adapters) boundaries, Clean Architecture layering, and DDD tactical patterns.**

One FastAPI application + one background worker process, both importing the same
codebase, with strict inward-pointing dependencies:

```
        API / Presentation          (FastAPI routers, WebSocket, schemas)
                 │
        Application Layer           (use cases, ports, DTOs, orchestration)
                 │
           Domain Layer             (entities, value objects, domain events)
                 ▲
        Infrastructure Layer        (adapters: DB, Redis, Qdrant, LLMs, TTS,
                                     avatar, FFmpeg, storage — implements ports)
```

- **Domain** depends on nothing.
- **Application** depends only on Domain. It defines *ports* (Python `Protocol` /
  ABC interfaces) for every external capability.
- **Infrastructure** implements those ports. Swapping DeepSeek → Claude, or
  ElevenLabs → OpenAI TTS, touches only this layer.
- **API** wires everything together via a DI container and translates HTTP/WS
  ↔ application DTOs. No business logic.

### Why a modular monolith (not microservices)

| Concern | Decision |
|---|---|
| Team size | Solo → small team. Microservices tax (network, contracts, ops) has no payoff. |
| SaaS future | Bounded contexts are already module boundaries; any module can be extracted to a service later without rewriting business logic. |
| Local-first | One `docker compose up` runs everything. |

---

## 2. System Context (C4 Level 1)

```
┌─────────────┐   REST + WebSocket   ┌──────────────────────────────────────┐
│  Angular 20 │◄────────────────────►│         FastAPI Application          │
│  Dashboard  │                      │  (auth, projects, agents, videos…)   │
└─────────────┘                      └───────┬──────────────────────┬───────┘
                                             │ enqueue jobs         │ pub/sub
                                             ▼                      ▼
                                     ┌───────────────┐      ┌──────────────┐
                                     │  ARQ Worker   │◄────►│    Redis     │
                                     │ (LangGraph    │      │ queue+cache+ │
                                     │  pipelines)   │      │ pubsub       │
                                     └───┬───────┬───┘      └──────────────┘
                    ports/adapters       │       │
        ┌────────────┬───────────┬───────┘       └──────┬───────────┐
        ▼            ▼           ▼                      ▼           ▼
  ┌──────────┐ ┌──────────┐ ┌─────────┐          ┌───────────┐ ┌────────┐
  │ LLM APIs │ │ TTS APIs │ │ Avatar  │          │ PostgreSQL│ │ Qdrant │
  │ DeepSeek │ │ElevenLabs│ │ HeyGen  │          │ (system of│ │(vector │
  │ OpenAI…  │ │ OpenAI   │ │Synthesia│          │  record)  │ │ memory)│
  └──────────┘ └──────────┘ └─────────┘          └───────────┘ └────────┘
                                 │
                                 ▼
                          ┌────────────┐   local filesystem volume
                          │   FFmpeg   │──► media/ (audio, video, thumbs)
                          └────────────┘
```

---

## 3. Bounded Contexts (DDD Strategic Design)

| Context | Responsibility | Key Aggregates |
|---|---|---|
| **Identity** | Users, auth, roles, refresh tokens | `User` |
| **Content Production** | The video pipeline: projects, jobs, scripts, assets | `Project`, `VideoJob`, `Script` |
| **Agent Platform** | Agent definitions, runs, prompts, model routing | `AgentDefinition`, `AgentRun`, `Prompt` |
| **Knowledge** | Research corpus, embeddings, retrieval | `KnowledgeItem` |
| **Analytics** | Execution metrics, content performance, learning feedback | `AnalyticsEvent` |

Each context is a Python package with its own domain/application/infrastructure
slices. Cross-context communication happens through application-layer services
and domain events — never by importing another context's internals.

---

## 4. The Provider Abstraction Layer (core requirement)

Every external dependency is a **port** in the application layer:

```python
# application/ports — illustrative signatures, not final code
class LLMPort(Protocol):
    async def complete(self, request: LLMRequest) -> LLMResponse: ...
    async def stream(self, request: LLMRequest) -> AsyncIterator[LLMChunk]: ...

class TTSPort(Protocol):
    async def synthesize(self, request: TTSRequest) -> AudioAsset: ...

class AvatarPort(Protocol):
    async def render(self, request: AvatarRequest) -> AvatarJobHandle: ...
    async def poll(self, handle: AvatarJobHandle) -> AvatarJobStatus: ...

class VectorStorePort(Protocol): ...
class ObjectStoragePort(Protocol): ...   # local FS now, S3-compatible later
class VideoComposerPort(Protocol): ...   # FFmpeg behind an interface too
```

**Adapters (infrastructure):**

| Port | Adapter 1 (default) | Adapter 2+ |
|---|---|---|
| `LLMPort` | DeepSeek | OpenAI, Gemini, Claude, Mistral |
| `TTSPort` | ElevenLabs | OpenAI TTS |
| `AvatarPort` | HeyGen | Synthesia |
| `VectorStorePort` | Qdrant | — |
| `ObjectStoragePort` | Local filesystem | S3-compatible (SaaS phase) |
| `VideoComposerPort` | FFmpeg subprocess | — |

**Model routing:** a `ModelRegistry` maps a *logical model role* (e.g.
`"script_writer"`, `"reviewer"`, `"seo"`) → concrete provider + model + params.
Agents request by role, never by provider name. Routing table lives in DB
(editable from Settings UI), with `.env` defaults. This is what makes
"swap providers without touching business logic" real: it's a data change,
not a code change.

**Failure policy:** every adapter wraps provider errors into typed domain
exceptions (`ProviderRateLimited`, `ProviderUnavailable`, `ProviderContentError`)
so use cases can retry/fallback uniformly. Retries with exponential backoff
live in a shared adapter mixin, not in agents.

---

## 5. Agent Architecture

An **agent** is a stateless class instantiated per run, with:

1. **Its own Pydantic state model** (input/output slice of the graph state —
   agents never read the whole graph state, only their declared slice).
2. **Dependencies injected as ports** (`LLMPort`, `VectorStorePort`, …) — an
   agent is unit-testable with fakes, no network.
3. **A DB-backed prompt** (`PromptRepository.get(agent=..., version=latest)`),
   editable in the UI, versioned, with variables validated against the state model.
4. **A uniform contract:**

```python
class Agent(Generic[TIn, TOut]):
    name: AgentName                      # enum — no magic strings
    async def run(self, input: TIn, ctx: AgentContext) -> TOut: ...
```

`AgentContext` carries run id, logger, model role resolution, cancellation
token, and an event emitter for progress. Agents emit structured
`AgentEvent`s (started / progress / token-stream / completed / failed) —
the same event stream drives DB persistence, WebSocket live logs, and analytics.

**Registry:** agents self-register in an `AgentRegistry` keyed by `AgentName`.
The workflow graph references agents only via the registry → any agent is
replaceable by registering a different implementation (satisfies
"replaceable" without touching the graph).

### Initial agent roster

Trend, Research, Knowledge, Script, Review, SEO, Thumbnail, Voice, Avatar,
Video, Publishing, Analytics, Learning — each in its own module under the
Agent Platform context, built one milestone at a time.

---

## 6. Workflow Orchestration (LangGraph)

The production pipeline is a **LangGraph `StateGraph`** with a single
Pydantic root state (`VideoProductionState`) composed of per-agent slices:

```
trend → research → knowledge → script → review ──(revise? loop→script)
      → seo → voice → avatar → video → thumbnail → metadata
      → preview → [interrupt: human approval] → publish
```

Key decisions:

- **Durable checkpointing:** LangGraph's `AsyncPostgresSaver`. Every node
  transition is checkpointed → crashed runs resume, and the Review/Approval
  human-in-the-loop steps are LangGraph **interrupts**, not custom polling.
- **Execution home:** graphs run inside the **ARQ worker**, never inside an
  HTTP request. The API enqueues `run_pipeline(job_id)` and returns 202.
- **Why ARQ over Celery:** the stack is 100% async; Celery's async story is
  bolted-on. ARQ is Redis-native, asyncio-native, small surface area. Trade-off:
  smaller ecosystem — acceptable because we need queue + retries + cron only.
- **Long-running externals** (HeyGen render can take minutes): the Avatar node
  submits, then polls with backoff inside the node; checkpoint after submit
  means a worker restart resumes polling, not re-submitting (idempotency key =
  `agent_run_id`).
- **Partial re-runs:** because state is checkpointed per node, "regenerate the
  thumbnail only" = restart the graph from that checkpoint with an override —
  no bespoke re-run code paths per agent.

---

## 7. Real-Time Progress (frontend live view)

```
Agent emits AgentEvent ──► Redis pub/sub channel  job:{id}:events
                                   │
                    FastAPI WebSocket /ws/jobs/{id} subscribes
                                   │
                    Angular signals store ◄── typed event stream
```

- **WebSocket, not SSE**, because the dashboard also *sends* (cancel, approve,
  live prompt edits) and one duplex channel is simpler than SSE + POST pairs.
- Redis pub/sub decouples worker ↔ API processes (they don't share memory).
- Events are also appended to `agent_run_events` (Postgres) → page refresh
  replays history, then continues live. **Fan-in rule:** on connect, client
  gets DB replay up to last event id, then live stream — no gaps, no dupes.

---

## 8. Data Architecture

### PostgreSQL (system of record — normalized)

Core tables (per bounded context, final DDL in Milestone 6):

- **identity:** `users`, `refresh_tokens`, `roles` (RBAC: `admin`, `creator`, `viewer`)
- **content:** `projects`, `video_jobs`, `scripts`, `script_versions`,
  `assets` (audio/video/thumbnail/captions rows pointing at storage keys)
- **agents:** `agent_definitions`, `agent_runs`, `agent_run_events`,
  `prompts`, `prompt_versions`, `model_routes`
- **analytics:** `analytics_events`, `video_metrics`

Rules: every table has UUID PK + `created_at`/`updated_at`; version tables are
append-only; media binaries never live in Postgres (storage keys only);
access exclusively via **Repository Pattern** + **Unit of Work** (one
transaction per use case).

### Qdrant (vector memory)

| Collection | Content | Used by |
|---|---|---|
| `research` | chunked research findings | Knowledge, Script agents |
| `knowledge` | curated long-term knowledge | Knowledge agent |
| `scripts` | past scripts (embedding + payload) | Script agent (style memory), Learning |
| `prompt_history` | prompt versions + outcomes | Learning agent |

Payload always includes `project_id`, `job_id`, `source` → filtered retrieval
per project (and per tenant, later).

### Redis

Job queue (ARQ) · pub/sub (events) · short-TTL cache (provider responses
where safe, e.g. trend data) · rate-limit counters.

### File storage

`media/{project_id}/{job_id}/…` behind `ObjectStoragePort`. Local volume now;
S3 adapter later with zero call-site changes.

---

## 9. API Surface (v1, `/api/v1`)

| Group | Endpoints (representative) |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` |
| Projects | CRUD `/projects`, `POST /projects/{id}/jobs` |
| Jobs/Videos | `GET /jobs/{id}`, `POST /jobs/{id}/cancel`, `POST /jobs/{id}/approve`, `POST /jobs/{id}/rerun/{agent}` |
| Agents | `GET /agents`, `GET /agents/{name}/runs` |
| Scripts | versioned read/edit `/scripts/{id}` |
| Prompts | CRUD + versions `/prompts` |
| Files | `GET /files/{asset_id}` (streamed), upload endpoints |
| Analytics | `GET /analytics/…` |
| Settings | model routes, provider keys status |
| Logs | `GET /jobs/{id}/events` (replay) |
| WS | `/ws/jobs/{id}` |

Conventions: Pydantic v2 request/response models only (no ORM leakage),
RFC-7807-style error envelope, cursor pagination, idempotency keys on job
creation.

---

## 10. Frontend Architecture (Angular 20)

- **Standalone components + signals** everywhere; zoneless-ready change detection.
- **Feature folders** mirroring backend contexts: `auth/`, `dashboard/`,
  `projects/`, `pipeline/` (live graph view), `scripts/`, `prompts/`,
  `settings/`, `analytics/`.
- **State:** signal stores per feature (`signal` + `computed`), no NgRx —
  trade-off: less boilerplate, sufficient for this app's state complexity;
  revisit only if cross-feature state graphs emerge.
- **Live pipeline view:** typed WebSocket service → `JobEventsStore` →
  animated agent-graph component (nodes = agents, status-colored, streaming
  logs drawer) — same pattern proven in AstroIntel.
- **Styling:** Angular Material for structure (tables, dialogs, forms) +
  Tailwind for layout/spacing; dark mode via Tailwind `dark` class strategy,
  Material theming aligned to the same palette.
- **Auth:** interceptor attaches access token, transparent refresh on 401,
  route guards by role.

---

## 11. Cross-Cutting Concerns

| Concern | Decision |
|---|---|
| **DI** | Constructor injection everywhere. FastAPI: a small composition root building adapters → use cases (Milestone 4 shows the mechanism; likely `dependency-injector` or hand-rolled providers — chosen then). |
| **Config** | `pydantic-settings`, one `Settings` object, `.env` / `.env.test` / `.env.prod`; secrets never in code; every magic value (model names, limits, paths) lives here or in DB. |
| **Logging** | `structlog`, JSON in worker/API, request-id + job-id + agent-run-id bound to every log line. |
| **Errors** | Domain exceptions → application maps → API translates to error envelope; provider errors typed (see §4). Global handlers, no bare `except`. |
| **Validation** | Pydantic v2 at every boundary (API in, agent state, adapter out). |
| **Testing** | Pytest (unit: domain + agents with fake ports; integration: repos against real Postgres via Docker, API via `httpx.AsyncClient`); Angular unit tests per component/store. |
| **Migrations** | Alembic, one revision per schema change, autogenerate + hand-review. |

---

## 12. Trade-offs Register

| Decision | Alternative | Why we chose it | Cost accepted |
|---|---|---|---|
| Modular monolith | Microservices | Solo dev, local-first; contexts keep extraction cheap later | Single deploy unit |
| ARQ | Celery / Dramatiq | Asyncio-native, Redis we already run | Smaller ecosystem |
| LangGraph + Postgres checkpointer | Hand-rolled orchestration | Durable resume, interrupts for approval, partial re-runs for free | LangGraph API coupling (isolated in one orchestration module) |
| WebSocket | SSE | Duplex (approve/cancel on same channel) | Slightly more connection handling |
| Signal stores | NgRx | App state is job/feature-scoped; less ceremony | Manual discipline on store boundaries |
| Prompts in DB | Prompts in files | Editable in UI, versioned, per-tenant later | Seed/migration path needed |
| Logical model roles in DB | Env-only provider config | Swap providers at runtime from Settings UI | One extra indirection |
| Poll-in-node for avatar renders | Webhook callbacks | Local-first (no public URL for webhooks) | Polling traffic; webhook adapter added in SaaS phase |

---

## 13. Milestone Map (how this architecture lands)

Each milestone delivers a vertical, reviewable slice of the above:
2 Folder structure → 3 Docker (Postgres, Redis, Qdrant, API, worker, frontend)
→ 4 FastAPI skeleton (layers + DI + logging + errors) → 5 Angular skeleton
→ 6 DB schema + repos + Alembic → 7 Auth → 8 LangGraph core (state, registry,
checkpointing, events) → 9+ agents one by one → 17–18 dashboard + realtime
→ 19–21 project management, testing, docs.
