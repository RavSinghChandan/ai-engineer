# Senior AI Engineer — Module 5
# Topic: AI API Gateway Design — Rate Limiting, Auth, Quota, Fallback (Senior-Only Topic)

---

## 1. Intuition

Every production AI service needs an API gateway layer between your clients and your LLM infrastructure.
Without it: one runaway client can exhaust your entire LLM quota, security tokens leak, costs spiral.

This is pure backend engineering applied to AI — it is where your Java/Spring background is directly applicable.

---

## 2. Core Concept

An AI API gateway provides:
- Authentication: verify who is calling
- Authorization: what are they allowed to call
- Rate limiting: how many calls per time window
- Quota management: how many tokens/cost per billing period
- Routing: which LLM provider / model for this request
- Fallback: if primary LLM is unavailable, route to secondary
- Logging: capture every request for billing, audit, debugging

---

## 3. Architecture

```
Client Request
    ↓
[API Gateway]
  ├── Auth Middleware (JWT validation, API key lookup)
  ├── Rate Limiter (requests per minute per user/tenant)
  ├── Quota Check (tokens/cost consumed this billing period)
  ├── Request Router (which model / provider)
  ├── Request Logger (async — non-blocking)
  └── Proxy to LLM Provider
    ↓
LLM Provider (OpenAI / Anthropic / Azure OpenAI)
    ↓
[Response Pipeline]
  ├── Token Counter (measure actual usage)
  ├── Cost Calculator
  ├── Quota Update (atomic increment)
  ├── Response Logger
  └── Response to Client
```

---

## 4. Code Skeleton (Production-Grade)

```python
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import time
import redis

app = FastAPI()
r = redis.Redis()
security = HTTPBearer()

# Auth middleware
def verify_api_key(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    api_key = credentials.credentials
    user_data = r.hgetall(f"api_key:{api_key}")
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return {k.decode(): v.decode() for k, v in user_data.items()}

# Rate limiter (sliding window)
def check_rate_limit(user_id: str, limit: int = 60, window: int = 60) -> bool:
    now = time.time()
    key = f"rate:{user_id}"
    pipe = r.pipeline()
    pipe.zremrangebyscore(key, 0, now - window)
    pipe.zadd(key, {str(now): now})
    pipe.zcard(key)
    pipe.expire(key, window)
    results = pipe.execute()
    return results[2] <= limit

# Quota check (token budget per billing period)
def check_and_update_quota(tenant_id: str, estimated_tokens: int) -> bool:
    quota_key = f"quota:{tenant_id}:{get_billing_period()}"
    current = int(r.get(quota_key) or 0)
    limit = get_tenant_quota_limit(tenant_id)  # from DB
    if current + estimated_tokens > limit:
        return False
    r.incrby(quota_key, estimated_tokens)
    r.expire(quota_key, 32 * 24 * 3600)  # 32 days TTL
    return True

# Model router with fallback
PROVIDER_PRIORITY = [
    {"provider": "openai",    "model": "gpt-4o-mini",        "weight": 80},
    {"provider": "anthropic", "model": "claude-haiku-3-5",   "weight": 15},
    {"provider": "azure",     "model": "gpt-4o-mini-azure",  "weight": 5},
]

def route_request(complexity: str = "simple") -> dict:
    if complexity == "complex":
        return {"provider": "openai", "model": "gpt-4o"}
    
    # Check provider health
    for provider_config in PROVIDER_PRIORITY:
        if is_provider_healthy(provider_config["provider"]):
            return provider_config
    
    raise HTTPException(status_code=503, detail="All LLM providers unavailable")

# Full gateway endpoint
@app.post("/v1/chat")
async def gateway_chat(request: Request, user: dict = Depends(verify_api_key)):
    body = await request.json()
    user_id = user["user_id"]
    tenant_id = user["tenant_id"]
    
    # Rate limit
    if not check_rate_limit(user_id, limit=60):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Retry after 60s.")
    
    # Estimate tokens for quota check
    estimated_tokens = count_tokens(str(body.get("messages", "")))
    
    # Quota check
    if not check_and_update_quota(tenant_id, estimated_tokens):
        raise HTTPException(status_code=402, detail="Token quota exceeded for this billing period.")
    
    # Route
    complexity = "complex" if body.get("complex_task") else "simple"
    provider = route_request(complexity)
    
    # Execute
    try:
        response = await call_provider(provider, body)
    except ProviderException:
        # Fallback
        fallback_provider = get_fallback_provider(provider["provider"])
        response = await call_provider(fallback_provider, body)
    
    # Log async (non-blocking)
    asyncio.create_task(log_request(
        user_id=user_id, tenant_id=tenant_id,
        model=provider["model"],
        input_tokens=response.usage.prompt_tokens,
        output_tokens=response.usage.completion_tokens
    ))
    
    return response
```

---

## 5. Example (From Your Projects — Senior Framing)

**AstroIntel — implicit gateway needs:**

Currently no gateway layer. For a production multi-tenant deployment:
- Each customer gets an API key stored in the gateway
- Each customer has a monthly token quota (e.g., 10M tokens/month)
- Rate limit: 10 analysis requests/minute per user (prevents runaway batch usage)
- Model routing: simple queries → GPT-4o-mini, complex multi-question analysis → GPT-4o
- Provider fallback: if OpenAI is down, route to Claude Haiku

