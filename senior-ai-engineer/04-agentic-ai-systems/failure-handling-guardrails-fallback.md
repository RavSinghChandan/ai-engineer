# Senior AI Engineer — Module 4
# Topic: Failure Handling, Guardrails, and Fallback Design

---

## 1. Intuition

An AI system that works 95% of the time is not a production system — it is a demo that will fail in front of the CEO during the most important demo.

Senior engineers design failure handling before writing the happy path. Every LLM call fails sometimes. Every tool fails sometimes. Every RAG retrieval sometimes returns nothing. The question is never "will it fail?" — it is "what happens when it does?"

---

## 2. Core Concept

### Failure Categories

**LLM API failures:**
- Rate limit (429): too many requests — back off and retry
- Timeout: API hung or slow — abort after threshold, retry or fallback
- Context length exceeded: prompt too large — compress and retry
- Model unavailable: API outage — fallback to alternative model

**Output failures:**
- Malformed JSON: LLM did not follow output schema — retry with explicit repair prompt
- Empty response: LLM returned nothing — retry with different prompt
- Hallucinated content: faithfulness score below threshold — return fallback message

**Retrieval failures:**
- No relevant chunks: similarity below threshold — return "no information found"
- Stale data: retrieved correct document but content outdated — trigger re-ingestion

**Agent/tool failures:**
- Tool timeout: external API slow — return graceful error to LLM
- Tool validation error: LLM passed wrong arguments — return structured error for self-correction
- Agent loop: agent calling same tool repeatedly — detect and break loop

### Guardrails

Input guardrails (before LLM call):
- Content moderation: reject harmful/offensive input
- Injection detection: block prompt injection attempts
- Rate limiting: per-user request throttling

Output guardrails (after LLM call):
- Faithfulness check: block responses that hallucinate beyond context
- Topic filter: block off-topic responses in constrained bots
- PII detection: block responses that leak personal data

---

## 3. Why / When It Matters

Every production AI system needs:
- Retry logic: LLM API calls fail transiently — retries recover without user impact
- Fallback messages: when all retries fail, return a useful message, not an exception stack trace
- Output validation: never trust LLM output format without validation — parse errors cascade
- Circuit breaker: sustained failures should stop traffic to the failing component, not queue it up

The cost of missing these: silent failures, corrupted data, users seeing error stack traces, production incidents at 3am.

---

## 4. How It Works (Failure Handling Architecture)

```
LLM Call Pipeline with Full Failure Handling:

User Input
    ↓
[INPUT GUARDRAIL] → reject if harmful/injection/rate limit
    ↓
LLM Call with:
  - Retry (3 attempts, exponential backoff)
  - Timeout (30s hard limit)
  - Model fallback (GPT-4o → GPT-4o-mini → Claude Haiku)
    ↓
[OUTPUT GUARDRAIL] → validate format, faithfulness, topic
    ↓
[OUTPUT REPAIR] → if JSON malformed, retry with repair prompt
    ↓
[FALLBACK] → if all else fails, return safe default response
    ↓
Log: all inputs, outputs, failures, metrics
```

---

## 5. Code Skeleton (Production-Grade)

