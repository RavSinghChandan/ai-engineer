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
- What is a circuit breaker and how does it apply to an LLM-powered service?
- How do you ensure an AI agent fails gracefully without showing the user a stack trace?
- Your LLM regularly returns malformed JSON. What is your systematic fix?
- How do you test failure handling in an AI system where failures are non-deterministic?

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
