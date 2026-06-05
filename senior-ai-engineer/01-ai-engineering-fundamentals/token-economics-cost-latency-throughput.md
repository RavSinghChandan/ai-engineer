# Senior AI Engineer — Module 1
# Topic: Token Economics — Cost, Latency, and Throughput (Senior-Only Topic)

---

## 1. Intuition

No one teaches token economics in courses. Everyone learns it the hard way when their first production LLM bill arrives.

As a senior AI engineer, you are responsible for shipping AI features that are sustainable — not just features that work.
Token economics is how you prove you can run an AI system in production without bankrupting the business.

---

## 2. Core Concept

### What is a Token?
A token is the basic unit of LLM input/output.
Roughly 1 token ≈ 4 characters ≈ 0.75 words.
"Hello, how are you today?" ≈ 6 tokens.
A full page of text ≈ 500-700 tokens.

### The Cost Model
LLM APIs charge per 1 million tokens (input + output separately):

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|---|---|---|
| GPT-4o | $5 | $15 |
| GPT-4o-mini | $0.15 | $0.60 |
| Claude Sonnet 3.5 | $3 | $15 |
| Claude Haiku 3.5 | $0.80 | $4 |
| Gemini 1.5 Flash | $0.075 | $0.30 |

Key insight: output tokens cost 3-5x more than input tokens. Verbose output = expensive output.

### Latency Model
Latency = Time to First Token (TTFT) + Time to Generate All Output Tokens

- TTFT: depends on prompt size and model — larger context = longer TTFT
- Generation: roughly 30-60 tokens/second for hosted models
- Total: a 500-token response at 50 tokens/sec = ~10 seconds + TTFT

### Throughput
Throughput = requests per second you can sustain within rate limits.
OpenAI limits: typically 500-3500 RPM (requests per minute) depending on tier.
Under load: queue requests, use async processing, implement backpressure.

---

## 3. Why / When It Matters

Token economics matters in every production decision:

- Choosing a model: GPT-4o vs GPT-4o-mini is a 30x cost difference. Use GPT-4o only when needed.
- Prompt design: every token in your system prompt costs money on every request.
- max_tokens: leaving this uncapped means a verbose response bankrupts you.
- RAG chunk size: larger chunks = more input tokens = more cost.
- Caching: a cache hit = zero LLM cost. Even 20% cache hit rate cuts spend significantly.
- Streaming: does not reduce cost but improves perceived latency (user sees first token faster).

---

## 4. How It Works (Cost Calculation)

```
Daily cost estimate formula:

daily_requests × avg_input_tokens × input_price_per_token
+ daily_requests × avg_output_tokens × output_price_per_token
= daily_LLM_cost

Example:
10,000 daily requests
Avg input: 800 tokens (system prompt 300 + retrieved context 400 + user query 100)
Avg output: 300 tokens

With GPT-4o:
Input: 10,000 × 800 × ($5 / 1,000,000) = $40/day
Output: 10,000 × 300 × ($15 / 1,000,000) = $45/day
Total: $85/day = $2,550/month

With GPT-4o-mini (same requests):
Input: 10,000 × 800 × ($0.15 / 1,000,000) = $1.20/day
Output: 10,000 × 300 × ($0.60 / 1,000,000) = $1.80/day
Total: $3/day = $90/month

Difference: $2,550 vs $90 per month — 28x — for the same traffic.
```

---

## 5. Code Skeleton (Production-Grade)