```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from openai import RateLimitError, APITimeoutError, APIConnectionError
import json

# Retry with exponential backoff
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type((RateLimitError, APITimeoutError, APIConnectionError))
)
def call_llm_with_retry(system_prompt: str, user_message: str, model: str = "gpt-4o-mini") -> str:
    return openai.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        max_tokens=500,
        timeout=30
    ).choices[0].message.content

# Model fallback chain
FALLBACK_MODELS = ["gpt-4o", "gpt-4o-mini", "claude-haiku-3-5"]

def call_with_fallback(system_prompt: str, user_message: str) -> str:
    last_error = None
    for model in FALLBACK_MODELS:
        try:
            return call_llm_with_retry(system_prompt, user_message, model=model)
        except Exception as e:
            logger.warning(f"Model {model} failed: {e}")
            last_error = e
            continue
    raise RuntimeError(f"All models failed. Last error: {last_error}")

# JSON output repair
def get_json_output(system_prompt: str, user_message: str, schema_hint: str) -> dict:
    response = call_with_fallback(system_prompt, user_message)
    
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        logger.warning("JSON parse failed — attempting repair")
        repair_response = call_with_fallback(
            "You are a JSON repair assistant. Fix the JSON and return only valid JSON.",
            f"Invalid JSON to fix:\n{response}\n\nExpected schema: {schema_hint}"
        )
        try:
            return json.loads(repair_response)
        except json.JSONDecodeError:
            logger.error("JSON repair also failed")
            raise

# Guardrail: output topic filter for constrained chatbots
ALLOWED_TOPICS = ["product", "order", "refund", "shipping", "account"]

def topic_guardrail(user_input: str, response: str) -> str:
    topic_check = call_with_fallback(
        "You are a content classifier. Is this response on-topic for a customer support chatbot? Answer yes or no.",
        f"Response: {response}"
    )
    if "no" in topic_check.lower():
        return "I can only help with questions about our products and services. Please contact us at support@company.com for other inquiries."
    return response

# Circuit breaker (simple implementation)
class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 60):
        self.failures = 0
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.last_failure_time = 0
        self.state = "closed"  # closed = normal, open = failing, half-open = testing
    
    def call(self, func, *args, **kwargs):
        import time
        
        if self.state == "open":
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = "half-open"
            else:
                raise RuntimeError("Circuit breaker open — service unavailable")
        
        try:
            result = func(*args, **kwargs)
            if self.state == "half-open":
                self.state = "closed"
                self.failures = 0
            return result
        except Exception as e:
            self.failures += 1
            self.last_failure_time = time.time()
            if self.failures >= self.failure_threshold:
                self.state = "open"
                logger.error(f"Circuit breaker opened after {self.failures} failures")
            raise

# Full safe pipeline
llm_circuit_breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=60)

def safe_llm_response(user_query: str, context: str) -> str:
    # Input guardrail
    if detect_prompt_injection(user_query):
        return "I can only help with questions about our products."
    
    system_prompt = "Answer only from provided context."
    user_message = f"Context: {context}\n\nQuestion: {user_query}"
    
    try:
        response = llm_circuit_breaker.call(call_with_fallback, system_prompt, user_message)
    except RuntimeError as e:
        logger.error(f"LLM pipeline failed: {e}")
        return "I'm having trouble processing your request right now. Please try again in a moment."
    
    # Output guardrail
    return topic_guardrail(user_query, response)
```

---

## 6. Example (From Your Projects)

**AstroIntel — failure handling per agent:**

Each domain agent runs in a ThreadPoolExecutor with `future.result(timeout=30)`.
If an agent fails (timeout, LLM error, JSON parse error):
- The exception is caught in the executor loop
- That agent's output is set to `{"confidence": "LOW", "insight": "Analysis unavailable for this domain"}`
- The consensus agent still runs with the available outputs — it just sees fewer HIGH confidence signals

Key design decision: agent failure = LOW confidence contribution, not system failure.
A user query always gets a response. The confidence level reflects missing domain inputs.

In interview: "The failure handling in AstroIntel was designed so that no single agent failure could crash the entire analysis. Each failed agent gracefully contributes a LOW confidence placeholder. The system degrades gracefully — with 4 of 5 agents succeeding, the user still gets a meaningful, just slightly less confident analysis."

---

**AstroIntel — Production Guardrails (G1–G4) — implemented 2026-05-14:**

Four production guardrails were added non-invasively to the pipeline without touching graph structure or agent core logic. All implemented in `guardrails/production.py` and wired at the correct boundary points.

**G1 — Rate Limiter** (`guardrails/production.py` → wired in `routers/analysis.py`):

Sliding-window rate limiter, keyed per `user_id`. Default: 10 requests per 60 seconds.
Uses a `deque` per user to track timestamps — evicts timestamps outside the window on each check, O(1) amortized.
Wired at the very top of `POST /api/v1/analysis/run`, before cache check or any LLM call.
Returns HTTP 429 with retry-in seconds when the limit is exceeded.

