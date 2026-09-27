# System One Engineering — Module 8
# Topic: Production Patterns

---

## 1. Intuition

The difference between a demo and a service is what happens on the bad day: the
API is slow, the key rotates, traffic spikes 10×, and someone asks why a
decision was made in January.

None of that is specific to Jev. All of it has a Jev-shaped answer.

---

## 2. Core Concept

### Async and batching

Per-item sequential calls waste the model's speed. Gather them.

```python
import asyncio
from typesafe_sdk import AsyncTypeSafeClient, RetryPolicy

async def triage_all(tickets):
    retry = RetryPolicy(
        max_retries=3, backoff_initial=0.5, backoff_max=4.0, timeout=20.0
    )
    async with AsyncTypeSafeClient(retry=retry, timeout=10.0) as client:
        return await asyncio.gather(
            *(client.system_one(state=t, questions=TRIAGE) for t in tickets)
        )
```

Bound the concurrency — an unbounded `gather` over 10,000 tickets will exhaust
connections or hit rate limits:

```python
sem = asyncio.Semaphore(32)

async def one(client, ticket):
    async with sem:
        return await client.system_one(state=ticket, questions=TRIAGE)
```

### Typed responses

Declare the response shape and get static checking:

```python
from typesafe_sdk import ChoiceAnswer, NoulAnswer, ScoreAnswer, SystemOneResponse

class TicketDecision(SystemOneResponse):
    department: ChoiceAnswer
    frustration: ScoreAnswer
    refund_requested: NoulAnswer

r = await client.system_one(state=t, questions=TRIAGE,
                            response_model=TicketDecision)
r.department.choice     # type-checked
```

Worth it wherever the question set is stable — a renamed question becomes a
type error instead of a `KeyError` in production.

### Degradation

Decide what happens when the model is unavailable. The wrong answer is "500".

```python
def classify_with_fallback(ticket):
    try:
        r = client.system_one(state=ticket, questions=TRIAGE)
        a = r.answers["department"]
        if a.confidence >= THRESHOLD:
            return a.choice, "model"
        return HUMAN_QUEUE, "low_confidence"
    except (TimeoutError, APIError) as exc:
        log.warning("system_one unavailable", error=str(exc))
        return HUMAN_QUEUE, "unavailable"      # fail to a human, not a guess
```

Fail toward the safe path. For triage that is the human queue; for a risk gate
it is "deny". Never fail toward "allow".

### Audit records

Store the distribution, the version and the criteria hash:

```python
audit.write({
    "ts": now(),
    "request_id": rid,
    "model": r.model,
    "criteria_hash": CRITERIA_HASH,
    "state_digest": sha256(state),          # not the state: it has PII
    "answers": {
        name: {
            "value": value_of(a),
            "confidence": getattr(a, "confidence", None),
            "probabilities": getattr(a, "probabilities", None),
        }
        for name, a in r.answers.items()
    },
    "action": action,
    "threshold": THRESHOLDS[action],
})
```

`state_digest` rather than the state itself: you want to prove which input
produced a decision without copying customer data into a second store.

### Caching

Deterministic inputs mean cacheable decisions. Key on everything that can
change the answer:

```python
key = sha256(f"{model}|{CRITERIA_HASH}|{canonical_json(state)}")
```

Omit the criteria hash and a criteria change silently serves stale decisions.

---

## 3. Worked Example

A service wrapper carrying the whole discipline.

```python
class DecisionService:
    """Thresholds, versioning, audit and degradation in one place.

    Everything that can silently change an outcome is explicit in the
    constructor, so it appears in code review.
    """

    def __init__(self, client, questions, thresholds, model, criteria_hash):
        self.client = client
        self.questions = questions
        self.thresholds = thresholds
        self.model = model                  # pinned, never "latest"
        self.criteria_hash = criteria_hash

    def decide(self, state, request_id):
        try:
            r = self.client.system_one(
                state=state, questions=self.questions, model=self.model
            )
        except (TimeoutError, APIError) as exc:
            self._audit(request_id, None, "escalate", reason=str(exc))
            return Decision("escalate", confidence=None, reason="unavailable")

        a = r.answers["action"]
        bar = self.thresholds.get(a.choice, 1.0)   # unknown action -> never auto

        if a.choice == "other" or a.confidence < bar:
            action, reason = "escalate", "below_threshold"
        else:
            action, reason = a.choice, "auto"

        self._audit(request_id, r, action, reason=reason)
        return Decision(action, a.confidence, reason)
```

The `self.thresholds.get(a.choice, 1.0)` default is deliberate: add a new option
to your criteria and forget to add a threshold, and it escalates to a human
rather than auto-executing at some default bar. Fail closed.

---

## 4. Why This Matters in Production

**Speed only helps if you exploit it.** Sequential calls waste the model's main
advantage.

**Outages are certain.** The degradation path is the design decision, and it
should be made deliberately rather than by exception propagation.

**Audit is a regulatory requirement** in finance, health and hiring. Store
distributions from day one; you cannot reconstruct them later.

**Caching multiplies the cost advantage** — and silently corrupts it if the
key is wrong.

---

## 5. Pitfalls

**Unbounded `gather`.** Rate limits, connection exhaustion, retry storms.

**Retrying non-idempotent work.** The call is safe to retry; the action you
take afterwards may not be. Deduplicate on `request_id`.

**Failing open.** A risk gate that returns "allow" on timeout is worse than no
gate, because it creates the belief that a gate exists.

**Logging state with PII.** Digest it.

**Cache keys missing the criteria hash or model version.** Stale decisions,
invisible.

**`jev-latest` in production.** Pin it and upgrade deliberately.

**No default threshold.** A new option with no entry auto-executing is the
highest-severity bug in this module.

---

## 6. Exercises

1. Load-test your batch path at 10× peak. Find where it breaks — connections,
   rate limit, or memory.

2. Kill the API with a firewall rule mid-run. Verify you degrade to the safe
   path and that alarms fire.

3. Implement the audit record. Confirm you can answer "why was request X
   decided this way?" from storage alone, with no reprocessing.

4. Add caching. Measure the hit rate. Then change one word of criteria and
   verify the cache invalidates.

5. Add a new option to a Choice and deliberately omit its threshold. Confirm it
   escalates rather than auto-executes.

---

## 7. Further Reading

- TypeSafe AI SDK documentation — `AsyncTypeSafeClient`, `RetryPolicy`,
  `SystemOneResponse` and the typed answer classes
- `harness-engineering/08-production-harness` — the general patterns

> **Status.** SDK surfaces named here appear in TypeSafe's published SDK and
> in independent tutorials. The service design — fail-closed defaults, digest
> logging, criteria-hashed cache keys — is engineering judgement rather than
> vendor guidance.