```python
import tiktoken

def count_tokens(text: str, model: str = "gpt-4o") -> int:
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))

def estimate_cost(input_tokens: int, output_tokens: int, model: str = "gpt-4o-mini") -> float:
    pricing = {
        "gpt-4o":       {"input": 5.0,  "output": 15.0},   # per 1M tokens
        "gpt-4o-mini":  {"input": 0.15, "output": 0.60},
        "claude-sonnet-3-5": {"input": 3.0, "output": 15.0},
        "claude-haiku-3-5":  {"input": 0.80, "output": 4.0},
    }
    p = pricing[model]
    return (input_tokens * p["input"] + output_tokens * p["output"]) / 1_000_000

# Production wrapper — logs token usage and cost per request
def call_llm_with_cost_tracking(system_prompt: str, user_message: str, model: str = "gpt-4o-mini") -> dict:
    input_text = system_prompt + user_message
    input_tokens = count_tokens(input_text, model)
    
    response = openai.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        max_tokens=400,   # always cap — never leave open
        temperature=0.2
    )
    
    output_tokens = response.usage.completion_tokens
    total_input_tokens = response.usage.prompt_tokens
    
    cost = estimate_cost(total_input_tokens, output_tokens, model)
    
    logger.info(f"model={model} | input_tokens={total_input_tokens} | output_tokens={output_tokens} | cost=${cost:.6f}")
    
    # Emit to metrics dashboard (Prometheus, Datadog, CloudWatch)
    metrics.increment("llm.cost_usd", cost)
    metrics.increment("llm.input_tokens", total_input_tokens)
    metrics.increment("llm.output_tokens", output_tokens)
    
    return {
        "content": response.choices[0].message.content,
        "cost": cost,
        "tokens": {"input": total_input_tokens, "output": output_tokens}
    }
```

### Model tiering router (route by complexity):

```python
def route_to_model(query: str, context_length: int) -> str:
    # Simple queries → cheap model
    # Complex reasoning or long context → capable model
    
    if context_length > 50_000:
        return "gpt-4o"   # large context needs capable model
    
    if any(kw in query.lower() for kw in ["analyze", "compare", "synthesize", "explain why"]):
        return "gpt-4o"   # complex reasoning
    
    return "gpt-4o-mini"  # default: cheap, fast
```

---

## 6. Example (From Your Projects)

**AstroIntel 360° — Real Token Economics Tracking (actually implemented):**

The key insight for AstroIntel: domain agents (astrology, numerology, palmistry, tarot, vastu) are fully rule-based — they fire zero LLM calls.
LLM is only called via DeepSeek (max_tokens=250, HTTP timeout=8s) for synthesis and report generation.

This means the cost model is: **cost per report ≈ $0.000137 (DeepSeek pricing: $0.14/1M input + $0.28/1M output)**

**DeepSeek pricing (add to cost table):**
| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|---|---|---|
| DeepSeek Chat | ~$0.14 | ~$0.28 |

At ~709 tokens per run (avg_prompt=437 + avg_completion=272), cost per analysis = $0.000137 — 500x cheaper than GPT-4o.

---

**Thread-local token accumulator (`utils/deepseek_client.py`):**

```python
import threading
_usage_local = threading.local()

def _acc() -> Dict[str, int]:
    if not hasattr(_usage_local, "data"):
        _usage_local.data = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "calls": 0}
    return _usage_local.data

def get_session_usage() -> Dict[str, int]:
    return dict(_acc())

def reset_session_usage() -> None:
    _usage_local.data = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "calls": 0}
```

Inside `call()` — after every DeepSeek API response:
```python
usage = data.get("usage", {})
acc = _acc()
acc["prompt_tokens"]     += usage.get("prompt_tokens", 0)
acc["completion_tokens"] += usage.get("completion_tokens", 0)
acc["total_tokens"]      += usage.get("total_tokens", 0)
acc["calls"]             += 1
```

No new function signature, no breaking change — accumulation happens transparently inside the existing `call()` function.

---

**Cost formula — DeepSeek pricing (`routers/analysis.py`):**
```python
# DeepSeek pricing: $0.14/1M input + $0.28/1M output
cost_usd = round(
    prompt_tokens     * 0.14 / 1_000_000 +
    completion_tokens * 0.28 / 1_000_000,
    6
)
```

---

**Per-phase token reset — prevents cross-request contamination:**
```python
# Before /run pipeline:
reset_session_usage()
t_start = time.time()
final_state = await loop.run_in_executor(None, run_pipeline, initial_state)
t_end = time.time()
tok = get_session_usage()   # real counts from this run

# Before /approve report generation:
reset_session_usage()
report = final_report_agent(...)
tok = get_session_usage()   # real counts from this approve call
# Update the existing RunRecord in the deque with approve-phase tokens
```

