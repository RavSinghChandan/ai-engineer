# Senior AI Engineer — Module 6
# Topic: Versioning — Models, Prompts, Embeddings, Data

---

## 1. Intuition

In traditional software, you version code. In AI systems, you version code, models, prompts, embeddings, and data — and any of them changing silently can break your system.

Senior engineers treat every AI artifact as a versioned, deployable unit with the same discipline as code.

---

## 2. Core Concept

### What Needs Versioning in an AI System

**Model version:**
`gpt-4o-2024-08-06` vs `gpt-4o` (auto-updated by provider).
Never use the auto-updated alias in production — pin to a specific dated version.
Model updates by providers are silent and can change output behavior.

**Prompt version:**
System prompts are logic. Changing a prompt changes system behavior.
Version prompts alongside code in the same repository.

**Embedding model version:**
`text-embedding-3-small` vs `text-embedding-ada-002`.
Changing the embedding model requires re-embedding ALL existing documents.
Mixing embeddings from different models in the same index breaks retrieval.

**Fine-tuned model version:**
`ft:gpt-4o-mini-2024-07-18:company::jobid1` vs `ft:gpt-4o-mini:company::jobid2`.
Treat like any software artifact — track in a model registry.

**Data version:**
Which documents are in the vector index? When were they last embedded?
Track document `last_embedded_at` and `embedding_model_version` in metadata.

---

## 3. Versioning Architecture

```
Repository structure:
  src/
    prompts/
      v1/
        qa_system_prompt.txt
        analysis_system_prompt.txt
      v2/
        qa_system_prompt.txt        ← improved version
        analysis_system_prompt.txt
    config/
      model_config.py               ← ACTIVE_MODEL, ACTIVE_PROMPT_VERSION
      
config/model_config.py:
  ACTIVE_LLM_MODEL = "gpt-4o-mini-2024-07-18"  # pinned, never auto-update alias
  ACTIVE_EMBEDDING_MODEL = "text-embedding-3-small"
  ACTIVE_PROMPT_VERSION = "v2"
  EMBEDDING_MODEL_VERSION = "3-small-v1"  # used to detect stale embeddings

Database:
  documents.embedding_model_version  → which model was used to embed
  documents.last_embedded_at          → when was this document last embedded
  prompt_versions table               → git history equivalent for prompts
  model_deployments table             → which model version is live in which environment
```

---

## 4. Code Skeleton (Production-Grade)

```python
# Model config — single source of truth
class ModelConfig:
    # NEVER use auto-updated aliases like "gpt-4o" in production
    LLM_MODEL = "gpt-4o-mini-2024-07-18"
    EMBEDDING_MODEL = "text-embedding-3-small"
    EMBEDDING_MODEL_VERSION = "text-embedding-3-small-v1"  # human-readable version tag
    PROMPT_VERSION = "v2"
    
    @classmethod
    def validate(cls):
        """Run at startup — fail fast if config is inconsistent"""
        assert cls.LLM_MODEL.count("-2024") or cls.LLM_MODEL.count("-2025"), \
            "LLM model must be a dated version, not an alias"

# Prompt versioning — load from files, never hardcoded in logic
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent / "prompts"

def load_prompt(task: str, version: str = ModelConfig.PROMPT_VERSION) -> str:
    prompt_file = PROMPTS_DIR / version / f"{task}_system.txt"
    if not prompt_file.exists():
        raise ValueError(f"Prompt not found: {prompt_file}")
    return prompt_file.read_text()

# Detect stale embeddings
def get_stale_documents(db_session) -> list[str]:
    """Find documents that need re-embedding due to model version change"""
    return db_session.execute("""
        SELECT doc_id FROM documents
        WHERE embedding_model_version != :current_version
           OR (status = 'ready' AND last_embedded_at < content_updated_at)
        ORDER BY last_embedded_at ASC
    """, {"current_version": ModelConfig.EMBEDDING_MODEL_VERSION}).fetchall()

# Re-embedding migration job
def migrate_embeddings_to_new_model(db_session, vector_store):
    """Run when upgrading embedding model"""
    stale_docs = get_stale_documents(db_session)
    logger.info(f"Re-embedding {len(stale_docs)} stale documents")
    
    for doc in stale_docs:
        try:
            text = fetch_document_text(doc["doc_id"])
            chunks = chunk_document_standard(text)
            
            # Delete old vectors
            vector_store.delete_by_doc_id(doc["doc_id"])
            
            # Re-embed with new model
            new_vectors = embed_batch(chunks, model=ModelConfig.EMBEDDING_MODEL)
            vector_store.upsert_batch(doc["doc_id"], chunks, new_vectors, {
                "embedding_model_version": ModelConfig.EMBEDDING_MODEL_VERSION
            })
            
            # Update metadata
            db_session.execute("""
                UPDATE documents 
                SET embedding_model_version = :version, last_embedded_at = NOW()
                WHERE doc_id = :doc_id
            """, {"version": ModelConfig.EMBEDDING_MODEL_VERSION, "doc_id": doc["doc_id"]})
            
        except Exception as e:
            logger.error(f"Re-embedding failed for {doc['doc_id']}: {e}")
    
    logger.info(f"Migration complete: {len(stale_docs)} documents re-embedded")

# Model deployment tracker
def record_deployment(environment: str, component: str, version: str):
    db.execute("""
        INSERT INTO model_deployments (environment, component, version, deployed_at, deployed_by)
        VALUES (?, ?, ?, NOW(), ?)
    """, (environment, component, version, get_current_user()))

# Example: record at startup
record_deployment("production", "llm_model", ModelConfig.LLM_MODEL)
record_deployment("production", "embedding_model", ModelConfig.EMBEDDING_MODEL_VERSION)
record_deployment("production", "prompt", ModelConfig.PROMPT_VERSION)
```

