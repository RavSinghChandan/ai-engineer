# Senior AI Engineer — Module 5
# Topic: Cost Optimization in LLM Systems

---

## 1. Intuition

An LLM feature that costs more than it earns is not a product — it is a liability.
Cost optimization is not about being cheap. It is about making AI features economically sustainable at scale.

Senior engineers own the cost profile of their AI features the same way they own the performance profile.

---

## 2. Core Concept

### The Five Cost Levers (in order of impact)

**1. Model tiering (highest ROI):**
Use the cheapest model that meets quality requirements for each task.
GPT-4o-mini is 30× cheaper than GPT-4o. For 80% of tasks, quality is indistinguishable.

**2. Semantic caching:**
Cache LLM responses for semantically similar queries.
30-40% cache hit rate eliminates 30-40% of LLM calls entirely.

**3. Prompt compression:**
Reduce input token count by compressing system prompts and retrieved context.
Shorter prompts = fewer input tokens = lower cost per call.

**4. max_tokens discipline:**
Cap output length per use case. A classification task needs 10 tokens, not 500.
Uncapped output is one of the most common causes of surprise LLM bills.

**5. Request batching:**
For async tasks (batch summaries, report generation), batch multiple inputs into fewer LLM calls.

---

## 3. Cost Calculation Framework

```
Monthly LLM Cost = 
  daily_requests × (1 - cache_hit_rate) × avg_input_tokens × input_price
  + daily_requests × (1 - cache_hit_rate) × avg_output_tokens × output_price
  × 30 days

Example optimization journey:
  Before: 10,000 req/day, 100% GPT-4o, 1200 input tokens, 500 output tokens, 0% cache
    Input cost: 10,000 × 1200 × $5/1M = $60/day
    Output cost: 10,000 × 500 × $15/1M = $75/day
    Total: $135/day = $4,050/month

  After: model tiering (80% mini / 20% GPT-4o), 30% cache, 800 input tokens (compressed), 300 output tokens (capped)
    GPT-4o-mini (8,000 × 0.7 effective requests × 800 input × $0.15/1M) = $0.67/day
    GPT-4o-mini (8,000 × 0.7 × 300 output × $0.60/1M) = $1.01/day
    GPT-4o (2,000 × 0.7 × 800 × $5/1M) = $5.60/day
    GPT-4o (2,000 × 0.7 × 300 × $15/1M) = $6.30/day
    Total: ~$13.58/day = $407/month
    Savings: 90% cost reduction
```

---

## 4. Code Skeleton (Production-Grade)

