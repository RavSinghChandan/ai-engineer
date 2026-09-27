# System One Engineering — Module 7
# Topic: Evaluation and Drift

---

## 1. Intuition

You cannot assert `answer.choice == "billing"` in a unit test and call it
tested. The model is probabilistic, the vendor will update it, and your inputs
will shift under you.

What you *can* do is pin behaviour on a labelled set, measure precision and
coverage at your thresholds, and alarm when the distribution moves. That is a
different testing discipline from the one most backend engineers have.

---

## 2. Core Concept

### Three layers

```
┌────────────────────────────────────────────────┐
│ UNIT      composition, thresholds, routing     │  no API, deterministic
│           fake answers, exact assertions       │
├────────────────────────────────────────────────┤
│ GOLDEN    labelled set, precision & coverage   │  real API, aggregate
│           assert metrics, never one answer     │
├────────────────────────────────────────────────┤
│ MONITOR   production distribution over time    │  no labels needed
│           alarm on movement                    │
└────────────────────────────────────────────────┘
```

Most teams build the first, skip the second, and discover they needed the third
after an incident.

### Unit: fake the model

Composition logic is pure and must be tested without a network call.

```python
from dataclasses import dataclass, field

@dataclass
class FakeChoice:
    choice: str
    confidence: float
    probabilities: dict = field(default_factory=dict)

@dataclass
class FakeNoul:
    noul: float

def test_legal_beats_severity():
    answers = {
        "is_legal":  FakeNoul(0.9),
        "severity":  FakeScore(1.0),
    }
    assert decide(answers) == "escalate_legal"
```

Every threshold and weight gets a test. These run in CI with no key and no
flakiness.

### Golden: assert on metrics, never on one answer

```python
GOLDEN = load_labelled("golden/tickets.jsonl")   # 200+ hand-labelled cases

def test_precision_at_threshold():
    records = []
    for case in GOLDEN:
        r = client.system_one(state=case.state, questions=QUESTIONS)
        a = r.answers["department"]
        records.append((a.confidence, a.choice == case.label))

    above = [c for conf, c in records if conf >= THRESHOLD]
    precision = sum(above) / len(above)
    coverage = len(above) / len(records)

    assert precision >= 0.95, f"precision fell to {precision:.3f}"
    assert coverage >= 0.55, f"coverage fell to {coverage:.3f}"
```

Both assertions matter. Precision alone can be gamed by a threshold so high
nothing passes it.

Never `assert r.answers["x"].choice == "billing"` on a single case. That test
will fail on an unrelated model update and teach your team to ignore it.

### Monitor: drift without labels

Production has no labels. It does have distributions, and those move first.

```python
def drift_signals(window):
    """Computable with zero labels. Alarm on movement, not level."""
    return {
        "mean_confidence": mean(a.confidence for a in window),
        "pct_low_conf":    mean(a.confidence < THRESHOLD for a in window),
        "pct_other":       mean(a.choice == "other" for a in window),
        "class_mix":       Counter(a.choice for a in window),
    }
```

What movement means:

| Signal | Likely cause |
|---|---|
| mean confidence falls | inputs drifting from your criteria |
| `other` share rises | new category appearing in the wild |
| class mix shifts | upstream change, or genuine seasonality |
| confidence rises, precision falls | **model update — investigate now** |

That last row is the dangerous one, and only the golden set catches it. Run it
on a schedule, not just in CI.

### Pin the version

```python
r = client.system_one(state=s, questions=q, model="jev-1.13.0")
log.info("system_one", model=r.model, answers=serialise(r.answers))
```

Pin explicitly when thresholds depend on behaviour. Log the returned version
always, so an incident can be correlated with a version change.

---

## 3. Worked Example

CI that fails when criteria change without refitting thresholds.

```python
import hashlib, json, pathlib

def criteria_hash(questions) -> str:
    """Stable hash of every instruction and criteria string."""
    material = json.dumps(
        {
            name: {
                "type": type(q).__name__,
                "instructions": q.instructions,
                "criteria": getattr(q, "criteria", None),
            }
            for name, q in sorted(questions.items())
        },
        sort_keys=True,
    )
    return "sha256:" + hashlib.sha256(material.encode()).hexdigest()[:16]

def test_thresholds_match_criteria():
    lock = json.loads(pathlib.Path("calibration.lock").read_text())
    current = criteria_hash(QUESTIONS)
    assert current == lock["criteria_hash"], (
        f"Criteria changed ({lock['criteria_hash']} -> {current}) but "
        f"calibration.lock was not refitted. Run: python -m tools.calibrate"
    )
```

This closes the loop from Modules 3 and 4. A reviewer editing one word of
criteria text gets a red build telling them exactly what to do — which is the
only way this discipline survives contact with a team.

---

## 4. Why This Matters in Production

**Vendor updates are silent.** `jev-latest` can change under you. The golden
set is the only thing that notices.

**Drift is gradual.** Nothing breaks; accuracy erodes. Distribution monitoring
catches it before anyone files a bug.

**Metrics are the contract.** "95% precision at 60% coverage" is a commitment
you can hold and monitor. "We use Jev" is not.

**Cheap evaluation means frequent evaluation.** At these prices, running 200
golden cases nightly is affordable. Do it.

---

## 5. Pitfalls

**Asserting exact answers.** Flaky tests get muted, then deleted.

**A golden set from one week.** Bake in seasonality and edge cases, or you have
pinned one Tuesday.

**No `other` cases in golden.** Out-of-domain handling is untested precisely
where it matters.

**Precision without coverage.** Always assert both.

**`jev-latest` in production with fitted thresholds.** Pin it.

**Monitoring levels instead of changes.** Alarm on movement; the absolute
number depends on your traffic mix.

**A golden set nobody re-labels.** As criteria evolve, old labels go stale.
Schedule re-labelling.

---

## 6. Exercises

1. Build a 200-case golden set with at least 20 deliberately out-of-domain
   inputs. Report precision and coverage.

2. Implement the criteria-hash CI check. Change one word of criteria and watch
   it fail.

3. Compute the four drift signals over a week of traffic. Establish baselines
   and set alarm bands.

4. Simulate a model update by changing the pinned version. Measure how much
   precision and confidence move. This tells you how tight your alarms must be.

5. Write the runbook: what an on-call engineer does when the `other` rate
   doubles at 3am.

---

## 7. Further Reading

- `awesome-jev-by-typesafe` — pin versions, store distributions, evaluate with
  representative and out-of-domain cases
- Module 4 — thresholds and reliability curves, which this module enforces
- `harness-engineering/06-observability-and-eval` — the general discipline

> **Status.** Version pinning and distribution logging follow TypeSafe's
> guidance. The three-layer structure and drift signals are standard ML-in-
> production practice applied here; no long-run drift data exists yet for a
> model released in September 2026, which is exactly why the monitoring layer
> is not optional.