---

## 5. Example (From Your Projects)

**LangChain Service — versioning in practice:**

Issue I would fix: the LangChain service uses `model="gpt-4"` (auto-updated alias) instead of a pinned version like `"gpt-4-0613"`. An OpenAI model update could silently change output format and break JSON parsing.

Fix: pin to the dated version. Track prompt version in config. Store embedding_model_version in FAISS metadata.

**AstroIntel — what versioning adds:**

Each domain agent system prompt should be versioned. When we improved the astrology agent's prompt to add structured JSON output, that was a breaking change that needed:
- New prompt version `v2`
- Rollback path to `v1` if v2 regressed quality
- A/B test: route 10% to v2 prompts, measure consensus confidence distribution

In interview: "In AstroIntel, we pinned the model version and versioned all system prompts as text files alongside the code. When a prompt needed improvement, we created a new version, tested it, and deployed it as a code change — with full git history showing what changed and why."

---

## 6. Trade-offs

Pinned model version:
+ Consistent, predictable behavior across deployments
- Miss out on automatic quality improvements from provider model updates

Auto-updated model alias:
+ Automatically benefits from provider improvements
- Silent behavior change can break your system with no warning

File-based prompt versioning:
+ Version history in git, code review for prompt changes, easy rollback
- Requires discipline — easy to hardcode prompts in business logic

---

## 7. Interview Questions (Senior Level)

- How do you prevent an OpenAI model update from silently breaking your production system?

  **Answer:** *(Already covered in Advanced Follow-ups Q3 — skipped to avoid duplication.)*

- What happens if you change your embedding model without re-embedding existing documents?

  **Answer:** All retrieval breaks silently — queries are embedded with the new model and compared against vectors from the old model, producing meaningless cosine similarity scores that look plausible but retrieve random documents. There's no error, no exception — the system continues to serve answers, but retrieval quality drops to essentially random. This is one of the most dangerous silent failures in a RAG system. In Bench Resource Optimizer, every document vector stores `embedding_model_version` in metadata; the ingestion pipeline validates that the current model version matches before serving queries, and alerts on mismatch rather than silently continuing.

- How do you deploy a prompt change with the ability to roll back?

  **Answer:** Treat the prompt as a config value (not hardcoded), deploy the new version alongside the old in your config store, run canary routing (10% of traffic to new prompt, 90% to old) while monitoring faithfulness and format compliance metrics. If quality drops, flip the routing back to 100% old version — this is a config change, not a code deployment. In AstroIntel, the active prompt version is a config value; rolling back is changing one line in the config file and restarting, with no code change required. The old prompt is still in the repository and immediately available.