```python
# routers/analysis.py — wired at top of run_analysis()
from guardrails.production import rate_limiter

allowed, reason = rate_limiter.is_allowed(req.user_id or "anonymous")
if not allowed:
    raise HTTPException(status_code=429, detail=reason)
```

Test results (live HTTP):
- Requests 1–10 → HTTP 200 (allowed)
- Request 11 → HTTP 429 with `"Rate limit exceeded: 10 requests per 60s. Retry in 59.3s."`
- Different user_id → allowed independently (isolated sliding windows)

**G2 — Circuit Breaker** (`guardrails/production.py` → wired in `utils/deepseek_client.py`):

Three-state machine: CLOSED → OPEN (after 5 failures) → HALF_OPEN (after 60s recovery timeout) → CLOSED (after successful probe).
Wraps the actual `urllib.request.urlopen()` HTTP call, not the whole `call()` function — so token accounting and response parsing still happen correctly on success.
Raises `CircuitOpenError` (subclass of Exception) when OPEN, caught at the router level and returned as 503.

```python
# utils/deepseek_client.py
from guardrails.production import llm_circuit_breaker, CircuitOpenError

def _do_http_call():
    with urllib.request.urlopen(http_req, timeout=120) as resp:
        return json.loads(resp.read().decode())

try:
    data = llm_circuit_breaker.call(_do_http_call)
except CircuitOpenError as exc:
    raise RuntimeError(str(exc)) from exc
```

Test results (unit):
- 3 consecutive failures → state transitions CLOSED → OPEN
- Call while OPEN → fails fast, no HTTP request made
- After 2s recovery timeout → state HALF_OPEN, one probe allowed
- Successful probe → state CLOSED (recovered)
- Failed probe in HALF_OPEN → state OPEN again

Admin endpoints added:
- `GET /guardrails/stats` — live state of rate limiter and circuit breaker
- `POST /guardrails/circuit-breaker/reset` — manual reset to CLOSED (for ops team)

**G3 — JSON Output Repair** (`guardrails/production.py` → wired in `rag/multi_query.py`):

4-level repair cascade:
1. Direct `json.loads()` — clean parse, no repair flag
2. Strip markdown code fences (` ```json ... ``` `) — LLM often wraps JSON in fences
3. Regex extraction — find first `{...}` or `[...]` block in prose output
4. LLM repair call — send malformed output back to LLM with "fix this JSON" prompt (optional, requires `llm_caller` arg)

Wired in `rag/multi_query.py` where the LLM returns a JSON array of query variants:

```python
# rag/multi_query.py
from guardrails.production import repair_json

parsed, was_repaired = repair_json(raw)
if parsed is None:
    return []  # graceful degradation — use original query
if was_repaired:
    logger.info("multi_query: repaired malformed JSON from LLM")
variants = parsed if isinstance(parsed, list) else []
```

Test results (unit):
- Valid JSON → (dict, False) — no repair, fast path
- Markdown-fenced → (dict, True) — fence-stripped
- JSON buried in prose → (dict, True) — regex extracted
- Completely broken text → (None, True) — graceful None, caller degrades
- Partial `{` without close → (None, True) — graceful None

**G4 — PII Output Filter** (`guardrails/production.py` → wired in `agents/admin_review_agent.py`):

Two-layer scrub:
1. Exact field replacement — replaces verbatim profile values (DOB, time of birth, place, pincode) with `[birth date]`, `[birth time]`, `[birth place]`, `[pincode]` placeholders
2. Regex pattern scan — flags date patterns (YYYY-MM-DD, DD/MM/YYYY), time patterns, and coordinate patterns even if not an exact field match

Wired at the final step of `admin_review_agent_node()`, after all insight content is assembled, before writing to state:

