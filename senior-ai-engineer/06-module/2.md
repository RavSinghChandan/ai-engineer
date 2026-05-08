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

**AstroIntel — what monitoring I would add:**

Currently no formal monitoring. For production:
- Per-agent latency tracking: detect which agent is the bottleneck
- Consensus confidence distribution: track % of HIGH/MEDIUM/LOW over time — if LOW increases, model quality is degrading
- Translation faithfulness: spot-check 10 random translations weekly — catch translation quality regression
- Cost per report: track daily, alert if it increases by more than 20%

In interview: "AstroIntel's pipeline has 6 distinct steps. I would track per-step latency so I can see if, for example, the translation agent is getting slower. I would track consensus confidence distribution over time — if LOW confidence responses increase from 15% to 30%, that's an early signal of model quality degradation worth investigating."

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
- What metrics do you track for an LLM service beyond standard API metrics?
- How do you build a dashboard that shows the health of a RAG system?
- Your faithfulness score has been declining for 2 weeks. What do you investigate?
- How do you monitor cost and alert before you go over budget?

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
