# Senior AI Engineer — Module 14
# Topic: Vectorless / RAGless Architecture — The Pattern That Is Booming

---

## 1. Intuition

Everyone talks about RAG. Senior engineers know when NOT to use it.

Vectorless / RAGless is the architecture where you remove the vector database and embedding step entirely — replacing semantic retrieval with deterministic lookup (SQL, key-value, graph traversal). The result: zero hallucinated commands, sub-100ms responses, and no embedding model dependency.

This is not a fallback. It is often the superior architecture for structured knowledge domains.

---

## 2. Core Concept

### What is Vectorless / RAGless?

**Standard RAG:**
```
User Query
  → Embed query (embedding model)
  → Search vector DB (cosine similarity)
  → Retrieve top-K approximate chunks
  → LLM generates answer (hallucination risk)
```

**Vectorless / RAGless:**
```
User Query
  → Extract structure with LLM (once, at ingest)
  → Store as structured rows in SQL / key-value
  → At query time: deterministic SQL lookup
  → Return exact stored string (zero hallucination)
```

### The fundamental insight

LLMs are good at **extraction** from unstructured text.
LLMs are bad at **verbatim recall** under query pressure.

**Vectorless splits these two responsibilities:**
- **Extraction phase (LLM):** run once at ingest — parse a PDF, extract structured facts, store them
- **Retrieval phase (SQL/KV):** run at every query — return exactly what was stored

The LLM is never in the query path. What the user gets back is exactly what was stored, not what the LLM chose to recall.

---

## 3. When to Use Vectorless vs RAG

| Situation | Use RAG | Use Vectorless |
|-----------|---------|----------------|
| Knowledge is unstructured prose | ✓ | ✗ |
| Knowledge changes frequently | ✓ | ✗ |
| Semantic similarity search needed | ✓ | ✗ |
| Commands must be verbatim exact | ✗ | ✓ |
| Knowledge is structured / tabular | ✗ | ✓ |
| Zero hallucination is non-negotiable | ✗ | ✓ |
| Query latency must be < 100ms | ✗ | ✓ |
| No GPU / embedding infra available | ✗ | ✓ |
| Compliance / auditability required | ✗ | ✓ |

---

## 4. Vectorless Architecture Patterns

### Pattern 1 — Extract Once, SQL Forever (RunbookAI)

```
PDF Runbook (ingest, one time)
  → LLM extracts: [{step, command, description, depends_on}]
  → INSERT INTO runbook_steps (id, command, description, category, severity)

Query (every request, no LLM)
  → SELECT steps FROM runbook_steps
    WHERE category = ? AND severity = ?
    ORDER BY step_number
  → Return rows verbatim
  → commands_source: "database"  ← proof of no hallucination
```

**Why this is better than RAG for runbooks:**
- A `kubectl drain node-1 --ignore-daemonsets` command must be returned verbatim — not paraphrased
- Cosine similarity on a runbook command corpus is noisy — "drain" and "delete" are semantically similar but operationally completely different
- SQL returns deterministic results — the same query, same result, always

### Pattern 2 — Graph-Based Vectorless (NetworkX DAG)

```
Runbook steps extracted at ingest
  → Build directed acyclic graph (NetworkX DiGraph)
  → Edges = depends_on relationships

Query
  → nx.topological_sort(G) → guaranteed safe execution order
  → No embedding needed — structure is the retrieval mechanism
```

### Pattern 3 — Hybrid: Vectorless Core + Optional RAG Enrichment

```
Core response: SQL (deterministic, zero hallucination)
  + Optional enrichment: semantic search over commentary / notes
  → User gets: exact commands (from DB) + contextual notes (from RAG)
```

### Pattern 4 — YAML-Configured Vectorless (Universal Agent)

```
Agent config (YAML):
  knowledge_base:
    enabled: false    ← vectorless mode (default)
    enabled: true     ← RAG mode (optional)

When disabled:
  → LLM answers from configured persona + injected system facts
  → No vector DB, no embedding model
  → Lock mechanism prevents any LLM call → truly zero computation cost
```

---

## 5. Code Pattern — The RunbookAI Vectorless Core

