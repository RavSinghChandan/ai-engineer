# Senior AI Engineer — Module 6
# Topic: Monitoring — Latency, Drift, Hallucination Rate, Token Cost

---

## 1. Intuition

"Deploy and forget" is how junior engineers ship AI features. Senior engineers deploy and watch — because LLM systems degrade in ways that traditional monitoring cannot detect.

Your latency P95 can be green while your hallucination rate is climbing. Your error rate can be zero while your answer quality is declining. You need AI-specific monitoring on top of standard infrastructure metrics.

---

## 2. Core Concept

### Four Monitoring Dimensions for AI Systems

**Infrastructure metrics (standard — you already know these):**
- Request rate, error rate, latency P50/P95/P99
- CPU, memory, pod restarts
- API provider availability and error rate

**LLM-specific metrics (new for AI engineers):**
- Token cost per query
- Model used distribution (how often each model is called)
- Input/output token count per request
- Cache hit rate (semantic + exact)

**Quality metrics (unique to AI):**
- Faithfulness score (RAGAS) — trending up or down?
- Answer relevancy score
- Hallucination rate (% of responses below faithfulness threshold)
- User satisfaction signals (thumbs up/down, session abandonment)

**Data/drift metrics:**
- Average similarity score of top-1 retrieved chunk — declining means retrieval is getting worse
- Query embedding distribution shift — new types of queries the system was not designed for
- Document freshness — % of documents with stale embeddings

---

## 3. Architecture

```
Every LLM call produces telemetry:
  request_id, user_id, tenant_id, model,
  input_tokens, output_tokens, cost_usd,
  latency_ms, cache_hit,
  faithfulness_score, answer_relevancy_score,
  retrieved_doc_ids, retrieval_scores

→ Written to: metrics (Prometheus), logs (structured JSON to CloudWatch/ELK)
→ Batch eval: nightly RAGAS on 50 random samples from last 24h

Dashboards (Grafana):
  Row 1: Request rate, error rate, latency P95
  Row 2: Token cost/day, cost by tenant, model usage %
  Row 3: Faithfulness trend, answer relevancy, hallucination rate
  Row 4: Retrieval quality: avg similarity score, context precision
  Row 5: Cache performance: hit rate %, cost saved

Alerts:
  - LLM P95 > 4s: page
  - Error rate > 2%: page
  - Faithfulness 7-day average < 0.85: alert
  - Daily spend > 120% of 7-day average: alert
  - Retrieval avg similarity < 0.70: warning
```

---

## 4. Code Skeleton (Production-Grade)

