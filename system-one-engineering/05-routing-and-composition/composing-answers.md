# System One Engineering — Module 5
# Topic: Routing and Composition

---

## 1. Intuition

You have three answers. Now what?

The temptation is to ask the model a fourth question: "given all this, what
should we do?" Resist it. **The model judges; your code composes.** Weights,
thresholds and actions belong in a file a reviewer can read and a test can
pin — not inside a probability distribution.

---

## 2. Core Concept

### Speculative fan-out

LLM pricing taught you to ask the minimum. Jev's economics invert that: ask
everything you might need in one call and discard what you do not use.

```python
FANOUT = {
    "department":   Choice(...),
    "severity":     Score(...),
    "wants_refund": Noul(instructions="The customer is asking for a refund"),
    "is_churn_risk": Noul(instructions="The customer threatens to leave"),
    "is_legal":     Noul(instructions="The message mentions legal action"),
}

response = client.system_one(state={"ticket": ticket}, questions=FANOUT)

# Branch on two. The other three cost almost nothing and are already there
# if the first branch needs them.
if response.answers["is_legal"].noul > 0.5:
    escalate_legal(response)
elif response.answers["severity"].score > 2.5:
    page_oncall(response)
```

One round trip, one state encoding, five judgements. The alternative — five
sequential calls, each re-sending the ticket — is slower and more expensive.

### Composition in code

```python
def priority(answers) -> float:
    """Weights live here, in version control, not in a prompt."""
    severity = answers["severity"].score / 3.0          # normalise 0..1
    churn    = answers["is_churn_risk"].noul
    legal    = answers["is_legal"].noul
    return 0.5 * severity + 0.3 * churn + 0.2 * legal
```

Normalise before combining — a Score over 4 levels spans 0..3 while a Noul
spans 0..1, and adding them raw silently weights the Score triple.

Why this beats asking the model for priority directly: the weights are
reviewable, testable, adjustable without re-calibration, and explainable to a
customer. A model-produced priority is none of those.

### Counting

Do not ask a model to count. Ask one Noul per item and sum:

```python
response = client.system_one(
    state={"items": basket},
    questions={
        f"item_{i}": Noul(instructions=f"`items[{i}]` is a fruit")
        for i in range(len(basket))
    },
)
n_fruit = sum(
    response.answers[f"item_{i}"].noul > 0.5 for i in range(len(basket))
)
```

Parallel evaluation makes this cheap, and arithmetic in Python is exact.

### Two-stage routing

For large taxonomies, one coarse Choice then one fine Choice beats a
150-option flat list — the criteria text stays substantial at each stage.

```python
coarse = client.system_one(state=s, questions={"area": Choice(criteria=AREAS)})
fine = client.system_one(
    state=s,
    questions={"topic": Choice(criteria=TOPICS[coarse.answers["area"].choice])},
)
```

Two round trips, so only do this when the flat version measurably underperforms.

---

## 3. Worked Example

Typed function calling — the model fills arguments, code executes.

```python
CALL_SPEC = {
    "tool": Choice(
        instructions="Which function is the user requesting?",
        criteria={
            "set_lights":     "Turn lights on, off, or dim them.",
            "set_thermostat": "Adjust temperature.",
            "none":           "Not a supported request.",
        },
    ),
    "room": Choice(instructions="Which room?", criteria=ROOMS),
    "state": Choice(
        instructions="Desired light state",
        criteria={"on": "Switch on.", "off": "Switch off.", "dim": "Reduce."},
    ),
}

response = client.system_one(state={"utterance": text}, questions=CALL_SPEC)
a = response.answers

if a["tool"].choice != "none" and a["tool"].confidence >= 0.8:
    TOOLS[a["tool"].choice](room=a["room"].choice, state=a["state"].choice)
else:
    ask_the_user_to_rephrase()
```

Every argument is drawn from an enumerated set, so there is no argument
validation layer and no malformed-call path. Compare with an LLM tool call,
where you validate the function name, validate each argument, handle the
invented enum value, and handle the hallucinated third argument.

The `"none"` option is load-bearing: without it, "what's the weather?" gets
forced into `set_lights`.

---

## 4. Why This Matters in Production

**Latency is a round-trip count.** Fan-out turns five decisions into one hop.

**Composition logic is testable.** `priority()` is a pure function. Unit-test
it with synthetic answers; no API key, no flakiness.

**Weights change without recalibration.** Adjusting 0.5 to 0.6 needs no model
work. A prompt-embedded weight needs re-evaluation.

**Fan-out gives free observability.** Questions you did not branch on are still
logged, so you can ask later whether churn risk *would* have predicted the
escalation.

---

## 5. Pitfalls

**Asking the model to compose.** "Given all this, what's the priority?" hides
your business logic inside a probability.

**Combining unnormalised scales.** Score 0..3 and Noul 0..1 added directly.

**Fan-out without a budget.** Questions are cheap, not free. Twenty questions
where three would do is still waste, and the state encoding grows.

**Chained calls that should be parallel.** If question B does not depend on
answer A, they belong in one call.

**Composing low-confidence answers.** A weighted sum of four uncertain answers
is one confident-looking number built on nothing. Gate the inputs first.

---

## 6. Exercises

1. Find a sequence of LLM calls in your codebase where later calls do not
   depend on earlier answers. Rewrite as one fan-out.

2. Write `priority()` for your domain. Unit-test with hand-built answer
   objects — no API calls.

3. Implement two-stage routing for a taxonomy over 30 options. Measure whether
   it beats the flat version. Report the extra round trip honestly.

4. Take a model-composed decision you already ship and extract the weights into
   code. Note how many were implicit and unexamined.

---

## 7. Further Reading

- `awesome-jev-by-typesafe` — *speculative fan-out* and *composite scoring*
- Module 6 — placing these patterns inside an existing agent loop

> **Status.** Fan-out and parallel evaluation are documented behaviour. The
> composition discipline — normalise, weight in code, gate before combining —
> is engineering judgement, presented as a default rather than a rule.
