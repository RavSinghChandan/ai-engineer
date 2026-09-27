# System One Engineering — Module 9
# Topic: Cost and Latency

---

## 1. Intuition

TypeSafe publishes striking numbers: 40–200× faster, 40–400× cheaper,
70–500ms end to end, $0.042 per million input tokens with output tokens free.

They also state that the benchmark workflows were built by their own
model-capabilities team. That is unusually candid, and it means the figures
are a best case, not a forecast for your workload.

This module is about producing your own numbers, because the decision to
migrate a classifier should rest on measurements from your data.

---

## 2. Core Concept

### The published figures

| Metric | Claim | Status |
|---|---|---|
| Latency | 70–500 ms end to end | vendor |
| Speed vs frontier LLM | 40–200× (peak 193.6×) | vendor, own workflows |
| Cost vs frontier LLM | 40–400× (peak 444.6×) | vendor, own workflows |
| Price | $0.042 / M input tokens, output free | published |

Free output tokens follows from the architecture — the output is a
distribution over your schema, not generated tokens. It is why fan-out
(Module 5) is economically sensible.

### What to measure

**Wall-clock at your percentiles.** Mean latency is a marketing number. You
care about p95 and p99, from your region, under your concurrency.

```python
import time, statistics

def timed(fn, *a, **kw):
    t0 = time.perf_counter()
    out = fn(*a, **kw)
    return out, (time.perf_counter() - t0) * 1e3

lat = []
for case in sample:
    _, ms = timed(client.system_one, state=case, questions=QUESTIONS)
    lat.append(ms)

lat.sort()
print("p50", lat[len(lat)//2])
print("p95", lat[int(len(lat)*0.95)])
print("p99", lat[int(len(lat)*0.99)])
```

**Cost per decision, not per token.** Tokens are an implementation detail; the
business unit is a decision.

```python
LEDGER = {"calls": 0, "input_tokens": 0, "decisions": 0}

def ask(state, questions):
    r = client.system_one(state=state, questions=questions)
    LEDGER["calls"] += 1
    LEDGER["input_tokens"] += r.usage.input_tokens or 0
    LEDGER["decisions"] += len(questions)      # fan-out amortises the state
    return r

cost = LEDGER["input_tokens"] / 1e6 * 0.042
print(f"${cost / LEDGER['decisions'] * 1000:.4f} per 1k decisions")
```

Fan-out changes this materially: five questions over one state cost barely more
than one, so cost-per-decision falls as you batch.

**The honest comparison.** Against an LLM doing the *same* job — same
classification, structured output, comparable accuracy — not against GPT-class
reasoning on a task Jev cannot do.

```python
def compare(cases):
    """Both paths must hit the same precision bar or the comparison is void."""
    jev = [timed(run_jev, c) for c in cases]
    llm = [timed(run_llm, c) for c in cases]
    assert precision(jev) >= 0.95 and precision(llm) >= 0.95
    return {
        "latency_ratio": median(t for _, t in llm) / median(t for _, t in jev),
        "cost_ratio": cost_of(llm) / cost_of(jev),
    }
```

The assertion is the point. A speed comparison between systems of different
accuracy is meaningless.

---

## 3. Worked Example

What a real migration decision looks like.

```
Workload: support ticket triage, ~40,000 tickets/month, 5 judgements each

BEFORE — GPT-class LLM, JSON mode
  p50 latency         1,840 ms
  p95 latency         4,200 ms
  cost / 1k tickets   $2.60
  precision @ auto     94.1%
  coverage             71%
  parse failures       0.4%   (retried, counted in latency)

AFTER — Jev, one fan-out call of 5 questions
  p50 latency           130 ms
  p95 latency           380 ms
  cost / 1k tickets    $0.018
  precision @ auto     95.3%   (threshold fitted, Module 4)
  coverage             63%
  parse failures        0      (schema-bounded)

  latency  14x faster at p50, 11x at p95
  cost     144x cheaper
```

Read this carefully, because it is not a clean win.

**Coverage dropped from 71% to 63%.** More tickets now go to humans. Precision
rose, so the automated decisions are better — but 8% more volume hits the
queue. Whether that trade is good depends on the cost of a human review versus
the cost of a wrong auto-decision, and that is a business question, not a
technical one.

**14× is not 200×.** Real gains on a real workload, well short of the headline.
Still decisive for this decision.

**Parse failures going to zero** is the quiet win. It removes a whole class of
incident and the retry logic that handled it.

---

## 4. Why This Matters in Production

**Latency changes what is possible.** At 1.8s a classifier cannot sit in a
request path. At 130ms it can, which enables the harness gates in Module 6.

**Cost changes architecture.** At LLM prices you ask one question reluctantly.
At these prices fan-out and speculative questions are rational.

**Your numbers are the ones that matter.** Vendor benchmarks set expectations;
your measurements make the decision.

**Coverage is the hidden cost.** A cheaper, faster, more precise classifier
that automates less can still increase total cost. Measure end to end.

---

## 5. Pitfalls

**Quoting vendor figures internally as if measured.** Someone will hold you to
200×.

**Comparing across accuracy levels.** Pin precision, then compare.

**Measuring mean latency only.** p99 is what pages you.

**Ignoring state size.** Cost is input tokens. A bloated state object that
includes fields nobody asked about is money.

**Forgetting the LLM's retry tax.** Parse failures and retries belong in the
baseline, or you flatter the incumbent.

**Optimising cost when latency was the constraint** — or the reverse. Know
which one you were solving.

**Missing the coverage change.** The most common way a migration looks like a
win in the deck and a loss in the budget.

---

## 6. Exercises

1. Measure p50/p95/p99 on 500 real inputs from your region. Compare with the
   70–500ms claim and write down the gap.

2. Compute cost per 1,000 decisions for one fan-out call versus five separate
   calls. Quantify the amortisation.

3. Build the honest comparison against your current LLM path with precision
   pinned. Report latency, cost **and coverage**.

4. Measure how p95 moves as concurrency rises from 1 to 64. Find the knee.

5. Calculate the break-even: at what monthly volume does the migration
   engineering cost pay back? Include the coverage change.

---

## 7. Further Reading

- TypeSafe AI benchmark disclosure — including the caveat about workflow
  provenance
- Bloomberg and TechCrunch coverage (September 2026) — useful for the framing,
  not for numbers
- Module 7 — evaluation, which must run alongside any performance comparison

> **Status.** Prices and claimed ratios are as published in September 2026 and
> will change. Every figure in the worked example is illustrative, constructed
> to show the shape of an honest comparison — including a coverage regression,
> because real migrations have them. Do not cite them as measurements.