```python
# Model router — send to cheapest model that can handle the task
COMPLEX_QUERY_KEYWORDS = ["analyze", "compare", "synthesize", "design", "explain why", "evaluate"]

def route_to_model(query: str, context_token_count: int) -> str:
    # Always use capable model for large context
    if context_token_count > 50_000:
        return "gpt-4o"
    
    # Use capable model for complex reasoning
    if any(kw in query.lower() for kw in COMPLEX_QUERY_KEYWORDS):
        return "gpt-4o"
    
    # Default: cheap model
    return "gpt-4o-mini"

# max_tokens per task type
MAX_TOKENS_BY_TASK = {
    "classification": 20,
    "extraction": 100,
    "summary": 300,
    "qa_answer": 400,
    "report_section": 600,
    "full_analysis": 800,
}

def get_max_tokens(task_type: str) -> int:
    return MAX_TOKENS_BY_TASK.get(task_type, 400)

# Prompt compressor — reduce input token count
def compress_system_prompt(full_prompt: str) -> str:
    """Remove redundant whitespace, examples that aren't needed for simple tasks"""
    lines = [line.strip() for line in full_prompt.split('\n') if line.strip()]
    return '\n'.join(lines)

def compress_rag_context(chunks: list[str], max_tokens: int = 3000) -> str:
    """Use only as many chunks as fit in the token budget"""
    result = []
    total = 0
    for chunk in chunks:
        chunk_tokens = count_tokens(chunk)
        if total + chunk_tokens > max_tokens:
            break
        result.append(chunk)
        total += chunk_tokens
    return "\n\n".join(result)

# Cost tracker
class LLMCostTracker:
    PRICING = {
        "gpt-4o":        {"input": 5.0,  "output": 15.0},
        "gpt-4o-mini":   {"input": 0.15, "output": 0.60},
        "claude-sonnet": {"input": 3.0,  "output": 15.0},
        "claude-haiku":  {"input": 0.80, "output": 4.0},
    }
    
    def calculate(self, model: str, input_tokens: int, output_tokens: int) -> float:
        p = self.PRICING.get(model, self.PRICING["gpt-4o-mini"])
        return (input_tokens * p["input"] + output_tokens * p["output"]) / 1_000_000
    
    def record(self, model: str, input_tokens: int, output_tokens: int,
               tenant_id: str, feature: str):
        cost = self.calculate(model, input_tokens, output_tokens)
        
        # Push to metrics
        metrics.increment("llm.cost_usd", cost, tags={"tenant": tenant_id, "feature": feature})
        metrics.increment("llm.input_tokens", input_tokens, tags={"model": model})
        metrics.increment("llm.output_tokens", output_tokens, tags={"model": model})
        
        # Alert if daily spend is approaching budget
        daily_spend = metrics.get_sum("llm.cost_usd", window="24h")
        if daily_spend > DAILY_BUDGET_USD * 0.8:
            alert(f"LLM spend at 80% of daily budget: ${daily_spend:.2f}")
        
        return cost

tracker = LLMCostTracker()

# Full cost-optimized call
def optimized_llm_call(
    task_type: str,
    system_prompt: str,
    user_message: str,
    context_chunks: list[str] = None,
    tenant_id: str = "default",
    feature: str = "unknown"
) -> dict:
    # Compress
    compressed_system = compress_system_prompt(system_prompt)
    context = compress_rag_context(context_chunks) if context_chunks else ""
    full_message = f"Context:\n{context}\n\n{user_message}" if context else user_message
    
    # Route
    input_tokens_estimate = count_tokens(compressed_system + full_message)
    model = route_to_model(user_message, input_tokens_estimate)
    max_tokens = get_max_tokens(task_type)
    
    # Call
    response = openai.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": compressed_system},
            {"role": "user", "content": full_message}
        ],
        max_tokens=max_tokens,
        temperature=0.2
    )
    
    input_tokens = response.usage.prompt_tokens
    output_tokens = response.usage.completion_tokens
    cost = tracker.record(model, input_tokens, output_tokens, tenant_id, feature)
    
    return {
        "content": response.choices[0].message.content,
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": cost
    }
```

---

## 5. Example (From Your Projects)

**AstroIntel — cost profile:**

5 domain agents × ~400 input tokens (birth profile + question) × 400 output tokens (capped) = 2,000 input + 2,000 output tokens per analysis.

On GPT-4o-mini:
- Input: 2,000 × $0.15/1M = $0.0003
- Output: 2,000 × $0.60/1M = $0.0012
- Total per analysis: ~$0.0015

Translation: 55 strings × avg 50 output tokens = 2,750 output tokens × $0.60/1M = $0.00165
Total per full report: ~$0.003 (less than a third of a cent)

At 1,000 reports/month: $3/month on LLM costs.

In interview: "We capped each agent's max_tokens at 400 — enough for a structured insight. Without this cap, verbose outputs could push costs 3-4× higher. At 1,000 reports/month, the token cap saves approximately 70% in LLM spend compared to uncapped output."

---

## 6. Trade-offs

GPT-4o vs GPT-4o-mini:
GPT-4o: 30× more expensive, noticeably better reasoning on complex tasks.
GPT-4o-mini: sufficient for most classification, extraction, Q&A, summarization tasks.
Decision: run an A/B quality evaluation on your specific task. If quality difference is < 5%, use mini.

Aggressive caching:
+ 30-40% cost reduction with 30-40% cache hit rate.
- Stale responses if cache TTL is too long.