In interview: "For AstroIntel at scale, I would add an API gateway layer between the frontend and the LLM pipeline. It handles authentication, per-customer quotas, rate limiting, and provider fallback. This is standard backend infrastructure — the same patterns as any Java API gateway but with token-based quota instead of request-based quota."

---

## 6. Trade-offs

Build vs buy API gateway:
Build (FastAPI middleware): full control, no vendor lock-in, fits exactly your needs.
Buy (Kong, AWS API Gateway + custom authorizer): less code to maintain, proven at scale, adds operational complexity.
For most teams: build for the AI-specific parts (token quota, model routing), use existing infrastructure for auth and basic rate limiting.

Token-based vs request-based quota:
Request-based: simple to implement, easy for users to understand.
Token-based: more accurate — one long document query costs 100× more than a short query. Token-based quota prevents users from gaming request limits with very long inputs.

---

## 7. Interview Questions (Senior Level)

- How do you implement per-tenant token quota in an LLM API service?
- What is the difference between rate limiting and quota management?
- How do you design automatic LLM provider failover?
- How do you prevent a single tenant from exhausting your shared LLM API quota?
- How does your Java/Spring API gateway experience translate to building an AI API gateway?

---

## 8. Answer Framework

Step 1 — Explain the components:
"An AI API gateway has six concerns: auth, rate limiting, quota management, model routing, provider fallback, and usage logging."

Step 2 — Distinguish rate limit vs quota:
"Rate limiting is requests per minute — prevents burst abuse. Quota is total tokens per billing period — prevents total cost overrun. Both are needed."

Step 3 — From your background:
"This is standard API gateway design from Spring Boot and Java microservices — JWT auth, Redis-backed rate limiting, circuit breaker for provider fallback. The AI-specific addition is token-based quota instead of request count."

Step 4 — Provider fallback:
"OpenAI has 99.9% uptime SLA but that means 8 hours downtime per year. For production, always have a secondary provider. I route OpenAI → Claude Haiku on failure, with a 3-retry circuit breaker before switching."

Step 5 — Logging:
"Every request logs: user_id, tenant_id, model, input_tokens, output_tokens, cost_usd. This powers billing, cost analysis, and security audit."

---

## 10. Advanced Follow-ups

Q1: How do you prevent a buggy client from exhausting your OpenAI quota?

Answer:
Three controls.
Per-user rate limit: 60 requests/minute. A buggy client in a loop cannot send more than 60 RPM, capping damage.
Per-user token quota: if a user exhausts their daily token quota, all subsequent requests return 402 until the quota resets. The buggy client eventually self-limits.
Circuit breaker per user: if a single user triggers 10 consecutive errors in 1 minute, block that user's API key for 5 minutes. Protects against retry storms.
Monitoring: alert if any single user or tenant exceeds 10% of total daily token spend. Investigate immediately — either they have a legitimate spike or a bug.

Q2: How do you implement streaming through an API gateway?

Answer:
Streaming adds complexity to gateway middleware — you cannot wait for the full response to apply post-processing (logging, token counting) without buffering the stream.
Two approaches.
Pass-through streaming: the gateway proxies the SSE stream directly to the client, and uses a background task to read and process the complete response after it arrives.
Buffer-and-stream: the gateway buffers the full stream, applies validation/logging, then re-streams to the client. Higher latency but allows full response inspection before sending to client.
For most production cases: pass-through streaming with background logging. The 50ms saved by not buffering is meaningful for real-time UX.
Token counting for streaming: use tiktoken to count tokens from the streamed chunks as they arrive, rather than waiting for the full response. Tally is accurate and non-blocking.

Q3: How do you implement multi-model routing (use GPT-4o for some, Claude for others)?

Answer:
Routing logic is a function of request properties: complexity, latency requirement, cost tier, and provider availability.
Implementation: a router that scores each provider for a request:
```python
def score_provider(provider: str, request: dict) -> float:
    score = provider_health_score(provider)  # 0 if down
    if request.get("requires_vision") and not provider_supports_vision(provider):
        score = 0
    if request.get("max_latency_ms", 9999) < 1000 and provider_avg_latency(provider) > 800:
        score *= 0.5
    return score
```
Weighted random selection over non-zero scores allows A/B testing different providers while maintaining a primary preference.
Store provider selection in the request log for quality analysis: "GPT-4o-mini queries had 0.89 faithfulness vs Claude Haiku's 0.91 on this task type" → inform future routing decisions.

Q4: How does your Spring Boot API gateway experience apply here?

Answer:
Almost line-for-line equivalent.
Spring Security (JWT auth) → FastAPI depends with HTTPBearer.
Spring's rate limiting with Redis → Redis sliding window in Python.
Spring Cloud Gateway's circuit breaker (Resilience4j) → Python Circuit breaker on LLM provider calls.
Spring Boot Actuator metrics → Prometheus metrics in FastAPI.
The patterns are identical: middleware chain, each concern in its own layer, Redis for distributed state, structured logging for observability.
The difference is the domain: instead of checking request per second for a REST API, I check tokens per billing period for an LLM API. The architecture is the same.
What I bring from Java: the discipline of not reinventing these patterns. Rate limiting, circuit breaking, and quota management are solved problems in the Java ecosystem. I apply the same solutions in Python, not a custom implementation from scratch.
