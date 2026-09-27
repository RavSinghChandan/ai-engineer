"""p05 — Fit thresholds on labelled data and lock them to the criteria.

Guessing a threshold is the most common way a System One deployment goes
wrong. This fits one against a precision target and records what it was
fitted against.
"""
import hashlib
import json
from statistics import mean


def fit_threshold(records, min_precision=0.95):
    """Lowest confidence at which precision still clears the bar.

    records: [(confidence, was_correct), ...]
    Returns (threshold, precision, coverage).
    Raises if no threshold reaches the target — which means the classifier is
    not fit for automation and the fix is upstream in the criteria.
    """
    if not records:
        raise ValueError("no records")

    # Candidate thresholds are the distinct confidence VALUES, not record
    # positions. A threshold means "automate everything at or above this
    # confidence", so all records tied at that value are swept in together.
    # Evaluating per-record instead lets a threshold be chosen on a partial
    # tie group, reporting a precision the threshold does not actually deliver.
    total = len(records)
    best = None
    for candidate in sorted({conf for conf, _ in records}, reverse=True):
        window = [c for conf, c in records if conf >= candidate]
        precision = sum(window) / len(window)
        if precision >= min_precision:
            best = (candidate, precision, len(window) / total)

    if best is None:
        raise ValueError(
            f"no threshold reaches {min_precision:.0%} precision; "
            "fix the criteria before tuning thresholds"
        )
    return best


def reliability(records, bins=10):
    """[(bin_centre, observed_accuracy, n), ...] — calibrated tracks diagonal."""
    out = []
    for i in range(bins):
        lo, hi = i / bins, (i + 1) / bins
        bucket = [c for conf, c in records if lo <= conf < hi]
        if bucket:
            out.append((round((lo + hi) / 2, 2), round(mean(bucket), 3), len(bucket)))
    return out


def criteria_hash(questions) -> str:
    """Stable hash over every instruction and criteria string."""
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


def write_lock(path, *, question, questions, model, threshold, precision,
               coverage, n_records):
    lock = {
        "model": model,
        "question": question,
        "criteria_hash": criteria_hash(questions),
        "threshold": round(threshold, 4),
        "precision": round(precision, 4),
        "coverage": round(coverage, 4),
        "n_records": n_records,
    }
    with open(path, "w") as fh:
        json.dump(lock, fh, indent=2, sort_keys=True)
    return lock