```python
from prometheus_client import Counter, Histogram, Gauge, start_http_server
import time
import logging
import json

# Prometheus metrics
llm_request_counter = Counter('llm_requests_total', 'Total LLM requests', ['model', 'tenant', 'cache_hit'])
llm_latency = Histogram('llm_latency_seconds', 'LLM call latency', ['model'], 
                         buckets=[0.1, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0])
llm_token_cost = Counter('llm_token_cost_usd', 'Total LLM cost in USD', ['model', 'tenant'])
llm_input_tokens = Counter('llm_input_tokens_total', 'Total input tokens', ['model'])
llm_output_tokens = Counter('llm_output_tokens_total', 'Total output tokens', ['model'])
faithfulness_gauge = Gauge('llm_faithfulness_score', 'Rolling avg faithfulness', ['tenant'])
hallucination_counter = Counter('llm_hallucinations_total', 'Responses below faithfulness threshold', ['tenant'])

# Structured logging for all LLM calls
def log_llm_call(event: dict):
    logging.info(json.dumps({
        "event": "llm_call",
        **event,
        "timestamp": time.time()
    }))

# Monitoring wrapper
def monitored_llm_call(
    system_prompt: str, user_message: str,
    model: str, tenant_id: str, feature: str,
    faithfulness_check: bool = False,
    retrieved_context: str = None
) -> dict:
    start = time.time()
    cache_hit = False
    
    # Check cache first
    cached = get_from_semantic_cache(user_message, tenant_id)
    if cached:
        cache_hit = True
        llm_request_counter.labels(model="cache", tenant=tenant_id, cache_hit="true").inc()
        return {"content": cached, "cache_hit": True, "latency_ms": 0, "cost_usd": 0}
    
    # LLM call
    response = call_with_fallback(system_prompt, user_message, model)
    latency = time.time() - start
    
    input_tokens = response["input_tokens"]
    output_tokens = response["output_tokens"]
    cost = calculate_cost(model, input_tokens, output_tokens)
    
    # Metrics
    llm_request_counter.labels(model=model, tenant=tenant_id, cache_hit="false").inc()
    llm_latency.labels(model=model).observe(latency)
    llm_token_cost.labels(model=model, tenant=tenant_id).inc(cost)
    llm_input_tokens.labels(model=model).inc(input_tokens)
    llm_output_tokens.labels(model=model).inc(output_tokens)
    
    # Quality check
    faithfulness = None
    if faithfulness_check and retrieved_context:
        faithfulness = compute_faithfulness(user_message, response["content"], retrieved_context)
        if faithfulness < 0.7:
            hallucination_counter.labels(tenant=tenant_id).inc()
    
    # Structured log
    log_llm_call({
        "model": model,
        "tenant_id": tenant_id,
        "feature": feature,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": round(cost, 6),
        "latency_ms": int(latency * 1000),
        "faithfulness_score": faithfulness,
        "cache_hit": cache_hit
    })
    
    return {**response, "faithfulness_score": faithfulness, "latency_ms": int(latency * 1000), "cost_usd": cost}

# Nightly drift detection job
def run_nightly_eval():
    """Sample 50 queries from last 24h, compute RAGAS metrics"""
    from ragas import evaluate
    from ragas.metrics import faithfulness, answer_relevancy
    
    recent_logs = query_logs_db(last_hours=24, sample_size=50)
    
    dataset = Dataset.from_list([{
        "question": log["query_text"],
        "answer": log["answer_text"],
        "contexts": log["retrieved_chunks"],
        "ground_truth": ""
    } for log in recent_logs])
    
    scores = evaluate(dataset, metrics=[faithfulness, answer_relevancy])
    
    # Store in time-series for trend analysis
    metrics_db.insert({
        "date": datetime.utcnow().date().isoformat(),
        "faithfulness": scores["faithfulness"],
        "answer_relevancy": scores["answer_relevancy"],
        "sample_size": len(recent_logs)
    })
    
    # Alert if degrading
    yesterday = metrics_db.get_by_date(yesterday_date)
    if yesterday and scores["faithfulness"] < yesterday["faithfulness"] - 0.05:
        alert(f"Faithfulness dropped: {yesterday['faithfulness']:.3f} → {scores['faithfulness']:.3f}")
    
    logger.info(f"Nightly eval: faithfulness={scores['faithfulness']:.3f}, relevancy={scores['answer_relevancy']:.3f}")
```

---

## 5. Example (From Your Projects)

**AstroIntel — live monitoring (verified 2026-05-15, 415/415 tests passing):**

Monitoring is implemented and verified live with real DeepSeek API calls. The `/api/v1/metrics` endpoint returns a full `dashboard()` object after every run — not planned, not mocked, verified with `test_live_pipeline.py` against the production LLM.

**What is live and measured today:**

```
GET /api/v1/metrics → MetricsCollector.dashboard()

latency:
  p50_ms:  real value after first run (e.g., 8400ms for 5-domain consensus)
  p95_ms:  tracks tail latency — catches agent timeout spikes
  p99_ms:  worst-case, used to set SLA ceiling

confidence_distribution:
  high_pct / medium_pct / low_pct — rolling across all runs
  → if low_pct climbs over time: model quality is degrading

hallucination_audit:              # live in every /run response
  overall_risk: low | medium | high
  layer2_detection:
    single_source_flags: N        # insights from only 1 domain
    hedge_phrase_flags: N         # "might", "possibly", "unclear"
    contradiction_flags: N        # cross-domain sentiment conflict
    coverage_gap: true | false    # fewer than 3 domains responded
  layer3_recovery:
    suppressed_count: N           # low-confidence insights quarantined
    fallback_injected: true|false # safe fallback inserted if all suppressed
  hallucination_rate_pct: float   # % of insights flagged this run

token_economics:
  avg_total_tokens: N             # input + output per run
  est_cost_usd: float             # cost at DeepSeek pricing

domain_coverage:
  domains_active: ["astrology", "numerology", "palmistry", "tarot", "vastu"]
```

**RAGAS proxy metrics (no vector retrieval — mapped to AstroIntel signals):**

AstroIntel is not a RAG system — it uses rule-based domain agents, not vector retrieval. RAGAS metrics are adapted as proxies:

| RAGAS metric | AstroIntel proxy | Signal |
|---|---|---|
| `faithfulness_proxy` | HIGH confidence insight rate | Did agents agree? |
| `context_precision_proxy` | Domain coverage (≥3 domains) | Did enough domains contribute? |
| `answer_relevancy_proxy` | Question→insight alignment | Did answer match what was asked? |
| `domain_recall_proxy` | Fraction of active domains that contributed | Did any domain fail silently? |