```python
# agents/admin_review_agent.py
from guardrails.production import filter_pii_from_admin_review

profile = state.get("user_profile", {})
admin_review, scrub_count = filter_pii_from_admin_review(admin_review, profile)
state["admin_review"] = admin_review
```

Test results (unit):
- Clean insight → passes through unchanged, pii_found=False
- DOB `1992-04-15` in insight → replaced with `[birth date]`
- `Chandigarh` in insight → replaced with `[birth place]`
- `06:30 AM` pattern → regex flags it, pii_found=True
- Full admin_review with 2 insights (1 dirty, 1 clean) → 1 scrubbed, 1 untouched, scrub_count=1

All 4 guardrails tested: 26 unit tests (positive + negative scenarios) — all pass.
Live HTTP tests: rate limiter fires at request 11 (HTTP 429), guardrail stats endpoint returns correct state, circuit breaker reset endpoint works.

---

**Bench Resource Optimizer — Production Guardrails (G1–G5) — implemented 2026-05-15:**

Five production guardrails added non-invasively to the RAG-heavy BRO pipeline. Architecture: all guardrails in `guardrails/production.py`, wired at the correct boundary in `main.py` without touching existing agent logic.

Key design difference from AstroIntel: BRO is a request-per-user pipeline (not a multi-agent graph), so guardrails fire inside FastAPI endpoint handlers rather than as LangGraph nodes.

**G1 — Per-user Rate Limiter** (`guardrails/production.py → UserRateLimiter` → `main.py upload_cv + map_role`):

BRO already had an IP-level rate limiter (60 req/min, `middleware/rate_limit.py`).
G1 adds a finer-grained per-user_id limit: 20 LLM-backed requests per 60 seconds.
Motivation: an office Wi-Fi shares one IP. 100 employees share one IP address. The IP limiter can't prevent one employee from consuming all the DeepSeek budget for the others. G1 fixes this.
Wired in `upload_cv()` after `user_id` is assigned (new CV) and at the top of `map_role_endpoint()` before the LLM call.
Returns HTTP 429 with a specific reason string identifying the user_id.
Stats exposed at `GET /guardrails/stats → g1_rate_limiter`: tracked_users, current_counts per uid, total_allowed, total_blocked.

```python
# main.py — map_role_endpoint()
from guardrails.production import rate_limiter
allowed, reason = rate_limiter.is_allowed(req.user_id)
if not allowed:
    raise HTTPException(429, reason)
```

**G2 — Circuit Breaker Persistent Stats + Admin Reset** (`guardrails/production.py → all_breaker_stats()` → `main.py /guardrails/stats + /guardrails/circuit-breaker/reset`):

BRO already had a `CircuitBreaker` class per LLM operation in `utils/retry.py` (cv_parser, role_mapper).
The existing class tracks current failure count but has no persistent lifetime counters and no admin-accessible API.
G2 adds persistent `total_failures`, `total_successes`, `total_rejected` counters by monkey-patching `record_failure` / `record_success` at first stats export (idempotent).
Exposes `GET /guardrails/stats → g2_circuit_breakers` with all registered breakers.
`POST /guardrails/circuit-breaker/reset` forces all breakers to CLOSED (admin endpoint).
`POST /guardrails/circuit-breaker/{name}/reset` resets a specific breaker by name.

```python
# guardrails/production.py — all_breaker_stats()
from utils.retry import _breakers
for name, cb in _breakers.items():
    if not hasattr(cb, "_total_failures"):
        cb._total_failures = cb._total_successes = cb._total_rejected = 0
    # wrap record_failure / record_success to increment counters
```

**G3 — JSON Repair Cascade** (`guardrails/production.py → repair_json()` → `utils/json_parser.py → parse_llm_json()`):

BRO had `utils/json_parser.py` with fence-strip + regex extract, but no repair tracking and no graceful fallback return.
G3 extends it with a 4-level cascade: direct parse → fence strip → regex extract → fallback.
`parse_llm_json()` now delegates to `repair_json()` which tracks each level call count.
Stats exposed at `GET /guardrails/stats → g3_json_repair`: total_calls, direct_pct, fence_pct, regex_pct, fallback_pct, failure_pct.
If all 4 levels fail, returns `None` so the caller can handle gracefully instead of raising `JSONDecodeError`.