```python
# Ingest (once per runbook PDF)
def ingest_runbook(pdf_path: str, category: str, severity: str) -> int:
    raw_text = extract_text_from_pdf(pdf_path)           # PyMuPDF
    
    # LLM extracts structure — the ONLY LLM call for this runbook
    extracted = call_llm(
        system_prompt="""Extract runbook steps as JSON array.
Each step: {"step_number": int, "command": str, "description": str, "depends_on": [int]}.
Return ONLY the JSON array, no commentary.""",
        user_message=raw_text,
        temperature=0.0   # deterministic extraction
    )
    
    steps = json.loads(extracted)
    
    with db.transaction():
        runbook_id = db.insert_runbook(category, severity, source_file=pdf_path)
        for step in steps:
            db.insert_step(runbook_id, step)   # store verbatim
    
    return runbook_id

# Query (every request — NO LLM CALL)
def query_runbook(category: str, severity: str) -> dict:
    steps = db.execute("""
        SELECT step_number, command, description, depends_on
        FROM runbook_steps rs
        JOIN runbooks r ON r.id = rs.runbook_id
        WHERE r.category = ? AND r.severity = ?
        ORDER BY rs.step_number
    """, (category, severity)).fetchall()
    
    # Build execution graph (also vectorless)
    G = nx.DiGraph()
    for step in steps:
        G.add_node(step["step_number"], **step)
        for dep in step["depends_on"]:
            G.add_edge(dep, step["step_number"])
    
    ordered = list(nx.topological_sort(G))
    
    return {
        "steps": [G.nodes[n] for n in ordered],
        "commands_source": "database",   # ← proof field — always database, never LLM
        "hallucination_risk": "zero"
    }
```

---

## 6. Vectorless in All 5 Projects

| Project | Vectorless? | How |
|---------|-------------|-----|
| **RunbookAI** | ✓ Full vectorless | LLM extracts once at PDF ingest → SQL at query time. `commands_source: "database"` on every response |
| **Universal Agent** | ✓ Default mode | `knowledge_base.enabled: false` → no FAISS, no embeddings. Lock = truly zero LLM cost |
| **AstroIntel 360°** | Partial | Numerology/astrology math is pure Python (vectorless). Only narrative synthesis uses LLM |
| **Bench Resource Optimizer** | ✗ RAG | 5-layer hybrid RAG pipeline — knowledge is prose CVs, semantic similarity needed |
| **Agentic Growth OS** | Partial | Campaign memory uses string similarity (no vectors). JSON store with keyword matching |

### RunbookAI — Full Vectorless
- LLM called **once per runbook PDF** at ingest
- All queries return exact stored strings — `commands_source: "database"` field on every response
- NetworkX topological sort guarantees safe step ordering — no LLM reasoning in execution path
- Three-panel response: P1 (internal), P2 (official), P3 (combined conflict-detected) — all from SQL
- Conflict detection: `VALUE_CONFLICT`, `ORDER_CONFLICT`, `MISSING_STEP`, `EXTRA_STEP` — all regex + SQL, no LLM
- Query latency: **< 100ms** — no embedding, no LLM call

### Universal Agent — YAML-Controlled Vectorless
- Default config: `knowledge_base.enabled: false` — no FAISS index, no embedding model loaded
- Lock mechanism: `/agents/{id}/lock` → LLM call blocked → **zero token cost, zero latency**
- When `enabled: true`: FAISS loaded from `source_dir` — switches to RAG mode without code change
- Per-agent granular control — one agent vectorless, another RAG, same server

### AstroIntel — Selective Vectorless (Arithmetic Core)
- All numerology calculations: pure Python arithmetic — Life Path, Destiny, Soul Urge numbers
- Astrology chart: pure astronomical math — house positions, planetary degrees
- Zero LLM involvement in any numeric computation — these CANNOT hallucinate
- Only the **narrative synthesis** (what the numbers mean) uses LLM
- This is vectorless thinking applied at function level: deterministic where exactness matters, generative where language quality matters

### Agentic Growth OS — Partial Vectorless (Memory Store)
- Campaign memory: JSON file + string similarity (`campaign_type`, `keywords`)
- No vector DB, no embeddings for campaign lookup
- `_find_similar_campaigns()` uses Python `difflib` or keyword overlap — O(n) scan of JSON store
- Budget numbers come from stored history (vectorless) — not LLM imagination

---

## 7. The Proof Field — How to Demonstrate Vectorless in an Interview