These proxies are tracked per-run in `dashboard()["ragas_proxies"]` and can be trended over time.

**Live pipeline test results (23 tests, real DeepSeek calls):**
- P50 latency > 0 after real run — confirmed tracking is live, not a stub
- `hallucination_audit.overall_risk` present in every `/run` response
- Guardrail stats (`/guardrails/stats`) show `total_allowed >= 1` after run
- `json_repair.total_calls >= 0` tracked per session
- Cache hit rate: same birth profile, different session → `cache_hit: true` (dedup confirmed)

**RAGAS score accumulation pattern — deque + thread-local mutex (AstroIntel MetricsCollector):**

```python
# Thread-safe rolling window for RAGAS proxy metrics
from collections import deque
import threading

_metrics_lock = threading.Lock()
_latency_window = deque(maxlen=100)   # last 100 run latencies
_confidence_window = deque(maxlen=100) # last 100 confidence distributions

def record_run(latency_ms: float, confidence: dict):
    with _metrics_lock:               # global mutex — one writer at a time
        _latency_window.append(latency_ms)
        _confidence_window.append(confidence)

def dashboard() -> dict:
    with _metrics_lock:
        latencies = list(_latency_window)
    sorted_l = sorted(latencies)
    n = len(sorted_l)
    return {
        "p50_ms": sorted_l[int(n * 0.50)] if n else 0,
        "p95_ms": sorted_l[int(n * 0.95)] if n else 0,
        "p99_ms": sorted_l[int(n * 0.99)] if n else 0,
    }
# Key: deque(maxlen=N) auto-evicts oldest entries — O(1) append, bounded memory
# Key: single global mutex prevents torn reads when multiple requests write concurrently
```

In interview: "AstroIntel's monitoring stack tracks 10 KPIs per run via `/api/v1/metrics`: P50/P95/P99 latency (deque + mutex accumulator), HIGH/MEDIUM/LOW confidence distribution, hallucination audit (3-layer), token cost, and RAGAS proxy metrics adapted for a non-retrieval pipeline. Every run produces a `hallucination_audit` block live — not sampled, not nightly — so any response with cross-domain contradictions or hedge phrases is flagged in real time. The confidence distribution trend is the earliest signal I watch: if LOW starts climbing, the prompt is degrading or the model behavior has shifted. The deque+mutex pattern is the same as a ring buffer in Java — bounded memory, O(1) writes, lock protects concurrent append from 3 Kafka consumer threads."

---

## 6. Trade-offs

RAGAS nightly eval:
+ Systematic quality tracking, catches slow degradation
- Requires sample of queries + additional LLM calls for scoring

User feedback signals (thumbs up/down):
+ No additional LLM cost, captures real user perception
- Low volume, biased (users more likely to report negative), delayed signal

Real-time faithfulness scoring:
+ Immediate quality gate, catches individual bad responses
- Adds 200-500ms latency and cost per response

---

## 7. Interview Questions (Senior Level)

- How do you detect that your LLM system's quality is degrading over time?

  **Answer:** Nightly RAGAS evaluation on a 50-sample random batch from live traffic — track faithfulness, answer relevance, and context precision as time series. Set alert thresholds (faithfulness < 0.85 triggers investigation). Secondary signals: user behavior (follow-up correction queries, thumbs-down rate), and LLM-as-judge scores on every response if latency budget allows. In AstroIntel's metrics dashboard, the hallucination_proxy metric (LOW-confidence insight rate) and confidence distribution are tracked across all runs — a shift in the HIGH/LOW ratio is the earliest signal of degradation. In Bench Resource Optimizer, the LLM-as-judge scores each generated plan on four dimensions (Relevance, Completeness, Accuracy, Actionability 1-5); a drop in the average judge score below 3.5 is the automated quality degradation signal for the RAG planning pipeline.

- What metrics do you track for an LLM service beyond standard API metrics?

  **Answer:** Beyond HTTP latency and error rate: TTFT (time to first token) as the user-perceived latency metric; faithfulness and answer relevance scores from RAGAS or LLM-as-judge; hallucination rate proxy (low-confidence response rate); cost per query (tokens × model price); cache hit rate (L1 exact and L2 semantic); embedding freshness (% of documents re-embedded within the last N days); and retrieval quality metrics (context precision, context recall). In AstroIntel's `/api/v1/metrics` endpoint: P50/P95/P99 latency, confidence distribution, hallucination audit, token economics, and domain coverage — 10 KPIs total. In Bench Resource Optimizer's `/api/v1/metrics`: P50/P95/P99 plan generation latency, LLM-as-judge score distribution, semantic cache L1/L2 hit rates (~35% combined), plan cost per request (~$0.009), and circuit breaker state per agent — specifically built for a RAG workforce planning system.