Prompt compression:
+ Reduces input tokens directly.
- Over-compressed prompts can reduce output quality. Test carefully.

---

## 7. Interview Questions (Senior Level)

- Your LLM bill doubled this month without a traffic increase. Walk me through investigating it.

  **Answer:** First, pull per-feature, per-model token counts for the current vs previous month — the spike will be in one specific feature or model tier. Most common causes: a developer removed a `max_tokens` cap ("for better answers"), a new feature added context that inflated the system prompt, or model tier routing broke and all traffic is hitting GPT-4o instead of mini. In AstroIntel, the token economics dashboard tracks `avg_prompt_tokens` and `avg_completion_tokens` per run — a doubling of either number in the dashboard immediately identifies whether input or output grew, pointing to prompt bloat vs uncapped output.

- How do you decide which tasks should use GPT-4o vs GPT-4o-mini?

  **Answer:** Run a quality A/B test on your specific task: send the same 50 queries to both models, evaluate with LLM-as-judge on faithfulness, relevance, and format compliance. If the quality gap is less than 5%, always use mini — it's 30x cheaper. Use GPT-4o only when the task requires complex multi-step reasoning, nuanced judgment, or when quality degradation on mini causes measurable user impact (conversion drop, user complaints). In Bench Resource Optimizer, the gap analysis and plan generation require nuanced reasoning about employee skills vs role requirements — that's the task that warrants the more capable model; simple intent classification and query routing use the cheaper option.

- What is the business case for investing in semantic caching?

  **Answer:** At 30% cache hit rate, 30% of LLM calls are eliminated — at $0.0002/call on mini, 10,000 calls/day = $2/day saved from caching alone = $60/month. The engineering investment to add a Redis-backed semantic cache is 1-2 days. Payback period at moderate traffic is weeks. At 100K calls/day the savings are $600/month — enough to justify a dedicated cache infrastructure. The secondary benefit is latency: cache hits return in < 10ms vs 1,500ms for LLM calls, improving P50 latency significantly and making the system feel much more responsive for repeated query patterns.

- How does prompt caching (provider-side) work and how does it differ from semantic caching?

  **Answer:** *(Already covered in Advanced Follow-ups Q2 — skipped to avoid duplication.)*

- At 100,000 daily queries, what is your cost optimization strategy?

  **Answer:** Five levers in ROI order: (1) model tiering — route 80% of queries to mini, only 20% to GPT-4o based on complexity classification; (2) semantic caching — 30% hit rate eliminates 30K LLM calls/day; (3) max_tokens discipline — cap each use case at its maximum needed output length; (4) prompt compression — remove redundant instruction text from system prompts, target 20% reduction; (5) provider caching — use Anthropic or OpenAI's prompt caching for static system prompt prefixes. At 100K queries/day, the combination of model tiering and semantic caching alone typically achieves 60-70% cost reduction versus unoptimized GPT-4o usage.

---

## 8. Answer Framework

Step 1 — Show you think in cost from day one:
"Before choosing a model, I estimate monthly token spend. 10,000 req/day × 1,000 tokens average × $5/1M on GPT-4o = $1,500/month. Same on mini = $50/month."

Step 2 — Present the five levers:
"Model tiering, semantic caching, prompt compression, max_tokens discipline, and batching — applied in that order of ROI."

Step 3 — From your project:
"In AstroIntel, we capped max_tokens at 400 per agent. Without this, verbose outputs would have pushed costs 3-4× higher. At scale, token discipline is the cheapest optimization."

Step 4 — Monitoring:
"I track cost per query as a daily metric. If it spikes, I check: did someone remove a max_tokens cap? Did a new feature add 300 tokens to the system prompt? Did model tier routing break?"

Step 5 — Business framing:
"Cost optimization is what makes an AI feature profitable. The engineering time to add semantic caching pays back in weeks at moderate traffic."

---

## 10. Advanced Follow-ups

Q1: How do you build a cost alerting system for LLM spend?

