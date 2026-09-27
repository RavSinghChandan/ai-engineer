# System One Engineering — Module 4
# Topic: Confidence and Calibration

---

## 1. Intuition

Every Choice and Score answer carries a `confidence` between 0 and 1. It is the
most useful field in the response and the most misread.

Confidence does **not** mean "probability this answer is correct."

It means: *the probability mass concentrated on one option rather than
spreading across them.* A decisive model. Decisive and wrong is entirely
possible — and happens exactly when your criteria are bad, which is why
Module 3 came first.

Get this distinction wrong and you will ship a system that auto-approves
confident nonsense.

---

## 2. Core Concept

### Where the number comes from

TypeSafe derives confidence from the shape of the distribution. The published
statistic:

```python
def confidence_from(probabilities):
    """(count x peak - 1) / (count - 1)"""
    p = list(probabilities.values())
    return (len(p) * max(p) - 1) / (len(p) - 1)
```

Sanity-check both ends. Uniform over 4 options: peak 0.25, so
`(4·0.25 − 1)/3 = 0`. All mass on one: `(4·1 − 1)/3 = 1`. So confidence is
*peakedness*, normalised for how many options there were — which is why you can
compare confidence across questions with different option counts.

Noul has no confidence field. Its value *is* the probability, and distance from
0.5 carries the same information.

### Two axes

```
                    high confidence
                          │
      decisive & wrong    │    decisive & right
      (bad criteria)      │    (act automatically)
   ───────────────────────┼───────────────────────
      genuinely ambiguous │    ambiguous but leaning
      (escalate)          │    (confirm first)
                          │
                    low confidence
```

The answer tells you *what*. The confidence tells you *whether to act
unattended*. They are independent, and code should read both.

### Calibration is the property that makes this work

A calibrated model is one where, across all the times it says 0.8, it is right
about 80% of the time. That is a claim about frequency, and it is testable.

TypeSafe trains for this with RLCD — probabilities optimised against outcomes
rather than rater preference. **Their calibration is on their data.** On your
tickets it is a hypothesis until you measure it, which is what a reliability
curve is for:

```python
def reliability(records, bins=10):
    """records: [(confidence, was_correct), ...]
    A calibrated model tracks the diagonal."""
    out = []
    for i in range(bins):
        lo, hi = i / bins, (i + 1) / bins
        bucket = [c for conf, c in records if lo <= conf < hi]
        if bucket:
            out.append((round((lo + hi) / 2, 2),
                        round(sum(bucket) / len(bucket), 3),
                        len(bucket)))
    return out

# [(0.55, 0.52, 40), (0.75, 0.74, 120), (0.95, 0.96, 300)]  <- calibrated
# [(0.55, 0.31, 40), (0.75, 0.48, 120), (0.95, 0.71, 300)]  <- overconfident
```

If the second column sits consistently below the first, the model is
overconfident **on your data** and every threshold must rise.

### Thresholds belong to the action, not the model

One global threshold is the mistake. The bar scales with what happens when you
are wrong:

```python
STAKES = {
    "check_balance":   0.50,   # read-only, reversible, cheap to be wrong
    "send_receipt":    0.70,   # visible to a customer, awkward but survivable
    "approve_refund":  0.85,   # money moves
    "close_account":   0.95,   # effectively irreversible
}

def route(answer):
    if answer.choice == "other" or answer.confidence < 0.50:
        return "human"
    bar = STAKES[answer.choice]
    return "execute" if answer.confidence >= bar else "confirm"
```

Note the `"other"` check comes first and is unconditional. High confidence that
something is out-of-domain is still a reason to involve a person.

---

## 3. Worked Example

Fitting thresholds on labelled data instead of guessing them.