- How do you build a dashboard that shows the health of a RAG system?

  **Answer:** Six panels: (1) latency sparkline — P50/P95/P99 over the last 7 days; (2) quality trend — faithfulness and answer relevance from nightly eval; (3) cost tracker — daily token spend with alert line at 80% of budget; (4) cache efficiency — L1 and L2 hit rates; (5) retrieval health — context precision and recall trend; (6) error breakdown — by type (retrieval failure, LLM failure, parse failure, timeout). In Bench Resource Optimizer, the progress tracker logs all six panels with real data: the cache efficiency panel shows L1 SHA-256 hits (1-hour TTL) and L2 semantic similarity hits (cosine ≥ 0.92, 30-minute TTL), and the quality panel shows the LLM-as-judge score trend by dimension — making it easy to see if Relevance is degrading while Actionability stays stable.

- Your faithfulness score has been declining for 2 weeks. What do you investigate?

  **Answer:** *(Already covered in Advanced Follow-ups Q1 — skipped to avoid duplication.)*

- How do you monitor cost and alert before you go over budget?

  **Answer:** Daily spend alert at 80% of budget (warning) and 100% (critical). Per-feature and per-model token counters tracked in Prometheus. Track average tokens per request as a time series — prompt bloat shows up as a gradual cost increase over days before it becomes a crisis. The most actionable metric is `avg_tokens_per_request` by feature — if one feature's average token count doubles, that's the cost regression to investigate. In AstroIntel, the token economics section of the metrics dashboard tracks `avg_total_tokens` per run; a spike in this number correlates directly to cost increase and is visible immediately.

---

## 8. Answer Framework

Step 1 — Four monitoring dimensions:
"I monitor four dimensions: infrastructure (latency, errors), LLM economics (tokens, cost, cache hit rate), quality (faithfulness, relevancy, hallucination rate), and data health (retrieval quality, embedding freshness)."

Step 2 — Nightly eval pipeline:
"Every night I run RAGAS on a 50-sample batch from live traffic. If faithfulness drops more than 5% from baseline, an alert fires. This catches quality degradation before users report it."

Step 3 — From your project:
"In AstroIntel, I track per-agent latency and consensus confidence distribution. A shift in confidence distribution is the earliest signal of model or prompt quality degradation."

Step 4 — Cost monitoring:
"Daily spend alert at 80% of budget. Per-feature cost tracking. Token count per request as a time-series — prompt bloat shows up as gradual cost increase before anyone notices."

Step 5 — From your Java background:
"I use the same Prometheus + Grafana stack I use for Spring Boot services. I add AI-specific metrics (token cost, faithfulness) alongside standard metrics (latency, error rate) in the same dashboard."

---

## 10. Advanced Follow-ups

Q1: Faithfulness score has been declining for 2 weeks. Walk me through your investigation.

Answer:
Four hypotheses in order of likelihood.
First, prompt change: did any system prompt change in the last 2 weeks? A weakened prompt constraint ("only answer from context" removed or softened) is the most common cause.
Second, model update: did the LLM provider update their model? Provider model updates are silent. Run your eval suite against the current model version and compare to a cached baseline.
Third, document freshness: are documents being updated without re-embedding? If yes, retrieval returns correct-looking chunks but with stale content — the LLM generates answers that contradict the now-updated documents, which looks like hallucination.
Fourth, query distribution shift: are users asking new types of questions the system was not designed for? New query types may not retrieve relevant context, leading the LLM to fall back on training knowledge.
Investigation: sample the lowest-faithfulness responses from each week. Look at what changed in the retrieved context, the prompt, and the query type. The pattern across failures points to the root cause.

Q2: How do you monitor an AI system that has no user feedback mechanism?

Answer:
User feedback is the ideal but not the only signal. Three alternatives.
First, automated RAGAS scoring: sample live queries nightly, compute faithfulness and relevancy using RAGAS. No users required.
Second, behavioral signals: track session length, query abandonment (user asks once and never returns), and follow-up question rate. "How do I reset it?" followed immediately by "My password reset still isn't working" is an implicit signal that the first answer was insufficient.
Third, downstream metrics: if the AI feature is meant to reduce support tickets, track support ticket volume as a proxy. If AI answer quality degrades, support tickets increase.
These indirect signals are less precise than explicit feedback but sufficient for trend detection. When a signal anomalies, sample the raw responses and do manual quality review to confirm.

Q3: How do you build a cost anomaly detection system?