---

**`_record_approve_tokens()` — updates existing record in-place:**
```python
for record in reversed(list(collector._runs)):
    if record.session_id == session_id:
        record.prompt_tokens     += tok["prompt_tokens"]
        record.completion_tokens += tok["completion_tokens"]
        record.total_tokens      += tok["total_tokens"]
        record.llm_calls         += tok["calls"]
        record.cost_usd          += cost_usd
        record.estimated_tokens   = record.total_tokens
        break
```

This means after a full cycle (run + approve), the RunRecord holds the total real token cost for the complete user session.

---

**Token Economics section in the metrics dashboard (`/api/v1/metrics`):**
```json
"token_economics": {
  "has_real_data": true,
  "data_source": "DeepSeek API usage field",
  "avg_prompt_tokens":     437,
  "avg_completion_tokens": 272,
  "avg_total_tokens":      709,
  "avg_llm_calls":         1,
  "avg_cost_per_run_usd":  0.000137,
  "total_cost_usd":        0.000137,
  "cost_model":            "DeepSeek: $0.14/1M input + $0.28/1M output (deepseek-chat)",
  "tokens_per_insight":    101.3,
  "rule_based_note": "Domain agents = 0 tokens. LLM only in simplify_agent + /approve report_agent."
}
```

---

**Live numbers from first real test:**
```
prompt_tokens:     437
completion_tokens: 272
total_tokens:      709
llm_calls:         1
cost_per_report:   $0.000137
tokens_per_insight: 101.3
```
At 1,000 reports/month: $0.137/month total LLM cost — because only 1 LLM call per report.
This is the architecture-level cost optimization: rule-based agents doing the heavy lifting, LLM only for synthesis.

---

**In a senior interview, frame it this way:**
"AstroIntel's token economics are unusual — 5 domain agents fire zero LLM calls because they're rule-based.
The entire system makes exactly 1 LLM call during /run (simplify_agent for timing windows) and 1 during /approve (report generation).
I track this with a thread-local accumulator inside the shared DeepSeek client — every call() automatically adds to the session's token count.
Real measured cost: 437 input tokens, 272 output tokens, $0.000137 per report.
At 10,000 reports/month that's $1.37 — not a cost problem.
The token economics dashboard also shows `tokens_per_insight` as an efficiency metric — currently 101.3 tokens to produce each HIGH or MEDIUM confidence insight."

---

## 7. Trade-offs

Higher-capability model (GPT-4o):
+ Better reasoning, fewer errors, handles complex tasks
- 30-50x more expensive than mini models, slower TTFT

Smaller model (GPT-4o-mini, Haiku):
+ 30-50x cheaper, faster
- Misses nuance on complex tasks, more likely to hallucinate on edge cases

Aggressive max_tokens cap:
+ Hard cost ceiling, predictable spend
- Response may be truncated if actual content needs more tokens

Semantic caching:
+ Cache hit = zero cost, significant savings on repeated queries
- Engineering overhead, cache invalidation complexity, storage cost

Prompt compression:
+ Reduces input tokens = reduces cost
- Overly compressed prompts can degrade model output quality

---

## 8. Interview Questions (Senior Level)

- How do you estimate the monthly LLM cost for a system that handles 50,000 daily requests?

  **Answer:** Take your average prompt + completion tokens per request (e.g., 1,000 tokens), multiply by 50,000 requests/day × 30 days = 1.5B tokens/month. Divide by 1M and multiply by the model's per-1M rate — GPT-4o-mini costs ~$0.22/month for 1.5B input tokens; GPT-4o costs ~$7,500. This calculation is why I always present cost estimates before model selection, not after.

- Your LLM bill doubled this month. Walk me through your investigation.

  **Answer:** *(Already covered in Advanced Follow-ups Q1 — skipped to avoid duplication.)*