```python
# utils/json_parser.py — now delegates to G3
from guardrails.production import repair_json
parsed, level = repair_json(text, fallback=None)
if parsed is not None:
    return parsed
# fallback to original logic if G3 not importable
```

**G4 — PII Output Filter** (`guardrails/production.py → filter_pii_from_mapping()` → `main.py map_role_endpoint()`):

BRO already had input PII protection (injection detection on CV text in `guardrails/security.py`).
G4 adds output-side PII scrubbing: the role-mapping recommendation could echo back email or phone if the LLM was given user profile context.
`filter_pii_from_mapping(result, user_profile)` runs exact-match scrub on profile fields + regex scan for email/phone/date patterns.
Wired just before `return result` in `map_role_endpoint()`, after RAGAS eval.
Stats: `GET /guardrails/stats → g4_pii_filter`: total_outputs_checked, outputs_with_pii, fields_scrubbed.

```python
# main.py — map_role_endpoint() just before return
from guardrails.production import filter_pii_from_mapping
result, _pii_count = filter_pii_from_mapping(result, user.get("profile", {}))
```

**G5 — Graceful Degradation Tracker** (`guardrails/production.py → GracefulDegradationTracker` → `main.py` per endpoint):

Records per-request agent outcomes (cv_parser, role_mapper, planner, retrieval, llm_judge).
Status per agent: full / partial / fallback / failed / skipped.
`degradation_tracker.record_run(request_id, {agent: {status, note}})` called after each endpoint operation.
Domain availability% = (full + partial) / (full + partial + fallback + failed) * 100.
Stats: `GET /guardrails/stats → g5_graceful_degradation`: total_runs, overall_counts, agent_availability per agent, agent_health matrix, recent_runs feed (last 5).

```python
# main.py — after successful map_role
degradation_tracker.record_run(rid, {
    "role_mapper": {"status": "partial" if cache_hit else "full", "note": "cache_hit or llm_call"},
    "retrieval":   {"status": "full", "note": result.get("retrieval_method", "")},
})
# On failure:
degradation_tracker.record_run(rid, {"role_mapper": {"status": "failed", "note": str(e)[:80]}})
```

**Admin endpoints:**
```
GET  /guardrails/stats                         — all 5 guardrail stat blocks
POST /guardrails/circuit-breaker/reset         — reset all breakers → CLOSED
POST /guardrails/circuit-breaker/{name}/reset  — reset named breaker → CLOSED
```

**Frontend dashboard:**
Added to `metrics.component.ts`:
- G1–G4 card row: live stats, per-user bar charts, CB badge table, JSON cascade step diagram, PII chip grid
- G5 panel: KPI row (full/partial/fallback/failed/total), per-agent availability bars + health chip matrix, recent-runs feed with agent pip badges (CV/MAP/PLN/RAG/JDG)
- Pipeline Wire Map: visual showing exactly where each guardrail fires in the request flow
- Live Event Log: dark terminal, auto-detects state changes between 15s polls, color-coded by G1–G5 and event type
- Interview Explainer: enterprise-level justification for each guardrail visible at bottom of dashboard

**Verified live:**
- `GET /guardrails/stats` returns correct data after each request
- G1 tracks per-user counts in sliding window
- G2 both cv_parser and role_mapper breakers appear after first LLM calls
- G3 tracks every `parse_llm_json` call (direct parse = 100% on clean LLM output)
- G4 checks every map-role output, no PII in test profile
- G5 records 3 runs with `overall: full` after 3 requests
- CB reset returns `{status: reset, count: 2, state: closed}`
- Angular component compiles cleanly, `Application bundle generation complete`

---

## 7. Trade-offs

Aggressive retry:
+ Higher success rate, more resilient to transient failures
- Adds latency (backoff delays), can mask underlying problems