Answer:
Track daily token cost with statistical anomaly detection.
Baseline: rolling 14-day daily cost average and standard deviation.
Alert condition: if today's cost exceeds baseline_mean + 2 × baseline_std, fire an alert.
Implementation: simple Z-score on the daily cost metric. Store in a time-series table, compute rolling stats nightly, compare to current day's spend.
This catches: a developer removing max_tokens cap (cost spikes), a bug causing infinite retry loops, a traffic spike from a viral moment, or a prompt bloat from a new feature.
Dashboard breakdown: cost by tenant, cost by feature, cost by model. When the alert fires, the breakdown tells you which dimension is responsible — which tenant, which feature, which model changed.

---

## Bench Resource Optimizer — Phase 5: CI/CD Pipeline (Live Implementation)

**Module 6 — MLOps: Treating AI Code with the Same Discipline as Production Software**

### What was built

`.github/workflows/bench-ci.yml` — parallel CI pipeline that runs on every PR and push to main touching `bench-resource-optimizer/`.

**Pipeline structure**:
```yaml
jobs:
  backend-test:       # Python 3.9 + pytest — blocks merge on any test failure
  frontend-build:     # Node 20 + ng build --configuration production — blocks on TypeScript errors
```

**Both jobs run in parallel** — fastest possible feedback. A PR that breaks a test AND has a TypeScript error gets both failure signals simultaneously, not sequentially.

**Key design decisions**:

1. **Path filter** (`paths: ["bench-resource-optimizer/**"]`) — CI only triggers when bench files change. A change to AstroIntel doesn't run bench tests. This is the production pattern: scoped pipelines per project in a monorepo.

2. **No API key in CI** — `DEEPSEEK_API_KEY` is intentionally absent. All 144 tests mock LLM calls. This is the correct pattern: tests that require a live API key are integration tests, not unit tests, and should run in a separate nightly job, not on every PR.

3. **SQLite needs no service container** — unlike PostgreSQL (which AstroIntel CI provisions as a Docker service), SQLite is file-based. Tests use `tmp_path` fixtures that create and discard in-memory DB files. No database setup step needed.

4. **`npm ci --legacy-peer-deps`** — Angular 17's peer dependency graph has conflicts with newer packages. `--legacy-peer-deps` is the standard Angular 17 workaround, same as AstroIntel's pipeline.

5. **`ng build --configuration production`** — production build enables AOT compilation, tree shaking, and strict template checking. A TypeScript error that passes dev build can still fail prod build. CI catches this before it reaches deployment.

**`.env.ci` file** (`backend/.env.ci`):
```
DEEPSEEK_API_KEY=  # intentionally unset — all LLM calls mocked
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
LOG_LEVEL=WARNING
```

### Senior interview talking point

"In bench-resource-optimizer, every PR triggers parallel pytest and ng build jobs. A failing test blocks the merge — there is no bypass. The backend job runs in under 2 seconds because all 144 tests are pure unit tests with mocked LLM and SQLite tmp_path fixtures. No external services means no flakiness from network timeouts. The frontend job validates production AOT compilation — a TypeScript error that slips past dev mode gets caught here. This is the same CI pattern as AstroIntel: treat AI code like production software. No untested code ships."

---

## ★ YOUR 5 PROJECTS — Monitoring in Production

| Project | What you monitor | Where |
|---------|----------------|-------|
| **AstroIntel 360°** | Token usage per domain agent. Cache hit rates. Circuit breaker state. Hallucination audit count. RAGAS proxy metrics per run. | `/api/v1/metrics` live dashboard. Correlation IDs on every request. |
| **Bench Resource Optimizer** | Request latency. Cache hit rates (L1/L2 separate). Guardrail trigger counts (G1–G5). Circuit breaker state. SSE streaming TTFT. RAGAS scores per query. | `/metrics` endpoint. SQLite `ragas` table. SonarQube for code quality. |
| **RunbookAI** | Service version + phase. Database status. Conflict detection counts per runbook pair. Query response times. | `/health` endpoint. Conflict score in every response. |
| **Agentic Growth OS** | ROI per run. CTR trend. Learning badge per improved run. Run history with timestamps. | Campaign Dashboard in Angular frontend. |
| **Universal Agent** | Locked state. Active sessions. Tools list. RAG enabled. All 5 agents probed every 15s. | `/agent/health`. `/agents` registry. Agent Dashboard UI at `/agents-dashboard`. |

**Interview line:** "AstroIntel's hallucination_audit field in every run record means I can track the suppression rate over time without reviewing individual responses. If the daily suppression rate starts rising, it means the consensus architecture is degrading — maybe a domain agent's prompts drifted or the model changed behavior. That's proactive monitoring, not reactive firefighting."