Answer:
Three levels of alerts.
Real-time per-request: if a single LLM call exceeds 5× the expected token count for that task type, log a warning. This catches individual runaway prompts.
Hourly: if hourly spend exceeds 120% of the rolling 7-day hourly average, alert. This catches traffic spikes or prompt changes that inflate costs.
Daily budget: alert at 80% of daily budget (warning) and 100% (critical). At critical, auto-enable rate limiting for non-critical features.
Implementation: Prometheus counter for total tokens and cost, Grafana alert rules, PagerDuty integration for critical alerts.
Most important: build a cost dashboard BEFORE you need it. Investigating a cost spike without per-feature, per-model, per-tenant breakdown in your metrics is extremely slow.

Q2: How does Anthropic's prompt caching feature reduce costs, and how do you implement it?

Answer:
Anthropic's prompt caching (available on Claude models) allows you to mark specific portions of your prompt as cacheable. If the same cache prefix appears in multiple requests within the 5-minute cache TTL, you are charged at the cached input token rate (90% cheaper) instead of the full input rate.
How to implement: add `cache_control: {"type": "ephemeral"}` to the messages you want cached — typically the system prompt and any static context.
Best case: your system prompt is 2,000 tokens and you have 1,000 requests/hour. Without caching: 2,000,000 input tokens/hour. With caching: 2,000 tokens charged at full rate once per 5-minute window + 995 requests × 2,000 tokens at 10% of normal rate. Savings: approximately 90% on system prompt tokens.
OpenAI also automatically caches prompts above a certain length — no implementation needed, just benefit from it by keeping your system prompt static.

Q3: When is batching LLM calls more efficient than individual calls?

Answer:
Batching helps when: the per-call overhead (API round trip, connection overhead) is significant relative to the processing time, and requests are not time-sensitive.
Use cases: processing a backlog of documents (summarize 1,000 PDFs), batch translation (translate 100 strings), nightly report generation.
OpenAI Batch API: submit a JSONL file of requests, get results within 24 hours at 50% discount. Use for non-real-time workloads.
LangChain/LangSmith parallel batching: embed multiple texts in one API call (significantly more efficient than N individual calls).
When NOT to batch: user-facing features where latency matters, real-time classification that feeds another pipeline stage. Batching adds latency — only use when latency is not the constraint.

Q4: How do you track LLM cost per business feature (not just total)?

Answer:
Tag every LLM call with a `feature` label in your metrics.
Implementation: all LLM calls go through a central wrapper that accepts a feature parameter. The wrapper records cost tagged by feature name.
```python
tracker.record(model, input_tokens, output_tokens, tenant_id, feature="document_qa")
tracker.record(model, input_tokens, output_tokens, tenant_id, feature="agent_analysis")
tracker.record(model, input_tokens, output_tokens, tenant_id, feature="translation")
```
Dashboard: cost breakdown by feature, cost per feature per tenant, cost trend per feature.
Business value: you can now answer "How much does the translation feature cost per report?" (→ justify or cut it) and "Which feature has the highest cost-per-user-value ratio?" (→ prioritize optimization).
Without feature-level tagging, you have a total LLM bill and no idea what is driving it.

Q5: A new hire removes all max_tokens caps "to improve answer quality." How do you handle this?

Answer:
First, restore the caps immediately. Explain: max_tokens does not cap quality — it caps verbosity. A 300-token answer is not worse than a 1,000-token answer for Q&A tasks. It is just shorter.
Second, add a code review rule: any change to max_tokens or model selection requires a cost impact comment. Calculate the monthly cost impact before merging.
Third, add an automated check: in CI, run a token count estimation on the staging environment. If average tokens per request increases by more than 20% from baseline, the check fails with a cost impact warning.
Fourth, education: show the cost calculation. "Removing max_tokens on this endpoint: 10,000 requests/day × average 300 additional output tokens × $0.60/1M × 30 days = $54/month additional cost for this one endpoint." Real numbers change behavior.
The deeper principle: LLM cost is a shared team responsibility, not just an infrastructure concern. Every engineer who touches prompts affects the bill.