- How do you decide which tasks use GPT-4o vs GPT-4o-mini?

  **Answer:** I classify tasks by reasoning complexity and error cost. Simple extraction, classification, or FAQ answering goes to GPT-4o-mini — it's 30-50x cheaper and fast enough. Complex multi-step reasoning, document synthesis, or tasks where a wrong answer has downstream consequences get GPT-4o. In Bench Resource Optimizer, the gap analysis and plan generation use DeepSeek (similar capability tier to GPT-4o) while validation checks use a cheaper model — the quality requirement drove the model choice, not preference.

- What is the difference between P50 and P95 latency and why does it matter for an LLM API?

  **Answer:** P50 is the median — half of requests are faster, half are slower. P95 is the 95th percentile — 5% of requests are slower than this number. For an LLM API, P95 tells you the worst-case experience for 1 in 20 users, which is what defines your SLA. In AstroIntel, our P50 was ~2,000ms but P99 was much higher due to occasional network retries — I monitor both because optimizing only P50 while ignoring P99 means your slowest users get a broken experience.

- How do you implement semantic caching and what hit rate would you expect on a typical enterprise chatbot?

  **Answer:** *(Already covered in Advanced Follow-ups Q2 — skipped to avoid duplication.)*

---

## 9. Answer Framework

Step 1 — Show you think about cost proactively:
"Before choosing a model, I estimate the monthly token spend. 10,000 daily requests × 1,000 tokens average = 10B tokens/month. That's $50/month on GPT-4o-mini vs $1,500 on GPT-4o."

Step 2 — Explain your tiering strategy:
"I route simple tasks to the cheapest model and only use the capable model when reasoning complexity demands it. In my system, 80% of requests go to GPT-4o-mini."

Step 3 — Explain your cost levers:
"I cap max_tokens per use case, compress system prompts, and add semantic caching for repeated queries."

Step 4 — Tie to monitoring:
"I track cost per query as a dashboard metric. If it spikes, I check token counts first — prompt bloat from a recent release is the most common cause."

Step 5 — Close with business framing:
"At scale, a 30x cost difference between models is the difference between a profitable feature and one that costs more than it earns. That's why token economics is a first-class engineering concern, not an afterthought."

---

## 10. Advanced Follow-ups (Senior-Level Answers)

Q1: Your LLM bill doubled without a traffic increase. What happened and how do you find it?

Answer:
Start by querying your token usage logs — you are logging per request, right?
Compare average input tokens this week vs last week and average output tokens.
Most likely cause: a developer added more context to the system prompt or a new RAG chunk size increase doubled the input tokens per request.
Second possibility: output tokens spiked — someone removed the max_tokens cap or the model started being more verbose.
Third: a new feature with a different model tier was deployed — all requests now hitting GPT-4o instead of GPT-4o-mini.
Fix: add a daily alert if total_tokens_per_request increases more than 20% week-over-week. Catches this before the month-end billing surprise.

---

Q2: How do you implement semantic caching for LLM responses?

Answer:
The idea: instead of caching exact query strings (useless — users never ask the exact same thing), cache based on semantic similarity.
Architecture: when a query arrives, embed it and search your cache index (FAISS or Redis with vector support). If a semantically similar query (cosine similarity > 0.92) was already answered, return the cached response.
Implementation:
1. On cache miss: call LLM, store (embedding, response) pair in cache with TTL.
2. On cache hit: return stored response immediately, zero LLM cost.
Typical hit rate: 25-40% on enterprise chatbots where employees ask similar questions repeatedly.
Gotcha: cache TTL matters — stale responses on policy documents are a hallucination problem. Set TTL based on how often the underlying documents change.

---

Q3: A product manager wants to add a feature that calls GPT-4o for every user message. How do you push back?