- What is the minimum viable model versioning strategy for a startup AI team?

  **Answer:** *(Already covered in Advanced Follow-ups Q3 — skipped to avoid duplication.)*

- How do you audit what model and prompt version was active when a specific query was processed?

  **Answer:** Log `model_version` and `prompt_version` with every query at the time of the call — not the current version, the version that was actually used for that specific request. Store this in your query log table alongside `query_id`, `user_id`, and `timestamp`. When investigating a complaint about a specific response, retrieve the log entry by query_id and you have the exact model, prompt, retrieved documents, and response that were active. In AstroIntel, every RunRecord captures the session_id and all inputs; extending this to include prompt_version and model_version is a one-line addition to the RunRecord dataclass.

---

## 8. Answer Framework

Step 1 — Pin everything:
"In production, I pin model versions to dated identifiers. Never use auto-updated aliases — a provider model update is a silent breaking change."

Step 2 — Prompts as code:
"System prompts are versioned as text files in the repository. Changing a prompt is a code change with code review, testing, and rollback capability."

Step 3 — Embedding model migration:
"Changing the embedding model requires re-embedding all documents — it is a migration, not a swap. I run this as a background job, validate retrieval quality on a test set, then cut over."

Step 4 — From your project:
"In AstroIntel, all agent prompts are versioned in the codebase. The active version is a config value. Rolling back a bad prompt is a config change + deployment."

Step 5 — Audit trail:
"Every query log records which model version and prompt version was active. If a user reports an issue, I can reconstruct exactly what the system was using at that moment."

---

## 10. Advanced Follow-ups

Q1: How do you do a zero-downtime migration from one embedding model to another?

Answer:
Zero-downtime requires a dual-index strategy.
Phase 1: deploy new embedding model code, but keep serving from old index. Start background re-embedding job.
Phase 2: new index is 50% complete. Route 10% of queries to new index, rest to old. Compare retrieval quality via RAGAS.
Phase 3: new index is 100% complete. Quality validated. Switch all traffic to new index.
Phase 4: decommission old index.
The key: both indexes exist simultaneously during migration. A query never hits a partially-migrated index. The cutover is atomic at the routing layer.
Total downtime: zero. Total risk: low, because you validated quality before cutting over.

Q2: How do you track which prompt version produced a specific user complaint?

Answer:
Every query log includes prompt_version as a column. When a user reports "your chatbot gave me wrong information about X on Tuesday," you:
Query the logs for that user around that time.
Find the query_id.
Look up prompt_version, model_version, retrieved_doc_ids, answer_text.
You now know exactly: which prompt, which model, which retrieved documents, and what the response was.
This is only possible if you instrument from day one. Retroactively adding this tracking is painful — the data you need was never captured.
The principle: log everything that could matter for debugging, compliance, or improvement. Storage is cheap. Missing data at 3am during an incident is expensive.

Q3: What is the minimum viable versioning strategy for a small team?

Answer:
Three non-negotiables.
First, pin model versions. One config file with the active model identifier. No hardcoded model names in business logic.
Second, prompts as files in the repository. Even a single `prompts/v1/` folder is sufficient. The requirement is that prompts are in git, not hardcoded.
Third, embedding model version in document metadata. One column: `embedding_model_version`. Required to detect stale embeddings when you upgrade.
Everything else (fine-tuned model registry, deployment tracking, etc.) can come later as the system matures.
What to NOT skip: if you skip model pinning, a provider update will break your production system at random. If you skip prompt versioning, you cannot roll back a bad prompt change. If you skip embedding version tracking, you cannot safely upgrade your embedding model. These three are non-negotiable even for a two-person team.

---

## Bench Resource Optimizer — Live Implementation Reference

**Project:** Bench Resource Optimizer (bench-resource-optimizer/backend)  
**Module:** 6 — MLOps (Test Suite + CI Readiness)  
**Implemented:** 18 May 2026  
**Status:** Phase 1 complete — 99 tests passing

### What was built

A full pytest test suite covering all 12 Senior AI Engineer modules with zero LLM API calls (all mocked):

```
tests/
  conftest.py          — shared fixtures, mock LLM factory
  test_guardrails.py   — G1–G5 production guardrails (36 tests)
  test_agents.py       — CV parser, role mapper, planner, tracker (27 tests)
  test_db.py           — async SQLite CRUD: users, progress (11 tests)
  test_cache.py        — L1 exact cache, cache stats (7 tests)
  test_memory.py       — episodic + long-term memory (12 tests)
  test_api.py          — FastAPI endpoints: 200/400/404/429/503 paths (6 classes)
```