The most powerful thing you can say about RunbookAI:

```json
{
  "query": "pod crash loop K8s",
  "steps": [
    {"step": 1, "command": "kubectl describe pod <pod-name> -n <namespace>"},
    {"step": 2, "command": "kubectl logs <pod-name> --previous"},
    {"step": 3, "command": "kubectl get events --sort-by='.lastTimestamp'"}
  ],
  "commands_source": "database",
  "hallucination_risk": "zero",
  "latency_ms": 43
}
```

**`commands_source: "database"`** — this field proves architecturally that no LLM was in the query path. The commands were stored at ingest and returned verbatim. There is no model that could have changed them.

This is the equivalent of a cryptographic proof — not a claim, a structural guarantee.

---

## 8. Vectorless vs RAGless — Are They the Same?

**RAGless** = no Retrieval Augmented Generation — no retrieval step at query time.
**Vectorless** = no vector embeddings at query time.

They usually go together (RunbookAI: both). But they can diverge:

| Scenario | RAGless? | Vectorless? |
|----------|----------|-------------|
| RunbookAI SQL query | ✓ | ✓ |
| SQL lookup + keyword search (BM25) | ✓ | ✓ |
| Graph traversal (NetworkX) | ✓ | ✓ |
| FAISS retrieval with semantic search | ✗ | ✗ |
| LLM with injected facts (no retrieval) | ✓ | ✓ |
| Knowledge graph + SPARQL | ✓ | ✓ |

**In interviews, use both terms together:** "RunbookAI is RAGless and vectorless — no embedding, no retrieval, no LLM at query time. Just SQL."

---

## 9. Trade-offs

**Vectorless advantages:**
- Zero hallucination on stored facts — structural guarantee, not a metric
- Sub-100ms query latency — SQL is orders of magnitude faster than embedding + vector search
- No embedding model dependency — no infra, no API cost, no drift risk
- Auditability — every response is traceable to an exact stored row
- No index staleness — SQL is always current

**Vectorless disadvantages:**
- Requires structured knowledge — doesn't work for open-ended prose corpora
- LLM at ingest must extract correctly — garbage in, garbage out forever
- No semantic flexibility — cannot handle paraphrased queries, synonyms
- Schema changes require re-ingestion — no dynamic adaptation
- Not suitable when knowledge changes continuously (use RAG instead)

---

## 10. Interview Lines

**One-sentence summary:**
"Vectorless / RAGless is the architecture where the LLM extracts structure once at ingest, and SQL returns it verbatim at query time — zero vectors, zero hallucination, sub-100ms latency. RunbookAI proves it: `commands_source: database` on every response."

**When asked "why not just use RAG?":**
"For runbooks, cosine similarity is the wrong retrieval mechanism — 'kubectl drain' and 'kubectl delete' are semantically similar but operationally opposite. If the retrieval step returns the wrong command and the LLM paraphrases it further, an engineer runs the wrong command on a production cluster. SQL returns the exact stored string — structural guarantee, not a statistical one."

**When asked "what is the downside?":**
"Vectorless only works when your knowledge domain is structured — you can extract clear facts at ingest time. For open-ended knowledge bases, unstructured documents, or domains where semantic similarity is genuinely the right retrieval mechanism, RAG wins. The right answer is choosing the right architecture per component, not defaulting to one pattern everywhere."

**Senior signal phrase:**
"I invented a 6th RAG pattern: RAGless. The best retrieval is no retrieval — extract structure once at ingest, return it verbatim at query time. This eliminates the entire category of retrieval-related hallucination."

---

## 11. Pre-Interview Checklist for Vectorless

- [ ] Explain vectorless in one sentence cold
- [ ] Know RunbookAI's `commands_source: "database"` proof field
- [ ] Know query latency: < 100ms (vs 1-3s for RAG)
- [ ] Explain why cosine similarity is wrong for runbook commands
- [ ] Know which projects are vectorless vs RAG vs hybrid
- [ ] Explain Universal Agent's `knowledge_base.enabled: false` → vectorless default
- [ ] Explain AstroIntel's selective vectorless (arithmetic is pure Python, no LLM)
- [ ] State the trade-off: vectorless needs structured domain, RAG needs prose domain
- [ ] Use both terms: "RAGless AND vectorless" — they usually go together