Answer:
Frame it as a business risk, not a technical preference.
"GPT-4o at our current traffic level would cost $X/month for this feature alone. GPT-4o-mini with the same architecture costs $Y. I want to launch with GPT-4o-mini, measure quality metrics, and only upgrade to GPT-4o if we see meaningful quality gaps."
Then propose an A/B test: 5% of users on GPT-4o, 95% on GPT-4o-mini. Measure RAGAS faithfulness, user satisfaction, and task completion rate. If GPT-4o shows less than 5% quality improvement, the 30x cost is not justified.
This is the kind of reasoning that makes you a senior engineer, not just a developer — you own the cost-quality trade-off, not just the feature.

---

Q4: How does prompt caching (Anthropic/OpenAI feature) differ from semantic caching?

Answer:
Prompt caching is a provider-side feature — the API caches your system prompt so you are not charged for it on every request.
If your system prompt is 1,000 tokens and you make 10,000 requests/day, without caching that is 10M system prompt tokens/day. With prompt caching, you pay for it once per cache window (typically 5 minutes).
Anthropic Claude offers explicit prompt caching with cache_control markers. OpenAI automatically caches prompts above a certain length.
This is different from semantic caching, which is your application-side cache of full LLM responses.
In production: use both. Provider-side prompt caching reduces input token cost for static system prompts. Application-side semantic caching eliminates the LLM call entirely for repeated similar queries.
Combined, these two can reduce your LLM spend by 40-60% with minimal engineering effort.

---

Q5: How do you balance streaming (for UX) vs cost/throughput optimization?

Answer:
Streaming does not change token cost — you pay the same whether you stream or not.
Streaming improves perceived latency: users see the first token in 500ms instead of waiting 5 seconds for the full response. This is a critical UX win for interactive use cases.
The trade-off is engineering complexity: streaming requires SSE or WebSocket infrastructure, and your client must handle partial responses gracefully.
When to stream:
- Interactive chat interfaces — always stream, the UX improvement is significant
- Long-form responses — stream so users can start reading before generation is complete
When NOT to stream:
- Batch processing pipelines — you want the complete response before processing, streaming adds complexity with no benefit
- Short responses under 100 tokens — latency is low anyway, streaming adds no perceived improvement
In FastAPI + Angular (your stack): use FastAPI's StreamingResponse with server-sent events. Angular consumes the stream and updates the UI token by token. This is exactly the pattern used in AstroIntel.

---

## ★ YOUR 5 PROJECTS — Token Economics in Practice

| Project | Cost/query | Key strategy | Numbers |
|---------|-----------|-------------|---------|
| **AstroIntel 360°** | $0.000137 per full 360° analysis | DeepSeek Chat ($0.14/1M in, $0.28/1M out) — 500× cheaper than GPT-4o. `threading.Lock` for cross-thread token accounting. 8s HTTP timeout (fail fast). | 18+ agents, 23 languages, $0.000137 |
| **Bench Resource Optimizer** | ~$0 on cache hit | L1 exact-match cache (SHA-256, < 1ms). L2 semantic cache (cosine ≥ 0.92). 60–70% estimated cache hit rate post-warmup. Token tracker logs per-agent usage to SQLite. | 502 tests, 94.7% coverage |
| **RunbookAI** | ~$0 at query time | LLM called ONLY at PDF ingest — zero tokens at query time. Most token-efficient architecture in portfolio. One LLM call per runbook (ingest), zero per query. | < 100ms query, $0 per query |
| **Agentic Growth OS** | ~$0.005 per full pipeline run | 5 LangGraph nodes × 1 LLM call each. Learning engine reuses past campaign decisions — reduces novel LLM calls on repeat campaign types. | 5 agents, ROI improves 40–80% |
| **Universal Agent** | $0 when locked | `/agents/{id}/lock` blocks LLM instantly. `Lock All` kills all 5 agents. 100% token saving during lock. Per-agent granular control. | 5 agents, < 10ms lock toggle |

**Interview line:** "My most cost-efficient architecture is RunbookAI — zero LLM tokens at query time because the LLM only runs at ingest. My most token-aware production system is AstroIntel at $0.000137 per analysis — that's 500× cheaper than GPT-4o, achieved by using DeepSeek and parallelizing agents rather than running them sequentially."
