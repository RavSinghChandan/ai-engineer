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

**AstroIntel 360° — Token cost optimization:**

Five parallel agents, each calling GPT-4 for insights.
Without cost control: each agent could generate 1000+ tokens of verbose output.
What we did:
- Capped max_tokens at 400 per agent (enough for a structured insight, not a novel)
- Used a focused system prompt per agent (not a generic prompt with everything)
- Translation agent: 55 strings × avg 50 tokens output = 2,750 output tokens per translation job
  Estimated cost per full report (5 agents + translation): ~$0.05 on GPT-4o-mini

In a senior interview: "We tracked cost per report as a core KPI. At 1000 reports/month, the difference between capped and uncapped token output was approximately 40% in monthly spend."

**LangChain Service:**
- FAISS vector search: zero token cost for retrieval (local index, no API call)
- Only LLM call costs money: retrieve first, then call LLM once with context
- Caching identical queries: same question asked twice = second call is free

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
- Your LLM bill doubled this month. Walk me through your investigation.
- How do you decide which tasks use GPT-4o vs GPT-4o-mini?
- What is the difference between P50 and P95 latency and why does it matter for an LLM API?
- How do you implement semantic caching and what hit rate would you expect on a typical enterprise chatbot?

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