Immediate fallback (no retry):
+ Consistent fast response
- Misses transient failures that a retry would recover

Model fallback chain:
+ Higher availability — one model down doesn't mean system down
- Lower capability fallback — GPT-4o-mini may produce worse output than GPT-4o

Strict output validation (reject on parse error):
+ Ensures only valid outputs reach downstream code
- Increases retry rate, may return fallback message for edge cases

---

## 8. Interview Questions (Senior Level)

- How do you design a retry strategy for LLM API calls?

  **Answer:** Exponential backoff with jitter for rate limit errors (429) and server errors (503): start at 1 second, double on each retry, add random jitter to prevent thundering herd, cap at 60 seconds, max 3 retries. Do not retry on 4xx client errors (bad request, invalid API key) — these will never succeed. In Bench Resource Optimizer, the LLM client wraps every call with this strategy using the `tenacity` library, and all retry attempts are logged so we can distinguish transient failures from systemic ones.

- What is a circuit breaker and how does it apply to an LLM-powered service?

  **Answer:** A circuit breaker tracks the failure rate of LLM calls over a rolling window — when failure rate exceeds a threshold (e.g., 50% over 60 seconds), it "opens" and stops sending requests to the LLM entirely, returning a fallback response immediately. This prevents cascading failures where a degraded LLM causes your entire service to time out. In AstroIntel, the circuit breaker is per-agent — if the simplify_agent's LLM call circuit opens, the system returns the raw structured output from rule-based agents without the narrative synthesis layer, degrading gracefully rather than failing completely.

- How do you ensure an AI agent fails gracefully without showing the user a stack trace?

  **Answer:** Top-level exception handler in every endpoint catches all exceptions and maps them to user-friendly messages — the stack trace goes to logs with a correlation ID, the user sees "I'm having trouble with this request right now, please try again." Each agent in AstroIntel is wrapped in a try/except that catches any failure and returns a LOW confidence placeholder output rather than re-raising the exception. The user always receives a response; confidence levels reflect what data was available.

- Your LLM regularly returns malformed JSON. What is your systematic fix?

  **Answer:** Three-layer approach: first, add explicit JSON schema enforcement in the system prompt with a concrete example ("respond ONLY with valid JSON like: {...}"). Second, wrap the JSON parse call with a repair retry — on JSONDecodeError, send the raw response back to the LLM with "Fix this JSON, return only valid JSON" instruction. Third, if the repair also fails, log the raw output and return a structured fallback. In AstroIntel, each domain agent's prompt includes the exact schema and an example; the consensus agent validates on parse and triggers repair if needed. The repair retry resolves about 90% of parse failures without human intervention.

- How do you test failure handling in an AI system where failures are non-deterministic?

  **Answer:** *(Already covered in Advanced Follow-ups Q1 — skipped to avoid duplication.)*

---

## 9. Answer Framework

Step 1 — Categorize failure types:
"LLM failures fall into three categories: API failures (retry with backoff), output failures (validate and repair), and system failures (circuit breaker and graceful degradation)."

Step 2 — Layer the defenses:
"I apply three layers: retry logic for transient failures, model fallback for sustained failures, and a safe fallback message for total failure — never a raw exception to the user."

Step 3 — From your project:
"In AstroIntel, agent failures produce a LOW confidence placeholder. The system never crashes on a single agent failure — it degrades gracefully while being transparent about reduced confidence."

Step 4 — Circuit breaker:
"For high-traffic systems, I add a circuit breaker. If the LLM API failure rate exceeds 20% in a rolling window, the circuit opens and I return a graceful message without hammering the failing API."

Step 5 — Testing:
"I inject failures in testing — mock LLM calls that return errors, timeouts, and malformed JSON. My test suite verifies that each failure type triggers the correct handler and the user sees a graceful message, not an error."

---

## 10. Advanced Follow-ups

Q1: How do you test guardrails to ensure they work before deployment?