### How to run

```bash
cd bench-resource-optimizer/backend
source venv/bin/activate
python -m pytest           # all 99 tests, ~1.3s, no API calls
```

### Senior interview talking point

"In bench-resource-optimizer, I built a 99-test suite that covers every production guardrail (G1–G5), all four agents, the async SQLite layer, the semantic cache, and session memory — all in under 1.3 seconds with zero LLM API calls. The key pattern is mocking at the LangChain chain level, not the LLM level, because agent code builds `ChatPromptTemplate | llm.bind()` chains — you must mock the full chain's invoke(), not just llm.invoke(), or you get type errors from MagicMock flowing into json.loads()."

### Test design principles applied

1. Each test has an explicit positive OR negative label in the name
2. No test calls a real LLM, DB, or file system (except test_db.py which uses a temp SQLite file)
3. G1 rate limiter tested by running 3 requests with max=2 — 3rd is blocked
4. G3 JSON repair tested at all 4 levels: direct, fence-strip, regex, fallback
5. G4 PII filter tested for email, phone, and profile field scrubbing
6. Tracking agent tested with 0%, 20%, 80%, and 100% completion scenarios
7. CV parser tested with clean JSON, fenced JSON, and partial responses

---

## Bench Resource Optimizer — Phase 3: Role CRUD API (Live Implementation)

**Module 6 — MLOps: Knowledge Base as Versioned Data, Not Hardcoded Config**

### What was built

Roles were hardcoded in `roles_knowledge.json` — not scalable, not auditable, not admin-manageable. Phase 3 migrated roles to SQLite with a full CRUD API.

**New DB layer** (`db.py`):
```python
async def create_role_db(role: dict) -> dict  # raises ValueError on duplicate
async def get_role_db(role_id: str) -> Optional[dict]
async def get_all_roles_db() -> list
async def update_role_db(role_id: str, updates: dict) -> Optional[dict]  # partial update
async def delete_role_db(role_id: str) -> bool
async def seed_roles_from_json(path: Path) -> int  # idempotent migration
```

**New API endpoints** (`main.py`):
```
POST   /admin/roles             → create role, trigger FAISS+BM25 rebuild
GET    /admin/roles/{role_id}   → get single role
PUT    /admin/roles/{role_id}   → partial update, trigger rebuild
DELETE /admin/roles/{role_id}   → delete, trigger rebuild
GET    /roles                   → reads from SQLite (not JSON)
```

**Background index rebuild pattern**:
```python
async def _rebuild_indexes() -> int:
    roles = await get_all_roles_async()
    _vector_store = build_vector_store(embeddings, roles=roles)
    init_bm25_from_roles(roles)
    return len(roles)

# After any role mutation:
asyncio.get_event_loop().create_task(_rebuild_indexes())
```
This is fire-and-forget: the HTTP response returns immediately; the FAISS+BM25 rebuild happens in the background without blocking the caller.

**Startup migration** (idempotent):
```python
# In lifespan:
seeded = await seed_roles_from_json(roles_json)
roles  = await get_all_roles_async()  # now reads from SQLite
init_bm25_from_roles(roles)
```

**Test coverage** (15 DB-layer + 9 API-layer = 24 new tests):
- `test_roles.py` — DB layer: create, duplicate→ValueError, ID normalization, get/get-all, partial update, delete, seed idempotency, missing file
- `test_api.py TestAdminRoles` — API layer: 201 create, 400 empty skills, 409 duplicate, 200 get/update/delete, 404 not found paths

### Senior interview talking point

"In bench-resource-optimizer, roles were originally hardcoded JSON — a classic prototype pattern that breaks in production. Phase 3 migrated to SQLite-backed CRUD with a fire-and-forget FAISS+BM25 rebuild on every role change. Any role addition, update, or deletion immediately becomes searchable via hybrid RAG without restarting the server. The same pattern is used in production RAG systems where the knowledge base must evolve without downtime: write to DB, fire rebuild task, return to caller. The startup seed is idempotent — safe to run on every deploy."