```python
def fit_threshold(records, min_precision=0.95):
    """Lowest confidence at which precision still clears the bar.

    records: [(confidence, was_correct), ...]
    Returns (threshold, achieved_precision, coverage).
    """
    ordered = sorted(records, key=lambda r: -r[0])
    best = None
    for i in range(len(ordered)):
        window = ordered[: i + 1]
        precision = sum(c for _, c in window) / len(window)
        if precision >= min_precision:
            best = (ordered[i][0], precision, len(window) / len(records))
    if best is None:
        raise ValueError(
            f"No threshold reaches {min_precision:.0%} precision. "
            "Fix the criteria before tuning thresholds."
        )
    return best

threshold, precision, coverage = fit_threshold(dev_records, 0.95)
# 0.82, 0.951, 0.63
#   -> at confidence >= 0.82 we are right 95.1% of the time,
#      and this covers 63% of traffic. The rest goes to a human.
```

Two things this buys you:

**A stated operating point.** "We automate 63% of tickets at 95% precision" is
a sentence you can take to a stakeholder. "We use GPT-4 for triage" is not.

**A failure that is loud.** If no threshold reaches your precision bar, the
function raises. That is correct: it means the classifier is not fit for
automation at any threshold, and the fix is upstream in the criteria.

Verify on a held-out split, then **write the threshold to a lock file** beside
the criteria that produced it:

```json
{
  "model": "jev-1.13.0",
  "question": "intent",
  "criteria_hash": "sha256:4f2a…",
  "threshold": 0.82,
  "precision": 0.951,
  "coverage": 0.63,
  "fitted_on": "2026-09-27",
  "n_records": 2000
}
```

The `criteria_hash` is the important field. Change the criteria text and the
hash changes, and CI can fail the build until the threshold is refitted. This
is the enforcement mechanism for Module 3's warning that criteria changes are
schema migrations.

---

## 4. Why This Matters in Production

**It converts a model into a system with an SLA.** Precision and coverage are
numbers you can commit to and monitor.

**It makes escalation principled.** Not "when it looks unsure" but "below the
threshold we fitted for this action's blast radius."

**Distributions are your audit trail.** Store the full `probabilities`. Six
months later "why was this approved?" is answered by data, not speculation.

**Drift becomes detectable.** Confidence distribution is a monitorable signal
that needs no labels. Module 7 builds the alarm.

---

## 5. Pitfalls

**Reading confidence as accuracy.** The central error. It is peakedness. A
model can be confidently wrong, and it will be precisely where your criteria
overlap.

**One threshold everywhere.** A read and an account closure do not deserve the
same bar.

**Fitting on your test set.** Fit on dev, verify on held-out, or you have
measured nothing.

**Thresholds not pinned to a model version.** Pin the version. Log the version
returned in the response. A silent model update moves your operating point.

**Ignoring coverage.** A threshold of 0.99 gives lovely precision on 4% of
traffic. Precision without coverage is a demo.

**Assuming vendor calibration holds.** RLCD is the mechanism; your reliability
curve is the evidence. Measure it.

**Trusting calibration over time.** Nobody has long-run drift data on a model
this new. Re-measure on a schedule and treat this as an open question.

---

## 6. Exercises

1. Label 200 real inputs. Plot the reliability curve. Report whether the model
   is calibrated on *your* data — this is the single most valuable exercise in
   the curriculum.

2. Fit thresholds at 90%, 95% and 99% precision. Write down the coverage at
   each. Take the trade-off to whoever owns the product decision.

3. Implement the criteria-hash lock file and a CI check that fails when
   criteria change without refitting.

4. Find a case with high confidence and a wrong answer. Diagnose the criteria
   overlap that caused it. There will be one.

5. Simulate drift: hold thresholds fixed and feed inputs from a different
   domain. Watch mean confidence move. That movement is your alarm signal.

---

## 7. Further Reading

- TypeSafe AI confidence documentation — the derivation and the
  "second axis" framing
- Guo et al., *On Calibration of Modern Neural Networks* (2017) — reliability
  diagrams, and why scale alone does not give calibration
- `awesome-jev-by-typesafe` — threshold guidance by action reversibility

> **Status of this module.** The confidence formula and the calibration-lock
> workflow follow TypeSafe's published material. Threshold-fitting and
> reliability curves are standard classifier practice, not Jev-specific. The
> claim this module will *not* make is that Jev stays calibrated on your data
> over months — that is unknown for a model released in September 2026, and
> the exercises are designed so you find out for yourself.