Answer:
Build an adversarial test suite — a collection of inputs specifically designed to trigger guardrail violations.
For injection guardrails: a set of 20-30 known injection patterns. Verify each is rejected.
For topic guardrails: a set of off-topic queries. Verify each returns the fallback message.
For output guardrails: mock LLM responses that are malformed JSON, off-topic, or low-faithfulness. Verify each triggers the correct handler.
Run this suite in CI — every deployment must pass before reaching production.
Also test that guardrails do NOT over-trigger: a set of legitimate queries that should pass through without rejection. If your injection detector flags "How do I update my account settings?" as injection, it needs tuning.

---

Q2: How do you handle a failure mode you did not anticipate at design time?

Answer:
First: detect that something new is failing. This requires comprehensive logging of every LLM call input, output, and error. Without logs, you cannot see new failure modes.
Second: once detected, classify the failure. Is it an input problem (prompt caused it)? An output problem (LLM output format broke)? An infrastructure problem (API change by provider)?
Third: add a specific handler for this failure mode and update the test suite to cover it.
Fourth: add monitoring for this failure pattern going forward so you catch recurrences immediately.
The anti-pattern is trying to anticipate every failure mode upfront — you cannot. The correct posture is: log everything, monitor anomalies, add handlers as new failure modes are discovered in production. This is the same debugging discipline as backend service production incidents, just applied to AI pipelines.

---

Q3: How do you prevent cascading failures when one component of an AI pipeline fails?

Answer:
The same patterns that prevent cascading failures in microservices apply here.
First, timeouts at every boundary: every LLM call, every tool call, every external API call has a hard timeout. No component can wait indefinitely for a hung dependency.
Second, bulkheads: run different types of requests in separate thread pools or process pools. If the translation agent pool is exhausted (slow LLM calls), it does not block the analysis agent pool.
Third, fail fast: if a required upstream component fails, fail the current component immediately rather than accumulating partially completed state that wastes resources.
Fourth, async where possible: if components can be decoupled (analysis → translation in AstroIntel), run them asynchronously. Translation failure does not block the user from receiving the analysis.
This is Resilience4j pattern library from Spring Boot, applied at the AI pipeline level — the concepts are identical.

---

Q4: How do you handle LLM output that is correct in content but wrong in format?

Answer:
Three levels of handling.
First, prompt hardening: the system prompt explicitly specifies the output format with an example. "Return ONLY valid JSON in this exact format: {...}. No explanation, no markdown, only JSON."
Second, extraction fallback: if the output is not pure JSON but contains JSON (e.g., wrapped in markdown code blocks or prose), use regex extraction before declaring it invalid. `re.search(r'\{.*\}', response, re.DOTALL)` catches embedded JSON in most cases.
Third, LLM repair: pass the malformed output to a second LLM call: "Fix this to be valid JSON conforming to the schema. Return only the fixed JSON." This works for most format errors with one retry.
Monitoring: track JSON parse failure rate per prompt. If it is above 2%, the system prompt is not clear enough — tighten the output instructions.
If it is above 10%: the model being used may not reliably follow JSON instructions — consider switching to a model with better instruction following or use function calling / structured outputs API instead.

---

Q5: How do you design a fallback strategy when the entire LLM API is down for 2 hours?

Answer:
A 2-hour outage requires more than retry — it requires a strategy for operating without the LLM.
For read-only informational use cases (customer support chatbot): serve a degraded mode that returns only high-confidence cached responses from the last N days. Users get answers to common questions from cache. For uncached queries, return "Our AI assistant is temporarily unavailable. Please email support@company.com."
For critical operations (AI-generated reports, analysis): queue the requests. When the API comes back up, process the queued requests and notify users that their report is ready. Do not make the user wait in real-time.
For real-time interactive use cases where caching is not possible: show a maintenance page or static fallback content. Better to acknowledge degradation than to spin forever or show errors.
Pre-build static responses for your top-20 most common queries. These never require an LLM call and are always available.
The key insight: "the AI is down" should not mean "the service is down." Design the system so the LLM is an enhancement, not a single point of failure.
