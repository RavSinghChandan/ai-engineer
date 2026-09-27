"""p07 — Evaluating a probabilistic component.

Assert on metrics, never on a single answer. A test that pins one answer goes
flaky on the next model update and gets deleted, taking your coverage with it.
"""
from collections import Counter
from statistics import mean


def evaluate(client, questions, cases, question_name, threshold):
    """cases: [(state, expected_label), ...] -> precision, coverage, records."""
    records = []
    for state, expected in cases:
        r = client.system_one(state=state, questions=questions)
        a = r.answers[question_name]
        records.append((a.confidence, a.choice == expected, a.choice))

    above = [(c, ok) for c, ok, _ in records if c >= threshold]
    precision = sum(ok for _, ok in above) / len(above) if above else 0.0
    coverage = len(above) / len(records) if records else 0.0
    return precision, coverage, records


def drift_signals(answers, threshold):
    """Computable with zero labels — this is what production monitoring uses."""
    if not answers:
        raise ValueError("no answers")
    return {
        "mean_confidence": mean(a.confidence for a in answers),
        "pct_low_conf": mean(a.confidence < threshold for a in answers),
        "pct_other": mean(a.choice == "other" for a in answers),
        "class_mix": dict(Counter(a.choice for a in answers)),
    }
