# AI Content Factory

Multi-agent system that produces complete YouTube videos from a single topic:
**trend analysis → research → knowledge recall → script → review loop → SEO →
voice → thumbnail → video (with captions) → upload metadata + Shorts ideas** —
with live agent execution streaming to a dashboard.

**100% local-first.** No Docker, no cloud services required. SQLite, an
in-process event bus, and a local vector store stand in for PostgreSQL, Redis,
and Qdrant behind the same interfaces — switching later is configuration, not
code (see `docs/ARCHITECTURE.md`).

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI (async), Python 3.13, LangGraph, SQLAlchemy 2 + Alembic, Pydantic v2, structlog |
| LLM | DeepSeek (default) via provider-agnostic port — OpenAI/Claude/Gemini/Mistral pluggable |
| Voice | macOS `say` (offline default) or ElevenLabs (set a key) |
| Media | FFmpeg composition, Pillow thumbnails, generated SRT captions |
| Frontend | Angular 20, standalone components, signals, TailwindCSS v4, WebSocket live view |
| Auth | JWT access + rotating refresh tokens, RBAC roles |

## Run it

```bash
# 1. Backend (port 8000)
cd backend
python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time
cp .env.example .env    # fill DEEPSEEK_API_KEY                          # first time
.venv/bin/alembic upgrade head                                           # first time
.venv/bin/uvicorn app.main:app --port 8000

# 2. Frontend (port 4200)
cd frontend
npm install             # first time
npm start
```

Open **http://localhost:4200**, create an account, create a project, enter a
topic, and hit **Produce video**. Watch the agents run live; when the pipeline
finishes, preview the video/thumbnail/script and click **Approve**.

API docs: http://localhost:8000/docs

## Repository layout

```
backend/
  app/
    core/           config, logging, security, exceptions, DI container
    domain/         enums — the domain vocabulary
    db/             SQLAlchemy base, session, models (normalized schema)
    repositories/   repository pattern over all aggregates
    schemas/        Pydantic request/response DTOs
    services/       use cases (auth, bootstrap/seeding)
    providers/      ports.py + adapters: llm/ tts/ vector/ media/
    agents/         one class per agent + DB-seeded editable prompts
    orchestration/  LangGraph graph, pipeline runner, event broker
    api/            routers v1 + WebSocket
  alembic/          migrations
frontend/
  src/app/
    core/           api/auth/ws services, interceptor, guard, models
    features/       login, dashboard, project, job (live pipeline), prompts
docs/ARCHITECTURE.md  full architecture + trade-offs register
```

## Key design points

- **Every external capability is a port** (`providers/ports.py`): LLM, TTS,
  vector store, video composer, thumbnails. Agents receive ports — never SDKs.
- **Agents ask for a logical model role** (`script_writer`, `reviewer`…);
  the `ModelRegistry` maps roles to providers. Swapping DeepSeek → Claude is
  config, not code.
- **Prompts live in the database**, versioned, editable from the dashboard
  (Prompts page). Seeds in `agents/prompt_seeds.py` are only the v1 baseline.
- **Events are persisted AND broadcast**: refresh the job page mid-run and the
  log replays then continues live, gap-free (WebSocket `after_id` fan-in).
- **The review agent gates the script** — below the pass score it loops back
  to the script agent with feedback (budgeted, always terminates).
- **Creator Profiles make identity configurable**: a profile row holds a
  person's voice (provider + voice_id) and avatar (provider + avatar_id).
  Projects pick a profile; the pipeline resolves TTS/avatar per run. Training
  a new person = adding a profile in the dashboard — zero code changes.
  Avatar renders degrade gracefully to the slideshow video unless the profile
  marks the avatar as required.

## Scaling out later (DevOps)

`DATABASE_URL=postgresql+asyncpg://…` switches to Postgres; the Redis/Qdrant
adapters slot in behind the same ports; the pipeline runner is designed to be
lifted into an ARQ worker. See `docs/ARCHITECTURE.md` §8 and §12.
